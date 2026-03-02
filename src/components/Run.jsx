import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import {
  FiPlay, FiStopCircle, FiCheckCircle, FiAlertCircle,
  FiClock, FiCpu, FiZap, FiActivity, FiSettings,
  FiTerminal, FiTrash2, FiAlertTriangle,
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
  calliope: ['highs', 'glpk', 'cbc', 'gurobi', 'cplex'],
};

// â”€â”€â”€ Helper: is this running in Electron? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI;

const Run = () => {
  const { models, getCurrentModel, showNotification, addCompletedJob, removeCompletedJob, completedJobs } = useData();

  const [selectedModel, setSelectedModel]       = useState(null);
  const [selectedFramework, setSelectedFramework] = useState('calliope');
  const [selectedSolver, setSelectedSolver]     = useState('highs');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState({
    threads: 4,
    timeLimit: 3600,
    mipGap: 0.001,
  });

  // Calliope environment status
  const [calliopeStatus, setCalliopeStatus] = useState(null); // null = unchecked

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

  useEffect(() => {
    if (!isElectron()) {
      setCalliopeStatus({ condaFound: false, envExists: false });
      return;
    }
    window.electronAPI.checkCalliope().then(setCalliopeStatus).catch(() => {
      setCalliopeStatus({ condaFound: false, envExists: false });
    });
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

  useEffect(() => {
    if (!isElectron()) return;

    const removeListener = window.electronAPI.onCalliopeEvent((event) => {
      const { type, jobId, line, result, error } = event;

      if (type === 'log') {
        setRunningJobs(prev =>
          prev.map(j => j.id === jobId
            ? { ...j, logs: [...j.logs, line] }
            : j
          )
        );
      }

      if (type === 'done') {
        setRunningJobs(prev => {
          const job = prev.find(j => j.id === jobId);
          if (job) {
            const endTime = new Date().toISOString();
            const durationMs = Date.now() - new Date(job.startTime).getTime();
            const duration = durationMs < 60000
              ? `${(durationMs / 1000).toFixed(1)}s`
              : `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;

            const completedJob = {
              id: jobId,
              modelName: job.modelName,
              framework: job.framework,
              solver: job.solver,
              status: result?.success === false ? 'failed' : 'completed',
              completedAt: endTime,
              duration,
              objective: result?.objective || null,
              terminationCondition: result?.termination_condition || 'optimal',
              result: result || {},
              logs: job.logs,
            };

            addCompletedJob(completedJob);
            showNotification(
              result?.success === false
                ? `Model run failed: ${result.error}`
                : `Model run completed in ${duration}`,
              result?.success === false ? 'error' : 'success'
            );
          }
          return prev.filter(j => j.id !== jobId);
        });
      }

      if (type === 'error') {
        setRunningJobs(prev => {
          const job = prev.find(j => j.id === jobId);
          if (job) {
            const completedJob = {
              id: jobId,
              modelName: job.modelName,
              framework: job.framework,
              solver: job.solver,
              status: 'failed',
              completedAt: new Date().toISOString(),
              duration: 'N/A',
              objective: null,
              terminationCondition: 'error',
              result: { success: false, error },
              logs: [...job.logs, `[ERROR] ${error}`],
            };
            addCompletedJob(completedJob);
            showNotification(`Run failed: ${error}`, 'error');
          }
          return prev.filter(j => j.id !== jobId);
        });
      }
    });

    return removeListener;
  }, [addCompletedJob, showNotification]);

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

    if (!isElectron()) {
      showNotification('Calliope runs locally in the desktop app only.', 'warning');
      return;
    }

    if (!calliopeStatus?.envExists) {
      showNotification('Calliope environment is not ready. Please restart the app.', 'error');
      return;
    }

    try {
      const { jobId } = await window.electronAPI.runCalliope({
        modelData: selectedModel,
        solver: selectedSolver,
      });

      const newJob = {
        id: jobId,
        modelName: selectedModel.name,
        framework: selectedFramework,
        solver: selectedSolver,
        startTime: new Date().toISOString(),
        logs: [],
      };

      setRunningJobs(prev => [...prev, newJob]);
      setExpandedLog(jobId);
      showNotification(`Started Calliope run for "${selectedModel.name}"`, 'success');
    } catch (err) {
      showNotification(`Failed to start run: ${err.message}`, 'error');
    }
  };

  const handleStopJob = async (jobId) => {
    if (isElectron()) {
      await window.electronAPI.stopCalliope(jobId);
    }
    setRunningJobs(prev => prev.filter(j => j.id !== jobId));
    showNotification('Model run stopped', 'info');
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const calliopeReady = calliopeStatus?.envExists;
  const calliopeChecking = calliopeStatus === null;

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent mb-2">
            Run Model
          </h1>
          <p className="text-slate-600">Execute your energy model locally using Calliope</p>
        </div>

        {/* Calliope Environment Banner — Electron only */}
        {isElectron() && (calliopeChecking ? (
          <div className="mb-6 flex items-center gap-3 p-4 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-sm">
            <FiCpu className="animate-spin text-slate-400 flex-shrink-0" size={20} />
            Checking Calliope environment…
          </div>
        ) : calliopeReady ? (
          <div className="mb-6 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
            <FiCheckCircle className="flex-shrink-0 text-green-600" size={20} />
            <span>
              Calliope <strong>{calliopeStatus.version}</strong> is ready.
              Runs execute locally using the <strong>calliope</strong> conda environment.
            </span>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="flex-shrink-0 text-amber-500 mt-0.5" size={20} />
              <div>
                <p className="font-semibold mb-1">Calliope environment not available</p>
                <p className="text-amber-800">
                  {!calliopeStatus?.condaFound
                    ? 'conda was not found. Please restart the app — it will install everything automatically.'
                    : 'The calliope environment is not ready. Please restart the app to trigger the setup wizard.'}
                </p>
              </div>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* â”€â”€ Left: Configuration â”€â”€ */}
          <div className="lg:col-span-2 space-y-6">

            {/* Model Selection */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiSettings className="text-electric-500" />
                Model Selection
              </h2>
              <select
                value={selectedModel?.id || ''}
                onChange={e => setSelectedModel(models.find(m => m.id === e.target.value))}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
              >
                <option value="">-- Select a model --</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.locations?.length || 0} locations, {m.links?.length || 0} links)
                  </option>
                ))}
              </select>
            </div>

            {/* Framework */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiCpu className="text-electric-500" />
                Modeling Framework
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {MODELING_FRAMEWORKS.map(fw => {
                  const Icon = fw.icon;
                  const selected = selectedFramework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      onClick={() => setSelectedFramework(fw.id)}
                      disabled={!fw.supported}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                        selected
                          ? `border-transparent bg-gradient-to-r ${fw.color} text-white shadow-lg`
                          : fw.supported
                          ? 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-md'
                          : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Icon size={22} className={selected ? 'text-white mb-2' : 'text-slate-400 mb-2'} />
                      <div className="font-semibold text-sm">{fw.name}</div>
                      <div className={`text-xs mt-1 ${selected ? 'text-white/80' : 'text-slate-500'}`}>{fw.description}</div>
                      {!fw.supported && (
                        <span className="absolute top-2 right-2 text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                          Soon
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Solver */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Solver Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Solver</label>
                  <select
                    value={selectedSolver}
                    onChange={e => setSelectedSolver(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                  >
                    {(SOLVER_OPTIONS[selectedFramework] || []).map(s => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    GLPK and CBC are free and open-source. Gurobi/CPLEX require a commercial licence.
                  </p>
                </div>

                <button
                  onClick={() => setShowAdvancedSettings(v => !v)}
                  className="flex items-center gap-2 text-sm text-electric-600 hover:text-electric-700 font-medium"
                >
                  <FiSettings size={14} />
                  {showAdvancedSettings ? 'Hide' : 'Show'} advanced settings
                </button>

                {showAdvancedSettings && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    {[
                      { label: 'Threads', key: 'threads', type: 'number', step: 1 },
                      { label: 'Time Limit (s)', key: 'timeLimit', type: 'number', step: 1 },
                      { label: 'MIP Gap', key: 'mipGap', type: 'number', step: 0.0001 },
                    ].map(({ label, key, type, step }) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                        <input
                          type={type}
                          step={step}
                          value={advancedSettings[key]}
                          onChange={e => setAdvancedSettings(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunModel}
              disabled={!selectedModel || !calliopeReady || runningJobs.length > 0}
              className="w-full py-4 bg-gradient-to-r from-electric-500 to-electric-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:from-electric-600 hover:to-electric-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 text-lg"
            >
              <FiPlay size={20} />
              {runningJobs.length > 0 ? 'Run in Progressâ€¦' : 'Run Model'}
            </button>
          </div>

          {/* â”€â”€ Right: Job Status â”€â”€ */}
          <div className="space-y-6">

            {/* Active jobs */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiActivity className="text-orange-500" />
                Running ({runningJobs.length})
              </h2>

              {runningJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FiClock size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No running jobs</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {runningJobs.map(job => (
                    <div key={job.id} className="p-4 bg-orange-50 border border-orange-100 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-medium text-sm text-slate-800">{job.modelName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Calliope Â· {job.solver.toUpperCase()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleStopJob(job.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Stop run"
                        >
                          <FiStopCircle size={16} />
                        </button>
                      </div>

                      {/* Animated progress indicator */}
                      <div className="w-full bg-orange-100 rounded-full h-1.5 mb-3 overflow-hidden">
                        <div className="h-1.5 bg-orange-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>

                      {/* Log toggle */}
                      <button
                        onClick={() => setExpandedLog(expandedLog === job.id ? null : job.id)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                      >
                        <FiTerminal size={12} />
                        {expandedLog === job.id ? 'Hide' : 'Show'} logs ({job.logs.length} lines)
                      </button>

                      {expandedLog === job.id && (
                        <div className="mt-2 bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono h-40 overflow-y-auto">
                          {job.logs.length === 0
                            ? <span className="text-slate-500">Waiting for outputâ€¦</span>
                            : job.logs.map((line, i) => <div key={i}>{line}</div>)
                          }
                          <div ref={logEndRef} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Completed jobs */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FiCheckCircle className="text-green-500" />
                Completed ({completedJobs.length})
              </h2>

              {completedJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FiCheckCircle size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No completed jobs yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {completedJobs.map(job => (
                    <div
                      key={job.id}
                      className={`p-4 rounded-lg border ${
                        job.status === 'failed'
                          ? 'bg-red-50 border-red-100'
                          : 'bg-green-50 border-green-100'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-slate-800 truncate">{job.modelName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {job.solver?.toUpperCase()} Â· {job.duration}
                          </div>
                          {job.status === 'failed' ? (
                            <div className="text-xs text-red-600 mt-1">
                              {job.result?.error?.slice(0, 60) || 'Failed'}
                            </div>
                          ) : job.objective != null ? (
                            <div className="text-xs font-semibold text-electric-600 mt-1">
                              Objective: {job.objective.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                          ) : null}
                        </div>
                        <button
                          onClick={() => removeCompletedJob(job.id)}
                          className="p-1 text-slate-300 hover:text-red-500 ml-2 flex-shrink-0"
                          title="Remove"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Run;
