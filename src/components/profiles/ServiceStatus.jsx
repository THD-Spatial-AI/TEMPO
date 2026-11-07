// Renewables-service status block of the weather-based profile dialogs:
// desktop-only notice, Install / Start buttons and the last status line.
import React from 'react';

const BTN = 'px-3 py-1.5 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed';
const SLATE = 'border px-3 py-2 text-xs border-slate-200 bg-slate-50 text-slate-700';

/** `svc`, `busy`, `svcMsg`, `install`, `start` come from useRenewablesJob; `webMessage` is the outside-Electron notice. */
export default function ServiceStatus({ svc, busy, svcMsg, install, start, webMessage }) {
  return (
    <>
      {svc === 'web' && <div className={SLATE}>{webMessage}</div>}
      {svc === 'missing' && (
        <div className="border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
          <p className="text-xs text-amber-800">The renewables component is not installed.</p>
          <button type="button" disabled={!!busy} onClick={install} className={BTN}>
            {busy === 'install' ? 'Installing…' : 'Install renewables component'}
          </button>
        </div>
      )}
      {svc === 'stopped' && (
        <div className="flex items-center gap-3">
          <div className={SLATE}>The renewables service is not running.</div>
          <button type="button" disabled={!!busy} onClick={start} className={BTN}>
            {busy === 'start' ? 'Starting…' : 'Start service'}
          </button>
        </div>
      )}
      {svcMsg && <p className="text-[11px] text-slate-500 truncate" title={svcMsg}>{svcMsg}</p>}
    </>
  );
}
