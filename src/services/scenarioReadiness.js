// Readiness of each run in a batch: the model with its scenario or override applied.
import { checkModel } from './modelReadiness.js';
import { resolveScenario } from './scenarioResolver.js';

const allIssues = (r) => [...r.critical, ...r.errors, ...r.warnings];

// Marks with `setBy: name` the issues the scenario brings in: a code the base model does not
// have, or more items under it. Fix links still go to the base entity.
export function markSetBy(readiness, base, name) {
  const before = new Map(allIssues(base).map((i) => [i.code, i]));
  const mark = (list) => list.map((i) => {
    const prev = before.get(i.code);
    const added = !prev || (i.count || 0) > (prev.count || 0) || (i.items || []).some((x) => !(prev.items || []).includes(x));
    return added ? { ...i, setBy: name } : i;
  });
  return { ...readiness, critical: mark(readiness.critical), errors: mark(readiness.errors), warnings: mark(readiness.warnings) };
}

// One check per run config ({ type: 'scenario'|'override', name }, or null for the base model),
// resolved the way the non-Calliope engines get it. When part of an override only Calliope
// applies, demand_no_profile stays a warning: the scenario may still supply the profile.
export function checkRunConfigs(model, configs, { overrides = {}, scenarios = {}, ignored } = {}) {
  const base = checkModel(model, { ignored });
  return configs.map((config) => {
    if (!config) return { config, name: null, readiness: base };
    const { model: resolved, report } = resolveScenario(model, overrides, scenarios, config);
    const partial = report.some((line) => line.endsWith('skipped'));
    const readiness = checkModel(resolved, { ignored, scenarioSelected: partial });
    return { config, name: config.name, readiness: markSetBy(readiness, base, config.name) };
  });
}

// Log lines for a run skipped by its check, in the engines' [issue:<code>] format so the
// log viewer links each one to where it is fixed.
export function issueLogLines(readiness) {
  return readiness.critical.map((i) => {
    const more = (i.count || 0) - (i.items?.length || 0);
    const where = i.items?.length ? ` (${i.items.join(', ')}${more > 0 ? ` +${more} more` : ''})` : '';
    return `[issue:${i.code}] ${i.message}${where}`;
  });
}
