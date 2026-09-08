import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkDemandlib, fetchDemandlibShape, listSlpProfiles, syntheticShape, getDemandShape,
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
