/**
 * Demand growth pathway recipe.
 *
 * Generates one variant per snapshot year, each scaling the demand tech's
 * resource_scale by the compounded annual growth rate relative to the base year.
 *
 * Knobs (params):
 *   baseYear       {number}   Year whose demand = 1.0. Default: 2025.
 *   ratePerYear    {number}   Annual growth rate as a fraction, e.g. 0.015 = 1.5%.
 *   snapshotYears  {number[] | { from, to, step }}  Years to solve. Default: 2025..2040 step 5.
 *   demandTechs    {string | string[] | { parentIs: string }}  Which techs to scale.
 *                  Default: all techs whose .parent === 'demand'.
 *
 * Returns: Variant[]  where Variant = { label: string, year: number, ops: TransformOp[] }
 */

export const PARAM_SCHEMA = {
  baseYear:     { type: 'number',    label: 'Base year',           default: 2025 },
  ratePerYear:  { type: 'percent',   label: 'Annual growth rate',  default: 1.5 },
  snapshotYears:{ type: 'yearRange', label: 'Snapshot years',      default: { from: 2025, to: 2040, step: 5 } },
  demandTechs:  { type: 'techMatch', label: 'Demand technologies', default: { parentIs: 'demand' } },
};

function resolveYears(snapshotYears) {
  if (Array.isArray(snapshotYears)) return [...snapshotYears];
  const { from, to, step = 5 } = snapshotYears;
  const years = [];
  for (let y = from; y <= to; y += step) years.push(y);
  return years;
}

function resolveDemandTechs(model, demandTechs) {
  if (Array.isArray(demandTechs)) return demandTechs;
  if (typeof demandTechs === 'string') return [demandTechs];
  const selector = demandTechs ?? { parentIs: 'demand' };
  const parentFilter = selector.parentIs ?? 'demand';
  return (model.technologies || [])
    .filter(t => t.parent === parentFilter)
    .map(t => t.name);
}

/**
 * @param {object} model  - TEMPO internal model (with .technologies, .locations)
 * @param {object} params - knob values (see PARAM_SCHEMA)
 * @returns {Array<{ label: string, year: number, ops: object[] }>}
 */
export function expand(model, params = {}) {
  const {
    baseYear = 2025,
    ratePerYear = 0.015,
    snapshotYears = { from: 2025, to: 2040, step: 5 },
    demandTechs = { parentIs: 'demand' },
  } = params;

  // Accept percent input (1.5) or fractional (0.015)
  const rate = ratePerYear > 1 ? ratePerYear / 100 : ratePerYear;

  const years = resolveYears(snapshotYears);
  const techNames = resolveDemandTechs(model, demandTechs);

  return years.map(year => {
    const factor = Math.pow(1 + rate, year - baseYear);
    return {
      label: String(year),
      year,
      ops: techNames.map(techName => ({
        op: 'scaleParam',
        techMatch: techName,
        path: 'constraints.resource_scale',
        factor,
        level: 'both',
      })),
    };
  });
}
