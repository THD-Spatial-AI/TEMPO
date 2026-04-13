import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel } from '../services/calliopeClient';
import {
  FiPlay, FiStopCircle, FiCheckCircle, FiAlertCircle,
  FiClock, FiCpu, FiZap, FiActivity, FiSettings,
  FiTerminal, FiTrash2, FiAlertTriangle, FiBox,
  FiBarChart2, FiDownload, FiEye, FiList,
} from 'react-icons/fi';

const MODELING_FRAMEWORKS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-blue-500 to-blue-600',
    supported: true,
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis',
    icon: FiActivity,
    color: 'from-green-500 to-green-600',
    supported: false,
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System',
    icon: FiCpu,
    color: 'from-purple-500 to-purple-600',
    supported: false,
  },
];

const SOLVER_OPTIONS = {
  calliope: ['cbc', 'highs', 'glpk', 'gurobi', 'cplex'],
};


const Run = ({ onNavigate }) => {
  const { models, getCurrentModel, showNotification, addCompletedJob, removeCompletedJob, completedJobs, setActiveResultJobId } = useData();

  const [selectedModel, setSelectedModel]       = useState(null);
  const [selectedFramework, setSelectedFramework] = useState('calliope');
  const [selectedSolver, setSelectedSolver]     = useState('cbc');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState({
    threads: 4,
    timeLimit: 3600,
    mipGap: 0.001,
  });

  // Docker service status: null = checking, true = reachable, false = unavailable
  const [serviceStatus, setServiceStatus] = useState(null);

  // Cancel handles keyed by jobId
  const cancelFnsRef = useRef({});
  // Guard: track job IDs that have already been completed to prevent StrictMode double-fire
  const completedIdsRef = useRef(new Set());

  // Active (running) jobs: { id, modelName, solver, startTime, logs: [] }
  const [runningJobs, setRunningJobs] = useState([]);

  // Log panel state
  const [expandedLog, setExpandedLog] = useState(null); // jobId whose log is visible
  const logEndRef = useRef(null);

  // â”€â”€ Mount: pre-select current model & check Calliope env â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    const current = getCurrentModel();
    if (current) setSelectedModel(current);
  }, [getCurrentModel]);

  // Check Docker service health on mount and every 30 s
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      checkCalliopeService().then(ok => { if (!cancelled) setServiceStatus(ok); });
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const solvers = SOLVER_OPTIONS[selectedFramework] || [];
    if (solvers.length > 0) setSelectedSolver(solvers[0]);
  }, [selectedFramework]);

  // Scroll log to bottom whenever logs grow
  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [runningJobs]);

  // â”€â”€ Subscribe to Calliope events from Electron â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // ─── Internal helpers for job completion ─────────────────────────────────────

  const _handleJobDone = (jobId, result) => {
    // Prevent double-fire from React StrictMode or duplicate SSE events
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);

    setRunningJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job) {
        const durationMs = Date.now() - new Date(job.startTime).getTime();
        const duration = durationMs < 60000
          ? `${(durationMs / 1000).toFixed(1)}s`
          : `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
        // Schedule addCompletedJob outside the updater to avoid side-effects inside it
        setTimeout(() => {
          // Count how many times this model has been run before → append version
          const prevRuns = completedJobs.filter(j => {
            const base = j.modelName.replace(/ \(version \d+\)$/, '');
            return base === job.modelName;
          }).length;
          const labeledName = prevRuns > 0 ? `${job.modelName} (version ${prevRuns + 1})` : job.modelName;
          addCompletedJob({
            id: jobId,
            modelName: labeledName,
            framework: job.framework,
            solver: job.solver,
            status: result?.success === false ? 'failed' : 'completed',
            completedAt: new Date().toISOString(),
            duration,
            objective: result?.objective || null,
            terminationCondition: result?.termination_condition || 'optimal',
            result: result || {},
            logs: job.logs,
          });
          showNotification(
            result?.success === false
              ? `Model run failed: ${result.error}`
              : `Model run completed in ${duration}`,
            result?.success === false ? 'error' : 'success'
          );
        }, 0);
      }
      return prev.filter(j => j.id !== jobId);
    });
    delete cancelFnsRef.current[jobId];
  };

  const _handleJobError = (jobId, error) => {
    // Prevent double-fire from React StrictMode or duplicate SSE events
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);

    setRunningJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job) {
        setTimeout(() => {
          const prevRuns = completedJobs.filter(j => {
            const base = j.modelName.replace(/ \(version \d+\)$/, '');
            return base === job.modelName;
          }).length;
          const labeledName = prevRuns > 0 ? `${job.modelName} (version ${prevRuns + 1})` : job.modelName;
          addCompletedJob({
            id: jobId,
            modelName: labeledName,
            framework: job.framework,
            solver: job.solver,
            status: 'failed',
            completedAt: new Date().toISOString(),
            duration: 'N/A',
            objective: null,
            terminationCondition: 'error',
            result: { success: false, error },
            logs: [...job.logs, `[ERROR] ${error}`],
          });
          showNotification(`Run failed: ${error}`, 'error');
        }, 0);
      }
      return prev.filter(j => j.id !== jobId);
    });
    delete cancelFnsRef.current[jobId];
  };

  // â”€â”€ Run model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleRunModel = async () => {
    if (!selectedModel) {
      showNotification('Please select a model to run', 'warning');
      return;
    }

    const framework = MODELING_FRAMEWORKS.find(f => f.id === selectedFramework);
    if (!framework?.supported) {
      showNotification(`${framework?.name} support is coming soon!`, 'info');
      return;
    }

    if (!serviceStatus) {
      showNotification(
        'Calliope Docker service is not available. Run: docker compose up',
        'error'
      );
      return;
    }

    const jobId = `job_${Date.now()}`;
    const newJob = {
      id: jobId,
      modelName: selectedModel.name,
      framework: selectedFramework,
      solver: selectedSolver,
      startTime: new Date().toISOString(),
      logs: [],
      stats: null, // latest resource snapshot from server
    };

    setRunningJobs(prev => [...prev, newJob]);
    setExpandedLog(jobId);
    showNotification(`Started Calliope run for "${selectedModel.name}"`, 'success');

    try {
      const { cancel } = await runCalliopeModel({
        modelData: { ...selectedModel, solver: selectedSolver },
        onLog: (line) =>
          setRunningJobs(prev =>
            prev.map(j => j.id === jobId ? { ...j, logs: [...j.logs, line] } : j)
          ),
        onStats: (s) =>
          setRunningJobs(prev =>
            prev.map(j => j.id === jobId ? { ...j, stats: s } : j)
          ),
        onDone: (result) => _handleJobDone(jobId, result),
        onError: (error) => _handleJobError(jobId, error),
      });
      cancelFnsRef.current[jobId] = cancel;
    } catch (err) {
      setRunningJobs(prev => prev.filter(j => j.id !== jobId));
      showNotification(`Failed to start run: ${err.message}`, 'error');
    }
  };

  const handleStopJob = (jobId) => {
    const cancel = cancelFnsRef.current[jobId];
    if (cancel) {
      cancel();
      delete cancelFnsRef.current[jobId];
    }
    setRunningJobs(prev => prev.filter(j => j.id !== jobId));
    showNotification('Model run stopped', 'info');
  };


  // ── Completed job log expansion state ─────────────────────────────────────
  const [expandedCompletedLog, setExpandedCompletedLog] = useState(null);

  // ── Download a completed job as JSON ─────────────────────────────────────
  const downloadJob = (job) => {
    const blob = new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run_${job.modelName}_${job.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const serviceReady    = serviceStatus === true;
  const serviceChecking = serviceStatus === null;

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="p-6 space-y-6">

        {/* PAGE HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent">
              Run Model
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Execute your energy model locally using Calliope</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            serviceChecking ? 'bg-slate-100 border-slate-200 text-slate-500'
            : serviceReady  ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span className="relative flex h-2 w-2 flex-shrink-0">
              {serviceReady && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                serviceChecking ? 'bg-slate-400' : serviceReady ? 'bg-green-500' : 'bg-amber-500'
              }`} />
            </span>
            <FiBox size={12} />
            {serviceChecking ? 'Connecting…' : serviceReady ? 'Calliope service online' : 'Calliope service offline'}
          </div>
        </div>

        {/* OFFLINE BANNER */}
        {!serviceChecking && !serviceReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Calliope service offline.</strong>{' '}
            Start it with:{' '}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">
              .\scripts\start_calliope_service.ps1
            </code>
            {' '}or{' '}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">
              docker compose up calliope-runner
            </code>
          </div>
        )}

        {/* TOP ROW: config + active jobs */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

          {/* LEFT: configuration */}
          <div className="xl:col-span-3 space-y-4">

            {/* Model + solver */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FiSettings size={13} className="text-electric-500" /> Configuration
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                  <select
                    value={selectedModel?.id || ''}
                    onChange={e => setSelectedModel(models.find(m => m.id === e.target.value))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                  >
                    <option value="">— Select a model —</option>
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.locations?.length || 0} loc, {m.links?.length || 0} links)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Solver</label>
                  <select
                    value={selectedSolver}
                    onChange={e => setSelectedSolver(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                  >
                    {(SOLVER_OPTIONS[selectedFramework] || []).map(s => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Framework */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <FiCpu size={13} className="text-electric-500" /> Framework
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {MODELING_FRAMEWORKS.map(fw => {
                  const Icon = fw.icon;
                  const sel = selectedFramework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      onClick={() => setSelectedFramework(fw.id)}
                      disabled={!fw.supported}
                      className={`relative p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                        sel
                          ? `border-transparent bg-gradient-to-br ${fw.color} text-white shadow-md`
                          : fw.supported
                          ? 'border-slate-200 hover:border-slate-300 bg-white'
                          : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Icon size={18} className={sel ? 'text-white mb-1' : 'text-slate-400 mb-1'} />
                      <div className={`text-xs font-semibold ${sel ? 'text-white' : 'text-slate-700'}`}>{fw.name}</div>
                      {fw.id === 'calliope' && (
                        <div className={`mt-1 flex items-center gap-1 text-[10px] ${sel ? 'text-white/80' : serviceReady ? 'text-green-600' : 'text-slate-400'}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            serviceReady ? (sel ? 'bg-white' : 'bg-green-500') : 'bg-slate-300'
                          }`} />
                          {serviceReady ? 'Docker online' : 'Docker offline'}
                        </div>
                      )}
                      {!fw.supported && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded">Soon</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advanced settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <button
                onClick={() => setShowAdvancedSettings(v => !v)}
                className="w-full flex items-center justify-between text-sm text-slate-600 hover:text-slate-800"
              >
                <span className="flex items-center gap-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                  <FiSettings size={13} className="text-slate-400" /> Advanced settings
                </span>
                <span className="text-xs text-slate-400">{showAdvancedSettings ? '▲ hide' : '▼ show'}</span>
              </button>
              {showAdvancedSettings && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  {[
                    { label: 'Threads', key: 'threads', step: 1 },
                    { label: 'Time limit (s)', key: 'timeLimit', step: 1 },
                    { label: 'MIP gap', key: 'mipGap', step: 0.0001 },
                  ].map(({ label, key, step }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                      <input
                        type="number" step={step}
                        value={advancedSettings[key]}
                        onChange={e => setAdvancedSettings(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Run button */}
            <button
              onClick={handleRunModel}
              disabled={!selectedModel || !serviceReady || runningJobs.length > 0}
              className="w-full py-3.5 bg-gradient-to-r from-electric-500 to-electric-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:from-electric-600 hover:to-electric-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
            >
              <FiPlay size={18} />
              {runningJobs.length > 0 ? 'Run in Progress…' : 'Run Model'}
            </button>
          </div>

          {/* RIGHT: active jobs */}
          <div className="xl:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 h-full">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FiActivity size={13} className="text-orange-500" />
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
                    <div key={job.id} className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                      {/* header */}
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <div className="font-semibold text-sm text-slate-800">{job.modelName}</div>
                          <div className="text-xs text-slate-500">Calliope · {job.solver.toUpperCase()}</div>
                        </div>
                        <button onClick={() => handleStopJob(job.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" title="Stop">
                          <FiStopCircle size={16} />
                        </button>
                      </div>
                      {/* progress bar */}
                      <div className="w-full bg-orange-100 rounded-full h-1 mb-3 overflow-hidden">
                        <div className="h-1 bg-orange-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                      {/* resource stats panel */}
                      {(() => {
                        const s = job.stats;
                        return (
                          <div className="mb-3 grid grid-cols-4 gap-2">
                            {/* elapsed */}
                            <div className="bg-white border border-orange-100 rounded-lg p-2 text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Elapsed</div>
                              <div className="text-xs font-bold text-slate-700">{s?.elapsed ?? '—'}</div>
                            </div>
                            {/* CPU */}
                            <div className="bg-white border border-orange-100 rounded-lg p-2 text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">CPU</div>
                              <div className="text-xs font-bold text-slate-700">
                                {s?.cpu_pct != null ? `${s.cpu_pct}%` : '—'}
                              </div>
                              {s?.cpu_pct != null && (
                                <div className="mt-1 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                  <div className="h-1 rounded-full bg-blue-400 transition-all duration-500"
                                    style={{ width: `${Math.min(s.cpu_pct, 100)}%` }} />
                                </div>
                              )}
                            </div>
                            {/* process RAM */}
                            <div className="bg-white border border-orange-100 rounded-lg p-2 text-center">
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
                            <div className="bg-white border border-orange-100 rounded-lg p-2 text-center">
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
                                    className={`h-1 rounded-full transition-all duration-500 ${
                                      s.sys_ram_pct > 90 ? 'bg-red-400'
                                      : s.sys_ram_pct > 70 ? 'bg-amber-400'
                                      : 'bg-emerald-400'
                                    }`}
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
        </div>

        {/* FULL-WIDTH COMPLETED RUNS */}
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
                      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                        failed ? 'bg-red-100' : 'bg-green-100'
                      }`}>
                        {failed
                          ? <FiAlertTriangle size={16} className="text-red-500" />
                          : <FiCheckCircle size={16} className="text-green-600" />
                        }
                      </div>

                      {/* Model name + ID */}
                      <div className="flex-1 min-w-[160px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{job.modelName}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            failed ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                          }`}>
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
                          <div className="text-xs text-red-500 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-lg max-w-xs truncate" title={job.result.error}>
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
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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

      </div>
    </div>
  );
};

export default Run;
