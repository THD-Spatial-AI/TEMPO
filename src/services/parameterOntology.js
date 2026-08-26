/**
 * parameterOntology.js
 * --------------------
 * Engine-neutral ("common"/ontology) technology parameters and the mapping to
 * the Calliope constraint/cost fields that TEMPO stores internally.
 *
 * All mapping data comes from python/parameterOntology.json — the SAME file the
 * Python translators read — so JS and Python never drift (mirrors the
 * calliope07_mapping.json pattern). Never duplicate the mapping here.
 *
 * Design: common values are stored in canonical (Calliope) units and each maps
 * to exactly one Calliope constraint or cost. Existing models (which store raw
 * Calliope constraints/costs) therefore reverse-map into the common surface with
 * no data loss; any Calliope field without a common equivalent is returned as
 * "leftover" so the raw Calliope power-user panel can still edit it.
 */

import ontology from '../../python/parameterOntology.json';

/** Map of commonId -> definition ({label, description, unit, category, calliope, appliesTo, engines}). */
export const COMMON_PARAMS = ontology.common;
export const COMMON_PARAM_IDS = Object.keys(COMMON_PARAMS);

// Reverse lookups: Calliope field name -> commonId
const _constraintToCommon = {};
const _costToCommon = {};
for (const [id, def] of Object.entries(COMMON_PARAMS)) {
  const c = def.calliope;
  if (!c) continue;
  if (c.kind === 'constraint') _constraintToCommon[c.name] = id;
  else if (c.kind === 'cost') _costToCommon[c.name] = id;
}

/** Set of Calliope constraint names that a common param already covers. */
export const COMMON_CALLIOPE_CONSTRAINTS = new Set(
  Object.values(COMMON_PARAMS).filter((d) => d.calliope?.kind === 'constraint').map((d) => d.calliope.name)
);
/** Set of Calliope cost (monetary) names that a common param already covers. */
export const COMMON_CALLIOPE_COSTS = new Set(
  Object.values(COMMON_PARAMS).filter((d) => d.calliope?.kind === 'cost').map((d) => d.calliope.name)
);

/** Look up a single common parameter definition. */
export function getCommonParam(id) {
  return COMMON_PARAMS[id] || null;
}

/**
 * Common parameters applicable to a given Calliope parent type
 * (supply, supply_plus, storage, conversion, conversion_plus, transmission, demand).
 * @returns {Array<{id: string} & object>} definitions with their id inlined
 */
export function commonParamsForParent(parent) {
  return COMMON_PARAM_IDS
    .filter((id) => {
      const applies = COMMON_PARAMS[id].appliesTo;
      return !applies || applies.includes(parent);
    })
    .map((id) => ({ id, ...COMMON_PARAMS[id] }));
}

/** Per-engine target names for a common param (for UI hints / translator use). */
export function engineTargetsFor(id) {
  return COMMON_PARAMS[id]?.engines || {};
}

/**
 * Reverse-map stored Calliope constraints + monetary costs onto the common
 * surface. Fields with no common equivalent are returned untouched as leftovers
 * (for the raw Calliope engine-specific panel).
 *
 * @param {Object} [constraints]     - tech.constraints
 * @param {Object} [monetaryCosts]   - tech.costs.monetary
 * @returns {{ common: Object, leftoverConstraints: Object, leftoverCosts: Object }}
 */
export function calliopeToCommon(constraints = {}, monetaryCosts = {}) {
  const common = {};
  const leftoverConstraints = {};
  const leftoverCosts = {};

  for (const [key, value] of Object.entries(constraints || {})) {
    const id = _constraintToCommon[key];
    if (id) common[id] = value;
    else leftoverConstraints[key] = value;
  }
  for (const [key, value] of Object.entries(monetaryCosts || {})) {
    const id = _costToCommon[key];
    if (id) common[id] = value;
    else leftoverCosts[key] = value;
  }
  return { common, leftoverConstraints, leftoverCosts };
}

/**
 * Forward-map common values back into Calliope constraints + costs.monetary.
 * Empty/undefined/null values are skipped (treated as "not set").
 *
 * @param {Object} [common] - { commonId: value }
 * @returns {{ constraints: Object, costs: { monetary: Object } }}
 */
export function commonToCalliope(common = {}) {
  const constraints = {};
  const monetary = {};
  for (const [id, value] of Object.entries(common || {})) {
    const def = COMMON_PARAMS[id];
    if (!def || value === undefined || value === null || value === '') continue;
    if (def.calliope.kind === 'constraint') constraints[def.calliope.name] = value;
    else monetary[def.calliope.name] = value;
  }
  return { constraints, costs: { monetary } };
}
