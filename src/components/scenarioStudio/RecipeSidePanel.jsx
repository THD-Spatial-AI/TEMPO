/**
 * Scenario Studio — docked side panel for the selected card.
 *
 * Routes the selected card to its category config (CardConfig) and shows the
 * whole scenario's variant list (one per year) plus compose/capability warnings.
 */

import React from 'react';
import { FiX, FiInfo, FiLayers, FiAlertTriangle } from '../ui/icons';
import { CardConfig, VariantBadge } from './recipeConfig.jsx';
import { CATEGORY_BY_ID } from '../../services/scenarioStudio/scenario.js';
import { resolveTechGroup } from '../../services/scenarioStudio/utils.js';
import CategoryTile from './categoryIcon.jsx';
import { tr } from '../../i18n';

function ModelSummary({ model }) {
  if (!model) return <p className="text-xs text-slate-400 mt-1">{tr("Select a model above to begin.")}</p>;
  const techs = model.technologies || [];
  const stats = [
    [tr("Technologies"), techs.length],
    [tr("Locations"), (model.locations || []).length],
    [tr("Renewable"), resolveTechGroup(model, 'renewable').length],
    [tr("Emitting (CO₂)"), resolveTechGroup(model, 'emitting').length],
  ];
  return (
    <div className="mt-4 w-full">
      <p className="mb-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">{tr("This model")}</p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-xl border border-black/15 bg-white px-3 py-2 text-left ">
            <div className="text-lg font-bold tabular-nums text-slate-900">{n}</div>
            <div className="text-[10px] text-slate-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RecipeSidePanel({
  card, scopeLabel, model, timeSeries, variants, warnings, capabilityWarnings, onSetParam, onClose,
}) {
  if (!card) {
    return (
      <div className="flex w-[340px] shrink-0 flex-col items-center justify-center border-l border-black/15 bg-white px-6 text-center">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500"><FiInfo size={18} /></div>
        <p className="text-sm font-semibold text-slate-800">{tr("No card selected")}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{tr("Click a config card to configure it. Nest it in a Year to scope it to that year, or leave it on the canvas for all years.")}</p>
        <ModelSummary model={model} />
      </div>
    );
  }

  const meta = CATEGORY_BY_ID[card.category];
  const scope = scopeLabel || tr("All years");

  return (
    <div className="w-[340px] shrink-0 border-l border-black/15 bg-white flex flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-black/15 px-5 py-4">
        <CategoryTile meta={meta} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{meta?.label || card.category}</div>
          <span className="mt-0.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{scope}</span>
        </div>
        <button onClick={onClose} aria-label={tr("Close")} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <FiX size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <CardConfig category={card.category} params={card.params} setParam={onSetParam} model={model} timeSeries={timeSeries} />

        {variants?.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">{tr("Scenario —")} {variants.length} {tr("run")}{variants.length > 1 ? 's' : ''}</span> {tr("(per year")}{variants.some(v => v.label.includes(' · ')) ? tr(" × case / slack") : ''}):
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {variants.map(v => <VariantBadge key={v.label} variant={v} />)}
            </div>
          </div>
        )}

        {warnings?.length > 0 && (
          <div className="space-y-1 rounded-xl border border-black/15 bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><FiLayers size={12} /> {tr("Composition notes")}</p>
            {warnings.map((w, i) => <p key={i} className="text-xs text-slate-600">{w}</p>)}
          </div>
        )}

        {capabilityWarnings?.length > 0 && (
          <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><FiAlertTriangle size={12} /> {tr("Engine compatibility")}</p>
            {capabilityWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700">{w}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}
