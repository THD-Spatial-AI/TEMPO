/**
 * CCSEnergyCharts.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Time-series charts for CCS simulation results.
 * Uses ECharts for interactive, high-performance plotting.
 */

import React from "react";
import ReactECharts from "echarts-for-react";

export default function CCSEnergyCharts({ result }) {
  if (!result || !result.time_s || result.time_s.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">
        <p className="text-sm">No simulation results yet. Run a simulation to see charts.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* CO₂ Capture & Injection */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-600 mb-3">CO₂ Capture & Injection</h4>
        <ReactECharts option={buildCaptureChart(result)} style={{ height: 280 }} />
      </div>

      {/* Energy Consumption */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-600 mb-3">Energy Consumption</h4>
        <ReactECharts option={buildEnergyChart(result)} style={{ height: 280 }} />
      </div>

      {/* Compressor Performance */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-600 mb-3">Compressor Performance</h4>
        <ReactECharts option={buildCompressorChart(result)} style={{ height: 280 }} />
      </div>

      {/* Storage Cumulative */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-600 mb-3">Cumulative CO₂ Stored</h4>
        <ReactECharts option={buildStorageChart(result)} style={{ height: 280 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ECharts option builders
// ─────────────────────────────────────────────────────────────────────────────

function buildCaptureChart(result) {
  const time = (result.time_s ?? []).map(t => `${Math.round(t / 60)} min`);

  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: {
      data: ["CO₂ Captured (t/h)", "CO₂ Injected (t/h)"],
      bottom: 0,
      textStyle: { fontSize: 10 },
    },
    grid: { top: 24, bottom: 48, left: 56, right: 16 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "value",
      name: "t/h",
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: "CO₂ Captured (t/h)",
        type: "line",
        data: result.absorber?.co2_captured_tph ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#3b82f6", width: 2 },
        areaStyle: { color: "rgba(59,130,246,0.1)" },
      },
      {
        name: "CO₂ Injected (t/h)",
        type: "line",
        data: result.storage?.injection_rate_tph ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#10b981", width: 2 },
        areaStyle: { color: "rgba(16,185,129,0.08)" },
      },
    ],
  };
}

function buildEnergyChart(result) {
  const time = (result.time_s ?? []).map(t => `${Math.round(t / 60)} min`);

  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: {
      data: ["Stripper Thermal (kW)", "Compressor Power (kW)"],
      bottom: 0,
      textStyle: { fontSize: 10 },
    },
    grid: { top: 24, bottom: 48, left: 56, right: 16 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "value",
      name: "kW",
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: "Stripper Thermal (kW)",
        type: "line",
        data: result.stripper?.heat_demand_kw ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#ef4444", width: 2 },
        areaStyle: { color: "rgba(239,68,68,0.1)" },
      },
      {
        name: "Compressor Power (kW)",
        type: "line",
        data: result.compressor?.power_kw ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#f59e0b", width: 2 },
        areaStyle: { color: "rgba(245,158,11,0.08)" },
      },
    ],
  };
}

function buildCompressorChart(result) {
  const time = (result.time_s ?? []).map(t => `${Math.round(t / 60)} min`);

  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: {
      data: ["Outlet Pressure (bar)", "Outlet Temp (°C)"],
      bottom: 0,
      textStyle: { fontSize: 10 },
    },
    grid: { top: 24, bottom: 48, left: 56, right: 60 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: [
      {
        type: "value",
        name: "bar",
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
      },
      {
        type: "value",
        name: "°C",
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Outlet Pressure (bar)",
        type: "line",
        data: result.compressor?.outlet_pressure_bar ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#8b5cf6", width: 2 },
        yAxisIndex: 0,
      },
      {
        name: "Outlet Temp (°C)",
        type: "line",
        data: result.compressor?.temperature_c ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#ec4899", width: 2, type: "dashed" },
        yAxisIndex: 1,
      },
    ],
  };
}

function buildStorageChart(result) {
  const time = (result.time_s ?? []).map(t => `${Math.round(t / 60)} min`);

  return {
    animation: false,
    tooltip: { trigger: "axis" },
    legend: {
      data: ["Cumulative Stored (tCO₂)"],
      bottom: 0,
      textStyle: { fontSize: 10 },
    },
    grid: { top: 24, bottom: 48, left: 56, right: 16 },
    xAxis: { type: "category", data: time, axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "value",
      name: "tCO₂",
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: "Cumulative Stored (tCO₂)",
        type: "line",
        data: result.storage?.co2_mass_tonnes ?? [],
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#14b8a6", width: 2.5 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(20,184,166,0.3)" },
              { offset: 1, color: "rgba(20,184,166,0.05)" },
            ],
          },
        },
      },
    ],
  };
}
