/**
 * renewablesClient.js
 * -------------------
 * Renderer driver for the local renewables FastAPI service (PV profiles from
 * Open-Meteo ERA5 + pvlib). URL from Electron (`getServiceURLs().renewables`),
 * never hard-coded. Every call degrades to `{ ok:false, error }` / null.
 *
 *   POST /pv                    → { job_id }
 *   POST /optimise-orientation  → { job_id }
 *   POST /wind                  → { job_id }
 *   POST /best-wind-point       → { job_id }
 *   GET  /turbines              → { turbines: [{ id, label, generic }] }  (503 { detail } without windpowerlib)
 *   GET  /atlas/countries       → { countries: [names] }
 *   GET  /atlas/status          → { ready }                 ?layer&country
 *   POST /atlas/ensure          → { job_id }                (progress in bytes)
 *   GET  /atlas/image           → PNG + X-Bounds: w,s,e,n   ?layer&country&south&west&north&east&width
 *   GET  /wind-grid             → { lats, lons, date, u[24][n][n], v[24][n][n] }  ?south&west&north&east&date&n
 *   GET  /jobs/{id}             → { state, done, total, message, error, result }
 */
const bridge = () => (typeof window !== 'undefined' ? window.electronAPI : null);

/** Base URL of the renewables service, or null when it is not running / not in Electron. */
export async function getRenewablesURL() {
  try {
    const r = (await bridge()?.getServiceURLs?.())?.renewables;
    return r?.running && r.url ? r.url : null;
  } catch {
    return null;
  }
}

/** `{ installed, running }` from the engine-service check (false outside Electron). */
export async function checkRenewables() {
  try {
    const res = await bridge()?.checkRenewables?.();
    return { installed: !!res?.envExists, running: !!res?.serviceRunning };
  } catch {
    return { installed: false, running: false };
  }
}

/** Install the renewables venv; progress via onRenewablesInstallProgress. */
export async function installRenewables() {
  const api = bridge();
  if (!api?.installRenewables) return { success: false, error: 'not running in the desktop app' };
  try {
    return await api.installRenewables();
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function onRenewablesInstallProgress(cb) {
  return bridge()?.onRenewablesInstallProgress?.(cb) || (() => {});
}

export async function startRenewables() {
  try {
    return await bridge()?.restartRenewablesService?.();
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

async function errorText(res) {
  try {
    const body = await res.json();
    return typeof body?.detail === 'string' ? body.detail : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Turbine catalogue: `{ ok:true, turbines }` or `{ ok:false, error }`. */
export async function listTurbines() {
  const base = await getRenewablesURL();
  if (!base) return { ok: false, error: 'renewables service not running' };
  try {
    const res = await fetch(`${base}/turbines`);
    if (!res.ok) return { ok: false, error: await errorText(res) };
    const body = await res.json();
    return { ok: true, turbines: body?.turbines || [] };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Start a service job (`POST <path>`) and poll it to the end. `onProgress` gets each job status.
 * `what` names the job in the failure / timeout texts.
 * Aborting `signal` stops polling (the service job itself runs on) → `{ok:false, error:'cancelled'}`.
 * @returns {Promise<{ok:true, result:object}|{ok:false, error:string}>}
 */
async function runJob(path, payload, onProgress, { intervalMs = 1000, timeoutMs = 3_600_000, signal } = {}, what) {
  const cancelled = { ok: false, error: 'cancelled' };
  const base = await getRenewablesURL();
  if (!base) return { ok: false, error: 'renewables service not running' };
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload ?? {}),
    });
    if (!res.ok) return { ok: false, error: await errorText(res) };
    const { job_id: jobId } = await res.json();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (signal?.aborted) return cancelled;
      const st = await fetch(`${base}/jobs/${jobId}`);
      if (!st.ok) return { ok: false, error: await errorText(st) };
      const body = await st.json();
      onProgress?.(body);
      if (body.state === 'done') return { ok: true, result: body.result };
      if (body.state === 'error') return { ok: false, error: body.error || `${what} failed` };
      if (Date.now() >= deadline) return { ok: false, error: `timed out waiting for the ${what}` };
      if (signal?.aborted) return cancelled;
      await new Promise(r => {
        const done = () => { clearTimeout(t); signal?.removeEventListener('abort', done); r(); };
        const t = setTimeout(done, intervalMs);
        signal?.addEventListener('abort', done);
      });
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Run a PV profile job (POST /pv) and poll it to the end. */
export const computePv = (payload, onProgress, opts = {}) =>
  runJob('/pv', payload, onProgress, opts, 'PV calculation');

/** Optimise tilt/azimuth per point (POST /optimise-orientation) and poll it to the end. */
export const optimiseOrientation = (payload, onProgress, opts = {}) =>
  runJob('/optimise-orientation', payload, onProgress, opts, 'orientation optimisation');

/** Wind capacity factor per point (POST /wind) and poll it to the end. */
export const computeWind = (payload, onProgress, opts = {}) =>
  runJob('/wind', payload, onProgress, opts, 'wind calculation');

/** Windiest ERA5 cell near each point (POST /best-wind-point) and poll it to the end. */
export const bestWindPoint = (payload, onProgress, opts = {}) =>
  runJob('/best-wind-point', payload, onProgress, opts, 'best-point search');

const NOT_RUNNING = { ok: false, error: 'renewables service not running' };

/** `GET <path>?<params>` (undefined / null params left out) → the Response, or null when the service is down. */
async function getFrom(path, params) {
  const base = await getRenewablesURL();
  if (!base) return null;
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null) q.set(k, String(v)); });
  const qs = q.toString();
  return fetch(`${base}${path}${qs ? `?${qs}` : ''}`);
}

/** GET a JSON endpoint → `{ ok:true, ...pick(body) }` or `{ ok:false, status, error }`. */
async function getJson(path, params, pick) {
  try {
    const res = await getFrom(path, params);
    if (!res) return NOT_RUNNING;
    if (!res.ok) return { ok: false, status: res.status, error: await errorText(res) };
    return { ok: true, ...pick(await res.json()) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Global Solar Atlas country names (V2). */
export const atlasCountries = () => getJson('/atlas/countries', null, b => ({ countries: b?.countries || [] }));

/** Whether `layer` (pvout | ghi | wind100) is downloaded for `country`. */
export const atlasStatus = ({ layer, country }) => getJson('/atlas/status', { layer, country }, b => ({ ready: !!b?.ready }));

/** Download an atlas raster (V3) as a job; `onProgress` gets `{ done, total }` in bytes. */
export const ensureAtlas = (payload, onProgress, opts = {}) =>
  runJob('/atlas/ensure', payload, onProgress, opts, 'atlas download');

/**
 * Colour-mapped atlas PNG for a view (V4) → `{ ok:true, url, bounds:[w,s,e,n] }` with an object URL
 * the caller must revoke, or `{ ok:false, status, error }` (409 not downloaded, 404 outside the raster).
 * Bounds come from `X-Bounds` (clipped to the raster), else the requested box.
 */
export async function fetchAtlasImage({ layer, country, south, west, north, east, width }) {
  try {
    const res = await getFrom('/atlas/image', { layer, country, south, west, north, east, width });
    if (!res) return NOT_RUNNING;
    if (!res.ok) return { ok: false, status: res.status, error: await errorText(res) };
    const hdr = (res.headers?.get?.('X-Bounds') || '').split(',').map(Number);
    const bounds = hdr.length === 4 && hdr.every(Number.isFinite) ? hdr : [west, south, east, north];
    return { ok: true, url: URL.createObjectURL(await res.blob()), bounds };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** One day of hourly 100 m u/v on an n×n grid (V5) → `{ ok:true, grid }` or `{ ok:false, status, error }`. */
export const fetchWindGrid = ({ south, west, north, east, date, n }) =>
  getJson('/wind-grid', { south, west, north, east, date, n }, b => ({ grid: b }));
