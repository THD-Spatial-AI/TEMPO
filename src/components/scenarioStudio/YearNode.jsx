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
import { createPortal } from 'react-dom';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { FiCalendar, FiTrash2, FiCopy, FiPlus } from '../ui/icons';
import { BoardCtx } from './boardContext.js';
import CategoryTile from './categoryIcon.jsx';
import { CARD_CATEGORIES } from '../../services/scenarioStudio/scenario.js';
import { iconBtn, ICON_PX } from '../ui/iconButton';
import { tr } from '../../i18n';

// Categories that make sense nested in a year (recipe trajectories are global-only).
const YEAR_CATEGORIES = CARD_CATEGORIES.filter(c => c.lanes.includes('year'));

function YearNodeImpl({ id, data, selected }) {
  const ctx = useContext(BoardCtx) || {};
  const [menuPos, setMenuPos] = useState(null);
  const menuOpen = !!menuPos;
  const setMenuOpen = (open) => setMenuPos(open ? menuPos : null);

  return (
    <div
      className={`group relative h-full w-full rounded-2xl border bg-white/80 backdrop-blur-sm transition-all ${
        selected ? 'border-slate-900 shadow-xl ring-4 ring-slate-900/10' : 'border-black/15  hover:border-slate-400'
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={data._minW || 250}
        minHeight={data._minH || 150}
        color="#0f172a"
        onResize={(_e, p) => ctx.onResizeYear?.(id, { width: p.width, height: p.height })}
      />
      <Handle type="target" position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-400" />

      <div className="flex h-[38px] items-center gap-2 rounded-t-2xl border-b border-black/15 bg-white px-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black text-white">
          <FiCalendar size={12} />
        </span>
        <input
          type="number" value={data.year} min={2000} max={2200} step={1}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => ctx.onSetYear?.(id, parseInt(e.target.value, 10) || data.year)}
          className="nodrag w-[70px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-bold tabular-nums text-slate-900 transition-colors hover:border-black/15 focus:border-black/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
          aria-label={tr("Year")}
        />
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (menuPos) { setMenuPos(null); return; }
              const r = e.currentTarget.getBoundingClientRect();
              setMenuPos({ top: r.bottom + 6, left: Math.max(8, r.right - 224) });
            }}
            className="nodrag flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            title={tr("Add a config card to this year")}
          >
            <FiPlus size={12} /> {tr("Card")}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); ctx.onDuplicateNode?.(id); }}
            className="nodrag grid h-6 w-6 place-items-center rounded-md text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100"
            title={tr("Duplicate year")}
          >
            <FiCopy size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); ctx.onDeleteNode?.(id); }}
            className={`${iconBtn('delete', 'sm')} nodrag opacity-0 group-hover:opacity-100`}
            title={tr("Remove year")}
          >
            <FiTrash2 size={ICON_PX.sm} />
          </button>
        </div>
      </div>

      {menuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[1001] max-h-[60vh] w-56 overflow-y-auto rounded-xl border border-black/15 bg-white p-1 shadow-2xl shadow-slate-900/15"
          >
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {tr("Add to")} {data.year}
            </div>
            {YEAR_CATEGORIES.map(c => (
              <button key={c.id}
                onClick={(e) => { e.stopPropagation(); ctx.onAddConfigToYear?.(id, c.id); setMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100">
                <CategoryTile meta={c} size="sm" />
                <span className="truncate text-[13px] font-medium text-slate-700">{c.label}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {!data._hasChildren && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 top-[50px] flex items-center justify-center rounded-xl border-2 border-dashed border-black/15">
          <span className="text-[11px] text-slate-400">{tr("Drop cards here, or use “+ Card”")}</span>
        </div>
      )}

      <Handle type="source" position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white !bg-black" />
    </div>
  );
}

export default memo(YearNodeImpl);
