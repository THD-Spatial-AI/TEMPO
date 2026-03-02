import React, { useState, useEffect, useRef } from 'react';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiTerminal, FiRefreshCw } from 'react-icons/fi';

/**
 * SetupScreen
 * Shown on first launch when the Calliope environment is missing.
 * The app handles everything automatically:
 *   1. Downloads Miniconda if conda is not installed
 *   2. Creates the "calliope" conda env with Calliope + HiGHS solver
 * The user never needs to run any commands.
 */
export default function SetupScreen({ onComplete }) {
  // 'checking' | 'installing' | 'done' | 'error'
  const [phase, setPhase] = useState('checking');
  const [stageLabel, setStageLabel] = useState('Preparing...');
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logEndRef = useRef(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []);

  const appendLog = (line) => setLogs(prev => [...prev, line]);

  const startInstall = () => {
    setPhase('installing');
    setStageLabel('Starting setup...');
    setLogs([]);
    setErrorMsg('');

    if (!window.electronAPI) {
      setPhase('done');
      setTimeout(onComplete, 800);
      return;
    }

    const unsub = window.electronAPI.onInstallProgress((data) => {
      if (data.type === 'log') {
        appendLog(data.line);
      } else if (data.type === 'stage') {
        setStageLabel(data.label);
        appendLog('\u25ba ' + data.label);
      } else if (data.type === 'done') {
        appendLog('\u2713 Setup complete!');
        setPhase('done');
        if (unsub) unsub();
        unsubRef.current = null;
        setTimeout(onComplete, 1500);
      } else if (data.type === 'error') {
        appendLog('\u2717 ' + data.error);
        setErrorMsg(data.error);
        setPhase('error');
        if (unsub) unsub();
        unsubRef.current = null;
      }
    });
    unsubRef.current = unsub;

    window.electronAPI.installCalliope();
  };

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

  if (phase === 'checking') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Checking environment...</h2>
        <p className="mt-2 text-slate-500">Please wait while we verify your system.</p>
      </FullScreenCard>
    );
  }

  if (phase === 'installing') {
    return (
      <FullScreenCard wide>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Setting up the environment</h2>
        <p className="mt-1 text-slate-500 text-center">{stageLabel}</p>
        <p className="mt-1 text-xs text-slate-400 text-center max-w-lg">
          The app is installing everything it needs. This only happens once and may take a few minutes.
          Please keep the window open.
        </p>

        <div className="mt-6 w-full max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <FiTerminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Installation log</span>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed">
            {logs.length === 0
              ? <span className="text-slate-500">Starting...</span>
              : logs.map((line, i) => <div key={i}>{line}</div>)
            }
            <div ref={logEndRef} />
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Installing: Miniconda (if needed) &middot; Python 3.9 &middot; Calliope &middot; HiGHS solver &middot; Pyomo
        </p>
      </FullScreenCard>
    );
  }

  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <FiCheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Ready!</h2>
        <p className="mt-2 text-slate-500">Environment set up successfully. Opening the app...</p>
      </FullScreenCard>
    );
  }

  if (phase === 'error') {
    return (
      <FullScreenCard wide>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Setup failed</h2>
        <p className="mt-2 text-slate-500 max-w-md text-center text-sm">
          {errorMsg || 'An unexpected error occurred. Check the log below.'}
        </p>
        <p className="mt-1 text-xs text-slate-400 text-center max-w-md">
          Make sure you have an active internet connection and try again.
        </p>

        {logs.length > 0 && (
          <div className="mt-4 w-full max-w-2xl">
            <div className="bg-slate-900 rounded-xl p-4 h-40 overflow-y-auto font-mono text-xs text-red-400 leading-relaxed">
              {logs.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}

        <button
          onClick={startInstall}
          className="mt-6 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
        >
          <FiRefreshCw className="w-4 h-4" />
          Retry
        </button>
      </FullScreenCard>
    );
  }

  return null;
}

function FullScreenCard({ children, wide }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-8">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>
      <div className={`relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-10 flex flex-col items-center ${wide ? 'max-w-2xl w-full' : 'max-w-md w-full'}`}>
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full text-blue-600 text-xs font-semibold tracking-wide mb-4">
            CALLIOPE VISUALIZATOR &middot; FIRST-TIME SETUP
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
