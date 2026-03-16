/**
 * hydrogenService.js
 * ------------------
 * API client for the Python/FastAPI MATLAB Bridge running on port 8765.
 *
 * Provides:
 *   startSimulation(params)     → Promise<{ job_id, status }>
 *   pollStatus(jobId)           → Promise<JobStatusResponse>
 *   openResultsSocket(jobId, callbacks) → WebSocket  (call .close() to unsubscribe)
 *   checkHealth()               → Promise<HealthResponse>
 *
 * All functions handle network errors gracefully and surface a human-readable
 * `message` field on thrown errors.
 */

// URL of the Hydrogen Plant MATLAB Bridge running on the simulation VM.
// Set VITE_H2_SERVICE_URL in your .env file (see .env.example).
const BASE_URL = import.meta.env.VITE_H2_SERVICE_URL ?? "http://localhost:8765";

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

/**
 * Open a WebSocket connection that streams real-time progress and the final
 * result for the given job.
 *
 * @param {string} jobId
 * @param {{
 *   onProgress?: (data: { status: string, progress_pct: number }) => void,
 *   onResult?:   (result: SimulationResult) => void,
 *   onError?:    (msg: string) => void,
 *   onClose?:    () => void,
 * }} callbacks
 * @returns {WebSocket}  Call `.close()` to unsubscribe.
 */
export function openResultsSocket(jobId, { onProgress, onResult, onError, onClose } = {}) {
  const wsBase = BASE_URL.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/api/hydrogen/ws/${jobId}`);

  ws.onopen = () => {
    import.meta.env.DEV && console.log(`[hydrogenService] WS open for job ${jobId}`);
  };

  ws.onmessage = (evt) => {
    let data;
    try {
      data = JSON.parse(evt.data);
    } catch (_) {
      return;
    }

    if (data.status === "done" && data.result) {
      onResult?.(data.result);
    } else if (data.status === "error") {
      onError?.(data.error ?? "Unknown simulation error");
    } else {
      onProgress?.(data);
    }
  };

  ws.onerror = () => {
    onError?.("WebSocket connection error. The MATLAB service may have crashed.");
  };

  ws.onclose = () => {
    import.meta.env.DEV && console.log(`[hydrogenService] WS closed for job ${jobId}`);
    onClose?.();
  };

  return ws;
}

/**
 * Convenience: start a simulation and subscribe to websocket updates in one call.
 *
 * @param {object} params  – same as startSimulation()
 * @param {{
 *   onQueued?:   (jobId: string) => void,
 *   onProgress?: (data) => void,
 *   onResult?:   (result) => void,
 *   onError?:    (msg) => void,
 * }} callbacks
 * @returns {Promise<() => void>}  Resolves to a cancel/unsubscribe function.
 */
export async function runSimulation(params, callbacks = {}) {
  const { job_id } = await startSimulation(params);
  callbacks.onQueued?.(job_id);
  const ws = openResultsSocket(job_id, callbacks);
  return () => ws.close();
}
