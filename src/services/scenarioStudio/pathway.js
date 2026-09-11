/**
 * Scenario Studio — myopic pathway helpers.
 *
 * A myopic (recursive-dynamic) pathway solves each snapshot year in sequence,
 * carrying the previous year's installed capacity forward as fixed, capex-free
 * residual capacity (see transform.js `vintageResidual`). These helpers turn a
 * prior year's frozen-contract result into the `existingCaps` for the next step.
 */

// Tech parents whose capacity is a persistent investment worth carrying forward.
// Demand and transmission are excluded (not build decisions in this sense).
export const CARRY_FORWARD_PARENTS = ['supply', 'supply_plus', 'conversion', 'conversion_plus', 'storage'];

const DEFAULT_SUFFIX = '_existing';

/**
 * Collapse a prior result's `capacities` ({ 'loc::tech': MW }) into cumulative
 * per-location existing capacity, folding any `<tech>_existing` shadow back onto
 * its base tech and summing. This is the residual carried into the next step.
 *
 * @param {Object<string, number>} priorCapacities
 * @param {string} suffix
 * @returns {Object<string, number>}  { 'loc::baseTech': MW }
 */
export function accumulateExistingCaps(priorCapacities, suffix = DEFAULT_SUFFIX) {
  const out = {};
  for (const [key, cap] of Object.entries(priorCapacities || {})) {
    if (!(cap > 0)) continue;
    const idx = key.lastIndexOf('::');
    if (idx < 0) continue;
    const loc = key.slice(0, idx);
    let tech = key.slice(idx + 2);
    if (tech.endsWith(suffix)) tech = tech.slice(0, -suffix.length);
    const k = `${loc}::${tech}`;
    out[k] = (out[k] || 0) + cap;
  }
  return out;
}

/**
 * Names of technologies eligible to carry capacity forward in a pathway.
 * @param {object} model
 * @returns {string[]}
 */
export function carryForwardTechs(model) {
  return (model?.technologies || [])
    .filter(t => CARRY_FORWARD_PARENTS.includes(t.parent))
    .map(t => t.name);
}

/**
 * Build the `vintageResidual` op that fixes prior capacity for the next step.
 * Returns null when there is nothing to carry (first step, or empty result).
 *
 * @param {object} model            base model for the next step
 * @param {Object<string,number>} priorCapacities  result.capacities of the prior step
 * @returns {object|null} a vintageResidual TransformOp
 */
export function buildCarryForwardOp(model, priorCapacities) {
  const existingCaps = accumulateExistingCaps(priorCapacities);
  if (Object.keys(existingCaps).length === 0) return null;
  const techs = carryForwardTechs(model);
  if (techs.length === 0) return null;
  return { op: 'vintageResidual', techMatch: techs, existingCaps };
}
