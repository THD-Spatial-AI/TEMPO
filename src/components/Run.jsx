import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel, engineForVersion } from '../services/calliopeClient';
import Calliope07EnginePanel from './Calliope07EnginePanel';
import EngineInstallPanel from './EngineInstallPanel';
import { checkAdoptnet0Service, runAdoptnet0Model } from '../services/adoptnet0Client';
import { checkEngineRunService, runEngineModel } from '../services/engineClient';
import { runMemeModel, getMemeServerConfig } from '../services/memeClient';
import { SETTINGS_EVENT } from '../services/appSettings';
import { resolveScenario } from '../services/scenarioResolver';
import { FiPlay, FiStopCircle, FiCheckCircle, FiAlertCircle, FiClock, FiCpu, FiZap, FiActivity, FiSettings, FiTerminal, FiTrash2, FiAlertTriangle, FiBox, FiBarChart2, FiDownload, FiEye, FiList, FiCalendar, FiChevronDown, FiChevronRight } from './ui/icons';
import { MODELING_FRAMEWORKS, SOLVER_OPTIONS } from '../config/modelingFrameworks';
import CompletedRunsSection from './run/CompletedRunsSection';
import ActiveJobsPanel from './run/ActiveJobsPanel';
import SporesConfigPanel from './run/SporesConfigPanel';
import Select from './ui/Select';
import DatePicker from './ui/DatePicker';
import { LuInfo } from './ui/icons';



const Run = ({ onNavigate }) => {
  const {
    models, getCurrentModel, showNotification, addCompletedJob, removeCompletedJob, completedJobs,
    setActiveResultJobId, timeSeries, technologies, overrides, scenarios,
    runningJobs, addRunningJob, removeRunningJob, appendRunningJobLog, updateRunningJobStats, getRunningJob,
  } = useData();

  const [selectedModel, setSelectedModel]       = useState(null);
  const [selectedFramework, setSelectedFramework] = useState('calliope');
  const [selectedSolver, setSelectedSolver]     = useState('highs');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Compute location for this run: 'local' (default) or 'remote' (a MEME server).
  // Not persisted on the model — it's an execution-environment choice.
  const [computeTarget, setComputeTarget] = useState('local');
  const [remoteServer, setRemoteServer]   = useState(() => getMemeServerConfig());
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
    customMath: '',
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

  // Valid = both dates parse and start is on or before end. Guards the Run action
  // and the presets against empty/invalid date fields.
  const isDateRangeValid = () => {
    const start = new Date(modelConfig.startDate);
    const end = new Date(modelConfig.endDate);
    return !isNaN(start) && !isNaN(end) && start <= end;
  };

  // Service status per framework: null = checking, true = reachable, false = unavailable
  const [serviceStatus,    setServiceStatus]    = useState(null); // calliope 0.6.8
  const [calliope07Status, setCalliope07Status] = useState(null); // calliope 0.7 (experimental)
  const [adoptnet0Status,  setAdoptnet0Status]  = useState(null); // adoptnet0
  const [pypsaStatus,      setPypsaStatus]      = useState(null); // pypsa
  const [osemosysStatus,   setOsemosysStatus]   = useState(null); // osemosys

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

  // runningJobs is now in DataContext (shared with ScenarioStudio)

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
      // Imported Calliope 0.7 models carry their engine version so the correct
      // engine is preselected. (Imported named math travels via metadata.mathModules,
      // not the customMath textarea, to preserve conditional activation.)
      ...(meta.modelConfig?.calliopeVersion ? { calliopeVersion: meta.modelConfig.calliopeVersion } : {}),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel?.id]);

  // Keep ref in sync with state so the health-check interval sees current jobs
  useEffect(() => { runningJobsRef.current = runningJobs; }, [runningJobs]);

  // Reflect Settings › Remote Execution changes without a remount.
  useEffect(() => {
    const handler = () => setRemoteServer(getMemeServerConfig());
    window.addEventListener(SETTINGS_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_EVENT, handler);
  }, []);

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

  // Check PyPSA service health — only while PyPSA is selected (optional engine,
  // same rationale as the 0.7 effect above).
  useEffect(() => {
    if (selectedFramework !== 'pypsa') return undefined;
    let cancelled = false;
    const check = () => {
      if (runningJobsRef.current.length > 0) return;
      checkEngineRunService('pypsa').then(ok => { if (!cancelled) setPypsaStatus(ok); });
    };
    setPypsaStatus(null);
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedFramework]);

  // Check OSeMOSYS service health — only while OSeMOSYS is selected.
  useEffect(() => {
    if (selectedFramework !== 'osemosys') return undefined;
    let cancelled = false;
    const check = () => {
      if (runningJobsRef.current.length > 0) return;
      checkEngineRunService('osemosys').then(ok => { if (!cancelled) setOsemosysStatus(ok); });
    };
    setOsemosysStatus(null);
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [selectedFramework]);

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
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);

    const job = getRunningJob(jobId);
    removeRunningJob(jobId);
    if (job) {
      const durationMs = Date.now() - new Date(job.startTime).getTime();
      const duration = durationMs < 60000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
      setTimeout(() => {
        const prevRuns = completedJobs.filter(j => {
          const base = j.modelName.replace(/ \(version \d+\)$/, '');
          return base === job.modelName;
        }).length;
        const labeledName = prevRuns > 0 ? `${job.modelName} (version ${prevRuns + 1})` : job.modelName;
        addCompletedJob({
          id: jobId, modelName: labeledName, framework: job.framework, solver: job.solver,
          mode: job.mode || 'plan', status: result?.success === false ? 'failed' : 'completed',
          completedAt: new Date().toISOString(), duration, objective: result?.objective || null,
          terminationCondition: result?.termination_condition || 'optimal', result: result || {}, logs: job.logs,
        });
        showNotification(
          result?.success === false ? `Model run failed: ${result.error}` : `Model run completed in ${duration}`,
          result?.success === false ? 'error' : 'success'
        );
      }, 0);
    }
    delete cancelFnsRef.current[jobId];
  };

  const _handleJobError = (jobId, error) => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);

    const job = getRunningJob(jobId);
    removeRunningJob(jobId);
    if (job) {
      setTimeout(() => {
        const prevRuns = completedJobs.filter(j => {
          const base = j.modelName.replace(/ \(version \d+\)$/, '');
          return base === job.modelName;
        }).length;
        const labeledName = prevRuns > 0 ? `${job.modelName} (version ${prevRuns + 1})` : job.modelName;
        addCompletedJob({
          id: jobId, modelName: labeledName, framework: job.framework, solver: job.solver,
          mode: job.mode || 'plan', status: 'failed', completedAt: new Date().toISOString(),
          duration: 'N/A', objective: null, terminationCondition: 'error',
          result: { success: false, error }, logs: [...job.logs, `[ERROR] ${error}`],
        });
        showNotification(`Run failed: ${error}`, 'error');
      }, 0);
    }
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

    if (!isDateRangeValid()) {
      showNotification('Set a valid date range — the start date must be on or before the end date.', 'error');
      return;
    }

    // Framework/engine-aware service check
    const isAdoptnet0 = selectedFramework === 'adoptnet0';
    const isPypsa = selectedFramework === 'pypsa';
    const isOsemosys = selectedFramework === 'osemosys';
    const isCalliope07 = selectedFramework === 'calliope' && calliopeEngine === '0.7';

    // SPORES on the 0.7 engine runs only remotely (MEME's spores mode); the local
    // 0.7 runner has no SPORES support.
    if (isCalliope07 && modelConfig.mode === 'spores' && !computeRemote) {
      showNotification(
        'SPORES mode is not supported on the local Calliope 0.7 (experimental) engine. ' +
        'Switch the engine to Calliope 0.6.8, or run it remotely on MEME.',
        'error'
      );
      return;
    }

    const currentStatus = isAdoptnet0 ? adoptnet0Status
      : isPypsa ? pypsaStatus
      : isOsemosys ? osemosysStatus
      : isCalliope07 ? calliope07Status : serviceStatus;
    const checkFn = isAdoptnet0 ? checkAdoptnet0Service
      : isPypsa ? (() => checkEngineRunService('pypsa'))
      : isOsemosys ? (() => checkEngineRunService('osemosys'))
      : isCalliope07 ? (() => checkCalliopeService('0.7')) : checkCalliopeService;
    const setStatus = isAdoptnet0 ? setAdoptnet0Status
      : isPypsa ? setPypsaStatus
      : isOsemosys ? setOsemosysStatus
      : isCalliope07 ? setCalliope07Status : setServiceStatus;
    const baseLabel = isCalliope07 ? 'Calliope 0.7 (experimental)' : framework.name;
    const frameworkLabel = computeRemote ? `${baseLabel} (remote)` : baseLabel;

    // Local runs need the local engine service up; remote runs skip that check
    // entirely — the model is offloaded to the configured MEME server.
    if (!computeRemote && !currentStatus) {
      const isUp = await checkFn();
      setStatus(isUp);
      if (!isUp) {
        showNotification(
          isCalliope07
            ? 'The Calliope 0.7 engine is not running. Install it from Settings → Calliope 0.7 Engine.'
            : isPypsa
            ? 'The PyPSA engine is not running. Install it from Settings → PyPSA Engine.'
            : isOsemosys
            ? 'The OSeMOSYS engine is not running. Install it from Settings → OSeMOSYS Engine.'
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

    const runFn = computeRemote
      ? ((opts) => runMemeModel(remoteEngine, {
          server: remoteServer,
          mode: modelConfig.mode,
          solver: selectedSolver,
          ...opts,
        }))
      : isAdoptnet0 ? runAdoptnet0Model
      : isPypsa ? ((opts) => runEngineModel('pypsa', opts))
      : isOsemosys ? ((opts) => runEngineModel('osemosys', opts))
      : runCalliopeModel;

    // First log line makes the compute location unmistakable — including the
    // case where Remote was chosen but a scenario/override forced a local run.
    const computeBanner = computeRemote
      ? `[TEMPO] Running REMOTELY on MEME (${remoteServer.url})`
      : (computeTarget === 'remote' && remoteAvailable && hasSelections
          ? '[TEMPO] Running LOCALLY — remote supports a single baseline run only; a scenario/override is selected'
          : '[TEMPO] Running LOCALLY on this machine');

    // Techs to send with the run: live (possibly unsaved) techs only for the
    // currently-loaded model; for any other selected model use its own saved
    // techs. Never fall through to the global default catalog, which would
    // clobber the selected model's technologies (nodes reference techs that
    // then don't exist → empty nodes on export).
    const isCurrentModel = selectedModel.id === getCurrentModel()?.id;
    const techsForRun = (isCurrentModel && technologies?.length)
      ? technologies
      : (selectedModel.technologies?.length ? selectedModel.technologies : (technologies || []));

    // Same story for timeSeries: the global list has parsed `data` only for the
    // currently-loaded model. For any other selected model, use its own saved
    // entries (which carry raw csvContent) so file= refs still resolve.
    const tsFiltered = timeSeries.filter(ts => ts.modelId === selectedModel.id);
    const timeSeriesForRun = tsFiltered.length ? tsFiltered : (selectedModel.timeSeries || []);

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
        logs: [computeBanner],
        stats: null,
      };

      addRunningJob(newJob);
      // Only expand log for the first job to avoid UI flicker
      if (started.length === 0) setExpandedLog(jobId);

      let modelData = {
        ...selectedModel,
        solver: selectedSolver,
        modelConfig,
        technologies: techsForRun,
        timeSeries: timeSeriesForRun,
        ...(modelConfig.customMath?.trim() ? { customMath: modelConfig.customMath } : {}),
      };

      if (config) {
        if (isPypsa || isOsemosys) {
          // Pre-resolve the scenario/override on the frontend — non-Calliope
          // runners receive a concrete model with the override already applied.
          const { model: resolved } = resolveScenario(
            modelData, overrides || {}, scenarios || {}, config
          );
          modelData = resolved;
        } else {
          // Calliope handles scenario/override application natively in the runner.
          if (config.type === 'scenario') {
            modelData.scenario = config.name;
          } else {
            modelData.override = config.name;
          }
        }
      }

      try {
        const { cancel } = await runFn({
          modelData,
          onLog: (line) => appendRunningJobLog(jobId, line),
          onStats: (s) => updateRunningJobStats(jobId, s),
          onDone: (result) => _handleJobDone(jobId, result),
          onError: (error) => _handleJobError(jobId, error),
        });
        cancelFnsRef.current[jobId] = cancel;
        started.push(displayName);
      } catch (err) {
        removeRunningJob(jobId);
        failed.push(displayName);
        showNotification(`Failed to start "${displayName}": ${err.message}`, 'error');
      }
    }

    if (started.length === 1) {
      showNotification(`Started ${frameworkLabel} run for "${started[0]}"`, 'success');
    } else if (started.length > 1) {
      showNotification(`Started ${started.length} ${frameworkLabel} runs`, 'success');
    }
    if (!computeRemote && failed.length > 0 && started.length === 0) {
      setStatus(false);
    }
  };

  const handleStopJob = (jobId) => {
    const cancel = cancelFnsRef.current[jobId];
    if (cancel) {
      cancel();
      delete cancelFnsRef.current[jobId];
    }
    removeRunningJob(jobId);
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
    : selectedFramework === 'pypsa' ? pypsaStatus
    : selectedFramework === 'osemosys' ? osemosysStatus
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

  // ── Remote execution (MEME) availability ─────────────────────────────────
  // The memeClient engine id for the current framework/engine, or null when
  // the selection can't run remotely (Calliope 0.6.8, OSeMOSYS).
  const remoteEngine = selectedFramework === 'pypsa' ? 'pypsa'
    : selectedFramework === 'adoptnet0' ? 'adoptnet0'
    : (selectedFramework === 'calliope' && calliopeEngine === '0.7') ? 'calliope07'
    : null;
  const remoteAvailable = !!(remoteServer?.url && remoteEngine);
  // v2 scope: remote handles a single baseline run only — a scenario/override
  // selection transparently falls back to local execution.
  const computeRemote = computeTarget === 'remote' && remoteAvailable && !hasSelections;

  const durationDays = calculateDuration();
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const modeLabel = { plan: 'Plan', operate: 'Operate', spores: 'SPORES' }[modelConfig.mode] || modelConfig.mode;
  const runDisabled = !selectedModel || (!computeRemote && !serviceReady) || !isDateRangeValid();
  const runBlocker = !selectedModel ? 'Select a model to run'
    : (!computeRemote && !serviceReady) ? `${activeFrameworkLabel} service is offline`
    : !isDateRangeValid() ? 'Set a valid date range'
    : null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="w-full space-y-6 px-8 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-black">Run Model</h1>
            <p className="mt-1 text-[15px] text-slate-500">
              {computeRemote
                ? `Execute your energy model remotely using ${activeFrameworkLabel} on MEME`
                : `Execute your energy model locally using ${activeFrameworkLabel}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedFramework === 'calliope' && selectedModel && (
              <span className="inline-flex items-center gap-1.5 border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 " title="Engine version from the model's configuration">
                <FiZap size={12} className="text-slate-400" />
                {isCalliope07Selected ? 'Calliope 0.7 (experimental)' : 'Calliope 0.6.8'}
              </span>
            )}
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${
              serviceChecking ? 'bg-slate-100 text-slate-500'
              : serviceReady ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
            }`}>
              <span className="relative flex h-2 w-2">
                {serviceReady && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${serviceChecking ? 'bg-slate-400' : serviceReady ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              {serviceChecking ? 'Connecting…' : serviceReady ? `${activeFrameworkLabel} online` : `${activeFrameworkLabel} offline`}
            </span>
          </div>
        </div>

        {/* Offline banner — hidden when running remotely */}
        {!computeRemote && !serviceChecking && !serviceReady && (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex gap-3">
              <FiAlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <strong>{activeFrameworkLabel} service offline.</strong>{' '}
                {selectedFramework === 'adoptnet0'
                  ? 'Install the AdOpT-NET0 environment from Settings → Optimization Engines, or restart the service.'
                  : selectedFramework === 'pypsa'
                  ? 'Install the PyPSA engine from Settings → Optimization Engines, or restart the service.'
                  : isCalliope07Selected
                  ? 'This model targets the experimental Calliope 0.7 engine. Install it from Settings → Optimization Engines.'
                  : <>Start it with{' '}
                      <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">docker compose up calliope-runner</code>
                      {' '}or install it from Settings → Optimization Engines.
                    </>
                }
              </div>
            </div>
            <button
              onClick={() => {
                if (selectedFramework === 'adoptnet0') {
                  setAdoptnet0Status(null);
                  checkAdoptnet0Service().then(ok => setAdoptnet0Status(ok));
                } else if (selectedFramework === 'pypsa') {
                  setPypsaStatus(null);
                  checkEngineRunService('pypsa').then(ok => setPypsaStatus(ok));
                } else if (isCalliope07Selected) {
                  setCalliope07Status(null);
                  checkCalliopeService('0.7').then(ok => setCalliope07Status(ok));
                } else {
                  setServiceStatus(null);
                  checkCalliopeService().then(ok => setServiceStatus(ok));
                }
              }}
              className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* INLINE PYPSA INSTALL PANEL — shown when PyPSA is selected but not yet installed */}
        {!computeRemote && selectedFramework === 'pypsa' && pypsaStatus === false && (
          <div className="bg-white rounded-2xl  border border-black/15 p-6">
            <EngineInstallPanel
              title="PyPSA Engine"
              icon={FiCpu}
              description="Optional optimisation engine in its own isolated Python environment. Requires Python 3.10+."
              checkFn="checkPypsaEnv"
              installFn="installPypsaEnv"
              onProgressFn="onPypsaInstallProgress"
              onInstallSuccess={() => {
                setPypsaStatus(null);
                checkEngineRunService('pypsa').then(ok => setPypsaStatus(ok));
              }}
            />
          </div>
        )}

        {/* INLINE 0.7 INSTALL PANEL — shown when 0.7 is selected but not yet installed */}
        {!computeRemote && isCalliope07Selected && calliope07Status === false && (
          <div className="bg-white rounded-2xl  border border-black/15 p-6">
            <Calliope07EnginePanel
              onInstallSuccess={() => {
                setCalliope07Status(null);
                checkCalliopeService('0.7').then(ok => setCalliope07Status(ok));
              }}
            />
          </div>
        )}

        {/* INLINE OSEMOSYS INSTALL PANEL — shown when OSeMOSYS is selected but not yet installed */}
        {!computeRemote && selectedFramework === 'osemosys' && osemosysStatus === false && (
          <div className="bg-white rounded-2xl  border border-black/15 p-6">
            <EngineInstallPanel
              title="OSeMOSYS Engine"
              icon={FiZap}
              description="Optional optimisation engine (otoole + GLPK) in its own isolated Python environment. Requires Python 3.10+; the GLPK solver is bundled on Windows."
              checkFn="checkOsemosysEnv"
              installFn="installOsemosysEnv"
              onProgressFn="onOsemosysInstallProgress"
              onInstallSuccess={() => {
                setOsemosysStatus(null);
                checkEngineRunService('osemosys').then(ok => setOsemosysStatus(ok));
              }}
            />
          </div>
        )}

        {/* INLINE ADOPTNET0 INSTALL PANEL — shown when AdOpT-NET0 is selected but not yet installed */}
        {!computeRemote && selectedFramework === 'adoptnet0' && adoptnet0Status === false && (
          <div className="bg-white rounded-2xl  border border-black/15 p-6">
            <EngineInstallPanel
              title="AdOpT-NET0 Engine"
              icon={FiBox}
              description="Optional optimisation engine (Advanced Optimization Tool for Energy Networks) in its own isolated Python environment. Requires Python 3.10+."
              checkFn="checkAdoptnet0Env"
              installFn="installAdoptnet0Env"
              onProgressFn="onAdoptnet0InstallProgress"
              onInstallSuccess={() => {
                setAdoptnet0Status(null);
                checkAdoptnet0Service().then(ok => setAdoptnet0Status(ok));
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

          {/* Setup */}
          <div className="space-y-4 xl:col-span-2">

            <RunSection step={1} title="Model & mode" description="What to run and how.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Model">
                  <Select
                    value={selectedModel?.id || ''}
                    onChange={id => {
                      setSelectedModel(models.find(m => m.id === id));
                      setSelectedScenarios([]);
                      setSelectedOverrides([]);
                    }}
                    placeholder="Select a model"
                    options={models.map(m => ({
                      value: m.id,
                      label: m.name,
                      description: `${m.locations?.length || 0} locations · ${m.links?.length || 0} links`,
                    }))}
                  />
                </Field>
                {selectedFramework === 'calliope' ? (
                  <Field label="Engine" hint={'Solver: HiGHS'}>
                    <Select
                      value={calliopeEngine === '0.7' ? '0.7' : '0.6.8'}
                      onChange={v => setModelConfig(p => ({
                        ...p,
                        calliopeVersion: v === '0.7' ? '0.7.0' : '0.6.8',
                      }))}
                      options={[
                        { value: '0.6.8', label: '0.6.8 (stable)', description: 'HiGHS solver · recommended' },
                        { value: '0.7', label: '0.7.0.dev7 (experimental)', description: 'CBC solver · supports custom math' },
                      ]}
                    />
                  </Field>
                ) : (
                  <Field label="Solver">
                    <div className="flex h-10 items-center rounded-lg border border-black/15 bg-slate-50 px-3 text-sm text-slate-700">HiGHS</div>
                  </Field>
                )}
                <Field
                  label="Mode"
                  hint={isCalliope07Selected && !computeRemote && modelConfig.mode === 'spores'
                    ? 'SPORES is not supported on the experimental Calliope 0.7 engine yet.' : undefined}
                >
                  <Select
                    value={modelConfig.mode}
                    onChange={v => setModelConfig(p => ({ ...p, mode: v }))}
                    options={[
                      { value: 'plan', label: 'Plan', description: 'Capacity planning — size the system' },
                      { value: 'operate', label: 'Operate', description: 'Operational dispatch with fixed capacities' },
                      {
                        value: 'spores',
                        label: 'SPORES',
                        description: isCalliope07Selected && !computeRemote
                          ? 'Requires the 0.6.8 engine (or a remote run)'
                          : 'Near-optimal alternative solutions',
                        disabled: isCalliope07Selected && !computeRemote,
                      },
                    ]}
                  />
                </Field>
              </div>

              {remoteAvailable && (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4">
                  <span className="text-xs font-medium text-slate-600">Compute</span>
                  <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
                    {[['local', 'Local'], ['remote', 'Remote (MEME)']].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setComputeTarget(id)}
                        className={`rounded-md px-3 py-1.5 transition-all ${computeTarget === id ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">
                    {computeRemote
                      ? <>Runs on <span className="font-mono text-slate-500">{remoteServer.url}</span></>
                      : 'Runs on this machine'}
                  </span>
                  {computeTarget === 'remote' && hasSelections && (
                    <p className="w-full text-xs text-amber-700">
                      Scenarios/overrides run locally — remote execution supports a single baseline run.
                    </p>
                  )}
                </div>
              )}

              {modelConfig.mode === 'spores' && (
                <SporesConfigPanel
                  modelConfig={modelConfig}
                  setModelConfig={setModelConfig}
                />
              )}

                            {(availableScenarios.length > 0 || availableOverrides.length > 0) && (
                <div className="mt-4 border-t border-black/10 pt-4" ref={scenariosDropdownRef}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Scenarios / Overrides</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowScenariosDropdown(v => !v)}
                      className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200 flex items-center justify-between text-left"
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
                      <div className="absolute z-20 mt-1 w-full bg-white border border-black/15 rounded-lg shadow-lg p-2 max-h-64 overflow-y-auto">
                        {availableScenarios.length > 0 && (
                          <div className="pb-1 mb-1 border-b border-black/10">
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
                                    className="w-4 h-4 text-electric-600 border-black/15 rounded"
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
                                    className="w-4 h-4 text-electric-600 border-black/15 rounded"
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

            </RunSection>

            <RunSection step={2} title="Framework" description="The modelling framework the model is translated to.">
              <div role="radiogroup" aria-label="Framework" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50 sm:grid-cols-4">
                {MODELING_FRAMEWORKS.map(fw => {
                  const Icon = fw.icon;
                  const sel = selectedFramework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      role="radio"
                      aria-checked={sel}
                      onClick={() => setSelectedFramework(fw.id)}
                      disabled={!fw.supported}
                      title={fw.description}
                      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        sel ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                      }`}
                    >
                      <Icon size={14} />
                      {fw.name}
                      {!fw.supported && <span className="text-[10px] text-slate-400">soon</span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 px-1 text-xs text-slate-500">
                {MODELING_FRAMEWORKS.find(fw => fw.id === selectedFramework)?.description}
              </p>
            </RunSection>

            <RunSection step={3} title="Time horizon" description="The period the model is optimised over.">
              <div className="mb-4 inline-flex gap-1 rounded-lg bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50">
                {TIME_PRESETS.map(preset => {
                  const active = presetEnd(modelConfig.startDate, preset) === modelConfig.endDate;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        // Fall back to today if startDate is invalid so the preset can't produce an Invalid Date.
                        const startStr = isNaN(new Date(modelConfig.startDate + 'T00:00:00'))
                          ? new Date().toISOString().slice(0, 10) : modelConfig.startDate;
                        setModelConfig(p => ({ ...p, startDate: startStr, endDate: presetEnd(startStr, preset) }));
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        active ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Start date">
                  <DatePicker
                    value={modelConfig.startDate}
                    onChange={v => setModelConfig(p => {
                      if (!p.endDate || v <= p.endDate) return { ...p, startDate: v };
                      const span = Math.max(0, Math.round((new Date(p.endDate) - new Date(p.startDate)) / 86400000));
                      const end = new Date(v + 'T00:00:00');
                      end.setDate(end.getDate() + span);
                      const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
                      return { ...p, startDate: v, endDate: iso };
                    })}
                    rangeStart={modelConfig.startDate}
                    rangeEnd={modelConfig.endDate}
                  />
                </Field>
                <Field label="End date">
                  <DatePicker
                    value={modelConfig.endDate}
                    min={modelConfig.startDate}
                    onChange={v => setModelConfig(p => ({ ...p, endDate: v }))}
                    rangeStart={modelConfig.startDate}
                    rangeEnd={modelConfig.endDate}
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span><span className="font-semibold text-slate-800">{durationDays} days</span> · ≈ {Math.ceil(durationDays / 7)} weeks · ≈ {Math.ceil(durationDays / 30)} months</span>
                <span>{fmtDate(modelConfig.startDate)} → {fmtDate(modelConfig.endDate)}</span>
              </div>
            </RunSection>

            <RunSection step={4} title="Solver options" description="Feasibility, storage and advanced solver parameters.">
              <div className="divide-y divide-black/10">
                <ToggleRow
                  title="Ensure feasibility"
                  description="Allow unmet demand so the model always solves."
                  checked={modelConfig.ensureFeasibility}
                  onChange={v => setModelConfig(p => ({ ...p, ensureFeasibility: v }))}
                />
                <ToggleRow
                  title="Cyclic storage"
                  description="Storage level at the end equals the level at the start."
                  checked={modelConfig.cyclicStorage}
                  onChange={v => setModelConfig(p => ({ ...p, cyclicStorage: v }))}
                />
              </div>
              <button
                onClick={() => setShowAdvancedSettings(v => !v)}
                className="mt-3 flex w-full items-center justify-between rounded-lg border border-black/15 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <span className="text-xs font-semibold text-slate-700">Advanced solver parameters</span>
                <FiChevronDown size={15} className={`text-slate-400 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
              </button>
              {showAdvancedSettings && (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-black/15 p-4 md:grid-cols-3">
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
                        <span className="group relative inline-flex">
                          <button type="button" aria-label={`About ${label}`} className="grid h-4 w-4 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:text-slate-900 focus:text-slate-900 focus:outline-none">
                            <LuInfo size={13} />
                          </button>
                          <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-lg bg-black px-2.5 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                            {tip}
                            <span className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-black" />
                          </span>
                        </span>
                      </div>
                      <input
                        type="number"
                        step={step}
                        value={modelConfig.solverOptions[key]}
                        onChange={e => setModelConfig(p => ({
                          ...p,
                          solverOptions: { ...p.solverOptions, [key]: parseFloat(e.target.value) || 0 }
                        }))}
                        className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}

            </RunSection>

            {isCalliope07Selected && (
              <RunSection title="Custom math (0.7)" description="Optional YAML added to the built-in math.">
                <textarea
                  rows={6}
                  placeholder={'# Example — add a custom constraint:\nvariables:\n  my_var:\n    foreach: [nodes, techs, timesteps]\n    domain: NonNegativeReals\n    bounds:\n      min: 0\n      max: inf'}
                  value={modelConfig.customMath}
                  onChange={e => setModelConfig(p => ({ ...p, customMath: e.target.value }))}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-black/15 bg-slate-50 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </RunSection>
            )}
          </div>

          {/* Summary + run, active runs */}
          <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-2xl border border-black/15 bg-white p-5 ">
              <h2 className="text-sm font-semibold text-slate-900">Run summary</h2>
              <dl className="mt-3 divide-y divide-black/10 text-sm">
                {[
                  ['Model', selectedModel ? selectedModel.name : '—'],
                  ['Framework', activeFrameworkLabel],
                  ['Mode', modeLabel],
                  ['Period', `${durationDays} days`],
                  ['Compute', computeRemote ? 'Remote (MEME)' : 'Local'],
                  ...(hasSelections ? [['Scenarios', `${selectedScenarios.length + selectedOverrides.length} selected`]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="truncate text-right font-medium text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <button
                onClick={handleRunModel}
                disabled={runDisabled}
                title={runBlocker || undefined}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black text-[15px] font-semibold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                <FiPlay size={17} />
                {hasSelections
                  ? `Run Selected (${selectedScenarios.length + selectedOverrides.length})`
                  : runningJobs.length > 0 ? 'Run in Progress…'
                  : computeRemote ? 'Run Model (Remote)' : 'Run Model'}
              </button>
              {runBlocker && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <FiAlertCircle size={12} /> {runBlocker}
                </p>
              )}
            </div>

            <ActiveJobsPanel
              expandedLog={expandedLog}
              handleStopJob={handleStopJob}
              logEndRef={logEndRef}
              runningJobs={runningJobs}
              setExpandedLog={setExpandedLog}
            />
          </div>
        </div>

        <CompletedRunsSection
          onNavigate={onNavigate}
          completedJobs={completedJobs}
          downloadJob={downloadJob}
          expandedCompletedLog={expandedCompletedLog}
          removeCompletedJob={removeCompletedJob}
          setActiveResultJobId={setActiveResultJobId}
          setExpandedCompletedLog={setExpandedCompletedLog}
        />

      </div>
    </div>
  );
};

const TIME_PRESETS = [
  { label: '1 Day',   days: 0 },
  { label: '1 Week',  days: 6 },
  { label: '1 Month', months: 1 },
  { label: '1 Year',  years: 1 },
];

function presetEnd(startStr, preset) {
  const s = new Date(startStr + 'T00:00:00');
  if (isNaN(s)) return null;
  const e = new Date(s);
  if (preset.days != null) e.setDate(e.getDate() + preset.days);
  if (preset.months)       e.setMonth(e.getMonth() + preset.months, e.getDate() - 1);
  if (preset.years)        e.setFullYear(e.getFullYear() + preset.years, e.getMonth(), e.getDate() - 1);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
}

function RunSection({ step, title, description, children }) {
  return (
    <section className="rounded-2xl border border-black/15 bg-white p-6 ">
      <div className="mb-5 flex items-start gap-3">
        {step && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-black text-xs font-semibold text-white">{step}</span>
        )}
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0">
      <div>
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${checked ? 'bg-black' : 'bg-slate-200'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export default Run;
