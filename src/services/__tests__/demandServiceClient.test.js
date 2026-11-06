import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDemandServiceURL, ensureDemandData, estimateDemand, shapeDemand,
} from '../demandServiceClient';

const URL_ = 'http://localhost:5006';
let savedWindow, savedFetch;
const withBridge = (demand) => {
  globalThis.window = { electronAPI: { getServiceURLs: async () => ({ demand }) } };
};
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => { savedWindow = globalThis.window; savedFetch = globalThis.fetch; });
afterEach(() => { globalThis.window = savedWindow; globalThis.fetch = savedFetch; });

describe('getDemandServiceURL', () => {
  it('is null outside Electron', async () => {
    globalThis.window = undefined;
    expect(await getDemandServiceURL()).toBeNull();
  });
  it('is null when the service is not running', async () => {
    withBridge({ url: URL_, running: false });
    expect(await getDemandServiceURL()).toBeNull();
  });
  it('returns the url when running', async () => {
    withBridge({ url: URL_, running: true });
    expect(await getDemandServiceURL()).toBe(URL_);
  });
});

describe('ensureDemandData', () => {
  beforeEach(() => withBridge({ url: URL_, running: true }));

  it('polls until ready and reports progress', async () => {
    const seq = [
      json({ state: 'downloading', done: 1, total: 4 }),
      json({ state: 'downloading', done: 2, total: 4 }),
      json({ state: 'ready', done: 4, total: 4 }),
    ];
    globalThis.fetch = vi.fn(async () => seq.shift());
    const seen = [];
    const r = await ensureDemandData(s => seen.push(s.done), { intervalMs: 1 });
    expect(r).toEqual({ ok: true });
    expect(seen).toEqual([1, 2, 4]);
    expect(globalThis.fetch.mock.calls[0][0]).toBe(`${URL_}/data/ensure`);
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('POST');
    expect(globalThis.fetch.mock.calls[1][0]).toBe(`${URL_}/data/status`);
  });

  it('error state gives {ok:false,error}', async () => {
    globalThis.fetch = vi.fn(async () => json({ state: 'error', error: 'disk full' }));
    expect(await ensureDemandData(null, { intervalMs: 1 })).toEqual({ ok: false, error: 'disk full' });
  });

  it('times out', async () => {
    globalThis.fetch = vi.fn(async () => json({ state: 'downloading' }));
    const r = await ensureDemandData(null, { intervalMs: 1, timeoutMs: 20 });
    expect(r.ok).toBe(false);
  });

  it('service unavailable', async () => {
    globalThis.window = undefined;
    expect((await ensureDemandData()).ok).toBe(false);
  });
});

describe('estimateDemand', () => {
  beforeEach(() => withBridge({ url: URL_, running: true }));

  it('posts JSON and returns the body', async () => {
    globalThis.fetch = vi.fn(async () => json({ substations: [1] }));
    const r = await estimateDemand({ modelYear: 2024 });
    expect(r).toEqual({ substations: [1] });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${URL_}/estimate`);
    expect(JSON.parse(init.body)).toEqual({ modelYear: 2024 });
  });
  it('409 -> data not ready', async () => {
    globalThis.fetch = vi.fn(async () => json({ detail: 'data not ready' }, 409));
    expect(await estimateDemand({})).toEqual({ error: 'data not ready' });
  });
  it('400 surfaces detail', async () => {
    globalThis.fetch = vi.fn(async () => json({ detail: 'bad mix' }, 400));
    expect(await estimateDemand({})).toEqual({ error: 'bad mix' });
  });
  it('422 array detail -> HTTP string', async () => {
    globalThis.fetch = vi.fn(async () => json({ detail: [{ loc: ['body', 'x'], msg: 'required' }] }, 422));
    expect(await estimateDemand({})).toEqual({ error: 'HTTP 422' });
  });
  it('network failure -> {error}', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await estimateDemand({})).toEqual({ error: 'ECONNREFUSED' });
  });
  it('service not running -> {error}', async () => {
    globalThis.window = undefined;
    expect(typeof (await estimateDemand({})).error).toBe('string');
  });
});

describe('shapeDemand', () => {
  beforeEach(() => withBridge({ url: URL_, running: true }));

  it('returns the body', async () => {
    globalThis.fetch = vi.fn(async () => json({ columns: [] }));
    expect(await shapeDemand({})).toEqual({ columns: [] });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(`${URL_}/shape`);
  });
  it('null on HTTP failure', async () => {
    globalThis.fetch = vi.fn(async () => json({ detail: 'x' }, 400));
    expect(await shapeDemand({})).toBeNull();
  });
  it('null on network failure', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('down'); });
    expect(await shapeDemand({})).toBeNull();
  });
  it('null when service not running', async () => {
    globalThis.window = undefined;
    expect(await shapeDemand({})).toBeNull();
  });
});
