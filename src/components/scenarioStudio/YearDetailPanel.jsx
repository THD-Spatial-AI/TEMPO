/**
 * Scenario Studio — Year detail side panel.
 *
 * Click a Year card to see what that year looks like and how it differs from the
 * previous year: the (scaled) demand profile, the active constraints, disabled
 * technologies, and the deltas vs the previous year in the timeline.
 */

import React, { useMemo } from 'react';
import { FiX, FiCalendar, FiTrash2, FiArrowRight } from '../ui/icons';
import ReactECharts from '../ui/Chart';
import { summarizeYearOps } from '../../services/scenarioStudio/scenario.js';
import { extractDemandSeries } from '../../services/scenarioStudio/recipeParams.js';
import { iconBtn, ICON_PX } from '../ui/iconButton';
import { tr } from '../../i18n';

// renewable_min carries an object { share, techs }; everything else is a scalar.
function fmtConstraint(kind, v) {
  if (v == null) return '—';
  if (kind === 'renewable_min' && typeof v === 'object') return `${Math.round((v.share || 0) * 100)}% RE`;
  return String(v);
}

function pctDelta(cur, prev) {
  if (prev == null || prev === 0) return null;
  const d = (cur / prev - 1) * 100;
  if (Math.abs(d) < 0.05) return null;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

export default function YearDetailPanel({
  year, prevYear, variant, prevVariant, model, timeSeries, onClose, onDelete,
}) {
  const summary = useMemo(() => summarizeYearOps(model, variant?.ops || []), [model, variant]);
  const prevSummary = useMemo(
    () => (prevVariant ? summarizeYearOps(model, prevVariant.ops || []) : null),
    [model, prevVariant]
  );
  const series = useMemo(() => extractDemandSeries(model, timeSeries), [model, timeSeries]);
  const preview = useMemo(() => {
    if (!series) return null;
    const step = Math.max(1, Math.floor(series.values.length / 300));
    const pts = [];
    for (let i = 0; i < series.values.length; i += step) pts.push(series.values[i] * summary.demandScale);
    return pts;
  }, [series, summary.demandScale]);

  const demandDelta = prevSummary ? pctDelta(summary.demandScale, prevSummary.demandScale) : null;
  const constraintKinds = [...new Set([
    ...Object.keys(summary.constraints),
    ...(prevSummary ? Object.keys(prevSummary.constraints) : []),
  ])];
  const newlyDisabled = summary.disabled.filter(t => !prevSummary?.disabled.includes(t));

  return (
    <div className="w-[340px] shrink-0 border-l border-black/15 bg-white flex flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-black/15 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white ">
          <FiCalendar size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{tr("Year")} {year}</div>
          <div className="text-[11px] text-slate-400">
            {prevYear != null ? <>{tr("compared with")} <span className="font-medium text-slate-500">{prevYear}</span></> : tr("first year — baseline")}
          </div>
        </div>
        <button onClick={onDelete} className={`${iconBtn('delete', 'md')}`} title={tr("Remove year")}>
          <FiTrash2 size={ICON_PX.md} />
        </button>
        <button onClick={onClose} aria-label={tr("Close")} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <FiX size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {/* Demand */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700">{tr("Demand")}</span>
            <span className="text-xs text-slate-500">
              {summary.demandScale}×
              {demandDelta && <span className={`ml-1.5 font-medium ${demandDelta.startsWith('+') ? 'text-blue-600' : 'text-red-600'}`}>{demandDelta} {tr("vs")} {prevYear}</span>}
            </span>
          </div>
          {preview ? (
            <ReactECharts
              style={{ height: 150 }}
              option={{
                animation: false,
                grid: { top: 8, bottom: 20, left: 44, right: 8 },
                xAxis: { type: 'category', show: false, data: preview.map((_, i) => i) },
                yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
                tooltip: { trigger: 'axis' },
                series: [{ type: 'line', data: preview, smooth: true, symbol: 'none',
                  lineStyle: { color: '#0f172a', width: 1.5 }, areaStyle: { color: 'rgba(15,23,42,0.06)' } }],
              }}
            />
          ) : (
            <p className="text-xs text-slate-400 italic">{tr("No demand time series for this model.")}</p>
          )}
        </div>

        {/* Constraints */}
        <div>
          <span className="text-xs font-semibold text-slate-700">{tr("Constraints")}</span>
          {constraintKinds.length === 0 ? (
            <p className="text-xs text-slate-400 italic mt-1">{tr("None this year.")}</p>
          ) : (
            <div className="mt-1.5 space-y-1">
              {constraintKinds.map(k => {
                const cur = summary.constraints[k];
                const prev = prevSummary?.constraints[k];
                const changed = prevSummary && JSON.stringify(cur) !== JSON.stringify(prev);
                return (
                  <div key={k} className="flex items-center gap-2 text-xs px-2.5 py-1.5 bg-slate-50 rounded-lg">
                    <span className="font-medium text-slate-600">{k}</span>
                    <span className="ml-auto font-mono text-slate-800">{fmtConstraint(k, cur)}</span>
                    {changed && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600">
                        <FiArrowRight size={9} /> {tr("was")} {fmtConstraint(k, prev)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Disabled techs */}
        {summary.disabled.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-slate-700">{tr("Disabled technologies")}</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {summary.disabled.map(t => (
                <span key={t} className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                  newlyDisabled.includes(t) ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {t}{newlyDisabled.includes(t) ? tr(" • new") : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
          {tr("Wire config cards into this Year card to change what applies here. Unwired configs apply to every year.")}
        </div>
      </div>
    </div>
  );
}
