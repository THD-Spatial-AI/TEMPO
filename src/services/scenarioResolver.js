/**
 * Resolves a Calliope scenario or override into a concrete TEMPO internal model.
 *
 * Supports the most common dotted-key patterns used in TEMPO overrides:
 *   model.subset_time                             → modelConfig.startDate / endDate
 *   model.*                                       → modelConfig.*
 *   techs.{t}.constraints.{param}                → technologies[].constraints
 *   techs.{t}.costs.monetary.{param}             → technologies[].costs.monetary
 *   locations.{l}.techs.{t}.constraints.{param}  → location tech override
 *
 * Unknown keys (e.g. run.*, model.time.*) are silently skipped — they are
 * Calliope-specific and do not apply to non-Calliope runners.
 *
 * @param {object} model        - TEMPO internal model (with technologies, locations, links)
 * @param {object} overridesMap - overrides dict from DataContext
 * @param {object} scenariosMap - scenarios dict from DataContext
 * @param {{ type: 'scenario'|'override', name: string }} config
 * @returns {{ model: object, report: string[] }}
 */
export function resolveScenario(model, overridesMap, scenariosMap, config) {
  let overrideNames;
  if (config.type === 'scenario') {
    overrideNames = scenariosMap[config.name] || [];
    if (!Array.isArray(overrideNames)) overrideNames = [overrideNames];
  } else {
    overrideNames = [config.name];
  }

  const resolved = JSON.parse(JSON.stringify(model));
  const report = [`Resolved ${config.type} "${config.name}" (${overrideNames.join(', ')})`];

  for (const ovName of overrideNames) {
    const override = overridesMap[ovName];
    if (!override) {
      report.push(`Warning: override "${ovName}" not found — skipped`);
      continue;
    }
    for (const [dotKey, value] of Object.entries(override)) {
      if (dotKey === '_meta') continue;
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

  // model.* → modelConfig.*  (two-segment keys only; model.time.* etc. are skipped below)
  if (parts[0] === 'model' && parts.length === 2) {
    if (!model.modelConfig) model.modelConfig = {};
    model.modelConfig[parts[1]] = value;
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

  // Unknown key (run.*, model.time.*, etc.) — silently skip
}
