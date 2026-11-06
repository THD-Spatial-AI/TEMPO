// src/services/__tests__/substationDemand.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  substationKey, estimatePayload, applyDemandEdits, scaleEditsToTotal,
  demandByOsmId, seriesColumns, shapeWithFallback,
} from '../substationDemand';

const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

describe('substationKey', () => {
  it('prefers feature id, then @id, then osm_id, then the index', () => {
    expect(substationKey({ id: 'node/1', properties: {} }, 0)).toBe('node/1');
    expect(substationKey({ properties: { '@id': 'way/2' } }, 0)).toBe('way/2');
    expect(substationKey({ properties: { osm_id: 7 } }, 0)).toBe('7');
    expect(substationKey({ properties: {} }, 3)).toBe('idx_3');
  });
});

describe('estimatePayload', () => {
  it('stamps countryCode on boundary features that lack one and passes the options', () => {
    const boundary = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Arica' }, geometry: square }] };
    const p = estimatePayload({
      boundary, substations: [{ id: 'node/1', lon: 0.5, lat: 0.5 }], modelYear: 2024, country: 'cl',
      family: 'classic', landuse: true, overrideGwh: null,
    });
    expect(p.area.features[0].properties).toEqual({ name: 'Arica', countryCode: 'CL' });
    expect(boundary.features[0].properties.countryCode).toBeUndefined();   // input untouched
    expect(p).toMatchObject({ modelYear: 2024, country: 'CL', family: 'classic', landuse: true });
    expect('overrideGwh' in p).toBe(false);
  });
  it('keeps an existing countryCode and sends a numeric override', () => {
    const boundary = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { countryCode: 'PE' }, geometry: square }] };
    const p = estimatePayload({ boundary, substations: [], modelYear: 2024, country: 'CL', family: 'bdew25', overrideGwh: '120' });
    expect(p.area.features[0].properties.countryCode).toBe('PE');
    expect(p.overrideGwh).toBe(120);
    expect(p.landuse).toBe(false);
  });
});

const EST = { substations: [
  { id: 'a', name: 'A', seed: true, annual_gwh: 87.6, avg_mw: 10, mix: { h0_dyn: 60, g0: 40 } },
  { id: 'b', name: 'B', seed: true, annual_gwh: 43.8, avg_mw: 5, mix: { g0: 100 } },
  { id: 't', name: 'T', seed: false, annual_gwh: 0, avg_mw: 0, mix: null },
] };

describe('applyDemandEdits', () => {
  it('returns seed rows only, with GWh and mix edits applied and avg MW recomputed', () => {
    const rows = applyDemandEdits(EST, { a: { gwh: 175.2 }, b: { mix: { g3: 100 } } });
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ annual_gwh: 175.2, avg_mw: 20, mix: { h0_dyn: 60, g0: 40 }, edited: true });
    expect(rows[1]).toMatchObject({ annual_gwh: 43.8, avg_mw: 5, mix: { g3: 100 }, edited: true, mixEdited: true });
  });
  it('with no edits returns the estimate as-is', () => {
    const rows = applyDemandEdits(EST, {});
    expect(rows[0]).toMatchObject({ annual_gwh: 87.6, avg_mw: 10, edited: false, mixEdited: false });
  });
  it('returns [] without an estimate', () => {
    expect(applyDemandEdits(null, {})).toEqual([]);
  });
});

describe('scaleEditsToTotal', () => {
  it('rescales every seed proportionally and keeps mix edits', () => {
    const edits = scaleEditsToTotal(EST, { b: { mix: { g3: 100 } } }, 262.8);
    const rows = applyDemandEdits(EST, edits);
    expect(rows[0].annual_gwh).toBeCloseTo(175.2, 6);
    expect(rows[1].annual_gwh).toBeCloseTo(87.6, 6);
    expect(rows[1].mix).toEqual({ g3: 100 });
  });
  it('spreads evenly when the current total is zero', () => {
    const zero = { substations: EST.substations.map(s => ({ ...s, annual_gwh: 0, avg_mw: 0 })) };
    const rows = applyDemandEdits(zero, scaleEditsToTotal(zero, {}, 10));
    expect(rows.map(r => r.annual_gwh)).toEqual([5, 5]);
  });
});

describe('demandByOsmId', () => {
  it('keys avg MW, GWh and mix by substation id, dropping zero rows', () => {
    const rows = applyDemandEdits(EST, { b: { gwh: 0 } });
    expect(demandByOsmId(rows)).toEqual({ a: { avgMW: 10, annualGWh: 87.6, mix: { h0_dyn: 60, g0: 40 } } });
  });
});

describe('seriesColumns', () => {
  it('writes one negative-MW column per substation with safe unique names', () => {
    const out = seriesColumns({
      datetimes: ['2024-01-01 00:00:00', '2024-01-01 01:00:00'],
      series: { k1: [1, 2], k2: [3, 4] },
      subs: [{ key: 'k1', name: 'Sub A' }, { key: 'k2', name: 'Sub A' }],
    });
    expect(out.columns).toEqual(['datetime', 'Sub_A', 'Sub_A_2']);
    expect(out.colBySub).toEqual(['Sub_A', 'Sub_A_2']);
    expect(out.data[1]).toEqual({ datetime: '2024-01-01 01:00:00', Sub_A: -2, Sub_A_2: -4 });
  });
});

describe('shapeWithFallback without the service', () => {
  let saved;
  beforeEach(() => { saved = globalThis.window; globalThis.window = undefined; });
  afterEach(() => { globalThis.window = saved; });

  it('builds a synthetic series per unique mix whose full-year mean is avg MW', async () => {
    const r = await shapeWithFallback({
      substations: [{ id: 'a', avg_mw: 10, mix: { h0_dyn: 60, g0: 40 } }, { id: 'b', avg_mw: 2, mix: { g0: 100 } }],
      start: '2024-01-01', end: '2024-12-31', resolution: '60min', country: 'CL', family: 'classic', latitude: -18.5,
    });
    expect(r.source).toBe('synthetic');
    expect(r.datetimes.length).toBe(8784);
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(r.series.a)).toBeCloseTo(10, 1);
    expect(mean(r.series.b)).toBeCloseTo(2, 2);
    expect(r.peak_mw.a).toBe(Math.max(...r.series.a));
  });
  it('gives a zero column for a zero-MW or mix-less substation', async () => {
    const r = await shapeWithFallback({
      substations: [{ id: 'z', avg_mw: 0, mix: { g0: 100 } }, { id: 'n', avg_mw: 3, mix: null }, { id: 'ok', avg_mw: 1, mix: { g0: 100 } }],
      start: '2024-01-01', end: '2024-01-01', resolution: '60min', latitude: 0,
    });
    expect(r.series.z).toEqual(new Array(24).fill(0));
    expect(r.series.n).toEqual(new Array(24).fill(0));
  });
});
