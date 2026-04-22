import React from "react";

/**
 * First-launch GDPR privacy notice modal.
 *
 * Shown when no privacy consent record exists in userData.
 * The dialog is non-dismissible until the user explicitly accepts,
 * satisfying GDPR Art. 13 (information obligation at point of collection).
 *
 * Data processed by TEMPO:
 *  - Energy system model files  — stored locally in SQLite (userData/calliope.db)
 *  - Exported YAML/CSV files    — stored locally in userData/exports/
 *  - OSM / Overpass queries     — geographical bounding-box coordinates are sent
 *                                 to external servers (overpass-api.de, nominatim.openstreetmap.org)
 *                                 operated by the OpenStreetMap Foundation.
 *  - No personal data, analytics, or telemetry is collected by TEMPO.
 *
 * Props:
 *   onAccept()  — called when the user clicks "Accept & continue"
 */
const PrivacyDialog = ({ onAccept }) => {
  const handleAccept = async () => {
    if (window.electronAPI?.setPrivacyConsent) {
      await window.electronAPI.setPrivacyConsent(true);
    }
    onAccept();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[99999]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 border border-slate-200">

        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Privacy Notice</h2>
            <p className="text-xs text-slate-500 mt-0.5">Please read before using TEMPO</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <p>
            TEMPO (Tool for Energy Model Planning and Optimisation) stores your energy
            system models <strong>locally on this device</strong> and does not transmit
            personal data to any TEMPO servers.
          </p>

          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-xs">
            <p className="font-semibold text-slate-800">What data is processed:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>
                <strong>Model files</strong> — stored locally in a SQLite database
                ({"{userData}/calliope.db"}).
              </li>
              <li>
                <strong>Exports</strong> — YAML/CSV files saved locally to
                {"{userData}/exports/"}.
              </li>
              <li>
                <strong>OSM map queries</strong> — when you use the map or download
                OpenStreetMap data, geographic bounding-box coordinates are sent to
                external OpenStreetMap Foundation servers
                (<em>overpass-api.de</em>, <em>nominatim.openstreetmap.org</em>).
                No account credentials or personal identifiers are transmitted.
              </li>
            </ul>
          </div>

          <p>
            You can delete all locally stored data at any time via{" "}
            <strong>Settings → Clear All Data</strong>.
          </p>

          <p className="text-xs text-slate-500">
            By continuing you acknowledge this notice in accordance with GDPR Art. 13.
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex justify-end">
          <button
            onClick={handleAccept}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Accept &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyDialog;
