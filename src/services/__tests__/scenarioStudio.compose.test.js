import { describe, it, expect } from 'vitest';
import { composeOps, composeRecipes } from '../scenarioStudio/compose.js';
import { applyOps } from '../scenarioStudio/transform.js';

function makeModel() {
  return {
    technologies: [
      { name: 'solar_pv',           parent: 'supply', constraints: { energy_cap_max: 5000 } },
      { name: 'wind_onshore',       parent: 'supply', constraints: { energy_cap_max: 3000 } },
      { name: 'coal_power',         parent: 'supply', constraints: { energy_cap_max: 2000 } },
      { name: 'gas_ccgt',           parent: 'supply', constraints: { energy_cap_max: 1500 } },
      { name: 'demand_electricity', parent: 'demand', constraints: { resource_scale: 1.0 } },
    ],
    locations: [],
  };
}

// ─── composeOps: conflict rules ─────────────────────────────────────────────────

describe('composeOps', () => {
  it('multiplies overlapping scaleParam ops on the same slot', () => {
    const { ops, warnings } = composeOps([
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.1, level: 'both' },
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.2, level: 'both' },
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('scaleParam');
    expect(ops[0].factor).toBeCloseTo(1.32); // 1.1 * 1.2
    expect(warnings).toHaveLength(0); // multiplicative compose is intentional, not a conflict
  });

  it('last-layer-wins for overlapping setParam and warns', () => {
    const { ops, warnings } = composeOps([
      { op: 'setParam', techMatch: 'solar_pv', path: 'costs.monetary.energy_cap', value: 800 },
      { op: 'setParam', techMatch: 'solar_pv', path: 'costs.monetary.energy_cap', value: 300 },
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].value).toBe(300);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/last layer/i);
  });

  it('last-wins for duplicate systemConstraint of the same kind and warns', () => {
    const { ops, warnings } = composeOps([
      { op: 'systemConstraint', kind: 'co2_cap', value: 100 },
      { op: 'systemConstraint', kind: 'co2_cap', value: 0 },
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].value).toBe(0);
    expect(warnings).toHaveLength(1);
  });

  it('keeps systemConstraints of different kinds', () => {
    const { ops, warnings } = composeOps([
      { op: 'systemConstraint', kind: 'co2_cap', value: 0 },
      { op: 'systemConstraint', kind: 'renewable_min', value: { share: 0.8, techs: [] } },
    ]);
    expect(ops).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });

  it('dedupes duplicate disableTech ops', () => {
    const { ops } = composeOps([
      { op: 'disableTech', techMatch: 'coal_power' },
      { op: 'disableTech', techMatch: 'coal_power' },
    ]);
    expect(ops).toHaveLength(1);
  });

  it('keeps both and warns on mixed set/scale of the same slot (order-dependent)', () => {
    const { ops, warnings } = composeOps([
      { op: 'setParam',   techMatch: 'solar_pv', path: 'constraints.energy_cap_max', value: 1000 },
      { op: 'scaleParam', techMatch: 'solar_pv', path: 'constraints.energy_cap_max', factor: 2 },
    ]);
    expect(ops).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/order-dependent/i);
  });

  it('does not merge ops on different techs', () => {
    const { ops } = composeOps([
      { op: 'scaleParam', techMatch: 'solar_pv',     path: 'constraints.resource_scale', factor: 1.1 },
      { op: 'scaleParam', techMatch: 'wind_onshore', path: 'constraints.resource_scale', factor: 1.2 },
    ]);
    expect(ops).toHaveLength(2);
  });

  it('passes through addTech ops untouched', () => {
    const { ops } = composeOps([
      { op: 'addTech', tech: 'electrolyser', defaults: {} },
      { op: 'addTech', tech: 'ccs_retrofit', defaults: {} },
    ]);
    expect(ops).toHaveLength(2);
  });

  it('preserves first-seen order of slots', () => {
    const { ops } = composeOps([
      { op: 'systemConstraint', kind: 'co2_cap', value: 50 },
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.1 },
    ]);
    expect(ops[0].op).toBe('systemConstraint');
    expect(ops[1].op).toBe('scaleParam');
  });
});

// ─── composeRecipes: alignment ──────────────────────────────────────────────────

describe('composeRecipes', () => {
  it('aligns two year-based recipes by year and unions ops', () => {
    const { variants } = composeRecipes(makeModel(), [
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 1.5, snapshotYears: [2025, 2030] } },
      { recipeId: 'carbonCap',    params: { baseYear: 2025, targetYear: 2030, snapshotYears: [2025, 2030], startCap: 100, endCap: 0 } },
    ]);
    expect(variants.map(v => v.year)).toEqual([2025, 2030]);
    // Each year should carry both a scaleParam (demand) and a systemConstraint (co2)
    variants.forEach(v => {
      expect(v.ops.some(o => o.op === 'scaleParam')).toBe(true);
      expect(v.ops.some(o => o.op === 'systemConstraint' && o.kind === 'co2_cap')).toBe(true);
    });
  });

  it('produces the union of years when layers differ', () => {
    const { variants } = composeRecipes(makeModel(), [
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 1.5, snapshotYears: [2025, 2035] } },
      { recipeId: 'carbonCap',    params: { baseYear: 2025, targetYear: 2040, snapshotYears: [2030, 2040], startCap: 100, endCap: 0 } },
    ]);
    expect(variants.map(v => v.year)).toEqual([2025, 2030, 2035, 2040]);
  });

  it('composed demand+carbon variant applies both via applyOps', () => {
    const m = makeModel();
    const { variants } = composeRecipes(m, [
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 2.0, snapshotYears: [2030] } },
      { recipeId: 'carbonCap',    params: { baseYear: 2025, targetYear: 2030, snapshotYears: [2030], startCap: 100, endCap: 20 } },
    ]);
    const concrete = applyOps(m, variants[0].ops);
    // demand scaled up by (1.02)^5
    const demandScale = concrete.technologies.find(t => t.name === 'demand_electricity').constraints.resource_scale;
    expect(demandScale).toBeCloseTo(Math.pow(1.02, 5), 4);
    // co2 cap written
    expect(concrete.modelConfig.groupConstraints.co2_cap).toBeCloseTo(20);
  });

  it('returns single recipe untouched when only one layer', () => {
    const { variants, warnings } = composeRecipes(makeModel(), [
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 1.5, snapshotYears: [2025, 2030] } },
    ]);
    expect(variants).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });

  it('warns and skips sweep layers stacked with pathways', () => {
    const { variants, warnings } = composeRecipes(makeModel(), [
      { recipeId: 'demandGrowth',    params: { baseYear: 2025, ratePerYear: 1.5, snapshotYears: [2025, 2030] } },
      { recipeId: 'costSensitivity', params: { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 3 } },
    ]);
    expect(variants.map(v => v.year)).toEqual([2025, 2030]); // pathway preserved
    expect(warnings.some(w => /sweep/i.test(w))).toBe(true);
  });

  it('broadcasts a constant (custom single-variant) layer onto every year', () => {
    const { variants } = composeRecipes(makeModel(), [
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 1.5, snapshotYears: [2025, 2030] } },
      { recipeId: 'custom',       params: { variantLabel: 'x', ops: [{ op: 'disableTech', techMatch: 'coal_power' }] } },
    ]);
    expect(variants).toHaveLength(2);
    variants.forEach(v => {
      expect(v.ops.some(o => o.op === 'disableTech' && o.techMatch === 'coal_power')).toBe(true);
    });
  });

  it('multiplicatively composes two demand-growth layers on the same tech', () => {
    const m = makeModel();
    const { variants, warnings } = composeRecipes(m, [
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 3.0, snapshotYears: [2030] } },
      { recipeId: 'demandGrowth', params: { baseYear: 2025, ratePerYear: 2.0, snapshotYears: [2030] } },
    ]);
    const concrete = applyOps(m, variants[0].ops);
    const scale = concrete.technologies.find(t => t.name === 'demand_electricity').constraints.resource_scale;
    // (1.03)^5 * (1.02)^5
    expect(scale).toBeCloseTo(Math.pow(1.03, 5) * Math.pow(1.02, 5), 4);
    expect(warnings).toHaveLength(0);
  });

  it('returns empty for no layers', () => {
    expect(composeRecipes(makeModel(), []).variants).toHaveLength(0);
    expect(composeRecipes(makeModel(), null).variants).toHaveLength(0);
  });
});
