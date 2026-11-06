/**
 * demandServiceClient.js
 * ----------------------
 * Renderer driver for the local demand-estimation FastAPI service. The URL comes
 * from Electron (`getServiceURLs().demand`); never hard-coded. Every function
 * degrades to `null` / `{ error }` / `{ ok:false, error }` so callers can fall
 * back to the JS population split.
 *
 *   POST /data/ensure, GET /data/status  → EC2019 raster download
 *   POST /estimate                       → per-substation annual demand
 *   POST /shape                          → per-substation hourly series
 */

/** Base URL of the demand service, or null when it is not running / not in Electron. */
export async function getDemandServiceURL() {
  try {
    const urls = await window?.electronAPI?.getServiceURLs?.();
    const d = urls?.demand;
    return d?.running && d.url ? d.url : null;
  } catch {
    return null;
  }
}

async function postJson(base, path, payload) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
}

/**
 * Make sure the EC2019 raster is present: POST /data/ensure, then poll
 * /data/status until `ready` or `error`. `onProgress` gets each status body.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function ensureDemandData(onProgress, { intervalMs = 1000, timeoutMs = 600000 } = {}) {
  const base = await getDemandServiceURL();
  if (!base) return { ok: false, error: 'demand service not running' };
  try {
    let res = await postJson(base, '/data/ensure', {});
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const st = await res.json();
      onProgress?.(st);
      if (st.state === 'ready') return { ok: true };
      if (st.state === 'error') return { ok: false, error: st.error || 'download failed' };
      if (Date.now() >= deadline) return { ok: false, error: 'timed out waiting for demand data' };
      await new Promise(r => setTimeout(r, intervalMs));
      res = await fetch(`${base}/data/status`);
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** POST /estimate. Returns the result, or `{ error }` (409 → 'data not ready'). */
export async function estimateDemand(payload) {
  const base = await getDemandServiceURL();
  if (!base) return { error: 'demand service not running' };
  try {
    const res = await postJson(base, '/estimate', payload);
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) return { error: 'data not ready' };
    if (!res.ok) return { error: typeof body?.detail === 'string' ? body.detail : `HTTP ${res.status}` };
    return body;
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

/** POST /shape. Returns the result, or null on any failure. */
export async function shapeDemand(payload) {
  const base = await getDemandServiceURL();
  if (!base) return null;
  try {
    const res = await postJson(base, '/shape', payload);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
