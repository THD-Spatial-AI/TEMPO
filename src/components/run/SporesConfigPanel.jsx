// SporesConfigPanel — extracted verbatim from Run.jsx.
import { FiAlertTriangle, FiHelpCircle, FiZap } from 'react-icons/fi';

export default function SporesConfigPanel({
  modelConfig,
  setModelConfig,
}) {
  return (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {/* Header row with title + hint */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                      <FiZap size={12} className="text-electric-500" /> SPORES Options
                    </span>
                    <div className="group relative">
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-electric-600 bg-electric-50 hover:bg-electric-100 border border-electric-200 transition-colors"
                      >
                        <FiHelpCircle size={12} /> What is SPORES?
                      </button>
                      <div className="hidden group-hover:block absolute right-0 top-7 z-20 w-80 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl leading-relaxed">
                        <p className="font-semibold text-electric-300 mb-1">Spatially Explicit Practically Optimal Results</p>
                        <p className="text-slate-300 mb-2">
                          Instead of one "best" plan, SPORES generates N alternative energy system
                          configurations that are all near-optimal in cost but differ in <em>where</em>
                          technologies are deployed — revealing hidden trade-offs like wind farm siting
                          or transmission dependencies.
                        </p>
                        <p className="text-slate-400 border-t border-slate-700 pt-2 mt-1">
                          <span className="text-slate-200 font-medium">Cost slack</span> — how much more expensive the alternatives can be vs. the cheapest plan (e.g. 10% = up to 10% above optimal cost).<br />
                          <span className="text-slate-200 font-medium">Number of SPORES</span> — how many alternatives to generate. Each is a full solver run; more SPORES = longer runtime.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Runtime warning */}
                  <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <FiAlertTriangle size={12} className="text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-500">
                      Runs <span className="font-semibold text-slate-700">N + 1</span> full optimisations sequentially.
                      Start with 5–10 SPORES to estimate runtime before scaling up.
                    </p>
                  </div>

                  {/* Parameter inputs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-700">Cost Slack (%)</label>
                        <div className="group relative">
                          <FiHelpCircle size={12} className="text-slate-400 cursor-help hover:text-electric-500 transition-colors" />
                          <div className="hidden group-hover:block absolute left-0 top-5 z-20 w-60 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg leading-relaxed">
                            Maximum cost increase allowed above the optimal solution.
                            <br /><span className="text-slate-400 mt-1 block">10% → alternatives cost at most 10% more. Higher values give more diversity but stray further from optimal.</span>
                          </div>
                        </div>
                      </div>
                      <input
                        type="number" min={1} max={30} step={1}
                        value={modelConfig.sporesOptions.slack}
                        onChange={e => setModelConfig(p => ({
                          ...p,
                          sporesOptions: { ...p.sporesOptions, slack: Math.max(1, Math.min(30, +e.target.value)) }
                        }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-700">Number of SPORES</label>
                        <div className="group relative">
                          <FiHelpCircle size={12} className="text-slate-400 cursor-help hover:text-electric-500 transition-colors" />
                          <div className="hidden group-hover:block absolute left-0 top-5 z-20 w-60 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg leading-relaxed">
                            How many alternative plans to generate after the cost-optimal run.
                            <br /><span className="text-slate-400 mt-1 block">5–10 is fast for testing; 20–50 gives richer analysis. The paper used 178.</span>
                          </div>
                        </div>
                      </div>
                      <input
                        type="number" min={5} max={100} step={5}
                        value={modelConfig.sporesOptions.sporesNumber}
                        onChange={e => setModelConfig(p => ({
                          ...p,
                          sporesOptions: { ...p.sporesOptions, sporesNumber: Math.max(5, Math.min(100, +e.target.value)) }
                        }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
  );
}
