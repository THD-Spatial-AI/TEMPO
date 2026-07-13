/**
 * engineClient.js
 * ---------------
 * Shared HTTP client for the non-Calliope engine services (PyPSA, OSeMOSYS,
 * AdOpT-NET0). All three expose the same endpoint set:
 *
 *   GET  /health              → { status, engine, ... }
 *   POST /export  (JSON)      → { zip: <base64>, report: [string] }
 *   POST /import  (multipart) → { model: {...}, report: [string] }
 *   POST /run + SSE           → handled by the per-engine run clients
 *
 * Calliope 0.6/0.7 routing stays in calliopeClient.js; AdOpT-NET0 runs stay
 * in adoptnet0Client.js. This module owns URL resolution + export/import.
 */

const ENGINES = {
  pypsa: {
    urlFn: 'getPypsaServiceURL',
    envVar: 'VITE_PYPSA_SERVICE_URL',
    defaultUrl: 'http://localhost:5003',
  },
  osemosys: {
    urlFn: 'getOsemosysServiceURL',
    envVar: 'VITE_OSEMOSYS_SERVICE_URL',
    defaultUrl: 'http://localhost:5004',
  },
  adoptnet0: {
    urlFn: 'getAdoptnet0ServiceURL',
    envVar: 'VITE_ADOPTNET0_SERVICE_URL',
    defaultUrl: 'http://localhost:5001',
  },
};

/**
 * Resolve the base URL of an engine service.
 * Electron IPC wins; env var override next; localhost default last.
 * Not cached — resolved fresh each call (same rationale as calliopeClient).
 * @param {'pypsa'|'osemosys'|'adoptnet0'} engine
 */
export async function getEngineServiceURL(engine) {
  const cfg = ENGINES[engine];
  if (!cfg) throw new Error(`Unknown engine: ${engine}`);

  if (typeof window !== 'undefined' && window.electronAPI?.[cfg.urlFn]) {
    try {
      const { url } = await window.electronAPI[cfg.urlFn]();
      if (url) return url;
    } catch { /* fall through */ }
  }
  if (import.meta.env?.[cfg.envVar]) return import.meta.env[cfg.envVar];
  return cfg.defaultUrl;
}

/**
 * Health-check an engine service.
 * @param {'pypsa'|'osemosys'|'adoptnet0'} engine
 * @returns {Promise<object|null>}  The /health JSON, or null if unreachable.
 */
export async function checkEngineService(engine) {
  try {
    const base = await getEngineServiceURL(engine);
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Export a model (or list of scenario-resolved models) as a framework archive.
 * @param {'pypsa'|'osemosys'|'adoptnet0'} engine
 * @param {object} payload  { datasets: [{name, model}], options: {...} }
 * @returns {Promise<{zipBlob: Blob, report: string[]}>}
 */
export async function exportModelArchive(engine, payload) {
  const base = await getEngineServiceURL(engine);
  const res = await fetch(`${base}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Export failed (HTTP ${res.status})`);
  }
  const { zip, report } = await res.json();
  const bytes = Uint8Array.from(atob(zip), c => c.charCodeAt(0));
  return { zipBlob: new Blob([bytes], { type: 'application/zip' }), report: report || [] };
}

/**
 * Returns true if the engine service is reachable and healthy
 * (boolean variant of checkEngineService, mirrors checkAdoptnet0Service).
 * @param {'pypsa'|'osemosys'|'adoptnet0'} engine
 */
export async function checkEngineRunService(engine) {
  const health = await checkEngineService(engine);
  return health?.status === 'ok';
}

/**
 * Submit a model to an engine service and stream results via SSE.
 * Same contract as runCalliopeModel / runAdoptnet0Model.
 *
 * @param {'pypsa'|'osemosys'} engine
 * @param {object} options
 * @param {object}   options.modelData  - Full model payload
 * @param {Function} [options.onLog]    - Called with each log string
 * @param {Function} [options.onStats]  - Called with resource stats every ~10 s
 * @param {Function} [options.onDone]   - Called with the result object on completion
 * @param {Function} [options.onError]  - Called with an error string on failure
 * @returns {Promise<{jobId: string, cancel: Function}>}
 */
export async function runEngineModel(engine, { modelData, onLog, onStats, onDone, onError }) {
  const SERVICE_URL = await getEngineServiceURL(engine);
  const label = engine === 'pypsa' ? 'PyPSA' : engine === 'osemosys' ? 'OSeMOSYS' : engine;

  let response;
  try {
    response = await fetch(`${SERVICE_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData),
    });
  } catch (err) {
    throw new Error(`Cannot reach ${label} service at ${SERVICE_URL}: ${err.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`${label} service rejected the run (${response.status}): ${text}`);
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
      onError?.(event.error || `Unknown error from ${label} service`);
    }
  };

  es.onerror = () => {
    if (finished) return;
    finished = true;
    es.close();
    onError?.(`Lost connection to ${label} service`);
  };

  const cancel = () => {
    es.close();
    fetch(`${SERVICE_URL}/run/${jobId}`, { method: 'DELETE' }).catch(() => {});
  };

  return { jobId, cancel };
}

/**
 * Import a framework archive into TEMPO's internal model representation.
 * @param {'pypsa'|'osemosys'|'adoptnet0'} engine
 * @param {File|Blob} file  The archive (ZIP).
 * @returns {Promise<{model: object, report: string[], extraModels?: object[]}>}
 */
export async function importModelArchive(engine, file) {
  const base = await getEngineServiceURL(engine);
  const res = await fetch(`${base}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: file,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Import failed (HTTP ${res.status})`);
  }
  return await res.json();
}
