/**
 * calliopeClient.js
 * -----------------
 * HTTP client for the Calliope Docker web service.
 *
 * The service is expected at VITE_CALLIOPE_SERVICE_URL (default: http://localhost:5000).
 * Set the env variable in a .env file for custom deployments.
 *
 * Usage:
 *   import { checkCalliopeService, runCalliopeModel } from './calliopeClient';
 *
 *   const ok = await checkCalliopeService();
 *
 *   const { jobId, cancel } = await runCalliopeModel({
 *     modelData: { ...model, solver: 'highs' },
 *     onLog:   (line)   => console.log(line),
 *     onDone:  (result) => console.log('done', result),
 *     onError: (err)    => console.error('error', err),
 *   });
 *
 *   // To cancel:
 *   cancel();
 */

// ---------------------------------------------------------------------------
// Service URL resolution
// ---------------------------------------------------------------------------

// In Electron (packaged), the renderer has no dev proxy – ask the main process
// for the direct URL via IPC.  In the browser (both dev and prod), we call
// http://localhost:5000 directly; since the service uses allow_origins=["*"]
// this works from any origin including the Vite dev server.
// An explicit VITE_CALLIOPE_SERVICE_URL env var overrides everything.
//
// NOTE: URL is NOT cached — it is resolved fresh each call so that hot-module
// replacement never leaves a stale value behind.

async function getServiceURL() {
  // Electron packaged build: get the authoritative URL from the main process
  if (typeof window !== 'undefined' && window.electronAPI?.getCalliopeServiceURL) {
    try {
      const { url } = await window.electronAPI.getCalliopeServiceURL();
      if (url) return url;
    } catch { /* fall through */ }
  }

  // Explicit override via env var (for custom deployments)
  if (import.meta.env?.VITE_CALLIOPE_SERVICE_URL) {
    return import.meta.env.VITE_CALLIOPE_SERVICE_URL;
  }

  // Default: direct URL — CORS allow_origins=["*"] lets the browser reach it
  return 'http://localhost:5000';
}


/**
 * Returns true if the Calliope Docker service is reachable and healthy.
 */
export async function checkCalliopeService() {
  const SERVICE_URL = await getServiceURL();
  console.debug('[calliopeClient] health-check →', SERVICE_URL + '/health');
  try {
    const res = await fetch(`${SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('[calliopeClient] health-check HTTP', res.status);
      return false;
    }
    const data = await res.json();
    const ok = data?.status === 'ok';
    console.debug('[calliopeClient] health-check result:', ok, data);
    return ok;
  } catch (err) {
    console.warn('[calliopeClient] health-check failed:', err?.message ?? err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Run a model
// ---------------------------------------------------------------------------

/**
 * Submit a model to the Calliope service and stream results via SSE.
 *
 * @param {object} options
 * @param {object}   options.modelData  - Full model payload (locations, links, techs, solver, …)
 * @param {Function} [options.onLog]    - Called with each log string as the solver runs
 * @param {Function} [options.onStats]  - Called with a stats object every ~10 s: { elapsed, cpu_pct, proc_ram_mb, sys_ram_pct, sys_ram_used_gb, sys_ram_total_gb }
 * @param {Function} [options.onDone]   - Called with the result object when optimisation finishes
 * @param {Function} [options.onError]  - Called with an error string on failure
 *
 * @returns {Promise<{jobId: string, cancel: Function}>}
 *   jobId  – server-assigned UUID for this run
 *   cancel – closes the SSE connection and asks the server to mark the job cancelled
 */
export async function runCalliopeModel({ modelData, onLog, onStats, onDone, onError }) {
  const SERVICE_URL = await getServiceURL();
  // ── 1. Submit the model ──────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(`${SERVICE_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData),
    });
  } catch (err) {
    throw new Error(`Cannot reach Calliope service at ${SERVICE_URL}: ${err.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Calliope service rejected the run (${response.status}): ${text}`);
  }

  const { job_id: jobId } = await response.json();

  // ── 2. Open SSE stream ───────────────────────────────────────────────────
  const es = new EventSource(`${SERVICE_URL}/run/${jobId}/stream`);

  // Guard: once the server sends done/error we close intentionally.
  // Without this flag, the browser fires onerror right after close(), which
  // would show a spurious "disconnected" notification even on success.
  let finished = false;

  es.onmessage = (evt) => {
    let event;
    try {
      event = JSON.parse(evt.data);
    } catch {
      return; // skip malformed frames (e.g. keepalive comments)
    }

    if (event.type === 'log') {
      onLog?.(event.line);
    } else if (event.type === 'stats') {
      onStats?.(event);
    } else if (event.type === 'done') {
      finished = true;
      es.close();
      // The SSE done event contains only a lightweight summary (no large timeseries).
      // Fetch the full result from the dedicated REST endpoint so the browser
      // doesn't have to parse a potentially 50-100 MB SSE message.
      fetch(`${SERVICE_URL}/run/${jobId}/result`, {
        signal: AbortSignal.timeout(120_000), // 2-minute timeout for large result payloads
      })
        .then(r => {
          if (!r.ok) throw new Error(`result fetch ${r.status}`);
          return r.json();
        })
        .then(fullResult => onDone?.(fullResult))
        .catch(() => {
          // Fallback: use whatever the SSE summary carried (objective etc. still present)
          onDone?.(event.result ?? {});
        });
    } else if (event.type === 'error') {
      finished = true;
      es.close();
      onError?.(event.error || 'Unknown error from Calliope service');
    }
  };

  es.onerror = () => {
    if (finished) return; // SSE closed intentionally after done/error — not a real disconnect
    finished = true;
    es.close();
    onError?.('Lost connection to Calliope service');
  };

  // ── 3. Return jobId + cancel handle ─────────────────────────────────────
  const cancel = () => {
    es.close();
    // Best-effort: ask the server to mark the job as cancelled
    fetch(`${SERVICE_URL}/run/${jobId}`, { method: 'DELETE' }).catch(() => {});
  };

  return { jobId, cancel };
}
