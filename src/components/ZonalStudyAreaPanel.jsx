import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FiMapPin, FiPlus, FiX, FiSearch, FiLayers, FiLoader, FiCheck, FiDownload, FiChevronDown,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { searchPlaces, fetchGeometries } from '../services/nominatim';

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

      {/* Layers & categories — dropdown per parameter; drives display + import */}
      {units.length > 0 && !osmLoading && !boundaryLoading && (
        <div className="rounded-lg border border-slate-200 px-3 py-2.5 space-y-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Layers &amp; categories</span>
          <div className="space-y-1.5">
            <CategoryDropdown
              label="Transmission lines" color="#f59e0b"
              options={levels.map(kv => ({ value: kv, label: `${kv} kV` }))}
              selected={selectedLevels}
              onToggle={toggleLevel} onSetAll={setAllLevels}
            />
            <CategoryDropdown
              label="Substations" color="#ef4444"
              options={subTypes.map(t => ({ value: t, label: cap(t) }))}
              selected={substationFilters?.selectedTypes || []}
              onToggle={toggleSubType} onSetAll={setAllSubTypes}
            />
            <CategoryDropdown
              label="Power plants" color="#22c55e"
              options={plantSources.map(s => ({ value: s, label: cap(s) }))}
              selected={powerPlantFilters?.selectedSources || []}
              onToggle={togglePlantSource} onSetAll={setAllPlantSources}
            />
          </div>
          <button
            onClick={() => window.importStudyArea?.({
              plants: (powerPlantFilters?.selectedSources || []).length > 0,
              substations: (substationFilters?.selectedTypes || []).length > 0,
              lines: (selectedLevels || []).length > 0,
            })}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors"
          >
            <FiDownload size={14} /> Import study area to model
          </button>
          <p className="text-[10px] text-slate-400">Pick the types per layer. The map &amp; import use your selection.</p>
        </div>
      )}
    </div>
  );
}
