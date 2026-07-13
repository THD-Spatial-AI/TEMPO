import React, { useState } from 'react';
import { FiInfo, FiChevronDown, FiChevronRight } from 'react-icons/fi';

/**
 * Collapsible list of translation-report lines produced by an engine's
 * import/export/run translation (dropped params, approximations, notes).
 * Renders nothing when the report is empty.
 *
 * @param {string[]} report  Report lines.
 * @param {string}   [title] Heading, default "Translation report".
 */
export default function TranslationReport({ report, title = 'Translation report' }) {
  const [open, setOpen] = useState(true);

  if (!report || report.length === 0) return null;

  return (
    <div className="mt-3 border border-amber-200 bg-amber-50 rounded-xl text-sm text-slate-700">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 p-3 text-left font-semibold text-slate-800"
      >
        {open ? <FiChevronDown className="w-4 h-4 flex-shrink-0" /> : <FiChevronRight className="w-4 h-4 flex-shrink-0" />}
        <FiInfo className="w-4 h-4 text-amber-500 flex-shrink-0" />
        {title}
        <span className="ml-auto text-xs font-normal text-slate-500">{report.length} item{report.length === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
          {report.map((line, i) => (
            <li key={i} className="text-xs font-mono text-slate-600 break-words">• {line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
