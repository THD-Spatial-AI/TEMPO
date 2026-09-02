import { describe, it, expect } from 'vitest';
import {
  parseSource, parseCapacityMW, parseVoltageKv, parseCircuits,
  zoneOfPoint, assignPlantsToZones, extractCrossings,
} from '../zonalInfraExtract';
import { buildZonalModel } from '../zonalModelBuilder';

// Two adjacent unit squares sharing the x=1 border.
const square = (x0, x1) => ({
  type: 'Polygon',
  coordinates: [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]],
});
const zones = [
  { id: 'A', name: 'A', centroid: [0.5, 0.5], geometry: square(0, 1) },
  { id: 'B', name: 'B', centroid: [1.5, 0.5], geometry: square(1, 2) },
];
const line = (coords, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
const plant = (pt, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: pt } });

describe('OSM tag parsers', () => {
  it('parseSource normalises aliases and defaults to other', () => {
    expect(parseSource({ 'plant:source': 'photovoltaic' })).toBe('solar');
    expect(parseSource({ 'generator:source': 'wind' })).toBe('wind');
    expect(parseSource({ source: 'natural_gas' })).toBe('gas');
    expect(parseSource({})).toBe('other');
  });

  it('parseCapacityMW handles units and bare watts', () => {
    expect(parseCapacityMW({ 'plant:output:electricity': '1360 MW' })).toBe(1360);
    expect(parseCapacityMW({ 'plant:output:electricity': '1.2 GW' })).toBe(1200);
    expect(parseCapacityMW({ 'plant:output:electricity': '500000' })).toBe(0.5); // watts
    expect(parseCapacityMW({})).toBeNull();
  });

  it('parseVoltageKv takes the max of a ;-list, tolerating volts or kV', () => {
    expect(parseVoltageKv({ voltage: '220000' })).toBe(220);      // raw volts
    expect(parseVoltageKv({ voltage: '220000;110000' })).toBe(220);
    expect(parseVoltageKv({ voltage: 220 })).toBe(220);           // already kV (Overpass proxy)
    expect(parseVoltageKv({ voltage: '380 kV' })).toBe(380);      // numeric prefix, kV
    expect(parseVoltageKv({})).toBe(0);
  });

  it('parseCircuits derives from circuits or cables/3', () => {
    expect(parseCircuits({ circuits: '2' })).toBe(2);
    expect(parseCircuits({ cables: '6' })).toBe(2);
    expect(parseCircuits({})).toBe(1);
  });
});

describe('point-in-polygon assignment', () => {
  it('locates a point in the right zone', () => {
    expect(zoneOfPoint(zones, [0.5, 0.5])).toBe('A');
    expect(zoneOfPoint(zones, [1.5, 0.5])).toBe('B');
    expect(zoneOfPoint(zones, [5, 5])).toBeNull();
  });

  it('assigns plants to their containing zone, dropping those outside', () => {
    const byZone = assignPlantsToZones(zones, [
      plant([0.5, 0.5], { 'plant:source': 'solar', 'plant:output:electricity': '50 MW' }),
      plant([1.5, 0.5], { 'plant:source': 'wind' }),
      plant([9, 9], { 'plant:source': 'coal' }),
    ]);
    expect(byZone.A).toEqual([{ source: 'solar', capacityMW: 50 }]);
    expect(byZone.B).toEqual([{ source: 'wind', capacityMW: null }]);
    expect(byZone['9']).toBeUndefined();
  });
});

describe('line crossing extraction', () => {
  it('detects an A→B border crossing once', () => {
    const cr = extractCrossings(zones, [line([[0.5, 0.5], [1.5, 0.5]], { voltage: '220000' })]);
    expect(cr).toEqual([{ a: 'A', b: 'B', voltage: 220, circuits: 1 }]);
  });

  it('detects a line leaving the study area as external', () => {
    const cr = extractCrossings(zones, [line([[0.5, 0.5], [-1, 0.5]], { voltage: '500000' })]);
    expect(cr).toEqual([{ a: 'A', b: null, voltage: 500, circuits: 1 }]);
  });

  it('counts a weaving A-B-A line only once for the pair', () => {
    const cr = extractCrossings(zones, [line([[0.5, 0.5], [1.5, 0.5], [0.6, 0.6]], { voltage: '220000' })]);
    expect(cr).toEqual([{ a: 'A', b: 'B', voltage: 220, circuits: 1 }]);
  });
});

describe('end-to-end: features → extract → buildZonalModel', () => {
  it('produces zone nodes, a summed link, and generation from plants', () => {
    const zonesWithPop = zones.map(z => ({ ...z, population: 100000 }));
    const plantsByZone = assignPlantsToZones(zones, [
      plant([0.5, 0.5], { 'plant:source': 'solar', 'plant:output:electricity': '80 MW' }),
      plant([0.6, 0.4], { 'plant:source': 'solar', 'plant:output:electricity': '40 MW' }),
    ]);
    const crossings = extractCrossings(zones, [
      line([[0.5, 0.5], [1.5, 0.5]], { voltage: '220000' }),        // 500
      line([[0.5, 0.6], [1.5, 0.6]], { voltage: '400000', circuits: '2' }), // 2800
    ]);

    const { locations, links, warnings } = buildZonalModel({
      zones: zonesWithPop, plantsByZone, crossings, options: { idBase: 1 },
    });

    const a = locations.find(l => l.name === 'A');
    expect(a.techs.solar_pv_utility_scale.constraints.energy_cap_equals).toBe(120);
    expect(a.techs.power_demand.metadata.stub).toBe(true);

    const abLink = links.find(l => !l.metadata.external);
    expect(abLink.capacity).toBe(3300); // 500 + 2800
    expect(warnings.every(w => w.type !== 'estimated_capacity')).toBe(true); // both tagged
  });
});
