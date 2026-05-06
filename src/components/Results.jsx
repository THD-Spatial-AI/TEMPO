import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import ReactECharts from 'echarts-for-react';
import {
  FiBarChart2, FiPieChart, FiTrendingUp, FiDownload,
  FiRefreshCw, FiAlertCircle, FiCheckCircle, FiTrash2,
  FiTerminal, FiAlertTriangle, FiMapPin, FiDollarSign,
  FiZap, FiActivity, FiClock, FiCpu, FiMap, FiLayers, FiShare2, FiGrid,
  FiChevronDown, FiFilter,
} from 'react-icons/fi';
import 'maplibre-gl/dist/maplibre-gl.css';

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
const ResultsMap = ({ locations, capacitiesByLoc, dominantTechByLoc, generationByLoc, viewMode, colorFn = techColor }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // ── Capacity circles view ──
  const drawCapacityView = (map, mgl, locs) => {
    const maxCap = Math.max(1, ...locs.map(l => capacitiesByLoc[l.name] || 0), 1);
    locs.forEach(loc => {
      const cap = capacitiesByLoc[loc.name] || 0;
      const radius = 8 + Math.sqrt(cap / maxCap) * 30;
      const color = colorFn(dominantTechByLoc[loc.name] || 'generic');
      const el = document.createElement('div');
      el.style.cssText = `width:${radius*2}px;height:${radius*2}px;border-radius:50%;background:${color}CC;border:2px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:pointer;`;
      const popup = new mgl.Popup({ offset: radius + 2, closeButton: false, maxWidth: '220px' })
        .setHTML(`<div style="font-family:system-ui;padding:4px"><b style="font-size:13px">${loc.name}</b><br/><small style="color:#555">Capacity: <b>${fmtNum(cap)} MW</b><br/>Dominant: ${(dominantTechByLoc[loc.name]||'—').replace(/_/g,' ')}</small></div>`);
      const m = new mgl.Marker({ element: el }).setLngLat([loc.longitude, loc.latitude]).setPopup(popup).addTo(map);
      markersRef.current.push(m);
    });
  };

  // ── Generation heatmap view (MapLibre native heatmap layer) ──
  const drawGenerationView = (map, mgl, locs) => {
    const genMap = generationByLoc || {};
    const values = locs.map(l => genMap[l.name] || 0);
    const maxGen = Math.max(1, ...values);

    // Native MapLibre heatmap layer — much better than HTML circles
    map.addSource('gen-heatmap', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: locs.map(loc => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [loc.longitude, loc.latitude] },
          properties: { intensity: genMap[loc.name] || 0 },
        })),
      },
    });
    map.addLayer({
      id: 'gen-heatmap-layer',
      type: 'heatmap',
      source: 'gen-heatmap',
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, maxGen, 1],
        'heatmap-intensity': 1.8,
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 50, 6, 90, 10, 140],
        'heatmap-opacity': 0.82,
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,    'rgba(0,0,0,0)',
          0.10, 'rgba(30,41,59,0.6)',
          0.30, '#1e3a5f',
          0.55, '#1d4ed8',
          0.75, '#38bdf8',
          1.0,  '#f0f9ff',
        ],
      },
    });

    // Labeled ghost-circle markers on top for hover info
    locs.forEach(loc => {
      const gen = genMap[loc.name] || 0;
      if (!gen) return;
      const pct = gen / maxGen;
      const r = 12 + pct * 18;
      const el = document.createElement('div');
      el.style.cssText = `width:${r*2}px;height:${r*2}px;border-radius:50%;background:rgba(255,255,255,0.10);border:1.5px solid rgba(255,255,255,0.55);cursor:pointer;display:flex;align-items:center;justify-content:center;`;
      el.innerHTML = `<span style="color:#fff;font-size:9px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,0.9);pointer-events:none">${fmtNum(gen)}</span>`;
      const popup = new mgl.Popup({ offset: r + 2, closeButton: false, maxWidth: '200px' })
        .setHTML(`<div style="font-family:system-ui;padding:4px"><b>${loc.name}</b><br/><small style="color:#555">Generation: <b>${fmtFull(gen)} MWh</b><br/>${(pct * 100).toFixed(1)}% of peak</small></div>`);
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
        if (viewMode === 'generation') drawGenerationView(map, mgl, locs);
        else                          drawCapacityView(map, mgl, locs);
      });
    });
    return () => {
      destroyed = true;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
};

// ── Animated Transmission Power-Flow Map ─────────────────────────────────────
const TransmissionFlowMap = ({ locations, transmissionFlowData, capacitiesByLoc, timestamps }) => {
  const mapRef   = useRef(null);
  const mapInst  = useRef(null);
  const animRef  = useRef(null);
  const timerRef = useRef(null);
  const [timestep, setTimestep] = useState(0);
  const [playing,  setPlaying]  = useState(false);
  const [speed,    setSpeed]    = useState(150);

  const locs    = useMemo(() => locations.filter(l => l.latitude && l.longitude), [locations]);
  const hasFlow = (transmissionFlowData?.length > 0) && (timestamps?.length > 0);
  const maxStep = Math.max(0, (timestamps?.length || 1) - 1);

  // Build GeoJSON for a given timestep.
  // Negative flow → coordinates are flipped so animated dashes travel in the correct direction.
  const buildGeoJSON = useCallback((step) => {
    const features = (transmissionFlowData || []).flatMap(({ fromLoc, toLoc, timeseries, cap }) => {
      const from = locs.find(l => l.name === fromLoc);
      const to   = locs.find(l => l.name === toLoc);
      if (!from || !to || !timeseries?.length) return [];
      const rawFlow        = Number(timeseries[Math.min(step, timeseries.length - 1)]) || 0;
      const absFlow        = Math.abs(rawFlow);
      const normalizedFlow = Math.min(1, absFlow / Math.max(1, cap));
      const coords = rawFlow >= 0
        ? [[from.longitude, from.latitude], [to.longitude, to.latitude]]
        : [[to.longitude,   to.latitude],   [from.longitude, from.latitude]];
      return [{ type: 'Feature',
        properties: { absFlow, normalizedFlow, lineWidth: Math.max(1.5, normalizedFlow * 9),
                      isReverse: rawFlow < 0 ? 1 : 0, rawFlow, fromLoc, toLoc },
        geometry: { type: 'LineString', coordinates: coords },
      }];
    });
    return { type: 'FeatureCollection', features };
  }, [locs, transmissionFlowData]);

  // Init map once on mount
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;
    let destroyed = false;
    import('maplibre-gl').then(({ default: mgl }) => {
      if (destroyed || !mapRef.current) return;
      const avgLat = locs.length ? locs.reduce((s, l) => s + l.latitude,  0) / locs.length : 50;
      const avgLon = locs.length ? locs.reduce((s, l) => s + l.longitude, 0) / locs.length : 10;
      const map = new mgl.Map({
        container: mapRef.current, style: OSM_STYLE, center: [avgLon, avgLat], zoom: 5,
        attributionControl: { compact: true }, failIfMajorPerformanceCaveat: false,
        transformRequest: osmTransformRequest,
      });
      mapInst.current = map;

      map.on('load', () => {
        if (destroyed) return;
        map.addSource('flow', { type: 'geojson', data: buildGeoJSON(0) });

        // 1. Dark width-scaled track
        map.addLayer({ id: 'flow-track', type: 'line', source: 'flow',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#1e293b', 'line-width': ['get', 'lineWidth'], 'line-opacity': 0.9 } });

        // 2. Color glow: cyan=forward, amber=reverse
        map.addLayer({ id: 'flow-glow', type: 'line', source: 'flow',
          paint: { 'line-color': ['case', ['==', ['get', 'isReverse'], 0], '#38bdf8', '#fb923c'],
                   'line-width': ['*', ['get', 'lineWidth'], 4], 'line-blur': 14, 'line-opacity': 0.25 } });

        // 3. Animated dashes — direction baked into geometry
        map.addLayer({ id: 'flow-dashes', type: 'line', source: 'flow',
          filter: ['>', ['get', 'absFlow'], 0],
          paint: { 'line-color': ['case', ['==', ['get', 'isReverse'], 0], '#7dd3fc', '#fdba74'],
                   'line-width': ['get', 'lineWidth'],
                   'line-opacity': ['interpolate', ['linear'], ['get', 'normalizedFlow'], 0, 0, 0.05, 0.7, 1, 1],
                   'line-dasharray': [2, 3] } });

        // 4. Faint dashes for zero-flow links
        map.addLayer({ id: 'flow-zero', type: 'line', source: 'flow',
          filter: ['==', ['get', 'absFlow'], 0],
          paint: { 'line-color': '#334155', 'line-width': 1.5, 'line-opacity': 0.4, 'line-dasharray': [4, 8] } });

        // Capacity labels at link midpoints
        (transmissionFlowData || []).forEach(({ fromLoc, toLoc, cap }) => {
          const from = locs.find(l => l.name === fromLoc);
          const to   = locs.find(l => l.name === toLoc);
          if (!from || !to) return;
          const el = document.createElement('div');
          el.style.cssText = `background:rgba(15,23,42,0.88);color:#64748b;font-size:9px;font-family:system-ui;padding:2px 7px;border-radius:6px;border:1px solid #334155;pointer-events:none;white-space:nowrap;`;
          el.textContent = `${fmtNum(cap)} MW cap`;
          new mgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([(from.longitude + to.longitude) / 2, (from.latitude + to.latitude) / 2])
            .addTo(map);
        });

        // Node circles sized by capacity
        const maxCap = Math.max(1, ...locs.map(l => capacitiesByLoc[l.name] || 0));
        locs.forEach(loc => {
          const cap = capacitiesByLoc[loc.name] || 0;
          const r = 8 + Math.sqrt(cap / maxCap) * 14;
          const label = loc.name.length > 8 ? loc.name.slice(0, 7) + '\u2026' : loc.name;
          const el = document.createElement('div');
          el.style.cssText = `width:${r*2}px;height:${r*2}px;border-radius:50%;background:#0f172a;border:2.5px solid #38bdf8;box-shadow:0 0 14px rgba(56,189,248,0.55);cursor:pointer;display:flex;align-items:center;justify-content:center;`;
          el.innerHTML = `<span style="color:#e2e8f0;font-size:8px;font-weight:700;pointer-events:none;max-width:${r*1.8}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${label}</span>`;
          const popup = new mgl.Popup({ offset: r + 3, closeButton: false, maxWidth: '200px' })
            .setHTML(`<div style="font-family:system-ui;padding:4px"><b>${loc.name}</b><br/><small style="color:#555">Cap: ${fmtNum(cap)} MW</small></div>`);
          new mgl.Marker({ element: el }).setLngLat([loc.longitude, loc.latitude]).setPopup(popup).addTo(map);
        });

        // rAF: decrement dash-offset → dashes appear to march forward
        let offset = 0;
        const animate = () => {
          if (destroyed) return;
          offset -= 0.4;
          try {
            if (map.getLayer('flow-dashes')) map.setPaintProperty('flow-dashes', 'line-dash-offset', offset);
          } catch (_) { return; } // stop silently if WebGL context lost
          animRef.current = requestAnimationFrame(animate);
        };
        animate();
      });
    });
    return () => {
      destroyed = true;
      if (animRef.current)  cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mapInst.current)  { mapInst.current.remove(); mapInst.current = null; }
    };
  }, []);

  // Update source when timestep changes (no remap needed)
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      const src = map.getSource('flow');
      if (src) src.setData(buildGeoJSON(timestep));
    } catch (_) {}
  }, [timestep, buildGeoJSON]);

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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />

      {!hasFlow && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(15,23,42,0.88)', color: '#94a3b8', fontSize: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', fontFamily: 'system-ui' }}>
            No transmission flow timeseries in results
          </div>
        </div>
      )}

      {hasFlow && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, background: 'rgba(10,15,28,0.93)', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(148,163,184,0.18)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setPlaying(p => !p)}
              style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: 'system-ui' }}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button onClick={() => { setPlaying(false); setTimestep(0); }}
              style={{ background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: 'system-ui' }}>↩</button>
            <span style={{ color: '#475569', fontSize: 10, flexShrink: 0, fontFamily: 'system-ui' }}>Speed:</span>
            <select value={speed} onChange={e => setSpeed(+e.target.value)}
              style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, fontSize: 10, padding: '2px 4px', cursor: 'pointer', flexShrink: 0, fontFamily: 'system-ui' }}>
              <option value={500}>0.5×</option>
              <option value={200}>1×</option>
              <option value={80}>2.5×</option>
              <option value={30}>6×</option>
            </select>
            <span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {timestep + 1}/{timestamps.length} · {timestamps[timestep]?.slice(0, 16) || ''}
            </span>
          </div>
          <input type="range" min={0} max={maxStep} value={timestep}
            onChange={e => { setPlaying(false); setTimestep(+e.target.value); }}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer', display: 'block' }} />
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <span style={{ color: '#7dd3fc', fontSize: 10, fontFamily: 'system-ui' }}>● Forward flow</span>
            <span style={{ color: '#fdba74', fontSize: 10, fontFamily: 'system-ui' }}>● Reverse flow</span>
            <span style={{ color: '#475569', fontSize: 10, fontFamily: 'system-ui' }}>╌ No flow</span>
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
  const [mapView, setMapView] = useState('capacity');
  // Tech inclusion filter: empty Set = show all; non-empty = show only listed techs.
  const [techFilter, setTechFilter] = useState(new Set());
  // Collapsed section IDs.
  const [collapsedSections, setCollapsedSections] = useState(new Set());

  // Reset per-job UI state when switching runs
  useEffect(() => {
    setMapView('capacity');
    setTechFilter(new Set());
    setCollapsedSections(new Set());
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
    return (m?.locations || []).filter(l => l.latitude && l.longitude);
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
      if (toLoc && modelLocations.find(l => l.name === toLoc)) {
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
  const clearTechFilter = () => setTechFilter(new Set());

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
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold', formatter: p => p.name + '\n' + fmtNum(p.value, 0) + ' MWh' } },
        data,
      }],
      tooltip: { trigger: 'item', formatter: p => `${p.name}<br/><b>${fmtFull(p.value)} MWh</b> (${p.percent}%)` },
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
          ? `${p.data.source} → ${p.data.target}<br/><b>${fmtFull(p.data.value)} MWh</b>`
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
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="max-w-screen-2xl mx-auto p-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">Results Dashboard</h1>
            <p className="text-slate-500 text-sm">Calliope optimisation results · interactive analysis</p>
          </div>
          {result && (
            <button onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-50 transition text-sm shadow-sm">
              <FiDownload size={14} /> Export JSON
            </button>
          )}
        </div>

        {/* ── Run selector (compact chip strip) ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap flex-shrink-0 border-r border-slate-200 pr-2 mr-1">Runs</span>
          {completedJobs.length === 0 ? (
            <span className="text-slate-400 text-xs flex items-center gap-1.5">
              <FiAlertCircle size={12} className="opacity-50" /> No runs yet
            </span>
          ) : completedJobs.map(job => (
            <div key={job.id} className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => { setSelectedJobId(job.id); setTab('overview'); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedJobId === job.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${job.status === 'failed' ? 'bg-red-400' : 'bg-green-400'}`} />
                <span className="max-w-[160px] truncate">{job.modelName}</span>
                <span className={`text-[10px] ml-0.5 ${selectedJobId === job.id ? 'text-gray-400' : 'text-slate-400'}`}>{job.duration}</span>
              </button>
              <button onClick={() => { removeCompletedJob(job.id); if (selectedJobId === job.id) setSelectedJobId(null); }}
                className="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                <FiTrash2 size={9} />
              </button>
            </div>
          ))}
        </div>

        {/* ── Main content ── */}
        {!selectedJob ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-24 text-center text-slate-400">
            <FiBarChart2 size={56} className="mx-auto mb-4 opacity-15" />
            <h3 className="text-xl font-semibold mb-1 text-slate-600">Select a run above</h3>
            <p className="text-sm">Run a model from the Run section, then select it here</p>
          </div>
        ) : selectedJob.status === 'failed' ? (
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
        ) : (
          <div className="space-y-4">

            {/* ── KPI strip (compact inline bar) ── */}
            <div className="bg-gray-900 rounded-xl px-5 py-3 flex items-center gap-6 shadow-sm text-white flex-wrap">
              {[
                { label: 'System Cost', value: fmtNum(result?.objective),     unit: '€',   icon: FiDollarSign },
                { label: 'Generation',  value: fmtNum(derivedData?.totalGen), unit: 'MWh', icon: FiZap },
                { label: 'Capacity',    value: fmtNum(derivedData?.totalCap), unit: 'MW',  icon: FiBarChart2 },
                { label: 'Solve Time',  value: selectedJob.duration,           unit: '',    icon: FiClock },
              ].map(({ label, value, unit, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2 flex-shrink-0">
                  <Icon size={13} className="opacity-40" />
                  <div>
                    <div className="text-[10px] opacity-50 uppercase tracking-wide leading-none mb-0.5">{label}</div>
                    <div className="text-sm font-bold leading-none">{value}{unit && <span className="text-xs font-normal opacity-60 ml-1">{unit}</span>}</div>
                  </div>
                </div>
              ))}
              <div className="ml-auto flex items-center gap-1.5 text-xs opacity-50 flex-shrink-0">
                <FiCheckCircle size={11} className="text-green-400 opacity-100" />
                <span>{selectedJob.terminationCondition}</span>
                <span className="ml-1 hidden sm:inline">{new Date(selectedJob.completedAt).toLocaleString()}</span>
              </div>
            </div>

            {/* ── Solver badge ── */}
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center gap-4 shadow-sm text-sm text-slate-600 flex-wrap">
              <span className="flex items-center gap-1.5"><FiCheckCircle className="text-green-500" size={15}/> <strong>{selectedJob.modelName}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Solver: <strong>{selectedJob.solver?.toUpperCase()}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Status: <strong className="text-green-600">{selectedJob.terminationCondition}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Objective: <strong>{fmtFull(result?.objective)} €</strong></span>
              {isLargeModel && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1.5 text-amber-600 font-medium text-xs">
                    <FiLayers size={12} />
                    Large model · {modelLocations.length.toLocaleString()} locations
                    · {Object.keys(derivedData?.capByTech || {}).length} techs
                    · {(result?.timestamps?.length || 0).toLocaleString()} timesteps
                    · per-location charts capped at top {LOC_CHART_LIMIT}
                  </span>
                </>
              )}
              <span className="text-slate-300">|</span>
              <span className="text-slate-400 text-xs">{new Date(selectedJob.completedAt).toLocaleString()}</span>
            </div>

            {/* ── Tabs ── */}
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

            {/* ── Tech filter — grouped chips ── */}
            {allTechs.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 space-y-2">
                {/* Row 1: label + All + group toggles */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-widest flex-shrink-0 border-r border-slate-200 pr-2.5 mr-0.5">
                    <FiFilter size={10} /> Filters
                  </div>
                  <button
                    onClick={clearTechFilter}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                      techFilter.size === 0
                        ? 'bg-gray-900 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    All
                  </button>
                  {activeGroups.map(grp => {
                    const state = groupFilterState(grp.id);
                    const full = state === 'full';
                    const partial = state === 'partial';
                    return (
                      <button key={grp.id} onClick={() => toggleGroup(grp.id)}
                        title={`Toggle all ${grp.label} techs`}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex-shrink-0 border ${
                          full
                            ? 'text-white border-transparent'
                            : partial
                              ? 'border-dashed'
                              : 'bg-white border-slate-200 text-slate-400 line-through opacity-60'
                        }`}
                        style={full || partial ? {
                          background: full ? grp.color : grp.color + '22',
                          borderColor: grp.color + (partial ? 'aa' : ''),
                          color: full ? '#fff' : grp.color,
                        } : {}}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: full ? '#fff' : partial ? grp.color : '#cbd5e1' }} />
                        {grp.label}
                        <span className={`text-[10px] font-normal ml-0.5 ${full ? 'text-white/70' : 'opacity-60'}`}>
                          {(techsByGroup[grp.id] || []).length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Row 2: individual tech chips, separated by group */}
                <div className="flex items-center gap-1.5 flex-wrap border-t border-slate-100 pt-2">
                  {activeGroups.map((grp, gi) => {
                    const techs = techsByGroup[grp.id] || [];
                    if (!techs.length) return null;

                    // For the Links group, collapse many "baseType:destLoc" entries into
                    // unique base-type chips (e.g. "pFV" covers pFV:CHERCAN, pFV:MADRID…)
                    // Toggling a base chip selects/deselects all link techs with that base.
                    if (grp.id === 'tx') {
                      const bases = [...new Set(techs.map(linkTechBase))].sort();
                      return (
                        <span key={grp.id} className="contents">
                          {gi > 0 && <span className="w-px h-4 bg-slate-200 flex-shrink-0 mx-0.5" />}
                          {bases.map(base => {
                            const baseTechs = techs.filter(t => linkTechBase(t) === base);
                            const anyActive = techFilter.size === 0 || baseTechs.some(t => techFilter.has(t));
                            const allActive = techFilter.size === 0 || baseTechs.every(t => techFilter.has(t));
                            const handleBaseToggle = () => {
                              // Toggle all techs with this base as a group
                              setTechFilter(prev => {
                                const expanded = prev.size === 0 ? new Set(allTechs) : new Set(prev);
                                if (allActive) baseTechs.forEach(t => expanded.delete(t));
                                else baseTechs.forEach(t => expanded.add(t));
                                return expanded.size >= allTechs.length ? new Set() : expanded;
                              });
                            };
                            const color = grp.color;
                            // Use friendly display name from model definition if available
                            const baseDisplayName = techMetaMap[base]?.display_name || base.replace(/_/g, ' ');
                            return (
                              <button key={base} onClick={handleBaseToggle}
                                title={`${baseDisplayName} — ${baseTechs.length} link(s): ${baseTechs.map(t => t.split(':')[1]).join(', ')}`}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 border ${
                                  allActive
                                    ? 'border-transparent'
                                    : anyActive
                                      ? 'border-dashed'
                                      : 'bg-white border-slate-200 text-slate-300 line-through opacity-40'
                                }`}
                                style={anyActive ? {
                                  background: color + (allActive ? '22' : '11'),
                                  borderColor: color + (allActive ? '55' : 'aa'),
                                  color: '#334155',
                                } : {}}>
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: anyActive ? color : '#cbd5e1' }} />
                                {baseDisplayName}
                                <span className="text-[9px] opacity-50 ml-0.5">×{baseTechs.length}</span>
                              </button>
                            );
                          })}
                        </span>
                      );
                    }

                    // All other groups: one chip per tech
                    return (
                      <span key={grp.id} className="contents">
                        {gi > 0 && <span className="w-px h-4 bg-slate-200 flex-shrink-0 mx-0.5" />}
                        {techs.map(tech => {
                          const active = techFilter.size === 0 || techFilter.has(tech);
                          const displayName = techMetaMap[tech]?.display_name || tech.replace(/_/g, ' ');
                          const parentLabel = techMetaMap[tech]?.parent || '';
                          return (
                            <button key={tech} onClick={() => toggleTech(tech)}
                              title={`${displayName}${parentLabel ? ` (${parentLabel})` : ''}`}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 border ${
                                active
                                  ? 'border-transparent'
                                  : 'bg-white border-slate-200 text-slate-300 line-through opacity-40'
                              }`}
                              style={active ? {
                                background: techColorFn(tech) + '22',
                                borderColor: techColorFn(tech) + '55',
                                color: '#334155',
                              } : {}}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: active ? techColorFn(tech) : '#cbd5e1' }} />
                              {tech.replace(/_/g, ' ')}
                            </button>
                          );
                        })}
                      </span>
                    );
                  })}
                </div>
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
                    <div style={{ height: 480 }}>
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
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Capacity (MW)</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Generation (MWh)</th>
                            <th className="text-right py-2 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Cost (€)</th>
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
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{fmtFull(cap)}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{gen > 0 ? fmtFull(gen) : '—'}</td>
                                <td className="py-2.5 px-4 text-right text-slate-600 font-mono text-xs">{cost > 0 ? fmtFull(cost) : '—'}</td>
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
                              <span>{fmtNum(gen)} MWh</span>
                              <span className="font-bold text-slate-700">{share.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: techColorFn(tech) }} />
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                              <span>Cap: <strong className="text-slate-700">{fmtNum(cap)} MW</strong></span>
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
                              <div className="text-lg font-bold text-slate-800">{fmtNum(total)}</div>
                              <div className="text-xs text-slate-400">MWh total</div>
                              <div className="mt-1 space-y-0.5">
                                <div className="text-xs text-slate-500">Peak: <strong>{fmtNum(peak)} MW</strong></div>
                                <div className="text-xs text-slate-500">Avg: <strong>{fmtNum(avg)} MW</strong></div>
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
                          <div className="mt-2 text-xs text-slate-500">{fmtNum(renewGen)} MWh renewables / {fmtNum(derivedData.totalGen)} MWh total</div>
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
                          <div className="text-xs text-slate-400 mt-2">Total Cost: {fmtNum(totalCost)} €</div>
                          <div className="text-xs text-slate-400">Total Gen: {fmtNum(derivedData.totalGen)} MWh</div>
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
                                    <span className="font-mono text-slate-500">{fmtNum(cap)} MW · {dom?.replace(/_/g,' ')}</span>
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
    </div>
  );
};

export default Results;
