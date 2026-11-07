import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRenewablesURL, checkRenewables, computePv, optimiseOrientation, computeWind, bestWindPoint, listTurbines,
  atlasCountries, atlasStatus, ensureAtlas, fetchAtlasImage, fetchWindGrid,
} from '../renewablesClient';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('renewablesClient', () => {
  beforeEach(() => {
    globalThis.window = { electronAPI: {
      getServiceURLs: async () => ({ renewables: { url: 'http://localhost:5005', running: true } }),
      checkRenewables: async () => ({ envExists: true, serviceRunning: false }),
    } };
  });
  afterEach(() => { delete globalThis.window; vi.restoreAllMocks(); });

  it('reads the service URL only when running', async () => {
    expect(await getRenewablesURL()).toBe('http://localhost:5005');
    window.electronAPI.getServiceURLs = async () => ({ renewables: { url: 'x', running: false } });
    expect(await getRenewablesURL()).toBeNull();
  });

  it('maps the engine check to installed/running', async () => {
    expect(await checkRenewables()).toEqual({ installed: true, running: false });
    delete window.electronAPI.checkRenewables;
    expect(await checkRenewables()).toEqual({ installed: false, running: false });
  });

  it('starts a job and polls until done, reporting progress', async () => {
    const seen = [];
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'j1' }))
      .mockResolvedValueOnce(json({ state: 'running', done: 0, total: 1 }))
      .mockResolvedValueOnce(json({ state: 'done', done: 1, total: 1, result: { a: { mean_cf: 0.2 } } }));
    const res = await computePv({ points: [], year: 2023 }, s => seen.push(s.state), { intervalMs: 0 });
    expect(res).toEqual({ ok: true, result: { a: { mean_cf: 0.2 } } });
    expect(seen).toEqual(['running', 'done']);
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:5005/pv');
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:5005/jobs/j1');
  });

  it('returns the service error text on 400 and on a failed job', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ detail: 'weather year must be …' }, 400));
    expect(await computePv({}, null, { intervalMs: 0 })).toEqual({ ok: false, error: 'weather year must be …' });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'j' }))
      .mockResolvedValueOnce(json({ state: 'error', error: 'network down' }));
    expect(await computePv({}, null, { intervalMs: 0 })).toEqual({ ok: false, error: 'network down' });
  });

  it('stops polling when the signal is aborted, before a poll or while waiting', async () => {
    const pre = new AbortController();
    pre.abort();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ job_id: 'j' }));
    expect(await computePv({}, null, { intervalMs: 0, signal: pre.signal })).toEqual({ ok: false, error: 'cancelled' });
    expect(fetch).toHaveBeenCalledTimes(1);

    const ac = new AbortController();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'j' }))
      .mockResolvedValue(json({ state: 'running', done: 0, total: 1 }));
    const p = computePv({}, () => ac.abort(), { intervalMs: 60_000, signal: ac.signal });
    expect(await p).toEqual({ ok: false, error: 'cancelled' });
    expect(fetch).toHaveBeenCalledTimes(2);

    const mid = new AbortController();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'j' }))
      .mockResolvedValue(json({ state: 'running', done: 0, total: 1 }));
    setTimeout(() => mid.abort(), 20);
    expect(await computePv({}, null, { intervalMs: 60_000, signal: mid.signal })).toEqual({ ok: false, error: 'cancelled' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('optimiseOrientation posts to /optimise-orientation and polls the job', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'o1' }))
      .mockResolvedValueOnce(json({ state: 'done', result: { a: { tilt: 30, azimuth: 0, gain_pct: 12 } } }));
    const res = await optimiseOrientation({ points: [], year: 2023, period: 'year' }, null, { intervalMs: 0 });
    expect(res).toEqual({ ok: true, result: { a: { tilt: 30, azimuth: 0, gain_pct: 12 } } });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:5005/optimise-orientation');
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:5005/jobs/o1');
  });

  it('computeWind and bestWindPoint post to their paths', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'w' })).mockResolvedValueOnce(json({ state: 'done', result: {} }))
      .mockResolvedValueOnce(json({ job_id: 'b' })).mockResolvedValueOnce(json({ state: 'done', result: {} }));
    await computeWind({}, null, { intervalMs: 0 });
    await bestWindPoint({}, null, { intervalMs: 0 });
    expect(fetch.mock.calls.map(c => c[0])).toEqual([
      'http://localhost:5005/wind', 'http://localhost:5005/jobs/w',
      'http://localhost:5005/best-wind-point', 'http://localhost:5005/jobs/b',
    ]);
  });

  it('listTurbines returns the list or an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ turbines: [{ id: 'generic_iec2' }] }));
    expect(await listTurbines()).toEqual({ ok: true, turbines: [{ id: 'generic_iec2' }] });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ detail: 'windpowerlib missing — reinstall the Renewables component' }, 503));
    expect(await listTurbines()).toEqual({ ok: false, error: 'windpowerlib missing — reinstall the Renewables component' });
    window.electronAPI.getServiceURLs = async () => ({});
    expect(await listTurbines()).toEqual({ ok: false, error: 'renewables service not running' });
  });

  it('atlasCountries and atlasStatus GET their paths', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ countries: ['Chile', 'Germany'] }))
      .mockResolvedValueOnce(json({ ready: true }))
      .mockResolvedValueOnce(json({ detail: 'reinstall the Renewables component' }, 503));
    expect(await atlasCountries()).toEqual({ ok: true, countries: ['Chile', 'Germany'] });
    expect(await atlasStatus({ layer: 'pvout', country: 'Côte d’Ivoire' })).toEqual({ ok: true, ready: true });
    expect(await atlasStatus({ layer: 'wind100', country: 'Chile' }))
      .toEqual({ ok: false, status: 503, error: 'reinstall the Renewables component' });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:5005/atlas/countries');
    const q = new URL(fetch.mock.calls[1][0]);
    expect(q.pathname).toBe('/atlas/status');
    expect(Object.fromEntries(q.searchParams)).toEqual({ layer: 'pvout', country: 'Côte d’Ivoire' });
  });

  it('ensureAtlas runs the /atlas/ensure job', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json({ job_id: 'a1' }))
      .mockResolvedValueOnce(json({ state: 'done', result: { ready: true } }));
    expect(await ensureAtlas({ layer: 'pvout', country: 'Chile' }, null, { intervalMs: 0 }))
      .toEqual({ ok: true, result: { ready: true } });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:5005/atlas/ensure');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ layer: 'pvout', country: 'Chile' });
  });

  it('fetchAtlasImage returns an object URL and the X-Bounds, or the error status', async () => {
    const blob = { size: 3 };
    URL.createObjectURL = vi.fn(() => 'blob:atlas');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: k => (k.toLowerCase() === 'x-bounds' ? '-71,-34,-70,-33' : null) }, blob: async () => blob })
      .mockResolvedValueOnce(json({ detail: 'atlas not downloaded' }, 409));
    const req = { layer: 'pvout', country: 'Chile', south: -34.5, west: -71.5, north: -33, east: -70, width: 800 };
    expect(await fetchAtlasImage(req)).toEqual({ ok: true, url: 'blob:atlas', bounds: [-71, -34, -70, -33] });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    const q = new URL(fetch.mock.calls[0][0]);
    expect(q.pathname).toBe('/atlas/image');
    expect(Object.fromEntries(q.searchParams)).toEqual({
      layer: 'pvout', country: 'Chile', south: '-34.5', west: '-71.5', north: '-33', east: '-70', width: '800',
    });
    expect(await fetchAtlasImage(req)).toEqual({ ok: false, status: 409, error: 'atlas not downloaded' });
  });

  it('fetchWindGrid returns the grid or the error', async () => {
    const grid = { lats: [0, 1], lons: [0, 1], date: '2026-10-31', u: [], v: [] };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(json(grid))
      .mockResolvedValueOnce(json({ detail: 'bad date' }, 400));
    const req = { south: 0, west: 0, north: 1, east: 1, date: '2026-10-31', n: 16 };
    expect(await fetchWindGrid(req)).toEqual({ ok: true, grid });
    const q = new URL(fetch.mock.calls[0][0]);
    expect(q.pathname).toBe('/wind-grid');
    expect(Object.fromEntries(q.searchParams)).toEqual({ south: '0', west: '0', north: '1', east: '1', date: '2026-10-31', n: '16' });
    expect(await fetchWindGrid(req)).toEqual({ ok: false, status: 400, error: 'bad date' });
  });

  it('overlay calls fail cleanly when the service is not running', async () => {
    window.electronAPI.getServiceURLs = async () => ({});
    const off = { ok: false, error: 'renewables service not running' };
    expect(await atlasCountries()).toEqual(off);
    expect(await atlasStatus({ layer: 'pvout', country: 'Chile' })).toEqual(off);
    expect(await fetchAtlasImage({ layer: 'pvout', country: 'Chile' })).toEqual(off);
    expect(await fetchWindGrid({})).toEqual(off);
  });

  it('fails cleanly when the service is not running', async () => {
    window.electronAPI.getServiceURLs = async () => ({});
    expect(await computePv({}, null)).toEqual({ ok: false, error: 'renewables service not running' });
  });
});
