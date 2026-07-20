// LogsTab — the "logs" result tab, extracted verbatim from Results.jsx.
// Renders the pre-computed chart options / data passed as props.
import { FiTerminal } from 'react-icons/fi';

export default function LogsTab({
  selectedJob,
}) {
  return (
              <div className="bg-slate-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3 text-green-400">
                  <FiTerminal size={14} />
                  <span className="text-sm font-mono font-semibold">Solver Log — {selectedJob.logs?.length || 0} lines</span>
                </div>
                <div className="text-green-400 text-xs font-mono space-y-0.5 max-h-[600px] overflow-y-auto pr-2">
                  {(selectedJob.logs || []).map((l, i) => (
                    <div key={i} className={`leading-relaxed ${l.startsWith('[ERROR]') || l.includes('Error') ? 'text-red-400' : l.includes('WARNING') ? 'text-amber-400' : ''}`}>
                      {l}
                    </div>
                  ))}
                  {(!selectedJob.logs || selectedJob.logs.length === 0) && (
                    <div className="text-slate-600 italic">No log lines available</div>
                  )}
                </div>
              </div>
  );
}
