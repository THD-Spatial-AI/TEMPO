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
  techColor, fmtPower, fmtCost,
  TECH_GROUPS, classifyTech,
  linkTechBase, calliopeLocName, parseLTC,
} from '../utils/resultFormat';
import {
  buildCapBarOption, buildGenDonutOption, buildCostsTechOption, buildCostsLocOption,
  buildDispatchOption, buildCapLocOption, buildSankeyOption, buildCfOption, buildCostPerMwhOption,
} from '../utils/resultCharts';

import { ResultsMap, TransmissionFlowMap, GroupedCorrMatrixSVG, RegionChoropleth } from './results/ResultMaps';
import OverviewTab from './results/tabs/OverviewTab';
import FlowTab from './results/tabs/FlowTab';
import DispatchTab from './results/tabs/DispatchTab';
import CostsTab from './results/tabs/CostsTab';
import AnalysisTab from './results/tabs/AnalysisTab';
import LogsTab from './results/tabs/LogsTab';
import SporesTab from './results/tabs/SporesTab';
import ShadowTab from './results/tabs/ShadowTab';

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

    // Tech-mix by location: loc → { tech: MWh } (for pie markers)
    const techMixByLoc = {};
    Object.entries(result.generation || {}).forEach(([k, v]) => {
      const { loc, tech } = parseLTC(k);
      const val = Number(v) || 0;
      if (val > 0 && loc && tech) {
        if (!techMixByLoc[loc]) techMixByLoc[loc] = {};
        techMixByLoc[loc][tech] = (techMixByLoc[loc][tech] || 0) + val;
      }
    });

    const totalGen = Object.values(genByTech).reduce((s, v) => s + v, 0);
    const totalCap = Object.values(capByTech).reduce((s, v) => s + v, 0);

    // Dispatch timestamps → compact labels
    const timestamps = (result.timestamps || []).map(t => {
      const d = new Date(t);
      if (isNaN(d)) return t;
      return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    });

    return { capByTech, txCapByTech, txLinks, capByLoc, domTech, genByTech, genByLoc, techMixByLoc, totalGen, totalCap, timestamps };
  }, [result, isGenTech]);

  // ── Choropleth metrics (for RegionChoropleth) ─────────────────────────────
  const choroMetrics = useMemo(() => {
    if (!result) return null;
    const demand = result.demand_by_location || {};
    const unmet  = result.unmet_demand_by_location || {};
    if (!Object.keys(demand).length) return null;
    const demandMet = {};
    Object.keys(demand).forEach(loc => {
      const d = demand[loc] || 0;
      const u = unmet[loc] || 0;
      if (d > 0) demandMet[loc] = Math.max(0, (d - u) / d * 100);
    });
    return { demand, unmet, demandMet };
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
    const fw = result.framework || 'results';
    a.href = url; a.download = `${fw}_${selectedJobId}.json`; a.click();
    URL.revokeObjectURL(url);
    showNotification('Results exported', 'success');
  };

  // ── ECharts options (built by shared resultCharts.js) ─────────────────────
  const _chartOpts = useMemo(() => ({
    colorFn: techColorFn,
    isVisible: isTechVisible,
    isGenTech,
    isLargeModel,
    locLimit: LOC_CHART_LIMIT,
  }), [techColorFn, isTechVisible, isGenTech, isLargeModel]);

  const capBarOption     = useMemo(() => buildCapBarOption(derivedData, _chartOpts),     [derivedData, techFilter, _chartOpts]);
  const genDonutOption   = useMemo(() => buildGenDonutOption(derivedData, _chartOpts),   [derivedData, techFilter, _chartOpts]);
  const costsTechOption  = useMemo(() => buildCostsTechOption(result, _chartOpts),       [result, techFilter, _chartOpts]);
  const costsLocOption   = useMemo(() => buildCostsLocOption(result, _chartOpts),        [result, isLargeModel, techFilter, _chartOpts]);
  const dispatchOption   = useMemo(() => buildDispatchOption(result, derivedData, _chartOpts), [result, derivedData, techFilter, _chartOpts]);
  const capLocOption     = useMemo(() => buildCapLocOption(result, derivedData, _chartOpts),   [result, derivedData, isLargeModel, techFilter, _chartOpts]);
  const sankeyOption     = useMemo(() => buildSankeyOption(result, _chartOpts),          [result, _chartOpts]);
  const cfHeatmapOption  = useMemo(() => buildCfOption(result, derivedData, _chartOpts), [result, derivedData, isLargeModel, techFilter, _chartOpts]);
  const costPerMwhOption = useMemo(() => buildCostPerMwhOption(result, derivedData, _chartOpts), [result, derivedData, techFilter, _chartOpts]);

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
              <OverviewTab
                capBarOption={capBarOption}
                capLocOption={capLocOption}
                derivedData={derivedData}
                genDonutOption={genDonutOption}
                hasFlow={hasFlow}
                mapView={mapView}
                modelLocations={modelLocations}
                result={result}
                sectionOpen={sectionOpen}
                selectedJobId={selectedJobId}
                setMapView={setMapView}
                techColorFn={techColorFn}
                techMixByLoc={derivedData?.techMixByLoc || {}}
                choroMetrics={choroMetrics}
                RegionChoroplethComponent={RegionChoropleth}
                toggleSection={toggleSection}
                transmissionFlowData={transmissionFlowData}
                transmissionLinks={transmissionLinks}
              />
            )}

            {/* ════════════════ ENERGY FLOW TAB (SANKEY) ════════════════ */}
            {activeTab === 'flow' && (
              <FlowTab
                derivedData={derivedData}
                result={result}
                sankeyOption={sankeyOption}
                sectionOpen={sectionOpen}
                techColorFn={techColorFn}
                toggleSection={toggleSection}
              />
            )}

            {/* ════════════════ DISPATCH TAB ════════════════ */}
            {activeTab === 'dispatch' && (
              <DispatchTab
                dispatchOption={dispatchOption}
                hasDispatch={hasDispatch}
                result={result}
                sectionOpen={sectionOpen}
                techColorFn={techColorFn}
                toggleSection={toggleSection}
              />
            )}

            {/* ════════════════ COSTS TAB ════════════════ */}
            {activeTab === 'costs' && (
              <CostsTab
                LOC_CHART_LIMIT={LOC_CHART_LIMIT}
                costPerMwhOption={costPerMwhOption}
                costsLocOption={costsLocOption}
                costsTechOption={costsTechOption}
                isLargeModel={isLargeModel}
                result={result}
                sectionOpen={sectionOpen}
                toggleSection={toggleSection}
              />
            )}

            {/* ════════════════ SHADOW PRICES TAB ════════════════ */}
            {activeTab === 'shadow' && hasShadowPrices && (
              <ShadowTab
                result={result}
                setShadowPriceKey={setShadowPriceKey}
                shadowPriceKey={shadowPriceKey}
              />
            )}

            {/* ════════════════ ANALYSIS TAB ════════════════ */}
            {activeTab === 'analysis' && (
              <AnalysisTab
                LOC_CHART_LIMIT={LOC_CHART_LIMIT}
                cfHeatmapOption={cfHeatmapOption}
                derivedData={derivedData}
                isLargeModel={isLargeModel}
                result={result}
                sectionOpen={sectionOpen}
                techColorFn={techColorFn}
                toggleSection={toggleSection}
              />
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
            {activeTab === 'spores' && hasSpores && (
              <SporesTab
                corrLocFilter={corrLocFilter}
                isGenTech={isGenTech}
                modelLocations={modelLocations}
                result={result}
                selectedSpore={selectedSpore}
                setCorrLocFilter={setCorrLocFilter}
                setSelectedSpore={setSelectedSpore}
                setSporeScatterA={setSporeScatterA}
                setSporeScatterB={setSporeScatterB}
                sporeScatterA={sporeScatterA}
                sporeScatterB={sporeScatterB}
              />
            )}

            {/* ════════════════ LOGS TAB ════════════════ */}
            {activeTab === 'logs' && (
              <LogsTab
                selectedJob={selectedJob}
              />
            )}

            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Results;
