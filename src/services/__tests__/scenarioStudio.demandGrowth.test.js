import { describe, it, expect } from 'vitest';
import { expand } from '../scenarioStudio/recipes/demandGrowth.js';
import { applyOps } from '../scenarioStudio/transform.js';

function makeModel() {
  return {
    technologies: [
      { name: 'demand_electricity', parent: 'demand', constraints: { resource_scale: 1.0 } },
      { name: 'demand_heat',        parent: 'demand', constraints: { resource_scale: 1.0 } },
      { name: 'solar_pv',           parent: 'supply' },
    ],
    locations: [
      { name: 'Norte', techs: { demand_electricity: { constraints: { resource_scale: 0.9 } } } },
      { name: 'Sur',   techs: {} },
    ],
  };
}

describe('demandGrowth.expand', () => {
  it('generates one variant per snapshot year', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: [2025, 2030, 2035],
      demandTechs: { parentIs: 'demand' },
    });
    expect(variants).toHaveLength(3);
    expect(variants.map(v => v.label)).toEqual(['2025', '2030', '2035']);
    expect(variants.map(v => v.year)).toEqual([2025, 2030, 2035]);
  });

  it('generates variants from { from, to, step }', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: { from: 2025, to: 2040, step: 5 },
    });
    expect(variants.map(v => v.year)).toEqual([2025, 2030, 2035, 2040]);
  });

  it('base year variant has factor = 1.0 (no scaling)', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: [2025, 2030],
    });
    const baseOp = variants[0].ops[0];
    expect(baseOp.factor).toBeCloseTo(1.0);
  });

  it('computes correct compound factor for each year', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: [2025, 2026, 2030, 2040],
    });
    // 2025: (1.015)^0 = 1.0
    expect(variants[0].ops[0].factor).toBeCloseTo(1.0, 5);
    // 2026: (1.015)^1 = 1.015
    expect(variants[1].ops[0].factor).toBeCloseTo(1.015, 5);
    // 2030: (1.015)^5 ≈ 1.07728
    expect(variants[2].ops[0].factor).toBeCloseTo(Math.pow(1.015, 5), 5);
    // 2040: (1.015)^15 ≈ 1.25023
    expect(variants[3].ops[0].factor).toBeCloseTo(Math.pow(1.015, 15), 5);
  });

  it('auto-detects demand techs by parent when demandTechs not specified', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.02,
      snapshotYears: [2030],
    });
    const techNames = variants[0].ops.map(o => o.techMatch);
    expect(techNames).toContain('demand_electricity');
    expect(techNames).toContain('demand_heat');
    expect(techNames).not.toContain('solar_pv');
  });

  it('accepts a specific tech name string', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.02,
      snapshotYears: [2030],
      demandTechs: 'demand_electricity',
    });
    expect(variants[0].ops).toHaveLength(1);
    expect(variants[0].ops[0].techMatch).toBe('demand_electricity');
  });

  it('accepts a list of tech names', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.02,
      snapshotYears: [2030],
      demandTechs: ['demand_electricity', 'demand_heat'],
    });
    expect(variants[0].ops).toHaveLength(2);
  });

  it('accepts percent input (e.g. 1.5 meaning 1.5%) as well as fractional (0.015)', () => {
    const pct = expand(makeModel(), { baseYear: 2025, ratePerYear: 1.5, snapshotYears: [2030], demandTechs: 'demand_electricity' });
    const frac = expand(makeModel(), { baseYear: 2025, ratePerYear: 0.015, snapshotYears: [2030], demandTechs: 'demand_electricity' });
    expect(pct[0].ops[0].factor).toBeCloseTo(frac[0].ops[0].factor, 8);
  });

  it('each op targets level=both', () => {
    const variants = expand(makeModel(), {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: [2030],
      demandTechs: 'demand_electricity',
    });
    expect(variants[0].ops[0].level).toBe('both');
  });
});

describe('demandGrowth end-to-end: expand + applyOps', () => {
  it('applies growth to global tech and existing loc-tech overrides', () => {
    const model = makeModel();
    const variants = expand(model, {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: [2030],
      demandTechs: 'demand_electricity',
    });
    const concreteModel = applyOps(model, variants[0].ops);

    const globalScale = concreteModel.technologies.find(t => t.name === 'demand_electricity').constraints.resource_scale;
    expect(globalScale).toBeCloseTo(Math.pow(1.015, 5), 5);

    // Norte has explicit resource_scale=0.9 → should be scaled
    const norteScale = concreteModel.locations[0].techs.demand_electricity.constraints.resource_scale;
    expect(norteScale).toBeCloseTo(0.9 * Math.pow(1.015, 5), 5);

    // Sur has no demand_electricity loc-tech → not injected
    expect(concreteModel.locations[1].techs.demand_electricity).toBeUndefined();
  });

  it('does not mutate the original model across multiple variants', () => {
    const model = makeModel();
    const variants = expand(model, {
      baseYear: 2025,
      ratePerYear: 0.015,
      snapshotYears: [2025, 2030, 2040],
      demandTechs: 'demand_electricity',
    });
    const models = variants.map(v => applyOps(model, v.ops));

    // Base year unchanged
    expect(models[0].technologies[0].constraints.resource_scale).toBeCloseTo(1.0);
    // 2030 vs 2040 differ
    expect(models[1].technologies[0].constraints.resource_scale).toBeCloseTo(Math.pow(1.015, 5));
    expect(models[2].technologies[0].constraints.resource_scale).toBeCloseTo(Math.pow(1.015, 15));
    // Original still untouched
    expect(model.technologies[0].constraints.resource_scale).toBe(1.0);
  });
});
