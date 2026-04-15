/**
 * CCSAbsorberPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CO₂ Absorber parameter panel for CCS simulation.
 * Configures capture rate, solvent type, energy requirements.
 *
 * Props:
 *   selectedModel  {Object}  – active absorber tech from opentech-db / fallback
 *   savedParams    {Object}  – local parameter overrides
 *   sourceParams   {Object}  – upstream source parameters (for capacity matching)
 *   result         {Object}  – simulation result (optional)
 *   simState       {string}  – 'idle'|'queued'|'running'|'done'|'error'
 *   variants       {Array}   – variant list from fetchCCSVariants
 *   onParamsChange {Function}– called whenever local overrides change
 */

import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { FiDroplet, FiActivity, FiInfo, FiSettings, FiLayers } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Absorber type detection from model id / name
// ─────────────────────────────────────────────────────────────────────────────
function detectAbsorberType(model) {
  if (!model) return "mea";
  const key = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (/mea|monoethanolamine|30/.test(key))           return "mea";
  if (/advanced|amine|blend|pz|piperazine/.test(key)) return "advanced";
  if (/carbonate|potassium|khi|hot/.test(key))       return "carbonate";
  if (/membrane/.test(key))                          return "membrane";
  if (/calcium|looping/.test(key))                   return "calcium";
  return "mea";
}

// Per-absorber-type metadata
const ABSORBER_META = {
  mea: {
    label:   "MEA Absorption (30%)",
    hue:     "#3b82f6",
    bg:      "bg-blue-50",
    border:  "border-blue-200",
    tagline: "Standard amine solvent · 85-92% capture · 3.5-4.0 GJ/tCO₂",
    captureRange: [85, 92],
    energyRange: [3.5, 4.0],
  },
  advanced: {
    label:   "Advanced Amine Blend",
    hue:     "#6366f1",
    bg:      "bg-indigo-50",
    border:  "border-indigo-200",
    tagline: "Next-gen solvent · 88-95% capture · 2.8-3.2 GJ/tCO₂",
    captureRange: [88, 95],
    energyRange: [2.8, 3.2],
  },
  carbonate: {
    label:   "Hot Potassium Carbonate",
    hue:     "#8b5cf6",
    bg:      "bg-violet-50",
    border:  "border-violet-200",
    tagline: "High-temp process · 80-88% capture · 3.8-4.5 GJ/tCO₂",
    captureRange: [80, 88],
    energyRange: [3.8, 4.5],
  },
  membrane: {
    label:   "Membrane Separation",
    hue:     "#06b6d4",
    bg:      "bg-cyan-50",
    border:  "border-cyan-200",
    tagline: "No solvent · 70-80% capture · 2.2-2.8 GJ/tCO₂",
    captureRange: [70, 80],
    energyRange: [2.2, 2.8],
  },
  calcium: {
    label:   "Calcium Looping",
    hue:     "#f59e0b",
    bg:      "bg-amber-50",
    border:  "border-amber-200",
    tagline: "Solid sorbent · 85-92% capture · 3.0-3.6 GJ/tCO₂",
    captureRange: [85, 92],
    energyRange: [3.0, 3.6],
  },
};

export default function CCSAbsorberPanel({
  selectedModel,
  savedParams = {},
  sourceParams = {},
  result,
  simState,
  variants,
  onParamsChange,
}) {
  const absorberType = detectAbsorberType(selectedModel);
  const meta = ABSORBER_META[absorberType] ?? ABSORBER_META.mea;

  // Local editable overrides (merged with saved)
  const [localParams, setLocalParams] = useState(() => ({
    capture_rate_pct: savedParams.capture_rate_pct ?? selectedModel?.capture_rate_pct ?? 90,
    energy_requirement_gj_tco2: savedParams.energy_requirement_gj_tco2 ?? selectedModel?.energy_requirement_gj_tco2 ?? 3.7,
    solvent_flow_rate_m3_h: savedParams.solvent_flow_rate_m3_h ?? 150,
    absorption_temp_c: savedParams.absorption_temp_c ?? 40,
    l_g_ratio: savedParams.l_g_ratio ?? 3.5, // Liquid-to-gas ratio (L/G)
  }));

  // Update local params and propagate to parent
  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    onParamsChange?.(updated);
  };

  const [selectedChart, setSelectedChart] = useState("efficiency");

  // Build partial-load capture efficiency curve
  const efficiencyCurve = useMemo(() => {
    const loads = Array.from({ length: 101 }, (_, i) => i);
    const efficiency = loads.map((load) => {
      if (load < 20) {
        // Below 20%, efficiency drops sharply
        const factor = Math.pow(load / 20, 1.5);
        return localParams.capture_rate_pct * factor;
      } else if (load > 110) {
        // Overload reduces efficiency
        const penalty = (load - 110) * 0.5;
        return Math.max(0, localParams.capture_rate_pct - penalty);
      } else {
        // 20-110%: peak efficiency zone
        return localParams.capture_rate_pct;
      }
    });

    const energyReq = loads.map((load) => {
      if (load < 20) return localParams.energy_requirement_gj_tco2 * 1.3;
      if (load > 100) return localParams.energy_requirement_gj_tco2 * (1 + (load - 100) * 0.01);
      return localParams.energy_requirement_gj_tco2;
    });

    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: {
        data: ["Capture Efficiency", "Specific Energy"],
        bottom: 0,
        textStyle: { fontSize: 9 }, icon: 'roundRect',
      },
      grid: { top: 24, bottom: 68, left: 48, right: 52 },
      xAxis: {
        type: "category",
        data: loads,
        name: "Flue Gas Load (%)",
        nameLocation: "middle",
        nameGap: 28,
        axisLabel: { fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: "value",
          name: "Capture %",
          nameTextStyle: { fontSize: 9 },
          axisLabel: { fontSize: 9 },
          max: 100,
        },
        {
          type: "value",
          name: "GJ/tCO₂",
          nameTextStyle: { fontSize: 9 },
          axisLabel: { fontSize: 9 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Capture Efficiency",
          type: "line",
          data: efficiency,
          smooth: true,
          symbol: "none",
          color: meta.hue,
          lineStyle: { color: meta.hue, width: 2 },
          areaStyle: { color: `${meta.hue}33` },
          yAxisIndex: 0,
        },
        {
          name: "Specific Energy",
          type: "line",
          data: energyReq,
          smooth: true,
          symbol: "none",
          color: "#ef4444",
          lineStyle: { color: "#ef4444", width: 2 },
          yAxisIndex: 1,
        },
      ],
    };
  }, [localParams, meta.hue]);

  // Capture rate & specific energy vs flue gas CO₂ concentration
  const captureConcentrationChart = useMemo(() => {
    const concs = Array.from({ length: 23 }, (_, i) => 3 + i);
    const captureRates = concs.map(c => +Math.min(99, localParams.capture_rate_pct + (c - 3) * 0.12).toFixed(1));
    const energyReqs  = concs.map(c => +Math.max(2.0, localParams.energy_requirement_gj_tco2 - (c - 3) * 0.035).toFixed(2));
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["Capture Rate", "Specific Energy"], bottom: 0, textStyle: { fontSize: 9 }, icon: 'roundRect', type: 'scroll' },
      grid: { top: 24, bottom: 68, left: 48, right: 52 },
      xAxis: { type: "category", data: concs.map(c => `${c}%`), name: "Flue Gas CO₂ vol%", nameLocation: "middle", nameGap: 28, axisLabel: { fontSize: 9, interval: 2 }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "Capture %", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, min: 60, max: 100 },
        { type: "value", name: "GJ/tCO₂",  nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, splitLine: { show: false }, min: 1.5, max: 5.0 },
      ],
      series: [
        { name: "Capture Rate",   type: "line", data: captureRates, smooth: true, symbol: "none", color: meta.hue, lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` }, yAxisIndex: 0 },
        { name: "Specific Energy", type: "line", data: energyReqs,  smooth: true, symbol: "none", color: "#ef4444", lineStyle: { color: "#ef4444", width: 2 }, yAxisIndex: 1 },
      ],
    };
  }, [localParams.capture_rate_pct, localParams.energy_requirement_gj_tco2, meta.hue]);

  // Capture rate & column pressure drop vs L/G ratio
  const solventFlowChart = useMemo(() => {
    const ratios = Array.from({ length: 21 }, (_, i) => +(1.5 + i * 0.2).toFixed(1));
    const capture = ratios.map(r => +Math.min(99, Math.max(50, localParams.capture_rate_pct + (r - localParams.l_g_ratio) * 3)).toFixed(1));
    const deltaP  = ratios.map(r => +(0.8 + r * 0.25).toFixed(2));
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["Capture Rate", "Column ΔP"], bottom: 0, textStyle: { fontSize: 9 }, icon: 'roundRect', type: 'scroll' },
      grid: { top: 24, bottom: 68, left: 48, right: 52 },
      xAxis: { type: "category", data: ratios.map(r => `${r}`), name: "L/G Ratio (L/Nm³)", nameLocation: "middle", nameGap: 28, axisLabel: { fontSize: 9, interval: 2 }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "Capture %", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, min: 50, max: 100 },
        { type: "value", name: "ΔP (kPa)",  nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, splitLine: { show: false } },
      ],
      series: [
        { name: "Capture Rate", type: "line", data: capture, smooth: true, symbol: "none", color: meta.hue, lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` }, yAxisIndex: 0 },
        { name: "Column ΔP",    type: "line", data: deltaP,  smooth: true, symbol: "none", color: "#f59e0b", lineStyle: { color: "#f59e0b", width: 2 }, yAxisIndex: 1 },
      ],
    };
  }, [localParams.capture_rate_pct, localParams.l_g_ratio, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header — Technology Identity ───────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <span className="p-2.5 rounded-xl text-white shadow" style={{ background: `linear-gradient(135deg, ${meta.hue}, ${meta.hue}bb)` }}>
              <FiDroplet size={18} />
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
            <MetricBadge label="Capture Rate" value={localParams.capture_rate_pct} unit="%" color="green" />
            <MetricBadge label="Specific Energy" value={localParams.energy_requirement_gj_tco2.toFixed(1)} unit="GJ/tCO₂" color="amber" />
            <MetricBadge label="Solvent Flow" value={localParams.solvent_flow_rate_m3_h} unit="m³/h" color="blue" />
            <MetricBadge label="Absorb. Temp" value={localParams.absorption_temp_c} unit="°C" color="slate" />
            <MetricBadge label="L/G Ratio" value={localParams.l_g_ratio.toFixed(1)} unit="—" color="violet" />
            <MetricBadge label="Mass Transfer" value={(localParams.l_g_ratio * 100 / localParams.capture_rate_pct).toFixed(2)} unit="—" color="red" />
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
          if (v.capture_rate_pct != null)           patch.capture_rate_pct           = v.capture_rate_pct;
          if (v.energy_requirement_gj_tco2 != null) patch.energy_requirement_gj_tco2 = v.energy_requirement_gj_tco2;
          if (v.solvent_flow_rate_m3_h != null)     patch.solvent_flow_rate_m3_h     = v.solvent_flow_rate_m3_h;
          if (v.absorption_temp_c != null)          patch.absorption_temp_c          = v.absorption_temp_c;
          if (v.l_g_ratio != null)                  patch.l_g_ratio                  = v.l_g_ratio;
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
            <option value="efficiency">Partial-Load Capture Efficiency</option>
            <option value="concentration">CO₂ Concentration Effect</option>
            <option value="solvent">Solvent Flow vs Capture</option>
          </select>
        </div>
        <ReactECharts
          key={selectedChart}
          option={selectedChart === "efficiency" ? efficiencyCurve : selectedChart === "concentration" ? captureConcentrationChart : solventFlowChart}
          style={{ height: 320 }}
        />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="CO₂ Removed"
          value={sourceParams.capacity_kw ? (
            (sourceParams.capacity_kw * (sourceParams.co2_emission_kg_kwh ?? 0.38) * localParams.capture_rate_pct / 100 / 1000).toFixed(1)
          ) : "—"}
          unit="t/h"
          color="emerald"
        />
        <KpiCard
          label="Thermal Power (Regen)"
          value={sourceParams.capacity_kw ? (
            (sourceParams.capacity_kw * (sourceParams.co2_emission_kg_kwh ?? 0.38) * localParams.capture_rate_pct / 100 * localParams.energy_requirement_gj_tco2 / 3.6 / 1000).toFixed(0)
          ) : "—"}
          unit="MW"
          color="amber"
        />
        <KpiCard
          label="Solvent Circulation"
          value={localParams.solvent_flow_rate_m3_h.toFixed(0)}
          unit="m³/h"
          color="blue"
        />
        <KpiCard
          label="Mass Transfer Driving Force"
          value={(localParams.l_g_ratio * 100 / localParams.capture_rate_pct).toFixed(2)}
          unit="—"
          color="slate"
        />
      </div>

      {/* ── Info Banner ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Absorption process:</b> CO₂ reacts with liquid solvent (typically amine) in a packed column.
          Higher L/G ratios improve capture but increase energy penalty. Temperature affects reaction kinetics and solvent capacity.
        </p>
      </div>

      {/* ── Configuration & Parameters ──────────────────────────────────────── */}
      <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm">
        <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none hover:bg-slate-50 rounded-2xl transition-colors list-none">
          <FiSettings size={12} style={{ color: meta.hue }} className="shrink-0" />
          <span className="text-[12px] font-semibold text-slate-600">Configuration &amp; Parameters</span>
          <svg className="ml-auto w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-4">
          <ParamSlider label="Target Capture Rate" unit="%" value={localParams.capture_rate_pct} min={meta.captureRange[0]} max={meta.captureRange[1]} step={1} onChange={(v) => updateParam("capture_rate_pct", v)} />
          <ParamSlider label="Specific Energy Requirement" unit="GJ/tCO₂" value={localParams.energy_requirement_gj_tco2} min={meta.energyRange[0]} max={meta.energyRange[1]} step={0.1} onChange={(v) => updateParam("energy_requirement_gj_tco2", v)} />
          <ParamSlider label="Solvent Flow Rate" unit="m³/h" value={localParams.solvent_flow_rate_m3_h} min={50} max={500} step={10} onChange={(v) => updateParam("solvent_flow_rate_m3_h", v)} />
          <ParamSlider label="Absorption Temperature" unit="°C" value={localParams.absorption_temp_c} min={20} max={60} step={2} onChange={(v) => updateParam("absorption_temp_c", v)} />
          <ParamSlider label="Liquid/Gas Ratio (L/G)" unit="—" value={localParams.l_g_ratio} min={2.0} max={6.0} step={0.1} onChange={(v) => updateParam("l_g_ratio", v)} />
        </div>
      </details>
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
    slate:    "border-slate-200 bg-slate-50",
  };
  const text = {
    electric: "text-electric-700",
    emerald:  "text-emerald-700",
    amber:    "text-amber-700",
    blue:     "text-blue-700",
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
