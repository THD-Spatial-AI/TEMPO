import React, { useState, useEffect, useRef } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiTerminal, FiRefreshCw, FiClock } from 'react-icons/fi';

// ── Step definitions ──────────────────────────────────────────────────────────
const STEPS = [
  { id: 'conda',   label: 'Detect / install conda',           hint: 'Checking for Miniconda/Anaconda on your system' },
  { id: 'env',     label: 'Create calliope environment',       hint: 'conda create -n calliope python=3.9 calliope …' },
  { id: 'verify',  label: 'Verify installation',               hint: 'import calliope, highspy' },
];

function stepStateFromLabel(label = '') {
  const l = label.toLowerCase();
  if (l.includes('miniconda') || l.includes('conda'))     return 'conda';
  if (l.includes('calliope') || l.includes('highs'))      return 'env';
  if (l.includes('verif'))                                 return 'verify';
  return null;
}

// ── Status icon ───────────────────────────────────────────────────────────────
function StepIcon({ status }) {
  if (status === 'done')    return <FiCheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
  if (status === 'error')   return <FiAlertCircle  className="w-5 h-5 text-red-500 flex-shrink-0" />;
  if (status === 'running') return <FiLoader       className="w-5 h-5 text-blue-500 flex-shrink-0 animate-spin" />;
  // pending
  return <FiClock className="w-5 h-5 text-slate-300 flex-shrink-0" />;
}

/**
 * SetupScreen
 * Shows a numbered task list + live console log during first-time setup.
 * All installation steps happen automatically — the user never types anything.
 */
export default function SetupScreen({ onComplete }) {
  // 'checking' | 'installing' | 'done' | 'error'
  const [phase, setPhase] = useState('checking');
  const [currentStepId, setCurrentStepId] = useState(null);
  // Per-step status: 'pending' | 'running' | 'done' | 'error'
  const [stepStatus, setStepStatus] = useState({ conda: 'pending', env: 'pending', verify: 'pending' });
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logEndRef = useRef(null);
  const unsubRef  = useRef(null);

  // Auto-scroll log panel
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []);

  const appendLog = (line) =>
    setLogs(prev => [...prev, { text: line, ts: new Date().toLocaleTimeString('en', { hour12: false }) }]);

  const markStep = (id, status) =>
    setStepStatus(prev => ({ ...prev, [id]: status }));

  // ── startInstall ─────────────────────────────────────────────────────────
  const startInstall = () => {
    setPhase('installing');
    setStepStatus({ conda: 'running', env: 'pending', verify: 'pending' });
    setCurrentStepId('conda');
    setLogs([]);
    setErrorMsg('');

    if (!window.electronAPI) {
      // Browser mode — nothing to install
      setPhase('done');
      setTimeout(onComplete, 800);
      return;
    }

    const unsub = window.electronAPI.onInstallProgress((data) => {
      if (data.type === 'log') {
        appendLog(data.line);

      } else if (data.type === 'stage') {
        appendLog('▶ ' + data.label);
        const sid = stepStateFromLabel(data.label);
        if (sid) {
          setCurrentStepId(prev => {
            // Mark previous step done
            if (prev && prev !== sid) markStep(prev, 'done');
            return sid;
          });
          markStep(sid, 'running');
        }

      } else if (data.type === 'done') {
        appendLog('✓ All done!');
        // Mark all steps done
        setStepStatus({ conda: 'done', env: 'done', verify: 'done' });
        setPhase('done');
        if (unsub) unsub();
        unsubRef.current = null;
        setTimeout(onComplete, 1800);

      } else if (data.type === 'error') {
        appendLog('✗ ' + data.error);
        setErrorMsg(data.error);
        // Mark current step as errored
        setCurrentStepId(prev => {
          if (prev) markStep(prev, 'error');
          return prev;
        });
        setPhase('error');
        if (unsub) unsub();
        unsubRef.current = null;
      }
    });
    unsubRef.current = unsub;

    window.electronAPI.installCalliope();
  };

  // ── On mount: check then auto-install if missing ──────────────────────────
  useEffect(() => {
    if (!window.electronAPI) {
      onComplete();
      return;
    }
    window.electronAPI.checkCalliope()
      .then(status => {
        if (status.envExists) {
          onComplete();
        } else {
          startInstall();
        }
      })
      .catch(() => startInstall());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Checking spinner ──────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Checking environment…</h2>
        <p className="mt-2 text-slate-500 text-sm">Scanning for conda installation, won't take long.</p>
      </FullScreenCard>
    );
  }

  // ── Installing ────────────────────────────────────────────────────────────
  if (phase === 'installing') {
    return (
      <FullScreenCard wide>
        <div className="w-full flex flex-col items-center">
          <div className="mb-6 text-center">
            <SpinnerIcon />
            <h2 className="mt-4 text-2xl font-semibold text-slate-800">Setting up your environment</h2>
            <p className="mt-1 text-slate-500 text-sm">
              This only happens once. Please keep the window open.
            </p>
          </div>

          {/* Step list */}
          <div className="w-full max-w-lg mb-6 space-y-3">
            {STEPS.map((step, idx) => {
              const st = stepStatus[step.id];
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-300 ${
                    st === 'running' ? 'border-blue-200 bg-blue-50' :
                    st === 'done'    ? 'border-emerald-200 bg-emerald-50' :
                    st === 'error'   ? 'border-red-200 bg-red-50' :
                    'border-slate-100 bg-slate-50'
                  }`}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5
                    bg-slate-200 text-slate-600">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${
                      st === 'running' ? 'text-blue-700' :
                      st === 'done'    ? 'text-emerald-700' :
                      st === 'error'   ? 'text-red-700' :
                      'text-slate-500'
                    }`}>{step.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{step.hint}</p>
                  </div>
                  <StepIcon status={st} />
                </div>
              );
            })}
          </div>

          {/* Live log */}
          <div className="w-full max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <FiTerminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Console output</span>
              <span className="ml-auto text-xs text-slate-300">{logs.length} lines</span>
            </div>
            <div className="bg-slate-950 rounded-xl p-4 h-52 overflow-y-auto font-mono text-xs leading-relaxed">
              {logs.length === 0
                ? <span className="text-slate-600">Starting…</span>
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

          <p className="mt-4 text-xs text-slate-400">
            Installing: Python 3.9 · Calliope · HiGHS solver · Pyomo
          </p>
        </div>
      </FullScreenCard>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <FiCheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Ready!</h2>
        <p className="mt-2 text-slate-500 text-sm">Environment set up. Opening the app…</p>
      </FullScreenCard>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <FullScreenCard wide>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Setup failed</h2>
        <p className="mt-2 text-slate-500 max-w-md text-center text-sm">
          {errorMsg || 'An unexpected error occurred during installation.'}
        </p>
        <p className="mt-1 text-xs text-slate-400 text-center max-w-md">
          Make sure you have an active internet connection and enough disk space (~3 GB), then retry.
        </p>

        {logs.length > 0 && (
          <div className="mt-5 w-full max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <FiTerminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Last console output</span>
            </div>
            <div className="bg-slate-950 rounded-xl p-4 h-40 overflow-y-auto font-mono text-xs text-red-400 leading-relaxed">
              {logs.slice(-40).map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-600 select-none flex-shrink-0">{l.ts}</span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={startInstall}
          className="mt-6 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
        >
          <FiRefreshCw className="w-4 h-4" />
          Retry setup
        </button>
      </FullScreenCard>
    );
  }

  return null;
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
            CALLIOPE VISUALIZATOR · FIRST-TIME SETUP
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

