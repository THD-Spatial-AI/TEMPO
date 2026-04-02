/**
 * HydrogenPlantDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Technology Simulation Hub — Digital Twin Platform.
 * Currently available: H₂ Power Plant (OpenModelica-based simulation).
 * Future: Biomass CHP, Carbon Capture, PV+Battery, etc.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  FiDroplet,
  FiBox,
} from "react-icons/fi";
import {
  runSimulation,
  checkHealth,
} from "../services/hydrogenService";
import { buildSimPayload, normalizeSimResult } from "../services/h2SimPayload";
import H2PlantFlowDiagram from "./H2PlantFlowDiagram";
import H2EnergyCharts from "./H2EnergyCharts";
import H2GeneratorPanel from "./H2GeneratorPanel";
import H2ElectrolyzerPanel from "./H2ElectrolyzerPanel";

// CCS imports
import { runCCSSimulation, checkHealth as checkCCSHealth } from "../services/ccsService";
import { buildSimPayload as buildCCSPayload, normalizeSimResult as normalizeCCSResult } from "../services/ccsSimPayload";
import CCSFlowDiagram from "./CCSFlowDiagram";
import CCSEnergyCharts from "./CCSEnergyCharts";
import CCSSourcePanel from "./CCSSourcePanel";
import CCSAbsorberPanel from "./CCSAbsorberPanel";
import CCSStripperPanel from "./CCSStripperPanel";
import CCSCompressorPanel from "./CCSCompressorPanel";
import CCSStoragePanel from "./CCSStoragePanel";

// ─────────────────────────────────────────────────────────────────────────────
// Detect source tech type from model (mirrors H2GeneratorPanel logic)
// ─────────────────────────────────────────────────────────────────────────────
function detectSourceTechType(model) {
  if (!model) return "generic";
  const key = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (/solar|pv|photovoltaic/.test(key))    return "solar";
  if (/wind/.test(key))                      return "wind";
  if (/nuclear|pwr|bwr|smr/.test(key))      return "nuclear";
  if (/hydro|water|river|dam/.test(key))    return "hydro";
  if (/geotherm/.test(key))                 return "geothermal";
  if (/biomass|biogas|bio/.test(key))       return "biomass";
  if (/coal|lignite/.test(key))             return "coal";
  if (/gas|ccgt|ocgt|lng/.test(key))        return "gas";
  return "generic";
}

import H2NodeModal from "./H2NodeModal";
import { fetchH2Models, getBestModel, applyModelParams, fetchH2Variants, H2_SLOTS } from "../services/h2TechModels";
import { fetchCCSModels, getBestModel as getBestCCSModel, applyModelParams as applyCCSParams, CCS_SLOTS } from "../services/ccsTechModels";

// ─────────────────────────────────────────────────────────────────────────────
// Simulation catalogue — add new tech simulations here
// ─────────────────────────────────────────────────────────────────────────────
const SIM_CATALOGUE = [
  {
    id:       "h2",
    label:    "H₂ Simulation",
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
    label:    "CCS Simulation",
    icon:     FiDatabase,
    color:    "text-slate-500",
    bg:       "bg-slate-50",
    active:   "bg-slate-600 text-white shadow-md",
    ready:    true,
    subtitle: "Source · Absorber · Stripper · Compressor · Storage",
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
// localStorage helpers — persist user choices across navigation
// (The component unmounts on every route switch, so React state alone is not
// enough; we need to survive the unmount/remount cycle.)
// ─────────────────────────────────────────────────────────────────────────────
const LS_PREFIX = "h2dash_";
function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveLS(key, val) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch { /* quota / private mode */ }
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

  // ── Parameters  (restored from localStorage on every mount) ──────────────
  // H₂ Power Plant parameters
  const [elz, setElz] = useState(() => loadLS("elz", { grid_power_kw: 300, water_flow_rate_lpm: 90, temperature_c: 70 }));
  const [sto, setSto] = useState(() => loadLS("sto", { compressor_efficiency: 0.78, max_tank_pressure_bar: 350 }));
  const [fc,  setFc]  = useState(() => loadLS("fc",  { h2_flow_rate_nm3h: 40, oxidant_pressure_bar: 2.5, cooling_capacity_kw: 35 }));
  const [sim, setSim] = useState(() => loadLS("sim", { t_end_s: 3600, dt_s: 60 }));
  
  // CCS parameters (separate state for Carbon Capture System)
  const [ccsSource, setCcsSource] = useState(() => loadLS("ccsSource", {
    capacity_kw: 400000,
    efficiency_pct: 58,
    co2_emission_kg_kwh: 0.38,
    flue_gas_temp_c: 120,
    co2_concentration_pct: 12,
  }));
  const [ccsAbsorber, setCcsAbsorber] = useState(() => loadLS("ccsAbsorber", {
    capture_rate_pct: 90,
    energy_requirement_gj_tco2: 3.7,
    solvent_flow_rate_m3_h: 150,
    absorption_temp_c: 40,
    l_g_ratio: 3.5,
  }));
  const [ccsStripper, setCcsStripper] = useState(() => loadLS("ccsStripper", {
    reboiler_temp_c: 120,
    steam_pressure_bar: 3.5,
    thermal_efficiency_pct: 82,
    energy_input_gj_tco2: 3.2,
  }));
  const [ccsCompressor, setCcsCompressor] = useState(() => loadLS("ccsCompressor", {
    target_pressure_bar: 110,
    number_stages: 4,
    isentropic_efficiency_pct: 82,
    intercooling_temp_c: 35,
  }));
  const [ccsStorage, setCcsStorage] = useState(() => loadLS("ccsStorage", {
    injection_rate_mtco2_yr: 5,
    reservoir_depth_m: 1500,
    reservoir_pressure_bar: 150,
    permeability_md: 200,
    porosity_pct: 18,
    injection_efficiency_pct: 99,
  }));

  // ── Technology model catalogue (opentech-db / fallback) ───────────────────
  const [models,         setModels]         = useState({});
  const [selectedModels, setSelectedModels] = useState(() => loadLS("selectedModels", {}));
  
  // CCS-specific models (separate from H₂)
  const [ccsModels, setCcsModels] = useState({});
  const [selectedCcsModels, setSelectedCcsModels] = useState(() => loadLS("selectedCcsModels", {}));

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

  // ── Persist user selections & parameters to localStorage ──────────────────
  // Runs whenever any user-controlled value changes so navigation away and back
  // restores exactly the state the user left.
  useEffect(() => {
    saveLS("selectedModels", selectedModels);
  }, [selectedModels]);
  useEffect(() => { saveLS("elz", elz); }, [elz]);
  useEffect(() => { saveLS("sto", sto); }, [sto]);
  useEffect(() => { saveLS("fc",  fc);  }, [fc]);
  useEffect(() => { saveLS("sim", sim); }, [sim]);
  
  // Save CCS params
  useEffect(() => { saveLS("ccsSource", ccsSource); }, [ccsSource]);
  useEffect(() => { saveLS("ccsAbsorber", ccsAbsorber); }, [ccsAbsorber]);
  useEffect(() => { saveLS("ccsStripper", ccsStripper); }, [ccsStripper]);
  useEffect(() => { saveLS("ccsCompressor", ccsCompressor); }, [ccsCompressor]);
  useEffect(() => { saveLS("ccsStorage", ccsStorage); }, [ccsStorage]);
  useEffect(() => { saveLS("selectedCcsModels", selectedCcsModels); }, [selectedCcsModels]);

  // ── Load tech-model catalogue from opentech-db (with fallback) ────────────
  // H₂ models
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
      // Merge: only fill slots the user hasn't already chosen.
      // Without this, navigating away and back would reset user's selections.
      setSelectedModels((prev) => {
        const merged = { ...best };
        Object.entries(prev).forEach(([k, v]) => { if (v) merged[k] = v; });
        return merged;
      });
    });
    return () => { alive = false; };
  }, []);
  
  // CCS models
  useEffect(() => {
    let alive = true;
    Promise.all(
      Object.keys(CCS_SLOTS).map(async (k) => {
        const list = await fetchCCSModels(k);
        return [k, list];
      })
    ).then((entries) => {
      if (!alive) return;
      const m    = Object.fromEntries(entries);
      const best = Object.fromEntries(entries.map(([k, list]) => [k, getBestCCSModel(list)]));
      setCcsModels(m);
      setSelectedCcsModels((prev) => {
        const merged = { ...best };
        Object.entries(prev).forEach(([k, v]) => { if (v) merged[k] = v; });
        return merged;
      });
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
  
  const handleSelectCcsModel = useCallback((slotKey, model) => {
    setSelectedCcsModels((p) => ({ ...p, [slotKey]: model }));
    const patch = applyCCSParams(slotKey, model);
    if (!patch) return;
    if (slotKey === "source")      setCcsSource((p) => ({ ...p, ...patch }));
    if (slotKey === "absorber")    setCcsAbsorber((p) => ({ ...p, ...patch }));
    if (slotKey === "stripper")    setCcsStripper((p) => ({ ...p, ...patch }));
    if (slotKey === "compressor")  setCcsCompressor((p) => ({ ...p, ...patch }));
    if (slotKey === "storage")     setCcsStorage((p) => ({ ...p, ...patch }));
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

  // Fetch variants for the electrolyzer model
  const elzModelId = selectedModels?.electrolyzer?.id;
  useEffect(() => {
    if (!elzModelId) return;
    fetchH2Variants(elzModelId, selectedModels?.electrolyzer)
      .then((v) => setVariants((p) => ({ ...p, electrolyzer: v })));
  }, [elzModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local param overrides from the generator panel constraints editor
  const [genParamOverrides, setGenParamOverrides] = useState(() => loadLS("genParams", {}));
  // Local param overrides from the electrolyzer panel constraints editor
  const [elzParamOverrides, setElzParamOverrides] = useState(() => loadLS("elzParams", {}));
  
  // CCS parameter overrides (from CCS panels)
  const [ccsSourceParamOverrides, setCcsSourceParamOverrides] = useState(() => loadLS("ccsSourceParams", {}));
  const [ccsAbsorberParamOverrides, setCcsAbsorberParamOverrides] = useState(() => loadLS("ccsAbsorberParams", {}));
  const [ccsStripperParamOverrides, setCcsStripperParamOverrides] = useState(() => loadLS("ccsStripperParams", {}));
  const [ccsCompressorParamOverrides, setCcsCompressorParamOverrides] = useState(() => loadLS("ccsCompressorParams", {}));
  const [ccsStorageParamOverrides, setCcsStorageParamOverrides] = useState(() => loadLS("ccsStorageParams", {}));

  // Persist overrides too
  useEffect(() => { saveLS("genParams", genParamOverrides); }, [genParamOverrides]);
  useEffect(() => { saveLS("elzParams", elzParamOverrides); }, [elzParamOverrides]);
  useEffect(() => { saveLS("ccsSourceParams", ccsSourceParamOverrides); }, [ccsSourceParamOverrides]);
  useEffect(() => { saveLS("ccsAbsorberParams", ccsAbsorberParamOverrides); }, [ccsAbsorberParamOverrides]);
  useEffect(() => { saveLS("ccsStripperParams", ccsStripperParamOverrides); }, [ccsStripperParamOverrides]);
  useEffect(() => { saveLS("ccsCompressorParams", ccsCompressorParamOverrides); }, [ccsCompressorParamOverrides]);
  useEffect(() => { saveLS("ccsStorageParams", ccsStorageParamOverrides); }, [ccsStorageParamOverrides]);

  // ── Payload preview (must come after all state it depends on) ────────────
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const previewPayload = useMemo(() => {
    if (simType === "h2") {
      return buildSimPayload({
        selectedModels,
        genParamOverrides,
        elzParamOverrides,
        elz,
        sto,
        fc,
        sim,
        customProfile,
      });
    } else if (simType === "ccs") {
      return buildCCSPayload({
        selectedModels,
        sim,
        source: { tech_type: "gas_ccgt", capacity_kw: 400000, efficiency_pct: 58, co2_emission_kg_kwh: 0.35 },
        absorber: { capture_rate_pct: 90, energy_requirement_gj_tco2: 3.7, solvent_flow_rate_m3h: 500, absorption_temp_c: 40 },
        stripper: { thermal_efficiency_pct: 82, reboiler_temp_c: 120, steam_pressure_bar: 3.5 },
        compressor: { isentropic_efficiency_frac: 0.82, inlet_pressure_bar: 1.5, target_pressure_bar: 110 },
        storage: { injection_rate_mtco2_yr: 5, storage_depth_m: 1500, reservoir_pressure_bar: 150, storage_efficiency_pct: 99 },
      });
    }
    return null;
  }, [simType, selectedModels, genParamOverrides, elzParamOverrides, elz, sto, fc, sim, customProfile]);

  // ── Sync generator capacity override → ELZ grid_power_kw ─────────────────
  // The generator feeds the electrolyzer — updating generator capacity should
  // immediately reflect in the ELZ input power shown in the flow diagram.
  useEffect(() => {
    const cap = genParamOverrides?.capacity_kw;
    if (cap != null && isFinite(Number(cap))) {
      setElz((p) => ({ ...p, grid_power_kw: Number(cap) }));
    }
  }, [genParamOverrides?.capacity_kw]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync ELZ efficiency override → elz state (sent to simulation service) ────────────
  useEffect(() => {
    const eff = elzParamOverrides?.efficiency_pct;
    if (eff != null && isFinite(Number(eff))) {
      setElz((p) => ({ ...p, efficiency_pct: Number(eff) }));
    }
  }, [elzParamOverrides?.efficiency_pct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Run simulation ────────────────────────────────────────────────────────
  const handleRun = async () => {
    setSimState(SIM_STATES.QUEUED);
    setProgress(0);
    setResult(null);
    setErrorMsg(null);

    try {
      // ── Build the canonical v2.0 simulation payload ──────────────────────
      // Choose the correct payload builder and service based on simType
      let payload, runFn, normalizeFn;

      if (simType === "h2") {
        payload = buildSimPayload({
          selectedModels,
          genParamOverrides,
          elzParamOverrides,
          elz,
          sto,
          fc,
          sim,
          customProfile,
        });
        runFn = runSimulation;
        normalizeFn = normalizeSimResult;
      } else if (simType === "ccs") {
        // Merge selected models with parameter overrides
        const sourceMerged = { ...selectedCcsModels?.source, ...ccsSourceParamOverrides };
        const absorberMerged = { ...selectedCcsModels?.absorber, ...ccsAbsorberParamOverrides };
        const stripperMerged = { ...selectedCcsModels?.stripper, ...ccsStripperParamOverrides };
        const compressorMerged = { ...selectedCcsModels?.compressor, ...ccsCompressorParamOverrides };
        const storageMerged = { ...selectedCcsModels?.storage, ...ccsStorageParamOverrides };

        payload = buildCCSPayload({
          selectedModels: selectedCcsModels,
          sim,
          source: {
            tech_type: sourceMerged.id ?? "gas_ccgt",
            capacity_kw: sourceMerged.capacity_kw ?? ccsSource.capacity_kw,
            efficiency_pct: sourceMerged.efficiency_pct ?? ccsSource.efficiency_pct,
            co2_emission_kg_kwh: sourceMerged.co2_emission_kg_kwh ?? ccsSource.co2_emission_kg_kwh,
            flue_gas_temp_c: sourceMerged.flue_gas_temp_c ?? ccsSource.flue_gas_temp_c,
            co2_concentration_pct: sourceMerged.co2_concentration_pct ?? ccsSource.co2_concentration_pct,
          },
          absorber: {
            capture_rate_pct: absorberMerged.capture_rate_pct ?? ccsAbsorber.capture_rate_pct,
            energy_requirement_gj_tco2: absorberMerged.energy_requirement_gj_tco2 ?? ccsAbsorber.energy_requirement_gj_tco2,
            solvent_flow_rate_m3h: absorberMerged.solvent_flow_rate_m3_h ?? ccsAbsorber.solvent_flow_rate_m3_h,
            absorption_temp_c: absorberMerged.absorption_temp_c ?? ccsAbsorber.absorption_temp_c,
            l_g_ratio: absorberMerged.l_g_ratio ?? ccsAbsorber.l_g_ratio,
          },
          stripper: {
            thermal_efficiency_pct: stripperMerged.thermal_efficiency_pct ?? ccsStripper.thermal_efficiency_pct,
            reboiler_temp_c: stripperMerged.reboiler_temp_c ?? ccsStripper.reboiler_temp_c,
            steam_pressure_bar: stripperMerged.steam_pressure_bar ?? ccsStripper.steam_pressure_bar,
            energy_input_gj_tco2: stripperMerged.energy_input_gj_tco2 ?? ccsStripper.energy_input_gj_tco2,
          },
          compressor: {
            isentropic_efficiency_frac: (compressorMerged.isentropic_efficiency_pct ?? ccsCompressor.isentropic_efficiency_pct) / 100,
            inlet_pressure_bar: 1.5,  // Atmospheric + slight pressurization from stripper
            target_pressure_bar: compressorMerged.target_pressure_bar ?? ccsCompressor.target_pressure_bar,
            number_stages: compressorMerged.number_stages ?? ccsCompressor.number_stages,
            intercooling_temp_c: compressorMerged.intercooling_temp_c ?? ccsCompressor.intercooling_temp_c,
          },
          storage: {
            injection_rate_mtco2_yr: storageMerged.injection_rate_mtco2_yr ?? ccsStorage.injection_rate_mtco2_yr,
            storage_depth_m: storageMerged.reservoir_depth_m ?? ccsStorage.reservoir_depth_m,
            reservoir_pressure_bar: storageMerged.reservoir_pressure_bar ?? ccsStorage.reservoir_pressure_bar,
            storage_efficiency_pct: storageMerged.injection_efficiency_pct ?? ccsStorage.injection_efficiency_pct,
            permeability_md: storageMerged.permeability_md ?? ccsStorage.permeability_md,
            porosity_pct: storageMerged.porosity_pct ?? ccsStorage.porosity_pct,
          },
        });
        runFn = runCCSSimulation;
        normalizeFn = normalizeCCSResult;
      } else {
        throw new Error(`Unknown simulation type: ${simType}`);
      }

      const cancel = await runFn(
        payload,
        {
          onQueued:   () => setSimState(SIM_STATES.QUEUED),
          onProgress: (d) => { setSimState(SIM_STATES.RUNNING); setProgress(d.progress_pct ?? 0); },
          onResult:   (r) => {
            setResult(normalizeFn(r));
            setSimState(SIM_STATES.DONE);
            pingHealth();
          },
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
          title={
            healthError
              ? `Error: ${healthError}`
              : health === null
                ? `Connecting to ${import.meta.env.VITE_H2_SERVICE_URL ?? "http://localhost:8765"}…`
                : health.engine_ready
                  ? `Engine ready · ${health._path ?? "/api/health"} · ${health.active_jobs ?? 0} active jobs`
                  : `Engine warming up · ${health.engine_error ?? "Simulation initializing"}`
          }
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
      {/* ── Engine offline diagnostic banner ────────────────────────────────── */}
      {healthError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm">
          <div className="flex items-start gap-3">
            <FiWifiOff className="mt-0.5 shrink-0 text-red-500" size={16} />
            <div className="flex-1">
              <p className="font-semibold text-red-700 mb-1">Cannot reach the simulation engine</p>
              <p className="text-red-600 text-xs mb-3 font-mono break-all">
                Target: {import.meta.env.VITE_H2_SERVICE_URL ?? "http://localhost:8765"}
              </p>
              <ul className="text-red-600 text-xs space-y-1 list-disc list-inside">
                <li><b>VPN / lab network</b> — the IP <code className="bg-red-100 px-1 rounded">{(import.meta.env.VITE_H2_SERVICE_URL ?? "").replace(/https?:\/\//, "").split(":")[0]}</code> is on a private subnet; connect to the VPN first.</li>
                <li><b>Docker not running</b> — on the server, run <code className="bg-red-100 px-1 rounded">docker compose up -d</code> and check <code className="bg-red-100 px-1 rounded">docker ps</code>.</li>
                <li><b>Wrong address</b> — update <code className="bg-red-100 px-1 rounded">VITE_H2_SERVICE_URL</code> in <code className="bg-red-100 px-1 rounded">.env</code>, then restart <code className="bg-red-100 px-1 rounded">npm run dev</code>.</li>
                <li><b>Run locally</b> — set <code className="bg-red-100 px-1 rounded">VITE_H2_SERVICE_URL=http://localhost:8765</code> and run the Docker container on this machine.</li>
              </ul>
            </div>
            <button onClick={pingHealth} title="Retry connection" className="shrink-0 p-1.5 rounded-lg hover:bg-red-100 text-red-400 transition-colors">
              <FiRefreshCw size={14} />
            </button>
          </div>
        </div>
      )}
      {/* ── Process Flow Diagram (Simulink-style interactive PFD) ──────────── */}
      {simType === "h2" && (
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
      )}

      {simType === "ccs" && (
        <CCSFlowDiagram
          result={result}
          isRunning={simState === SIM_STATES.RUNNING}
          onNodeClick={(nodeId) => setActiveNodeId(nodeId)}
          ccsModels={ccsModels}
          selectedCcsModels={selectedCcsModels}
          onSelectCcsModel={handleSelectCcsModel}
          simState={simState}
        />
      )}

      {/* ── Node detail modals (portal → always on top) ─────────────────────── */}

      {/* Generator / power-source node */}
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
          savedParams={genParamOverrides}
          onParamsChange={setGenParamOverrides}
        />
      </H2NodeModal>

      {/* Electrolyzer node */}
      <H2NodeModal
        open={activeNodeId === "electrolyzer"}
        onClose={() => setActiveNodeId(null)}
        title={selectedModels?.electrolyzer?.name ?? "Electrolyzer Analysis"}
        subtitle="Partial-load efficiency · H₂ production · constraints"
        icon={<FiZap size={18} />}
        accentColor="bg-indigo-500"
      >
        <H2ElectrolyzerPanel
          selectedModel={selectedModels?.electrolyzer}
          savedParams={elzParamOverrides}
          genTechType={detectSourceTechType(selectedModels?.source)}
          genCapacityKw={(() => {
            // Prefer the user-overridden capacity from the generator panel;
            // fall back to the base model value.
            const overridden = Number(genParamOverrides?.capacity_kw);
            if (isFinite(overridden) && overridden > 0) return overridden;
            const base = Number(selectedModels?.source?.capacity_kw);
            return isFinite(base) ? base : undefined;
          })()}
          result={result}
          simState={simState}
          variants={variants?.electrolyzer}
          onParamsChange={setElzParamOverrides}
        />
      </H2NodeModal>

      {/* ── CCS Modals (only when CCS simulation active) ─────────────────────── */}
      {simType === "ccs" && (
        <>
          {/* Source / Flue Gas */}
          <H2NodeModal
            open={activeNodeId === "ccs-source"}
            onClose={() => setActiveNodeId(null)}
            title={selectedCcsModels?.source?.name ?? "Flue Gas Source"}
            subtitle="Power plant · CO₂ emissions · flue gas properties"
            icon={<FiZap size={18} />}
            accentColor="bg-orange-500"
          >
            <CCSSourcePanel
              selectedModel={selectedCcsModels?.source}
              savedParams={ccsSourceParamOverrides}
              result={result}
              simState={simState}
              onParamsChange={setCcsSourceParamOverrides}
            />
          </H2NodeModal>

          {/* Absorber */}
          <H2NodeModal
            open={activeNodeId === "ccs-absorber"}
            onClose={() => setActiveNodeId(null)}
            title={selectedCcsModels?.absorber?.name ?? "CO₂ Absorber"}
            subtitle="Amine absorption · capture rate · energy requirement"
            icon={<FiDroplet size={18} />}
            accentColor="bg-blue-500"
          >
            <CCSAbsorberPanel
              selectedModel={selectedCcsModels?.absorber}
              savedParams={ccsAbsorberParamOverrides}
              sourceParams={ccsSourceParamOverrides}
              result={result}
              simState={simState}
              onParamsChange={setCcsAbsorberParamOverrides}
            />
          </H2NodeModal>

          {/* Stripper */}
          <H2NodeModal
            open={activeNodeId === "ccs-stripper"}
            onClose={() => setActiveNodeId(null)}
            title={selectedCcsModels?.stripper?.name ?? "Solvent Stripper"}
            subtitle="Thermal regeneration · steam requirements · efficiency"
            icon={<FiWind size={18} />}
            accentColor="bg-red-500"
          >
            <CCSStripperPanel
              selectedModel={selectedCcsModels?.stripper}
              savedParams={ccsStripperParamOverrides}
              result={result}
              simState={simState}
              onParamsChange={setCcsStripperParamOverrides}
            />
          </H2NodeModal>

          {/* Compressor */}
          <H2NodeModal
            open={activeNodeId === "ccs-compressor"}
            onClose={() => setActiveNodeId(null)}
            title={selectedCcsModels?.compressor?.name ?? "CO₂ Compressor"}
            subtitle="Multi-stage compression · pressure targets · power requirement"
            icon={<FiBox size={18} />}
            accentColor="bg-amber-500"
          >
            <CCSCompressorPanel
              selectedModel={selectedCcsModels?.compressor}
              savedParams={ccsCompressorParamOverrides}
              result={result}
              simState={simState}
              onParamsChange={setCcsCompressorParamOverrides}
            />
          </H2NodeModal>

          {/* Storage */}
          <H2NodeModal
            open={activeNodeId === "ccs-storage"}
            onClose={() => setActiveNodeId(null)}
            title={selectedCcsModels?.storage?.name ?? "CO₂ Storage"}
            subtitle="Geological sequestration · injection rate · reservoir properties"
            icon={<FiDatabase size={18} />}
            accentColor="bg-emerald-500"
          >
            <CCSStoragePanel
              selectedModel={selectedCcsModels?.storage}
              savedParams={ccsStorageParamOverrides}
              sourceParams={ccsSourceParamOverrides}
              result={result}
              simState={simState}
              onParamsChange={setCcsStorageParamOverrides}
            />
          </H2NodeModal>
        </>
      )}

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
                title="Run simulation"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                  bg-gradient-to-r from-electric-500 to-electric-600 text-white font-semibold text-sm
                  shadow-md hover:shadow-lg hover:from-electric-600 hover:to-electric-700
                  transition-all active:scale-95"
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
          <div className={`mt-4 flex items-center gap-2 text-sm rounded-xl px-4 py-2.5 border ${
            result?._local
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-emerald-700 bg-emerald-50 border-emerald-200'
          }`}>
            <FiCheckCircle />
            {result?._local
              ? <>Local physics simulation complete — {result?.time_s?.length ?? 0} steps. <span className="font-medium">Connect to service for high-fidelity OpenModelica results.</span></>
              : <>OpenModelica simulation complete — {result?.time_s?.length ?? 0} data points returned.</>}
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

      {/* ── Payload preview ─────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowPayloadPreview((p) => !p)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-600"
        >
          <span className="flex items-center gap-2">
            <FiInfo size={13} className="text-indigo-500" />
            Simulation Payload (v2.0)
            <span className="text-xs font-normal text-slate-400">schema v2.0 · inspect what will be sent</span>
          </span>
          <span className="text-slate-400 font-mono text-xs">{showPayloadPreview ? '▲ hide' : '▼ show'}</span>
        </button>
        {showPayloadPreview && (
          <div className="bg-slate-900 text-slate-100 p-4 max-h-96 overflow-auto">
            <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(previewPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── Energy Evolution Charts ──────────────────────────────────────── */}
      {simType === "h2" && (
        <H2EnergyCharts
          result={result}
          simState={simState}
          progress={progress}
          sourceName={selectedModels?.source?.name}
        />
      )}

      {simType === "ccs" && (
        <CCSEnergyCharts
          result={result}
        />
      )}

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
