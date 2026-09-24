/**
 * Scenario Studio — a Year card as a React Flow container/group node.
 *
 * Represents one snapshot year. Config cards dropped inside it (parentId = this
 * node) are scoped to this year; configs left outside apply to all years. The
 * "+" adds a config directly nested in this year. Left/right handles link
 * Year → Year for a consecutive timeline. The year value is editable inline.
 * The node's width/height come from node.style (a container).
 */

import React, { memo, useContext, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { FiCalendar, FiTrash2, FiCopy, FiPlus } from 'react-icons/fi';
import { BoardCtx } from './boardContext.js';
import { CARD_CATEGORIES } from '../../services/scenarioStudio/scenario.js';

// Categories that make sense nested in a year (recipe trajectories are global-only).
const YEAR_CATEGORIES = CARD_CATEGORIES.filter(c => c.lanes.includes('year'));

function YearNodeImpl({ id, data, selected }) {
  const ctx = useContext(BoardCtx) || {};
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`relative w-full h-full rounded-xl border-2 transition-colors ${
        selected ? 'border-electric-500 ring-2 ring-electric-300 bg-electric-50/40' : 'border-electric-300 bg-electric-50/20 hover:border-electric-400'
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={data._minW || 250}
        minHeight={data._minH || 150}
        color="#3b82f6"
        onResize={(_e, p) => ctx.onResizeYear?.(id, { width: p.width, height: p.height })}
      />
      <Handle type="target" position={Position.Left}
        className="!bg-electric-300 !w-3 !h-3 !border-2 !border-white" />

      {/* Header band */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-electric-200/70 bg-white/70 rounded-t-xl">
        <span className="w-6 h-6 shrink-0 rounded-lg bg-gradient-to-br from-electric-500 to-electric-600 flex items-center justify-center text-white shadow-sm">
          <FiCalendar size={12} />
        </span>
        <input
          type="number" value={data.year} min={2000} max={2200} step={1}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => ctx.onSetYear?.(id, parseInt(e.target.value, 10) || data.year)}
          className="nodrag w-16 text-base font-bold text-slate-800 border border-slate-200 rounded-md px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-electric-400"
        />
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          className="nodrag ml-auto p-0.5 text-electric-500 hover:text-electric-700 rounded transition-colors"
          title="Add a config card to this year"
        >
          <FiPlus size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); ctx.onDuplicateNode?.(id); }}
          className="nodrag p-0.5 text-slate-300 hover:text-electric-500 rounded transition-colors"
          title="Duplicate year"
        >
          <FiCopy size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); ctx.onDeleteNode?.(id); }}
          className="nodrag p-0.5 text-slate-300 hover:text-red-500 rounded transition-colors"
          title="Remove year"
        >
          <FiTrash2 size={11} />
        </button>
      </div>

      {/* Add-config menu (nests the picked category into this year) */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div className="nodrag nopan absolute z-[81] left-2 top-[40px] w-44 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-slate-100 bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
              Add to year {data.year}
            </div>
            {YEAR_CATEGORIES.map(c => (
              <button key={c.id}
                onClick={(e) => { e.stopPropagation(); ctx.onAddConfigToYear?.(id, c.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 text-left transition-colors">
                <span className={`w-5 h-5 shrink-0 rounded bg-gradient-to-br ${c.color}`} />
                <span className="text-[11px] font-medium text-slate-700 truncate">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Body — nested config cards render here (drop zone) */}
      {!data._hasChildren && (
        <div className="absolute inset-x-0 bottom-0 top-[38px] flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-electric-400/70">drop cards here, or use “+”</span>
        </div>
      )}

      <Handle type="source" position={Position.Right}
        className="!bg-electric-500 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

export default memo(YearNodeImpl);
