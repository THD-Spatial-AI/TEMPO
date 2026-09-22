/**
 * Scenario Studio — collapsible results bottom sheet (wraps BatchComparison).
 */

import React, { useState } from 'react';
import { FiChevronUp, FiChevronDown, FiBarChart2 } from 'react-icons/fi';
import BatchComparison from '../results/BatchComparison.jsx';

export default function ResultsSheet({ completedJobs }) {
  const [open, setOpen] = useState(false);
  if ((completedJobs || []).length === 0) return null;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors">
        <FiBarChart2 size={14} className="text-electric-500" />
        <span className="text-sm font-semibold text-slate-700">Results</span>
        <span className="text-xs text-slate-400">{completedJobs.length} completed run{completedJobs.length === 1 ? '' : 's'}</span>
        <span className="ml-auto text-slate-400">{open ? <FiChevronDown size={16} /> : <FiChevronUp size={16} />}</span>
      </button>
      {open && (
        <div className="max-h-[45vh] overflow-y-auto px-4 pb-4 bg-gradient-to-br from-slate-50 to-slate-100">
          <BatchComparison completedJobs={completedJobs} />
        </div>
      )}
    </div>
  );
}
