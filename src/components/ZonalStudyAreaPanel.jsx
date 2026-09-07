import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FiMapPin, FiPlus, FiX, FiSearch, FiLayers, FiLoader, FiCheck, FiChevronDown,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { searchPlaces, fetchGeometries } from '../services/nominatim';

// Network-builder wizard steps (order matters — later steps wire into earlier ones).
const WIZARD_STEPS = [
  { key: 'transmission', label: 'Transmission network', color: '#f59e0b' },
  { key: 'substations', label: 'Substations', color: '#ef4444' },
  { key: 'plants', label: 'Power plants', color: '#22c55e' },
];

// Compact multi-select dropdown: a button ("Label · 2/3 ▾") that opens a checklist.
function CategoryDropdown({ label, color, options, selected, onToggle, onSetAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const sel = new Set(selected || []);
  const count = options.filter(o => sel.has(o.value)).length;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50"
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] text-slate-400">{count}/{options.length}</span>
        <FiChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-52 overflow-y-auto">
          {onSetAll && (
            <div className="flex justify-between px-2 pb-1 mb-1 border-b border-slate-100 text-[10px]">
              <button onClick={() => onSetAll(true)} className="text-electric-600 hover:underline">All</button>
              <button onClick={() => onSetAll(false)} className="text-slate-400 hover:underline">None</button>
            </div>
          )}
          {options.length === 0 && <div className="px-3 py-1 text-[11px] text-slate-400">none detected</div>}
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={sel.has(o.value)} onChange={() => onToggle(o.value)} className="w-3.5 h-3.5 rounded accent-electric-600" />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Step title row with an include/skip switch.
function StepHeader({ label, desc, include, onToggle }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <button
          type="button" role="switch" aria-checked={include} onClick={onToggle}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${include ? 'bg-electric-500' : 'bg-slate-300'}`}
          title={include ? 'Included — click to skip' : 'Skipped — click to include'}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${include ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mt-0.5">{include ? desc : 'Skipped — this layer won’t be built.'}</p>
    </div>
  );
}

// "Connect each X to …" dropdown. options = [[value, label], …].
function TargetSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-600 mb-1">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-electric-400"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// One entry in the preview colour legend (a short coloured bar + label).
function LegendItem({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
      <span className="inline-block w-3.5 h-[3px] rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// Optional max-connection-distance input (km). Empty = no limit.
function MaxKmField({ value, onChange }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-600 mb-1">Max connection distance (km)</span>
      <input
        type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
        placeholder="no limit"
        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-electric-400"
      />
    </label>
  );
}

// Union bbox of the selected territories (drives the map view + data fetch).
function unionBbox(units) {
  let out = null;
  for (const u of units) {
    if (!u.bbox) continue;
    out = out ? {
      minLon: Math.min(out.minLon, u.bbox.minLon), minLat: Math.min(out.minLat, u.bbox.minLat),
      maxLon: Math.max(out.maxLon, u.bbox.maxLon), maxLat: Math.max(out.maxLat, u.bbox.maxLat),
    } : { ...u.bbox };
  }
  return out;
}

/**
 * Study Area selector (live). Search any place worldwide via Nominatim, add one
 * or more territories, and the map loads the power grid (transmission voltage)
 * for the selected extent. No bundled index, no PostGIS/seeding — search works
 * with the backend down (direct Nominatim + Overpass calls).
 */
export default function ZonalStudyAreaPanel({
  onRegionSelect, substationFilters, onSubstationFiltersChange, powerPlantFilters, onPowerPlantFiltersChange,
}) {
  const {
    studyArea, setStudyArea,
    osmLoading, osmLoadingStage, osmPowerLines, osmSubstations, osmPowerPlants,
    setStudyBuildConfig, planSummary,
  } = useData();
  const plantCount = osmPowerPlants?.features?.length ?? 0;

  // ── Auto-detected categories per layer ───────────────────────────────────
  // Line voltage levels (kV, desc).
  const levels = useMemo(() => {
    const s = new Set();
    for (const f of osmPowerLines?.features || []) {
      const kv = Math.round(f.properties?.voltage_kv ?? 0);
      if (kv > 0) s.add(kv);
    }
    return [...s].sort((a, b) => b - a);
  }, [osmPowerLines]);
  // Substation grid types present.
  const subTypes = useMemo(() => {
    const s = new Set();
    for (const f of osmSubstations?.features || []) s.add(f.properties?.substation || 'other');
    return [...s].sort();
  }, [osmSubstations]);
  // Plant sources present.
  const plantSources = useMemo(() => {
    const s = new Set();
    for (const f of osmPowerPlants?.features || []) s.add(f.properties?.plant_source || 'unknown');
    return [...s].sort();
  }, [osmPowerPlants]);

  const selectedLevels = studyArea?.voltageLevels ?? levels;

  function toggleLevel(kv) {
    const cur = studyArea?.voltageLevels ?? levels;
    const set = new Set(cur);
    if (set.has(kv)) set.delete(kv); else set.add(kv);
    setStudyArea({ ...(studyArea || { units: [] }), voltageLevels: [...set].sort((a, b) => b - a) });
  }
  function setAllLevels(on) {
    setStudyArea({ ...(studyArea || { units: [] }), voltageLevels: on ? [...levels] : [] });
  }
  function toggleSubType(t) {
    const cur = substationFilters?.selectedTypes || [];
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    onSubstationFiltersChange?.({ ...substationFilters, selectedTypes: next });
  }
  function setAllSubTypes(on) {
    onSubstationFiltersChange?.({ ...substationFilters, selectedTypes: on ? [...subTypes] : [] });
  }
  function togglePlantSource(s) {
    const cur = powerPlantFilters?.selectedSources || [];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
    onPowerPlantFiltersChange?.({ ...powerPlantFilters, selectedSources: next });
  }
  function setAllPlantSources(on) {
    onPowerPlantFiltersChange?.({ ...powerPlantFilters, selectedSources: on ? [...plantSources] : [] });
  }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  // Classification breakdown (from the enriched OSM features).
  const subFeatures = osmSubstations?.features || [];
  const subTransmission = subFeatures.filter(f => f.properties?.substation === 'transmission').length;
  const subDistribution = subFeatures.filter(f => f.properties?.substation === 'distribution').length;
  const plantsWithCap = (osmPowerPlants?.features || []).filter(f => f.properties?.capacity_mw != null).length;
  const plantsUnknownCap = plantCount - plantsWithCap;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const units = studyArea?.units || [];

  // ── Network-builder wizard (stepped; commit at end) ──────────────────────
  const [step, setStep] = useState(0);
  const [txInclude, setTxInclude] = useState(true);
  const [subInclude, setSubInclude] = useState(true);
  // Connections are OPT-IN: default to "don't connect" so nothing is auto-wired.
  const [subTarget, setSubTarget] = useState('none'); // 'transmission' | 'none'
  const [subMaxKm, setSubMaxKm] = useState('');
  const [plantInclude, setPlantInclude] = useState(true);
  const [plantTarget, setPlantTarget] = useState('none'); // 'substation' | 'transmission' | 'none'
  const [plantMaxKm, setPlantMaxKm] = useState('');

  // Only the connection choices live here; the categories (voltages / sub types /
  // plant sources) flow through the dropdown filters, which Creation reads live.
  const wizardConfig = useMemo(() => ({
    transmission: { include: txInclude },
    substations: { include: subInclude, target: subTarget, maxKm: subMaxKm ? Number(subMaxKm) : 0 },
    plants: { include: plantInclude, target: plantTarget, maxKm: plantMaxKm ? Number(plantMaxKm) : 0 },
  }), [txInclude, subInclude, subTarget, subMaxKm, plantInclude, plantTarget, plantMaxKm]);

  const wizardActive = units.length > 0 && !osmLoading && !boundaryLoading;

  // Publish the config to context so Creation rebuilds the live map preview.
  useEffect(() => {
    setStudyBuildConfig(wizardActive ? wizardConfig : null);
  }, [wizardActive, wizardConfig, setStudyBuildConfig]);
  // Clear the preview when leaving the panel.
  useEffect(() => () => setStudyBuildConfig(null), [setStudyBuildConfig]);

  // Default-select the transmission levels (≥110 kV) once the grid loads; the
  // user can toggle any detected level on/off.
  useEffect(() => {
    if (!studyArea || studyArea.voltageLevels != null || !levels.length) return;
    const def = levels.filter(v => v >= 110);
    setStudyArea({ ...studyArea, voltageLevels: def.length ? def : levels });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  // Refresh the map (boundary + grid + neighbour candidates) whenever the set of
  // selected units changes — covers search-add, chip-remove, map-click add, and
  // restoring a saved study area on reopen. Keyed by the unit ids so it only
  // fires on real membership changes, not every render.
  const unitsKey = units.map(u => `${u.osmType}/${u.osmId}`).join(',');
  useEffect(() => {
    refreshMap(units);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitsKey]);

  function onQueryChange(v) {
    setQuery(v);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (v.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        setResults(await searchPlaces(v, { signal: ctrl.signal }));
      } catch (e) {
        if (e.name !== 'AbortError') { setResults([]); setError('Search failed (offline or rate-limited).'); }
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function writeUnits(next) {
    setStudyArea(next.length ? { ...(studyArea || {}), units: next } : null);
  }

  function addUnit(r) {
    if (units.some(u => u.osmId === r.osmId && u.osmType === r.osmType)) return;
    writeUnits([...units, {
      osmId: r.osmId, osmType: r.osmType, name: r.name, displayName: r.displayName,
      level: r.placeRank, adminLevel: r.adminLevel, bbox: r.bbox, centroid: r.centroid, population: r.population,
    }]);
    setQuery(''); setResults([]);
    // map refresh handled by the unitsKey effect
  }

  function removeUnit(u) {
    writeUnits(units.filter(x => !(x.osmId === u.osmId && x.osmType === u.osmType)));
    // map refresh handled by the unitsKey effect
  }


  // Draw the territory boundary (quick, from Nominatim) and set the bbox, which
  // starts the grid fetch. Boundary appears in ~a second; grid data streams after.
  async function refreshMap(unitList) {
    if (!onRegionSelect) return;
    if (!unitList.length) { onRegionSelect({ clear: true }); return; }
    const bbox = unionBbox(unitList);
    if (!bbox) return;
    const center = [(bbox.minLat + bbox.maxLat) / 2, (bbox.minLon + bbox.maxLon) / 2];
    const span = Math.max(bbox.maxLon - bbox.minLon, bbox.maxLat - bbox.minLat) || 1;
    const zoom = Math.max(3, Math.min(11, Math.round(8 - Math.log2(span))));
    let boundary = null;
    setBoundaryLoading(true);
    try {
      const geoms = await fetchGeometries(unitList);
      const features = unitList
        .map(u => {
          const g = geoms[`${u.osmType}/${u.osmId}`];
          return g ? { type: 'Feature', properties: { name: u.name }, geometry: g } : null;
        })
        .filter(Boolean);
      if (features.length) boundary = { type: 'FeatureCollection', features };
    } catch { /* boundary is best-effort */ } finally {
      setBoundaryLoading(false);
    }
    onRegionSelect({ center, zoom, bbox, boundary });
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FiLayers className="text-electric-600" size={16} />
        <h3 className="text-sm font-semibold text-slate-800">Study Area</h3>
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">
        Search a country, region, province or district. The map loads its transmission grid.
      </p>

      {/* Search */}
      <div className="relative">
        {searching
          ? <FiLoader size={13} className="absolute left-2.5 top-2.5 text-slate-400 animate-spin" />
          : <FiSearch size={13} className="absolute left-2.5 top-2.5 text-slate-400" />}
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search any place…  e.g. Niederbayern"
          className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-electric-400 focus:outline-none"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {results.map(r => (
              <button
                key={`${r.osmType}/${r.osmId}`}
                onClick={() => addUnit(r)}
                className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
              >
                <FiPlus size={12} className="mt-1 text-electric-500 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-700 truncate">{r.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{r.displayName}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-amber-600">{error}</p>}

      {/* Chips */}
      {units.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Study area · {units.length}
            </span>
            <button onClick={() => setStudyArea(null)} className="text-[11px] text-slate-400 hover:text-slate-600">Clear all</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {units.map(u => (
              <span key={`${u.osmType}/${u.osmId}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs bg-electric-50 text-electric-700 border border-electric-200 rounded-full">
                <FiMapPin size={10} />
                {u.name}
                <button onClick={() => removeUnit(u)} className="p-0.5 hover:bg-electric-100 rounded-full">
                  <FiX size={11} />
                </button>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-indigo-500 mt-1.5">
            Neighbouring regions are shaded on the map — hover one and click to add it.
          </p>
        </div>
      )}

      {/* Grid load status — shows the pipeline stage while loading, counts when done */}
      {units.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
          {(boundaryLoading || osmLoading) ? (
            <div className="space-y-1.5">
              <div className={`flex items-center gap-1.5 text-[11px] ${boundaryLoading ? 'text-slate-700 font-medium' : 'text-green-600'}`}>
                {boundaryLoading
                  ? <FiLoader size={12} className="animate-spin text-electric-600" />
                  : <FiCheck size={12} />}
                {boundaryLoading ? 'Fetching territory boundary…' : 'Boundary loaded'}
              </div>
              <div className={`flex items-center gap-1.5 text-[11px] ${osmLoading ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                {osmLoading
                  ? <FiLoader size={12} className="animate-spin text-electric-600" />
                  : <span className="w-3 h-3 rounded-full border border-slate-300 inline-block" />}
                {osmLoading ? (osmLoadingStage || 'Loading power grid…') : 'Power grid'}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-sm font-bold text-amber-600">{osmPowerLines?.features?.length ?? 0}</div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">Lines</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-red-600">{osmSubstations?.features?.length ?? 0}</div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">Substations</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-green-600">{plantCount}</div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">Plants</div>
                </div>
              </div>
              {(subFeatures.length > 0 || plantCount > 0) && (
                <div className="text-[10px] text-slate-500 space-y-0.5 border-t border-slate-200 pt-1.5">
                  {subFeatures.length > 0 && (
                    <div>
                      Substations: <span className="text-red-600 font-medium">{subTransmission} transmission</span>
                      {' · '}{subDistribution} distribution
                    </div>
                  )}
                  {plantCount > 0 && (
                    <div>
                      Plants: {plantsWithCap} with capacity
                      {plantsUnknownCap > 0 && <span className="text-amber-600">{' · '}{plantsUnknownCap} unknown ⚠</span>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Network builder — stepped wizard. Each step previews live on the map;
          nothing is committed until "Import all" on the last step. */}
      {wizardActive && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          {/* Step progress (clickable to jump) */}
          <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-b border-slate-200">
            {WIZARD_STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <button
                  onClick={() => setStep(i)}
                  className={`flex items-center gap-1.5 ${i === step ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <span
                    className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: i === step ? s.color : '#e2e8f0', color: i === step ? '#fff' : '#64748b' }}
                  >{i + 1}</span>
                  {i === step && <span className="text-[11px] font-semibold">{s.label}</span>}
                </button>
                {i < WIZARD_STEPS.length - 1 && <span className="text-slate-300 text-xs">›</span>}
              </React.Fragment>
            ))}
          </div>

          <div className="p-3 space-y-2.5">
            {step === 0 && (
              <>
                <StepHeader
                  label="Transmission network"
                  desc="TEMPO meshes the OpenStreetMap power lines into grid nodes + links (unchanged)."
                  include={txInclude} onToggle={() => setTxInclude(v => !v)}
                />
                {txInclude && (
                  <>
                    <CategoryDropdown
                      label="Voltage levels" color="#f59e0b"
                      options={levels.map(kv => ({ value: kv, label: `${kv} kV` }))}
                      selected={selectedLevels} onToggle={toggleLevel} onSetAll={setAllLevels}
                    />
                    <p className="text-[11px] text-slate-500">
                      Preview: <b>{planSummary?.txNodes ?? 0}</b> nodes · <b>{planSummary?.txLinks ?? 0}</b> links
                    </p>
                  </>
                )}
              </>
            )}

            {step === 1 && (
              <>
                <StepHeader
                  label="Substations"
                  desc="Import substations. Optionally wire each to the nearest grid node."
                  include={subInclude} onToggle={() => setSubInclude(v => !v)}
                />
                {subInclude && (
                  <>
                    <CategoryDropdown
                      label="Types" color="#ef4444"
                      options={subTypes.map(t => ({ value: t, label: cap(t) }))}
                      selected={substationFilters?.selectedTypes || []}
                      onToggle={toggleSubType} onSetAll={setAllSubTypes}
                    />
                    <TargetSelect
                      label="Wire each substation to" value={subTarget} onChange={setSubTarget}
                      options={[['none', "Don't connect (import as-is)"], ['transmission', 'Nearest transmission node']]}
                    />
                    {subTarget !== 'none' && <MaxKmField value={subMaxKm} onChange={setSubMaxKm} />}
                    <p className="text-[11px] text-slate-500">
                      Preview: <b>{planSummary?.subNodes ?? 0}</b> substations · <b>{planSummary?.subLinks ?? 0}</b> links
                    </p>
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <StepHeader
                  label="Power plants"
                  desc="Import plants. Optionally wire each to the nearest substation or grid node."
                  include={plantInclude} onToggle={() => setPlantInclude(v => !v)}
                />
                {plantInclude && (
                  <>
                    <CategoryDropdown
                      label="Sources" color="#22c55e"
                      options={plantSources.map(s => ({ value: s, label: cap(s) }))}
                      selected={powerPlantFilters?.selectedSources || []}
                      onToggle={togglePlantSource} onSetAll={setAllPlantSources}
                    />
                    <TargetSelect
                      label="Wire each plant to" value={plantTarget} onChange={setPlantTarget}
                      options={[['none', "Don't connect (import as-is)"], ['substation', 'Nearest substation'], ['transmission', 'Nearest transmission node']]}
                    />
                    {plantTarget !== 'none' && <MaxKmField value={plantMaxKm} onChange={setPlantMaxKm} />}
                    <p className="text-[11px] text-slate-500">
                      Preview: <b>{planSummary?.plantNodes ?? 0}</b> plants · <b>{planSummary?.plantLinks ?? 0}</b> links
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer: Back / Next / Import */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 border-t border-slate-200">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >◂ Back</button>
            {step < WIZARD_STEPS.length - 1 ? (
              <button
                onClick={() => setStep(s => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900"
              >Next ▸</button>
            ) : (
              <button
                onClick={() => { window.commitStudyAreaPlan?.(); setStep(0); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-electric-600 text-white hover:bg-electric-700"
              ><FiCheck size={14} /> Import all</button>
            )}
          </div>
          {/* Colour legend for whatever wiring is currently chosen */}
          <div className="px-3 pt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {txInclude && <LegendItem color="#f59e0b" label="Transmission grid" />}
            {subInclude && subTarget !== 'none' && <LegendItem color="#4f46e5" label="Substation → grid" />}
            {plantInclude && plantTarget === 'substation' && <LegendItem color="#db2777" label="Plant → substation" />}
            {plantInclude && plantTarget === 'transmission' && <LegendItem color="#0d9488" label="Plant → grid" />}
          </div>
          <p className="px-3 pb-2 pt-1 text-[10px] text-slate-400">
            The coloured lines on the map are a live preview of the wiring you chose — nothing is added to the model until you press Import.
          </p>
        </div>
      )}
    </div>
  );
}
