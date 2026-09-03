/**
 * overpassClient.js
 * -----------------
 * Direct (renderer-side) Overpass fetch of power infrastructure for a bbox,
 * so the map shows the grid with NO backend/PostGIS — same rationale as
 * nominatim.js. Filtered to transmission voltage by default to keep payloads
 * sane over large areas (the OSM feature is about "how the big voltages work").
 *
 * Returns GeoJSON FeatureCollections shaped like the existing map layers:
 *   { powerLines, substations, powerPlants }
 */

import {
  parseVoltageKv, geometryTouchesPolygons, parseSource, parseCapacityMW, classifySubstation,
} from './zonalInfraExtract';

// Public Overpass mirrors, tried in order. kumi.systems / osm.ch are usually the
// most responsive; overpass-api.de frequently 504s / connection-times-out.
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

// Fail over reasonably fast — a working mirror answers this (bounded, index-
// friendly) query within a few seconds; don't wait a minute on a dead one.
const OVERPASS_TIMEOUT_MS = 30000;

// POST a query to each mirror in turn; return parsed JSON from the first that
// succeeds. Aborts a slow mirror after OVERPASS_TIMEOUT_MS and moves on.
async function runOverpass(query, signal) {
  let lastErr = new Error('Overpass unavailable');
  for (const url of OVERPASS_ENDPOINTS) {
    const host = new URL(url).host;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
    const t0 = Date.now();
    try {
      console.info(`[Overpass] → ${host} …`);
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
      });
      const ms = Date.now() - t0;
      if (res.ok) {
        const data = await res.json();
        // Overpass often returns HTTP 200 with an empty result + a `remark`
        // when the query timed out / errored server-side. Treat that as a
        // failure and fail over, rather than reporting "0 found".
        const n = Array.isArray(data?.elements) ? data.elements.length : 0;
        if (n === 0 && data && data.remark) {
          console.warn(`[Overpass] ${host} 200 but remark after ${ms}ms: ${data.remark}`);
          lastErr = new Error(`Overpass: ${data.remark}`);
        } else {
          console.info(`[Overpass] ✓ ${host} → ${n} elements in ${ms}ms`);
          return data;
        }
      } else {
        console.warn(`[Overpass] ${host} HTTP ${res.status} after ${ms}ms`);
        lastErr = new Error(`Overpass ${res.status}`); // 429/504 → try next mirror
      }
    } catch (e) {
      if (signal?.aborted) throw e; // caller cancelled — stop entirely
      console.warn(`[Overpass] ${host} failed after ${Date.now() - t0}ms: ${e.message}`);
      lastErr = e;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr;
}

function clampBbox(b, maxDeg = 3.5) {
  const lonSpan = b.maxLon - b.minLon;
  const latSpan = b.maxLat - b.minLat;
  if (lonSpan <= maxDeg && latSpan <= maxDeg) return b;
  const cLon = (b.minLon + b.maxLon) / 2;
  const cLat = (b.minLat + b.maxLat) / 2;
  const hLon = Math.min(lonSpan / 2, maxDeg / 2);
  const hLat = Math.min(latSpan / 2, maxDeg / 2);
  return { minLon: cLon - hLon, maxLon: cLon + hLon, minLat: cLat - hLat, maxLat: cLat + hLat };
}

function toFeature(el) {
  const tags = el.tags || {};
  if (el.type === 'node') {
    return {
      type: 'Feature', id: `node/${el.id}`,
      properties: { ...tags, '@id': `node/${el.id}` },
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
    };
  }
  if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
    const coords = el.geometry.map(p => [p.lon, p.lat]);
    const a = coords[0];
    const z = coords[coords.length - 1];
    const closed = a[0] === z[0] && a[1] === z[1] && coords.length >= 4;
    return {
      type: 'Feature', id: `way/${el.id}`,
      properties: { ...tags, '@id': `way/${el.id}` },
      geometry: closed
        ? { type: 'Polygon', coordinates: [coords] }
        : { type: 'LineString', coordinates: coords },
    };
  }
  return null;
}

const fc = features => ({ type: 'FeatureCollection', features });

/**
 * Fetch power lines (voltage-tagged), substations and plants within `bbox`.
 * Lines and substations are kept only at/above `voltageMin` (kV); plants kept all.
 * @returns {Promise<{powerLines:object, substations:object, powerPlants:object}>}
 */
export async function fetchPowerLayers(bbox, { voltageMin = 0, signal, clip = null } = {}) {
  if (!bbox) return { powerLines: fc([]), substations: fc([]), powerPlants: fc([]) };
  const clipGeoms = Array.isArray(clip) && clip.length ? clip : null; // clip to selected polygons
  const b = clampBbox(bbox);
  const bb = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`; // Overpass: S,W,N,E
  // Use an INDEX-FRIENDLY presence filter (`["voltage"]`) — a regex/number()
  // voltage filter forces Overpass to scan every line and blows the server
  // timeout (504). We keep the query cheap server-side + bound the bbox
  // (clampBbox) to limit transfer, then filter by voltage on the client.
  // NB: we deliberately drop `node["power"="generator"]` — individual generating
  // units (rooftop PV, single turbines) number in the thousands and blow up the
  // query. We keep plants (facilities) + generator *ways* (mapped installations).
  const query = '[out:json][timeout:50];('
    + `way["power"="line"]["voltage"](${bb});`
    + `way["power"="cable"]["voltage"](${bb});`
    + `node["power"="substation"](${bb});way["power"="substation"](${bb});`
    + `node["power"="plant"](${bb});way["power"="plant"](${bb});`
    + `way["power"="generator"](${bb});`
    + ');out geom;';

  console.info(`[grid] querying bbox ${bb} (clamped from ${bbox.minLon.toFixed(2)},${bbox.minLat.toFixed(2)},${bbox.maxLon.toFixed(2)},${bbox.maxLat.toFixed(2)}), minV=${voltageMin}kV`);
  const json = await runOverpass(query, signal);

  const lines = []; const subs = []; const plants = [];
  let rawLines = 0; let clippedOut = 0;
  for (const el of json.elements || []) {
    const power = el.tags && el.tags.power;
    const f = toFeature(el);
    if (!f) continue;
    // Clip to the selected polygon(s): the bbox is a rectangle bigger than the
    // real area, so drop anything that doesn't fall in / touch it.
    if (clipGeoms && !geometryTouchesPolygons(f.geometry, clipGeoms)) { clippedOut++; continue; }
    if (power === 'line' || power === 'cable') {
      rawLines++;
      if (parseVoltageKv(f.properties) >= voltageMin) lines.push(f);
    } else if (power === 'substation') {
      // Keep ALL substations (both grids) — classify into transmission /
      // distribution / traction / converter so the map & filters can tell them
      // apart. (No voltageMin filter here; the substation-type filter controls it.)
      const p = f.properties;
      p.substation = classifySubstation(p);      // normalized grid role
      p.voltage_kv = parseVoltageKv(p) || null;  // parsed kV for display
      subs.push(f);
    } else if (power === 'plant' || power === 'generator') {
      // Enrich with a normalized source + parsed capacity so colour/tooltip/
      // import work even when the raw OSM tags are messy or missing.
      const p = f.properties;
      const src = parseSource(p);
      const cap = parseCapacityMW(p);
      p.plant_source = src;                       // drives colour + tooltip
      p.capacity_mw = cap;                        // number | null
      if (cap != null) p.capacity__MW_ = Math.round(cap * 100) / 100;
      p.plant_method = p['plant:method'] || p['generator:method'] || p['generator:type'] || null;
      plants.push(f);
    }
  }
  console.info(`[grid] result: ${lines.length}/${rawLines} lines ≥${voltageMin}kV, ${subs.length} substations, ${plants.length} plants${clipGeoms ? ` (${clippedOut} outside area clipped)` : ''}`);
  return { powerLines: fc(lines), substations: fc(subs), powerPlants: fc(plants) };
}

/**
 * Find candidate neighbouring admin units around the current selection — same
 * admin_level boundaries within an expanded union bbox, excluding those already
 * selected. LIGHTWEIGHT: `out tags bb;` returns only ids/names/bounds (no
 * geometry), so it doesn't compete with the power-grid fetch. Polygons for
 * these candidates are fetched separately (Nominatim) for display + clicking.
 * @param {Array<{osmId,osmType,adminLevel,bbox}>} units
 * @returns {Promise<Array<{osmId,osmType,name,adminLevel,bbox,centroid}>>}
 */
export async function fetchNeighborCandidates(units, { signal } = {}) {
  const list = (units || []).filter(u => u.bbox);
  if (!list.length) return [];

  const levels = list.map(u => u.adminLevel).filter(Boolean);
  let level = levels.length ? Math.max(...levels) : null;
  // Nominatim doesn't always return admin_level. Rather than skip (or do an
  // all-levels scan that 504s), look it up cheaply from the selected relation.
  if (!level) {
    const rel = list.find(u => u.osmType === 'relation' && u.osmId);
    if (rel) {
      try {
        const r = await runOverpass(`[out:json][timeout:15];relation(${rel.osmId});out tags;`, signal);
        const al = r.elements && r.elements[0] && r.elements[0].tags && r.elements[0].tags.admin_level;
        if (al) level = Number(al);
      } catch { /* leave level null */ }
    }
  }
  if (!level) return [];

  let bb = null;
  for (const u of list) {
    bb = bb ? {
      minLon: Math.min(bb.minLon, u.bbox.minLon), minLat: Math.min(bb.minLat, u.bbox.minLat),
      maxLon: Math.max(bb.maxLon, u.bbox.maxLon), maxLat: Math.max(bb.maxLat, u.bbox.maxLat),
    } : { ...u.bbox };
  }
  // Modest margin so the admin scan stays cheap.
  const dLon = Math.min((bb.maxLon - bb.minLon) * 0.35 || 0.2, 1.5);
  const dLat = Math.min((bb.maxLat - bb.minLat) * 0.35 || 0.2, 1.5);
  const S = bb.minLat - dLat, W = bb.minLon - dLon, N = bb.maxLat + dLat, E = bb.maxLon + dLon;

  const query = `[out:json][timeout:25];relation["boundary"="administrative"]["admin_level"="${level}"](${S},${W},${N},${E});out tags bb;`;
  const json = await runOverpass(query, signal);

  const selected = new Set(list.map(u => `${u.osmType}/${u.osmId}`));
  const out = [];
  for (const el of json.elements || []) {
    if (el.type !== 'relation' || selected.has(`relation/${el.id}`)) continue;
    const b = el.bounds;
    if (!b) continue;
    out.push({
      osmId: el.id, osmType: 'relation',
      name: (el.tags && el.tags.name) || `relation ${el.id}`,
      adminLevel: el.tags && el.tags.admin_level ? Number(el.tags.admin_level) : level,
      bbox: { minLon: b.minlon, minLat: b.minlat, maxLon: b.maxlon, maxLat: b.maxlat },
      centroid: [(b.minlon + b.maxlon) / 2, (b.minlat + b.maxlat) / 2],
    });
  }
  return out;
}
