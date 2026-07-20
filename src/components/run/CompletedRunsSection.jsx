// CompletedRunsSection — extracted verbatim from Run.jsx.
import { FiActivity, FiAlertTriangle, FiBarChart2, FiCheckCircle, FiClock, FiCpu, FiDownload, FiList, FiTerminal, FiTrash2, FiZap } from 'react-icons/fi';

export default function CompletedRunsSection({
  onNavigate,
  completedJobs,
  downloadJob,
  expandedCompletedLog,
  removeCompletedJob,
  setActiveResultJobId,
  setExpandedCompletedLog,
}) {
  return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <FiList size={16} className="text-electric-500" />
              Completed Runs
              <span className="ml-1 px-2 py-0.5 bg-electric-100 text-electric-700 rounded-full text-xs font-bold">
                {completedJobs.length}
              </span>
            </h2>
            {completedJobs.length > 0 && (
              <span className="text-xs text-slate-400">Stored in database · latest first</span>
            )}
          </div>

          {completedJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
              <FiCheckCircle size={48} className="mb-3 opacity-30" />
              <p className="text-base font-medium">No completed runs yet</p>
              <p className="text-sm mt-1 opacity-70">Run a model above to see results here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {completedJobs.map(job => {
                const failed = job.status === 'failed';
                const isLogOpen = expandedCompletedLog === job.id;

                return (
                  <div key={job.id} className="px-6 py-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-4 flex-wrap">

                      {/* Status icon */}
                      <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-gray-100">
                        {failed
                          ? <FiAlertTriangle size={16} className="text-gray-500" />
                          : <FiCheckCircle size={16} className="text-gray-600" />
                        }
                      </div>

                      {/* Model name + ID */}
                      <div className="flex-1 min-w-[160px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{job.modelName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {failed ? 'FAILED' : 'DONE'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 flex-wrap">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 select-all">
                            {job.id?.replace('job_', '#')}
                          </span>
                          <span>{new Date(job.completedAt).toLocaleString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}</span>
                        </div>
                      </div>

                      {/* Stats chips */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg text-xs">
                          <FiCpu size={11} className="text-slate-400" />
                          <span className="font-medium text-slate-600">{(job.solver || '—').toUpperCase()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg text-xs">
                          <FiClock size={11} className="text-slate-400" />
                          <span className="font-medium text-slate-600">{job.duration || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg text-xs">
                          <FiActivity size={11} className="text-slate-400" />
                          <span className="font-medium text-slate-600 capitalize">{job.terminationCondition || '—'}</span>
                        </div>
                        {!failed && job.objective != null && (
                          <div className="flex items-center gap-1.5 bg-electric-50 border border-electric-100 px-2.5 py-1.5 rounded-lg text-xs">
                            <FiZap size={11} className="text-electric-500" />
                            <span className="font-bold text-electric-700 font-mono">
                              {job.objective.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </span>
                          </div>
                        )}
                        {failed && job.result?.error && (
                          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-lg max-w-xs truncate" title={job.result.error}>
                            {job.result.error.slice(0, 60)}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                        {!failed && (
                          <button
                            onClick={() => { setActiveResultJobId(job.id); onNavigate && onNavigate('Results'); }}
                            title="View Results dashboard"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-electric-50 text-electric-600 border border-electric-200 rounded-lg hover:bg-electric-100 transition-colors"
                          >
                            <FiBarChart2 size={13} />
                            Results
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedCompletedLog(isLogOpen ? null : job.id)}
                          title="Toggle logs"
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            isLogOpen
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <FiTerminal size={13} />
                          Logs {job.logs?.length ? `(${job.logs.length})` : ''}
                        </button>
                        <button
                          onClick={() => downloadJob(job)}
                          title="Download as JSON"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <FiDownload size={13} />
                          JSON
                        </button>
                        <button
                          onClick={() => removeCompletedJob(job.id)}
                          title="Delete run"
                          className="p-1.5 text-slate-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expandable logs */}
                    {isLogOpen && (
                      <div className="mt-3 bg-slate-900 text-green-400 rounded-xl p-4 text-xs font-mono max-h-64 overflow-y-auto">
                        {(job.logs || []).length === 0
                          ? <span className="text-slate-500">No logs available</span>
                          : (job.logs || []).map((l, i) => <div key={i} className="leading-relaxed">{l}</div>)
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
  );
}
