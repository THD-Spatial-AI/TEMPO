/**
 * Scenario Studio — docked side panel for the selected card.
 *
 * Routes the selected card to its category config (CardConfig) and shows the
 * whole scenario's variant list (one per year) plus compose/capability warnings.
 */

import React from 'react';
import { FiX, FiInfo, FiLayers, FiAlertTriangle } from 'react-icons/fi';
import { CardConfig, VariantBadge } from './recipeConfig.jsx';
import { CATEGORY_BY_ID } from '../../services/scenarioStudio/scenario.js';

export default function RecipeSidePanel({
  card, scopeLabel, model, timeSeries, variants, warnings, capabilityWarnings, onSetParam, onClose,
}) {
  if (!card) {
    return (
      <div className="w-[340px] shrink-0 border-l border-slate-200 bg-white flex flex-col items-center justify-center text-center px-6">
        <FiInfo size={22} className="text-slate-300 mb-2" />
        <p className="text-sm text-slate-500 font-medium">No card selected</p>
        <p className="text-xs text-slate-400 mt-1">Click a config card to configure it. Wire a Year card into it to scope it to that year, or leave it unwired for all years.</p>
      </div>
    );
  }

  const meta = CATEGORY_BY_ID[card.category];
  const scope = scopeLabel || 'All years';

  return (
    <div className="w-[340px] shrink-0 border-l border-slate-200 bg-white flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
        <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta?.color || 'from-slate-500 to-slate-600'} shadow-sm`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800 truncate">{meta?.label || card.category}</div>
          <div className="text-[11px] text-slate-400">{scope}</div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
          <FiX size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <CardConfig category={card.category} params={card.params} setParam={onSetParam} model={model} timeSeries={timeSeries} />

        {variants?.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">Scenario — {variants.length} run{variants.length > 1 ? 's' : ''}</span> (one per year):
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {variants.map(v => <VariantBadge key={v.label} variant={v} />)}
            </div>
          </div>
        )}

        {warnings?.length > 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5"><FiLayers size={12} /> Composition notes</p>
            {warnings.map((w, i) => <p key={i} className="text-xs text-blue-700">{w}</p>)}
          </div>
        )}

        {capabilityWarnings?.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><FiAlertTriangle size={12} /> Engine compatibility</p>
            {capabilityWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}
