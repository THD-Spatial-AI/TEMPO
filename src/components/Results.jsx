import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import ReactECharts from 'echarts-for-react';
import {
  FiBarChart2, FiPieChart, FiTrendingUp, FiDownload,
  FiRefreshCw, FiAlertCircle, FiCheckCircle, FiTrash2,
  FiTerminal, FiAlertTriangle, FiMapPin, FiDollarSign,
  FiZap, FiActivity, FiClock, FiCpu, FiMap, FiLayers, FiShare2, FiGrid,
  FiChevronDown, FiFilter, FiGitMerge, FiSearch, FiX,
} from 'react-icons/fi';
import 'maplibre-gl/dist/maplibre-gl.css';
import ScenarioComparison from './ScenarioComparison';

// ── Tech colour palette ──────────────────────────────────────────────────────
const TECH_COLORS = {
  solar_pv:          '#FDB813',
  solar:             '#FDB813',
  wind_onshore:      '#00A8CC',
  wind_offshore:     '#005082',
  wind:              '#00A8CC',
  hydro:             '#1976D2',
  nuclear:           '#E91E63',
  gas_ccgt:          '#FF6F00',
  gas:               '#FF6F00',
  coal:              '#424242',
  biomass:           '#689F38',
  battery_storage:   '#9C27B0',
  storage:           '#AB9BAC',
  ac_transmission:   '#78909C',
  hvdc_transmission: '#546E7A',
  power_demand:      '#D32F2F',
  demand:            '#D32F2F',
};

const techColor = (name) => {
  if (!name) return '#94A3B8';
  const n = name.toLowerCase();
  for (const [k, c] of Object.entries(TECH_COLORS)) {
    if (n === k || n.includes(k)) return c;
  }
  return '#94A3B8';
};

const fmtNum = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(dec) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(dec) + 'k';
  return n.toFixed(dec);
};
const fmtFull = (v) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
};
// Unit-aware formatters — include the SI-scaled unit in their output so callers
// never need to append a unit string manually (which caused "4.5MMW" bugs).
const fmtPower = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v); const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(dec) + ' TW';
  if (abs >= 1e3) return (n / 1e3).toFixed(dec) + ' GW';
  if (abs > 0 && abs < 1) return (n * 1e3).toFixed(dec) + ' kW';
  return n.toFixed(dec) + ' MW';
};
const fmtEnergy = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v); const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(dec) + ' TWh';
  if (abs >= 1e3) return (n / 1e3).toFixed(dec) + ' GWh';
  if (abs > 0 && abs < 1) return (n * 1e3).toFixed(dec) + ' kWh';
  return n.toFixed(dec) + ' MWh';
};
const fmtCost = (v, dec = 1) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v); const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(dec) + ' G€';
  if (abs >= 1e6) return (n / 1e6).toFixed(dec) + ' M€';
  if (abs >= 1e3) return (n / 1e3).toFixed(dec) + ' k€';
  return n.toFixed(dec) + ' €';
};

// Auto-scale a raw value → { div, unit } so axis ticks show clean numbers.
const autoScale = (maxVal, baseUnit = 'MW') => {
  const abs = Math.abs(maxVal || 0);
  if (baseUnit === 'MW') {
    if (abs >= 1e6) return { div: 1e6, unit: 'TW' };
    if (abs >= 1e3) return { div: 1e3, unit: 'GW' };
    if (abs > 0 && abs < 1) return { div: 1e-3, unit: 'kW' };
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
// Shared ECharts axis-name style (unit placed once at the end of the axis).
const axisNameStyle = (unit) => ({
  name: unit, nameLocation: 'end', nameGap: 8,
  nameTextStyle: { fontSize: 9, color: '#94a3b8', fontStyle: 'italic' },
});
const scaledFmt = (div, decimals = 1) => (v) => (v / div).toFixed(decimals);

// Tech classification groups for the filter bar
// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY classification uses the model's tech definitions (essentials.parent)
// and the backend result's tech_parents map — both are authoritative.
// This module-level classifyTech() is a FALLBACK for custom/imported models
// whose names don't match any definition.
//
// Calliope parent types → group IDs:
//   supply / supply_plus  → 'gen'
//   storage               → 'stor'
//   conversion(_plus)     → 'conv'
//   transmission          → 'tx'
//   demand                → 'demand'
//
// Additional heuristics for short abbreviations common in Spanish/Chilean models:
//   pFV / FV → solar     eol → wind     hid → hydro
//   ter / TER → thermal  bat → battery  emb → reservoir storage
const TECH_GROUPS = [
  {
    id: 'tx', label: 'Links', color: '#0ea5e9',
    // Structural: colon inside name = "techType:destLocation" in Calliope
    match: (t) => t.includes(':'),
  },
  {
    id: 'demand', label: 'Demand', color: '#ef4444',
    match: (base) => /\bdemand\b|\bload\b|\bconsumo\b|\bdemanda\b/i.test(base),
  },
  {
    id: 'stor', label: 'Storage', color: '#8b5cf6',
    match: (base) => /\bbat(ter)?\b|_bat\b|bat_|\bBATT?|storage(?!.*tx|.*pipe)|pumped|embalse|\bemb\b|capacitor|thermal.?stor|heat.?stor/i.test(base),
  },
  {
    id: 'h2', label: 'Hydrogen', color: '#7c3aed',
    match: (base) => /\bh2\b|hydrogen|electrolys|fuel.?cell|h2_|_h2|hidrogeno|pila/i.test(base),
  },
  {
    id: 'conv', label: 'Conversion', color: '#10b981',
    match: (base) => /heat.?pump|boiler|chp|methan|fischer|haber|dac|desalination|convert/i.test(base),
  },
  {
    id: 'gen', label: 'Generation', color: '#f59e0b',
    match: (base) => /solar|\bpv\b|pfv\b|fv\b|wind|\beol|hidro|hydro(?!gen)|biomass|coal|gas\b|nuclear|geotherm|csp|ccgt|ocgt|diesel|oil|lignite|turbine|ter\b|termica|hid\b|hidraulic|ernc|renovable/i.test(base),
  },
  {
    id: 'infra', label: 'Substations', color: '#94a3b8',
    match: (base) => /substation|busbar|\bbus\b|\bhub\b|transformer|\bnode\b|barra|subestacion|\bSE_/i.test(base),
  },
];
// Pure fallback classifier (no model context). Used by classifyTechSmart when
// no parent info is available.
const classifyTech = (t) => {
  if (t.includes(':')) return 'tx';
  const base = t.split(':')[0];
  return TECH_GROUPS.find(g => g.match(base))?.id ?? 'other';
};
// For a link tech like "pFV:CHERCAN", return the base type label "pFV"
const linkTechBase = (t) => t.split(':')[0];

// Replicate Python's _safe_id(name).lower() — the exact transform Calliope applies
// to frontend model location names before they become result keys.
const calliopeLocName = (name) => {
  const s = String(name).trim();
  return s.replace(/::/g, '__').replace(/:/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '')
    .toLowerCase() || 'unknown';
};

// Parse "Berlin::solar_pv::electricity" → {loc, tech, carrier}
const parseLTC = (s) => {
  const p = String(s).split('::');
  if (p.length >= 3) return { loc: p[0], tech: p[1], carrier: p[2] };
  if (p.length === 2) return { loc: p[0], tech: p[1], carrier: '' };
  return { loc: '', tech: p[0], carrier: '' };
};

// OSM map style — attribution required per OpenStreetMap tile usage policy:
// https://operations.osmfoundation.org/policies/tiles/
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};


// Inject Referer + User-Agent on OSM tile/geocode requests when running
// outside Electron (in Electron, main.cjs session.webRequest handles this).
const osmTransformRequest = (url) => {
  if (/tile\.openstreetmap\.org|nominatim\.openstreetmap\.org|basemaps\.cartocdn\.com|tile\.opentopomap\.org/.test(url)) {
    return { url, headers: { Referer: 'https://www.openstreetmap.org/', 'User-Agent': 'TEMPO-Energy-Tool/1.0' } };
  }
  return { url };
};

// ── Capacity / Generation map ───────────────────────────────────────────────
const ResultsMap = ({ locations, capacitiesByLoc, dominantTechByLoc, generationByLoc, viewMode, colorFn = techColor, transmissionLinks = [] }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const legendEntries = useMemo(() => {
    const seen = new Map();
    Object.values(dominantTechByLoc || {}).forEach(tech => {
      if (tech && !seen.has(tech)) seen.set(tech, colorFn(tech));
    });
    return [...seen.entries()];
  }, [dominantTechByLoc, colorFn]);

  const maxGenByLoc = useMemo(() => {
    const lk = (loc) => loc.calliopeName || loc.name;
    const vals = (locations || []).filter(l => l.latitude && l.longitude).map(l => generationByLoc?.[lk(l)] || 0);
    return Math.max(1, ...vals);
  }, [locations, generationByLoc]);

  const maxCapByLoc = useMemo(() => {
    const lk = (loc) => loc.calliopeName || loc.name;
    const vals = (locations || []).filter(l => l.latitude && l.longitude).map(l => capacitiesByLoc?.[lk(l)] || 0);
    return Math.max(1, ...vals);
  }, [locations, capacitiesByLoc]);

  // ── Capacity view: transmission lines + platform-consistent node markers ──
  const drawCapacityView = (map, mgl, locs) => {
    // Transmission lines (drawn before markers so nodes appear on top)
    if (transmissionLinks.length > 0) {
      const locMap = Object.fromEntries(locs.map(l => [l.calliopeName || l.name, l]));
      const features = transmissionLinks.flatMap(({ fromLoc, toLoc, cap }) => {
        const from = locMap[fromLoc]; const to = locMap[toLoc];
        if (!from || !to) return [];
        return [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }, properties: { cap, lineWidth: Math.max(1.5, Math.min(6, 1.5 + cap / 500)) } }];
      });
      if (features.length > 0) {
        map.addSource('cap-links', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({ id: 'cap-links-casing', type: 'line', source: 'cap-links',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['+', ['get', 'lineWidth'], 3], 'line-opacity': 0.75 } });
        map.addLayer({ id: 'cap-links-fill', type: 'line', source: 'cap-links',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#94a3b8', 'line-width': ['get', 'lineWidth'], 'line-opacity': 0.85 } });
      }
    }

    // Node markers — white circles, colored border by dominant tech, labeled
    const lk = (loc) => loc.calliopeName || loc.name;
    const maxCap = Math.max(1, ...locs.map(l => capacitiesByLoc[lk(l)] || 0));
    locs.forEach(loc => {
      const key = lk(loc);
      const cap = capacitiesByLoc[key] || 0;
      const r = 8 + Math.sqrt(cap / maxCap) * 30;
      const color = colorFn(dominantTechByLoc[key] || 'generic');
      const fontSize = Math.max(8, Math.min(11, r * 0.52));
      const subSize = Math.max(7, Math.min(10, r * 0.44));
      const el = document.createElement('div');
      el.style.cssText = `width:${r*2}px;height:${r*2}px;border-radius:50%;background:rgba(255,255,255,0.97);border:2.5px solid ${color};box-shadow:0 1px 6px rgba(0,0,0,0.15);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;`;
      el.innerHTML = `<span style="color:#1e293b;font-size:${fontSize}px;font-weight:700;font-family:'DM Sans',system-ui;line-height:1.15;text-align:center;pointer-events:none;padding:2px;text-shadow:0 1px 2px rgba(255,255,255,0.9)">${loc.name}<br/><span style="color:${color};font-size:${subSize}px;font-weight:700;text-shadow:-0.5px -0.5px 0 rgba(0,0,0,0.4),0.5px -0.5px 0 rgba(0,0,0,0.4),-0.5px 0.5px 0 rgba(0,0,0,0.4),0.5px 0.5px 0 rgba(0,0,0,0.4)">${fmtPower(cap, 0)}</span></span>`;
      const popup = new mgl.Popup({ offset: r + 4, closeButton: false, maxWidth: '220px' })
        .setHTML(`<div style="font-family:'DM Sans',system-ui;padding:4px"><b style="font-size:13px;color:#1e293b">${loc.name}</b><br/><small style="color:#64748b">Capacity: <b>${fmtPower(cap, 2)}</b><br/>Dominant: ${(dominantTechByLoc[key]||'—').replace(/_/g,' ')}</small></div>`);
      const m = new mgl.Marker({ element: el }).setLngLat([loc.longitude, loc.latitude]).setPopup(popup).addTo(map);
      markersRef.current.push(m);
    });
  };

  // ── Generation heatmap view ──
  const drawGenerationView = (map, mgl, locs) => {
    const genMap = generationByLoc || {};
    const lk = (loc) => loc.calliopeName || loc.name;
    const values = locs.map(l => genMap[lk(l)] || 0);
    const maxGen = Math.max(1, ...values);

    // Transmission lines for network topology context (same style as capacity view)
    if (transmissionLinks.length > 0) {
      const locMap = Object.fromEntries(locs.map(l => [l.calliopeName || l.name, l]));
      const features = transmissionLinks.flatMap(({ fromLoc, toLoc, cap }) => {
        const from = locMap[fromLoc]; const to = locMap[toLoc];
        if (!from || !to) return [];
        return [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] }, properties: { cap, lineWidth: Math.max(1.5, Math.min(6, 1.5 + cap / 500)) } }];
      });
      if (features.length > 0) {
        map.addSource('gen-links', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({ id: 'gen-links-casing', type: 'line', source: 'gen-links',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['+', ['get', 'lineWidth'], 3], 'line-opacity': 0.6 } });
        map.addLayer({ id: 'gen-links-fill', type: 'line', source: 'gen-links',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#94a3b8', 'line-width': ['get', 'lineWidth'], 'line-opacity': 0.7 } });
      }
    }

    // Generation circles — size AND fill color encode output (amber → orange → red)
    // Matches the legend gradient exactly; avoids MapLibre heatmap-density artifacts
    // which are unreliable for sparse discrete nodes like a regional grid.
    const genFill = (pct) => {
      if (pct > 0.75) return '#dc2626';
      if (pct > 0.50) return '#ea580c';
      if (pct > 0.25) return '#f59e0b';
      return '#fbbf24';
    };
    locs.forEach(loc => {
      const gen = genMap[lk(loc)] || 0;
      const pct = gen / maxGen;
      const r = 13 + pct * 24;
      const fill = genFill(pct);
      const fontSize = Math.max(7.5, Math.min(11, r * 0.52));
      const subSize  = Math.max(6.5, Math.min(10,  r * 0.44));
      const el = document.createElement('div');
      el.style.cssText = `width:${r*2}px;height:${r*2}px;border-radius:50%;background:${fill};border:2px solid rgba(255,255,255,0.55);box-shadow:0 2px 8px rgba(0,0,0,0.22);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;`;
      el.innerHTML = `<span style="color:#fff;font-size:${fontSize}px;font-weight:700;font-family:'DM Sans',system-ui;line-height:1.15;text-align:center;pointer-events:none;padding:2px;text-shadow:0 1px 3px rgba(0,0,0,0.45)">${loc.name}<br/><span style="font-size:${subSize}px;font-weight:600;opacity:0.92">${fmtEnergy(gen, 0)}</span></span>`;
      const popup = new mgl.Popup({ offset: r + 4, closeButton: false, maxWidth: '220px' })
        .setHTML(`<div style="font-family:'DM Sans',system-ui;padding:4px"><b style="color:#1e293b">${loc.name}</b><br/><small style="color:#64748b">Generation: <b>${fmtEnergy(gen, 2)}</b><br/>${(pct * 100).toFixed(1)}% of max</small></div>`);
      const m = new mgl.Marker({ element: el }).setLngLat([loc.longitude, loc.latitude]).setPopup(popup).addTo(map);
      markersRef.current.push(m);
    });
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let destroyed = false;
    import('maplibre-gl').then(({ default: mgl }) => {
      if (destroyed || !mapRef.current) return;
      const locs = locations.filter(l => l.latitude && l.longitude);
      const avgLat = locs.length ? locs.reduce((s, l) => s + l.latitude, 0) / locs.length : 50;
      const avgLon = locs.length ? locs.reduce((s, l) => s + l.longitude, 0) / locs.length : 10;
      const map = new mgl.Map({
        container: mapRef.current, style: OSM_STYLE, center: [avgLon, avgLat], zoom: 5,
        attributionControl: { compact: true }, failIfMajorPerformanceCaveat: false,
        transformRequest: osmTransformRequest,
      });
      mapInstanceRef.current = map;
      map.on('load', () => {
        if (destroyed) return;
        if (locs.length > 1) {
          const lngs = locs.map(l => l.longitude);
          const lats = locs.map(l => l.latitude);
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, duration: 0 });
        }
        map.resize();
        if (viewMode === 'generation') drawGenerationView(map, mgl, locs);
        else                          drawCapacityView(map, mgl, locs);
      });
    });
    return () => {
      destroyed = true;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {viewMode === 'capacity' && legendEntries.length > 0 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontFamily: "'DM Sans',system-ui", border: '1px solid #e2e8f0', maxWidth: 160 }}>
          <div style={{ fontWeight: 700, color: '#475569', marginBottom: 5, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tech Mix</div>
          {legendEntries.map(([tech, color]) => (
            <div key={tech} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ color: '#475569', fontSize: 10.5 }}>{tech.replace(/_/g, ' ')}</span>
            </div>
          ))}
          <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Capacity</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {[0.25, 0.55, 1.0].map(frac => {
                const legR = Math.max(4, Math.sqrt(frac) * 18);
                return (
                  <div key={frac} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: legR * 2, height: legR * 2, borderRadius: '50%', border: '1.5px solid #94a3b8', background: 'rgba(148,163,184,0.12)', flexShrink: 0 }} />
                    <span style={{ color: '#94a3b8', fontSize: 8.5, whiteSpace: 'nowrap' }}>{fmtPower(maxCapByLoc * frac, 0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {transmissionLinks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, paddingTop: 7, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ width: 16, height: 2.5, background: '#94a3b8', borderRadius: 2, flexShrink: 0 }} />
              <span style={{ color: '#94a3b8', fontSize: 10 }}>TX link</span>
            </div>
          )}
        </div>
      )}
      {viewMode === 'generation' && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontFamily: "'DM Sans',system-ui", border: '1px solid #e2e8f0', minWidth: 130 }}>
          <div style={{ fontWeight: 700, color: '#475569', marginBottom: 5, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Generation</div>
          <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'linear-gradient(to right, #fbbf24, #f59e0b, #ea580c, #dc2626)', marginBottom: 3 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 9.5 }}>
            <span>0</span>
            <span>{fmtEnergy(maxGenByLoc)}</span>
          </div>
          {transmissionLinks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, paddingTop: 5, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ width: 16, height: 2.5, background: '#94a3b8', borderRadius: 2, flexShrink: 0 }} />
              <span style={{ color: '#94a3b8', fontSize: 10 }}>TX link</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Congestion colour (flow / capacity ratio) ────────────────────────────────
const congestionColor = (util) => {
  if (util >= 0.9) return '#dc2626';
  if (util >= 0.75) return '#ea580c';
  if (util >= 0.5)  return '#ca8a04';
  return '#16a34a';
};
const CONGESTION_LEVELS = [
  { label: 'Free Flow', threshold: '< 50%',  color: '#16a34a' },
  { label: 'Moderate',  threshold: '50-75%', color: '#ca8a04' },
  { label: 'High Load', threshold: '75-90%', color: '#ea580c' },
  { label: 'Congested', threshold: '> 90%',  color: '#dc2626' },
];

// ── Transmission Power-Flow Map ───────────────────────────────────────────────
const TransmissionFlowMap = ({ locations, transmissionFlowData, capacitiesByLoc, timestamps }) => {
  const mapRef       = useRef(null);
  const canvasRef    = useRef(null);
  const mapInst      = useRef(null);
  const animRef      = useRef(null);
  const timerRef     = useRef(null);
  const particlesRef = useRef({});
  const stepRef      = useRef(0);
  const modeRef      = useRef('timeline');
  const playingRef   = useRef(false);

  const [timestep, setTimestep] = useState(0);
  const [playing,  setPlaying]  = useState(false);
  const [speed,    setSpeed]    = useState(200);
  const [mode,     setMode]     = useState('timeline'); // 'timeline' | 'peak'

  const lk   = (loc) => loc.calliopeName || loc.name;
  const locs = useMemo(() => locations.filter(l => l.latitude && l.longitude), [locations]);
  const hasFlow = (transmissionFlowData?.length ?? 0) > 0 && (timestamps?.length ?? 0) > 0;
  const maxStep = Math.max(0, (timestamps?.length || 1) - 1);

  // Sync refs so rAF closures always read current values without stale state
  useEffect(() => { stepRef.current    = timestep; }, [timestep]);
  useEffect(() => { modeRef.current    = mode;     }, [mode]);
  useEffect(() => { playingRef.current = playing;  }, [playing]);

  // Per-link statistics (peak / avg utilisation, dominant direction)
  const linkStats = useMemo(() => (transmissionFlowData || []).map(({ fromLoc, toLoc, timeseries, cap }) => {
    const vals    = (timeseries || []).map(v => Number(v) || 0);
    const absVals = vals.map(Math.abs);
    const peakFlow = absVals.length ? Math.max(...absVals) : 0;
    const avgFlow  = absVals.length ? absVals.reduce((a, b) => a + b, 0) / absVals.length : 0;
    const peakUtil = cap > 0 ? peakFlow / cap : 0;
    const avgUtil  = cap > 0 ? avgFlow  / cap : 0;
    const netFlow  = vals.reduce((a, b) => a + b, 0);
    return { fromLoc, toLoc, cap, peakFlow, avgFlow, peakUtil, avgUtil, netFlow, timeseries: vals };
  }), [transmissionFlowData]);

  const linkStatsRef = useRef([]);
  useEffect(() => { linkStatsRef.current = linkStats; }, [linkStats]);

  // Max utilisation across all links per timestep -- used for sparkline
  const stepUtils = useMemo(() => {
    if (!timestamps?.length || !linkStats.length) return [];
    return timestamps.map((_, t) =>
      Math.max(0, ...linkStats.map(({ cap, timeseries }) => {
        const v = Math.abs(timeseries[Math.min(t, timeseries.length - 1)] || 0);
        return cap > 0 ? v / cap : 0;
      }))
    );
  }, [linkStats, timestamps]);

  const capWidth = (cap) => Math.max(2, Math.min(7, 2 + cap / 500));

  // Per-link current utilization, sorted descending (for the live-links panel)
  const currentLinkUtils = useMemo(() => linkStats.map(stat => {
    const flow = mode === 'peak'
      ? stat.peakFlow
      : Math.abs(stat.timeseries[Math.min(timestep, stat.timeseries.length - 1)] || 0);
    const util = stat.cap > 0 ? flow / stat.cap : 0;
    return { fromLoc: stat.fromLoc, toLoc: stat.toLoc, util, flow, cap: stat.cap };
  }).sort((a, b) => b.util - a.util), [linkStats, timestep, mode]);

  // Static GeoJSON -- oriented in dominant flow direction, coloured by peak utilisation
  const staticGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: linkStats.map(({ fromLoc, toLoc, cap, peakUtil, avgUtil, peakFlow, avgFlow, netFlow }) => {
      const from = locs.find(l => lk(l) === fromLoc);
      const to   = locs.find(l => lk(l) === toLoc);
      if (!from || !to) return null;
      const coords = netFlow >= 0
        ? [[from.longitude, from.latitude], [to.longitude, to.latitude]]
        : [[to.longitude, to.latitude], [from.longitude, from.latitude]];
      return {
        type: 'Feature',
        properties: { fromLoc, toLoc, cap, peakUtil, avgUtil, peakFlow, avgFlow,
                      color: congestionColor(peakUtil), lineWidth: capWidth(cap) },
        geometry: { type: 'LineString', coordinates: coords },
      };
    }).filter(Boolean),
  }), [locs, linkStats]);

  // Per-timestep GeoJSON for animate mode
  const buildStepGeoJSON = useCallback((step) => ({
    type: 'FeatureCollection',
    features: linkStats.map(({ fromLoc, toLoc, cap, timeseries }) => {
      const from = locs.find(l => lk(l) === fromLoc);
      const to   = locs.find(l => lk(l) === toLoc);
      if (!from || !to) return null;
      const flow    = timeseries[Math.min(step, timeseries.length - 1)] || 0;
      const absFlow = Math.abs(flow);
      const util    = cap > 0 ? absFlow / cap : 0;
      const coords  = flow >= 0
        ? [[from.longitude, from.latitude], [to.longitude, to.latitude]]
        : [[to.longitude, to.latitude], [from.longitude, from.latitude]];
      return {
        type: 'Feature',
        properties: { fromLoc, toLoc, cap, flow: absFlow, util,
                      color: congestionColor(util), lineWidth: capWidth(cap) },
        geometry: { type: 'LineString', coordinates: coords },
      };
    }).filter(Boolean),
  }), [locs, linkStats]);

  // Keep canvas sized to map container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = mapRef.current;
    if (!canvas || !container) return;
    const sync = () => { canvas.width = container.offsetWidth; canvas.height = container.offsetHeight; };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Stagger initial particle positions per link
  useEffect(() => {
    const pts = {};
    linkStats.forEach(({ fromLoc, toLoc, peakUtil }) => {
      const count = Math.max(3, Math.min(10, Math.round(3 + peakUtil * 7)));
      pts[`${fromLoc}::${toLoc}`] = Array.from({ length: count }, (_, i) => ({ t: i / count }));
    });
    particlesRef.current = pts;
  }, [linkStats]);

  // Canvas particle animation loop -- only active in animate mode
  useEffect(() => {
    if (mode !== 'timeline') {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const cv = canvasRef.current;
      if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      return;
    }
    const draw = () => {
      const cv  = canvasRef.current;
      const map = mapInst.current;
      if (!cv || !map) { animRef.current = requestAnimationFrame(draw); return; }
      const ctx  = cv.getContext('2d');
      const step = stepRef.current;
      ctx.clearRect(0, 0, cv.width, cv.height);

      linkStats.forEach(({ fromLoc, toLoc, cap, timeseries }) => {
        const flow    = timeseries[Math.min(step, timeseries.length - 1)] || 0;
        const absFlow = Math.abs(flow);
        const util    = cap > 0 ? absFlow / cap : 0;
        if (absFlow < 0.5) return;

        const fObj = locs.find(l => lk(l) === fromLoc);
        const tObj = locs.find(l => lk(l) === toLoc);
        if (!fObj || !tObj) return;

        const [src, dst] = flow >= 0 ? [fObj, tObj] : [tObj, fObj];
        try {
          const s     = map.project([src.longitude, src.latitude]);
          const d     = map.project([dst.longitude, dst.latitude]);
          const color = congestionColor(util);
          const key   = `${fromLoc}::${toLoc}`;
          const ps    = particlesRef.current[key] || [];
          const spd   = 0.003 + util * 0.005;

          ps.forEach(p => {
            if (playingRef.current) p.t = (p.t + spd) % 1;
            const x = s.x + (d.x - s.x) * p.t;
            const y = s.y + (d.y - s.y) * p.t;
            // Soft halo
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = color + '22';
            ctx.fill();
            // Core dot
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          });
        } catch (_) {}
      });
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [mode, locs, linkStats]);

  // Map initialisation -- runs once on mount
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    let destroyed = false;
    let roMap = null;

    import('maplibre-gl').then(({ default: mgl }) => {
      if (destroyed || !mapRef.current) return;
      const avgLat = locs.length ? locs.reduce((s, l) => s + l.latitude,  0) / locs.length : 50;
      const avgLon = locs.length ? locs.reduce((s, l) => s + l.longitude, 0) / locs.length : 10;
      const map = new mgl.Map({
        container: mapRef.current, style: OSM_STYLE,
        center: [avgLon, avgLat], zoom: 5,
        attributionControl: { compact: true },
        failIfMajorPerformanceCaveat: false,
        transformRequest: osmTransformRequest,
      });
      // Auto-fit to show all nodes
      if (locs.length > 1) {
        const lngs = locs.map(l => l.longitude);
        const lats = locs.map(l => l.latitude);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60, duration: 0 });
      }
      mapInst.current = map;

      // Keep MapLibre sized correctly inside the flex container
      roMap = new ResizeObserver(() => { map.resize(); });
      roMap.observe(mapRef.current);

      const hoverPopup = new mgl.Popup({ closeButton: false, maxWidth: '280px', offset: 10 });

      map.on('load', () => {
        if (destroyed) return;
        map.resize(); // ensure correct size after flex layout settles

        map.addSource('flow', { type: 'geojson', data: staticGeoJSON });

        // White casing for definition against the light basemap (no glow, no blur)
        map.addLayer({ id: 'flow-casing', type: 'line', source: 'flow',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['+', ['get', 'lineWidth'], 3],
                   'line-opacity': 0.85 } });

        // Main coloured line
        map.addLayer({ id: 'flow-lines', type: 'line', source: 'flow',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'lineWidth'],
                   'line-opacity': 0.88 } });

        // Directional arrows placed along each line
        map.addLayer({ id: 'flow-arrows', type: 'symbol', source: 'flow',
          layout: {
            'symbol-placement': 'line', 'symbol-spacing': 120,
            'text-field': '›', 'text-size': 16, 'text-keep-upright': false,
          },
          paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff',
                   'text-halo-width': 2, 'text-opacity': 0.85 } });

        // Node circles sized by total installed capacity
        const maxCap = Math.max(1, ...locs.map(l => capacitiesByLoc[lk(l)] || 0));
        locs.forEach(loc => {
          const cap   = capacitiesByLoc[lk(loc)] || 0;
          const r     = 8 + Math.sqrt(cap / maxCap) * 12;
          const label = loc.name.length > 9 ? loc.name.slice(0, 8) + '...' : loc.name;
          const el    = document.createElement('div');
          el.style.cssText = `width:${r*2}px;height:${r*2}px;border-radius:50%;background:rgba(255,255,255,0.97);border:2.5px solid #06b6d4;box-shadow:0 1px 6px rgba(0,0,0,0.15),0 0 14px rgba(6,182,212,0.18);display:flex;align-items:center;justify-content:center;cursor:default;`;
          el.innerHTML = `<span style="color:#1e293b;font-size:${Math.max(7, r*0.62)}px;font-weight:700;font-family:'DM Sans',system-ui;pointer-events:none;overflow:hidden;white-space:nowrap;max-width:${r*1.8}px;text-overflow:ellipsis">${label}</span>`;
          const nodePopup = new mgl.Popup({ offset: r + 4, closeButton: false, maxWidth: '200px' })
            .setHTML(`<div style="font-family:system-ui;padding:4px 2px"><b>${loc.name}</b><br/><small style="color:#666">Installed capacity: ${fmtPower(cap)}</small></div>`);
          new mgl.Marker({ element: el }).setLngLat([loc.longitude, loc.latitude]).setPopup(nodePopup).addTo(map);
        });

        // Hover popup showing link stats (uses refs so closure always reads current step/mode)
        map.on('mouseenter', 'flow-lines', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const props = e.features[0]?.properties || {};
          const stat  = linkStatsRef.current.find(s => s.fromLoc === props.fromLoc && s.toLoc === props.toLoc);
          if (!stat) return;
          const isTimeline = modeRef.current === 'timeline';
          const step       = stepRef.current;
          const stepFlow   = isTimeline ? Math.abs(stat.timeseries[Math.min(step, stat.timeseries.length - 1)] || 0) : stat.peakFlow;
          const stepUtil   = stat.cap > 0 ? stepFlow / stat.cap : 0;
          const dispUtil   = isTimeline ? stepUtil   : stat.peakUtil;
          const dispFlow   = isTimeline ? stepFlow   : stat.peakFlow;
          const col        = congestionColor(dispUtil);
          const congLabel  = dispUtil >= 0.9 ? 'Congested' : dispUtil >= 0.75 ? 'High Load'
                           : dispUtil >= 0.5 ? 'Moderate' : 'Free Flow';
          const flowLabel  = isTimeline ? 'Flow now' : 'Peak flow';
          const utilLabel  = isTimeline ? 'Util. now' : 'Peak util.';
          hoverPopup.setLngLat(e.lngLat).setHTML(`
            <div style="font-family:'DM Sans',system-ui;padding:6px 2px;min-width:210px">
              <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:#1e293b;letter-spacing:-0.01em">
                ${stat.fromLoc} → ${stat.toLoc}
              </div>
              <div style="display:grid;grid-template-columns:1fr auto;gap:3px 14px;font-size:11px;color:#64748b">
                <span>Capacity</span><strong style="color:#1e293b">${fmtPower(stat.cap)}</strong>
                <span>${flowLabel}</span><strong style="color:#1e293b">${fmtPower(dispFlow)}</strong>
                <span>Avg flow</span><strong style="color:#1e293b">${fmtPower(stat.avgFlow)}</strong>
                <span>${utilLabel}</span><strong style="color:${col}">${(dispUtil*100).toFixed(0)}%</strong>
                <span>Avg util.</span><strong style="color:${congestionColor(stat.avgUtil)}">${(stat.avgUtil*100).toFixed(0)}%</strong>
              </div>
              <div style="margin-top:8px;height:4px;border-radius:2px;background:#f1f5f9;overflow:hidden">
                <div style="height:100%;width:${Math.min(100,dispUtil*100).toFixed(1)}%;background:${col};border-radius:2px"></div>
              </div>
              <div style="margin-top:6px;display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:5px;font-size:10px;font-weight:600;background:${col}15;color:${col};border:1px solid ${col}33">
                <span style="width:6px;height:6px;border-radius:50%;background:${col};display:inline-block"></span>
                ${congLabel}
              </div>
            </div>
          `).addTo(map);
        });
        map.on('mouseleave', 'flow-lines', () => {
          map.getCanvas().style.cursor = '';
          hoverPopup.remove();
        });
      });
    });

    return () => {
      destroyed = true;
      roMap?.disconnect();
      if (animRef.current)  cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mapInst.current)  { mapInst.current.remove(); mapInst.current = null; }
    };
  }, []);

  // Update flow source when mode or timestep changes
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      const src = map.getSource('flow');
      if (src) src.setData(mode === 'peak' ? staticGeoJSON : buildStepGeoJSON(timestep));
    } catch (_) {}
  }, [mode, timestep, staticGeoJSON, buildStepGeoJSON]);

  // Playback timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!playing || !timestamps?.length) return;
    timerRef.current = setInterval(() => {
      setTimestep(t => {
        if (t + 1 >= (timestamps?.length || 0)) { setPlaying(false); return t; }
        return t + 1;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, timestamps?.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', fontFamily: "'DM Sans', system-ui" }}>

      {/* ── Top bar: mode toggle ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {[{ id: 'timeline', label: 'Live Flow' }, { id: 'peak', label: 'Peak Map' }].map(({ id, label }) => (
          <button key={id} onClick={() => { setMode(id); if (id === 'peak') setPlaying(false); }}
            style={{ background: mode === id ? '#111827' : 'transparent',
                     color: mode === id ? '#fff' : '#64748b',
                     border: 'none', borderRadius: 6, padding: '4px 13px', fontSize: 11,
                     fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', system-ui", transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Map + sidebar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Map area */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
          {!hasFlow && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(255,255,255,0.97)', color: '#94a3b8', fontSize: 12, padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                No transmission flow timeseries in results
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {hasFlow && (
          <div style={{ width: 172, flexShrink: 0, borderLeft: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* Legend */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ color: '#94a3b8', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                Link Utilisation
              </div>
              {CONGESTION_LEVELS.map(({ label, threshold, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ width: 20, height: 4, borderRadius: 2, background: color, display: 'block', flexShrink: 0 }} />
                  <span style={{ color: '#374151', fontSize: 10, flex: 1 }}>{label}</span>
                  <span style={{ color: '#94a3b8', fontSize: 9 }}>{threshold}</span>
                </div>
              ))}
              <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: 9 }}>
                {mode === 'peak' ? 'Peak utilisation across run' : `Step ${timestep + 1} / ${timestamps?.length || 1}`}
              </div>
            </div>

            {/* Grid issues */}
            {(() => {
              const congested = currentLinkUtils.filter(l => l.util >= 0.9);
              const highLoad  = currentLinkUtils.filter(l => l.util >= 0.75 && l.util < 0.9);
              const moderate  = currentLinkUtils.filter(l => l.util >= 0.5  && l.util < 0.75);
              const freeFlow  = currentLinkUtils.filter(l => l.util < 0.5);
              const issues    = [...congested, ...highLoad, ...moderate];
              const short     = (s) => s.length > 9 ? s.slice(0, 8) + '…' : s;
              return (
                <div style={{ padding: '10px 12px', flex: 1 }}>
                  <div style={{ color: '#94a3b8', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                    Grid Issues
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: issues.length ? 8 : 0 }}>
                    {congested.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#dc262615', color: '#dc2626', border: '1px solid #dc262630' }}>
                        {congested.length} congested
                      </span>
                    )}
                    {highLoad.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ea580c15', color: '#ea580c', border: '1px solid #ea580c30' }}>
                        {highLoad.length} high load
                      </span>
                    )}
                    {moderate.length > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ca8a0415', color: '#ca8a04', border: '1px solid #ca8a0430' }}>
                        {moderate.length} moderate
                      </span>
                    )}
                    {issues.length === 0 && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: '#16a34a' }}>&#10003; All links free flow</span>
                    )}
                  </div>
                  {issues.map(({ fromLoc, toLoc, util }) => {
                    const col = congestionColor(util);
                    return (
                      <div key={`${fromLoc}::${toLoc}`} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#374151', fontSize: 10, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {short(fromLoc)} → {short(toLoc)}
                          </span>
                          <span style={{ color: col, fontSize: 10, fontWeight: 700, marginLeft: 4, flexShrink: 0 }}>{(util * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, util * 100).toFixed(1)}%`, background: col, borderRadius: 2, transition: 'width 0.2s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {freeFlow.length > 0 && (
                    <div style={{ marginTop: issues.length ? 6 : 0, paddingTop: issues.length ? 5 : 0, borderTop: issues.length ? '1px solid #f1f5f9' : 'none', color: '#94a3b8', fontSize: 9 }}>
                      {freeFlow.length} link{freeFlow.length > 1 ? 's' : ''} free flow (&lt; 50%)
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Timeline (live flow mode only) ────────────────────────────── */}
      {hasFlow && mode === 'timeline' && (
        <div style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '8px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setPlaying(p => !p)}
              style={{ background: '#111827', color: '#fff', border: 'none',
                       borderRadius: 6, padding: '4px 13px', fontSize: 11,
                       cursor: 'pointer', fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button onClick={() => { setPlaying(false); setTimestep(0); }}
              style={{ background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0',
                       borderRadius: 6, padding: '4px 9px', fontSize: 11,
                       cursor: 'pointer', fontFamily: "'DM Sans', system-ui" }}>↩ Reset</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#94a3b8', fontSize: 10 }}>Speed:</span>
              <select value={speed} onChange={e => setSpeed(+e.target.value)}
                style={{ background: '#fff', color: '#374151', border: '1px solid #e2e8f0',
                         borderRadius: 5, fontSize: 10, padding: '2px 4px', cursor: 'pointer', fontFamily: "'DM Sans', system-ui" }}>
                <option value={500}>0.5×</option>
                <option value={200}>1×</option>
                <option value={80}>2.5×</option>
                <option value={30}>6×</option>
              </select>
            </div>
            <span style={{ color: '#64748b', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginLeft: 'auto',
                           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {timestamps?.[timestep]?.slice(0, 16) || ''}
            </span>
          </div>

          {/* Sparkline behind range input */}
          <div style={{ position: 'relative', height: 24, marginBottom: 2 }}>
            {stepUtils.length > 1 && (
              <svg width="100%" height="24" viewBox={`0 0 ${stepUtils.length} 24`}
                   preserveAspectRatio="none"
                   style={{ position: 'absolute', inset: 0, display: 'block' }}>
                <defs>
                  <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <polygon
                  points={[`0,24`, ...stepUtils.map((u, i) => `${i},${24 - u * 20}`), `${stepUtils.length - 1},24`].join(' ')}
                  fill="url(#spark-grad)"
                />
                <polyline
                  points={stepUtils.map((u, i) => `${i},${24 - u * 20}`).join(' ')}
                  fill="none" stroke="#06b6d4" strokeWidth="0.6" opacity="0.65"
                />
                <line x1="0" y1={24 - 0.9 * 20} x2={stepUtils.length} y2={24 - 0.9 * 20}
                      stroke="#dc2626" strokeWidth="0.5" strokeDasharray="3 2" opacity="0.4" />
                <line x1={timestep} y1="0" x2={timestep} y2="24"
                      stroke="#1e293b" strokeWidth="1" opacity="0.4" />
                <circle cx={timestep} cy={24 - (stepUtils[timestep] || 0) * 20} r="2"
                        fill={congestionColor(stepUtils[timestep] || 0)} />
              </svg>
            )}
            <input type="range" min={0} max={maxStep} value={timestep}
              onChange={e => { setPlaying(false); setTimestep(+e.target.value); }}
              style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer', display: 'block',
                       position: 'relative', zIndex: 1, background: 'transparent',
                       margin: 0, height: '100%' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
            <span style={{ color: '#cbd5e1', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{timestamps?.[0]?.slice(0, 10) || ''}</span>
            <span style={{ color: '#94a3b8', fontSize: 9 }}>{timestep + 1} / {timestamps?.length || 0} steps</span>
            <span style={{ color: '#cbd5e1', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{timestamps?.[timestamps.length - 1]?.slice(0, 10) || ''}</span>
          </div>
        </div>
      )}
    </div>
  );
};


// ── Main component ───────────────────────────────────────────────────────────
const Results = () => {
  const { completedJobs, removeCompletedJob, showNotification, models, activeResultJobId, setActiveResultJobId } = useData();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [compareMode, setCompareMode] = useState(false);
  const [mapView, setMapView] = useState('capacity');
  // Tech inclusion filter: empty Set = show all; non-empty = show only listed techs.
  const [techFilter, setTechFilter] = useState(new Set());
  // Collapsed section IDs.
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');

  // Reset per-job UI state when switching runs
  useEffect(() => {
    setMapView('capacity');
    setTechFilter(new Set());
    setCollapsedSections(new Set());
    setFilterSearch('');
  }, [selectedJobId]);

  // When the Run section pushes a specific job to view, open it
  useEffect(() => {
    if (activeResultJobId) {
      setSelectedJobId(activeResultJobId);
      setTab('overview');
      setActiveResultJobId(null); // consume it
    }
  }, [activeResultJobId, setActiveResultJobId]);

  // Default: auto-select the newest (index 0) job if nothing selected
  useEffect(() => {
    if (completedJobs.length > 0 && !selectedJobId) {
      setSelectedJobId(completedJobs[0].id);
    }
  }, [completedJobs]);

  const selectedJob = completedJobs.find(j => j.id === selectedJobId) || null;
  const result = selectedJob?.result || null;

  // Find model for location lat/lon data
  // Strip the " (version N)" suffix that Run.jsx appends after repeated runs
  const modelLocations = useMemo(() => {
    if (!selectedJob) return [];
    const baseName = selectedJob.modelName.replace(/ \(version \d+\)$/, '');
    const m = models.find(m => m.name === baseName || m.name === selectedJob.modelName);
    return (m?.locations || []).filter(l => l.latitude && l.longitude).map(l => ({ ...l, calliopeName: calliopeLocName(l.name) }));
  }, [selectedJob, models]);

  // ── Tech metadata map: tech_name → {parent, carrier_out, display_name} ─────
  // Priority order (highest wins):
  //   Tier 1 — result.tech_metadata  (backend: Calliope runtime + carrier info)
  //   Tier 2 — model.technologies    (frontend model definition)
  //   Tier 3 — classifyTech()        (regex/structural fallback)
  const techMetaMap = useMemo(() => {
    const map = {};
    // Tier 2: model technology definitions (carrier_out + display name)
    const baseName = selectedJob?.modelName.replace(/ \(version \d+\)$/, '');
    const m = models.find(m => m.name === baseName || m.name === selectedJob?.modelName);
    (m?.technologies || []).forEach(t => {
      const id = t.id || t.name || '';
      const ess = t.essentials || {};
      const parent = ess.parent || t.parent || '';
      let carrier_out = ess.carrier_out || ess.carrier || '';
      if (Array.isArray(carrier_out)) carrier_out = carrier_out[0] || '';
      const display_name = ess.name || t.name || id;
      const color = ess.color || t.color || '';
      if (id) map[id] = { parent, carrier_out: String(carrier_out).toLowerCase(), display_name, color };
    });
    // Tier 1: backend result.tech_metadata (most authoritative)
    Object.entries(result?.tech_metadata || {}).forEach(([k, v]) => {
      map[k] = { ...(map[k] || {}), ...v, carrier_out: (v.carrier_out || '').toLowerCase() };
    });
    // Backward-compat: if tech_metadata absent, fall back to flat tech_parents
    if (!result?.tech_metadata) {
      Object.entries(result?.tech_parents || {}).forEach(([k, v]) => {
        if (!map[k]) map[k] = { parent: v, carrier_out: '', display_name: k };
        else map[k].parent = v;
      });
    }
    return map;
  }, [selectedJob, models, result]);

  // Classify a tech using metadata first, then structural/regex fallback.
  // Key logic for conversion_plus techs:
  //   + carrier_out=electricity  → 'infra' (substation / voltage transformer)
  //   + carrier_out=h2/hydrogen  → 'h2'
  //   + carrier_out=heat/other   → 'conv' (heat pump, boiler, DAC…)
  const classifyTechSmart = (t) => {
    // Structural fast path: colon = link/transmission always
    if (t.includes(':')) return 'tx';
    const meta = techMetaMap[t] || techMetaMap[t.split(':')[0]] || {};
    const parent = meta.parent || '';
    const carrier = meta.carrier_out || '';
    if (parent) {
      if (/^transmission$/i.test(parent))         return 'tx';
      if (/^demand$/i.test(parent))               return 'demand';
      if (/^storage$/i.test(parent))              return 'stor';
      if (/^conversion(_plus)?$/i.test(parent)) {
        // H2 conversion: name or carrier hints at hydrogen
        if (/h2|hydrogen|fuel.?cell|electrolys/i.test(t) || /h2|hydrogen/.test(carrier))
          return 'h2';
        // Electrical passthrough (substation / voltage transformer)
        if (carrier === 'electricity' || carrier === '')
          return 'infra';
        // Heat pump, boiler, DAC, desalination, etc.
        return 'conv';
      }
      if (/^supply(_plus)?$/i.test(parent))       return 'gen';
    }
    // Fallback to module-level regex classification
    return classifyTech(t);
  };

  // Returns the model-defined hex color for a tech, or falls back to the static palette.
  const techColorFn = useCallback(
    (t) => {
      if (!t) return '#94A3B8';
      const base = t.includes(':') ? t.split(':')[0] : t;
      return techMetaMap[t]?.color || techMetaMap[base]?.color || techColor(t);
    },
    [techMetaMap],
  );

  // Detect a Calliope transmission tech from its parsed coord string.
  // In Calliope capacities: non-transmission = "loc::tech", transmission = "loc::tech:dest_loc"
  // After parseLTC the `tech` field for transmission will contain a colon (:dest suffix).
  // We also catch any tech whose name literally contains 'transmission' as belt-and-suspenders.
  const isTransTech = useCallback((tech) => tech.includes(':') || tech.toLowerCase().includes('transmission'), []);

  // ── Derived data ───────────────────────────────────────────────────────────
  const derivedData = useMemo(() => {
    if (!result) return null;

    // Parse capacities: "Berlin::solar_pv" → {loc, tech, value}
    // Calliope 0.6 key formats:
    //   non-transmission: "loc::tech"
    //   transmission:     "loc::tech:dest_loc"  (tech contains a colon)
    // We exclude transmission directed entries from the supply/demand tables and
    // aggregate them separately under their base tech name (strip the :dest suffix).
    const capEntries = Object.entries(result.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !isTransTech(e.tech));

    // Capacity by tech (summed) — supply/storage/demand only
    const capByTech = {};
    capEntries.forEach(({ tech, value }) => { capByTech[tech] = (capByTech[tech] || 0) + value; });

    // Transmission capacity aggregated by base tech name (stripped of :dest)
    const txCapByTech = {};
    Object.entries(result.capacities || {}).forEach(([k, v]) => {
      const { tech } = parseLTC(k);
      const val = Number(v) || 0;
      if (val > 0 && tech.includes(':')) {
        const baseTech = tech.split(':')[0];
        txCapByTech[baseTech] = (txCapByTech[baseTech] || 0) + val;
      }
    });

    // Capacity by location (summed)
    const capByLoc = {};
    capEntries.forEach(({ loc, value }) => { capByLoc[loc] = (capByLoc[loc] || 0) + value; });

    // Dominant tech per location
    const domTech = {};
    const locTechCap = {};
    capEntries.forEach(({ loc, tech, value }) => {
      if (!locTechCap[loc] || locTechCap[loc].value < value) {
        locTechCap[loc] = { tech, value };
      }
    });
    Object.entries(locTechCap).forEach(([loc, { tech }]) => { domTech[loc] = tech; });

    // Generation by tech (summed over locations)
    const genByTech = {};
    Object.entries(result.generation || {}).forEach(([k, v]) => {
      const { tech } = parseLTC(k);
      const val = Number(v) || 0;
      if (val > 0) genByTech[tech] = (genByTech[tech] || 0) + val;
    });

    // Generation by location (summed over techs)
    const genByLoc = {};
    Object.entries(result.generation || {}).forEach(([k, v]) => {
      const { loc } = parseLTC(k);
      const val = Number(v) || 0;
      if (val > 0) genByLoc[loc] = (genByLoc[loc] || 0) + val;
    });

    const totalGen = Object.values(genByTech).reduce((s, v) => s + v, 0);
    const totalCap = Object.values(capByTech).reduce((s, v) => s + v, 0);

    // Dispatch timestamps → compact labels
    const timestamps = (result.timestamps || []).map(t => {
      const d = new Date(t);
      if (isNaN(d)) return t;
      return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });

    return { capByTech, txCapByTech, capByLoc, domTech, genByTech, genByLoc, totalGen, totalCap, timestamps };
  }, [result]);

  // ── Transmission link pairs (for map) ─────────────────────────────────────
  const transmissionLinks = useMemo(() => {
    if (!result?.capacities || !modelLocations.length) return [];
    const txEntries = Object.entries(result.capacities)
      // In Calliope 0.6, transmission techs have format "tech_name:dest_loc" — detect by the colon
      .filter(([k]) => { const { tech } = parseLTC(k); return tech.includes(':'); })
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0);
    const links = [];
    const used = new Set();
    txEntries.forEach(entry => {
      const key = `${entry.loc}::${entry.tech}`;
      if (used.has(key)) return;
      // Format 1: tech = "ac_transmission:DestLoc"
      const techParts = entry.tech.split(':');
      const toLoc = techParts.length > 1 ? techParts[techParts.length - 1] : null;
      if (toLoc && modelLocations.find(l => l.calliopeName === toLoc || l.name === toLoc)) {
        links.push({ fromLoc: entry.loc, toLoc, cap: entry.value });
        used.add(key);
      } else {
        // Format 2: find matching opposite-direction entry
        const opp = txEntries.find(e => e.loc !== entry.loc && e.tech === entry.tech && !used.has(`${e.loc}::${e.tech}`));
        if (opp) {
          links.push({ fromLoc: entry.loc, toLoc: opp.loc, cap: entry.value });
          used.add(key);
          used.add(`${opp.loc}::${opp.tech}`);
        }
      }
    });
    return links;
  }, [result, modelLocations]);

  // ── Transmission dispatch timeseries (for animated power-flow map) ────────
  const transmissionFlowData = useMemo(() => {
    // New format: result.transmission_flow = { "A::B": { from, to, timeseries[] } }
    if (result?.transmission_flow && Object.keys(result.transmission_flow).length > 0) {
      return Object.values(result.transmission_flow).map(({ from: fromLoc, to: toLoc, timeseries }) => {
        const vals = (timeseries || []).map(v => Number(v) || 0);
        const cap = transmissionLinks.find(t =>
          (t.fromLoc === fromLoc && t.toLoc === toLoc) || (t.fromLoc === toLoc && t.toLoc === fromLoc)
        )?.cap || (vals.length ? Math.max(1, ...vals.map(Math.abs)) : 1);
        return { fromLoc, toLoc, timeseries: vals, cap };
      });
    }
    return [];
  }, [result, transmissionLinks]);

  // ── Large-model detection ──────────────────────────────────────────────────
  // Charts that enumerate all locations (bar per location, table rows, heatmap
  // rows) become unusable at scale.  Anything above LOC_CHART_LIMIT locations
  // switches to an aggregated / top-N view.
  const isLargeModel = modelLocations.length > 50;
  const LOC_CHART_LIMIT = 20;

  // ── Filter + section helpers ───────────────────────────────────────────────
  const toggleTech = (t) => setTechFilter(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  const isTechVisible = (t) => techFilter.size === 0 || techFilter.has(t);

  const toggleSection = (id) => setCollapsedSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const sectionOpen = (id) => !collapsedSections.has(id);

  // All known tech names from current result (for filter chips)
  const allTechs = useMemo(() => {
    if (!derivedData?.capByTech) return [];
    return Object.keys(derivedData.capByTech).sort();
  }, [derivedData]);

  // Group techs by category for the filter bar — uses smart classifier
  const techsByGroup = useMemo(() => {
    const map = {};
    allTechs.forEach(t => {
      const gid = classifyTechSmart(t);
      (map[gid] = map[gid] || []).push(t);
    });
    return map;
  }, [allTechs, techMetaMap]);

  // Ordered list of groups that have at least one tech in the result
  const activeGroups = useMemo(() => {
    const ordered = [
      ...TECH_GROUPS,
      { id: 'other', label: 'Other', color: '#64748b' },
    ];
    return ordered.filter(g => (techsByGroup[g.id] || []).length > 0);
  }, [techsByGroup]);

  const toggleGroup = (gid) => {
    const groupTechs = techsByGroup[gid] || [];
    if (!groupTechs.length) return;
    setTechFilter(prev => {
      // Expand empty filter to "all selected" so toggle logic works
      const expanded = prev.size === 0 ? new Set(allTechs) : new Set(prev);
      const allIn = groupTechs.every(t => expanded.has(t));
      if (allIn) groupTechs.forEach(t => expanded.delete(t));
      else groupTechs.forEach(t => expanded.add(t));
      // If effectively everything is selected, revert to empty (= all visible)
      return expanded.size >= allTechs.length ? new Set() : expanded;
    });
  };

  // 'full' | 'partial' | 'none'
  const groupFilterState = (gid) => {
    const groupTechs = techsByGroup[gid] || [];
    if (!groupTechs.length) return 'none';
    if (techFilter.size === 0) return 'full';
    const inFilter = groupTechs.filter(t => techFilter.has(t)).length;
    if (inFilter === groupTechs.length) return 'full';
    if (inFilter > 0) return 'partial';
    return 'none';
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `calliope_${selectedJobId}.json`; a.click();
    URL.revokeObjectURL(url);
    showNotification('Results exported', 'success');
  };

  // ── ECharts options ────────────────────────────────────────────────────────

  // Horizontal bar: capacities by tech
  const capBarOption = useMemo(() => {
    if (!derivedData?.capByTech) return null;
    const sorted = Object.entries(derivedData.capByTech)
      .filter(([t]) => isTechVisible(t))
      .sort(([, a], [, b]) => b - a);
    if (!sorted.length) return null;
    const { div, unit } = autoScale(sorted[0][1], 'MW');
    const fmt = scaledFmt(div);
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 60, top: 16, bottom: 16 },
      xAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: sorted.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: sorted.map(([tech, v]) => ({ value: v, itemStyle: { color: techColorFn(tech), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', formatter: p => fmt(p.value), fontSize: 9, color: '#64748b' },
      }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmt(p[0].value)} ${unit}</b>` },
    };
  }, [derivedData, techFilter, techColorFn]);

  // Donut: generation mix
  const genDonutOption = useMemo(() => {
    if (!derivedData?.genByTech) return null;
    const data = Object.entries(derivedData.genByTech)
      .filter(([t, v]) => v > 0 && isTechVisible(t))
      .sort(([, a], [, b]) => b - a)
      .map(([tech, v]) => ({ name: tech.replace(/_/g, ' '), value: Math.round(v), itemStyle: { color: techColorFn(tech) } }));
    if (!data.length) return null;
    return {
      backgroundColor: 'transparent',
      legend: { bottom: 4, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
      series: [{
        type: 'pie', radius: ['44%', '72%'], center: ['50%', '42%'],
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold', formatter: p => p.name + '\n' + fmtEnergy(p.value, 0) } },
        data,
      }],
      tooltip: { trigger: 'item', formatter: p => `${p.name}<br/><b>${fmtEnergy(p.value, 2)}</b> (${p.percent}%)` },
    };
  }, [derivedData, techFilter, techColorFn]);

  // Bar: costs by tech
  const costsTechOption = useMemo(() => {
    if (!result?.costs_by_tech) return null;
    const sorted = Object.entries(result.costs_by_tech)
      .filter(([t, v]) => v > 0 && isTechVisible(t))
      .sort(([, a], [, b]) => b - a);
    if (!sorted.length) return null;
    const { div, unit } = autoScale(sorted[0][1], '€');
    const fmt = scaledFmt(div);
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 60, top: 16, bottom: 16 },
      xAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: sorted.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: sorted.map(([tech, v]) => ({ value: v, itemStyle: { color: techColorFn(tech), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', formatter: p => fmt(p.value), fontSize: 9, color: '#64748b' },
      }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmt(p[0].value)} ${unit}</b>` },
    };
  }, [result, techFilter, techColorFn]);

  // Stacked bar: costs by location × tech (top-N for large models)
  const costsLocOption = useMemo(() => {
    if (!result?.costs_by_location) return null;
    const allLocs = Object.keys(result.costs_by_location);
    const totalCostByLoc = Object.fromEntries(
      allLocs.map(l => [l, Object.values(result.costs_by_location[l]).reduce((s, v) => s + (Number(v) || 0), 0)])
    );
    const locs = allLocs
      .sort((a, b) => totalCostByLoc[b] - totalCostByLoc[a])
      .slice(0, isLargeModel ? LOC_CHART_LIMIT : allLocs.length);
    const truncated = isLargeModel && allLocs.length > LOC_CHART_LIMIT;
    const techSet = [...new Set(locs.flatMap(l => Object.keys(result.costs_by_location[l])))]
      .filter(t => !isTransTech(t) && isTechVisible(t));
    const maxCost = Math.max(1, ...locs.map(l => totalCostByLoc[l] || 0));
    const { div, unit } = autoScale(maxCost, '€');
    const fmt = scaledFmt(div);
    const series = techSet.map(tech => ({
      name: tech.replace(/_/g, ' '),
      type: 'bar',
      stack: 'total',
      data: locs.map(l => Math.max(0, result.costs_by_location[l]?.[tech] || 0)),
      itemStyle: { color: techColorFn(tech) },
      emphasis: { focus: 'series' },
    }));
    return {
      backgroundColor: 'transparent',
      title: truncated ? {
        text: `Top ${LOC_CHART_LIMIT} locations by cost  (${allLocs.length} total)`,
        textStyle: { fontSize: 9, color: '#94a3b8', fontWeight: 'normal' }, top: 4, left: 4,
      } : undefined,
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
      grid: { left: 60, right: 20, top: truncated ? 34 : 16, bottom: 56 },
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 4 ? 30 : 0 }, axisTick: { show: false } },
      yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      series,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    };
  }, [result, isLargeModel, techFilter, techColorFn]);

  // Stacked area: dispatch timeseries
  const dispatchOption = useMemo(() => {
    if (!result?.dispatch || !derivedData?.timestamps?.length) return null;
    const techs = Object.keys(result.dispatch).filter(t => isTechVisible(t));
    if (!techs.length) return null;
    // Auto-scale y-axis based on peak dispatch
    const allVals = techs.flatMap(t => result.dispatch[t]);
    const maxVal = Math.max(1, ...allVals);
    const { div, unit } = autoScale(maxVal, 'MW');
    const fmt = scaledFmt(div);
    const series = techs.map(tech => ({
      name: tech.replace(/_/g, ' '),
      type: 'line',
      stack: 'gen',
      areaStyle: { opacity: 0.75 },
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 0 },
      itemStyle: { color: techColorFn(tech) },
      data: result.dispatch[tech],
      emphasis: { focus: 'series' },
    }));
    if (result.demand_timeseries) {
      series.push({
        name: 'Demand',
        type: 'line',
        smooth: false,
        symbol: 'none',
        lineStyle: { color: '#D32F2F', width: 2, type: 'dashed' },
        itemStyle: { color: '#D32F2F' },
        data: result.demand_timeseries,
        z: 10,
      });
    }
    const labels = derivedData.timestamps;
    const step = Math.max(1, Math.ceil(labels.length / 24));
    return {
      backgroundColor: 'transparent',
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
      grid: { left: 64, right: 20, top: 20, bottom: 72 },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLabel: { fontSize: 9, color: '#64748b', rotate: 35,
          formatter: (_, i) => (i % step === 0 ? labels[i] : '') },
        splitLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value', ...axisNameStyle(unit),
        axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 32, height: 18 }],
      series,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' },
        formatter: params => {
          const rows = params.map(p => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}: <b>${fmt(+p.value)} ${unit}</b>`).join('<br/>');
          return `<div style="font-size:11px">${params[0]?.name}<br/>${rows}</div>`;
        }
      },
    };
  }, [result, derivedData, techFilter, techColorFn]);

  // Grouped bar: capacity per location per tech (top-N for large models)
  const capLocOption = useMemo(() => {
    if (!derivedData?.capByTech) return null;
    const capEntries = Object.entries(result?.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !isTransTech(e.tech) && isTechVisible(e.tech));

    const allLocs = [...new Set(capEntries.map(e => e.loc))];
    const totalCapByLoc = Object.fromEntries(
      allLocs.map(l => [l, capEntries.filter(e => e.loc === l).reduce((s, e) => s + e.value, 0)])
    );
    const locs = allLocs
      .sort((a, b) => totalCapByLoc[b] - totalCapByLoc[a])
      .slice(0, isLargeModel ? LOC_CHART_LIMIT : allLocs.length);
    const truncated = isLargeModel && allLocs.length > LOC_CHART_LIMIT;

    const techs = [...new Set(capEntries.map(e => e.tech))];
    const byLocTech = {};
    capEntries.forEach(({ loc, tech, value }) => { byLocTech[`${loc}::${tech}`] = value; });

    const maxCap = Math.max(1, ...locs.map(l => totalCapByLoc[l] || 0));
    const { div, unit } = autoScale(maxCap, 'MW');
    const fmt = scaledFmt(div);

    const series = techs.map(tech => ({
      name: tech.replace(/_/g, ' '),
      type: 'bar',
      barMaxWidth: 22,
      data: locs.map(l => byLocTech[`${l}::${tech}`] || 0),
      itemStyle: { color: techColorFn(tech) },
    }));

    return {
      backgroundColor: 'transparent',
      title: truncated ? {
        text: `Top ${LOC_CHART_LIMIT} locations by capacity  (${allLocs.length} total)`,
        textStyle: { fontSize: 9, color: '#94a3b8', fontWeight: 'normal' }, top: 4, left: 4,
      } : undefined,
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 9, color: '#475569' }, icon: 'roundRect' },
      grid: { left: 60, right: 20, top: truncated ? 34 : 16, bottom: 56 },
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 4 ? 30 : 0 }, axisTick: { show: false } },
      yAxis: { type: 'value', ...axisNameStyle(unit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmt(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      series,
    };
  }, [result, derivedData, isLargeModel, techFilter, techColorFn]);

  // Sankey: energy flow Location → Tech → Carrier
  const sankeyOption = useMemo(() => {
    if (!result?.generation) return null;
    const genEntries = Object.entries(result.generation || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !isTransTech(e.tech));
    if (!genEntries.length) return null;

    // Build nodes & links: Tech → Carrier
    const nodeSet = new Set();
    const linkMap = {};
    genEntries.forEach(({ tech, carrier, value }) => {
      const tNode = `⚡ ${tech.replace(/_/g,' ')}`;
      const cNode = `🔋 ${(carrier||'electricity').replace(/_/g,' ')}`;
      nodeSet.add(tNode);
      nodeSet.add(cNode);
      const key = `${tNode}→${cNode}`;
      linkMap[key] = (linkMap[key] || 0) + value;
    });

    // Add demand node
    const totalDemand = genEntries.reduce((s, e) => s + e.value, 0);
    nodeSet.add('📊 Total Demand');
    [...new Set(genEntries.map(e => `🔋 ${(e.carrier||'electricity').replace(/_/g,' ')}`))]
      .forEach(cNode => {
        const carrierTotal = genEntries
          .filter(e => `🔋 ${(e.carrier||'electricity').replace(/_/g,' ')}` === cNode)
          .reduce((s, e) => s + e.value, 0);
        const key = `${cNode}→📊 Total Demand`;
        linkMap[key] = (linkMap[key] || 0) + carrierTotal;
      });

    const nodes = [...nodeSet].map(n => ({ name: n }));
    const links = Object.entries(linkMap)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => {
        const [source, target] = key.split('→');
        return { source, target, value: Math.round(value) };
      });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: p => p.dataType === 'edge'
          ? `${p.data.source} → ${p.data.target}<br/><b>${fmtEnergy(p.data.value, 2)}</b>`
          : `<b>${p.name}</b>`,
      },
      series: [{
        type: 'sankey',
        left: 60, right: 80, top: 20, bottom: 20,
        nodeAlign: 'left',
        layoutIterations: 32,
        emphasis: { focus: 'adjacency' },
        label: { fontSize: 9, color: '#374151' },
        lineStyle: { color: 'gradient', opacity: 0.5 },
        data: nodes,
        links,
      }],
    };
  }, [result]);

  // Capacity factor heatmap: locations × technologies
  // For large models: switch to tech-only average CF (no location axis)
  const cfHeatmapOption = useMemo(() => {
    if (!derivedData?.capByTech || !result?.generation) return null;
    const capEntries = Object.entries(result?.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !isTransTech(e.tech) && isTechVisible(e.tech));
    const genEntries = Object.entries(result.generation || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && isTechVisible(e.tech));
    const hrs = (result?.timestamps?.length) || 8760;

    if (isLargeModel) {
      const techCap = {};
      const techGen = {};
      capEntries.forEach(({ tech, value }) => { techCap[tech] = (techCap[tech] || 0) + value; });
      genEntries.filter(e => !isTransTech(e.tech)).forEach(({ tech, value }) => { techGen[tech] = (techGen[tech] || 0) + value; });
      const data = Object.keys(techCap).map(tech => ({
        tech, cf: techCap[tech] > 0 ? Math.min(100, (techGen[tech] || 0) / (techCap[tech] * hrs) * 100) : 0,
      })).filter(d => d.cf > 0).sort((a, b) => b.cf - a.cf);
      if (!data.length) return null;
      return {
        backgroundColor: 'transparent',
        grid: { left: 140, right: 80, top: 16, bottom: 16 },
        xAxis: { type: 'value', max: 100, ...axisNameStyle('%'), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => v }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
        yAxis: { type: 'category', data: data.map(d => d.tech.replace(/_/g, ' ')), axisLabel: { fontSize: 9, color: '#475569' } },
        series: [{
          type: 'bar', barMaxWidth: 28,
          data: data.map(d => ({ value: +d.cf.toFixed(1), itemStyle: { color: techColorFn(d.tech), borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', formatter: p => p.value.toFixed(1) + '%', fontSize: 9, color: '#64748b' },
        }],
        tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>Avg CF: ${p[0].value}%</b>` },
      };
    }

    // Small model: full heatmap (location × tech)
    const locs = [...new Set(capEntries.map(e => e.loc))].sort();
    const techs = [...new Set(capEntries.map(e => e.tech))].sort();
    const data = [];
    techs.forEach((tech, ti) => {
      locs.forEach((loc, li) => {
        const cap = capEntries.find(e => e.loc === loc && e.tech === tech)?.value || 0;
        const gen = genEntries.find(e => e.loc === loc && e.tech === tech)?.value || 0;
        const cf = cap > 0 ? Math.min(100, (gen / (cap * hrs)) * 100) : null;
        if (cf != null) data.push([li, ti, +cf.toFixed(1)]);
      });
    });
    if (!data.length) return null;

    return {
      backgroundColor: 'transparent',
      grid: { left: 100, right: 60, top: 20, bottom: 60 },
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 9, color: '#475569', rotate: locs.length > 4 ? 30 : 0 }, axisTick: { show: false } },
      yAxis: { type: 'category', data: techs.map(t => t.replace(/_/g,' ')), axisLabel: { fontSize: 9, color: '#475569' } },
      visualMap: {
        min: 0, max: 100, calculable: true, orient: 'horizontal',
        right: 0, bottom: 0, text: ['100%', '0%'],
        textStyle: { fontSize: 9, color: '#64748b' },
        inRange: { color: ['#f9fafb','#d1d5db','#6b7280','#1f2937','#030712'] },
      },
      series: [{
        type: 'heatmap',
        data,
        label: { show: true, fontSize: 9, color: '#fff', formatter: p => p.value[2] > 0 ? p.value[2] + '%' : '' },
      }],
      tooltip: {
        trigger: 'item',
        formatter: p => `${locs[p.data[0]]} × ${techs[p.data[1]].replace(/_/g,' ')}<br/><b>CF: ${p.data[2]}%</b>`,
      },
    };
  }, [result, derivedData, isLargeModel, techFilter]);

  // Cost per MWh by technology
  const costPerMwhOption = useMemo(() => {
    if (!result?.costs_by_tech || !derivedData?.genByTech) return null;
    const data = Object.entries(result.costs_by_tech)
      .filter(([t, cost]) => cost > 0 && isTechVisible(t))
      .map(([tech, cost]) => {
        const gen = derivedData.genByTech[tech] || 0;
        return { tech, costPerMwh: gen > 0 ? cost / gen : 0, cost, gen };
      })
      .filter(d => d.costPerMwh > 0)
      .sort((a, b) => b.costPerMwh - a.costPerMwh);
    if (!data.length) return null;
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 60, top: 16, bottom: 16 },
      xAxis: { type: 'value', ...axisNameStyle('€/MWh'), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmtNum(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: data.map(d => d.tech.replace(/_/g,' ')), axisLabel: { fontSize: 9, color: '#475569' } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: data.map(d => ({ value: +d.costPerMwh.toFixed(2), itemStyle: { color: techColorFn(d.tech), borderRadius: [0,4,4,0] } })),
        label: { show: true, position: 'right', formatter: p => p.value.toFixed(1), fontSize: 9, color: '#64748b' },
      }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${p[0].value.toFixed(2)} €/MWh</b>` },
    };
  }, [result, derivedData, techFilter, techColorFn]);

  // ── TABS ───────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'overview',  label: 'Overview',    icon: FiLayers },
    { id: 'flow',      label: 'Energy Flow', icon: FiShare2 },
    { id: 'dispatch',  label: 'Dispatch',    icon: FiActivity },
    { id: 'costs',     label: 'Costs',       icon: FiDollarSign },
    { id: 'analysis',  label: 'Analysis',    icon: FiGrid },
    { id: 'logs',      label: 'Logs',        icon: FiTerminal },
  ];

  const hasDispatch = result?.dispatch && Object.keys(result.dispatch).length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">

      {compareMode ? (
        /* ══ Full-screen compare mode ════════════════════════════════════ */
        <>
          <div className="flex-shrink-0 px-6 pt-5 pb-0">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Results Dashboard</h1>
                <p className="text-slate-500 text-sm">Calliope optimisation results · interactive analysis</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                  <button onClick={() => setCompareMode(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      !compareMode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    <FiLayers size={12} /> Single Run
                  </button>
                  <button onClick={() => setCompareMode(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      compareMode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    <FiGitMerge size={12} /> Compare Scenarios
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 px-6 pb-5 pt-3">
            <ScenarioComparison />
          </div>
        </>
      ) : (
        /* ══ Single-run view (padded, scrollable) ═══════════════════════ */
        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">

          {/* ── Header ── */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Results Dashboard</h1>
              <p className="text-slate-500 text-sm">Calliope optimisation results · interactive analysis</p>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => setCompareMode(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    !compareMode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  <FiLayers size={12} /> Single Run
                </button>
                <button
                  onClick={() => setCompareMode(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    compareMode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  <FiGitMerge size={12} /> Compare Scenarios
                </button>
              </div>
              {result && !compareMode && (
                <button onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-50 transition text-sm shadow-sm">
                  <FiDownload size={14} /> Export JSON
                </button>
              )}
            </div>
          </div>

        {/* ── Model selector (dropdown) ── */}
        {!compareMode && (
          <div className="border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <select
                value={selectedJobId || ''}
                onChange={e => { const id = e.target.value; setSelectedJobId(id || null); if (id) setTab('overview'); }}
                className="flex-1 max-w-sm px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">{completedJobs.length === 0 ? 'No completed runs' : 'Select a run…'}</option>
                {completedJobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.modelName}{job.duration ? ` · ${job.duration}` : ''}{job.status === 'failed' ? ' ⚠ failed' : ''}
                  </option>
                ))}
              </select>
              {selectedJobId && (
                <button onClick={() => { removeCompletedJob(selectedJobId); setSelectedJobId(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                  <FiTrash2 size={11} /> Remove
                </button>
              )}
            </div>
          </div>
        )}{/* end model selector */}

        {/* ── Main content ── */}
        {!compareMode && !selectedJob && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-24 text-center text-slate-400">
            <FiBarChart2 size={56} className="mx-auto mb-4 opacity-15" />
            <h3 className="text-xl font-semibold mb-1 text-slate-600">Select a run above</h3>
            <p className="text-sm">Run a model from the Run section, then select it here</p>
          </div>
        )}
        {!compareMode && selectedJob?.status === 'failed' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6 flex gap-4">
              <FiAlertTriangle className="text-red-500 flex-shrink-0" size={24} />
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">{selectedJob.modelName} — Failed</h2>
                <p className="text-sm text-red-700">{result?.error || 'Unknown error'}</p>
              </div>
            </div>
            {selectedJob.logs?.length > 0 && (
              <div className="bg-slate-900 text-green-400 rounded-2xl p-4 text-xs font-mono h-72 overflow-y-auto">
                {selectedJob.logs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        )}
        {!compareMode && selectedJob && selectedJob.status !== 'failed' && (
          <div className="space-y-4">

            {/* ── Tabs + filter button ── */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit overflow-x-auto">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setTab(id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      tab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    <Icon size={13} /> {label}
                    {id === 'dispatch' && !hasDispatch && <span className="text-xs text-slate-300 ml-0.5">(—)</span>}
                  </button>
                ))}
              </div>
              {allTechs.length > 0 && (
                <button onClick={() => setFilterExpanded(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border ${
                    filterExpanded
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}>
                  <FiFilter size={11} /> Filters
                  {techFilter.size > 0 && <span className="ml-0.5 text-[10px] font-bold">({allTechs.length - techFilter.size})</span>}
                </button>
              )}
            </div>

            {/* ── Tech filter — categorized redesign ── */}
            {filterExpanded && allTechs.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-4">
                {/* Search */}
                <div className="relative">
                  <FiSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search technologies…"
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  {filterSearch && (
                    <button onClick={() => setFilterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <FiX size={13} />
                    </button>
                  )}
                </div>

                {/* Category sections */}
                {activeGroups.map(grp => {
                  const techs = (techsByGroup[grp.id] || []).filter(t =>
                    !filterSearch || t.toLowerCase().includes(filterSearch.toLowerCase())
                  );
                  if (!techs.length) return null;

                  const state = groupFilterState(grp.id);
                  const full = state === 'full';
                  const isTx = grp.id === 'tx';

                  return (
                    <div key={grp.id}>
                      {/* Category header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: grp.color }} />
                          <span className="text-xs font-semibold text-slate-700">{grp.label}</span>
                          <span className="text-[10px] text-slate-400">({techs.length})</span>
                        </div>
                        <button onClick={() => toggleGroup(grp.id)}
                          className="text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors">
                          {full ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>

                      {/* Tech chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(isTx ? [...new Set(techs.map(linkTechBase))].sort() : techs).map(entry => {
                          if (isTx) {
                            const base = entry;
                            const baseTechs = techs.filter(t => linkTechBase(t) === base);
                            const anyActive = techFilter.size === 0 || baseTechs.some(t => techFilter.has(t));
                            const allActive = techFilter.size === 0 || baseTechs.every(t => techFilter.has(t));
                            const handleBaseToggle = () => {
                              setTechFilter(prev => {
                                const expanded = prev.size === 0 ? new Set(allTechs) : new Set(prev);
                                if (allActive) baseTechs.forEach(t => expanded.delete(t));
                                else baseTechs.forEach(t => expanded.add(t));
                                return expanded.size >= allTechs.length ? new Set() : expanded;
                              });
                            };
                            const baseDisplayName = techMetaMap[base]?.display_name || base.replace(/_/g, ' ');
                            return (
                              <button key={base} onClick={handleBaseToggle}
                                title={`${baseDisplayName} — ${baseTechs.length} link(s)`}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 border ${
                                  allActive
                                    ? 'border-transparent'
                                    : anyActive
                                      ? 'border-dashed'
                                      : 'bg-white border-slate-200 text-slate-300 line-through opacity-40'
                                }`}
                                style={anyActive ? {
                                  background: grp.color + (allActive ? '22' : '11'),
                                  borderColor: grp.color + (allActive ? '55' : 'aa'),
                                  color: '#334155',
                                } : {}}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: anyActive ? grp.color : '#cbd5e1' }} />
                                {baseDisplayName}
                                <span className="text-[9px] opacity-50 ml-0.5">×{baseTechs.length}</span>
                              </button>
                            );
                          }

                          return (
                            <button key={entry} onClick={() => toggleTech(entry)}
                              title={techMetaMap[entry]?.display_name || entry.replace(/_/g, ' ')}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 border ${
                                techFilter.size === 0 || techFilter.has(entry)
                                  ? 'border-transparent'
                                  : 'bg-white border-slate-200 text-slate-300 line-through opacity-40'
                              }`}
                              style={techFilter.size === 0 || techFilter.has(entry) ? {
                                background: grp.color + '22',
                                borderColor: grp.color + '55',
                                color: '#334155',
                              } : {}}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: techFilter.size === 0 || techFilter.has(entry) ? grp.color : '#cbd5e1' }} />
                              {(techMetaMap[entry]?.display_name || entry).replace(/_/g, ' ')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ════════════════ OVERVIEW TAB ════════════════ */}
            {tab === 'overview' && (
              <div className="space-y-4">
                {/* Map — full width, main visual */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
                      <FiMap size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm">Location Map</span>
                      <div className="ml-auto flex gap-1">
                        {[
                          { id: 'capacity',     label: 'Capacity',     icon: FiBarChart2 },
                          { id: 'generation',   label: 'Gen Heatmap',  icon: FiZap },
                          { id: 'transmission', label: 'Transmission', icon: FiShare2 },
                        ].map(({ id, label, icon: Icon }) => (
                          <button key={id} onClick={() => setMapView(id)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                              mapView === id ? 'bg-gray-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}>
                            <Icon size={10} /> {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ height: mapView === 'transmission' ? 560 : 480 }}>
                      {modelLocations.length > 0 ? (
                        mapView === 'transmission' ? (
                          <TransmissionFlowMap
                            key={selectedJobId + '-transmission'}
                            locations={modelLocations}
                            transmissionFlowData={transmissionFlowData}
                            capacitiesByLoc={derivedData?.capByLoc || {}}
                            timestamps={derivedData?.timestamps || []}
                          />
                        ) : (
                          <ResultsMap key={selectedJobId + '-' + mapView}
                            locations={modelLocations}
                            capacitiesByLoc={derivedData?.capByLoc || {}}
                            dominantTechByLoc={derivedData?.domTech || {}}
                            generationByLoc={derivedData?.genByLoc || {}}
                            viewMode={mapView}
                            colorFn={techColorFn}
                            transmissionLinks={transmissionLinks}
                          />
                        )
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                          <FiMapPin size={20} className="mr-2 opacity-40" /> Location data unavailable
                        </div>
                      )}
                    </div>
                </div>
                {/* Capacity + Generation row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Capacity by tech */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cap-by-tech')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiBarChart2 size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Installed Capacity by Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cap-by-tech') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cap-by-tech') && <div className="px-5 pb-5">
                      {capBarOption ? (
                        <ReactECharts option={capBarOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-16">No capacity data</div>}
                    </div>}
                  </div>
                  {/* Generation donut */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('gen-mix')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiPieChart size={14} className="text-amber-500 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Generation Mix</span>
                      <span className="text-xs text-slate-400 mr-1">· MWh total</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('gen-mix') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('gen-mix') && <div className="px-5 pb-5">
                      {genDonutOption ? (
                        <ReactECharts option={genDonutOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-16">No generation data</div>}
                    </div>}
                  </div>
                  {/* Capacity by location */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cap-by-loc')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiMapPin size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Capacity by Location & Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cap-by-loc') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cap-by-loc') && <div className="px-5 pb-5">
                      {capLocOption ? (
                        <ReactECharts option={capLocOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-16">No location data</div>}
                    </div>}
                  </div>
                </div>

                {/* Technology summary table */}
                {derivedData?.capByTech && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('tech-summary')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiTrendingUp size={14} className="text-slate-500 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Technology Summary</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('tech-summary') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('tech-summary') && <div className="px-5 pb-5 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 pr-6 font-semibold text-slate-500 text-xs uppercase tracking-wide">Technology</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Capacity</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Generation</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Cost</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">€ / MWh</th>
                            <th className="text-right py-2 pl-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Cap. Factor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(derivedData.capByTech).sort().map((tech, i) => {
                            const cap = derivedData.capByTech[tech] || 0;
                            const gen = derivedData.genByTech[tech] || 0;
                            const cost = result?.costs_by_tech?.[tech] || 0;
                            const hrs = (result?.timestamps?.length) || 8760;
                            const cf = cap > 0 ? (gen / (cap * hrs) * 100) : null;
                            const cpm = gen > 0 && cost > 0 ? (cost / gen) : null;
                            return (
                              <tr key={tech} className={i % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/50'}>
                                <td className="py-2.5 pr-6">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: techColorFn(tech) }} />
                                    <span className="font-medium text-slate-700 capitalize">{tech.replace(/_/g, ' ')}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{fmtPower(cap)}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{gen > 0 ? fmtEnergy(gen) : '—'}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{cost > 0 ? fmtCost(cost) : '—'}</td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-600">{cpm != null ? cpm.toFixed(2) : '—'}</td>
                                <td className="py-2.5 pl-4 text-right font-mono text-xs">
                                  {cf != null ? (
                                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${cf > 30 ? 'bg-green-100 text-green-700' : cf > 15 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {cf.toFixed(1)}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Transmission techs: show aggregated total capacity per link type */}
                          {Object.keys(derivedData.txCapByTech || {}).sort().map((tech, i) => {
                            const cap = derivedData.txCapByTech[tech] || 0;
                            const cost = result?.costs_by_tech?.[tech] || 0;
                            return (
                              <tr key={`tx-${tech}`} className="border-b border-slate-50 opacity-70">
                                <td className="py-2.5 pr-6">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 opacity-70" style={{ background: techColorFn(tech) }} />
                                    <span className="font-medium text-slate-500 capitalize">{tech.replace(/_/g, ' ')}</span>
                                    <span className="text-xs text-slate-400 italic">transmission</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-500 font-mono text-xs">{fmtFull(cap)}</td>
                                <td className="py-2.5 px-4 text-right text-slate-400 font-mono text-xs">—</td>
                                <td className="py-2.5 px-4 text-right text-slate-500 font-mono text-xs">{cost > 0 ? fmtFull(cost) : '—'}</td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-400">—</td>
                                <td className="py-2.5 pl-4 text-right font-mono text-xs text-slate-400">—</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>}
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ ENERGY FLOW TAB (SANKEY) ════════════════ */}
            {tab === 'flow' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button onClick={() => toggleSection('sankey')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                    <FiShare2 size={14} className="text-gray-600 flex-shrink-0" />
                    <span className="font-semibold text-slate-800 text-sm flex-1">Energy Flow — Sankey Diagram</span>
                    <span className="text-xs text-slate-400 mr-1">· tech → carrier → demand</span>
                    <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('sankey') ? '' : '-rotate-90'}`} />
                  </button>
                  {sectionOpen('sankey') && <div className="px-5 pb-5">
                    <p className="text-xs text-slate-400 mb-4">Flow width = total generation (MWh) · Technology → Carrier → Total Demand</p>
                  {sankeyOption ? (
                    <ReactECharts option={sankeyOption} style={{ height: 480 }} notMerge />
                  ) : (
                    <div className="text-slate-400 text-sm text-center py-24">
                      <FiShare2 size={40} className="mx-auto mb-3 opacity-20" />
                      Insufficient generation data to build energy flow diagram
                    </div>
                  )}
                  </div>}
                </div>

                {/* Generation ratio per carrier */}
                {derivedData?.genByTech && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {Object.entries(derivedData.genByTech)
                      .sort(([,a],[,b]) => b - a)
                      .map(([tech, gen]) => {
                        const share = derivedData.totalGen > 0 ? (gen / derivedData.totalGen * 100) : 0;
                        const cap = derivedData.capByTech[tech] || 0;
                        return (
                          <div key={tech} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: techColorFn(tech) }} />
                              <span className="font-semibold text-slate-700 text-sm capitalize">{tech.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                              <span>{fmtEnergy(gen)}</span>
                              <span className="font-bold text-slate-700">{share.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: techColorFn(tech) }} />
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                              <span>Cap: <strong className="text-slate-700">{fmtPower(cap)}</strong></span>
                              <span>CF: <strong className="text-slate-700">{cap > 0 ? ((gen / (cap * (result?.timestamps?.length || 8760))) * 100).toFixed(1) + '%' : '—'}</strong></span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ DISPATCH TAB ════════════════ */}
            {tab === 'dispatch' && (
              <div className="space-y-4">
                {!hasDispatch ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
                    <FiActivity size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Dispatch timeseries not available</p>
                    <p className="text-xs mt-1 text-slate-300">Re-run the model to generate dispatch data</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <button onClick={() => toggleSection('dispatch-stack')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                        <FiActivity size={14} className="text-green-600 flex-shrink-0" />
                        <span className="font-semibold text-slate-800 text-sm flex-1">Generation Dispatch Stack</span>
                        <span className="text-xs text-slate-400 mr-1">· scroll to zoom</span>
                        <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('dispatch-stack') ? '' : '-rotate-90'}`} />
                      </button>
                      {sectionOpen('dispatch-stack') && <div className="px-5 pb-5">
                        <p className="text-xs text-slate-400 mb-3">Stacked area = supply mix · dashed red = demand</p>
                        <ReactECharts option={dispatchOption} style={{ height: 400 }} notMerge />
                      </div>}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="font-semibold text-slate-800 text-sm mb-4">Dispatch Totals per Technology</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(result.dispatch).map(([tech, vals]) => {
                          const total = vals.reduce((s, v) => s + v, 0);
                          const peak = Math.max(...vals);
                          const avg = total / vals.length;
                          return (
                            <div key={tech} className="rounded-xl border border-slate-100 p-3 bg-slate-50">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: techColorFn(tech) }} />
                                <span className="text-xs font-semibold text-slate-700 capitalize truncate">{tech.replace(/_/g, ' ')}</span>
                              </div>
                              <div className="text-lg font-bold text-slate-800">{fmtEnergy(total)}</div>
                              <div className="text-xs text-slate-400">total output</div>
                              <div className="mt-1 space-y-0.5">
                                <div className="text-xs text-slate-500">Peak: <strong>{fmtPower(peak)}</strong></div>
                                <div className="text-xs text-slate-500">Avg: <strong>{fmtPower(avg)}</strong></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ════════════════ COSTS TAB ════════════════ */}
            {tab === 'costs' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-by-tech')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiDollarSign size={14} className="text-emerald-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Total Cost by Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cost-by-tech') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cost-by-tech') && <div className="px-5 pb-5">
                      {costsTechOption ? (
                        <ReactECharts option={costsTechOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-12">No cost data</div>}
                    </div>}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-per-mwh')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiTrendingUp size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Cost per MWh by Technology</span>
                      <span className="text-xs text-slate-400 mr-1">· LCOE proxy</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cost-per-mwh') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cost-per-mwh') && <div className="px-5 pb-5">
                      {costPerMwhOption ? (
                        <ReactECharts option={costPerMwhOption} style={{ height: 280 }} notMerge />
                      ) : <div className="text-slate-400 text-sm text-center py-12">No data</div>}
                    </div>}
                  </div>
                </div>

                {costsLocOption && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-by-loc')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiMapPin size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm flex-1">Cost Breakdown by Location &amp; Technology</span>
                      <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cost-by-loc') ? '' : '-rotate-90'}`} />
                    </button>
                    {sectionOpen('cost-by-loc') && <div className="px-5 pb-5">
                      <ReactECharts option={costsLocOption} style={{ height: 300 }} notMerge />
                    </div>}
                  </div>
                )}

                {result?.costs_by_location && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
                    {(() => {
                      const allLocs = Object.keys(result.costs_by_location);
                      const totalByLoc = Object.fromEntries(
                        allLocs.map(l => [l, Object.values(result.costs_by_location[l]).reduce((s, v) => s + (Number(v) || 0), 0)])
                      );
                      const locs = allLocs
                        .sort((a, b) => totalByLoc[b] - totalByLoc[a])
                        .slice(0, isLargeModel ? LOC_CHART_LIMIT : allLocs.length);
                      const truncated = isLargeModel && allLocs.length > LOC_CHART_LIMIT;
                      const techs = [...new Set(locs.flatMap(l => Object.keys(result.costs_by_location[l])))].sort();
                      return (
                        <>
                          <h3 className="font-semibold text-slate-800 text-sm mb-1">Cost Detail Table (€)</h3>
                          {truncated && (
                            <p className="text-xs text-amber-600 mb-3">Showing top {LOC_CHART_LIMIT} locations by total cost (of {allLocs.length}). Export JSON for full data.</p>
                          )}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left py-2 pr-4 font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                                {techs.map(t => (
                                  <th key={t} className="text-right py-2 px-3 font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap capitalize">
                                    {t.replace(/_/g, ' ')}
                                  </th>
                                ))}
                                <th className="text-right py-2 pl-4 font-semibold text-slate-800 uppercase tracking-wide">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {locs.map((loc, li) => {
                                const rowTotal = Object.values(result.costs_by_location[loc]).reduce((s, v) => s + (Number(v) || 0), 0);
                                return (
                                  <tr key={loc} className={li % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/60'}>
                                    <td className="py-2 pr-4 font-medium text-slate-700">{loc}</td>
                                    {techs.map(t => (
                                      <td key={t} className="py-2 px-3 text-right text-slate-500 font-mono">
                                        {fmtFull(result.costs_by_location[loc]?.[t] || 0)}
                                      </td>
                                    ))}
                                    <td className="py-2 pl-4 text-right font-bold text-slate-800 font-mono">{fmtFull(rowTotal)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ ANALYSIS TAB ════════════════ */}
            {tab === 'analysis' && (
              <div className="space-y-4">
                {/* Capacity factor chart */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button onClick={() => toggleSection('cf-chart')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                    <FiGrid size={14} className="text-gray-600 flex-shrink-0" />
                    <span className="font-semibold text-slate-800 text-sm flex-1">
                      {isLargeModel ? 'Average Capacity Factor by Technology' : 'Capacity Factor Heatmap'}
                    </span>
                    <span className="text-xs text-slate-400 mr-1">
                      {isLargeModel ? '· aggregated' : '· Loc × Tech'}
                    </span>
                    <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('cf-chart') ? '' : '-rotate-90'}`} />
                  </button>
                  {sectionOpen('cf-chart') && <div className="px-5 pb-5">
                    <p className="text-xs text-slate-400 mb-4">CF = total generation ÷ (installed capacity × hours). High CF means the asset is heavily used.</p>
                    {cfHeatmapOption ? (
                      <ReactECharts option={cfHeatmapOption} style={{ height: isLargeModel ? 220 : 320 }} notMerge />
                    ) : (
                      <div className="text-slate-400 text-sm text-center py-16">
                        Insufficient data — needs both capacity and generation outputs
                      </div>
                    )}
                  </div>}
                </div>

                {/* Renewable share & system metrics */}
                {derivedData && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Renewable share */}
                    {(() => {
                      const renewables = ['solar_pv','solar','wind_onshore','wind_offshore','wind','hydro','biomass'];
                      const renewGen = Object.entries(derivedData.genByTech)
                        .filter(([t]) => renewables.some(r => t.toLowerCase().includes(r)))
                        .reduce((s,[,v]) => s + v, 0);
                      const share = derivedData.totalGen > 0 ? (renewGen / derivedData.totalGen * 100) : 0;
                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Renewable Share</div>
                          <div className="text-4xl font-bold text-gray-900 mb-1">{share.toFixed(1)}<span className="text-xl font-normal text-slate-400">%</span></div>
                          <div className="text-xs text-slate-400 mb-3">of total generation</div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-gray-600 to-gray-900 transition-all" style={{ width: `${share}%` }} />
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{fmtEnergy(renewGen)} renewables / {fmtEnergy(derivedData.totalGen)} total</div>
                        </div>
                      );
                    })()}

                    {/* Avg system LCOE */}
                    {result?.costs_by_tech && (() => {
                      const totalCost = Object.values(result.costs_by_tech).reduce((s,v) => s+(Number(v)||0),0);
                      const lcoe = derivedData.totalGen > 0 ? totalCost / derivedData.totalGen : null;
                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">System Average LCOE</div>
                          <div className="text-4xl font-bold text-gray-900 mb-1">
                            {lcoe != null ? lcoe.toFixed(2) : '—'}<span className="text-xl font-normal text-slate-400"> €/MWh</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-2">Total Cost: {fmtCost(totalCost)}</div>
                          <div className="text-xs text-slate-400">Total Gen: {fmtEnergy(derivedData.totalGen)}</div>
                        </div>
                      );
                    })()}

                    {/* Tech diversity */}
                    {(() => {
                      const techCount = Object.keys(derivedData.capByTech).length;
                      const locCount = Object.keys(derivedData.capByLoc).length;
                      const topTech = Object.entries(derivedData.capByTech).sort(([,a],[,b]) => b-a)[0];
                      return (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">System Profile</div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-500">Technologies</span> <strong className="text-slate-800">{techCount}</strong></div>
                            <div className="flex justify-between"><span className="text-slate-500">Locations</span> <strong className="text-slate-800">{locCount}</strong></div>
                            <div className="flex justify-between"><span className="text-slate-500">Timesteps</span> <strong className="text-slate-800">{(result?.timestamps?.length || 0).toLocaleString()}</strong></div>
                            <div className="flex justify-between"><span className="text-slate-500">Dominant tech</span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: techColorFn(topTech?.[0] || '') }} />
                                <strong className="text-slate-800 capitalize">{topTech?.[0]?.replace(/_/g,' ') || '—'}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Per-location generation bars */}
                {derivedData?.capByLoc && Object.keys(derivedData.capByLoc).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    {(() => {
                      const allEntries = Object.entries(derivedData.capByLoc).sort(([,a],[,b]) => b-a);
                      const entries = isLargeModel ? allEntries.slice(0, LOC_CHART_LIMIT) : allEntries;
                      const truncated = isLargeModel && allEntries.length > LOC_CHART_LIMIT;
                      const maxCap = allEntries[0]?.[1] || 1;
                      return (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-slate-800 text-sm">Per-Location Capacity Breakdown</h3>
                            {truncated && <span className="text-xs text-amber-600">Top {LOC_CHART_LIMIT} of {allEntries.length} locations</span>}
                          </div>
                          <div className="space-y-3">
                            {entries.map(([loc, cap]) => {
                              const pct = maxCap > 0 ? (cap / maxCap * 100) : 0;
                              const dom = derivedData.domTech[loc];
                              return (
                                <div key={loc}>
                                  <div className="flex items-center justify-between mb-1 text-xs">
                                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full" style={{ background: techColorFn(dom) }} />
                                      {loc}
                                    </span>
                                    <span className="font-mono text-slate-500">{fmtPower(cap)} · {dom?.replace(/_/g,' ')}</span>
                                  </div>
                                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: techColorFn(dom) }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {truncated && (
                            <p className="mt-3 text-xs text-slate-400 text-center">… {allEntries.length - LOC_CHART_LIMIT} more locations. Export JSON for full data.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ LOGS TAB ════════════════ */}
            {tab === 'logs' && (
              <div className="bg-slate-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3 text-green-400">
                  <FiTerminal size={14} />
                  <span className="text-sm font-mono font-semibold">Solver Log — {selectedJob.logs?.length || 0} lines</span>
                </div>
                <div className="text-green-400 text-xs font-mono space-y-0.5 max-h-[600px] overflow-y-auto pr-2">
                  {(selectedJob.logs || []).map((l, i) => (
                    <div key={i} className={`leading-relaxed ${l.startsWith('[ERROR]') || l.includes('Error') ? 'text-red-400' : l.includes('WARNING') ? 'text-amber-400' : ''}`}>
                      {l}
                    </div>
                  ))}
                  {(!selectedJob.logs || selectedJob.logs.length === 0) && (
                    <div className="text-slate-600 italic">No log lines available</div>
                  )}
                </div>
              </div>
            )}

            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Results;
