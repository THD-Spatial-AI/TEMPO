import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiTerminal, FiRefreshCw, FiClock, FiPlay, FiBox } from 'react-icons/fi';

// ── Status icon ───────────────────────────────────────────────────────────────
function ServiceIcon({ running, healthy }) {
  if (running && healthy !== false) return <FiCheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
  if (running && healthy === false)  return <FiAlertCircle  className="w-5 h-5 text-yellow-500 flex-shrink-0" />;
  return <FiClock className="w-5 h-5 text-slate-300 flex-shrink-0" />;
}

function ServiceRow({ svc }) {
  const bg = svc.running
    ? svc.healthy === false ? 'border-yellow-200 bg-yellow-50' : 'border-emerald-200 bg-emerald-50'
    : 'border-slate-100 bg-slate-50';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${bg}`}>
      <FiBox className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${svc.running ? 'text-slate-800' : 'text-slate-400'}`}>
          {svc.label}
        </p>
        <p className="text-xs text-slate-400 font-mono">
          localhost:{svc.port}
          {svc.required && <span className="ml-2 text-blue-400">required</span>}
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
export default function SetupScreen({ onComplete }) {
  const [phase, setPhase] = useState('checking');  // 'checking' | 'ready' | 'needs-start' | 'starting' | 'done' | 'error'
  const [dockerAvailable, setDockerAvailable] = useState(true);
  const [services, setServices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
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
      const result = await window.electronAPI.getDockerStatus();
      setDockerAvailable(result.dockerAvailable);
      setServices(result.services || []);

      if (!result.dockerAvailable) {
        setPhase('error');
        setErrorMsg('Docker Desktop is not running. Please start Docker Desktop and relaunch TEMPO.');
        return;
      }

      const requiredAll = (result.services || []).filter(s => s.required).every(s => s.running);
      if (requiredAll) {
        setPhase('done');
        setTimeout(onComplete, 600);
      } else {
        setPhase('needs-start');
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(err.message || 'Failed to check Docker status.');
    }
  }, [onComplete]);

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
              setErrorMsg('Some required services are still not running. Check Docker logs.');
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

  // ── Renders ───────────────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Checking services…</h2>
        <p className="mt-2 text-slate-500 text-sm">Verifying TEMPO Docker containers</p>
      </FullScreenCard>
    );
  }

  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <FiCheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">All services running</h2>
        <p className="mt-2 text-slate-500 text-sm">Opening TEMPO…</p>
      </FullScreenCard>
    );
  }

  if (phase === 'error') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Cannot start services</h2>
        <p className="mt-3 text-slate-500 text-sm text-center max-w-sm">{errorMsg}</p>
        <button
          onClick={checkStatus}
          className="mt-6 flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold shadow hover:bg-blue-600 transition-colors"
        >
          <FiRefreshCw className="w-4 h-4" /> Retry
        </button>
      </FullScreenCard>
    );
  }

  // needs-start or starting
  return (
    <FullScreenCard wide>
      <div className="w-full flex flex-col items-center">
        <div className="mb-6 text-center">
          {phase === 'starting' ? <SpinnerIcon /> : (
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              <FiPlay className="w-8 h-8 text-blue-500" />
            </div>
          )}
          <h2 className="mt-4 text-2xl font-semibold text-slate-800">
            {phase === 'starting' ? 'Starting services…' : 'Services not running'}
          </h2>
          <p className="mt-1 text-slate-500 text-sm">
            {phase === 'starting'
              ? 'Starting Docker containers — please wait'
              : 'Some required TEMPO services need to be started'}
          </p>
          {errorMsg && (
            <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
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
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Docker output</span>
            </div>
            <div className="bg-slate-950 rounded-xl p-4 h-44 overflow-y-auto font-mono text-xs leading-relaxed">
              {logs.length === 0
                ? <span className="text-slate-600">Waiting for output…</span>
                : logs.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-slate-600 select-none flex-shrink-0">{l.ts}</span>
                      <span className={
                        l.text.startsWith('▶') ? 'text-yellow-400' :
                        l.text.startsWith('✓') ? 'text-emerald-400' :
                        l.text.startsWith('✗') ? 'text-red-400' :
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
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
              >
                <FiPlay className="w-4 h-4" /> Start Services
              </button>
              <button
                onClick={onComplete}
                className="flex items-center gap-2 px-6 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all duration-200"
              >
                Continue Anyway
              </button>
            </>
          )}
          {phase === 'needs-start' && (
            <button
              onClick={checkStatus}
              className="flex items-center gap-2 px-4 py-3 border-2 border-slate-200 text-slate-400 rounded-xl hover:bg-slate-50 transition-all duration-200"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-8">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>
      <div className={`relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-10 flex flex-col items-center ${wide ? 'max-w-2xl w-full' : 'max-w-md w-full'}`}>
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full text-blue-600 text-xs font-semibold tracking-wide mb-2">
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
    <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
      <FiLoader className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  );
}
