import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import ReactECharts from 'echarts-for-react';
import {
  FiBarChart2, FiPieChart, FiTrendingUp, FiDownload,
  FiRefreshCw, FiAlertCircle, FiCheckCircle, FiTrash2,
  FiTerminal, FiAlertTriangle, FiMapPin, FiDollarSign,
  FiZap, FiActivity, FiClock, FiCpu, FiMap, FiLayers, FiShare2, FiGrid,
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

// Parse "Berlin::solar_pv::electricity" → {loc, tech, carrier}
const parseLTC = (s) => {
  const p = String(s).split('::');
  if (p.length >= 3) return { loc: p[0], tech: p[1], carrier: p[2] };
  if (p.length === 2) return { loc: p[0], tech: p[1], carrier: '' };
  return { loc: '', tech: p[0], carrier: '' };
};

// OSM map style
const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// ── Capacity / Generation map ───────────────────────────────────────────────
const ResultsMap = ({ locations, capacitiesByLoc, dominantTechByLoc, generationByLoc, viewMode }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // ── Capacity circles view ──
  const drawCapacityView = (map, mgl, locs) => {
    const maxCap = Math.max(1, ...locs.map(l => capacitiesByLoc[l.name] || 0), 1);
    locs.forEach(loc => {
      const cap = capacitiesByLoc[loc.name] || 0;
      const radius = 8 + Math.sqrt(cap / maxCap) * 30;
      const color = techColor(dominantTechByLoc[loc.name] || 'generic');
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
        attributionControl: false, failIfMajorPerformanceCaveat: false,
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
        attributionControl: false, failIfMajorPerformanceCaveat: false,
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

  // Reset map view when job changes
  useEffect(() => { setMapView('capacity'); }, [selectedJobId]);

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

  // ── Derived data ───────────────────────────────────────────────────────────
  const derivedData = useMemo(() => {
    if (!result) return null;

    // Parse capacities: "Berlin::solar_pv" → {loc, tech, value}
    const capEntries = Object.entries(result.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !e.tech.includes('transmission'));

    // Capacity by tech (summed)
    const capByTech = {};
    capEntries.forEach(({ tech, value }) => { capByTech[tech] = (capByTech[tech] || 0) + value; });

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

    return { capByTech, capByLoc, domTech, genByTech, genByLoc, totalGen, totalCap, timestamps };
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
    const sorted = Object.entries(derivedData.capByTech).sort(([, a], [, b]) => b - a);
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 24, top: 16, bottom: 32 },
      xAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#64748b', formatter: v => fmtNum(v) + ' MW' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: sorted.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { fontSize: 11, color: '#475569' } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: sorted.map(([tech, v]) => ({ value: v, itemStyle: { color: techColor(tech), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', formatter: p => fmtNum(p.value) + ' MW', fontSize: 10, color: '#64748b' },
      }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmtFull(p[0].value)} MW</b>` },
    };
  }, [derivedData]);

  // Donut: generation mix
  const genDonutOption = useMemo(() => {
    if (!derivedData?.genByTech) return null;
    const data = Object.entries(derivedData.genByTech)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([tech, v]) => ({ name: tech.replace(/_/g, ' '), value: Math.round(v), itemStyle: { color: techColor(tech) } }));
    return {
      backgroundColor: 'transparent',
      legend: { bottom: 4, type: 'scroll', textStyle: { fontSize: 10, color: '#475569' } },
      series: [{
        type: 'pie', radius: ['44%', '72%'], center: ['50%', '42%'],
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold', formatter: p => p.name + '\n' + fmtNum(p.value, 0) + ' MWh' } },
        data,
      }],
      tooltip: { trigger: 'item', formatter: p => `${p.name}<br/><b>${fmtFull(p.value)} MWh</b> (${p.percent}%)` },
    };
  }, [derivedData]);

  // Bar: costs by tech
  const costsTechOption = useMemo(() => {
    if (!result?.costs_by_tech) return null;
    const sorted = Object.entries(result.costs_by_tech).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 24, top: 16, bottom: 32 },
      xAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#64748b', formatter: v => fmtNum(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: sorted.map(([t]) => t.replace(/_/g, ' ')), axisLabel: { fontSize: 11, color: '#475569' } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: sorted.map(([tech, v]) => ({ value: v, itemStyle: { color: techColor(tech), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', formatter: p => fmtNum(p.value), fontSize: 10, color: '#64748b' },
      }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmtFull(p[0].value)}</b>` },
    };
  }, [result]);

  // Stacked bar: costs by location × tech
  const costsLocOption = useMemo(() => {
    if (!result?.costs_by_location) return null;
    const locs = Object.keys(result.costs_by_location).sort();
    const techSet = [...new Set(locs.flatMap(l => Object.keys(result.costs_by_location[l])))].filter(t => !t.includes('transmission'));
    const series = techSet.map(tech => ({
      name: tech.replace(/_/g, ' '),
      type: 'bar',
      stack: 'total',
      data: locs.map(l => Math.max(0, result.costs_by_location[l]?.[tech] || 0)),
      itemStyle: { color: techColor(tech) },
      emphasis: { focus: 'series' },
    }));
    return {
      backgroundColor: 'transparent',
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10, color: '#475569' } },
      grid: { left: 60, right: 20, top: 16, bottom: 56 },
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 11, color: '#475569', rotate: locs.length > 4 ? 30 : 0 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#64748b', formatter: v => fmtNum(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      series,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    };
  }, [result]);

  // Stacked area: dispatch timeseries
  const dispatchOption = useMemo(() => {
    if (!result?.dispatch || !derivedData?.timestamps?.length) return null;
    const techs = Object.keys(result.dispatch);
    const series = techs.map(tech => ({
      name: tech.replace(/_/g, ' '),
      type: 'line',
      stack: 'gen',
      areaStyle: { opacity: 0.75 },
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 0 },
      itemStyle: { color: techColor(tech) },
      data: result.dispatch[tech],
      emphasis: { focus: 'series' },
    }));
    // Add demand line if available
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
    // Downsample labels if too many
    const labels = derivedData.timestamps;
    const step = Math.max(1, Math.ceil(labels.length / 24));
    const axisLabels = labels.map((l, i) => (i % step === 0 ? l : ''));
    return {
      backgroundColor: 'transparent',
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10, color: '#475569' } },
      grid: { left: 60, right: 20, top: 20, bottom: 72 },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false,
        axisLabel: { fontSize: 10, color: '#64748b', rotate: 35,
          formatter: (_, i) => (i % step === 0 ? labels[i] : '') },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value', name: 'MW',
        axisLabel: { fontSize: 11, color: '#64748b', formatter: v => fmtNum(v) },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 32, height: 18 }],
      series,
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' },
        formatter: params => {
          const rows = params.map(p => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}: <b>${fmtNum(+p.value)} MW</b>`).join('<br/>');
          return `<div style="font-size:11px">${params[0]?.name}<br/>${rows}</div>`;
        }
      },
    };
  }, [result, derivedData]);

  // Grouped bar: capacity per location per tech
  const capLocOption = useMemo(() => {
    if (!derivedData?.capByTech) return null;
    const capEntries = Object.entries(result?.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !e.tech.includes('transmission'));

    const locs = [...new Set(capEntries.map(e => e.loc))].sort();
    const techs = [...new Set(capEntries.map(e => e.tech))];

    const byLocTech = {};
    capEntries.forEach(({ loc, tech, value }) => { byLocTech[`${loc}::${tech}`] = value; });

    const series = techs.map(tech => ({
      name: tech.replace(/_/g, ' '),
      type: 'bar',
      barMaxWidth: 22,
      data: locs.map(l => byLocTech[`${l}::${tech}`] || 0),
      itemStyle: { color: techColor(tech) },
    }));

    return {
      backgroundColor: 'transparent',
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10, color: '#475569' } },
      grid: { left: 60, right: 20, top: 16, bottom: 56 },
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 11, color: '#475569', rotate: locs.length > 4 ? 30 : 0 } },
      yAxis: { type: 'value', name: 'MW', axisLabel: { fontSize: 11, color: '#64748b', formatter: v => fmtNum(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      series,
    };
  }, [result, derivedData]);

  // Sankey: energy flow Location → Tech → Carrier
  const sankeyOption = useMemo(() => {
    if (!result?.generation) return null;
    const genEntries = Object.entries(result.generation || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !e.tech.includes('transmission'));
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
        label: { fontSize: 11, color: '#374151' },
        lineStyle: { color: 'gradient', opacity: 0.5 },
        data: nodes,
        links,
      }],
    };
  }, [result]);

  // Capacity factor heatmap: locations × technologies
  const cfHeatmapOption = useMemo(() => {
    if (!derivedData?.capByTech || !result?.generation) return null;
    const capEntries = Object.entries(result?.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && !e.tech.includes('transmission'));
    const genEntries = Object.entries(result.generation || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0);

    const locs = [...new Set(capEntries.map(e => e.loc))].sort();
    const techs = [...new Set(capEntries.map(e => e.tech))].sort();
    const hrs = (result?.timestamps?.length) || 8760;

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
      xAxis: { type: 'category', data: locs, axisLabel: { fontSize: 11, color: '#475569', rotate: locs.length > 4 ? 30 : 0 } },
      yAxis: { type: 'category', data: techs.map(t => t.replace(/_/g,' ')), axisLabel: { fontSize: 11, color: '#475569' } },
      visualMap: {
        min: 0, max: 100, calculable: true, orient: 'horizontal',
        right: 0, bottom: 0, text: ['100%', '0%'],
        textStyle: { fontSize: 10, color: '#64748b' },
        inRange: { color: ['#f9fafb','#d1d5db','#6b7280','#1f2937','#030712'] },
      },
      series: [{
        type: 'heatmap',
        data,
        label: { show: true, fontSize: 10, color: '#fff', formatter: p => p.value[2] > 0 ? p.value[2] + '%' : '' },
      }],
      tooltip: {
        trigger: 'item',
        formatter: p => `${locs[p.data[0]]} × ${techs[p.data[1]].replace(/_/g,' ')}<br/><b>CF: ${p.data[2]}%</b>`,
      },
    };
  }, [result, derivedData]);

  // Cost per MWh by technology
  const costPerMwhOption = useMemo(() => {
    if (!result?.costs_by_tech || !derivedData?.genByTech) return null;
    const data = Object.entries(result.costs_by_tech)
      .filter(([, cost]) => cost > 0)
      .map(([tech, cost]) => {
        const gen = derivedData.genByTech[tech] || 0;
        return { tech, costPerMwh: gen > 0 ? cost / gen : 0, cost, gen };
      })
      .filter(d => d.costPerMwh > 0)
      .sort((a, b) => b.costPerMwh - a.costPerMwh);
    if (!data.length) return null;
    return {
      backgroundColor: 'transparent',
      grid: { left: 140, right: 60, top: 16, bottom: 32 },
      xAxis: { type: 'value', axisLabel: { fontSize: 11, color: '#64748b', formatter: v => fmtNum(v) + ' €/MWh' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
      yAxis: { type: 'category', data: data.map(d => d.tech.replace(/_/g,' ')), axisLabel: { fontSize: 11, color: '#475569' } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: data.map(d => ({ value: +d.costPerMwh.toFixed(2), itemStyle: { color: techColor(d.tech), borderRadius: [0,4,4,0] } })),
        label: { show: true, position: 'right', formatter: p => p.value.toFixed(1) + ' €/MWh', fontSize: 10, color: '#64748b' },
      }],
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${p[0].value.toFixed(2)} €/MWh</b>` },
    };
  }, [result, derivedData]);

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
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FiBarChart2 size={15} className="text-gray-600" />
                      <span className="font-semibold text-slate-800 text-sm">Installed Capacity by Technology</span>
                    </div>
                    {capBarOption ? (
                      <ReactECharts option={capBarOption} style={{ height: 280 }} notMerge />
                    ) : <div className="text-slate-400 text-sm text-center py-16">No capacity data</div>}
                  </div>
                  {/* Generation donut */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FiPieChart size={15} className="text-amber-500" />
                      <span className="font-semibold text-slate-800 text-sm">Generation Mix</span>
                      <span className="text-xs text-slate-400 ml-1">· MWh total</span>
                    </div>
                    {genDonutOption ? (
                      <ReactECharts option={genDonutOption} style={{ height: 280 }} notMerge />
                    ) : <div className="text-slate-400 text-sm text-center py-16">No generation data</div>}
                  </div>
                  {/* Capacity by location */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FiMapPin size={15} className="text-gray-600" />
                      <span className="font-semibold text-slate-800 text-sm">Capacity by Location & Technology</span>
                    </div>
                    {capLocOption ? (
                      <ReactECharts option={capLocOption} style={{ height: 280 }} notMerge />
                    ) : <div className="text-slate-400 text-sm text-center py-16">No location data</div>}
                  </div>
                </div>

                {/* Technology summary table */}
                {derivedData?.capByTech && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="font-semibold text-slate-800 text-sm mb-4 flex items-center gap-2">
                      <FiTrendingUp size={15} className="text-slate-500" /> Technology Summary
                    </h3>
                    <div className="overflow-x-auto">
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
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: techColor(tech) }} />
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
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ ENERGY FLOW TAB (SANKEY) ════════════════ */}
            {tab === 'flow' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <FiShare2 size={15} className="text-gray-600" />
                    <span className="font-semibold text-slate-800 text-sm">Energy Flow — Sankey Diagram</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">Flow width = total generation (MWh) · Technology → Carrier → Total Demand</p>
                  {sankeyOption ? (
                    <ReactECharts option={sankeyOption} style={{ height: 480 }} notMerge />
                  ) : (
                    <div className="text-slate-400 text-sm text-center py-24">
                      <FiShare2 size={40} className="mx-auto mb-3 opacity-20" />
                      Insufficient generation data to build energy flow diagram
                    </div>
                  )}
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
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: techColor(tech) }} />
                              <span className="font-semibold text-slate-700 text-sm capitalize">{tech.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                              <span>{fmtNum(gen)} MWh</span>
                              <span className="font-bold text-slate-700">{share.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: techColor(tech) }} />
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
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <FiActivity size={15} className="text-green-600" />
                        <span className="font-semibold text-slate-800 text-sm">Generation Dispatch Stack</span>
                        <span className="text-xs text-slate-400 ml-1">· MW/hour · scroll to zoom</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-3">Stacked area = supply mix · dashed red = demand</p>
                      <ReactECharts option={dispatchOption} style={{ height: 400 }} notMerge />
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
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: techColor(tech) }} />
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
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FiDollarSign size={15} className="text-emerald-600" />
                      <span className="font-semibold text-slate-800 text-sm">Total Cost by Technology</span>
                    </div>
                    {costsTechOption ? (
                      <ReactECharts option={costsTechOption} style={{ height: 280 }} notMerge />
                    ) : <div className="text-slate-400 text-sm text-center py-12">No cost data</div>}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FiTrendingUp size={15} className="text-gray-600" />
                      <span className="font-semibold text-slate-800 text-sm">Cost per MWh by Technology</span>
                      <span className="text-xs text-slate-400 ml-1">· LCOE proxy</span>
                    </div>
                    {costPerMwhOption ? (
                      <ReactECharts option={costPerMwhOption} style={{ height: 280 }} notMerge />
                    ) : <div className="text-slate-400 text-sm text-center py-12">No data</div>}
                  </div>
                </div>

                {costsLocOption && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FiMapPin size={15} className="text-gray-600" />
                      <span className="font-semibold text-slate-800 text-sm">Cost Breakdown by Location &amp; Technology</span>
                    </div>
                    <ReactECharts option={costsLocOption} style={{ height: 300 }} notMerge />
                  </div>
                )}

                {result?.costs_by_location && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
                    <h3 className="font-semibold text-slate-800 text-sm mb-4">Cost Detail Table (€)</h3>
                    {(() => {
                      const locs = Object.keys(result.costs_by_location).sort();
                      const techs = [...new Set(locs.flatMap(l => Object.keys(result.costs_by_location[l])))].sort();
                      return (
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
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ ANALYSIS TAB ════════════════ */}
            {tab === 'analysis' && (
              <div className="space-y-4">
                {/* Capacity factor heatmap */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <FiGrid size={15} className="text-gray-600" />
                    <span className="font-semibold text-slate-800 text-sm">Capacity Factor Heatmap</span>
                    <span className="text-xs text-slate-400 ml-1">· Location × Technology · darker = higher utilisation</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">CF = total generation ÷ (installed capacity × hours). High CF means the asset is heavily used.</p>
                  {cfHeatmapOption ? (
                    <ReactECharts option={cfHeatmapOption} style={{ height: 320 }} notMerge />
                  ) : (
                    <div className="text-slate-400 text-sm text-center py-16">
                      Insufficient data — needs both capacity and generation outputs
                    </div>
                  )}
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
                                <span className="w-2 h-2 rounded-full" style={{ background: techColor(topTech?.[0] || '') }} />
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
                    <h3 className="font-semibold text-slate-800 text-sm mb-4">Per-Location Capacity Breakdown</h3>
                    <div className="space-y-3">
                      {Object.entries(derivedData.capByLoc).sort(([,a],[,b]) => b-a).map(([loc, cap]) => {
                        const maxCap = Math.max(...Object.values(derivedData.capByLoc));
                        const pct = maxCap > 0 ? (cap / maxCap * 100) : 0;
                        const dom = derivedData.domTech[loc];
                        return (
                          <div key={loc}>
                            <div className="flex items-center justify-between mb-1 text-xs">
                              <span className="font-medium text-slate-700 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: techColor(dom) }} />
                                {loc}
                              </span>
                              <span className="font-mono text-slate-500">{fmtNum(cap)} MW · {dom?.replace(/_/g,' ')}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: techColor(dom) }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
