import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiTerminal, FiRefreshCw, FiClock, FiPlay, FiBox, FiDownload, FiZap, FiInfo, FiCpu, FiGlobe, FiArrowRight } from './ui/icons';
import { tr, useT, LANGUAGES, getLanguage, setLanguage } from '../i18n';
import { setSetting } from '../services/appSettings';

// ── Status icon ───────────────────────────────────────────────────────────────
function ServiceIcon({ running, healthy }) {
  if (running && healthy !== false) return <FiCheckCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />;
  if (running && healthy === false)  return <FiAlertCircle  className="w-5 h-5 text-gray-400 flex-shrink-0" />;
  return <FiClock className="w-5 h-5 text-slate-300 flex-shrink-0" />;
}

function ServiceRow({ svc }) {
  const bg = svc.running
    ? svc.healthy === false ? 'border-black/15 bg-surface-container-low' : 'border-black/15 bg-surface-container-low'
    : 'border-black/10 bg-surface';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${bg}`}>
      <FiBox className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${svc.running ? 'text-slate-800' : 'text-slate-400'}`}>
          {svc.label}
        </p>
        <p className="text-xs text-slate-400 font-mono">
          {tr("localhost:")}{svc.port}
          {svc.required && <span className="ml-2 text-gray-400">{tr("required")}</span>}
        </p>
      </div>
      <ServiceIcon running={svc.running} healthy={svc.healthy} />
    </div>
  );
}

/**
 * SetupScreen
 * Checks TEMPO Docker service health on mount.
 * If all required services are up → calls onComplete() immediately.
 * Otherwise shows service status + a "Start Services" button.
 */
export default function SetupScreen({ onComplete, freshInstall = false }) {
  const [phase, setPhase] = useState('checking');  // 'checking' | 'ready' | 'needs-start' | 'starting' | 'done' | 'error'
  const [dockerAvailable, setDockerAvailable] = useState(true);
  const [services, setServices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  // No module selection needed — always install calliope only
  const selectedModules = ['calliope'];
  const [installDemandlib, setInstallDemandlib] = useState(false);
  // Platform from calliope:check (set during initial status check)
  const [platform, setPlatform] = useState('');
  const [langDone, setLangDone] = useState(!freshInstall);
  useT();
  const logEndRef = useRef(null);
  const unsubRef  = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => () => { unsubRef.current?.(); }, []);

  const appendLog = (line) =>
    setLogs(prev => [...prev, { text: line, ts: new Date().toLocaleTimeString('en', { hour12: false }) }]);

  // ── Initial check ─────────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    setPhase('checking');
    if (!window.electronAPI) { onComplete(); return; }

    try {
      // ── Fresh install: ALWAYS show the install UI, never auto-skip ──────────
      // Even if the old env is healthy and services are still running from a
      // previous installation, a fresh install must go through the full wizard
      // so the user can choose modules and we create a brand-new environment.
      if (freshInstall) {
        const calliopeEnv = await window.electronAPI.checkCalliopeEnv()
          .catch(() => ({ envExists: false, serviceRunning: false, platform: '' }));
        if (calliopeEnv.platform) setPlatform(calliopeEnv.platform);
        setPhase('native-needs-install');
        return;
      }

      const [dockerResult, serviceURLs, calliopeEnv] = await Promise.all([
        window.electronAPI.getDockerStatus().catch(() => ({ dockerAvailable: false, services: [] })),
        window.electronAPI.getServiceURLs().catch(() => null),
        window.electronAPI.checkCalliopeEnv().catch(() => ({ envExists: false, serviceRunning: false })),
      ]);

      setDockerAvailable(dockerResult.dockerAvailable);
      setServices(dockerResult.services || []);
      if (calliopeEnv.platform) setPlatform(calliopeEnv.platform);

      // Native mode: backend + calliope service are both up (no Docker needed).
      // envExists must also be true — the port being open from a PREVIOUS broken
      // install is not sufficient; the venv packages must be actually healthy.
      if (serviceURLs?.backend?.running && serviceURLs?.calliope?.running && calliopeEnv.envExists) {
        setPhase('done');
        setTimeout(onComplete, 600);
        return;
      }

      // Docker mode: all required containers running
      if (dockerResult.dockerAvailable) {
        const requiredAll = (dockerResult.services || []).filter(s => s.required).every(s => s.running);
        if (requiredAll) {
          setPhase('done');
          setTimeout(onComplete, 600);
        } else {
          setPhase('needs-start');
        }
        return;
      }

      // No Docker available — offer native venv install as alternative
      if (calliopeEnv.envExists) {
        // Venv is installed. Service should have been autostarted — wait a bit and recheck.
        setPhase('native-starting');
        setTimeout(async () => {
          const urls2 = await window.electronAPI.getServiceURLs().catch(() => null);
          if (urls2?.calliope?.running) {
            setPhase('done');
            setTimeout(onComplete, 600);
          } else {
            // Try restarting the service
            await window.electronAPI.restartCalliopeService().catch(() => {});
            const urls3 = await window.electronAPI.getServiceURLs().catch(() => null);
            if (urls3?.calliope?.running) {
              setPhase('done');
              setTimeout(onComplete, 600);
            } else {
              setPhase('native-needs-install');
            }
          }
        }, 3000);
      } else {
        setPhase('native-needs-install');
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(err.message || tr("Failed to check services."));
    }
  }, [onComplete, freshInstall]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // ── Start services ────────────────────────────────────────────────────────
  const startServices = async () => {
    setPhase('starting');
    setLogs([]);
    setErrorMsg('');

    const unsub = window.electronAPI.onDockerStartProgress((data) => {
      if (data.type === 'log')   appendLog(data.line);
      if (data.type === 'stage') appendLog('▶ ' + data.label);
      if (data.type === 'done') {
        if (unsub) unsub();
        unsubRef.current = null;
        // Re-check status after containers start
        setTimeout(async () => {
          try {
            const result = await window.electronAPI.getDockerStatus();
            setServices(result.services || []);
            const ok = (result.services || []).filter(s => s.required).every(s => s.running);
            if (ok) {
              setPhase('done');
              setTimeout(onComplete, 800);
            } else {
              setPhase('needs-start');
              setErrorMsg(tr("Some required services are still not running. Check Docker logs."));
            }
          } catch { setPhase('error'); }
        }, 2000);
      }
      if (data.type === 'error') {
        appendLog('✗ ' + data.label);
      }
    });
    unsubRef.current = unsub;
    window.electronAPI.startAllDockerServices();
  };

  // ── Native Calliope venv install ──────────────────────────────────────────
  const installNative = async () => {
    setPhase('native-installing');
    setLogs([]);
    setErrorMsg('');
    const unsub = window.electronAPI.onCalliopeInstallProgress((data) => {
      if (data.type === 'log')   appendLog(data.line);
      if (data.type === 'stage') appendLog('▶ ' + data.label);
      if (data.type === 'done') {
        if (unsub) unsub();
        unsubRef.current = null;
        setPhase('done');
        setTimeout(onComplete, 800);
      }
      if (data.type === 'error') {
        appendLog('✗ ' + (data.error || data.label || tr("Install error")));
        setErrorMsg(data.error || tr("Installation failed."));
        setPhase('native-needs-install');
        if (unsub) unsub();
        unsubRef.current = null;
      }
    });
    unsubRef.current = unsub;
    window.electronAPI.installCalliopeEnv(selectedModules, false, installDemandlib);
  };

  // ── Renders ───────────────────────────────────────────────────────────────
  if (!langDone) return <LanguageStep onNext={() => setLangDone(true)} />;

  if (phase === 'checking') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">{tr("Checking services…")}</h2>
        <p className="mt-2 text-slate-500 text-sm">{tr("Verifying TEMPO services")}</p>
      </FullScreenCard>
    );
  }

  if (phase === 'native-starting') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">{tr("Starting Calliope…")}</h2>
        <p className="mt-2 text-slate-500 text-sm">{tr("Launching the energy model service")}</p>
      </FullScreenCard>
    );
  }

  if (phase === 'native-needs-install') {
    const installFailed = !!errorMsg;

    return (
      <FullScreenCard wide>
        <div className="w-14 h-14 bg-white border-2 border-black flex items-center justify-center">
          <FiDownload className="w-7 h-7 text-black" />
        </div>
        <h2 className="mt-5 text-2xl font-black tracking-tighter text-black">{tr("Setup TEMPO")}</h2>
        <p className="mt-2 text-gray-500 text-sm text-center max-w-md">
          {tr("An internet connection and Python 3.9–3.11 are required. Installation takes a few minutes and only needs to run once.")}
        </p>

        {/* What gets installed */}
        <div className="w-full mt-6 border border-black/15 divide-y divide-black/10">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-black">{tr("Calliope")} <span className="font-normal text-gray-400">0.6.8</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{tr("Energy system modelling & optimisation")}</p>
            </div>
            <svg className="w-4 h-4 text-black flex-shrink-0" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-black">{tr("HiGHS solver")}</p>
              <p className="text-xs text-gray-400 mt-0.5">{tr("LP/MIP solver — installed as Python package, no binary needed")}</p>
            </div>
            <svg className="w-4 h-4 text-black flex-shrink-0" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {/* Optional: BDEW load profiles (demandlib). Otherwise installed lazily
              on first use in the OSM Study-Area demand step. */}
          <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
            <div>
              <p className="text-sm font-semibold text-black">{tr("Demand profiles")} <span className="font-normal text-gray-400">{tr("(optional)")}</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{tr("BDEW load profiles (demandlib) for Study-Area demand — else installed on first use")}</p>
            </div>
            <input
              type="checkbox" checked={installDemandlib}
              onChange={e => setInstallDemandlib(e.target.checked)}
              className="w-4 h-4 accent-black flex-shrink-0"
            />
          </label>
        </div>

        {/* Error panel */}
        {installFailed && (
          <div className="mt-4 w-full border border-black rounded-lg p-4 text-xs text-black">
            <p className="font-semibold mb-1">{tr("Installation failed:")}</p>
            <pre className="whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-gray-100 rounded p-2 text-gray-800">{errorMsg}</pre>
            <p className="mt-2 text-gray-500">
              {tr("Requires")} <strong className="text-black">{tr("Python 3.9–3.11")}</strong>.{' '}
              <a href="https://www.python.org/downloads/release/python-3119/"
                 className="underline text-black" target="_blank" rel="noreferrer">{tr("Download Python 3.11")}</a>
              {' '}{tr("— check \"Add Python to PATH\", then click Retry.")}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={installNative}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity"
          >
            <FiDownload className="w-4 h-4" />
            {installFailed ? tr("Retry") : tr("Install")}
          </button>
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
          >
            {tr("Skip")}
          </button>
        </div>
      </FullScreenCard>
    );
  }

  if (phase === 'native-installing') {
    return (
      <FullScreenCard wide>
        <SpinnerIcon />
        <h2 className="mt-4 text-2xl font-black tracking-tighter text-black">{tr("Installing TEMPO services…")}</h2>
        <p className="mt-1 text-slate-500 text-sm">{tr("Creating Python environments and installing packages")}</p>
        <div className="w-full max-w-2xl mt-6">
          <div className="flex items-center gap-2 mb-2">
            <FiTerminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">{tr("Install output")}</span>
          </div>
          <div className="bg-slate-950 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed">
            {logs.length === 0
              ? <span className="text-slate-600">{tr("Starting…")}</span>
              : logs.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-600 select-none flex-shrink-0">{l.ts}</span>
                    <span className={
                      l.text.startsWith('▶') ? 'text-gray-300' :
                      l.text.startsWith('✗') ? 'text-gray-400' :
                      'text-slate-300'
                    }>{l.text}</span>
                  </div>
                ))
            }
            <div ref={logEndRef} />
          </div>
        </div>
      </FullScreenCard>
    );
  }

  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
          <FiCheckCircle className="w-8 h-8 text-gray-700" />
        </div>
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">{tr("All services running")}</h2>
        <p className="mt-2 text-slate-500 text-sm">{tr("Opening TEMPO…")}</p>
      </FullScreenCard>
    );
  }

  if (phase === 'error') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">{tr("Cannot start services")}</h2>
        <p className="mt-3 text-slate-500 text-sm text-center max-w-sm">{errorMsg}</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={checkStatus}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity"
          >
            <FiRefreshCw className="w-4 h-4" /> {tr("Retry")}
          </button>
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
          >
            {tr("Continue Anyway")}
          </button>
        </div>
      </FullScreenCard>
    );
  }

  // needs-start or starting
  return (
    <FullScreenCard wide>
      <div className="w-full flex flex-col items-center">
        <div className="mb-6 text-center">
          {phase === 'starting' ? <SpinnerIcon /> : (
            <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
              <FiPlay className="w-8 h-8 text-gray-700" />
            </div>
          )}
          <h2 className="mt-4 text-2xl font-black tracking-tighter text-black">
            {phase === 'starting' ? tr("Starting services…") : tr("Services not running")}
          </h2>
          <p className="mt-1 text-slate-500 text-sm">
            {phase === 'starting'
              ? tr("Starting Docker containers — please wait")
              : tr("Some required TEMPO services need to be started")}
          </p>
          {errorMsg && (
            <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
          )}
        </div>

        {/* Service list */}
        <div className="w-full max-w-lg mb-6 space-y-2">
          {services.map(svc => <ServiceRow key={svc.name} svc={svc} />)}
        </div>

        {/* Log panel (shown while starting) */}
        {phase === 'starting' && (
          <div className="w-full max-w-2xl mb-4">
            <div className="flex items-center gap-2 mb-2">
              <FiTerminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">{tr("Docker output")}</span>
            </div>
            <div className="bg-slate-950 rounded-xl p-4 h-44 overflow-y-auto font-mono text-xs leading-relaxed">
              {logs.length === 0
                ? <span className="text-slate-600">{tr("Waiting for output…")}</span>
                : logs.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-slate-600 select-none flex-shrink-0">{l.ts}</span>
                      <span className={
                        l.text.startsWith('▶') ? 'text-gray-300' :
                        l.text.startsWith('✓') ? 'text-gray-400' :
                        l.text.startsWith('✗') ? 'text-gray-500' :
                        'text-slate-300'
                      }>{l.text}</span>
                    </div>
                  ))
              }
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {phase === 'needs-start' && (
            <>
              <button
                onClick={startServices}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity duration-200"
              >
                <FiPlay className="w-4 h-4" /> {tr("Start Services")}
              </button>
              <button
                onClick={onComplete}
                className="flex items-center gap-2 px-6 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors duration-200"
              >
                {tr("Continue Anyway")}
              </button>
            </>
          )}
          {phase === 'needs-start' && (
            <button
              onClick={checkStatus}
              className="flex items-center gap-2 px-4 py-3 border border-black/15 text-black/60 hover:border-black hover:text-black transition-colors duration-200"
            >
              <FiRefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          {tr("Powered by Docker Desktop · OpenModelica · Calliope · GeoServer")}
        </p>
      </div>
    </FullScreenCard>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function FullScreenCard({ children, wide }) {
  return (
    <div className="min-h-screen bg-surface grid-bg flex items-center justify-center p-8">
      <div className={`relative bg-surface-container-lowest border border-black/15 p-10 flex flex-col items-center ${wide ? 'max-w-2xl w-full' : 'max-w-md w-full'}`}>
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container text-black text-[10px] font-bold uppercase tracking-widest mb-2">
            {tr("TEMPO · FIRST-TIME SETUP")}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// First step: language
const NAMES = { en: 'English', de: 'German' };
export function LanguageStep({ onNext }) {
  useT();
  const lang = getLanguage();
  return (
    <FullScreenCard>
      <div className="w-14 h-14 bg-white border-2 border-black flex items-center justify-center">
        <FiGlobe className="w-7 h-7 text-black" />
      </div>
      <h2 className="mt-5 text-2xl font-black tracking-tighter text-black">{tr("Choose your language")}</h2>
      <p className="mt-2 text-gray-500 text-sm text-center">{tr("You can change this later in Settings.")}</p>
      <div className="w-full mt-6 border border-black/15 divide-y divide-black/10" role="radiogroup">
        {LANGUAGES.map(({ value, label }) => {
          const active = value === lang;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={active}
              onClick={() => setLanguage(value)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${active ? 'bg-surface-container-low' : 'hover:bg-slate-50'}`}
            >
              <span>
                <span className="block text-sm font-semibold text-black">{label}</span>
                {tr(NAMES[value]) !== label && <span className="block text-xs text-gray-400 mt-0.5">{tr(NAMES[value])}</span>}
              </span>
              <span className={`grid h-4 w-4 place-items-center rounded-full border ${active ? 'border-black' : 'border-black/30'}`}>
                {active && <span className="h-2 w-2 rounded-full bg-black" />}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => { setSetting('languageChosen', true); onNext(); }}
        className="mt-6 flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity"
      >
        {tr("Continue")}
        <FiArrowRight className="w-4 h-4" />
      </button>
    </FullScreenCard>
  );
}

function SpinnerIcon() {
  return (
    <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
      <FiLoader className="w-8 h-8 text-gray-500 animate-spin" />
    </div>
  );
}
