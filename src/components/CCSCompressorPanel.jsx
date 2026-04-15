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
import { FiBox, FiActivity, FiInfo, FiSettings } from "react-icons/fi";

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
        textStyle: { fontSize: 11 },
      },
      grid: { top: 24, bottom: 48, left: 48, right: 52 },
      xAxis: {
        type: "category",
        data: pressures,
        name: "Target Pressure (bar)",
        nameLocation: "middle",
        nameGap: 25,
        axisLabel: { fontSize: 10, rotate: 0 },
      },
      yAxis: [
        {
          type: "value",
          name: "kWh/tCO₂",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10 },
          min: 60,
          max: 160,
        },
        {
          type: "value",
          name: "Temp (°C)",
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10 },
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
      legend: { data: ["Pressure", "Outlet Temp"], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 24, bottom: 48, left: 56, right: 52 },
      xAxis: { type: "category", data: labels, axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: "value", name: "bar", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
        { type: "value", name: "°C",  nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: "Pressure",    type: "bar",  data: pressures, itemStyle: { color: meta.hue, opacity: 0.8 }, yAxisIndex: 0 },
        { name: "Outlet Temp", type: "line", data: temps, symbol: "circle", symbolSize: 6, lineStyle: { color: "#ef4444", width: 2 }, yAxisIndex: 1 },
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
      xAxis: { type: "category", data: effs.map(e => `${e}%`), name: "Isentropic Efficiency", nameLocation: "middle", nameGap: 26, axisLabel: { fontSize: 10, interval: 4 } },
      yAxis: { type: "value", name: "kWh/tCO₂", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      series: [{
        type: "line", data: works, smooth: true, symbol: "none",
        lineStyle: { color: meta.hue, width: 2 }, areaStyle: { color: `${meta.hue}22` },
        markLine: { symbol: ["none", "none"], data: [{ xAxis: `${localParams.isentropic_efficiency_pct}%` }], lineStyle: { color: "#6366f1", type: "dashed", width: 2 }, label: { formatter: "Current", fontSize: 9, position: "insideEndTop" } },
      }],
    };
  }, [localParams.target_pressure_bar, localParams.number_stages, localParams.isentropic_efficiency_pct, meta.hue]);

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-4 ${meta.border} ${meta.bg}`}>
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-lg bg-white shadow-sm" style={{ color: meta.hue }}>
            <FiBox size={20} />
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
          <h5 className="font-semibold text-slate-700 text-sm">Compression Configuration</h5>
        </div>

        <div className="space-y-4">
          <ParamSlider
            label="Target Pressure"
            unit="bar"
            value={localParams.target_pressure_bar}
            min={80}
            max={200}
            step={5}
            onChange={(v) => updateParam("target_pressure_bar", v)}
          />
          <ParamSlider
            label="Number of Stages"
            unit="—"
            value={localParams.number_stages}
            min={3}
            max={7}
            step={1}
            onChange={(v) => updateParam("number_stages", v)}
          />
          <ParamSlider
            label="Isentropic Efficiency"
            unit="%"
            value={localParams.isentropic_efficiency_pct}
            min={75}
            max={90}
            step={1}
            onChange={(v) => updateParam("isentropic_efficiency_pct", v)}
          />
          <ParamSlider
            label="Intercooling Temperature"
            unit="°C"
            value={localParams.intercooling_temp_c}
            min={30}
            max={50}
            step={2}
            onChange={(v) => updateParam("intercooling_temp_c", v)}
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
      <div className="grid grid-cols-2 gap-3">
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
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
        <FiInfo className="shrink-0 mt-0.5" size={14} />
        <p>
          <b>Multi-stage compression with intercooling:</b> minimizes power consumption. Pipeline transport requires 110 bar,
          geological injection 150-200 bar. Higher efficiency reduces energy penalty but increases capital cost.
          Intercooling between stages approaches isothermal compression (minimum work).
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
