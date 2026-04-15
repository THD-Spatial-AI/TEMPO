/**
 * CCSCompressorPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CO₂ Compressor parameter panel for CCS simulation.
 * Configures target pressure, number of stages, isentropic efficiency, and intercooling.
 *
 * Props:
 *   selectedModel  {Object}  – active compressor tech from opentech-db / fallback
 *   savedParams    {Object}  – local parameter overrides
 *   stripperParams {Object}  – upstream stripper parameters (for flow matching)
 *   result         {Object}  – simulation result (optional)
 *   simState       {string}  – 'idle'|'queued'|'running'|'done'|'error'
 *   variants       {Array}   – variant list from fetchCCSVariants
 *   onParamsChange {Function}– called whenever local overrides change
 */

import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { FiBox, FiActivity, FiInfo, FiSettings, FiLayers } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Compressor type detection from model id / name
// ─────────────────────────────────────────────────────────────────────────────
function detectCompressorType(model) {
  if (!model) return "multistage_110";
  const key = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (/150|high/.test(key))                      return "multistage_150";
  if (/200|supercritical|super/.test(key))       return "supercritical_200";
  if (/isothermal|near/.test(key))               return "near_isothermal";
  if (/110|pipeline|standard/.test(key))         return "multistage_110";
  return "multistage_110";
}

// Per-compressor-type metadata
const COMPRESSOR_META = {
  multistage_110: {
    label:   "Multistage 110 bar (Pipeline)",
    hue:     "#f59e0b",
    bg:      "bg-amber-50",
    border:  "border-amber-200",
    tagline: "Pipeline transport · 110 bar · 90-110 kWh/tCO₂",
    pressureRange: [100, 120],
    workRange: [90, 110],
    stages: [4, 6],
  },
  multistage_150: {
    label:   "Multistage 150 bar (Injection)",
    hue:     "#d97706",
    bg:      "bg-amber-100",
    border:  "border-amber-300",
    tagline: "Geological storage · 150 bar · 110-130 kWh/tCO₂",
    pressureRange: [140, 160],
    workRange: [110, 130],
    stages: [5, 7],
  },
  supercritical_200: {
    label:   "Supercritical 200 bar",
    hue:     "#b45309",
    bg:      "bg-orange-50",
    border:  "border-orange-300",
    tagline: "Deep injection · 200 bar · 130-150 kWh/tCO₂",
    pressureRange: [180, 220],
    workRange: [130, 150],
    stages: [6, 7],
  },
  near_isothermal: {
    label:   "Near-Isothermal Compression",
    hue:     "#92400e",
    bg:      "bg-yellow-50",
    border:  "border-yellow-300",
    tagline: "Advanced cooling · Variable pressure · 70-90 kWh/tCO₂",
    pressureRange: [100, 180],
    workRange: [70, 90],
    stages: [3, 5],
  },
};

export default function CCSCompressorPanel({
  selectedModel,
  savedParams = {},
  stripperParams = {},
  result,
  simState,
  variants,
  onParamsChange,
}) {
  const compressorType = detectCompressorType(selectedModel);
  const meta = COMPRESSOR_META[compressorType] ?? COMPRESSOR_META.multistage_110;

  // Local editable overrides (merged with saved)
  const [localParams, setLocalParams] = useState(() => ({
    target_pressure_bar: savedParams.target_pressure_bar ?? selectedModel?.target_pressure_bar ?? 110,
    number_stages: savedParams.number_stages ?? selectedModel?.number_stages ?? 5,
    isentropic_efficiency_pct: savedParams.isentropic_efficiency_pct ?? selectedModel?.isentropic_efficiency_pct ?? 82,
    intercooling_temp_c: savedParams.intercooling_temp_c ?? selectedModel?.intercooling_temp_c ?? 40,
  }));

  // Update local params and propagate to parent
  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    onParamsChange?.(updated);
  };

  const [selectedChart, setSelectedChart] = useState("work");

  // Build compression work vs. pressure ratio curve (polytropic compression)
  const compressionCurve = useMemo(() => {
    const pressures = Array.from({ length: 121 }, (_, i) => 80 + i);
    const compressionWork = pressures.map((pressure) => {
      // Polytropic compression work calculation
      const P1 = 1.013; // Atmospheric pressure (bar)
      const pressureRatio = pressure / P1;
      const gamma = 1.3; // Polytropic exponent for CO₂
      const n = 1 / (localParams.isentropic_efficiency_pct / 100);
      
      // Specific work (kWh/tCO₂) = (n/(n-1)) * R * T * (PR^((n-1)/n) - 1)
      const baseWork = 8.314 * 313 * (Math.pow(pressureRatio, (gamma - 1) / gamma) - 1) / 3600 / 44;
      const efficiencyFactor = 1 / (localParams.isentropic_efficiency_pct / 100);
      return baseWork * efficiencyFactor * 1000 * localParams.number_stages / 5;
    });

    const outletTemp = pressures.map((pressure) => {
      const P1 = 1.013;
      const T1 = 313; // K (40°C inlet)
      const pressureRatio = pressure / P1;
      const gamma = 1.3;
      const stageRatio = Math.pow(pressureRatio, 1 / localParams.number_stages);
      
      // After each stage with intercooling
      const tempRisePerStage = T1 * (Math.pow(stageRatio, (gamma - 1) / gamma) - 1);
      return localParams.intercooling_temp_c + tempRisePerStage;
    });

    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: {
        data: ["Compression Work", "Outlet Temperature"],
        bottom: 0,
        textStyle: { fontSize: 9 }, icon: 'roundRect',
      },
      grid: { top: 24, bottom: 68, left: 48, right: 52 },
      xAxis: {
        type: "category",
        data: pressures,
        name: "Target Pressure (bar)",
        nameLocation: "middle",
        nameGap: 28,
        axisLabel: { fontSize: 9, rotate: 0 },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: "value",
          name: "kWh/tCO₂",
          nameTextStyle: { fontSize: 9 },
          axisLabel: { fontSize: 9 },
          min: 60,
          max: 160,
        },
        {
          type: "value",
          name: "Temp (°C)",
          nameTextStyle: { fontSize: 9 },
          axisLabel: { fontSize: 9 },
          min: 40,
          max: 120,
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Compression Work",
          type: "line",
          data: compressionWork,
          smooth: true,
          symbol: "none",
          color: meta.hue,
          lineStyle: { color: meta.hue, width: 2 },
          areaStyle: { color: `${meta.hue}33` },
          yAxisIndex: 0,
        },
        {
          name: "Outlet Temperature",
          type: "line",
          data: outletTemp,
          smooth: true,
          symbol: "none",
          color: "#ef4444",
          lineStyle: { color: "#ef4444", width: 2 },
          yAxisIndex: 1,
        },
      ],
    };
  }, [localParams, meta.hue]);

  // Pressure and outlet temperature at each compression stage
  const stagePressureChart = useMemo(() => {
    const n = Math.max(1, Math.round(localParams.number_stages));
    const stageRatio = Math.pow(localParams.target_pressure_bar / 1.013, 1 / n);
    const labels    = Array.from({ length: n + 1 }, (_, i) => i === 0 ? "Inlet" : `S${i}`);
    const pressures = Array.from({ length: n + 1 }, (_, i) => +(1.013 * Math.pow(stageRatio, i)).toFixed(1));
    const T1 = localParams.intercooling_temp_c + 273;
    const gamma = 1.3;
    const tempRise = T1 * (Math.pow(stageRatio, (gamma - 1) / gamma) - 1);
    const temps = Array.from({ length: n + 1 }, (_, i) =>
      i === 0 ? localParams.intercooling_temp_c : +(localParams.intercooling_temp_c + tempRise - 273).toFixed(1)
    );
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { data: ["Pressure", "Outlet Temp"], bottom: 0, textStyle: { fontSize: 9 }, icon: 'roundRect', type: 'scroll' },
      grid: { top: 24, bottom: 52, left: 48, right: 52 },
      xAxis: { type: "category", data: labels, axisLabel: { fontSize: 9 }, axisTick: { show: false } },
      yAxis: [
        { type: "value", name: "bar", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
        { type: "value", name: "°C",  nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 }, splitLine: { show: false } },
      ],
      series: [
        { name: "Pressure",    type: "bar",  data: pressures, itemStyle: { color: meta.hue, opacity: 0.8 }, yAxisIndex: 0 },
        { name: "Outlet Temp", type: "line", data: temps, symbol: "none", color: "#ef4444", lineStyle: { color: "#ef4444", width: 2 }, yAxisIndex: 1 },
      ],
    };
  }, [localParams.number_stages, localParams.target_pressure_bar, localParams.intercooling_temp_c, meta.hue]);

  // Specific work vs isentropic efficiency at current target pressure
  const efficiencyPowerChart = useMemo(() => {
    const effs = Array.from({ length: 26 }, (_, i) => 70 + i);
    const P1   = 1.013;
    const pressureRatio = localParams.target_pressure_bar / P1;
    const gamma = 1.3;
    const baseWork = 8.314 * 313 * (Math.pow(pressureRatio, (gamma - 1) / gamma) - 1) / 3600 / 44 * 1000;
    const works = effs.map(eff => +(baseWork * (100 / eff) * localParams.number_stages / 5).toFixed(0));
    return {
      animation: false,
      tooltip: { trigger: "axis", formatter: ([a]) => `η ${a.name}% → ${a.value} kWh/tCO₂` },
      grid: { top: 24, bottom: 44, left: 56, right: 16 },
      xAxis: { type: "category", data: effs.map(e => `${e}%`), name: "Isentropic Efficiency", nameLocation: "middle", nameGap: 28, axisLabel: { fontSize: 9, interval: 4 }, axisTick: { show: false } },
      yAxis: { type: "value", name: "kWh/tCO₂", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
      series: [{
        type: "line", data: works, smooth: true, symbol: "none",
        color: meta.hue,
        lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` },
        markLine: { symbol: ["none", "none"], data: [{ xAxis: `${localParams.isentropic_efficiency_pct}%` }], lineStyle: { color: "#6366f1", type: "dashed", width: 2 }, label: { formatter: "Current", fontSize: 9, position: "insideEndTop" } },
      }],
    };
  }, [localParams.target_pressure_bar, localParams.number_stages, localParams.isentropic_efficiency_pct, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header — Technology Identity ───────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <span className="p-2.5 rounded-xl text-white shadow" style={{ background: `linear-gradient(135deg, ${meta.hue}, ${meta.hue}bb)` }}>
              <FiBox size={18} />
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
            <MetricBadge label="Target Pressure" value={localParams.target_pressure_bar} unit="bar" color="amber" />
            <MetricBadge label="Stages" value={localParams.number_stages} unit="—" color="slate" />
            <MetricBadge label="Isentropic η" value={localParams.isentropic_efficiency_pct} unit="%" color="green" />
            <MetricBadge label="Intercooling T" value={localParams.intercooling_temp_c} unit="°C" color="blue" />
            <MetricBadge label="Comp. Ratio" value={(localParams.target_pressure_bar / 1.013).toFixed(1)} unit="—" color="violet" />
            <MetricBadge label="Stage Ratio" value={Math.pow(localParams.target_pressure_bar / 1.013, 1 / localParams.number_stages).toFixed(2)} unit="—" color="red" />
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
          if (v.target_pressure_bar != null)       patch.target_pressure_bar       = v.target_pressure_bar;
          if (v.number_stages != null)             patch.number_stages             = v.number_stages;
          if (v.isentropic_efficiency_pct != null) patch.isentropic_efficiency_pct = v.isentropic_efficiency_pct;
          if (v.intercooling_temp_c != null)       patch.intercooling_temp_c       = v.intercooling_temp_c;
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
            <option value="work">Compression Work vs Pressure</option>
            <option value="stages">Stage Pressure &amp; Temperature</option>
            <option value="power">Work vs Isentropic Efficiency</option>
          </select>
        </div>
        <ReactECharts
          key={selectedChart}
          option={selectedChart === "work" ? compressionCurve : selectedChart === "stages" ? stagePressureChart : efficiencyPowerChart}
          style={{ height: 320 }}
        />
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Specific Work"
          value={(() => {
            const P1 = 1.013;
            const pressureRatio = localParams.target_pressure_bar / P1;
            const gamma = 1.3;
            const baseWork = 8.314 * 313 * (Math.pow(pressureRatio, (gamma - 1) / gamma) - 1) / 3600 / 44;
            const efficiencyFactor = 1 / (localParams.isentropic_efficiency_pct / 100);
            return (baseWork * efficiencyFactor * 1000 * localParams.number_stages / 5).toFixed(0);
          })()}
          unit="kWh/tCO₂"
          color="amber"
        />
        <KpiCard
          label="Total Power"
          value={stripperParams.energy_input_gj_tco2 ? (
            (100 * parseFloat((() => {
              const P1 = 1.013;
              const pressureRatio = localParams.target_pressure_bar / P1;
              const gamma = 1.3;
              const baseWork = 8.314 * 313 * (Math.pow(pressureRatio, (gamma - 1) / gamma) - 1) / 3600 / 44;
              const efficiencyFactor = 1 / (localParams.isentropic_efficiency_pct / 100);
              return (baseWork * efficiencyFactor * 1000 * localParams.number_stages / 5);
            })()) / 1000).toFixed(0)
          ) : "—"}
          unit="MW"
          color="red"
        />
        <KpiCard
          label="Outlet Temperature"
          value={(() => {
            const P1 = 1.013;
            const T1 = 313;
            const pressureRatio = localParams.target_pressure_bar / P1;
            const gamma = 1.3;
            const stageRatio = Math.pow(pressureRatio, 1 / localParams.number_stages);
            const tempRisePerStage = T1 * (Math.pow(stageRatio, (gamma - 1) / gamma) - 1);
            return (localParams.intercooling_temp_c + tempRisePerStage - 273).toFixed(0);
          })()}
          unit="°C"
          color="slate"
        />
        <KpiCard
          label="Compression Ratio"
          value={(localParams.target_pressure_bar / 1.013).toFixed(1)}
          unit="—"
          color="emerald"
        />
      </div>

      {/* ── Info Banner ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Multi-stage compression with intercooling:</b> minimizes power consumption. Pipeline transport requires 110 bar,
          geological injection 150-200 bar. Higher efficiency reduces energy penalty but increases capital cost.
          Intercooling between stages approaches isothermal compression (minimum work).
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
          <ParamSlider label="Target Pressure" unit="bar" value={localParams.target_pressure_bar} min={80} max={200} step={5} onChange={(v) => updateParam("target_pressure_bar", v)} />
          <ParamSlider label="Number of Stages" unit="—" value={localParams.number_stages} min={3} max={7} step={1} onChange={(v) => updateParam("number_stages", v)} />
          <ParamSlider label="Isentropic Efficiency" unit="%" value={localParams.isentropic_efficiency_pct} min={75} max={90} step={1} onChange={(v) => updateParam("isentropic_efficiency_pct", v)} />
          <ParamSlider label="Intercooling Temperature" unit="°C" value={localParams.intercooling_temp_c} min={30} max={50} step={2} onChange={(v) => updateParam("intercooling_temp_c", v)} />
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
