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

// ─── Model-aware tech classification (for "actuator" cards) ──────────────────────

/** A supply/conversion tech (i.e. produces energy — not demand or transmission). */
export function isSupplyTech(tech) {
  const p = tech?.parent || '';
  if (p === 'demand' || p === 'transmission') return false;
  return true;
}

/** Renewable by name keyword. */
export function isRenewableTech(tech) {
  const n = (tech?.name || '').toLowerCase();
  return RENEWABLE_KEYWORDS.some(kw => n.includes(kw));
}

/** Emits CO₂ — has a CO₂/emission cost class defined, or a fossil-fuel name. */
export function isEmittingTech(tech) {
  const costs = tech?.costs || {};
  const hasCo2CostClass = Object.keys(costs).some(cls => /co2|co2e|emission|carbon/i.test(cls));
  const hasCo2Key = Object.values(costs).some(
    c => c && typeof c === 'object' && Object.keys(c).some(k => /co2|emission|carbon/i.test(k)));
  const fossil = FOSSIL_KEYWORDS.some(kw => (tech?.name || '').toLowerCase().includes(kw));
  return hasCo2CostClass || hasCo2Key || fossil;
}

/** Semantic tech-group catalogue for the actuator UI. */
export const TECH_GROUPS = [
  { id: 'all',          label: 'All supply techs' },
  { id: 'renewable',    label: 'Renewables' },
  { id: 'nonRenewable', label: 'Non-renewables' },
  { id: 'emitting',     label: 'Emitting (CO₂) techs' },
];

/** Semantic groups + the model's own parent groups (supply, conversion, …). */
export function techGroupsForModel(model) {
  const parents = [...new Set((model?.technologies || []).map(t => t.parent).filter(Boolean))]
    .filter(p => p !== 'demand' && p !== 'transmission');
  const parentGroups = parents.map(p => ({ id: `parent:${p}`, label: `Parent: ${p}` }));
  return [...TECH_GROUPS, ...parentGroups];
}

/** Resolve a semantic group id (or `parent:<p>`) to a list of tech names from the model. */
export function resolveTechGroup(model, groupId) {
  const techs = model?.technologies || [];
  if (groupId === 'all')          return techs.filter(isSupplyTech).map(t => t.name);
  if (groupId === 'renewable')    return techs.filter(isRenewableTech).map(t => t.name);
  if (groupId === 'emitting')     return techs.filter(isEmittingTech).map(t => t.name);
  if (groupId === 'nonRenewable') return techs.filter(t => isSupplyTech(t) && !isRenewableTech(t)).map(t => t.name);
  if (typeof groupId === 'string' && groupId.startsWith('parent:')) {
    const p = groupId.slice(7);
    return techs.filter(t => t.parent === p).map(t => t.name);
  }
  return [];
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
