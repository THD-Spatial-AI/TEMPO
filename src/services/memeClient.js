/**
 * memeClient.js
 * -------------
 * Run driver for a remote MEME server, presenting MEME's async job API as the
 * same `{ jobId, cancel }` + `{ onLog, onStats, onDone, onError }` surface that
 * runService.streamRun exposes for the local SSE engines — so the Run UI needs
 * no engine-specific branching.
 *
 * MEME's protocol (README §3):
 *   POST /simulate?target=<pypsa|calliope|adopt-net0>   → 202 { id, state, warnings, ... }
 *        (validates synchronously; hard errors return 422/401 immediately)
 *   GET  /jobs/{id}/status                              → { state, log, error, ... }
 *   GET  /jobs/{id}/result.json (MEME extension)        → TEMPO frozen contract JSON
 *   GET  /jobs/{id}                                     → full zip bundle (optional download)
 *
 * Differences from the local SSE path, all deliberate (see the remote-execution
 * design):
 *   - Logs arrive by POLLING /status (~1.5 s) and reading the `log` delta,
 *     not a live stream.
 *   - No resource stats: MEME's status has no cpu/ram, so onStats reports
 *     elapsed seconds only.
 *   - No per-job cancel endpoint exists, so cancel() only DETACHES the UI
 *     (stops polling); the VM keeps solving until it finishes and MEME GCs it.
 *
 * Auth is MEME-style: the api_key is a top-level field in the JSON body (never a
 * header). This module injects it; memeFormat.js stays pure/secret-free.
 */

import { getSetting } from './appSettings';
import { internalToMemeCanonical, MEME_TARGET_FOR_ENGINE } from './memeFormat';

const SETTINGS_KEY = 'memeServer'; // { url, apiKey, enabled }
const DEFAULT_POLL_MS = 1500;
const MAX_STATUS_ERRORS = 6; // consecutive /status failures before giving up

/** Read the single configured MEME server from app settings. */
export function getMemeServerConfig() {
  const cfg = getSetting(SETTINGS_KEY);
  return cfg && typeof cfg === 'object' ? cfg : null;
}

function normalizeBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * HTTP helper that routes through the Electron main process when available
 * (avoids CORS for all MEME traffic), falling back to direct fetch in dev mode.
 * Returns { ok, status, data } — never throws on HTTP errors, only on total
 * network failure (networkError field set).
 */
async function memeFetch(url, { method = 'GET', body, timeoutMs = 30_000 } = {}) {
  if (typeof window !== 'undefined' && window.electronAPI?.memeFetch) {
    return window.electronAPI.memeFetch({ url, method, body, timeoutMs });
  }
  try {
    const opts = { method, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' };
    if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = body; }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, networkError: err.message };
  }
}

/**
 * Health/capabilities check against a MEME server.
 * Prefers the Electron main-process bridge (no CORS) when available;
 * falls back to direct fetch in Vite dev mode.
 * @param {{url: string}} server
 * @returns {Promise<object|null>}  The /capabilities JSON, or null if unreachable.
 */
export async function checkMemeService(server) {
  const base = normalizeBase(server?.url);
  if (!base) return null;
  if (typeof window !== 'undefined' && window.electronAPI?.memeCheck) {
    return window.electronAPI.memeCheck(base);
  }
  try {
    const res = await fetch(`${base}/capabilities`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── AdOpT-NET0 contract normalizer ────────────────────────────────────────────
// AdOpT's HDF5 extractor returns DB tech names (Storage_Battery, Photovoltaic…),
// integer timestamps, and empty generation/costs. Trade imports (which typically
// supply all electricity in simple models) are never in HDF5 operation data.
// This function rebuilds everything from the TEMPO model definition and infers
// import dispatch from the energy balance when no other supply is found.

function parseResolutionHours(res) {
  if (!res) return 1;
  const m = /^(\d+(\.\d+)?)h$/i.exec(String(res).trim());
  return m ? parseFloat(m[1]) : 1;
}

/** Build a reverse map: AdOpT DB tech name → TEMPO tech id. */
function buildAdoptReverseMap(modelData) {
  const map = {};
  (modelData.technologies || []).forEach(tech => {
    const id = tech.id || tech.name;
    const ess = tech.essentials || {};
    const parent = (ess.parent || '').toLowerCase();
    const perf = tech.performance;
    if (perf?.model === 'pv')         { map['Photovoltaic'] = id; return; }
    if (perf?.model === 'wind')       { map['WindTurbine_Onshore_1500'] = id; return; }
    if (perf?.model === 'heat_pump')  { map['HeatPump_AirSourced'] = id; return; }
    if (parent === 'storage')         { map['Storage_Battery'] = id; }
  });
  return map;
}

/**
 * Resolve a demand tech's timeseries resource to a positive MW array of length n.
 * Handles: inline array, scalar, or "file=name.csv:col" reference into modelData.timeSeries.
 * ts.data rows are objects {dateCol: "...", colName: value, ...} (not arrays).
 * ts.csvContent is a raw CSV string (fallback for non-active models).
 */
function resolveDemandProfile(modelData, n) {
  const demTech = (modelData.technologies || []).find(
    t => (t.essentials?.parent || '').toLowerCase() === 'demand'
  );
  if (!demTech) return null;

  const res = demTech.constraints?.resource;

  // Inline array (API-created test models only)
  if (Array.isArray(res) && res.length > 0) {
    const vals = res.slice(0, n).map(v => Math.abs(Number(v) || 0));
    return vals.length >= n ? vals.slice(0, n) : null;
  }

  // Scalar
  if (typeof res === 'number' && res !== 0) {
    return Array(n).fill(Math.abs(res));
  }

  // File reference: "file=name.csv:column"
  if (typeof res === 'string' && res.startsWith('file=')) {
    const ref = res.slice(5);
    const colonIdx = ref.lastIndexOf(':');
    const fileName = colonIdx !== -1 ? ref.slice(0, colonIdx) : ref;
    const colName  = colonIdx !== -1 ? ref.slice(colonIdx + 1) : null;

    const ts = (modelData.timeSeries || []).find(
      t => (t.fileName || t.file || t.name) === fileName
    );
    if (!ts) return null;

    // ts.data: array of row-objects {dateColumn: "...", dataCol: value, ...}
    if (ts.data?.length > 0) {
      const col = colName || ts.dataColumns?.[0] || Object.keys(ts.data[0]).find(k => k !== ts.dateColumn);
      if (!col) return null;
      const vals = ts.data.slice(0, n).map(row => Math.abs(Number(row[col]) || 0));
      return vals.length >= n ? vals : null;
    }

    // ts.csvContent: raw CSV string fallback
    if (ts.csvContent) {
      const lines = ts.csvContent.trim().split('\n');
      if (lines.length < 2) return null;
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const colIdx = colName ? headers.indexOf(colName) : 1;
      if (colIdx === -1) return null;
      const vals = lines.slice(1, n + 1).map(line => {
        const cols = line.split(',');
        return Math.abs(Number((cols[colIdx] || '').trim()) || 0);
      });
      return vals.length >= n ? vals : null;
    }
  }

  return null;
}

function normalizeAdoptContract(contract, modelData) {
  const adoptToTempo = buildAdoptReverseMap(modelData);

  // 1. Remap capacities: "Arica::Storage_Battery" → "Arica::battery"
  const capacities = {};
  Object.entries(contract.capacities || {}).forEach(([key, val]) => {
    const sep = key.indexOf('::');
    if (sep === -1) { capacities[adoptToTempo[key] || key] = val; return; }
    const loc = key.slice(0, sep);
    const db  = key.slice(sep + 2);
    capacities[`${loc}::${adoptToTempo[db] || db}`] = val;
  });

  // 2. Remap dispatch: "Storage_Battery": [...] → "battery": [...]
  const dispatch = {};
  Object.entries(contract.dispatch || {}).forEach(([db, vals]) => {
    dispatch[adoptToTempo[db] || db] = vals;
  });

  // 3. Generate ISO timestamps from model config
  const n = Math.max(
    ...Object.values(dispatch).map(v => (Array.isArray(v) ? v.length : 0)),
    (contract.timestamps || []).length,
    0
  );
  let timestamps = contract.timestamps;
  if (n > 0) {
    const cfg = modelData.modelConfig || {};
    const startStr = cfg.startDate || cfg.start || '';
    if (startStr) {
      const start = new Date(startStr.includes('T') ? startStr : `${startStr}T00:00:00`);
      if (!isNaN(start.getTime())) {
        const stepMs = parseResolutionHours(cfg.resolution || '1H') * 3_600_000;
        timestamps = Array.from({ length: n }, (_, i) =>
          new Date(start.getTime() + i * stepMs).toISOString()
        );
      }
    }
  }

  // 4. Build tech_metadata from model definition (parent, carrier, display name)
  const tech_metadata = {};
  (modelData.technologies || []).forEach(tech => {
    const id  = tech.id || tech.name;
    const ess = tech.essentials || {};
    tech_metadata[id] = {
      parent:       ess.parent || '',
      carrier_out:  ess.carrier_out || ess.carrier || '',
      display_name: ess.name || tech.name || id,
    };
  });

  // 5. Resolve demand timeseries (used by chart and energy-balance inference)
  let demand_timeseries = Array.isArray(contract.demand_timeseries)
    ? contract.demand_timeseries
    : (n > 0 ? resolveDemandProfile(modelData, n) : null);

  // 6. Compute generation from dispatch for supply-side techs that had actual output
  const SUPPLY = new Set(['supply', 'supply_plus', 'conversion', 'conversion_plus']);
  const generation = Object.keys(contract.generation || {}).length ? { ...contract.generation } : {};
  const costs_by_tech = Object.keys(contract.costs_by_tech || {}).length ? { ...contract.costs_by_tech } : {};

  if (!Object.keys(generation).length && n > 0) {
    // Gather any supply dispatch from HDF5 (tech name already remapped)
    Object.entries(dispatch).forEach(([id, vals]) => {
      if (!Array.isArray(vals)) return;
      const parent = (tech_metadata[id]?.parent || '').toLowerCase();
      if (!parent || SUPPLY.has(parent)) {
        const total = vals.reduce((s, v) => s + Math.max(0, Number(v) || 0), 0);
        if (total > 0) generation[`total::${id}`] = total;
      }
    });

    // If HDF5 gave us no supply dispatch (common for trade-only models where imports
    // aren't written to the operation group), synthesize import dispatch from demand.
    const totalSupply = Object.values(generation).reduce((s, v) => s + v, 0);
    if (totalSupply === 0 && demand_timeseries?.length) {
      // Trade techs: supply_plus + resource ≥ 1e13 (unlimited import)
      const isUnlimited = (v) => v === 'inf' || v === Infinity || Number(v) >= 1e13;
      const tradeTechs = (modelData.technologies || []).filter(t => {
        const parent = (t.essentials?.parent || '').toLowerCase();
        return parent === 'supply_plus' && isUnlimited(t.constraints?.resource);
      });

      tradeTechs.forEach(tradeTech => {
        const id = tradeTech.id || tradeTech.name;
        const ess = tradeTech.essentials || {};

        // Add to dispatch (import covers demand; storage net = 0 when not invested)
        if (!dispatch[id]) dispatch[id] = [...demand_timeseries];

        const totalMWh = demand_timeseries.reduce((s, v) => s + v, 0);
        if (totalMWh > 0) generation[`total::${id}`] = totalMWh;

        // Ensure tech_metadata covers this trade tech
        if (!tech_metadata[id]) {
          tech_metadata[id] = {
            parent:       ess.parent || 'supply_plus',
            carrier_out:  ess.carrier_out || ess.carrier || 'electricity',
            display_name: ess.name || tradeTech.name || id,
          };
        }

        // Estimate import cost from om_prod
        const omProd = tradeTech.costs?.monetary?.om_prod ?? tradeTech.costs?.monetary?.om_con;
        if (omProd != null && totalMWh > 0 && !costs_by_tech[id]) {
          costs_by_tech[id] = totalMWh * omProd;
        }
      });
    }
  }

  return {
    ...contract,
    capacities,
    dispatch,
    timestamps,
    generation,
    tech_metadata,
    costs_by_tech: Object.keys(costs_by_tech).length ? costs_by_tech : contract.costs_by_tech,
    demand_timeseries: demand_timeseries ?? contract.demand_timeseries,
  };
}

/** Extract TEMPO's frozen contract from a succeeded job (inline or via result.json). */
async function fetchContract(base, jobId, status) {
  let contract = null;
  // MEME carries the contract on each run (JobView.runs[].contract). A single
  // baseline run (all v2 submits) → the first run's contract. Fall back to a
  // top-level status.contract, then to a result.json endpoint.
  const runs = Array.isArray(status?.runs) ? status.runs : [];
  const runContract = runs.find((r) => r && r.contract)?.contract;
  if (runContract && typeof runContract === 'object') {
    contract = runContract;
  } else if (status && status.contract && typeof status.contract === 'object') {
    contract = status.contract;
  } else {
    const res = await memeFetch(`${base}/jobs/${jobId}/result.json`, { timeoutMs: 120_000 });
    if (res.ok && res.data) contract = res.data;
  }
  // A multi-target extension may key the contract by target; single-target runs
  // (all we submit in v2) return it flat. Unwrap the one target if keyed.
  if (contract && !('capacities' in contract) && status?.target && contract[status.target]) {
    return contract[status.target];
  }
  return contract;
}

/**
 * Submit an internal model to a MEME server and drive it to completion,
 * adapting the poll/zip protocol to the streamRun callback shape.
 *
 * @param {'pypsa'|'calliope07'|'adoptnet0'} engine
 * @param {object} options
 * @param {{url: string, apiKey?: string}} options.server   MEME server config
 * @param {object}   options.modelData   TEMPO internal model (as sent to a local run)
 * @param {string}   [options.mode]      internal run mode (plan/operate/…)
 * @param {string}   [options.objective] min_cost | min_emissions
 * @param {string}   [options.solver]    solver hint (MEME forces per target)
 * @param {Function} [options.onLog]
 * @param {Function} [options.onStats]   receives { elapsed } (seconds) — no cpu/ram remotely
 * @param {Function} [options.onDone]    receives the frozen contract object
 * @param {Function} [options.onError]
 * @param {number}   [options.pollMs=1500]
 * @returns {Promise<{jobId: string, cancel: Function}>}
 */
export async function runMemeModel(engine, {
  server, modelData, mode, objective, solver,
  onLog, onStats, onDone, onError, pollMs = DEFAULT_POLL_MS,
}) {
  const target = MEME_TARGET_FOR_ENGINE[engine];
  if (!target) throw new Error(`Engine '${engine}' cannot run on MEME (no target); run it locally.`);

  const base = normalizeBase(server?.url);
  if (!base) throw new Error('No MEME server URL configured');

  // ── 1. Translate internal model → MEME canonical (surface warnings) ────────
  const { payload, log } = internalToMemeCanonical(modelData, { mode, objective, solver, engine });
  log.forEach((l) => onLog?.(l));

  const body = JSON.stringify({
    ...(server.apiKey ? { api_key: server.apiKey } : {}),
    ...payload,
  });

  // ── 2. Submit (synchronous validation happens here — 401/422 land as !ok) ──
  const submitRes = await memeFetch(`${base}/simulate?target=${encodeURIComponent(target)}`, {
    method: 'POST',
    body,
  });
  if (submitRes.networkError) throw new Error(`Cannot reach MEME server at ${base}: ${submitRes.networkError}`);
  if (!submitRes.ok) {
    const detail = submitRes.data || {};
    throw new Error(detail.error || detail.detail || `MEME rejected the run (HTTP ${submitRes.status})`);
  }
  const submit = submitRes.data;
  const jobId = submit.id;
  (submit.warnings || []).forEach((w) => onLog?.(`[MEME] ${w}`));
  onLog?.(`[MEME] Job ${jobId} submitted to ${target}`);

  // ── 3. Poll /status until succeeded/failed ─────────────────────────────────
  let cancelled = false;
  let timer = null;
  let seenLogLen = 0;
  let statusErrors = 0;
  const startedAt = Date.now();

  const schedule = () => { timer = setTimeout(poll, pollMs); };

  async function poll() {
    if (cancelled) return;
    let status;
    try {
      const r = await memeFetch(`${base}/jobs/${jobId}/status`);
      if (r.networkError) throw new Error(r.networkError);
      if (!r.ok) throw new Error(`status HTTP ${r.status}`);
      status = r.data;
    } catch (err) {
      if (cancelled) return;
      if (++statusErrors >= MAX_STATUS_ERRORS) {
        onError?.(`Lost contact with MEME server while polling job ${jobId}: ${err.message}`);
        return;
      }
      schedule();
      return;
    }
    statusErrors = 0;
    if (cancelled) return;

    if (typeof status.log === 'string' && status.log.length > seenLogLen) {
      const delta = status.log.slice(seenLogLen);
      seenLogLen = status.log.length;
      for (const line of delta.split('\n')) if (line) onLog?.(line);
    }

    onStats?.({ elapsed: Math.round((Date.now() - startedAt) / 1000) });

    if (status.state === 'succeeded') {
      let contract = await fetchContract(base, jobId, status);
      if (cancelled) return;
      if (contract) {
        if (engine === 'adoptnet0') contract = normalizeAdoptContract(contract, modelData);
        onDone?.(contract);
      } else {
        onError?.(`MEME job ${jobId} succeeded but returned no result contract`);
      }
      return;
    }
    if (status.state === 'failed') {
      onError?.(status.error || `MEME job ${jobId} failed`);
      return;
    }
    schedule(); // queued | running
  }

  schedule();

  const cancel = () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    // No MEME cancel endpoint: this only detaches the UI; the VM keeps solving.
  };

  return { jobId, cancel };
}

/**
 * Download the full MEME result bundle (zip) for a finished job — backs the
 * optional "Download bundle" button. Returns a Blob.
 * @param {{url: string}} server
 * @param {string} jobId
 * @returns {Promise<Blob>}
 */
export async function fetchMemeBundle(server, jobId) {
  const base = normalizeBase(server?.url);
  const res = await fetch(`${base}/jobs/${jobId}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Bundle download failed (HTTP ${res.status})`);
  return await res.blob();
}
