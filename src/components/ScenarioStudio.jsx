import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import { FiZap, FiLayers, FiGrid, FiChevronDown } from './ui/icons';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel } from '../services/calliopeClient';
import { checkEngineRunService, runEngineModel } from '../services/engineClient';
import { runMemeModel, getMemeServerConfig } from '../services/memeClient';
import { engineSupportedByMeme } from '../services/memeFormat';
import { applyOps } from '../services/scenarioStudio/transform.js';
import { buildCalliope06GroupConstraintsOverride, resolveTechGroup } from '../services/scenarioStudio/utils.js';
import { getCapabilityWarnings, engineKeyFromModel, ENGINE_LABELS, ENGINE_FRAMEWORK } from '../services/scenarioStudio/capabilities.js';
import { buildScenarioVariants, scenarioFromGraph, canConnect, defaultCardParams, previousYear, SCENARIO_TEMPLATES, YEAR_SIZE } from '../services/scenarioStudio/scenario.js';
import ScenarioBoard from './scenarioStudio/ScenarioBoard.jsx';
import RecipeSidePanel from './scenarioStudio/RecipeSidePanel.jsx';
import YearDetailPanel from './scenarioStudio/YearDetailPanel.jsx';
import BoardDock from './scenarioStudio/BoardDock.jsx';
import ResultsSheet from './scenarioStudio/ResultsSheet.jsx';
import Select from './ui/Select';
import { tr } from '../i18n';

// ─── Board persistence (localStorage) ────────────────────────────────────────

const BOARD_KEY = 'scenarioBoard';
const genId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function defaultBoard() {
  return {
    nodes: [
      { id: 'year_2025', type: 'year', position: { x: 80, y: 60 },  style: { ...YEAR_SIZE }, data: { year: 2025 } },
      { id: 'year_2030', type: 'year', position: { x: 80, y: 260 }, style: { ...YEAR_SIZE }, data: { year: 2030 } },
    ],
    edges: [],
  };
}
// Each model gets its own board; a legacy single board migrates to the first model opened.
const keyFor = (modelId) => (modelId ? `${BOARD_KEY}:${modelId}` : BOARD_KEY);

function readBoardKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Array.isArray(p?.nodes)) return null;
    const validTypes = new Set(['year', 'config']);
    const nodes = orderNodes(p.nodes.filter(n => validTypes.has(n.type)));
    if (!nodes.some(n => n.type === 'year')) return null;
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = Array.isArray(p.edges) ? p.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)) : [];
    return { nodes, edges };
  } catch { return null; }
}

function loadBoard(modelId) {
  if (modelId) {
    const own = readBoardKey(keyFor(modelId));
    if (own) return own;
    const legacy = readBoardKey(BOARD_KEY); // migrate a pre-existing single board once
    if (legacy) { try { localStorage.removeItem(BOARD_KEY); } catch { /* ignore */ } return legacy; }
    return defaultBoard();
  }
  return readBoardKey(BOARD_KEY) || defaultBoard();
}

function saveBoard(modelId, nodes, edges) {
  try {
    const slimNodes = nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data, parentId: n.parentId, style: n.style }));
    const slimEdges = edges.map(e => ({ id: e.id, source: e.source, target: e.target }));
    localStorage.setItem(keyFor(modelId), JSON.stringify({ nodes: slimNodes, edges: slimEdges }));
  } catch { /* quota */ }
}

// React Flow requires a parent node to appear before its children. Year
// containers are the only parents, so keeping years first guarantees that.
function orderNodes(nds) {
  return [...nds.filter(n => n.type === 'year'), ...nds.filter(n => n.type !== 'year')];
}

// Derived (not persisted): grow each Year container to fit its nested cards.
const CARD_W = 208, CARD_H = 60, PAD = 16;
function withYearSizes(nds) {
  const kids = new Map();
  nds.forEach(n => {
    if (n.type === 'config' && n.parentId) {
      if (!kids.has(n.parentId)) kids.set(n.parentId, []);
      kids.get(n.parentId).push(n);
    }
  });
  return nds.map(n => {
    if (n.type !== 'year') return n;
    const children = kids.get(n.id) || [];
    // Content floor: big enough to fit every nested card.
    let maxR = YEAR_SIZE.width - PAD, maxB = YEAR_SIZE.height - PAD;
    children.forEach(c => {
      maxR = Math.max(maxR, (c.position?.x || 0) + CARD_W);
      maxB = Math.max(maxB, (c.position?.y || 0) + CARD_H);
    });
    const fitW = maxR + PAD, fitH = maxB + PAD;
    // Manual resize is honored as a floor too; final = max(content, manual).
    const manual = n.data.manualSize;
    const width = Math.max(fitW, manual?.width || 0);
    const height = Math.max(fitH, manual?.height || 0);
    return {
      ...n,
      style: { width, height },
      data: { ...n.data, _hasChildren: children.length > 0, _minW: fitW, _minH: fitH },
    };
  });
}

// A group/emissions actuator that resolves to zero techs in the current model.
function actuatorNoMatch(model, data) {
  if (!model) return false;
  const p = data?.params || {};
  if (data.category === 'emissions') return resolveTechGroup(model, p.group || 'emitting').length === 0;
  if (data.category === 'renewables') return resolveTechGroup(model, p.group || 'renewable').length === 0;
  if ((data.category === 'tech' || data.category === 'location') && p.target === 'group') {
    return resolveTechGroup(model, p.group).length === 0;
  }
  return false;
}

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

  const initial = useMemo(() => defaultBoard(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [runSequential, setRunSequential] = useState(false);
  // Where runs execute: this machine, or the configured MEME server.
  const [computeTarget, setComputeTarget] = useState('local');
  const [remoteServer] = useState(() => getMemeServerConfig());
  const remoteAvailable = !!remoteServer?.url && engineSupportedByMeme(selectedEngine);
  const computeRemote = computeTarget === 'remote' && remoteAvailable;

  // Per-model board: each model persists its own board under its own key.
  const boardModelIdRef = useRef(null);
  const loadBoardForModel = useCallback((mid) => {
    if (!mid || boardModelIdRef.current === mid) return;
    boardModelIdRef.current = mid;
    const b = loadBoard(mid);
    setNodes(b.nodes);
    setEdges(b.edges);
    setSelectedNodeId(null);
  }, [setNodes, setEdges]);

  useEffect(() => {
    const mid = boardModelIdRef.current;
    if (mid) saveBoard(mid, nodes, edges);
  }, [nodes, edges]);

  const runningJobsRef = useRef([]);
  useEffect(() => { runningJobsRef.current = runningJobs; }, [runningJobs]);
  const nodesRef = useRef(nodes); useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef(edges); useEffect(() => { edgesRef.current = edges; }, [edges]);
  const cancelFnsRef = useRef({});
  const completedIdsRef = useRef(new Set());

  useEffect(() => {
    const cur = getCurrentModel();
    if (cur) { setSelectedModel(cur); setSelectedEngine(engineKeyFromModel(cur)); loadBoardForModel(cur.id); }
  }, [getCurrentModel, loadBoardForModel]);

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

  // ── Board editing ───────────────────────────────────────────────────────────

  const addYear = useCallback((position) => {
    const years = nodesRef.current.filter(n => n.type === 'year').map(n => n.data.year);
    const year = (years.length ? Math.max(...years) : 2020) + 5;
    const id = genId('year');
    setNodes(nds => orderNodes([...nds, { id, type: 'year', position: position || { x: 120, y: 120 }, style: { ...YEAR_SIZE }, data: { year } }]));
    setSelectedNodeId(id);
  }, [setNodes]);

  const addConfig = useCallback((category, position) => {
    const id = genId('cfg');
    setNodes(nds => orderNodes([...nds, { id, type: 'config', position: position || { x: 360, y: 120 }, data: { category, params: defaultCardParams(category) } }]));
    setSelectedNodeId(id);
  }, [setNodes]);

  const addConfigToYear = useCallback((yearId, category) => {
    const id = genId('cfg');
    setNodes(nds => {
      const siblings = nds.filter(n => n.parentId === yearId).length;
      const node = { id, type: 'config', parentId: yearId, position: { x: 20, y: 56 + siblings * 10 }, data: { category, params: defaultCardParams(category) } };
      return orderNodes([...nds, node]);
    });
    setSelectedNodeId(id);
  }, [setNodes]);

  const reparentNode = useCallback((id, parentId, position) => {
    setNodes(nds => orderNodes(nds.map(n => n.id === id ? { ...n, parentId: parentId || undefined, position } : n)));
  }, [setNodes]);

  const onConnect = useCallback((conn) => {
    if (!canConnect(nodesRef.current, edgesRef.current, conn)) {
      showNotification(tr("Wire a Year card into a config card (Year → config)."), 'error');
      return;
    }
    setEdges(eds => addEdge(conn, eds));
  }, [setEdges, showNotification]);

  const deleteNode = useCallback((id) => {
    const node = nodesRef.current.find(n => n.id === id);
    const childIds = node?.type === 'year'
      ? new Set(nodesRef.current.filter(n => n.parentId === id).map(n => n.id))
      : new Set();
    const removedIds = new Set([id, ...childIds]);
    setNodes(nds => nds.filter(n => !removedIds.has(n.id)));
    setEdges(eds => eds.filter(e => !removedIds.has(e.source) && !removedIds.has(e.target)));
    setSelectedNodeId(sid => (removedIds.has(sid) ? null : sid));
  }, [setNodes, setEdges]);

  const duplicateNode = useCallback((id) => {
    const src = nodesRef.current.find(n => n.id === id);
    if (!src) return;
    const newId = genId(src.type === 'year' ? 'year' : 'cfg');
    const clone = {
      id: newId, type: src.type,
      position: { x: (src.position?.x || 0) + 40, y: (src.position?.y || 0) + 40 },
      data: JSON.parse(JSON.stringify(src.data || {})),
      ...(src.parentId ? { parentId: src.parentId } : {}), // config keeps its year; year has none
      ...(src.style ? { style: { ...src.style } } : {}),
    };
    setNodes(nds => orderNodes([...nds, clone])); // edges are NOT copied
    setSelectedNodeId(newId);
  }, [setNodes]);

  const deleteEdge = useCallback((id) => {
    setEdges(eds => eds.filter(e => e.id !== id));
  }, [setEdges]);

  const setYear = useCallback((id, year) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, year } } : n));
  }, [setNodes]);

  const resizeYear = useCallback((id, size) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, manualSize: size } } : n));
  }, [setNodes]);

  const setConfigParam = useCallback((id, key, value) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, params: { ...(n.data.params || {}), [key]: value } } } : n));
  }, [setNodes]);

  const applyTemplate = useCallback((tpl) => {
    const built = tpl.build();
    setNodes(built.nodes);
    setEdges(built.edges);
    setSelectedNodeId(null);
    setShowTemplates(false);
  }, [setNodes, setEdges]);

  const onNodeClick = useCallback((_e, node) => setSelectedNodeId(node.id), []);

  // ── Derive scenario + variants ──────────────────────────────────────────────

  // Year containers auto-grow to fit nested cards (derived, not persisted).
  const displayNodes = useMemo(() => withYearSizes(nodes).map(n => {
    if (n.type !== 'config') return n;
    return actuatorNoMatch(model, n.data) ? { ...n, data: { ...n.data, _noMatch: true } } : n;
  }), [nodes, model]);
  const noMatchCount = useMemo(
    () => displayNodes.filter(n => n.type === 'config' && n.data._noMatch).length,
    [displayNodes]
  );
  const scenario = useMemo(() => scenarioFromGraph(nodes), [nodes]);
  const { variants, warnings } = useMemo(() => buildScenarioVariants(model, scenario), [model, scenario]);

  const hasSpores = useMemo(() => variants.some(v => v.sporesPlan), [variants]);
  // SPORES: locally on Calliope 0.6.8, remotely (MEME) on Calliope 0.7.
  const sporesBlocked = hasSpores && !(selectedEngine === 'calliope06' || (selectedEngine === 'calliope07' && computeRemote));
  const capabilityWarnings = useMemo(() => {
    if (!variants.length) return [];
    const w = getCapabilityWarnings(selectedEngine, variants.flatMap(v => v.ops));
    return sporesBlocked ? [...w, tr("SPORES runs need Calliope 0.6.8 locally, or Calliope 0.7 on MEME.")] : w;
  }, [variants, selectedEngine, sporesBlocked]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedCard = useMemo(() => (
    selectedNode?.type === 'config'
      ? { id: selectedNode.id, category: selectedNode.data.category, params: selectedNode.data.params }
      : null
  ), [selectedNode]);
  const selectedScopeLabel = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'config') return '';
    const parent = selectedNode.parentId ? nodes.find(n => n.id === selectedNode.parentId && n.type === 'year') : null;
    return parent ? tr("Year {0}", { 0: parent.data.year }) : tr("All years");
  }, [selectedNode, nodes]);

  const yearPanel = useMemo(() => {
    if (selectedNode?.type !== 'year') return null;
    const year = selectedNode.data.year;
    const variant = variants.find(v => v.year === year) || { year, ops: [] };
    const py = previousYear(nodes, edges, year);
    const prevVariant = py != null ? variants.find(v => v.year === py) : null;
    return { year, prevYear: py, variant, prevVariant };
  }, [selectedNode, variants, nodes, edges]);

  const modelsCount = 1 + extraModels.length;
  const totalRuns = variants.length * modelsCount;

  // ── Job completion ──────────────────────────────────────────────────────────

  const _handleDone = (jobId, batchId, variantLabel, modelLabel, result) => {
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
          solver: 'highs', mode: result?.spores_data ? 'spores' : 'plan', status: result?.success === false ? 'failed' : 'completed',
          completedAt: new Date().toISOString(), duration, objective: result?.objective || null,
          terminationCondition: result?.termination_condition || 'optimal',
          result: result || {}, logs: job.logs, batchId, variantLabel, modelLabel,
        });
        showNotification(
          result?.success === false ? tr("Run failed: {0}", { 0: result.error }) : tr("Completed: {0} ({1})", { 0: job.displayName, 1: duration }),
          result?.success === false ? 'error' : 'success'
        );
      }, 0);
    }
    delete cancelFnsRef.current[jobId];
  };

  const _handleError = (jobId, batchId, variantLabel, modelLabel, error) => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    const job = runningJobsRef.current.find(j => j.id === jobId);
    removeRunningJob(jobId);
    if (job) {
      setTimeout(() => {
        addCompletedJob({
          id: jobId, modelName: job.displayName, framework: ENGINE_FRAMEWORK[job.engine] || 'calliope',
          solver: 'highs', mode: 'plan', status: 'failed', completedAt: new Date().toISOString(),
          duration: 'N/A', objective: null, terminationCondition: 'error',
          result: { success: false, error }, logs: [...job.logs, `[ERROR] ${error}`],
          batchId, variantLabel, modelLabel,
        });
        showNotification(tr("Run failed: {0}", { 0: error }), 'error');
      }, 0);
    }
    delete cancelFnsRef.current[jobId];
  };

  // ── Dispatch ────────────────────────────────────────────────────────────────

  const buildConcrete = (m, variant, techsForRun, tsForRun) => {
    const baseModelData = {
      ...m, solver: 'highs', modelConfig: m.modelConfig || {},
      technologies: techsForRun, timeSeries: tsForRun,
    };
    const concreteModel = applyOps(baseModelData, variant.ops);
    // SPORES card: per-slack plan + run settings (solver, feasibility) for this run.
    if (variant.sporesPlan || variant.modelConfig) {
      concreteModel.modelConfig = {
        ...(concreteModel.modelConfig || {}), ...(variant.modelConfig || {}),
        ...(variant.sporesPlan ? { sporesPlan: variant.sporesPlan } : {}),
      };
    }
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

  // Dispatch one year-variant; resolves when the job settles (used to serialize
  // sequential runs). In parallel mode callers simply don't await it.
  const runOneVariant = (m, variant, techsForRun, tsForRun, batchId, engineLabel) => new Promise((resolve) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const displayName = `${m.name} — ${variant.label}`;
    const concreteModel = buildConcrete(m, variant, techsForRun, tsForRun);
    addRunningJob({
      id: jobId, displayName, startTime: new Date().toISOString(), engine: selectedEngine,
      source: 'scenario_studio', logs: [`[TEMPO] Scenario Studio — ${displayName} [${engineLabel}]`],
    });
    const opts = {
      modelData: concreteModel,
      onLog: line => appendRunningJobLog(jobId, line),
      onStats: () => {},
      onDone: result => { _handleDone(jobId, batchId, variant.label, m.name, result); resolve(result || {}); },
      onError: error => { _handleError(jobId, batchId, variant.label, m.name, error); resolve({ success: false, error }); },
    };
    const start = computeRemote
      ? runMemeModel(selectedEngine, { ...opts, server: remoteServer, mode: concreteModel.modelConfig?.mode, solver: 'highs' })
      : (selectedEngine === 'calliope06' || selectedEngine === 'calliope07')
        ? runCalliopeModel(opts) : runEngineModel(selectedEngine, opts);
    start.then(({ cancel }) => { cancelFnsRef.current[jobId] = cancel; })
      .catch(err => { removeRunningJob(jobId); showNotification(tr("Failed to start \"{0}\": {1}", { 0: displayName, 1: err.message }), 'error'); resolve({ success: false, error: err.message }); });
  });

  const handleRun = async () => {
    if (!model) { showNotification(tr("Select a model first."), 'error'); return; }
    if (variants.length === 0) { showNotification(tr("Add at least one Year card to the scenario."), 'error'); return; }

    const engineLabel = (ENGINE_LABELS[selectedEngine] || selectedEngine) + (computeRemote ? ' (MEME)' : '');
    if (!computeRemote && serviceStatus === false) { showNotification(tr("{0} service is offline. Start it from Settings.", { 0: engineLabel }), 'error'); return; }
    if (!computeRemote && serviceStatus === null) {
      const up = (selectedEngine === 'calliope06' || selectedEngine === 'calliope07')
        ? await checkCalliopeService(selectedEngine === 'calliope07' ? '0.7' : undefined)
        : await checkEngineRunService(selectedEngine);
      setServiceStatus(up);
      if (!up) { showNotification(tr("Cannot reach {0} service.", { 0: engineLabel }), 'error'); return; }
    }

    const batchId = `batch_${Date.now()}`;
    const modelsToRun = extraModels.length > 0 ? [model, ...extraModels] : [model];

    showNotification(
      tr("Starting {0} run{1}{2} on {3}{4}…", { 0: totalRuns, 1: totalRuns > 1 ? 's' : '', 2: modelsToRun.length > 1 ? tr(" ({0} models × {1} years)", { 0: modelsToRun.length, 1: variants.length }) : '', 3: engineLabel, 4: runSequential ? tr(" — sequential") : '' }),
      'info'
    );
    onNavigate?.('Run');

    for (const m of modelsToRun) {
      const isCurrentModel = m.id === getCurrentModel()?.id;
      const techsForRun = isCurrentModel && technologies?.length ? technologies : (m.technologies || technologies || []);
      const tsForRun = (timeSeries || []).filter(ts => ts.modelId === m.id);

      if (runSequential) {
        // Years run one at a time, in ascending order (awaits each to settle).
        for (const variant of variants) {
          await runOneVariant(m, variant, techsForRun, tsForRun, batchId, engineLabel);
        }
      } else {
        // Parallel: fire all years at once (do not await completion).
        for (const variant of variants) {
          runOneVariant(m, variant, techsForRun, tsForRun, batchId, engineLabel);
        }
      }
    }
  };

  const engineLabel = ENGINE_LABELS[selectedEngine] || selectedEngine;

  const boardCtx = useMemo(() => ({
    selectedNodeId, onDeleteNode: deleteNode, onDuplicateNode: duplicateNode, onSetYear: setYear,
    onResizeYear: resizeYear, onDeleteEdge: deleteEdge, onAddConfigToYear: addConfigToYear,
  }), [selectedNodeId, deleteNode, duplicateNode, setYear, resizeYear, deleteEdge, addConfigToYear]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-black/15 bg-white px-5 py-3">
        <div className="mr-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{tr("Scenario Studio")}</h1>
          <p className="text-[11px] text-slate-500">{tr("Add years, drop config cards into them (or keep them global), then run")}</p>
        </div>
        <div className="w-56">
          <Select
            value={selectedModel?.id || ''}
            onChange={id => {
              const m = models.find(m => m.id === id) || null;
              setSelectedModel(m);
              if (m) { setSelectedEngine(engineKeyFromModel(m)); loadBoardForModel(m.id); }
            }}
            placeholder={tr("Select a model")}
            options={models.map(m => ({
              value: m.id,
              label: m.name,
              description: tr("{0} locations · {1} links", { 0: m.locations?.length || 0, 1: m.links?.length || 0 }),
            }))}
          />
        </div>
        <div className="w-44">
          <Select
            value={selectedEngine}
            onChange={setSelectedEngine}
            options={Object.entries(ENGINE_LABELS).map(([k, label]) => ({ value: k, label }))}
          />
        </div>
        {remoteAvailable && (
          <div className="inline-flex gap-1 rounded-lg bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50"
            title={tr("Remote runs go to MEME at {0}", { 0: remoteServer.url })}>
            {[['local', tr("Local")], ['remote', 'MEME']].map(([id, label]) => (
              <button key={id} onClick={() => setComputeTarget(id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  computeTarget === id ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                }`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ${
          serviceStatus === true ? 'bg-emerald-50 text-emerald-700' :
          serviceStatus === false ? 'bg-red-50 text-red-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            serviceStatus === true ? 'bg-emerald-500' : serviceStatus === false ? 'bg-red-500' : 'animate-pulse bg-slate-400'
          }`} />
          {serviceStatus === true ? tr("Engine ready") : serviceStatus === false ? tr("Engine offline") : tr("Checking…")}
        </span>
        <div className="relative ml-auto">
          <button onClick={() => setShowTemplates(v => !v)}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium  transition-colors ${
              showTemplates ? 'border-black/15 bg-slate-50 text-slate-900' : 'border-black/15 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title={tr("Start from a scenario template")}>
            <FiGrid size={14} /> {tr("Templates")} <FiChevronDown size={13} className={`transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </button>
          {showTemplates && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setShowTemplates(false)} />
              <div className="absolute right-0 z-[91] mt-1.5 w-80 overflow-hidden rounded-xl border border-black/15 bg-white p-1 shadow-xl">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {tr("Start from a template · replaces the board")}
                </p>
                <div className="max-h-80 overflow-y-auto">
                  {SCENARIO_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100">
                      <div className="text-[13px] font-semibold text-slate-900">{t.label}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button onClick={() => setShowModelCompare(v => !v)}
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium  transition-colors ${
            showModelCompare || extraModels.length > 0
              ? 'border-slate-900 bg-black text-white'
              : 'border-black/15 bg-white text-slate-700 hover:bg-slate-50'
          }`} title={tr("Compare across multiple models")}>
          <FiLayers size={14} /> {tr("Compare")}{extraModels.length > 0 ? ` (${extraModels.length + 1})` : ''}
        </button>
      </div>

      {showModelCompare && (
        <div className="shrink-0 border-b border-black/15 bg-white px-4 py-3">
          <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
            <FiLayers size={12} className="text-slate-500" /> {tr("Run this scenario against additional models")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 max-h-40 overflow-y-auto pr-1">
            {models.filter(m => m.id !== selectedModel?.id).map(m => {
              const checked = extraModels.some(e => e.id === m.id);
              return (
                <label key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                  checked ? 'bg-black border-slate-900 text-white' : 'bg-white border-black/15 text-slate-700 hover:border-black/15'
                }`}>
                  <input type="checkbox" checked={checked}
                    onChange={e => setExtraModels(prev => e.target.checked ? [...prev, m] : prev.filter(em => em.id !== m.id))}
                    className="accent-electric-600 shrink-0" />
                  <span className="truncate font-medium">{m.name}</span>
                </label>
              );
            })}
            {models.filter(m => m.id !== selectedModel?.id).length === 0 && (
              <p className="text-xs text-slate-400 col-span-full italic">{tr("No other models available.")}</p>
            )}
          </div>
        </div>
      )}

      {/* Canvas + side panel */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <ScenarioBoard
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedNodeId(null)}
            onAddYear={addYear}
            onAddConfig={addConfig}
            onReparent={reparentNode}
            ctxValue={boardCtx}
          />
        </div>
        {yearPanel ? (
          <YearDetailPanel
            year={yearPanel.year}
            prevYear={yearPanel.prevYear}
            variant={yearPanel.variant}
            prevVariant={yearPanel.prevVariant}
            model={model}
            timeSeries={timeSeries}
            onClose={() => setSelectedNodeId(null)}
            onDelete={() => deleteNode(selectedNodeId)}
          />
        ) : (
          <RecipeSidePanel
            card={selectedCard}
            scopeLabel={selectedScopeLabel}
            model={model}
            timeSeries={timeSeries}
            variants={variants}
            warnings={warnings}
            capabilityWarnings={capabilityWarnings}
            onSetParam={(k, v) => setConfigParam(selectedNodeId, k, v)}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      <ResultsSheet completedJobs={completedJobs} />

      <BoardDock
        totalRuns={totalRuns}
        warningCount={warnings.length + capabilityWarnings.length}
        noMatchCount={noMatchCount}
        sequential={runSequential}
        onToggleSequential={() => setRunSequential(v => !v)}
        onRun={handleRun}
        runDisabled={!model || (!computeRemote && serviceStatus === false) || totalRuns === 0 || sporesBlocked}
        runningJobsCount={runningJobs.length}
        onGoToRun={() => onNavigate?.('Run')}
        engineLabel={engineLabel}
      />
    </div>
  );
}
