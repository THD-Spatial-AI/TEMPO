import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMemeModel, checkMemeService, fetchMemeBundle } from '../memeClient.js';

// A minimal internal model with one placed supply tech (keeps translation
// warnings out of the way).
const modelData = {
  name: 'M',
  technologies: [{
    name: 'solar',
    essentials: { parent: 'supply', carrier_out: 'electricity' },
    constraints: { energy_cap_max: 100 },
    costs: {},
  }],
  locations: [{ name: 'n', latitude: 1, longitude: 2, techs: { solar: null } }],
  links: [],
  metadata: { modelConfig: {}, runConfig: {} },
};

const server = { url: 'http://vm.example:8080/', apiKey: 's3cret' };
const contract = { objective: 42, termination_condition: 'optimal', capacities: { 'n::solar': 80 } };

function makeRes(body, { ok = true, status = 200 } = {}) {
  return {
    ok, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

// Build a fetch router driven by a queue of status objects.
function installFetch({ submit, statuses, resultJson = contract, caps }) {
  const calls = [];
  const queue = [...statuses];
  const fn = vi.fn(async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/simulate')) {
      if (submit.reject) return makeRes(submit.body, { ok: false, status: submit.status });
      return makeRes(submit.body);
    }
    if (url.includes('/status')) return makeRes(queue.length > 1 ? queue.shift() : queue[0]);
    if (url.includes('/result.json')) return makeRes(resultJson);
    if (url.includes('/capabilities')) return caps ? makeRes(caps) : makeRes({}, { ok: false, status: 503 });
    if (/\/jobs\/[^/]+$/.test(url)) return makeRes({ zip: true });
    throw new Error(`unexpected fetch ${url}`);
  });
  globalThis.fetch = fn;
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// Guards & submit
// ---------------------------------------------------------------------------

describe('runMemeModel – guards', () => {
  it('throws for an engine MEME cannot run', async () => {
    await expect(runMemeModel('osemosys', { server, modelData })).rejects.toThrow(/cannot run on MEME/i);
    await expect(runMemeModel('calliope', { server, modelData })).rejects.toThrow(/cannot run on MEME/i);
  });

  it('throws when no server URL is configured', async () => {
    await expect(runMemeModel('pypsa', { server: { url: '' }, modelData })).rejects.toThrow(/No MEME server URL/i);
  });

  it('surfaces a MEME rejection (422/401) as a thrown error', async () => {
    installFetch({ submit: { reject: true, status: 422, body: { error: 'bad payload' } }, statuses: [] });
    await expect(runMemeModel('pypsa', { server, modelData })).rejects.toThrow('bad payload');
  });
});

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

describe('runMemeModel – poll loop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('submits with target + top-level api_key, then streams logs and the contract', async () => {
    const { calls } = installFetch({
      submit: { body: { id: 'job1', state: 'queued', warnings: ['heads up'] } },
      statuses: [
        { state: 'running', log: 'line1\n' },
        { state: 'succeeded', log: 'line1\nline2\n', target: 'pypsa' },
      ],
    });
    const onLog = vi.fn(), onStats = vi.fn(), onDone = vi.fn(), onError = vi.fn();

    const { jobId } = await runMemeModel('pypsa', {
      server, modelData, onLog, onStats, onDone, onError, pollMs: 1000,
    });
    expect(jobId).toBe('job1');

    // submit call: correct target + api_key in body
    const submitCall = calls.find((c) => c.url.includes('/simulate'));
    expect(submitCall.url).toContain('target=pypsa');
    const sentBody = JSON.parse(submitCall.opts.body);
    expect(sentBody.api_key).toBe('s3cret');
    expect(sentBody.model.technologies.solar.role).toBe('supply');

    await vi.advanceTimersByTimeAsync(1000); // poll → running
    await vi.advanceTimersByTimeAsync(1000); // poll → succeeded → contract

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(contract);
    expect(onLog).toHaveBeenCalledWith('[MEME] heads up');
    expect(onLog).toHaveBeenCalledWith('line1');
    expect(onLog).toHaveBeenCalledWith('line2');
    expect(onStats).toHaveBeenCalledWith(expect.objectContaining({ elapsed: expect.any(Number) }));
  });

  it('prefers an inline contract in status over a result.json fetch', async () => {
    const { calls } = installFetch({
      submit: { body: { id: 'j2', state: 'queued' } },
      statuses: [{ state: 'succeeded', target: 'calliope', contract, log: '' }],
    });
    const onDone = vi.fn();
    await runMemeModel('calliope07', { server, modelData, onDone, pollMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    expect(onDone).toHaveBeenCalledWith(contract);
    expect(calls.some((c) => c.url.includes('/result.json'))).toBe(false);
  });

  it('reads the contract from runs[].contract (MEME job-view shape)', async () => {
    const { calls } = installFetch({
      submit: { body: { id: 'j2b', state: 'queued' } },
      statuses: [{
        state: 'succeeded', target: 'calliope', log: '',
        runs: [{ target: 'calliope', index: 0, exit_code: 0, contract }],
      }],
    });
    const onDone = vi.fn();
    await runMemeModel('calliope07', { server, modelData, onDone, pollMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    expect(onDone).toHaveBeenCalledWith(contract);
    expect(calls.some((c) => c.url.includes('/result.json'))).toBe(false);
  });

  it('reports a failed job via onError', async () => {
    installFetch({
      submit: { body: { id: 'j3', state: 'queued' } },
      statuses: [{ state: 'failed', error: 'solver infeasible', log: '' }],
    });
    const onDone = vi.fn(), onError = vi.fn();
    await runMemeModel('pypsa', { server, modelData, onDone, onError, pollMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('solver infeasible');
  });

  it('cancel() stops polling — no further callbacks fire', async () => {
    installFetch({
      submit: { body: { id: 'j4', state: 'queued' } },
      statuses: [{ state: 'running', log: 'working\n' }],
    });
    const onDone = vi.fn(), onError = vi.fn();
    const { cancel } = await runMemeModel('pypsa', { server, modelData, onDone, onError, pollMs: 500 });

    await vi.advanceTimersByTimeAsync(500); // one running poll
    cancel();
    await vi.advanceTimersByTimeAsync(5000); // would be many more polls if not cancelled

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('gives up after repeated status failures', async () => {
    // status always returns 500
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('/simulate')) return makeRes({ id: 'j5', state: 'queued' });
      if (url.includes('/status')) return makeRes({}, { ok: false, status: 500 });
      throw new Error(`unexpected ${url}`);
    });
    const onError = vi.fn();
    await runMemeModel('pypsa', { server, modelData, onError, pollMs: 100 });
    await vi.advanceTimersByTimeAsync(100 * 8); // exceed MAX_STATUS_ERRORS

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Lost contact with MEME/));
  });
});

// ---------------------------------------------------------------------------
// checkMemeService / fetchMemeBundle
// ---------------------------------------------------------------------------

describe('checkMemeService', () => {
  it('returns capabilities JSON when reachable', async () => {
    installFetch({ submit: { body: {} }, statuses: [], caps: { targets: ['pypsa', 'calliope', 'adopt-net0'] } });
    const caps = await checkMemeService(server);
    expect(caps.targets).toContain('pypsa');
  });

  it('returns null when unreachable or unhealthy', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await checkMemeService(server)).toBeNull();
    globalThis.fetch = vi.fn(async () => makeRes({}, { ok: false, status: 503 }));
    expect(await checkMemeService(server)).toBeNull();
  });
});

describe('fetchMemeBundle', () => {
  it('returns a Blob for a finished job', async () => {
    globalThis.fetch = vi.fn(async () => makeRes({ zip: true }));
    const blob = await fetchMemeBundle(server, 'job1');
    expect(blob).toBeInstanceOf(Blob);
  });
});
