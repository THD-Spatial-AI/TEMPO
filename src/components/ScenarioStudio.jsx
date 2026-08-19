import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FiTrendingUp, FiSun, FiCloud, FiDollarSign,
  FiPlay, FiStopCircle, FiCheckCircle, FiAlertCircle,
  FiChevronDown, FiInfo, FiZap, FiClock,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel } from '../services/calliopeClient';
import { checkEngineRunService, runEngineModel } from '../services/engineClient';
import { applyOps } from '../services/scenarioStudio/transform.js';
import { expandRecipe } from '../services/scenarioStudio/recipes/index.js';

// ─── Recipe catalogue (UI metadata) ─────────────────────────────────────────

const RECIPE_CARDS = [
  {
    id: 'demandGrowth',
    label: 'Demand growth pathway',
    description: 'Grow electricity demand year by year at a defined rate. Runs each year as an independent snapshot.',
    Icon: FiTrendingUp,
    color: 'from-blue-500 to-blue-600',
    available: true,
  },
  {
    id: 'renewableTransition',
    label: 'Renewable transition',
    description: 'Ramp renewable share to a target %, phase out fossil techs across yearly snapshots.',
    Icon: FiSun,
    color: 'from-amber-500 to-orange-500',
    available: false,
  },
  {
    id: 'carbonCap',
    label: 'Carbon cap / net-zero',
    description: 'Tighten a CO₂ cap toward zero over time. See the least-cost system at each constraint level.',
    Icon: FiCloud,
    color: 'from-green-500 to-emerald-600',
    available: false,
  },
  {
    id: 'costSensitivity',
    label: 'Cost sensitivity sweep',
    description: 'Sweep a key price (solar capex, gas, battery) across a range. See how the optimal mix shifts.',
    Icon: FiDollarSign,
    color: 'from-purple-500 to-violet-600',
    available: false,
  },
];

// ─── Default params per recipe ────────────────────────────────────────────────

const DEFAULT_PARAMS = {
  demandGrowth: {
    baseYear: 2025,
    ratePerYear: 1.5,
    snapshotMode: 'range',  // 'range' | 'list'
    snapshotFrom: 2025,
    snapshotTo: 2040,
    snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    demandTechsMode: 'auto', // 'auto' | 'manual'
    demandTechsManual: [],
  },
};

// ─── Helper: build recipe params from UI state ───────────────────────────────

function buildRecipeParams(recipeId, ui, model) {
  if (recipeId === 'demandGrowth') {
    const snapshotYears = ui.snapshotMode === 'list'
      ? ui.snapshotList.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : { from: ui.snapshotFrom, to: ui.snapshotTo, step: ui.snapshotStep };

    const demandTechs = ui.demandTechsMode === 'auto'
      ? { parentIs: 'demand' }
      : ui.demandTechsManual;

    return {
      baseYear: ui.baseYear,
      ratePerYear: parseFloat(ui.ratePerYear) / 100,
      snapshotYears,
      demandTechs,
    };
  }
  return {};
}

// ─── Preview: resolve which demand techs will be touched ────────────────────

function resolveTechNames(model, params) {
  if (!model) return [];
  const { demandTechs } = params;
  if (Array.isArray(demandTechs)) return demandTechs;
  if (typeof demandTechs === 'string') return [demandTechs];
  const parent = demandTechs?.parentIs ?? 'demand';
  return (model.technologies || []).filter(t => t.parent === parent).map(t => t.name);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RecipeCard({ card, selected, onSelect }) {
  const { id, label, description, Icon, color, available } = card;
  const isSelected = selected === id;
  return (
    <button
      onClick={() => available && onSelect(id)}
      disabled={!available}
      className={`relative flex flex-col gap-2 p-4 rounded-xl border text-left transition-all ${
        isSelected
          ? 'border-electric-500 bg-electric-50 shadow-md ring-1 ring-electric-400'
          : available
          ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
          : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-800 leading-tight">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5 leading-snug">{description}</div>
      </div>
      {!available && (
        <span className="absolute top-2 right-2 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          Coming soon
        </span>
      )}
      {isSelected && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-electric-500" />
      )}
    </button>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1, unit, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-28 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 focus:border-transparent"
        />
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Demand Growth config panel ───────────────────────────────────────────────

function DemandGrowthConfig({ params, setParam, model }) {
  const demandTechs = (model?.technologies || []).filter(t => t.parent === 'demand');

  return (
    <div className="space-y-5">
      <NumberInput
        label="Base year"
        value={params.baseYear}
        onChange={v => setParam('baseYear', Math.round(v))}
        min={2000} max={2100} step={1}
        hint="Demand in this year = baseline (scale factor 1.0)"
      />

      <NumberInput
        label="Annual growth rate"
        value={params.ratePerYear}
        onChange={v => setParam('ratePerYear', v)}
        min={-20} max={20} step={0.1}
        unit="% / yr"
        hint="Compound growth applied from base year. Negative = shrink."
      />

      {/* Snapshot years */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Snapshot years</label>
        <div className="flex gap-2 mb-2">
          {['range', 'list'].map(m => (
            <button
              key={m}
              onClick={() => setParam('snapshotMode', m)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                params.snapshotMode === m
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m === 'range' ? 'Range' : 'Custom list'}
            </button>
          ))}
        </div>
        {params.snapshotMode === 'range' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              <span className="text-xs text-slate-500 block mb-1">From</span>
              <input type="number" value={params.snapshotFrom} min={2000} max={2200} step={1}
                onChange={e => setParam('snapshotFrom', parseInt(e.target.value) || 2025)}
                className="w-22 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-1">To</span>
              <input type="number" value={params.snapshotTo} min={2000} max={2200} step={1}
                onChange={e => setParam('snapshotTo', parseInt(e.target.value) || 2040)}
                className="w-22 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-1">Step</span>
              <input type="number" value={params.snapshotStep} min={1} max={50} step={1}
                onChange={e => setParam('snapshotStep', parseInt(e.target.value) || 5)}
                className="w-16 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
            </div>
            <span className="text-xs text-slate-400 mt-4">years</span>
          </div>
        ) : (
          <div>
            <input
              type="text"
              value={params.snapshotList}
              onChange={e => setParam('snapshotList', e.target.value)}
              placeholder="2025, 2030, 2035, 2040"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400"
            />
            <p className="text-xs text-slate-400 mt-0.5">Comma-separated years</p>
          </div>
        )}
      </div>

      {/* Demand tech selector */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Demand technologies</label>
        <div className="flex gap-2 mb-2">
          {['auto', 'manual'].map(m => (
            <button
              key={m}
              onClick={() => setParam('demandTechsMode', m)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                params.demandTechsMode === m
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m === 'auto' ? 'Auto-detect' : 'Select manually'}
            </button>
          ))}
        </div>
        {params.demandTechsMode === 'auto' ? (
          <p className="text-xs text-slate-500">
            All technologies with <code className="bg-slate-100 px-1 rounded">parent: demand</code> in the model will be scaled.
          </p>
        ) : (
          <div className="space-y-1.5">
            {demandTechs.length === 0 && (
              <p className="text-xs text-slate-400 italic">No demand techs found in model.</p>
            )}
            {demandTechs.map(t => (
              <label key={t.name} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={params.demandTechsManual.includes(t.name)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...params.demandTechsManual, t.name]
                      : params.demandTechsManual.filter(n => n !== t.name);
                    setParam('demandTechsManual', next);
                  }}
                  className="rounded text-electric-500 focus:ring-electric-400"
                />
                <span className="text-xs font-mono text-slate-700 group-hover:text-slate-900">{t.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Running job row ─────────────────────────────────────────────────────────

function JobRow({ job, onStop }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-electric-500 animate-pulse shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate">{job.displayName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setExpanded(e => !e)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <FiChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => onStop(job.id)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <FiStopCircle size={12} /> Stop
          </button>
        </div>
      </div>
      {expanded && job.logs.length > 0 && (
        <div className="mt-2 bg-slate-900 rounded-lg p-2 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-0.5">
          {job.logs.slice(-20).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ScenarioStudio({ onNavigate }) {
  const {
    models, getCurrentModel, showNotification,
    addCompletedJob, completedJobs,
    timeSeries, technologies,
  } = useData();

  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState('demandGrowth');
  const [params, setParams] = useState(DEFAULT_PARAMS['demandGrowth']);
  const [serviceStatus, setServiceStatus] = useState(null); // null|true|false
  const [runningJobs, setRunningJobs] = useState([]);
  const cancelFnsRef = useRef({});
  const completedIdsRef = useRef(new Set());

  // Pre-select current model
  useEffect(() => {
    const cur = getCurrentModel();
    if (cur) setSelectedModel(cur);
  }, [getCurrentModel]);

  // Check Calliope service once on mount
  useEffect(() => {
    checkCalliopeService().then(up => setServiceStatus(up)).catch(() => setServiceStatus(false));
  }, []);

  const setParam = (key, value) => setParams(p => ({ ...p, [key]: value }));

  // Switch recipe → reset params to defaults
  const handleSelectRecipe = (id) => {
    setSelectedRecipe(id);
    setParams(DEFAULT_PARAMS[id] || {});
  };

  // ── Derive variants from current params ──────────────────────────────────

  const model = selectedModel;
  const recipeParams = useMemo(
    () => model ? buildRecipeParams(selectedRecipe, params, model) : null,
    [selectedRecipe, params, model]
  );
  const variants = useMemo(() => {
    if (!model || !recipeParams) return [];
    try {
      return expandRecipe(model, selectedRecipe, recipeParams);
    } catch {
      return [];
    }
  }, [model, selectedRecipe, recipeParams]);

  const affectedTechs = useMemo(
    () => recipeParams ? resolveTechNames(model, recipeParams) : [],
    [model, recipeParams]
  );

  // ── Job completion handlers ───────────────────────────────────────────────

  const _handleDone = (jobId, batchId, variantLabel, result) => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    setRunningJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job) {
        const ms = Date.now() - new Date(job.startTime).getTime();
        const duration = ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`;
        setTimeout(() => {
          addCompletedJob({
            id: jobId,
            modelName: job.displayName,
            framework: 'calliope',
            solver: 'highs',
            mode: 'plan',
            status: result?.success === false ? 'failed' : 'completed',
            completedAt: new Date().toISOString(),
            duration,
            objective: result?.objective || null,
            terminationCondition: result?.termination_condition || 'optimal',
            result: result || {},
            logs: job.logs,
            batchId,
            variantLabel,
          });
          showNotification(
            result?.success === false
              ? `Run failed: ${result.error}`
              : `Completed: ${job.displayName} (${duration})`,
            result?.success === false ? 'error' : 'success'
          );
        }, 0);
      }
      return prev.filter(j => j.id !== jobId);
    });
    delete cancelFnsRef.current[jobId];
  };

  const _handleError = (jobId, batchId, variantLabel, error) => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    setRunningJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job) {
        setTimeout(() => {
          addCompletedJob({
            id: jobId,
            modelName: job.displayName,
            framework: 'calliope',
            solver: 'highs',
            mode: 'plan',
            status: 'failed',
            completedAt: new Date().toISOString(),
            duration: 'N/A',
            objective: null,
            terminationCondition: 'error',
            result: { success: false, error },
            logs: [...job.logs, `[ERROR] ${error}`],
            batchId,
            variantLabel,
          });
          showNotification(`Run failed: ${error}`, 'error');
        }, 0);
      }
      return prev.filter(j => j.id !== jobId);
    });
    delete cancelFnsRef.current[jobId];
  };

  // ── Dispatch batch ────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!model) { showNotification('Select a model first.', 'error'); return; }
    if (variants.length === 0) { showNotification('No variants to run.', 'error'); return; }
    if (serviceStatus === false) {
      showNotification('Calliope service is not running. Start it from Settings → Calliope Engine.', 'error');
      return;
    }
    if (serviceStatus === null) {
      const up = await checkCalliopeService();
      setServiceStatus(up);
      if (!up) { showNotification('Calliope service not reachable.', 'error'); return; }
    }

    const batchId = `batch_${Date.now()}`;
    const isCurrentModel = model.id === getCurrentModel()?.id;
    const techsForRun = isCurrentModel && technologies?.length
      ? technologies
      : (model.technologies || technologies || []);
    const tsForRun = (timeSeries || []).filter(ts => ts.modelId === model.id);

    showNotification(`Starting ${variants.length} scenario run${variants.length > 1 ? 's' : ''}…`, 'info');

    for (const variant of variants) {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const displayName = `${model.name} — ${variant.label}`;

      // Build concrete model for this variant
      const baseModelData = {
        ...model,
        solver: 'highs',
        modelConfig: model.modelConfig || {},
        technologies: techsForRun,
        timeSeries: tsForRun,
      };
      const concreteModel = applyOps(baseModelData, variant.ops);

      const newJob = {
        id: jobId,
        displayName,
        startTime: new Date().toISOString(),
        logs: [`[TEMPO] Scenario Studio — ${displayName}`],
      };
      setRunningJobs(prev => [...prev, newJob]);

      try {
        const { cancel } = await runCalliopeModel({
          modelData: concreteModel,
          onLog: line => setRunningJobs(prev =>
            prev.map(j => j.id === jobId ? { ...j, logs: [...j.logs, line] } : j)
          ),
          onStats: () => {},
          onDone: result => _handleDone(jobId, batchId, variant.label, result),
          onError: error => _handleError(jobId, batchId, variant.label, error),
        });
        cancelFnsRef.current[jobId] = cancel;
      } catch (err) {
        setRunningJobs(prev => prev.filter(j => j.id !== jobId));
        showNotification(`Failed to start "${displayName}": ${err.message}`, 'error');
      }
    }
  };

  const handleStop = (jobId) => {
    cancelFnsRef.current[jobId]?.();
    delete cancelFnsRef.current[jobId];
    setRunningJobs(prev => prev.filter(j => j.id !== jobId));
    showNotification('Run stopped.', 'info');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const recipeName = RECIPE_CARDS.find(r => r.id === selectedRecipe)?.label ?? '';

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-electric-600 to-electric-700 bg-clip-text text-transparent">
            Scenario Studio
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Design and run policy scenarios without manual configuration
          </p>
        </div>

        {/* Model selector */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 flex-wrap shadow-sm">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FiZap size={15} className="text-electric-500 shrink-0" />
            <span className="text-sm font-medium text-slate-600 shrink-0">Model</span>
            <select
              value={selectedModel?.id || ''}
              onChange={e => {
                const m = models.find(m => m.id === e.target.value);
                setSelectedModel(m || null);
              }}
              className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white"
            >
              <option value="">— select a model —</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              serviceStatus === true  ? 'bg-green-50 border-green-200 text-green-700' :
              serviceStatus === false ? 'bg-red-50 border-red-200 text-red-600' :
              'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                serviceStatus === true ? 'bg-green-500' :
                serviceStatus === false ? 'bg-red-500' : 'bg-slate-400 animate-pulse'
              }`} />
              Calliope {serviceStatus === true ? 'ready' : serviceStatus === false ? 'offline' : 'checking…'}
            </div>
          </div>
        </div>

        {/* Recipe gallery */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">1 — Choose a recipe</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RECIPE_CARDS.map(card => (
              <RecipeCard
                key={card.id}
                card={card}
                selected={selectedRecipe}
                onSelect={handleSelectRecipe}
              />
            ))}
          </div>
        </div>

        {/* Config + Preview two-column */}
        {selectedRecipe && (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">

            {/* Config panel */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">
                2 — Configure: {recipeName}
              </h2>

              {selectedRecipe === 'demandGrowth' && model ? (
                <DemandGrowthConfig params={params} setParam={setParam} model={model} />
              ) : !model ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 italic">
                  <FiInfo size={14} /> Select a model above to configure this recipe.
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Configuration for this recipe is coming soon.</p>
              )}
            </div>

            {/* Preview + Run panel */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-slate-700">3 — Preview &amp; Run</h2>

              {variants.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Configure the recipe to see a preview.</p>
              ) : (
                <>
                  {/* Variant list */}
                  <div>
                    <p className="text-xs text-slate-500 mb-2">
                      <span className="font-semibold text-slate-700">{variants.length} run{variants.length > 1 ? 's' : ''}</span> will be created:
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {variants.map(v => {
                        const factor = v.ops[0]?.factor ?? 1;
                        const pct = ((factor - 1) * 100);
                        const sign = pct >= 0 ? '+' : '';
                        return (
                          <div key={v.label} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs">
                            <span className="font-semibold text-slate-700">{v.label}</span>
                            <span className={`font-mono ${Math.abs(pct) < 0.01 ? 'text-slate-400' : pct > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {Math.abs(pct) < 0.01
                                ? 'baseline'
                                : `${sign}${pct.toFixed(1)}% vs base`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Affected techs */}
                  {affectedTechs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Technologies scaled:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {affectedTechs.map(name => (
                          <span key={name} className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                            {name}
                          </span>
                        ))}
                        {affectedTechs.length === 0 && (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <FiAlertCircle size={11} /> No demand techs found in model
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Capability note */}
                  <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                    Each run is a full independent Calliope 0.6.8 solve with demand pre-scaled. Results appear in the Results tab grouped by batch.
                  </div>

                  {/* Run button */}
                  <button
                    onClick={handleRun}
                    disabled={!model || runningJobs.length > 0 || serviceStatus === false}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                      !model || serviceStatus === false
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : runningJobs.length > 0
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-electric-600 to-electric-700 text-white hover:shadow-md hover:scale-[1.01] active:scale-100'
                    }`}
                  >
                    <FiPlay size={15} />
                    Run {variants.length} scenario{variants.length > 1 ? 's' : ''}
                  </button>

                  {runningJobs.length > 0 && (
                    <p className="text-xs text-slate-400 text-center">
                      <FiClock size={11} className="inline mr-1" />
                      {runningJobs.length} run{runningJobs.length > 1 ? 's' : ''} in progress…
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Active jobs */}
        {runningJobs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Active runs</h2>
            <div className="space-y-2">
              {runningJobs.map(j => (
                <JobRow key={j.id} job={j} onStop={handleStop} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
