// Model legend shared by the Creation and Map views — node kinds (marker ring),
// technologies (marker fill) and links, using the exact colours the map draws.
import React, { useState } from 'react';
import { FiLayers, FiChevronDown } from '../ui/icons';
import {
  getTechColor, getLinkColor, getLinkLabel, NODE_KIND_COLORS, NODE_KIND_LABELS,
} from '../../utils/mapVisuals';

const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const Row = ({ swatch, label, count }) => (
  <div className="flex items-center gap-2">
    {swatch}
    <span className="flex-1 truncate text-slate-700">{label}</span>
    {count != null && <span className="tabular-nums text-slate-400">{count}</span>}
  </div>
);
const Section = ({ title, children }) => (
  <div>
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
    <div className="space-y-1.5 text-xs">{children}</div>
  </div>
);

export default function ModelLegend({ locations = [], links = [], techMap = {}, className = '' }) {
  const [open, setOpen] = useState(true);

  const kindCounts = {};
  const techs = new Map();
  locations.forEach(loc => {
    const kind = loc.metadata?.kind;
    if (NODE_KIND_COLORS[kind]) kindCounts[kind] = (kindCounts[kind] || 0) + 1;
    Object.keys(loc.techs || {}).forEach(t => {
      const entry = techs.get(t) || {
        color: getTechColor(t, techMap),
        label: techMap[t]?.essentials?.name || t,
        count: 0,
      };
      entry.count += 1;
      techs.set(t, entry);
    });
  });

  const linkGroups = new Map();
  links.forEach(link => {
    const label = getLinkLabel(link);
    const entry = linkGroups.get(label) || { color: getLinkColor(link), count: 0 };
    entry.count += 1;
    linkGroups.set(label, entry);
  });

  if (!locations.length && !links.length) return null;

  return (
    <div className={`w-64 overflow-hidden rounded-2xl bg-white/90 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 backdrop-blur-md ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-black text-white"><FiLayers size={14} /></span>
        <span className="flex-1 text-sm font-semibold text-slate-900">Legend</span>
        <FiChevronDown size={15} className={`text-slate-400 transition-transform ${open ? '' : '-rotate-180'}`} />
      </button>
      {open && (
        <div className="max-h-80 space-y-4 overflow-y-auto border-t border-black/10 px-4 pb-4 pt-3">
          {Object.keys(kindCounts).length > 0 && (
            <Section title="Node types (ring)">
              {Object.entries(kindCounts).map(([kind, count]) => (
                <Row
                  key={kind}
                  swatch={<span className="h-3 w-3 shrink-0 rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 2.5px ${NODE_KIND_COLORS[kind]}` }} />}
                  label={NODE_KIND_LABELS[kind]}
                  count={count}
                />
              ))}
            </Section>
          )}

          {techs.size > 0 && (
            <Section title="Technologies">
              {[...techs.entries()].map(([t, { color, label, count }]) => (
                <Row
                  key={t}
                  swatch={<span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: rgb(color) }} />}
                  label={label}
                  count={count}
                />
              ))}
            </Section>
          )}

          {linkGroups.size > 0 && (
            <Section title={`Links · ${links.length}`}>
              {[...linkGroups.entries()].map(([label, { color, count }]) => (
                <Row
                  key={label}
                  swatch={<span className="h-1 w-5 shrink-0 rounded-full" style={{ backgroundColor: rgb(color) }} />}
                  label={label}
                  count={count}
                />
              ))}
            </Section>
          )}

          {techs.size === 0 && linkGroups.size === 0 && (
            <p className="text-xs text-slate-500">Add technologies or links to see them here.</p>
          )}
        </div>
      )}
    </div>
  );
}
