// LogsTab — searchable, filterable solver log viewer for the selected run.
import { useMemo, useState } from 'react';
import { FiTerminal, FiSearch, FiX, FiCopy, FiDownload, FiCheck } from '../../ui/icons';

const LEVELS = [
  { id: 'all',     label: 'All' },
  { id: 'error',   label: 'Errors',   dot: 'bg-red-500' },
  { id: 'warning', label: 'Warnings', dot: 'bg-amber-500' },
  { id: 'success', label: 'Success',  dot: 'bg-emerald-500' },
];

const SOURCE_TONES = ['text-sky-300', 'text-violet-300', 'text-teal-300', 'text-pink-300', 'text-orange-300'];

function parseLine(raw, index) {
  const tags = [];
  let rest = raw;
  let m;
  while ((m = rest.match(/^\s*\[([^\]]{1,24})\]\s*/))) {
    tags.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  const level =
    /\b(error|exception|traceback|failed|infeasible)\b/i.test(raw) ? 'error'
    : /\b(warn(ing)?|dropped|deprecated|skipp(ed|ing))\b/i.test(raw) ? 'warning'
    : /✓|\b(success(fully)?|optimal|completed|done)\b/i.test(raw) ? 'success'
    : 'info';
  return { n: index + 1, raw, source: tags[0] || null, sub: tags.slice(1), text: rest, level };
}

function Highlight({ text, query }) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((p, i) => (p.toLowerCase() === query.toLowerCase()
    ? <mark key={i} className="rounded-sm bg-amber-300/80 px-0.5 text-slate-950">{p}</mark>
    : p));
}

export default function LogsTab({ selectedJob }) {
  const lines = useMemo(() => (selectedJob?.logs || []).map(parseLine), [selectedJob?.logs]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [source, setSource] = useState(null);
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);

  const sources = useMemo(() => [...new Set(lines.map(l => l.source).filter(Boolean))], [lines]);
  const toneFor = (s) => SOURCE_TONES[Math.max(0, sources.indexOf(s)) % SOURCE_TONES.length];
  const counts = useMemo(() => lines.reduce((c, l) => ({ ...c, [l.level]: (c[l.level] || 0) + 1 }), {}), [lines]);

  const visible = lines.filter(l =>
    (level === 'all' || l.level === level) &&
    (!source || l.source === source) &&
    (!query || l.raw.toLowerCase().includes(query.toLowerCase())));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(visible.map(l => l.raw).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([lines.map(l => l.raw).join('\n') + '\n'], { type: 'text/plain' }));
    const name = `${(selectedJob?.modelName || 'run').replace(/[^\w.-]+/g, '_')}_log.txt`;
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-black/15 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-black/10 px-4 py-3">
        <div className="flex items-center gap-2 pr-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white"><FiTerminal size={15} /></span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Solver log</div>
            <div className="text-[11px] text-slate-500">{lines.length} lines{selectedJob?.duration ? ` · ${selectedJob.duration}` : ''}</div>
          </div>
        </div>

        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {LEVELS.map(({ id, label, dot }) => {
            const n = id === 'all' ? lines.length : counts[id] || 0;
            return (
              <button key={id} onClick={() => setLevel(id)}
                className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                  level === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}>
                {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
                {label}
                <span className={`tabular-nums ${level === id ? 'text-slate-500' : 'text-slate-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {sources.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {sources.map(s => (
              <button key={s} onClick={() => setSource(source === s ? null : s)}
                className={`h-8 rounded-md border px-2.5 font-mono text-[11px] transition-colors ${
                  source === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-black/15 text-slate-600 hover:bg-slate-50'
                }`}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="relative ml-auto w-full sm:w-64">
          <FiSearch size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search log…"
            className="h-9 w-full rounded-lg border border-black/15 bg-white pl-8 pr-8 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200" />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <FiX size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1">
          <button onClick={() => setWrap(w => !w)} title="Toggle line wrap"
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${wrap ? 'border-black/15 bg-slate-100 text-slate-800' : 'border-black/15 text-slate-500 hover:bg-slate-50'}`}>
            Wrap
          </button>
          <button onClick={copy} title="Copy visible lines"
            className="grid h-9 w-9 place-items-center rounded-lg border border-black/15 text-slate-600 transition-colors hover:bg-slate-50">
            {copied ? <FiCheck size={15} className="text-emerald-600" /> : <FiCopy size={15} />}
          </button>
          <button onClick={download} title="Download full log"
            className="grid h-9 w-9 place-items-center rounded-lg border border-black/15 text-slate-600 transition-colors hover:bg-slate-50">
            <FiDownload size={15} />
          </button>
        </div>
      </div>

      {/* Log body */}
      <div className="max-h-[640px] overflow-auto bg-slate-950 py-2 font-mono text-[12px] leading-[1.7]">
        {visible.map(l => (
          <div key={l.n}
            className={`group flex gap-3 border-l-2 pr-4 hover:bg-white/[0.04] ${
              l.level === 'error' ? 'border-red-500 bg-red-500/10' : l.level === 'warning' ? 'border-amber-400 bg-amber-400/[0.07]' : 'border-transparent'
            }`}>
            <span className="w-10 shrink-0 select-none pr-1 text-right tabular-nums text-slate-600 group-hover:text-slate-400">{l.n}</span>
            <span className={`min-w-0 flex-1 ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
              {l.source && <span className={`mr-2 font-semibold ${toneFor(l.source)}`}>{l.source}</span>}
              {l.sub.map(t => <span key={t} className="mr-2 rounded bg-white/10 px-1 text-[10px] uppercase tracking-wide text-slate-300">{t}</span>)}
              <span className={l.level === 'error' ? 'text-red-300' : l.level === 'warning' ? 'text-amber-200' : l.level === 'success' ? 'text-emerald-300' : 'text-slate-200'}>
                <Highlight text={l.text} query={query} />
              </span>
            </span>
          </div>
        ))}
        {lines.length === 0 && <div className="px-6 py-10 text-center italic text-slate-500">No log lines available</div>}
        {lines.length > 0 && visible.length === 0 && <div className="px-6 py-10 text-center text-slate-500">No lines match the current filters</div>}
      </div>

      {visible.length !== lines.length && (
        <div className="border-t border-black/10 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          Showing {visible.length} of {lines.length} lines
        </div>
      )}
    </div>
  );
}
