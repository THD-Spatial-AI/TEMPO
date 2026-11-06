// What TEMPO can install, and how a selection becomes an install plan.
// No electron dependency so it can be unit-tested; main.cjs supplies the actual
// install/verify steps for each component.

// Order is install order: required first, and a component after anything it `requires`.
// sizeGb is measured from real installs and only drives the disk-space check;
// dockerGb lives in Docker's own storage, so it is shown but not checked.
const COMPONENTS = [
  { id: 'backend', group: 'service', label: 'TEMPO backend', required: true, sizeGb: 0,
    description: 'Stores your models and serves the app. Included with TEMPO.' },
  { id: 'calliope', group: 'framework', label: 'Calliope 0.6.8', required: true, sizeGb: 0.62,
    description: 'The default modelling framework. The largest download: can take 20 minutes or more.' },
  { id: 'highs', group: 'solver', label: 'HiGHS', required: true, partOf: 'calliope', sizeGb: 0,
    description: 'Default solver, installed with Calliope.' },
  { id: 'cbc', group: 'solver', label: 'CBC', sizeGb: 0.01,
    description: 'Open-source solver, used by Calliope 0.7 when HiGHS is unavailable.' },
  { id: 'glpk', group: 'solver', label: 'GLPK', sizeGb: 0.01,
    description: 'Open-source solver, needed by OSeMOSYS.' },
  { id: 'calliope07', group: 'framework', label: 'Calliope 0.7', sizeGb: 0.35,
    description: 'Pre-release Calliope engine with custom math support.' },
  { id: 'pypsa', group: 'framework', label: 'PyPSA', sizeGb: 0.82,
    description: 'Power system analysis framework. Also enables PyPSA import and export.' },
  { id: 'osemosys', group: 'framework', label: 'OSeMOSYS', sizeGb: 0.19, requires: ['glpk'],
    description: 'Long-term energy planning (otoole + GLPK). Also enables OSeMOSYS import and export.' },
  { id: 'adoptnet0', group: 'framework', label: 'AdOpT-NET0', sizeGb: 0.6,
    description: 'Net-zero energy system optimisation. Downloads Python 3.12 if it is missing.' },
  { id: 'osm', group: 'tool', label: 'OSM region tools', default: true, sizeGb: 0.25,
    description: 'Download and process OpenStreetMap regions. The map still works without them, using live data.' },
  { id: 'demand', group: 'tool', label: 'Demand estimation', sizeGb: 0.6,
    description: 'Per-substation demand for Study Areas: gridded consumption data, land use and BDEW load profiles.' },
  { id: 'geo', group: 'service', label: 'PostGIS + GeoServer', sizeGb: 0, dockerGb: 4.6,
    description: 'Local database for curated OSM layers. Needs Docker Desktop.' },
];

const byId = new Map(COMPONENTS.map(c => [c.id, c]));

/** Required components, plus valid requested ids, plus whatever those require. */
function resolveSelection(ids = []) {
  const selected = new Set(COMPONENTS.filter(c => c.required).map(c => c.id));
  const add = (id) => {
    const component = byId.get(id);
    if (!component) return;
    selected.add(id);
    (component.requires || []).forEach(add);
  };
  ids.forEach(add);
  return selected;
}

/**
 * Turn a selection into ordered steps. `states` maps id → { installed, unavailable }
 * from main.cjs; `force` lists ids to reinstall even if they look healthy.
 * Actions: install | verify (already there, check it still works) | unavailable.
 */
function buildPlan(ids, states = {}, force = []) {
  const selected = resolveSelection(ids);
  return COMPONENTS.filter(c => selected.has(c.id)).map((c) => {
    const state = states[c.id] || {};
    const forced = force.includes(c.id) || (c.partOf && force.includes(c.partOf));
    let action = 'install';
    if (state.unavailable && !state.installed) action = 'unavailable';
    else if (state.installed && !forced) action = 'verify';
    return { id: c.id, action, reason: state.unavailable };
  });
}

function diskNeededGb(plan) {
  return plan.filter(s => s.action === 'install').reduce((sum, s) => sum + byId.get(s.id).sizeGb, 0);
}

const ERROR_HINTS = [
  [/no space left|errno 28|not enough space/i,
    'The disk ran out of space. Free some space, then retry.'],
  [/could not find a version|no matching distribution|connection|timed? ?out|temporary failure|name resolution|ssl|proxy|http \d{3} downloading/i,
    'Could not download the packages. Check your internet connection or proxy, then retry.'],
  [/permission denied|access is denied|winerror 5\b/i,
    'A file is locked or protected. Close other Python windows and retry; antivirus software can also cause this.'],
];

/** Lead with what the user can do about a failure, and keep the technical detail below it. */
function explainInstallError(message) {
  const hint = ERROR_HINTS.find(([pattern]) => pattern.test(message));
  return hint ? `${hint[1]}\n\n${message}` : message;
}

/**
 * Run a plan. A failed required component stops everything after it, because the
 * app can't work without it; a failed optional one is recorded and the rest continue.
 * verify(id) resolves to true when the component really works.
 */
async function runPlan({ plan, install, verify, emit = () => {} }) {
  const results = {};
  let aborted = false;
  const finish = (id, state, error) => {
    results[id] = error ? { state, error } : { state };
    emit({ id, state, error });
  };

  for (const { id, action, reason } of plan) {
    const component = byId.get(id);
    if (aborted) { finish(id, 'not-run'); continue; }
    if (action === 'unavailable') {
      finish(id, 'unavailable', reason);
      if (component.required) aborted = true;
      continue;
    }

    emit({ id, state: 'running' });
    try {
      // Already installed and still working: nothing to do, which also makes a retry resume.
      if (action === 'verify' && await verify(id)) { finish(id, 'skipped'); continue; }
      if (!component.partOf) await install(id);
      if (!await verify(id)) throw new Error(`${component.label} installed but failed verification`);
      finish(id, 'installed');
    } catch (err) {
      finish(id, 'failed', explainInstallError(err.message || String(err)));
      if (component.required) aborted = true;
    }
  }

  return { ok: !aborted, results };
}

module.exports = { COMPONENTS, resolveSelection, buildPlan, diskNeededGb, explainInstallError, runPlan };
