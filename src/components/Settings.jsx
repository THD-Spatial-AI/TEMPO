import React, { useState, useEffect, useRef } from "react";
import { FiDownload, FiRefreshCw, FiTerminal, FiCheckCircle, FiAlertCircle, FiBox, FiCpu, FiZap, FiSliders, FiShield, FiChevronDown, FiInfo } from 'react-icons/fi';
import Calliope07EnginePanel from './Calliope07EnginePanel';
import EngineInstallPanel from './EngineInstallPanel';
import { getSettings, setSetting } from '../services/appSettings';

// ── Module catalogue (mirrors SetupScreen) ───────────────────────────────────
const PYTHON_MODULES = [
  {
    id: 'calliope',
    label: 'Calliope 0.6.8',
    badge: 'Recommended',
    badgeColor: 'bg-gray-100 text-gray-700',
    description: 'Full energy system modelling & optimisation.',
  },
  // NOTE: PyPSA is no longer installed into calliope-venv — it has its own
  // isolated engine venv (see EngineInstallPanel below). requirements.pypsa.txt
  // now targets that venv and is incompatible with the 0.6.8 stack.
  {
    id: 'adopt',
    label: 'ADOPT (latest)',
    badge: 'Experimental',
    badgeColor: 'bg-gray-100 text-gray-500',
    description: 'Agent-based power system optimisation framework.',
  },
];

// ── Python Environment panel ──────────────────────────────────────────────────
function PythonEnvironmentPanel({ embedded = false, onInstallSuccess }) {
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
    window.electronAPI.installCalliopeEnv(selectedModules, downloadCbc);
  };

  const isWindows = envStatus?.platform === 'win32';

  return (
    <div>
      {!embedded && (
        <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <FiBox className="w-5 h-5 text-slate-400" /> Calliope 0.6.8 Engine
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">Core</span>
        </h3>
      )}
      <p className="text-sm text-slate-500 mb-4">
        Manage the Python environment used for energy model optimisation.
        Reinstalling wipes the existing environment and creates a fresh one from scratch.
      </p>

      {/* Status badge */}
      {!embedded && (
      <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${
        statusLoading ? 'bg-slate-50 border-slate-200' :
        envStatus?.envExists ? 'bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-200'
      }`}>
        {statusLoading ? (
          <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        ) : envStatus?.envExists ? (
          <FiCheckCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
        ) : (
          <FiAlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
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
              Service: <span className={envStatus?.serviceRunning ? 'text-gray-700 font-medium' : 'text-slate-400'}>
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
                ${checked ? 'border-gray-400 bg-gray-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors
                ${checked ? 'bg-gray-600 border-gray-600' : 'bg-white border-slate-300'}`}>
                {checked && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${checked ? 'text-gray-800' : 'text-slate-700'}`}>{mod.label}</span>
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
              ${downloadCbc ? 'border-gray-400 bg-gray-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors
              ${downloadCbc ? 'bg-gray-600 border-gray-600' : 'bg-white border-slate-300'}`}>
              {downloadCbc && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${downloadCbc ? 'text-gray-800' : 'text-slate-700'}`}>
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
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 text-white rounded-xl font-semibold shadow hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
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
                  l.text.startsWith('▶') ? 'text-gray-300' :
                  l.text.startsWith('✗') ? 'text-gray-400' :
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
        <div className="mt-3 flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
          <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
          Installation complete. TEMPO services restarted.
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

// ── Collapsible engine row ────────────────────────────────────────────────────
// Compact header (name + badge + live status chip). Children stay mounted and are
// hidden when collapsed, so an in-progress install survives collapsing the row.
function EngineAccordion({ title, icon: Icon, badge, checkFn, defaultOpen = false, children }) {
  const [open, setOpen]       = useState(defaultOpen);
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const fn = window.electronAPI?.[checkFn];
      if (!fn) { setStatus({ envExists: false, serviceRunning: false }); return; }
      const env = await fn().catch(() => ({ envExists: false, serviceRunning: false }));
      setStatus(env || { envExists: false, serviceRunning: false });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const installed = status?.envExists;
  const statusLabel = installed
    ? (status?.serviceRunning ? 'Installed' : 'Installed · stopped')
    : 'Not installed';

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {Icon && <Icon className="w-5 h-5 text-slate-400 shrink-0" />}
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">{badge}</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {loading ? (
            <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              <span className={`w-2 h-2 rounded-full ${installed ? 'bg-gray-500' : 'bg-slate-300'}`} />
              <span className={installed ? 'text-slate-600' : 'text-slate-400'}>{statusLabel}</span>
            </span>
          )}
          <FiChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div className={open ? 'px-4 pb-4 pt-2 border-t border-slate-100' : 'hidden'}>
        {children(refresh)}
      </div>
    </div>
  );
}

// ── General preferences panel ─────────────────────────────────────────────────
function GeneralPanel() {
  const [settings, setSettings] = useState(() => getSettings());
  const update = (key, value) => setSettings(setSetting(key, value));

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Default View</label>
        <select
          value={settings.defaultView}
          onChange={(e) => update('defaultView', e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <option value="Dashboard">Dashboard</option>
          <option value="Map View">Map View</option>
        </select>
        <p className="text-xs text-slate-400 mt-1.5">The view TEMPO opens to on launch.</p>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => update('autoSave', e.target.checked)}
            className="mt-0.5 rounded text-gray-600"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Auto-save</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Automatically persist model changes 1.5s after you stop editing. When off, save
              manually with Ctrl+S — TEMPO still prompts before navigating away from unsaved changes.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

// ── About panel ───────────────────────────────────────────────────────────────
function AboutPanel() {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    window.electronAPI?.getSetupVersion?.()
      .then(info => setVersion(info?.currentVersion || null))
      .catch(() => {});
  }, []);

  const rows = [
    { label: 'TEMPO version',  value: version ? `v${version}` : '—' },
    { label: 'Calliope core',  value: '0.6.8' },
    { label: 'Optional engines', value: 'Calliope 0.7 · PyPSA · OSeMOSYS · AdOpT-NET0' },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-800 mb-1">About TEMPO</h3>
      <p className="text-sm text-slate-500 mb-4">
        Tool for Energy Model Preparation and Optimization. All model data is stored locally on this device.
      </p>
      <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-sm font-medium text-slate-800 text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Settings sub-navigation ───────────────────────────────────────────────────
const SECTIONS = [
  { id: 'general', label: 'General',              icon: FiSliders },
  { id: 'engines', label: 'Optimization Engines', icon: FiCpu },
  { id: 'data',    label: 'Privacy & Data',       icon: FiShield },
  { id: 'about',   label: 'About',                icon: FiInfo },
];

const Settings = () => {
  const [activeSection, setActiveSection] = useState('general');
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

      <div className="bg-white rounded-lg shadow-lg flex overflow-hidden min-h-[600px]">

        {/* Sub-navigation */}
        <nav className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/60 p-3 space-y-1">
          {SECTIONS.map((section) => {
            const active = activeSection === section.id;
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors
                  ${active
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-800 border border-transparent'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-gray-600' : 'text-slate-400'}`} />
                {section.label}
              </button>
            );
          })}
        </nav>

        {/* Panel content — all sections stay mounted so in-progress installs survive tab switches */}
        <div className="flex-1 p-8 overflow-y-auto">

          {/* General */}
          <div className={activeSection === 'general' ? '' : 'hidden'}>
            <GeneralPanel />
          </div>

          {/* Optimization Engines */}
          <div className={activeSection === 'engines' ? '' : 'hidden'}>
            <p className="text-sm text-slate-500 mb-4">
              Install and manage the optimisation engines TEMPO can run models on. Expand a row for
              details, installation, and logs.
            </p>
            <div className="space-y-3">
              <EngineAccordion title="Calliope 0.6.8" icon={FiBox} badge="Core" checkFn="checkCalliopeEnv" defaultOpen>
                {(onInstalled) => <PythonEnvironmentPanel embedded onInstallSuccess={onInstalled} />}
              </EngineAccordion>

              <EngineAccordion title="Calliope 0.7" icon={FiZap} badge="Experimental" checkFn="checkCalliope07Env">
                {(onInstalled) => <Calliope07EnginePanel embedded onInstallSuccess={onInstalled} />}
              </EngineAccordion>

              <EngineAccordion title="PyPSA" icon={FiCpu} badge="Optional" checkFn="checkPypsaEnv">
                {(onInstalled) => (
                  <EngineInstallPanel
                    embedded
                    title="PyPSA Engine"
                    icon={FiCpu}
                    description="Python for Power System Analysis, in its own isolated Python environment. Any TEMPO model can run on it — the translation from TEMPO's internal representation happens automatically at run time. Also enables PyPSA model import/export. Requires Python 3.10+."
                    checkFn="checkPypsaEnv"
                    installFn="installPypsaEnv"
                    onProgressFn="onPypsaInstallProgress"
                    onInstallSuccess={onInstalled}
                  />
                )}
              </EngineAccordion>

              <EngineAccordion title="OSeMOSYS" icon={FiZap} badge="Optional" checkFn="checkOsemosysEnv">
                {(onInstalled) => (
                  <EngineInstallPanel
                    embedded
                    title="OSeMOSYS Engine"
                    icon={FiZap}
                    description="Open Source Energy Modelling System (via otoole + GLPK), in its own isolated Python environment. Hourly time series are aggregated into configurable timeslices at run time. Also enables OSeMOSYS dataset import/export. Requires Python 3.10+; the GLPK solver is bundled on Windows."
                    checkFn="checkOsemosysEnv"
                    installFn="installOsemosysEnv"
                    onProgressFn="onOsemosysInstallProgress"
                    onInstallSuccess={onInstalled}
                  />
                )}
              </EngineAccordion>

              <EngineAccordion title="AdOpT-NET0" icon={FiBox} badge="Optional" checkFn="checkAdoptnet0Env">
                {(onInstalled) => (
                  <EngineInstallPanel
                    embedded
                    title="AdOpT-NET0 Engine"
                    icon={FiBox}
                    description="Advanced Optimization Tool for Energy Networks, in its own isolated Python environment. Any TEMPO model can run on it — the translation happens automatically at run time. Also enables AdOpT-NET0 model import/export. Requires Python 3.10+."
                    checkFn="checkAdoptnet0Env"
                    installFn="installAdoptnet0Env"
                    onProgressFn="onAdoptnet0InstallProgress"
                    onInstallSuccess={onInstalled}
                  />
                )}
              </EngineAccordion>
            </div>
          </div>

          {/* Privacy & Data */}
          <div className={activeSection === 'data' ? '' : 'hidden'}>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Privacy &amp; Data</h3>
            <p className="text-sm text-slate-500 mb-4">
              TEMPO stores all model data locally on this device. Use the button below to
              permanently delete all locally stored data (models, exports, and privacy consent
              record) — this cannot be undone.
            </p>

            <button
              onClick={() => setConfirmOpen(true)}
              disabled={clearing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <div className={`mt-3 rounded-lg p-3 text-sm ${clearResult.success ? 'bg-gray-50 text-gray-800' : 'bg-gray-50 text-gray-800'}`}>
                {clearResult.success
                  ? `Data cleared successfully. Removed: ${(clearResult.deleted || []).join(', ') || 'nothing to remove'}.`
                  : `Error: ${clearResult.error || 'Unknown error'}`}
              </div>
            )}
          </div>

          {/* About */}
          <div className={activeSection === 'about' ? '' : 'hidden'}>
            <AboutPanel />
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-slate-200">
            <div className="flex items-center gap-3 p-6 border-b border-slate-100">
              <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600">
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
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gray-700 hover:bg-gray-800 shadow-sm transition-colors"
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

