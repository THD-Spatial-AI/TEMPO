import React, { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { FiLayers, FiTrendingUp, FiGrid, FiChevronDown, FiChevronUp } from 'react-icons/fi';

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

  return { capByTech, genByTech, costByTech, totalCap, totalGen, totalCost, renewableShare: totalGen > 0 ? renewableGen / totalGen : 0, lcoe };
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

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
        <FiLayers size={14} className="text-electric-500" /> Batch results
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

      {/* Trajectory chart */}
      {trajectoryOption && (
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

      {/* Capacity stacked bar */}
      {capacityOption && (
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
