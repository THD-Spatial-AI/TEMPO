/**
 * ccsService.js
 * ------------------
 * API client for the Python/FastAPI OpenModelica Bridge running on the CCS simulation service.
 * Carbon Capture System (CCS) simulation endpoints.
 *
 * Provides:
 *   checkHealth()          → Promise<HealthResponse>
 *   startCCSSimulation(params) → Promise<{ job_id, status }>
 *   pollCCSStatus(jobId)   → Promise<JobStatusResponse>
 *   runCCSSimulation(params, callbacks) → Promise<cancelFn>
 *     ↳ tries WebSocket first; if WS fails within 3 s falls back to HTTP polling
 *
 * URL configured via: VITE_CCS_SERVICE_URL in .env
 */

import { simulateCCSChain } from "./ccsPhysics";

// Base URL strategy:
//   DEV  → relative path "/ccs-proxy", Vite dev-server proxies it to VITE_CCS_SERVICE_URL.
//   PROD → full URL from VITE_CCS_SERVICE_URL (Electron opens file://, so no proxy available).
const _RAW_URL = (import.meta.env.VITE_CCS_SERVICE_URL ?? "http://localhost:8766").replace(/\/$/, "");
const BASE_URL  = import.meta.env.DEV ? "/ccs-proxy" : _RAW_URL;

// ── helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (networkErr) {
    const err = new Error(
      "Cannot reach the CCS simulation service. " +
        "Check that the service is running (uvicorn main:app --port 8766). " +
        "Update VITE_CCS_SERVICE_URL in your .env file if the address has changed."
    );
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.detail ?? body?.message ?? JSON.stringify(body) ?? detail;
    } catch (_) { /* ignore */ }
    const err = new Error(detail);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

/** Like apiFetch but returns `null` instead of throwing on HTTP 4xx/5xx/network errors. */
async function apiFetchSafe(path) {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return null;
    return response.json();
  } catch (_) {
    return null;
  }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the OpenModelica simulation engine is alive and ready.
 * (Shared health endpoint with H₂ service)
 *
 * @returns {Promise<{ engine_ready: boolean, engine_error: string|null, active_jobs: number }>}
 */
export async function checkHealth() {
  const candidates = ["/api/health", "/api/ccs/health", "/health"];

  for (const path of candidates) {
    const data = await apiFetchSafe(path);
    if (data !== null) {
      return {
        engine_ready: !!(data.engine_ready ?? (data.status === "ok" || data.status === "ready")),
        engine_error: data.engine_error ?? data.error ?? null,
        active_jobs:  data.active_jobs  ?? 0,
        _path: path,
      };
    }
  }

  throw new Error(
    `Cannot reach the CCS simulation service at ${BASE_URL}. ` +
    `Tried: ${candidates.join(", ")}. ` +
    "Possible causes: (1) Docker container not running, " +
    "(2) service not started, " +
    "(3) wrong IP/port in VITE_CCS_SERVICE_URL (.env)."
  );
}

/**
 * Submit a new CCS simulation.
 *
 * Payload schema v2.0 — built by {@link buildSimPayload} in ccsSimPayload.js.
 *
 * @param {object} params - See ccsSimPayload.js for full schema
 * @returns {Promise<{ job_id: string, status: string, message: string }>}
 */
export async function startCCSSimulation(params) {
  return apiFetch("/api/ccs/simulate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Poll the current status (and final result) of a CCS simulation job.
 *
 * @param {string} jobId
 * @returns {Promise<{
 *   job_id: string,
 *   status: 'queued'|'running'|'done'|'error',
 *   progress_pct: number,
 *   error: string|null,
 *   result: SimulationResult|null
 * }>}
 */
export async function pollCCSStatus(jobId) {
  return apiFetch(`/api/jobs/${jobId}/status`);
}

/**
 * Run a complete CCS simulation with progress callbacks.
 *
 * Strategy:
 *   1. Try WebSocket connection first (real-time progress)
 *   2. If WS fails or times out within 3s, fall back to HTTP polling (every 3s)
 *   3. Return a cancel function that aborts the job
 *
 * @param {object} params - Simulation payload (see ccsSimPayload.js)
 * @param {{
 *   onProgress: (pct: number) => void,
 *   onDone:     (result: object) => void,
 *   onError:    (err: Error) => void
 * }} callbacks
 *
 * @returns {Promise<Function>} cancel function (call to abort simulation)
 */
export async function runCCSSimulation(params, callbacks = {}) {
  const { onProgress = () => {}, onDone = () => {}, onError = () => {} } = callbacks;

  // ── Step 1: Submit simulation ──────────────────────────────────────────────
  let jobData;
  try {
    jobData = await startCCSSimulation(params);
  } catch (err) {
    onError(err);
    return () => {}; // no-op cancel
  }

  const { job_id } = jobData;
  if (!job_id) {
    onError(new Error("No job_id returned from API"));
    return () => {};
  }

  let cancelled = false;
  let ws = null;
  let pollInterval = null;

  // Cancel function
  const cancel = () => {
    cancelled = true;
    if (ws) ws.close();
    if (pollInterval) clearInterval(pollInterval);
    // Optionally send DELETE /api/jobs/{job_id} to abort on server
  };

  // ── Step 2: Try WebSocket first ────────────────────────────────────────────
  const wsUrl = BASE_URL.replace(/^http/, 'ws') + `/ws/job/${job_id}`;
  let wsConnected = false;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      wsConnected = true;
      console.log('[ccsService] WebSocket connected for job', job_id);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.progress_pct != null) onProgress(msg.progress_pct);
        if (msg.status === 'done' && msg.result) {
          onDone(msg.result);
          ws.close();
        }
        if (msg.status === 'error') {
          onError(new Error(msg.error ?? 'Simulation failed'));
          ws.close();
        }
      } catch (parseErr) {
        console.warn('[ccsService] Failed to parse WebSocket message:', parseErr);
      }
    };

    ws.onerror = (err) => {
      console.warn('[ccsService] WebSocket error:', err);
      if (!wsConnected) {
        // WS never connected → fall back to polling
        startHttpPolling();
      }
    };

    ws.onclose = () => {
      console.log('[ccsService] WebSocket closed');
    };

    // Timeout: if WS doesn't connect within 3s, fall back to polling
    setTimeout(() => {
      if (!wsConnected && !cancelled) {
        console.log('[ccsService] WebSocket timeout, falling back to HTTP polling');
        if (ws) ws.close();
        startHttpPolling();
      }
    }, 3000);

  } catch (wsErr) {
    console.warn('[ccsService] WebSocket creation failed:', wsErr);
    startHttpPolling();
  }

  // ── Step 3: HTTP polling fallback ─────────────────────────────────────────
  function startHttpPolling() {
    if (cancelled) return;

    pollInterval = setInterval(async () => {
      if (cancelled) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const status = await pollCCSStatus(job_id);
        if (status.progress_pct != null) onProgress(status.progress_pct);

        if (status.status === 'done' && status.result) {
          onDone(status.result);
          clearInterval(pollInterval);
        }
        if (status.status === 'error') {
          onError(new Error(status.error ?? 'Simulation failed'));
          clearInterval(pollInterval);
        }
      } catch (pollErr) {
        onError(pollErr);
        clearInterval(pollInterval);
      }
    }, 3000); // poll every 3 seconds
  }

  return cancel;
}

/**
 * Fallback: run simulation client-side using simplified physics (ccsPhysics.js).
 * Used when simulation service is unavailable.
 */
export async function runCCSSimulationFallback(params, callbacks = {}) {
  const { onProgress = () => {}, onDone = () => {}, onError = () => {} } = callbacks;

  try {
    console.log('[ccsService] Running client-side CCS simulation (fallback mode)');
    onProgress(10);

    const result = await simulateCCSChain(params);

    onProgress(100);
    onDone(result);
  } catch (err) {
    onError(err);
  }

  return () => {}; // no-op cancel for client-side sim
}
