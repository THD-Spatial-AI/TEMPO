// Service layer (FastAPI + uvicorn) health check and self-repair for engine venvs.
// Venvs created before the installer added requirements.service.txt (or built by
// hand) import the engine fine but cannot start their HTTP service; uvicorn then
// crash-loops silently. ensureServiceLayer() detects and repairs that.

const SERVICE_LAYER_CHECK = 'import fastapi, uvicorn';

async function ensureServiceLayer({ python, requirementsPath, run, log }) {
  try {
    await run(python, ['-c', SERVICE_LAYER_CHECK]);
    return { ok: true, repaired: false };
  } catch {
    log('Service layer (FastAPI/uvicorn) missing — installing requirements.service.txt…');
  }
  try {
    await run(python, ['-m', 'pip', 'install', '--prefer-binary', '--no-warn-script-location', '-r', requirementsPath]);
    await run(python, ['-c', SERVICE_LAYER_CHECK]);
    log('Service layer repaired.');
    return { ok: true, repaired: true };
  } catch (err) {
    return { ok: false, repaired: false, error: err.message || String(err) };
  }
}

// In-memory (per app session) memory of a failed repair, so an offline machine
// does not re-run a failing pip install on every automatic start. A forced
// attempt (user clicked Repair / Install) always goes through.
function createRepairGate() {
  let error = null;
  return {
    canAttempt: ({ force = false } = {}) => force || error === null,
    recordFailure: (err) => { error = err || 'unknown error'; },
    clear: () => { error = null; },
    lastError: () => error,
  };
}

module.exports = { SERVICE_LAYER_CHECK, ensureServiceLayer, createRepairGate };
