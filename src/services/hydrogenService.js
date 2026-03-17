/**
 * hydrogenService.js
 * ------------------
 * API client for the Python/FastAPI MATLAB Bridge running on the simulation VM.
 *
 * Provides:
 *   checkHealth()          → Promise<HealthResponse>
 *   startSimulation(params)→ Promise<{ job_id, status }>
 *   pollStatus(jobId)      → Promise<JobStatusResponse>
 *   runSimulation(params, callbacks) → Promise<cancelFn>
 *     ↳ tries WebSocket first; if WS fails within 3 s falls back to HTTP polling
 *
 * URL configured via: VITE_H2_SERVICE_URL in .env
 */

// Always use the direct VM URL — the VM allows CORS from all origins ("*"),
// so no proxy is needed in either dev or Electron production.
const BASE_URL = (import.meta.env.VITE_H2_SERVICE_URL ?? "http://localhost:8765").replace(/\/$/, "");

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
      "Cannot reach the Hydrogen Plant simulation service on the VM. " +
        "Check that the VM is reachable and the service is running (uvicorn main:app --port 8765). " +
        "Update VITE_H2_SERVICE_URL in your .env file if the VM address has changed."
    );
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body?.detail ?? detail;
    } catch (_) { /* ignore */ }
    const err = new Error(detail);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the MATLAB engine is alive and ready.
 * @returns {Promise<{ engine_ready: boolean, engine_error: string|null, active_jobs: number }>}
 */
export async function checkHealth() {
  return apiFetch("/api/hydrogen/health");
}

/**
 * Submit a new hydrogen-plant simulation.
 *
 * @param {{
 *   electrolyzer: { grid_power_kw, water_flow_rate_lpm, temperature_c },
 *   storage:      { compressor_efficiency, max_tank_pressure_bar },
 *   fuel_cell:    { h2_flow_rate_nm3h, oxidant_pressure_bar, cooling_capacity_kw },
 *   simulation:   { t_end_s, dt_s }
 * }} params
 * @returns {Promise<{ job_id: string, status: string, message: string }>}
 */
export async function startSimulation(params) {
  return apiFetch("/api/hydrogen/simulate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Poll the current status (and final result) of a simulation job.
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
export async function pollStatus(jobId) {
  return apiFetch(`/api/hydrogen/status/${jobId}`);
}

// ── WebSocket path ────────────────────────────────────────────────────────────

function wsUrlForJob(jobId) {
  // http → ws, https → wss
  return `${BASE_URL.replace(/^http/, "ws")}/api/hydrogen/ws/${jobId}`;
}

// ── Polling fallback ──────────────────────────────────────────────────────────

/**
 * Poll /status/{jobId} every `intervalMs` ms until done or error.
 * Returns a cancel function.
 */
function startPolling(jobId, { onProgress, onResult, onError }, intervalMs = 2000) {
  let stopped = false;

  (async () => {
    while (!stopped) {
      await new Promise((r) => setTimeout(r, intervalMs));
      if (stopped) break;
      try {
        const data = await pollStatus(jobId);
        if (stopped) break;

        if (data.status === "done" && data.result) {
          onResult?.(data.result);
          break;
        } else if (data.status === "error") {
          onError?.(data.error ?? "Unknown simulation error");
          break;
        } else {
          onProgress?.(data);
        }
      } catch (e) {
        if (!stopped) onError?.(e.message);
        break;
      }
    }
  })();

  return () => { stopped = true; };
}

// ── WebSocket with automatic polling fallback ─────────────────────────────────

/**
 * Try to open a WebSocket for `jobId`.
 * If WS fails to open within 3 s, automatically falls back to HTTP polling.
 * Returns a cancel/close function.
 */
function openResultsSocketWithFallback(jobId, callbacks = {}) {
  const { onProgress, onResult, onError, onClose } = callbacks;

  let cancelled = false;
  let stopPolling = () => {};
  let keepAlive = null;

  // Fallback timer: if WS hasn't opened within 4 s, switch to HTTP polling
  const fallbackTimer = setTimeout(() => {
    if (import.meta.env.DEV) console.warn("[hydrogenService] WS timeout — switching to HTTP polling");
    stopPolling = startPolling(jobId, { onProgress, onResult, onError });
  }, 4000);

  let ws;
  try {
    ws = new WebSocket(wsUrlForJob(jobId));
  } catch (_) {
    clearTimeout(fallbackTimer);
    stopPolling = startPolling(jobId, { onProgress, onResult, onError });
    return () => { cancelled = true; stopPolling(); };
  }

  ws.onopen = () => {
    clearTimeout(fallbackTimer); // WS is up — cancel the polling fallback
    if (import.meta.env.DEV) console.log(`[hydrogenService] WS open for job ${jobId}`);
    // Keep-alive: API docs require client to send "ping" every 30 s
    keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 30_000);
  };

  ws.onmessage = (evt) => {
    // Server sends plain-text "pong" in response to our keep-alive "ping" — ignore it
    if (evt.data === "pong") return;

    let data;
    try { data = JSON.parse(evt.data); } catch (_) { return; }

    if (data.status === "done" && data.result) {
      clearInterval(keepAlive);
      onResult?.(data.result);
      ws.close();
    } else if (data.status === "error") {
      clearInterval(keepAlive);
      onError?.(data.error ?? "Unknown simulation error");
      ws.close();
    } else {
      // progress update: { status: "running", progress_pct: N }
      onProgress?.(data);
    }
  };

  ws.onerror = () => {
    clearTimeout(fallbackTimer);
    clearInterval(keepAlive);
    if (import.meta.env.DEV) console.warn("[hydrogenService] WS error — switching to HTTP polling");
    ws.close();
    if (!cancelled) {
      stopPolling = startPolling(jobId, { onProgress, onResult, onError });
    }
  };

  ws.onclose = () => {
    clearTimeout(fallbackTimer);
    clearInterval(keepAlive);
    if (import.meta.env.DEV) console.log(`[hydrogenService] WS closed for job ${jobId}`);
    onClose?.();
  };

  return () => {
    cancelled = true;
    clearTimeout(fallbackTimer);
    clearInterval(keepAlive);
    stopPolling();
    try { if (ws.readyState < WebSocket.CLOSING) ws.close(); } catch (_) { /* */ }
  };
}

// ── Main convenience function ─────────────────────────────────────────────────

/**
 * Start a simulation and subscribe to progress/result updates.
 * Tries WebSocket first; automatically falls back to polling if WS unavailable.
 *
 * @param {object} params
 * @param {{
 *   onQueued?:   (jobId: string) => void,
 *   onProgress?: (data) => void,
 *   onResult?:   (result) => void,
 *   onError?:    (msg: string) => void,
 * }} callbacks
 * @returns {Promise<() => void>}  cancel/unsubscribe function
 */
export async function runSimulation(params, callbacks = {}) {
  const { job_id } = await startSimulation(params);
  callbacks.onQueued?.(job_id);
  const cancel = openResultsSocketWithFallback(job_id, callbacks);
  return cancel;
}
