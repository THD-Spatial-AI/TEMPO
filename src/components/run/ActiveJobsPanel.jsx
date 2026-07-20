// ActiveJobsPanel — extracted verbatim from Run.jsx.
import { FiActivity, FiClock, FiStopCircle, FiTerminal } from 'react-icons/fi';

export default function ActiveJobsPanel({
  expandedLog,
  handleStopJob,
  logEndRef,
  runningJobs,
  setExpandedLog,
}) {
  return (
          <div className="xl:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 h-full">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FiActivity size={13} className="text-gray-500" />
                Active runs ({runningJobs.length})
              </h2>

              {runningJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-slate-300">
                  <FiClock size={36} className="mb-2 opacity-40" />
                  <p className="text-sm">No active runs</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {runningJobs.map(job => (
                    <div key={job.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                      {/* header */}
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <div className="font-semibold text-sm text-slate-800">{job.modelName}</div>
                          <div className="text-xs text-slate-500">Calliope · {job.solver.toUpperCase()}</div>
                        </div>
                        <button onClick={() => handleStopJob(job.id)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg" title="Stop">
                          <FiStopCircle size={16} />
                        </button>
                      </div>
                      {/* progress bar */}
                      <div className="w-full bg-gray-100 rounded-full h-1 mb-3 overflow-hidden">
                        <div className="h-1 bg-gray-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                      {/* resource stats panel */}
                      {(() => {
                        const s = job.stats;
                        return (
                          <div className="mb-3 grid grid-cols-4 gap-2">
                            {/* elapsed */}
                            <div className="bg-white border border-gray-100 rounded-lg p-2 text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Elapsed</div>
                              <div className="text-xs font-bold text-slate-700">{s?.elapsed ?? '—'}</div>
                            </div>
                            {/* CPU */}
                            <div className="bg-white border border-gray-100 rounded-lg p-2 text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">CPU</div>
                              <div className="text-xs font-bold text-slate-700">
                                {s?.cpu_pct != null ? `${s.cpu_pct}%` : '—'}
                              </div>
                              {s?.cpu_pct != null && (
                                <div className="mt-1 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                  <div className="h-1 rounded-full bg-gray-400 transition-all duration-500"
                                    style={{ width: `${Math.min(s.cpu_pct, 100)}%` }} />
                                </div>
                              )}
                            </div>
                            {/* process RAM */}
                            <div className="bg-white border border-gray-100 rounded-lg p-2 text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Proc RAM</div>
                              <div className="text-xs font-bold text-slate-700">
                                {s?.proc_ram_mb != null
                                  ? s.proc_ram_mb >= 1024
                                    ? `${(s.proc_ram_mb / 1024).toFixed(1)} GB`
                                    : `${s.proc_ram_mb} MB`
                                  : '—'
                                }
                              </div>
                            </div>
                            {/* system RAM */}
                            <div className="bg-white border border-gray-100 rounded-lg p-2 text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Sys RAM</div>
                              <div className="text-xs font-bold text-slate-700">
                                {s?.sys_ram_pct != null
                                  ? `${s.sys_ram_pct}%`
                                  : '—'
                                }
                              </div>
                              {s?.sys_ram_pct != null && (
                                <div className="mt-1 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                  <div
                                    className="h-1 rounded-full transition-all duration-500 bg-gray-400"
                                    style={{ width: `${Math.min(s.sys_ram_pct, 100)}%` }}
                                  />
                                </div>
                              )}
                              {s?.sys_ram_used_gb != null && (
                                <div className="text-[9px] text-slate-400 mt-0.5">
                                  {s.sys_ram_used_gb} / {s.sys_ram_total_gb} GB
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      {/* log toggle */}
                      <button
                        onClick={() => setExpandedLog(expandedLog === job.id ? null : job.id)}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
                      >
                        <FiTerminal size={11} />
                        {expandedLog === job.id ? 'Hide' : 'Show'} logs ({job.logs.length} lines)
                      </button>
                      {expandedLog === job.id && (
                        <div className="mt-2 bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono h-48 overflow-y-auto">
                          {job.logs.length === 0
                            ? <span className="text-slate-500">Waiting for output…</span>
                            : job.logs.map((l, i) => (
                                <div key={i} className={`${
                                  l.includes('ERROR') || l.includes('error') ? 'text-red-400'
                                  : l.includes('WARNING') || l.includes('Skipping') ? 'text-yellow-400'
                                  : l.includes('Optimisation finished') || l.includes('Extracted') ? 'text-cyan-300'
                                  : ''
                                }`}>{l}</div>
                              ))
                          }
                          <div ref={logEndRef} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
  );
}
