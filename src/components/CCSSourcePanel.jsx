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
import { FiZap, FiActivity, FiInfo, FiSettings, FiLayers } from "react-icons/fi";

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
      legend: { data: ["Power Output", "CO₂ Emissions"], bottom: 0, textStyle: { fontSize: 9 }, icon: 'roundRect', type: 'scroll' },
      grid: { top: 24, bottom: 52, left: 48, right: 52 },
      xAxis: { type: "category", data: hours.map(h => `${h}:00`), axisLabel: { fontSize: 9, rotate: 45, interval: 1 }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "MW", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9, formatter: v => (v/1000).toFixed(0) } },
        { type: "value", name: "t CO₂/h", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, splitLine: { show: false } },
      ],
      series: [
        {
          name: "Power Output",
          type: "line",
          data: powerProfile,
          smooth: true,
          symbol: "none",
          color: meta.hue,
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
          color: "#ef4444",
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
      grid: { top: 24, bottom: 48, left: 54, right: 16 },
      xAxis: { type: "category", data: pcts.map(p => `${p}%`), name: "Plant Load", nameLocation: "middle", nameGap: 30, axisLabel: { fontSize: 9, interval: 1 }, axisTick: { show: false } },
      yAxis: { type: "value", name: "t CO₂/h", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
      series: [{ type: "line", data: co2s, smooth: false, symbol: "none", color: "#ef4444", lineStyle: { color: "#ef4444", width: 2 }, areaStyle: { color: "#ef444428" } }],
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
      xAxis: { type: "value", max: 2.0, axisLabel: { fontSize: 9 }, name: "kg CO₂/kWh", nameLocation: "middle", nameGap: 26, axisTick: { show: false } },
      yAxis: { type: "category", data: items.map(i => i.name), axisLabel: { fontSize: 9 } },
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
      {/* ── Header — Technology Identity ───────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <span className="p-2.5 rounded-xl text-white shadow" style={{ background: `linear-gradient(135deg, ${meta.hue}, ${meta.hue}bb)` }}>
              <FiZap size={18} />
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
            <MetricBadge label="Plant Capacity" value={`${(localParams.capacity_kw / 1000).toFixed(0)}`} unit="MW" color="amber" />
            <MetricBadge label="CO₂ Factor" value={localParams.co2_emission_kg_kwh.toFixed(2)} unit="kg/kWh" color="red" />
            <MetricBadge label="Efficiency" value={localParams.efficiency_pct} unit="%" color="green" />
            <MetricBadge label="Flue Gas Temp" value={localParams.flue_gas_temp_c} unit="°C" color="slate" />
            <MetricBadge label="CO₂ Conc." value={localParams.co2_concentration_pct} unit="%" color="blue" />
            <MetricBadge label="Annual CO₂" value={(localParams.capacity_kw * localParams.co2_emission_kg_kwh * 8760 * 0.85 / 1e6).toFixed(1)} unit="Mt/yr" color="violet" />
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
          if (v.capacity_kw != null)          patch.capacity_kw          = v.capacity_kw;
          if (v.efficiency_pct != null)        patch.efficiency_pct        = v.efficiency_pct;
          if (v.co2_emission_kg_kwh != null)   patch.co2_emission_kg_kwh   = v.co2_emission_kg_kwh;
          if (v.flue_gas_temp_c != null)       patch.flue_gas_temp_c       = v.flue_gas_temp_c;
          if (v.co2_concentration_pct != null) patch.co2_concentration_pct = v.co2_concentration_pct;
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Flue gas properties:</b> Temperature and CO₂ concentration affect absorber performance.
          Higher concentrations reduce solvent circulation. Typical values: Coal (12-15%), Gas (3-4%), Cement (20-25%).
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
          <ParamSlider label="Plant Capacity" unit="MW" value={localParams.capacity_kw / 1000} min={meta.capacity[0]} max={meta.capacity[1]} step={10} onChange={(v) => updateParam("capacity_kw", v * 1000)} />
          <ParamSlider label="Thermal Efficiency" unit="%" value={localParams.efficiency_pct} min={30} max={65} step={1} onChange={(v) => updateParam("efficiency_pct", v)} />
          <ParamSlider label="CO₂ Emission Factor" unit="kg/kWh" value={localParams.co2_emission_kg_kwh} min={meta.co2Range[0]} max={meta.co2Range[1]} step={0.01} onChange={(v) => updateParam("co2_emission_kg_kwh", v)} />
          <ParamSlider label="Flue Gas Temperature" unit="°C" value={localParams.flue_gas_temp_c} min={80} max={180} step={5} onChange={(v) => updateParam("flue_gas_temp_c", v)} />
          <ParamSlider label="CO₂ Concentration" unit="%" value={localParams.co2_concentration_pct} min={3} max={25} step={0.5} onChange={(v) => updateParam("co2_concentration_pct", v)} />
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
    <div className={`rounded-xl border px-4 py-3 ${ring[color] ?? ring.slate}`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-lg font-bold leading-tight ${text[color] ?? text.slate}`}>
        {value ?? "—"}
        {value != null && <span className="text-sm font-medium ml-1">{unit}</span>}
      </p>
    </div>
  );
}
