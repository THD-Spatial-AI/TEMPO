import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import { FiZap, FiLayers, FiGrid, FiChevronDown } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel } from '../services/calliopeClient';
import { checkEngineRunService, runEngineModel } from '../services/engineClient';
import { applyOps } from '../services/scenarioStudio/transform.js';
import { buildCalliope06GroupConstraintsOverride, resolveTechGroup } from '../services/scenarioStudio/utils.js';
import { getCapabilityWarnings, engineKeyFromModel, ENGINE_LABELS, ENGINE_FRAMEWORK } from '../services/scenarioStudio/capabilities.js';
import { buildScenarioVariants, scenarioFromGraph, canConnect, defaultCardParams, previousYear, SCENARIO_TEMPLATES, YEAR_SIZE } from '../services/scenarioStudio/scenario.js';
import ScenarioBoard from './scenarioStudio/ScenarioBoard.jsx';
import RecipeSidePanel from './scenarioStudio/RecipeSidePanel.jsx';
import YearDetailPanel from './scenarioStudio/YearDetailPanel.jsx';
import BoardDock from './scenarioStudio/BoardDock.jsx';
import ResultsSheet from './scenarioStudio/ResultsSheet.jsx';

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
function loadBoard() {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return defaultBoard();
    const p = JSON.parse(raw);
    if (Array.isArray(p?.nodes) && p.nodes.some(n => n.type)) return { nodes: orderNodes(p.nodes), edges: Array.isArray(p.edges) ? p.edges : [] };
    return defaultBoard();
  } catch { return defaultBoard(); }
}
function saveBoard(nodes, edges) {
  try {
    const slimNodes = nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data, parentId: n.parentId, style: n.style }));
    const slimEdges = edges.map(e => ({ id: e.id, source: e.source, target: e.target }));
    localStorage.setItem(BOARD_KEY, JSON.stringify({ nodes: slimNodes, edges: slimEdges }));
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

  const initial = useMemo(() => loadBoard(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => { saveBoard(nodes, edges); }, [nodes, edges]);

  const runningJobsRef = useRef([]);
  useEffect(() => { runningJobsRef.current = runningJobs; }, [runningJobs]);
  const nodesRef = useRef(nodes); useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef(edges); useEffect(() => { edgesRef.current = edges; }, [edges]);
  const cancelFnsRef = useRef({});
  const completedIdsRef = useRef(new Set());

  useEffect(() => {
    const cur = getCurrentModel();
    if (cur) { setSelectedModel(cur); setSelectedEngine(engineKeyFromModel(cur)); }
  }, [getCurrentModel]);

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

  const reparentNode = useCallback((id, parentId, position) => {
    setNodes(nds => orderNodes(nds.map(n => n.id === id ? { ...n, parentId: parentId || undefined, position } : n)));
  }, [setNodes]);

  const onConnect = useCallback((conn) => {
    if (!canConnect(nodesRef.current, edgesRef.current, conn)) {
      showNotification('Wire a Year card into a config card (Year → config).', 'error');
      return;
    }
    setEdges(eds => addEdge(conn, eds));
  }, [setEdges, showNotification]);

  const deleteNode = useCallback((id) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNodeId(sid => (sid === id ? null : sid));
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

  const capabilityWarnings = useMemo(() => {
    if (!variants.length) return [];
    return getCapabilityWarnings(selectedEngine, variants.flatMap(v => v.ops));
  }, [variants, selectedEngine]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedCard = useMemo(() => (
    selectedNode?.type === 'config'
      ? { id: selectedNode.id, category: selectedNode.data.category, params: selectedNode.data.params }
      : null
  ), [selectedNode]);
  const selectedScopeLabel = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'config') return '';
    const parent = selectedNode.parentId ? nodes.find(n => n.id === selectedNode.parentId && n.type === 'year') : null;
    return parent ? `Year ${parent.data.year}` : 'All years';
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
          solver: 'highs', mode: 'plan', status: result?.success === false ? 'failed' : 'completed',
          completedAt: new Date().toISOString(), duration, objective: result?.objective || null,
          terminationCondition: result?.termination_condition || 'optimal',
          result: result || {}, logs: job.logs, batchId, variantLabel, modelLabel,
        });
        showNotification(
          result?.success === false ? `Run failed: ${result.error}` : `Completed: ${job.displayName} (${duration})`,
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
        showNotification(`Run failed: ${error}`, 'error');
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

  const handleRun = async () => {
    if (!model) { showNotification('Select a model first.', 'error'); return; }
    if (variants.length === 0) { showNotification('Add at least one Year card to the scenario.', 'error'); return; }

    const engineLabel = ENGINE_LABELS[selectedEngine] || selectedEngine;
    if (serviceStatus === false) { showNotification(`${engineLabel} service is offline. Start it from Settings.`, 'error'); return; }
    if (serviceStatus === null) {
      const up = (selectedEngine === 'calliope06' || selectedEngine === 'calliope07')
        ? await checkCalliopeService(selectedEngine === 'calliope07' ? '0.7' : undefined)
        : await checkEngineRunService(selectedEngine);
      setServiceStatus(up);
      if (!up) { showNotification(`Cannot reach ${engineLabel} service.`, 'error'); return; }
    }

    const batchId = `batch_${Date.now()}`;
    const modelsToRun = extraModels.length > 0 ? [model, ...extraModels] : [model];

    showNotification(
      modelsToRun.length > 1
        ? `Starting ${totalRuns} runs (${modelsToRun.length} models × ${variants.length} year${variants.length > 1 ? 's' : ''}) on ${engineLabel}…`
        : `Starting ${variants.length} year run${variants.length > 1 ? 's' : ''} on ${engineLabel}…`,
      'info'
    );
    onNavigate?.('Run');

    for (const m of modelsToRun) {
      const isCurrentModel = m.id === getCurrentModel()?.id;
      const techsForRun = isCurrentModel && technologies?.length ? technologies : (m.technologies || technologies || []);
      const tsForRun = (timeSeries || []).filter(ts => ts.modelId === m.id);

      for (const variant of variants) {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const displayName = `${m.name} — ${variant.label}`;
        const concreteModel = buildConcrete(m, variant, techsForRun, tsForRun);

        addRunningJob({
          id: jobId, displayName, startTime: new Date().toISOString(), engine: selectedEngine,
          source: 'scenario_studio',
          logs: [`[TEMPO] Scenario Studio — ${displayName} [${engineLabel}]`],
        });

        try {
          const opts = {
            modelData: concreteModel,
            onLog: line => appendRunningJobLog(jobId, line),
            onStats: () => {},
            onDone: result => _handleDone(jobId, batchId, variant.label, m.name, result),
            onError: error => _handleError(jobId, batchId, variant.label, m.name, error),
          };
          const runPromise = (selectedEngine === 'calliope06' || selectedEngine === 'calliope07')
            ? runCalliopeModel(opts)
            : runEngineModel(selectedEngine, opts);
          const { cancel } = await runPromise;
          cancelFnsRef.current[jobId] = cancel;
        } catch (err) {
          removeRunningJob(jobId);
          showNotification(`Failed to start "${displayName}": ${err.message}`, 'error');
        }
      }
    }
  };

  const engineLabel = ENGINE_LABELS[selectedEngine] || selectedEngine;

  const boardCtx = useMemo(() => ({
    selectedNodeId, onDeleteNode: deleteNode, onDuplicateNode: duplicateNode, onSetYear: setYear,
    onResizeYear: resizeYear, onDeleteEdge: deleteEdge,
  }), [selectedNodeId, deleteNode, duplicateNode, setYear, resizeYear, deleteEdge]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Top bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">Scenario Studio</h1>
          <p className="text-[11px] text-slate-400 leading-tight">Build one scenario — add Year cards and wire configs into them</p>
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
        <div className="relative ml-auto">
          <button onClick={() => setShowTemplates(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-white border-slate-200 text-slate-600 hover:border-slate-300 transition-colors"
            title="Start from a scenario template">
            <FiGrid size={12} /> Templates <FiChevronDown size={11} className={showTemplates ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {showTemplates && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setShowTemplates(false)} />
              <div className="absolute right-0 mt-1 z-[91] w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Start from a template (replaces the board)
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {SCENARIO_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors">
                      <div className="text-xs font-semibold text-slate-800">{t.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <button onClick={() => setShowModelCompare(v => !v)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            showModelCompare || extraModels.length > 0
              ? 'bg-electric-50 border-electric-300 text-electric-700'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`} title="Compare across multiple models">
          <FiLayers size={12} /> Compare{extraModels.length > 0 ? ` (${extraModels.length + 1})` : ''}
        </button>
      </div>

      {showModelCompare && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
            <FiLayers size={12} className="text-electric-500" /> Run this scenario against additional models
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
        onRun={handleRun}
        runDisabled={!model || serviceStatus === false || totalRuns === 0}
        runningJobsCount={runningJobs.length}
        onGoToRun={() => onNavigate?.('Run')}
        engineLabel={engineLabel}
      />
    </div>
  );
}
