import React, { useState, useEffect, useRef } from "react";
import { FiDownload, FiRefreshCw, FiTerminal, FiCheckCircle, FiAlertCircle, FiBox, FiCpu, FiZap } from 'react-icons/fi';

// ── Module catalogue (mirrors SetupScreen) ───────────────────────────────────
const PYTHON_MODULES = [
  {
    id: 'calliope',
    label: 'Calliope 0.6.8',
    badge: 'Recommended',
    badgeColor: 'bg-blue-100 text-blue-700',
    description: 'Full energy system modelling & optimisation.',
  },
  {
    id: 'pypsa',
    label: 'PyPSA ≥0.26',
    badge: 'Optional',
    badgeColor: 'bg-slate-100 text-slate-500',
    description: 'Python for Power System Analysis — alternative framework.',
  },
  {
    id: 'adopt',
    label: 'ADOPT (latest)',
    badge: 'Experimental',
    badgeColor: 'bg-amber-100 text-amber-700',
    description: 'Agent-based power system optimisation framework.',
  },
];

// ── Python Environment panel ──────────────────────────────────────────────────
function PythonEnvironmentPanel() {
  const [envStatus, setEnvStatus]         = useState(null);   // null | { envExists, venvPath, serviceRunning, platform }
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedModules, setSelectedModules] = useState(['calliope']);
  const [downloadCbc, setDownloadCbc]     = useState(true);
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
      const env = await window.electronAPI?.checkCalliopeEnv?.()
        .catch(() => ({ envExists: false, serviceRunning: false, platform: '' }));
      setEnvStatus(env || { envExists: false, serviceRunning: false, platform: '' });
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => { refreshStatus(); }, []);

  const appendLog = (line) =>
    setLogs(prev => [...prev, { text: line, ts: new Date().toLocaleTimeString('en', { hour12: false }) }]);

  const toggleModule = (id) =>
    setSelectedModules(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(m => m !== id) : prev
        : [...prev, id]
    );

  const handleInstall = async () => {
    setInstalling(true);
    setLogs([]);
    setError('');
    setSuccess(false);

    const unsub = window.electronAPI.onCalliopeInstallProgress((data) => {
      if (data.type === 'log')   appendLog(data.line);
      if (data.type === 'stage') appendLog('▶ ' + data.label);
      if (data.type === 'done') {
        if (unsub) unsub();
        unsubRef.current = null;
        setInstalling(false);
        setSuccess(true);
        refreshStatus();
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
    window.electronAPI.installCalliopeEnv(selectedModules, downloadCbc);
  };

  const isWindows = envStatus?.platform === 'win32';

  return (
    <div className="border-t border-slate-200 pt-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <FiBox className="w-5 h-5 text-slate-400" /> Python Environment
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Manage the Python environment used for energy model optimisation.
        Reinstalling wipes the existing environment and creates a fresh one from scratch.
      </p>

      {/* Status badge */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${
        statusLoading ? 'bg-slate-50 border-slate-200' :
        envStatus?.envExists ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
      }`}>
        {statusLoading ? (
          <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        ) : envStatus?.envExists ? (
          <FiCheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        ) : (
          <FiAlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {statusLoading ? 'Checking…' : envStatus?.envExists ? 'Environment installed' : 'Not installed'}
          </p>
          {!statusLoading && envStatus?.venvPath && (
            <p className="text-xs text-slate-400 font-mono truncate">{envStatus.venvPath}</p>
          )}
          {!statusLoading && (
            <p className="text-xs mt-0.5">
              Service: <span className={envStatus?.serviceRunning ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                {envStatus?.serviceRunning ? 'running' : 'stopped'}
              </span>
            </p>
          )}
        </div>
        <button onClick={refreshStatus} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Refresh">
          <FiRefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Module selection */}
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <FiBox className="w-3.5 h-3.5" /> Modules to install
      </h4>
      <div className="space-y-2 mb-4">
        {PYTHON_MODULES.map(mod => {
          const checked = selectedModules.includes(mod.id);
          return (
            <button
              key={mod.id}
              onClick={() => toggleModule(mod.id)}
              disabled={installing}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors
                ${checked ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                {checked && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${checked ? 'text-blue-700' : 'text-slate-700'}`}>{mod.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${mod.badgeColor}`}>{mod.badge}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{mod.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* CBC option (Windows only) */}
      {isWindows && selectedModules.includes('calliope') && (
        <>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <FiCpu className="w-3.5 h-3.5" /> Solver
          </h4>
          <button
            onClick={() => setDownloadCbc(v => !v)}
            disabled={installing}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all mb-4
              ${downloadCbc ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors
              ${downloadCbc ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
              {downloadCbc && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${downloadCbc ? 'text-blue-700' : 'text-slate-700'}`}>
                  Download CBC solver binary (~7 MB)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Recommended for large models. Downloaded once and stored in your profile.</p>
            </div>
          </button>
        </>
      )}

      {/* Install button */}
      <button
        onClick={handleInstall}
        disabled={installing || selectedModules.length === 0 || !window.electronAPI}
        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
      >
        {installing ? (
          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Installing…</>
        ) : (
          <><FiDownload className="w-4 h-4" /> {envStatus?.envExists ? 'Reinstall from scratch' : 'Install'}</>
        )}
      </button>

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

      {/* Result messages */}
      {success && (
        <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
          Installation complete. TEMPO services restarted.
        </div>
      )}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <p className="font-semibold mb-1">Installation failed:</p>
          <pre className="whitespace-pre-wrap break-all text-xs bg-red-100 rounded p-2 max-h-24 overflow-y-auto">{error}</pre>
        </div>
      )}
    </div>
  );
}

const Settings = () => {
  const [clearing, setClearing]       = useState(false);
  const [clearResult, setClearResult] = useState(null); // null | { success, deleted? }
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClearAll = async () => {
    setConfirmOpen(false);
    if (!window.electronAPI?.clearAllData) {
      setClearResult({ success: false, error: 'Not available in browser mode.' });
      return;
    }
    setClearing(true);
    setClearResult(null);
    try {
      const result = await window.electronAPI.clearAllData();
      setClearResult(result);
    } catch (err) {
      setClearResult({ success: false, error: err.message });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex-1 p-8 bg-gray-50">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Settings</h1>
        <p className="text-slate-600">Application configuration and preferences</p>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">

        {/* General Settings */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">General Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Default View
              </label>
              <select className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500">
                <option>Dashboard</option>
                <option>Map View</option>
              </select>
            </div>
          </div>
        </div>

        {/* Model Settings */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Model Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Auto-save</label>
              <input type="checkbox" className="rounded text-gray-600" />
              <span className="ml-2 text-sm text-slate-600">Automatically save changes</span>
            </div>
          </div>
        </div>

        {/* Python Environment */}
        <PythonEnvironmentPanel />

        {/* Privacy & Data */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Privacy &amp; Data</h3>
          <p className="text-sm text-slate-500 mb-4">
            TEMPO stores all model data locally on this device. Use the button below to
            permanently delete all locally stored data (models, exports, and privacy consent
            record) — this cannot be undone.
          </p>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={clearing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {clearing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Clearing…
              </>
            ) : (
              'Clear All Data'
            )}
          </button>

          {clearResult && (
            <div className={`mt-3 rounded-lg p-3 text-sm ${clearResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {clearResult.success
                ? `Data cleared successfully. Removed: ${(clearResult.deleted || []).join(', ') || 'nothing to remove'}.`
                : `Error: ${clearResult.error || 'Unknown error'}`}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-slate-200">
            <div className="flex items-center gap-3 p-6 border-b border-slate-100">
              <span className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Clear all data?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-600">
                All models, exports, and the privacy consent record stored on this device
                will be permanently deleted. TEMPO will restart clean on next launch.
              </p>
            </div>
            <div className="p-6 pt-0 flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors"
              >
                Yes, delete everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

