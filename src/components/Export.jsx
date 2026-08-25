import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useData } from '../context/DataContext';
import { FiDownload, FiFolder, FiFile, FiCheckCircle, FiAlertCircle, FiPackage, FiZap, FiActivity, FiCpu, FiSettings, FiDatabase, FiLayers, FiMap, FiBarChart2 } from 'react-icons/fi';
import { loadCommunesGeo, normComuna } from '../utils/loadCommunesGeo';
import { choroMetricsFromResult } from '../utils/choroMetrics';
import { buildChoroplethSVG, buildNodeMapSVG, buildTransmissionMapSVG, buildTechPieMapSVG } from '../utils/choroSvg';
import { techColor, parseLTC } from '../utils/resultFormat';
import { buildAllResultCharts, RESULT_CHARTS } from '../utils/resultCharts';
import { renderChartPng, dataUrlToBase64, techMixByLocFromResult } from '../utils/resultExports';
import { ResultsMap, TransmissionFlowMap, RegionChoropleth } from './results/ResultMaps';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { dump } from 'js-yaml';
import { LINK_TYPES } from '../config/linkTypes';
import { internalTo07Yaml } from '../services/calliope07Format';
import { exportModelArchive, checkEngineRunService } from '../services/engineClient';
import { resolveScenario } from '../services/scenarioResolver';
import TranslationReport from './TranslationReport';
import { FiCheck } from 'react-icons/fi';
import { buildResultDataFiles, aggregateResult } from '../utils/resultExports';
import { fmtNum, fmtPower, fmtEnergy, fmtCost, calliopeLocName } from '../utils/resultFormat';

const TECH_PIE_ID = 'techpie';
// Charts with many x-categories / timeline → render full width
const WIDE_CHARTS = new Set(['dispatch', 'energy_flow_sankey', 'capacity_factor', 'capacity_by_location', 'costs_by_location']);

const SectionTitle = ({ children, count }) => (
  <div className="flex items-center gap-2 mt-1 mb-2">
    <h3 className="text-sm font-semibold text-slate-700">{children}</h3>
    {count != null && <span className="text-[10px] text-slate-400">{count} available</span>}
  </div>
);

// Clickable card that toggles whether an item is included in the export.
// Module-level (stable identity) so toggling selection never remounts the
// chart/map children — otherwise every click would re-init the ECharts.
const ToggleCard = React.memo(function ToggleCard({ on, onToggle, title, badge, children, className = '' }) {
  return (
    <div role="button" tabIndex={0} onClick={onToggle}
      className={`relative rounded-xl border cursor-pointer transition-all ${className} ${
        on ? 'border-gray-700 ring-1 ring-gray-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-55 hover:opacity-90'
      }`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-gray-800 text-white' : 'bg-white border border-slate-300 text-transparent'}`}>
          <FiCheck size={11} />
        </span>
        <span className="text-xs font-medium text-slate-700 flex-1 truncate">{title}</span>
        {badge && <span className="text-[9px] font-mono text-slate-400">{badge}</span>}
        {!on && <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">excluded</span>}
      </div>
      {children && <div className="p-2 pointer-events-none">{children}</div>}
    </div>
  );
});

// Selectable region-map (SVG) outputs — all derive from commune demand data
const MAP_OUTPUTS = [
  { id: 'region_demand',    metric: 'demand',    label: 'Region map — Demand',       kind: 'seq', ramp: ['#fff7ec', '#fdbb84', '#d7301f'], unit: 'MWh' },
  { id: 'region_unmet',     metric: 'unmet',     label: 'Region map — Unmet demand',  kind: 'seq', ramp: ['#fff5f0', '#fb6a4a', '#a50f15'], unit: 'MWh' },
  { id: 'region_demandMet', metric: 'demandMet', label: 'Region map — Demand met',    kind: 'pct', ramp: ['#d73027', '#fee08b', '#1a9850'] },
];

// Human labels for the selectable result outputs
const RESULT_FILE_LABELS = {
  'summary_kpis.csv': 'Summary KPIs',
  'capacities.csv': 'Capacities by location & tech',
  'generation.csv': 'Generation by location & tech',
  'costs_by_tech.csv': 'Costs by technology',
  'costs_by_location.csv': 'Costs by location',
  'demand_unmet_by_commune.csv': 'Demand & unmet by commune',
  'dispatch.csv': 'Dispatch timeseries',
  'result.json': 'Full result (JSON)',
};
// ── Results export panel: pick a run, click items to include, download ZIP ──
function ResultsExportPanel({ completedJobs, modelLocations = [] }) {
  const { models } = useData();
  const runs = useMemo(
    () => (completedJobs || []).filter(j => j.result && j.result.success !== false),
    [completedJobs]
  );
  const [runId, setRunId] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState(null);

  const activeRun = runs.find(r => r.id === runId) || runs[0] || null;

  // Commune boundaries for the exported SVGs
  const [geo, setGeo] = useState(null);
  const [geoErr, setGeoErr] = useState(null);
  const [previewMapId, setPreviewMapId] = useState(null); // which map shows in the big live view
  useEffect(() => {
    let dead = false;
    loadCommunesGeo().then(g => { if (!dead) setGeo(g); }).catch(e => { if (!dead) setGeoErr(e.message || 'failed to load'); });
    return () => { dead = true; };
  }, []);

  // Headline values for the preview strip
  const summary = useMemo(() => {
    if (!activeRun) return null;
    const a = aggregateResult(activeRun.result);
    return { ...a, objective: activeRun.result?.objective, unmet: activeRun.result?.unmet_demand_total };
  }, [activeRun]);

  // Available outputs for the active run
  const dataFiles = useMemo(() => (activeRun ? buildResultDataFiles(activeRun.result) : {}), [activeRun]);
  // Same chart builders the Results view uses (single source) → { id: { label, option } }
  const charts = useMemo(() => (activeRun ? buildAllResultCharts(activeRun.result, { colorFn: techColor }) : {}), [activeRun]);
  const choro = useMemo(() => (activeRun ? choroMetricsFromResult(activeRun.result) : { demand: {}, unmet: {}, demandMet: {} }), [activeRun]);
  const hasCommunes = Object.keys(choro.demand || {}).length > 0;

  // The run's own model (by name) → its locations with coordinates, exactly like
  // the Results view resolves them. This is what makes the real maps show points.
  const runModelLocations = useMemo(() => {
    if (!activeRun) return [];
    const baseName = (activeRun.modelName || '').replace(/ \(version \d+\)$/, '');
    const m = (models || []).find(mm => mm.name === baseName || mm.name === activeRun.modelName);
    const locs = (m?.locations || []).filter(l => l.latitude && l.longitude);
    const src = locs.length ? locs : (modelLocations || []);
    return src.filter(l => (l.latitude ?? l.coordinates?.lat) != null).map(l => ({ ...l, calliopeName: calliopeLocName(l.name) }));
  }, [activeRun, models, modelLocations]);

  // Coordinates for every location: run's own coordinates, else the model's. Keyed by normalized name.
  const coords = useMemo(() => {
    const c = {};
    Object.entries(activeRun?.result?.coordinates || {}).forEach(([n, ll]) => {
      if (Array.isArray(ll) && ll.length === 2) c[normComuna(n)] = { lat: +ll[0], lon: +ll[1] };
    });
    runModelLocations.forEach(l => {
      const lat = l.latitude ?? l.coordinates?.lat, lon = l.longitude ?? l.coordinates?.lon;
      if (lat != null && lon != null) {
        [l.calliopeName || l.name, l.name].forEach(nm => { const k = normComuna(nm); if (!c[k]) c[k] = { lat: +lat, lon: +lon }; });
      }
    });
    return c;
  }, [activeRun, runModelLocations]);

  // Props for the real Results map components (identical shapes to Results.jsx)
  const mapProps = useMemo(() => {
    const res = activeRun?.result || {};
    let locations = runModelLocations;
    if (!locations.length) {
      locations = Object.entries(res.coordinates || {})
        .map(([name, ll]) => (Array.isArray(ll) && ll.length === 2) ? { name, calliopeName: name, latitude: +ll[0], longitude: +ll[1] } : null)
        .filter(Boolean);
    }
    const capByLoc = {}, domTech = {}, genByLoc = {}, locTechCap = {};
    Object.entries(res.capacities || {}).forEach(([k, v]) => {
      const { loc, tech } = parseLTC(k); const val = Number(v) || 0;
      if (val <= 0 || tech.includes(':')) return;
      capByLoc[loc] = (capByLoc[loc] || 0) + val;
      if (!locTechCap[loc] || locTechCap[loc].value < val) locTechCap[loc] = { tech, value: val };
    });
    Object.entries(locTechCap).forEach(([loc, { tech }]) => { domTech[loc] = tech; });
    Object.entries(res.generation || {}).forEach(([k, v]) => {
      const { loc } = parseLTC(k); const val = Number(v) || 0; if (val > 0) genByLoc[loc] = (genByLoc[loc] || 0) + val;
    });
    const techMixByLoc = techMixByLocFromResult(res);
    // transmission links (same detection as Results)
    const txEntries = Object.entries(res.capacities || {}).filter(([k]) => parseLTC(k).tech.includes(':')).map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 })).filter(e => e.value > 0);
    const links = [], used = new Set();
    txEntries.forEach(entry => {
      const key = `${entry.loc}::${entry.tech}`; if (used.has(key)) return;
      const parts = entry.tech.split(':'); const toLoc = parts.length > 1 ? parts[parts.length - 1] : null;
      if (toLoc && locations.find(l => l.calliopeName === toLoc || l.name === toLoc)) { links.push({ fromLoc: entry.loc, toLoc, cap: entry.value }); used.add(key); }
      else { const opp = txEntries.find(e => e.loc !== entry.loc && e.tech === entry.tech && !used.has(`${e.loc}::${e.tech}`)); if (opp) { links.push({ fromLoc: entry.loc, toLoc: opp.loc, cap: entry.value }); used.add(key); used.add(`${opp.loc}::${opp.tech}`); } }
    });
    let flow = [];
    if (res.transmission_flow && Object.keys(res.transmission_flow).length) {
      flow = Object.values(res.transmission_flow).map(({ from: fromLoc, to: toLoc, timeseries }) => {
        const vals = (timeseries || []).map(v => Number(v) || 0);
        const cap = links.find(t => (t.fromLoc === fromLoc && t.toLoc === toLoc) || (t.fromLoc === toLoc && t.toLoc === fromLoc))?.cap || (vals.length ? Math.max(1, ...vals.map(Math.abs)) : 1);
        return { fromLoc, toLoc, timeseries: vals, cap };
      });
    }
    const timestamps = (res.timestamps || []).map(t => { const d = new Date(t); return isNaN(d) ? t : d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); });
    return { locations, capByLoc, domTech, genByLoc, techMixByLoc, links, flow, timestamps };
  }, [activeRun, runModelLocations]);

  // Tech-mix pies (per generation location)
  const pies = useMemo(() => {
    if (!activeRun) return [];
    const mix = techMixByLocFromResult(activeRun.result);
    return Object.entries(mix).map(([loc, slices]) => {
      const c = coords[normComuna(loc)];
      if (!c) return null;
      return { name: loc, lat: c.lat, lon: c.lon, slices: slices.map(s => ({ tech: s.tech, color: techColor(s.tech), value: s.value })) };
    }).filter(Boolean);
  }, [activeRun, coords]);
  const pieAvailable = pies.length > 0;

  // Node maps (capacity / generation circles) + transmission lines, all placed at coords.
  const nodeMaps = useMemo(() => {
    const res = activeRun?.result || {};
    const capByLocTech = {}, genByLoc = {};
    Object.entries(res.capacities || {}).forEach(([k, v]) => {
      const val = Number(v) || 0; if (val <= 0) return;
      const [loc, techRaw = ''] = k.split('::');
      if (techRaw.includes(':')) return; // transmission atom
      const tech = techRaw.split(':')[0];
      (capByLocTech[loc] || (capByLocTech[loc] = {}))[tech] = (capByLocTech[loc][tech] || 0) + val;
    });
    Object.entries(res.generation || {}).forEach(([k, v]) => {
      const val = Number(v) || 0; if (val <= 0) return;
      const loc = k.split('::')[0]; genByLoc[loc] = (genByLoc[loc] || 0) + val;
    });
    const cap = [], gen = [], legendMap = new Map();
    Object.entries(capByLocTech).forEach(([loc, techs]) => {
      const c = coords[normComuna(loc)]; if (!c) return;
      const total = Object.values(techs).reduce((s, x) => s + x, 0);
      const dom = Object.entries(techs).sort((a, b) => b[1] - a[1])[0][0];
      if (!legendMap.has(dom)) legendMap.set(dom, techColor(dom));
      cap.push({ name: loc, lat: c.lat, lon: c.lon, value: total, color: techColor(dom) });
    });
    Object.entries(genByLoc).forEach(([loc, g]) => {
      const c = coords[normComuna(loc)]; if (!c) return;
      gen.push({ name: loc, lat: c.lat, lon: c.lon, value: g });
    });
    // Transmission links from capacity keys "loc::tech:dest"
    const seen = new Set(), links = [], subSet = new Set();
    Object.entries(res.capacities || {}).forEach(([k, v]) => {
      const val = Number(v) || 0; if (val <= 0) return;
      const [loc, techRaw = ''] = k.split('::');
      const ci = techRaw.indexOf(':'); if (ci < 0) return;
      const dest = techRaw.slice(ci + 1);
      const key = [loc, dest].sort().join('|'); if (seen.has(key)) return; seen.add(key);
      subSet.add(loc); subSet.add(dest);
      const a = coords[normComuna(loc)], b = coords[normComuna(dest)];
      if (!a || !b) return;
      links.push({ from: loc, to: dest, cap: val, ax: a.lon, ay: a.lat, bx: b.lon, by: b.lat });
    });
    // Peak utilisation from transmission_flow
    const flowPeak = {};
    Object.values(res.transmission_flow || {}).forEach(f => {
      const peak = (f.timeseries || []).reduce((m, x) => Math.max(m, Math.abs(Number(x) || 0)), 0);
      const key = [f.from, f.to].sort().join('|'); flowPeak[key] = Math.max(flowPeak[key] || 0, peak);
    });
    links.forEach(l => { const p = flowPeak[[l.from, l.to].sort().join('|')]; if (p != null && l.cap > 0) l.util = p / l.cap; });
    const substations = [...subSet].map(loc => { const c = coords[normComuna(loc)]; return c ? { name: loc, lat: c.lat, lon: c.lon } : null; }).filter(Boolean);
    return { cap, gen, links, legend: [...legendMap.entries()], substations };
  }, [activeRun, coords]);

  const dataIds = Object.keys(dataFiles);
  const chartIds = Object.keys(charts);

  // All spatial maps for this run, ordered like the Results dashboard. Each carries
  // a live `preview` (the SAME map component Results uses) and an `svg` for export.
  const spatialMaps = useMemo(() => {
    const mp = mapProps;
    const communeNames = hasCommunes ? Object.keys(choro.demand) : [];
    const W = 460, H = 560;
    const hasNodes = mp.locations.length > 0 && Object.keys(mp.capByLoc).length > 0;
    const rmProps = { locations: mp.locations, capacitiesByLoc: mp.capByLoc, dominantTechByLoc: mp.domTech, techMixByLoc: mp.techMixByLoc, generationByLoc: mp.genByLoc, colorFn: techColor, transmissionLinks: mp.links };
    const list = [];
    if (hasNodes) list.push({
      id: 'node_capacity', label: 'Capacity map',
      preview: <ResultsMap key={activeRun.id + '-capacity'} {...rmProps} viewMode="capacity" />,
      svg: geo ? buildNodeMapSVG({ geo, communeNames, nodes: nodeMaps.cap, links: nodeMaps.links, colorMode: 'tech', legend: nodeMaps.legend, label: 'Installed capacity', unit: 'MW', width: W, height: H }) : '',
    });
    if (Object.keys(mp.genByLoc).length) list.push({
      id: 'node_generation', label: 'Generation map',
      preview: <ResultsMap key={activeRun.id + '-generation'} {...rmProps} viewMode="generation" />,
      svg: geo ? buildNodeMapSVG({ geo, communeNames, nodes: nodeMaps.gen, links: nodeMaps.links, colorMode: 'value', ramp: ['#fbbf24', '#f59e0b', '#dc2626'], label: 'Generation', unit: 'MWh', width: W, height: H }) : '',
    });
    if (hasNodes) list.push({
      id: TECH_PIE_ID, label: 'Tech-mix map',
      preview: <ResultsMap key={activeRun.id + '-mix'} {...rmProps} viewMode="mix" />,
      svg: (geo && pieAvailable) ? buildTechPieMapSVG({ geo, communeNames, pies, label: 'Technology mix', width: W, height: H }) : '',
    });
    if (mp.links.length) list.push({
      id: 'transmission', label: 'Transmission map',
      preview: <TransmissionFlowMap key={activeRun.id + '-tx'} locations={mp.locations} transmissionFlowData={mp.flow} capacitiesByLoc={mp.capByLoc} timestamps={mp.timestamps} />,
      svg: geo ? buildTransmissionMapSVG({ geo, communeNames, nodes: nodeMaps.substations, links: nodeMaps.links, label: 'Transmission utilisation', width: W, height: H }) : '',
    });
    if (hasCommunes) MAP_OUTPUTS.forEach(m => list.push({
      id: m.id, label: m.label,
      preview: <RegionChoropleth key={activeRun.id + '-' + m.id} metrics={choro} metric={m.metric} compact />,
      svg: geo ? buildChoroplethSVG(geo, choro, m.metric, { ramp: m.ramp, kind: m.kind, label: m.label, unit: m.unit || '', width: W, height: H }) : '',
    }));
    return list;
  }, [activeRun, mapProps, nodeMaps, geo, hasCommunes, choro, pieAvailable, pies]);
  const mapIds = useMemo(() => spatialMaps.map(m => m.id), [spatialMaps]);
  useEffect(() => {
    if (spatialMaps.length && !spatialMaps.some(m => m.id === previewMapId)) setPreviewMapId(spatialMaps[0].id);
  }, [spatialMaps, previewMapId]);
  const previewMap = spatialMaps.find(m => m.id === previewMapId) || spatialMaps[0] || null;
  const allIds = useMemo(
    () => [...dataIds.map(id => 'data:' + id), ...chartIds.map(id => 'chart:' + id), ...mapIds.map(id => 'map:' + id)],
    [activeRun] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Default: select everything available whenever the run changes
  useEffect(() => { setSelected(new Set(allIds)); setStatus(null); }, [activeRun?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const setAll = (on) => setSelected(on ? new Set(allIds) : new Set());

  const doExport = async () => {
    if (!activeRun) return;
    setExporting(true);
    setStatus({ type: 'info', message: 'Building export…' });
    try {
      const zip = new JSZip();
      let count = 0;
      // Data files
      for (const id of dataIds) {
        if (!selected.has('data:' + id)) continue;
        zip.file(id, dataFiles[id]); count++;
      }
      // Chart images (headless render → PNG) — same options as the Results view
      for (const id of chartIds) {
        if (!selected.has('chart:' + id)) continue;
        const url = await renderChartPng(charts[id].option);
        const b64 = dataUrlToBase64(url);
        if (b64) { zip.file(id + '.png', b64, { base64: true }); count++; }
      }
      // Spatial maps → exported as SVG (built alongside the live preview)
      for (const m of spatialMaps) {
        if (selected.has('map:' + m.id) && m.svg) { zip.file(m.id + '.svg', m.svg); count++; }
      }
      if (count === 0) { setStatus({ type: 'error', message: 'Nothing selected to export.' }); setExporting(false); return; }
      const blob = await zip.generateAsync({ type: 'blob' });
      const base = (activeRun.modelName || 'run').replace(/\s+/g, '_').toLowerCase();
      saveAs(blob, `${base}_results_export.zip`);
      setStatus({ type: 'success', message: `Exported ${count} file${count !== 1 ? 's' : ''}.` });
    } catch (e) {
      console.error('Results export error:', e);
      setStatus({ type: 'error', message: `Export failed: ${e.message}` });
    } finally {
      setExporting(false);
    }
  };

  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <FiBarChart2 size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="font-semibold text-gray-700 mb-1">No completed runs</p>
        <p className="text-sm text-gray-400">Run a model first — its results will appear here for export.</p>
      </div>
    );
  }

  const kpiCards = summary ? [
    { label: 'Objective', value: summary.objective != null ? fmtNum(summary.objective) : '—' },
    { label: 'Capacity', value: fmtPower(summary.totalCap) },
    { label: 'Generation', value: fmtEnergy(summary.totalGen) },
    { label: 'System cost', value: summary.totalCost > 0 ? fmtCost(summary.totalCost) : '—' },
    { label: 'Renewable', value: (summary.renewableShare * 100).toFixed(0) + '%' },
    { label: 'Unmet', value: summary.unmet != null ? fmtEnergy(summary.unmet) : '—', warn: summary.unmet > 0 },
  ] : [];


  return (
    <div className="space-y-5">
      {/* Run picker + headline values */}
      <div className="bg-white rounded-xl shadow-lg p-5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Select Run</h2>
        <select value={activeRun?.id || ''} onChange={e => setRunId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400">
          {runs.map(r => (
            <option key={r.id} value={r.id}>
              {r.modelName} — {new Date(r.completedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </option>
          ))}
        </select>
        {kpiCards.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
            {kpiCards.map(k => (
              <div key={k.label} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{k.label}</div>
                <div className={`text-sm font-semibold tabular-nums ${k.warn ? 'text-red-600' : 'text-slate-800'}`}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar: instruction + actions */}
      <div className="bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-10">
        <span className="text-sm text-slate-600">Click any item below to include or exclude it. <span className="text-slate-400">{selected.size} selected.</span></span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAll(true)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs">All</button>
          <button onClick={() => setAll(false)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs">None</button>
          <button onClick={doExport} disabled={exporting || selected.size === 0}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            <FiDownload size={15} />
            {exporting ? 'Exporting…' : `Export ${selected.size} as ZIP`}
          </button>
        </div>
        {status && (
          <div className={`w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
            status.type === 'success' ? 'bg-gray-50 text-gray-700 border border-gray-200'
            : status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100'
            : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            {status.type === 'success' ? <FiCheckCircle size={14} className="flex-shrink-0" /> : <FiAlertCircle size={14} className="flex-shrink-0" />}
            <span>{status.message}</span>
          </div>
        )}
      </div>

      {/* Cards: CSV/values on the left, graphs + maps on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* Left — data / values (CSV, JSON) */}
        {dataIds.length > 0 && (
          <div className="lg:col-span-4 bg-white rounded-xl shadow-lg p-4">
            <SectionTitle count={dataIds.length}>Data &amp; values</SectionTitle>
            <div className="space-y-2">
              {dataIds.map(id => {
                const isJson = id.endsWith('.json');
                const lines = isJson ? [] : dataFiles[id].split('\n');
                const rows = isJson ? null : Math.max(0, lines.length - 1);
                return (
                  <ToggleCard key={'data:' + id} on={selected.has('data:' + id)} onToggle={() => toggle('data:' + id)}
                    title={RESULT_FILE_LABELS[id] || id} badge={isJson ? 'JSON' : `CSV · ${rows}`}>
                    {id === 'summary_kpis.csv' ? (
                      <table className="w-full text-xs">
                        <tbody>
                          {lines.slice(1, 10).map((line, i) => {
                            const ci = line.indexOf(',');
                            const metric = line.slice(0, ci), value = line.slice(ci + 1);
                            return (
                              <tr key={i} className={i % 2 ? 'bg-slate-50/60' : ''}>
                                <td className="px-2 py-0.5 text-slate-500">{metric.replace(/_/g, ' ')}</td>
                                <td className="px-2 py-0.5 text-right font-mono text-slate-700 truncate">{value}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : isJson ? (
                      <div className="text-[10px] font-mono text-slate-400 truncate">full result contract</div>
                    ) : (
                      <div className="text-[10px] font-mono leading-tight">
                        <div className="text-slate-500 truncate" title={lines[0]}><span className="text-slate-400">cols: </span>{lines[0]}</div>
                        {lines[1] && <div className="text-slate-400 truncate" title={lines[1]}>{lines[1]}</div>}
                      </div>
                    )}
                  </ToggleCard>
                );
              })}
            </div>
          </div>
        )}

        {/* Right — graphs (charts + region maps) */}
        <div className="lg:col-span-8 bg-white rounded-xl shadow-lg p-4 space-y-4">
          {chartIds.length > 0 && (
            <div>
              <SectionTitle count={chartIds.length}>Charts</SectionTitle>
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                {chartIds.map(id => (
                  <ToggleCard key={'chart:' + id} on={selected.has('chart:' + id)} onToggle={() => toggle('chart:' + id)}
                    title={charts[id].label} badge="PNG" className={WIDE_CHARTS.has(id) ? '2xl:col-span-2' : ''}>
                    <ReactECharts option={charts[id].option} style={{ height: 260 }} notMerge lazyUpdate />
                  </ToggleCard>
                ))}
              </div>
            </div>
          )}

          {/* Maps — one large live map (real Results component) + view tabs + export chips */}
          <div>
            <SectionTitle count={spatialMaps.length || undefined}>Maps</SectionTitle>
            {spatialMaps.length === 0 ? (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3 leading-relaxed">
                No maps for this run — the maps need location coordinates. New runs embed them automatically;
                for older runs, load the matching model in the <b>Models</b> tab first.
              </div>
            ) : (
              <>
                {/* View tabs */}
                <div className="flex gap-1 flex-wrap mb-2">
                  {spatialMaps.map(m => (
                    <button key={m.id} onClick={() => setPreviewMapId(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        previewMap?.id === m.id ? 'bg-gray-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {/* One large, properly-sized live map */}
                <div style={{ height: 460 }} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  {previewMap?.preview}
                </div>
                {/* Export selection */}
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Include in export (SVG)</div>
                  <div className="flex flex-wrap gap-2">
                    {spatialMaps.map(m => {
                      const on = selected.has('map:' + m.id);
                      return (
                        <button key={m.id} onClick={() => toggle('map:' + m.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}>
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${on ? 'bg-white/20' : 'border border-slate-300'}`}>
                            {on && <FiCheck size={10} />}
                          </span>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  {geoErr && <p className="text-[11px] text-amber-600 mt-2">SVG export unavailable (boundaries failed to load: {geoErr}). Live preview still works.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EXPORT_FORMATS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-gray-600 to-gray-700',
    supported: true
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis — netCDF + CSV folder',
    icon: FiActivity,
    color: 'from-gray-500 to-gray-600',
    supported: true
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System — otoole-compatible CSV dataset',
    icon: FiCpu,
    color: 'from-gray-500 to-gray-600',
    supported: true
  },
  {
    id: 'adoptnet0',
    name: 'AdOpT-NET0',
    description: 'Advanced Optimisation of Polygeneration Technologies — NET-zero. Case-directory ZIP.',
    icon: FiSettings,
    color: 'from-gray-500 to-gray-600',
    supported: true
  },
  {
    id: 'calliope07',
    name: 'Calliope 0.7',
    description: 'Calliope 0.7 schema — single model.yaml + CSV files (experimental)',
    icon: FiZap,
    color: 'from-gray-500 to-gray-600',
    supported: true
  }
];

// ── Results export helpers ───────────────────────────────────────────────────
function parseLTCExport(key) {
  const parts = key.split('::');
  return parts.length >= 2 ? { loc: parts[0], tech: parts[1] } : { loc: '', tech: parts[0] };
}

// Derive everything the spatial maps need from a result's frozen contract
// (coordinates come from result.coordinates — embedded by new runs).
function spatialFromResult(r) {
  const coords = {};
  Object.entries(r?.coordinates || {}).forEach(([n, ll]) => { if (Array.isArray(ll) && ll.length === 2) coords[normComuna(n)] = { lat: +ll[0], lon: +ll[1] }; });
  const coordOf = (name) => coords[normComuna(name)];

  const capByLocTech = {}, capByLoc = {}, genByLoc = {}, domTech = {}, locTechCap = {};
  Object.entries(r?.capacities || {}).forEach(([k, v]) => {
    const { loc, tech } = parseLTC(k); const val = Number(v) || 0;
    if (val <= 0 || tech.includes(':')) return;
    const t = tech.split(':')[0];
    (capByLocTech[loc] || (capByLocTech[loc] = {}))[t] = (capByLocTech[loc][t] || 0) + val;
    capByLoc[loc] = (capByLoc[loc] || 0) + val;
    if (!locTechCap[loc] || locTechCap[loc].value < val) locTechCap[loc] = { tech: t, value: val };
  });
  Object.entries(locTechCap).forEach(([loc, { tech }]) => { domTech[loc] = tech; });
  Object.entries(r?.generation || {}).forEach(([k, v]) => { const { loc } = parseLTC(k); const val = Number(v) || 0; if (val > 0) genByLoc[loc] = (genByLoc[loc] || 0) + val; });
  const techMixByLoc = techMixByLocFromResult(r);

  const legendMap = new Map(), nodeCap = [], nodeGen = [], pies = [];
  Object.entries(capByLocTech).forEach(([loc, techs]) => {
    const c = coordOf(loc); if (!c) return;
    const total = Object.values(techs).reduce((s, x) => s + x, 0);
    const dom = Object.entries(techs).sort((a, b) => b[1] - a[1])[0][0];
    if (!legendMap.has(dom)) legendMap.set(dom, techColor(dom));
    nodeCap.push({ name: loc, lat: c.lat, lon: c.lon, value: total, color: techColor(dom) });
  });
  Object.entries(genByLoc).forEach(([loc, g]) => { const c = coordOf(loc); if (c) nodeGen.push({ name: loc, lat: c.lat, lon: c.lon, value: g }); });
  Object.entries(techMixByLoc).forEach(([loc, slices]) => { const c = coordOf(loc); if (c) pies.push({ name: loc, lat: c.lat, lon: c.lon, slices: slices.map(x => ({ tech: x.tech, color: techColor(x.tech), value: x.value })) }); });

  const txEntries = Object.entries(r?.capacities || {}).filter(([k]) => parseLTC(k).tech.includes(':')).map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 })).filter(e => e.value > 0);
  const links = [], usedLinks = new Set(), subSet = new Set();
  txEntries.forEach(entry => {
    const key = `${entry.loc}::${entry.tech}`; if (usedLinks.has(key)) return;
    const parts = entry.tech.split(':'); let dest = parts.length > 1 ? parts[parts.length - 1] : null;
    if (!dest) { const opp = txEntries.find(e => e.loc !== entry.loc && e.tech === entry.tech && !usedLinks.has(`${e.loc}::${e.tech}`)); if (!opp) return; dest = opp.loc; usedLinks.add(`${opp.loc}::${opp.tech}`); }
    usedLinks.add(key); subSet.add(entry.loc); subSet.add(dest);
    const a = coordOf(entry.loc), b = coordOf(dest); if (!a || !b) return;
    links.push({ from: entry.loc, to: dest, cap: entry.value, ax: a.lon, ay: a.lat, bx: b.lon, by: b.lat });
  });
  const flowPeak = {};
  Object.values(r?.transmission_flow || {}).forEach(f => { const key = [f.from, f.to].sort().join('|'); const peak = (f.timeseries || []).reduce((m, x) => Math.max(m, Math.abs(Number(x) || 0)), 0); flowPeak[key] = Math.max(flowPeak[key] || 0, peak); });
  links.forEach(l => { const p = flowPeak[[l.from, l.to].sort().join('|')]; if (p != null && l.cap > 0) l.util = p / l.cap; });
  const substations = [...subSet].map(loc => { const c = coordOf(loc); return c ? { name: loc, lat: c.lat, lon: c.lon } : null; }).filter(Boolean);

  const rmLinks = links.map(l => ({ fromLoc: l.from, toLoc: l.to, cap: l.cap }));
  let flow = [];
  if (r?.transmission_flow && Object.keys(r.transmission_flow).length) {
    flow = Object.values(r.transmission_flow).map(({ from: fromLoc, to: toLoc, timeseries }) => {
      const vals = (timeseries || []).map(v => Number(v) || 0);
      const cap = rmLinks.find(t => (t.fromLoc === fromLoc && t.toLoc === toLoc) || (t.fromLoc === toLoc && t.toLoc === fromLoc))?.cap || (vals.length ? Math.max(1, ...vals.map(Math.abs)) : 1);
      return { fromLoc, toLoc, timeseries: vals, cap };
    });
  }
  const timestamps = (r?.timestamps || []).map(t => { const d = new Date(t); return isNaN(d) ? t : d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); });
  const locNames = new Set([...Object.keys(capByLoc), ...Object.keys(genByLoc), ...subSet]);
  const locations = [...locNames].map(n => { const c = coordOf(n); return c ? { name: n, calliopeName: n, latitude: c.lat, longitude: c.lon } : null; }).filter(Boolean);

  return { hasCoords: Object.keys(coords).length > 0, coords, locations, capByLoc, domTech, genByLoc, techMixByLoc, nodeCap, nodeGen, pies, links, substations, legend: [...legendMap.entries()], rmLinks, flow, timestamps };
}

const RESULT_OUTPUT_DEFS = [
  {
    id: 'summary', group: 'data', label: 'Summary KPIs', filename: 'summary_kpis.csv',
    hasData: (r) => !!r,
    build: (r) => {
      const totalCap = Object.values(r.capacities || {}).reduce((s, v) => s + v, 0);
      const totalGen = Object.values(r.generation || {}).reduce((s, v) => s + v, 0);
      const totalCost = Object.values(r.costs_by_tech || {}).reduce((s, v) => s + v, 0);
      const totalImports = r.imports_by_location ? Object.values(r.imports_by_location).reduce((s, v) => s + v, 0) : 0;
      const rows = [
        ['Metric', 'Value'],
        ['Termination Condition', r.termination_condition ?? ''],
        ['Objective', r.objective ?? ''],
        ['Total Capacity (MW)', totalCap.toFixed(3)],
        ['Total Generation (MWh)', totalGen.toFixed(3)],
        ['Total Cost', totalCost.toFixed(3)],
        ['LCOE (cost/MWh)', totalGen > 0 ? (totalCost / totalGen).toFixed(6) : ''],
        ['Unmet Demand (MWh)', (r.total_unmet_demand_mwh ?? 0).toFixed(3)],
        ['Net Imports (MWh)', totalImports.toFixed(3)],
      ];
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'capacities', group: 'data', label: 'Capacities', filename: 'capacities.csv',
    hasData: (r) => !!Object.keys(r.capacities || {}).length,
    build: (r) => {
      const rows = [['Location', 'Technology', 'Capacity_MW']];
      Object.entries(r.capacities || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => {
        const { loc, tech } = parseLTCExport(k);
        rows.push([`"${loc}"`, `"${tech}"`, v]);
      });
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'generation', group: 'data', label: 'Generation', filename: 'generation.csv',
    hasData: (r) => !!Object.keys(r.generation || {}).length,
    build: (r) => {
      const rows = [['Location', 'Technology', 'Generation_MWh']];
      Object.entries(r.generation || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => {
        const { loc, tech } = parseLTCExport(k);
        rows.push([`"${loc}"`, `"${tech}"`, v]);
      });
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'costs_tech', group: 'data', label: 'Costs by Technology', filename: 'costs_by_tech.csv',
    hasData: (r) => !!Object.keys(r.costs_by_tech || {}).length,
    build: (r) => {
      const rows = [['Technology', 'Cost']];
      Object.entries(r.costs_by_tech || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => rows.push([`"${k}"`, v]));
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'costs_loc', group: 'data', label: 'Costs by Location', filename: 'costs_by_location.csv',
    hasData: (r) => !!r.costs_by_location && !!Object.keys(r.costs_by_location).length,
    build: (r) => {
      const rows = [['Location', 'Cost']];
      Object.entries(r.costs_by_location || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => rows.push([`"${k}"`, v]));
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'demand_loc', group: 'data', label: 'Demand by Location', filename: 'demand_by_location.csv',
    hasData: (r) => !!r.demand_by_location && !!Object.keys(r.demand_by_location).length,
    build: (r) => {
      const rows = [['Location', 'Demand_MWh']];
      Object.entries(r.demand_by_location || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => rows.push([`"${k}"`, v]));
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'unmet', group: 'data', label: 'Unmet Demand by Location', filename: 'unmet_demand.csv',
    hasData: (r) => !!r.unmet_demand_by_location && !!Object.keys(r.unmet_demand_by_location).length,
    build: (r) => {
      const rows = [['Location', 'Unmet_MWh']];
      Object.entries(r.unmet_demand_by_location || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => rows.push([`"${k}"`, v]));
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'imports', group: 'data', label: 'Imports / Exports', filename: 'imports_exports.csv',
    hasData: (r) => !!r.imports_by_location && !!Object.keys(r.imports_by_location).length,
    build: (r) => {
      const locs = new Set([...Object.keys(r.imports_by_location || {}), ...Object.keys(r.exports_by_location || {})]);
      const rows = [['Location', 'Imports_MWh', 'Exports_MWh']];
      [...locs].sort().forEach(loc => rows.push([`"${loc}"`, r.imports_by_location?.[loc] ?? 0, r.exports_by_location?.[loc] ?? 0]));
      return rows.map(r2 => r2.join(',')).join('\n');
    },
  },
  {
    id: 'dispatch', group: 'data', label: 'Dispatch timeseries', filename: 'dispatch.csv',
    hasData: (r) => !!(r.dispatch && r.timestamps?.length),
    build: (r) => {
      const keys = Object.keys(r.dispatch || {}).sort();
      if (!keys.length || !r.timestamps?.length) return null;
      const header = ['Timestamp', ...keys.map(k => `"${k}"`)].join(',');
      const rows = r.timestamps.map((t, i) =>
        [`"${t}"`, ...keys.map(k => { const v = r.dispatch[k]?.[i]; return v != null ? Number(v).toFixed(3) : '0'; })].join(',')
      );
      return [header, ...rows].join('\n');
    },
  },
  {
    id: 'json', group: 'raw', label: 'Full Result (JSON)', filename: 'full_result.json',
    hasData: (r) => !!r,
    build: (r) => JSON.stringify(r, null, 2),
  },
  {
    id: 'svg_node_capacity', group: 'svg', label: 'Map — Capacity (SVG)', filename: 'map_capacity.svg',
    hasData: (r) => !!r.coordinates && !!Object.keys(r.coordinates).length && !!Object.keys(r.capacities || {}).length,
    build: async (r) => {
      const geo = await loadCommunesGeo(); const s = spatialFromResult(r);
      const communeNames = r.demand_by_location ? Object.keys(r.demand_by_location) : [];
      return buildNodeMapSVG({ geo, communeNames, nodes: s.nodeCap, links: s.links, colorMode: 'tech', legend: s.legend, label: 'Installed capacity', unit: 'MW' });
    },
  },
  {
    id: 'svg_node_generation', group: 'svg', label: 'Map — Generation (SVG)', filename: 'map_generation.svg',
    hasData: (r) => !!r.coordinates && !!Object.keys(r.coordinates).length && !!Object.keys(r.generation || {}).length,
    build: async (r) => {
      const geo = await loadCommunesGeo(); const s = spatialFromResult(r);
      const communeNames = r.demand_by_location ? Object.keys(r.demand_by_location) : [];
      return buildNodeMapSVG({ geo, communeNames, nodes: s.nodeGen, links: s.links, colorMode: 'value', ramp: ['#fbbf24', '#f59e0b', '#dc2626'], label: 'Generation', unit: 'MWh' });
    },
  },
  {
    id: 'svg_techpie', group: 'svg', label: 'Map — Tech Mix (SVG)', filename: 'map_tech_mix.svg',
    hasData: (r) => !!r.coordinates && !!Object.keys(r.coordinates).length && !!Object.keys(r.capacities || {}).length,
    build: async (r) => {
      const geo = await loadCommunesGeo(); const s = spatialFromResult(r);
      const communeNames = r.demand_by_location ? Object.keys(r.demand_by_location) : [];
      return buildTechPieMapSVG({ geo, communeNames, pies: s.pies, label: 'Technology mix' });
    },
  },
  {
    id: 'svg_transmission', group: 'svg', label: 'Map — Transmission (SVG)', filename: 'map_transmission.svg',
    hasData: (r) => !!r.coordinates && !!Object.keys(r.coordinates).length && Object.keys(r.capacities || {}).some(k => (k.split('::')[1] || '').includes(':')),
    build: async (r) => {
      const geo = await loadCommunesGeo(); const s = spatialFromResult(r);
      const communeNames = r.demand_by_location ? Object.keys(r.demand_by_location) : [];
      return buildTransmissionMapSVG({ geo, communeNames, nodes: s.substations, links: s.links, label: 'Transmission utilisation' });
    },
  },
  {
    id: 'svg_demand', group: 'svg', label: 'Map — Demand (SVG)', filename: 'map_demand.svg',
    hasData: (r) => !!r.demand_by_location && !!Object.keys(r.demand_by_location).length,
    build: async (r) => {
      const geo = await loadCommunesGeo();
      const choro = choroMetricsFromResult(r);
      return buildChoroplethSVG(geo, choro, 'demand', { ramp: ['#fff7ec', '#fdbb84', '#d7301f'], label: 'Demand (MWh)', unit: 'MWh' });
    },
  },
  {
    id: 'svg_unmet', group: 'svg', label: 'Map — Unmet Demand (SVG)', filename: 'map_unmet_demand.svg',
    hasData: (r) => !!r.demand_by_location && !!Object.keys(r.demand_by_location).length,
    build: async (r) => {
      const geo = await loadCommunesGeo();
      const choro = choroMetricsFromResult(r);
      return buildChoroplethSVG(geo, choro, 'unmet', { ramp: ['#fff5f0', '#fb6a4a', '#a50f15'], label: 'Unmet Demand (MWh)', unit: 'MWh' });
    },
  },
  {
    id: 'svg_demand_met', group: 'svg', label: 'Map — Demand Met % (SVG)', filename: 'map_demand_met.svg',
    hasData: (r) => !!r.demand_by_location && !!Object.keys(r.demand_by_location).length,
    build: async (r) => {
      const geo = await loadCommunesGeo();
      const choro = choroMetricsFromResult(r);
      return buildChoroplethSVG(geo, choro, 'demandMet', { kind: 'pct', ramp: ['#d73027', '#fee08b', '#1a9850'], label: 'Demand Met (%)' });
    },
  },
  // Chart PNGs — one entry per chart in the RESULT_CHARTS catalogue
  ...RESULT_CHARTS.map(c => ({
    id: `chart_${c.id}`,
    group: 'charts',
    label: `Chart — ${c.label}`,
    filename: `chart_${c.id}.png`,
    hasData: (r) => !!r,
    build: async (r) => {
      const all = buildAllResultCharts(r, { colorFn: techColor });
      const entry = all[c.id];
      if (!entry?.option) return null;
      const url = await renderChartPng(entry.option);
      return dataUrlToBase64(url);
    },
  })),
];

const OUTPUT_GROUPS = [
  { id: 'data',   label: 'Data Files', icon: FiDatabase },
  { id: 'raw',    label: 'Raw',        icon: FiFile },
  { id: 'charts', label: 'Chart PNGs', icon: FiBarChart2 },
  { id: 'svg',    label: 'Map SVGs',   icon: FiMap },
];

function ResultsExportPanel({ completedJobs }) {
  const validJobs = useMemo(() => completedJobs.filter(j => j.result && j.result.success !== false), [completedJobs]);
  const [selJobId, setSelJobId] = useState(null);
  const [checked, setChecked] = useState(() => new Set(RESULT_OUTPUT_DEFS.filter(o => o.group !== 'svg' && o.group !== 'charts').map(o => o.id)));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [previewMapId, setPreviewMapId] = useState(null); // which live map is shown

  useEffect(() => {
    if (validJobs.length > 0 && !selJobId) setSelJobId(validJobs[0].id);
  }, [validJobs, selJobId]);

  const job = useMemo(() => validJobs.find(j => j.id === selJobId) || null, [validJobs, selJobId]);
  const result = job?.result || null;

  const outputs = useMemo(() =>
    RESULT_OUTPUT_DEFS.map(def => ({ ...def, available: result ? def.hasData(result) : false })),
    [result]
  );

  // Live chart options (same builders as the Results view) for the right-column previews
  const chartOpts = useMemo(() => (result ? buildAllResultCharts(result, { colorFn: techColor }) : {}), [result]);

  // First few rows of each data/raw file, for the left-column preview
  const dataPreview = (o) => {
    if (!o.available) return '';
    try {
      const content = o.build(result);
      if (typeof content !== 'string') return '';
      return content.split('\n').slice(0, 5).join('\n');
    } catch { return ''; }
  };
  const WIDE_CHART_IDS = new Set(['dispatch', 'energy_flow_sankey', 'capacity_factor', 'capacity_by_location', 'costs_by_location']);

  // Live dashboard maps (the SAME components as the Results view) for the preview.
  const mp = useMemo(() => (result ? spatialFromResult(result) : null), [result]);
  const spatialViews = useMemo(() => {
    const views = [];
    if (mp?.hasCoords) {
      const rmProps = { locations: mp.locations, capacitiesByLoc: mp.capByLoc, dominantTechByLoc: mp.domTech, techMixByLoc: mp.techMixByLoc, generationByLoc: mp.genByLoc, colorFn: techColor, transmissionLinks: mp.rmLinks };
      if (mp.locations.length && Object.keys(mp.capByLoc).length) {
        views.push({ id: 'svg_node_capacity', label: 'Capacity', node: <ResultsMap key={selJobId + '-cap'} {...rmProps} viewMode="capacity" /> });
        views.push({ id: 'svg_techpie', label: 'Tech mix', node: <ResultsMap key={selJobId + '-mix'} {...rmProps} viewMode="mix" /> });
      }
      if (Object.keys(mp.genByLoc).length) views.push({ id: 'svg_node_generation', label: 'Generation', node: <ResultsMap key={selJobId + '-gen'} {...rmProps} viewMode="generation" /> });
      if (mp.rmLinks.length) views.push({ id: 'svg_transmission', label: 'Transmission', node: <TransmissionFlowMap key={selJobId + '-tx'} locations={mp.locations} transmissionFlowData={mp.flow} capacitiesByLoc={mp.capByLoc} timestamps={mp.timestamps} /> });
    }
    if (result?.demand_by_location && Object.keys(result.demand_by_location).length) {
      const choro = choroMetricsFromResult(result);
      views.push({ id: 'svg_demand', label: 'Demand', node: <RegionChoropleth key={selJobId + '-demand'} metrics={choro} metric="demand" compact /> });
      views.push({ id: 'svg_unmet', label: 'Unmet', node: <RegionChoropleth key={selJobId + '-unmet'} metrics={choro} metric="unmet" compact /> });
      views.push({ id: 'svg_demand_met', label: 'Demand met', node: <RegionChoropleth key={selJobId + '-dm'} metrics={choro} metric="demandMet" compact /> });
    }
    return views;
  }, [mp, result, selJobId]);
  useEffect(() => {
    if (spatialViews.length && !spatialViews.some(v => v.id === previewMapId)) setPreviewMapId(spatialViews[0].id);
  }, [spatialViews, previewMapId]);
  const previewMap = spatialViews.find(v => v.id === previewMapId) || spatialViews[0] || null;

  const toggleOutput = (id) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const readyCount = outputs.filter(o => checked.has(o.id) && o.available).length;

  const handleExport = async () => {
    if (!result) return;
    setBusy(true);
    setStatus(null);
    try {
      const zip = new JSZip();
      const selected = outputs.filter(o => checked.has(o.id) && o.available);
      const built = await Promise.all(selected.map(async (o) => {
        const content = await Promise.resolve(o.build(result));
        return { filename: o.filename, content };
      }));
      built.forEach(({ filename, content }) => {
        if (content) zip.file(filename, content, filename.endsWith('.png') ? { base64: true } : {});
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const name = `results_${(job.modelName || 'run').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.zip`;
      saveAs(blob, name);
      setStatus({ type: 'success', message: `Downloaded ${name}` });
    } catch (e) {
      setStatus({ type: 'error', message: `Export failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  if (validJobs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <FiActivity size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="font-semibold text-gray-700 mb-1">No completed runs</p>
        <p className="text-sm text-gray-400">Run a model first to export its results.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Run selector */}
      <div className="bg-white rounded-xl shadow-lg p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Select Run</h2>
        <select
          value={selJobId || ''}
          onChange={e => { setSelJobId(e.target.value); setStatus(null); }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
        >
          {validJobs.map(j => (
            <option key={j.id} value={j.id}>
              {j.modelName} — {new Date(j.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </option>
          ))}
        </select>
        {result && (
          <p className="text-xs text-slate-400 mt-2">
            Objective: <span className="text-slate-600 font-medium">{result.objective != null ? Number(result.objective).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</span>
            {' · '}
            Termination: <span className="text-slate-600 font-medium">{result.termination_condition ?? '—'}</span>
          </p>
        )}
      </div>

      {/* Toolbar: select-all / export */}
      <div className="bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-10">
        <span className="text-sm text-slate-600">Click any item to include or exclude it. <span className="text-slate-400">{readyCount} selected.</span></span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setChecked(new Set(outputs.filter(o => o.available).map(o => o.id)))}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition">All</button>
          <button onClick={() => setChecked(new Set())}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition">None</button>
          <button onClick={handleExport} disabled={busy || !result || readyCount === 0}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
            <FiDownload size={15} />
            {busy ? 'Building ZIP…' : `Export ${readyCount} as ZIP`}
          </button>
        </div>
        {status && (
          <div className={`w-full px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
            status.type === 'success' ? 'bg-gray-50 text-gray-700 border border-gray-200' : 'bg-red-50 text-red-700 border border-red-100'
          }`}>
            {status.type === 'success' ? <FiCheckCircle size={14} className="flex-shrink-0" /> : <FiAlertCircle size={14} className="flex-shrink-0" />}
            <span>{status.message}</span>
          </div>
        )}
      </div>

      {/* Two columns: CSV/values on the LEFT, graphs (charts + maps) on the RIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* LEFT — data / values */}
        <div className="lg:col-span-4 bg-white rounded-xl shadow-lg p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <FiDatabase size={12} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Data &amp; values</h3>
          </div>
          <div className="space-y-2">
            {outputs.filter(o => o.group === 'data' || o.group === 'raw').map(o => {
              const on = checked.has(o.id) && o.available;
              const preview = o.group === 'data' ? dataPreview(o) : (o.available ? 'full result contract' : '');
              return (
                <div key={o.id} role="button" tabIndex={0}
                  onClick={() => o.available && toggleOutput(o.id)}
                  className={`rounded-xl border transition-all ${!o.available ? 'opacity-40 border-slate-200' : on ? 'border-gray-700 ring-1 ring-gray-300 bg-white cursor-pointer' : 'border-slate-200 bg-slate-50 opacity-70 hover:opacity-100 cursor-pointer'}`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                    <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-gray-800 text-white' : 'bg-white border border-slate-300 text-transparent'}`}>
                      <FiCheckCircle size={11} />
                    </span>
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{o.label}</span>
                    <span className="text-[9px] font-mono text-slate-400">{o.filename.endsWith('.json') ? 'JSON' : 'CSV'}</span>
                    {!o.available && <span className="text-[9px] text-slate-300 border border-slate-200 rounded px-1">n/a</span>}
                  </div>
                  {preview && (
                    <pre className="text-[10px] leading-tight text-slate-500 font-mono whitespace-pre overflow-hidden max-h-20 p-2">{preview}</pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — graphs (charts + maps) */}
        <div className="lg:col-span-8 bg-white rounded-xl shadow-lg p-4 space-y-5">

          {/* Charts */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FiBarChart2 size={12} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Charts</h3>
            </div>
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
              {outputs.filter(o => o.group === 'charts').map(o => {
                const cid = o.id.replace(/^chart_/, '');
                const option = chartOpts[cid]?.option;
                if (!option) return null;
                const on = checked.has(o.id) && o.available;
                return (
                  <div key={o.id} role="button" tabIndex={0}
                    onClick={() => o.available && toggleOutput(o.id)}
                    className={`rounded-xl border cursor-pointer transition-all ${WIDE_CHART_IDS.has(cid) ? '2xl:col-span-2' : ''} ${on ? 'border-gray-700 ring-1 ring-gray-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60 hover:opacity-90'}`}>
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                      <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-gray-800 text-white' : 'bg-white border border-slate-300 text-transparent'}`}>
                        <FiCheckCircle size={11} />
                      </span>
                      <span className="text-xs font-medium text-slate-700 flex-1 truncate">{chartOpts[cid]?.label || o.label}</span>
                      <span className="text-[9px] font-mono text-slate-400">PNG</span>
                    </div>
                    <div className="p-2 pointer-events-none">
                      <ReactECharts option={option} style={{ height: 240 }} notMerge lazyUpdate />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Maps — the real Results map components (basemap + points + connections) */}
          {spatialViews.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FiMap size={12} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700">Maps</h3>
              </div>
              {/* view tabs */}
              <div className="flex gap-1 flex-wrap mb-2">
                {spatialViews.map(v => (
                  <button key={v.id} onClick={() => setPreviewMapId(v.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      previewMap?.id === v.id ? 'bg-gray-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    {v.label}
                  </button>
                ))}
              </div>
              {/* one large, properly-sized live map */}
              <div style={{ height: 460 }} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {previewMap?.node}
              </div>
              {/* include-in-export chips */}
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Include in export (SVG)</div>
                <div className="flex flex-wrap gap-2">
                  {spatialViews.map(v => {
                    const on = checked.has(v.id);
                    return (
                      <button key={v.id} onClick={() => toggleOutput(v.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}>
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${on ? 'bg-white/20' : 'border border-slate-300'}`}>
                          {on && <FiCheckCircle size={10} />}
                        </span>
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Export = () => {
  const { getCurrentModel, technologies, timeSeries, overrides, scenarios, completedJobs } = useData();
  const currentModel = getCurrentModel();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [exportReport, setExportReport] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('calliope');
  const [exportMode, setExportMode] = useState('model');

  useEffect(() => {
    if (!currentModel) return;
    const ver = currentModel.metadata?.modelConfig?.calliopeVersion ?? '';
    setSelectedFormat(String(ver).startsWith('0.7') ? 'calliope07' : 'calliope');
  }, [currentModel?.id]);

  const generateModelYaml = (model) => {
    // Get date range from timeseries data or use current year
    let startDate, endDate;
    const modelTS = timeSeries.filter(ts => ts.modelId === model.id);
    
    if (modelTS.length > 0 && modelTS[0].data && modelTS[0].data.length > 0) {
      const firstRow = modelTS[0].data[0];
      const lastRow = modelTS[0].data[modelTS[0].data.length - 1];
      const dateCol = modelTS[0].columns[0]; // Usually first column is datetime
      
      if (firstRow[dateCol]) startDate = firstRow[dateCol];
      if (lastRow[dateCol]) endDate = lastRow[dateCol];
    }
    
    if (!startDate || !endDate) {
      const year = new Date().getFullYear();
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }
    
    // Extract model configuration from template metadata or use defaults
    const config = model.templateMetadata?.config || {};
    const calliopeVersion = config.calliope_version || '0.6.8';
    const mode = config.mode || 'plan';
    const ensureFeasibility = config.ensure_feasibility !== false;
    const bigM = config.bigM || 1e6;
    const zeroThreshold = config.zero_threshold || 1e-10;
    
    return `import:  
    # Links
    - 'model_config/links/transmission_links.yaml'
    - 'model_config/links/power_links.yaml'    
    
    # Locations
    - 'model_config/locations/locations.yaml'

    # Technologies
    - 'model_config/techs/techs_supply.yaml'
    - 'model_config/techs/techs_demand.yaml'
    - 'model_config/techs/techs_storage.yaml'
    - 'model_config/techs/techs_transmission.yaml'
    - 'model_config/techs/techs_conversion.yaml'

    # Scenarios and Overrides
    - 'scenarios/overrides.yaml'
    - 'scenarios/scenarios.yaml'   
    
# Model configuration: all settings that affect the built model
model:
    name: ${model.name || 'Energy System Model'}

    # What version of Calliope this model is intended for
    calliope_version: ${calliopeVersion}

    # Time series data path
    timeseries_data_path: 'timeseries_data'

    subset_time: ['${startDate}', '${endDate}']
    
    ensure_feasibility: ${ensureFeasibility}

    bigM: ${bigM}

    zero_threshold: ${zeroThreshold}

    mode: ${mode}
        
    objective_options:
        cost_class: {'monetary': 1}
`;
  };

  const generateLocationsYaml = (locations) => {
    let yaml = 'locations:\n';
    
    locations.forEach(loc => {
      yaml += `    ${loc.name}:\n`;
      yaml += `        coordinates:\n`;
      yaml += `            lat: ${loc.latitude || loc.coordinates?.lat || 0}\n`;
      yaml += `            lon: ${loc.longitude || loc.coordinates?.lon || 0}\n`;
      
      if (loc.techs && Object.keys(loc.techs).length > 0) {
        yaml += `        techs:\n`;
        Object.entries(loc.techs).forEach(([techName, techData]) => {
          yaml += `            ${techName}:\n`;
          
          if (techData && techData.constraints && Object.keys(techData.constraints).length > 0) {
            yaml += `                constraints:\n`;
            Object.entries(techData.constraints).forEach(([key, value]) => {
              yaml += `                    ${key}: ${value}\n`;
            });
          }
        });
      }
    });
    
    return yaml;
  };

  const generateLinksYaml = (links) => {
    if (!links || links.length === 0) return 'links: {}\n';
    let yaml = 'links:\n';
    links.forEach(link => {
      const from = (link.from || '').replace(/\s+/g, '_');
      const to   = (link.to   || '').replace(/\s+/g, '_');
      if (!from || !to) return;

      // Derive Calliope tech key: prefer stored 'tech' field, then map linkType → calliopeTech
      const lt = link.linkType ? LINK_TYPES[link.linkType] : null;
      const techKey = link.tech || lt?.calliopeTech || link.linkType || 'ac_transmission';
      const capMax  = link.capacity || link.energy_cap_max || 1000;

      yaml += `    ${from},${to}:\n`;
      yaml += `        techs:\n`;
      yaml += `            ${techKey}:\n`;
      yaml += `                constraints:\n`;
      yaml += `                    energy_cap_max: ${capMax}\n`;
      if (link.distance) {
        // distance is a link-level property in Calliope 0.6.x
        yaml += `        distance: ${link.distance}\n`;
      }
    });
    return yaml;
  };

  const generateTechsYaml = (techsList, parentType) => {
    const filteredTechs = techsList.filter(t => {
      const techParent = t.parent || t.essentials?.parent || 'supply';
      if (parentType === 'supply') return techParent === 'supply' || techParent === 'supply_plus';
      return techParent === parentType;
    });
    if (filteredTechs.length === 0) return 'techs: {}\n';

    // Helper: format a single YAML value (handles inf, arrays, strings, numbers)
    const fmtVal = (v) => {
      if (v === Infinity || v === 'inf' || v === '.inf') return '.inf';
      if (v === -Infinity || v === '-inf' || v === '-.inf') return '-.inf';
      if (Array.isArray(v)) return '[' + v.map(i => typeof i === 'string' ? `'${i}'` : i).join(', ') + ']';
      if (typeof v === 'string') return `'${v}'`;
      return v;
    };

    let yaml = 'techs:\n';
    filteredTechs.forEach(tech => {
      const id = (tech.name || tech.id || 'unknown').replace(/\s+/g, '_').toLowerCase();
      yaml += `    ${id}:\n`;

      if (tech.essentials) {
        yaml += `        essentials:\n`;
        Object.entries(tech.essentials).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            yaml += `            ${key}: ${fmtVal(value)}\n`;
          }
        });
      }

      if (tech.constraints && Object.keys(tech.constraints).length > 0) {
        yaml += `        constraints:\n`;
        Object.entries(tech.constraints).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            yaml += `            ${key}: ${fmtVal(value)}\n`;
          }
        });
      }

      if (tech.costs?.monetary && Object.keys(tech.costs.monetary).length > 0) {
        yaml += `        costs:\n            monetary:\n`;
        Object.entries(tech.costs.monetary).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            yaml += `                ${key}: ${fmtVal(value)}\n`;
          }
        });
      }
    });
    return yaml;
  };

  const generateOverridesYaml = (modelOverrides) => {
    let yaml = 'overrides:\n';
    
    // Get date range from model timeseries
    let startDate = '2024-01-01';
    let endDate = '2024-12-31';
    
    const modelTS = timeSeries.filter(ts => ts.modelId === currentModel.id);
    if (modelTS.length > 0 && modelTS[0].data && modelTS[0].data.length > 0) {
      const firstRow = modelTS[0].data[0];
      const lastRow = modelTS[0].data[modelTS[0].data.length - 1];
      const dateCol = modelTS[0].columns[0];
      
      if (firstRow[dateCol]) startDate = firstRow[dateCol].split(' ')[0];
      if (lastRow[dateCol]) endDate = lastRow[dateCol].split(' ')[0];
    }
    
    // Calculate 1-day and 3-day subsets
    const startDateObj = new Date(startDate);
    const oneDayEnd = new Date(startDateObj);
    oneDayEnd.setDate(oneDayEnd.getDate() + 1);
    const threeDayEnd = new Date(startDateObj);
    threeDayEnd.setDate(threeDayEnd.getDate() + 3);
    
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    // Add standard time subset overrides
    yaml += `    1_day:\n`;
    yaml += `        model.subset_time: ['${startDate}', '${formatDate(oneDayEnd)}']\n\n`;
    
    yaml += `    3_days:\n`;
    yaml += `        model.subset_time: ['${startDate}', '${formatDate(threeDayEnd)}']\n\n`;
    
    yaml += `    full_year:\n`;
    yaml += `        model.subset_time: ['${startDate}', '${endDate}']\n\n`;
    
    // Add time resolution overrides
    yaml += `    1H_resolution:\n`;
    yaml += `        model.time:\n`;
    yaml += `            function: resample\n`;
    yaml += `            function_options:\n`;
    yaml += `                resolution: '1H'\n\n`;
    
    yaml += `    3H_resolution:\n`;
    yaml += `        model.time:\n`;
    yaml += `            function: resample\n`;
    yaml += `            function_options:\n`;
    yaml += `                resolution: '3H'\n\n`;
    
    yaml += `    6H_resolution:\n`;
    yaml += `        model.time:\n`;
    yaml += `            function: resample\n`;
    yaml += `            function_options:\n`;
    yaml += `                resolution: '6H'\n\n`;
    
    // Add solver configuration
    const solverConfig = currentModel.templateMetadata?.solver || {};
    const solver = solverConfig.solver || 'gurobi';
    const cyclicStorage = solverConfig.cyclic_storage !== false;
    
    yaml += `    run_solver:\n`;
    yaml += `        run:\n`;
    yaml += `            ensure_feasibility: true\n`;
    yaml += `            cyclic_storage: ${cyclicStorage}\n`;
    yaml += `            solver: ${solver}\n`;
    
    // Add solver-specific options if present
    if (solverConfig.solver_options) {
      yaml += `            solver_options:\n`;
      Object.entries(solverConfig.solver_options).forEach(([key, value]) => {
        yaml += `                ${key}: ${value}\n`;
      });
    }
    yaml += '\n';
    
    // Add custom overrides from the model
    if (modelOverrides && Object.keys(modelOverrides).length > 0) {
      Object.entries(modelOverrides).forEach(([key, value]) => {
        // Strip internal _meta before writing YAML
        const config = (typeof value === 'object' && value !== null)
          ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== '_meta'))
          : value;
        yaml += `    ${key}:\n`;
        if (typeof config === 'object' && config !== null) {
          const formatYamlValue = (obj, indent = 8) => {
            let result = '';
            Object.entries(obj).forEach(([k, v]) => {
              const spaces = ' '.repeat(indent);
              if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                result += `${spaces}${k}:\n`;
                result += formatYamlValue(v, indent + 4);
              } else if (Array.isArray(v)) {
                result += `${spaces}${k}: [${v.map(item => typeof item === 'string' ? `'${item}'` : item).join(', ')}]\n`;
              } else {
                result += `${spaces}${k}: ${typeof v === 'string' ? `'${v}'` : v}\n`;
              }
            });
            return result;
          };
          yaml += formatYamlValue(config);
        } else {
          yaml += `        value: ${config}\n`;
        }
      });
    }
    
    return yaml;
  };

  const generateScenariosYaml = (modelScenarios) => {
    let yaml = 'scenarios:\n';
    
    const hasCustomScenarios = modelScenarios && Object.keys(modelScenarios).length > 0;
    
    if (hasCustomScenarios) {
      // Use custom scenarios from the model
      Object.entries(modelScenarios).forEach(([name, overrideList]) => {
        if (Array.isArray(overrideList)) {
          yaml += `    ${name}: [${overrideList.map(o => `"${o}"`).join(', ')}]\n`;
        } else if (typeof overrideList === 'string') {
          yaml += `    ${name}: ["${overrideList}"]\n`;
        }
      });
    } else {
      // Provide default scenarios
      yaml += `    Quick: ["run_solver", "1_day", "3H_resolution"]\n`;
      yaml += `    Debug: ["1_day", "6H_resolution"]\n`;
      yaml += `    Standard: ["run_solver", "3_days", "3H_resolution"]\n`;
      yaml += `    FullYear: ["run_solver", "full_year", "6H_resolution"]\n`;
    }
    
    return yaml;
  };

  const formatTimeseriesCSV = (data, columns) => {
    let csv = columns.join(',') + '\n';
    data.forEach(row => {
      const values = columns.map(col => row[col] || 0);
      csv += values.join(',') + '\n';
    });
    return csv;
  };

  const exportToCalliope = async () => {
    if (!currentModel) {
      setExportStatus({ type: 'error', message: 'No model selected' });
      return;
    }

    setExporting(true);
    setExportStatus({ type: 'info', message: 'Generating Calliope model...' });

    try {
      const zip = new JSZip();

      // 1. Generate model.yaml
      const modelYaml = generateModelYaml(currentModel);
      zip.file('model.yaml', modelYaml);

      // 2. Generate locations
      const locationsFolder = zip.folder('model_config').folder('locations');
      const locationsYaml = generateLocationsYaml(currentModel.locations || []);
      locationsFolder.file('locations.yaml', locationsYaml);

      // 3. Generate links — all in transmission_links.yaml
      const linksFolder = zip.folder('model_config').folder('links');
      linksFolder.file('transmission_links.yaml', generateLinksYaml(currentModel.links || []));
      linksFolder.file('power_links.yaml', 'links: {}\n'); // reserved for future use

      // 4. Generate technologies
      // Auto-collect transmission tech definitions from links (if not already in technologies list)
      const allTechs = [...(technologies || [])];
      const techNames = new Set(allTechs.map(t => (t.name || t.id || '').replace(/\s+/g, '_').toLowerCase()));
      (currentModel.links || []).forEach(link => {
        const lt = link.linkType ? LINK_TYPES[link.linkType] : null;
        const techId = link.tech || lt?.calliopeTech || link.linkType;
        if (!techId || techNames.has(techId)) return;
        techNames.add(techId);
        allTechs.push({
          name: techId,
          parent: 'transmission',
          essentials: { name: lt?.label || techId, parent: 'transmission', carrier: link.carrier || lt?.carrier || 'electricity' },
          constraints: {
            energy_cap_max: 'inf',
            energy_eff: lt?.defaults?.energy_eff ?? 0.98,
            lifetime: lt?.defaults?.lifetime ?? 40,
          },
          costs: {
            monetary: {
              interest_rate: 0.05,
              ...(lt?.defaults?.energy_cap_per_distance != null
                ? { energy_cap_per_distance: lt.defaults.energy_cap_per_distance }
                : {}),
            },
          },
        });
      });

      const techsFolder = zip.folder('model_config').folder('techs');
      const techsByParent = { supply: [], demand: [], storage: [], transmission: [], conversion: [], conversion_plus: [] };
      allTechs.forEach(tech => {
        const p = tech.parent || tech.essentials?.parent || 'supply';
        const key = p === 'supply_plus' ? 'supply' : (techsByParent[p] ? p : 'supply');
        techsByParent[key].push(tech);
      });
      techsFolder.file('techs_supply.yaml', generateTechsYaml(techsByParent['supply'], 'supply'));
      techsFolder.file('techs_demand.yaml', generateTechsYaml(techsByParent['demand'], 'demand'));
      techsFolder.file('techs_storage.yaml', generateTechsYaml(techsByParent['storage'], 'storage'));
      techsFolder.file('techs_transmission.yaml', generateTechsYaml(techsByParent['transmission'], 'transmission'));
      techsFolder.file('techs_conversion.yaml',
        generateTechsYaml([...techsByParent['conversion'], ...techsByParent['conversion_plus']], 'conversion'));

      // 5. Generate scenarios
      const scenariosFolder = zip.folder('scenarios');
      scenariosFolder.file('overrides.yaml', generateOverridesYaml(overrides));
      scenariosFolder.file('scenarios.yaml', generateScenariosYaml(scenarios));

      // 6. Add timeseries data
      const timeseriesFolder = zip.folder('timeseries_data');
      
      if (timeSeries && timeSeries.length > 0) {
        const modelTimeSeries = timeSeries.filter(ts => ts.modelId === currentModel.id);
        
        modelTimeSeries.forEach(ts => {
          if (ts.data && ts.columns && ts.fileName) {
            const csv = formatTimeseriesCSV(ts.data, ts.columns);
            timeseriesFolder.file(ts.fileName, csv);
          }
        });
      }

      // 7. Add README
      const readme = `# ${currentModel.name || 'Energy System Model'}

Generated by TEMPO on ${new Date().toISOString()}

## Structure
- model.yaml: Main model configuration
- model_config/: Model components
  - locations/: Geographic locations with technologies
  - links/: Transmission connections
  - techs/: Technology definitions
- scenarios/: Scenarios and overrides
- timeseries_data/: CSV files for demand and resource profiles

## Usage
\`\`\`bash
calliope run model.yaml --scenario=Main
\`\`\`

## Model Details
- Locations: ${(currentModel.locations || []).length}
- Links: ${(currentModel.links || []).length}
- Technologies: ${(technologies || []).length}
- Timeseries: ${timeSeries.filter(ts => ts.modelId === currentModel.id).length}
`;
      zip.file('README.md', readme);

      // Generate and download
      const content = await zip.generateAsync({ type: 'blob' });
      const fileName = `${(currentModel.name || 'model').replace(/\s+/g, '_').toLowerCase()}_calliope_export.zip`;
      saveAs(content, fileName);

      setExportStatus({ type: 'success', message: `Model exported successfully as ${fileName}` });
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus({ type: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  const exportToCalliope07 = async () => {
    if (!currentModel) {
      setExportStatus({ type: 'error', message: 'No model selected' });
      return;
    }
    setExporting(true);
    setExportStatus({ type: 'info', message: 'Generating Calliope 0.7 model...' });
    try {
      const modelTS = timeSeries.filter(ts => ts.modelId === currentModel.id);
      const modelForExport = {
        name: currentModel.name,
        technologies: technologies || [],
        locations: currentModel.locations || [],
        links: currentModel.links || [],
        metadata: {
          modelConfig: currentModel.metadata?.modelConfig || {},
          runConfig: currentModel.metadata?.runConfig || {},
          subsetTime: null,
        },
      };
      const { modelDoc, csvs, log } = internalTo07Yaml(modelForExport, modelTS);
      log.forEach(l => console.log('[07 export]', l));

      const zip = new JSZip();
      zip.file('model.yaml', dump(modelDoc, { lineWidth: 120 }));
      for (const [fname, content] of Object.entries(csvs)) {
        zip.file(fname, content);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const fileName = `${(currentModel.name || 'model').replace(/\s+/g, '_').toLowerCase()}_calliope07_export.zip`;
      saveAs(content, fileName);
      setExportStatus({ type: 'success', message: `Calliope 0.7 model exported as ${fileName}` });
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus({ type: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  // Engine-backed export: translation + file writing happen in the engine's
  // Python service (single source of mapping logic, shared with the runner).
  const exportViaEngine = async (engine, label) => {
    if (!currentModel) {
      setExportStatus({ type: 'error', message: 'No model selected' });
      return;
    }
    setExporting(true);
    setExportReport([]);
    setExportStatus({ type: 'info', message: `Translating model to ${label}…` });
    try {
      const up = await checkEngineRunService(engine);
      if (!up) {
        setExportStatus({
          type: 'error',
          message: `The ${label} engine is not running. Install it from Settings → ${label} Engine.`,
        });
        return;
      }

      const baseModel = {
        name: currentModel.name,
        technologies: technologies || [],
        locations: currentModel.locations || [],
        links: currentModel.links || [],
        modelConfig: currentModel.metadata?.modelConfig || {},
        timeSeries: timeSeries.filter(ts => ts.modelId === currentModel.id),
      };

      // Build datasets: base + one resolved model per scenario
      const datasets = [{ name: 'base', model: baseModel }];
      const resolverReports = [];
      for (const scName of Object.keys(scenarios || {})) {
        const { model: resolved, report: rpt } = resolveScenario(
          baseModel, overrides || {}, scenarios || {}, { type: 'scenario', name: scName }
        );
        resolved.name = `${currentModel.name} (${scName})`;
        datasets.push({ name: scName, model: resolved });
        resolverReports.push(...rpt);
      }

      const { zipBlob, report } = await exportModelArchive(engine, { datasets });
      const fileName = `${(currentModel.name || 'model').replace(/\s+/g, '_').toLowerCase()}_${engine}_export.zip`;
      saveAs(zipBlob, fileName);
      setExportReport([...resolverReports, ...report]);
      setExportStatus({ type: 'success', message: `Model exported as ${fileName}` });
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus({ type: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  const modelTs = currentModel ? timeSeries.filter(ts => ts.modelId === currentModel.id) : [];
  const locs = currentModel?.locations || [];
  const lnks = currentModel?.links || [];
  const techs = technologies || [];
  const modelOverrides = Object.keys(overrides || {});
  const modelScenarios = Object.keys(scenarios || {});
  const supplyTechs = techs.filter(t => t.parent === 'supply' || t.parent === 'supply_plus' || t.techType === 'supply');
  const demandTechs = techs.filter(t => t.parent === 'demand' || t.techType === 'demand');
  const storageTechs = techs.filter(t => t.parent === 'storage' || t.techType === 'storage');
  const transmTechs = techs.filter(t => t.parent === 'transmission' || t.techType === 'transmission');

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="space-y-5">

        {/* Page header + mode toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <FiDownload size={18} className="text-gray-500" />
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-800">Export</h1>
            <p className="text-xs text-slate-500">
              {exportMode === 'model' ? 'Export your active model as a framework-ready ZIP archive' : 'Download results data from a completed run'}
            </p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {[{ id: 'model', label: 'Model', icon: FiPackage }, { id: 'results', label: 'Results', icon: FiLayers }].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setExportMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  exportMode === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Results mode */}
        {exportMode === 'results' && (
          <ResultsExportPanel completedJobs={completedJobs || []} />
        )}

        {/* Model mode */}
        {exportMode === 'model' && !currentModel && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <FiPackage size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-gray-700 mb-1">No model selected</p>
            <p className="text-sm text-gray-400">Select a model from the Models section to export it.</p>
          </div>
        )}

        {exportMode === 'model' && currentModel && (<>

        {/* Active model card */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Active Model</h2>
          <div className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="font-semibold text-slate-800 text-sm">{currentModel.name}</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full font-medium">
                  {currentModel.metadata?.modelConfig?.calliopeVersion
                    ? `Calliope ${currentModel.metadata.modelConfig.calliopeVersion}`
                    : 'Calliope 0.6.8'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {locs.length} locations · {lnks.length} links · {techs.length} techs · {modelTs.length} time series · {modelOverrides.length} overrides · {modelScenarios.length} scenarios
              </p>
            </div>
          </div>
        </div>

        {/* Format selection — lateral grid */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          <h2 className="text-xl font-semibold text-slate-800 mb-3">Export Format</h2>
          <div className="grid grid-cols-5 gap-3">
            {EXPORT_FORMATS.map(fmt => {
              const Icon = fmt.icon;
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  onClick={() => fmt.supported && setSelectedFormat(fmt.id)}
                  disabled={!fmt.supported}
                  className={`relative flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 text-center transition-all ${
                    isSelected
                      ? 'border-gray-700 bg-gray-50'
                      : fmt.supported
                      ? 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                      : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <Icon size={20} className={isSelected ? 'text-gray-700' : 'text-gray-400'} />
                  <div>
                    <p className={`text-xs font-semibold leading-tight ${isSelected ? 'text-gray-800' : 'text-gray-600'}`}>
                      {fmt.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-2">{fmt.description}</p>
                  </div>
                  {!fmt.supported && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-gray-700 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Structure + Action — side by side */}
        <div className="grid grid-cols-2 gap-5 items-start">

          {/* Output structure — detailed */}
          <div className="bg-white rounded-xl shadow-lg p-5">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">Output Structure</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 leading-5">
              {selectedFormat === 'osemosys' ? (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFolder} name="base/" isDir note="one folder per dataset" />
                  <TreeRow indent={2} icon={FiFile} name="REGION.csv" />
                  <TreeRow indent={2} icon={FiFile} name="TECHNOLOGY.csv" />
                  <TreeRow indent={2} icon={FiFile} name="FUEL.csv" />
                  <TreeRow indent={2} icon={FiFile} name="CapitalCost.csv" note="+ 18 more parameter CSVs" dim />
                  <TreeRow indent={2} icon={FiFile} name="SpecifiedAnnualDemand.csv" />
                  <TreeRow indent={2} icon={FiFile} name="YearSplit.csv" />
                  <TreeRow indent={1} icon={FiFile} name="report.txt" note="translation notes" />
                </>
              ) : selectedFormat === 'adoptnet0' ? (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFolder} name="base/" isDir note="one folder per dataset" />
                  <TreeRow indent={2} icon={FiFile} name="Topology.json" />
                  <TreeRow indent={2} icon={FiFile} name="ConfigModel.json" />
                  <TreeRow indent={2} icon={FiFile} name="NodeLocations.csv" />
                  <TreeRow indent={2} icon={FiFolder} name="period1/" isDir />
                  <TreeRow indent={3} icon={FiFolder} name="network_data/" isDir />
                  <TreeRow indent={3} icon={FiFolder} name="node_data/" isDir note={`${locs.length} node${locs.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={1} icon={FiFile} name="report.txt" note="translation notes" />
                </>
              ) : selectedFormat === 'pypsa' ? (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFolder} name="base/" isDir note="one folder per dataset" />
                  <TreeRow indent={2} icon={FiFile} name="model.nc" note="pypsa.Network netCDF" />
                  <TreeRow indent={2} icon={FiFolder} name="csv/" isDir note="CSV folder (buses, generators, …)" />
                  <TreeRow indent={1} icon={FiFile} name="report.txt" note="translation notes" />
                </>
              ) : selectedFormat === 'calliope07' ? (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFile} name="model.yaml" note="config + techs + nodes + data_tables" />
                  <TreeRow indent={1} icon={FiFile} name="demand_profiles.csv" note="positive values (0.7 convention)" />
                  {modelTs.map((ts, i) => (
                    <TreeRow key={i} indent={1} icon={FiFile} name={`${ts.name || `timeseries_${i+1}`}.csv`} dim />
                  ))}
                  {modelTs.length === 0 && (
                    <TreeRow indent={1} icon={FiFile} name="(no additional time series)" dim />
                  )}
                </>
              ) : (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFile} name="model.yaml" note="root import manifest" />
                  <TreeRow indent={1} icon={FiFile} name="README.md" />
                  <TreeRow indent={1} icon={FiFolder} name="model_config/" isDir />
                  <TreeRow indent={2} icon={FiFolder} name="locations/" isDir />
                  <TreeRow indent={3} icon={FiFile} name="locations.yaml" note={`${locs.length} location${locs.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={2} icon={FiFolder} name="links/" isDir />
                  <TreeRow indent={3} icon={FiFile} name="transmission_links.yaml" note={`${lnks.length} link${lnks.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={3} icon={FiFile} name="power_links.yaml" />
                  <TreeRow indent={2} icon={FiFolder} name="techs/" isDir />
                  <TreeRow indent={3} icon={FiFile} name="techs_supply.yaml" note={supplyTechs.length > 0 ? `${supplyTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_demand.yaml" note={demandTechs.length > 0 ? `${demandTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_storage.yaml" note={storageTechs.length > 0 ? `${storageTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_transmission.yaml" note={transmTechs.length > 0 ? `${transmTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_conversion.yaml" />
                  <TreeRow indent={1} icon={FiFolder} name="scenarios/" isDir />
                  <TreeRow indent={2} icon={FiFile} name="overrides.yaml" note={`${modelOverrides.length} override${modelOverrides.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={2} icon={FiFile} name="scenarios.yaml" note={`${modelScenarios.length} scenario${modelScenarios.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={1} icon={FiFolder} name="timeseries_data/" isDir />
                  {modelTs.length > 0
                    ? modelTs.map((ts, i) => (
                        <TreeRow key={i} indent={2} icon={FiFile} name={`${ts.name || `timeseries_${i+1}`}.csv`} dim />
                      ))
                    : <TreeRow indent={2} icon={FiFile} name="(no time series files)" dim />
                  }
                </>
              )}
            </div>
          </div>

          {/* Export action */}
          <div className="bg-white rounded-xl shadow-lg p-5">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">Export</h2>
            <p className="text-xs text-gray-500 mb-4">
              The model will be packaged as a ZIP archive ready to use with{' '}
              <span className="font-medium text-gray-700">
                {EXPORT_FORMATS.find(f => f.id === selectedFormat)?.name || 'Calliope'}
              </span>.
              {selectedFormat === 'calliope07' && ' Uses single flat YAML + CSV layout (0.7 convention).'}
              {selectedFormat === 'calliope' && ' Uses nested folder structure compatible with Calliope 0.6.8.'}
              {selectedFormat === 'pypsa' && ' Contains both model.nc (netCDF) and a CSV folder — loadable with pypsa.Network(). Requires the PyPSA engine (Settings).'}
              {selectedFormat === 'adoptnet0' && ' Generates the AdOpT-NET0 case-directory structure (Topology, ConfigModel, node_data). Requires the AdOpT-NET0 engine (Settings).'}
              {selectedFormat === 'osemosys' && ' otoole-compatible CSV dataset (22 files). Run with otoole + GLPK via the OSeMOSYS engine (Settings), or load into any otoole workflow.'}
            </p>
            <button
              onClick={() => {
                setExportReport([]);
                if (selectedFormat === 'calliope07') { exportToCalliope07(); return; }
                if (selectedFormat === 'pypsa') { exportViaEngine('pypsa', 'PyPSA'); return; }
                if (selectedFormat === 'osemosys') { exportViaEngine('osemosys', 'OSeMOSYS'); return; }
                if (selectedFormat === 'adoptnet0') { exportViaEngine('adoptnet0', 'AdOpT-NET0'); return; }
                const fmt = EXPORT_FORMATS.find(f => f.id === selectedFormat);
                if (!fmt.supported) {
                  setExportStatus({ type: 'error', message: `${fmt.name} export is not yet supported.` });
                  return;
                }
                exportToCalliope();
              }}
              disabled={exporting}
              className="w-full py-2.5 bg-gray-700 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <FiDownload size={15} />
              {exporting
                ? 'Exporting…'
                : `Export as ${EXPORT_FORMATS.find(f => f.id === selectedFormat)?.name || 'Calliope'} ZIP`}
            </button>

            {exportStatus && (
              <div className={`mt-3 px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm ${
                exportStatus.type === 'success'
                  ? 'bg-gray-50 text-gray-700 border border-gray-200'
                  : exportStatus.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-100'
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}>
                {exportStatus.type === 'success'
                  ? <FiCheckCircle size={14} className="flex-shrink-0" />
                  : <FiAlertCircle size={14} className="flex-shrink-0" />}
                <span>{exportStatus.message}</span>
              </div>
            )}

            <TranslationReport report={exportReport} />
          </div>

        </div>

        </>
        )}
      </div>
    </div>
  );
};

export default Export;
