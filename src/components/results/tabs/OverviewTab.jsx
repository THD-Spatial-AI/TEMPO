// OverviewTab — the "overview" result tab, extracted verbatim from Results.jsx.
// Renders the pre-computed chart options / data passed as props.
import { FiBarChart2, FiChevronDown, FiMap, FiMapPin, FiPieChart, FiShare2, FiTrendingUp, FiZap } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import { ResultsMap, TransmissionFlowMap } from '../ResultMaps';
import { autoScale, axisNameStyle, fmtCost, fmtEnergy, fmtPower, scaledFmt } from '../../../utils/resultFormat';

export default function OverviewTab({
  capBarOption,
  capLocOption,
  derivedData,
  genDonutOption,
  hasFlow,
  mapView,
  modelLocations,
  result,
  sectionOpen,
  selectedJobId,
  setMapView,
  techColorFn,
  toggleSection,
  transmissionFlowData,
  transmissionLinks,
}) {
  return (
              <div className="space-y-4">
                {/* Map — full width, main visual */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
                      <FiMap size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm">Location Map</span>
                      <div className="ml-auto flex gap-1">
                        {[
                          { id: 'capacity',     label: 'Capacity',     icon: FiBarChart2 },
                          ...(hasFlow ? [{ id: 'generation', label: 'Gen Heatmap', icon: FiZap }] : []),
                          { id: 'transmission', label: 'Transmission', icon: FiShare2 },
                        ].map(({ id, label, icon: Icon }) => (
                          <button key={id} onClick={() => setMapView(id)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                              mapView === id ? 'bg-gray-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}>
                            <Icon size={10} /> {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ height: mapView === 'transmission' ? 560 : 480 }}>
                      {modelLocations.length > 0 ? (
                        mapView === 'transmission' ? (
                          <TransmissionFlowMap
                            key={selectedJobId + '-transmission'}
                            locations={modelLocations}
                            transmissionFlowData={transmissionFlowData}
                            capacitiesByLoc={derivedData?.capByLoc || {}}
                            timestamps={derivedData?.timestamps || []}
                          />
                        ) : (
                          <ResultsMap key={selectedJobId + '-' + mapView}
                            locations={modelLocations}
                            capacitiesByLoc={derivedData?.capByLoc || {}}
                            dominantTechByLoc={derivedData?.domTech || {}}
                            generationByLoc={derivedData?.genByLoc || {}}
                            viewMode={mapView}
                            colorFn={techColorFn}
                            transmissionLinks={transmissionLinks}
                          />
                        )
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                          <FiMapPin size={20} className="mr-2 opacity-40" /> Location data unavailable
                        </div>
                      )}
                    </div>
                </div>
                {/* Capacity + Generation row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Capacity by tech */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cap-by-tech')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiBarChart2 size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Installed Capacity by Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cap-by-tech') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cap-by-tech') && <div className="px-5 pb-5">
                      {capBarOption ? (
                        <ReactECharts option={capBarOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-16">No capacity data</div>}
                    </div>}
                  </div>
                  {/* Generation donut */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('gen-mix')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiPieChart size={14} className="text-gray-500 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Generation Mix</span>
                      <span className="text-xs text-slate-400 mr-1">· MWh total</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('gen-mix') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('gen-mix') && <div className="px-5 pb-5">
                      {genDonutOption ? (
                        <ReactECharts option={genDonutOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-16">No generation data</div>}
                    </div>}
                  </div>
                  {/* Capacity by location */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cap-by-loc')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiMapPin size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Capacity by Location & Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cap-by-loc') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cap-by-loc') && <div className="px-5 pb-5">
                      {capLocOption ? (
                        <ReactECharts option={capLocOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-16">No location data</div>}
                    </div>}
                  </div>
                </div>

                {/* Technology summary table */}
                {derivedData?.capByTech && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('tech-summary')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiTrendingUp size={14} className="text-slate-500 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Technology Summary</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('tech-summary') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('tech-summary') && <div className="px-5 pb-5 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 pr-6 font-semibold text-slate-500 text-xs uppercase tracking-wide">Technology</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Capacity</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Generation</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Cost</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">€ / MWh</th>
                            <th className="text-right py-2 pl-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Cap. Factor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(derivedData.capByTech).sort().map((tech, i) => {
                            const cap = derivedData.capByTech[tech] || 0;
                            const gen = derivedData.genByTech[tech] || 0;
                            const cost = result?.costs_by_tech?.[tech] || 0;
                            const hrs = (result?.timestamps?.length) || 8760;
                            const cf = cap > 0 ? (gen / (cap * hrs) * 100) : null;
                            const cpm = gen > 0 && cost > 0 ? (cost / gen) : null;
                            return (
                              <tr key={tech} className={i % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/50'}>
                                <td className="py-2.5 pr-6">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: techColorFn(tech) }} />
                                    <span className="font-medium text-slate-700 capitalize">{tech.replace(/_/g, ' ')}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{fmtPower(cap)}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{gen > 0 ? fmtEnergy(gen) : '—'}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{cost > 0 ? fmtCost(cost) : '—'}</td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-600">{cpm != null ? cpm.toFixed(2) : '—'}</td>
                                <td className="py-2.5 pl-4 text-right font-mono text-xs">
                                  {cf != null ? (
                                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                      {cf.toFixed(1)}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>}
                  </div>
                )}

                {/* Transmission Capacity */}
                {(derivedData?.txLinks?.length > 0) && (() => {
                  const allLinks = derivedData.txLinks;
                  // Separate constrained links from unconstrained (free_transmission, ≥50 GW threshold)
                  const FREE_CAP = 50e6; // 50 GW — treat as unconstrained modeling artifact
                  const constrained = allLinks.filter(l => l.cap < FREE_CAP);
                  const free       = allLinks.filter(l => l.cap >= FREE_CAP);
                  const { div: txDiv, unit: txUnit } = autoScale(
                    Math.max(1, ...constrained.map(l => l.cap), 1), 'MW'
                  );
                  const fmtTx = scaledFmt(txDiv);
                  const MAX_BARS = 30;
                  const barLinks = constrained.slice(0, MAX_BARS);
                  const txBarOption = barLinks.length > 0 ? {
                    backgroundColor: 'transparent',
                    grid: { left: 160, right: 70, top: 10, bottom: 10 },
                    xAxis: { type: 'value', ...axisNameStyle(txUnit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmtTx(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
                    yAxis: { type: 'category', data: barLinks.map(l => `${l.from} ↔ ${l.to}`), axisLabel: { fontSize: 9, color: '#475569' } },
                    series: [{
                      type: 'bar', barMaxWidth: 20,
                      data: barLinks.map(l => ({ value: l.cap, itemStyle: { color: techColorFn(l.tech), borderRadius: [0, 4, 4, 0] } })),
                      label: { show: true, position: 'right', formatter: p => fmtTx(p.value) + ' ' + txUnit, fontSize: 9, color: '#64748b' },
                    }],
                    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmtTx(p[0].value)} ${txUnit}</b>` },
                  } : null;

                  return (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <button onClick={() => toggleSection('tx-capacity')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                        <FiShare2 size={14} className="text-slate-500 flex-shrink-0" />
                        <span className="font-semibold text-slate-800 text-sm flex-1">Transmission Capacity</span>
                        <span className="text-xs text-slate-400 mr-1">· {constrained.length} link{constrained.length !== 1 ? 's' : ''}</span>
                        <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('tx-capacity') ? '' : '-rotate-90'}`} />
                      </button>
                      {sectionOpen('tx-capacity') && (
                        <div className="px-5 pb-5">
                          {txBarOption ? (
                            <>
                              <p className="text-xs text-slate-400 mb-3">Per-link installed capacity (constrained lines only). Capacity shown per unique pair.</p>
                              <ReactECharts option={txBarOption} style={{ height: Math.max(160, barLinks.length * 26 + 30) }} notMerge />
                              {constrained.length > MAX_BARS && (
                                <p className="text-xs text-slate-400 mt-2 text-center">Showing top {MAX_BARS} of {constrained.length} links</p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 py-4 text-center">No constrained transmission links</p>
                          )}
                          {free.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <p className="text-xs text-slate-400">
                                <span className="font-medium text-slate-500">{free.length} unconstrained link{free.length !== 1 ? 's' : ''}</span>
                                {' '}({[...new Set(free.map(l => l.tech))].join(', ')}) — fixed at very high capacity, omitted from chart.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
  );
}
