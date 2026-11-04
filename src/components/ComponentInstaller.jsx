import React, { useState, useEffect, useRef } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiDownload, FiTerminal, FiClock, FiRefreshCw } from './ui/icons';

const GROUPS = [
  { id: 'framework', title: 'Modelling frameworks' },
  { id: 'solver', title: 'Solvers' },
  { id: 'service', title: 'Services' },
  { id: 'tool', title: 'Tools' },
];

const FINISHED_OK = new Set(['installed', 'skipped']);

const STATE_TEXT = {
  running: 'Working…',
  installed: 'Installed and verified',
  skipped: 'Already working',
  failed: 'Failed',
  unavailable: 'Not available',
  'not-run': 'Not run',
};

function StateIcon({ state }) {
  if (state === 'running') return <FiLoader className="w-4 h-4 text-gray-500 animate-spin flex-shrink-0" />;
  if (FINISHED_OK.has(state)) return <FiCheckCircle className="w-4 h-4 text-gray-700 flex-shrink-0" />;
  if (state === 'failed' || state === 'unavailable') return <FiAlertCircle className="w-4 h-4 text-black flex-shrink-0" />;
  return <FiClock className="w-4 h-4 text-slate-300 flex-shrink-0" />;
}

function sizeLabel(component) {
  if (component.dockerGb) return `~${component.dockerGb} GB in Docker`;
  if (component.sizeGb >= 0.05) return `~${component.sizeGb.toFixed(1)} GB`;
  return '';
}

/**
 * Lists what TEMPO can install, with required components locked on and optional
 * ones left to the user, then installs and verifies the selection. Used by the
 * first-run setup and by Settings.
 *
 * @param {function} [onFinished]  Called when the required components work, with the results.
 * @param {string[]} [forceIds]    Components to reinstall even if they look healthy.
 * @param {boolean}  [manage]      Show Uninstall on installed optional components (Settings).
 * @param {node}     [extraActions] Extra buttons next to Install, hidden while installing.
 */
export default function ComponentInstaller({ onFinished, forceIds = [], manage = false, extraActions = null }) {
  const [components, setComponents] = useState(null);
  const [freeGb, setFreeGb]         = useState(null);
  const [chosen, setChosen]         = useState(new Set());
  const [phase, setPhase]           = useState('choosing'); // 'choosing' | 'installing' | 'finished'
  const [states, setStates]         = useState({});
  const [errors, setErrors]         = useState({});
  const [logs, setLogs]             = useState([]);
  const [outcome, setOutcome]       = useState(null);       // { ok, error? }
  const [uninstalling, setUninstalling] = useState(null);
  const [uninstallError, setUninstallError] = useState('');
  const logEndRef = useRef(null);
  const unsubRef  = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'nearest' }); }, [logs]);
  useEffect(() => () => { unsubRef.current?.(); }, []);

  const load = async () => {
    const info = await window.electronAPI.getSetupComponents();
    setComponents(info.components);
    setFreeGb(info.freeGb);
    return info;
  };

  useEffect(() => {
    window.electronAPI.getSetupComponents().then((info) => {
      setComponents(info.components);
      setFreeGb(info.freeGb);
      setChosen(new Set(info.components
        .filter(c => !c.installed && !c.unavailable && (c.default || info.selected.includes(c.id)))
        .map(c => c.id)));
    }).catch(err => setOutcome({ ok: false, error: err.message }));
  }, []);

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const install = async (ids) => {
    setPhase('installing');
    setStates({});
    setErrors({});
    setLogs([]);
    setOutcome(null);
    unsubRef.current?.();
    unsubRef.current = window.electronAPI.onSetupProgress((data) => {
      if (data.type === 'component') {
        setStates(prev => ({ ...prev, [data.id]: data.state }));
        if (data.error) setErrors(prev => ({ ...prev, [data.id]: data.error }));
      }
      if (data.type === 'log') setLogs(prev => [...prev.slice(-400), data.line]);
      if (data.type === 'stage') setLogs(prev => [...prev.slice(-400), `▶ ${data.label}`]);
    });

    const result = await window.electronAPI.installComponents({ ids, force: forceIds })
      .catch(err => ({ ok: false, error: err.message }));
    unsubRef.current?.();
    unsubRef.current = null;

    // The final results are authoritative: progress events can arrive after the reply.
    const results = result.results || {};
    setStates(Object.fromEntries(Object.entries(results).map(([id, r]) => [id, r.state])));
    setErrors(Object.fromEntries(Object.entries(results).filter(([, r]) => r.error).map(([id, r]) => [id, r.error])));
    setOutcome(result);
    setPhase('finished');
    await load();

    const allGood = result.ok && Object.values(results).every(r => FINISHED_OK.has(r.state));
    if (allGood) onFinished?.(results);
  };

  const uninstall = async (component) => {
    setUninstalling(component.id);
    setUninstallError('');
    const result = await window.electronAPI.uninstallComponent(component.id)
      .catch(err => ({ success: false, error: err.message }));
    if (!result.success) setUninstallError(`${component.label}: ${result.error}`);
    await load();
    setUninstalling(null);
  };

  if (!components) {
    if (outcome?.error) return <p className="text-sm text-black">{outcome.error}</p>;
    return <FiLoader className="w-6 h-6 text-gray-500 animate-spin" />;
  }

  const willInstall = components.filter(c => c.required ? !c.installed : chosen.has(c.id));
  const totalGb = willInstall.reduce((sum, c) => sum + c.sizeGb, 0);
  const failedIds = Object.entries(states).filter(([, s]) => s === 'failed' || s === 'not-run').map(([id]) => id);

  if (phase !== 'choosing') {
    const shown = components.filter(c => states[c.id]);
    return (
      <div className="w-full">
        <div className="border border-black/15 divide-y divide-black/10">
          {shown.map(c => (
            <div key={c.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="mt-0.5"><StateIcon state={states[c.id]} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-black">{c.label}</p>
                {errors[c.id] && (
                  <pre className="mt-1 whitespace-pre-wrap break-words max-h-24 overflow-y-auto bg-gray-100 p-2 text-xs text-gray-800">{errors[c.id]}</pre>
                )}
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{STATE_TEXT[states[c.id]]}</span>
            </div>
          ))}
        </div>

        {logs.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-1">
              <FiTerminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Output</span>
            </div>
            <div className="bg-slate-950 p-3 h-40 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300">
              {logs.map((line, i) => <div key={i} className="break-words">{line}</div>)}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {phase === 'finished' && (
          <div className="mt-4">
            {outcome?.error && <p className="mb-3 text-sm text-black">{outcome.error}</p>}
            {outcome?.ok === false && !outcome.error && (
              <p className="mb-3 text-sm text-black">A required component failed, so TEMPO can't run models yet. Fix the error above and retry.</p>
            )}
            {outcome?.ok && failedIds.length > 0 && (
              <p className="mb-3 text-sm text-gray-600">TEMPO is ready. The components that failed are optional, and you can install them later from Settings.</p>
            )}
            <div className="flex flex-wrap gap-3">
              {failedIds.length > 0 && (
                <button
                  onClick={() => install([...chosen])}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity"
                >
                  <FiRefreshCw className="w-4 h-4" /> Retry
                </button>
              )}
              {outcome?.error && (
                <button
                  onClick={() => setPhase('choosing')}
                  className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
                >
                  Back
                </button>
              )}
              {outcome?.ok && onFinished && (
                <button
                  onClick={() => onFinished(outcome.results)}
                  className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
                >
                  Continue
                </button>
              )}
              {outcome?.ok && !onFinished && (
                <button
                  onClick={() => setPhase('choosing')}
                  className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
                >
                  Done
                </button>
              )}
              {phase === 'finished' && !outcome?.ok && extraActions}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      {GROUPS.map(group => (
        <div key={group.id} className="mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">{group.title}</h3>
          <div className="border border-black/15 divide-y divide-black/10">
            {components.filter(c => c.group === group.id).map((c) => {
              const locked = c.required || c.installed || !!c.unavailable;
              const checked = c.required || c.installed || chosen.has(c.id);
              return (
                <label key={c.id} className={`flex items-start gap-3 px-4 py-2.5 ${locked ? '' : 'cursor-pointer hover:bg-gray-50'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => toggle(c.id)}
                    aria-label={c.label}
                    className="mt-0.5 w-4 h-4 accent-black flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${c.unavailable ? 'text-gray-400' : 'text-black'}`}>
                      {c.label}
                      {c.required && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Required</span>}
                      {!c.required && c.installed && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Installed</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.unavailable || c.description}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{sizeLabel(c)}</span>
                  {manage && c.installed && c.removable && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); uninstall(c); }}
                      disabled={!!uninstalling}
                      className="px-3 py-1 border border-black/20 text-xs font-semibold text-black hover:border-black disabled:opacity-50 flex-shrink-0"
                    >
                      {uninstalling === c.id ? 'Removing…' : 'Uninstall'}
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {uninstallError && <p className="mb-3 text-sm text-black">{uninstallError}</p>}
      {outcome?.error && <p className="mb-3 text-sm text-black">{outcome.error}</p>}

      <p className="mb-4 text-xs text-gray-500">
        {willInstall.length > 0
          ? `Will download about ${totalGb.toFixed(1)} GB. ${freeGb.toFixed(0)} GB free on this drive.`
          : 'Everything selected is already installed.'}
        {' '}You can add or remove optional components later in Settings.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => install([...chosen])}
          disabled={willInstall.length === 0 && forceIds.length === 0 && manage}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FiDownload className="w-4 h-4" /> Install
        </button>
        {extraActions}
      </div>
    </div>
  );
}
