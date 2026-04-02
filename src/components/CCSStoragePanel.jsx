/**
 * CCSStoragePanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CO₂ Storage/Sequestration parameter panel for CCS simulation.
 * Configures injection rates, reservoir properties, and storage capacity.
 *
 * Props:
 *   selectedModel  {Object}  – active storage tech from opentech-db / fallback
 *   savedParams    {Object}  – local parameter overrides
 *   sourceParams   {Object}  – upstream source parameters (for matching capacity)
 *   result         {Object}  – simulation result (optional)
 *   simState       {string}  – 'idle'|'queued'|'running'|'done'|'error'
 *   variants       {Array}   – variant list from fetchCCSVariants
 *   onParamsChange {Function}– called whenever local overrides change
 */

import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { FiDatabase, FiActivity, FiInfo, FiSettings } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Storage type detection from model id / name
// ─────────────────────────────────────────────────────────────────────────────
function detectStorageType(model) {
  if (!model) return "saline";
  const key = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (/saline|aquifer|onshore/.test(key))      return "saline";
  if (/offshore|deep.saline/.test(key))        return "offshore";
  if (/depleted.*gas|gas.field/.test(key))     return "gas";
  if (/depleted.*oil|oil.field|eor/.test(key)) return "oil";
  if (/basalt|mineral/.test(key))              return "basalt";
  if (/pipeline|transport/.test(key))          return "pipeline";
  return "saline";
}

// Per-storage-type metadata
const STORAGE_META = {
  saline: {
    label:   "Saline Aquifer (Onshore)",
    hue:     "#10b981",
    bg:      "bg-emerald-50",
    border:  "border-emerald-200",
    tagline: "Deep saline formations · 500-2000 MtCO₂ capacity · €8-12/tCO₂",
    capacityRange: [500, 2000],
    depthRange: [800, 2500],
    costRange: [8, 12],
  },
  offshore: {
    label:   "Saline Aquifer (Offshore)",
    hue:     "#06b6d4",
    bg:      "bg-cyan-50",
    border:  "border-cyan-200",
    tagline: "Offshore reservoirs · 1000-5000 MtCO₂ capacity · €12-18/tCO₂",
    capacityRange: [1000, 5000],
    depthRange: [1000, 3000],
    costRange: [12, 18],
  },
  gas: {
    label:   "Depleted Gas Field",
    hue:     "#6366f1",
    bg:      "bg-indigo-50",
    border:  "border-indigo-200",
    tagline: "Proven integrity · 300-1000 MtCO₂ capacity · €6-10/tCO₂",
    capacityRange: [300, 1000],
    depthRange: [1500, 3500],
    costRange: [6, 10],
  },
  oil: {
    label:   "Depleted Oil Field (EOR)",
    hue:     "#f59e0b",
    bg:      "bg-amber-50",
    border:  "border-amber-200",
    tagline: "Enhanced recovery · 200-800 MtCO₂ capacity · €4-8/tCO₂ (revenue offset)",
    capacityRange: [200, 800],
    depthRange: [1000, 3000],
    costRange: [4, 8],
  },
  basalt: {
    label:   "Basalt Mineralization",
    hue:     "#dc2626",
    bg:      "bg-red-50",
    border:  "border-red-200",
    tagline: "Permanent chemical bonding · 1000+ MtCO₂ capacity · €15-25/tCO₂",
    capacityRange: [1000, 10000],
    depthRange: [400, 1500],
    costRange: [15, 25],
  },
  pipeline: {
    label:   "CO₂ Pipeline Transport",
    hue:     "#8b5cf6",
    bg:      "bg-violet-50",
    border:  "border-violet-200",
    tagline: "Trunk line to offshore hub · 200-500 km · €10-20/tCO₂",
    capacityRange: [1, 20], // MtCO₂/year
    depthRange: [0, 0], // N/A
    costRange: [10, 20],
  },
};

export default function CCSStoragePanel({
  selectedModel,
  savedParams = {},
  sourceParams = {},
  result,
  simState,
  variants,
  onParamsChange,
}) {
  const storageType = detectStorageType(selectedModel);
  const meta = STORAGE_META[storageType] ?? STORAGE_META.saline;

  // Local editable overrides (merged with saved)
  const [localParams, setLocalParams] = useState(() => ({
    injection_rate_mtco2_yr: savedParams.injection_rate_mtco2_yr ?? selectedModel?.injection_rate_mtco2_yr ?? 5,
    reservoir_depth_m: savedParams.reservoir_depth_m ?? selectedModel?.reservoir_depth_m ?? 1500,
    reservoir_pressure_bar: savedParams.reservoir_pressure_bar ?? 150,
    permeability_md: savedParams.permeability_md ?? 200,
    porosity_pct: savedParams.porosity_pct ?? 18,
    injection_efficiency_pct: savedParams.injection_efficiency_pct ?? 99,
  }));

  // Update local params and propagate to parent
  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    onParamsChange?.(updated);
  };

  // Build injection pressure vs. depth chart
  const pressureDepthChart = useMemo(() => {
    const depths = Array.from({ length: 31 }, (_, i) => 500 + i * 100); // 500-3500m
    const hydrostaticPressure = depths.map(d => d * 0.1); // bar (approximately 10 bar per 100m)
    const injectionPressure = depths.map(d => d * 0.11); // slightly above hydrostatic
    const fracturePressure = depths.map(d => d * 0.18); // Fracture gradient ~18 bar/100m

    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: {
        data: ["Hydrostatic", "Injection", "Fracture Limit"],
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { top: 24, bottom: 48, left: 48, right: 52 },
      xAxis: {
        type: "category",
        data: depths,
        name: "Depth (m)",
        nameLocation: "middle",
        nameGap: 25,
        axisLabel: { fontSize: 10, rotate: 45 },
      },
      yAxis: {
        type: "value",
        name: "Pressure (bar)",
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          name: "Hydrostatic",
          type: "line",
          data: hydrostaticPressure,
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#3b82f6", width: 2 },
        },
        {
          name: "Injection",
          type: "line",
          data: injectionPressure,
          smooth: true,
          symbol: "none",
          lineStyle: { color: meta.hue, width: 2 },
          areaStyle: { color: `${meta.hue}33` },
          markLine: {
            data: [{ yAxis: localParams.reservoir_pressure_bar, name: "Target" }],
            label: { position: "insideEndTop", fontSize: 10 },
            lineStyle: { color: meta.hue, type: "dashed", width: 2 },
          },
        },
        {
          name: "Fracture Limit",
          type: "line",
          data: fracturePressure,
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#ef4444", width: 2, type: "dashed" },
        },
      ],
    };
  }, [localParams, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-lg bg-white shadow-sm" style={{ color: meta.hue }}>
            <FiDatabase size={20} />
          </span>
          <div className="flex-1">
            <h4 className="font-bold text-slate-800 mb-1">{meta.label}</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{meta.tagline}</p>
            {selectedModel && (
              <p className="text-[11px] text-slate-400 mt-2 font-mono">
                {selectedModel.id ?? selectedModel.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Parameters ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <FiSettings size={14} className="text-electric-500" />
          <h5 className="font-semibold text-slate-700 text-sm">Storage Configuration</h5>
        </div>

        <div className="space-y-4">
          <ParamSlider
            label="Injection Rate"
            unit="MtCO₂/yr"
            value={localParams.injection_rate_mtco2_yr}
            min={0.5}
            max={20}
            step={0.5}
            onChange={(v) => updateParam("injection_rate_mtco2_yr", v)}
          />
          <ParamSlider
            label="Reservoir Depth"
            unit="m"
            value={localParams.reservoir_depth_m}
            min={meta.depthRange[0]}
            max={meta.depthRange[1]}
            step={100}
            onChange={(v) => updateParam("reservoir_depth_m", v)}
          />
          <ParamSlider
            label="Reservoir Pressure"
            unit="bar"
            value={localParams.reservoir_pressure_bar}
            min={80}
            max={300}
            step={10}
            onChange={(v) => updateParam("reservoir_pressure_bar", v)}
          />
          <ParamSlider
            label="Permeability"
            unit="mD"
            value={localParams.permeability_md}
            min={10}
            max={1000}
            step={10}
            onChange={(v) => updateParam("permeability_md", v)}
          />
          <ParamSlider
            label="Porosity"
            unit="%"
            value={localParams.porosity_pct}
            min={10}
            max={30}
            step={1}
            onChange={(v) => updateParam("porosity_pct", v)}
          />
          <ParamSlider
            label="Injection Efficiency"
            unit="%"
            value={localParams.injection_efficiency_pct}
            min={90}
            max={100}
            step={0.5}
            onChange={(v) => updateParam("injection_efficiency_pct", v)}
          />
        </div>
      </div>

      {/* ── Pressure-Depth Chart ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FiActivity size={14} className="text-violet-500" />
          <h5 className="font-semibold text-slate-700 text-sm">Pressure-Depth Profile</h5>
        </div>
        <ReactECharts option={pressureDepthChart} style={{ height: 220 }} />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Injection Rate"
          value={(localParams.injection_rate_mtco2_yr / 8760).toFixed(0)}
          unit="t/h"
          color="emerald"
        />
        <KpiCard
          label="Storage Capacity"
          value={(localParams.injection_rate_mtco2_yr * 30).toFixed(0)}
          unit="MtCO₂"
          color="blue"
        />
        <KpiCard
          label="Pore Volume"
          value={((localParams.porosity_pct / 100) * 1000 * localParams.permeability_md / 100).toFixed(0)}
          unit="Mm³"
          color="violet"
        />
        <KpiCard
          label="Storage Cost"
          value={`${meta.costRange[0]}-${meta.costRange[1]}`}
          unit="€/tCO₂"
          color="amber"
        />
      </div>

      {/* ── Info Banner ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Geological storage:</b> CO₂ must be injected below ~800m depth to ensure supercritical state (density 500-800 kg/m³).
          Injection pressure must stay below fracture gradient to prevent rock failure. Caprock integrity ensures permanent sequestration.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper components (reusable primitives)
// ─────────────────────────────────────────────────────────────────────────────

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
    amber:    "border-amber-200 bg-amber-50",
    blue:     "border-blue-200 bg-blue-50",
    violet:   "border-violet-200 bg-violet-50",
    slate:    "border-slate-200 bg-slate-50",
  };
  const text = {
    electric: "text-electric-700",
    emerald:  "text-emerald-700",
    amber:    "text-amber-700",
    blue:     "text-blue-700",
    violet:   "text-violet-700",
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
