/**
 * Scenario Studio — a configuration card as a React Flow custom node.
 *
 * Face = category icon chip + label + one-line value summary. A left target
 * handle lets you wire a Year card into it (Year → config = applies to that
 * year; unwired = all years). Clicking selects it (side panel edits it).
 */

import React, { memo, useContext } from 'react';
import { FiTrash2, FiCopy, FiAlertTriangle } from '../ui/icons';
import CategoryTile from './categoryIcon.jsx';
import { CATEGORY_BY_ID } from '../../services/scenarioStudio/scenario.js';
import { summarizeOps } from '../../services/scenarioStudio/recipeParams.js';
import { sporesCount } from '../../services/scenarioStudio/presets/lombardi2020Italy.js';
import { BoardCtx } from './boardContext.js';
import { iconBtn, ICON_PX } from '../ui/iconButton';
import { tr } from '../../i18n';

const GROUP_LABEL = { all: 'all supply', renewable: 'renewables', nonRenewable: 'non-renewables', emitting: 'emitting techs' };
const groupLabel = (g) => GROUP_LABEL[g] || (typeof g === 'string' && g.startsWith('parent:') ? g.slice(7) : g);

function faceSummary(category, params = {}) {
  switch (category) {
    case 'demand':     return `${Number(params.scale ?? 1)}× demand`;
    case 'constraint': return `${params.kind || 'co2_cap'} = ${params.value ?? 0}`;
    case 'tech': {
      const tm = Array.isArray(params.techMatch) ? params.techMatch.join(', ') : params.techMatch;
      const tgt = params.target === 'group' ? groupLabel(params.group) : tm;
      if (!tgt) return 'pick a target';
      if (params.mode === 'disable') return `${tgt} off`;
      if (params.mode === 'remove') return `remove ${tgt}`;
      if (params.mode === 'scale') return `${tgt} ×${params.factor ?? 1}`;
      return `${tgt} = ${params.value ?? 0}`;
    }
    case 'emissions': {
      const g = groupLabel(params.group || 'emitting');
      return params.lever === 'phaseOut' ? `phase out ${g}` : `−${params.reducePct ?? 50}% cap · ${g}`;
    }
    case 'renewables': {
      const g = groupLabel(params.group || 'renewable');
      return `+${params.boostPct ?? 50}% cap · ${g}`;
    }
    case 'location': {
      if (!params.location) return 'pick a location';
      const tgt = params.target === 'group' ? groupLabel(params.group) : params.techMatch;
      if (!tgt) return `${params.location}: pick tech`;
      if (params.mode === 'disable') return `${params.location}: ${tgt} off`;
      if (params.mode === 'scale') return `${params.location}: ${tgt} ×${params.factor ?? 1}`;
      return `${params.location}: ${tgt} = ${params.value ?? 0}`;
    }
    case 'custom':     return summarizeOps(params.ops) || 'no ops yet';
    case 'timeseries': return params.fromFile && params.toFile ? `${params.fromFile} → ${params.toFile}` : 'pick files';
    case 'sensitivity': return `${(params.variants || []).length} cases`;
    case 'spores': return `${sporesCount(params.plan)} alt · ${(params.slacks || []).map(s => `${s}%`).join('/') || 'no slack'}`;
    case 'recipe:demandGrowth':        return `+${params.ratePerYear ?? 0}%/yr`;
    case 'recipe:carbonCap':           return `${params.startCap ?? '?'}→${params.endCap ?? '?'} Mt`;
    case 'recipe:renewableTransition': return `→ ${params.targetYear ?? '?'}`;
    default: return '';
  }
}

function ScenarioCardNodeImpl({ id, data, selected }) {
  const ctx = useContext(BoardCtx) || {};
  const meta = CATEGORY_BY_ID[data.category];
  const summary = faceSummary(data.category, data.params);

  return (
    <div
      className={`group relative w-52 overflow-hidden rounded-xl border bg-white transition-all ${
        selected ? 'border-slate-900 shadow-lg ring-2 ring-slate-900/10' : 'border-black/15  hover:border-black/15 hover:'
      }`}
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2.5">
        <CategoryTile meta={meta} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-slate-900">{meta?.label || data.category}</div>
          <div className="truncate text-[11px] text-slate-500">{summary}</div>
        </div>
        {data._noMatch && (
          <span className="nodrag shrink-0 text-amber-500" title={tr("Matches no technologies in this model")}>
            <FiAlertTriangle size={13} />
          </span>
        )}
        <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); ctx.onDuplicateNode?.(id); }}
            className="nodrag grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title={tr("Duplicate card")}
          >
            <FiCopy size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); ctx.onDeleteNode?.(id); }}
            className={`${iconBtn('delete', 'sm')} nodrag`}
            title={tr("Remove card")}
          >
            <FiTrash2 size={ICON_PX.sm} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ScenarioCardNodeImpl);
