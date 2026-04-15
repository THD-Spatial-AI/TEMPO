/**
 * H2EnergyCharts.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Energy balance & flow evolution charts for the Hydrogen Power Plant Digital Twin.
 * Shows how generation, consumption, H₂ production and efficiency evolve each step.
 *
 * Props:
 *   result     {Object}   – simulation result from the VM API
 *   simState   {string}   – 'idle'|'queued'|'running'|'done'|'error'
 *   progress   {number}   – 0-100  (shows live partial trace while running)
 *   sourceName {string}   – human-readable name of the selected power source
 */

import React, { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { FiZap, FiTrendingUp, FiActivity, FiBarChart2, FiInfo } from "react-icons/fi";

// ─────────────────────────────────────────────────────────────────────────────
// Chart layout helpers
// ─────────────────────────────────────────────────────────────────────────────
const baseGrid = { top: 30, bottom: 44, left: 54, right: 54 };

function formatTimeLabel(t) {
  const sec = Number(t) || 0;
  const days = Math.floor(sec / 86400);
  const h    = Math.floor((sec % 86400) / 3600);
  const m    = Math.floor((sec % 3600) / 60);
  if (days > 0) return h > 0 ? `D${days}+${h}h` : `D${days}`;
  if (h   > 0) return m > 0 ? `${h}h${m}` : `${h}h`;
  return `${m}m`;
}

function xAxisLabel(t) {
  return {
    fontSize: 9,
    rotate: t.length > 24 ? 35 : 0,
    interval: Math.max(0, Math.ceil(t.length / 10) - 1),
    color: '#94a3b8',
  };
}

function timeAxis(result, requestedProfile = []) {
  const fromResult = result?.time_s ?? [];
  const fromRequested = Array.isArray(requestedProfile)
    ? requestedProfile.map((p) => Number(p?.time_s)).filter((v) => Number.isFinite(v))
    : [];
  const base = fromResult.length ? fromResult : fromRequested;
  return base.map((t) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m} min`;
  });
}

const tooltipFormatter = (params) =>
  params
    .map((p) => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:5px;"></span>${p.seriesName}: <b>${Number(p.value ?? 0).toFixed(2)}</b>`)
    .join('<br/>');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Power Flow chart  ─ Source generation → ELZ consumption → FC output
// ─────────────────────────────────────────────────────────────────────────────
function buildPowerFlowChart(result, sourceName, requestedSourceProfile = []) {
  const simTime = result?.time_s ?? [];
  const reqTime = Array.isArray(requestedSourceProfile)
    ? requestedSourceProfile.map((p) => Number(p?.time_s)).filter((v) => Number.isFinite(v))
    : [];
  const timeValues = simTime.length ? simTime : reqTime;
  const t = timeValues.map((v) => formatTimeLabel(v));

  const srcPowSim = result?.source_power_kw ?? [];
  const srcPowRequested = Array.isArray(requestedSourceProfile)
    ? requestedSourceProfile.map((p) => Number(p?.power_kw ?? 0))
    : [];
  const hasSimSource = srcPowSim.length > 0 && srcPowSim.some((v) => v > 0);
  const canOverlayRequested = srcPowRequested.length === t.length && srcPowRequested.some((v) => v > 0);
  const srcPow = hasSimSource ? srcPowSim : (canOverlayRequested ? srcPowRequested : []);
  const elzPow = result?.electrolyzer_power_kw ?? [];
  const fcPow  = result?.fc_power_output_kw    ?? result?.fc_terminal_voltage_v?.map(() => 0) ?? [];
  // Curtailed power: generated but not consumed by ELZ (e.g. ELZ at capacity)
  const curtailed = srcPow.map((s, i) => Math.max(0, Number((s - (elzPow[i] ?? 0)).toFixed(2))));
  const hasSrc = srcPow.length > 0 && srcPow.some((v) => v > 0);

  const series = [
    ...(hasSrc ? [{
      name: `${sourceName ?? 'Source'} Generation`,
      type: 'line',
      data: srcPow,
      smooth: true, symbol: 'none',
      lineStyle: { color: '#3b82f6', width: 2.5 },
      areaStyle: { color: 'rgba(59,130,246,0.08)' },
      z: 1,
    }] : []),
    ...(hasSimSource && canOverlayRequested ? [{
      name: 'Requested Generation Profile',
      type: 'line',
      data: srcPowRequested,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#1d4ed8', width: 1.5, type: 'dashed' },
      z: 0,
    }] : []),
    {
      name: `ELZ Power In`,
      type: 'line',
      data: elzPow,
      smooth: true, symbol: 'none',
      lineStyle: { color: '#f59e0b', width: 2 },
      areaStyle: { color: 'rgba(245,158,11,0.13)' },
      z: 2,
    },
    {
      name: 'FC Power Output',
      type: 'line',
      data: fcPow,
      smooth: true, symbol: 'none',
      lineStyle: { color: '#10b981', width: 2 },
      areaStyle: { color: 'rgba(16,185,129,0.10)' },
      z: 2,
    },
    ...(hasSrc ? [{
      name: 'Curtailed (kW)',
      type: 'bar',
      data: curtailed,
      barMaxWidth: 12,
      itemStyle: { color: 'rgba(239,68,68,0.55)', borderRadius: [2, 2, 0, 0] },
      z: 3,
    }] : []),
  ];

  return {
    animation: true,
    animationDuration: 800,
    tooltip: { trigger: 'axis', formatter: tooltipFormatter },
    legend: { data: series.map((s) => s.name), bottom: 0, textStyle: { fontSize: 11 } },
    grid: baseGrid,
    xAxis: { type: 'category', data: t, axisLabel: xAxisLabel(t) },
    yAxis: { type: 'value', name: 'kW', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. H₂ Mass Balance  ─ Production rate vs consumption estimate
// ─────────────────────────────────────────────────────────────────────────────
function buildH2BalanceChart(result) {
  const t        = timeAxis(result);
  const h2prod   = result?.h2_production_nm3h  ?? [];
  const h2cons   = result?.h2_consumption_nm3h ?? h2prod.map(() => null);
  const hasConsSeries = h2cons.some((v) => v != null);

  const series = [
    {
      name: 'H₂ Produced (Nm³/h)',
      type: 'line',
      data: h2prod,
      smooth: true, symbol: 'circle', symbolSize: 5,
      lineStyle: { color: '#10b981', width: 2 },
      areaStyle: { color: 'rgba(16,185,129,0.15)' },
    },
  ];
  if (hasConsSeries) {
    series.push({
      name: 'H₂ Consumed (Nm³/h)',
      type: 'line',
      data: h2cons,
      smooth: true, symbol: 'emptyCircle', symbolSize: 5,
      lineStyle: { color: '#8b5cf6', width: 2, type: 'dashed' },
    });
  }

  return {
    animation: true,
    animationDuration: 800,
    tooltip: { trigger: 'axis', formatter: tooltipFormatter },
    legend: { data: series.map((s) => s.name), bottom: 0, textStyle: { fontSize: 11 } },
    grid: baseGrid,
    xAxis: { type: 'category', data: t, axisLabel: xAxisLabel(t) },
    yAxis: { type: 'value', name: 'Nm³/h', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tank State  ─ Pressure + cumulative H₂ stored estimate
// ─────────────────────────────────────────────────────────────────────────────
function buildTankStateChart(result) {
  const t     = timeAxis(result);
  const press = result?.tank_pressure_bar ?? [];
  const soc   = result?.tank_soc_pct      ?? press.map(() => null);
  const hasSoc = soc.some((v) => v != null && v > 0);

  const series = [
    {
      name: 'Tank Pressure (bar)',
      type: 'line',
      data: press,
      smooth: true, symbol: 'none',
      lineStyle: { color: '#f59e0b', width: 2 },
      areaStyle: { color: 'rgba(245,158,11,0.12)' },
      yAxisIndex: 0,
    },
  ];

  const yAxes = [
    { type: 'value', name: 'bar', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
  ];

  if (hasSoc) {
    series.push({
      name: 'Tank SOC (%)',
      type: 'line',
      data: soc,
      smooth: true, symbol: 'none',
      lineStyle: { color: '#10b981', width: 2, type: 'dashed' },
      yAxisIndex: 1,
    });
    yAxes.push({
      type: 'value', name: '%',
      min: 0, max: 100,
      nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 },
      splitLine: { show: false },
    });
  }

  return {
    animation: true,
    animationDuration: 800,
    tooltip: { trigger: 'axis', formatter: tooltipFormatter },
    legend: { data: series.map((s) => s.name), bottom: 0, textStyle: { fontSize: 11 } },
    grid: { ...baseGrid, right: hasSoc ? 54 : 20 },
    xAxis: { type: 'category', data: t, axisLabel: xAxisLabel(t) },
    yAxis: yAxes,
    series,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Fuel Cell Detail  ─ Voltage, current density, & instantaneous efficiency
// ─────────────────────────────────────────────────────────────────────────────
function buildFcDetailChart(result) {
  const t      = timeAxis(result);
  const volt   = result?.fc_terminal_voltage_v ?? [];
  const curr   = result?.fc_current_density_acm2 ?? [];
  const power  = result?.fc_power_output_kw ?? volt.map((v, i) => v * (curr[i] ?? 0) / 1000);

  // Instantaneous pole efficiency = P_out / (P_in = P_h2 consumed)
  const h2Enth = 3.54; // kWh per Nm³ H₂ (HHV)
  const h2cons = result?.h2_consumption_nm3h ?? result?.h2_production_nm3h?.map(() => null) ?? [];
  const eff    = power.map((p, i) => {
    const h2kw = (h2cons[i] ?? null);
    if (h2kw == null || h2kw === 0) return null;
    return parseFloat(((p / (h2kw * h2Enth)) * 100).toFixed(1));
  });
  const hasEff = eff.some((v) => v != null);

  return {
    animation: true,
    animationDuration: 800,
    tooltip: { trigger: 'axis', formatter: tooltipFormatter },
    legend: { data: ['Terminal Voltage (V)', 'Current Density (A/cm²)', ...(hasEff ? ['FC Efficiency (%)'] : [])], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { ...baseGrid, right: hasEff ? 60 : 54 },
    xAxis: { type: 'category', data: t, axisLabel: xAxisLabel(t) },
    yAxis: [
      { type: 'value', name: 'V',     nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
      { type: 'value', name: 'A/cm²', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } },
      ...(hasEff ? [{ type: 'value', name: '%', min: 0, max: 100, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } }] : []),
    ],
    series: [
      {
        name: 'Terminal Voltage (V)',
        type: 'line',
        data: volt,
        smooth: true, symbol: 'none',
        lineStyle: { color: '#8b5cf6', width: 2 },
        yAxisIndex: 0,
      },
      {
        name: 'Current Density (A/cm²)',
        type: 'line',
        data: curr,
        smooth: true, symbol: 'none',
        lineStyle: { color: '#ec4899', width: 2, type: 'dashed' },
        yAxisIndex: 1,
      },
      ...(hasEff ? [{
        name: 'FC Efficiency (%)',
        type: 'line',
        data: eff,
        smooth: true, symbol: 'none',
        lineStyle: { color: '#22c55e', width: 1.5, type: 'dotted' },
        yAxisIndex: 2,
      }] : []),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cumulative Energy Summary  ─ Stacked bar per time bucket
// ─────────────────────────────────────────────────────────────────────────────
function buildCumulativeChart(result) {
  const t = timeAxis(result);
  const dt = result?.dt_s ?? 3600;
  const kWhFactor = dt / 3600;

  const elzEnergy  = (result?.electrolyzer_power_kw ?? []).map((v) => Number((v * kWhFactor).toFixed(2)));
  const fcEnergy   = (result?.fc_power_output_kw ?? result?.fc_terminal_voltage_v?.map(() => 0) ?? []).map((v) => Number((v * kWhFactor).toFixed(2)));
  const h2Energy   = (result?.h2_production_nm3h ?? []).map((v) => Number((v * 3.54 * kWhFactor).toFixed(2))); // 3.54 kWh/Nm³ HHV

  return {
    animation: true,
    animationDuration: 1000,
    tooltip: { trigger: 'axis', formatter: tooltipFormatter },
    legend: { data: ['ELZ Energy In (kWh)', 'H₂ Energy Stored (kWh equiv.)', 'FC Energy Out (kWh)'], bottom: 0, textStyle: { fontSize: 11 } },
    grid: baseGrid,
    xAxis: { type: 'category', data: t, axisLabel: xAxisLabel(t) },
    yAxis: { type: 'value', name: 'kWh', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series: [
      {
        name: 'ELZ Energy In (kWh)',
        type: 'bar',
        data: elzEnergy,
        stack: 'in',
        itemStyle: { color: '#f59e0b', borderRadius: [0, 0, 0, 0] },
        barMaxWidth: 28,
      },
      {
        name: 'H₂ Energy Stored (kWh equiv.)',
        type: 'bar',
        data: h2Energy,
        stack: 'in',
        itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 28,
      },
      {
        name: 'FC Energy Out (kWh)',
        type: 'line',
        data: fcEnergy,
        smooth: true, symbol: 'emptyCircle', symbolSize: 4,
        lineStyle: { color: '#8b5cf6', width: 2 },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function ChartCard({ icon: Icon, title, subtitle, children, accent = "slate" }) {
  const accentCls = {
    amber:  "text-amber-500",
    emerald:"text-emerald-500",
    violet: "text-violet-500",
    slate:  "text-slate-400",
    indigo: "text-indigo-500",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={15} className={accentCls[accent] ?? accentCls.slate} />
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        {subtitle && (
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
            <FiInfo size={11} /> {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export default function H2EnergyCharts({ result, simState, progress, sourceName, requestedSourceProfile = [] }) {
  const t = timeAxis(result, requestedSourceProfile);

  const powerFlowOpt   = useMemo(() => buildPowerFlowChart(result, sourceName, requestedSourceProfile), [result, sourceName, requestedSourceProfile]);
  const h2BalanceOpt   = useMemo(() => buildH2BalanceChart(result),               [result]);
  const tankStateOpt   = useMemo(() => buildTankStateChart(result),               [result]);
  const fcDetailOpt    = useMemo(() => buildFcDetailChart(result),                [result]);
  const cumulativeOpt  = useMemo(() => buildCumulativeChart(result),              [result]);

  const [selectedChart, setSelectedChart] = useState("powerFlow");

  const CHART_OPTIONS = [
    { id: "powerFlow",   label: "Power Flow" },
    { id: "h2Balance",   label: "H₂ Mass Balance" },
    { id: "tankState",   label: "Tank State Evolution" },
    { id: "fcDetail",    label: "Fuel Cell Polarisation" },
    { id: "cumulative",  label: "Cumulative Energy" },
  ];

  const CHART_MAP = {
    powerFlow:  { icon: FiZap,        title: "Power Flow",                subtitle: "ELZ consumption vs FC output",                    opt: powerFlowOpt,  accentCls: "text-amber-500" },
    h2Balance:  { icon: FiActivity,   title: "H₂ Mass Balance",           subtitle: "Production rate per step",                        opt: h2BalanceOpt,  accentCls: "text-emerald-500" },
    tankState:  { icon: FiBarChart2,  title: "Tank State Evolution",       subtitle: "Pressure over time",                              opt: tankStateOpt,  accentCls: "text-amber-500" },
    fcDetail:   { icon: FiActivity,   title: "Fuel Cell Polarisation",     subtitle: "Voltage · current density · efficiency",          opt: fcDetailOpt,   accentCls: "text-violet-500" },
    cumulative: { icon: FiTrendingUp, title: "Cumulative Energy per Step", subtitle: "kWh in/out each Δt · H₂ HHV = 3.54 kWh/Nm³",    opt: cumulativeOpt, accentCls: "text-indigo-500" },
  };

  const isRunning  = simState === 'running' || simState === 'queued';
  const isLocal    = !!result?._local;

  if (!result && !isRunning) return null;

  return (
    <div className="space-y-5">
      {/* Section divider */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-500"><FiActivity size={15} /></span>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">
            Energy Flow Evolution
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isRunning
              ? `Simulation in progress — ${progress.toFixed(0)}% complete`
              : `${t.length} time steps · Δt as per sample interval`}
          </p>
        </div>
        {isLocal && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
            <FiInfo size={11} />
            Local physics model · connect to service for OpenModelica results
          </span>
        )}
      </div>

      {/* Loading skeleton while queued/running with no data yet */}
      {isRunning && !result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-52 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <span className="inline-block w-8 h-8 rounded-full border-4 border-t-indigo-500 border-slate-200 animate-spin" />
                <span className="text-xs text-slate-400">Running simulation…</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {result && (() => {
        const cm = CHART_MAP[selectedChart];
        const Icon = cm.icon;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon size={15} className={cm.accentCls} />
              <h4 className="text-sm font-semibold text-slate-700">{cm.title}</h4>
              <select
                value={selectedChart}
                onChange={(e) => setSelectedChart(e.target.value)}
                className="ml-auto text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {CHART_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
              <FiInfo size={10} /> {cm.subtitle}
            </p>
            <ReactECharts key={selectedChart} option={cm.opt} style={{ height: 340 }} />
          </div>
        );
      })()}
    </div>
  );
}

