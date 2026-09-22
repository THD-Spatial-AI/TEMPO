/**
 * Scenario Studio — a configuration card as a React Flow custom node.
 *
 * Face = category icon chip + label + one-line value summary. A left target
 * handle lets you wire a Year card into it (Year → config = applies to that
 * year; unwired = all years). Clicking selects it (side panel edits it).
 */

import React, { memo, useContext } from 'react';
import {
  FiTrendingUp, FiCloud, FiZap, FiSliders, FiSun, FiMapPin, FiWind, FiTrash2, FiCopy, FiAlertTriangle,
} from 'react-icons/fi';
import { CATEGORY_BY_ID } from '../../services/scenarioStudio/scenario.js';
import { summarizeOps } from '../../services/scenarioStudio/recipeParams.js';
import { BoardCtx } from './boardContext.js';

const ICONS = { FiTrendingUp, FiCloud, FiZap, FiSliders, FiSun, FiMapPin, FiWind };

const GROUP_LABEL = { all: 'all supply', renewable: 'renewables', nonRenewable: 'non-renewables', emitting: 'emitting techs' };
const groupLabel = (g) => GROUP_LABEL[g] || (typeof g === 'string' && g.startsWith('parent:') ? g.slice(7) : g);

function faceSummary(category, params = {}) {
  switch (category) {
    case 'demand':     return `${Number(params.scale ?? 1)}× demand`;
    case 'constraint': return `${params.kind || 'co2_cap'} = ${params.value ?? 0}`;
    case 'tech': {
      const tgt = params.target === 'group' ? groupLabel(params.group) : params.techMatch;
      if (!tgt) return 'pick a target';
      if (params.mode === 'disable') return `${tgt} off`;
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
    case 'recipe:demandGrowth':        return `+${params.ratePerYear ?? 0}%/yr`;
    case 'recipe:carbonCap':           return `${params.startCap ?? '?'}→${params.endCap ?? '?'} Mt`;
    case 'recipe:renewableTransition': return `→ ${params.targetYear ?? '?'}`;
    default: return '';
  }
}

function ScenarioCardNodeImpl({ id, data, selected }) {
  const ctx = useContext(BoardCtx) || {};
  const meta = CATEGORY_BY_ID[data.category];
  const Icon = ICONS[meta?.icon] || FiSliders;
  const summary = faceSummary(data.category, data.params);

  return (
    <div
      className={`relative bg-white rounded-lg border shadow-sm w-52 transition-colors ${
        selected ? 'border-electric-500 ring-2 ring-electric-300' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <div className="p-2.5 flex items-center gap-2">
        <span className={`w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br ${meta?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center text-white shadow-sm`}>
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800 leading-tight truncate">{meta?.label || data.category}</div>
          <div className="text-[10px] text-slate-500 truncate">{summary}</div>
        </div>
        {data._noMatch && (
          <span className="nodrag shrink-0 text-amber-500" title="Matches no technologies in this model">
            <FiAlertTriangle size={13} />
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); ctx.onDuplicateNode?.(id); }}
          className="nodrag p-1 text-slate-300 hover:text-electric-500 rounded transition-colors"
          title="Duplicate card"
        >
          <FiCopy size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); ctx.onDeleteNode?.(id); }}
          className="nodrag p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
          title="Remove card"
        >
          <FiTrash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default memo(ScenarioCardNodeImpl);
