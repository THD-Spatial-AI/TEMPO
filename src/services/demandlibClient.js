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
export async function fetchDemandlibShape({ start, end, resolution, sectors, country, family }) {
  const api = bridge();
  if (!api?.generateDemandProfile) return null;
  try {
    const res = await api.generateDemandProfile({ start, end, resolution, sectors, country, family });
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
export async function getDemandShape({ start, end, resolution, sectors, country, family, latitude }) {
  const dl = await fetchDemandlibShape({ start, end, resolution, sectors, country, family });
  if (dl) return dl;
  return syntheticShape({ start, end, resolution, sectors, latitude });
}

/**
 * Rebuild a generated demand timeseries entry against the current model dates
 * and resolution, reusing the entry's stored `demandConfig` (sectors, country,
 * latitude, magnitude groups). The per-substation `resource` file refs are
 * unchanged (same columns), so only the CSV data is refreshed.
 *
 * @param {object} entry  a timeSeries entry carrying `demandConfig`
 * @param {{ startDate:string, endDate:string, resolution?:string }} modelConfig
 * @returns {Promise<object>} the updated entry
 */
export async function regenerateDemandSeries(entry, modelConfig) {
  const dc = entry?.demandConfig || {};
  const resolution = modelConfig?.resolution || dc.resolution || '60min';
  const { datetimes, values, source } = await getDemandShape({
    start: modelConfig.startDate, end: modelConfig.endDate, resolution,
    sectors: dc.sectors, country: dc.country, family: dc.family, latitude: dc.latitude || 0,
  });
  const groups = dc.groups || [];
  const dataColumns = groups.map(g => g.col);
  const data = datetimes.map((dt, i) => ({
    datetime: dt,
    ...Object.fromEntries(groups.map(g => [g.col, Number((-(values[i] * g.mw)).toFixed(4))])),
  }));
  return {
    ...entry,
    columns: ['datetime', ...dataColumns],
    dataColumns,
    data,
    rowCount: data.length,
    modified: true,
    demandConfig: { ...dc, resolution, source },
  };
}
