/**
 * Scenario Studio — free React Flow canvas (single scenario).
 *
 * Play with cards: pan/zoom/drag, a dotted grid, a minimap. Two node types —
 * Year cards and config cards. Wire a Year → a config (Year source handle →
 * config target handle) to make that config apply to that year; unwired configs
 * apply to all years. Add cards via the "+" button or right-click.
 */

import React, { useState, useCallback, useRef, useContext } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  BackgroundVariant, MarkerType, useReactFlow, BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FiPlus, FiCalendar } from 'react-icons/fi';
import YearNode from './YearNode.jsx';
import ScenarioCardNode from './ScenarioCardNode.jsx';
import { BoardCtx } from './boardContext.js';
import { CARD_CATEGORIES } from '../../services/scenarioStudio/scenario.js';

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
          className="nodrag nopan w-4 h-4 flex items-center justify-center rounded-full bg-white border border-slate-300 text-slate-400 hover:text-red-500 hover:border-red-300 text-[10px] leading-none shadow-sm"
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
  style: { stroke: '#3b82f6', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6', width: 16, height: 16 },
};

function AddMenu({ onPickYear, onPickConfig, onClose, style }) {
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div style={style}
        className="absolute z-[91] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden w-56">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Add a card
        </div>
        <div className="max-h-72 overflow-y-auto">
          <button onClick={onPickYear}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left transition-colors border-b border-slate-100">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-electric-500 to-electric-600 flex items-center justify-center text-white">
              <FiCalendar size={13} />
            </span>
            <span className="text-xs font-semibold text-slate-700">Year</span>
          </button>
          {CARD_CATEGORIES.map(c => (
            <button key={c.id} onClick={() => onPickConfig(c.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left transition-colors">
              <span className={`w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br ${c.color}`} />
              <span className="text-xs font-medium text-slate-700 truncate">{c.label}</span>
            </button>
          ))}
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
    const overYear = getIntersectingNodes(node).filter(n => n.type === 'year')[0] || null;
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
          proOptions={{ hideAttribution: true }}
          className="bg-slate-50"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable
            nodeColor={(n) => (n.type === 'year' ? '#3b82f6' : '#93c5fd')}
            maskColor="rgba(248,250,252,0.7)" />
          <Panel position="top-left">
            <button onClick={(e) => openMenuAt(e.clientX, e.clientY)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm text-xs font-semibold text-electric-700 hover:border-electric-300 hover:shadow transition-all">
              <FiPlus size={14} /> Add card
            </button>
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
