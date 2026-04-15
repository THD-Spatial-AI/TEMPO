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
import { FiDroplet, FiActivity, FiInfo, FiSettings } from "react-icons/fi";

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
        textStyle: { fontSize: 11 },
      },
      grid: { top: 24, bottom: 48, left: 48, right: 52 },
      xAxis: {
        type: "category",
        data: loads,
        name: "Flue Gas Load (%)",
        nameLocation: "middle",
        nameGap: 25,
        axisLabel: { fontSize: 10 },
      },
      yAxis: [
        {
          type: "value",
          name: "Capture %",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10 },
          max: 100,
        },
        {
          type: "value",
          name: "GJ/tCO₂",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10 },
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
      legend: { data: ["Capture Rate", "Specific Energy"], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 24, bottom: 48, left: 48, right: 52 },
      xAxis: { type: "category", data: concs.map(c => `${c}%`), name: "Flue Gas CO₂ vol%", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10, interval: 2 } },
      yAxis: [
        { type: "value", name: "Capture %", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, min: 60, max: 100 },
        { type: "value", name: "GJ/tCO₂",  nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false }, min: 1.5, max: 5.0 },
      ],
      series: [
        { name: "Capture Rate",   type: "line", data: captureRates, smooth: true, symbol: "none", lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` }, yAxisIndex: 0 },
        { name: "Specific Energy", type: "line", data: energyReqs,  smooth: true, symbol: "none", lineStyle: { color: "#ef4444", width: 2 }, yAxisIndex: 1 },
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
      legend: { data: ["Capture Rate", "Column ΔP"], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 24, bottom: 48, left: 48, right: 52 },
      xAxis: { type: "category", data: ratios.map(r => `${r}`), name: "L/G Ratio (L/Nm³)", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10, interval: 2 } },
      yAxis: [
        { type: "value", name: "Capture %", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, min: 50, max: 100 },
        { type: "value", name: "ΔP (kPa)",  nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: "Capture Rate", type: "line", data: capture, smooth: true, symbol: "none", lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` }, yAxisIndex: 0 },
        { name: "Column ΔP",    type: "line", data: deltaP,  smooth: true, symbol: "none", lineStyle: { color: "#f59e0b", width: 2 }, yAxisIndex: 1 },
      ],
    };
  }, [localParams.capture_rate_pct, localParams.l_g_ratio, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-lg bg-white shadow-sm" style={{ color: meta.hue }}>
            <FiDroplet size={20} />
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
          <h5 className="font-semibold text-slate-700 text-sm">Absorption Configuration</h5>
        </div>

        <div className="space-y-4">
          <ParamSlider
            label="Target Capture Rate"
            unit="%"
            value={localParams.capture_rate_pct}
            min={meta.captureRange[0]}
            max={meta.captureRange[1]}
            step={1}
            onChange={(v) => updateParam("capture_rate_pct", v)}
          />
          <ParamSlider
            label="Specific Energy Requirement"
            unit="GJ/tCO₂"
            value={localParams.energy_requirement_gj_tco2}
            min={meta.energyRange[0]}
            max={meta.energyRange[1]}
            step={0.1}
            onChange={(v) => updateParam("energy_requirement_gj_tco2", v)}
          />
          <ParamSlider
            label="Solvent Flow Rate"
            unit="m³/h"
            value={localParams.solvent_flow_rate_m3_h}
            min={50}
            max={500}
            step={10}
            onChange={(v) => updateParam("solvent_flow_rate_m3_h", v)}
          />
          <ParamSlider
            label="Absorption Temperature"
            unit="°C"
            value={localParams.absorption_temp_c}
            min={20}
            max={60}
            step={2}
            onChange={(v) => updateParam("absorption_temp_c", v)}
          />
          <ParamSlider
            label="Liquid/Gas Ratio (L/G)"
            unit="—"
            value={localParams.l_g_ratio}
            min={2.0}
            max={6.0}
            step={0.1}
            onChange={(v) => updateParam("l_g_ratio", v)}
          />
        </div>
      </div>

      {/* ── Performance Analysis ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FiActivity size={14} className="text-violet-500" />
            <h5 className="font-semibold text-slate-700 text-sm">Performance Analysis</h5>
          </div>
          <select
            value={selectedChart}
            onChange={(e) => setSelectedChart(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 text-slate-600 focus:outline-none cursor-pointer"
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
      <div className="grid grid-cols-2 gap-3">
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
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Absorption process:</b> CO₂ reacts with liquid solvent (typically amine) in a packed column.
          Higher L/G ratios improve capture but increase energy penalty. Temperature affects reaction kinetics and solvent capacity.
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
    <div className={`rounded-xl border p-3 ${ring[color] ?? ring.slate}`}>
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${text[color] ?? text.slate}`}>
        {value ?? "—"}
        {value != null && <span className="text-sm font-medium ml-1">{unit}</span>}
      </p>
    </div>
  );
}
