// Presentational widgets for the Dashboard view: the time-series filter
// sidebar, collapsible panel, KPI card, and the Leaflet input-network mini-map.
// Extracted from Dashboard.jsx — each is prop-driven and holds no dashboard state.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FiChevronDown, FiChevronUp, FiFilter, FiMapPin } from '../ui/icons';
import 'leaflet/dist/leaflet.css';
import { popupCard } from '../../utils/mapPopup';
import { ORG_CREDIT_HTML, OSM_CREDIT_HTML } from '../../config/attribution';
import { tr } from '../../i18n';


// ── Time-range + location filter controls (vertical right-sidebar) ───────────
export const TsViewControls = ({ opts, onChange, ts, locSearch, onLocSearch, accentColor = '#6b7280' }) => {
  const MONTHS_SHORT = [tr("Jan"),tr("Feb"),tr("Mar"),tr("Apr"),tr("May"),tr("Jun"),tr("Jul"),tr("Aug"),tr("Sep"),tr("Oct"),tr("Nov"),tr("Dec")];
  const SEASONS = [{ id: 'DJF', label: tr("Winter") }, { id: 'MAM', label: tr("Spring") }, { id: 'JJA', label: tr("Summer") }, { id: 'SON', label: tr("Autumn") }];
  const RESOLUTIONS = [{ id: 'hourly', label: tr("Hourly") }, { id: 'daily', label: tr("Daily") }, { id: 'weekly', label: tr("Weekly") }];
  const RANGES = [{ id: 'weeks2', label: tr("First 2 wks") }, { id: 'month', label: tr("Month") }, { id: 'seasonal', label: tr("Season") }, { id: 'custom', label: tr("Custom") }];
  const allCols = ts?.dataColumns || [];
  const visibleCols = locSearch ? allCols.filter(c => c.toLowerCase().includes(locSearch.toLowerCase())) : allCols;
  const isAll = (opts.locs?.length ?? 0) === 0;
  const sectionHead = (label) => (
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{label}</p>
  );
  const chip = (active, label, onClick) => (
    <button onClick={onClick}
      className="px-2 py-1 rounded text-[11px] font-medium border transition-all text-left w-full"
      style={active
        ? { background: accentColor, color: 'white', borderColor: accentColor }
        : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
      {label}
    </button>
  );
  return (
    <div className="w-52 shrink-0 flex flex-col gap-4 bg-white border border-black/15 rounded-xl p-3 self-start sticky top-4">
      {/* Range */}
      <div>
        {sectionHead(tr("Range"))}
        <div className="flex flex-col gap-1">
          {RANGES.map(r => chip(opts.mode === r.id, r.label, () => onChange({ ...opts, mode: r.id })))}
        </div>
        {/* Sub-controls */}
        {opts.mode === 'month' && (
          <div className="mt-2 grid grid-cols-3 gap-1">
            {MONTHS_SHORT.map((m, i) => (
              <button key={i} onClick={() => onChange({ ...opts, month: i })}
                className="px-1 py-0.5 rounded text-[10px] font-medium border transition-all text-center"
                style={opts.month === i ? { background: accentColor, color: 'white', borderColor: accentColor } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                {m}
              </button>
            ))}
          </div>
        )}
        {opts.mode === 'seasonal' && (
          <div className="mt-2 flex flex-col gap-1">
            {SEASONS.map(s => (
              <button key={s.id} onClick={() => onChange({ ...opts, season: s.id })}
                className="px-2 py-1 rounded text-[11px] font-medium border transition-all"
                style={opts.season === s.id ? { background: '#4b5563', color: 'white', borderColor: '#4b5563' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                {s.label} <span className="opacity-60 text-[9px]">({s.id})</span>
              </button>
            ))}
          </div>
        )}
        {opts.mode === 'custom' && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">{tr("From")}</label>
              <input type="date" value={opts.customStart || ''} onChange={e => onChange({ ...opts, customStart: e.target.value })}
                className="w-full px-2 py-1 border border-black/15 rounded text-[11px] bg-white" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">{tr("To")}</label>
              <input type="date" value={opts.customEnd || ''} onChange={e => onChange({ ...opts, customEnd: e.target.value })}
                className="w-full px-2 py-1 border border-black/15 rounded text-[11px] bg-white" />
            </div>
            {opts.customStart && opts.customEnd && (
              <span className="text-[10px] text-slate-400 text-center">
                {Math.max(0, Math.round((new Date(opts.customEnd) - new Date(opts.customStart)) / 86400000))} {tr("days")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Resolution */}
      <div>
        {sectionHead(tr("Resolution"))}
        <div className="flex flex-col gap-1">
          {RESOLUTIONS.map(r => chip(opts.resolution === r.id, r.label, () => onChange({ ...opts, resolution: r.id })))}
        </div>
      </div>

      {/* Location filter */}
      {allCols.length > 1 && (
        <div className="flex flex-col gap-1.5 min-h-0">
          {sectionHead(tr("Locations"))}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-slate-400 flex-1">
              {isAll ? tr("All {0}", { 0: allCols.length }) : `${opts.locs.length}/${allCols.length}`}
            </span>
            <button onClick={() => onChange({ ...opts, locs: [] })} className="text-[10px] text-gray-500 hover:underline">{tr("All")}</button>
            <button onClick={() => onChange({ ...opts, locs: [...allCols] })} className="text-[10px] text-slate-400 hover:underline">{tr("None")}</button>
          </div>
          <div className="relative">
            <FiFilter size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
            <input type="text" placeholder={tr("Search locations…")} value={locSearch} onChange={e => onLocSearch(e.target.value)}
              className="w-full pl-6 pr-2 py-1 border border-black/15 rounded text-[11px] bg-white" />
          </div>
          <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto pr-0.5">
            {visibleCols.slice(0, 150).map(c => {
              const active = isAll || opts.locs.includes(c);
              return (
                <button key={c} title={c}
                  onClick={() => {
                    if (isAll) { onChange({ ...opts, locs: allCols.filter(x => x !== c) }); }
                    else { const next = active ? opts.locs.filter(x => x !== c) : [...opts.locs, c]; onChange({ ...opts, locs: next.length === allCols.length ? [] : next }); }
                  }}
                  className="px-2 py-0.5 rounded text-[10px] border transition-all truncate text-left"
                  style={active
                    ? { background: accentColor + '15', borderColor: accentColor + '44', color: accentColor }
                    : { background: 'transparent', borderColor: 'transparent', color: '#94a3b8' }}>
                  {c}
                </button>
              );
            })}
            {visibleCols.length > 150 && <span className="text-[10px] text-slate-400 text-center py-1">+{visibleCols.length - 150} {tr("more — refine search")}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Collapsible panel ────────────────────────────────────────────────────────
export const Panel = ({ title, icon: Icon, defaultOpen = true, children, className = '', fill = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white rounded-xl border border-black/15  overflow-hidden ${fill ? 'flex flex-col' : ''} ${className}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors flex-shrink-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {Icon && <Icon size={15} className="text-slate-500" />}{title}
        </span>
        {open ? <FiChevronUp size={14} className="text-slate-400" /> : <FiChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className={`border-t border-black/10${fill ? ' flex-1 overflow-hidden' : ''}`}>{children}</div>}
    </div>
  );
};

// ── KPI card ─────────────────────────────────────────────────────────────────
export const KpiCard = ({ icon: Ic, label, value, sub, accent }) => (
  <div className="bg-white rounded-lg border border-black/15  px-3 py-2 flex items-center gap-2.5">
    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${accent || 'bg-slate-100'}`}>
      <Ic size={14} className={accent ? 'text-white' : 'text-slate-500'} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500 truncate leading-tight">{label}</p>
      <p className="flex items-baseline gap-1 min-w-0 leading-tight">
        <span className="text-base font-bold text-slate-800">{value}</span>
        <span className="text-[10px] text-slate-400 truncate">{sub}</span>
      </p>
    </div>
  </div>
);

// ── Map component ─────────────────────────────────────────────────────────────
export const InputMap = ({ locations, links, getTechColor, getTechName = (t) => t.replace(/_/g, ' '), capByLoc = {}, capByLocTech = {} }) => {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);
  const [legendOpen, setLegendOpen] = useState(true);

  const located = useMemo(() => locations.filter(l => l.latitude && l.longitude), [locations]);
  const dominantTech = useCallback((loc) => {
    const ranked = Object.entries(capByLocTech[loc.name] || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (ranked.length) return ranked[0][0];
    const names = Object.keys(loc.techs || {});
    return names.find(t => !/demand/i.test(t)) || names[0] || '';
  }, [capByLocTech]);
  const linkCount = useMemo(() => (links || []).filter(link =>
    located.some(l => l.id === link.from || l.name === link.from) && located.some(l => l.id === link.to || l.name === link.to)
  ).length, [links, located]);
  const legend = useMemo(() => {
    const counts = new Map();
    located.forEach(loc => { const t = dominantTech(loc); counts.set(t, (counts.get(t) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [located, dominantTech]);
  const maxCap = useMemo(() => Math.max(0, ...located.map(l => capByLoc[l.name] || 0)), [located, capByLoc]);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    let destroyed = false;
    let resizeObserver = null;

    const clearMapAndMarkers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };

    import('leaflet')
      .then(({ default: leaflet }) => {
        if (destroyed || !mapRef.current) return;
        const L = leaflet;
        const locs = located;
        if (!locs.length) return;

        clearMapAndMarkers();

        const map = L.map(mapRef.current, { zoomControl: true, preferCanvas: true, zoomSnap: 0.25 });
        leafletMapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: `${ORG_CREDIT_HTML} | ${OSM_CREDIT_HTML}`,
        }).addTo(map);
        map.getPane('tilePane').style.filter = 'grayscale(0.9) brightness(1.05) contrast(0.85)';

        const fit = () => {
          if (locs.length === 1) map.setView([locs[0].latitude, locs[0].longitude], 12);
          else map.fitBounds(L.latLngBounds(locs.map(l => [l.latitude, l.longitude])), { padding: [30, 30], maxZoom: 16 });
        };
        fit();
        let userMoved = false;
        map.getContainer().addEventListener('pointerdown', () => { userMoved = true; }, { once: true });
        map.getContainer().addEventListener('wheel', () => { userMoved = true; }, { once: true });
        resizeObserver = new ResizeObserver(() => {
          map.invalidateSize();
          if (!userMoved) fit();
        });
        resizeObserver.observe(mapRef.current);

        (links || []).forEach(link => {
          const src = locs.find(l => l.id === link.from || l.name === link.from);
          const dst = locs.find(l => l.id === link.to || l.name === link.to);
          if (!src || !dst) return;
          L.polyline([[src.latitude, src.longitude], [dst.latitude, dst.longitude]], { color: '#64748b', weight: 1.5, opacity: 0.55 })
            .addTo(map)
            .bindTooltip(`${src.name} ↔ ${dst.name}`, { sticky: true });
        });

        [...locs]
          .sort((a, b) => (capByLoc[b.name] || 0) - (capByLoc[a.name] || 0))
          .forEach(loc => {
            const techNames = Object.keys(loc.techs || {});
            const dominant = dominantTech(loc);
            const color = getTechColor(dominant) || '#64748b';
            const cap = capByLoc[loc.name] || 0;
            const radius = maxCap > 0 ? 5 + 11 * Math.sqrt(cap / maxCap) : 7;
            const popupHtml = popupCard({
              title: loc.name,
              stats: [[tr("Technologies"), techNames.length], ...(cap ? [[tr("Capacity"), cap >= 1000 ? (cap / 1000).toFixed(1) + ' GW' : cap.toFixed(0) + ' MW']] : [])],
              rows: techNames.slice(0, 8).map(t => ({ color: getTechColor(t), name: getTechName(t) })),
              note: techNames.length > 8 ? tr("+{0} more", { 0: techNames.length - 8 }) : '',
            });

            L.circleMarker([loc.latitude, loc.longitude], { radius, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.9 })
              .addTo(map)
              .bindTooltip(loc.name, { direction: 'top', offset: [0, -radius] })
              .bindPopup(popupHtml, { className: 'tempo-leaflet-popup', maxWidth: 280 });
          });
      })
      .catch((err) => {
        console.error('Dashboard Leaflet map failed to initialize:', err);
      });
    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      clearMapAndMarkers();
    };
  }, [located, links, getTechColor, getTechName, capByLoc, maxCap, dominantTech]);

  if (!located.length) return (
    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
      <div className="text-center"><FiMapPin size={26} className="mx-auto mb-2 opacity-40" /><p>{tr("No coordinates available")}</p></div>
    </div>
  );
  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-14 top-3 z-[1000] flex gap-1.5">
        <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/10">{located.length} {tr("locations")}</span>
        <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/10">{linkCount} {tr("links")}</span>
      </div>
      {legend.length > 0 && (
        <div className="absolute bottom-6 left-3 z-[1000] w-52 rounded-lg bg-white/95 text-[11px] shadow-md ring-1 ring-slate-900/10 backdrop-blur">
          <button onClick={() => setLegendOpen(o => !o)} className="flex w-full items-center justify-between px-3 py-2 font-semibold uppercase tracking-wider text-[10px] text-slate-500">
            {tr("Main technology")}
            {legendOpen ? <FiChevronDown size={12} /> : <FiChevronUp size={12} />}
          </button>
          {legendOpen && (
            <div className="space-y-2 px-3 pb-2.5">
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {legend.map(([tech, n]) => (
                  <li key={tech || 'none'} className="flex items-center gap-2 text-slate-700">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getTechColor(tech) || '#64748b' }} />
                    <span className="flex-1 truncate">{tech ? getTechName(tech) : tr("No technology")}</span>
                    <span className="tabular-nums text-slate-400">{n}</span>
                  </li>
                ))}
              </ul>
              {maxCap > 0 && (
                <div className="flex items-center gap-2 border-t border-slate-100 pt-2 text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full border border-slate-400" />
                  <span className="h-4 w-4 rounded-full border border-slate-400" />
                  <span>{tr("size = max capacity")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
