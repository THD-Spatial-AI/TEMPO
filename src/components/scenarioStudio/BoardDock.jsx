/**
 * Scenario Studio — bottom dock.
 * Aggregates the single scenario: total runs (= #years), warning count, Run.
 */

import React from 'react';
import { FiPlay, FiActivity, FiAlertTriangle } from 'react-icons/fi';

export default function BoardDock({
  totalRuns, warningCount, onRun, runDisabled, runningJobsCount, onGoToRun, engineLabel,
}) {
  return (
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5 flex items-center gap-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-700"><span className="font-bold text-slate-900">{totalRuns}</span> run{totalRuns === 1 ? '' : 's'}</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">one scenario across {totalRuns} year{totalRuns === 1 ? '' : 's'}</span>
        {warningCount > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-amber-600"><FiAlertTriangle size={12} /> {warningCount} note{warningCount === 1 ? '' : 's'}</span>
          </>
        )}
      </div>

      {runningJobsCount > 0 && (
        <button onClick={onGoToRun} className="flex items-center gap-1 text-xs text-electric-600 hover:text-electric-700">
          <FiActivity size={11} /> {runningJobsCount} active — monitor in Run →
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-slate-400">{engineLabel}</span>
        <button onClick={onRun} disabled={runDisabled}
          className={`flex items-center justify-center gap-2 py-2 px-5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
            runDisabled ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-electric-600 to-electric-700 text-white hover:shadow-md hover:scale-[1.01] active:scale-100'
          }`}>
          <FiPlay size={15} /> Run scenario
        </button>
      </div>
    </div>
  );
}
