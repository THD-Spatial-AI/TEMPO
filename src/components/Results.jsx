import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import {
  FiBarChart2, FiPieChart, FiTrendingUp, FiDownload,
  FiRefreshCw, FiAlertCircle, FiCheckCircle, FiTrash2,
  FiTerminal, FiAlertTriangle,
} from 'react-icons/fi';

// â”€â”€ Colour palette for chart bars â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BAR_COLOURS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
];

const Results = () => {
  const { completedJobs, removeCompletedJob, showNotification } = useData();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [showLogs, setShowLogs] = useState(false);

  const selectedJob = completedJobs.find(j => j.id === selectedJobId) || null;
  const result = selectedJob?.result || null;

  // â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calliope_results_${selectedJobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Results exported', 'success');
  };

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const formatValue = (v) => {
    if (v == null || Number.isNaN(v)) return 'â€”';
    if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return String(v);
  };

  const maxVal = (obj) => Math.max(...Object.values(obj || {}).map(Number).filter(n => !Number.isNaN(n) && n > 0), 1);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent mb-2">
            Results
          </h1>
          <p className="text-slate-600">View and analyse completed Calliope optimisation results</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* â”€â”€ Left: Job list â”€â”€ */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiBarChart2 className="text-electric-500" />
                Completed jobs
              </h2>

              {completedJobs.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <FiAlertCircle size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No completed jobs</p>
                  <p className="text-xs mt-1">Run a model first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {completedJobs.map(job => (
                    <div
                      key={job.id}
                      className={`group relative flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedJobId === job.id
                          ? 'border-electric-400 bg-electric-50'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-800 truncate">{job.modelName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {job.solver?.toUpperCase()} Â· {job.duration}
                        </div>
                        {job.status === 'failed' ? (
                          <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                            <FiAlertTriangle size={11} /> Failed
                          </div>
                        ) : job.objective != null ? (
                          <div className="text-xs font-semibold text-electric-600 mt-1">
                            {formatValue(job.objective)}
                          </div>
                        ) : null}
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); removeCompletedJob(job.id); if (selectedJobId === job.id) setSelectedJobId(null); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-opacity flex-shrink-0"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* â”€â”€ Right: Results detail â”€â”€ */}
          <div className="lg:col-span-3 space-y-6">
            {!selectedJob ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-16 text-center text-slate-400">
                <FiBarChart2 size={56} className="mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-semibold mb-1">No result selected</h3>
                <p className="text-sm">Select a completed job from the list</p>
              </div>
            ) : selectedJob.status === 'failed' ? (
              <>
                {/* Failed job */}
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
                  <div className="flex items-start gap-4">
                    <FiAlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={24} />
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 mb-1">{selectedJob.modelName} â€“ Failed</h2>
                      <p className="text-sm text-red-700">{result?.error || 'Unknown error'}</p>
                    </div>
                  </div>
                </div>

                {selectedJob.logs?.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <FiTerminal size={16} /> Solver log
                    </h3>
                    <div className="bg-slate-900 text-green-400 rounded-lg p-4 text-xs font-mono h-64 overflow-y-auto">
                      {selectedJob.logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* â”€â”€ Header card â”€â”€ */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800 mb-1">{selectedJob.modelName}</h2>
                      <div className="flex gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <FiCheckCircle className="text-green-500" /> Calliope
                        </span>
                        <span>{selectedJob.solver?.toUpperCase()}</span>
                        <span>{new Date(selectedJob.completedAt).toLocaleString()}</span>
                        <span>{selectedJob.terminationCondition}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleExport}
                      className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                    >
                      <FiDownload size={15} /> Export JSON
                    </button>
                  </div>
                </div>

                {/* â”€â”€ Summary cards â”€â”€ */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      label: 'Total Objective',
                      value: result?.objective,
                      icon: FiTrendingUp,
                      iconClass: 'text-green-600',
                      bgClass: 'bg-green-100',
                    },
                    {
                      label: 'Technologies',
                      value: Object.keys(result?.capacities || {}).length,
                      icon: FiBarChart2,
                      iconClass: 'text-blue-600',
                      bgClass: 'bg-blue-100',
                    },
                    {
                      label: 'Total Generation',
                      value: Object.values(result?.generation || {}).reduce((a, b) => a + (Number(b) || 0), 0),
                      icon: FiPieChart,
                      iconClass: 'text-purple-600',
                      bgClass: 'bg-purple-100',
                    },
                  ].map(({ label, value, icon: Icon, iconClass, bgClass }) => (
                    <div key={label} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 ${bgClass} rounded-lg`}>
                          <Icon className={iconClass} size={18} />
                        </div>
                        <div className="text-sm text-slate-500">{label}</div>
                      </div>
                      <div className="text-2xl font-bold text-slate-800">{formatValue(value)}</div>
                    </div>
                  ))}
                </div>

                {/* â”€â”€ Technology capacities â”€â”€ */}
                {result?.capacities && Object.keys(result.capacities).length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-5">Technology Capacities (MW)</h3>
                    <div className="space-y-3">
                      {Object.entries(result.capacities)
                        .filter(([, v]) => Number(v) > 0)
                        .sort(([, a], [, b]) => Number(b) - Number(a))
                        .map(([tech, cap], i) => {
                          const pct = Math.min((Number(cap) / maxVal(result.capacities)) * 100, 100);
                          return (
                            <div key={tech}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-slate-700 capitalize">{tech.replace(/_/g, ' ')}</span>
                                <span className="text-slate-500">{formatValue(Number(cap))} MW</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-3">
                                <div
                                  className={`${BAR_COLOURS[i % BAR_COLOURS.length]} h-3 rounded-full transition-all duration-700`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* â”€â”€ Generation mix â”€â”€ */}
                {result?.generation && Object.keys(result.generation).length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-5">Generation Mix (MWh)</h3>
                    <div className="space-y-3">
                      {Object.entries(result.generation)
                        .filter(([, v]) => Number(v) > 0)
                        .sort(([, a], [, b]) => Number(b) - Number(a))
                        .map(([tech, gen], i) => {
                          const pct = Math.min((Number(gen) / maxVal(result.generation)) * 100, 100);
                          return (
                            <div key={tech}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-slate-700 capitalize">{tech.replace(/_/g, ' ')}</span>
                                <span className="text-slate-500">{formatValue(Number(gen))} MWh</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-3">
                                <div
                                  className={`${BAR_COLOURS[i % BAR_COLOURS.length]} h-3 rounded-full transition-all duration-700`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* â”€â”€ Cost breakdown â”€â”€ */}
                {result?.costs_by_tech && Object.keys(result.costs_by_tech).length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-5">Cost Breakdown</h3>
                    <div className="space-y-3">
                      {Object.entries(result.costs_by_tech)
                        .filter(([, v]) => Number(v) > 0)
                        .sort(([, a], [, b]) => Number(b) - Number(a))
                        .map(([tech, cost], i) => {
                          const pct = Math.min((Number(cost) / maxVal(result.costs_by_tech)) * 100, 100);
                          return (
                            <div key={tech}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-slate-700 capitalize">{tech.replace(/_/g, ' ')}</span>
                                <span className="text-slate-500">{formatValue(Number(cost))}</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-3">
                                <div
                                  className={`${BAR_COLOURS[i % BAR_COLOURS.length]} h-3 rounded-full transition-all duration-700`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* â”€â”€ Solver log (collapsible) â”€â”€ */}
                {selectedJob.logs?.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <button
                      className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 w-full text-left"
                      onClick={() => setShowLogs(v => !v)}
                    >
                      <FiTerminal size={16} />
                      {showLogs ? 'Hide' : 'Show'} solver log ({selectedJob.logs.length} lines)
                      <FiRefreshCw size={12} className={`ml-auto ${showLogs ? 'rotate-180' : ''} transition-transform`} />
                    </button>
                    {showLogs && (
                      <div className="mt-4 bg-slate-900 text-green-400 rounded-lg p-4 text-xs font-mono h-64 overflow-y-auto">
                        {selectedJob.logs.map((l, i) => <div key={i}>{l}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;
