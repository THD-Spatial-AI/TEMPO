import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { LuSparkles, LuPlus, LuRefreshCw, LuBug, LuShieldCheck, LuWrench, LuX, LuTag, LuExternalLink, LuWifiOff, LuDownload, LuInfo } from './ui/icons';
import { RELEASES_URL } from '../services/releases';
import Select from './ui/Select';
import { tr, locale } from '../i18n';

const SECTION_STYLE = [
  { match: /add|new|feature/i,      icon: LuPlus,        tone: 'bg-emerald-50 text-emerald-700' },
  { match: /fix|bug/i,              icon: LuBug,         tone: 'bg-red-50 text-red-700' },
  { match: /security|privacy/i,     icon: LuShieldCheck, tone: 'bg-violet-50 text-violet-700' },
  { match: /change|improv|update/i, icon: LuRefreshCw,   tone: 'bg-sky-50 text-sky-700' },
  { match: /download|install/i,     icon: LuDownload,    tone: 'bg-slate-100 text-slate-700' },
  { match: /note|known/i,           icon: LuInfo,        tone: 'bg-amber-50 text-amber-700' },
];
const styleFor = (title) => SECTION_STYLE.find((s) => s.match.test(title)) || { icon: LuWrench, tone: 'bg-slate-100 text-slate-700' };

function Inline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return parts.map((p, i) => {
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">{link[1]}</a>;
    if (p.startsWith('**')) return <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>;
    if (p.startsWith('`')) return <code key={i} className="rounded bg-slate-100 px-1 font-mono text-[12px] text-slate-800">{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

const fmtDate = (d) => {
  if (!d) return null;
  const date = new Date(`${d}T00:00:00`);
  return isNaN(date) ? d : date.toLocaleDateString(locale() || 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function WhatsNewDialog({ releases, latest, loading, error, onClose }) {
  const [version, setVersion] = useState(latest?.version || null);
  const release = useMemo(() => releases.find((r) => r.version === version) || latest, [releases, version, latest]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={tr("What's new")}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5"
      >
        <div className="flex items-start gap-4 border-b border-black/10 px-6 py-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black text-white shadow-lg shadow-slate-900/20">
            <LuSparkles size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">{tr("What's new in TEMPO")}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {release && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                  <LuTag size={11} /> v{release.version}
                </span>
              )}
              {release && release.version === latest?.version && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">{tr("Latest")}</span>
              )}
              {release?.date && <span>{tr("Released")} {fmtDate(release.date)}</span>}
            </p>
          </div>
          {releases.length > 1 && (
            <div className="w-36 shrink-0">
              <Select
                value={release?.version}
                onChange={setVersion}
                options={releases.map((r) => ({ value: r.version, label: `v${r.version}`, description: fmtDate(r.date) || undefined }))}
              />
            </div>
          )}
          <button onClick={onClose} aria-label={tr("Close")} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <LuX size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!release && loading && (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/15 border-t-slate-700" /> {tr("Loading release notes from GitHub…")}
            </div>
          )}
          {!release && !loading && (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500"><LuWifiOff size={18} /></span>
              <p className="text-sm font-semibold text-slate-800">{tr("Release notes unavailable")}</p>
              <p className="mt-1 text-sm text-slate-500">{error ? tr("Couldn't reach GitHub ({0}).", { 0: error }) : tr("No releases found.")} {tr("Check your connection and try again.")}</p>
            </div>
          )}
          {release?.summary && (
            <p className="text-sm leading-relaxed text-slate-600"><Inline text={release.summary} /></p>
          )}
          {release?.sections.map((sec) => {
            const { icon: Icon, tone } = styleFor(sec.title);
            return (
              <section key={sec.title}>
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className={`grid h-6 w-6 place-items-center rounded-md ${tone}`}><Icon size={13} /></span>
                  {sec.title}
                  <span className="text-xs font-normal text-slate-400">{sec.items.length}</span>
                </h3>
                <ul className="space-y-2">
                  {sec.items.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <span><Inline text={item} /></span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-black/10 bg-slate-50/60 px-6 py-3">
          <a
            href={release?.url || RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            {tr("View on GitHub")} <LuExternalLink size={12} />
          </a>
          <button onClick={onClose} className="h-9 rounded-lg bg-black px-4 text-[13px] font-semibold text-white hover:bg-black/80">
            {tr("Got it")}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
