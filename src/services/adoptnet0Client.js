/**
 * adoptnet0Client.js
 * ------------------
 * HTTP client for the AdOpT-NET0 FastAPI service (default: http://localhost:5001).
 *
 * Usage:
 *   import { checkAdoptnet0Service, runAdoptnet0Model } from './adoptnet0Client';
 *
 *   const ok = await checkAdoptnet0Service();
 *
 *   const { jobId, cancel } = await runAdoptnet0Model({
 *     modelData: { ...model, solver: 'highs' },
 *     onLog:   (line)   => console.log(line),
 *     onDone:  (result) => console.log('done', result),
 *     onError: (err)    => console.error('error', err),
 *   });
 */

// ---------------------------------------------------------------------------
// Service URL resolution
// ---------------------------------------------------------------------------

async function getServiceURL() {
  if (typeof window !== 'undefined' && window.electronAPI?.getAdoptnet0ServiceURL) {
    try {
      const { url } = await window.electronAPI.getAdoptnet0ServiceURL();
      if (url) return url;
    } catch { /* fall through */ }
  }

  if (import.meta.env?.VITE_ADOPTNET0_SERVICE_URL) {
    return import.meta.env.VITE_ADOPTNET0_SERVICE_URL;
  }

  return 'http://localhost:5001';
}

/**
 * Returns true if the AdOpT-NET0 service is reachable and healthy.
 */
export async function checkAdoptnet0Service() {
  const SERVICE_URL = await getServiceURL();
  try {
    const res = await fetch(`${SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
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
 * Submit a model to the AdOpT-NET0 service and stream results via SSE.
 *
 * @param {object} options
 * @param {object}   options.modelData  - Full model payload
 * @param {Function} [options.onLog]    - Called with each log string
 * @param {Function} [options.onStats]  - Called with resource stats every ~10 s
 * @param {Function} [options.onDone]   - Called with the result object on completion
 * @param {Function} [options.onError]  - Called with an error string on failure
 *
 * @returns {Promise<{jobId: string, cancel: Function}>}
 */
export async function runAdoptnet0Model({ modelData, onLog, onStats, onDone, onError }) {
  const SERVICE_URL = await getServiceURL();

  let response;
  try {
    response = await fetch(`${SERVICE_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData),
    });
  } catch (err) {
    throw new Error(`Cannot reach AdOpT-NET0 service at ${SERVICE_URL}: ${err.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`AdOpT-NET0 service rejected the run (${response.status}): ${text}`);
  }

  const { job_id: jobId } = await response.json();

  const es = new EventSource(`${SERVICE_URL}/run/${jobId}/stream`);
  let finished = false;

  es.onmessage = (evt) => {
    let event;
    try { event = JSON.parse(evt.data); } catch { return; }

    if (event.type === 'log') {
      onLog?.(event.line);
    } else if (event.type === 'stats') {
      onStats?.(event);
    } else if (event.type === 'done') {
      finished = true;
      es.close();
      fetch(`${SERVICE_URL}/run/${jobId}/result`, {
        signal: AbortSignal.timeout(120_000),
      })
        .then(r => { if (!r.ok) throw new Error(`result fetch ${r.status}`); return r.json(); })
        .then(fullResult => onDone?.(fullResult))
        .catch(() => onDone?.(event.result ?? {}));
    } else if (event.type === 'error') {
      finished = true;
      es.close();
      onError?.(event.error || 'Unknown error from AdOpT-NET0 service');
    }
  };

  es.onerror = () => {
    if (finished) return;
    finished = true;
    es.close();
    onError?.('Lost connection to AdOpT-NET0 service');
  };

  const cancel = () => {
    es.close();
    fetch(`${SERVICE_URL}/run/${jobId}`, { method: 'DELETE' }).catch(() => {});
  };

  return { jobId, cancel };
}
