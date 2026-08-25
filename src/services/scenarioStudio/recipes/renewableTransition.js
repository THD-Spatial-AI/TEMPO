/**
 * Renewable transition pathway recipe.
 *
 * Generates one variant per snapshot year. Each variant:
 *   1. Phases fossil techs out — scales their energy_cap_max down toward 0
 *      (graduated) or disables them at/after the target year (cliff).
 *   2. Optionally scales renewable tech energy_cap_max up (to allow expansion).
 *
 * System-level renewable_min constraint (carrier_prod_min_systemwide) is stored
 * in modelConfig.groupConstraints for conversion to a Calliope native override
 * at dispatch. See utils.buildCalliope06GroupConstraintsOverride.
 *
 * Knobs (params):
 *   baseYear        {number}   Year of baseline (no change). Default: 2025.
 *   targetYear      {number}   Year fossil techs fully phased out. Default: 2040.
 *   snapshotYears   {number[] | { from, to, step }}
 *   fossilTechs     {string[] | { nameContains: string[] }}
 *                   Auto: matched by FOSSIL_KEYWORDS on tech name.
 *   renewableCapScale {number | null}  If set, scales renewable energy_cap_max
 *                   at targetYear to this factor (e.g. 2.0 = allow 2× more capacity).
 *   renewableMinShare {number | null}  If set, adds a renewable_min system
 *                   constraint ramping from 0 to this share (0–1) by targetYear.
 *   renewableTechs  {string[]}  Required when renewableMinShare is set. Techs
 *                   counted as renewable in the constraint.
 *   phaseOutMode    'graduated' | 'cliff'   Default: 'graduated'.
 */

import { resolveYears, resolveTechMatch, progress, FOSSIL_KEYWORDS } from '../utils.js';

export const PARAM_SCHEMA = {
  baseYear:          { type: 'number',   label: 'Base year',         default: 2025 },
  targetYear:        { type: 'number',   label: 'Target year',       default: 2040 },
  snapshotYears:     { type: 'yearRange',label: 'Snapshot years',    default: { from: 2025, to: 2040, step: 5 } },
  fossilTechs:       { type: 'techMatch',label: 'Fossil technologies',default: { nameContains: FOSSIL_KEYWORDS } },
  phaseOutMode:      { type: 'select',   label: 'Phase-out mode',    default: 'graduated', options: ['graduated', 'cliff'] },
  renewableCapScale: { type: 'number',   label: 'Renewable cap scale (at target)', default: null },
  renewableMinShare: { type: 'percent',  label: 'Renewable min share (at target)', default: null },
  renewableTechs:    { type: 'techMatch',label: 'Renewable technologies (for min constraint)', default: [] },
};

function fossilOps(model, fossilNames, t, phaseOutMode) {
  const ops = [];
  for (const name of fossilNames) {
    const tech = (model.technologies || []).find(tt => tt.name === name);
    if (!tech) continue;

    if (t >= 1) {
      ops.push({ op: 'disableTech', techMatch: name });
      continue;
    }
    if (t <= 0) continue; // base year — no change

    if (phaseOutMode === 'cliff') continue; // only act at t >= 1

    // Graduated: scale down from the explicit cap if present.
    const cap = tech.constraints?.energy_cap_max;
    if (typeof cap === 'number' && isFinite(cap)) {
      const newCap = cap * (1 - t);
      ops.push({ op: 'setParam', techMatch: name, path: 'constraints.energy_cap_max', value: newCap, level: 'global' });
    }
    // Location overrides: scale existing values proportionally
    ops.push({ op: 'scaleParam', techMatch: name, path: 'constraints.energy_cap_max', factor: 1 - t, level: 'location' });
  }
  return ops;
}

export function expand(model, params = {}) {
  const {
    baseYear = 2025,
    targetYear = 2040,
    snapshotYears = { from: 2025, to: 2040, step: 5 },
    fossilTechs = { nameContains: FOSSIL_KEYWORDS },
    phaseOutMode = 'graduated',
    renewableCapScale = null,
    renewableMinShare = null,
    renewableTechs = [],
  } = params;

  const years = resolveYears(snapshotYears);
  const fossilNames = resolveTechMatch(model.technologies, fossilTechs);
  const renewableNames = resolveTechMatch(model.technologies, renewableTechs);

  return years.map(year => {
    const t = progress(baseYear, targetYear, year);
    const ops = [...fossilOps(model, fossilNames, t, phaseOutMode)];

    // Scale renewable capacity limits up at/toward target year
    if (renewableCapScale != null && renewableCapScale > 1 && t > 0) {
      const factor = 1 + (renewableCapScale - 1) * t;
      for (const name of renewableNames) {
        ops.push({ op: 'scaleParam', techMatch: name, path: 'constraints.energy_cap_max', factor, level: 'global' });
      }
    }

    // Renewable minimum system constraint (stored for dispatch-time Calliope override)
    if (renewableMinShare != null) {
      const share = (renewableMinShare > 1 ? renewableMinShare / 100 : renewableMinShare) * t;
      ops.push({
        op: 'systemConstraint',
        kind: 'renewable_min',
        value: { share, techs: renewableNames, carrier: 'electricity' },
      });
    }

    return { label: String(year), year, t, ops };
  });
}
