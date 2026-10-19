import { useMemo, useState } from 'react';
import ReactECharts from '../ui/Chart';
import { FiZap, FiBattery, FiRefreshCw, FiActivity, FiShare2, FiBox, FiChevronDown, FiMapPin } from '../ui/icons';
import { tr } from '../../i18n';

const CATEGORY_META = {
  supply:       { label: tr("Supply"),       color: '#f59e0b', icon: FiZap },
  storage:      { label: tr("Storage"),      color: '#0ea5e9', icon: FiBattery },
  conversion:   { label: tr("Conversion"),   color: '#8b5cf6', icon: FiRefreshCw },
  demand:       { label: tr("Demand"),       color: '#334155', icon: FiActivity },
  transmission: { label: tr("Transmission"), color: '#14b8a6', icon: FiShare2 },
  other:        { label: tr("Other"),        color: '#94a3b8', icon: FiBox },
};
const ORDER = Object.keys(CATEGORY_META);

const fmtCap = (mw) => {
  if (!mw) return null;
  if (mw >= 1e6) return `${(mw / 1e6).toFixed(1)} TW`;
  if (mw >= 1e3) return `${(mw / 1e3).toFixed(1)} GW`;
  return `${mw.toFixed(0)} MW`;
};

export default function TechCategoryBreakdown({ byParent, capByTech, techsPerLoc = {}, getTechName, getTechColor }) {
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [metric, setMetric] = useState('count');

  const rows = useMemo(() => ORDER
    .filter((g) => byParent[g]?.length)
    .map((g) => {
      const set = new Set(byParent[g]);
      return {
        id: g,
        ...CATEGORY_META[g],
        techs: [...byParent[g]].sort((a, b) => (capByTech[b] || 0) - (capByTech[a] || 0)),
        cap: byParent[g].reduce((s, t) => s + (capByTech[t] || 0), 0),
        locations: Object.values(techsPerLoc).filter((ts) => ts.some((t) => set.has(t))).length,
      };
    }), [byParent, capByTech, techsPerLoc]);

  const totalCount = rows.reduce((s, r) => s + r.techs.length, 0);
  const totalCap = rows.reduce((s, r) => s + r.cap, 0);
  const totalLocs = Object.keys(techsPerLoc).length;
  const byCap = metric === 'capacity' && totalCap > 0;
  const valueOf = (r) => (byCap ? r.cap : r.techs.length);
  const total = byCap ? totalCap : totalCount;
  const active = rows.find((r) => r.id === hovered);

  const topTechs = useMemo(() => Object.entries(capByTech)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5), [capByTech]);
  const topMax = topTechs[0]?.[1] || 1;

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { show: false },
    series: [{
      type: 'pie',
      radius: ['70%', '92%'],
      padAngle: 2,
      itemStyle: { borderRadius: 4 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: rows.map((r) => ({ name: r.id, value: byCap ? r.cap : r.techs.length, itemStyle: { color: r.color, opacity: hovered && hovered !== r.id ? 0.3 : 1 } })),
    }],
  }), [rows, hovered, byCap]);

  const onEvents = useMemo(() => ({
    mouseover: (p) => setHovered(p.name),
    mouseout: () => setHovered(null),
    click: (p) => setExpanded((e) => (e === p.name ? null : p.name)),
  }), []);

  if (!rows.length) {
    return <div className="flex h-full min-h-40 items-center justify-center text-sm text-slate-400">{tr("No technologies loaded")}</div>;
  }

  const centreValue = active ? (byCap ? fmtCap(active.cap) || '—' : active.techs.length) : (byCap ? fmtCap(totalCap) : totalCount);
  const centreLabel = active ? active.label : byCap ? tr("max capacity") : tr("technologies");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Summary */}
      <div className="flex items-center gap-4 border-b border-black/5 px-5 pb-4 pt-4">
        <div className="relative h-32 w-32 shrink-0">
          <ReactECharts option={option} onEvents={onEvents} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={`font-bold leading-none tracking-tight text-slate-900 ${byCap ? 'text-[13px]' : 'text-2xl'}`}>{centreValue}</span>
            <span className="mt-1 max-w-[80px] text-[10px] font-medium uppercase tracking-wider text-slate-500">{centreLabel}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="inline-flex bg-slate-100 p-0.5 text-[11px] font-medium">
            {[['count', tr("Count")], ['capacity', tr("Capacity")]].map(([id, label]) => (
              <button key={id} onClick={() => setMetric(id)} disabled={id === 'capacity' && totalCap === 0}
                className={`px-2.5 py-1 transition-colors disabled:opacity-40 ${metric === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {[[tr("Techs"), totalCount], [tr("Groups"), rows.length], [tr("Locations"), totalLocs || '—']].map(([k, v]) => (
              <div key={k} className="bg-slate-50 px-1 py-1.5">
                <dd className="text-sm font-bold tabular-nums text-slate-900">{v}</dd>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{k}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Categories */}
      <ul className="space-y-1 px-3 py-3">
        {rows.map((r) => {
          const Icon = r.icon;
          const share = total > 0 ? (valueOf(r) / total) * 100 : 0;
          const open = expanded === r.id;
          return (
            <li key={r.id} onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}
              className={`border transition-colors ${open ? 'border-slate-200 bg-slate-50' : 'border-transparent hover:bg-slate-50'}`}>
              <button onClick={() => setExpanded(open ? null : r.id)} className="w-full px-2 py-2 text-left">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center" style={{ background: `${r.color}1f`, color: r.color }}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{r.label}</span>
                      <span className="text-xs tabular-nums text-slate-500">
                        <b className="text-slate-900">{byCap ? fmtCap(r.cap) || '—' : r.techs.length}</b> · {share.toFixed(0)}%
                      </span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden bg-slate-100">
                      <span className="block h-full" style={{ width: `${share}%`, background: r.color }} />
                    </span>
                    <span className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><FiMapPin size={11} /> {r.locations} {tr("location")}{r.locations === 1 ? '' : 's'}</span>
                      {!byCap && fmtCap(r.cap) && r.id !== 'demand' && <span title={tr("Sum of maximum capacity (energy_cap_max)")}>{fmtCap(r.cap)} {tr("max")}</span>}
                      {byCap && <span>{r.techs.length === 1 ? tr("1 technology") : tr("{0} technologies", { 0: r.techs.length })}</span>}
                    </span>
                  </span>
                  <FiChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
                {!open && (
                  <span className="mt-2 flex flex-wrap gap-1 pl-12">
                    {r.techs.slice(0, 3).map((t) => (
                      <span key={t} className="inline-flex max-w-[140px] items-center gap-1 border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: getTechColor(t) }} />
                        <span className="truncate">{getTechName(t)}</span>
                      </span>
                    ))}
                    {r.techs.length > 3 && <span className="px-1 py-0.5 text-[10.5px] text-slate-400">+{r.techs.length - 3} {tr("more")}</span>}
                  </span>
                )}
              </button>
              {open && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-2.5 pl-14">
                  {r.techs.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                      <span className="h-2 w-2 rounded-full" style={{ background: getTechColor(t) }} />
                      {getTechName(t)}
                      {fmtCap(capByTech[t]) && <span className="text-slate-400">{fmtCap(capByTech[t])}</span>}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Largest technologies */}
      {topTechs.length > 0 && (
        <div className="mt-auto border-t border-black/5 px-5 py-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{tr("Largest technologies")}</span>
            <span className="text-[10px] text-slate-400">{tr("by max capacity")}</span>
          </div>
          <ol className="space-y-2">
            {topTechs.map(([t, v], i) => (
              <li key={t} className="flex items-center gap-2.5 text-[12px]">
                <span className="w-3 text-right tabular-nums text-slate-400">{i + 1}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: getTechColor(t) }} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate text-slate-700">{getTechName(t)}</span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-900">{fmtCap(v)}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden bg-slate-100">
                    <span className="block h-full" style={{ width: `${(v / topMax) * 100}%`, background: getTechColor(t) }} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
