import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

import {
  techColor, fmtNum, fmtFull, fmtPower, fmtEnergy, fmtCost,
  autoScale, axisNameStyle, scaledFmt, TECH_GROUPS, classifyTech,
  linkTechBase, calliopeLocName, parseLTC,
} from '../utils/resultFormat';

import { ResultsMap, TransmissionFlowMap, GroupedCorrMatrixSVG } from './results/ResultMaps';

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
  // Shadow prices tab: selected carrier:node key
  const [shadowPriceKey, setShadowPriceKey] = useState(null);
  // SPORES tab interactive state
  const [sporeScatterA, setSporeScatterA] = useState(null);
  const [sporeScatterB, setSporeScatterB] = useState(null);
  const [selectedSpore, setSelectedSpore] = useState(0);
  // empty Set = nothing selected yet; Set<string> = regions to show
  const [corrLocFilter, setCorrLocFilter] = useState(new Set());

  // Reset per-job UI state when switching runs
  useEffect(() => {
    setTab('overview');
    setMapView('capacity');
    setTechFilter(new Set());
    setCollapsedSections(new Set());
    setFilterSearch('');
    setCorrLocFilter(new Set());
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

  // Returns true only for generation/storage techs that should appear in capacity charts.
  // Uses tech_metadata parent type (authoritative); falls back to name heuristics.
  // Excludes: demand, transmission, unmet_demand, import/export.
  const GEN_PARENTS = useMemo(() => new Set(['supply', 'supply_plus', 'storage', 'conversion', 'conversion_plus']), []);
  const isGenTech = useCallback((tech) => {
    if (!tech || tech.includes(':')) return false; // :dest suffix = transmission entry
    const parent = (techMetaMap[tech]?.parent || '').toLowerCase();
    if (parent && parent !== 'nan') return GEN_PARENTS.has(parent);
    // No metadata: name-based fallback
    return !isTransTech(tech) && !/demand|unmet|import|export/i.test(tech);
  }, [techMetaMap, GEN_PARENTS, isTransTech]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const derivedData = useMemo(() => {
    if (!result) return null;

    // Parse capacities: "Berlin::solar_pv" → {loc, tech, value}
    // Calliope 0.6 key formats:
    //   non-transmission: "loc::tech"
    //   transmission:     "loc::tech:dest_loc"  (tech contains a colon)
    const capEntries = Object.entries(result.capacities || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && isGenTech(e.tech));

    // Capacity by tech (summed) — generation + storage only
    const capByTech = {};
    capEntries.forEach(({ tech, value }) => { capByTech[tech] = (capByTech[tech] || 0) + value; });

    // Transmission capacity: build unique bidirectional link pairs sorted by capacity.
    // Also keep per-type aggregation for the legacy map legend.
    const txCapByTech = {};
    const txPairsSeen = new Set();
    const txLinks = [];
    Object.entries(result.capacities || {}).forEach(([k, v]) => {
      const { loc, tech } = parseLTC(k);
      const val = Number(v) || 0;
      if (val <= 0 || !tech.includes(':')) return;
      const colonIdx = tech.indexOf(':');
      const baseTech = tech.slice(0, colonIdx);
      const destLoc  = tech.slice(colonIdx + 1);
      txCapByTech[baseTech] = (txCapByTech[baseTech] || 0) + val;
      // Deduplicate: store only one direction per pair
      const pairKey = [loc, destLoc].sort().join(':::') + ':::' + baseTech;
      if (!txPairsSeen.has(pairKey)) {
        txPairsSeen.add(pairKey);
        txLinks.push({ from: loc, to: destLoc, tech: baseTech, cap: val });
      }
    });
    txLinks.sort((a, b) => b.cap - a.cap);

    // Capacity by location (summed) — generation/storage only
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

    return { capByTech, txCapByTech, txLinks, capByLoc, domTech, genByTech, genByLoc, totalGen, totalCap, timestamps };
  }, [result, isGenTech]);

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
    const fw = result.framework || 'results';
    a.href = url; a.download = `${fw}_${selectedJobId}.json`; a.click();
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
      .filter(t => isGenTech(t) && isTechVisible(t));
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
      .filter(e => e.value > 0 && isGenTech(e.tech) && isTechVisible(e.tech));

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
      .filter(e => e.value > 0 && isGenTech(e.tech));
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
      .filter(e => e.value > 0 && isGenTech(e.tech) && isTechVisible(e.tech));
    const genEntries = Object.entries(result.generation || {})
      .map(([k, v]) => ({ ...parseLTC(k), value: Number(v) || 0 }))
      .filter(e => e.value > 0 && isGenTech(e.tech) && isTechVisible(e.tech));
    const hrs = (result?.timestamps?.length) || 8760;

    if (isLargeModel) {
      const techCap = {};
      const techGen = {};
      capEntries.forEach(({ tech, value }) => { techCap[tech] = (techCap[tech] || 0) + value; });
      genEntries.forEach(({ tech, value }) => { techGen[tech] = (techGen[tech] || 0) + value; });
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
  const isSporesRun = selectedJob?.mode === 'spores';
  const hasSpores = Array.isArray(result?.spores_data) && result.spores_data.length > 0;

  const hasShadowPrices = result?.shadow_prices && Object.keys(result.shadow_prices).length > 0;
  const hasFlow     = Object.keys(result?.generation   || {}).length > 0;
  const hasDispatch = Object.keys(result?.dispatch     || {}).length > 0;
  const hasCosts    = Object.keys(result?.costs_by_tech || {}).length > 0;

  const TABS = [
    { id: 'overview',  label: 'Overview',    icon: FiLayers },
    ...(hasFlow     ? [{ id: 'flow',     label: 'Energy Flow',   icon: FiShare2    }] : []),
    ...(hasDispatch ? [{ id: 'dispatch', label: 'Dispatch',      icon: FiActivity  }] : []),
    ...(hasCosts    ? [{ id: 'costs',    label: 'Costs',         icon: FiDollarSign }] : []),
    ...(hasShadowPrices ? [{ id: 'shadow', label: 'Shadow Prices', icon: FiTrendingUp }] : []),
    ...(hasFlow     ? [{ id: 'analysis', label: 'Analysis',      icon: FiGrid      }] : []),
    ...((isSporesRun || hasSpores) ? [{ id: 'spores', label: 'SPORES', icon: FiGitMerge }] : []),
    { id: 'logs',      label: 'Logs',        icon: FiTerminal },
  ];

  // Fall back to overview if the active tab was hidden by auto-hide logic
  const activeTab = TABS.some(t => t.id === tab) ? tab : 'overview';

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
              {(() => {
                const fw = result?.framework || selectedJob?.framework;
                const ENGINE_LABELS = {
                  calliope:   'Calliope 0.6',
                  calliope07: 'Calliope 0.7',
                  pypsa:      'PyPSA',
                  osemosys:   'OSeMOSYS',
                  adoptnet0:  'AdOpT-NET0',
                };
                const label = ENGINE_LABELS[fw];
                return label ? (
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                    {label}
                  </span>
                ) : null;
              })()}
              {selectedJobId && (
                <button onClick={() => { removeCompletedJob(selectedJobId); setSelectedJobId(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100">
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex gap-4">
              <FiAlertTriangle className="text-gray-500 flex-shrink-0" size={24} />
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">{selectedJob.modelName} — Failed</h2>
                <p className="text-sm text-gray-700">{result?.error || 'Unknown error'}</p>
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
                      activeTab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Map — full width, main visual */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
                      <FiMap size={14} className="text-gray-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm">Location Map</span>
                      <div className="ml-auto flex gap-1">
                        {[
                          { id: 'capacity',     label: 'Capacity',     icon: FiBarChart2 },
                          ...(hasFlow ? [{ id: 'generation', label: 'Gen Heatmap', icon: FiZap }] : []),
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
                      <FiPieChart size={14} className="text-gray-500 flex-shrink-0" />
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
                                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                      {cf.toFixed(1)}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>}
                  </div>
                )}

                {/* Transmission Capacity */}
                {(derivedData?.txLinks?.length > 0) && (() => {
                  const allLinks = derivedData.txLinks;
                  // Separate constrained links from unconstrained (free_transmission, ≥50 GW threshold)
                  const FREE_CAP = 50e6; // 50 GW — treat as unconstrained modeling artifact
                  const constrained = allLinks.filter(l => l.cap < FREE_CAP);
                  const free       = allLinks.filter(l => l.cap >= FREE_CAP);
                  const { div: txDiv, unit: txUnit } = autoScale(
                    Math.max(1, ...constrained.map(l => l.cap), 1), 'MW'
                  );
                  const fmtTx = scaledFmt(txDiv);
                  const MAX_BARS = 30;
                  const barLinks = constrained.slice(0, MAX_BARS);
                  const txBarOption = barLinks.length > 0 ? {
                    backgroundColor: 'transparent',
                    grid: { left: 160, right: 70, top: 10, bottom: 10 },
                    xAxis: { type: 'value', ...axisNameStyle(txUnit), axisLabel: { fontSize: 9, color: '#64748b', formatter: v => fmtTx(v) }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
                    yAxis: { type: 'category', data: barLinks.map(l => `${l.from} ↔ ${l.to}`), axisLabel: { fontSize: 9, color: '#475569' } },
                    series: [{
                      type: 'bar', barMaxWidth: 20,
                      data: barLinks.map(l => ({ value: l.cap, itemStyle: { color: techColorFn(l.tech), borderRadius: [0, 4, 4, 0] } })),
                      label: { show: true, position: 'right', formatter: p => fmtTx(p.value) + ' ' + txUnit, fontSize: 9, color: '#64748b' },
                    }],
                    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/><b>${fmtTx(p[0].value)} ${txUnit}</b>` },
                  } : null;

                  return (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <button onClick={() => toggleSection('tx-capacity')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                        <FiShare2 size={14} className="text-slate-500 flex-shrink-0" />
                        <span className="font-semibold text-slate-800 text-sm flex-1">Transmission Capacity</span>
                        <span className="text-xs text-slate-400 mr-1">· {constrained.length} link{constrained.length !== 1 ? 's' : ''}</span>
                        <FiChevronDown size={12} className={`text-slate-400 transition-transform duration-150 ${sectionOpen('tx-capacity') ? '' : '-rotate-90'}`} />
                      </button>
                      {sectionOpen('tx-capacity') && (
                        <div className="px-5 pb-5">
                          {txBarOption ? (
                            <>
                              <p className="text-xs text-slate-400 mb-3">Per-link installed capacity (constrained lines only). Capacity shown per unique pair.</p>
                              <ReactECharts option={txBarOption} style={{ height: Math.max(160, barLinks.length * 26 + 30) }} notMerge />
                              {constrained.length > MAX_BARS && (
                                <p className="text-xs text-slate-400 mt-2 text-center">Showing top {MAX_BARS} of {constrained.length} links</p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 py-4 text-center">No constrained transmission links</p>
                          )}
                          {free.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <p className="text-xs text-slate-400">
                                <span className="font-medium text-slate-500">{free.length} unconstrained link{free.length !== 1 ? 's' : ''}</span>
                                {' '}({[...new Set(free.map(l => l.tech))].join(', ')}) — fixed at very high capacity, omitted from chart.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ════════════════ ENERGY FLOW TAB (SANKEY) ════════════════ */}
            {activeTab === 'flow' && (
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
            {activeTab === 'dispatch' && (
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
                        <FiActivity size={14} className="text-gray-500 flex-shrink-0" />
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
            {activeTab === 'costs' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleSection('cost-by-tech')} className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition text-left">
                      <FiDollarSign size={14} className="text-gray-500 flex-shrink-0" />
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
                            <p className="text-xs text-gray-500 mb-3">Showing top {LOC_CHART_LIMIT} locations by total cost (of {allLocs.length}). Export JSON for full data.</p>
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

            {/* ════════════════ SHADOW PRICES TAB ════════════════ */}
            {activeTab === 'shadow' && hasShadowPrices && (() => {
              const sp = result.shadow_prices;
              const keys = Object.keys(sp).sort();
              const timestamps = result.timestamps || [];
              const spKey = (shadowPriceKey && keys.includes(shadowPriceKey)) ? shadowPriceKey : keys[0];
              const series = sp[spKey] || [];

              const chartOption = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis', formatter: (p) => `${p[0].axisValue}<br/>${p[0].seriesName}: ${p[0].value?.toFixed(4) ?? '—'}` },
                grid: { top: 16, right: 20, bottom: 60, left: 70 },
                xAxis: { type: 'category', data: timestamps, axisLabel: { fontSize: 9, rotate: 30, formatter: v => String(v).slice(5, 16) } },
                yAxis: { type: 'value', name: 'Shadow price (€/MWh)', nameTextStyle: { fontSize: 10 } },
                series: [{
                  name: spKey,
                  type: 'line',
                  data: series,
                  lineStyle: { width: 1.5, color: '#6366f1' },
                  areaStyle: { color: 'rgba(99,102,241,0.08)' },
                  showSymbol: false,
                }],
              };

              // Summary stats
              const vals = series.filter(v => v != null);
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
              const mn = vals.length ? Math.min(...vals) : null;
              const mx = vals.length ? Math.max(...vals) : null;

              return (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700">
                    Shadow prices are the dual variables of the system energy balance constraints — they represent the marginal cost of supplying one additional unit of energy at each node and timestep. Only available for Calliope 0.7 (HiGHS solver).
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">Carrier : Node</span>
                      <select value={spKey} onChange={e => setShadowPriceKey(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        {keys.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      {avg != null && (
                        <div className="ml-auto flex gap-4 text-xs text-slate-500">
                          <span>Avg: <strong className="text-slate-800">{avg.toFixed(4)}</strong></span>
                          <span>Min: <strong className="text-slate-800">{mn?.toFixed(4)}</strong></span>
                          <span>Max: <strong className="text-slate-800">{mx?.toFixed(4)}</strong></span>
                        </div>
                      )}
                    </div>
                    <ReactECharts option={chartOption} style={{ height: 300 }} notMerge />
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 overflow-x-auto">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Summary — all carrier:node pairs</h3>
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2 pr-4 text-slate-500 font-medium">Carrier : Node</th>
                          <th className="py-2 px-3 text-right text-slate-500 font-medium">Mean (€/MWh)</th>
                          <th className="py-2 px-3 text-right text-slate-500 font-medium">Min</th>
                          <th className="py-2 px-3 text-right text-slate-500 font-medium">Max</th>
                          <th className="py-2 pl-3 text-right text-slate-500 font-medium">Non-zero %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((k, i) => {
                          const v = (sp[k] || []).filter(x => x != null);
                          const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
                          const min_ = v.length ? Math.min(...v) : null;
                          const max_ = v.length ? Math.max(...v) : null;
                          const nzPct = v.length ? (v.filter(x => Math.abs(x) > 1e-6).length / v.length * 100) : 0;
                          return (
                            <tr key={k} className={i % 2 === 0 ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-slate-50/60'}>
                              <td className="py-2 pr-4 font-medium text-indigo-700 font-mono">{k}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{mean?.toFixed(4) ?? '—'}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{min_?.toFixed(4) ?? '—'}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{max_?.toFixed(4) ?? '—'}</td>
                              <td className="py-2 pl-3 text-right font-mono text-slate-500">{nzPct.toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* ════════════════ ANALYSIS TAB ════════════════ */}
            {activeTab === 'analysis' && (
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
                            {truncated && <span className="text-xs text-gray-500">Top {LOC_CHART_LIMIT} of {allEntries.length} locations</span>}
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

            {/* ════════════════ SPORES TAB ════════════════ */}
            {activeTab === 'spores' && (isSporesRun || hasSpores) && !hasSpores && (
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-start gap-3">
                  <FiAlertTriangle className="text-gray-500 mt-0.5 shrink-0" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-1">SPORES data not available in this result</p>
                    <p className="text-xs text-gray-700 mb-2">
                      The run completed in SPORES mode, but the per-SPORE breakdown was not extracted. This usually means the backend encountered an error during SPORES result processing.
                    </p>
                    <p className="text-xs text-gray-600">
                      Check the <strong>Logs</strong> tab for <code>[SPORES]</code> messages or any Python traceback.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'spores' && hasSpores && (() => {
              const sporesData = result.spores_data;
              const optimalCost = sporesData[0]?.cost ?? null;

              // ── Collect unique generation/storage techs only ──
              const allTechSet = new Set();
              sporesData.forEach(spore => {
                Object.keys(spore.capacities || {}).forEach(loctech => {
                  const parts = loctech.split('::');
                  const tech = parts.length >= 2 ? parts[1] : loctech;
                  if (isGenTech(tech)) allTechSet.add(tech);
                });
              });
              const allTechs = [...allTechSet].sort();

              // Per-SPORE total capacity by tech (summed over all locations)
              const sporeCapByTech = sporesData.map(spore => {
                const byTech = {};
                allTechs.forEach(t => { byTech[t] = 0; });
                Object.entries(spore.capacities || {}).forEach(([loctech, cap]) => {
                  const parts = loctech.split('::');
                  const tech = parts.length >= 2 ? parts[1] : loctech;
                  if (Object.prototype.hasOwnProperty.call(byTech, tech)) {
                    byTech[tech] += Number(cap) || 0;
                  }
                });
                return byTech;
              });

              // Techs with non-trivial capacity in at least one SPORE
              const activeTechs = allTechs.filter(t =>
                sporeCapByTech.some(s => s[t] > 0.1)
              );

              // Per-tech array of totals across SPORES
              const techTotals = {};
              activeTechs.forEach(t => {
                techTotals[t] = sporeCapByTech.map(s => s[t]);
              });

              const sporeLabels = sporesData.map(s => s.spore_id === 0 ? 'Optimal' : `S${s.spore_id}`);

              // ── Fig 1: Stacked bar + cost line (Lombardi Fig 1) ──
              const allTotals = sporesData.map((_, i) =>
                activeTechs.reduce((sum, t) => sum + sporeCapByTech[i][t], 0)
              );
              const { div: capDiv, unit: capUnit } = autoScale(Math.max(...allTotals, 1), 'MW');
              const costs = sporesData.map(s => s.cost);
              const { div: costDiv, unit: costUnit } = autoScale(Math.max(...costs.map(Math.abs), 1), '€');

              const stackedBarOption = {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 } },
                grid: { top: 20, right: 80, bottom: 70, left: 70 },
                xAxis: { type: 'category', data: sporeLabels, axisLabel: { fontSize: 11 } },
                yAxis: [
                  { type: 'value', ...axisNameStyle(capUnit) },
                  { type: 'value', ...axisNameStyle(costUnit), splitLine: { show: false } },
                ],
                series: [
                  ...activeTechs.map(tech => ({
                    name: tech.replace(/_/g, ' '),
                    type: 'bar',
                    stack: 'total',
                    yAxisIndex: 0,
                    data: sporeCapByTech.map(s => +(s[tech] / capDiv).toFixed(2)),
                    itemStyle: { color: techColor(tech) },
                    emphasis: { focus: 'series' },
                  })),
                  {
                    name: 'System cost',
                    type: 'line',
                    yAxisIndex: 1,
                    data: costs.map(c => +(c / costDiv).toFixed(3)),
                    symbol: 'circle', symbolSize: 6,
                    lineStyle: { color: '#F59E0B', width: 2 },
                    itemStyle: { color: '#F59E0B' },
                    zlevel: 10,
                  },
                ],
              };

              // ── Fig 2: Variability strip/dot chart (Lombardi Fig 2) ──
              // Each tech = one horizontal row; each SPORE = one dot at its capacity value.
              const allStripVals = activeTechs.flatMap(t => techTotals[t]);
              const { div: stripDiv, unit: stripUnit } = autoScale(Math.max(...allStripVals, 1), 'MW');
              // Scatter data: [x=capacity, y=tech-index, label=spore_id]
              const stripScatterData = [];
              activeTechs.forEach((tech, row) => {
                techTotals[tech].forEach((cap, sporeIdx) => {
                  stripScatterData.push({
                    value: [+(cap / stripDiv).toFixed(3), row],
                    sporeLabel: sporeLabels[sporeIdx],
                    itemStyle: { color: techColor(tech) },
                  });
                });
              });
              const stripOption = {
                backgroundColor: 'transparent',
                tooltip: {
                  trigger: 'item',
                  formatter: p => `<b>${activeTechs[p.data.value[1]]?.replace(/_/g, ' ')}</b><br/>${p.data.sporeLabel}: ${p.data.value[0]} ${stripUnit}`,
                },
                grid: { top: 10, right: 20, bottom: 40, left: 110 },
                xAxis: { type: 'value', ...axisNameStyle(stripUnit), min: 0 },
                yAxis: {
                  type: 'category',
                  data: activeTechs.map(t => t.replace(/_/g, ' ')),
                  axisLabel: { fontSize: 10 },
                  inverse: true,
                },
                series: [{
                  type: 'scatter',
                  symbolSize: 8,
                  data: stripScatterData,
                }],
              };

              // ── Fig 3: Pairwise trade-off scatter (Lombardi Fig 3) ──
              const scatterTechA = (sporeScatterA && activeTechs.includes(sporeScatterA)) ? sporeScatterA : activeTechs[0];
              const scatterTechB = (sporeScatterB && activeTechs.includes(sporeScatterB) && sporeScatterB !== scatterTechA)
                ? sporeScatterB
                : activeTechs.find(t => t !== scatterTechA) || activeTechs[0];
              const { div: scaDivA, unit: scaUnitA } = autoScale(Math.max(...(techTotals[scatterTechA] || [0]), 1), 'MW');
              const { div: scaDivB, unit: scaUnitB } = autoScale(Math.max(...(techTotals[scatterTechB] || [0]), 1), 'MW');
              const pairScatterData = sporesData.map((spore, i) => ({
                value: [
                  +((sporeCapByTech[i][scatterTechA] || 0) / scaDivA).toFixed(3),
                  +((sporeCapByTech[i][scatterTechB] || 0) / scaDivB).toFixed(3),
                ],
                label: sporeLabels[i],
              }));
              const pairScatterOption = {
                backgroundColor: 'transparent',
                tooltip: {
                  trigger: 'item',
                  formatter: p => `<b>${p.data.label}</b><br/>${scatterTechA.replace(/_/g,' ')}: ${p.data.value[0]} ${scaUnitA}<br/>${scatterTechB.replace(/_/g,' ')}: ${p.data.value[1]} ${scaUnitB}`,
                },
                grid: { top: 20, right: 20, bottom: 50, left: 70 },
                xAxis: { type: 'value', name: `${scatterTechA.replace(/_/g,' ')} (${scaUnitA})`, nameLocation: 'middle', nameGap: 30, nameTextStyle: { fontSize: 10, color: '#64748b' } },
                yAxis: { type: 'value', name: `${scatterTechB.replace(/_/g,' ')} (${scaUnitB})`, nameLocation: 'middle', nameGap: 45, nameTextStyle: { fontSize: 10, color: '#64748b' } },
                series: [{
                  type: 'scatter',
                  symbolSize: 10,
                  data: pairScatterData,
                  itemStyle: { color: '#3B82F6', opacity: 0.8 },
                  label: { show: sporesData.length <= 20, formatter: p => p.data.label, position: 'right', fontSize: 9, color: '#64748b' },
                  emphasis: { label: { show: true } },
                }],
              };

              // ── Fig 4: Parallel coordinates (Lombardi Fig 4) ──
              // Each axis = one technology, each line = one SPORE.
              // Limit to ≤12 techs (most active by max capacity) for readability.
              const parallelTechs = [...activeTechs]
                .sort((a, b) => Math.max(...techTotals[b]) - Math.max(...techTotals[a]))
                .slice(0, 12);
              const parallelDims = parallelTechs.map((tech, i) => {
                const vals = techTotals[tech];
                const { div: pd, unit: pu } = autoScale(Math.max(...vals, 1), 'MW');
                return { dim: i, name: tech.replace(/_/g, ' ') + ` (${pu})`, min: 0, max: +(Math.max(...vals) / pd * 1.05).toFixed(2), _div: pd };
              });
              const parallelData = sporesData.map((spore, sIdx) =>
                parallelTechs.map((tech, tIdx) =>
                  +((sporeCapByTech[sIdx][tech] || 0) / parallelDims[tIdx]._div).toFixed(3)
                )
              );
              const parallelOption = {
                backgroundColor: 'transparent',
                tooltip: {
                  trigger: 'item',
                  formatter: p => {
                    if (!Array.isArray(p.data)) return '';
                    return `<b>${sporeLabels[p.dataIndex]}</b><br/>` +
                      parallelTechs.map((t, i) => `${t.replace(/_/g,' ')}: ${p.data[i]}`).join('<br/>');
                  },
                },
                parallelAxis: parallelDims.map(d => ({
                  dim: d.dim, name: d.name, min: d.min, max: d.max,
                  nameTextStyle: { fontSize: 9, color: '#475569' },
                  axisLabel: { fontSize: 8 },
                })),
                parallel: { top: 40, right: 30, bottom: 30, left: 30 },
                series: [{
                  type: 'parallel',
                  lineStyle: { width: 1.5, opacity: 0.7 },
                  data: parallelData.map((d, i) => ({
                    value: d,
                    lineStyle: { color: sporesData[i].spore_id === 0 ? '#F59E0B' : '#3B82F6', opacity: sporesData[i].spore_id === 0 ? 1 : 0.55 },
                  })),
                }],
              };

              // ── Classification table ──
              const techRows = activeTechs.map(tech => {
                const vals = techTotals[tech];
                const sorted = [...vals].sort((a, b) => a - b);
                const min = sorted[0];
                const max = sorted[sorted.length - 1];
                const nonZero = vals.filter(v => v > 0.1).length;
                const role = min > 0.1 ? 'Must-have'
                  : nonZero >= Math.ceil(vals.length * 0.7) ? 'Preferred'
                  : 'Real choice';
                return { tech, min, max, role, nonZero, total: vals.length };
              }).sort((a, b) => b.max - a.max);

              const roleChip = role => ({
                'Must-have':  'bg-gray-200 text-gray-700',
                'Preferred':  'bg-gray-100 text-gray-600',
                'Real choice':'bg-gray-50 text-gray-500',
              }[role] || 'bg-slate-100 text-slate-600');

              // ── Fig 5: Per-SPORE map data ──
              const safeSpore = Math.min(selectedSpore, sporesData.length - 1);
              const sporeForMap = sporesData[safeSpore] || sporesData[0];
              // Build capacitiesByLoc and dominantTechByLoc from selected SPORE
              const sporeCapsByLoc = {};
              const sporeDomByLoc = {};
              Object.entries(sporeForMap.capacities || {}).forEach(([loctech, cap]) => {
                const parts = loctech.split('::');
                const loc = parts[0]; const tech = parts.length >= 2 ? parts[1] : '';
                if (!isGenTech(tech) || !(Number(cap) > 0)) return;
                sporeCapsByLoc[loc] = (sporeCapsByLoc[loc] || 0) + Number(cap);
                if (!sporeDomByLoc[loc] || (techTotals[tech]?.[safeSpore] || 0) > (techTotals[sporeDomByLoc[loc]]?.[safeSpore] || 0)) {
                  sporeDomByLoc[loc] = tech;
                }
              });

              // ── Per-location Spearman correlation matrix ─────────────────
              const rankArr = arr => {
                const idx = [...arr].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
                const ranks = new Array(arr.length);
                idx.forEach(([, origI], rank) => { ranks[origI] = rank + 1; });
                return ranks;
              };
              const spearman = (a, b) => {
                if (a.length < 3) return NaN;
                const ra = rankArr(a), rb = rankArr(b), n = a.length;
                const d2 = ra.reduce((sum, _, i) => sum + (ra[i] - rb[i]) ** 2, 0);
                return 1 - (6 * d2) / (n * (n * n - 1));
              };

              // Build per-(loc, tech) capacity series across all SPORES
              const ltSeriesMap = {};
              sporesData.forEach((spore, si) => {
                Object.entries(spore.capacities || {}).forEach(([key, val]) => {
                  const parts = key.split('::');
                  if (parts.length < 2) return;
                  const [sloc, stech] = [parts[0], parts[1]];
                  if (!isGenTech(stech)) return;
                  if (!ltSeriesMap[key]) ltSeriesMap[key] = new Array(sporesData.length).fill(0);
                  ltSeriesMap[key][si] = Number(val) || 0;
                });
              });

              // Collect unique locations in model definition order
              const sporesLocs = [...new Set(Object.keys(ltSeriesMap).map(k => k.split('::')[0]))];
              const mLocOrder = modelLocations.map(l => l.calliopeName || l.name);
              sporesLocs.sort((a, b) => {
                const ia = mLocOrder.indexOf(a), ib = mLocOrder.indexOf(b);
                return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib) || a.localeCompare(b);
              });

              // Atoms: (loc, tech) pairs present and non-trivial in at least one SPORE
              const ltAtoms = [];
              sporesLocs.forEach(loc => {
                activeTechs.forEach(tech => {
                  const series = ltSeriesMap[`${loc}::${tech}`];
                  if (series && series.some(v => v > 0.01)) {
                    ltAtoms.push({ loc, tech, key: `${loc}::${tech}`, series });
                  }
                });
              });

              // Groups: one per location with its atoms
              const ltGroups = sporesLocs.map(loc => ({
                loc,
                displayName: modelLocations.find(l => (l.calliopeName || l.name) === loc)?.name || loc.replace(/_/g, ' '),
                atoms: ltAtoms.filter(a => a.loc === loc),
              })).filter(g => g.atoms.length > 0);

              // Compute Spearman ρ for all atom pairs (upper triangle → mirrored)
              const ltCorrMap = {};
              for (let i = 0; i < ltAtoms.length; i++) {
                for (let j = i + 1; j < ltAtoms.length; j++) {
                  const rho = spearman(ltAtoms[i].series, ltAtoms[j].series);
                  if (!isNaN(rho)) {
                    ltCorrMap[`${ltAtoms[i].key}:::${ltAtoms[j].key}`] = rho;
                    ltCorrMap[`${ltAtoms[j].key}:::${ltAtoms[i].key}`] = rho;
                  }
                }
              }

              // Apply location filter — empty Set = nothing selected yet
              const visLtGroups = corrLocFilter.size > 0
                ? ltGroups.filter(g => corrLocFilter.has(g.loc))
                : [];

              return (
                <div className="space-y-4">

                  {/* Banner */}
                  <div className="bg-gradient-to-r from-electric-50 to-gray-50 border border-electric-200 rounded-2xl p-4 flex items-start gap-3">
                    <FiGitMerge className="text-electric-500 mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="text-sm font-semibold text-electric-700">{sporesData.length} near-optimal solutions explored</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        SPORE 0 is the cost-optimal reference. SPORES 1–{sporesData.length - 1} are spatially diverse alternatives within the cost slack budget. Lombardi et al. (Joule 2020).
                      </p>
                    </div>
                  </div>

                  {/* Cost summary table */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <FiDollarSign size={14} /> Cost Summary
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Solution</th>
                            <th className="text-right py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total cost</th>
                            <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">% above optimal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {sporesData.map(s => {
                            const pct = optimalCost && s.spore_id > 0
                              ? ((s.cost - optimalCost) / Math.abs(optimalCost) * 100).toFixed(1)
                              : null;
                            return (
                              <tr key={s.spore_id} className={s.spore_id === 0 ? 'bg-electric-50/60' : 'hover:bg-slate-50/60'}>
                                <td className="py-2 pr-4 font-mono text-slate-700">
                                  <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${s.spore_id === 0 ? 'bg-electric-500' : 'bg-slate-300'}`} />
                                  {s.spore_id === 0 ? '0 — cost-optimal' : `SPORE ${s.spore_id}`}
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums">{fmtCost(s.cost)}</td>
                                <td className="py-2 text-right tabular-nums">
                                  {pct != null
                                    ? <span className="text-gray-600">+{pct}%</span>
                                    : <span className="text-slate-400">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Fig 1 — Technology mix + cost line */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiBarChart2 size={14} /> Fig 1 — Technology Mix &amp; System Cost per Solution
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Stacked bars: total installed capacity by technology. Amber line: system cost (right axis). All solutions lie within the cost slack of the optimum.
                    </p>
                    <ReactECharts option={stackedBarOption} style={{ height: 380 }} />
                  </div>

                  {/* Fig 2 — Technology variability strip chart */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiActivity size={14} /> Fig 2 — Technology Deployment Variability
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      Each dot is one solution. Technologies clustered far from zero are <span className="font-medium text-gray-700">must-haves</span>; those scattered down to zero are <span className="font-medium text-gray-500">real choices</span>.
                    </p>
                    <ReactECharts option={stripOption} style={{ height: Math.max(260, activeTechs.length * 30 + 60) }} />
                  </div>

                  {/* Fig 3 — Pairwise trade-off scatter */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiShare2 size={14} /> Fig 3 — Pairwise Technology Trade-off
                    </h3>
                    <p className="text-xs text-slate-400 mb-2">
                      Each dot = one solution. <span className="font-medium text-gray-700">Negative slope</span> = substitutes. <span className="font-medium text-gray-500">Positive slope</span> = complements.
                    </p>
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-1">X-axis technology</label>
                        <select
                          value={scatterTechA}
                          onChange={e => setSporeScatterA(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                        >
                          {activeTechs.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-1">Y-axis technology</label>
                        <select
                          value={scatterTechB}
                          onChange={e => setSporeScatterB(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                        >
                          {activeTechs.filter(t => t !== scatterTechA).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                    </div>
                    <ReactECharts option={pairScatterOption} style={{ height: 320 }} />
                  </div>

                  {/* Fig 4 — Parallel coordinates */}
                  {activeTechs.length >= 2 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                        <FiFilter size={14} /> Fig 4 — Near-Optimal Space (Parallel Coordinates)
                      </h3>
                      <p className="text-xs text-slate-400 mb-3">
                        Each line = one solution. <span className="font-medium text-gray-700">Bold</span> = cost-optimal (SPORE 0). Gray lines = near-optimal alternatives.
                        {parallelTechs.length < activeTechs.length && ` Showing top ${parallelTechs.length} technologies by maximum capacity.`}
                      </p>
                      <ReactECharts option={parallelOption} style={{ height: 320 }} />
                    </div>
                  )}

                  {/* Fig 5 — Per-SPORE geographic map */}
                  {modelLocations && modelLocations.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <FiMap size={14} /> Fig 5 — Geographic Capacity Distribution per Solution
                      </h3>
                      <div className="flex items-center gap-3 mb-3">
                        <label className="text-xs text-slate-500 shrink-0">Solution:</label>
                        <select
                          value={safeSpore}
                          onChange={e => setSelectedSpore(+e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
                        >
                          {sporesData.map(s => (
                            <option key={s.spore_id} value={s.spore_id}>
                              {s.spore_id === 0 ? '0 — Cost-optimal' : `SPORE ${s.spore_id}`}
                              {s.cost != null ? ` · ${fmtCost(s.cost)}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <ResultsMap
                        key={safeSpore}
                        locations={modelLocations}
                        capacitiesByLoc={sporeCapsByLoc}
                        dominantTechByLoc={sporeDomByLoc}
                        generationByLoc={{}}
                        viewMode="capacity"
                        colorFn={techColor}
                        transmissionLinks={[]}
                      />
                    </div>
                  )}

                  {/* Technology Deployment Correlation — grouped location×tech matrix */}
                  {ltAtoms.length >= 3 && sporesData.length >= 3 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                      <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                        <FiGrid size={14} /> Technology Deployment Correlation
                      </h3>
                      <p className="text-xs text-slate-400 mb-3">
                        Spearman ρ of capacity utilisation across all {sporesData.length} SPORES, grouped by region.{' '}
                        <span className="font-medium text-gray-800">Dark (+1)</span> = deployed together.{' '}
                        <span className="font-medium text-gray-400">Light (−1)</span> = substitutes.{' '}
                        Square size ∝ |ρ|. Self-correlation not shown. Hover for values.
                      </p>

                      {/* Region selector — click to add/remove from the matrix */}
                      {ltGroups.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="text-xs text-slate-400 shrink-0">Select regions:</span>
                          {ltGroups.map(g => {
                            const selected = corrLocFilter.has(g.loc);
                            return (
                              <button key={g.loc}
                                onClick={() => {
                                  const next = new Set(corrLocFilter);
                                  if (next.has(g.loc)) next.delete(g.loc); else next.add(g.loc);
                                  setCorrLocFilter(next);
                                }}
                                style={{
                                  fontSize: 11, padding: '2px 9px', borderRadius: 5, border: 'none',
                                  cursor: 'pointer', fontFamily: "'DM Sans', system-ui", fontWeight: 600,
                                  background: selected ? '#1e293b' : '#f1f5f9',
                                  color: selected ? '#fff' : '#94a3b8',
                                  transition: 'background 0.12s, color 0.12s',
                                }}>
                                {g.displayName}
                              </button>
                            );
                          })}
                          {corrLocFilter.size > 0 && corrLocFilter.size < ltGroups.length && (
                            <button onClick={() => setCorrLocFilter(new Set(ltGroups.map(g => g.loc)))}
                              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5,
                                       border: '1px solid #e2e8f0', cursor: 'pointer',
                                       background: 'white', color: '#64748b', fontFamily: "'DM Sans', system-ui" }}>
                              Select all
                            </button>
                          )}
                          {corrLocFilter.size > 0 && (
                            <button onClick={() => setCorrLocFilter(new Set())}
                              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5,
                                       border: '1px solid #e2e8f0', cursor: 'pointer',
                                       background: 'white', color: '#64748b', fontFamily: "'DM Sans', system-ui" }}>
                              Clear
                            </button>
                          )}
                        </div>
                      )}

                      {visLtGroups.length >= 1
                        ? <GroupedCorrMatrixSVG ltGroups={visLtGroups} ltCorrMap={ltCorrMap} />
                        : <p className="text-xs text-slate-400 py-6 text-center">
                            Select one or more regions above to display their correlation matrix.
                          </p>
                      }
                    </div>
                  )}

                  {/* Classification table */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <FiLayers size={14} /> Technology Classification
                    </h3>
                    <p className="text-xs text-slate-400 mb-3">
                      <span className="font-medium text-gray-800">Must-have</span> = present in every solution.{' '}
                      <span className="font-medium text-gray-600">Preferred</span> = present in ≥70% of solutions.{' '}
                      <span className="font-medium text-gray-400">Real choice</span> = absent in at least one solution.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Technology</th>
                            <th className="text-right py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Min</th>
                            <th className="text-right py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Max</th>
                            <th className="text-right py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Present in</th>
                            <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {techRows.map(({ tech, min, max, role, nonZero, total }) => (
                            <tr key={tech} className="hover:bg-slate-50/60">
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: techColor(tech) }} />
                                  <span className="text-slate-700">{tech.replace(/_/g, ' ')}</span>
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{fmtPower(min)}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{fmtPower(max)}</td>
                              <td className="py-2 pr-4 text-right tabular-nums text-slate-400 text-xs">{nonZero}/{total}</td>
                              <td className="py-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleChip(role)}`}>{role}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* ════════════════ LOGS TAB ════════════════ */}
            {activeTab === 'logs' && (
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
