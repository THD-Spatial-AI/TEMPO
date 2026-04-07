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

const SERVICE_URL =
  (import.meta.env && import.meta.env.VITE_CALLIOPE_SERVICE_URL) ||
  'http://localhost:5000';

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Returns true if the Calliope Docker service is reachable and healthy.
 */
export async function checkCalliopeService() {
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
 * @param {Function} [options.onDone]   - Called with the result object when optimisation finishes
 * @param {Function} [options.onError]  - Called with an error string on failure
 *
 * @returns {Promise<{jobId: string, cancel: Function}>}
 *   jobId  – server-assigned UUID for this run
 *   cancel – closes the SSE connection and asks the server to mark the job cancelled
 */
export async function runCalliopeModel({ modelData, onLog, onDone, onError }) {
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

  es.onmessage = (evt) => {
    let event;
    try {
      event = JSON.parse(evt.data);
    } catch {
      return; // skip malformed frames (e.g. keepalive comments)
    }

    if (event.type === 'log') {
      onLog?.(event.line);
    } else if (event.type === 'done') {
      es.close();
      onDone?.(event.result);
    } else if (event.type === 'error') {
      es.close();
      onError?.(event.error || 'Unknown error from Calliope service');
    }
  };

  es.onerror = () => {
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
