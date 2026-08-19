import React, { useState, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { FiDownload, FiLayers, FiTrendingUp, FiGrid, FiChevronDown, FiChevronUp } from 'react-icons/fi';

// ─── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
  '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd',
];

// ─── KPI helpers ──────────────────────────────────────────────────────────────
const RENEWABLE_KW = ['solar','wind','hydro','biomass','geothermal','tidal','wave','pv','fv','eol','hid','nuclear'];
function isRenewable(name) {
  const n = name.toLowerCase();
  return RENEWABLE_KW.some(kw => n.includes(kw));
}

function extractKPIs(result) {
  if (!result) return null;
  const capByTech = {};
  const genByTech = {};
  const costByTech = result.costs_by_tech || {};

  Object.entries(result.capacities || {}).forEach(([key, val]) => {
    if (!val || val <= 0) return;
    const parts = key.split('::');
    if (parts.length < 2) return;
    const tech = parts[1].split(':')[0];
    if (/demand|unmet|transmission/i.test(tech)) return;
    capByTech[tech] = (capByTech[tech] || 0) + val;
  });

  Object.entries(result.generation || {}).forEach(([key, val]) => {
    if (!val || val <= 0) return;
    const parts = key.split('::');
    if (parts.length < 2) return;
    const tech = parts[1].split(':')[0];
    genByTech[tech] = (genByTech[tech] || 0) + val;
  });

  const totalCap  = Object.values(capByTech).reduce((s, v) => s + v, 0);
  const totalGen  = Object.values(genByTech).reduce((s, v) => s + v, 0);
  const totalCost = Object.values(costByTech).reduce((s, v) => s + v, 0);
  const renewableGen = Object.entries(genByTech).filter(([t]) => isRenewable(t)).reduce((s, [, v]) => s + v, 0);
  const lcoe = totalGen > 0 ? totalCost / totalGen : null;
  const totalUnmetMWh = result.total_unmet_demand_mwh || 0;
  const totalImportsMWh = result.imports_by_location
    ? Object.values(result.imports_by_location).reduce((s, v) => s + v, 0)
    : 0;

  return { capByTech, genByTech, costByTech, totalCap, totalGen, totalCost, renewableShare: totalGen > 0 ? renewableGen / totalGen : 0, lcoe, totalUnmetMWh, totalImportsMWh };
}

const fmtNum = (v, dec = 1) => {
  if (v == null || isNaN(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(dec) + 'G';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(dec) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(dec) + 'k';
  return v.toFixed(dec);
};

// ─── Sort variants by numeric label if possible ───────────────────────────────
function sortJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const na = parseFloat(a.variantLabel);
    const nb = parseFloat(b.variantLabel);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a.variantLabel).localeCompare(String(b.variantLabel));
  });
}

// ─── Build trajectory ECharts option ─────────────────────────────────────────
const TRAJECTORY_KPIS = [
  { id: 'objective',     label: 'Objective (€/yr)', fn: (job, kpis) => job.objective ?? null },
  { id: 'totalCap',      label: 'Total capacity (MW)', fn: (_, kpis) => kpis?.totalCap ?? null },
  { id: 'renewableShare',label: 'Renewable share (%)', fn: (_, kpis) => kpis ? kpis.renewableShare * 100 : null },
  { id: 'totalCost',     label: 'Total cost', fn: (_, kpis) => kpis?.totalCost ?? null },
  { id: 'lcoe',          label: 'LCOE (€/MWh)', fn: (_, kpis) => kpis?.lcoe ?? null },
  { id: 'totalUnmetMWh',  label: 'Unmet demand (MWh)', fn: (_, kpis) => kpis?.totalUnmetMWh ?? null },
  { id: 'totalImportsMWh',label: 'Net imports (MWh)',   fn: (_, kpis) => kpis?.totalImportsMWh ?? null },
];

function buildTrajectoryOption(sortedJobs, kpisMap, kpiId) {
  const kpiDef = TRAJECTORY_KPIS.find(k => k.id === kpiId) || TRAJECTORY_KPIS[0];
  const labels = sortedJobs.map(j => j.variantLabel);
  const values = sortedJobs.map(j => kpiDef.fn(j, kpisMap[j.id]));

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: { trigger: 'axis', formatter: (params) => `${params[0].name}<br/>${fmtNum(params[0].value)}` },
    grid: { top: 16, bottom: 40, left: 56, right: 16, containLabel: false },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', name: kpiDef.label, nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10, formatter: v => fmtNum(v, 0) } },
    series: [{
      type: 'line',
      data: values,
      smooth: false,
      symbolSize: 6,
      lineStyle: { color: '#3b82f6', width: 2 },
      itemStyle: { color: '#3b82f6' },
      markPoint: {
        data: [
          { type: 'min', label: { color: '#fff', fontSize: 10 } },
          { type: 'max', label: { color: '#fff', fontSize: 10 } },
        ],
        symbolSize: 40,
      },
    }],
  };
}

// ─── Build stacked capacity bar chart ─────────────────────────────────────────
function buildCapacityOption(sortedJobs, kpisMap) {
  const labels = sortedJobs.map(j => j.variantLabel);

  // Union of all techs across all variants (non-zero somewhere)
  const allTechs = [...new Set(
    sortedJobs.flatMap(j => Object.keys(kpisMap[j.id]?.capByTech || {}))
  )].filter(t => sortedJobs.some(j => (kpisMap[j.id]?.capByTech?.[t] || 0) > 0));

  const series = allTechs.map((tech, i) => ({
    name: tech.replace(/_/g, ' '),
    type: 'bar',
    stack: 'total',
    data: sortedJobs.map(j => +(kpisMap[j.id]?.capByTech?.[tech] || 0).toFixed(2)),
    itemStyle: { color: PALETTE[i % PALETTE.length] },
    emphasis: { focus: 'series' },
  }));

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      data: allTechs.map(t => t.replace(/_/g, ' ')),
      type: 'scroll', bottom: 0, textStyle: { fontSize: 10 },
    },
    grid: { top: 12, bottom: 56, left: 56, right: 16, containLabel: false },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', name: 'MW', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10, formatter: v => fmtNum(v, 0) } },
    series,
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportBatchCSV(sortedJobs, kpisMap, baseName) {
  const cols = [
    { header: 'Variant',        fn: (job)        => job.variantLabel },
    { header: 'Status',         fn: (job)        => job.status },
    { header: 'Engine',         fn: (job)        => job.engine || 'calliope06' },
    { header: 'Objective',      fn: (job)        => job.objective ?? '' },
    { header: 'Cap_MW',         fn: (_, kpis)    => kpis?.totalCap?.toFixed(2) ?? '' },
    { header: 'Gen_MWh',        fn: (_, kpis)    => kpis?.totalGen?.toFixed(2) ?? '' },
    { header: 'RE_pct',         fn: (_, kpis)    => kpis ? (kpis.renewableShare * 100).toFixed(2) : '' },
    { header: 'TotalCost',      fn: (_, kpis)    => kpis?.totalCost?.toFixed(2) ?? '' },
    { header: 'LCOE_EUR_MWh',   fn: (_, kpis)    => kpis?.lcoe?.toFixed(4) ?? '' },
    { header: 'UnmetDemand_MWh',fn: (_, kpis)    => kpis?.totalUnmetMWh?.toFixed(2) ?? '0' },
    { header: 'NetImports_MWh', fn: (_, kpis)    => kpis?.totalImportsMWh?.toFixed(2) ?? '0' },
  ];

  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = cols.map(c => escape(c.header)).join(',');
  const rows = sortedJobs.map(job => {
    const kpis = kpisMap[job.id];
    return cols.map(c => escape(c.fn(job, kpis))).join(',');
  });

  const csv = [header, ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${(baseName || 'batch').replace(/[^a-z0-9_-]/gi, '_')}_kpis.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── BatchComparison ──────────────────────────────────────────────────────────

export default function BatchComparison({ completedJobs }) {
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [trajectoryKpi, setTrajectoryKpi] = useState('objective');
  const [showTable, setShowTable] = useState(true);

  // Group jobs by batchId; only include batch-tagged jobs
  const batches = useMemo(() => {
    const map = {};
    for (const job of completedJobs) {
      if (!job.batchId) continue;
      if (!map[job.batchId]) map[job.batchId] = { batchId: job.batchId, jobs: [] };
      map[job.batchId].jobs.push(job);
    }
    return Object.values(map).sort((a, b) => {
      const latestA = Math.max(...a.jobs.map(j => new Date(j.completedAt).getTime()));
      const latestB = Math.max(...b.jobs.map(j => new Date(j.completedAt).getTime()));
      return latestB - latestA;
    });
  }, [completedJobs]);

  // Auto-select most recent batch
  const effectiveBatchId = selectedBatchId || batches[0]?.batchId || null;
  const selectedBatch = batches.find(b => b.batchId === effectiveBatchId) || null;

  const sortedJobs = useMemo(() => selectedBatch ? sortJobs(selectedBatch.jobs) : [], [selectedBatch]);

  const kpisMap = useMemo(() => {
    const m = {};
    for (const job of sortedJobs) m[job.id] = extractKPIs(job.result);
    return m;
  }, [sortedJobs]);

  const trajectoryOption = useMemo(
    () => sortedJobs.length ? buildTrajectoryOption(sortedJobs, kpisMap, trajectoryKpi) : null,
    [sortedJobs, kpisMap, trajectoryKpi]
  );
  const capacityOption = useMemo(
    () => sortedJobs.length ? buildCapacityOption(sortedJobs, kpisMap) : null,
    [sortedJobs, kpisMap]
  );

  if (batches.length === 0) return null;

  const baseName = sortedJobs[0]?.modelName?.replace(/ — .*$/, '') || '';
  const completedCount = sortedJobs.filter(j => j.status === 'completed').length;
  const failedCount = sortedJobs.filter(j => j.status === 'failed').length;
  const hasUnmet   = sortedJobs.some(j => (kpisMap[j.id]?.totalUnmetMWh || 0) > 0);
  const hasImports = sortedJobs.some(j => (kpisMap[j.id]?.totalImportsMWh || 0) > 0);

  // Multi-model detection
  const modelLabels = [...new Set(sortedJobs.map(j => j.modelLabel || j.modelName?.replace(/ — .*$/, '') || ''))];
  const isMultiModel = modelLabels.length > 1;
  // All unique variant labels in insertion order
  const variantLabels = [...new Set(sortedJobs.map(j => j.variantLabel))];
  // Matrix cell lookup: modelLabel → variantLabel → job
  const matrixCells = isMultiModel
    ? Object.fromEntries(modelLabels.map(ml => [
        ml,
        Object.fromEntries(variantLabels.map(vl => [
          vl,
          sortedJobs.find(j => (j.modelLabel || j.modelName?.replace(/ — .*$/, '') || '') === ml && j.variantLabel === vl) || null,
        ])),
      ]))
    : {};

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
        <FiLayers size={14} className="text-electric-500" /> Batch results
        {sortedJobs.length > 0 && (
          <button
            onClick={() => exportBatchCSV(sortedJobs, kpisMap, baseName)}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <FiDownload size={11} /> Export CSV
          </button>
        )}
      </h2>

      {/* Batch selector */}
      {batches.length > 1 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {batches.map((b, i) => {
            const n = b.jobs.length;
            const label = b.jobs[0]?.modelName?.replace(/ — .*$/, '') || b.batchId;
            return (
              <button key={b.batchId}
                onClick={() => setSelectedBatchId(b.batchId)}
                className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                  b.batchId === effectiveBatchId
                    ? 'bg-electric-600 text-white border-electric-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-electric-400'
                }`}>
                Batch {batches.length - i} — {label} ({n})
              </button>
            );
          })}
        </div>
      )}

      {/* Batch header */}
      {selectedBatch && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 text-xs text-slate-600 flex gap-4 flex-wrap">
          <span><span className="font-semibold text-slate-800">{baseName}</span></span>
          <span>{sortedJobs.length} variant{sortedJobs.length > 1 ? 's' : ''}</span>
          {completedCount > 0 && <span className="text-green-600">{completedCount} completed</span>}
          {failedCount > 0 && <span className="text-red-500">{failedCount} failed</span>}
        </div>
      )}

      {/* ── Multi-model matrix view ── */}
      {isMultiModel && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-3">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <FiLayers size={13} className="text-electric-500" />
            <span className="text-xs font-semibold text-slate-700">Model × Variant matrix</span>
            <span className="ml-auto text-xs text-slate-400">{modelLabels.length} models · {variantLabels.length} variants</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap min-w-[140px]">Model</th>
                  {variantLabels.map(vl => (
                    <th key={vl} className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">{vl}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modelLabels.map((ml, ri) => (
                  <tr key={ml} className={ri % 2 === 1 ? 'bg-slate-50' : ''}>
                    <td className="px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap max-w-[200px] truncate" title={ml}>{ml}</td>
                    {variantLabels.map(vl => {
                      const job = matrixCells[ml]?.[vl];
                      if (!job) return <td key={vl} className="px-3 py-1.5 text-right text-slate-300">—</td>;
                      if (job.status === 'failed') return (
                        <td key={vl} className="px-3 py-1.5 text-right">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">failed</span>
                        </td>
                      );
                      const kpis = kpisMap[job.id];
                      return (
                        <td key={vl} className="px-3 py-1.5 text-right font-mono text-slate-700">
                          <span title={`Cap: ${fmtNum(kpis?.totalCap)} MW · RE: ${kpis ? (kpis.renewableShare*100).toFixed(0) : '—'}%`}>
                            {fmtNum(job.objective)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">Cells show objective value. Hover for capacity and RE share.</p>
        </div>
      )}

      {/* Trajectory chart — single-model batches only */}
      {!isMultiModel && trajectoryOption && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <FiTrendingUp size={13} /> Trajectory
            </span>
            <select
              value={trajectoryKpi}
              onChange={e => setTrajectoryKpi(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-electric-400"
            >
              {TRAJECTORY_KPIS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
          <ReactECharts option={trajectoryOption} style={{ height: 180 }} notMerge />
        </div>
      )}

      {/* Capacity stacked bar — single-model batches only */}
      {!isMultiModel && capacityOption && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
          <span className="text-xs font-semibold text-slate-700 mb-2 block">Capacity by technology (MW)</span>
          <ReactECharts option={capacityOption} style={{ height: 220 }} notMerge />
        </div>
      )}

      {/* KPI table */}
      {sortedJobs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowTable(t => !t)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <span className="flex items-center gap-1.5"><FiGrid size={13} /> KPI table</span>
            {showTable ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
          </button>
          {showTable && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">Variant</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">Status</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">Objective</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">Cap (MW)</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">Gen (MWh)</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">RE %</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">LCOE</th>
                    {hasUnmet   && <th className="text-right px-3 py-1.5 font-semibold text-amber-600 whitespace-nowrap">Unmet (MWh)</th>}
                    {hasImports && <th className="text-right px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">Imports (MWh)</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedJobs.map((job, i) => {
                    const kpis = kpisMap[job.id];
                    const isOdd = i % 2 === 1;
                    return (
                      <tr key={job.id} className={isOdd ? 'bg-slate-50' : ''}>
                        <td className="px-3 py-1.5 font-mono text-slate-800 font-semibold whitespace-nowrap">{job.variantLabel}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            job.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>{job.status}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtNum(job.objective)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtNum(kpis?.totalCap)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtNum(kpis?.totalGen)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                          {kpis ? (kpis.renewableShare * 100).toFixed(1) + '%' : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtNum(kpis?.lcoe)}</td>
                        {hasUnmet   && (
                          <td className={`px-3 py-1.5 text-right font-mono ${(kpis?.totalUnmetMWh || 0) > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                            {(kpis?.totalUnmetMWh || 0) > 0 ? fmtNum(kpis.totalUnmetMWh) : '—'}
                          </td>
                        )}
                        {hasImports && <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtNum(kpis?.totalImportsMWh)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
