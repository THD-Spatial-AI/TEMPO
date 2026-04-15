/**
 * CCSSourcePanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Flue Gas Source parameter panel for CCS simulation.
 * Configures power output, CO₂ concentration, and flue gas properties.
 *
 * Props:
 *   selectedModel  {Object}  – active source tech from opentech-db / fallback
 *   savedParams    {Object}  – local parameter overrides
 *   result         {Object}  – simulation result (optional)
 *   simState       {string}  – 'idle'|'queued'|'running'|'done'|'error'
 *   variants       {Array}   – variant list from fetchCCSVariants
 *   onParamsChange {Function}– called whenever local overrides change
 */

import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { FiZap, FiActivity, FiInfo, FiSettings } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Source type detection from model id / name
// ─────────────────────────────────────────────────────────────────────────────
function detectSourceType(model) {
  if (!model) return "gas";
  const key = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (/coal|pc|pulv/.test(key))          return "coal";
  if (/gas|ccgt|ocgt|lng|ngcc/.test(key)) return "gas";
  if (/cement/.test(key))                return "cement";
  if (/steel|blast|furnace/.test(key))   return "steel";
  if (/refinery|oil/.test(key))          return "refinery";
  if (/biomass|bio/.test(key))           return "biomass";
  if (/igcc/.test(key))                  return "igcc";
  return "gas";
}

// Per-source-type metadata
const SOURCE_META = {
  coal: {
    label:   "Coal Power Plant",
    hue:     "#374151",
    bg:      "bg-slate-50",
    border:  "border-slate-300",
    tagline: "High CO₂ concentration · 0.8-1.0 kg CO₂/kWh",
    co2Range: [0.85, 0.95],
    capacity: [500, 1000],
  },
  gas: {
    label:   "Natural Gas CCGT",
    hue:     "#f97316",
    bg:      "bg-orange-50",
    border:  "border-orange-200",
    tagline: "Medium CO₂ concentration · 0.35-0.45 kg CO₂/kWh",
    co2Range: [0.35, 0.45],
    capacity: [400, 800],
  },
  cement: {
    label:   "Cement Plant",
    hue:     "#78716c",
    bg:      "bg-stone-50",
    border:  "border-stone-300",
    tagline: "Process + combustion CO₂ · 0.7-0.9 kg CO₂/kWh",
    co2Range: [0.75, 0.85],
    capacity: [50, 200],
  },
  steel: {
    label:   "Steel Blast Furnace",
    hue:     "#dc2626",
    bg:      "bg-red-50",
    border:  "border-red-200",
    tagline: "Very high CO₂ from coke · 1.5-2.0 kg CO₂/kWh",
    co2Range: [1.6, 1.9],
    capacity: [100, 300],
  },
  refinery: {
    label:   "Oil Refinery",
    hue:     "#a16207",
    bg:      "bg-yellow-50",
    border:  "border-yellow-300",
    tagline: "Mixed process emissions · 0.4-0.5 kg CO₂/kWh",
    co2Range: [0.42, 0.48],
    capacity: [150, 400],
  },
  biomass: {
    label:   "Biomass Power (BECCS)",
    hue:     "#22c55e",
    bg:      "bg-green-50",
    border:  "border-green-200",
    tagline: "Carbon-negative potential · 0.02-0.08 kg CO₂/kWh",
    co2Range: [0.03, 0.06],
    capacity: [20, 100],
  },
  igcc: {
    label:   "IGCC Coal",
    hue:     "#6366f1",
    bg:      "bg-indigo-50",
    border:  "border-indigo-200",
    tagline: "Pre-combustion capture · 0.7-0.9 kg CO₂/kWh",
    co2Range: [0.75, 0.88],
    capacity: [400, 600],
  },
};

export default function CCSSourcePanel({
  selectedModel,
  savedParams = {},
  result,
  simState,
  variants,
  onParamsChange,
}) {
  const sourceType = detectSourceType(selectedModel);
  const meta = SOURCE_META[sourceType] ?? SOURCE_META.gas;

  // Local editable overrides (merged with saved)
  const [localParams, setLocalParams] = useState(() => ({
    capacity_kw: savedParams.capacity_kw ?? selectedModel?.capacity_kw ?? 400000,
    efficiency_pct: savedParams.efficiency_pct ?? selectedModel?.efficiency_pct ?? 58,
    co2_emission_kg_kwh: savedParams.co2_emission_kg_kwh ?? selectedModel?.co2_emission_kg_kwh ?? 0.38,
    flue_gas_temp_c: savedParams.flue_gas_temp_c ?? 120,
    co2_concentration_pct: savedParams.co2_concentration_pct ?? 12,
  }));

  // Update local params and propagate to parent
  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    onParamsChange?.(updated);
  };

  const [selectedChart, setSelectedChart] = useState("profile");

  // Build theoretical flue gas profile chart
  const profileChart = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const powerProfile = hours.map((h) => {
      // Typical baseload pattern with slight variation
      const base = localParams.capacity_kw *0.95;
      const variation = Math.sin(h * Math.PI / 12) * 0.05 * localParams.capacity_kw;
      return base + variation;
    });
    const flueGasCO2 = powerProfile.map(p => 
      (p * localParams.co2_emission_kg_kwh / 1000) // t CO₂/h
    );

    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["Power Output", "CO₂ Emissions"], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 24, bottom: 48, left: 48, right: 52 },
      xAxis: { type: "category", data: hours.map(h => `${h}:00`), axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: [
        { type: "value", name: "MW", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10, formatter: v => (v/1000).toFixed(0) } },
        { type: "value", name: "t CO₂/h", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        {
          name: "Power Output",
          type: "line",
          data: powerProfile,
          smooth: true,
          symbol: "none",
          lineStyle: { color: meta.hue, width: 2 },
          areaStyle: { color: `${meta.hue}33` },
          yAxisIndex: 0,
        },
        {
          name: "CO₂ Emissions",
          type: "line",
          data: flueGasCO2,
          smooth: true,
          symbol: "none",
          lineStyle: { color: "#ef4444", width: 2 },
          areaStyle: { color: "#ef444433" },
          yAxisIndex: 1,
        },
      ],
    };
  }, [localParams, meta.hue]);

  // CO₂ output vs plant load ramp
  const co2OutputChart = useMemo(() => {
    const pcts = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);
    const co2s = pcts.map(p => +(localParams.capacity_kw * p / 100 / 1000 * localParams.co2_emission_kg_kwh).toFixed(2));
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      grid: { top: 24, bottom: 44, left: 54, right: 16 },
      xAxis: { type: "category", data: pcts.map(p => `${p}%`), name: "Plant Load", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: "t CO₂/h", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      series: [{ type: "line", data: co2s, smooth: false, symbol: "circle", symbolSize: 4, lineStyle: { color: "#ef4444", width: 2 }, areaStyle: { color: "#ef444428" } }],
    };
  }, [localParams.capacity_kw, localParams.co2_emission_kg_kwh]);

  // Fuel type emission factor benchmark (horizontal bar)
  const benchmarkChart = useMemo(() => {
    const items = [
      { name: "Biomass BECCS", v: 0.04, c: "#22c55e" },
      { name: "Gas CCGT",      v: 0.38, c: "#f97316" },
      { name: "Oil Refinery",  v: 0.44, c: "#a16207" },
      { name: "Cement",        v: 0.82, c: "#78716c" },
      { name: "Coal PC",       v: 0.92, c: "#374151" },
      { name: "Steel BF",      v: 1.70, c: "#dc2626" },
    ];
    const cur = localParams.co2_emission_kg_kwh;
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      grid: { top: 16, bottom: 32, left: 92, right: 72 },
      xAxis: { type: "value", max: 2.0, axisLabel: { fontSize: 10 }, name: "kg CO₂/kWh", nameLocation: "middle", nameGap: 26 },
      yAxis: { type: "category", data: items.map(i => i.name), axisLabel: { fontSize: 10 } },
      series: [{
        type: "bar",
        data: items.map(i => ({ value: i.v, itemStyle: { color: i.c, opacity: Math.abs(i.v - cur) < 0.1 ? 1 : 0.45 } })),
        label: { show: true, position: "right", fontSize: 9, formatter: p => `${p.value.toFixed(2)}` },
        markLine: { symbol: ["none", "none"], data: [{ xAxis: cur }], lineStyle: { color: meta.hue, width: 2, type: "dashed" }, label: { formatter: `${cur.toFixed(2)} kg/kWh`, fontSize: 9 } },
      }],
    };
  }, [localParams.co2_emission_kg_kwh, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-lg bg-white shadow-sm" style={{ color: meta.hue }}>
            <FiZap size={20} />
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
          <h5 className="font-semibold text-slate-700 text-sm">Configuration</h5>
        </div>

        <div className="space-y-4">
          <ParamSlider
            label="Plant Capacity"
            unit="MW"
            value={localParams.capacity_kw / 1000}
            min={meta.capacity[0]}
            max={meta.capacity[1]}
            step={10}
            onChange={(v) => updateParam("capacity_kw", v * 1000)}
          />
          <ParamSlider
            label="Thermal Efficiency"
            unit="%"
            value={localParams.efficiency_pct}
            min={30}
            max={65}
            step={1}
            onChange={(v) => updateParam("efficiency_pct", v)}
          />
          <ParamSlider
            label="CO₂ Emission Factor"
            unit="kg/kWh"
            value={localParams.co2_emission_kg_kwh}
            min={meta.co2Range[0]}
            max={meta.co2Range[1]}
            step={0.01}
            onChange={(v) => updateParam("co2_emission_kg_kwh", v)}
          />
          <ParamSlider
            label="Flue Gas Temperature"
            unit="°C"
            value={localParams.flue_gas_temp_c}
            min={80}
            max={180}
            step={5}
            onChange={(v) => updateParam("flue_gas_temp_c", v)}
          />
          <ParamSlider
            label="CO₂ Concentration"
            unit="%"
            value={localParams.co2_concentration_pct}
            min={3}
            max={25}
            step={0.5}
            onChange={(v) => updateParam("co2_concentration_pct", v)}
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
            <option value="profile">24-Hour Operation Profile</option>
            <option value="co2">CO₂ Output vs Plant Load</option>
            <option value="benchmark">Fuel Type Benchmark</option>
          </select>
        </div>
        <ReactECharts
          key={selectedChart}
          option={selectedChart === "profile" ? profileChart : selectedChart === "co2" ? co2OutputChart : benchmarkChart}
          style={{ height: 320 }}
        />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Thermal Input"
          value={(localParams.capacity_kw / (localParams.efficiency_pct / 100) / 1000).toFixed(0)}
          unit="MW"
          color="amber"
        />
        <KpiCard
          label="Max CO₂ Rate"
          value={(localParams.capacity_kw * localParams.co2_emission_kg_kwh / 1000).toFixed(1)}
          unit="t/h"
          color="red"
        />
        <KpiCard
          label="Annual CO₂"
          value={(localParams.capacity_kw * localParams.co2_emission_kg_kwh * 8760 * 0.85 / 1e6).toFixed(2)}
          unit="Mt/yr"
          color="slate"
        />
        <KpiCard
          label="CF (assumed)"
          value="85"
          unit="%"
          color="emerald"
        />
      </div>

      {/* ── Info Banner ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Flue gas properties:</b> Temperature and CO₂ concentration affect absorber performance.
          Higher concentrations reduce solvent circulation. Typical values: Coal (12-15%), Gas (3-4%), Cement (20-25%).
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
    red:      "border-red-200 bg-red-50",
    slate:    "border-slate-200 bg-slate-50",
  };
  const text = {
    electric: "text-electric-700",
    emerald:  "text-emerald-700",
    amber:    "text-amber-700",
    red:      "text-red-700",
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
