// SporesTab — self-contained SPORES results view.
// Owns its result-derived computation, its own view state, and its isGenTech
// predicate, so it drops into both Results and Scenario Studio with just
// { result, modelLocations }.
import { useMemo, useState } from 'react';
import { FiActivity, FiBarChart2, FiDollarSign, FiFilter, FiGitMerge, FiGrid, FiLayers, FiMap, FiShare2 } from '../../ui/icons';
import ReactECharts from 'echarts-for-react';
import { GroupedCorrMatrixSVG, ResultsMap } from '../ResultMaps';
import { autoScale, axisNameStyle, fmtCost, makeIsGenTech, techColor } from '../../../utils/resultFormat';
import SporesPaperPanel from '../SporesPaperPanel';
import SporesEnsembleComparison from '../SporesEnsembleComparison';
import SporesPaperFigures from '../spores/SporesPaperFigures';
import { hasPaperFigures } from '../../../services/sporesFigures';
import SelectField from '../../ui/SelectField';
import { classifyTechs, groupUtilisation } from '../../../services/sporesAnalysis';
import { figureMetrics } from '../../../services/sporesAutoMetrics';

const CLASS_CHIP = {
  'must-have': 'bg-gray-200 text-gray-700',
  'costly to replace': 'bg-gray-100 text-gray-600',
  'real choice': 'bg-gray-50 text-gray-500',
};

export default function SporesTab({
  result,
  modelLocations,
  completedJobs = [],
  batchId = null,
}) {
              const isGenTech = useMemo(() => makeIsGenTech(result), [result]);
              const [selectedSpore, setSelectedSpore] = useState(0);
              const [costOpen, setCostOpen] = useState(false);
              const [moreOpen, setMoreOpen] = useState(false);
              const [sporeScatterA, setSporeScatterA] = useState(null);
              const [sporeScatterB, setSporeScatterB] = useState(null);
              const [corrLocFilter, setCorrLocFilter] = useState(() => new Set());
              const sporesData = result.spores_data;
              const optimalCost = sporesData[0]?.cost ?? null;

              // ── Collect unique generation/storage techs only ──
              const allTechSet = new Set();
              sporesData.forEach(spore => {
                Object.keys(spore.capacities || {}).forEach(loctech => {
                  const parts = loctech.split('::');
                  const tech = parts.length >= 2 ? parts[1] : loctech;
                  if (isGenTech(tech)) allTechSet.add(tech);
                });
              });
              const allTechs = [...allTechSet].sort();

              // Per-SPORE total capacity by tech (summed over all locations)
              const sporeCapByTech = sporesData.map(spore => {
                const byTech = {};
                allTechs.forEach(t => { byTech[t] = 0; });
                Object.entries(spore.capacities || {}).forEach(([loctech, cap]) => {
                  const parts = loctech.split('::');
                  const tech = parts.length >= 2 ? parts[1] : loctech;
                  if (Object.prototype.hasOwnProperty.call(byTech, tech)) {
                    byTech[tech] += Number(cap) || 0;
                  }
                });
                return byTech;
              });

              // Techs with non-trivial capacity in at least one SPORE
              const activeTechs = allTechs.filter(t =>
                sporeCapByTech.some(s => s[t] > 0.1)
              );

              // Per-tech array of totals across SPORES
              const techTotals = {};
              activeTechs.forEach(t => {
                techTotals[t] = sporeCapByTech.map(s => s[t]);
              });

              const sporeLabels = sporesData.map(s => s.spore_id === 0 ? 'Optimal' : `S${s.spore_id}`);

              // ── Stacked bar + cost line (generic results) ──
              const allTotals = sporesData.map((_, i) =>
                activeTechs.reduce((sum, t) => sum + sporeCapByTech[i][t], 0)
              );
              const { div: capDiv, unit: capUnit } = autoScale(Math.max(...allTotals, 1), 'MW');
              const costs = sporesData.map(s => s.cost);
              const { div: costDiv, unit: costUnit } = autoScale(Math.max(...costs.map(Math.abs), 1), '€');

              const stackedBarOption = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 } },
                grid: { top: 20, right: 80, bottom: 70, left: 70 },
                xAxis: { type: 'category', data: sporeLabels, axisLabel: { fontSize: 11 } },
                yAxis: [
                  { type: 'value', ...axisNameStyle(capUnit) },
                  { type: 'value', ...axisNameStyle(costUnit), splitLine: { show: false } },
                ],
                series: [
                  ...activeTechs.map(tech => ({
                    name: tech.replace(/_/g, ' '),
                    type: 'bar',
                    stack: 'total',
                    yAxisIndex: 0,
                    data: sporeCapByTech.map(s => +(s[tech] / capDiv).toFixed(2)),
                    itemStyle: { color: techColor(tech) },
                    emphasis: { focus: 'series' },
                  })),
                  {
                    name: 'System cost',
                    type: 'line',
                    yAxisIndex: 1,
                    data: costs.map(c => +(c / costDiv).toFixed(3)),
                    symbol: 'circle', symbolSize: 6,
                    lineStyle: { color: '#F59E0B', width: 2 },
                    itemStyle: { color: '#F59E0B' },
                    zlevel: 10,
                  },
                ],
              };

              // ── Variability strip/dot chart (generic results) ──
              // Each tech = one horizontal row; each SPORE = one dot at its capacity value.
              const allStripVals = activeTechs.flatMap(t => techTotals[t]);
              const { div: stripDiv, unit: stripUnit } = autoScale(Math.max(...allStripVals, 1), 'MW');
              // Scatter data: [x=capacity, y=tech-index, label=spore_id]
              const stripScatterData = [];
              activeTechs.forEach((tech, row) => {
                techTotals[tech].forEach((cap, sporeIdx) => {
                  stripScatterData.push({
                    value: [+(cap / stripDiv).toFixed(3), row],
                    sporeLabel: sporeLabels[sporeIdx],
                    itemStyle: { color: techColor(tech) },
                  });
                });
              });
              const stripOption = {
                backgroundColor: 'transparent',
                tooltip: {
                  trigger: 'item',
                  formatter: p => `<b>${activeTechs[p.data.value[1]]?.replace(/_/g, ' ')}</b><br/>${p.data.sporeLabel}: ${p.data.value[0]} ${stripUnit}`,
                },
                grid: { top: 10, right: 20, bottom: 40, left: 110 },
                xAxis: { type: 'value', ...axisNameStyle(stripUnit), min: 0 },
                yAxis: {
                  type: 'category',
                  data: activeTechs.map(t => t.replace(/_/g, ' ')),
                  axisLabel: { fontSize: 10 },
                  inverse: true,
                },
                series: [{
                  type: 'scatter',
                  symbolSize: 8,
                  data: stripScatterData,
                }],
              };

              // ── Pairwise trade-off scatter (generic results) ──
              const scatterTechA = (sporeScatterA && activeTechs.includes(sporeScatterA)) ? sporeScatterA : activeTechs[0];
              const scatterTechB = (sporeScatterB && activeTechs.includes(sporeScatterB) && sporeScatterB !== scatterTechA)
                ? sporeScatterB
                : activeTechs.find(t => t !== scatterTechA) || activeTechs[0];
              const { div: scaDivA, unit: scaUnitA } = autoScale(Math.max(...(techTotals[scatterTechA] || [0]), 1), 'MW');
              const { div: scaDivB, unit: scaUnitB } = autoScale(Math.max(...(techTotals[scatterTechB] || [0]), 1), 'MW');
              const pairScatterData = sporesData.map((spore, i) => ({
                value: [
                  +((sporeCapByTech[i][scatterTechA] || 0) / scaDivA).toFixed(3),
                  +((sporeCapByTech[i][scatterTechB] || 0) / scaDivB).toFixed(3),
                ],
                label: sporeLabels[i],
              }));
              const pairScatterOption = {
                backgroundColor: 'transparent',
                tooltip: {
                  trigger: 'item',
                  formatter: p => `<b>${p.data.label}</b><br/>${scatterTechA.replace(/_/g,' ')}: ${p.data.value[0]} ${scaUnitA}<br/>${scatterTechB.replace(/_/g,' ')}: ${p.data.value[1]} ${scaUnitB}`,
                },
                grid: { top: 20, right: 20, bottom: 50, left: 70 },
                xAxis: { type: 'value', name: `${scatterTechA.replace(/_/g,' ')} (${scaUnitA})`, nameLocation: 'middle', nameGap: 30, nameTextStyle: { fontSize: 10, color: '#64748b' } },
                yAxis: { type: 'value', name: `${scatterTechB.replace(/_/g,' ')} (${scaUnitB})`, nameLocation: 'middle', nameGap: 45, nameTextStyle: { fontSize: 10, color: '#64748b' } },
                series: [{
                  type: 'scatter',
                  symbolSize: 10,
                  data: pairScatterData,
                  itemStyle: { color: '#3B82F6', opacity: 0.8 },
                  label: { show: sporesData.length <= 20, formatter: p => p.data.label, position: 'right', fontSize: 9, color: '#64748b' },
                  emphasis: { label: { show: true } },
                }],
              };

              // ── Parallel coordinates (generic results) ──
              // Each axis = one technology, each line = one SPORE.
              // Limit to ≤12 techs (most active by max capacity) for readability.
              const parallelTechs = [...activeTechs]
                .sort((a, b) => Math.max(...techTotals[b]) - Math.max(...techTotals[a]))
                .slice(0, 12);
              const parallelDims = parallelTechs.map((tech, i) => {
                const vals = techTotals[tech];
                const { div: pd, unit: pu } = autoScale(Math.max(...vals, 1), 'MW');
                return { dim: i, name: tech.replace(/_/g, ' ') + ` (${pu})`, min: 0, max: +(Math.max(...vals) / pd * 1.05).toFixed(2), _div: pd };
              });
              const parallelData = sporesData.map((spore, sIdx) =>
                parallelTechs.map((tech, tIdx) =>
                  +((sporeCapByTech[sIdx][tech] || 0) / parallelDims[tIdx]._div).toFixed(3)
                )
              );
              const parallelOption = {
                backgroundColor: 'transparent',
                tooltip: {
                  trigger: 'item',
                  formatter: p => {
                    if (!Array.isArray(p.data)) return '';
                    return `<b>${sporeLabels[p.dataIndex]}</b><br/>` +
                      parallelTechs.map((t, i) => `${t.replace(/_/g,' ')}: ${p.data[i]}`).join('<br/>');
                  },
                },
                parallelAxis: parallelDims.map(d => ({
                  dim: d.dim, name: d.name, min: d.min, max: d.max,
                  nameTextStyle: { fontSize: 9, color: '#475569' },
                  axisLabel: { fontSize: 8 },
                })),
                parallel: { top: 40, right: 30, bottom: 30, left: 30 },
                series: [{
                  type: 'parallel',
                  lineStyle: { width: 1.5, opacity: 0.7 },
                  data: parallelData.map((d, i) => ({
                    value: d,
                    lineStyle: { color: sporesData[i].spore_id === 0 ? '#F59E0B' : '#3B82F6', opacity: sporesData[i].spore_id === 0 ? 1 : 0.55 },
                  })),
                }],
              };

              // ── Classification (paper rule, on the utilisation groups) ──
              const meta = result.spores_meta;
              const paper = hasPaperFigures(result);
              const classMetrics = paper ? figureMetrics(result, { locations: modelLocations }) : null;
              const classUtil = classMetrics ? sporesData.map(s => groupUtilisation(s, meta || {}, classMetrics)) : [];
              const classRows = classMetrics ? classifyTechs([{ slack: meta?.plan?.slack ?? 0, utilisation: classUtil.slice(1) }]) : [];
              // Per-technology views of earlier versions: kept, behind a toggle, for models other than the Italy preset
              const moreViews = !paper || (classMetrics?.auto && moreOpen);

              // ── Per-SPORE map data ──
              const safeSpore = Math.min(selectedSpore, sporesData.length - 1);
              const sporeForMap = sporesData[safeSpore] || sporesData[0];
              // Build capacitiesByLoc and dominantTechByLoc from selected SPORE
              const sporeCapsByLoc = {};
              const sporeDomByLoc = {};
              Object.entries(sporeForMap.capacities || {}).forEach(([loctech, cap]) => {
                const parts = loctech.split('::');
                const loc = parts[0]; const tech = parts.length >= 2 ? parts[1] : '';
                if (!isGenTech(tech) || !(Number(cap) > 0)) return;
                sporeCapsByLoc[loc] = (sporeCapsByLoc[loc] || 0) + Number(cap);
                if (!sporeDomByLoc[loc] || (techTotals[tech]?.[safeSpore] || 0) > (techTotals[sporeDomByLoc[loc]]?.[safeSpore] || 0)) {
                  sporeDomByLoc[loc] = tech;
                }
              });

              // ── Per-location Spearman correlation matrix ─────────────────
              const rankArr = arr => {
                const idx = [...arr].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
                const ranks = new Array(arr.length);
                idx.forEach(([, origI], rank) => { ranks[origI] = rank + 1; });
                return ranks;
              };
              const spearman = (a, b) => {
                if (a.length < 3) return NaN;
                const ra = rankArr(a), rb = rankArr(b), n = a.length;
                const d2 = ra.reduce((sum, _, i) => sum + (ra[i] - rb[i]) ** 2, 0);
                return 1 - (6 * d2) / (n * (n * n - 1));
              };

              // Build per-(loc, tech) capacity series across all SPORES
              const ltSeriesMap = {};
              sporesData.forEach((spore, si) => {
                Object.entries(spore.capacities || {}).forEach(([key, val]) => {
                  const parts = key.split('::');
                  if (parts.length < 2) return;
                  const [sloc, stech] = [parts[0], parts[1]];
                  if (!isGenTech(stech)) return;
                  if (!ltSeriesMap[key]) ltSeriesMap[key] = new Array(sporesData.length).fill(0);
                  ltSeriesMap[key][si] = Number(val) || 0;
                });
              });

              // Collect unique locations in model definition order
              const sporesLocs = [...new Set(Object.keys(ltSeriesMap).map(k => k.split('::')[0]))];
              const mLocOrder = modelLocations.map(l => l.calliopeName || l.name);
              sporesLocs.sort((a, b) => {
                const ia = mLocOrder.indexOf(a), ib = mLocOrder.indexOf(b);
                return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib) || a.localeCompare(b);
              });

              // Atoms: (loc, tech) pairs present and non-trivial in at least one SPORE
              const ltAtoms = [];
              sporesLocs.forEach(loc => {
                activeTechs.forEach(tech => {
                  const series = ltSeriesMap[`${loc}::${tech}`];
                  if (series && series.some(v => v > 0.01)) {
                    ltAtoms.push({ loc, tech, key: `${loc}::${tech}`, series });
                  }
                });
              });

              // Groups: one per location with its atoms
              const ltGroups = sporesLocs.map(loc => ({
                loc,
                displayName: modelLocations.find(l => (l.calliopeName || l.name) === loc)?.name || loc.replace(/_/g, ' '),
                atoms: ltAtoms.filter(a => a.loc === loc),
              })).filter(g => g.atoms.length > 0);

              // Compute Spearman ρ for all atom pairs (upper triangle → mirrored)
              const ltCorrMap = {};
              // Paper results show Figure 3 instead; this matrix is only drawn for generic results
              for (let i = 0; moreViews && i < ltAtoms.length; i++) {
                for (let j = i + 1; j < ltAtoms.length; j++) {
                  const rho = spearman(ltAtoms[i].series, ltAtoms[j].series);
                  if (!isNaN(rho)) {
                    ltCorrMap[`${ltAtoms[i].key}:::${ltAtoms[j].key}`] = rho;
                    ltCorrMap[`${ltAtoms[j].key}:::${ltAtoms[i].key}`] = rho;
                  }
                }
              }

              // Apply location filter — empty Set = nothing selected yet
              const visLtGroups = corrLocFilter.size > 0
                ? ltGroups.filter(g => corrLocFilter.has(g.loc))
                : [];

              // ── Cost summary chart: % above the cost optimum per SPORE, coloured by stage ──
              const STAGE_COLOR = { explore: '#64748b', minimise: '#0d9488' };
              const costAbove = sporesData.slice(1).map(s => (optimalCost ? (s.cost - optimalCost) / Math.abs(optimalCost) * 100 : 0));
              const costOption = {
                backgroundColor: 'transparent', animation: false,
                tooltip: { trigger: 'item', formatter: p => `SPORE ${p.name}${p.data.stage ? ` · ${p.data.stage}` : ''}<br/>${fmtCost(p.data.cost)} · +${p.value.toFixed(2)}%` },
                grid: { top: 10, right: 10, bottom: 24, left: 44 },
                xAxis: { type: 'category', data: sporesData.slice(1).map(s => s.spore_id), axisLabel: { fontSize: 9, interval: 'auto' }, axisTick: { show: false } },
                yAxis: { type: 'value', axisLabel: { fontSize: 9, formatter: v => `${v}%` }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
                series: [{ type: 'bar', barCategoryGap: '20%', data: sporesData.slice(1).map((s, i) => ({
                  value: +costAbove[i].toFixed(3), cost: s.cost, stage: s.stage, itemStyle: { color: STAGE_COLOR[s.stage] || '#94a3b8' },
                })) }],
              };

              return (
                <div className="space-y-4">

                  {/* Banner */}
                  <div className="bg-surface-container-low border border-black/15 rounded-2xl p-4 flex items-start gap-3">
                    <FiGitMerge className="text-electric-500 mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="text-sm font-semibold text-electric-700">{sporesData.length} near-optimal solutions explored</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        SPORE 0 is the cost-optimal reference. SPORES 1–{sporesData.length - 1} are spatially diverse alternatives within the cost slack budget. Lombardi et al. (Joule 2020).
                      </p>
                    </div>
                  </div>

                  {/* Cost summary: headline numbers + one bar per SPORE; the full table on demand */}
                  <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <FiDollarSign size={14} /> Cost Summary
                      </h3>
                      <span className="text-xs text-slate-500">
                        Cost optimum {fmtCost(optimalCost)} · {sporesData.length - 1} SPORES
                        {costAbove.length > 0 && <> · +{Math.min(...costAbove).toFixed(1)}% to +{Math.max(...costAbove).toFixed(1)}% above it</>}
                      </span>
                      <button onClick={() => setCostOpen(o => !o)} className="ml-auto text-xs text-electric-600 hover:underline">
                        {costOpen ? 'Hide table' : `Show all ${sporesData.length} solutions`}
                      </button>
                    </div>
                    <ReactECharts option={costOption} style={{ height: 150 }} notMerge />
                    {costOpen && (
                      <div className="overflow-auto max-h-72 mt-2 border border-black/10">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-black/10">
                              <th className="text-left py-2 px-3 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Solution</th>
                              <th className="text-left py-2 px-3 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Stage</th>
                              <th className="text-right py-2 px-3 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Total cost</th>
                              <th className="text-right py-2 px-3 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">% above optimal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {sporesData.map(s => {
                              const pct = optimalCost && s.spore_id > 0
                                ? ((s.cost - optimalCost) / Math.abs(optimalCost) * 100).toFixed(1)
                                : null;
                              return (
                                <tr key={s.spore_id} className={s.spore_id === 0 ? 'bg-electric-50/60' : 'hover:bg-slate-50/60'}>
                                  <td className="py-1.5 px-3 font-mono text-slate-700">{s.spore_id === 0 ? '0 — cost-optimal' : `SPORE ${s.spore_id}`}</td>
                                  <td className="py-1.5 px-3 text-xs text-slate-500">{s.stage ? `${s.stage}${s.target ? `: ${[].concat(s.target).join(', ')}` : ''}` : '—'}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{fmtCost(s.cost)}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{pct != null ? <span className="text-gray-600">+{pct}%</span> : <span className="text-slate-400">—</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {paper && <SporesPaperFigures result={result} modelLocations={modelLocations} />}
                  {paper && <SporesEnsembleComparison completedJobs={completedJobs} initialBatchId={batchId} />}

                  {/* Per-technology views (not the paper's figures) */}
                  {paper && classMetrics?.auto && (
                    <button onClick={() => setMoreOpen(o => !o)} className="text-xs text-electric-600 hover:underline">
                      {moreOpen ? 'Hide per-technology views' : 'More views: capacity per technology, pairwise trade-offs, parallel coordinates, correlation per location'}
                    </button>
                  )}
                  {moreViews && (<>
                  {/* Technology mix + cost line */}
                  <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiBarChart2 size={14} /> Technology Mix &amp; System Cost per Solution
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Stacked bars: total installed capacity by technology. Amber line: system cost (right axis). All solutions lie within the cost slack of the optimum.
                    </p>
                    <ReactECharts option={stackedBarOption} style={{ height: 380 }} />
                  </div>

                  {/* Technology variability strip chart */}
                  <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiActivity size={14} /> Technology Deployment Variability
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Each dot is one solution. Technologies clustered far from zero are <span className="font-medium text-gray-700">must-haves</span>; those scattered down to zero are <span className="font-medium text-gray-500">real choices</span>.
                    </p>
                    <ReactECharts option={stripOption} style={{ height: Math.max(260, activeTechs.length * 30 + 60) }} />
                  </div>

                  {/* Pairwise trade-off scatter */}
                  <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiShare2 size={14} /> Pairwise Technology Trade-off
                    </h3>
                    <p className="text-xs text-slate-400 mb-2">
                      Each dot = one solution. <span className="font-medium text-gray-700">Negative slope</span> = substitutes. <span className="font-medium text-gray-500">Positive slope</span> = complements.
                    </p>
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1">
                        <label className="block text-[0.6875rem] text-black/60 mb-1 font-bold uppercase tracking-widest">X-axis technology</label>
                        <SelectField
                          value={scatterTechA}
                          onChange={e => setSporeScatterA(e.target.value)}
                          className="w-full text-xs border border-black/15 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                        >
                          {activeTechs.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </SelectField>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[0.6875rem] text-black/60 mb-1 font-bold uppercase tracking-widest">Y-axis technology</label>
                        <SelectField
                          value={scatterTechB}
                          onChange={e => setSporeScatterB(e.target.value)}
                          className="w-full text-xs border border-black/15 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                        >
                          {activeTechs.filter(t => t !== scatterTechA).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </SelectField>
                      </div>
                    </div>
                    <ReactECharts option={pairScatterOption} style={{ height: 320 }} />
                  </div>

                  {/* Parallel coordinates */}
                  {activeTechs.length >= 2 && (
                    <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                        <FiFilter size={14} /> Near-Optimal Space (Parallel Coordinates)
                      </h3>
                      <p className="text-xs text-slate-400 mb-3">
                        Each line = one solution. <span className="font-medium text-gray-700">Bold</span> = cost-optimal (SPORE 0). Gray lines = near-optimal alternatives.
                        {parallelTechs.length < activeTechs.length && ` Showing top ${parallelTechs.length} technologies by maximum capacity.`}
                      </p>
                      <ReactECharts option={parallelOption} style={{ height: 320 }} />
                    </div>
                  )}

                  </>)}

                  {/* Per-SPORE geographic map */}
                  {modelLocations && modelLocations.length > 0 && (
                    <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <FiMap size={14} /> Geographic Capacity Distribution per Solution
                      </h3>
                      <div className="flex items-center gap-3 mb-3">
                        <label className="text-xs text-slate-500 shrink-0">Solution:</label>
                        <SelectField
                          value={safeSpore}
                          onChange={e => setSelectedSpore(+e.target.value)}
                          className="text-xs border border-black/15 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                        >
                          {sporesData.map(s => (
                            <option key={s.spore_id} value={s.spore_id}>
                              {s.spore_id === 0 ? '0 — Cost-optimal' : `SPORE ${s.spore_id}`}
                              {s.cost != null ? ` · ${fmtCost(s.cost)}` : ''}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                      <ResultsMap
                        key={safeSpore}
                        locations={modelLocations}
                        capacitiesByLoc={sporeCapsByLoc}
                        dominantTechByLoc={sporeDomByLoc}
                        generationByLoc={{}}
                        viewMode="capacity"
                        colorFn={techColor}
                        transmissionLinks={[]}
                      />
                    </div>
                  )}

                  {/* Technology Deployment Correlation — grouped location×tech matrix */}
                  {moreViews && ltAtoms.length >= 3 && sporesData.length >= 3 && (
                    <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                        <FiGrid size={14} /> Technology Deployment Correlation
                      </h3>
                      <p className="text-xs text-slate-400 mb-3">
                        Spearman ρ of capacity utilisation across all {sporesData.length} SPORES, grouped by region.{' '}
                        <span className="font-medium text-gray-800">Dark (+1)</span> = deployed together.{' '}
                        <span className="font-medium text-gray-400">Light (−1)</span> = substitutes.{' '}
                        Square size ∝ |ρ|. Self-correlation not shown. Hover for values.
                      </p>

                      {/* Region selector — click to add/remove from the matrix */}
                      {ltGroups.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="text-xs text-slate-400 shrink-0">Select regions:</span>
                          {ltGroups.map(g => {
                            const selected = corrLocFilter.has(g.loc);
                            return (
                              <button key={g.loc}
                                onClick={() => {
                                  const next = new Set(corrLocFilter);
                                  if (next.has(g.loc)) next.delete(g.loc); else next.add(g.loc);
                                  setCorrLocFilter(next);
                                }}
                                style={{
                                  fontSize: 11, padding: '2px 9px', borderRadius: 0, border: 'none',
                                  cursor: 'pointer', fontFamily: "'DM Sans', system-ui", fontWeight: 600,
                                  background: selected ? '#1e293b' : '#f1f5f9',
                                  color: selected ? '#fff' : '#94a3b8',
                                  transition: 'background 0.12s, color 0.12s',
                                }}>
                                {g.displayName}
                              </button>
                            );
                          })}
                          {corrLocFilter.size > 0 && corrLocFilter.size < ltGroups.length && (
                            <button onClick={() => setCorrLocFilter(new Set(ltGroups.map(g => g.loc)))}
                              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 0,
                                       border: '1px solid #e2e8f0', cursor: 'pointer',
                                       background: 'white', color: '#64748b', fontFamily: "'DM Sans', system-ui" }}>
                              Select all
                            </button>
                          )}
                          {corrLocFilter.size > 0 && (
                            <button onClick={() => setCorrLocFilter(new Set())}
                              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 0,
                                       border: '1px solid #e2e8f0', cursor: 'pointer',
                                       background: 'white', color: '#64748b', fontFamily: "'DM Sans', system-ui" }}>
                              Clear
                            </button>
                          )}
                        </div>
                      )}

                      {visLtGroups.length >= 1
                        ? <GroupedCorrMatrixSVG ltGroups={visLtGroups} ltCorrMap={ltCorrMap} />
                        : <p className="text-xs text-slate-400 py-6 text-center">
                            Select one or more regions above to display their correlation matrix.
                          </p>
                      }
                    </div>
                  )}

                  {/* Classification table (paper rule on utilisation of the expansion potential) */}
                  {classRows.length > 0 && (
                  <div className="bg-white rounded-2xl border border-black/15 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiLayers size={14} /> Technology Classification
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Utilisation of the capacity expansion potential across the {sporesData.length - 1} SPORES of this ensemble.{' '}
                      <span className="font-medium text-gray-800">Must-have</span> = never fully avoided.{' '}
                      <span className="font-medium text-gray-400">Real choice</span> = fully avoided in at least one SPORE.{' '}
                      Costly to replace (avoidable only at higher relaxations) needs several relaxations of one batch.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-black/10">
                            <th className="text-left py-2 pr-4 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Technology</th>
                            <th className="text-right py-2 pr-4 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Cost-optimal</th>
                            <th className="text-right py-2 pr-4 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Median</th>
                            <th className="text-right py-2 pr-4 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Avoided in</th>
                            <th className="text-left py-2 text-[0.6875rem] font-bold text-black/60 uppercase tracking-widest">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {classRows.map(c => {
                            const sl = Object.keys(c.zeroShare)[0];
                            const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(0)}%`);
                            return (
                              <tr key={c.tech} className="hover:bg-slate-50/60">
                                <td className="py-2 pr-4 text-slate-700">{c.tech.replace(/_/g, ' ')}</td>
                                <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{pct(classUtil[0]?.[c.tech])}</td>
                                <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{pct(c.median[sl])}</td>
                                <td className="py-2 pr-4 text-right tabular-nums text-slate-400 text-xs">{pct(c.zeroShare[sl])}</td>
                                <td className="py-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${CLASS_CHIP[c.class]}`}>{c.class}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                  <SporesPaperPanel result={result} />

                </div>
              );
}

