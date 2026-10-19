import React, { useState, useEffect, useRef } from "react";
import { requestUpdateCheck } from '../services/updates';
import { FiDownload, FiRefreshCw, FiTerminal, FiCheckCircle, FiAlertCircle, FiBox, FiCpu, FiZap, FiShield, FiChevronDown, FiServer, FiMessageSquare } from './ui/icons';
import { LuSlidersHorizontal, LuCpu, LuServer, LuMessageSquare, LuShield, LuInfo, LuTrash2 } from './ui/icons';
import tempoLogo from '../assets/Logo_TEMPO.PNG';
import Select from './ui/Select';
import Calliope07EnginePanel from './Calliope07EnginePanel';
import EngineInstallPanel from './EngineInstallPanel';
import { getSettings, setSetting } from '../services/appSettings';
import { useData } from '../context/DataContext';
import { useT, LANGUAGES, setLanguage } from '../i18n';
import { checkMemeService } from '../services/memeClient';
import { AI_PROVIDERS, getAIConfig, setAIConfig, providerMeta } from '../services/aiSettings';
import { tr } from '../i18n';

// ── Module catalogue (mirrors SetupScreen) ───────────────────────────────────
const PYTHON_MODULES = [
  {
    id: 'calliope',
    label: tr("Calliope 0.6.8"),
    badge: tr("Recommended"),
    badgeColor: 'bg-gray-100 text-gray-700',
    description: tr("Full energy system modelling & optimisation."),
  },
  // NOTE: PyPSA is no longer installed into calliope-venv — it has its own
  // isolated engine venv (see EngineInstallPanel below). requirements.pypsa.txt
  // now targets that venv and is incompatible with the 0.6.8 stack.
  {
    id: 'adopt',
    label: tr("ADOPT (latest)"),
    badge: tr("Experimental"),
    badgeColor: 'bg-gray-100 text-gray-500',
    description: tr("Agent-based power system optimisation framework."),
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
        appendLog('✗ ' + (data.error || data.label || tr("Install error")));
        setError(data.error || tr("Installation failed."));
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
          <FiBox className="w-5 h-5 text-slate-400" /> {tr("Calliope 0.6.8 Engine")}
          <span className="text-xs px-2 py-0.5 font-medium bg-gray-100 text-gray-700">{tr("Core")}</span>
        </h3>
      )}
      <p className="text-sm text-slate-500 mb-4">
        {tr("Manage the Python environment used for energy model optimisation. Reinstalling wipes the existing environment and creates a fresh one from scratch.")}
      </p>

      {/* Status badge */}
      {!embedded && (
      <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${
        statusLoading ? 'bg-slate-50 border-black/15' :
        envStatus?.envExists ? 'bg-gray-50 border-black/15' : 'bg-gray-50 border-black/15'
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
            {statusLoading ? tr("Checking…") : envStatus?.envExists ? tr("Environment installed") : tr("Not installed")}
          </p>
          {!statusLoading && envStatus?.venvPath && (
            <p className="text-xs text-slate-400 font-mono truncate">{envStatus.venvPath}</p>
          )}
          {!statusLoading && (
            <p className="text-xs mt-0.5">
              {tr("Service:")} <span className={envStatus?.serviceRunning ? 'text-gray-700 font-medium' : 'text-slate-400'}>
                {envStatus?.serviceRunning ? tr("running") : tr("stopped")}
              </span>
            </p>
          )}
        </div>
        <button onClick={refreshStatus} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title={tr("Refresh")}>
          <FiRefreshCw className="w-4 h-4" />
        </button>
      </div>
      )}

      {/* Module selection */}
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <FiBox className="w-3.5 h-3.5" /> {tr("Modules to install")}
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
                ${checked ? 'border-gray-400 bg-gray-50' : 'border-black/10 bg-slate-50 hover:border-black/15'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors
                ${checked ? 'bg-gray-600 border-gray-600' : 'bg-white border-black/15'}`}>
                {checked && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${checked ? 'text-gray-800' : 'text-slate-700'}`}>{mod.label}</span>
                  <span className={`text-xs px-2 py-0.5 font-medium ${mod.badgeColor}`}>{mod.badge}</span>
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
            <FiCpu className="w-3.5 h-3.5" /> {tr("Solver")}
          </h4>
          <button
            onClick={() => setDownloadCbc(v => !v)}
            disabled={installing}
            className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all mb-4
              ${downloadCbc ? 'border-gray-400 bg-gray-50' : 'border-black/10 bg-slate-50 hover:border-black/15'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors
              ${downloadCbc ? 'bg-gray-600 border-gray-600' : 'bg-white border-black/15'}`}>
              {downloadCbc && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${downloadCbc ? 'text-gray-800' : 'text-slate-700'}`}>
                  {tr("Download CBC solver binary (~7 MB)")}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{tr("Recommended for large models. Downloaded once and stored in your profile.")}</p>
            </div>
          </button>
        </>
      )}

      {/* Install button */}
      <button
        onClick={handleInstall}
        disabled={installing || selectedModules.length === 0 || !window.electronAPI}
        className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-xl font-semibold shadow hover:bg-black/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
      >
        {installing ? (
          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {tr("Installing…")}</>
        ) : (
          <><FiDownload className="w-4 h-4" /> {envStatus?.envExists ? tr("Reinstall from scratch") : tr("Install")}</>
        )}
      </button>

      {/* Log output */}
      {logs.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-1">
            <FiTerminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">{tr("Output")}</span>
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
        <div className="mt-3 flex items-center gap-2 p-3 bg-gray-50 border border-black/15 rounded-xl text-sm text-gray-700">
          <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
          {tr("Installation complete. TEMPO services restarted.")}
        </div>
      )}
      {error && (
        <div className="mt-3 p-3 bg-gray-50 border border-black/15 rounded-xl text-sm text-gray-700">
          <p className="font-semibold mb-1">{tr("Installation failed:")}</p>
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
    ? (status?.serviceRunning ? tr("Installed") : tr("Installed · stopped"))
    : tr("Not installed");

  return (
    <div className={`overflow-hidden rounded-xl border bg-white transition-shadow ${open ? 'border-black/15 ' : 'border-black/15'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {badge && (
          <span className="rounded-md border border-black/15 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{badge}</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/15 border-t-transparent" />
          ) : (
            <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium ${
              !installed ? 'bg-slate-100 text-slate-500'
                : status?.serviceRunning ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                !installed ? 'bg-slate-400' : status?.serviceRunning ? 'bg-emerald-500' : 'bg-amber-500'
              }`} />
              {statusLabel}
            </span>
          )}
          <FiChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <div className={open ? 'px-4 pb-4 pt-2 border-t border-black/10' : 'hidden'}>
        {children(refresh)}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
        checked ? 'bg-black' : 'bg-slate-200'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function SettingRow({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-5 first:pt-0 last:pb-0">
      <div className="min-w-0 max-w-xl">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralPanel() {
  const t = useT();
  const [settings, setSettings] = useState(() => getSettings());
  const [viewChanged, setViewChanged] = useState(false);
  const { showNotification, saveNow } = useData();
  const update = (key, value) => setSettings(setSetting(key, value));
  const viewLabel = (v) => t(`nav.${v}`);
  const chooseDefaultView = (v) => {
    update('defaultView', v);
    setViewChanged(true);
    showNotification(t('settings.restartNotice', { view: viewLabel(v) }), 'info', {
      label: t('settings.restartNow'),
      onClick: () => { saveNow?.(); setTimeout(() => window.location.reload(), 300); },
    });
  };

  return (
    <div className="divide-y divide-black/10">
      <SettingRow title={t('settings.language')} description={t('settings.languageDesc')}>
        <div className="w-48">
          <Select
            value={settings.language || 'en'}
            onChange={(v) => { if (v === settings.language) return; setLanguage(v); saveNow?.(); setTimeout(() => window.location.reload(), 250); }}
            options={LANGUAGES}
          />
        </div>
      </SettingRow>
      <SettingRow title={t('settings.defaultView')} description={t('settings.defaultViewDesc')}>
        <div className="w-48">
          <Select
            value={settings.defaultView}
            onChange={chooseDefaultView}
            options={['Dashboard', 'Models', 'Creation', 'Map View', 'Run', 'Results'].map((v) => ({ value: v, label: viewLabel(v) }))}
          />
          {viewChanged && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700">
              <FiCheckCircle size={12} /> {t('settings.opensOn', { view: viewLabel(settings.defaultView) })}
            </p>
          )}
        </div>
      </SettingRow>
      <SettingRow title={t('settings.autoSave')} description={t('settings.autoSaveDesc')}>
        <Toggle checked={settings.autoSave} onChange={(v) => update('autoSave', v)} label={t('settings.autoSave')} />
      </SettingRow>
      {window.electronAPI?.updates && (
        <SettingRow title={t('settings.autoUpdate')} description={t('settings.autoUpdateDesc')}>
          <Toggle checked={settings.autoUpdateCheck} onChange={(v) => update('autoUpdateCheck', v)} label={t('settings.autoUpdate')} />
        </SettingRow>
      )}
    </div>
  );
}

// ── Remote execution (MEME) panel ─────────────────────────────────────────────
// Configures the single remote MEME server that supported engines (PyPSA,
// Calliope 0.7, AdOpT-NET0) can be offloaded to. The api_key is stored in
// localStorage (plaintext) alongside other app settings. The per-run Local/
// Remote choice lives in the Run panel — this only configures the server.
function RemoteExecutionPanel() {
  const [form, setForm] = useState(() => {
    const s = getSettings().memeServer || {};
    return { url: s.url || '', apiKey: s.apiKey || '' };
  });
  const [saved, setSaved]         = useState(false);
  const [showKey, setShowKey]     = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { ok, targets? , error? }

  const update = (key, value) => { setForm(f => ({ ...f, [key]: value })); setSaved(false); };

  const save = () => {
    setSetting('memeServer', { url: form.url.trim(), apiKey: form.apiKey });
    setSaved(true);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const caps = await checkMemeService({ url: form.url.trim() });
    setTesting(false);
    setTestResult(caps
      ? { ok: true, targets: caps.targets || [] }
      : { ok: false, error: tr("Could not reach the MEME server, or /capabilities failed.") });
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <FiServer className="w-5 h-5 text-slate-400" /> {tr("Remote Execution (MEME)")}
        <span className="text-xs px-2 py-0.5 font-medium bg-gray-100 text-gray-600">{tr("Beta")}</span>
      </h3>
      <p className="text-sm text-slate-500 mb-5 max-w-2xl">
        {tr("Point TEMPO at a remote MEME server to run models on its hardware instead of this machine. Only")} <span className="font-medium text-slate-600">{tr("PyPSA")}</span>,{' '}
        <span className="font-medium text-slate-600">{tr("Calliope 0.7")}</span> {tr("and")}{' '}
        <span className="font-medium text-slate-600">{tr("AdOpT-NET0")}</span> {tr("can run remotely; Calliope 0.6.8 and OSeMOSYS always run locally. Choose Local or Remote per run in the Run panel.")}
      </p>

      <div className="space-y-5 max-w-md">
        {/* Server URL */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{tr("Server URL")}</label>
          <input
            type="text"
            value={form.url}
            onChange={(e) => update('url', e.target.value)}
            placeholder="http://192.168.1.50:8080"
            className="w-full h-10 px-3 border border-black/15 bg-white rounded-lg font-mono text-sm focus:outline-none focus:border-black/15 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {/* API key */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{tr("API key")}</label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder={tr("Leave blank if the server has no API_KEY set")}
              className="flex-1 h-10 px-3 border border-black/15 bg-white rounded-lg font-mono text-sm focus:outline-none focus:border-black/15 focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="px-3 py-2 text-xs font-medium text-slate-500 border border-black/15 rounded-md hover:bg-slate-50"
            >
              {showKey ? tr("Hide") : tr("Show")}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {tr("Sent as the top-level")} <code className="font-mono">api_key</code> {tr("field on each request. Stored in this device's local settings (not encrypted).")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-black hover:bg-black/80 transition-colors"
          >
            {tr("Save")}
          </button>
          <button
            onClick={testConnection}
            disabled={testing || !form.url.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-black/15 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing
              ? <><span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> {tr("Testing…")}</>
              : <><FiRefreshCw className="w-4 h-4" /> {tr("Test connection")}</>}
          </button>
          {saved && <span className="text-xs text-gray-600 flex items-center gap-1"><FiCheckCircle className="w-3.5 h-3.5" /> {tr("Saved")}</span>}
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`rounded-xl border p-3 text-sm ${testResult.ok ? 'bg-gray-50 border-black/15 text-gray-700' : 'bg-gray-50 border-black/15 text-gray-700'}`}>
            {testResult.ok ? (
              <div className="flex items-start gap-2">
                <FiCheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">{tr("Server reachable")}</p>
                  <p className="text-xs mt-1">
                    {tr("Targets:")}{' '}
                    {(testResult.targets.length ? testResult.targets : ['—']).map(t => (
                      <span key={t} className="inline-block px-2 py-0.5 mr-1 bg-white border border-black/15 font-mono text-[11px]">{t}</span>
                    ))}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{testResult.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI Assistant panel ────────────────────────────────────────────────────────
// Configures the provider/model and the user's own API key for the Results AI
// Analysis tab. Non-secret config lives in appSettings (localStorage); the key
// is stored encrypted in the main process (electron/ai/keystore.cjs) and never
// held in the renderer.
function AIPanel() {
  const [cfg, setCfg]         = useState(() => getAIConfig());
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { ok, sample?|error? }

  const meta = providerMeta(cfg.provider);

  const refreshKeyStatus = (provider) => {
    window.electronAPI?.ai?.keyStatus?.(provider)
      .then(r => setHasKey(Boolean(r?.hasKey)))
      .catch(() => setHasKey(false));
  };
  useEffect(() => { refreshKeyStatus(cfg.provider); }, [cfg.provider]);

  const updateCfg = (patch) => { setCfg(setAIConfig(patch)); setSaved(false); setTestResult(null); };

  const changeProvider = (provider) => {
    // Reset model to the provider default and drop any base URL that belonged to
    // the previous provider (only compatible/ollama use one). Clear test state.
    const m = providerMeta(provider);
    updateCfg({ provider, model: m.defaultModel, baseUrl: m.needsBaseUrl ? cfg.baseUrl : '' });
    setTestResult(null);
    setKeyInput('');
  };

  const saveKey = async () => {
    if (!window.electronAPI?.ai) return;
    await window.electronAPI.ai.setKey(cfg.provider, keyInput.trim());
    setKeyInput('');
    setSaved(true);
    refreshKeyStatus(cfg.provider);
  };

  const clearKey = async () => {
    if (!window.electronAPI?.ai) return;
    await window.electronAPI.ai.clearKey(cfg.provider);
    setSaved(false);
    setTestResult(null);
    refreshKeyStatus(cfg.provider);
  };

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    const r = await window.electronAPI?.ai?.testKey?.({ provider: cfg.provider, model: cfg.model || meta.defaultModel, baseUrl: cfg.baseUrl })
      .catch(err => ({ ok: false, error: err.message }));
    setTesting(false);
    setTestResult(r || { ok: false, error: tr("LLM bridge unavailable.") });
  };

  const desktop = Boolean(window.electronAPI?.ai);

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <FiMessageSquare className="w-5 h-5 text-slate-400" /> {tr("Model Advisor")}
        <span className="text-xs px-2 py-0.5 font-medium bg-gray-100 text-gray-600">{tr("Bring your own key")}</span>
      </h3>
      <p className="text-sm text-slate-500 mb-5 max-w-2xl">
        {tr("Powers the")} <span className="font-medium text-slate-600">{tr("Model Advisor")}</span> {tr("tab in Results — an auto-generated report and a chat to ask questions about a run. TEMPO uses your own API key and never provides one. Your key is stored encrypted on this device.")}
      </p>

      {!desktop && (
        <div className="mb-5 flex items-start gap-2 p-3 bg-gray-50 border border-black/15 rounded-xl text-sm text-gray-700">
          <FiAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {tr("Model Advisor is only available in the TEMPO desktop app.")}
        </div>
      )}

      {/* Privacy disclaimer */}
      {meta.local ? (
        <div className="mb-5 flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 max-w-2xl">
          <FiShield className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {meta.label} {tr("runs on your own hardware — model data goes only to your Ollama server, never to a third-party service.")}
          </span>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 max-w-2xl">
          <FiShield className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {tr("Using this feature sends your selected run's results to your chosen LLM provider (")}{meta.label}{tr("). This is the only case where TEMPO transmits model data off this device. Review the provider's data-handling terms before use.")}
          </span>
        </div>
      )}

      <div className="space-y-5 max-w-md">
        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{tr("Provider")}</label>
          <Select
            value={cfg.provider}
            onChange={changeProvider}
            options={AI_PROVIDERS.map(p => ({
              value: p.id,
              label: p.label,
              description: [
                p.local ? tr("Runs on your own hardware · no key needed")
                  : p.needsBaseUrl ? tr("Your own endpoint URL")
                  : tr("Cloud · API key required"),
                p.defaultModel ? `default ${p.defaultModel}` : null,
              ].filter(Boolean).join(' · '),
            }))}
          />
        </div>

        {/* Base URL (compatible + Ollama) */}
        {meta.needsBaseUrl && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{meta.local ? tr("Ollama server URL") : tr("Base URL")}</label>
            <input
              type="text"
              value={cfg.baseUrl}
              onChange={(e) => updateCfg({ baseUrl: e.target.value })}
              placeholder={meta.local ? 'http://192.168.1.50:11434' : 'https://openrouter.ai/api/v1'}
              className="w-full h-10 px-3 border border-black/15 bg-white rounded-lg font-mono text-sm focus:outline-none focus:border-black/15 focus:ring-2 focus:ring-slate-200"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              {meta.local
                ? tr("Where Ollama is running. Leave blank for localhost; use the host machine’s IP:11434 when Ollama runs on another computer.")
                : tr("Any OpenAI-compatible endpoint (OpenRouter, Azure, a local server).")}
            </p>
          </div>
        )}

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{tr("Model")}</label>
          <input
            type="text"
            value={cfg.model}
            onChange={(e) => updateCfg({ model: e.target.value })}
            placeholder={meta.defaultModel || tr("model id")}
            className="w-full h-10 px-3 border border-black/15 bg-white rounded-lg font-mono text-sm focus:outline-none focus:border-black/15 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {/* API key (remote providers) / local connection note (Ollama) */}
        {meta.needsKey === false ? (
          <div className="rounded-md border border-black/15 bg-slate-50 p-3 text-xs text-slate-600">
            {tr("No API key needed — TEMPO connects to your Ollama server at")}
            <span className="font-mono text-slate-500"> {cfg.baseUrl || 'http://localhost:11434'}</span>{tr(". Make sure Ollama is running there and the model above is pulled (")}<span className="font-mono text-slate-500">{tr("ollama pull")} {cfg.model || meta.defaultModel}</span>).
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {tr("API key")}
              {hasKey && <span className="ml-2 text-xs text-gray-600 font-normal"><FiCheckCircle className="inline w-3.5 h-3.5" /> {tr("stored")}</span>}
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={hasKey ? tr("•••••••• (a key is stored)") : tr("Paste your API key")}
                className="flex-1 h-10 px-3 border border-black/15 bg-white rounded-lg font-mono text-sm focus:outline-none focus:border-black/15 focus:ring-2 focus:ring-slate-200"
              />
              <button type="button" onClick={() => setShowKey(v => !v)} className="px-3 py-2 text-xs font-medium text-slate-500 border border-black/15 rounded-md hover:bg-slate-50">
                {showKey ? tr("Hide") : tr("Show")}
              </button>
            </div>
            {meta.keysUrl && (
              <p className="text-xs text-slate-400 mt-1.5">
                {tr("Get a key at")} <span className="font-mono text-slate-500">{meta.keysUrl}</span>{tr(". Stored encrypted on this device.")}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {meta.needsKey !== false && (
            <button
              onClick={saveKey}
              disabled={!desktop || !keyInput.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {tr("Save key")}
            </button>
          )}
          <button
            onClick={testConnection}
            disabled={!desktop || testing || (!hasKey && meta.needsKey !== false)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-black/15 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing
              ? <><span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> {tr("Testing…")}</>
              : <><FiRefreshCw className="w-4 h-4" /> {meta.needsKey === false ? tr("Test connection") : tr("Test key")}</>}
          </button>
          {hasKey && (
            <button onClick={clearKey} disabled={!desktop} className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
              {tr("Remove key")}
            </button>
          )}
          {saved && <span className="text-xs text-gray-600 flex items-center gap-1"><FiCheckCircle className="w-3.5 h-3.5" /> {tr("Saved")}</span>}
        </div>

        {/* Test result */}
        {testResult && (
          <div className="rounded-xl border p-3 text-sm bg-gray-50 border-black/15 text-gray-700">
            {testResult.ok ? (
              <div className="flex items-start gap-2">
                <FiCheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{meta.needsKey === false ? tr("Connection works") : tr("Key works")}{tr(". Model replied:")} <span className="font-mono">{testResult.sample || tr("ok")}</span></span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="break-all">{testResult.error}</span>
                </div>
                {meta.local && (
                  <div className="mt-1 pt-2 border-t border-black/15 text-xs text-slate-500">
                    <p className="font-medium text-slate-600 mb-1">{tr("Can’t reach Ollama? On the machine running it, check:")}</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>{tr("Port is published —")} <span className="font-mono">{tr("docker ps")}</span> {tr("shows")} <span className="font-mono">{tr("0.0.0.0:11434->11434/tcp")}</span> {tr("(else run with")} <span className="font-mono">-p 11434:11434</span>).</li>
                      <li>{tr("Reachable from here —")} <span className="font-mono">{tr("curl")} {cfg.baseUrl || 'http://localhost:11434'}{tr("/api/tags")}</span> {tr("lists your models.")}</li>
                      <li>{tr("Firewall allows inbound TCP")} <span className="font-mono">11434</span> {tr("on that host.")}</li>
                      <li>{tr("Model is pulled —")} <span className="font-mono">{tr("ollama pull")} {cfg.model || meta.defaultModel}</span>.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
    { label: tr("TEMPO version"),  value: version ? `v${version}` : '—' },
    { label: tr("Calliope core"),  value: '0.6.8' },
    { label: tr("Optional engines"), value: 'Calliope 0.7 · PyPSA · OSeMOSYS · AdOpT-NET0' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-black/15 bg-white ">
          <img src={tempoLogo} alt="" className="h-9 w-9 object-contain" style={{ mixBlendMode: 'multiply' }} />
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-900">{tr("TEMPO")}</div>
          <p className="text-sm text-slate-500">{tr("Tool for Energy Model Preparation and Optimization. All model data is stored locally on this device.")}</p>
        </div>
        {window.electronAPI?.updates && (
          <button onClick={requestUpdateCheck}
            className="ml-auto flex h-10 shrink-0 items-center gap-2 border border-black/15 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FiRefreshCw size={15} /> {tr("Check for updates")}
          </button>
        )}
      </div>
      <dl className="divide-y divide-black/10 rounded-xl border border-black/15">
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

const SECTIONS = [
  { id: 'general', label: tr("General"),              icon: LuSlidersHorizontal, hint: tr("Startup and saving") },
  { id: 'engines', label: tr("Optimization Engines"), icon: LuCpu,               hint: tr("Install and manage solvers") },
  { id: 'remote',  label: tr("Remote Execution"),     icon: LuServer,            hint: tr("Run on a MEME server") },
  { id: 'ai',      label: tr("Model Advisor"),        icon: LuMessageSquare,     hint: tr("AI provider and API key") },
  { id: 'data',    label: tr("Privacy & Data"),       icon: LuShield,            hint: tr("Local data and consent") },
  { id: 'about',   label: tr("About"),                icon: LuInfo,              hint: tr("Version information") },
];

const Settings = () => {
  const t = useT();
  const [activeSection, setActiveSection] = useState('general');
  const [clearing, setClearing]       = useState(false);
  const [clearResult, setClearResult] = useState(null); // null | { success, deleted? }
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClearAll = async () => {
    setConfirmOpen(false);
    if (!window.electronAPI?.clearAllData) {
      setClearResult({ success: false, error: tr("Not available in browser mode.") });
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
    <div className="flex-1 bg-gray-50 px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('settings.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="shrink-0 space-y-1 lg:sticky lg:top-8 lg:w-64">
          {SECTIONS.map((section) => {
            const active = activeSection === section.id;
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                  active ? 'bg-white  ring-1 ring-slate-200' : 'hover:bg-white/70'
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-black text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-700'}`}>{section.id === 'general' ? t('settings.section.general') : section.label}</span>
                  <span className="block truncate text-[11px] text-slate-400">{section.id === 'general' ? t('settings.section.generalHint') : section.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* All sections stay mounted so in-progress installs survive section switches */}
        <div className="min-w-0 flex-1 rounded-2xl border border-black/15 bg-white p-8 ">
          {/* General */}
          <div className={activeSection === 'general' ? '' : 'hidden'}>
            <GeneralPanel />
          </div>

          {/* Optimization Engines */}
          <div className={activeSection === 'engines' ? '' : 'hidden'}>
            <p className="text-sm text-slate-500 mb-4">
              {tr("Install and manage the optimisation engines TEMPO can run models on. Expand a row for details, installation, and logs.")}
            </p>
            <div className="space-y-3">
              <EngineAccordion title={tr("Calliope 0.6.8")} icon={FiBox} badge={tr("Core")} checkFn="checkCalliopeEnv" defaultOpen>
                {(onInstalled) => <PythonEnvironmentPanel embedded onInstallSuccess={onInstalled} />}
              </EngineAccordion>

              <EngineAccordion title={tr("Calliope 0.7")} icon={FiZap} badge={tr("Experimental")} checkFn="checkCalliope07Env">
                {(onInstalled) => <Calliope07EnginePanel embedded onInstallSuccess={onInstalled} />}
              </EngineAccordion>

              <EngineAccordion title={tr("PyPSA")} icon={FiCpu} badge={tr("Optional")} checkFn="checkPypsaEnv">
                {(onInstalled) => (
                  <EngineInstallPanel
                    embedded
                    title={tr("PyPSA Engine")}
                    icon={FiCpu}
                    description={tr("Python for Power System Analysis, in its own isolated Python environment. Any TEMPO model can run on it — the translation from TEMPO's internal representation happens automatically at run time. Also enables PyPSA model import/export. Requires Python 3.10+.")}
                    checkFn="checkPypsaEnv"
                    installFn="installPypsaEnv"
                    onProgressFn="onPypsaInstallProgress"
                    onInstallSuccess={onInstalled}
                  />
                )}
              </EngineAccordion>

              <EngineAccordion title={tr("OSeMOSYS")} icon={FiZap} badge={tr("Optional")} checkFn="checkOsemosysEnv">
                {(onInstalled) => (
                  <EngineInstallPanel
                    embedded
                    title={tr("OSeMOSYS Engine")}
                    icon={FiZap}
                    description={tr("Open Source Energy Modelling System (via otoole + GLPK), in its own isolated Python environment. Hourly time series are aggregated into configurable timeslices at run time. Also enables OSeMOSYS dataset import/export. Requires Python 3.10+; the GLPK solver is bundled on Windows.")}
                    checkFn="checkOsemosysEnv"
                    installFn="installOsemosysEnv"
                    onProgressFn="onOsemosysInstallProgress"
                    onInstallSuccess={onInstalled}
                  />
                )}
              </EngineAccordion>

              <EngineAccordion title={tr("AdOpT-NET0")} icon={FiBox} badge={tr("Optional")} checkFn="checkAdoptnet0Env">
                {(onInstalled) => (
                  <EngineInstallPanel
                    embedded
                    title={tr("AdOpT-NET0 Engine")}
                    icon={FiBox}
                    description={tr("Advanced Optimization Tool for Energy Networks, in its own isolated Python environment. Any TEMPO model can run on it — the translation happens automatically at run time. Also enables AdOpT-NET0 model import/export. Requires Python 3.10+.")}
                    checkFn="checkAdoptnet0Env"
                    installFn="installAdoptnet0Env"
                    onProgressFn="onAdoptnet0InstallProgress"
                    onInstallSuccess={onInstalled}
                  />
                )}
              </EngineAccordion>
            </div>
          </div>

          {/* Remote Execution */}
          <div className={activeSection === 'remote' ? '' : 'hidden'}>
            <RemoteExecutionPanel />
          </div>

          {/* AI Assistant */}
          <div className={activeSection === 'ai' ? '' : 'hidden'}>
            <AIPanel />
          </div>

          {/* Privacy & Data */}
          <div className={activeSection === 'data' ? '' : 'hidden'}>
            <h3 className="mb-1 text-lg font-semibold text-slate-900">{tr("Privacy & Data")}</h3>
            <p className="mb-6 text-sm text-slate-500">{tr("TEMPO stores all model data locally on this device. To look for updates it contacts GitHub (api.github.com) and sends no model data; turn this off under General.")}</p>

            <div className="rounded-xl border border-red-200 bg-red-50/40">
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="max-w-xl">
                  <div className="text-sm font-semibold text-red-700">{tr("Danger zone · clear all data")}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
                    {tr("Permanently delete all locally stored data — models, exports and the privacy consent record. This cannot be undone.")}
                  </p>
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={clearing}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white  transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {clearing ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {tr("Clearing…")}
                    </>
                  ) : (
                    <><LuTrash2 size={15} /> {tr("Clear all data")}</>
                  )}
                </button>
              </div>
              {clearResult && (
                <div className="border-t border-red-200 px-5 py-3 text-sm text-slate-700">
                  {clearResult.success
                    ? tr("Data cleared successfully. Removed: {0}.", { 0: (clearResult.deleted || []).join(', ') || 'nothing to remove' })
                    : tr("Error: {0}", { 0: clearResult.error || tr("Unknown error") })}
                </div>
              )}
            </div>
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-black/15">
            <div className="flex items-center gap-3 p-6 border-b border-black/10">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
                <LuTrash2 size={17} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{tr("Clear all data?")}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{tr("This action cannot be undone")}</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-600">
                {tr("All models, exports, and the privacy consent record stored on this device will be permanently deleted. TEMPO will restart clean on next launch.")}
              </p>
            </div>
            <div className="p-6 pt-0 flex gap-2 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 border border-black/15 hover:bg-slate-50 transition-colors"
              >
                {tr("Cancel")}
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700  transition-colors"
              >
                {tr("Yes, delete everything")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

