/**
 * Scenario Studio — a single recipe card as a React Flow custom node.
 *
 * Face = gradient icon chip + label + one-line param summary + variant-count
 * badge. Chain heads that are pathway-eligible also show the Snapshots↔Pathway
 * toggle and a live progress strip. SPORES cards have NO connection handles
 * (non-composable). Clicking the card selects it (handled by React Flow →
 * onNodeClick in ScenarioBoard); the full config lives in the side panel.
 */

import React, { memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FiTrash2, FiClock } from 'react-icons/fi';
import { RECIPE_BY_ID, summarizeOps } from './recipeMeta.js';
import { BoardCtx } from './boardContext.js';

// One-line summary of a card's configuration for the node face.
function faceSummary(recipeId, params = {}) {
  switch (recipeId) {
    case 'demandGrowth': {
      const rate = params.ratePerYear ?? 0;
      const sign = rate > 0 ? '+' : '';
      return `${sign}${rate}%/yr · from ${params.baseYear ?? '—'}`;
    }
    case 'renewableTransition':
      return `→ ${params.targetYear ?? '—'} · ${params.phaseOutMode === 'cliff' ? 'hard stop' : 'graduated'}`;
    case 'carbonCap':
      return `${params.startCap ?? '—'}→${params.endCap ?? '—'} Mt by ${params.targetYear ?? '—'}`;
    case 'costSensitivity':
      return `${params.techName || 'tech'} · ${params.valueFrom ?? '?'}→${params.valueTo ?? '?'} (${params.steps ?? '?'})`;
    case 'spores':
      return `${params.sporesNumber ?? 20} alt · ${params.slack ?? 10}% slack`;
    case 'custom':
      return summarizeOps(params.ops) || 'no ops yet';
    default:
      return '';
  }
}

function RecipeCardNodeImpl({ id, data, selected }) {
  const ctx = useContext(BoardCtx) || {};
  const { metaByNode, pathwayProgress, onTogglePathway, onDeleteNode, sporesEngineOk } = ctx;
  const card = RECIPE_BY_ID[data.recipeId];
  const meta = metaByNode?.get(id) || {};
  const isSpores = data.recipeId === 'spores';
  const summary = faceSummary(data.recipeId, data.params);

  const badge = isSpores
    ? `${data.params?.sporesNumber ?? 20} alt`
    : `${meta.variantCount ?? 0} run${(meta.variantCount ?? 0) === 1 ? '' : 's'}`;

  const progress = pathwayProgress?.[id];

  return (
    <div
      className={`relative bg-white rounded-xl border shadow-sm w-60 transition-colors ${
        selected
          ? 'border-electric-500 ring-2 ring-electric-300'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Compose handles — omitted for SPORES (non-composable) */}
      {!isSpores && (
        <>
          <Handle type="target" position={Position.Left}
            className="!bg-electric-400 !w-3 !h-3 !border-2 !border-white" />
          <Handle type="source" position={Position.Right}
            className="!bg-electric-500 !w-3 !h-3 !border-2 !border-white" />
        </>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br ${card?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center text-white shadow-sm`}>
            {card?.Icon && <card.Icon size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 leading-tight truncate">{card?.label || data.recipeId}</div>
            <div className="text-[11px] text-slate-500 truncate">{summary}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteNode?.(id); }}
            className="nodrag p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
            title="Remove card"
          >
            <FiTrash2 size={13} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
            isSpores ? 'bg-teal-50 text-teal-700' : 'bg-electric-50 text-electric-700'
          }`}>
            {badge}
          </span>
          {meta.chainLen > 1 && (
            <span className="text-[10px] text-slate-400">layer {meta.chainPos + 1}/{meta.chainLen}</span>
          )}
          {isSpores && !sporesEngineOk && (
            <span className="text-[10px] font-medium text-amber-600">needs Calliope 0.6</span>
          )}
        </div>

        {/* Per-group temporal toggle — only on an eligible chain head */}
        {meta.isHead && meta.isEligible && (
          <div className="nodrag mt-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1 mb-1">
              <FiClock size={10} className="text-electric-500" />
              <span className="text-[10px] font-semibold text-slate-600">Temporal mode</span>
            </div>
            <div className="flex gap-1">
              {[{ id: false, label: 'Snapshots' }, { id: true, label: 'Pathway' }].map(opt => (
                <button key={String(opt.id)}
                  onClick={(e) => { e.stopPropagation(); onTogglePathway?.(id, opt.id); }}
                  className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
                    !!meta.pathwayMode === opt.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Live pathway progress strip */}
        {meta.isHead && meta.pathwayMode && progress && Object.keys(progress).length > 0 && (
          <div className="nodrag mt-2 flex flex-wrap items-center gap-1">
            {Object.entries(progress).map(([label, st], i, arr) => {
              const color = st === 'done' ? 'bg-green-100 text-green-700 border-green-300'
                : st === 'running' ? 'bg-electric-100 text-electric-700 border-electric-300 animate-pulse'
                : st === 'failed' ? 'bg-red-100 text-red-700 border-red-300'
                : st === 'skipped' ? 'bg-slate-100 text-slate-400 border-slate-200'
                : 'bg-white text-slate-400 border-slate-200';
              const mark = st === 'done' ? ' ✓' : st === 'failed' ? ' ✗' : st === 'skipped' ? ' –' : '';
              return (
                <React.Fragment key={label}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${color}`}>{label}{mark}</span>
                  {i < arr.length - 1 && <span className="text-slate-300 text-[9px]">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(RecipeCardNodeImpl);
