/**
 * Scenario Studio — collapsible results bottom sheet.
 *
 * Wraps the existing BatchComparison dashboard and the inline SPORES exploration
 * view (SporesTab) so results live on the board page without leaving the canvas.
 */

import React, { useState } from 'react';
import { FiChevronUp, FiChevronDown, FiBarChart2, FiGitMerge } from 'react-icons/fi';
import BatchComparison from '../results/BatchComparison.jsx';
import SporesTab from '../results/tabs/SporesTab.jsx';

export default function ResultsSheet({ completedJobs, latestSporesJob, modelLocations }) {
  const [open, setOpen] = useState(false);
  const hasJobs = (completedJobs || []).length > 0;
  if (!hasJobs && !latestSporesJob) return null;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors">
        <FiBarChart2 size={14} className="text-electric-500" />
        <span className="text-sm font-semibold text-slate-700">Results</span>
        <span className="text-xs text-slate-400">
          {(completedJobs || []).length} completed run{(completedJobs || []).length === 1 ? '' : 's'}
          {latestSporesJob ? ' · SPORES available' : ''}
        </span>
        <span className="ml-auto text-slate-400">{open ? <FiChevronDown size={16} /> : <FiChevronUp size={16} />}</span>
      </button>

      {open && (
        <div className="max-h-[45vh] overflow-y-auto px-4 pb-4 space-y-6 bg-gradient-to-br from-slate-50 to-slate-100">
          <BatchComparison completedJobs={completedJobs} />
          {latestSporesJob && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <FiGitMerge size={14} className="text-electric-500" />
                Explored alternatives — {latestSporesJob.modelName}
              </h2>
              <SporesTab result={latestSporesJob.result} modelLocations={modelLocations || []} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
