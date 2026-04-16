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

// In dev mode Vite proxies /api → localhost:5000 (see vite.config.js).
// In a packaged Electron build there is no proxy, so we ask the main process
// for the direct URL via IPC. Fall back to the env var or a sensible default.

let _resolvedServiceURL = null;

async function getServiceURL() {
  if (_resolvedServiceURL) return _resolvedServiceURL;

  // Electron packaged build: get the authoritative URL from the main process
  if (typeof window !== 'undefined' && window.electronAPI?.getCalliopeServiceURL) {
    try {
      const { url } = await window.electronAPI.getCalliopeServiceURL();
      _resolvedServiceURL = url;
      return _resolvedServiceURL;
    } catch { /* fall through */ }
  }

  // Dev / browser fallback
  _resolvedServiceURL =
    (import.meta.env && import.meta.env.VITE_CALLIOPE_SERVICE_URL) ||
    'http://localhost:5000';
  return _resolvedServiceURL;
}


/**
 * Returns true if the Calliope Docker service is reachable and healthy.
 */
export async function checkCalliopeService() {
  const SERVICE_URL = await getServiceURL();
  try {
    const res = await fetch(`${SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === 'ok';
  } catch {
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
