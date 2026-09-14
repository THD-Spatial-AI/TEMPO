/**
 * Scenario Studio — the React Flow sandbox canvas.
 *
 * Presentational: all board state (nodes/edges/selection/group meta) lives in
 * the ScenarioStudio container and is passed in. This renders the light-themed
 * canvas, the compose wires, and the add-card affordances (+ button + right-click
 * context menu), mirroring the tech simulator's CCSFlowDiagram look & feel.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  BackgroundVariant, MarkerType, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FiPlus } from 'react-icons/fi';
import RecipeCardNode from './RecipeCardNode.jsx';
import { RECIPE_CARDS } from './recipeMeta.js';
import { BoardCtx } from './boardContext.js';

const nodeTypes = { recipeCard: RecipeCardNode };

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#3b82f6', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6', width: 16, height: 16 },
};

function AddMenu({ onPick, onClose, style }) {
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div style={style}
        className="absolute z-[91] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden w-56">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Add a recipe card
        </div>
        <div className="max-h-72 overflow-y-auto">
          {RECIPE_CARDS.map(c => (
            <button key={c.id} onClick={() => onPick(c.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left transition-colors">
              <span className={`w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br ${c.color} flex items-center justify-center text-white`}>
                <c.Icon size={13} />
              </span>
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
  onNodeClick, onPaneClick, onAddNode, ctxValue,
}) {
  const { screenToFlowPosition } = useReactFlow();
  const wrapRef = useRef(null);
  const [menu, setMenu] = useState(null); // { screenX, screenY, flowPos }

  const openMenuAt = useCallback((clientX, clientY) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    setMenu({
      style: { left: (rect ? clientX - rect.left : clientX), top: (rect ? clientY - rect.top : clientY) },
      flowPos: screenToFlowPosition({ x: clientX, y: clientY }),
    });
  }, [screenToFlowPosition]);

  const handlePaneContextMenu = useCallback((e) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  }, [openMenuAt]);

  const handlePick = useCallback((recipeId) => {
    onAddNode(recipeId, menu?.flowPos);
    setMenu(null);
  }, [onAddNode, menu]);

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      <BoardCtx.Provider value={ctxValue}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={(e) => { setMenu(null); onPaneClick?.(e); }}
          onPaneContextMenu={handlePaneContextMenu}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-slate-50"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="#93c5fd" maskColor="rgba(248,250,252,0.7)" />
          <Panel position="top-left">
            <button
              onClick={(e) => openMenuAt(e.clientX, e.clientY)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm text-xs font-semibold text-electric-700 hover:border-electric-300 hover:shadow transition-all">
              <FiPlus size={14} /> Add card
            </button>
          </Panel>
        </ReactFlow>
      </BoardCtx.Provider>
      {menu && <AddMenu onPick={handlePick} onClose={() => setMenu(null)} style={{ position: 'absolute', ...menu.style }} />}
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
