/**
 * H2GeneratorPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Always-visible generator analysis panel for the H₂ Digital Twin.
 * Shows tech-specific generation profiles, energy-conversion chain, and
 * (after simulation) actual power time series with H₂ yield overlay.
 *
 * Works with every electricity-generating technology:
 *   Solar PV · Wind (on/offshore) · CCGT · Coal · Nuclear · Biomass · Hydro · Geothermal
 *
 * Props:
 *   selectedModel  {Object}  – active source tech from opentech-db / fallback
 *   elzModel       {Object}  – active electrolyzer tech (for conversion chain)
 *   elzParams      {Object}  – { grid_power_kw, water_flow_rate_lpm, temperature_c }
 *   result         {Object}  – simulation result (optional – overlaid when present)
 *   simState       {string}  – 'idle'|'queued'|'running'|'done'|'error'
 */

import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  FiSun, FiWind, FiZap, FiDroplet, FiActivity,
  FiBarChart2, FiTrendingUp, FiInfo, FiClock,
} from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Tech-type detection from model id / name (works for both API & fallback)
// ─────────────────────────────────────────────────────────────────────────────
function detectTechType(model) {
  if (!model) return "generic";
  const key = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  if (/solar|pv|photovoltaic/.test(key))                   return "solar";
  if (/wind/.test(key))                                    return "wind";
  if (/nuclear|pwr|bwr|smr/.test(key))                     return "nuclear";
  if (/hydro|water|river|dam/.test(key))                   return "hydro";
  if (/geotherm/.test(key))                                return "geothermal";
  if (/biomass|biogas|bio/.test(key))                      return "biomass";
  if (/coal|lignite/.test(key))                            return "coal";
  if (/gas|ccgt|ocgt|lng|methane/.test(key))               return "gas";
  return "generic";
}

// Per-tech metadata: colour scheme, icon, CO₂, capacity-factor range, tagline
const TECH_META = {
  solar:      { label: "Solar PV",       icon: FiSun,      hue: "#f59e0b", bg: "bg-amber-50",   border: "border-amber-200",  cf: [15, 28],  co2: 30,   tagline: "Daylight-driven variable generation" },
  wind:       { label: "Wind",           icon: FiWind,     hue: "#60a5fa", bg: "bg-blue-50",    border: "border-blue-200",   cf: [28, 50],  co2: 11,   tagline: "Variable — follows weather patterns" },
  nuclear:    { label: "Nuclear",        icon: FiZap,      hue: "#8b5cf6", bg: "bg-violet-50",  border: "border-violet-200", cf: [85, 95],  co2: 15,   tagline: "Firm baseload — very high availability" },
  hydro:      { label: "Hydropower",     icon: FiDroplet,  hue: "#06b6d4", bg: "bg-cyan-50",    border: "border-cyan-200",   cf: [40, 55],  co2: 8,    tagline: "Dispatchable — daily peaking profile" },
  geothermal: { label: "Geothermal",     icon: FiActivity, hue: "#dc2626", bg: "bg-red-50",     border: "border-red-200",    cf: [80, 95],  co2: 35,   tagline: "Near-constant baseload resource" },
  biomass:    { label: "Biomass CHP",    icon: FiZap,      hue: "#22c55e", bg: "bg-green-50",   border: "border-green-200",  cf: [60, 80],  co2: 120,  tagline: "Dispatchable — follows heat/power demand" },
  coal:       { label: "Coal",           icon: FiZap,      hue: "#374151", bg: "bg-slate-50",   border: "border-slate-300",  cf: [50, 80],  co2: 900,  tagline: "High-capacity baseload — high CO₂" },
  gas:        { label: "Natural Gas",    icon: FiZap,      hue: "#f97316", bg: "bg-orange-50",  border: "border-orange-200", cf: [40, 70],  co2: 430,  tagline: "Flexible mid-merit dispatchable" },
  generic:    { label: "Power Source",   icon: FiZap,      hue: "#6366f1", bg: "bg-indigo-50",  border: "border-indigo-200", cf: [40, 70],  co2: null, tagline: "Selected generation technology" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Theoretical 24-hour generation profile (4 samples/h = 96 points)
// ─────────────────────────────────────────────────────────────────────────────
function theoreticalProfile(techType, capacityKw) {
  const n = 96;
  const pts = Array.from({ length: n }, (_, i) => i / 4); // 0 … 23.75 h

  function toLabel(h) {
    const hh = Math.floor(h);
    const mm = h % 1 === 0 ? "00" : "30";
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }

  let fracs;
  switch (techType) {
    case "solar": {
      // Bell curve centred 12:30, σ ≈ 2.4 h — clipped to daytime window 05–19 h
      fracs = pts.map((h) => {
        const x = h - 12.5;
        const raw = Math.exp(-0.5 * (x / 2.4) ** 2);
        return h < 5.5 || h > 19.5 ? 0 : raw;
      });
      break;
    }
    case "wind": {
      // Pseudo-stochastic using three harmonics — capacity factor ~38%
      fracs = pts.map((h) =>
        Math.min(1, Math.max(0,
          0.38
          + 0.18 * Math.sin(h * 0.65 + 1.2)
          + 0.12 * Math.sin(h * 1.7  + 0.5)
          + 0.07 * Math.sin(h * 3.1  + 2.0)
        ))
      );
      break;
    }
    case "nuclear":
    case "geothermal": {
      // Near-flat ~90% with tiny ripple
      fracs = pts.map((h) => 0.90 + 0.015 * Math.sin((h / 24) * 2 * Math.PI));
      break;
    }
    case "coal":
    case "biomass": {
      // Two-shift pattern — lower overnight
      fracs = pts.map((h) => {
        const base = h >= 7 && h < 22 ? 0.82 : 0.55;
        return base + 0.03 * Math.sin(h * 0.9);
      });
      break;
    }
    case "gas": {
      // Mid-merit: ramps up midday peaking, lower at night
      fracs = pts.map((h) =>
        Math.min(1, Math.max(0.15,
          0.45
          + 0.25 * Math.sin(((h - 6) / 24) * 2 * Math.PI)
          + 0.08 * Math.sin(h * 2.1)
        ))
      );
      break;
    }
    case "hydro": {
      // Two peaks: morning (08h) and evening (19h)
      fracs = pts.map((h) => {
        const morn = 0.55 * Math.exp(-0.5 * ((h - 8) / 2.2) ** 2);
        const eve  = 0.65 * Math.exp(-0.5 * ((h - 19) / 2.5) ** 2);
        return Math.min(1, Math.max(0.15, morn + eve + 0.18));
      });
      break;
    }
    default: {
      fracs = pts.map(() => 0.75);
    }
  }

  return {
    labels:  pts.filter((_, i) => i % 2 === 0).map(toLabel), // 30-min display labels
    fracs:   fracs.filter((_, i) => i % 2 === 0),            // downsample to 48pts for display
    fullKw:  fracs.filter((_, i) => i % 2 === 0).map((f) => Math.round(f * capacityKw)),
    avgCF:   fracs.reduce((s, f) => s + f, 0) / fracs.length,
    peakKw:  Math.max(...fracs) * capacityKw,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Energy cascade chart — shows how power becomes H₂
// Input P → source losses → ELZ AC input → ELZ losses → H₂ chemical energy
// ─────────────────────────────────────────────────────────────────────────────
function buildCascadeChart(model, elzModel, gridPowerKw, hue) {
  const genEff   = (model?.efficiency_pct ?? 100) / 100;    // generator thermal eff (1 for RE)
  const elzEff   = (elzModel?.efficiency_pct ?? 70)  / 100;
  const H2_ENTH  = 3.54; // kWh/Nm³ HHV

  const pIn      = gridPowerKw;
  const pGenLoss = pIn * (1 - genEff);
  const pToElz   = pIn - pGenLoss;                     // electrical power sent to ELZ
  const pElzLoss = pToElz * (1 - elzEff);
  const pH2      = pToElz * elzEff;                    // chemical power stored in H₂
  const h2nm3h   = (pH2 / H2_ENTH).toFixed(1);

  const techType = detectTechType(model);
  const isRenewable = ["solar", "wind", "hydro", "geothermal"].includes(techType);

  // Waterfall steps
  const steps = [];
  if (!isRenewable && genEff < 0.99) {
    steps.push({ stage: "Fuel Input (thermal)", kw: pIn, lost: null, color: "#94a3b8" });
    steps.push({ stage: "Heat Losses (gen η)", kw: pToElz, lost: pGenLoss, color: "#f87171" });
  }
  steps.push({ stage: "Grid Power (AC)", kw: pToElz, lost: null, color: hue });
  steps.push({ stage: "ELZ Losses", kw: pH2, lost: pElzLoss, color: "#fbbf24" });
  steps.push({ stage: "H₂ Chemical Energy", kw: pH2, lost: null, color: "#10b981" });

  const labels = steps.map((s) => s.stage);
  const values = steps.map((s) => +s.kw.toFixed(1));
  const losses = steps.map((s) => (s.lost != null ? +s.lost.toFixed(1) : null));

  return {
    chart: {
      animation: true,
      animationDuration: 600,
      tooltip: {
        trigger: "axis",
        formatter: (params) =>
          params.map((p) =>
            `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${p.color};margin-right:4px;"></span>`
            + `${p.seriesName}: <b>${Number(p.value ?? 0).toFixed(1)} kW</b>`
          ).join("<br/>"),
      },
      legend: { data: ["Power Available (kW)", "Losses (kW)"], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 16, bottom: 44, left: 60, right: 20 },
      xAxis: { type: "category", data: labels, axisLabel: { fontSize: 10, interval: 0, rotate: 18 } },
      yAxis: { type: "value", name: "kW", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      series: [
        {
          name: "Power Available (kW)",
          type: "bar",
          data: values,
          barWidth: "40%",
          itemStyle: {
            color: (p) => steps[p.dataIndex]?.color ?? hue,
            borderRadius: [4, 4, 0, 0],
          },
          label: { show: true, position: "top", fontSize: 10, formatter: (p) => `${p.value}` },
        },
        {
          name: "Losses (kW)",
          type: "bar",
          data: losses,
          stack: false,
          barWidth: "40%",
          itemStyle: { color: "rgba(239,68,68,0.35)", borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: "top", fontSize: 10, color: "#ef4444",
            formatter: (p) => (p.value ? `-${p.value}` : ""),
          },
        },
      ],
    },
    summary: { pIn, pToElz, pH2, h2nm3h, genEff, elzEff },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile ECharts option
// ─────────────────────────────────────────────────────────────────────────────
function buildProfileChart(profile, setPointKw, hue, techType) {
  const gradFill = techType === "solar"
    ? "rgba(245,158,11,0.18)"
    : techType === "wind"
      ? "rgba(96,165,250,0.18)"
      : "rgba(99,102,241,0.15)";

  return {
    animation: true,
    animationDuration: 800,
    tooltip: {
      trigger: "axis",
      formatter: (params) =>
        `<b>${params[0]?.axisValue}</b><br/>` +
        params.map((p) =>
          `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${p.color};margin-right:4px;"></span>`
          + `${p.seriesName}: <b>${Number(p.value ?? 0).toLocaleString()} kW</b>`
        ).join("<br/>"),
    },
    legend: { data: ["Generated Power (kW)", "Set-point (kW)"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 16, bottom: 44, left: 60, right: 20 },
    xAxis: { type: "category", data: profile.labels, axisLabel: { fontSize: 10, interval: 7 }, boundaryGap: false },
    yAxis: {
      type: "value", name: "kW", min: 0,
      nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10, formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v },
    },
    series: [
      {
        name: "Generated Power (kW)",
        type: "line",
        data: profile.fullKw,
        smooth: true,
        symbol: "none",
        lineStyle: { color: hue, width: 2.5 },
        areaStyle: { color: gradFill },
      },
      {
        name: "Set-point (kW)",
        type: "line",
        data: profile.labels.map(() => setPointKw),
        symbol: "none",
        lineStyle: { color: "#64748b", width: 1.5, type: "dashed" },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation overlay: actual power + H₂ production rate
// ─────────────────────────────────────────────────────────────────────────────
function buildActualOutputChart(result, hue, sourceName) {
  const t    = (result?.time_s ?? []).map((s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m} min`;
  });
  const elzP = result?.electrolyzer_power_kw ?? [];
  const h2P  = result?.h2_production_nm3h   ?? [];
  const eff  = elzP.map((p, i) => {
    const H2_ENTH = 3.54;
    if (!p) return null;
    const h2kw = h2P[i] * H2_ENTH;
    return +(( h2kw / p) * 100).toFixed(1);
  });

  return {
    animation: true,
    animationDuration: 600,
    tooltip: {
      trigger: "axis",
      formatter: (params) =>
        `<b>${params[0]?.axisValue}</b><br/>` +
        params.map((p) =>
          `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${p.color};margin-right:4px;"></span>`
          + `${p.seriesName}: <b>${Number(p.value ?? 0).toFixed(2)}</b>`
        ).join("<br/>"),
    },
    legend: {
      data: [`${sourceName ?? "Source"} → ELZ Input (kW)`, "H₂ Production (Nm³/h)", "ELZ→H₂ Efficiency (%)"],
      bottom: 0, textStyle: { fontSize: 11 },
    },
    grid: { top: 16, bottom: 52, left: 58, right: 58 },
    xAxis: { type: "category", data: t, axisLabel: { fontSize: 10, rotate: t.length > 30 ? 25 : 0 }, boundaryGap: false },
    yAxis: [
      { type: "value", name: "kW",    nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      { type: "value", name: "Nm³/h", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      { type: "value", name: "%", min: 0, max: 100, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10, formatter: "{value}%" }, splitLine: { show: false } },
    ],
    series: [
      {
        name: `${sourceName ?? "Source"} → ELZ Input (kW)`,
        type: "line",
        data: elzP,
        smooth: true, symbol: "none",
        lineStyle: { color: hue, width: 2.5 },
        areaStyle: { color: hue.replace(")", ",0.12)").replace("rgb", "rgba") },
        yAxisIndex: 0,
      },
      {
        name: "H₂ Production (Nm³/h)",
        type: "line",
        data: h2P,
        smooth: true, symbol: "circle", symbolSize: 4,
        lineStyle: { color: "#10b981", width: 2 },
        areaStyle: { color: "rgba(16,185,129,0.10)" },
        yAxisIndex: 1,
      },
      {
        name: "ELZ→H₂ Efficiency (%)",
        type: "line",
        data: eff,
        smooth: true, symbol: "none",
        lineStyle: { color: "#6366f1", width: 1.5, type: "dashed" },
        yAxisIndex: 2,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small metric badge
// ─────────────────────────────────────────────────────────────────────────────
function MetricBadge({ label, value, unit, color = "slate", wide = false }) {
  const palettes = {
    amber:  "bg-amber-50  border-amber-200  text-amber-700",
    green:  "bg-emerald-50 border-emerald-200 text-emerald-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    blue:   "bg-blue-50   border-blue-200   text-blue-700",
    slate:  "bg-slate-50  border-slate-200  text-slate-700",
    red:    "bg-red-50    border-red-200    text-red-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${palettes[color] ?? palettes.slate} ${wide ? "col-span-2" : ""}`}>
      <p className="text-[10px] text-slate-500 font-medium leading-none mb-1">{label}</p>
      <p className="text-sm font-bold leading-none">
        {value ?? "—"}
        {value != null && unit && <span className="text-xs font-normal ml-1 text-slate-500">{unit}</span>}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function H2GeneratorPanel({ selectedModel, elzModel, elzParams, result, simState }) {
  const techType  = detectTechType(selectedModel);
  const meta      = TECH_META[techType] ?? TECH_META.generic;
  const Icon      = meta.icon;
  const hue       = meta.hue;
  const capacityKw = selectedModel?.capacity_kw ?? (elzParams?.grid_power_kw ?? 500) * 3;
  const setPointKw = elzParams?.grid_power_kw ?? 500;
  const isDone    = simState === "done";

  const profile = useMemo(
    () => theoreticalProfile(techType, capacityKw),
    [techType, capacityKw]
  );

  const cascade = useMemo(
    () => buildCascadeChart(selectedModel, elzModel, setPointKw, hue),
    [selectedModel, elzModel, setPointKw, hue]
  );

  const profileChart  = useMemo(
    () => buildProfileChart(profile, setPointKw, hue, techType),
    [profile, setPointKw, hue, techType]
  );

  const actualChart   = useMemo(
    () => isDone && result ? buildActualOutputChart(result, hue, selectedModel?.name) : null,
    [isDone, result, hue, selectedModel]
  );

  if (!selectedModel) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center gap-3">
        <span className="p-4 rounded-full bg-amber-50 border border-amber-100 text-amber-400">
          <FiZap size={24} />
        </span>
        <p className="font-medium text-slate-600">Select a power source technology in the flow diagram above</p>
        <p className="text-sm text-slate-400">The generator analysis panel will appear once a model is chosen.</p>
      </div>
    );
  }

  const cfMin = meta.cf[0];
  const cfMax = meta.cf[1];
  const avgCFpct = (profile.avgCF * 100).toFixed(0);

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border ${meta.border} ${meta.bg} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="p-3 rounded-xl text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${hue}, ${hue}cc)` }}
            >
              <Icon size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">{selectedModel.name}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                  ${selectedModel.lifecycle === "commercial"    ? "bg-emerald-100 text-emerald-700"
                  : selectedModel.lifecycle === "demonstration" ? "bg-amber-100   text-amber-700"
                                                                : "bg-blue-100    text-blue-700"}`}>
                  {selectedModel.lifecycle ?? "commercial"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{meta.tagline}</p>
              {selectedModel.description && (
                <p className="text-[11px] text-slate-400 mt-0.5 italic">{selectedModel.description}</p>
              )}
            </div>
          </div>

          {/* Quick KPIs row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 flex-1 min-w-0">
            {selectedModel.capacity_kw != null && (
              <MetricBadge label="Rated Capacity" value={selectedModel.capacity_kw >= 1000 ? (selectedModel.capacity_kw / 1000).toFixed(1) : selectedModel.capacity_kw} unit={selectedModel.capacity_kw >= 1000 ? "MW" : "kW"} color="amber" />
            )}
            {selectedModel.efficiency_pct != null && (
              <MetricBadge label="Gen. Efficiency" value={Number(selectedModel.efficiency_pct).toFixed(0)} unit="%" color="green" />
            )}
            <MetricBadge label="Capacity Factor" value={`${cfMin}–${cfMax}`} unit="%" color="blue" />
            {meta.co2 != null && (
              <MetricBadge label="CO₂ Intensity" value={meta.co2} unit="g/kWh" color={meta.co2 < 50 ? "green" : meta.co2 < 300 ? "amber" : "red"} />
            )}
            {selectedModel.capex_usd_per_kw != null && (
              <MetricBadge label="CAPEX" value={selectedModel.capex_usd_per_kw >= 1000 ? (selectedModel.capex_usd_per_kw / 1000).toFixed(1) : selectedModel.capex_usd_per_kw} unit={selectedModel.capex_usd_per_kw >= 1000 ? "k$/kW" : "$/kW"} color="violet" />
            )}
            {selectedModel.lifetime_yr != null && (
              <MetricBadge label="Lifetime" value={selectedModel.lifetime_yr} unit="yr" color="slate" />
            )}
          </div>
        </div>
      </div>

      {/* ── Row 1: 24 h profile + energy cascade ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Theoretical 24h generation profile */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <FiClock size={13} style={{ color: hue }} />
            <h4 className="text-sm font-semibold text-slate-700">Theoretical 24 h Generation Profile</h4>
            <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1">
              <FiInfo size={10} /> Typical day · 30-min resolution
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Model CF: <b style={{ color: hue }}>{avgCFpct}%</b>
            {" · "}Peak: <b style={{ color: hue }}>{(profile.peakKw / 1000).toFixed(2)} MW</b>
            {" · "}Set-point: <b className="text-slate-600">{setPointKw.toLocaleString()} kW</b>
          </p>
          <ReactECharts option={profileChart} style={{ height: 220 }} />
        </div>

        {/* Energy conversion cascade */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <FiTrendingUp size={13} style={{ color: hue }} />
            <h4 className="text-sm font-semibold text-slate-700">Energy Conversion Chain</h4>
            <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1">
              <FiInfo size={10} /> Steady-state at set-point
            </span>
          </div>
          {/* Summary row */}
          <div className="flex gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: hue }} />
              <span className="text-slate-500">AC to ELZ:</span>
              <b className="text-slate-700">{cascade.summary.pToElz.toFixed(0)} kW</b>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-slate-500">H₂ chemical:</span>
              <b className="text-slate-700">{cascade.summary.pH2.toFixed(0)} kW</b>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <span className="text-slate-500">H₂ rate:</span>
              <b className="text-slate-700">{cascade.summary.h2nm3h} Nm³/h</b>
            </div>
          </div>
          <ReactECharts option={cascade.chart} style={{ height: 220 }} />
        </div>
      </div>

      {/* ── Row 2: Actual simulation output (only after done) ─────────────── */}
      {isDone && actualChart && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <FiActivity size={13} style={{ color: hue }} />
            <h4 className="text-sm font-semibold text-slate-700">
              Actual: {selectedModel.name} → Electrolyzer → H₂
            </h4>
            <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1">
              <FiInfo size={10} /> Simulation result · triple Y-axis
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Amber area = ELZ power draw · Green area = H₂ produced · Dashed indigo = conversion efficiency (%)
          </p>
          <ReactECharts option={actualChart} style={{ height: 260 }} />
        </div>
      )}

      {/* ── Efficiency breakdown summary footer ──────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">Generator η</p>
          <p className="text-lg font-bold text-slate-800 leading-tight">
            {selectedModel.efficiency_pct != null
              ? `${Number(selectedModel.efficiency_pct).toFixed(1)} %`
              : techType === "solar" || techType === "wind" || techType === "hydro"
                ? "N/A (RE)"
                : "—"}
          </p>
          <p className="text-[10px] text-slate-400">Fuel → electricity</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <p className="text-[10px] text-indigo-500 uppercase tracking-wide font-medium">ELZ η</p>
          <p className="text-lg font-bold text-indigo-800 leading-tight">
            {(elzModel?.efficiency_pct ?? 70).toFixed(0)} %
          </p>
          <p className="text-[10px] text-indigo-400">AC → H₂ chemical</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-[10px] text-emerald-500 uppercase tracking-wide font-medium">System η (steady)</p>
          <p className="text-lg font-bold text-emerald-800 leading-tight">
            {(
              ((selectedModel?.efficiency_pct ?? 100) / 100) *
              ((elzModel?.efficiency_pct ?? 70) / 100) *
              100
            ).toFixed(1)} %
          </p>
          <p className="text-[10px] text-emerald-400">Fuel → H₂ (chain)</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-[10px] text-amber-500 uppercase tracking-wide font-medium">H₂ Rate (set-point)</p>
          <p className="text-lg font-bold text-amber-800 leading-tight">
            {cascade.summary.h2nm3h} <span className="text-sm font-normal">Nm³/h</span>
          </p>
          <p className="text-[10px] text-amber-400">At {setPointKw.toLocaleString()} kW input</p>
        </div>
      </div>
    </div>
  );
}
