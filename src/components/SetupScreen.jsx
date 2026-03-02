import React, { useState, useEffect, useRef } from 'react';
import { FiDownload, FiCheckCircle, FiAlertCircle, FiLoader, FiTerminal, FiRefreshCw } from 'react-icons/fi';

/**
 * SetupScreen
 * Shown on first launch when the Calliope conda environment is missing.
 * - If conda is not installed → shows download link for Miniconda.
 * - If conda is installed but env is missing → auto-installs the env.
 * Calls onComplete() when the env is ready.
 */
export default function SetupScreen({ onComplete }) {
  // 'checking' | 'no-conda' | 'installing' | 'done' | 'error'
  const [phase, setPhase] = useState('checking');
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logEndRef = useRef(null);
  const unsubRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const appendLog = (line) => setLogs(prev => [...prev, line]);

  const startInstall = () => {
    setPhase('installing');
    setLogs([]);
    setErrorMsg('');

    if (!window.electronAPI) {
      setPhase('done');
      onComplete();
      return;
    }

    // Subscribe to streaming progress
    const unsub = window.electronAPI.onInstallProgress((data) => {
      if (data.type === 'log') {
        appendLog(data.line);
      } else if (data.type === 'done') {
        appendLog('✓ Installation complete.');
        setPhase('done');
        if (unsub) unsub();
        unsubRef.current = null;
        setTimeout(onComplete, 1200);
      } else if (data.type === 'error') {
        appendLog(`✗ Error: ${data.error}`);
        setErrorMsg(data.error);
        setPhase('error');
        if (unsub) unsub();
        unsubRef.current = null;
      }
    });
    unsubRef.current = unsub;

    // Trigger the install (resolves when complete/error)
    window.electronAPI.installCalliope().then(result => {
      if (!result.success && phase !== 'error') {
        setErrorMsg(result.error || 'Installation failed.');
        setPhase('error');
      }
    });
  };

  const checkAndProceed = () => {
    if (!window.electronAPI) {
      // Not in Electron (browser dev mode) — skip setup
      onComplete();
      return;
    }

    setPhase('checking');
    window.electronAPI.checkCalliope().then(status => {
      if (status.envExists) {
        // Already installed — go straight in
        onComplete();
      } else if (!status.condaFound) {
        setPhase('no-conda');
      } else {
        // conda found, env missing → auto-install
        startInstall();
      }
    }).catch(() => {
      setPhase('no-conda');
    });
  };

  // Run on mount
  useEffect(() => {
    checkAndProceed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render helpers ──────────────────────────────────────────────────────

  const minicondaUrl = process.platform === 'win32'
    ? 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe'
    : process.platform === 'darwin'
      ? 'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh'
      : 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh';

  const openMiniconda = () => {
    if (window.electronAPI) {
      // Open in default browser via shell
      // Use the injected shell.openExternal if available, else href
      window.open(minicondaUrl, '_blank');
    } else {
      window.open(minicondaUrl, '_blank');
    }
  };

  // ── Phase: checking ─────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <FullScreenCard>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Checking environment…</h2>
        <p className="mt-2 text-slate-500">Please wait while we verify your system.</p>
      </FullScreenCard>
    );
  }

  // ── Phase: no conda ─────────────────────────────────────────────────────
  if (phase === 'no-conda') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">conda is required</h2>
        <p className="mt-3 text-slate-500 max-w-md text-center leading-relaxed">
          This app uses conda to manage the Python environment for energy modelling.
          Please install <strong>Miniconda</strong> and then restart the app — it will set everything up automatically.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-xs">
          <button
            onClick={openMiniconda}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
          >
            <FiDownload className="w-5 h-5" />
            Download Miniconda
          </button>

          <button
            onClick={checkAndProceed}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
          >
            <FiRefreshCw className="w-4 h-4" />
            I've installed it — check again
          </button>
        </div>

        <InstallSteps />
      </FullScreenCard>
    );
  }

  // ── Phase: installing ───────────────────────────────────────────────────
  if (phase === 'installing') {
    return (
      <FullScreenCard wide>
        <SpinnerIcon />
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Setting up Calliope…</h2>
        <p className="mt-2 text-slate-500 text-center max-w-lg">
          Installing the Calliope energy modelling environment. This may take a few minutes — please keep the app open.
        </p>

        <div className="mt-6 w-full max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <FiTerminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Installation log</span>
          </div>
          <div className="bg-slate-900 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed">
            {logs.length === 0 && (
              <span className="text-slate-500">Waiting for output…</span>
            )}
            {logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Installing: python 3.9, calliope, coin-or-cbc solver
        </p>
      </FullScreenCard>
    );
  }

  // ── Phase: done ─────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-scaleIn">
          <FiCheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Ready to go!</h2>
        <p className="mt-2 text-slate-500">Calliope has been installed. Opening the app…</p>
      </FullScreenCard>
    );
  }

  // ── Phase: error ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <FullScreenCard wide>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <FiAlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-slate-800">Installation failed</h2>
        <p className="mt-2 text-slate-500 max-w-md text-center">
          {errorMsg || 'An unexpected error occurred during installation.'}
        </p>

        {logs.length > 0 && (
          <div className="mt-6 w-full max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <FiTerminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wide">Log</span>
            </div>
            <div className="bg-slate-900 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-red-400 leading-relaxed">
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={startInstall}
          className="mt-6 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
        >
          <FiRefreshCw className="w-4 h-4" />
          Retry installation
        </button>
      </FullScreenCard>
    );
  }

  return null;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function FullScreenCard({ children, wide }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-8">
      {/* Background accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className={`relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-10 flex flex-col items-center ${wide ? 'max-w-2xl w-full' : 'max-w-md w-full'}`}>
        {/* App branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full text-blue-600 text-xs font-semibold tracking-wide mb-4">
            CALLIOPE VISUALIZATOR
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

function InstallSteps() {
  const steps = [
    'Download and run the Miniconda installer',
    'Accept the default options (install for "Just Me")',
    'After installation completes, restart this app',
    'The app will then install Calliope automatically',
  ];

  return (
    <div className="mt-8 w-full max-w-sm">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Steps</p>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <span className="text-sm text-slate-600">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
