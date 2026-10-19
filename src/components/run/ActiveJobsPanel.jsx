// ActiveJobsPanel — displays all active runs, including those launched from Scenario Studio.
import { useState, useEffect } from 'react';
import { FiActivity, FiClock, FiStopCircle, FiTerminal, FiLayers } from '../ui/icons';
import { tr } from '../../i18n';

function useElapsed(startTime) {
  const [elapsed, setElapsed] = useState('0s');
  useEffect(() => {
    const tick = () => {
      const ms = Date.now() - new Date(startTime).getTime();
      if (ms < 60000) setElapsed(`${Math.floor(ms / 1000)}s`);
      else setElapsed(`${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return elapsed;
}

function JobCard({ job, expandedLog, setExpandedLog, handleStopJob, logEndRef }) {
  const elapsed = useElapsed(job.startTime);
  const s = job.stats;
  const isFromStudio = job.source === 'scenario_studio';

  return (
    <div className="p-4 bg-gray-50 border border-black/10 rounded-xl">
      {/* header */}
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-sm text-slate-800 truncate">{job.modelName ?? job.displayName}</div>
            {isFromStudio && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 bg-electric-50 text-electric-700 border border-electric-200 flex-shrink-0">
                <FiLayers size={8} /> {tr("Scenario Studio")}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {job.framework ?? tr("calliope")} · {job.solver?.toUpperCase() ?? tr("HIGHS")} · {elapsed}
          </div>
        </div>
        <button onClick={() => handleStopJob(job.id)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg flex-shrink-0 ml-2" title={tr("Stop")}>
          <FiStopCircle size={16} />
        </button>
      </div>

      {/* progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1 mb-3 overflow-hidden">
        <div className="h-1 bg-gray-400 rounded-full animate-pulse" style={{ width: '60%' }} />
      </div>

      {/* resource stats */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="bg-white border border-black/10 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{tr("Elapsed")}</div>
          <div className="text-xs font-bold text-slate-700">{elapsed}</div>
        </div>
        <div className="bg-white border border-black/10 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{tr("CPU")}</div>
          <div className="text-xs font-bold text-slate-700">{s?.cpu_pct != null ? `${s.cpu_pct}%` : '—'}</div>
          {s?.cpu_pct != null && (
            <div className="mt-1 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div className="h-1 rounded-full bg-gray-400 transition-all duration-500" style={{ width: `${Math.min(s.cpu_pct, 100)}%` }} />
            </div>
          )}
        </div>
        <div className="bg-white border border-black/10 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{tr("Proc RAM")}</div>
          <div className="text-xs font-bold text-slate-700">
            {s?.proc_ram_mb != null ? (s.proc_ram_mb >= 1024 ? tr("{0} GB", { 0: (s.proc_ram_mb / 1024).toFixed(1) }) : tr("{0} MB", { 0: s.proc_ram_mb })) : '—'}
          </div>
        </div>
        <div className="bg-white border border-black/10 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{tr("Sys RAM")}</div>
          <div className="text-xs font-bold text-slate-700">{s?.sys_ram_pct != null ? `${s.sys_ram_pct}%` : '—'}</div>
          {s?.sys_ram_pct != null && (
            <div className="mt-1 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div className="h-1 rounded-full transition-all duration-500 bg-gray-400" style={{ width: `${Math.min(s.sys_ram_pct, 100)}%` }} />
            </div>
          )}
          {s?.sys_ram_used_gb != null && (
            <div className="text-[9px] text-slate-400 mt-0.5">{s.sys_ram_used_gb} / {s.sys_ram_total_gb} {tr("GB")}</div>
          )}
        </div>
      </div>

      {/* log toggle */}
      <button
        onClick={() => setExpandedLog(expandedLog === job.id ? null : job.id)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
      >
        <FiTerminal size={11} />
        {expandedLog === job.id ? tr("Hide") : tr("Show")} {tr("logs (")}{job.logs.length} {tr("lines)")}
      </button>
      {expandedLog === job.id && (
        <div className="mt-2 bg-black text-green-400 rounded-lg p-3 text-xs font-mono h-48 overflow-y-auto">
          {job.logs.length === 0
            ? <span className="text-slate-500">{tr("Waiting for output…")}</span>
            : job.logs.map((l, i) => (
                <div key={i} className={
                  l.includes('ERROR') || l.includes('error') ? 'text-red-400'
                  : l.includes('WARNING') || l.includes('Skipping') ? 'text-yellow-400'
                  : l.includes('Optimisation finished') || l.includes('Extracted') ? 'text-cyan-300'
                  : ''
                }>{l}</div>
              ))
          }
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

export default function ActiveJobsPanel({ expandedLog, handleStopJob, logEndRef, runningJobs, setExpandedLog }) {
  const studioCount = runningJobs.filter(j => j.source === 'scenario_studio').length;
  const directCount = runningJobs.length - studioCount;

  return (
    <div>
      <div className="bg-white rounded-2xl  border border-black/15 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FiActivity size={14} className="text-slate-500" />
          {tr("Active runs")}
          {runningJobs.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {runningJobs.length} {tr("live")}
            </span>
          )}
        </h2>

        {runningJobs.length > 1 && (
          <p className="text-[10px] text-slate-400 mb-3">
            {studioCount > 0 && tr("{0} from Scenario Studio", { 0: studioCount })}
            {studioCount > 0 && directCount > 0 && ' · '}
            {directCount > 0 && tr("{0} direct", { 0: directCount })}
            {tr(" · running concurrently")}
          </p>
        )}

        {runningJobs.length === 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-black/15 px-4 py-4">
            <FiClock size={18} className="shrink-0 text-slate-300" />
            <p className="text-xs text-slate-500">{tr("No active runs. Runs you start appear here with live logs.")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {runningJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                expandedLog={expandedLog}
                setExpandedLog={setExpandedLog}
                handleStopJob={handleStopJob}
                logEndRef={logEndRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
