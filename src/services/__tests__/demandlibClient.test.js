import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkDemandlib, fetchDemandlibShape, listSlpProfiles, syntheticShape, getDemandShape,
  regenerateDemandSeries,
} from '../demandlibClient';

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const week = { start: '2024-04-08', end: '2024-04-14', resolution: '60min', sectors: { h0: 1 } };

let savedWindow;
beforeEach(() => { savedWindow = globalThis.window; });
afterEach(() => { globalThis.window = savedWindow; });

describe('demandlibClient — no Electron bridge', () => {
  beforeEach(() => { globalThis.window = undefined; });

  it('checkDemandlib is false', async () => {
    expect(await checkDemandlib()).toBe(false);
  });

  it('fetchDemandlibShape returns null', async () => {
    expect(await fetchDemandlibShape(week)).toBeNull();
  });

  it('listSlpProfiles returns null', async () => {
    expect(await listSlpProfiles(2024)).toBeNull();
  });

  it('getDemandShape falls back to the synthetic shape', async () => {
    const r = await getDemandShape({ ...week, latitude: -33 });
    expect(r.source).toBe('synthetic');
    expect(r.values.length).toBe(7 * 24);
  });
});

describe('syntheticShape', () => {
  it('maps SLP sectors to synthetic profiles and stays mean≈1 over a full year', () => {
    const r = syntheticShape({ start: '2024-01-01', end: '2024-12-31', resolution: '60min', sectors: { h0: 1 }, latitude: 52 });
    expect(r.source).toBe('synthetic');
    expect(mean(r.values)).toBeCloseTo(1, 2);
  });

  it('blends multiple SLP codes into one non-negative shape', () => {
    const r = syntheticShape({ ...week, sectors: { h0: 1, g0: 1 }, latitude: 0 });
    expect(r.values.length).toBe(7 * 24);
    expect(r.values.every(v => v >= 0)).toBe(true);
  });
});

describe('demandlibClient — mocked bridge', () => {
  it('getDemandShape uses demandlib when the bridge succeeds', async () => {
    globalThis.window = {
      electronAPI: { generateDemandProfile: async () => ({ ok: true, data: { datetimes: ['2024-04-08 00:00:00'], values: [1, 2, 3] } }) },
    };
    const r = await getDemandShape(week);
    expect(r.source).toBe('demandlib');
    expect(r.values).toEqual([1, 2, 3]);
  });

  it('getDemandShape falls back to synthetic when the bridge errors', async () => {
    globalThis.window = {
      electronAPI: { generateDemandProfile: async () => ({ ok: false, error: 'boom' }) },
    };
    const r = await getDemandShape({ ...week, latitude: 10 });
    expect(r.source).toBe('synthetic');
    expect(r.values.length).toBe(7 * 24);
  });
});

describe('regenerateDemandSeries', () => {
  beforeEach(() => { globalThis.window = undefined; }); // synthetic path

  const entry = {
    name: 'osm_substation_demand', fileName: 'osm_substation_demand.csv',
    columns: ['datetime', 'dem_1'], dataColumns: ['dem_1'],
    data: [{ datetime: 'old', dem_1: -1 }], // stale (1 row)
    demandConfig: { sectors: { h0: 1 }, country: 'DE', resolution: '60min', latitude: 0, groups: [{ col: 'dem_1', mw: 5 }] },
  };

  it('rebuilds the data for the current model dates, keeping the same columns', async () => {
    const updated = await regenerateDemandSeries(entry, { startDate: '2024-01-01', endDate: '2024-01-01', resolution: '60min' });
    expect(updated.data).toHaveLength(24);       // one day, hourly
    expect(updated.rowCount).toBe(24);
    expect(updated.columns).toEqual(['datetime', 'dem_1']);
    expect(updated.modified).toBe(true);
    expect(updated.demandConfig.source).toBe('synthetic');
    // Absolute negative MW = -(shape × 5).
    expect(updated.data.every(r => r.dem_1 <= 0)).toBe(true);
  });

  it('honours a changed resolution', async () => {
    const updated = await regenerateDemandSeries(entry, { startDate: '2024-01-01', endDate: '2024-01-01', resolution: '15min' });
    expect(updated.data).toHaveLength(96);
    expect(updated.demandConfig.resolution).toBe('15min');
  });
});
