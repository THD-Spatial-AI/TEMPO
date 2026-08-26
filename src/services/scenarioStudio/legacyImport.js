/**
 * Converts TEMPO's legacy override format (dotted-key dicts) to TransformOp arrays.
 *
 * Legacy formats (from DataContext overrides/scenarios):
 *   overrides: { override_name: { "techs.solar_pv.constraints.energy_cap_max": 5000, ... } }
 *   scenarios: { scenario_name: ["override1", "override2"] }
 *
 * Convertible key patterns:
 *   techs.<name>.<path>                            → setParam, level=global
 *   locations.<loc>.techs.<name>.<path>            → setParam, level=location
 *
 * Anything else (model.subset_time, run.*, group_share.*, etc.) is skipped.
 */

function parseOverrideKey(key, value) {
  // techs.<name>.<path>
  const techM = key.match(/^techs\.([^.]+)\.(.+)$/);
  if (techM) {
    return { op: 'setParam', techMatch: techM[1], path: techM[2], value, level: 'global' };
  }
  // locations.<loc>.techs.<name>.<path>
  const locM = key.match(/^locations\.[^.]+\.techs\.([^.]+)\.(.+)$/);
  if (locM) {
    return { op: 'setParam', techMatch: locM[1], path: locM[2], value, level: 'location' };
  }
  return null;
}

/**
 * Convert a single override dict to TransformOps.
 * @param {Record<string,any>} overrideDict
 * @returns {{ ops: TransformOp[], skipped: string[] }}
 */
export function importLegacyOverride(overrideDict) {
  const ops = [];
  const skipped = [];
  for (const [key, value] of Object.entries(overrideDict || {})) {
    const op = parseOverrideKey(key, value);
    if (op) ops.push(op);
    else skipped.push(key);
  }
  return { ops, skipped };
}

/**
 * Convert a scenario (ordered list of override names) to TransformOps.
 * @param {Record<string,any>} overrides  - all model overrides
 * @param {string[]} scenarioOverrideNames
 * @returns {{ ops: TransformOp[], skippedKeys: string[], missingOverrides: string[] }}
 */
export function importLegacyScenario(overrides, scenarioOverrideNames) {
  const ops = [];
  const skippedKeys = [];
  const missingOverrides = [];
  for (const name of scenarioOverrideNames || []) {
    const dict = overrides?.[name];
    if (!dict) { missingOverrides.push(name); continue; }
    const { ops: converted, skipped } = importLegacyOverride(dict);
    ops.push(...converted);
    skippedKeys.push(...skipped);
  }
  return { ops, skippedKeys, missingOverrides };
}
