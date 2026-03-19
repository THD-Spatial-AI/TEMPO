/**
 * HydrogenPlantDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Technology Simulation Hub — Digital Twin Platform.
 * Currently available: H₂ Power Plant (MATLAB/Simulink bridge).
 * Future: Biomass CHP, Carbon Capture, PV+Battery, etc.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactECharts from "echarts-for-react";
import {
  FiZap,
  FiDatabase,
  FiCpu,
  FiPlay,
  FiStopCircle,
  FiRefreshCw,
  FiCheckCircle,
  FiAlertCircle,
  FiWifi,
  FiWifiOff,
  FiInfo,
  FiClock,
  FiWind,
  FiSettings,
} from "react-icons/fi";
import {
  runSimulation,
  checkHealth,
} from "../services/hydrogenService";
import H2PlantFlowDiagram from "./H2PlantFlowDiagram";
import H2EnergyCharts from "./H2EnergyCharts";
import H2GeneratorPanel from "./H2GeneratorPanel";
import H2NodeModal from "./H2NodeModal";
import { fetchH2Models, getBestModel, applyModelParams, fetchH2Variants, H2_SLOTS } from "../services/h2TechModels";

// ─────────────────────────────────────────────────────────────────────────────
// Simulation catalogue — add new tech simulations here
// ─────────────────────────────────────────────────────────────────────────────
const SIM_CATALOGUE = [
  {
    id:       "h2",
    label:    "H₂ Power Plant",
    icon:     FiZap,
    color:    "text-indigo-500",
    bg:       "bg-indigo-50",
    active:   "bg-indigo-600 text-white shadow-md",
    ready:    true,
    subtitle: "Electrolyzer · Compressor · Storage · Fuel Cell",
  },
  {
    id:       "biomass",
    label:    "Biomass CHP",
    icon:     FiSettings,
    color:    "text-green-500",
    bg:       "bg-green-50",
    active:   "bg-green-600 text-white shadow-md",
    ready:    false,
    subtitle: "Coming soon",
  },
  {
    id:       "wind_battery",
    label:    "Wind + Battery",
    icon:     FiWind,
    color:    "text-sky-500",
    bg:       "bg-sky-50",
    active:   "bg-sky-600 text-white shadow-md",
    ready:    false,
    subtitle: "Coming soon",
  },
  {
    id:       "ccs",
    label:    "Carbon Capture",
    icon:     FiSettings,
    color:    "text-slate-500",
    bg:       "bg-slate-50",
    active:   "bg-slate-600 text-white shadow-md",
    ready:    false,
    subtitle: "Coming soon",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tiny reusable primitives (matches app-wide Tailwind conventions)
// ─────────────────────────────────────────────────────────────────────────────

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, color = "electric" }) {
  const colors = {
    electric: "bg-electric-50 text-electric-600",
    emerald:  "bg-emerald-50 text-emerald-600",
    violet:   "bg-violet-50  text-violet-600",
    amber:    "bg-amber-50   text-amber-600",
  };
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className={`p-2 rounded-xl ${colors[color] ?? colors.electric}`}>
        <Icon size={16} />
      </span>
      <h3 className="font-semibold text-slate-800 text-sm tracking-wide uppercase">
        {label}
      </h3>
    </div>
  );
}

function ParamSlider({ label, unit, value, min, max, step = 1, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="w-20 text-right text-sm font-medium text-slate-800 border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-electric-400"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          />
          <span className="text-xs text-slate-400 w-10">{unit}</span>
        </div>
      </div>
      <div className="relative h-2 bg-slate-100 rounded-full">
        <div
          className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-electric-400 to-electric-600 transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, color = "slate" }) {
  const ring = {
    electric: "border-electric-200 bg-electric-50",
    emerald:  "border-emerald-200 bg-emerald-50",
    violet:   "border-violet-200 bg-violet-50",
    amber:    "border-amber-200 bg-amber-50",
    slate:    "border-slate-200 bg-slate-50",
  };
  const text = {
    electric: "text-electric-700",
    emerald:  "text-emerald-700",
    violet:   "text-violet-700",
    amber:    "text-amber-700",
    slate:    "text-slate-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${ring[color] ?? ring.slate}`}>
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${text[color] ?? text.slate}`}>
        {value ?? "—"}
        {value != null && <span className="text-sm font-medium ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ECharts option builders
// ─────────────────────────────────────────────────────────────────────────────

function buildElzChart(result) {
  const time = (result?.time_s ?? []).map((t) => `${Math.round(t / 60)} min`);
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { data: ["ELZ Power (kW)", "H₂ Production (Nm³/h)"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 24, bottom: 48, left: 48, right: 52 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: "value", name: "kW",      nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      { type: "value", name: "Nm³/h",   nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: "ELZ Power (kW)",
        type: "line",
        data: result?.electrolyzer_power_kw ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#6366f1", width: 2 },
        areaStyle: { color: "rgba(99,102,241,0.08)" },
        yAxisIndex: 0,
      },
      {
        name: "H₂ Production (Nm³/h)",
        type: "line",
        data: result?.h2_production_nm3h ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#10b981", width: 2 },
        areaStyle: { color: "rgba(16,185,129,0.06)" },
        yAxisIndex: 1,
      },
    ],
  };
}

function buildTankChart(result) {
  const time = (result?.time_s ?? []).map((t) => `${Math.round(t / 60)} min`);
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { data: ["Tank Pressure (bar)"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 24, bottom: 48, left: 52, right: 20 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "bar", axisLabel: { fontSize: 10 }, nameTextStyle: { fontSize: 10 } },
    series: [
      {
        name: "Tank Pressure (bar)",
        type: "line",
        data: result?.tank_pressure_bar ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#f59e0b", width: 2 },
        areaStyle: { color: "rgba(245,158,11,0.08)" },
      },
    ],
  };
}

function buildFcChart(result) {
  const time = (result?.time_s ?? []).map((t) => `${Math.round(t / 60)} min`);
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { data: ["Terminal Voltage (V)", "Current Density (A/cm²)"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 24, bottom: 48, left: 52, right: 60 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: "value", name: "V",      axisLabel: { fontSize: 10 }, nameTextStyle: { fontSize: 10 } },
      { type: "value", name: "A/cm²",  axisLabel: { fontSize: 10 }, nameTextStyle: { fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: "Terminal Voltage (V)",
        type: "line",
        data: result?.fc_terminal_voltage_v ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#8b5cf6", width: 2 },
        yAxisIndex: 0,
      },
      {
        name: "Current Density (A/cm²)",
        type: "line",
        data: result?.fc_current_density_acm2 ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#ec4899", width: 2, type: "dashed" },
        yAxisIndex: 1,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const SIM_STATES = { IDLE: "idle", QUEUED: "queued", RUNNING: "running", DONE: "done", ERROR: "error" };

export default function HydrogenPlantDashboard() {
  // ── Active simulation type (extendable) ────────────────────────────────
  const [simType, setSimType] = useState("h2");

  // ── Service health ────────────────────────────────────────────────────
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);

  // ── Parameters ────────────────────────────────────────────────────────────
  const [elz, setElz] = useState({ grid_power_kw: 300, water_flow_rate_lpm: 90, temperature_c: 70 });
  const [sto, setSto] = useState({ compressor_efficiency: 0.78, max_tank_pressure_bar: 350 });
  const [fc,  setFc]  = useState({ h2_flow_rate_nm3h: 40, oxidant_pressure_bar: 2.5, cooling_capacity_kw: 35 });
  const [sim, setSim] = useState({ t_end_s: 3600, dt_s: 60 });

  // ── Technology model catalogue (opentech-db / fallback) ───────────────────
  const [models,         setModels]         = useState({});
  const [selectedModels, setSelectedModels] = useState({});

  // ── Simulation state ──────────────────────────────────────────────────────
  const [simState,  setSimState]  = useState(SIM_STATES.IDLE);
  const [progress,  setProgress]  = useState(0);
  const [result,    setResult]    = useState(null);
  const [errorMsg,  setErrorMsg]  = useState(null);
  const cancelRef = useRef(null);

  // ── Health check on mount and every 30 s ────────────────────────────────
  const pingHealth = useCallback(async () => {
    try {
      const h = await checkHealth();
      setHealth(h);
      setHealthError(null);
    } catch (e) {
      setHealth(null);
      setHealthError(e.message);
    }
  }, []);

  useEffect(() => {
    pingHealth();
    const id = setInterval(pingHealth, 30_000);
    return () => clearInterval(id);
  }, [pingHealth]);

  // ── Load tech-model catalogue from opentech-db (with fallback) ───────────
  useEffect(() => {
    let alive = true;
    Promise.all(
      Object.keys(H2_SLOTS).map(async (k) => {
        const list = await fetchH2Models(k);
        return [k, list];
      })
    ).then((entries) => {
      if (!alive) return;
      const m    = Object.fromEntries(entries);
      const best = Object.fromEntries(entries.map(([k, list]) => [k, getBestModel(list)]));
      setModels(m);
      setSelectedModels(best);
    });
    return () => { alive = false; };
  }, []);

  const handleSelectModel = useCallback((slotKey, model) => {
    setSelectedModels((p) => ({ ...p, [slotKey]: model }));
    const patch = applyModelParams(slotKey, model);
    if (!patch) return;
    if (slotKey === "source" || slotKey === "electrolyzer") setElz((p) => ({ ...p, ...patch }));
    if (slotKey === "compressor" || slotKey === "storage")  setSto((p) => ({ ...p, ...patch }));
    if (slotKey === "fuel_cell")                            setFc((p)  => ({ ...p, ...patch }));
  }, []);

  // ── Node detail panel (click any node in the PFD to open its analysis) ────
  const [activeNodeId, setActiveNodeId] = useState(null);
  const handleNodeClick = useCallback((_evt, node) => {
    setActiveNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  // ── Custom CSV production profile for the Power Source node ──────────────
  const [customProfile, setCustomProfile] = useState(null);

  // ── Tech variants (lifecycle/year projections from opentech-db) ──────────
  const [variants, setVariants] = useState({});

  // Fetch variants whenever the source model changes
  const sourceModelId = selectedModels?.source?.id;
  useEffect(() => {
    if (!sourceModelId) return;
    fetchH2Variants(sourceModelId, selectedModels?.source)
      .then((v) => setVariants((p) => ({ ...p, source: v })));
  }, [sourceModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local param overrides from the generator panel constraints editor
  const [genParamOverrides, setGenParamOverrides] = useState({});

  // ── Run simulation ────────────────────────────────────────────────────────
  const handleRun = async () => {
    setSimState(SIM_STATES.QUEUED);
    setProgress(0);
    setResult(null);
    setErrorMsg(null);

    try {
      const cancel = await runSimulation(
        { electrolyzer: elz, storage: sto, fuel_cell: fc, simulation: sim,
          ...(customProfile ? { source_profile: customProfile.data } : {}) },
        {
          onQueued:   () => setSimState(SIM_STATES.QUEUED),
          onProgress: (d) => { setSimState(SIM_STATES.RUNNING); setProgress(d.progress_pct ?? 0); },
          onResult:   (r) => { setResult(r); setSimState(SIM_STATES.DONE); pingHealth(); },
          onError:    (m) => { setErrorMsg(m); setSimState(SIM_STATES.ERROR); },
        }
      );
      cancelRef.current = cancel;
    } catch (e) {
      setErrorMsg(e.message);
      setSimState(SIM_STATES.ERROR);
    }
  };

  const handleStop = () => {
    cancelRef.current?.();
    setSimState(SIM_STATES.IDLE);
    setProgress(0);
  };

  const handleReset = () => {
    handleStop();
    setResult(null);
    setErrorMsg(null);
  };

  // ── KPIs from result ──────────────────────────────────────────────────────
  const kpi = result?.kpi ?? null;

  const fmt = (v, d = 1) => (v != null ? Number(v).toFixed(d) : null);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">

      {/* ── Simulation switcher + service status ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Section label */}
        <div className="flex items-center gap-2 mr-2">
          <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600"><FiZap size={15} /></span>
          <span className="font-bold text-slate-800 text-sm tracking-wide uppercase">Tech Simulation</span>
        </div>

        {/* Type tabs */}
        {SIM_CATALOGUE.map((sim) => {
          const Icon = sim.icon;
          const isActive = simType === sim.id;
          return (
            <button
              key={sim.id}
              disabled={!sim.ready}
              title={sim.ready ? sim.subtitle : `${sim.label} — ${sim.subtitle}`}
              onClick={() => sim.ready && setSimType(sim.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                transition-all border
                ${ isActive
                    ? sim.active + " border-transparent"
                    : sim.ready
                      ? `${sim.bg} ${sim.color} border-transparent hover:border-slate-200 hover:shadow-sm`
                      : "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                  }`}
            >
              <Icon size={12} />
              {sim.label}
              {!sim.ready && <span className="text-[9px] font-normal opacity-60 ml-0.5">soon</span>}
            </button>
          );
        })}

        {/* Service status pill */}
        <button
          onClick={pingHealth}
          title="Refresh engine connection"
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border
            transition-all hover:shadow-sm active:scale-95
            ${ healthError
                ? "bg-red-50 border-red-200 text-red-600"
                : health === null
                  ? "bg-slate-50 border-slate-200 text-slate-400"
                  : health.engine_ready
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
        >
          { healthError      ? <FiWifiOff size={11} />
          : health === null  ? <FiWifi    size={11} className="animate-pulse" />
          : health.engine_ready ? <FiWifi size={11} />
                                : <FiClock size={11} className="animate-pulse" /> }
          { healthError         ? "Engine offline"
          : health === null     ? "Connecting…"
          : health.engine_ready ? "Engine ready"
                                : "Warming up…" }
          <FiRefreshCw size={10} className="opacity-50" />
        </button>
      </div>

      {/* ── Process Flow Diagram (Simulink-style interactive PFD) ──────────── */}
      <H2PlantFlowDiagram
        elz={elz} setElz={setElz}
        sto={sto} setSto={setSto}
        fc={fc}   setFc={setFc}
        simState={simState}
        kpi={kpi}
        models={models}
        selectedModels={selectedModels}
        onSelectModel={handleSelectModel}
        activeNodeId={activeNodeId}
        onNodeClick={handleNodeClick}
        customProfile={customProfile}
        onSetCustomProfile={setCustomProfile}
      />

      {/* ── Node detail modal (portal → always on top) ──────────────────────── */}
      <H2NodeModal
        open={activeNodeId === "grid"}
        onClose={() => setActiveNodeId(null)}
        title={selectedModels?.source?.name ?? "Power Source Analysis"}
        subtitle="Technology profile · energy conversion chain · simulation overlay"
        icon={<FiZap size={18} />}
        accentColor="bg-amber-500"
      >
        <H2GeneratorPanel
          selectedModel={selectedModels?.source}
          elzModel={selectedModels?.electrolyzer}
          elzParams={elz}
          result={result}
          simState={simState}
          customProfile={customProfile}
          variants={variants?.source}
          onParamsChange={setGenParamOverrides}
        />
      </H2NodeModal>

      {/* ── Simulation controls ───────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex gap-5 flex-1">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Horizon</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={60} max={86400} step={300}
                  value={sim.t_end_s}
                  onChange={(e) => setSim((p) => ({ ...p, t_end_s: +e.target.value }))}
                  className="w-28 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-electric-400"
                />
                <span className="text-xs text-slate-400">s</span>
                <span className="text-xs text-slate-400">({(sim.t_end_s / 3600).toFixed(1)} h)</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Sample interval</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={600} step={10}
                  value={sim.dt_s}
                  onChange={(e) => setSim((p) => ({ ...p, dt_s: +e.target.value }))}
                  className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-electric-400"
                />
                <span className="text-xs text-slate-400">s</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {simState === SIM_STATES.IDLE || simState === SIM_STATES.DONE || simState === SIM_STATES.ERROR ? (
              <button
                onClick={handleRun}
                disabled={!health?.engine_ready}
                title={!health?.engine_ready ? "Waiting for simulation engine…" : "Run simulation"}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                  bg-gradient-to-r from-electric-500 to-electric-600 text-white font-semibold text-sm
                  shadow-md hover:shadow-lg hover:from-electric-600 hover:to-electric-700
                  transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FiPlay size={14} />
                {simState === SIM_STATES.DONE ? "Re-run" : "Run Simulation"}
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                  bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold text-sm
                  shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700
                  transition-all active:scale-95"
              >
                <FiStopCircle size={14} />
                Stop
              </button>
            )}
            {(simState === SIM_STATES.DONE || simState === SIM_STATES.ERROR) && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200
                  text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all active:scale-95"
              >
                <FiRefreshCw size={13} />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {(simState === SIM_STATES.QUEUED || simState === SIM_STATES.RUNNING) && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-electric-400 animate-pulse" />
                {simState === SIM_STATES.QUEUED ? "Queued — waiting for engine…" : `Running  ${progress.toFixed(0)} %…`}
              </span>
              <span>{progress.toFixed(0)} %</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-gradient-to-r from-electric-400 to-electric-600 rounded-full transition-all duration-500"
                style={{ width: `${simState === SIM_STATES.QUEUED ? 3 : progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Done banner */}
        {simState === SIM_STATES.DONE && (
          <div className="mt-4 flex items-center gap-2 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <FiCheckCircle />
            Simulation complete — {result?.time_s?.length ?? 0} data points returned.
          </div>
        )}

        {/* Error banner */}
        {simState === SIM_STATES.ERROR && (
          <div className="mt-4 flex items-start gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <FiAlertCircle className="mt-0.5 shrink-0" />
            <span><strong>Simulation error:</strong> {errorMsg}</span>
          </div>
        )}
      </Card>

      {/* ── KPI summary ───────────────────────────────────────────────────── */}
      {simState === SIM_STATES.DONE && kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Avg. H₂ Production"    value={fmt(kpi.avg_h2_production_nm3h)}  unit="Nm³/h"  color="electric" />
          <KpiCard label="Peak Tank Pressure"     value={fmt(kpi.peak_tank_pressure_bar)}   unit="bar"    color="amber"    />
          <KpiCard label="FC Net Power Output"    value={fmt(kpi.avg_fc_power_kw)}          unit="kW"     color="violet"   />
          <KpiCard label="System Efficiency"      value={fmt(kpi.system_efficiency_pct)}    unit="%"      color="emerald"  />
        </div>
      )}

      {/* ── Energy Evolution Charts (H2EnergyCharts) ──────────────────────── */}
      <H2EnergyCharts
        result={result}
        simState={simState}
        progress={progress}
        sourceName={selectedModels?.source?.name}
      />

      {/* ── Idle placeholder ──────────────────────────────────────────────── */}
      {simState === SIM_STATES.IDLE && (
        <Card className="p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="p-5 rounded-full bg-slate-50 border border-slate-100">
            <FiZap size={32} className="text-slate-300" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">Configure parameters and run the simulation</p>
            <p className="text-sm text-slate-400 mt-1">Results will appear in the flow diagram and charts above once the computation finishes.</p>
          </div>
        </Card>
      )}

    </div>
  );
}
