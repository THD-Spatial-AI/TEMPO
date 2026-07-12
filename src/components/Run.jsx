import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel, engineForVersion } from '../services/calliopeClient';
import Calliope07EnginePanel from './Calliope07EnginePanel';
import { checkAdoptnet0Service, runAdoptnet0Model } from '../services/adoptnet0Client';
import {
  FiPlay, FiStopCircle, FiCheckCircle, FiAlertCircle,
  FiClock, FiCpu, FiZap, FiActivity, FiSettings,
  FiTerminal, FiTrash2, FiAlertTriangle, FiBox,
  FiBarChart2, FiDownload, FiEye, FiList,
  FiCalendar, FiChevronDown, FiChevronRight, FiHelpCircle,
} from 'react-icons/fi';

const MODELING_FRAMEWORKS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-gray-600 to-gray-700',
    supported: true,
  },
  {
    id: 'adoptnet0',
    name: 'AdOpT-NET0',
    description: 'Adaptive Optimisation Tool for Net-Zero Energy Systems',
    icon: FiActivity,
    color: 'from-gray-500 to-gray-600',
    supported: true,
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis',
    icon: FiCpu,
    color: 'from-gray-500 to-gray-600',
    supported: false,
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System',
    icon: FiBarChart2,
    color: 'from-gray-500 to-gray-600',
    supported: false,
  },
];

const SOLVER_OPTIONS = {
  calliope:  ['highs'],
  adoptnet0: ['highs', 'gurobi', 'glpk'],
};


const Run = ({ onNavigate }) => {
  const { models, getCurrentModel, showNotification, addCompletedJob, removeCompletedJob, completedJobs, setActiveResultJobId, timeSeries } = useData();

  const [selectedModel, setSelectedModel]       = useState(null);
  const [selectedFramework, setSelectedFramework] = useState('calliope');
  const [selectedSolver, setSelectedSolver]     = useState('highs');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [modelConfig, setModelConfig] = useState({
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    calliopeVersion: '0.6.8',
    mode: 'plan',
    ensureFeasibility: true,
    cyclicStorage: false,
    sporesOptions: {
      slack: 10,         // integer percent sent to backend (divided by 100 there)
      sporesNumber: 20,
    },
    solverOptions: {
      threads: 4,
      timeLimit: 3600,
      method: 2,
      barConvTol: 1e-3,
      feasibilityTol: 1e-3,
      optimalityTol: 1e-3,
      mipGap: 1e-3,
      numericFocus: 2,
      crossover: 0,
      barHomogeneous: 1,
      presolve: 2,
      aggFill: 10,
      preDual: 2,
      rins: 100,
      nodefileStart: 0.5,
      seed: 42,
    }
  });

  const calculateDuration = () => {
    const start = new Date(modelConfig.startDate);
    const end = new Date(modelConfig.endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  // Service status per framework: null = checking, true = reachable, false = unavailable
  const [serviceStatus,    setServiceStatus]    = useState(null); // calliope 0.6.8
  const [calliope07Status, setCalliope07Status] = useState(null); // calliope 0.7 (experimental)
  const [adoptnet0Status,  setAdoptnet0Status]  = useState(null); // adoptnet0

  // Which Calliope engine the selected model targets ('0.6' | '0.7')
  const calliopeEngine = engineForVersion(modelConfig.calliopeVersion);
  // Ref so the health-check interval can read current job count without a stale closure
  const runningJobsRef = useRef([]);

  // Cancel handles keyed by jobId
  const cancelFnsRef = useRef({});
  // Guard: track job IDs that have already been completed to prevent StrictMode double-fire
  const completedIdsRef = useRef(new Set());

  // Selected scenarios and overrides for batch runs
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [selectedOverrides, setSelectedOverrides] = useState([]);
  const [showScenariosDropdown, setShowScenariosDropdown] = useState(false);
  const scenariosDropdownRef = useRef(null);

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

  // Pre-fill modelConfig + solver from the selected model's metadata / parameters
  useEffect(() => {
    if (!selectedModel) return;
    const meta = selectedModel.metadata || {};
    const runCfg = meta.runConfig || {};
    const params = selectedModel.parameters || [];

    // Resolve dates: parameters list → metadata.subsetTime → keep current
    let start = null;
    let end   = null;
    params.forEach(p => {
      if (p.key === 'subset_time_start') start = p.value;
      if (p.key === 'subset_time_end')   end   = p.value;
    });
    if (!start && !end && meta.subsetTime) {
      const st = meta.subsetTime;
      if (Array.isArray(st) && st.length === 2) {
        start = String(st[0]);
        end   = String(st[1]);
      } else {
        // bare year or single date string
        const s = String(st).trim().slice(0, 10);
        start = /^\d{4}$/.test(s) ? s + '-01-01' : s;
        end   = /^\d{4}$/.test(s) ? s + '-12-31' : s;
      }
    }
    // Normalise to YYYY-MM-DD (strip time component if present)
    const toDateStr = (s) => (s ? String(s).slice(0, 10) : null);
    start = toDateStr(start);
    end   = toDateStr(end);

    // Resolve solver
    const metaSolver = runCfg.solver;
    if (metaSolver) {
      const available = SOLVER_OPTIONS[selectedFramework] || [];
      if (available.includes(metaSolver)) setSelectedSolver(metaSolver);
    }

    setModelConfig(prev => ({
      ...prev,
      ...(start ? { startDate: start } : {}),
      ...(end   ? { endDate:   end   } : {}),
      ...(runCfg.mode               != null ? { mode:               runCfg.mode               } : {}),
      ...(runCfg.ensure_feasibility != null ? { ensureFeasibility:  !!runCfg.ensure_feasibility } : {}),
      ...(runCfg.cyclic_storage     != null ? { cyclicStorage:      !!runCfg.cyclic_storage     } : {}),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel?.id]);

  // Keep ref in sync with state so the health-check interval sees current jobs
  useEffect(() => { runningJobsRef.current = runningJobs; }, [runningJobs]);

  // Check Calliope service health on mount and every 30 s.
  useEffect(() => {
    let cancelled = false;
    async function checkWithRetry(attemptsLeft = 5, delayMs = 2000) {
      if (cancelled) return;
      const ok = await checkCalliopeService();
      if (!cancelled) setServiceStatus(ok);
      if (!ok && attemptsLeft > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        return checkWithRetry(attemptsLeft - 1, Math.min(delayMs * 1.5, 8000));
      }
    }
    const check = () => {
      if (runningJobsRef.current.length > 0) return;
      checkCalliopeService().then(ok => { if (!cancelled) setServiceStatus(ok); });
    };
    checkWithRetry();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Check Calliope 0.7 service health — only while a 0.7 model is selected
  // (polling a never-installed optional engine would just log fetch noise).
  useEffect(() => {
    if (calliopeEngine !== '0.7') return undefined;
    let cancelled = false;
    const check = () => {
      if (runningJobsRef.current.length > 0) return;
      checkCalliopeService('0.7').then(ok => { if (!cancelled) setCalliope07Status(ok); });
    };
    setCalliope07Status(null);
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [calliopeEngine]);

  // Check AdOpT-NET0 service health on mount and every 30 s.
  useEffect(() => {
    let cancelled = false;
    async function checkWithRetry(attemptsLeft = 5, delayMs = 2000) {
      if (cancelled) return;
      const ok = await checkAdoptnet0Service();
      if (!cancelled) setAdoptnet0Status(ok);
      if (!ok && attemptsLeft > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        return checkWithRetry(attemptsLeft - 1, Math.min(delayMs * 1.5, 8000));
      }
    }
    const check = () => {
      if (runningJobsRef.current.length > 0) return;
      checkAdoptnet0Service().then(ok => { if (!cancelled) setAdoptnet0Status(ok); });
    };
    checkWithRetry();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Once the last running job finishes, re-check both service health immediately.
  const prevRunningJobsLenRef = useRef(0);
  useEffect(() => {
    const prev = prevRunningJobsLenRef.current;
    const curr = runningJobs.length;
    prevRunningJobsLenRef.current = curr;
    if (prev > 0 && curr === 0) {
      let attempts = 0;
      const retry = () => {
        Promise.all([checkCalliopeService(), checkAdoptnet0Service()]).then(([c, a]) => {
          setServiceStatus(c);
          setAdoptnet0Status(a);
          if ((!c || !a) && ++attempts < 3) setTimeout(retry, 2000);
        });
      };
      retry();
    }
  }, [runningJobs.length]);

  useEffect(() => {
    const solvers = SOLVER_OPTIONS[selectedFramework] || [];
    if (solvers.length > 0) setSelectedSolver(solvers[0]);
  }, [selectedFramework]);

  // Close scenarios dropdown when clicking outside
  useEffect(() => {
    if (!showScenariosDropdown) return;
    const handler = (e) => {
      if (scenariosDropdownRef.current && !scenariosDropdownRef.current.contains(e.target)) {
        setShowScenariosDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showScenariosDropdown]);

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
            mode: job.mode || 'plan',
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
            mode: job.mode || 'plan',
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

    // Framework/engine-aware service check
    const isAdoptnet0 = selectedFramework === 'adoptnet0';
    const isCalliope07 = !isAdoptnet0 && calliopeEngine === '0.7';

    // SPORES is gated on the experimental 0.7 engine until upstream support is verified
    if (isCalliope07 && modelConfig.mode === 'spores') {
      showNotification(
        'SPORES mode is not supported on the Calliope 0.7 (experimental) engine yet. ' +
        'Switch the engine to Calliope 0.6.8 to run SPORES.',
        'error'
      );
      return;
    }

    const currentStatus = isAdoptnet0 ? adoptnet0Status
      : isCalliope07 ? calliope07Status : serviceStatus;
    const checkFn = isAdoptnet0 ? checkAdoptnet0Service
      : isCalliope07 ? (() => checkCalliopeService('0.7')) : checkCalliopeService;
    const setStatus = isAdoptnet0 ? setAdoptnet0Status
      : isCalliope07 ? setCalliope07Status : setServiceStatus;
    const frameworkLabel = isCalliope07 ? 'Calliope 0.7 (experimental)' : framework.name;

    if (!currentStatus) {
      const isUp = await checkFn();
      setStatus(isUp);
      if (!isUp) {
        showNotification(
          isCalliope07
            ? 'The Calliope 0.7 engine is not running. Install it from Settings → Calliope 0.7 Engine.'
            : `${frameworkLabel} service is not running. Install it from the Setup screen.`,
          'error'
        );
        return;
      }
    }

    // Determine what to run: selected scenarios/overrides, or fallback to baseline
    const configs = [];
    if (hasSelections) {
      selectedScenarios.forEach(name => configs.push({ type: 'scenario', name }));
      selectedOverrides.forEach(name => configs.push({ type: 'override', name }));
    } else {
      configs.push(null); // baseline run — no scenario/override
    }

    const runFn = isAdoptnet0 ? runAdoptnet0Model : runCalliopeModel;
    const started = [];
    const failed = [];

    for (const config of configs) {
      const suffix = config ? Math.random().toString(36).slice(2, 8) : '';
      const jobId = `job_${Date.now()}_${suffix}`;
      const displayName = config
        ? `${selectedModel.name} — ${config.name}`
        : selectedModel.name;

      const newJob = {
        id: jobId,
        modelName: displayName,
        framework: selectedFramework,
        solver: selectedSolver,
        mode: modelConfig.mode || 'plan',
        startTime: new Date().toISOString(),
        logs: [],
        stats: null,
      };

      setRunningJobs(prev => [...prev, newJob]);
      // Only expand log for the first job to avoid UI flicker
      if (started.length === 0) setExpandedLog(jobId);

      const modelData = {
        ...selectedModel,
        solver: selectedSolver,
        modelConfig,
        timeSeries: timeSeries.filter(ts => ts.modelId === selectedModel.id),
      };

      if (config) {
        if (config.type === 'scenario') {
          modelData.scenario = config.name;
        } else {
          modelData.override = config.name;
        }
      }

      try {
        const { cancel } = await runFn({
          modelData,
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
        started.push(displayName);
      } catch (err) {
        setRunningJobs(prev => prev.filter(j => j.id !== jobId));
        failed.push(displayName);
        showNotification(`Failed to start "${displayName}": ${err.message}`, 'error');
      }
    }

    if (started.length === 1) {
      showNotification(`Started ${frameworkLabel} run for "${started[0]}"`, 'success');
    } else if (started.length > 1) {
      showNotification(`Started ${started.length} ${frameworkLabel} runs`, 'success');
    }
    if (failed.length > 0 && started.length === 0) {
      setStatus(false);
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

  const isCalliope07Selected = selectedFramework === 'calliope' && calliopeEngine === '0.7';
  const activeStatus    = selectedFramework === 'adoptnet0' ? adoptnet0Status
    : isCalliope07Selected ? calliope07Status : serviceStatus;
  const serviceReady    = activeStatus === true;
  const serviceChecking = activeStatus === null;
  const activeFrameworkLabel = isCalliope07Selected
    ? 'Calliope 0.7'
    : (MODELING_FRAMEWORKS.find(f => f.id === selectedFramework)?.name || 'Service');

  // Scenarios and overrides available from the current model
  const availableScenarios = selectedModel?.scenarios ? Object.keys(selectedModel.scenarios) : [];
  const availableOverrides = selectedModel?.overrides ? Object.keys(selectedModel.overrides) : [];
  const hasSelections = selectedScenarios.length + selectedOverrides.length > 0;

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="p-6 space-y-6">

        {/* PAGE HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-electric-600 to-electric-700 bg-clip-text text-transparent">
              Run Model
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Execute your energy model locally using {activeFrameworkLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedFramework === 'calliope' && selectedModel && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                isCalliope07Selected
                  ? 'bg-gray-50 border-gray-200 text-gray-700'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
              }`} title="Engine version from the model's configuration">
                <FiZap size={12} />
                {isCalliope07Selected ? 'Engine: Calliope 0.7 (experimental)' : 'Engine: Calliope 0.6.8'}
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              serviceChecking ? 'bg-slate-100 border-slate-200 text-slate-500'
              : serviceReady  ? 'bg-gray-50 border-gray-200 text-gray-700'
              : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              <span className="relative flex h-2 w-2 flex-shrink-0">
                {serviceReady && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  serviceChecking ? 'bg-slate-400' : serviceReady ? 'bg-gray-500' : 'bg-gray-500'
                }`} />
              </span>
              <FiBox size={12} />
              {serviceChecking ? 'Connecting…' : serviceReady ? `${activeFrameworkLabel} online` : `${activeFrameworkLabel} offline`}
            </div>
          </div>
        </div>

        {/* OFFLINE BANNER */}
        {!serviceChecking && !serviceReady && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 flex items-start justify-between gap-4">
            <div>
              <strong>{activeFrameworkLabel} service offline.</strong>{' '}
              {selectedFramework === 'adoptnet0'
                ? 'Install the AdOpT-NET0 environment from the Setup screen, or restart the service.'
                : isCalliope07Selected
                ? 'This model targets the experimental Calliope 0.7 engine. Install it from Settings → Calliope 0.7 Engine.'
                : <>Start it with:{' '}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">
                      .\scripts\start_calliope_service.ps1
                    </code>
                    {' '}or{' '}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">
                      docker compose up calliope-runner
                    </code>
                  </>
              }
            </div>
            <button
              onClick={() => {
                if (selectedFramework === 'adoptnet0') {
                  setAdoptnet0Status(null);
                  checkAdoptnet0Service().then(ok => setAdoptnet0Status(ok));
                } else if (isCalliope07Selected) {
                  setCalliope07Status(null);
                  checkCalliopeService('0.7').then(ok => setCalliope07Status(ok));
                } else {
                  setServiceStatus(null);
                  checkCalliopeService().then(ok => setServiceStatus(ok));
                }
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-gray-900 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* INLINE 0.7 INSTALL PANEL — shown when 0.7 is selected but not yet installed */}
        {isCalliope07Selected && calliope07Status === false && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <Calliope07EnginePanel
              onInstallSuccess={() => {
                setCalliope07Status(null);
                checkCalliopeService('0.7').then(ok => setCalliope07Status(ok));
              }}
            />
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                  <select
                    value={selectedModel?.id || ''}
                    onChange={e => {
                      setSelectedModel(models.find(m => m.id === e.target.value));
                      setSelectedScenarios([]);
                      setSelectedOverrides([]);
                    }}
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
                  {selectedFramework === 'calliope' ? (
                    <>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Engine</label>
                      <select
                        value={calliopeEngine === '0.7' ? '0.7' : '0.6.8'}
                        onChange={e => setModelConfig(p => ({
                          ...p,
                          calliopeVersion: e.target.value === '0.7' ? '0.7.0' : '0.6.8',
                        }))}
                        className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                      >
                        <option value="0.6.8">0.6.8 (stable)</option>
                        <option value="0.7">0.7.0.dev7 (experimental)</option>
                      </select>
                      <p className="mt-1 text-xs text-slate-400">Solver: {calliopeEngine === '0.7' ? 'CBC' : 'HiGHS'}</p>
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Solver</label>
                      <div className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                        HiGHS
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Mode</label>
                  <select
                    value={modelConfig.mode}
                    onChange={e => setModelConfig(p => ({ ...p, mode: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 focus:border-transparent bg-white"
                  >
                    <option value="plan">Plan — capacity planning</option>
                    <option value="operate">Operate — operational</option>
                    <option value="spores" disabled={isCalliope07Selected}>
                      {isCalliope07Selected
                        ? 'SPORES — requires the 0.6.8 engine'
                        : 'SPORES — near-optimal alternatives'}
                    </option>
                  </select>
                  {isCalliope07Selected && modelConfig.mode === 'spores' && (
                    <p className="mt-1 text-xs text-gray-600">
                      SPORES is not supported on the experimental Calliope 0.7 engine yet.
                    </p>
                  )}
                </div>
              </div>

              {/* SPORES configuration panel — visible only in spores mode */}
              {modelConfig.mode === 'spores' && (
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
              )}

              {/* Scenarios & Overrides multiselect — full width below grid */}
              {(availableScenarios.length > 0 || availableOverrides.length > 0) && (
                <div className="mt-4 border-t border-slate-100 pt-4" ref={scenariosDropdownRef}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Scenarios / Overrides</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowScenariosDropdown(v => !v)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 text-left flex items-center justify-between bg-white"
                    >
                      <span className={hasSelections ? 'text-slate-700' : 'text-slate-400'}>
                        {hasSelections
                          ? `${selectedScenarios.length + selectedOverrides.length} selected`
                          : 'None (baseline)'}
                      </span>
                      <FiChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform ${showScenariosDropdown ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showScenariosDropdown && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-2 max-h-64 overflow-y-auto">
                        {availableScenarios.length > 0 && (
                          <div className="pb-1 mb-1 border-b border-slate-100">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-0.5">
                              Scenarios
                            </p>
                            {availableScenarios.map(name => {
                              const on = selectedScenarios.includes(name);
                              return (
                                <label
                                  key={name}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                                    on ? 'bg-electric-50 text-electric-700' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => setSelectedScenarios(prev =>
                                      on ? prev.filter(s => s !== name) : [...prev, name]
                                    )}
                                    className="w-4 h-4 text-electric-600 border-slate-300 rounded"
                                  />
                                  {name}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {availableOverrides.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-0.5">
                              Overrides
                            </p>
                            {availableOverrides.map(name => {
                              const on = selectedOverrides.includes(name);
                              return (
                                <label
                                  key={name}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                                    on ? 'bg-electric-50 text-electric-700' : 'text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => setSelectedOverrides(prev =>
                                      on ? prev.filter(o => o !== name) : [...prev, name]
                                    )}
                                    className="w-4 h-4 text-electric-600 border-slate-300 rounded"
                                  />
                                  {name}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                        <div className={`mt-1 flex items-center gap-1 text-[10px] ${sel ? 'text-white/80' : serviceReady ? 'text-gray-600' : 'text-slate-400'}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            serviceReady ? (sel ? 'bg-white' : 'bg-gray-500') : 'bg-slate-300'
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

            {/* Time Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FiCalendar size={13} className="text-electric-500" /> Time Settings
              </h2>
              {/* Quick presets */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { label: '1 Day',   days: 0 },
                  { label: '1 Week',  days: 6 },
                  { label: '1 Month', months: 1 },
                  { label: '1 Year',  years: 1 },
                ].map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const s = new Date(modelConfig.startDate + 'T00:00:00');
                      const e = new Date(s);
                      if (preset.days  != null) e.setDate(e.getDate() + preset.days);
                      if (preset.months)        e.setMonth(e.getMonth() + preset.months, e.getDate() - 1);
                      if (preset.years)         e.setFullYear(e.getFullYear() + preset.years, e.getMonth(), e.getDate() - 1);
                      setModelConfig(p => ({ ...p, endDate: e.toISOString().slice(0, 10) }));
                    }}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 hover:bg-electric-50 hover:border-electric-300 hover:text-electric-700 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={modelConfig.startDate}
                      onChange={e => setModelConfig(p => ({ ...p, startDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 pr-9"
                      style={{ colorScheme: 'light' }}
                    />
                    <FiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={modelConfig.endDate}
                      min={modelConfig.startDate}
                      onChange={e => setModelConfig(p => ({ ...p, endDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-500 pr-9"
                      style={{ colorScheme: 'light' }}
                    />
                    <FiCalendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                </div>
              </div>
              <div className="mt-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span><span className="font-semibold text-slate-700">{calculateDuration()} days</span> · ≈ {Math.ceil(calculateDuration() / 7)} weeks · ≈ {Math.ceil(calculateDuration() / 30)} months</span>
                <span>{new Date(modelConfig.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(modelConfig.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>

            {/* Solver Options */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FiCpu size={13} className="text-electric-500" /> Solver Options
              </h2>
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="ensureFeasibility"
                    checked={modelConfig.ensureFeasibility}
                    onChange={e => setModelConfig(p => ({ ...p, ensureFeasibility: e.target.checked }))}
                    className="w-4 h-4 text-electric-600 border-slate-300 rounded"
                  />
                  <label htmlFor="ensureFeasibility" className="text-sm text-slate-700 cursor-pointer">
                    <span className="font-medium">Ensure Feasibility</span>
                    <p className="text-xs text-slate-500">Allows unmet demand to ensure model feasibility</p>
                  </label>
                </div>
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="cyclicStorage"
                    checked={modelConfig.cyclicStorage}
                    onChange={e => setModelConfig(p => ({ ...p, cyclicStorage: e.target.checked }))}
                    className="w-4 h-4 text-electric-600 border-slate-300 rounded"
                  />
                  <label htmlFor="cyclicStorage" className="text-sm text-slate-700 cursor-pointer">
                    <span className="font-medium">Cyclic Storage</span>
                    <p className="text-xs text-slate-500">Storage levels at end equal storage at start</p>
                  </label>
                </div>
              </div>
              <button
                onClick={() => setShowAdvancedSettings(v => !v)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span className="text-xs font-medium text-slate-600">Advanced Solver Parameters</span>
                {showAdvancedSettings ? <FiChevronDown size={16} className="text-slate-400" /> : <FiChevronRight size={16} className="text-slate-400" />}
              </button>
              {showAdvancedSettings && (
                <div className="mt-3 border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    { label: 'Threads', key: 'threads', step: 1, tip: 'Number of CPU threads for parallel computation' },
                    { label: 'Time Limit (s)', key: 'timeLimit', step: 1, tip: 'Maximum solve time in seconds' },
                    { label: 'Method', key: 'method', step: 1, tip: 'Algorithm: 0=primal, 1=dual, 2=barrier, 3=concurrent' },
                    { label: 'MIP Gap', key: 'mipGap', step: 0.001, tip: 'Relative optimality gap for mixed-integer problems' },
                    { label: 'Feasibility Tol', key: 'feasibilityTol', step: 0.001, tip: 'Maximum constraint violation allowed' },
                    { label: 'Optimality Tol', key: 'optimalityTol', step: 0.001, tip: 'Maximum reduced cost violation allowed' },
                    { label: 'Bar Conv Tol', key: 'barConvTol', step: 0.001, tip: 'Barrier algorithm convergence tolerance' },
                    { label: 'Numeric Focus', key: 'numericFocus', step: 1, tip: 'Precision: 0=auto, 1–3=increasing stability' },
                    { label: 'Crossover', key: 'crossover', step: 1, tip: 'Barrier crossover: -1=auto, 0=off, 1=on' },
                    { label: 'Bar Homogeneous', key: 'barHomogeneous', step: 1, tip: 'Homogeneous self-dual: -1=auto, 0=off, 1=on' },
                    { label: 'Presolve', key: 'presolve', step: 1, tip: 'Presolve: -1=auto, 0=off, 1=conservative, 2=aggressive' },
                    { label: 'Agg Fill', key: 'aggFill', step: 1, tip: 'Max fill during presolve aggregation' },
                    { label: 'Pre Dual', key: 'preDual', step: 1, tip: 'Presolve dualization: -1=auto, 0=off, 2=aggressive' },
                    { label: 'RINS', key: 'rins', step: 1, tip: 'RINS heuristic: -1=auto, 0=off, N=every N nodes' },
                    { label: 'Nodefile Start (GB)', key: 'nodefileStart', step: 0.1, tip: 'RAM threshold for writing nodes to disk' },
                    { label: 'Random Seed', key: 'seed', step: 1, tip: 'Seed for reproducibility (same seed = same results)' },
                  ].map(({ label, key, step, tip }) => (
                    <div key={key}>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs font-medium text-slate-700">{label}</label>
                        <div className="group relative">
                          <FiHelpCircle size={12} className="text-slate-400 cursor-help hover:text-slate-600" />
                          <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-56 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">{tip}</div>
                        </div>
                      </div>
                      <input
                        type="number"
                        step={step}
                        value={modelConfig.solverOptions[key]}
                        onChange={e => setModelConfig(p => ({
                          ...p,
                          solverOptions: { ...p.solverOptions, [key]: parseFloat(e.target.value) || 0 }
                        }))}
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
              disabled={!selectedModel || !serviceReady}
              className="w-full py-3.5 bg-gradient-to-r from-electric-500 to-electric-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:from-electric-600 hover:to-electric-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
            >
              <FiPlay size={18} />
              {hasSelections ? `Run Selected (${selectedScenarios.length + selectedOverrides.length})` : runningJobs.length > 0 ? 'Run in Progress…' : 'Run Model'}
            </button>
          </div>

          {/* RIGHT: active jobs */}
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

      </div>
    </div>
  );
};

export default Run;
