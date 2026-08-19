/**
 * Shared helpers for Scenario Studio recipes.
 */

export const RENEWABLE_KEYWORDS = ['solar', 'pv', 'wind', 'hydro', 'geothermal', 'biomass', 'wave', 'tidal', 'nuclear'];
export const FOSSIL_KEYWORDS    = ['coal', 'gas', 'oil', 'diesel', 'ccgt', 'ocgt', 'lignite', 'lignit'];

/** Expand a year range config to an array of years. */
export function resolveYears(snapshotYears) {
  if (Array.isArray(snapshotYears)) return [...snapshotYears];
  const { from, to, step = 5 } = snapshotYears;
  const years = [];
  for (let y = from; y <= to; y += step) years.push(y);
  return years;
}

/** Filter model technologies by keyword match on tech name. */
export function autoDetectTechs(technologies, keywords) {
  return (technologies || [])
    .filter(t => keywords.some(kw => t.name.toLowerCase().includes(kw)))
    .map(t => t.name);
}

/** Resolve a techMatch spec to a list of tech names from the model. */
export function resolveTechMatch(technologies, spec) {
  if (!spec) return [];
  if (Array.isArray(spec)) return spec;
  if (typeof spec === 'string') return [spec];
  if (spec.parentIs) return (technologies || []).filter(t => t.parent === spec.parentIs).map(t => t.name);
  if (spec.nameContains) return autoDetectTechs(technologies, Array.isArray(spec.nameContains) ? spec.nameContains : [spec.nameContains]);
  return [];
}

/** Clamp t to [0, 1]. */
export function progress(baseYear, targetYear, year) {
  if (targetYear <= baseYear) return year >= targetYear ? 1 : 0;
  return Math.min(1, Math.max(0, (year - baseYear) / (targetYear - baseYear)));
}

/**
 * Build Calliope-native group_constraints override block from a
 * modelConfig.groupConstraints map, for injection into the runner.
 *
 * Returns null if there are no system constraints to apply.
 */
export function buildCalliope06GroupConstraintsOverride(groupConstraints) {
  if (!groupConstraints || Object.keys(groupConstraints).length === 0) return null;
  const gc = {};

  if (groupConstraints.co2_cap !== undefined) {
    gc.studio_co2_cap = { cost_max: { co2: groupConstraints.co2_cap } };
  }
  if (groupConstraints.renewable_min !== undefined) {
    const { share, techs, carrier = 'electricity' } = groupConstraints.renewable_min;
    gc.studio_renewable_min = {
      carrier_prod_min_systemwide: { [carrier]: share },
      ...(techs && techs.length ? { techs } : {}),
    };
  }
  if (groupConstraints.reserve_margin !== undefined) {
    gc.studio_reserve_margin = { demand_share_per_loc_per_timestep_min: groupConstraints.reserve_margin };
  }

  return Object.keys(gc).length ? gc : null;
}
