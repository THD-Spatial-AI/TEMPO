/**
 * zonalModelBuilder.js
 * --------------------
 * Turns a selected study area (admin zones) plus the power infrastructure
 * found inside/around it into TEMPO model objects — the "zonal transmission"
 * model locked in design:
 *
 *   · each zone  → a location (node) at its polygon centroid
 *   · plants in a zone → generation techs seeded at that node, aggregated by
 *     source (missing capacity estimated + flagged)
 *   · HV lines crossing a zone-pair border → one link, capacity = Σ estimated
 *     ratings of the crossing lines
 *   · HV lines leaving the study area → an EXT interconnection node + link
 *     (imports/exports; the user sets price/limit)
 *   · population → a demand stub per node (constant-power, flagged)
 *
 * This module is PURE: geometry intersection (which line crosses which border,
 * which plant sits in which zone) happens upstream in the Overpass/GeoServer
 * layer and is passed in as `plantsByZone` + `crossings`. That keeps the
 * physics/aggregation unit-testable without a live network.
 *
 * Output location/link shapes match the existing mesh-import contract
 * (see importMeshAsLocations in Creation.jsx) so the caller can feed them
 * straight into locationManager.importMultipleLocations / importMultipleLinks.
 */

// OSM power=plant `plant:source` (or `generator:source`) → a representative
// TEMPO tech catalogue id. Coarse OSM sources map to one canonical tech each.
export const OSM_SOURCE_TO_TECH = {
  solar: 'solar_pv_utility_scale',
  wind: 'onshore_wind',
  hydro: 'hydroelectric_reservoir',
  gas: 'combined_cycle_gas_turbine_ccgt',
  coal: 'coal_power_plant',
  nuclear: 'nuclear_power_conventional',
  biomass: 'biomass_power_plant',
  geothermal: 'geothermal_power',
  oil: 'internal_combustion_engine',
};

// Estimated thermal rating per single circuit, by nominal voltage (kV).
// Rough transmission-planning figures; used only when line ratings are absent.
export const VOLTAGE_RATING_MW = [
  { kv: 110, mw: 150 }, { kv: 132, mw: 185 }, { kv: 150, mw: 210 },
  { kv: 220, mw: 500 }, { kv: 275, mw: 600 }, { kv: 330, mw: 800 },
  { kv: 400, mw: 1400 }, { kv: 500, mw: 2000 }, { kv: 765, mw: 3000 },
];

// Fallback installed capacity (MW) by source when OSM lacks an output tag.
export const SOURCE_DEFAULT_MW = {
  solar: 20, wind: 30, hydro: 50, gas: 100, coal: 300,
  nuclear: 1000, biomass: 20, geothermal: 30, oil: 40, other: 20,
};

const round = (n, d = 1) => {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

/** Nearest-bucket thermal rating (MW) for a line at `kv`, times circuit count. */
export function ratingForVoltage(kv, circuits = 1) {
  const v = Number(kv);
  if (!Number.isFinite(v) || v <= 0) return 0;
  let best = VOLTAGE_RATING_MW[0];
  for (const b of VOLTAGE_RATING_MW) {
    if (Math.abs(b.kv - v) < Math.abs(best.kv - v)) best = b;
  }
  return best.mw * (Number(circuits) > 0 ? Number(circuits) : 1);
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const pairKey = (a, b) => [a, b].sort().join('||');

/**
 * @param {object} args
 * @param {Array<{id,name,centroid:[lon,lat],population?,populationEstimated?}>} args.zones
 * @param {Record<string, Array<{source, capacityMW?}>>} [args.plantsByZone]
 * @param {Array<{a:string, b:string|null, voltage:number, circuits?:number}>} [args.crossings]
 *        Each crossing is one HV line crossing a border. `b === null` ⇒ the
 *        line leaves the study area (external interconnection from zone `a`).
 * @param {object} [args.options]
 * @param {number} [args.options.perCapitaAnnualMWh=3.5] demand-stub scaling
 * @param {number} [args.options.idBase] base for generated numeric ids
 * @returns {{locations:object[], links:object[], usedTechs:string[], warnings:object[]}}
 */
export function buildZonalModel({ zones = [], plantsByZone = {}, crossings = [], options = {} }) {
  const { perCapitaAnnualMWh = 3.5, idBase = Date.now() } = options;

  const warnings = [];
  const usedTechs = new Set();
  const locations = [];
  const links = [];
  const zoneLocId = {};
  let seq = 0;
  const nextId = () => idBase + seq++;

  // ── 1. Zone nodes: generation + demand ──────────────────────────────────
  for (const z of zones) {
    const [lon, lat] = z.centroid || [0, 0];
    const locId = nextId();
    zoneLocId[z.id] = locId;
    const techs = {};

    // Aggregate plants by source.
    const bySource = {};
    for (const p of plantsByZone[z.id] || []) {
      const src = String(p.source || 'other').toLowerCase();
      let cap = Number(p.capacityMW);
      let estimated = false;
      if (!Number.isFinite(cap) || cap <= 0) {
        cap = SOURCE_DEFAULT_MW[src] ?? SOURCE_DEFAULT_MW.other;
        estimated = true;
      }
      const agg = (bySource[src] ||= { cap: 0, count: 0, estimated: false });
      agg.cap += cap; agg.count += 1; agg.estimated = agg.estimated || estimated;
    }
    for (const [src, agg] of Object.entries(bySource)) {
      const techId = OSM_SOURCE_TO_TECH[src];
      if (!techId) { warnings.push({ zone: z.id, type: 'unmapped_source', source: src }); continue; }
      usedTechs.add(techId);
      techs[techId] = {
        constraints: { energy_cap_equals: round(agg.cap) },
        essentials: { carrier: 'electricity' },
        metadata: { fromOSM: true, source: src, plantCount: agg.count, estimated: agg.estimated },
      };
      if (agg.estimated) {
        warnings.push({ zone: z.id, type: 'estimated_capacity', source: src, tech: techId });
      }
    }

    // Demand stub from population (constant-power; user replaces with a profile).
    if (Number.isFinite(z.population) && z.population > 0) {
      const annualMWh = z.population * perCapitaAnnualMWh;
      const avgMW = annualMWh / 8760;
      usedTechs.add('power_demand');
      techs['power_demand'] = {
        constraints: { resource: -round(avgMW, 3), force_resource: true },
        essentials: { carrier: 'electricity', parent: 'demand' },
        metadata: {
          stub: true, annualDemandMWh: round(annualMWh),
          avgDemandMW: round(avgMW, 3), populationEstimated: !!z.populationEstimated,
        },
      };
      if (z.populationEstimated) {
        warnings.push({ zone: z.id, type: 'estimated_population' });
      }
    }

    locations.push({
      id: locId, name: z.name, latitude: lat, longitude: lon,
      techs, isNode: false,
      metadata: { shapeId: z.id, fromBoundary: true, population: z.population ?? null },
    });
  }

  // ── 2. Inter-zone links: aggregate crossings per adjacent pair ───────────
  const intra = {}; // pairKey → { a, b, capacity }
  const external = {}; // zoneId → capacity
  for (const c of crossings) {
    const rating = ratingForVoltage(c.voltage, c.circuits);
    if (c.b == null) {
      external[c.a] = (external[c.a] || 0) + rating;
      continue;
    }
    const k = pairKey(c.a, c.b);
    (intra[k] ||= { a: c.a, b: c.b, capacity: 0 }).capacity += rating;
  }

  for (const { a, b, capacity } of Object.values(intra)) {
    const za = zones.find(z => z.id === a);
    const zb = zones.find(z => z.id === b);
    if (!za || !zb) continue; // crossing references a zone not in the area
    usedTechs.add('ac_transmission');
    const [alon, alat] = za.centroid || [0, 0];
    const [blon, blat] = zb.centroid || [0, 0];
    links.push({
      id: nextId(), from: zoneLocId[a], to: zoneLocId[b],
      fromName: za.name, toName: zb.name,
      distance: round(haversineKm(alat, alon, blat, blon), 2),
      capacity: round(capacity),          // MW — thermal rating (energy_cap_max on export)
      tech: 'ac_transmission', carrier: 'electricity',
      metadata: { fromBoundary: true },
    });
  }

  // ── 3. External interconnections (imports/exports) ───────────────────────
  for (const [zoneId, capacity] of Object.entries(external)) {
    const z = zones.find(zz => zz.id === zoneId);
    if (!z) continue;
    const [lon, lat] = z.centroid || [0, 0];
    const extId = nextId();
    locations.push({
      id: extId, name: `EXT_${z.name}`, latitude: lat, longitude: lon + 0.5,
      techs: {}, isNode: true,
      metadata: {
        external: true, fromBoundary: true,
        note: 'External interconnection — set import price/limit on this node',
      },
    });
    usedTechs.add('ac_transmission');
    links.push({
      id: nextId(), from: zoneLocId[zoneId], to: extId,
      fromName: z.name, toName: `EXT_${z.name}`,
      distance: 0,
      capacity: round(capacity),
      tech: 'ac_transmission', carrier: 'electricity',
      metadata: { external: true, fromBoundary: true },
    });
    warnings.push({ zone: zoneId, type: 'external_interconnection', capacityMW: round(capacity) });
  }

  return { locations, links, usedTechs: [...usedTechs], warnings };
}
