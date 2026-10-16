import { describe, it, expect, vi, afterEach } from 'vitest';
import { assessEngineModel } from '../engineClient.js';
import { assessCalliopeModel } from '../calliopeClient.js';

const report = { engine: 'x', ok: true, errors: [], warnings: [], features: {}, fidelity: 'full' };
const model = { name: 'M' };

afterEach(() => { vi.unstubAllGlobals(); });

describe.each([
  ['assessEngineModel', () => assessEngineModel('pypsa', model)],
  ['assessCalliopeModel', () => assessCalliopeModel('0.6', model)],
])('%s', (_name, call) => {
  it('resolves the parsed JSON on 200 and posts to /assess', async () => {
    const fn = vi.fn(async () => ({ ok: true, json: async () => report }));
    vi.stubGlobal('fetch', fn);
    expect(await call()).toEqual(report);
    const [url, opts] = fn.mock.calls[0];
    expect(url).toMatch(/\/assess$/);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(model);
  });

  it('resolves null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await call()).toBeNull();
  });

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await call()).toBeNull();
  });
});
