import React, { useState, useEffect, useRef } from 'react';
import { FiZap, FiCheckCircle, FiAlertCircle, FiDownload, FiTerminal, FiRefreshCw } from 'react-icons/fi';

/**
 * Reusable install/status panel for the Calliope 0.7 (experimental) engine.
 * Used in Settings (full page) and in Run (inline, when 0.7 is selected but not running).
 *
 * @param {function} [onInstallSuccess]  Called after a successful install, with no args.
 */
export default function Calliope07EnginePanel({ onInstallSuccess, embedded = false }) {
  const [envStatus, setEnvStatus]         = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [installing, setInstalling]       = useState(false);
  const [logs, setLogs]                   = useState([]);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState(false);
  const logEndRef = useRef(null);
  const unsubRef  = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => () => { unsubRef.current?.(); }, []);

  const refreshStatus = async () => {
    setStatusLoading(true);
    try {
      if (!window.electronAPI) {
        setEnvStatus({ envExists: false, serviceRunning: false });
        return;
      }
      const env = await window.electronAPI.checkCalliope07Env()
        .catch(() => ({ envExists: false, serviceRunning: false }));
      setEnvStatus(env || { envExists: false, serviceRunning: false });
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => { refreshStatus(); }, []);

  const appendLog = (line) =>
    setLogs(prev => [...prev, { text: line, ts: new Date().toLocaleTimeString('en', { hour12: false }) }]);

  const handleInstall = async () => {
    setInstalling(true);
    setLogs([]);
    setError('');
    setSuccess(false);

    const unsub = window.electronAPI.onCalliope07InstallProgress((data) => {
      if (data.type === 'log')   appendLog(data.line);
      if (data.type === 'stage') appendLog('▶ ' + data.label);
      if (data.type === 'done') {
        if (unsub) unsub();
        unsubRef.current = null;
        setInstalling(false);
        setSuccess(true);
        refreshStatus();
        onInstallSuccess?.();
      }
      if (data.type === 'error') {
        appendLog('✗ ' + (data.error || data.label || 'Install error'));
        setError(data.error || 'Installation failed.');
        setInstalling(false);
        if (unsub) unsub();
        unsubRef.current = null;
      }
    });
    unsubRef.current = unsub;
    window.electronAPI.installCalliope07Env();
  };

  return (
    <div>
      {!embedded && (
        <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <FiZap className="w-5 h-5 text-gray-500" /> Calliope 0.7 Engine
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">Experimental</span>
        </h3>
      )}
      <p className="text-sm text-slate-500 mb-4">
        Optional second optimisation engine (Calliope 0.7.0.dev7, pre-release) in its own
        isolated Python environment. Any TEMPO model can run on either engine — the
        translation from TEMPO's internal representation happens automatically at run time.
        Requires Python 3.10+.
      </p>

      {/* Status */}
      {!embedded && (
      <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${
        statusLoading         ? 'bg-slate-50 border-slate-200'
        : envStatus?.envExists ? 'bg-gray-50 border-gray-200'
        : 'bg-slate-50 border-slate-200'
      }`}>
        {statusLoading ? (
          <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        ) : envStatus?.envExists ? (
          <FiCheckCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
        ) : (
          <FiAlertCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {statusLoading ? 'Checking…' : envStatus?.envExists ? 'Engine installed' : 'Not installed'}
          </p>
          {!statusLoading && envStatus?.venvPath && (
            <p className="text-xs text-slate-400 font-mono truncate">{envStatus.venvPath}</p>
          )}
          {!statusLoading && (
            <p className="text-xs mt-0.5">
              Service:{' '}
              <span className={envStatus?.serviceRunning ? 'text-gray-600 font-medium' : 'text-slate-400'}>
                {envStatus?.serviceRunning ? 'running' : 'stopped'}
              </span>
            </p>
          )}
        </div>
        <button onClick={refreshStatus} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Refresh">
          <FiRefreshCw className="w-4 h-4" />
        </button>
      </div>
      )}

      {/* Install button or CLI fallback */}
      {window.electronAPI ? (
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex items-center gap-2 px-5 py-2.5 border-2 border-gray-300 text-gray-800 bg-gray-50 rounded-xl font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
        >
          {installing ? (
            <><span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> Installing…</>
          ) : (
            <><FiDownload className="w-4 h-4" /> {envStatus?.envExists ? 'Reinstall from scratch' : 'Install Calliope 0.7 engine'}</>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-sm font-medium text-slate-700 mb-1">Option 1 — Docker (recommended)</p>
            <pre className="text-xs font-mono bg-slate-900 text-green-400 rounded-lg p-3 select-all overflow-x-auto whitespace-pre">docker compose up calliope07-runner</pre>
            <p className="text-xs text-slate-400 mt-1">Run from the TEMPO repo root. The service starts on port 5002 automatically.</p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-sm font-medium text-slate-700 mb-1">Option 2 — native install (Python 3.10+ from python.org required)</p>
            <pre className="text-xs font-mono bg-slate-900 text-green-400 rounded-lg p-3 select-all overflow-x-auto whitespace-pre">powershell -ExecutionPolicy Bypass -File scripts\install_calliope07.ps1</pre>
            <p className="text-xs text-slate-400 mt-1">After install, launch TEMPO with <code className="bg-slate-200 px-1 rounded">npm run dev:electron</code>.</p>
          </div>
        </div>
      )}

      {/* Log output */}
      {logs.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-1">
            <FiTerminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Output</span>
          </div>
          <div className="bg-slate-950 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-600 select-none flex-shrink-0">{l.ts}</span>
                <span className={
                  l.text.startsWith('▶') ? 'text-yellow-400' :
                  l.text.startsWith('✗') ? 'text-red-400' :
                  'text-slate-300'
                }>{l.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {success && (
        <div className="mt-3 flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
          <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
          Calliope 0.7 engine installed and service started.
        </div>
      )}
      {error && (
        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
          <p className="font-semibold mb-1">Installation failed:</p>
          <pre className="whitespace-pre-wrap break-all text-xs bg-gray-100 rounded p-2 max-h-24 overflow-y-auto">{error}</pre>
        </div>
      )}
    </div>
  );
}
