/**
 * Scenario Studio — free React Flow canvas (single scenario).
 *
 * Play with cards: pan/zoom/drag, a dotted grid, a minimap. Two node types —
 * Year cards and config cards. Drop a config card INTO a Year card (or use the
 * Year's "+") to scope it to that year; a config left on the canvas applies to
 * ALL years. Link Year → Year (right handle → next Year's left handle) to mark a
 * consecutive timeline. Add cards via the "+" button or right-click.
 */

import React, { useState, useCallback, useRef, useContext } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  BackgroundVariant, MarkerType, useReactFlow, BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FiPlus, FiCalendar } from '../ui/icons';
import YearNode from './YearNode.jsx';
import ScenarioCardNode from './ScenarioCardNode.jsx';
import { BoardCtx } from './boardContext.js';
import CategoryTile from './categoryIcon.jsx';
import { CARD_CATEGORIES, CATEGORY_BY_ID } from '../../services/scenarioStudio/scenario.js';

const nodeTypes = { year: YearNode, config: ScenarioCardNode };

// Edge with a ✕ delete button at its midpoint.
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }) {
  const ctx = useContext(BoardCtx) || {};
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
          onClick={(e) => { e.stopPropagation(); ctx.onDeleteEdge?.(id); }}
          className="nodrag nopan grid h-5 w-5 place-items-center rounded-full border border-black/15 bg-white text-[11px] leading-none text-slate-400  transition-colors hover:border-red-300 hover:text-red-600"
          title="Remove connection"
        >×</button>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

const defaultEdgeOptions = {
  type: 'deletable',
  animated: true,
  style: { stroke: '#475569', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#475569', width: 16, height: 16 },
};

function MenuItem({ c, onPick }) {
  return (
    <button onClick={() => onPick(c.id)}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100">
      <CategoryTile meta={c} size="sm" />
      <span className="truncate text-xs font-medium text-slate-700">{c.label}</span>
    </button>
  );
}

function AddMenu({ onPickYear, onPickConfig, onClose, style }) {
  const yearCats = CARD_CATEGORIES.filter(c => c.lanes.includes('year'));
  const globalCats = CARD_CATEGORIES.filter(c => !c.lanes.includes('year'));
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div style={style} className="absolute z-[91] w-64 overflow-hidden rounded-xl border border-black/15 bg-white p-1 shadow-xl">
        <div className="max-h-80 overflow-y-auto">
          <button onClick={onPickYear}
            className="mb-1 flex w-full items-center gap-2.5 rounded-lg bg-slate-50 px-2 py-2 text-left transition-colors hover:bg-slate-100">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black text-white"><FiCalendar size={12} /></span>
            <span>
              <span className="block text-xs font-semibold text-slate-900">Year</span>
              <span className="block text-[10px] text-slate-500">A snapshot year that holds cards</span>
            </span>
          </button>
          <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Config cards</p>
          {yearCats.map(c => <MenuItem key={c.id} c={c} onPick={onPickConfig} />)}
          {globalCats.length > 0 && (
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Whole scenario</p>
          )}
          {globalCats.map(c => <MenuItem key={c.id} c={c} onPick={onPickConfig} />)}
        </div>
      </div>
    </>
  );
}

function Flow({
  nodes, edges, onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onPaneClick, onAddYear, onAddConfig, onReparent, ctxValue,
}) {
  const { screenToFlowPosition, getIntersectingNodes, getInternalNode } = useReactFlow();
  const wrapRef = useRef(null);
  const [menu, setMenu] = useState(null); // { style, flowPos }

  const openMenuAt = useCallback((clientX, clientY) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    setMenu({
      style: { left: rect ? clientX - rect.left : clientX, top: rect ? clientY - rect.top : clientY },
      flowPos: screenToFlowPosition({ x: clientX, y: clientY }),
    });
  }, [screenToFlowPosition]);

  const handlePaneContextMenu = useCallback((e) => { e.preventDefault(); openMenuAt(e.clientX, e.clientY); }, [openMenuAt]);

  // On drop, nest a config into a Year it overlaps (or un-nest if dropped outside).
  const handleNodeDragStop = useCallback((_e, node) => {
    if (node.type !== 'config') return;
    // Global-only cards (sensitivity cases, SPORES) apply to the whole scenario — never nest.
    const yearAllowed = CATEGORY_BY_ID[node.data?.category]?.lanes?.includes('year') ?? true;
    const overYear = yearAllowed ? (getIntersectingNodes(node).filter(n => n.type === 'year')[0] || null) : null;
    const curParent = node.parentId || null;
    const newParent = overYear ? overYear.id : null;
    if (newParent === curParent) return;
    const childAbs = getInternalNode(node.id)?.internals?.positionAbsolute || node.position;
    if (newParent) {
      const pAbs = getInternalNode(newParent)?.internals?.positionAbsolute || overYear.position;
      onReparent(node.id, newParent, { x: childAbs.x - pAbs.x, y: childAbs.y - pAbs.y });
    } else {
      onReparent(node.id, null, { ...childAbs });
    }
  }, [getIntersectingNodes, getInternalNode, onReparent]);

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      <BoardCtx.Provider value={ctxValue}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={(e) => { setMenu(null); onPaneClick?.(e); }}
          onPaneContextMenu={handlePaneContextMenu}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
          proOptions={{ hideAttribution: true }}
          className="bg-slate-50"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
          <Controls
            showInteractive={false}
            className="!overflow-hidden !rounded-xl !border !border-black/15 !shadow-lg [&>button]:!h-8 [&>button]:!w-8 [&>button]:!border-black/10"
          />
          <MiniMap pannable zoomable
            className="!overflow-hidden !rounded-xl !border !border-black/15 !shadow-lg"
            nodeColor={(n) => (n.type === 'year' ? '#cbd5e1' : '#475569')}
            nodeBorderRadius={6}
            maskColor="rgba(241,245,249,0.75)" />
          <Panel position="top-left">
            <div className="flex items-center gap-2">
              <button onClick={(e) => openMenuAt(e.clientX, e.clientY)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-[13px] font-semibold text-white shadow-lg shadow-slate-900/20 transition-colors hover:bg-black/80">
                <FiPlus size={15} /> Add card
              </button>
              <span className="hidden rounded-lg border border-black/15 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-500  backdrop-blur md:inline">
                Cards inside a year apply to that year · cards on the canvas apply to all years · right-click to add
              </span>
            </div>
          </Panel>
        </ReactFlow>
      </BoardCtx.Provider>
      {menu && (
        <AddMenu
          style={{ position: 'absolute', ...menu.style }}
          onPickYear={() => { onAddYear(menu.flowPos); setMenu(null); }}
          onPickConfig={(cat) => { onAddConfig(cat, menu.flowPos); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

export default function ScenarioBoard(props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
