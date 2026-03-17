/**
 * HydrogenPlantDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * React Digital Twin for the Hydrogen Power Plant simulation.
 * Communicates exclusively with the FastAPI MATLAB Bridge running on the VM.
 *
 * The API service lives in:  src/services/hydrogenService.js
 * VM URL is configured via:  VITE_H2_SERVICE_URL in .env
 * VM setup instructions in:  hydrogen_vm_prompt.txt
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
} from "react-icons/fi";
import {
  runSimulation,
  checkHealth,
} from "../services/hydrogenService";

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
  // ── Service health ────────────────────────────────────────────────────────
  const [health, setHealth] = useState(null); // null | { engine_ready, engine_error, active_jobs }
  const [healthError, setHealthError] = useState(null);

  // ── Parameters ────────────────────────────────────────────────────────────
  const [elz, setElz] = useState({ grid_power_kw: 300, water_flow_rate_lpm: 90, temperature_c: 70 });
  const [sto, setSto] = useState({ compressor_efficiency: 0.78, max_tank_pressure_bar: 350 });
  const [fc,  setFc]  = useState({ h2_flow_rate_nm3h: 40, oxidant_pressure_bar: 2.5, cooling_capacity_kw: 35 });
  const [sim, setSim] = useState({ t_end_s: 3600, dt_s: 60 });

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

  // ── Run simulation ────────────────────────────────────────────────────────
  const handleRun = async () => {
    setSimState(SIM_STATES.QUEUED);
    setProgress(0);
    setResult(null);
    setErrorMsg(null);

    try {
      const cancel = await runSimulation(
        { electrolyzer: elz, storage: sto, fuel_cell: fc, simulation: sim },
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
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiZap className="text-electric-500" />
            Hydrogen Power Plant
            <span className="ml-2 text-sm font-normal text-slate-400">Digital Twin</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            MATLAB/Simulink physics engine running on dedicated simulation VM
          </p>
        </div>

        {/* ── Service health badge ─────────────────────────────────────── */}
        <button
          onClick={pingHealth}
          title="Refresh VM connection status"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all
            hover:shadow-sm active:scale-95
            border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          {healthError ? (
            <><FiWifiOff className="text-red-400" /> VM offline</>
          ) : health === null ? (
            <><FiWifi className="text-slate-300 animate-pulse" /> Connecting…</>
          ) : !health.engine_ready ? (
            <><FiClock className="text-amber-400 animate-pulse" /> MATLAB warming up…</>
          ) : (
            <><FiWifi className="text-emerald-500" /> VM connected · engine ready</>
          )}
          <FiRefreshCw size={13} className="text-slate-400" />
        </button>
      </div>

      {/* ── VM error banner ───────────────────────────────────────────────── */}
      {healthError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
          <div className="flex items-start gap-3 px-5 py-4 border-b border-red-100">
            <FiAlertCircle className="mt-0.5 shrink-0 text-red-500" size={18} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-800">Cannot reach simulation VM at <code className="text-red-700 bg-red-100 px-1 rounded">10.1.66.27:8765</code></p>
              <p className="text-red-600 text-xs mt-0.5 break-all">{healthError}</p>
            </div>
            <button
              onClick={pingHealth}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 transition-all"
            >
              <FiRefreshCw size={11} /> Retry
            </button>
          </div>

          <div className="px-5 py-4 space-y-3 text-xs text-red-700">
            <p className="font-semibold text-red-800 uppercase tracking-wide text-[11px]">Troubleshooting steps (run on the VM via RDP)</p>

            <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="font-semibold text-amber-800">⚠ Most common cause: uvicorn is bound to <code className="bg-amber-100 px-1 rounded">127.0.0.1</code> only</p>
              <p className="text-amber-700">The service runs on the VM but only accepts local connections. Restart it with <code className="bg-amber-100 px-1 rounded">--host 0.0.0.0</code>:</p>
              <pre className="bg-white border border-amber-200 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
{`schtasks /End /TN HydrogenSimBridge
cd C:\\Users\\admin1\\Desktop\\MATLAB_API\\hydrogen-plant-sim
uvicorn main:app --host 0.0.0.0 --port 8765`}
              </pre>
              <p className="text-amber-700">If it works, update the scheduled task's command to permanently include <code className="bg-amber-100 px-1 rounded">--host 0.0.0.0</code>.</p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-red-800">Add firewall inbound rule on the VM (run once as admin):</p>
              <pre className="bg-white border border-red-200 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
{`netsh advfirewall firewall add rule name="HydrogenSimBridge" dir=in action=allow protocol=TCP localport=8765`}
              </pre>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-red-800">Verify it's reachable from the network (run on the VM):</p>
              <pre className="bg-white border border-red-200 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
{`curl http://10.1.66.27:8765/api/hydrogen/health`}
              </pre>
              <p>If that returns <code className="bg-red-100 px-1 rounded">engine_ready: true</code> the service is accessible externally.</p>
            </div>

            <div className="space-y-1 border-t border-red-200 pt-3">
              <p className="font-medium text-red-800">Log files on the VM:</p>
              <code className="block bg-white border border-red-200 rounded px-2 py-1 font-mono text-[11px] text-slate-600">C:\Users\admin1\Desktop\MATLAB_API\hydrogen-plant-sim\service.log</code>
              <code className="block bg-white border border-red-200 rounded px-2 py-1 font-mono text-[11px] text-slate-600">C:\Users\admin1\Desktop\MATLAB_API\hydrogen-plant-sim\service.err</code>
            </div>

            <div className="border-t border-red-200 pt-3">
              <p className="font-medium text-red-800">Alternative: SSH tunnel (skip firewall/host issues entirely):</p>
              <pre className="bg-white border border-red-200 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-700 overflow-x-auto">
{`ssh -L 8765:localhost:8765 admin1@10.1.66.27`}
              </pre>
              <p className="mt-1">Then set <code className="bg-red-100 px-1 rounded">.env</code>: <code className="bg-red-100 px-1 rounded">VITE_H2_SERVICE_URL=http://localhost:8765</code> and restart the dev server.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Parameter panels ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Electrolyzer */}
        <Card className="p-5">
          <SectionHeader icon={FiZap} label="Electrolyzer" color="electric" />
          <ParamSlider label="Grid Power"        unit="kW"    value={elz.grid_power_kw}       min={0}   max={2000} step={10}  onChange={(v) => setElz((p) => ({ ...p, grid_power_kw: v }))} />
          <ParamSlider label="Water Flow Rate"   unit="L/min" value={elz.water_flow_rate_lpm}  min={0}   max={500}  step={5}   onChange={(v) => setElz((p) => ({ ...p, water_flow_rate_lpm: v }))} />
          <ParamSlider label="Operating Temp."   unit="°C"    value={elz.temperature_c}        min={20}  max={100}  step={1}   onChange={(v) => setElz((p) => ({ ...p, temperature_c: v }))} />
        </Card>

        {/* Storage */}
        <Card className="p-5">
          <SectionHeader icon={FiDatabase} label="H₂ Storage" color="amber" />
          <ParamSlider label="Compressor Efficiency" unit="[-]"  value={sto.compressor_efficiency}  min={0.3}  max={1.0}  step={0.01} onChange={(v) => setSto((p) => ({ ...p, compressor_efficiency: v }))} />
          <ParamSlider label="Max Tank Pressure"     unit="bar"  value={sto.max_tank_pressure_bar}  min={50}   max={700}  step={10}   onChange={(v) => setSto((p) => ({ ...p, max_tank_pressure_bar: v }))} />
        </Card>

        {/* Fuel Cell */}
        <Card className="p-5">
          <SectionHeader icon={FiCpu} label="Fuel Cell" color="violet" />
          <ParamSlider label="H₂ Flow Rate"       unit="Nm³/h" value={fc.h2_flow_rate_nm3h}     min={0}   max={200} step={1}   onChange={(v) => setFc((p) => ({ ...p, h2_flow_rate_nm3h: v }))} />
          <ParamSlider label="Oxidant Pressure"   unit="bar"   value={fc.oxidant_pressure_bar}   min={1}   max={10}  step={0.1} onChange={(v) => setFc((p) => ({ ...p, oxidant_pressure_bar: v }))} />
          <ParamSlider label="Cooling Capacity"   unit="kW"    value={fc.cooling_capacity_kw}    min={0}   max={200} step={1}   onChange={(v) => setFc((p) => ({ ...p, cooling_capacity_kw: v }))} />
        </Card>
      </div>

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
                title={!health?.engine_ready ? (healthError ? "VM is offline — see diagnostic panel above" : "Waiting for MATLAB engine to become ready…") : "Run simulation"}
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
                {simState === SIM_STATES.QUEUED ? "Queued — waiting for MATLAB engine…" : `Running simulation (${progress.toFixed(0)}%)…`}
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

      {/* ── Charts (shown only after a successful run) ─────────────────────── */}
      {simState === SIM_STATES.DONE && result && (
        <div className="space-y-5">

          {/* Row 1: ELZ power vs H2 production */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiZap size={14} className="text-electric-500" />
              <h4 className="text-sm font-semibold text-slate-700">Electrolyzer Power vs. H₂ Production</h4>
              <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                <FiInfo size={11} /> Dual Y-axis
              </span>
            </div>
            <ReactECharts option={buildElzChart(result)} style={{ height: 240 }} />
          </Card>

          {/* Row 2: Tank pressure + FC charts side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <FiDatabase size={14} className="text-amber-500" />
                <h4 className="text-sm font-semibold text-slate-700">Tank Pressure Over Time</h4>
              </div>
              <ReactECharts option={buildTankChart(result)} style={{ height: 220 }} />
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <FiCpu size={14} className="text-violet-500" />
                <h4 className="text-sm font-semibold text-slate-700">Fuel Cell Voltage &amp; Current Density</h4>
                <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                  <FiInfo size={11} /> Dual Y-axis
                </span>
              </div>
              <ReactECharts option={buildFcChart(result)} style={{ height: 220 }} />
            </Card>
          </div>
        </div>
      )}

      {/* ── Idle placeholder ──────────────────────────────────────────────── */}
      {simState === SIM_STATES.IDLE && (
        <Card className="p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="p-5 rounded-full bg-slate-50 border border-slate-100">
            <FiZap size={32} className={healthError ? "text-red-300" : "text-slate-300"} />
          </div>
          <div>
            {healthError ? (
              <>
                <p className="font-semibold text-red-600">Simulation VM is offline</p>
                <p className="text-sm text-slate-400 mt-1">Follow the troubleshooting steps in the panel above to restore connectivity, then click Retry.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-700">Configure parameters and run the simulation</p>
                <p className="text-sm text-slate-400 mt-1">Results will appear here once the MATLAB/Simulink engine on the VM completes the computation.</p>
              </>
            )}
          </div>
        </Card>
      )}

    </div>
  );
}
