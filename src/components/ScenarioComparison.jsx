import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import ReactECharts from 'echarts-for-react';
import {
  FiSearch, FiBarChart2, FiGrid, FiTrendingUp, FiZap,
  FiDollarSign, FiSliders, FiLayers, FiInfo, FiCheckSquare,
  FiSquare, FiDownload,
} from 'react-icons/fi';

// ─── Qualitative colour palette (20 perceptually-distinct colours) ────────────
const PALETTE = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
  '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
  '#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf',
];
const jobColor = (idx) => PALETTE[idx % PALETTE.length];

// ─── Formatting helpers ────────────────────────────────────────────────────
const fmtNum = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(dec) + 'G';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(dec) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(dec) + 'k';
  return n.toFixed(dec);
};

// ─── Renewable classification ──────────────────────────────────────────────
const RENEWABLE_KW = ['solar','wind','hydro','biomass','geothermal','tidal','wave','pv','fv','eol','hid'];
function isRenewable(techName, techMeta) {
  const meta = techMeta?.[techName];
  if (meta?.parent === 'demand' || meta?.parent === 'transmission') return false;
  const n = techName.toLowerCase();
  return RENEWABLE_KW.some(r => n.includes(r));
}

// ─── KPI extraction from one result object ─────────────────────────────────
function extractKPIs(result) {
  if (!result) return null;
  const capByTech  = {};
  const genByTech  = {};
  const costByTech = result.costs_by_tech || {};
  const techMeta   = result.tech_metadata || {};
  const locations  = new Set();

  Object.entries(result.capacities || {}).forEach(([key, val]) => {
    if (!val || val <= 0) return;
    const parts = key.split('::');
    if (parts.length < 2) return;
    locations.add(parts[0]);
    const tech = parts[1].split(':')[0];
    capByTech[tech] = (capByTech[tech] || 0) + val;
  });

  Object.entries(result.generation || {}).forEach(([key, val]) => {
    if (!val || val <= 0) return;
    const parts = key.split('::');
    if (parts.length < 2) return;
    const tech = parts[1].split(':')[0];
    genByTech[tech] = (genByTech[tech] || 0) + val;
  });

  const allTechs = [...new Set([
    ...Object.keys(capByTech),
    ...Object.keys(genByTech),
    ...Object.keys(costByTech),
  ])].sort();

  const totalCap  = Object.values(capByTech).reduce((s, v) => s + v, 0);
  const totalGen  = Object.values(genByTech).reduce((s, v) => s + v, 0);
  const totalCost = Object.values(costByTech).reduce((s, v) => s + v, 0);
  const renewableGen = allTechs
    .filter(t => isRenewable(t, techMeta))
    .reduce((s, t) => s + (genByTech[t] || 0), 0);

  return {
    capByTech, genByTech, costByTech, allTechs,
    totalCap, totalGen, totalCost,
    renewableShare: totalGen > 0 ? renewableGen / totalGen : 0,
    locationCount: locations.size,
    techCount: allTechs.length,
    timestepCount: result.timestamps?.length || 0,
  };
}

// ─── Build a stacked-bar ECharts option ────────────────────────────────────
// dataKey: 'capByTech' | 'genByTech' | 'costByTech'
// allTechs: union of all tech names across selected runs
// kpisPerJob: [{ job, kpis }]
function buildStackedBar(kpisPerJob, allTechs, dataKey, yLabel) {
  if (!kpisPerJob.length) return {};

  const scenarioLabels = kpisPerJob.map(({ job }) =>
    job.modelName.length > 22 ? job.modelName.slice(0, 20) + '…' : job.modelName
  );

  // Filter out techs that are zero in every selected run (cleaner chart)
  const activeTechs = allTechs.filter(tech =>
    kpisPerJob.some(({ kpis }) => (kpis[dataKey]?.[tech] || 0) > 0)
  );

  const series = activeTechs.map(tech => ({
    name: tech.replace(/_/g, ' '),
    type: 'bar',
    stack: 'total',
    data: kpisPerJob.map(({ kpis }) => {
      const v = kpis[dataKey]?.[tech] || 0;
      return parseFloat(v.toFixed(3));
    }),
    emphasis: { focus: 'series' },
  }));

  const hasZoom = kpisPerJob.length > 20;

  return {
    backgroundColor: 'transparent',
    animation: kpisPerJob.length < 300,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const name = params[0]?.name || '';
        const rows = params
          .filter(p => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 12)
          .map(p =>
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:4px"></span>${p.seriesName}: <b>${fmtNum(p.value)} ${yLabel}</b>`
          )
          .join('<br/>');
        return `<b>${name}</b><br/>${rows}`;
      },
    },
    legend: {
      type: 'scroll',
      bottom: hasZoom ? 44 : 10,
      textStyle: { fontSize: 11, color: '#64748b' },
      pageTextStyle: { color: '#64748b' },
    },
    grid: { left: 64, right: 16, top: 16, bottom: hasZoom ? 84 : 60 },
    xAxis: {
      type: 'category',
      data: scenarioLabels,
      axisLabel: {
        rotate: kpisPerJob.length > 8 ? 45 : 0,
        fontSize: 10,
        color: '#64748b',
        formatter: v => v.length > 18 ? v.slice(0, 16) + '…' : v,
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      nameTextStyle: { fontSize: 9, color: '#94a3b8', fontStyle: 'italic' },
      axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmtNum(v) },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    dataZoom: hasZoom ? [
      { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
      { type: 'slider',  xAxisIndex: 0, bottom: 12, height: 18, fillerColor: 'rgba(148,163,184,0.2)', borderColor: '#cbd5e1' },
    ] : [],
    series,
  };
}

// ─── Build parallel-coordinates ECharts option ────────────────────────────
function buildParallelOption(kpisPerJob, colorMap) {
  if (kpisPerJob.length < 2) return {};

  const AXES = [
    { dim: 0, name: 'Capacity\n(MW)',   key: 'totalCap',       scale: 1,   fmt: v => fmtNum(v) },
    { dim: 1, name: 'Generation\n(MWh)',key: 'totalGen',       scale: 1,   fmt: v => fmtNum(v) },
    { dim: 2, name: 'Cost (€)',         key: 'totalCost',      scale: 1,   fmt: v => fmtNum(v) },
    { dim: 3, name: 'Renewable\n(%)',   key: 'renewableShare', scale: 100, fmt: v => v.toFixed(0) + '%' },
    { dim: 4, name: 'Locations',        key: 'locationCount',  scale: 1,   fmt: v => String(Math.round(v)) },
    { dim: 5, name: 'Technologies',     key: 'techCount',      scale: 1,   fmt: v => String(Math.round(v)) },
  ];

  // Drop axes where all values are zero (e.g. no costs defined)
  const activeAxes = AXES.filter(a =>
    kpisPerJob.some(({ kpis }) => (kpis[a.key] || 0) !== 0)
  );

  return {
    backgroundColor: 'transparent',
    animation: false,
    parallelAxis: activeAxes.map(a => ({
      dim: a.dim,
      name: a.name,
      type: 'value',
      nameTextStyle: { fontSize: 10, color: '#64748b' },
      axisLabel: { fontSize: 9, color: '#94a3b8', formatter: a.fmt },
    })),
    parallel: {
      left: 64,
      right: 24,
      top: 48,
      bottom: 32,
      parallelAxisDefault: {
        type: 'value',
        nameLocation: 'end',
        nameGap: 20,
        splitNumber: 4,
        smooth: true,
      },
    },
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const { job, kpis } = kpisPerJob[p.dataIndex] || {};
        if (!job) return '';
        return [
          `<b>${job.modelName}</b>`,
          ...activeAxes.map(a => `${a.name.replace('\n', ' ')}: <b>${a.fmt(kpis[a.key] * a.scale)}</b>`),
        ].join('<br/>');
      },
    },
    series: [{
      type: 'parallel',
      lineStyle: { width: 1.5, opacity: 0.65 },
      data: kpisPerJob.map(({ job, kpis }, i) => ({
        name: job.modelName,
        value: activeAxes.map(a => parseFloat(((kpis[a.key] || 0) * a.scale).toFixed(4))),
        lineStyle: { color: colorMap[job.id] || jobColor(i), opacity: 0.7 },
      })),
    }],
  };
}

// ─── Build scatter-plot ECharts option ────────────────────────────────────
const SCATTER_METRICS = [
  { key: 'renewableShare', label: 'Renewable Share (%)', scale: 100 },
  { key: 'totalCost',      label: 'System Cost (€)',     scale: 1 },
  { key: 'totalCap',       label: 'Total Capacity (MW)', scale: 1 },
  { key: 'totalGen',       label: 'Total Generation (MWh)', scale: 1 },
  { key: 'locationCount',  label: 'Locations',           scale: 1 },
  { key: 'techCount',      label: 'Technologies',        scale: 1 },
  { key: 'timestepCount',  label: 'Timesteps',           scale: 1 },
];

function buildScatterOption(kpisPerJob, colorMap, xKey, yKey) {
  if (kpisPerJob.length < 2) return {};
  const xDef = SCATTER_METRICS.find(m => m.key === xKey) || SCATTER_METRICS[0];
  const yDef = SCATTER_METRICS.find(m => m.key === yKey) || SCATTER_METRICS[1];

  return {
    backgroundColor: 'transparent',
    animation: kpisPerJob.length < 500,
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const entry = kpisPerJob[p.dataIndex];
        if (!entry) return '';
        const { job, kpis } = entry;
        return [
          `<b>${job.modelName}</b>`,
          `${xDef.label}: <b>${fmtNum(kpis[xKey] * xDef.scale)}</b>`,
          `${yDef.label}: <b>${fmtNum(kpis[yKey] * yDef.scale)}</b>`,
        ].join('<br/>');
      },
    },
    grid: { left: 72, right: 24, top: 20, bottom: 56 },
    xAxis: {
      type: 'value',
      name: xDef.label,
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic' },
      axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmtNum(v) },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    yAxis: {
      type: 'value',
      name: yDef.label,
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic' },
      axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmtNum(v) },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [{
      type: 'scatter',
      symbolSize: Math.max(6, Math.min(14, 200 / kpisPerJob.length)),
      data: kpisPerJob.map(({ job, kpis }, i) => ({
        name: job.modelName,
        value: [
          parseFloat(((kpis[xKey] || 0) * xDef.scale).toFixed(4)),
          parseFloat(((kpis[yKey] || 0) * yDef.scale).toFixed(4)),
        ],
        itemStyle: { color: colorMap[job.id] || jobColor(i), opacity: 0.82 },
      })),
      label: {
        show: kpisPerJob.length <= 25,
        formatter: (p) => {
          const name = kpisPerJob[p.dataIndex]?.job.modelName || '';
          return name.length > 14 ? name.slice(0, 12) + '…' : name;
        },
        fontSize: 9,
        color: '#475569',
        position: 'top',
      },
    }],
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'inside', yAxisIndex: 0 },
    ],
  };
}

// ─── KPI table row definitions ─────────────────────────────────────────────
const KPI_ROWS = [
  { key: 'totalCap',       label: 'Total Installed Capacity', fmt: v => fmtNum(v) + ' MW',  best: 'none' },
  { key: 'totalGen',       label: 'Total Generation',         fmt: v => fmtNum(v) + ' MWh', best: 'none' },
  { key: 'totalCost',      label: 'System Cost',              fmt: v => '€\u202f' + fmtNum(v), best: 'min' },
  { key: 'renewableShare', label: 'Renewable Share',          fmt: v => (v * 100).toFixed(1) + '%', best: 'max' },
  { key: 'locationCount',  label: 'Locations',                fmt: v => v.toLocaleString(), best: 'none' },
  { key: 'techCount',      label: 'Technologies',             fmt: v => String(v), best: 'none' },
  { key: 'timestepCount',  label: 'Timesteps',                fmt: v => v.toLocaleString(), best: 'none' },
];

// ─── Chart-view tabs ───────────────────────────────────────────────────────
const CHART_VIEWS = [
  { id: 'table',    label: 'Summary',    icon: FiGrid },
  { id: 'capacity', label: 'Capacity',   icon: FiBarChart2 },
  { id: 'gen',      label: 'Generation', icon: FiZap },
  { id: 'costs',    label: 'Costs',      icon: FiDollarSign },
  { id: 'parallel', label: 'Parallel',   icon: FiTrendingUp },
  { id: 'scatter',  label: 'Scatter',    icon: FiSliders },
];

// ─── CSV export ────────────────────────────────────────────────────────────
function exportCSV(kpisPerJob) {
  if (!kpisPerJob.length) return;
  const headers = ['Run', 'Date', ...KPI_ROWS.map(r => r.label)];
  const rows = kpisPerJob.map(({ job, kpis }) => [
    `"${job.modelName.replace(/"/g, '""')}"`,
    new Date(job.completedAt).toISOString(),
    kpis.totalCap.toFixed(2),
    kpis.totalGen.toFixed(2),
    kpis.totalCost.toFixed(2),
    (kpis.renewableShare * 100).toFixed(2),
    kpis.locationCount,
    kpis.techCount,
    kpis.timestepCount,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `scenario_comparison_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
export default function ScenarioComparison() {
  const { completedJobs } = useData();

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search,      setSearch]      = useState('');
  const [chartView,   setChartView]   = useState('table');
  const [scatterX,    setScatterX]    = useState('renewableShare');
  const [scatterY,    setScatterY]    = useState('totalCost');

  // Jobs with a usable result
  const validJobs = useMemo(
    () => completedJobs.filter(j => j.result && j.result.success !== false),
    [completedJobs]
  );

  // Jobs visible in the picker (filtered by search)
  const filteredJobs = useMemo(() => {
    if (!search.trim()) return validJobs;
    const q = search.toLowerCase();
    return validJobs.filter(j => j.modelName?.toLowerCase().includes(q));
  }, [validJobs, search]);

  // Selected jobs in stable order
  const selectedJobs = useMemo(
    () => validJobs.filter(j => selectedIds.has(j.id)),
    [validJobs, selectedIds]
  );

  // Stable colour assignment: index within selectedJobs array → PALETTE
  const colorMap = useMemo(() => {
    const m = {};
    selectedJobs.forEach((j, i) => { m[j.id] = jobColor(i); });
    return m;
  }, [selectedJobs]);

  // KPIs per selected job
  const kpisPerJob = useMemo(
    () => selectedJobs
      .map(j => ({ job: j, kpis: extractKPIs(j.result) }))
      .filter(x => x.kpis),
    [selectedJobs]
  );

  // Union of all tech names across selected jobs
  const allTechs = useMemo(() => {
    const s = new Set();
    kpisPerJob.forEach(({ kpis }) => kpis.allTechs.forEach(t => s.add(t)));
    return [...s].sort();
  }, [kpisPerJob]);

  // Pre-computed chart options
  const capacityOption = useMemo(
    () => buildStackedBar(kpisPerJob, allTechs, 'capByTech',  'MW'),
    [kpisPerJob, allTechs]
  );
  const genOption = useMemo(
    () => buildStackedBar(kpisPerJob, allTechs, 'genByTech',  'MWh'),
    [kpisPerJob, allTechs]
  );
  const costsOption = useMemo(
    () => buildStackedBar(kpisPerJob, allTechs, 'costByTech', '€'),
    [kpisPerJob, allTechs]
  );
  const parallelOption = useMemo(
    () => buildParallelOption(kpisPerJob, colorMap),
    [kpisPerJob, colorMap]
  );
  const scatterOption = useMemo(
    () => buildScatterOption(kpisPerJob, colorMap, scatterX, scatterY),
    [kpisPerJob, colorMap, scatterX, scatterY]
  );

  // Picker controls
  const toggleJob = useCallback((id) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    }), []);

  const selectAll = useCallback(() =>
    setSelectedIds(new Set(filteredJobs.map(j => j.id))), [filteredJobs]);

  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  const manySelected = selectedJobs.length > 30;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4" style={{ minHeight: 0, height: '100%' }}>

      {/* ══ Left: Job Picker ══════════════════════════════════════════════ */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex-shrink-0 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Completed Runs
          </p>

          {/* Search */}
          <div className="relative">
            <FiSearch size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter…"
              className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Bulk actions */}
          <div className="flex gap-1.5">
            <button onClick={selectAll}
              className="flex-1 text-[11px] py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition">
              All
            </button>
            <button onClick={clearAll}
              className="flex-1 text-[11px] py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition">
              None
            </button>
          </div>

          {selectedIds.size > 0 && (
            <p className="text-[11px] text-blue-600 font-semibold">
              {selectedIds.size} run{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filteredJobs.length === 0 && (
            <p className="text-xs text-slate-400 text-center mt-8 px-3">
              {validJobs.length === 0
                ? 'No completed runs. Run a model first.'
                : 'No runs match the filter.'}
            </p>
          )}
          {filteredJobs.map((job) => {
            const checked = selectedIds.has(job.id);
            const color   = colorMap[job.id];
            return (
              <button
                key={job.id}
                onClick={() => toggleJob(job.id)}
                className={`w-full text-left flex items-start gap-2 px-2 py-2 rounded-xl text-xs transition-all ${
                  checked
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                {checked
                  ? <FiCheckSquare size={13} className="flex-shrink-0 mt-0.5" style={{ color: color || '#3b82f6' }} />
                  : <FiSquare size={13} className="flex-shrink-0 mt-0.5 text-slate-300" />
                }
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-slate-700 truncate">{job.modelName}</span>
                  <span className="block text-slate-400 text-[10px]">
                    {new Date(job.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                </span>
                {checked && color && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: color }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ Right: Chart Area ═════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {selectedJobs.length === 0 ? (
          /* Empty state */
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center p-12">
            <FiLayers size={44} className="text-slate-200 mb-4" />
            <p className="text-slate-600 font-semibold text-lg mb-2">Select runs to compare</p>
            <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
              Pick two or more completed runs from the left panel.
              Supports dozens to hundreds of scenarios for energy model exploration.
            </p>
          </div>
        ) : (
          <>
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Chart-type tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {CHART_VIEWS.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setChartView(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      chartView === id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>

              {/* Large-N hint */}
              {manySelected && chartView !== 'parallel' && chartView !== 'scatter' && chartView !== 'table' && (
                <span className="flex items-center gap-1.5 text-amber-600 text-xs bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                  <FiInfo size={12} />
                  {selectedJobs.length} runs — <b>Parallel</b> or <b>Scatter</b> views scale better for this many scenarios
                </span>
              )}

              {/* CSV export */}
              <button
                onClick={() => exportCSV(kpisPerJob)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white text-slate-600 rounded-xl hover:bg-slate-50 text-xs font-medium transition shadow-sm">
                <FiDownload size={12} /> Export CSV
              </button>
            </div>

            {/* ════ SUMMARY TABLE ════════════════════════════════════════ */}
            {chartView === 'table' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                  <span className="font-semibold text-slate-800 text-sm">
                    KPI Summary — {kpisPerJob.length} run{kpisPerJob.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-slate-400 text-xs">
                    ★ marks the best value per metric
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold sticky left-0 bg-slate-50 z-10 min-w-[160px]">
                          Metric
                        </th>
                        {kpisPerJob.map(({ job }, i) => (
                          <th key={job.id} className="px-3 py-2.5 text-left min-w-[130px]">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ background: colorMap[job.id] || jobColor(i) }} />
                              <span className="text-slate-700 font-medium truncate max-w-[100px]"
                                title={job.modelName}>
                                {job.modelName}
                              </span>
                            </span>
                            <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                              {new Date(job.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {KPI_ROWS.map(({ key, label, fmt, best }) => {
                        const vals = kpisPerJob.map(({ kpis }) => kpis[key] ?? 0);
                        const bestVal = best === 'max' ? Math.max(...vals)
                                      : best === 'min' ? Math.min(...vals)
                                      : null;
                        return (
                          <tr key={key} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-2.5 text-slate-500 font-medium sticky left-0 bg-white z-10">
                              {label}
                            </td>
                            {kpisPerJob.map(({ job, kpis }) => {
                              const v       = kpis[key] ?? 0;
                              const isBest  = bestVal !== null && v === bestVal && kpisPerJob.length > 1;
                              return (
                                <td key={job.id}
                                  className={`px-3 py-2.5 font-mono tabular-nums ${
                                    isBest ? 'text-emerald-700 font-bold bg-emerald-50/60' : 'text-slate-700'
                                  }`}>
                                  {isBest && <span className="mr-1 text-emerald-500">★</span>}
                                  {fmt(v)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ════ CAPACITY MIX ══════════════════════════════════════════ */}
            {chartView === 'capacity' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className="font-semibold text-slate-800 text-sm mb-1">
                  Installed Capacity by Technology
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Stacked bars · each segment = one technology · MW
                </p>
                <ReactECharts option={capacityOption} style={{ height: 420 }} notMerge />
              </div>
            )}

            {/* ════ GENERATION MIX ════════════════════════════════════════ */}
            {chartView === 'gen' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className="font-semibold text-slate-800 text-sm mb-1">
                  Generation Mix by Technology
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Stacked bars · each segment = one technology · MWh/year
                </p>
                <ReactECharts option={genOption} style={{ height: 420 }} notMerge />
              </div>
            )}

            {/* ════ SYSTEM COSTS ══════════════════════════════════════════ */}
            {chartView === 'costs' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className="font-semibold text-slate-800 text-sm mb-1">
                  System Cost by Technology
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Stacked bars · annualised cost breakdown · €
                </p>
                <ReactECharts option={costsOption} style={{ height: 420 }} notMerge />
              </div>
            )}

            {/* ════ PARALLEL COORDINATES ══════════════════════════════════ */}
            {chartView === 'parallel' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className="font-semibold text-slate-800 text-sm mb-1">
                  Parallel Coordinates
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  One line per run · drag an axis band to filter · ideal for 20 – 1000+ scenarios
                </p>
                {kpisPerJob.length < 2 ? (
                  <p className="text-slate-400 text-sm text-center py-14">
                    Select at least 2 runs to use parallel coordinates.
                  </p>
                ) : (
                  <ReactECharts option={parallelOption} style={{ height: 440 }} notMerge />
                )}
              </div>
            )}

            {/* ════ SCATTER PLOT ══════════════════════════════════════════ */}
            {chartView === 'scatter' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                {/* Header + axis selectors */}
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Scatter Plot</p>
                    <p className="text-xs text-slate-400">Explore relationships between any two metrics</p>
                  </div>
                  <div className="ml-auto flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      X-axis:
                      <select
                        value={scatterX}
                        onChange={e => setScatterX(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                        {SCATTER_METRICS.map(m => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      Y-axis:
                      <select
                        value={scatterY}
                        onChange={e => setScatterY(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                        {SCATTER_METRICS.map(m => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {kpisPerJob.length < 2 ? (
                  <p className="text-slate-400 text-sm text-center py-14">
                    Select at least 2 runs to use the scatter plot.
                  </p>
                ) : (
                  <ReactECharts option={scatterOption} style={{ height: 420 }} notMerge />
                )}
              </div>
            )}

            {/* ── Legend strip (always shown when runs are selected) ── */}
            {kpisPerJob.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                  Selected Runs
                </p>
                <div className="flex flex-wrap gap-2">
                  {kpisPerJob.map(({ job }, i) => (
                    <span key={job.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-700 border border-slate-100 bg-slate-50">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: colorMap[job.id] || jobColor(i) }} />
                      {job.modelName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
