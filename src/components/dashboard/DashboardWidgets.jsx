// Presentational widgets for the Dashboard view: the time-series filter
// sidebar, collapsible panel, KPI card, and the Leaflet input-network mini-map.
// Extracted from Dashboard.jsx — each is prop-driven and holds no dashboard state.
import React, { useState, useEffect, useRef } from 'react';
import { FiChevronDown, FiChevronUp, FiFilter, FiMapPin } from 'react-icons/fi';
import 'leaflet/dist/leaflet.css';

// ── Time-range + location filter controls (vertical right-sidebar) ───────────
export const TsViewControls = ({ opts, onChange, ts, locSearch, onLocSearch, accentColor = '#6b7280' }) => {
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const SEASONS = [{ id: 'DJF', label: 'Winter' }, { id: 'MAM', label: 'Spring' }, { id: 'JJA', label: 'Summer' }, { id: 'SON', label: 'Autumn' }];
  const RESOLUTIONS = [{ id: 'hourly', label: 'Hourly' }, { id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }];
  const RANGES = [{ id: 'weeks2', label: 'First 2 wks' }, { id: 'month', label: 'Month' }, { id: 'seasonal', label: 'Season' }, { id: 'custom', label: 'Custom' }];
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
    <div className="w-52 shrink-0 flex flex-col gap-4 bg-white border border-slate-200 rounded-xl p-3 self-start sticky top-4">
      {/* Range */}
      <div>
        {sectionHead('Range')}
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
              <label className="text-[10px] text-slate-400 block mb-0.5">From</label>
              <input type="date" value={opts.customStart || ''} onChange={e => onChange({ ...opts, customStart: e.target.value })}
                className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] bg-white" />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">To</label>
              <input type="date" value={opts.customEnd || ''} onChange={e => onChange({ ...opts, customEnd: e.target.value })}
                className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] bg-white" />
            </div>
            {opts.customStart && opts.customEnd && (
              <span className="text-[10px] text-slate-400 text-center">
                {Math.max(0, Math.round((new Date(opts.customEnd) - new Date(opts.customStart)) / 86400000))} days
              </span>
            )}
          </div>
        )}
      </div>

      {/* Resolution */}
      <div>
        {sectionHead('Resolution')}
        <div className="flex flex-col gap-1">
          {RESOLUTIONS.map(r => chip(opts.resolution === r.id, r.label, () => onChange({ ...opts, resolution: r.id })))}
        </div>
      </div>

      {/* Location filter */}
      {allCols.length > 1 && (
        <div className="flex flex-col gap-1.5 min-h-0">
          {sectionHead('Locations')}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-slate-400 flex-1">
              {isAll ? `All ${allCols.length}` : `${opts.locs.length}/${allCols.length}`}
            </span>
            <button onClick={() => onChange({ ...opts, locs: [] })} className="text-[10px] text-gray-500 hover:underline">All</button>
            <button onClick={() => onChange({ ...opts, locs: [...allCols] })} className="text-[10px] text-slate-400 hover:underline">None</button>
          </div>
          <div className="relative">
            <FiFilter size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300" />
            <input type="text" placeholder="Search locations…" value={locSearch} onChange={e => onLocSearch(e.target.value)}
              className="w-full pl-6 pr-2 py-1 border border-slate-200 rounded text-[11px] bg-white" />
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
            {visibleCols.length > 150 && <span className="text-[10px] text-slate-400 text-center py-1">+{visibleCols.length - 150} more — refine search</span>}
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
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${fill ? 'flex flex-col' : ''} ${className}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors flex-shrink-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {Icon && <Icon size={15} className="text-slate-500" />}{title}
        </span>
        {open ? <FiChevronUp size={14} className="text-slate-400" /> : <FiChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className={`border-t border-slate-100${fill ? ' flex-1 overflow-hidden' : ''}`}>{children}</div>}
    </div>
  );
};

// ── KPI card ─────────────────────────────────────────────────────────────────
export const KpiCard = ({ icon: Ic, label, value, sub, accent }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accent || 'bg-slate-100'}`}>
      <Ic size={17} className={accent ? 'text-white' : 'text-slate-500'} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500 truncate">{label}</p>
      <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  </div>
);

// ── Map component ─────────────────────────────────────────────────────────────
export const InputMap = ({ locations, links, getTechColor }) => {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    let destroyed = false;

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
        const locs = locations.filter(l => l.latitude && l.longitude);
        if (!locs.length) return;

        clearMapAndMarkers();

        const map = L.map(mapRef.current, {
          zoomControl: true,
          preferCanvas: true,
        });
        leafletMapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors',
        }).addTo(map);

        if (locs.length === 1) {
          map.setView([locs[0].latitude, locs[0].longitude], 12);
        } else {
          const bounds = L.latLngBounds(locs.map(l => [l.latitude, l.longitude]));
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
        }

        (links || []).forEach(link => {
          const src = locs.find(l => l.id === link.from || l.name === link.from);
          const dst = locs.find(l => l.id === link.to || l.name === link.to);
          if (!src || !dst) return;
          L.polyline(
            [
              [src.latitude, src.longitude],
              [dst.latitude, dst.longitude],
            ],
            { color: '#94a3b8', weight: 2, opacity: 0.7 }
          ).addTo(map);
        });

        locs.forEach(loc => {
          const techNames = Object.keys(loc.techs || {});
          const dominant = techNames.find(t => !/demand/i.test(t)) || techNames[0] || '';
          const color = getTechColor(dominant) || '#64748b';
          const popupItems = techNames
            .slice(0, 6)
            .map(t => `<li>${t.replace(/_/g, ' ')}</li>`)
            .join('');
          const popupHtml = `<div style="font-family:system-ui;padding:2px"><b style="font-size:12px">${loc.name}</b><ul style="margin:4px 0 0 12px;font-size:10px;color:#333;padding:0">${popupItems}${techNames.length > 6 ? `<li style="color:#aaa">+${techNames.length - 6} more</li>` : ''}</ul></div>`;

          L.circleMarker([loc.latitude, loc.longitude], {
            radius: 8,
            color,
            fillColor: color,
            fillOpacity: 0.85,
            weight: 2,
          })
            .addTo(map)
            .bindPopup(popupHtml);
        });
      })
      .catch((err) => {
        console.error('Dashboard Leaflet map failed to initialize:', err);
      });
    return () => {
      destroyed = true;
      clearMapAndMarkers();
    };
  }, [locations, links, getTechColor]);

  if (!locations.some(l => l.latitude && l.longitude)) return (
    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
      <div className="text-center"><FiMapPin size={26} className="mx-auto mb-2 opacity-40" /><p>No coordinates available</p></div>
    </div>
  );
  return <div ref={mapRef} className="w-full h-full" />;
};
