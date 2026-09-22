/**
 * zonalInfraExtract.js
 * --------------------
 * Pure geometry layer that turns zone polygons + raw OSM power features into
 * the inputs `zonalModelBuilder.buildZonalModel` expects:
 *   · assignPlantsToZones → plantsByZone { zoneId: [{ source, capacityMW }] }
 *   · extractCrossings    → crossings   [{ a, b|null, voltage, circuits }]
 *
 * No geometry library is available in this project, so point-in-polygon uses
 * ray casting and line border-crossing is detected by walking each line's
 * vertices and watching which zone each vertex falls in. That is exact at
 * vertices and adequate for transmission lines (dense vertices); a segment
 * whose two endpoints share a zone is treated as staying in that zone.
 *
 * Zones are passed as `[{ id, geometry }]` where geometry is a GeoJSON Polygon
 * or MultiPolygon (e.g. fetched from GeoServer by shapeId).
 */

// ── OSM tag parsers (also used by the live Overpass layer) ─────────────────

const SOURCE_ALIASES = {
  solar: 'solar', photovoltaic: 'solar', pv: 'solar',
  wind: 'wind',
  hydro: 'hydro', water: 'hydro', tidal: 'hydro', wave: 'hydro',
  gas: 'gas', natural_gas: 'gas',
  coal: 'coal',
  nuclear: 'nuclear',
  biomass: 'biomass', biofuel: 'biomass', biogas: 'biomass', waste: 'biomass',
  geothermal: 'geothermal',
  oil: 'oil', diesel: 'oil',
};

// OSM plant:method / generator:method → source (used when source tag is missing).
const METHOD_TO_SOURCE = {
  photovoltaic: 'solar', 'solar-photovoltaic': 'solar',
  wind_turbine: 'wind',
  'run-of-the-river': 'hydro', 'run-of-river': 'hydro', 'water-storage': 'hydro',
  'water-pumped-storage': 'hydro', barrage: 'hydro', stream: 'hydro', tidal: 'hydro',
  fission: 'nuclear',
  anaerobic_digestion: 'biomass', gasification: 'biomass',
  geothermal: 'geothermal',
};
// OSM generator:type → source (last resort).
const GENTYPE_TO_SOURCE = {
  solar_photovoltaic_panel: 'solar', solar_thermal_collector: 'solar',
  wind_turbine: 'wind', water_turbine: 'hydro',
  gas_turbine: 'gas',
};

/**
 * Normalise an OSM plant/generator source to our vocabulary, inferring from
 * `*:method` and `generator:type` when the `*:source` tag is missing. Returns
 * 'unknown' when nothing identifiable (so the UI can flag it), else a source.
 */
export function parseSource(props = {}) {
  const raw = String(
    props['plant:source'] ?? props['generator:source'] ?? props.source ?? '',
  ).toLowerCase().split(';')[0].trim();
  if (raw && SOURCE_ALIASES[raw]) return SOURCE_ALIASES[raw];
  if (raw) {
    for (const k of Object.keys(SOURCE_ALIASES)) if (raw.includes(k)) return SOURCE_ALIASES[k];
  }
  const method = String(props['plant:method'] ?? props['generator:method'] ?? '')
    .toLowerCase().split(';')[0].trim();
  if (method && METHOD_TO_SOURCE[method]) return METHOD_TO_SOURCE[method];
  const gtype = String(props['generator:type'] ?? '').toLowerCase().trim();
  if (gtype && GENTYPE_TO_SOURCE[gtype]) return GENTYPE_TO_SOURCE[gtype];
  return raw ? 'other' : 'unknown';
}

/**
 * Parse installed capacity in MW from OSM output/rating tags (several fallbacks);
 * null when absent or non-numeric (e.g. the common `...=yes`).
 */
export function parseCapacityMW(props = {}) {
  const raw = props['plant:output:electricity'] ?? props['generator:output:electricity']
    ?? props['output:electricity'] ?? props['plant:output'] ?? props.rating
    ?? props['generator:rating'] ?? props.output;
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'yes' || s === 'auto') return null;
  const num = parseFloat(s.replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  if (s.includes('gw')) return num * 1000;
  if (s.includes('mw')) return num;
  if (s.includes('kw')) return num / 1000;
  if (s.includes('w')) return num / 1e6; // plain watts
  // Bare number: OSM convention is watts when untagged with a unit.
  return num > 100000 ? num / 1e6 : num;
}

/**
 * Classify a `power=substation` (or transformer) into a grid role, from the
 * `substation` tag and voltage. Returns one of: transmission | distribution |
 * traction | converter | other. Voltage ≥110 kV ⇒ transmission when the tag
 * is absent.
 */
export function classifySubstation(props = {}) {
  const st = String(props.substation ?? props['substation:type'] ?? '').toLowerCase();
  if (st.includes('transmission')) return 'transmission';
  if (st.includes('traction')) return 'traction';
  if (st.includes('converter')) return 'converter';
  if (st.includes('distribution')) return 'distribution'; // incl. minor_distribution
  if (st.includes('industrial')) return 'other';
  const v = parseVoltageKv(props);
  if (v >= 110) return 'transmission';
  if (v >= 1) return 'distribution';
  return 'other';
}

/**
 * Max nominal voltage in kV from an OSM `voltage` value (may be ";"-separated).
 * Tolerant of both formats seen in TEMPO's sources: raw volts ("220000",
 * GeoServer/extract) and already-kV numbers (220, the Overpass proxy). Values
 * ≥ 1000 are treated as volts, else already kV — transmission voltages never
 * overlap that boundary.
 */
export function parseVoltageKv(props = {}) {
  const raw = props.voltage;
  if (raw == null) return 0;
  const vals = String(raw).split(';')
    .map(v => parseFloat(v))
    .filter(Number.isFinite);
  if (!vals.length) return 0;
  const max = Math.max(...vals);
  return max >= 1000 ? max / 1000 : max;
}

/** Circuit count: `circuits`, else `cables`/3, else 1. */
export function parseCircuits(props = {}) {
  const c = parseInt(props.circuits, 10);
  if (Number.isFinite(c) && c > 0) return c;
  const cables = parseInt(props.cables, 10);
  if (Number.isFinite(cables) && cables >= 3) return Math.max(1, Math.round(cables / 3));
  return 1;
}

// ── geometry primitives ────────────────────────────────────────────────────

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygonGeom(pt, geom) {
  if (!geom) return false;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates]
    : [];
  for (const rings of polys) {
    if (!rings.length) continue;
    if (!pointInRing(pt, rings[0])) continue;          // outside outer ring
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(pt, rings[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

/** True if `pt` [lon,lat] falls inside any of the given polygon geometries. */
export function pointInAnyPolygon(pt, geometries) {
  for (const g of geometries || []) {
    if (pointInPolygonGeom(pt, g)) return true;
  }
  return false;
}

/**
 * True if any coordinate of `geom` (point, line, or polygon) falls inside any of
 * `geometries`. Used to clip bbox-fetched features to the selected area: points
 * must be inside; lines/areas are kept if they touch the area.
 */
export function geometryTouchesPolygons(geom, geometries) {
  if (!geom || !geometries || !geometries.length) return false;
  const pts = [];
  const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  walk(geom.coordinates || []);
  for (const p of pts) if (pointInAnyPolygon(p, geometries)) return true;
  return false;
}

/** Id of the first zone whose polygon contains `pt`, or null. */
export function zoneOfPoint(zones, pt) {
  for (const z of zones) {
    if (pointInPolygonGeom(pt, z.geometry)) return z.id;
  }
  return null;
}

/** Representative [lon,lat] point of a feature geometry (centroid of vertices). */
function representativePoint(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates;
  const flat = [];
  const walk = (c) => {
    if (typeof c[0] === 'number') { flat.push(c); return; }
    c.forEach(walk);
  };
  walk(geom.coordinates);
  if (!flat.length) return null;
  const sum = flat.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [sum[0] / flat.length, sum[1] / flat.length];
}

/** Ordered coordinate sequences of a (Multi)LineString feature. */
function lineParts(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

// ── assignment ──────────────────────────────────────────────────────────────

/**
 * @returns {Record<string, Array<{source, capacityMW}>>}
 */
export function assignPlantsToZones(zones, plantFeatures = []) {
  const out = {};
  for (const f of plantFeatures) {
    const pt = representativePoint(f.geometry);
    if (!pt) continue;
    const zoneId = zoneOfPoint(zones, pt);
    if (!zoneId) continue; // plant outside the study area
    (out[zoneId] ||= []).push({
      source: parseSource(f.properties),
      capacityMW: parseCapacityMW(f.properties),
    });
  }
  return out;
}

/**
 * Detect, per line, the zone-pair borders it crosses and whether it leaves the
 * study area. Each line contributes at most one crossing per unordered pair and
 * at most one external crossing per zone.
 * @returns {Array<{a:string, b:string|null, voltage:number, circuits:number}>}
 */
export function extractCrossings(zones, lineFeatures = []) {
  const crossings = [];
  for (const f of lineFeatures) {
    const voltage = parseVoltageKv(f.properties);
    const circuits = parseCircuits(f.properties);

    const seenPair = new Set();
    const seenExternal = new Set();

    for (const coords of lineParts(f.geometry)) {
      // Collapse consecutive vertices that share a zone.
      const seq = [];
      for (const pt of coords) {
        const z = zoneOfPoint(zones, pt);
        if (seq.length === 0 || seq[seq.length - 1] !== z) seq.push(z);
      }
      for (let i = 0; i < seq.length - 1; i++) {
        const x = seq[i], y = seq[i + 1];
        if (x != null && y != null && x !== y) {
          const key = [x, y].sort().join('||');
          if (!seenPair.has(key)) {
            seenPair.add(key);
            crossings.push({ a: x, b: y, voltage, circuits });
          }
        } else if ((x == null) !== (y == null)) {
          const z = x == null ? y : x;
          if (!seenExternal.has(z)) {
            seenExternal.add(z);
            crossings.push({ a: z, b: null, voltage, circuits });
          }
        }
      }
    }
  }
  return crossings;
}
