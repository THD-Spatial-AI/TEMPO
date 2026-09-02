/**
 * nominatim.js
 * ------------
 * Direct (renderer-side) client for OpenStreetMap Nominatim — used by the
 * Study Area selector so it works worldwide with NO bundled index, NO PostGIS
 * seeding, and even when the Go backend is down. Nominatim sends
 * `Access-Control-Allow-Origin: *`, so browser/Electron fetches are allowed.
 *
 * Search returns lightweight admin-area candidates (name + bbox + metadata);
 * the full boundary polygon is fetched lazily by osm id at build time via
 * fetchGeometries(). Keep call volume low (debounce searches) per the Nominatim
 * usage policy.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

function normalize(r) {
  const bb = Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null;
  // Nominatim boundingbox = [south, north, west, east]
  const bbox = bb && bb.length === 4
    ? { minLon: bb[2], minLat: bb[0], maxLon: bb[3], maxLat: bb[1] }
    : null;
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  return {
    osmId: r.osm_id,
    osmType: r.osm_type,                 // 'relation' | 'way' | 'node'
    name: r.name || String(r.display_name || '').split(',')[0] || String(r.osm_id),
    displayName: r.display_name,
    category: r.category,                // e.g. 'boundary', 'place'
    type: r.type,                        // e.g. 'administrative', 'city'
    addresstype: r.addresstype,
    placeRank: r.place_rank ?? null,
    bbox,
    centroid: Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null,
    population: r.extratags && r.extratags.population ? Number(r.extratags.population) : null,
    adminLevel: r.extratags && r.extratags.admin_level ? Number(r.extratags.admin_level) : null,
  };
}

/**
 * Search for administrative areas by free-text. Nodes (points) are dropped —
 * zones need an areal boundary. Returns normalized candidates.
 */
export async function searchPlaces(query, { limit = 8, signal } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    q, format: 'jsonv2', addressdetails: '1', extratags: '1', limit: String(limit),
  });
  const res = await fetch(`${NOMINATIM}/search?${params}`, {
    headers: { Accept: 'application/json' }, signal,
  });
  if (!res.ok) throw new Error(`Nominatim search ${res.status}`);
  const arr = await res.json();
  return arr.map(normalize).filter(u => u.osmType !== 'node');
}

/**
 * Fetch boundary polygons for the given units (by osm id), keyed by
 * `${osm_type}/${osm_id}`. Batches into one Nominatim /lookup call.
 * @param {Array<{osmId, osmType}>} units
 * @returns {Promise<Record<string, object>>} shapeKey → GeoJSON geometry
 */
export async function fetchGeometries(units) {
  const valid = (units || []).filter(u => u.osmId && u.osmType);
  if (!valid.length) return {};
  const ids = valid
    .map(u => `${String(u.osmType)[0].toUpperCase()}${u.osmId}`)
    .join(',');
  const params = new URLSearchParams({
    osm_ids: ids, format: 'jsonv2', polygon_geojson: '1',
  });
  const res = await fetch(`${NOMINATIM}/lookup?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim lookup ${res.status}`);
  const arr = await res.json();
  const out = {};
  for (const r of arr) {
    if (r.geojson) out[`${r.osm_type}/${r.osm_id}`] = r.geojson;
  }
  return out;
}
