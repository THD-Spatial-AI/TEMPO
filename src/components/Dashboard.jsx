import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import ModelSelector from "./ModelSelector";
import { useData } from "../context/DataContext";
import ReactECharts from 'echarts-for-react';
import Papa from 'papaparse';
import {
  FiMapPin, FiLink, FiZap, FiBarChart2, FiPieChart, FiActivity, FiDollarSign,
  FiChevronDown, FiChevronUp, FiCpu, FiLayers, FiMap, FiClock, FiGrid, FiSun, FiFilter,
} from 'react-icons/fi';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtNum = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(dec) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(dec) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(dec) + 'k';
  return n.toFixed(dec);
};
const autoScale = (maxVal, baseUnit = 'MW') => {
  const abs = Math.abs(maxVal || 0);
  if (baseUnit === 'MW') {
    if (abs >= 1e6) return { div: 1e6, unit: 'TW' };
    if (abs >= 1e3) return { div: 1e3, unit: 'GW' };
    return { div: 1, unit: 'MW' };
  }
  if (baseUnit === '€') {
    if (abs >= 1e9) return { div: 1e9, unit: 'G€' };
    if (abs >= 1e6) return { div: 1e6, unit: 'M€' };
    if (abs >= 1e3) return { div: 1e3, unit: 'k€' };
    return { div: 1, unit: '€' };
  }
  return { div: 1, unit: baseUnit };
};
const scaledFmt = (div, dec = 1) => (v) => (v / div).toFixed(dec);
const axisNameStyle = (unit) => ({
  name: unit, nameLocation: 'end', nameGap: 8,
  nameTextStyle: { fontSize: 10, color: '#94a3b8', fontStyle: 'italic' },
});

// OSM base-map style
const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const PARENT_COLORS = {
  supply: '#f59e0b', storage: '#8b5cf6', conversion: '#10b981',
  demand: '#ef4444', transmission: '#0ea5e9', other: '#94a3b8',
};

// Template folder mapping (same as TimeSeries.jsx)
const TEMPLATE_FOLDER = {
  german: 'german_energy_system', chilean: 'chilean_energy_grid', chile: 'chilean_energy_grid',
  european: 'european_network', usa: 'usa_energy_system',
};
const TEMPLATE_CSV = {
  german: ['german_demand_2024.csv'], european: ['european_demand_2024.csv'],
  chilean: ['total_demand_2024.csv', 'resource_pv_2024.csv', 'resource_wind_2024.csv'],
  chile:   ['total_demand_2024.csv', 'resource_pv_2024.csv', 'resource_wind_2024.csv'],
  usa: [],
};

// Day-of-year labels helper
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_MONTH_START = [0,31,59,90,120,151,181,212,243,273,304,334];

// ── Build TS charts for any time-series object ────────────────────────────
function buildTsCharts(ts, lineColor = '#0ea5e9', heatColors = ['#e0f2fe','#38bdf8','#0284c7','#075985','#082f49'], locs = null) {
  if (!ts?.data?.length || !ts.dataColumns?.length) return null;
  const activeCols = locs?.length > 0 ? ts.dataColumns.filter(c => locs.includes(c)) : ts.dataColumns;
  if (!activeCols.length) return null;
  const agg = ts.data.map(row => {
    let s = 0, n = 0;
    activeCols.forEach(c => { const v = parseFloat(row[c]); if (!isNaN(v)) { s += v; n++; } });
    return n ? Math.abs(s) : 0;
  });
  const maxAll = Math.max(...agg);
  if (!maxAll) return null;
  const { div, unit } = autoScale(maxAll, 'MW');
  const fmt = scaledFmt(div);
  const slice = agg.slice(0, 336);
  const dates = ts.data.slice(0, 336).map(r => r[ts.dateColumn] || '');
  const lineOpt = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br/><b>${fmt(p[0].value)} ${unit}</b>` },
    grid: { left: 60, right: 20, top: 12, bottom: 30 },
    xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 9, color: '#64748b', interval: 47 } },
    yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{ type: 'line', data: slice, smooth: true, symbol: 'none', lineStyle: { color: lineColor, width: 2 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lineColor + '30' }, { offset: 1, color: lineColor + '00' }] } } }],
  };
  const cells = agg.map((v, i) => [Math.floor(i / 24), i % 24, +(v / div).toFixed(2)]).filter(([dy]) => dy < 366);
  const nDays = Math.min(Math.ceil(agg.length / 24), 366);
  const xLabels = Array.from({ length: nDays }, (_, i) => {
    const m = DAY_MONTH_START.findLastIndex(d => d <= i);
    return i === DAY_MONTH_START[m] ? MONTH_LABELS[m] : '';
  });
  const heatOpt = {
    backgroundColor: 'transparent',
    tooltip: { formatter: p => `Day ${p.data[0] + 1}, ${p.data[1]}:00h<br/><b>${p.data[2]} ${unit}</b>` },
    grid: { left: 48, right: 80, top: 16, bottom: 30 },
    xAxis: { type: 'category', data: xLabels, splitArea: { show: false }, axisLabel: { fontSize: 9, color: '#64748b', interval: 0, formatter: v => v } },
    yAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => `${i}:00`), splitArea: { show: false }, axisLabel: { fontSize: 9, color: '#64748b' } },
    visualMap: { min: 0, max: +(maxAll / div).toFixed(1), calculable: true, orient: 'vertical', right: 0, top: 'center', textStyle: { fontSize: 9, color: '#475569' }, text: [unit, '0'], inRange: { color: heatColors } },
    series: [{ type: 'heatmap', data: cells, emphasis: { itemStyle: { shadowBlur: 6 } } }],
  };
  return { lineOpt, heatOpt, unit, div, colCount: activeCols.length, rowCount: ts.rowCount };
}

// ── Interactive filtered chart builder ───────────────────────────────────────
function buildFilteredChart(ts, opts, lineColor = '#0ea5e9') {
  if (!ts?.data?.length || !ts.dataColumns?.length) return null;
  const cols = opts?.locs?.length > 0 ? ts.dataColumns.filter(c => opts.locs.includes(c)) : ts.dataColumns;
  if (!cols.length) return null;
  const SEASON_MONTHS = { DJF: [11,0,1], MAM: [2,3,4], JJA: [5,6,7], SON: [8,9,10] };
  let rows;
  if (opts?.mode === 'month') {
    rows = ts.data.filter(row => { const r = row[ts.dateColumn]; return r && new Date(r).getMonth() === (opts.month ?? 0); });
  } else if (opts?.mode === 'seasonal') {
    const months = SEASON_MONTHS[opts?.season || 'DJF'];
    rows = ts.data.filter(row => { const r = row[ts.dateColumn]; return r && months.includes(new Date(r).getMonth()); });
  } else if (opts?.mode === 'custom') {
    const s = opts.customStart, e = opts.customEnd;
    if (s || e) {
      rows = ts.data.filter(row => {
        const d = (row[ts.dateColumn] || '').toString();
        if (s && d.slice(0, 10) < s) return false;
        if (e && d.slice(0, 10) > e) return false;
        return true;
      });
    } else { rows = ts.data.slice(0, 336); }
  } else {
    rows = ts.data.slice(0, 336);
  }
  if (!rows.length) return null;
  let agg = rows.map(row => { let s = 0; cols.forEach(c => { const v = parseFloat(row[c]); if (!isNaN(v)) s += v; }); return Math.abs(s); });
  let labels = rows.map(r => (r[ts.dateColumn] || '').toString().slice(0, 16));
  if (opts?.resolution === 'daily') {
    const out = [], outL = [];
    for (let i = 0; i < agg.length; i += 24) { const sl = agg.slice(i, i + 24); out.push(sl.reduce((a, b) => a + b, 0) / sl.length); outL.push(labels[i]?.slice(0, 10) || ''); }
    agg = out; labels = outL;
  } else if (opts?.resolution === 'weekly') {
    const out = [], outL = [];
    for (let i = 0; i < agg.length; i += 168) { const sl = agg.slice(i, i + 168); out.push(sl.reduce((a, b) => a + b, 0) / sl.length); outL.push(labels[i]?.slice(0, 10) || ''); }
    agg = out; labels = outL;
  }
  const maxAll = Math.max(...agg);
  if (!maxAll) return null;
  const { div, unit } = autoScale(maxAll, 'MW');
  const fmt = scaledFmt(div);
  const interval = Math.max(0, Math.floor(labels.length / 14) - 1);
  return {
    rowCount: agg.length, colCount: cols.length, unit,
    opt: {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br/><b>${fmt(p[0].value)} ${unit}</b>` },
      grid: { left: 64, right: 20, top: 12, bottom: 34 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 9, color: '#64748b', rotate: labels.length > 60 ? 30 : 0, interval } },
      yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      series: [{ type: 'line', data: agg.map(v => +(v / div).toFixed(2)), smooth: !opts?.resolution || opts.resolution === 'hourly', symbol: 'none',
        lineStyle: { color: lineColor, width: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: lineColor + '30' }, { offset: 1, color: lineColor + '00' }] } } }],
    },
  };
}

// ── Time-range + location filter controls (vertical right-sidebar) ───────────
const TsViewControls = ({ opts, onChange, ts, locSearch, onLocSearch, accentColor = '#ef4444' }) => {
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
                style={opts.season === s.id ? { background: '#6366f1', color: 'white', borderColor: '#6366f1' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
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
            <button onClick={() => onChange({ ...opts, locs: [] })} className="text-[10px] text-indigo-500 hover:underline">All</button>
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
const Panel = ({ title, icon: Icon, defaultOpen = true, children, className = '' }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {Icon && <Icon size={15} className="text-slate-500" />}{title}
        </span>
        {open ? <FiChevronUp size={14} className="text-slate-400" /> : <FiChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
};

// ── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Ic, label, value, sub, accent }) => (
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
const InputMap = ({ locations, links, getTechColor }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let destroyed = false;
    import('maplibre-gl').then(({ default: mgl }) => {
      if (destroyed || !mapRef.current) return;
      const locs = locations.filter(l => l.latitude && l.longitude);
      if (!locs.length) return;
      const avgLat = locs.reduce((s, l) => s + l.latitude, 0) / locs.length;
      const avgLon = locs.reduce((s, l) => s + l.longitude, 0) / locs.length;
      const map = new mgl.Map({
        container: mapRef.current, style: OSM_STYLE,
        center: [avgLon, avgLat], zoom: 5,
        attributionControl: false, failIfMajorPerformanceCaveat: false,
      });
      mapInstanceRef.current = map;
      map.on('load', () => {
        if (destroyed) return;
        // Fit map to the actual extent of all locations
        if (locs.length === 1) {
          map.flyTo({ center: [locs[0].longitude, locs[0].latitude], zoom: 12, duration: 0 });
        } else {
          const minLon = Math.min(...locs.map(l => l.longitude));
          const maxLon = Math.max(...locs.map(l => l.longitude));
          const minLat = Math.min(...locs.map(l => l.latitude));
          const maxLat = Math.max(...locs.map(l => l.latitude));
          map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, maxZoom: 16, duration: 0 });
        }
        // Link lines
        const linkFeatures = (links || []).flatMap(link => {
          const src = locs.find(l => l.id === link.from || l.name === link.from);
          const dst = locs.find(l => l.id === link.to || l.name === link.to);
          if (!src || !dst) return [];
          return [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[src.longitude, src.latitude], [dst.longitude, dst.latitude]] }, properties: {} }];
        });
        if (linkFeatures.length) {
          map.addSource('links', { type: 'geojson', data: { type: 'FeatureCollection', features: linkFeatures } });
          map.addLayer({ id: 'links-line', type: 'line', source: 'links', paint: { 'line-color': '#94a3b8', 'line-width': 1.5, 'line-opacity': 0.7 } });
        }
        // Location markers
        locs.forEach(loc => {
          const techNames = Object.keys(loc.techs || {});
          const dominant = techNames.find(t => !/demand/i.test(t)) || techNames[0] || '';
          const color = getTechColor(dominant) || '#64748b';
          const el = document.createElement('div');
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color}CC;border:2px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6)`;
          el.textContent = techNames.length;
          const techList = techNames.slice(0, 6).map(t => `<li>${t.replace(/_/g, ' ')}</li>`).join('');
          const popup = new mgl.Popup({ offset: 16, closeButton: false, maxWidth: '200px' })
            .setHTML(`<div style="font-family:system-ui;padding:2px"><b style="font-size:12px">${loc.name}</b><ul style="margin:4px 0 0 12px;font-size:10px;color:#333;padding:0">${techList}${techNames.length > 6 ? `<li style="color:#aaa">+${techNames.length - 6} more</li>` : ''}</ul></div>`);
          markersRef.current.push(new mgl.Marker({ element: el }).setLngLat([loc.longitude, loc.latitude]).setPopup(popup).addTo(map));
        });
      });
    });
    return () => {
      destroyed = true;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []); // eslint-disable-line

  if (!locations.some(l => l.latitude && l.longitude)) return (
    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
      <div className="text-center"><FiMapPin size={26} className="mx-auto mb-2 opacity-40" /><p>No coordinates available</p></div>
    </div>
  );
  return <div ref={mapRef} className="w-full h-full" />;
};

// ── Tabs definition ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',     icon: FiGrid },
  { id: 'generation',  label: 'Generation',   icon: FiZap },
  { id: 'demand',      label: 'Demand',       icon: FiActivity },
  { id: 'network',     label: 'Network',      icon: FiLink },
  { id: 'cost',        label: 'Cost',         icon: FiDollarSign },
  { id: 'timeseries',  label: 'Time Series',  icon: FiClock },
];

// ══════════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
  const { locations, links, getCurrentModel, technologies, timeSeries, setTimeSeries } = useData();
  const currentModel = getCurrentModel();
  const [activeTab, setActiveTab] = useState('overview');
  const [tsLoading, setTsLoading] = useState(false);
  const [genTsActiveIdx, setGenTsActiveIdx] = useState(0);

  // Reset TS loading flag whenever the active model changes so the auto-loader re-runs
  const prevModelIdRef = useRef(currentModel?.id);
  useEffect(() => {
    if (prevModelIdRef.current !== currentModel?.id) {
      prevModelIdRef.current = currentModel?.id;
      setTsLoading(false);
    }
  }, [currentModel?.id]);
  const [demandViewOpts, setDemandViewOpts] = useState({ mode: 'weeks2', month: 0, season: 'DJF', customStart: '', customEnd: '', locs: [], resolution: 'hourly' });
  const [demandLocSearch, setDemandLocSearch] = useState('');
  const [genViewOpts, setGenViewOpts] = useState({ mode: 'weeks2', month: 0, season: 'DJF', customStart: '', customEnd: '', locs: [], resolution: 'hourly' });
  const [genLocSearch, setGenLocSearch] = useState('');
  const [tsActiveIdx, setTsActiveIdx] = useState(0);
  const [tsViewOpts, setTsViewOpts] = useState({ mode: 'weeks2', month: 0, season: 'DJF', customStart: '', customEnd: '', locs: [], resolution: 'hourly' });
  const [tsLocSearch, setTsLocSearch] = useState('');

  // ── Tech map ────────────────────────────────────────────────────────────
  const techMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(technologies)) {
      technologies.forEach(tech => { const k = tech.id || tech.name || ''; if (k) map.set(k, tech); });
    } else if (technologies && typeof technologies === 'object') {
      Object.entries(technologies).forEach(([k, v]) => map.set(k, v));
    }
    if (map.size === 0 && Array.isArray(locations)) {
      locations.forEach(loc => Object.entries(loc.techs || {}).forEach(([k, v]) => { if (!map.has(k)) map.set(k, v); }));
    }
    return map;
  }, [technologies, locations]);

  const getTechColor = useCallback((id) => {
    if (!id) return '#94a3b8';
    const tech = techMap.get(id);
    const c = tech?.essentials?.color || tech?.constraints?.color || tech?.color;
    if (c) return c;
    const pal = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#16A085','#27AE60','#2980B9','#8E44AD','#C0392B','#D35400','#7F8C8D'];
    return pal[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % pal.length];
  }, [techMap]);

  const getTechName = useCallback((id) => {
    const t = techMap.get(id);
    return t?.essentials?.name || t?.name || id.replace(/_/g, ' ');
  }, [techMap]);

  const getTechParent = useCallback((id) => {
    const t = techMap.get(id);
    const p = (t?.essentials?.parent || t?.parent || '').toLowerCase();
    if (p.includes('transmission')) return 'transmission';
    if (p.includes('demand'))       return 'demand';
    if (p.includes('storage'))      return 'storage';
    if (p.includes('conversion'))   return 'conversion';
    if (p.includes('supply'))       return 'supply';
    return 'other';
  }, [techMap]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const d = useMemo(() => {
    const capByTech = {}, capByLoc = {}, locByTech = {}, costByTech = {}, omByTech = {}, techsPerLoc = {};
    const byParent = {};
    const demandLocations = [];

    (locations || []).forEach(loc => {
      techsPerLoc[loc.name] = [];
      capByLoc[loc.name] = 0;
      locByTech[loc.name] = {};
      let hasDemand = false;

      Object.entries(loc.techs || {}).forEach(([id, td]) => {
        techsPerLoc[loc.name].push(id);
        const parent = getTechParent(id);
        if (!byParent[parent]) byParent[parent] = [];
        if (!byParent[parent].includes(id)) byParent[parent].push(id);

        const con = td?.constraints || {};
        const tmpl = techMap.get(id) || {};
        const tmplCosts = tmpl?.costs?.monetary || tmpl?.costs || {};
        const costs = td?.costs?.monetary || td?.costs || tmplCosts;
        const raw = con.energy_cap_max ?? con.energy_cap ?? '';
        const cap = raw === 'inf' || raw === '.inf' ? 0 : (parseFloat(raw) || 0);
        const capex = parseFloat(costs?.energy_cap || tmplCosts?.energy_cap) || 0;
        const om = parseFloat(costs?.om_annual || tmplCosts?.om_annual) || 0;

        if (parent === 'demand') { hasDemand = true; }
        else {
          capByTech[id] = (capByTech[id] || 0) + cap;
          capByLoc[loc.name] = (capByLoc[loc.name] || 0) + cap;
          locByTech[loc.name][id] = (locByTech[loc.name][id] || 0) + cap;
          costByTech[id] = (costByTech[id] || 0) + capex * cap;
          omByTech[id] = (omByTech[id] || 0) + om;
        }
      });
      if (hasDemand || loc.hasDemand) demandLocations.push(loc.name);
    });

    const allTechIds = [...new Set(Object.values(techsPerLoc).flat())];
    const totalCap = Object.values(capByTech).reduce((s, v) => s + v, 0);
    const totalCapex = Object.values(costByTech).reduce((s, v) => s + v, 0);
    const totalOpex = Object.values(omByTech).reduce((s, v) => s + v, 0);

    return { capByTech, capByLoc, locByTech, costByTech, omByTech, techsPerLoc,
      byParent, allTechIds, totalCap, totalCapex, totalOpex, demandLocations };
  }, [locations, links, techMap, getTechParent]); // eslint-disable-line

  // ── Time-series helpers ──────────────────────────────────────────────────
  // Include both template-fetched and calliope_yaml-imported TS files.
  const modelTimeSeries = useMemo(() => {
    if (!currentModel) return [];
    return timeSeries.filter(ts =>
      ts.modelId === currentModel.id &&
      (ts.source === 'template' || ts.source === 'calliope_yaml') &&
      ts.columns?.length > 1 &&
      ts.data?.length > 0
    );
  }, [timeSeries, currentModel]);

  // Auto-load TS CSV files when timeseries tab is active
  useEffect(() => {
    if (!['timeseries', 'demand'].includes(activeTab) || !currentModel || tsLoading) return;
    // If this is a calliope_yaml model, data was already embedded at import time — skip fetch.
    if (currentModel.metadata?.source === 'calliope_yaml') return;
    // Only consider wide CSV files previously loaded by this auto-loader.
    const hasData = timeSeries.some(ts =>
      ts.modelId === currentModel.id &&
      ts.source === 'template' &&
      ts.columns?.length > 1 &&
      ts.data?.length > 0
    );
    if (hasData) return;

    setTsLoading(true);
    (async () => {
      try {
        const nameLower = (currentModel.name || '').toLowerCase();
        let templateId = currentModel.metadata?.templateId;
        if (!templateId) {
          if (nameLower.includes('german')) templateId = 'german';
          else if (nameLower.includes('chil')) templateId = 'chilean';
          else if (nameLower.includes('europ')) templateId = 'european';
          else if (nameLower.includes('usa') || nameLower.includes('americ')) templateId = 'usa';
        }
        const folder = TEMPLATE_FOLDER[templateId];
        if (!folder) return;
        let files = [...new Set((currentModel.timeSeries || []).map(ts => ts.file).filter(Boolean))];
        if (!files.length) files = TEMPLATE_CSV[templateId] || [];
        const loaded = [];
        for (const fileName of files) {
          let clean = fileName.includes('/') ? fileName.split('/').pop() : fileName;
          const resp = await fetch(`/templates/${folder}/timeseries_data/${clean}`);
          if (!resp.ok) continue;
          const text = await resp.text();
          if (text.trim().startsWith('<')) continue;
          await new Promise(resolve => Papa.parse(text, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete: (res) => {
              const cols = res.meta.fields || [];
              const data = res.data;
              const stats = {};
              cols.forEach(col => {
                const vals = data.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
                if (vals.length) stats[col] = {
                  min: Math.min(...vals), max: Math.max(...vals),
                  mean: vals.reduce((a, b) => a + b, 0) / vals.length,
                  sum: vals.reduce((a, b) => a + b, 0),
                };
              });
              loaded.push({
                id: `${currentModel.id}_${clean}_${Date.now()}`, name: clean.replace('.csv', ''),
                fileName: clean, data, columns: cols, dateColumn: cols[0],
                dataColumns: cols.slice(1), rowCount: data.length, statistics: stats,
                modelId: currentModel.id, modelName: currentModel.name, source: 'template',
              });
              resolve();
            },
          }));
        }
        if (loaded.length) {
          setTimeSeries(prev => [...prev.filter(ts => !(ts.modelId === currentModel.id && ts.source === 'template' && ts.columns?.length > 1)), ...loaded]);
        }
      } finally { setTsLoading(false); }
    })();
  }, [activeTab, currentModel?.id]); // eslint-disable-line

  // ── Chart options ────────────────────────────────────────────────────────

  // Tech type donut
  const techGroupDonut = useMemo(() => {
    const ORDER = ['supply','storage','conversion','demand','transmission','other'];
    const data = ORDER.filter(g => d.byParent[g]?.length).map(g => ({
      name: g.charAt(0).toUpperCase() + g.slice(1), value: d.byParent[g].length,
      itemStyle: { color: PARENT_COLORS[g] },
    }));
    if (!data.length) return null;
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: p => `${p.name}: <b>${p.value} techs</b> (${p.percent}%)` },
      legend: { bottom: 4, type: 'scroll', textStyle: { fontSize: 10, color: '#475569' } },
      series: [{ type: 'pie', radius: ['44%','72%'], center: ['50%','44%'], label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } }, data }],
    };
  }, [d.byParent]);

  // Capacity by tech (horizontal bar)
  const capByTechOpt = useMemo(() => {
    const entries = Object.entries(d.capByTech).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 20);
    if (!entries.length) return null;
    const { div, unit } = autoScale(entries[0][1], 'MW');
    const fmt = scaledFmt(div);
    return {
      backgroundColor: 'transparent',
      grid: { left: 155, right: 70, top: 10, bottom: 10 },
      xAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: entries.map(([id]) => getTechName(id)), axisLabel: { fontSize: 10, color: '#475569' }, inverse: true },
      series: [{ type: 'bar', barMaxWidth: 22, data: entries.map(([id, v]) => ({ value: v, itemStyle: { color: getTechColor(id), borderRadius: [0,4,4,0] } })), label: { show: true, position: 'right', formatter: p => fmt(p.value) + ' ' + unit, fontSize: 9, color: '#64748b' } }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmtNum(p[0].value)} MW</b>` },
    };
  }, [d.capByTech, getTechColor, getTechName]);

  // Stacked capacity by location
  const capPerLocOpt = useMemo(() => {
    const locEntries = Object.entries(d.capByLoc).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 15);
    if (!locEntries.length) return null;
    const locs = locEntries.map(([k]) => k);
    const techs = [...new Set(locs.flatMap(l => Object.keys(d.locByTech[l] || {})))];
    const max = locEntries[0][1];
    const { div, unit } = autoScale(max, 'MW');
    const fmt = scaledFmt(div);
    return {
      backgroundColor: 'transparent',
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' } },
      grid: { left: 55, right: 16, top: 12, bottom: 55 },
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 6 ? 35 : 0 } },
      yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      series: techs.map(id => ({ name: getTechName(id), type: 'bar', stack: 'total', data: locs.map(l => d.locByTech[l]?.[id] || 0), itemStyle: { color: getTechColor(id) }, emphasis: { focus: 'series' } })),
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    };
  }, [d.capByLoc, d.locByTech, getTechColor, getTechName]);

  // Tech / location bar
  const techsPerLocOpt = useMemo(() => {
    const entries = Object.entries(d.techsPerLoc).sort((a,b) => b[1].length - a[1].length).slice(0, 20);
    if (!entries.length) return null;
    return {
      backgroundColor: 'transparent',
      grid: { left: 120, right: 36, top: 10, bottom: 10 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#64748b' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: entries.map(([k]) => k), axisLabel: { fontSize: 10, color: '#475569' }, inverse: true },
      series: [{ type: 'bar', barMaxWidth: 18, data: entries.map(([,v]) => ({ value: v.length, itemStyle: { color: '#0ea5e9', borderRadius: [0,4,4,0] } })), label: { show: true, position: 'right', fontSize: 9, color: '#64748b' } }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}: <b>${p[0].value} techs</b>` },
    };
  }, [d.techsPerLoc]);

  // CAPEX by tech
  const capexOpt = useMemo(() => {
    const entries = Object.entries(d.costByTech).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 15);
    if (!entries.length) return null;
    const { div, unit } = autoScale(entries[0][1], '€');
    const fmt = scaledFmt(div);
    return {
      backgroundColor: 'transparent',
      grid: { left: 155, right: 70, top: 10, bottom: 10 },
      xAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 10, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: entries.map(([id]) => getTechName(id)), axisLabel: { fontSize: 10, color: '#475569' }, inverse: true },
      series: [{ type: 'bar', barMaxWidth: 22, data: entries.map(([id, v]) => ({ value: v, itemStyle: { color: getTechColor(id), borderRadius: [0,4,4,0] } })), label: { show: true, position: 'right', formatter: p => fmt(p.value) + ' ' + unit, fontSize: 9, color: '#64748b' } }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmt(p[0].value)} ${unit} CAPEX est.</b>` },
    };
  }, [d.costByTech, getTechColor, getTechName]);

  // Cost breakdown donut
  const costDonut = useMemo(() => {
    const capex = d.totalCapex, opex = d.totalOpex;
    if (!capex && !opex) return null;
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: p => `${p.name}: <b>${fmtNum(p.value, 0)} €</b> (${p.percent}%)` },
      legend: { bottom: 4, textStyle: { fontSize: 10, color: '#475569' } },
      series: [{ type: 'pie', radius: ['44%','72%'], center: ['50%','44%'], label: { show: false },
        data: [
          { name: 'CAPEX', value: capex, itemStyle: { color: '#f59e0b' } },
          { name: 'OPEX/yr', value: opex, itemStyle: { color: '#8b5cf6' } },
        ] }],
    };
  }, [d.totalCapex, d.totalOpex]);

  // ── KPI values ────────────────────────────────────────────────────────────
  const { div: capDiv, unit: capUnit } = autoScale(d.totalCap, 'MW');
  const { div: costDiv, unit: costUnit } = autoScale(d.totalCapex, '€');
  const genTechCount = d.byParent.supply?.length || 0;
  const tsCount = modelTimeSeries.length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Model Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">{currentModel ? currentModel.name : 'No model selected'} — input data</p>
        </div>
        <ModelSelector />
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-6 flex gap-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 border-b-2 text-sm font-medium transition-colors
                ${activeTab === id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
              <Icon size={14} />{label}
              {id === 'timeseries' && tsCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-600">{tsCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-5">

          {/* ── OVERVIEW ──────────────────────────────────────────────── */}
          {activeTab === 'overview' && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={FiMapPin}    label="Locations"       value={(locations||[]).length}               sub="nodes" />
              <KpiCard icon={FiLink}      label="Links"           value={(links||[]).length}                   sub="connections" />
              <KpiCard icon={FiZap}       label="Gen Technologies" value={genTechCount}                        sub="supply types" />
              <KpiCard icon={FiActivity}  label="Max Capacity"    value={(d.totalCap/capDiv).toFixed(1)}       sub={`${capUnit} total`} accent="bg-amber-500" />
              <KpiCard icon={FiDollarSign} label="Est. CAPEX"     value={(d.totalCapex/costDiv).toFixed(1)}    sub={costUnit} />
              <KpiCard icon={FiDollarSign} label="Est. OPEX/yr"   value={fmtNum(d.totalOpex)}                  sub="€/yr O&M" />
              <KpiCard icon={FiCpu}       label="Tech Categories" value={Object.keys(d.byParent).length}       sub="parent groups" />
              <KpiCard icon={FiClock}     label="Time Series"     value={tsCount || (timeSeries||[]).length}   sub="files" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Panel title="Location Map" icon={FiMap} className="lg:col-span-2">
                <div style={{ height: 380 }}>
                  <InputMap key={currentModel?.id} locations={locations||[]} links={links||[]} getTechColor={getTechColor} />
                </div>
              </Panel>
              <Panel title="Technology Categories" icon={FiPieChart}>
                {techGroupDonut
                  ? <ReactECharts option={techGroupDonut} style={{ height: 380 }} notMerge lazyUpdate />
                  : <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No technologies loaded</div>}
              </Panel>
            </div>
          </>)}

          {/* ── GENERATION ────────────────────────────────────────────── */}
          {activeTab === 'generation' && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={FiZap}      label="Supply Techs"    value={d.byParent.supply?.length || 0}       sub="generation types" accent="bg-amber-500" />
              <KpiCard icon={FiLayers}   label="Storage Techs"   value={d.byParent.storage?.length || 0}      sub="storage types" accent="bg-violet-500" />
              <KpiCard icon={FiActivity} label="Total Max Cap"   value={(d.totalCap/capDiv).toFixed(1)}       sub={capUnit} />
              <KpiCard icon={FiMapPin}   label="Locations"       value={Object.values(d.capByLoc).filter(v=>v>0).length} sub="with capacity" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel title="Installed Capacity by Technology" icon={FiBarChart2}>
                {capByTechOpt
                  ? <ReactECharts option={capByTechOpt} style={{ height: Math.max(200, Object.keys(d.capByTech).filter(k=>d.capByTech[k]>0).slice(0,20).length * 26 + 24) }} notMerge lazyUpdate />
                  : <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No capacity data</div>}
              </Panel>
              <Panel title="Technology Types Distribution" icon={FiPieChart}>
                {techGroupDonut
                  ? <ReactECharts option={techGroupDonut} style={{ height: 340 }} notMerge lazyUpdate />
                  : <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data</div>}
              </Panel>
            </div>

            <Panel title="Capacity Mix by Location (top 15)" icon={FiBarChart2}>
              {capPerLocOpt
                ? <ReactECharts option={capPerLocOpt} style={{ height: 340 }} notMerge lazyUpdate />
                : <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data</div>}
            </Panel>

            {/* Tech catalogue (supply/storage) */}
            <Panel title="Generation & Storage Technologies" icon={FiLayers} defaultOpen={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    {['','Name','ID','Type','Max Cap (MW)','CAPEX (€/MW)','Lifetime'].map(h => <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.allTechIds.filter(id => ['supply','storage','conversion'].includes(getTechParent(id))).map((id, i) => {
                      const tech = techMap.get(id);
                      const ess = tech?.essentials || {};
                      const con = tech?.constraints || {};
                      const costs = tech?.costs?.monetary || {};
                      const cap = con.energy_cap_max === 'inf' || con.energy_cap_max === '.inf' ? '∞' : (con.energy_cap_max ?? '—');
                      return (
                        <tr key={id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2"><span className="w-3 h-3 rounded-full inline-block" style={{ background: getTechColor(id) }} /></td>
                          <td className="px-3 py-2 font-medium text-slate-700">{ess.name || id.replace(/_/g,' ')}</td>
                          <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{id}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: PARENT_COLORS[getTechParent(id)] + '22', color: PARENT_COLORS[getTechParent(id)] }}>{ess.parent || '—'}</span></td>
                          <td className="px-3 py-2 text-right text-slate-600">{cap}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{costs.energy_cap ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{con.lifetime ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Resource profile charts */}
            {(() => {
              const genFiles = modelTimeSeries.filter(ts => !/demand/i.test(ts.name));
              if (!genFiles.length && !tsLoading) return null;
              const activeGenTs = genFiles[Math.min(genTsActiveIdx, Math.max(0, genFiles.length - 1))] || null;
              const filteredGenChart = activeGenTs ? buildFilteredChart(activeGenTs, genViewOpts, '#16a34a') : null;
              const genHeatCharts = activeGenTs
                ? buildTsCharts(activeGenTs, '#16a34a', ['#dcfce7','#86efac','#22c55e','#15803d','#14532d'],
                    genViewOpts.locs?.length > 0 ? genViewOpts.locs : null)
                : null;
              return (
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <FiSun size={14} className="text-green-500" />
                    Generation Resource Profiles
                    {activeGenTs && <span className="font-normal text-[10px] text-slate-400">({activeGenTs.dataColumns.length} locations · {activeGenTs.rowCount} steps)</span>}
                  </h3>
                  {tsLoading && !activeGenTs && (
                    <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
                      <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Loading generation profiles…</p>
                    </div>
                  )}
                  {!tsLoading && !activeGenTs && (
                    <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                      No generation resource files loaded. Visit the{' '}
                      <button onClick={() => setActiveTab('timeseries')} className="text-indigo-500 underline">Time Series tab</button>
                      {' '}to load.
                    </div>
                  )}
                  {activeGenTs && (<>
                    {genFiles.length > 1 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {genFiles.map((ts, idx) => (
                          <button key={ts.id} onClick={() => setGenTsActiveIdx(idx)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                            style={genTsActiveIdx === idx
                              ? { background: '#16a34a', color: 'white', borderColor: '#16a34a' }
                              : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                            {ts.name} <span className="opacity-60 ml-1">{ts.dataColumns.length} locs</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-4 items-start">
                      {/* Left: charts stack */}
                      <div className="flex-1 min-w-0 space-y-4">
                        {filteredGenChart ? (
                          <>
                            <Panel title={`Resource Profile — ${filteredGenChart.colCount} location${filteredGenChart.colCount !== 1 ? 's' : ''} · ${filteredGenChart.rowCount} points`} icon={FiZap}>
                              <ReactECharts option={filteredGenChart.opt} style={{ height: 240 }} notMerge lazyUpdate />
                            </Panel>
                            {genHeatCharts && (
                              <Panel title="Annual Resource Heatmap — capacity factor by hour × day" icon={FiClock}>
                                <ReactECharts option={genHeatCharts.heatOpt} style={{ height: 320 }} notMerge lazyUpdate />
                              </Panel>
                            )}
                          </>
                        ) : (
                          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                            No data for the selected filter combination.
                          </div>
                        )}
                      </div>
                      {/* Right: filter sidebar */}
                      <TsViewControls
                        opts={genViewOpts} onChange={setGenViewOpts}
                        ts={activeGenTs} locSearch={genLocSearch} onLocSearch={setGenLocSearch}
                        accentColor="#16a34a" />
                    </div>
                  </>)}
                </div>
              );
            })()}
          </>)}

          {/* ── DEMAND ────────────────────────────────────────────────── */}
          {activeTab === 'demand' && (() => {
            const demandTs = modelTimeSeries.find(ts => /demand/i.test(ts.name));

            // Demand locations: match by TS column name (trimmed) OR by demand_types CSV column
            // demand_types is persisted on the location object so it works after reload too.
            const tsLocSet = demandTs?.dataColumns
              ? new Set(demandTs.dataColumns.map(c => c.trim()))
              : null;
            const demandLocs = (locations || []).filter(loc => {
              const name = (loc.name || '').trim();
              if (tsLocSet) return tsLocSet.has(name);
              return loc.hasDemand || (loc.demand_types && loc.demand_types.length > 0);
            });

            const charts = demandTs
              ? buildTsCharts(demandTs, '#ef4444', ['#fef3c7','#fcd34d','#f59e0b','#b45309','#78350f'],
                  demandViewOpts.locs?.length > 0 ? demandViewOpts.locs : null)
              : null;
            const filteredDemandChart = demandTs ? buildFilteredChart(demandTs, demandViewOpts, '#ef4444') : null;

            const totalMWh = demandTs
              ? Object.values(demandTs.statistics || {}).reduce((s, st) => s + Math.abs(st?.sum || 0), 0)
              : 0;
            const { div: mwhDiv, unit: mwhUnit } = autoScale(totalMWh || 1, 'MW');

            // Use either TS-confirmed count or demand_types-derived count from locations
            const demandLocsFromCsv = (locations || []).filter(loc =>
              loc.demand_types && loc.demand_types.length > 0
            );
            const displayCount = demandLocs.length || demandLocsFromCsv.length;
            // For the grid, prefer demand_types-sourced list when TS not yet loaded
            const gridLocs = demandLocs.length > 0 ? demandLocs : demandLocsFromCsv;

            return (<>
              {/* Loading indicator while TS auto-loads */}
              {tsLoading && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-amber-700">
                  <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full flex-shrink-0" />
                  Loading demand time series… charts will appear shortly.
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={FiActivity}  label="Demand Locations"  value={displayCount || '—'}
                  sub={tsLocSet ? 'from demand file' : 'from locations CSV'} accent="bg-red-500" />
                <KpiCard icon={FiClock}     label="Time Steps"
                  value={demandTs ? demandTs.rowCount : (tsLoading ? '…' : 'not loaded')}
                  sub={demandTs?.name || (tsLoading ? 'loading…' : 'open Time Series tab')} />
                <KpiCard icon={FiMapPin}    label="Total Nodes"       value={(locations||[]).length} sub="all locations" />
                <KpiCard icon={FiBarChart2} label="Annual Demand"
                  value={totalMWh ? (totalMWh / mwhDiv).toFixed(1) : '—'}
                  sub={totalMWh ? `${mwhUnit}·h/yr total` : (tsLoading ? 'computing…' : 'TS needed')} />
              </div>

              {/* Demand location grid — collapsed by default */}
              <Panel title={`Demand Locations (${gridLocs.length})`} icon={FiActivity} defaultOpen={false}>
                {gridLocs.length > 0 ? (
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                    {gridLocs.slice(0, 150).map(loc => (
                      <div key={loc.name} className="rounded border border-red-100 bg-red-50 px-2 py-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        <p className="text-[10px] text-slate-700 truncate" title={loc.name}>{loc.name}</p>
                      </div>
                    ))}
                    {gridLocs.length > 150 && (
                      <div className="col-span-full text-[10px] text-slate-400 pl-1 pt-1">
                        +{gridLocs.length - 150} more demand locations
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 text-sm">
                    {tsLoading
                      ? 'Detecting demand locations…'
                      : 'No demand locations found. Ensure locations CSV has a "demand_types" column.'}
                  </div>
                )}
              </Panel>

              {/* Charts — interactive with right-sidebar filters */}
              {demandTs ? (
                <div className="flex gap-4 items-start">
                  {/* Left: charts stack */}
                  <div className="flex-1 min-w-0 space-y-4">
                    {filteredDemandChart ? (
                      <Panel title={`Aggregate Demand — ${filteredDemandChart.colCount} location${filteredDemandChart.colCount !== 1 ? 's' : ''} · ${filteredDemandChart.rowCount} points`} icon={FiActivity}>
                        <ReactECharts option={filteredDemandChart.opt} style={{ height: 240 }} notMerge lazyUpdate />
                      </Panel>
                    ) : (
                      <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">No data for the selected filters.</div>
                    )}
                    {charts && (
                      <Panel title="Annual Demand Heatmap — total demand by hour × day" icon={FiClock}>
                        <ReactECharts option={charts.heatOpt} style={{ height: 320 }} notMerge lazyUpdate />
                      </Panel>
                    )}
                  </div>
                  {/* Right: filter sidebar */}
                  <TsViewControls
                    opts={demandViewOpts} onChange={setDemandViewOpts}
                    ts={demandTs} locSearch={demandLocSearch} onLocSearch={setDemandLocSearch}
                    accentColor="#ef4444" />
                </div>
              ) : !tsLoading && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-400">
                  <FiClock size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Demand time series not yet loaded.</p>
                  <p className="text-[11px] mt-1">
                    Visit the{' '}
                    <button onClick={() => setActiveTab('timeseries')} className="text-indigo-500 underline text-[11px]">
                      Time Series tab
                    </button>{' '}
                    — data loads automatically for template models.
                  </p>
                </div>
              )}
            </>);
          })()}

          {/* ── NETWORK ───────────────────────────────────────────────── */}
          {activeTab === 'network' && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={FiLink}     label="Transmission Links" value={(links||[]).length}                  sub="connections" accent="bg-sky-500" />
              <KpiCard icon={FiMapPin}   label="Locations"         value={(locations||[]).length}               sub="nodes" />
              <KpiCard icon={FiZap}      label="Transmission Techs" value={d.byParent.transmission?.length || 0} sub="link technologies" />
              <KpiCard icon={FiActivity} label="Avg Techs / Node"  value={((d.allTechIds.length / Math.max(1,(locations||[]).length))).toFixed(1)} sub="technologies per node" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Panel title="Location Map" icon={FiMap} className="lg:col-span-2">
                <div style={{ height: 380 }}>
                  <InputMap key={currentModel?.id} locations={locations||[]} links={links||[]} getTechColor={getTechColor} />
                </div>
              </Panel>
              <Panel title="Technologies per Location" icon={FiBarChart2}>
                {techsPerLocOpt
                  ? <ReactECharts option={techsPerLocOpt} style={{ height: 380 }} notMerge lazyUpdate />
                  : <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No data</div>}
              </Panel>
            </div>

            {(links||[]).length > 0 && (
              <Panel title={`Transmission Links (${(links||[]).length})`} icon={FiLink} defaultOpen={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-50 border-b border-slate-200">
                      {['From','To','Technology','Distance (km)','Max Cap (MW)'].map(h => <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(links||[]).map((link, i) => {
                        const tid = link.technology || link.tech || link.type || '';
                        const cap = link.constraints?.energy_cap_max ?? link.techs?.[tid]?.constraints?.energy_cap_max;
                        return (
                          <tr key={i} className={i%2===0?'bg-white':'bg-slate-50/50'}>
                            <td className="px-3 py-2 font-medium text-slate-700">{link.from||link.source||'—'}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{link.to||link.target||'—'}</td>
                            <td className="px-3 py-2">{tid && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{background:getTechColor(tid)}} />{tid.replace(/_/g,' ')}</span>}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{link.distance?(+link.distance).toFixed(1):'—'}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{cap==='inf'||cap==='.inf'?'∞':(cap??'—')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </>)}

          {/* ── COST ──────────────────────────────────────────────────── */}
          {activeTab === 'cost' && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={FiDollarSign} label="Total CAPEX Est." value={(d.totalCapex/costDiv).toFixed(1)} sub={costUnit} accent="bg-amber-500" />
              <KpiCard icon={FiDollarSign} label="Total OPEX/yr"    value={fmtNum(d.totalOpex)}              sub="€/yr O&M" />
              <KpiCard icon={FiZap}        label="Paid Capacity"    value={(d.totalCap/capDiv).toFixed(1)}    sub={`${capUnit} with cost >0`} />
              <KpiCard icon={FiCpu}        label="Cost Tech Count"  value={Object.keys(d.costByTech).length}  sub="technologies" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel title="Estimated CAPEX by Technology" icon={FiBarChart2}>
                {capexOpt
                  ? <ReactECharts option={capexOpt} style={{ height: Math.max(200, Object.keys(d.costByTech).filter(k=>d.costByTech[k]>0).slice(0,15).length*26+24) }} notMerge lazyUpdate />
                  : <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No cost data (capacities may be ∞)</div>}
              </Panel>
              <Panel title="CAPEX vs OPEX Split" icon={FiPieChart}>
                {costDonut
                  ? <ReactECharts option={costDonut} style={{ height: 320 }} notMerge lazyUpdate />
                  : <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No cost data</div>}
              </Panel>
            </div>

            <Panel title="Full Technology Cost Table" icon={FiLayers} defaultOpen={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    {['','Name','Type','Max Cap (MW)','CAPEX rate (€/MW)','CAPEX est.','OPEX/yr (€)','Lifetime'].map(h=><th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.allTechIds.map((id, i) => {
                      const tech = techMap.get(id);
                      const ess = tech?.essentials || {};
                      const con = tech?.constraints || {};
                      const costs = tech?.costs?.monetary || {};
                      const cap = con.energy_cap_max==='inf'||con.energy_cap_max==='.inf'?'∞':(con.energy_cap_max??'—');
                      return (
                        <tr key={id} className={i%2===0?'bg-white':'bg-slate-50/50'}>
                          <td className="px-3 py-2"><span className="w-3 h-3 rounded-full inline-block" style={{background:getTechColor(id)}} /></td>
                          <td className="px-3 py-2 font-medium text-slate-700">{ess.name||id.replace(/_/g,' ')}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">{ess.parent||'—'}</span></td>
                          <td className="px-3 py-2 text-right text-slate-600">{cap}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{costs.energy_cap??'—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">{d.costByTech[id]?fmtNum(d.costByTech[id],0)+' €':'—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{costs.om_annual??'—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{con.lifetime??'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>)}

          {/* ── TIME SERIES ───────────────────────────────────────────── */}
          {activeTab === 'timeseries' && (() => {
            return (<>
              {tsLoading && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Loading time series data…</p>
                </div>
              )}
              {!tsLoading && modelTimeSeries.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
                  <FiClock size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No time series data loaded for this model.</p>
                  <p className="text-[11px] mt-1">Template models load data automatically when you first open this tab.</p>
                </div>
              )}
              {!tsLoading && modelTimeSeries.length > 0 && (() => {
                const safeIdx = Math.min(tsActiveIdx, Math.max(0, modelTimeSeries.length - 1));
                const activeTsFile = modelTimeSeries[safeIdx];
                const isDemandActive = activeTsFile && /demand/i.test(activeTsFile.name);
                const tsAccent = isDemandActive ? '#ef4444' : '#16a34a';
                const tsHeatColors = isDemandActive
                  ? ['#fef2f2','#fca5a5','#f87171','#dc2626','#991b1b']
                  : ['#dcfce7','#86efac','#22c55e','#15803d','#14532d'];
                const filteredTsChart = activeTsFile ? buildFilteredChart(activeTsFile, tsViewOpts, tsAccent) : null;
                const tsHeatCharts = activeTsFile
                  ? buildTsCharts(activeTsFile, tsAccent, tsHeatColors, tsViewOpts.locs?.length > 0 ? tsViewOpts.locs : null)
                  : null;
                return (<>
                  {/* KPI summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard icon={FiClock}     label="Files Loaded"   value={modelTimeSeries.length}                                      sub="time series" accent="bg-indigo-500" />
                    <KpiCard icon={FiActivity}  label="Demand Files"   value={modelTimeSeries.filter(ts => /demand/i.test(ts.name)).length}  sub="matched by name" />
                    <KpiCard icon={FiSun}       label="Resource Files" value={modelTimeSeries.filter(ts => !/demand/i.test(ts.name)).length} sub="PV / wind" />
                    <KpiCard icon={FiBarChart2} label="Total Rows"     value={fmtNum(modelTimeSeries.reduce((s, ts) => s + (ts.rowCount || 0), 0), 0)} sub="timesteps across files" />
                  </div>

                  {/* File selector tabs */}
                  {modelTimeSeries.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {modelTimeSeries.map((ts, idx) => {
                        const isd = /demand/i.test(ts.name);
                        const active = safeIdx === idx;
                        return (
                          <button key={ts.id}
                            onClick={() => { setTsActiveIdx(idx); setTsViewOpts({ mode: 'weeks2', month: 0, season: 'DJF', customStart: '', customEnd: '', locs: [], resolution: 'hourly' }); setTsLocSearch(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                            style={active
                              ? { background: isd ? '#ef4444' : '#16a34a', color: 'white', borderColor: isd ? '#ef4444' : '#16a34a' }
                              : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                            {ts.name}
                            <span className="ml-1.5 opacity-60">{ts.dataColumns?.length ?? 0} cols</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Chart + sidebar */}
                  {activeTsFile && (
                    <div className="flex gap-4 items-start">
                      {/* Left: charts */}
                      <div className="flex-1 min-w-0 space-y-4">
                        {filteredTsChart ? (
                          <Panel
                            title={`${activeTsFile.name} — ${filteredTsChart.colCount} column${filteredTsChart.colCount !== 1 ? 's' : ''} · ${filteredTsChart.rowCount} points`}
                            icon={isDemandActive ? FiActivity : FiZap}>
                            <ReactECharts option={filteredTsChart.opt} style={{ height: 240 }} notMerge lazyUpdate />
                          </Panel>
                        ) : (
                          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                            No data for the selected filter combination.
                          </div>
                        )}
                        {tsHeatCharts && (
                          <Panel title={`Annual Heatmap — ${activeTsFile.name}`} icon={FiClock}>
                            <ReactECharts option={tsHeatCharts.heatOpt} style={{ height: 320 }} notMerge lazyUpdate />
                          </Panel>
                        )}
                      </div>
                      {/* Right: filter sidebar */}
                      <TsViewControls
                        opts={tsViewOpts} onChange={setTsViewOpts}
                        ts={activeTsFile} locSearch={tsLocSearch} onLocSearch={setTsLocSearch}
                        accentColor={tsAccent} />
                    </div>
                  )}
                </>);
              })()}
            </>);
          })()}

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
