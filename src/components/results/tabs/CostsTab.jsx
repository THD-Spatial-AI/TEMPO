// CostsTab — the "costs" result tab, extracted verbatim from Results.jsx.
// Renders the pre-computed chart options / data passed as props.
import { FiChevronDown, FiDollarSign, FiMapPin, FiTrendingUp } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import { fmtFull } from '../../../utils/resultFormat';

export default function CostsTab({
  LOC_CHART_LIMIT,
  costPerMwhOption,
  costsLocOption,
  costsTechOption,
  isLargeModel,
  result,
  sectionOpen,
  toggleSection,
}) {
  return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-by-tech')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiDollarSign size={14} className="text-gray-500 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Total Cost by Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cost-by-tech') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cost-by-tech') && <div className="px-5 pb-5">
                      {costsTechOption ? (
                        <ReactECharts option={costsTechOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-12">No cost data</div>}
                    </div>}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-per-mwh')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiTrendingUp size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Cost per MWh by Technology</span>
                      <span className="text-xs text-slate-400 mr-1">· LCOE proxy</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cost-per-mwh') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cost-per-mwh') && <div className="px-5 pb-5">
                      {costPerMwhOption ? (
                        <ReactECharts option={costPerMwhOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-12">No data</div>}
                    </div>}
                  </div>
                </div>

                {costsLocOption && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-by-loc')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiMapPin size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Cost Breakdown by Location &amp; Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cost-by-loc') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cost-by-loc') && <div className="px-5 pb-5">
                      <ReactECharts option={costsLocOption} style={{ height: 300 }} notMerge />
                    </div>}
                  </div>
                )}

                {result?.costs_by_location && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
                    {(() => {
                      const allLocs = Object.keys(result.costs_by_location);
                      const totalByLoc = Object.fromEntries(
                        allLocs.map(l => [l, Object.values(result.costs_by_location[l]).reduce((s, v) => s + (Number(v) || 0), 0)])
                      );
                      const locs = allLocs
                        .sort((a, b) => totalByLoc[b] - totalByLoc[a])
                        .slice(0, isLargeModel ? LOC_CHART_LIMIT : allLocs.length);
                      const truncated = isLargeModel && allLocs.length > LOC_CHART_LIMIT;
                      const techs = [...new Set(locs.flatMap(l => Object.keys(result.costs_by_location[l])))].sort();
                      return (
                        <>
                          <h3 className="font-semibold text-slate-800 text-sm mb-1">Cost Detail Table (€)</h3>
                          {truncated && (
                            <p className="text-xs text-gray-500 mb-3">Showing top {LOC_CHART_LIMIT} locations by total cost (of {allLocs.length}). Export JSON for full data.</p>
                          )}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                                {techs.map(t => (
                                  <th key={t} className="text-right py-2 px-3 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap capitalize">
                                    {t.replace(/_/g, ' ')}
                                  </th>
                                ))}
                                <th className="text-right py-2 pl-4 font-semibold text-slate-800 uppercase tracking-wide">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {locs.map((loc, li) => {
                                const rowTotal = Object.values(result.costs_by_location[loc]).reduce((s, v) => s + (Number(v) || 0), 0);
                                return (
                                  <tr key={loc} className={li % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/60'}>
                                    <td className="py-2 pr-4 font-medium text-slate-700">{loc}</td>
                                    {techs.map(t => (
                                      <td key={t} className="py-2 px-3 text-right text-slate-500 font-mono">
                                        {fmtFull(result.costs_by_location[loc]?.[t] || 0)}
                                      </td>
                                    ))}
                                    <td className="py-2 pl-4 text-right font-bold text-slate-800 font-mono">{fmtFull(rowTotal)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
  );
}
