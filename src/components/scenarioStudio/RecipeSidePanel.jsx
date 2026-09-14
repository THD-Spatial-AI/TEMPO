/**
 * Scenario Studio — docked side panel for the selected card.
 *
 * Reuses the existing per-recipe ConfigPanel verbatim, and shows the selected
 * card's GROUP variant list, affected demand techs, and compose/capability
 * warnings. Empty-state hint when nothing is selected.
 */

import React from 'react';
import { FiX, FiInfo, FiLayers, FiAlertTriangle, FiAlertCircle } from 'react-icons/fi';
import { ConfigPanel, VariantBadge } from './recipeConfig.jsx';
import { RECIPE_BY_ID, buildRecipeParams, resolveDemandTechNames } from './recipeMeta.js';

export default function RecipeSidePanel({
  node, model, meta, onSetParam, onClose,
}) {
  if (!node) {
    return (
      <div className="w-[340px] shrink-0 border-l border-slate-200 bg-white flex flex-col items-center justify-center text-center px-6">
        <FiInfo size={22} className="text-slate-300 mb-2" />
        <p className="text-sm text-slate-500 font-medium">No card selected</p>
        <p className="text-xs text-slate-400 mt-1">Click a card on the board to configure it, or add one with the “+” button.</p>
      </div>
    );
  }

  const recipeId = node.data.recipeId;
  const params = node.data.params || {};
  const card = RECIPE_BY_ID[recipeId];
  const variants = meta?.variants || [];
  const warnings = meta?.warnings || [];
  const capabilityWarnings = meta?.capabilityWarnings || [];

  const affectedTechs = recipeId === 'demandGrowth' && model
    ? resolveDemandTechNames(model, buildRecipeParams('demandGrowth', params, model))
    : [];

  const previewRecipeId = (meta?.chainLen ?? 1) > 1 ? 'composed' : recipeId;

  return (
    <div className="w-[340px] shrink-0 border-l border-slate-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0">
        <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card?.color || 'from-slate-500 to-slate-600'} flex items-center justify-center text-white shadow-sm`}>
          {card?.Icon && <card.Icon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800 truncate">{card?.label || recipeId}</div>
          <div className="text-[11px] text-slate-400">Configure this card</div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
          <FiX size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Config */}
        <ConfigPanel recipeId={recipeId} params={params} setParam={onSetParam} model={model} />

        {/* Affected techs (demand growth) */}
        {recipeId === 'demandGrowth' && (
          affectedTechs.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Technologies scaled:</p>
              <div className="flex flex-wrap gap-1.5">
                {affectedTechs.map(name => (
                  <span key={name} className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">{name}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-amber-600 flex items-center gap-1">
              <FiAlertCircle size={11} /> No demand techs found in model
            </div>
          )
        )}

        {/* Variant list for this group */}
        {recipeId !== 'spores' && variants.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">{variants.length} run{variants.length > 1 ? 's' : ''}</span>
              {(meta?.chainLen ?? 1) > 1 ? ' (composed chain):' : ' in this scenario:'}
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {variants.map(v => <VariantBadge key={v.label} variant={v} recipeId={previewRecipeId} />)}
            </div>
          </div>
        )}

        {/* Compose warnings */}
        {warnings.length > 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <FiLayers size={12} /> Layer composition notes
            </p>
            {warnings.map((w, i) => <p key={i} className="text-xs text-blue-700">{w}</p>)}
          </div>
        )}

        {/* Capability warnings */}
        {capabilityWarnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
              <FiAlertTriangle size={12} /> Engine compatibility warnings
            </p>
            {capabilityWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}
