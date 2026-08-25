/**
 * Carbon cap / net-zero recipe.
 *
 * Generates one variant per snapshot year, each setting a CO₂ cap that
 * tightens from startCap toward endCap (0 for net-zero).
 *
 * The constraint is stored in modelConfig.groupConstraints.co2_cap and
 * converted to a Calliope-native group_constraints override at dispatch.
 * See utils.buildCalliope06GroupConstraintsOverride.
 *
 * Requires the model's technologies to have co2 costs defined
 * (costs.co2 or costs.monetary.co2). The constraint enforces that the
 * total CO₂ cost does not exceed the cap.
 *
 * Knobs (params):
 *   baseYear       {number}  Year of startCap. Default: 2025.
 *   targetYear     {number}  Year of endCap.  Default: 2040.
 *   snapshotYears  {number[] | { from, to, step }}
 *   startCap       {number}  CO₂ cap at baseYear (Mt / model unit). Default: 100.
 *   endCap         {number}  CO₂ cap at targetYear. 0 = net-zero. Default: 0.
 *   interpolation  'linear' | 'exponential'  Default: 'linear'.
 */

import { resolveYears, progress } from '../utils.js';

export const PARAM_SCHEMA = {
  baseYear:      { type: 'number',  label: 'Base year',     default: 2025 },
  targetYear:    { type: 'number',  label: 'Target year',   default: 2040 },
  snapshotYears: { type: 'yearRange', label: 'Snapshot years', default: { from: 2025, to: 2040, step: 5 } },
  startCap:      { type: 'number',  label: 'Start CO₂ cap', unit: 'Mt', default: 100 },
  endCap:        { type: 'number',  label: 'End CO₂ cap',   unit: 'Mt', default: 0 },
  interpolation: { type: 'select',  label: 'Interpolation', default: 'linear', options: ['linear', 'exponential'] },
};

function interpolateCap(startCap, endCap, t, mode) {
  if (mode === 'exponential' && startCap > 0 && endCap >= 0) {
    // Geometric decay: cap = startCap * (endCap / startCap)^t
    // If endCap = 0, use a very small floor (near-zero) to avoid log(0)
    const safeEnd = Math.max(endCap, startCap * 1e-6);
    return startCap * Math.pow(safeEnd / startCap, t);
  }
  return startCap + (endCap - startCap) * t;
}

export function expand(model, params = {}) {
  const {
    baseYear = 2025,
    targetYear = 2040,
    snapshotYears = { from: 2025, to: 2040, step: 5 },
    startCap = 100,
    endCap = 0,
    interpolation = 'linear',
  } = params;

  const years = resolveYears(snapshotYears);

  return years.map(year => {
    const t = progress(baseYear, targetYear, year);
    const cap = interpolateCap(startCap, endCap, t, interpolation);

    return {
      label: String(year),
      year,
      t,
      capValue: cap,
      ops: [
        { op: 'systemConstraint', kind: 'co2_cap', value: cap },
      ],
    };
  });
}
