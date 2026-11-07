// src/services/substationDemand.js
/**
 * substationDemand.js
 * -------------------
 * Pure helpers for the Study Area substation-demand estimate (demand service
 * /estimate + /shape). The estimate is keyed by the OSM feature id because plan
 * location ids are regenerated on every preview rebuild.
 */
import { shapeDemand } from './demandServiceClient';
import { syntheticShape } from './demandlibClient';
import { safeColId } from './demandProfiles';

const HOURS_PER_YEAR = 8760;
const round6 = v => Number(Number(v).toFixed(6));

/** Stable id of an OSM substation feature. */
export function substationKey(f, i) {
  const p = f?.properties || {};
  const id = f?.id ?? p['@id'] ?? p.osm_id;
  return id != null && id !== '' ? String(id) : `idx_${i}`;
}

/** /estimate body. Boundary features without a countryCode get `country`. */
export function estimatePayload({ boundary, substations, modelYear, country, family, landuse = false, largeConsumers = true, overrideGwh }) {
  const code = country ? String(country).toUpperCase() : null;
  const area = {
    type: 'FeatureCollection',
    features: (boundary?.features || []).map(f => ({
      ...f, properties: { ...(f.properties || {}), countryCode: f.properties?.countryCode || code },
    })),
  };
  const body = { area, substations, modelYear, country: code, family, landuse: !!landuse, largeConsumers: !!largeConsumers };
  const o = Number(overrideGwh);
  if (overrideGwh !== null && overrideGwh !== undefined && overrideGwh !== '' && Number.isFinite(o)) body.overrideGwh = o;
  return body;
}

/** Seed rows of an estimate with the user's edits ({id: {gwh?, mix?}}) applied. */
export function applyDemandEdits(estimate, edits = {}) {
  return (estimate?.substations || []).filter(s => s.seed).map(s => {
    const e = edits[s.id] || {};
    const gwh = e.gwh != null ? Number(e.gwh) : s.annual_gwh;
    return {
      ...s,
      annual_gwh: round6(gwh),
      avg_mw: round6((gwh * 1000) / HOURS_PER_YEAR),
      mix: e.mix || s.mix,
      edited: e.gwh != null || !!e.mix,
      mixEdited: !!e.mix,
    };
  });
}

/** Edits that rescale every seed so the area total becomes `total` GWh. */
export function scaleEditsToTotal(estimate, edits, total) {
  const rows = applyDemandEdits(estimate, edits);
  const cur = rows.reduce((s, r) => s + r.annual_gwh, 0);
  const next = { ...edits };
  rows.forEach(r => {
    const gwh = cur > 0 ? (r.annual_gwh * Number(total)) / cur : Number(total) / rows.length;
    next[r.id] = { ...(next[r.id] || {}), gwh: round6(gwh) };
  });
  return next;
}

/** {osmId: {avgMW, annualGWh, mix}} for buildStudyAreaPlan; zero rows are dropped. */
export function demandByOsmId(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.avg_mw > 0) out[r.id] = { avgMW: r.avg_mw, annualGWh: r.annual_gwh, mix: r.mix };
  }
  return out;
}

/** One ABSOLUTE (negative MW) column per substation from per-substation series. */
export function seriesColumns({ datetimes, series, subs }) {
  const used = new Set();
  const cols = (subs || []).map((s, i) => {
    const base = safeColId(s.name) || `sub_${i + 1}`;
    let col = base;
    let k = 2;
    while (used.has(col.toLowerCase())) { col = `${base}_${k}`; k += 1; }
    used.add(col.toLowerCase());
    return { col, key: s.key };
  });
  const data = (datetimes || []).map((dt, t) => ({
    datetime: dt,
    ...Object.fromEntries(cols.map(c => [c.col, Number((-(series[c.key]?.[t] || 0)).toFixed(4))])),
  }));
  const dataColumns = cols.map(c => c.col);
  return { columns: ['datetime', ...dataColumns], dataColumns, data, colBySub: dataColumns };
}

/**
 * Per-substation MW series: the demand service's /shape, else a synthetic shape
 * per unique mix (scaled by avg MW). Returns {datetimes, series, peak_mw, source}.
 */
export async function shapeWithFallback({ substations, start, end, resolution, country, family, latitude = 0 }) {
  const svc = await shapeDemand({ substations, start, end, resolution, country, family, latitude });
  if (svc?.series) return { ...svc, source: 'demandlib' };

  const byMix = new Map();
  let datetimes = null;
  const series = {};
  for (const s of substations) {
    const mix = s.mix && Object.keys(s.mix).length ? s.mix : null;
    if (!mix || !(s.avg_mw > 0)) continue;
    const key = JSON.stringify(Object.entries(mix).sort());
    if (!byMix.has(key)) byMix.set(key, syntheticShape({ start, end, resolution, sectors: mix, latitude }));
    const shape = byMix.get(key);
    datetimes = datetimes || shape.datetimes;
    series[s.id] = shape.values.map(v => Number((v * s.avg_mw).toFixed(4)));
  }
  if (!datetimes) datetimes = syntheticShape({ start, end, resolution, sectors: { flat: 1 }, latitude }).datetimes;
  const peak_mw = {};
  for (const s of substations) {
    series[s.id] = series[s.id] || new Array(datetimes.length).fill(0);
    peak_mw[s.id] = Math.max(0, ...series[s.id]);
  }
  return { datetimes, series, peak_mw, source: 'synthetic' };
}
