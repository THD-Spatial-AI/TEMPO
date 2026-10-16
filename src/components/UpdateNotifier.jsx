// Checks GitHub for a newer release and walks the user through download + install.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuDownload, LuX, LuRefreshCw, LuExternalLink, LuCheck, LuSparkles } from './ui/icons';
import { parseReleaseBody } from '../services/releases';
import { getSetting } from '../services/appSettings';

const SKIP_KEY = 'tempo:update:skip';
const CHECK_EVERY = 6 * 60 * 60 * 1000;
const updates = () => window.electronAPI?.updates;

const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;
const plain = (s) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

export default function UpdateNotifier() {
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('hidden');
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [error, setError] = useState('');
  const busy = useRef(false);
  const cancelled = useRef(false);
  const [minimized, setMinimized] = useState(false);

  const check = useCallback(async (manual = false) => {
    const api = updates();
    if (!api || busy.current) return;
    busy.current = true;
    const res = await api.check();
    busy.current = false;
    if (res?.error) {
      if (manual) { setError(res.error); setState('error'); }
      return;
    }
    setInfo(res);
    let skipped = null;
    try { skipped = localStorage.getItem(SKIP_KEY); } catch { /* storage blocked */ }
    if (res.available && (manual || skipped !== res.version)) { setMinimized(false); setState('available'); }
    else if (manual) setState('uptodate');
  }, []);

  useEffect(() => {
    const auto = () => getSetting('autoUpdateCheck') !== false && check(false);
    const first = setTimeout(auto, 8000);
    const timer = setInterval(auto, CHECK_EVERY);
    const onManual = () => check(true);
    window.addEventListener('tempo:check-updates', onManual);
    const off = updates()?.onProgress((p) => {
      setProgress(p);
      if (p.verifying) setState('verifying');
    });
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener('tempo:check-updates', onManual); off?.(); };
  }, [check]);

  useEffect(() => {
    if (state !== 'uptodate') return undefined;
    const t = setTimeout(() => setState('hidden'), 4000);
    return () => clearTimeout(t);
  }, [state]);

  const download = async () => {
    setError('');
    setProgress({ received: 0, total: info?.asset?.size || 0 });
    setState('downloading');
    cancelled.current = false;
    const res = await updates().download();
    if (cancelled.current) return;
    setMinimized(false);
    if (res?.error) { setError(res.error); setState('error'); return; }
    setState('ready');
  };

  const install = async () => {
    setState('installing');
    const res = await updates().install();
    if (res?.error) { setError(res.error); setState('error'); }
    else if (res?.devtest) setState('devtest');
  };

  const skip = () => {
    try { localStorage.setItem(SKIP_KEY, info.version); } catch { /* storage blocked */ }
    setState('hidden');
  };

  if (state === 'hidden' || !updates()) return null;

  const highlights = info ? parseReleaseBody(info.notes).sections.flatMap((sec) => sec.items).slice(0, 4) : [];
  const pct = progress.total ? Math.min(100, (progress.received / progress.total) * 100) : 0;
  const working = ['downloading', 'verifying', 'installing'].includes(state);
  const released = info?.publishedAt ? new Date(info.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const btn = 'h-11 whitespace-nowrap px-5 text-sm font-semibold transition-colors';
  const ghost = `${btn} border border-black/15 bg-white text-slate-700 hover:bg-slate-50`;
  const primary = `${btn} bg-black text-white hover:bg-slate-800`;

  const progressBar = (
    <div>
      <div className="h-2 overflow-hidden bg-slate-100">
        <div className={`h-full bg-slate-900 transition-[width] ${state === 'verifying' ? 'animate-pulse' : ''}`} style={{ width: `${state === 'verifying' ? 100 : pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-500">
        <span>{state === 'verifying' ? 'Verifying download…' : state === 'installing' ? 'Installing…' : `Downloading ${info?.asset?.name || ''}`}</span>
        {state === 'downloading' && <span>{mb(progress.received)} / {mb(progress.total)} · {pct.toFixed(0)}%</span>}
      </div>
    </div>
  );

  if (state === 'uptodate' || (minimized && working)) {
    return createPortal(
      <div role="status" aria-live="polite" className="tempo-tour-card fixed bottom-5 right-5 z-[9000] w-[340px] border border-black/15 bg-white p-4 shadow-2xl shadow-slate-900/15">
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center text-white ${state === 'uptodate' ? 'bg-emerald-600' : 'bg-black'}`}>
            {state === 'uptodate' ? <LuCheck size={17} /> : <LuDownload size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{state === 'uptodate' ? 'TEMPO is up to date' : `Updating to ${info?.version}`}</div>
            {state === 'uptodate' && <div className="text-xs text-slate-500">You have the latest version (v{info?.currentVersion}).</div>}
          </div>
          {working && <button onClick={() => setMinimized(false)} className="text-xs font-medium text-slate-500 hover:text-slate-900">Show</button>}
        </div>
        {working && <div className="mt-3">{progressBar}</div>}
      </div>,
      document.body,
    );
  }

  const title = state === 'devtest' ? 'Test complete' : state === 'ready' ? 'Ready to install' : state === 'error' ? 'Update failed' : working ? 'Updating TEMPO' : 'A new version of TEMPO is available';

  return createPortal(
    <div className="fixed inset-0 z-[10030] flex items-center justify-center p-4">
      <div className="tempo-confirm-backdrop absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onMouseDown={() => !working && setState('hidden')} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="tempo-update-title" className="tempo-confirm-panel relative w-full max-w-[480px] overflow-hidden bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="relative overflow-hidden bg-slate-950 px-6 pb-6 pt-6 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -right-24 top-6 h-56 w-56 rounded-full bg-white/5" />
          {!working && (
            <button onClick={() => setState('hidden')} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center text-white/50 hover:bg-white/10 hover:text-white">
              <LuX size={17} />
            </button>
          )}
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/60">
            <LuSparkles size={14} /> {title}
          </div>
          <div id="tempo-update-title" className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-tight">TEMPO {info?.version}</span>
            <span className="border border-white/20 px-2 py-0.5 text-xs text-white/70">you have {info?.currentVersion}</span>
          </div>
          <div className="mt-2 text-xs text-white/50">
            {[released && `Released ${released}`, info?.asset?.size && `${mb(info.asset.size)} download`].filter(Boolean).join(' · ')}
          </div>
        </div>

        <div className="px-6 py-5">
          {state === 'available' && highlights.length > 0 && (
            <>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">What's new</div>
              <ul className="space-y-2.5">
                {highlights.map((h, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-slate-700">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center bg-emerald-50 text-emerald-600"><LuCheck size={11} /></span>
                    <span className="line-clamp-2">{plain(h)}</span>
                  </li>
                ))}
              </ul>
              {!info.canInstall && (
                <p className="mt-4 bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-500">
                  {info.kind === 'dev' ? 'Automatic install is not available in development builds.' : 'This copy cannot be updated automatically.'} Download the new version from GitHub instead.
                </p>
              )}
            </>
          )}
          {working && progressBar}
          {state === 'ready' && (
            <p className="text-sm leading-relaxed text-slate-600">
              {info?.kind === 'devtest'
                ? 'Test mode: the download is verified. Nothing will be installed; the file will be shown in its folder.'
                : `TEMPO will close to install version ${info?.version}${info?.kind === 'deb' ? ' (you may be asked for your password)' : ''} and then start again. Save your work first.`}
            </p>
          )}
          {state === 'devtest' && <p className="text-sm leading-relaxed text-slate-600">The update was downloaded and its checksum verified. Nothing was installed; the file is in the folder that just opened.</p>}
          {state === 'error' && <p className="bg-red-50 px-3 py-2.5 text-sm leading-snug text-red-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/10 bg-slate-50/70 px-6 py-4">
          <div className="flex gap-4 text-xs font-medium">
            {state === 'available' && <button onClick={skip} className="whitespace-nowrap text-slate-500 hover:text-slate-900">Skip this version</button>}
            {['available', 'error'].includes(state) && (
              <button onClick={() => updates().openPage()} className="flex items-center gap-1 whitespace-nowrap text-slate-500 hover:text-slate-900">
                Release notes <LuExternalLink size={12} />
              </button>
            )}
            {state === 'downloading' && <button onClick={() => setMinimized(true)} className="whitespace-nowrap text-slate-500 hover:text-slate-900">Continue in background</button>}
          </div>
          <div className="flex gap-2">
            {state === 'available' && (
              <>
                <button onClick={() => setState('hidden')} className={ghost}>Later</button>
                {info?.canInstall
                  ? <button onClick={download} className={`${primary} flex items-center gap-2`}><LuDownload size={16} /> Update now</button>
                  : <button onClick={() => updates().openPage()} className={primary}>Download</button>}
              </>
            )}
            {state === 'downloading' && (
              <button onClick={() => { cancelled.current = true; updates().cancel(); setState('available'); }} className={ghost}>Cancel</button>
            )}
            {state === 'ready' && (
              <>
                <button onClick={() => setState('hidden')} className={ghost}>Later</button>
                <button onClick={install} className={primary}>Restart &amp; install</button>
              </>
            )}
            {state === 'devtest' && <button onClick={() => setState('hidden')} className={primary}>Done</button>}
            {state === 'error' && (
              <>
                <button onClick={() => setState('hidden')} className={ghost}>Close</button>
                <button onClick={info?.canInstall ? download : () => check(true)} className={`${primary} flex items-center gap-2`}><LuRefreshCw size={15} /> Retry</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
