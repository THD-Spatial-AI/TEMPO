/**
 * Helpers for a model's own scenarios / overrides (imported from Calliope YAML,
 * Calliope 0.7, or a TEMPO-exported engine archive).
 *
 *   overrides: { name: { ...nested Calliope YAML or "dotted.key": value } }
 *   scenarios: { name: ["override_or_scenario", ...] | "a,b" }
 */

/**
 * Flatten a (possibly nested) override dict to dotted keys. Arrays and scalars
 * are leaves; already-dotted keys pass through unchanged.
 * @returns {Record<string, any>}
 */
export function flattenOverride(override, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(override || {})) {
    if (k === '_meta') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flattenOverride(v, key, out);
    else out[key] = v;
  }
  return out;
}

function scenarioEntries(scenarios, name) {
  const def = scenarios?.[name];
  if (Array.isArray(def)) return def.map(String);
  if (typeof def === 'string') return def.split(',').map(s => s.trim()).filter(Boolean);
  return [name];
}

/**
 * Expand a scenario (or a single override) to its ordered, de-duplicated list of
 * override names. Scenarios may reference other scenarios (as Calliope allows).
 */
export function expandScenario(model, name, seen = new Set()) {
  const scenarios = model?.scenarios || {};
  if (!(name in scenarios)) return [name];
  if (seen.has(name)) return [];
  seen.add(name);
  const out = [];
  for (const entry of scenarioEntries(scenarios, name)) {
    const names = entry in scenarios && entry !== name ? expandScenario(model, entry, seen) : [entry];
    names.forEach(n => { if (!out.includes(n)) out.push(n); });
  }
  return out;
}

/** True when the model carries any scenarios or overrides. */
export function hasModelScenarios(model) {
  return Object.keys(model?.scenarios || {}).length > 0 || Object.keys(model?.overrides || {}).length > 0;
}
