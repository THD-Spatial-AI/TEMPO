import React, { useState } from "react";

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

