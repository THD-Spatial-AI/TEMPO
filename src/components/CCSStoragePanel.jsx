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
import { FiDatabase, FiActivity, FiInfo, FiSettings, FiLayers } from "react-icons/fi";

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

  const [selectedChart, setSelectedChart] = useState("pressure");

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
        textStyle: { fontSize: 9 }, icon: 'roundRect',
      },
      grid: { top: 24, bottom: 68, left: 56, right: 16 },
      xAxis: {
        type: "category",
        data: depths,
        name: "Depth (m)",
        nameLocation: "middle",
        nameGap: 30,
        axisLabel: { fontSize: 9, rotate: 45, interval: 4 },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Pressure (bar)",
        nameTextStyle: { fontSize: 9 },
        axisLabel: { fontSize: 9 },
      },
      series: [
        {
          name: "Hydrostatic",
          type: "line",
          data: hydrostaticPressure,
          smooth: true,
          symbol: "none",
          color: "#3b82f6",
          lineStyle: { color: "#3b82f6", width: 2 },
        },
        {
          name: "Injection",
          type: "line",
          data: injectionPressure,
          smooth: true,
          symbol: "none",
          color: meta.hue,
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
          color: "#ef4444",
          lineStyle: { color: "#ef4444", width: 2, type: "dashed" },
        },
      ],
    };
  }, [localParams, meta.hue]);

  // CO₂ plume radius & cumulative storage over time
  const plumeGrowthChart = useMemo(() => {
    const years = Array.from({ length: 31 }, (_, i) => i);
    const rho   = 700; // kg/m³ supercritical CO₂
    const pore  = localParams.porosity_pct / 100;
    const h     = 50;  // m reservoir thickness
    const radius = years.map(yr => {
      if (yr === 0) return 0;
      const massKg = localParams.injection_rate_mtco2_yr * 1e9 * yr;
      const volume = massKg / (rho * pore);
      return +(Math.sqrt(volume / (Math.PI * h)) / 1000).toFixed(2);
    });
    const cumulative = years.map(yr => +(localParams.injection_rate_mtco2_yr * yr).toFixed(2));
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["Plume Radius (km)", "Cumulative (MtCO₂)"], bottom: 0, textStyle: { fontSize: 9 }, icon: 'roundRect', type: 'scroll' },
      grid: { top: 24, bottom: 68, left: 48, right: 52 },
      xAxis: { type: "category", data: years.map(y => `Y${y}`), name: "Year", nameLocation: "middle", nameGap: 28, axisLabel: { fontSize: 9, interval: 4 }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "km",     nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
        { type: "value", name: "MtCO₂", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, splitLine: { show: false } },
      ],
      series: [
        { name: "Plume Radius (km)",   type: "line", data: radius,     smooth: true, symbol: "none", color: meta.hue, lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` }, yAxisIndex: 0 },
        { name: "Cumulative (MtCO₂)", type: "line", data: cumulative, smooth: true, symbol: "none", color: "#3b82f6", lineStyle: { color: "#3b82f6", width: 2 }, yAxisIndex: 1 },
      ],
    };
  }, [localParams.injection_rate_mtco2_yr, localParams.porosity_pct, meta.hue]);

  // Injectivity and wells needed vs reservoir permeability
  const injectionPermeabilityChart = useMemo(() => {
    const perms = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const base  = localParams.injection_rate_mtco2_yr;
    const rates = perms.map(k => +Math.min(20, base * Math.sqrt(k / Math.max(1, localParams.permeability_md))).toFixed(2));
    const wells = perms.map(k => Math.ceil(base / Math.max(0.05, 0.1 * Math.sqrt(k / 50))));
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["Injectivity (Mt/yr)", "Wells Needed"], bottom: 0, textStyle: { fontSize: 9 }, icon: 'roundRect', type: 'scroll' },
      grid: { top: 24, bottom: 68, left: 48, right: 52 },
      xAxis: { type: "category", data: perms.map(k => `${k}`), name: "Permeability (mD)", nameLocation: "middle", nameGap: 28, axisLabel: { fontSize: 9 }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "Mt/yr", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
        { type: "value", name: "Wells", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, splitLine: { show: false } },
      ],
      series: [
        { name: "Injectivity (Mt/yr)", type: "bar",  data: rates, itemStyle: { color: meta.hue, opacity: 0.8 }, yAxisIndex: 0 },
        { name: "Wells Needed",        type: "line", data: wells, symbol: "none", color: "#ef4444", lineStyle: { color: "#ef4444", width: 2 }, yAxisIndex: 1 },
      ],
    };
  }, [localParams.injection_rate_mtco2_yr, localParams.permeability_md, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header — Technology Identity ───────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <span className="p-2.5 rounded-xl text-white shadow" style={{ background: `linear-gradient(135deg, ${meta.hue}, ${meta.hue}bb)` }}>
              <FiDatabase size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">{meta.label}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{meta.tagline}</p>
              {selectedModel && (
                <p className="text-[10px] text-slate-400 mt-0.5 font-mono italic">{selectedModel.id ?? selectedModel.name}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 flex-1 min-w-[260px]">
            <MetricBadge label="Injection Rate" value={localParams.injection_rate_mtco2_yr} unit="MtCO₂/yr" color="green" />
            <MetricBadge label="Depth" value={localParams.reservoir_depth_m} unit="m" color="slate" />
            <MetricBadge label="Res. Pressure" value={localParams.reservoir_pressure_bar} unit="bar" color="amber" />
            <MetricBadge label="Permeability" value={localParams.permeability_md} unit="mD" color="blue" />
            <MetricBadge label="Porosity" value={localParams.porosity_pct} unit="%" color="violet" />
            <MetricBadge label="Inj. Efficiency" value={localParams.injection_efficiency_pct} unit="%" color="red" />
          </div>
        </div>
      </div>

      {/* ── Technology Variant ──────────────────────────────────────────────── */}
      {variants && variants.length > 1 && (() => {
        const appliedId = localParams._variantId ?? "";
        const stagedId  = localParams._stagedVariantId ?? appliedId;
        const isPending = stagedId !== appliedId;
        const handleStage = (e) => setLocalParams((p) => ({ ...p, _stagedVariantId: e.target.value }));
        const handleApply = () => {
          if (!stagedId) { setLocalParams({}); onParamsChange?.({}); return; }
          const v = variants.find((vv) => vv.id === stagedId);
          if (!v) return;
          const patch = { _variantId: v.id };
          if (v.injection_rate_mtco2_yr != null)   patch.injection_rate_mtco2_yr   = v.injection_rate_mtco2_yr;
          if (v.reservoir_depth_m != null)         patch.reservoir_depth_m         = v.reservoir_depth_m;
          if (v.reservoir_pressure_bar != null)    patch.reservoir_pressure_bar    = v.reservoir_pressure_bar;
          if (v.permeability_md != null)           patch.permeability_md           = v.permeability_md;
          if (v.porosity_pct != null)              patch.porosity_pct              = v.porosity_pct;
          if (v.injection_efficiency_pct != null)  patch.injection_efficiency_pct  = v.injection_efficiency_pct;
          setLocalParams(patch); onParamsChange?.(patch);
        };
        const displayV = variants.find((v) => v.id === stagedId) ?? null;
        const appliedV = variants.find((v) => v.id === appliedId) ?? null;
        return (
          <div className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex flex-wrap items-start gap-3
            ${isPending ? "border-amber-300" : appliedV ? "border-emerald-300" : "border-slate-200"}`}>
            <FiLayers size={12} style={{ color: meta.hue }} className="mt-1" />
            <div className="flex-1 min-w-[220px] space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600">Technology Variant</span>
                {appliedV && !isPending && <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">✓ Applied</span>}
                {isPending && <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">● Pending — click Apply</span>}
              </div>
              <select value={stagedId} onChange={handleStage}
                className="w-full text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer">
                <option value="">— default —</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {displayV?.description && <p className="text-[10px] text-slate-400 italic leading-snug">{displayV.description}</p>}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={handleApply} disabled={!isPending && !appliedId}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                  ${isPending ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm" : appliedId ? "bg-slate-100 text-slate-500 hover:bg-slate-200" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}>
                {isPending ? "✓ Apply variant" : appliedId ? "✓ Applied" : "Apply"}
              </button>
              {(appliedId || isPending) && (
                <button onClick={() => { setLocalParams({}); onParamsChange?.({}); }}
                  className="px-3 py-1 rounded-lg text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all">
                  ✕ Reset
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Performance Analysis ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <FiActivity size={13} style={{ color: meta.hue }} />
          <h4 className="text-sm font-semibold text-slate-700">Performance Analysis</h4>
          <select
            value={selectedChart}
            onChange={(e) => setSelectedChart(e.target.value)}
            className="ml-auto text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="pressure">Pressure–Depth Profile</option>
            <option value="plume">CO₂ Plume Growth</option>
            <option value="injectivity">Injectivity vs Permeability</option>
          </select>
        </div>
        <ReactECharts
          key={selectedChart}
          option={selectedChart === "pressure" ? pressureDepthChart : selectedChart === "plume" ? plumeGrowthChart : injectionPermeabilityChart}
          style={{ height: 320 }}
        />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Geological storage:</b> CO₂ must be injected below ~800m depth to ensure supercritical state (density 500-800 kg/m³).
          Injection pressure must stay below fracture gradient to prevent rock failure. Caprock integrity ensures permanent sequestration.
        </p>
      </div>

      {/* ── Configuration & Parameters ──────────────────────────────────────── */}
      <div className="group bg-white rounded-2xl border border-slate-200 shadow-sm">
        <details>
          <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none hover:bg-slate-50 rounded-2xl transition-colors list-none">
            <FiSettings size={12} style={{ color: meta.hue }} className="shrink-0" />
            <span className="text-[12px] font-semibold text-slate-600">Configuration &amp; Parameters</span>
            <svg className="ml-auto w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-4">
            <ParamSlider label="Injection Rate" unit="MtCO₂/yr" value={localParams.injection_rate_mtco2_yr} min={0.5} max={20} step={0.5} onChange={(v) => updateParam("injection_rate_mtco2_yr", v)} />
            <ParamSlider label="Reservoir Depth" unit="m" value={localParams.reservoir_depth_m} min={meta.depthRange[0]} max={meta.depthRange[1]} step={100} onChange={(v) => updateParam("reservoir_depth_m", v)} />
            <ParamSlider label="Reservoir Pressure" unit="bar" value={localParams.reservoir_pressure_bar} min={80} max={300} step={10} onChange={(v) => updateParam("reservoir_pressure_bar", v)} />
            <ParamSlider label="Permeability" unit="mD" value={localParams.permeability_md} min={10} max={1000} step={10} onChange={(v) => updateParam("permeability_md", v)} />
            <ParamSlider label="Porosity" unit="%" value={localParams.porosity_pct} min={10} max={30} step={1} onChange={(v) => updateParam("porosity_pct", v)} />
            <ParamSlider label="Injection Efficiency" unit="%" value={localParams.injection_efficiency_pct} min={90} max={100} step={0.5} onChange={(v) => updateParam("injection_efficiency_pct", v)} />
          </div>
        </details>
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

function MetricBadge({ label, value, unit, color = "slate" }) {
  const palettes = {
    amber:  "bg-amber-50  border-amber-200  text-amber-700",
    green:  "bg-emerald-50 border-emerald-200 text-emerald-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    blue:   "bg-blue-50   border-blue-200   text-blue-700",
    red:    "bg-red-50    border-red-200    text-red-700",
    slate:  "bg-slate-50  border-slate-200  text-slate-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${palettes[color] ?? palettes.slate}`}>
      <p className="text-[10px] text-slate-500 font-medium leading-none mb-1">{label}</p>
      <p className="text-sm font-bold leading-none">
        {value ?? "—"}
        {value != null && unit && <span className="text-xs font-normal ml-1 text-slate-500">{unit}</span>}
      </p>
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
    <div className={`rounded-xl border px-4 py-3 ${ring[color] ?? ring.slate}`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-lg font-bold leading-tight ${text[color] ?? text.slate}`}>
        {value ?? "—"}
        {value != null && <span className="text-sm font-medium ml-1">{unit}</span>}
      </p>
    </div>
  );
}
