/**
 * demandlibClient.js
 * ------------------
 * Renderer-side driver for the demandlib one-shot (BDEW load shapes), invoked
 * over Electron IPC. demandlib is the PRIMARY source of the substation demand
 * curve; the synthetic presets in demandProfiles.js are the offline fallback
 * (used in the plain browser dev server, or until the demandlib venv is
 * installed). Both return a NORMALISED shape (mean ≈ 1 over a full year); the
 * caller scales it per substation.
 *
 * `sectors` is a map of BDEW SLP code → weight (e.g. { h0: 0.6, g0: 0.4 }).
 */
import { generateDemandShape, syntheticKeyForSlp } from './demandProfiles';

const bridge = () => (typeof window !== 'undefined' ? window.electronAPI : null);

/** Whether the demandlib venv is installed (false outside Electron). */
export async function checkDemandlib() {
  try {
    const res = await bridge()?.checkDemandlib?.();
    return !!res?.venvExists;
  } catch {
    return false;
  }
}

/** Install the demandlib venv on demand. Progress streams via onDemandInstallProgress. */
export async function installDemandlib() {
  const api = bridge();
  if (!api?.installDemandlib) return { success: false, error: 'not running in the desktop app' };
  try {
    return await api.installDemandlib();
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}

/** Subscribe to install progress; returns an unsubscribe fn (or a no-op). */
export function onDemandInstallProgress(cb) {
  return bridge()?.onDemandInstallProgress?.(cb) || (() => {});
}

/** The SLP codes the installed demandlib ships, or null when unavailable. */
export async function listSlpProfiles(year) {
  try {
    const res = await bridge()?.listDemandProfiles?.(year);
    if (res?.ok && Array.isArray(res.data?.profiles)) return res.data.profiles;
  } catch {
    /* fall through */
  }
  return null;
}

/** Demandlib shape, or null on any failure / outside Electron. */
export async function fetchDemandlibShape({ start, end, resolution, sectors, country }) {
  const api = bridge();
  if (!api?.generateDemandProfile) return null;
  try {
    const res = await api.generateDemandProfile({ start, end, resolution, sectors, country });
    if (res?.ok && Array.isArray(res.data?.values) && res.data.values.length) {
      return { datetimes: res.data.datetimes, values: res.data.values, source: 'demandlib' };
    }
  } catch {
    /* fall through to synthetic */
  }
  return null;
}

/** Offline synthetic equivalent: map SLP sectors → synthetic keys and blend. */
export function syntheticShape({ start, end, resolution, sectors, latitude }) {
  const synthSectors = {};
  for (const [code, w] of Object.entries(sectors || {})) {
    const key = syntheticKeyForSlp(code);
    synthSectors[key] = (synthSectors[key] || 0) + Number(w || 0);
  }
  const { datetimes, values } = generateDemandShape({
    start, end, resolution, sectors: synthSectors, latitude, annualMWh: 8760, // → mean ≈ 1
  });
  return { datetimes, values, source: 'synthetic' };
}

/**
 * Unified normalised shape: demandlib first, synthetic fallback. Always returns
 * `{ datetimes, values, source }` (values mean ≈ 1 over a full year).
 */
export async function getDemandShape({ start, end, resolution, sectors, country, latitude }) {
  const dl = await fetchDemandlibShape({ start, end, resolution, sectors, country });
  if (dl) return dl;
  return syntheticShape({ start, end, resolution, sectors, latitude });
}
