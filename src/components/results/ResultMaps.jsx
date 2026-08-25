import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { techColor, fmtPower, fmtEnergy, OSM_STYLE, osmTransformRequest } from '../../utils/resultFormat';
import { loadCommunesGeo } from '../../utils/loadCommunesGeo';

// ── Capacity / Generation map ───────────────────────────────────────────────
// ─── Pie SVG builder (for tech-mix markers) ──────────────────────────────────
function buildPieSVG(mix, colorFn, r) {
  const entries = Object.entries(mix).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  if (!entries.length) return `<circle r="${r}" fill="#94a3b8" stroke="white" stroke-width="1.5"/>`;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 1) {
    return `<circle r="${r}" fill="${colorFn(entries[0][0])}" stroke="white" stroke-width="1.5"/>`;
  }
  let startAngle = -Math.PI / 2;
  const slices = entries.map(([tech, val]) => {
    const sweep = (val / total) * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const x1 = r + r * Math.cos(startAngle);
    const y1 = r + r * Math.sin(startAngle);
    const x2 = r + r * Math.cos(endAngle);
    const y2 = r + r * Math.sin(endAngle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M${r},${r} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
    startAngle = endAngle;
    return `<path d="${d}" fill="${colorFn(tech)}" stroke="white" stroke-width="0.8"/>`;
  });
  return slices.join('');
}

const ResultsMap = ({ locations, capacitiesByLoc, dominantTechByLoc, generationByLoc, techMixByLoc = {}, viewMode, colorFn = techColor, transmissionLinks = [] }) => {
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

  const mixLegendEntries = useMemo(() => {
    const seen = new Map();
    Object.values(techMixByLoc || {}).forEach(mix => {
      Object.keys(mix || {}).forEach(tech => { if (tech && !seen.has(tech)) seen.set(tech, colorFn(tech)); });
    });
    return [...seen.entries()];
  }, [techMixByLoc, colorFn]);

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

  const drawTechMixView = (map, mgl, locs) => {
    const lk = (loc) => loc.calliopeName || loc.name;
    const maxCap = Math.max(1, ...locs.map(l => capacitiesByLoc?.[lk(l)] || 0));

    locs.forEach(loc => {
      const key = lk(loc);
      const mix = techMixByLoc[key] || {};
      const cap = capacitiesByLoc?.[key] || 0;
      const r = Math.round(10 + Math.sqrt(cap / maxCap) * 26);
      const totalMWh = Object.values(mix).reduce((s, v) => s + v, 0);
      const svgContent = buildPieSVG(mix, colorFn, r);
      const size = r * 2;
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('width', size);
      svgEl.setAttribute('height', size);
      svgEl.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svgEl.style.cssText = 'display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));';
      svgEl.innerHTML = svgContent;

      const el = document.createElement('div');
      el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;`;
      el.appendChild(svgEl);

      const topTechs = Object.entries(mix).sort(([, a], [, b]) => b - a).slice(0, 4);
      const popupRows = topTechs.map(([t, v]) =>
        `<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${colorFn(t)};flex-shrink:0"></span><span style="color:#475569">${t.replace(/_/g, ' ')}: <b>${fmtEnergy(v, 1)}</b></span></div>`
      ).join('');
      const popup = new mgl.Popup({ offset: r + 4, closeButton: false, maxWidth: '240px' })
        .setHTML(`<div style="font-family:'DM Sans',system-ui;padding:4px"><b style="color:#1e293b">${loc.name}</b><br/><small style="color:#64748b">Cap: ${fmtPower(cap)} · Gen: ${fmtEnergy(totalMWh, 1)}</small><div style="margin-top:4px">${popupRows}</div></div>`);
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
        else if (viewMode === 'mix')   drawTechMixView(map, mgl, locs);
        else                           drawCapacityView(map, mgl, locs);
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
      {viewMode === 'mix' && mixLegendEntries.length > 0 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontFamily: "'DM Sans',system-ui", border: '1px solid #e2e8f0', maxWidth: 170 }}>
          <div style={{ fontWeight: 700, color: '#475569', marginBottom: 5, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Technology Mix</div>
          {mixLegendEntries.map(([tech, color]) => (
            <div key={tech} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ color: '#475569', fontSize: 10.5 }}>{tech.replace(/_/g, ' ')}</span>
            </div>
          ))}
          <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: 9.5 }}>
            Pie size ∝ total capacity · slice ∝ share
          </div>
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


// ── Grouped Location×Tech Spearman Correlation Matrix ───────────────────────
// ltGroups: [{loc, displayName, atoms:[{loc,tech,key}]}] (forward loc order for X axis)
// ltCorrMap: {"loc::tech:::loc::tech" → ρ}
const GroupedCorrMatrixSVG = ({ ltGroups, ltCorrMap }) => {
  if (!ltGroups || !ltGroups.length) return null;

  const nAtoms   = ltGroups.reduce((s, g) => s + g.atoms.length, 0);
  const CELL     = Math.max(8, Math.min(18, Math.floor(560 / nAtoms)));
  const GAP      = Math.max(2, Math.round(CELL * 0.28));
  const TOP      = 12;
  const CBAR_GAP = 14;

  // Font sizes — scale with CELL so both axes grow/shrink together
  const fSm  = Math.max(7,  CELL * 0.62);
  const fLoc = Math.max(8,  CELL * 0.75);

  // Longest tech name drives spacing on BOTH axes
  const maxTechLen = Math.max(
    ...ltGroups.flatMap(g => g.atoms.map(a => a.tech.replace(/_/g, ' ').length)),
    8,
  );

  // Adaptive left margin:
  //   Y_TECH_W  — space for horizontal Y-axis tech labels (width of text)
  //   Y_LOC_W   — column for the rotated Y-axis location labels (their screen width ≈ fLoc)
  const Y_TECH_W = Math.ceil(maxTechLen * fSm * 0.64) + 8;
  const Y_LOC_W  = Math.ceil(fLoc) + 10;
  const LEFT     = Y_LOC_W + Y_TECH_W + 6;
  const Y_LOC_X  = Math.floor(Y_LOC_W / 2) + 2;  // x-centre of location label column

  // Adaptive bottom margin: rotated X-axis tech labels turn into vertical bars
  const X_LABEL_H = Math.ceil(maxTechLen * fSm * 0.64) + 10;

  // ColorBrewer RdBu: red (+1) → white (0) → blue (−1)
  const rhoColor = (rho) => {
    if (rho == null || isNaN(rho)) return null;
    const t = Math.max(0, Math.min(1, (rho + 1) / 2));
    const lr = (a, b, s) => Math.round(a + (b - a) * s);
    if (t >= 0.5) {
      const s = (t - 0.5) * 2;
      return `rgb(${lr(247,178,s)},${lr(247,24,s)},${lr(247,43,s)})`;
    }
    const s = t * 2;
    return `rgb(${lr(33,247,s)},${lr(102,247,s)},${lr(172,247,s)})`;
  };

  // Column layout: forward location order
  const colLayout = [];
  let xCur = LEFT;
  ltGroups.forEach(g => {
    const x0 = xCur;
    colLayout.push({
      group: g, x0,
      cols: g.atoms.map((atom, ai) => ({ atom, cx: x0 + ai * CELL + CELL / 2 })),
    });
    xCur += g.atoms.length * CELL + GAP;
  });
  const matW = xCur - GAP - LEFT;

  // Row layout: reverse location order (last location at top)
  const rowLayout = [];
  let yCur = TOP;
  [...ltGroups].reverse().forEach(g => {
    const y0 = yCur;
    rowLayout.push({
      group: g, y0,
      rows: g.atoms.map((atom, ai) => ({ atom, cy: y0 + ai * CELL + CELL / 2 })),
    });
    yCur += g.atoms.length * CELL + GAP;
  });
  const matH = yCur - GAP - TOP;

  const svgW = LEFT + matW + CBAR_GAP + 30;
  const svgH = TOP + matH + X_LABEL_H + fLoc + 18;

  const allCols = colLayout.flatMap(c => c.cols);
  const allRows = rowLayout.flatMap(r => r.rows);

  // Cells: colored squares sized by |ρ|
  const cells = [];
  allRows.forEach(({ atom: rAtom, cy }) => {
    allCols.forEach(({ atom: cAtom, cx }) => {
      if (rAtom.key === cAtom.key) return;
      const rho = ltCorrMap[`${rAtom.key}:::${cAtom.key}`];
      if (rho == null || isNaN(rho) || Math.abs(rho) < 0.05) return;
      const sq = Math.max(1.5, Math.abs(rho) * (CELL - 2));
      const color = rhoColor(rho);
      cells.push(
        <rect key={`${rAtom.key}|${cAtom.key}`}
          x={cx - sq / 2} y={cy - sq / 2} width={sq} height={sq}
          fill={color} rx={sq * 0.06}>
          <title>{`${rAtom.loc} ${rAtom.tech.replace(/_/g, ' ')} × ${cAtom.loc} ${cAtom.tech.replace(/_/g, ' ')}\nρ = ${rho.toFixed(2)}`}</title>
        </rect>
      );
    });
  });

  // Group separator lines
  const seps = [];
  colLayout.forEach(({ x0 }, i) => {
    if (i === 0) return;
    const x = x0 - GAP / 2;
    seps.push(<line key={`vc${i}`} x1={x} y1={TOP} x2={x} y2={TOP + matH} stroke="#d1d5db" strokeWidth={0.8} />);
  });
  rowLayout.forEach(({ y0 }, i) => {
    if (i === 0) return;
    const y = y0 - GAP / 2;
    seps.push(<line key={`hr${i}`} x1={LEFT} y1={y} x2={LEFT + matW} y2={y} stroke="#d1d5db" strokeWidth={0.8} />);
  });

  const barX = LEFT + matW + CBAR_GAP;
  const barH = Math.min(160, matH * 0.7);
  const barY = TOP + (matH - barH) / 2;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={svgW} height={svgH} style={{ fontFamily: "'DM Sans', system-ui", display: 'block' }}>
        {/* Matrix background */}
        <rect x={LEFT} y={TOP} width={matW} height={matH} fill="#f8fafc" />

        {/* Group separators */}
        {seps}

        {/* Matrix border */}
        <rect x={LEFT} y={TOP} width={matW} height={matH}
          fill="none" stroke="#e2e8f0" strokeWidth={1} />

        {/* Correlation squares */}
        {cells}

        {/* X axis — tech labels (vertical, below matrix, reading bottom-to-top) */}
        {allCols.map(({ atom, cx }) => (
          <text key={`xt-${atom.key}`}
            transform={`translate(${cx},${TOP + matH + 4}) rotate(-90)`}
            textAnchor="end" fontSize={fSm} fill="#64748b">
            {atom.tech.replace(/_/g, ' ')}
          </text>
        ))}

        {/* X axis — location labels (below tech labels, gap = X_LABEL_H) */}
        {colLayout.map(({ group, x0, cols }) => (
          <text key={`xl-${group.loc}`}
            x={x0 + cols.length * CELL / 2} y={TOP + matH + 6 + X_LABEL_H + fLoc}
            textAnchor="middle" fontSize={fLoc} fontWeight="600" fill="#1e293b">
            {group.displayName}
          </text>
        ))}

        {/* Y axis — tech labels */}
        {allRows.map(({ atom, cy }) => (
          <text key={`yt-${atom.key}`}
            x={LEFT - 6} y={cy}
            textAnchor="end" dominantBaseline="middle"
            fontSize={fSm} fill="#64748b">
            {atom.tech.replace(/_/g, ' ')}
          </text>
        ))}

        {/* Y axis — location labels (rotated) */}
        {rowLayout.map(({ group, y0, rows }) => (
          <text key={`yl-${group.loc}`}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={fLoc} fontWeight="700" fill="#1e293b"
            transform={`translate(${Y_LOC_X},${y0 + rows.length * CELL / 2}) rotate(-90)`}>
            {group.displayName}
          </text>
        ))}

        {/* Color bar — discrete strips to avoid SVG gradient ID conflicts */}
        {Array.from({ length: 24 }, (_, i) => {
          const rho = 1 - 2 * i / 23;
          const stripH = barH / 24;
          return <rect key={i} x={barX} y={barY + i * stripH} width={10} height={stripH + 0.5} fill={rhoColor(rho)} />;
        })}
        {[{ label: '1', y: barY }, { label: '0', y: barY + barH / 2 }, { label: '−1', y: barY + barH }].map(({ label, y }) => (
          <text key={label} x={barX + 14} y={y} dominantBaseline="middle" fontSize={8} fill="#64748b">{label}</text>
        ))}
        <line x1={barX} y1={barY + barH / 2} x2={barX + 10} y2={barY + barH / 2}
          stroke="#94a3b8" strokeWidth={0.5} />
      </svg>
    </div>
  );
};

// ── Choropleth map (commune boundaries filled by metric value) ───────────────

const CHORO_RAMPS = {
  blue:   ['#e0f2fe', '#0369a1'],
  amber:  ['#fef9c3', '#b45309'],
  green:  ['#dcfce7', '#15803d'],
};

const RegionChoropleth = ({ metric = {}, metricLabel = 'Value', colorRamp = 'blue', fmtValue = null }) => {
  const mapRef    = useRef(null);
  const mapInstRef = useRef(null);
  const [error, setError] = useState(null);

  const fmt = fmtValue || ((v) => fmtEnergy(v));
  const [lo, hi] = CHORO_RAMPS[colorRamp] || CHORO_RAMPS.blue;

  useEffect(() => {
    let destroyed = false;
    const container = mapRef.current;
    if (!container) return;

    (async () => {
      let geoJSON;
      try {
        geoJSON = await loadCommunesGeo();
      } catch {
        if (!destroyed) setError('Could not load region boundaries.');
        return;
      }
      if (destroyed) return;

      const maxVal = Math.max(1, ...Object.values(metric));

      // Enrich features with metric value
      const enriched = {
        ...geoJSON,
        features: geoJSON.features.map(f => {
          const name = f.properties.comuna;
          const val = metric[name] ?? metric[name?.toLowerCase()] ?? 0;
          return { ...f, properties: { ...f.properties, _val: val } };
        }),
      };

      const mgl = await import('maplibre-gl');
      if (destroyed) return;

      const map = new mgl.Map({
        container,
        style: OSM_STYLE,
        transformRequest: osmTransformRequest,
        center: [-70.6, -33.5],
        zoom: 4,
        attributionControl: false,
      });
      mapInstRef.current = map;

      map.on('load', () => {
        if (destroyed) return;
        map.addSource('communes', { type: 'geojson', data: enriched });

        map.addLayer({
          id: 'communes-fill',
          type: 'fill',
          source: 'communes',
          paint: {
            'fill-color': [
              'interpolate', ['linear'], ['get', '_val'],
              0, lo,
              maxVal, hi,
            ],
            'fill-opacity': 0.72,
          },
        });
        map.addLayer({
          id: 'communes-outline',
          type: 'line',
          source: 'communes',
          paint: { 'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': 0.7 },
        });

        // Popup on hover
        const popup = new mgl.Popup({ closeButton: false, closeOnClick: false });
        map.on('mousemove', 'communes-fill', (e) => {
          if (!e.features?.length) return;
          const f = e.features[0];
          const val = f.properties._val || 0;
          const label = val > 0 ? fmt(val) : '—';
          popup.setLngLat(e.lngLat)
            .setHTML(`<div style="font-size:12px;line-height:1.6"><strong>${f.properties.comuna}</strong><br/>${metricLabel}: ${label}</div>`)
            .addTo(map);
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'communes-fill', () => {
          popup.remove();
          map.getCanvas().style.cursor = '';
        });

        // Fit to data communes with values
        const populated = enriched.features.filter(f => f.properties._val > 0);
        if (populated.length > 0) {
          const coords = populated.flatMap(f => {
            const geom = f.geometry;
            if (!geom) return [];
            const rings = geom.type === 'MultiPolygon'
              ? geom.coordinates.flat(1)
              : geom.coordinates;
            return rings.flat();
          });
          if (coords.length) {
            const lngs = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 40, duration: 0, maxZoom: 9 }
            );
          }
        }
        map.resize();
      });
    })();

    return () => {
      destroyed = true;
      if (mapInstRef.current) { mapInstRef.current.remove(); mapInstRef.current = null; }
    };
  }, [metric, metricLabel, lo, hi, fmt]);

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 24, right: 10, background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 10px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, color: '#475569', marginBottom: 5, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{metricLabel}</div>
        <div style={{ width: 100, height: 8, borderRadius: 4, background: `linear-gradient(to right, ${lo}, ${hi})`, marginBottom: 3 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 9.5 }}>
          <span>0</span>
          <span>{fmt(Math.max(1, ...Object.values(metric)))}</span>
        </div>
      </div>
    </div>
  );
};

export { ResultsMap, TransmissionFlowMap, GroupedCorrMatrixSVG, RegionChoropleth };
