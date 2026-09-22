import { describe, it, expect } from 'vitest';
import {
  buildZonalModel, ratingForVoltage, OSM_SOURCE_TO_TECH,
} from '../zonalModelBuilder';

const zones = [
  { id: 'A', name: 'Zone A', centroid: [-70.0, -23.0], population: 200000 },
  { id: 'B', name: 'Zone B', centroid: [-69.0, -22.5], population: 100000, populationEstimated: true },
];

describe('ratingForVoltage', () => {
  it('picks the nearest voltage bucket and scales by circuits', () => {
    expect(ratingForVoltage(220)).toBe(500);
    expect(ratingForVoltage(225)).toBe(500);   // nearest → 220
    expect(ratingForVoltage(400, 2)).toBe(2800); // 1400 × 2
    expect(ratingForVoltage(0)).toBe(0);
    expect(ratingForVoltage(undefined)).toBe(0);
  });
});

describe('buildZonalModel — nodes & generation', () => {
  it('creates one location per zone at its centroid', () => {
    const { locations } = buildZonalModel({ zones, options: { idBase: 1000 } });
    const nodes = locations.filter(l => !l.metadata.external);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ name: 'Zone A', latitude: -23.0, longitude: -70.0 });
    expect(nodes[0].metadata.shapeId).toBe('A');
  });

  it('aggregates plants by source and pins installed capacity', () => {
    const { locations, usedTechs } = buildZonalModel({
      zones,
      plantsByZone: {
        A: [{ source: 'solar', capacityMW: 50 }, { source: 'solar', capacityMW: 70 }, { source: 'wind', capacityMW: 30 }],
      },
      options: { idBase: 1000 },
    });
    const a = locations.find(l => l.name === 'Zone A');
    expect(a.techs[OSM_SOURCE_TO_TECH.solar].constraints.energy_cap_equals).toBe(120);
    expect(a.techs[OSM_SOURCE_TO_TECH.solar].metadata.plantCount).toBe(2);
    expect(a.techs[OSM_SOURCE_TO_TECH.wind].constraints.energy_cap_equals).toBe(30);
    expect(usedTechs).toContain(OSM_SOURCE_TO_TECH.solar);
  });

  it('estimates and flags missing plant capacity', () => {
    const { locations, warnings } = buildZonalModel({
      zones,
      plantsByZone: { A: [{ source: 'hydro' }] }, // no capacityMW
      options: { idBase: 1000 },
    });
    const a = locations.find(l => l.name === 'Zone A');
    const hydro = a.techs[OSM_SOURCE_TO_TECH.hydro];
    expect(hydro.metadata.estimated).toBe(true);
    expect(hydro.constraints.energy_cap_equals).toBeGreaterThan(0);
    expect(warnings.some(w => w.type === 'estimated_capacity' && w.zone === 'A')).toBe(true);
  });

  it('seeds a population-scaled demand stub and flags estimated population', () => {
    const { locations, warnings } = buildZonalModel({ zones, options: { idBase: 1000, perCapitaAnnualMWh: 4 } });
    const a = locations.find(l => l.name === 'Zone A');
    const d = a.techs['power_demand'];
    expect(d.metadata.stub).toBe(true);
    expect(d.metadata.annualDemandMWh).toBe(800000); // 200000 × 4
    expect(d.constraints.force_resource).toBe(true);
    expect(d.constraints.resource).toBeLessThan(0);   // demand is negative
    expect(warnings.some(w => w.type === 'estimated_population' && w.zone === 'B')).toBe(true);
  });
});

describe('buildZonalModel — links', () => {
  it('merges parallel crossings between a pair into one summed-capacity link', () => {
    const { links } = buildZonalModel({
      zones,
      crossings: [
        { a: 'A', b: 'B', voltage: 220 },            // 500
        { a: 'B', b: 'A', voltage: 220 },            // 500 (same pair, either order)
        { a: 'A', b: 'B', voltage: 400, circuits: 1 }, // 1400
      ],
      options: { idBase: 1000 },
    });
    const ab = links.filter(l => !l.metadata.external);
    expect(ab).toHaveLength(1);
    expect(ab[0].capacity).toBe(2400);
    expect(ab[0].tech).toBe('ac_transmission');
    expect(ab[0].distance).toBeGreaterThan(0);
  });

  it('creates an external interconnection node + link for boundary-crossing lines', () => {
    const { locations, links, warnings } = buildZonalModel({
      zones,
      crossings: [{ a: 'A', b: null, voltage: 500 }], // leaves the area → 2000
      options: { idBase: 1000 },
    });
    const ext = locations.find(l => l.metadata.external);
    expect(ext.name).toBe('EXT_Zone A');
    const extLink = links.find(l => l.metadata.external);
    expect(extLink.capacity).toBe(2000);
    expect(warnings.some(w => w.type === 'external_interconnection')).toBe(true);
  });

  it('ignores crossings that reference a zone outside the selection', () => {
    const { links } = buildZonalModel({
      zones,
      crossings: [{ a: 'A', b: 'Z_MISSING', voltage: 220 }],
      options: { idBase: 1000 },
    });
    expect(links.filter(l => !l.metadata.external)).toHaveLength(0);
  });
});
