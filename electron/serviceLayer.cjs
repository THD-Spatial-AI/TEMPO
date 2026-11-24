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

// Exact pins (`name==version`) in an engine requirements file. A venv built by an
// older TEMPO keeps whatever pip resolved then (e.g. pandas 3.1 under PyPSA, which
// gives a wrong objective), so the pins are re-installed when the venv drifts.
function exactPins(text) {
  const pins = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z0-9_.-]+)==([^\s;]+)$/.exec(line);
    if (m) pins[m[1]] = m[2];
  }
  return pins;
}

// Prints {name: installed version} for every pin the venv does not match.
const pinCheckCode = (pins) => [
  'import json, importlib.metadata as m',
  `p = json.loads(${JSON.stringify(JSON.stringify(pins))})`,
  'def v(n):',
  '    try: return m.version(n)',
  '    except Exception: return None',
  'print(json.dumps({n: v(n) for n, w in p.items() if v(n) != w}))',
].join('\n');

async function ensurePinnedPackages({ python, requirementsPath, readFile, run, log }) {
  const pins = exactPins(readFile(requirementsPath));
  if (!Object.keys(pins).length) return { ok: true, repaired: false };
  try {
    const drift = JSON.parse(String(await run(python, ['-c', pinCheckCode(pins)])).trim() || '{}');
    if (!Object.keys(drift).length) return { ok: true, repaired: false };
    log(`Pinned packages differ (${Object.entries(drift).map(([n, have]) => `${n} ${have} → ${pins[n]}`).join(', ')}) — reinstalling ${requirementsPath}…`);
    await run(python, ['-m', 'pip', 'install', '--prefer-binary', '--no-warn-script-location', '-r', requirementsPath]);
    log('Pinned packages reinstalled.');
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

module.exports = { SERVICE_LAYER_CHECK, ensureServiceLayer, ensurePinnedPackages, exactPins, createRepairGate };
