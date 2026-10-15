import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { FiZap, FiBattery, FiRefreshCw, FiActivity, FiShare2, FiBox, FiChevronDown } from '../ui/icons';

const CATEGORY_META = {
  supply:       { label: 'Supply',       color: '#f59e0b', icon: FiZap },
  storage:      { label: 'Storage',      color: '#0ea5e9', icon: FiBattery },
  conversion:   { label: 'Conversion',   color: '#8b5cf6', icon: FiRefreshCw },
  demand:       { label: 'Demand',       color: '#334155', icon: FiActivity },
  transmission: { label: 'Transmission', color: '#14b8a6', icon: FiShare2 },
  other:        { label: 'Other',        color: '#94a3b8', icon: FiBox },
};
const ORDER = Object.keys(CATEGORY_META);

const fmtCap = (mw) => {
  if (!mw) return null;
  if (mw >= 1e6) return `${(mw / 1e6).toFixed(1)} TW`;
  if (mw >= 1e3) return `${(mw / 1e3).toFixed(1)} GW`;
  return `${mw.toFixed(0)} MW`;
};

export default function TechCategoryBreakdown({ byParent, capByTech, getTechName, getTechColor }) {
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const rows = useMemo(() => ORDER
    .filter((g) => byParent[g]?.length)
    .map((g) => ({
      id: g,
      ...CATEGORY_META[g],
      techs: [...byParent[g]].sort((a, b) => (capByTech[b] || 0) - (capByTech[a] || 0)),
      cap: byParent[g].reduce((s, t) => s + (capByTech[t] || 0), 0),
    })), [byParent, capByTech]);

  const total = rows.reduce((s, r) => s + r.techs.length, 0);
  const active = rows.find((r) => r.id === hovered);

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { show: false },
    series: [{
      type: 'pie',
      radius: ['68%', '92%'],
      padAngle: 2,
      itemStyle: { borderRadius: 4 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: rows.map((r) => ({ name: r.id, value: r.techs.length, itemStyle: { color: r.color, opacity: hovered && hovered !== r.id ? 0.35 : 1 } })),
    }],
  }), [rows, hovered]);

  const onEvents = useMemo(() => ({
    mouseover: (p) => setHovered(p.name),
    mouseout: () => setHovered(null),
    click: (p) => setExpanded((e) => (e === p.name ? null : p.name)),
  }), []);

  if (!rows.length) {
    return <div className="flex h-full min-h-40 items-center justify-center text-sm text-slate-400">No technologies loaded</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-5 px-5 pt-4 pb-3">
        <div className="relative h-36 w-36 shrink-0">
          <ReactECharts option={option} onEvents={onEvents} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none text-slate-900">{active ? active.techs.length : total}</span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{active ? active.label : 'technologies'}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-slate-500">
            <b className="text-slate-800">{total}</b> technologies in <b className="text-slate-800">{rows.length}</b> categories
          </p>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
            {rows.map((r) => (
              <div key={r.id} style={{ width: `${(r.techs.length / total) * 100}%`, background: r.color, opacity: hovered && hovered !== r.id ? 0.35 : 1 }} className="transition-opacity" />
            ))}
          </div>
          <p className="text-[11px] leading-snug text-slate-400">Hover a category to highlight it, click to list its technologies.</p>
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {rows.map((r) => {
          const Icon = r.icon;
          const pct = Math.round((r.techs.length / total) * 100);
          const open = expanded === r.id;
          return (
            <li key={r.id} onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}
              className={`rounded-lg border transition-colors ${open ? 'border-slate-200 bg-slate-50' : 'border-transparent hover:bg-slate-50'}`}>
              <button onClick={() => setExpanded(open ? null : r.id)} className="flex w-full items-center gap-3 px-2 py-2 text-left">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${r.color}1f`, color: r.color }}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{r.label}</span>
                    <span className="text-xs tabular-nums text-slate-500"><b className="text-slate-800">{r.techs.length}</b> · {pct}%</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
                    </span>
                    {fmtCap(r.cap) && r.id !== 'demand' && <span className="shrink-0 text-[10px] tabular-nums text-slate-400" title="Sum of maximum capacity (energy_cap_max)">{fmtCap(r.cap)} max</span>}
                  </span>
                </span>
                <FiChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="flex flex-wrap gap-1.5 px-2 pb-2.5 pl-[52px]">
                  {r.techs.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
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
    </div>
  );
}
