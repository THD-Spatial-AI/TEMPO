import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiTerminal, FiRefreshCw, FiClock, FiPlay, FiBox, FiDownload } from './ui/icons';
import ComponentInstaller from './ComponentInstaller';

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
          localhost:{svc.port}
          {svc.required && <span className="ml-2 text-gray-400">required</span>}
          {!svc.required && !svc.installed && !svc.running && <span className="ml-2 text-gray-400">not installed</span>}
          {svc.portConflict && <span className="ml-2 text-gray-500">port used by another application</span>}
        </p>
      </div>
      {(svc.required || svc.installed || svc.running) && <ServiceIcon running={svc.running} healthy={svc.healthy} />}
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
  const [reinstall, setReinstall] = useState(false); // user chose Reinstall after a failed start
  const logEndRef = useRef(null);
  const unsubRef  = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => () => { unsubRef.current?.(); }, []);

  const appendLog = (line) =>
    setLogs(prev => [...prev, { text: line, ts: new Date().toLocaleTimeString('en', { hour12: false }) }]);

  // ── Start services ────────────────────────────────────────────────────────
  const startServices = useCallback((options) => {
    setPhase('starting');
    setLogs([]);
    setErrorMsg('');

    const unsub = window.electronAPI.onDockerStartProgress((data) => {
      if (data.type === 'log')   appendLog(data.line);
      if (data.type === 'stage') appendLog('▶ ' + data.label);
      if (data.type === 'done') {
        if (unsub) unsub();
        unsubRef.current = null;
        // Re-check status after services start
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
              setErrorMsg(data.failures?.join(' · ') || 'Some required services are still not running.');
            }
          } catch { setPhase('error'); }
        }, 500);
      }
    });
    unsubRef.current = unsub;
    window.electronAPI.startAllDockerServices(options);
  }, [onComplete]);

  // ── Initial check ─────────────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    setPhase('checking');
    if (!window.electronAPI) { onComplete(); return; }

    try {
      // ── Fresh install: ALWAYS show the install UI, never auto-skip ──────────
      // Even if the old env is healthy and services are still running from a
      // previous installation, a fresh install must go through the full wizard
      // so the user can choose what to install.
      if (freshInstall) {
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

      // Native mode: backend + calliope service are both up (no Docker needed).
      // envExists must also be true — the port being open from a PREVIOUS broken
      // install is not sufficient; the venv packages must be actually healthy.
      if (serviceURLs?.backend?.running && serviceURLs?.calliope?.running && calliopeEnv.envExists) {
        setPhase('done');
        setTimeout(onComplete, 600);
        return;
      }

      // Docker mode: all required services running
      if ((dockerResult.services || []).filter(s => s.required).every(s => s.running)) {
        setPhase('done');
        setTimeout(onComplete, 600);
        return;
      }

      // Venv installed but the service isn't up (still booting, or it died): start it.
      if (calliopeEnv.envExists) {
        startServices({ nativeOnly: true });
        return;
      }

      // No working venv (new machine, uninstalled, or broken): offer the install.
      setPhase('native-needs-install');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err.message || 'Failed to check services.');
    }
  }, [onComplete, freshInstall, startServices]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // ── Renders ───────────────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">Checking services…</h2>
        <p className="mt-2 text-slate-500 text-sm">Verifying TEMPO services</p>
      </FullScreenCard>
    );
  }

  if (phase === 'native-needs-install') {
    return (
      <FullScreenCard wide>
        <h2 className="text-2xl font-black tracking-tighter text-black">Set up TEMPO</h2>
        <p className="mt-2 mb-6 text-gray-500 text-sm text-center max-w-md">
          Choose what to install. Required components are always included.
          An internet connection is needed, and TEMPO downloads Python if it is missing.
        </p>
        <ComponentInstaller
          forceIds={reinstall ? ['calliope'] : []}
          onFinished={() => { setPhase('done'); setTimeout(onComplete, 800); }}
          extraActions={(
            <>
              {dockerAvailable && (
                <button
                  onClick={() => startServices()}
                  className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
                >
                  <FiPlay className="w-4 h-4" /> Use Docker
                </button>
              )}
              <button
                onClick={onComplete}
                className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
              >
                Skip for now
              </button>
            </>
          )}
        />
      </FullScreenCard>
    );
  }

  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
          <FiCheckCircle className="w-8 h-8 text-gray-700" />
        </div>
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">All services running</h2>
        <p className="mt-2 text-slate-500 text-sm">Opening TEMPO…</p>
      </FullScreenCard>
    );
  }

  if (phase === 'error') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="mt-6 text-2xl font-black tracking-tighter text-black">Cannot start services</h2>
        <p className="mt-3 text-slate-500 text-sm text-center max-w-sm">{errorMsg}</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={checkStatus}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity"
          >
            <FiRefreshCw className="w-4 h-4" /> Retry
          </button>
          <button
            onClick={onComplete}
            className="flex items-center gap-2 px-5 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
          >
            Continue Anyway
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
            {phase === 'starting' ? 'Starting services…' : 'Services not running'}
          </h2>
          <p className="mt-1 text-slate-500 text-sm">
            {phase === 'starting'
              ? 'This can take a minute — please wait'
              : 'Some required TEMPO services need to be started'}
          </p>
          {errorMsg && (
            <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
          )}
        </div>

        {/* Service list */}
        <div className="w-full max-w-lg mb-6 space-y-2">
          {services.map(svc => <ServiceRow key={svc.name} svc={svc} />)}
        </div>

        {/* Log panel (kept after a failed start so the errors stay readable) */}
        {(phase === 'starting' || logs.length > 0) && (
          <div className="w-full max-w-2xl mb-4">
            <div className="flex items-center gap-2 mb-2">
              <FiTerminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Start-up output</span>
            </div>
            <div className="bg-slate-950 rounded-xl p-4 h-44 overflow-y-auto font-mono text-xs leading-relaxed">
              {logs.length === 0
                ? <span className="text-slate-600">Waiting for output…</span>
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
                onClick={() => startServices()}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80 transition-opacity duration-200"
              >
                <FiPlay className="w-4 h-4" /> Start Services
              </button>
              <button
                onClick={onComplete}
                className="flex items-center gap-2 px-6 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors duration-200"
              >
                Continue Anyway
              </button>
              {errorMsg && (
                <button
                  onClick={() => { setReinstall(true); setErrorMsg(''); setPhase('native-needs-install'); }}
                  className="flex items-center gap-2 px-6 py-3 border border-black text-black text-sm font-bold uppercase tracking-wide hover:bg-black hover:text-white transition-colors duration-200"
                >
                  <FiDownload className="w-4 h-4" /> Reinstall
                </button>
              )}
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
          Powered by Docker Desktop · OpenModelica · Calliope · GeoServer
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
            TEMPO · FIRST-TIME SETUP
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <div className="w-16 h-16 bg-surface-container flex items-center justify-center">
      <FiLoader className="w-8 h-8 text-gray-500 animate-spin" />
    </div>
  );
}
