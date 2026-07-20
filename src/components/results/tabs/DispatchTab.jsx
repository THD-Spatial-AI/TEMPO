// DispatchTab — the "dispatch" result tab, extracted verbatim from Results.jsx.
// Renders the pre-computed chart options / data passed as props.
import { FiActivity, FiChevronDown } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import { fmtEnergy, fmtPower } from '../../../utils/resultFormat';

export default function DispatchTab({
  dispatchOption,
  hasDispatch,
  result,
  sectionOpen,
  techColorFn,
  toggleSection,
}) {
  return (
              <div className="space-y-4">
                {!hasDispatch ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
                    <FiActivity size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Dispatch timeseries not available</p>
                    <p className="text-xs mt-1 text-slate-300">Re-run the model to generate dispatch data</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <button onClick={() => toggleSection('dispatch-stack')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                        <FiActivity size={14} className="text-gray-500 flex-shrink-0" />
                        <span className="font-semibold text-slate-800 text-sm flex-1">Generation Dispatch Stack</span>
                        <span className="text-xs text-slate-400 mr-1">· scroll to zoom</span>
                        <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('dispatch-stack') ? '' : '-rotate-90'}`} />
                      </button>
                      {sectionOpen('dispatch-stack') && <div className="px-5 pb-5">
                        <p className="text-xs text-slate-400 mb-3">Stacked area = supply mix · dashed red = demand</p>
                        <ReactECharts option={dispatchOption} style={{ height: 400 }} notMerge />
                      </div>}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="font-semibold text-slate-800 text-sm mb-4">Dispatch Totals per Technology</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(result.dispatch).map(([tech, vals]) => {
                          const total = vals.reduce((s, v) => s + v, 0);
                          const peak = Math.max(...vals);
                          const avg = total / vals.length;
                          return (
                            <div key={tech} className="rounded-xl border border-slate-100 p-3 bg-slate-50">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: techColorFn(tech) }} />
                                <span className="text-xs font-semibold text-slate-700 capitalize truncate">{tech.replace(/_/g, ' ')}</span>
                              </div>
                              <div className="text-lg font-bold text-slate-800">{fmtEnergy(total)}</div>
                              <div className="text-xs text-slate-400">total output</div>
                              <div className="mt-1 space-y-0.5">
                                <div className="text-xs text-slate-500">Peak: <strong>{fmtPower(peak)}</strong></div>
                                <div className="text-xs text-slate-500">Avg: <strong>{fmtPower(avg)}</strong></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
  );
}
