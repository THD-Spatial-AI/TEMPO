/**
 * runService.js
 * -------------
 * Shared SSE run protocol for every engine service. Calliope (0.6/0.7), PyPSA,
 * OSeMOSYS and AdOpT-NET0 all expose the identical run surface:
 *
 *   POST /run                → { job_id }
 *   GET  /run/{id}/stream    → SSE: {type:'log'|'stats'|'done'|'error', ...}
 *   GET  /run/{id}/result    → full result dict (heavy timeseries)
 *   DELETE /run/{id}         → cancel
 *
 * The per-engine clients (calliopeClient.js, engineClient.js) resolve which URL
 * to hit; this module owns the submit → stream → fetch-result → cancel flow so
 * the protocol lives in one place. It mirrors python/engine_service_base.py on
 * the server side.
 */

/**
 * Submit a model to an already-resolved engine service URL and stream results.
 *
 * @param {string} serviceUrl  Base URL of the engine service (no trailing slash)
 * @param {object} modelData   Full model payload sent as the /run body
 * @param {object} callbacks
 * @param {Function} [callbacks.onLog]    Called with each log string
 * @param {Function} [callbacks.onStats]  Called with a stats object (~every 10 s)
 * @param {Function} [callbacks.onDone]   Called with the full result object
 * @param {Function} [callbacks.onError]  Called with an error string
 * @param {object} [opts]
 * @param {string} [opts.label='engine']  Human name used in error messages
 * @param {string} [opts.reachError]      Override the "cannot reach" prefix
 * @returns {Promise<{jobId: string, cancel: Function}>}
 */
export async function streamRun(serviceUrl, modelData, { onLog, onStats, onDone, onError } = {}, opts = {}) {
  const label = opts.label || 'engine';
  const reachError = opts.reachError || `Cannot reach ${label} service at ${serviceUrl}`;

  // ── 1. Submit the model ────────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(`${serviceUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData),
    });
  } catch (err) {
    throw new Error(`${reachError}: ${err.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`${label} service rejected the run (${response.status}): ${text}`);
  }

  const { job_id: jobId } = await response.json();

  // ── 2. Open SSE stream ─────────────────────────────────────────────────────
  const es = new EventSource(`${serviceUrl}/run/${jobId}/stream`);

  // Guard: once the server sends done/error we close intentionally. Without this
  // flag the browser fires onerror right after close(), showing a spurious
  // "disconnected" notification even on success.
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
      // The SSE done event carries only a lightweight summary; fetch the full
      // result from the REST endpoint so the browser doesn't parse a 50-100 MB
      // SSE message.
      fetch(`${serviceUrl}/run/${jobId}/result`, {
        signal: AbortSignal.timeout(120_000),
      })
        .then(r => {
          if (!r.ok) throw new Error(`result fetch ${r.status}`);
          return r.json();
        })
        .then(fullResult => onDone?.(fullResult))
        .catch(() => onDone?.(event.result ?? {})); // fallback to SSE summary
    } else if (event.type === 'error') {
      finished = true;
      es.close();
      onError?.(event.error || `Unknown error from ${label} service`);
    }
  };

  es.onerror = () => {
    if (finished) return; // closed intentionally after done/error — not a real disconnect
    finished = true;
    es.close();
    onError?.(`Lost connection to ${label} service`);
  };

  // ── 3. Return jobId + cancel handle ────────────────────────────────────────
  const cancel = () => {
    es.close();
    fetch(`${serviceUrl}/run/${jobId}`, { method: 'DELETE' }).catch(() => {});
  };

  return { jobId, cancel };
}
