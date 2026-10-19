import React from "react";
import { tr } from '../i18n';

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
      <div className="bg-surface-container-lowest shadow-2xl max-w-lg w-full mx-4 border border-black/15">

        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-black/10">
          <span className="w-9 h-9 bg-surface-container-low flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-black">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          <div>
            <h2 className="text-xl font-black tracking-tighter text-black">{tr("Privacy Notice")}</h2>
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-black/60 mt-0.5">{tr("Please read before using TEMPO")}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
          <p>
            {tr("TEMPO (Tool for Energy Model Planning and Optimisation) stores your energy system models")} <strong>{tr("locally on this device")}</strong> {tr("and does not transmit personal data to any TEMPO servers.")}
          </p>

          <div className="bg-surface-container-low border border-black/10 p-4 space-y-2 text-xs">
            <p className="font-bold uppercase tracking-widest text-[10px] text-black">{tr("What data is processed:")}</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>
                <strong>{tr("Model files")}</strong> {tr("— stored locally in a SQLite database (")}{tr("{userData}/calliope.db")}).
              </li>
              <li>
                <strong>{tr("Exports")}</strong> {tr("— YAML/CSV files saved locally to")}
                {tr("{userData}/exports/")}.
              </li>
              <li>
                <strong>{tr("OSM map queries")}</strong> {tr("— when you use the map or download OpenStreetMap data, geographic bounding-box coordinates are sent to external OpenStreetMap Foundation servers (")}<em>{tr("overpass-api.de")}</em>, <em>{tr("nominatim.openstreetmap.org")}</em>{tr("). No account credentials or personal identifiers are transmitted.")}
              </li>
            </ul>
          </div>

          <p>
            {tr("You can delete all locally stored data at any time via")}{" "}
            <strong>{tr("Settings → Clear All Data")}</strong>.
          </p>

          <p className="text-xs text-slate-500">
            {tr("By continuing you acknowledge this notice in accordance with GDPR Art. 13.")}
          </p>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex justify-end">
          <button
            onClick={handleAccept}
            className="px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-white bg-primary hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          >
            {tr("Accept & continue")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyDialog;
