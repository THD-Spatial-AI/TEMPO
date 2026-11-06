/**
 * renewablesClient.js
 * -------------------
 * Renderer driver for the local renewables FastAPI service (PV profiles from
 * Open-Meteo ERA5 + pvlib). URL from Electron (`getServiceURLs().renewables`),
 * never hard-coded. Every call degrades to `{ ok:false, error }` / null.
 *
 *   POST /pv                    → { job_id }
 *   POST /optimise-orientation  → { job_id }
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
