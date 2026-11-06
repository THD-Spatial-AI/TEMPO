import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRenewablesURL, checkRenewables, computePv } from '../renewablesClient';

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

  it('fails cleanly when the service is not running', async () => {
    window.electronAPI.getServiceURLs = async () => ({});
    expect(await computePv({}, null)).toEqual({ ok: false, error: 'renewables service not running' });
  });
});
