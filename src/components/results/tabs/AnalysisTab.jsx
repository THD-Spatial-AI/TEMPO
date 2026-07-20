// AnalysisTab — the "analysis" result tab, extracted verbatim from Results.jsx.
// Renders the pre-computed chart options / data passed as props.
import { FiChevronDown, FiGrid } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import { fmtCost, fmtEnergy, fmtPower } from '../../../utils/resultFormat';

export default function AnalysisTab({
  LOC_CHART_LIMIT,
  cfHeatmapOption,
  derivedData,
  isLargeModel,
  result,
  sectionOpen,
  techColorFn,
  toggleSection,
}) {
  return (
              <div className="space-y-4">
                {/* Capacity factor chart */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button onClick={() => toggleSection('cf-chart')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                    <FiGrid size={14} className="text-gray-600 flex-shrink-0" />
                    <span className="font-semibold text-slate-800 text-sm flex-1">
                      {isLargeModel ? 'Average Capacity Factor by Technology' : 'Capacity Factor Heatmap'}
                    </span>
                    <span className="text-xs text-slate-400 mr-1">
                      {isLargeModel ? '· aggregated' : '· Loc × Tech'}
                    </span>
                    <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cf-chart') ? '' : '-rotate-90'}`} />
                  </button>
                  {sectionOpen('cf-chart') && <div className="px-5 pb-5">
                    <p className="text-xs text-slate-400 mb-4">CF = total generation ÷ (installed capacity × hours). High CF means the asset is heavily used.</p>
                    {cfHeatmapOption ? (
                      <ReactECharts option={cfHeatmapOption} style={{ height: isLargeModel ? 220 : 320 }} notMerge />
                    ) : (
                      <div className="text-slate-400 text-sm text-center py-16">
                        Insufficient data — needs both capacity and generation outputs
                      </div>
                    )}
                  </div>}
                </div>

                {/* Renewable share & system metrics */}
                {derivedData && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Renewable share */}
                    {(() => {
                      const renewables = ['solar_pv','solar','wind_onshore','wind_offshore','wind','hydro','biomass'];
                      const renewGen = Object.entries(derivedData.genByTech)
                        .filter(([t]) => renewables.some(r => t.toLowerCase().includes(r)))
                        .reduce((s,[,v]) => s + v, 0);
                      const share = derivedData.totalGen > 0 ? (renewGen / derivedData.totalGen * 100) : 0;
                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Renewable Share</div>
                          <div className="text-4xl font-bold text-gray-900 mb-1">{share.toFixed(1)}<span className="text-xl font-normal text-slate-400">%</span></div>
                          <div className="text-xs text-slate-400 mb-3">of total generation</div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-gray-600 to-gray-900 transition-all" style={{ width: `${share}%` }} />
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{fmtEnergy(renewGen)} renewables / {fmtEnergy(derivedData.totalGen)} total</div>
                        </div>
                      );
                    })()}

                    {/* Avg system LCOE */}
                    {result?.costs_by_tech && (() => {
                      const totalCost = Object.values(result.costs_by_tech).reduce((s,v) => s+(Number(v)||0),0);
                      const lcoe = derivedData.totalGen > 0 ? totalCost / derivedData.totalGen : null;
                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">System Average LCOE</div>
                          <div className="text-4xl font-bold text-gray-900 mb-1">
                            {lcoe != null ? lcoe.toFixed(2) : '—'}<span className="text-xl font-normal text-slate-400"> €/MWh</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-2">Total Cost: {fmtCost(totalCost)}</div>
                          <div className="text-xs text-slate-400">Total Gen: {fmtEnergy(derivedData.totalGen)}</div>
                        </div>
                      );
                    })()}

                    {/* Tech diversity */}
                    {(() => {
                      const techCount = Object.keys(derivedData.capByTech).length;
                      const locCount = Object.keys(derivedData.capByLoc).length;
                      const topTech = Object.entries(derivedData.capByTech).sort(([,a],[,b]) => b-a)[0];
                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">System Profile</div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-500">Technologies</span> <strong className="text-slate-800">{techCount}</strong></div>
                            <div className="flex justify-between"><span className="text-slate-500">Locations</span> <strong className="text-slate-800">{locCount}</strong></div>
                            <div className="flex justify-between"><span className="text-slate-500">Timesteps</span> <strong className="text-slate-800">{(result?.timestamps?.length || 0).toLocaleString()}</strong></div>
                            <div className="flex justify-between"><span className="text-slate-500">Dominant tech</span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: techColorFn(topTech?.[0] || '') }} />
                                <strong className="text-slate-800 capitalize">{topTech?.[0]?.replace(/_/g,' ') || '—'}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Per-location generation bars */}
                {derivedData?.capByLoc && Object.keys(derivedData.capByLoc).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {(() => {
                      const allEntries = Object.entries(derivedData.capByLoc).sort(([,a],[,b]) => b-a);
                      const entries = isLargeModel ? allEntries.slice(0, LOC_CHART_LIMIT) : allEntries;
                      const truncated = isLargeModel && allEntries.length > LOC_CHART_LIMIT;
                      const maxCap = allEntries[0]?.[1] || 1;
                      return (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-800 text-sm">Per-Location Capacity Breakdown</h3>
                            {truncated && <span className="text-xs text-gray-500">Top {LOC_CHART_LIMIT} of {allEntries.length} locations</span>}
                          </div>
                          <div className="space-y-3">
                            {entries.map(([loc, cap]) => {
                              const pct = maxCap > 0 ? (cap / maxCap * 100) : 0;
                              const dom = derivedData.domTech[loc];
                              return (
                                <div key={loc}>
                                  <div className="flex items-center justify-between mb-1 text-xs">
                                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full" style={{ background: techColorFn(dom) }} />
                                      {loc}
                                    </span>
                                    <span className="font-mono text-slate-500">{fmtPower(cap)} · {dom?.replace(/_/g,' ')}</span>
                                  </div>
                                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: techColorFn(dom) }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {truncated && (
                            <p className="mt-3 text-xs text-slate-400 text-center">… {allEntries.length - LOC_CHART_LIMIT} more locations. Export JSON for full data.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
  );
}
