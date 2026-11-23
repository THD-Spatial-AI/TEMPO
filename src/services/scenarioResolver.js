import { expandScenario, flattenOverride } from './modelScenarios.js';

/**
 * Resolves a Calliope scenario or override into a concrete TEMPO internal model.
 *
 * Overrides may be nested YAML (imported) or dotted keys; both are flattened to
 * dotted keys. Supported patterns:
 *   model.subset_time                             → modelConfig.startDate / endDate
 *   model.time (function: resample)               → modelConfig.timeResolution
 *   model.*                                       → modelConfig.*
 *   techs.{t}.constraints.{param}                → technologies[].constraints
 *   techs.{t}.costs.monetary.{param}             → technologies[].costs.monetary
 *   locations.{l}.techs.{t}.constraints.{param}  → location tech override
 *   techs.{t}.exists / locations.{l}.techs.{t}.exists = false → energy_cap_max 0
 *
 * Other keys (e.g. run.*, other model.time.* functions, group_constraints.*) are Calliope-specific;
 * they are skipped and listed in the report.
 *
 * @param {object} model        - TEMPO internal model (with technologies, locations, links)
 * @param {object} overridesMap - overrides dict from DataContext
 * @param {object} scenariosMap - scenarios dict from DataContext
 * @param {{ type: 'scenario'|'override', name: string }} config
 * @returns {{ model: object, report: string[] }}
 */
export function resolveScenario(model, overridesMap, scenariosMap, config) {
  const overrideNames = config.type === 'scenario'
    ? expandScenario({ scenarios: scenariosMap }, config.name)
    : [config.name];

  const resolved = JSON.parse(JSON.stringify(model));
  const report = [`Resolved ${config.type} "${config.name}" (${overrideNames.join(', ')})`];

  for (const ovName of overrideNames) {
    const override = overridesMap[ovName];
    if (!override) {
      report.push(`Warning: override "${ovName}" not found — skipped`);
      continue;
    }
    // Imported overrides are nested YAML; hand-written ones are dotted keys.
    for (const [dotKey, value] of Object.entries(flattenOverride(override))) {
      _applyDotKey(resolved, dotKey, value, report);
    }
  }

  return { model: resolved, report };
}

function _applyDotKey(model, dotKey, value, report) {
  const parts = dotKey.split('.');

  // model.subset_time → modelConfig.startDate / endDate
  if (parts[0] === 'model' && parts[1] === 'subset_time') {
    if (!model.modelConfig) model.modelConfig = {};
    if (Array.isArray(value) && value.length >= 2) {
      model.modelConfig.startDate = value[0];
      model.modelConfig.endDate = value[1];
    }
    return;
  }

  // model.time resample → modelConfig.timeResolution (each runner resamples natively)
  if (dotKey === 'model.time.function_options.resolution') {
    if (!model.modelConfig) model.modelConfig = {};
    model.modelConfig.timeResolution = String(value);
    return;
  }
  if (dotKey === 'model.time.function' && value === 'resample') return; // set together with the resolution

  // model.* → modelConfig.*  (two-segment keys only; model.time.* etc. are skipped below)
  if (parts[0] === 'model' && parts.length === 2) {
    if (!model.modelConfig) model.modelConfig = {};
    model.modelConfig[parts[1]] = value;
    return;
  }

  // techs.{tech}.exists: false → no capacity can be built
  if (parts[0] === 'techs' && parts.length === 3 && parts[2] === 'exists') {
    if (value === false) _applyDotKey(model, `techs.${parts[1]}.constraints.energy_cap_max`, 0, report);
    return;
  }

  // techs.{tech}.constraints.{param}
  if (parts[0] === 'techs' && parts.length >= 4 && parts[2] === 'constraints') {
    const tech = (model.technologies || []).find(t => t.name === parts[1]);
    if (tech) {
      if (!tech.constraints) tech.constraints = {};
      tech.constraints[parts.slice(3).join('.')] = value;
    } else {
      report.push(`Override "${dotKey}": tech "${parts[1]}" not found — skipped`);
    }
    return;
  }

  // techs.{tech}.costs.monetary.{param}
  if (parts[0] === 'techs' && parts.length >= 5 && parts[2] === 'costs') {
    const tech = (model.technologies || []).find(t => t.name === parts[1]);
    if (tech) {
      if (!tech.costs) tech.costs = {};
      if (!tech.costs.monetary) tech.costs.monetary = {};
      tech.costs.monetary[parts.slice(4).join('.')] = value;
    }
    return;
  }

  // locations.{loc}.techs.{tech}.constraints.{param}
  if (parts[0] === 'locations' && parts.length >= 6 && parts[2] === 'techs' && parts[4] === 'constraints') {
    const loc = (model.locations || []).find(l => l.name === parts[1]);
    if (loc) {
      if (!loc.techs) loc.techs = {};
      if (!loc.techs[parts[3]]) loc.techs[parts[3]] = {};
      if (!loc.techs[parts[3]].constraints) loc.techs[parts[3]].constraints = {};
      loc.techs[parts[3]].constraints[parts.slice(5).join('.')] = value;
    } else {
      report.push(`Override "${dotKey}": location "${parts[1]}" not found — skipped`);
    }
    return;
  }

  // locations.{loc}.techs.{tech}.exists: false → no capacity at that location
  if (parts[0] === 'locations' && parts.length === 5 && parts[2] === 'techs' && parts[4] === 'exists') {
    if (value === false) _applyDotKey(model, `locations.${parts[1]}.techs.${parts[3]}.constraints.energy_cap_max`, 0, report);
    return;
  }

  // Unknown key (run.*, model.time.*, group_constraints.*, …) — Calliope-only
  report.push(`Override "${dotKey}": not supported outside Calliope — skipped`);
}

/** Whether resolveScenario can apply a dotted override key (mirrors _applyDotKey). */
export function isPortableOverrideKey(dotKey) {
  const p = dotKey.split('.');
  if (p[0] === 'model') return p[1] === 'subset_time' || p.length === 2
    || dotKey === 'model.time.function_options.resolution';
  if (p[0] === 'techs') return (p.length === 3 && p[2] === 'exists') || (p.length >= 4 && p[2] === 'constraints') || (p.length >= 5 && p[2] === 'costs');
  if (p[0] === 'locations' && p[2] === 'techs') return (p.length === 5 && p[4] === 'exists') || (p.length >= 6 && p[4] === 'constraints');
  return false;
}
