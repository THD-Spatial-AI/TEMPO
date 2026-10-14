/**
 * Scenario Studio — bottom dock.
 * Aggregates the single scenario: total runs (= #years), warning count, Run.
 */

import React from 'react';
import { FiPlay, FiActivity, FiAlertTriangle } from '../ui/icons';

export default function BoardDock({
  totalRuns, warningCount, noMatchCount = 0, sequential = false, onToggleSequential,
  onRun, runDisabled, runningJobsCount, onGoToRun, engineLabel,
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-black/15 bg-white px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">
          <span className="font-bold tabular-nums text-slate-900">{totalRuns}</span> run{totalRuns === 1 ? '' : 's'}
        </span>
        <span className="text-xs text-slate-500">One scenario across {totalRuns} year{totalRuns === 1 ? '' : 's'}</span>
        {warningCount > 0 && (
          <span className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <FiAlertTriangle size={12} /> {warningCount} note{warningCount === 1 ? '' : 's'}
          </span>
        )}
        {noMatchCount > 0 && (
          <span className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700" title="Cards that match no technologies in this model">
            <FiAlertTriangle size={12} /> {noMatchCount} card{noMatchCount === 1 ? '' : 's'} hit 0 techs
          </span>
        )}
        {runningJobsCount > 0 && (
          <button onClick={onGoToRun} className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {runningJobsCount} active — monitor in Run <FiActivity size={11} />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div
          className="inline-flex gap-1 rounded-lg bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50"
          title="Parallel fires every year at once; Sequential runs them one at a time, in year order."
        >
          {[[false, 'Parallel'], [true, 'Sequential']].map(([seq, label]) => (
            <button key={label} onClick={() => sequential !== seq && onToggleSequential()}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                sequential === seq ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <span className="rounded-md border border-black/15 px-2 py-1 text-xs text-slate-500">{engineLabel}</span>
        <button onClick={onRun} disabled={runDisabled}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
          <FiPlay size={16} /> Run scenario
        </button>
      </div>
    </div>
  );
}
