// FlowTab — the "flow" result tab, extracted verbatim from Results.jsx.
// Renders the pre-computed chart options / data passed as props.
import { FiChevronDown, FiShare2 } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import { fmtEnergy, fmtPower } from '../../../utils/resultFormat';

export default function FlowTab({
  derivedData,
  result,
  sankeyOption,
  sectionOpen,
  techColorFn,
  toggleSection,
}) {
  return (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button onClick={() => toggleSection('sankey')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                    <FiShare2 size={14} className="text-gray-600 flex-shrink-0" />
                    <span className="font-semibold text-slate-800 text-sm flex-1">Energy Flow — Sankey Diagram</span>
                    <span className="text-xs text-slate-400 mr-1">· tech → carrier → demand</span>
                    <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('sankey') ? '' : '-rotate-90'}`} />
                  </button>
                  {sectionOpen('sankey') && <div className="px-5 pb-5">
                    <p className="text-xs text-slate-400 mb-4">Flow width = total generation (MWh) · Technology → Carrier → Total Demand</p>
                  {sankeyOption ? (
                    <ReactECharts option={sankeyOption} style={{ height: 480 }} notMerge />
                  ) : (
                    <div className="text-slate-400 text-sm text-center py-24">
                      <FiShare2 size={40} className="mx-auto mb-3 opacity-20" />
                      Insufficient generation data to build energy flow diagram
                    </div>
                  )}
                  </div>}
                </div>

                {/* Generation ratio per carrier */}
                {derivedData?.genByTech && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {Object.entries(derivedData.genByTech)
                      .sort(([,a],[,b]) => b - a)
                      .map(([tech, gen]) => {
                        const share = derivedData.totalGen > 0 ? (gen / derivedData.totalGen * 100) : 0;
                        const cap = derivedData.capByTech[tech] || 0;
                        return (
                          <div key={tech} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: techColorFn(tech) }} />
                              <span className="font-semibold text-slate-700 text-sm capitalize">{tech.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                              <span>{fmtEnergy(gen)}</span>
                              <span className="font-bold text-slate-700">{share.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: techColorFn(tech) }} />
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                              <span>Cap: <strong className="text-slate-700">{fmtPower(cap)}</strong></span>
                              <span>CF: <strong className="text-slate-700">{cap > 0 ? ((gen / (cap * (result?.timestamps?.length || 8760))) * 100).toFixed(1) + '%' : '—'}</strong></span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
  );
}
