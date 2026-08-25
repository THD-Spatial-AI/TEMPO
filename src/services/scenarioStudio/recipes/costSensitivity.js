/**
 * Cost sensitivity sweep recipe.
 *
 * Generates one variant per step, each setting a key cost parameter to a
 * different value across a range. Use to see how the optimal energy mix
 * shifts as prices change (e.g. solar CAPEX 800 → 300 €/kW in 5 steps).
 *
 * Knobs (params):
 *   techMatch   {string | string[] | { parentIs, nameContains }}
 *               Which tech(s) to sweep. Default: 'solar_pv'.
 *   paramPath   {string}  Dot-path within the tech object.
 *               Default: 'costs.monetary.energy_cap'.
 *   valueFrom   {number}  Start value. Default: 800.
 *   valueTo     {number}  End value.   Default: 300.
 *   steps       {number}  Number of variants (≥ 2). Default: 5.
 *   unit        {string}  Display unit for labels.  Default: '€/kW'.
 *   level       'global' | 'both'   Default: 'global' (only global tech).
 */

export const PARAM_SCHEMA = {
  techMatch:  { type: 'techMatch', label: 'Technology',    default: 'solar_pv' },
  paramPath:  { type: 'select',    label: 'Parameter',     default: 'costs.monetary.energy_cap',
    options: [
      'costs.monetary.energy_cap',
      'costs.monetary.energy_prod',
      'costs.monetary.storage_cap',
      'constraints.energy_eff',
    ],
  },
  valueFrom:  { type: 'number',    label: 'From value',    default: 800 },
  valueTo:    { type: 'number',    label: 'To value',      default: 300 },
  steps:      { type: 'number',    label: 'Steps',         default: 5, min: 2, max: 20 },
  unit:       { type: 'text',      label: 'Display unit',  default: '€/kW' },
  level:      { type: 'select',    label: 'Apply to',      default: 'global', options: ['global', 'both'] },
};

/** Generate the step values as an evenly spaced array. */
export function stepValues(valueFrom, valueTo, steps) {
  const n = Math.max(2, Math.round(steps));
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(valueFrom + (valueTo - valueFrom) * (i / (n - 1)));
  }
  return result;
}

export function expand(model, params = {}) {
  const {
    techMatch = 'solar_pv',
    paramPath = 'costs.monetary.energy_cap',
    valueFrom = 800,
    valueTo = 300,
    steps = 5,
    unit = '€/kW',
    level = 'global',
  } = params;

  const values = stepValues(valueFrom, valueTo, steps);

  return values.map((value, i) => {
    const label = `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
    return {
      label,
      stepIndex: i,
      value,
      ops: [
        { op: 'setParam', techMatch, path: paramPath, value, level },
      ],
    };
  });
}
