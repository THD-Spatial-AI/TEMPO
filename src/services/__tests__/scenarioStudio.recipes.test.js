import { describe, it, expect } from 'vitest';
import { expand as expandRenewable } from '../scenarioStudio/recipes/renewableTransition.js';
import { expand as expandCarbonCap } from '../scenarioStudio/recipes/carbonCap.js';
import { expand as expandCostSens, stepValues } from '../scenarioStudio/recipes/costSensitivity.js';
import { applyOps } from '../scenarioStudio/transform.js';
import { buildCalliope06GroupConstraintsOverride } from '../scenarioStudio/utils.js';

function makeModel() {
  return {
    technologies: [
      { name: 'solar_pv',            parent: 'supply',  constraints: { energy_cap_max: 5000 } },
      { name: 'wind_onshore',        parent: 'supply',  constraints: { energy_cap_max: 3000 } },
      { name: 'coal_power',          parent: 'supply',  constraints: { energy_cap_max: 2000 } },
      { name: 'gas_ccgt',            parent: 'supply',  constraints: { energy_cap_max: 1500 } },
      { name: 'demand_electricity',  parent: 'demand',  constraints: { resource_scale: 1.0 } },
      { name: 'battery',             parent: 'storage', constraints: { storage_cap_max: 1000 } },
    ],
    locations: [
      {
        name: 'Norte',
        techs: {
          coal_power: { constraints: { energy_cap_max: 800 } },
          solar_pv:   { constraints: { energy_cap_max: 2000 } },
        },
      },
    ],
  };
}

// ─── renewableTransition ────────────────────────────────────────────────────

describe('renewableTransition.expand', () => {
  it('generates one variant per snapshot year', () => {
    const v = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040,
      snapshotYears: [2025, 2030, 2040],
      fossilTechs: ['coal_power', 'gas_ccgt'],
    });
    expect(v).toHaveLength(3);
    expect(v.map(x => x.year)).toEqual([2025, 2030, 2040]);
  });

  it('base year produces no fossil ops (t=0)', () => {
    const v = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040,
      snapshotYears: [2025],
      fossilTechs: ['coal_power'],
    });
    expect(v[0].ops).toHaveLength(0);
  });

  it('target year disables fossil techs (t=1, graduated)', () => {
    const v = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040,
      snapshotYears: [2040],
      fossilTechs: ['coal_power'],
      phaseOutMode: 'graduated',
    });
    const disableOps = v[0].ops.filter(o => o.op === 'disableTech');
    expect(disableOps.some(o => o.techMatch === 'coal_power')).toBe(true);
  });

  it('intermediate year scales explicit cap down (graduated)', () => {
    const m = makeModel();
    const v = expandRenewable(m, {
      baseYear: 2025, targetYear: 2040,
      snapshotYears: [2030],
      fossilTechs: ['coal_power'],
      phaseOutMode: 'graduated',
    });
    // t = 5/15 ≈ 0.333; coal_power cap 2000 → 2000 * (1 - 0.333) ≈ 1333
    const concrete = applyOps(m, v[0].ops);
    const coalCap = concrete.technologies.find(t => t.name === 'coal_power').constraints.energy_cap_max;
    expect(coalCap).toBeCloseTo(2000 * (1 - 5/15), 1);
  });

  it('cliff mode: no ops at intermediate year, disables at target', () => {
    const v2030 = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040, snapshotYears: [2030],
      fossilTechs: ['coal_power'], phaseOutMode: 'cliff',
    });
    expect(v2030[0].ops).toHaveLength(0);

    const v2040 = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040, snapshotYears: [2040],
      fossilTechs: ['coal_power'], phaseOutMode: 'cliff',
    });
    expect(v2040[0].ops.some(o => o.op === 'disableTech' && o.techMatch === 'coal_power')).toBe(true);
  });

  it('auto-detects fossil techs by keyword', () => {
    const v = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040, snapshotYears: [2040],
      phaseOutMode: 'cliff',
      // fossilTechs not specified → auto
    });
    const disabledNames = v[0].ops.filter(o => o.op === 'disableTech').map(o => o.techMatch);
    expect(disabledNames).toContain('coal_power');
    expect(disabledNames).toContain('gas_ccgt');
    expect(disabledNames).not.toContain('solar_pv');
  });

  it('adds renewable_min systemConstraint when enabled', () => {
    const v = expandRenewable(makeModel(), {
      baseYear: 2025, targetYear: 2040, snapshotYears: [2040],
      fossilTechs: [],
      renewableMinShare: 0.8,
      renewableTechs: ['solar_pv', 'wind_onshore'],
    });
    const sysOp = v[0].ops.find(o => o.op === 'systemConstraint' && o.kind === 'renewable_min');
    expect(sysOp).toBeTruthy();
    expect(sysOp.value.share).toBeCloseTo(0.8);
    expect(sysOp.value.techs).toEqual(['solar_pv', 'wind_onshore']);
  });

  it('does not mutate original model', () => {
    const m = makeModel();
    const coalCapBefore = m.technologies.find(t => t.name === 'coal_power').constraints.energy_cap_max;
    const v = expandRenewable(m, { baseYear: 2025, targetYear: 2040, snapshotYears: [2030, 2040], fossilTechs: ['coal_power'] });
    v.forEach(variant => applyOps(m, variant.ops));
    expect(m.technologies.find(t => t.name === 'coal_power').constraints.energy_cap_max).toBe(coalCapBefore);
  });
});

// ─── carbonCap ───────────────────────────────────────────────────────────────

describe('carbonCap.expand', () => {
  it('generates one variant per snapshot year', () => {
    const v = expandCarbonCap({}, { baseYear: 2025, targetYear: 2040, snapshotYears: [2025, 2030, 2040], startCap: 100, endCap: 0 });
    expect(v).toHaveLength(3);
  });

  it('linear: base year cap = startCap', () => {
    const v = expandCarbonCap({}, { baseYear: 2025, targetYear: 2040, snapshotYears: [2025], startCap: 100, endCap: 0 });
    expect(v[0].capValue).toBeCloseTo(100);
  });

  it('linear: target year cap = endCap', () => {
    const v = expandCarbonCap({}, { baseYear: 2025, targetYear: 2040, snapshotYears: [2040], startCap: 100, endCap: 0 });
    expect(v[0].capValue).toBeCloseTo(0);
  });

  it('linear: intermediate cap is interpolated', () => {
    const v = expandCarbonCap({}, { baseYear: 2025, targetYear: 2040, snapshotYears: [2030], startCap: 100, endCap: 0 });
    // t = 5/15 ≈ 0.333; cap = 100 * (1 - 0.333) ≈ 66.67
    expect(v[0].capValue).toBeCloseTo(100 * (1 - 5/15), 1);
  });

  it('exponential: intermediate cap is geometric', () => {
    const v = expandCarbonCap({}, {
      baseYear: 2025, targetYear: 2040, snapshotYears: [2030],
      startCap: 100, endCap: 10, interpolation: 'exponential',
    });
    const t = 5/15;
    const expected = 100 * Math.pow(10/100, t);
    expect(v[0].capValue).toBeCloseTo(expected, 5);
  });

  it('emits a systemConstraint op with the cap value', () => {
    const v = expandCarbonCap({}, { baseYear: 2025, targetYear: 2040, snapshotYears: [2040], startCap: 100, endCap: 0 });
    const op = v[0].ops[0];
    expect(op.op).toBe('systemConstraint');
    expect(op.kind).toBe('co2_cap');
    expect(op.value).toBeCloseTo(0);
  });

  it('writes co2_cap to modelConfig.groupConstraints via applyOps', () => {
    const m = makeModel();
    const v = expandCarbonCap(m, { baseYear: 2025, targetYear: 2040, snapshotYears: [2040], startCap: 100, endCap: 0 });
    const concrete = applyOps(m, v[0].ops);
    expect(concrete.modelConfig.groupConstraints.co2_cap).toBeCloseTo(0);
  });
});

// ─── costSensitivity ─────────────────────────────────────────────────────────

describe('costSensitivity.expand', () => {
  it('generates N variants for N steps', () => {
    const v = expandCostSens(makeModel(), { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 5, unit: '€/kW' });
    expect(v).toHaveLength(5);
  });

  it('first variant has valueFrom', () => {
    const v = expandCostSens(makeModel(), { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 5 });
    expect(v[0].value).toBeCloseTo(800);
  });

  it('last variant has valueTo', () => {
    const v = expandCostSens(makeModel(), { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 5 });
    expect(v[4].value).toBeCloseTo(300);
  });

  it('values are evenly spaced', () => {
    const vals = stepValues(0, 100, 5);
    expect(vals).toHaveLength(5);
    expect(vals[0]).toBeCloseTo(0);
    expect(vals[2]).toBeCloseTo(50);
    expect(vals[4]).toBeCloseTo(100);
  });

  it('each variant has a setParam op with the step value', () => {
    const v = expandCostSens(makeModel(), { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 3 });
    v.forEach(variant => {
      expect(variant.ops).toHaveLength(1);
      expect(variant.ops[0].op).toBe('setParam');
      expect(variant.ops[0].path).toBe('costs.monetary.energy_cap');
      expect(variant.ops[0].value).toBeCloseTo(variant.value);
    });
  });

  it('applies correctly via applyOps', () => {
    const m = makeModel();
    const v = expandCostSens(m, { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 2 });
    const concrete = applyOps(m, v[0].ops);
    expect(concrete.technologies.find(t => t.name === 'solar_pv').costs.monetary.energy_cap).toBeCloseTo(800);
    const concrete2 = applyOps(m, v[1].ops);
    expect(concrete2.technologies.find(t => t.name === 'solar_pv').costs.monetary.energy_cap).toBeCloseTo(300);
    // Original untouched
    expect(m.technologies.find(t => t.name === 'solar_pv').costs).toBeUndefined();
  });

  it('supports steps=2 (minimum)', () => {
    const v = expandCostSens(makeModel(), { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 100, valueTo: 200, steps: 2 });
    expect(v).toHaveLength(2);
    expect(v[0].value).toBeCloseTo(100);
    expect(v[1].value).toBeCloseTo(200);
  });

  it('label includes the value and unit', () => {
    const v = expandCostSens(makeModel(), { techMatch: 'solar_pv', paramPath: 'costs.monetary.energy_cap', valueFrom: 800, valueTo: 300, steps: 2, unit: '€/kW' });
    expect(v[0].label).toContain('800');
    expect(v[0].label).toContain('€/kW');
  });
});

// ─── buildCalliope06GroupConstraintsOverride ────────────────────────────────

describe('buildCalliope06GroupConstraintsOverride', () => {
  it('returns null for empty/null input', () => {
    expect(buildCalliope06GroupConstraintsOverride(null)).toBeNull();
    expect(buildCalliope06GroupConstraintsOverride({})).toBeNull();
  });

  it('converts co2_cap to Calliope group_constraint', () => {
    const gc = buildCalliope06GroupConstraintsOverride({ co2_cap: 50 });
    expect(gc.studio_co2_cap.cost_max.co2).toBe(50);
  });

  it('converts renewable_min with techs and carrier', () => {
    const gc = buildCalliope06GroupConstraintsOverride({
      renewable_min: { share: 0.8, techs: ['solar_pv', 'wind_onshore'], carrier: 'electricity' },
    });
    expect(gc.studio_renewable_min.carrier_prod_min_systemwide.electricity).toBe(0.8);
    expect(gc.studio_renewable_min.techs).toEqual(['solar_pv', 'wind_onshore']);
  });

  it('handles both co2_cap and renewable_min together', () => {
    const gc = buildCalliope06GroupConstraintsOverride({
      co2_cap: 0,
      renewable_min: { share: 1.0, techs: [], carrier: 'electricity' },
    });
    expect(gc.studio_co2_cap).toBeTruthy();
    expect(gc.studio_renewable_min).toBeTruthy();
  });
});
