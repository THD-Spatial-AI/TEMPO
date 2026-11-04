import React, { useState } from 'react';

/**
 * Two-step uninstall for an engine's Python environment. Models and results
 * are stored separately and are not affected.
 */
export default function EngineUninstallButton({ engineId, title, disabled = false, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving]     = useState(false);
  const [error, setError]           = useState('');

  if (!window.electronAPI?.uninstallEngine) return null;

  const handleUninstall = async () => {
    setRemoving(true);
    setError('');
    const result = await window.electronAPI.uninstallEngine(engineId)
      .catch(err => ({ success: false, error: err.message }));
    setRemoving(false);
    setConfirming(false);
    if (result.success) onDone?.();
    else setError(result.error);
  };

  const buttonClass = 'px-5 py-2.5 border-2 border-gray-300 text-gray-800 bg-gray-50 rounded-xl font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm';

  return (
    <div className="mt-3">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-700">Remove {title}? Your models and results are kept.</p>
          <button onClick={handleUninstall} disabled={removing} className={buttonClass}>
            {removing ? 'Removing…' : 'Yes, uninstall'}
          </button>
          <button onClick={() => setConfirming(false)} disabled={removing} className={buttonClass}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} disabled={disabled} className={buttonClass}>Uninstall</button>
      )}
      {error && <p className="mt-2 text-sm text-gray-700">{error}</p>}
    </div>
  );
}
