/**
 * calliopeClient.js
 * -----------------
 * HTTP client for the Calliope web services.
 *
 * TEMPO runs up to two Calliope engines side by side:
 *   '0.6' — Calliope 0.6.8, the stable default engine  (default: localhost:5000)
 *   '0.7' — Calliope 0.7 (experimental), opt-in engine (default: localhost:5002)
 *
 * The engine is resolved from the model's calliopeVersion — callers don't
 * need to pass it explicitly. Explicit VITE_CALLIOPE_SERVICE_URL /
 * VITE_CALLIOPE07_SERVICE_URL env vars override everything.
 *
 * Usage:
 *   import { checkCalliopeService, runCalliopeModel } from './calliopeClient';
 *
 *   const ok = await checkCalliopeService();        // 0.6 engine
 *   const ok7 = await checkCalliopeService('0.7');  // 0.7 engine
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

import { streamRun } from './runService';

// ---------------------------------------------------------------------------
// Engine + service URL resolution
// ---------------------------------------------------------------------------

/**
 * Map a model's calliopeVersion string to an engine id.
 * @param {string|undefined} calliopeVersion  e.g. '0.6.8', '0.7.0'
 * @returns {'0.6'|'0.7'}
 */
export function engineForVersion(calliopeVersion) {
  return String(calliopeVersion || '').startsWith('0.7') ? '0.7' : '0.6';
}

/**
 * Resolve the engine for a run payload from the calliopeVersion stored in
 * modelConfig (Run UI) or metadata.modelConfig (model creation).
 */
export function engineForModelData(modelData) {
  const version =
    modelData?.modelConfig?.calliopeVersion ??
    modelData?.metadata?.modelConfig?.calliopeVersion;
  return engineForVersion(version);
}

// In Electron (packaged), the renderer has no dev proxy – ask the main process
// for the direct URL via IPC.  In the browser (both dev and prod), we call
// the localhost port directly; since the service uses allow_origins=["*"]
// this works from any origin including the Vite dev server.
//
// NOTE: URL is NOT cached — it is resolved fresh each call so that hot-module
// replacement never leaves a stale value behind.

async function getServiceURL(engine = '0.6') {
  if (engine === '0.7') {
    if (typeof window !== 'undefined' && window.electronAPI?.getCalliope07ServiceURL) {
      try {
        const { url } = await window.electronAPI.getCalliope07ServiceURL();
        if (url) return url;
      } catch { /* fall through */ }
    }
    if (import.meta.env?.VITE_CALLIOPE07_SERVICE_URL) {
      return import.meta.env.VITE_CALLIOPE07_SERVICE_URL;
    }
    return 'http://localhost:5002';
  }

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
 * Returns true if the requested Calliope engine service is reachable and healthy.
 * @param {'0.6'|'0.7'} [engine]
 */
export async function checkCalliopeService(engine = '0.6') {
  const SERVICE_URL = await getServiceURL(engine);
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
 * The target engine (0.6.8 or 0.7) is resolved from the payload's
 * calliopeVersion — see engineForModelData().
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
  const engine = engineForModelData(modelData);
  const SERVICE_URL = await getServiceURL(engine);
  if (engine === '0.7') {
    onLog?.('[TEMPO] Using the Calliope 0.7 (experimental) engine');
  }
  return streamRun(
    SERVICE_URL,
    modelData,
    { onLog, onStats, onDone, onError },
    { label: 'Calliope', reachError: `Cannot reach Calliope ${engine} service at ${SERVICE_URL}` },
  );
}
