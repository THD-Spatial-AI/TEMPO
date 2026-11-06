// src/services/__tests__/demandCells.test.js
import { describe, it, expect } from 'vitest';
import { cellsForModel, cellValue, cellScale, cellColor, staleCells, DEMAND_RAMP } from '../demandCells';

const sq = (x) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] });
const CELLS = { type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: sq(0), properties: { locationId: 'node/1', name: 'A', annualGWh: 10, avgMW: 1.14, densityGWhKm2: 1, areaKm2: 10, mix: { g0: 100 }, landuseCoverage: 0.5 } },
  { type: 'Feature', geometry: sq(1), properties: { locationId: 'node/2', name: 'B', annualGWh: 20, avgMW: 2.28, densityGWhKm2: 4, areaKm2: 5, mix: { h0_dyn: 100 }, landuseCoverage: 0.2 } },
  { type: 'Feature', geometry: null, properties: { locationId: 'node/3', name: 'C', annualGWh: 0, areaKm2: 0 } },
] };

describe('cellsForModel', () => {
  it('re-keys cells to model locations and applies the edited numbers', () => {
    const out = cellsForModel({
      cells: CELLS,
      byId: { 'node/1': { avgMW: 2.283105, annualGWh: 20, mix: { g3: 100 } }, 'node/2': { avgMW: 2.28, annualGWh: 20, mix: { h0_dyn: 100 } } },
      locations: [{ osmId: 'node/1', name: 'Sub A' }, { osmId: 'node/2', name: 'Sub B' }],
      meta: { rasterYear: 2019, family: 'classic', country: 'CL' },
      now: () => '2026-11-06T00:00:00.000Z',
    });
    expect(out.features).toHaveLength(2);                       // null geometry + unknown osm id dropped
    expect(out.features[0].properties).toMatchObject({
      locationId: 'Sub A', osmId: 'node/1', name: 'Sub A', annualGWh: 20, avgMW: 2.283105, densityGWhKm2: 2, mix: { g3: 100 },
      areaKm2: 10, landuseCoverage: 0.5,
    });
    expect(out.meta).toEqual({ createdAt: '2026-11-06T00:00:00.000Z', rasterYear: 2019, family: 'classic', country: 'CL', totalGWh: 40 });
    expect(CELLS.features[0].properties.annualGWh).toBe(10);   // input untouched
  });
  it('returns null when nothing maps', () => {
    expect(cellsForModel({ cells: CELLS, byId: {}, locations: [], meta: {} })).toBeNull();
    expect(cellsForModel({ cells: null, byId: {}, locations: [], meta: {} })).toBeNull();
  });
});

describe('cellValue / cellScale / cellColor', () => {
  const f = CELLS.features[1];
  it('reads density or total', () => {
    expect(cellValue(f, 'density')).toBe(4);
    expect(cellValue(f, 'total')).toBe(20);
    expect(cellValue({ properties: {} }, 'density')).toBe(0);
  });
  it('scales to the 95th percentile', () => {
    const feats = Array.from({ length: 100 }, (_, i) => ({ properties: { densityGWhKm2: i + 1 } }));
    expect(cellScale(feats, 'density')).toBe(95);
    expect(cellScale([], 'density')).toBe(1);
  });
  it('maps 0 → faint first stop, ≥ max → last stop', () => {
    expect(cellColor(0, 10)).toEqual([...DEMAND_RAMP[0], 40]);
    expect(cellColor(10, 10)).toEqual([...DEMAND_RAMP[4], 150]);
    expect(cellColor(50, 10)).toEqual([...DEMAND_RAMP[4], 150]);
    const mid = cellColor(5, 10);                              // halfway = stop 2
    expect(mid).toEqual([...DEMAND_RAMP[2], 150]);
  });
});

describe('staleCells', () => {
  const cells = { features: [
    { properties: { locationId: 'Sub A', name: 'Sub A' } }, { properties: { locationId: 'Sub B', name: 'Sub B' } },
  ] };
  const loc = (name, demand = true) => ({ name, techs: demand ? { power_demand: {} } : {} });
  it('is fresh when every cell location exists with demand', () => {
    expect(staleCells(cells, [loc('Sub A'), loc('Sub B')])).toEqual({ stale: false, missing: [], liveIds: new Set(['Sub A', 'Sub B']) });
  });
  it('lists removed or demand-less locations', () => {
    const r = staleCells(cells, [loc('Sub A', false)]);
    expect(r.stale).toBe(true);
    expect(r.missing).toEqual(['Sub A', 'Sub B']);
    expect(r.liveIds.size).toBe(0);
  });
  it('keeps a renamed location live through its OSM id', () => {
    const osmCells = { features: [{ properties: { locationId: 'Sub A', name: 'Sub A', osmId: 'node/1' } }] };
    const renamed = { name: 'Renamed', metadata: { osmId: 'node/1' }, techs: { power_demand: {} } };
    expect(staleCells(osmCells, [renamed])).toEqual({ stale: false, missing: [], liveIds: new Set(['Sub A']) });
  });
  it('handles no cells', () => {
    expect(staleCells(null, []).stale).toBe(false);
  });
});
