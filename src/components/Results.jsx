import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useData } from '../context/DataContext';
import ReactECharts from 'echarts-for-react';
import {
  FiBarChart2, FiPieChart, FiTrendingUp, FiDownload,
  FiRefreshCw, FiAlertCircle, FiCheckCircle, FiTrash2,
  FiTerminal, FiAlertTriangle, FiMapPin, FiDollarSign,
  FiZap, FiActivity, FiClock, FiCpu, FiMap, FiLayers,
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

// ── Mini map component ───────────────────────────────────────────────────────
const ResultsMap = ({ locations, capacitiesByLoc, dominantTechByLoc }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (!mapRef.current) return;

      // Centre on the locations' centroid
      const locs = locations.filter(l => l.latitude && l.longitude);
      const avgLat = locs.length ? locs.reduce((s, l) => s + l.latitude, 0) / locs.length : 50;
      const avgLon = locs.length ? locs.reduce((s, l) => s + l.longitude, 0) / locs.length : 10;

      const map = new maplibregl.Map({
        container: mapRef.current,
        style: OSM_STYLE,
        center: [avgLon, avgLat],
        zoom: 5,
        attributionControl: false,
      });
      mapInstanceRef.current = map;

      map.on('load', () => {
        const maxCap = Math.max(1, ...Object.values(capacitiesByLoc));

        locs.forEach(loc => {
          const cap = capacitiesByLoc[loc.name] || 0;
          const radius = 8 + (cap / maxCap) * 28;
          const color = techColor(dominantTechByLoc[loc.name] || 'generic');

          const el = document.createElement('div');
          el.style.cssText = `
            width:${radius*2}px; height:${radius*2}px;
            border-radius:50%;
            background:${color}CC;
            border:2px solid ${color};
            box-shadow:0 2px 8px rgba(0,0,0,0.35);
            cursor:pointer;
          `;

          const popup = new maplibregl.Popup({ offset: radius, closeButton: false, maxWidth: '220px' })
            .setHTML(`
              <div style="font-family:system-ui;padding:4px 2px">
                <div style="font-weight:700;font-size:13px;margin-bottom:4px">${loc.name}</div>
                <div style="font-size:11px;color:#555">Capacity: <b>${fmtNum(cap)} MW</b></div>
                <div style="font-size:11px;color:#555">Dominant: <b>${(dominantTechByLoc[loc.name]||'—').replace(/_/g,' ')}</b></div>
              </div>
            `);

          new maplibregl.Marker({ element: el })
            .setLngLat([loc.longitude, loc.latitude])
            .setPopup(popup)
            .addTo(map);
        });
      });
    });
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []); // init once

  return <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
};

// ── Main component ───────────────────────────────────────────────────────────
const Results = () => {
  const { completedJobs, removeCompletedJob, showNotification, models } = useData();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (completedJobs.length > 0 && !selectedJobId) {
      setSelectedJobId(completedJobs[completedJobs.length - 1].id);
    }
  }, [completedJobs]);

  const selectedJob = completedJobs.find(j => j.id === selectedJobId) || null;
  const result = selectedJob?.result || null;

  // Find model for location lat/lon data
  const modelLocations = useMemo(() => {
    if (!selectedJob) return [];
    const m = models.find(m => m.name === selectedJob.modelName);
    return (m?.locations || []).filter(l => l.latitude && l.longitude && !l.techs || Object.keys(l.techs || {}).some(t => !t.includes('transmission')));
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

    const totalGen = Object.values(genByTech).reduce((s, v) => s + v, 0);
    const totalCap = Object.values(capByTech).reduce((s, v) => s + v, 0);

    // Dispatch timestamps → compact labels
    const timestamps = (result.timestamps || []).map(t => {
      const d = new Date(t);
      if (isNaN(d)) return t;
      return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });

    return { capByTech, capByLoc, domTech, genByTech, totalGen, totalCap, timestamps };
  }, [result]);

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

  // ── TABS ───────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'overview', label: 'Overview',  icon: FiLayers },
    { id: 'dispatch', label: 'Dispatch',  icon: FiActivity },
    { id: 'costs',    label: 'Costs',     icon: FiDollarSign },
    { id: 'logs',     label: 'Logs',      icon: FiTerminal },
  ];

  const hasDispatch = result?.dispatch && Object.keys(result.dispatch).length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="max-w-screen-2xl mx-auto p-6">

        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-electric-600 to-violet-600 bg-clip-text text-transparent mb-1">
              Results Dashboard
            </h1>
            <p className="text-slate-500 text-sm">Calliope optimisation results · interactive analysis</p>
          </div>
          {result && (
            <button onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-50 transition text-sm shadow-sm">
              <FiDownload size={14} /> Export JSON
            </button>
          )}
        </div>

        <div className="flex gap-5">

          {/* ── Left: job list ── */}
          <div className="w-56 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sticky top-4">
              <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                <FiBarChart2 size={14} className="text-electric-500" /> Completed runs
              </h2>
              {completedJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FiAlertCircle size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No runs yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...completedJobs].reverse().map(job => (
                    <div key={job.id}
                      onClick={() => { setSelectedJobId(job.id); setTab('overview'); }}
                      className={`group relative cursor-pointer rounded-xl border-2 p-3 transition-all ${
                        selectedJobId === job.id
                          ? 'border-electric-400 bg-electric-50'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="font-medium text-xs text-slate-800 truncate">{job.modelName}</div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <FiCpu size={9} /> {job.solver?.toUpperCase()}
                            <span className="mx-0.5">·</span>
                            <FiClock size={9} /> {job.duration}
                          </div>
                          {job.status === 'failed' ? (
                            <span className="text-xs text-red-500 flex items-center gap-1 mt-1"><FiAlertTriangle size={10} /> Failed</span>
                          ) : (
                            <div className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                              job.terminationCondition === 'optimal' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              <FiCheckCircle size={9} /> {job.terminationCondition || 'optimal'}
                            </div>
                          )}
                        </div>
                        <button onClick={e => { e.stopPropagation(); removeCompletedJob(job.id); if (selectedJobId === job.id) setSelectedJobId(null); }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-opacity flex-shrink-0 mt-0.5">
                          <FiTrash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: dashboard ── */}
          <div className="flex-1 min-w-0">
            {!selectedJob ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-20 text-center text-slate-400">
                <FiBarChart2 size={56} className="mx-auto mb-4 opacity-20" />
                <h3 className="text-xl font-semibold mb-1">No result selected</h3>
                <p className="text-sm">Run a model and select a completed job</p>
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
                  <div className="bg-slate-900 text-green-400 rounded-2xl p-4 text-xs font-mono h-64 overflow-y-auto">
                    {selectedJob.logs.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">

                {/* ── KPI strip ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Cost',       value: fmtNum(result?.objective),         unit: '€',   icon: FiDollarSign,  bg: 'from-emerald-500 to-teal-500' },
                    { label: 'Total Generation', value: fmtNum(derivedData?.totalGen),     unit: 'MWh', icon: FiZap,         bg: 'from-amber-400 to-orange-500' },
                    { label: 'Installed Cap.',   value: fmtNum(derivedData?.totalCap),     unit: 'MW',  icon: FiBarChart2,   bg: 'from-blue-500 to-indigo-500' },
                    { label: 'Solve Time',        value: selectedJob.duration,              unit: '',    icon: FiClock,       bg: 'from-purple-500 to-violet-500' },
                  ].map(({ label, value, unit, icon: Icon, bg }) => (
                    <div key={label} className={`bg-gradient-to-br ${bg} rounded-2xl p-4 text-white shadow-sm`}>
                      <div className="flex items-center gap-2 mb-2 opacity-80">
                        <Icon size={14} />
                        <span className="text-xs font-medium">{label}</span>
                      </div>
                      <div className="text-2xl font-bold tracking-tight">{value}</div>
                      {unit && <div className="text-xs opacity-70 mt-0.5">{unit}</div>}
                    </div>
                  ))}
                </div>

                {/* ── Solver badge ── */}
                <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center gap-4 shadow-sm text-sm text-slate-600 flex-wrap">
                  <span className="flex items-center gap-1.5"><FiCheckCircle className="text-green-500" size={15}/> <strong>{selectedJob.modelName}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>Solver: <strong>{selectedJob.solver?.toUpperCase()}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>Status: <strong className="text-green-600">{selectedJob.terminationCondition}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>Objective: <strong>{fmtFull(result?.objective)}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-400 text-xs">{new Date(selectedJob.completedAt).toLocaleString()}</span>
                </div>

                {/* ── Tabs ── */}
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setTab(id)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
                    {/* Map + Capacity bar */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Map */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                          <FiMap size={15} className="text-electric-500" />
                          <span className="font-semibold text-slate-800 text-sm">Location Map</span>
                          <span className="text-xs text-slate-400 ml-1">· circle size = installed capacity</span>
                        </div>
                        <div style={{ height: 320 }}>
                          {modelLocations.length > 0 ? (
                            <ResultsMap
                              key={selectedJobId}
                              locations={modelLocations}
                              capacitiesByLoc={derivedData?.capByLoc || {}}
                              dominantTechByLoc={derivedData?.domTech || {}}
                            />
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                              <FiMapPin size={20} className="mr-2 opacity-40" /> Location data unavailable
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Capacity by tech */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <FiBarChart2 size={15} className="text-blue-500" />
                          <span className="font-semibold text-slate-800 text-sm">Installed Capacity by Technology</span>
                        </div>
                        {capBarOption ? (
                          <ReactECharts option={capBarOption} style={{ height: 280 }} notMerge />
                        ) : (
                          <div className="text-slate-400 text-sm text-center py-16">No capacity data</div>
                        )}
                      </div>
                    </div>

                    {/* Generation donut + capacity by location */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <FiPieChart size={15} className="text-amber-500" />
                          <span className="font-semibold text-slate-800 text-sm">Generation Mix</span>
                          <span className="text-xs text-slate-400 ml-1">· MWh total</span>
                        </div>
                        {genDonutOption ? (
                          <ReactECharts option={genDonutOption} style={{ height: 280 }} notMerge />
                        ) : (
                          <div className="text-slate-400 text-sm text-center py-16">No generation data</div>
                        )}
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <FiMapPin size={15} className="text-violet-500" />
                          <span className="font-semibold text-slate-800 text-sm">Capacity by Location</span>
                        </div>
                        {capLocOption ? (
                          <ReactECharts option={capLocOption} style={{ height: 280 }} notMerge />
                        ) : (
                          <div className="text-slate-400 text-sm text-center py-16">No location data</div>
                        )}
                      </div>
                    </div>

                    {/* Summary stats table */}
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
                                <th className="text-right py-2 pl-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Cap Factor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.keys(derivedData.capByTech).sort().map((tech, i) => {
                                const cap = derivedData.capByTech[tech] || 0;
                                const gen = derivedData.genByTech[tech] || 0;
                                const cost = result?.costs_by_tech?.[tech] || 0;
                                const hrs = (result?.timestamps?.length) || 8760;
                                const cf = cap > 0 ? (gen / (cap * hrs) * 100) : null;
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

                {/* ════════════════ DISPATCH TAB ════════════════ */}
                {tab === 'dispatch' && (
                  <div className="space-y-4">
                    {!hasDispatch ? (
                      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
                        <FiActivity size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Dispatch timeseries not available</p>
                        <p className="text-xs mt-1 text-slate-300">Rebuild Docker image and re-run the model</p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <div className="flex items-center gap-2 mb-1">
                            <FiActivity size={15} className="text-green-500" />
                            <span className="font-semibold text-slate-800 text-sm">Generation Dispatch Stack</span>
                            <span className="text-xs text-slate-400 ml-1">· MW per hour  ·  scroll/pinch to zoom</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-3">Stacked area = total supply · dashed red = demand</p>
                          <ReactECharts option={dispatchOption} style={{ height: 380 }} notMerge />
                        </div>

                        {/* Per-tech dispatch totals quick table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                          <h3 className="font-semibold text-slate-800 text-sm mb-4">Dispatch Totals per Technology</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {Object.entries(result.dispatch).map(([tech, vals]) => {
                              const total = vals.reduce((s, v) => s + v, 0);
                              const peak = Math.max(...vals);
                              return (
                                <div key={tech} className="rounded-xl border border-slate-100 p-3 bg-slate-50">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: techColor(tech) }} />
                                    <span className="text-xs font-semibold text-slate-700 capitalize truncate">{tech.replace(/_/g, ' ')}</span>
                                  </div>
                                  <div className="text-lg font-bold text-slate-800">{fmtNum(total)}</div>
                                  <div className="text-xs text-slate-400">MWh total</div>
                                  <div className="text-xs text-slate-500 mt-1">Peak: <strong>{fmtNum(peak)} MW</strong></div>
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
                    {/* Costs by tech bar */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <FiDollarSign size={15} className="text-emerald-500" />
                        <span className="font-semibold text-slate-800 text-sm">Total Cost by Technology</span>
                      </div>
                      {costsTechOption ? (
                        <ReactECharts option={costsTechOption} style={{ height: 260 }} notMerge />
                      ) : (
                        <div className="text-slate-400 text-sm text-center py-12">No cost data</div>
                      )}
                    </div>

                    {/* Stacked bar: costs by location */}
                    {costsLocOption && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <FiMapPin size={15} className="text-violet-500" />
                          <span className="font-semibold text-slate-800 text-sm">Cost Breakdown by Location &amp; Technology</span>
                        </div>
                        <ReactECharts option={costsLocOption} style={{ height: 280 }} notMerge />
                      </div>
                    )}

                    {/* Cost by location table */}
                    {result?.costs_by_location && (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
                        <h3 className="font-semibold text-slate-800 text-sm mb-4">Cost Table (€)</h3>
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
      </div>
    </div>
  );
};

export default Results;
