import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamRun } from '../runService';

// Minimal EventSource stub whose instances are captured so the test can push
// SSE frames and inspect close() calls.
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.onmessage = null;
    this.onerror = null;
    FakeEventSource.instances.push(this);
  }
  close() { this.closed = true; }
  emit(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
FakeEventSource.instances = [];

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('streamRun', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource;
    globalThis.AbortSignal.timeout = () => undefined; // not exercised by the stub fetch
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('submits the model, streams log/stats, and resolves the full result on done', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-1' }))          // POST /run
      .mockResolvedValueOnce(jsonResponse({ objective: 1, dispatch: [1, 2] })) // GET /result
      .mockResolvedValue(jsonResponse({}));                             // DELETE /run (cancel)
    globalThis.fetch = fetchMock;

    const logs = [];
    const stats = [];
    const onDone = vi.fn();
    const onError = vi.fn();

    const { jobId, cancel } = await streamRun(
      'http://svc',
      { model: 'x' },
      { onLog: l => logs.push(l), onStats: s => stats.push(s), onDone, onError },
      { label: 'PyPSA' },
    );

    expect(jobId).toBe('job-1');
    // POST body + URL correct
    expect(fetchMock.mock.calls[0][0]).toBe('http://svc/run');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');

    const es = FakeEventSource.instances[0];
    expect(es.url).toBe('http://svc/run/job-1/stream');

    es.emit({ type: 'log', line: 'hello' });
    es.emit({ type: 'stats', elapsed: '1s', cpu_pct: 5 });
    es.emit({ type: 'done', result: { objective: 1 } });

    // let the result-fetch promise chain settle
    await new Promise(r => setTimeout(r, 0));

    expect(logs).toEqual(['hello']);
    expect(stats).toEqual([{ type: 'stats', elapsed: '1s', cpu_pct: 5 }]);
    expect(onDone).toHaveBeenCalledWith({ objective: 1, dispatch: [1, 2] });
    expect(onError).not.toHaveBeenCalled();
    expect(es.closed).toBe(true);

    // cancel closes ES and fires a DELETE
    cancel();
    expect(fetchMock).toHaveBeenLastCalledWith('http://svc/run/job-1', { method: 'DELETE' });
  });

  it('reports the server error string and closes on an error frame', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ job_id: 'job-2' }));
    const onError = vi.fn();
    const onDone = vi.fn();

    await streamRun('http://svc', { model: 'x' }, { onError, onDone }, { label: 'OSeMOSYS' });
    const es = FakeEventSource.instances[0];
    es.emit({ type: 'error', error: 'solver exploded' });

    expect(onError).toHaveBeenCalledWith('solver exploded');
    expect(onDone).not.toHaveBeenCalled();
    expect(es.closed).toBe(true);
  });

  it('falls back to the SSE summary if the result fetch fails', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-3' }))
      .mockResolvedValueOnce(jsonResponse({}, false, 500)); // /result not ok
    const onDone = vi.fn();

    await streamRun('http://svc', { model: 'x' }, { onDone }, { label: 'PyPSA' });
    FakeEventSource.instances[0].emit({ type: 'done', result: { objective: 42 } });
    await new Promise(r => setTimeout(r, 0));

    expect(onDone).toHaveBeenCalledWith({ objective: 42 });
  });

  it('uses the label in the rejection message when /run is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ detail: 'bad' }, false, 400));
    await expect(
      streamRun('http://svc', {}, {}, { label: 'PyPSA' }),
    ).rejects.toThrow(/PyPSA service rejected the run \(400\)/);
  });

  it('uses reachError override when the network call throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      streamRun('http://svc', {}, {}, { label: 'Calliope', reachError: 'Cannot reach Calliope 0.7 service at http://svc' }),
    ).rejects.toThrow('Cannot reach Calliope 0.7 service at http://svc: ECONNREFUSED');
  });

  it('does not report a disconnect error after an intentional close', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ job_id: 'job-4' }))
      .mockResolvedValueOnce(jsonResponse({ objective: 7 }));
    const onError = vi.fn();
    await streamRun('http://svc', {}, { onError }, { label: 'PyPSA' });
    const es = FakeEventSource.instances[0];
    es.emit({ type: 'done', result: {} });
    await new Promise(r => setTimeout(r, 0));
    es.onerror?.(); // browser fires onerror right after close()
    expect(onError).not.toHaveBeenCalled();
  });
});
