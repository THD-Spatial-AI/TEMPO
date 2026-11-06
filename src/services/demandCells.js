// src/services/demandCells.js
/**
 * demandCells.js
 * --------------
 * The substation demand cells (Voronoi areas from the demand service /estimate),
 * saved with the model as `model.demandCells` and drawn as a map layer.
 */

// YlOrRd, light → dark.
export const DEMAND_RAMP = [[255, 255, 178], [254, 204, 92], [253, 141, 60], [240, 59, 32], [189, 0, 38]];

/**
 * Estimate cells → saved model cells: keyed by the model location NAME (saved models
 * identify locations by name; ids are draft-only), carrying the user's edited numbers
 * (byId, keyed by OSM id). Cells of substations that did not become demand locations,
 * or with no geometry, are dropped. null if none remain. `locations` = [{ osmId, name }].
 */
export function cellsForModel({ cells, byId, locations, meta, now = () => new Date().toISOString() }) {
  const locByOsm = new Map((locations || []).map(l => [l.osmId, l]));
  const features = [];
  for (const f of cells?.features || []) {
    const osmId = f.properties?.locationId;
    const loc = locByOsm.get(osmId);
    const est = byId?.[osmId];
    if (!f.geometry || !loc || !est) continue;
    const areaKm2 = Number(f.properties.areaKm2) || 0;
    features.push({
      type: 'Feature', geometry: f.geometry,
      properties: {
        ...f.properties, locationId: loc.name, osmId, name: loc.name,
        annualGWh: est.annualGWh, avgMW: est.avgMW, mix: est.mix,
        densityGWhKm2: areaKm2 > 0 ? Number((est.annualGWh / areaKm2).toFixed(6)) : 0,
      },
    });
  }
  if (!features.length) return null;
  const totalGWh = Number(features.reduce((s, f) => s + f.properties.annualGWh, 0).toFixed(6));
  return { type: 'FeatureCollection', features, meta: { createdAt: now(), ...meta, totalGWh } };
}

/** The coloured quantity: 'density' (GWh/km²) or 'total' (GWh/yr). */
export function cellValue(f, colorBy) {
  const p = f?.properties || {};
  return Number(colorBy === 'total' ? p.annualGWh : p.densityGWhKm2) || 0;
}

/** Colour-scale maximum: the 95th percentile of the values (1 when empty). */
export function cellScale(features, colorBy) {
  const v = (features || []).map(f => cellValue(f, colorBy)).sort((a, b) => a - b);
  if (!v.length) return 1;
  return v[Math.max(0, Math.ceil(0.95 * v.length) - 1)] || 1;
}

/** [r, g, b, a] for a value on a 0…max ramp (linear between the 5 stops). */
export function cellColor(value, max) {
  if (!(value > 0)) return [...DEMAND_RAMP[0], 40];
  const t = Math.min(1, value / (max || 1)) * (DEMAND_RAMP.length - 1);
  const i = Math.min(DEMAND_RAMP.length - 2, Math.floor(t));
  const k = t - i;
  const c = DEMAND_RAMP[i].map((a, j) => Math.round(a + (DEMAND_RAMP[i + 1][j] - a) * k));
  return [...c, 150];
}

/**
 * Cells whose location left the model or lost its power_demand tech. A location
 * matches a cell by OSM id (`metadata.osmId`, survives renames) or by name.
 * `liveIds` holds the matched cells' `locationId`s.
 */
export function staleCells(cells, locations) {
  const withDemand = (locations || []).filter(l => l.techs?.power_demand);
  const names = new Set(withDemand.map(l => l.name));
  const osmIds = new Set(withDemand.map(l => l.metadata?.osmId).filter(v => v != null));
  const missing = [];
  const liveIds = new Set();
  for (const f of cells?.features || []) {
    const id = f.properties?.locationId;
    const osmId = f.properties?.osmId;
    if (names.has(id) || (osmId != null && osmIds.has(osmId))) liveIds.add(id);
    else missing.push(f.properties?.name || String(id));
  }
  return { stale: missing.length > 0, missing, liveIds };
}
