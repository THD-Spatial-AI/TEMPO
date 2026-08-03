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
 * Health/capabilities check against a MEME server.
 * @param {{url: string}} server
 * @returns {Promise<object|null>}  The /capabilities JSON, or null if unreachable.
 */
export async function checkMemeService(server) {
  const base = normalizeBase(server?.url);
  if (!base) return null;
  try {
    const res = await fetch(`${base}/capabilities`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
    try {
      const res = await fetch(`${base}/jobs/${jobId}/result.json`, { signal: AbortSignal.timeout(120_000) });
      if (res.ok) contract = await res.json();
    } catch { /* fall through to null */ }
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
  let res;
  try {
    res = await fetch(`${base}/simulate?target=${encodeURIComponent(target)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (err) {
    throw new Error(`Cannot reach MEME server at ${base}: ${err.message}`);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || detail.detail || `MEME rejected the run (HTTP ${res.status})`);
  }
  const submit = await res.json();
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
      const r = await fetch(`${base}/jobs/${jobId}/status`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`status HTTP ${r.status}`);
      status = await r.json();
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
      const contract = await fetchContract(base, jobId, status);
      if (cancelled) return;
      if (contract) onDone?.(contract);
      else onError?.(`MEME job ${jobId} succeeded but returned no result contract`);
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
