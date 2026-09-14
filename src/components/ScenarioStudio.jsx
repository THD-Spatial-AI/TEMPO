import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import { FiZap, FiLayers } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel } from '../services/calliopeClient';
import { checkEngineRunService, runEngineModel } from '../services/engineClient';
import { applyOps } from '../services/scenarioStudio/transform.js';
import { composeRecipes } from '../services/scenarioStudio/compose.js';
import { buildCarryForwardOp, accumulateExistingCaps } from '../services/scenarioStudio/pathway.js';
import { buildCalliope06GroupConstraintsOverride } from '../services/scenarioStudio/utils.js';
import { getCapabilityWarnings, engineKeyFromModel, ENGINE_LABELS, ENGINE_FRAMEWORK } from '../services/scenarioStudio/capabilities.js';
import { deriveGroups, canConnect } from '../services/scenarioStudio/board.js';
import { DEFAULT_PARAMS, buildRecipeParams } from './scenarioStudio/recipeMeta.js';
import ScenarioBoard from './scenarioStudio/ScenarioBoard.jsx';
import RecipeSidePanel from './scenarioStudio/RecipeSidePanel.jsx';
import BoardDock from './scenarioStudio/BoardDock.jsx';
import ResultsSheet from './scenarioStudio/ResultsSheet.jsx';

// ─── Board persistence (localStorage) ────────────────────────────────────────

const BOARD_KEY = 'scenarioBoard';
const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

function defaultBoard() {
  return {
    nodes: [{
      id: 'card_seed', type: 'recipeCard', position: { x: 140, y: 120 },
      data: { recipeId: 'demandGrowth', params: clone(DEFAULT_PARAMS.demandGrowth), pathwayMode: false },
    }],
    edges: [],
  };
}

function loadBoard() {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return defaultBoard();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.nodes)) return defaultBoard();
    return { nodes: parsed.nodes, edges: Array.isArray(parsed.edges) ? parsed.edges : [] };
  } catch { return defaultBoard(); }
}

function saveBoard(nodes, edges) {
  try {
    const slimNodes = nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data }));
    const slimEdges = edges.map(e => ({ id: e.id, source: e.source, target: e.target }));
    localStorage.setItem(BOARD_KEY, JSON.stringify({ nodes: slimNodes, edges: slimEdges }));
  } catch { /* quota / private mode */ }
}

const genId = () => `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Main component ──────────────────────────────────────────────────────────

export default function ScenarioStudio({ onNavigate }) {
  const {
    models, getCurrentModel, showNotification, addCompletedJob, completedJobs, timeSeries, technologies,
    runningJobs, addRunningJob, removeRunningJob, appendRunningJobLog,
  } = useData();

  const [selectedModel, setSelectedModel] = useState(null);
  const [extraModels, setExtraModels] = useState([]);
  const [showModelCompare, setShowModelCompare] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState('calliope06');
  const [serviceStatus, setServiceStatus] = useState(null);

  // Board state (React Flow) — initialised from localStorage.
  const initial = useMemo(() => loadBoard(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [pathwayProgress, setPathwayProgress] = useState({}); // { headId: { variantLabel: status } }

  // Persist board on change.
  useEffect(() => { saveBoard(nodes, edges); }, [nodes, edges]);

  // Synchronous refs for callbacks.
  const runningJobsRef = useRef([]);
  useEffect(() => { runningJobsRef.current = runningJobs; }, [runningJobs]);
  const nodesRef = useRef(nodes); useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef(edges); useEffect(() => { edgesRef.current = edges; }, [edges]);
  const cancelFnsRef = useRef({});
  const completedIdsRef = useRef(new Set());

  useEffect(() => {
    const cur = getCurrentModel();
    if (cur) {
      setSelectedModel(cur);
      setSelectedEngine(engineKeyFromModel(cur));
    }
  }, [getCurrentModel]);

  // Re-check service status when engine changes.
  useEffect(() => {
    setServiceStatus(null);
    if (selectedEngine === 'calliope06' || selectedEngine === 'calliope07') {
      const ver = selectedEngine === 'calliope07' ? '0.7' : undefined;
      checkCalliopeService(ver).then(up => setServiceStatus(up)).catch(() => setServiceStatus(false));
    } else {
      checkEngineRunService(selectedEngine).then(up => setServiceStatus(up)).catch(() => setServiceStatus(false));
    }
  }, [selectedEngine]);

  const model = selectedModel;
  const sporesEngineOk = selectedEngine === 'calliope06';

  // ── Board editing callbacks ─────────────────────────────────────────────────

  const addNode = useCallback((recipeId, position) => {
    const id = genId();
    const pos = position || { x: 160 + nodesRef.current.length * 30, y: 140 + nodesRef.current.length * 30 };
    setNodes(nds => [...nds, {
      id, type: 'recipeCard', position: pos,
      data: { recipeId, params: clone(DEFAULT_PARAMS[recipeId] || {}), pathwayMode: false },
    }]);
    setSelectedNodeId(id);
  }, [setNodes]);

  const deleteNode = useCallback((id) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNodeId(sid => (sid === id ? null : sid));
  }, [setNodes, setEdges]);

  const onConnect = useCallback((conn) => {
    // Validate against the current graph — linear chains only, no SPORES/cycles.
    if (!canConnect(nodesRef.current, edgesRef.current, conn)) {
      showNotification('Cannot connect: chains must be linear (no forks, cycles, or SPORES cards).', 'error');
      return;
    }
    setEdges(eds => addEdge(conn, eds));
  }, [setEdges, showNotification]);

  const setNodeParams = useCallback((nodeId, key, value) => {
    setNodes(nds => nds.map(n => n.id === nodeId
      ? { ...n, data: { ...n.data, params: { ...(n.data.params || {}), [key]: value } } }
      : n));
  }, [setNodes]);

  const togglePathway = useCallback((headId, val) => {
    setNodes(nds => nds.map(n => n.id === headId ? { ...n, data: { ...n.data, pathwayMode: val } } : n));
  }, [setNodes]);

  const onNodeClick = useCallback((_e, node) => setSelectedNodeId(node.id), []);

  // ── Derive groups + per-node metadata ───────────────────────────────────────

  const { metaByNode, groupInfos, totals } = useMemo(() => {
    const groups = deriveGroups(nodes, edges);
    const map = new Map();
    const infos = [];
    let totalRuns = 0, warningCount = 0;
    const modelsCount = 1 + extraModels.length;

    for (const g of groups) {
      const isSpores = g.isSpores;
      let variants = [], warnings = [];
      if (model && isSpores) {
        variants = [{ label: 'Alternatives', ops: [] }];
      } else if (model) {
        const mapped = g.layers.map(l => ({ recipeId: l.recipeId, params: buildRecipeParams(l.recipeId, l.params, model) }));
        try { const c = composeRecipes(model, mapped); variants = c.variants; warnings = c.warnings; }
        catch { variants = []; }
      }
      const capabilityWarnings = variants.length ? getCapabilityWarnings(selectedEngine, variants.flatMap(v => v.ops)) : [];
      const isEligible = !isSpores && variants.length > 1 && variants.every(v => typeof v.year === 'number');
      const headNode = nodes.find(n => n.id === g.head);
      const headParams = headNode?.data?.params || {};
      const pathwayMode = isEligible && !!headNode?.data?.pathwayMode;
      const runCount = isSpores ? ((headParams.sporesNumber ?? 20) + 1) : variants.length;
      totalRuns += runCount * modelsCount;
      warningCount += warnings.length + capabilityWarnings.length;

      infos.push({ head: g.head, isSpores, variants, warnings, capabilityWarnings, isEligible, pathwayMode });
      g.nodeIds.forEach((nid, idx) => {
        map.set(nid, {
          isHead: nid === g.head, isSpores, variantCount: variants.length,
          isEligible, pathwayMode, chainPos: idx, chainLen: g.nodeIds.length,
          variants, warnings, capabilityWarnings,
        });
      });
    }
    return { metaByNode: map, groupInfos: infos, totals: { totalRuns, warningCount, groupCount: groups.length } };
  }, [nodes, edges, model, selectedEngine, extraModels]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  const latestSporesJob = useMemo(() => {
    const jobs = (completedJobs || []).filter(j =>
      j.source === 'scenario_studio' && j.mode === 'spores' &&
      Array.isArray(j.result?.spores_data) && j.result.spores_data.length > 0);
    return jobs.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0] || null;
  }, [completedJobs]);

  // ── Job completion ──────────────────────────────────────────────────────────

  const _handleDone = (jobId, batchId, variantLabel, modelLabel, result, mode = 'plan') => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    const job = runningJobsRef.current.find(j => j.id === jobId);
    removeRunningJob(jobId);
    if (job) {
      const ms = Date.now() - new Date(job.startTime).getTime();
      const duration = ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`;
      setTimeout(() => {
        addCompletedJob({
          id: jobId, modelName: job.displayName, framework: ENGINE_FRAMEWORK[job.engine] || 'calliope',
          solver: 'highs', mode, status: result?.success === false ? 'failed' : 'completed',
          completedAt: new Date().toISOString(), duration, objective: result?.objective || null,
          terminationCondition: result?.termination_condition || 'optimal',
          result: result || {}, logs: job.logs, batchId, variantLabel, modelLabel, source: job.source,
        });
        showNotification(
          result?.success === false ? `Run failed: ${result.error}` : `Completed: ${job.displayName} (${duration})`,
          result?.success === false ? 'error' : 'success'
        );
      }, 0);
    }
    delete cancelFnsRef.current[jobId];
  };

  const _handleError = (jobId, batchId, variantLabel, modelLabel, error, mode = 'plan') => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    const job = runningJobsRef.current.find(j => j.id === jobId);
    removeRunningJob(jobId);
    if (job) {
      setTimeout(() => {
        addCompletedJob({
          id: jobId, modelName: job.displayName, framework: ENGINE_FRAMEWORK[job.engine] || 'calliope',
          solver: 'highs', mode, status: 'failed', completedAt: new Date().toISOString(),
          duration: 'N/A', objective: null, terminationCondition: 'error',
          result: { success: false, error }, logs: [...job.logs, `[ERROR] ${error}`],
          batchId, variantLabel, modelLabel, source: job.source,
        });
        showNotification(`Run failed: ${error}`, 'error');
      }, 0);
    }
    delete cancelFnsRef.current[jobId];
  };

  // ── Dispatch ────────────────────────────────────────────────────────────────

  const buildConcrete = (m, variant, techsForRun, tsForRun, extraOp) => {
    const baseModelData = {
      ...m, solver: 'highs', modelConfig: m.modelConfig || {},
      technologies: techsForRun, timeSeries: tsForRun,
    };
    const ops = extraOp ? [...variant.ops, extraOp] : variant.ops;
    const concreteModel = applyOps(baseModelData, ops);

    if (selectedEngine === 'calliope06' || selectedEngine === 'calliope07') {
      const gc = concreteModel.modelConfig?.groupConstraints;
      const nativeGC = gc ? buildCalliope06GroupConstraintsOverride(gc) : null;
      if (nativeGC) {
        concreteModel.overrides = { ...(concreteModel.overrides || {}), _studio_sys: { group_constraints: nativeGC } };
        concreteModel.override = '_studio_sys';
      }
      if (selectedEngine === 'calliope07') {
        concreteModel.modelConfig = { ...(concreteModel.modelConfig || {}), calliopeVersion: '0.7.0' };
      }
    }
    return concreteModel;
  };

  const runVariant = (m, variant, concreteModel, batchId, engineLabel, mode = 'plan') => new Promise((resolve) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const displayName = `${m.name} — ${variant.label}`;
    addRunningJob({
      id: jobId, displayName, startTime: new Date().toISOString(), engine: selectedEngine,
      source: 'scenario_studio',
      logs: [`[TEMPO] Scenario Studio — ${displayName} [${engineLabel}]`],
    });
    const onDone = (result) => { _handleDone(jobId, batchId, variant.label, m.name, result, mode); resolve(result || {}); };
    const onError = (error) => { _handleError(jobId, batchId, variant.label, m.name, error, mode); resolve({ success: false, error }); };
    const opts = { modelData: concreteModel, onLog: line => appendRunningJobLog(jobId, line), onStats: () => {}, onDone, onError };
    const start = (selectedEngine === 'calliope06' || selectedEngine === 'calliope07')
      ? runCalliopeModel(opts)
      : runEngineModel(selectedEngine, opts);
    start
      .then(({ cancel }) => { cancelFnsRef.current[jobId] = cancel; })
      .catch((err) => {
        removeRunningJob(jobId);
        showNotification(`Failed to start "${displayName}": ${err.message}`, 'error');
        resolve({ success: false, error: err.message });
      });
  });

  const markSkipped = (m, variant, batchId, headId) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    addCompletedJob({
      id: jobId, modelName: `${m.name} — ${variant.label}`, framework: ENGINE_FRAMEWORK[selectedEngine] || 'calliope',
      solver: 'highs', mode: 'plan', status: 'skipped', completedAt: new Date().toISOString(),
      duration: '—', objective: null, terminationCondition: 'skipped',
      result: { success: false, skipped: true }, logs: ['[TEMPO] Skipped — myopic pathway broken at an earlier year'],
      batchId, variantLabel: variant.label, modelLabel: m.name,
    });
    setPathwayProgress(p => ({ ...p, [headId]: { ...(p[headId] || {}), [variant.label]: 'skipped' } }));
  };

  const handleRun = async () => {
    if (!model) { showNotification('Select a model first.', 'error'); return; }
    if (!groupInfos.length || totals.totalRuns === 0) {
      showNotification('Add at least one recipe card to the board.', 'error'); return;
    }

    const engineLabel = ENGINE_LABELS[selectedEngine] || selectedEngine;
    if (serviceStatus === false) {
      showNotification(`${engineLabel} service is offline. Start it from Settings.`, 'error'); return;
    }
    if (serviceStatus === null) {
      const up = (selectedEngine === 'calliope06' || selectedEngine === 'calliope07')
        ? await checkCalliopeService(selectedEngine === 'calliope07' ? '0.7' : undefined)
        : await checkEngineRunService(selectedEngine);
      setServiceStatus(up);
      if (!up) { showNotification(`Cannot reach ${engineLabel} service.`, 'error'); return; }
    }

    const batchId = `batch_${Date.now()}`;
    const modelsToRun = extraModels.length > 0 ? [model, ...extraModels] : [model];

    // Reset progress for pathway groups.
    const initProg = {};
    groupInfos.forEach(g => { if (g.pathwayMode) initProg[g.head] = Object.fromEntries(g.variants.map(v => [v.label, 'pending'])); });
    setPathwayProgress(initProg);

    showNotification(
      `Starting ${totals.totalRuns} run${totals.totalRuns > 1 ? 's' : ''} across ${totals.groupCount} scenario${totals.groupCount > 1 ? 's' : ''} on ${engineLabel}…`,
      'info'
    );
    onNavigate?.('Run');

    for (const m of modelsToRun) {
      const isCurrentModel = m.id === getCurrentModel()?.id;
      const techsForRun = isCurrentModel && technologies?.length ? technologies : (m.technologies || technologies || []);
      const tsForRun = (timeSeries || []).filter(ts => ts.modelId === m.id);

      for (const g of groupInfos) {
        if (g.isSpores) {
          if (!sporesEngineOk) { showNotification('SPORES card skipped — requires the Calliope 0.6 engine.', 'error'); continue; }
          const variant = { label: 'Alternatives', ops: [] };
          const headParams = nodesRef.current.find(n => n.id === g.head)?.data?.params || {};
          const concrete = buildConcrete(m, variant, techsForRun, tsForRun, null);
          concrete.modelConfig = {
            ...(concrete.modelConfig || {}),
            mode: 'spores',
            sporesOptions: { slack: headParams.slack ?? 10, sporesNumber: headParams.sporesNumber ?? 20 },
          };
          runVariant(m, variant, concrete, batchId, engineLabel, 'spores');
          continue;
        }

        if (g.pathwayMode) {
          // Sequential with feedback: carry each solved year's capacity forward.
          let priorCaps = null, broken = false;
          for (const variant of g.variants) {
            if (broken) { markSkipped(m, variant, batchId, g.head); continue; }
            setPathwayProgress(p => ({ ...p, [g.head]: { ...(p[g.head] || {}), [variant.label]: 'running' } }));
            const carryOp = priorCaps ? buildCarryForwardOp({ technologies: techsForRun }, priorCaps) : null;
            const concrete = buildConcrete(m, variant, techsForRun, tsForRun, carryOp);
            const result = await runVariant(m, variant, concrete, batchId, engineLabel);
            const ok = result?.success !== false && (result?.capacities && Object.keys(result.capacities).length > 0);
            if (!ok) {
              setPathwayProgress(p => ({ ...p, [g.head]: { ...(p[g.head] || {}), [variant.label]: 'failed' } }));
              showNotification(`Pathway broke at ${variant.label} (${result?.termination_condition || result?.error || 'no solution'}). Later years skipped.`, 'error');
              broken = true;
              continue;
            }
            setPathwayProgress(p => ({ ...p, [g.head]: { ...(p[g.head] || {}), [variant.label]: 'done' } }));
            priorCaps = accumulateExistingCaps(result.capacities);
          }
        } else {
          for (const variant of g.variants) {
            const concrete = buildConcrete(m, variant, techsForRun, tsForRun, null);
            runVariant(m, variant, concrete, batchId, engineLabel);
          }
        }
      }
    }
  };

  // ── Board context passed to card nodes ──────────────────────────────────────

  const boardCtx = useMemo(() => ({
    model, selectedNodeId, metaByNode, pathwayProgress, sporesEngineOk,
    onTogglePathway: togglePathway, onDeleteNode: deleteNode,
  }), [model, selectedNodeId, metaByNode, pathwayProgress, sporesEngineOk, togglePathway, deleteNode]);

  const engineLabel = ENGINE_LABELS[selectedEngine] || selectedEngine;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Top bar: model + engine + compare + status */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">Scenario Studio</h1>
          <p className="text-[11px] text-slate-400 leading-tight">Drag, wire &amp; run policy scenarios on a board</p>
        </div>
        <div className="h-8 w-px bg-slate-200 mx-1" />
        <div className="flex items-center gap-2 min-w-0">
          <FiZap size={14} className="text-electric-500 shrink-0" />
          <select value={selectedModel?.id || ''}
            onChange={e => {
              const m = models.find(m => m.id === e.target.value) || null;
              setSelectedModel(m);
              if (m) setSelectedEngine(engineKeyFromModel(m));
            }}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white max-w-[220px]">
            <option value="">— select a model —</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Engine</span>
          <select value={selectedEngine} onChange={e => setSelectedEngine(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
            {Object.entries(ENGINE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
          serviceStatus === true ? 'bg-green-50 border-green-200 text-green-700' :
          serviceStatus === false ? 'bg-red-50 border-red-200 text-red-600' :
          'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            serviceStatus === true ? 'bg-green-500' : serviceStatus === false ? 'bg-red-500' : 'bg-slate-400 animate-pulse'
          }`} />
          {serviceStatus === true ? 'ready' : serviceStatus === false ? 'offline' : 'checking…'}
        </div>
        <button
          onClick={() => setShowModelCompare(v => !v)}
          className={`ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            showModelCompare || extraModels.length > 0
              ? 'bg-electric-50 border-electric-300 text-electric-700'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
          title="Compare across multiple models">
          <FiLayers size={12} />
          Compare{extraModels.length > 0 ? ` (${extraModels.length + 1})` : ''}
        </button>
      </div>

      {/* Cross-model selector */}
      {showModelCompare && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
            <FiLayers size={12} className="text-electric-500" />
            Run the whole board against additional models
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 max-h-40 overflow-y-auto pr-1">
            {models.filter(m => m.id !== selectedModel?.id).map(m => {
              const checked = extraModels.some(e => e.id === m.id);
              return (
                <label key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                  checked ? 'bg-electric-50 border-electric-300 text-electric-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                  <input type="checkbox" checked={checked}
                    onChange={e => setExtraModels(prev => e.target.checked ? [...prev, m] : prev.filter(em => em.id !== m.id))}
                    className="accent-electric-600 shrink-0" />
                  <span className="truncate font-medium">{m.name}</span>
                </label>
              );
            })}
            {models.filter(m => m.id !== selectedModel?.id).length === 0 && (
              <p className="text-xs text-slate-400 col-span-full italic">No other models available.</p>
            )}
          </div>
        </div>
      )}

      {/* Canvas + side panel */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <ScenarioBoard
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNodeId(null)}
            onAddNode={addNode}
            ctxValue={boardCtx}
          />
        </div>
        <RecipeSidePanel
          node={selectedNode}
          model={model}
          meta={selectedNodeId ? metaByNode.get(selectedNodeId) : null}
          onSetParam={(k, v) => setNodeParams(selectedNodeId, k, v)}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>

      {/* Results sheet */}
      <ResultsSheet
        completedJobs={completedJobs}
        latestSporesJob={latestSporesJob}
        modelLocations={model?.locations || []}
      />

      {/* Dock */}
      <BoardDock
        totalRuns={totals.totalRuns}
        groupCount={totals.groupCount}
        warningCount={totals.warningCount}
        onRun={handleRun}
        runDisabled={!model || serviceStatus === false || totals.totalRuns === 0}
        runningJobsCount={runningJobs.length}
        onGoToRun={() => onNavigate?.('Run')}
        engineLabel={engineLabel}
      />
    </div>
  );
}
