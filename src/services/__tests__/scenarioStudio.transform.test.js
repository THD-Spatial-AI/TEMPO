import { describe, it, expect } from 'vitest';
import { applyOps } from '../scenarioStudio/transform.js';

// Minimal model used across tests
function makeModel() {
  return {
    modelConfig: { startDate: '2025-01-01' },
    technologies: [
      { name: 'demand_electricity', parent: 'demand', constraints: { resource_scale: 1.0 } },
      { name: 'solar_pv',           parent: 'supply',  costs: { monetary: { energy_cap: 500 } } },
      { name: 'coal',               parent: 'supply',  constraints: { energy_cap_max: 10000 } },
      { name: 'battery',            parent: 'storage', constraints: { storage_cap_max: 5000 } },
    ],
    locations: [
      {
        name: 'Norte',
        techs: {
          demand_electricity: { constraints: { resource_scale: 0.8 } },
          solar_pv: { constraints: { energy_cap_max: 200 } },
        },
      },
      {
        name: 'Sur',
        techs: {
          demand_electricity: { constraints: {} }, // resource_scale not set
        },
      },
      {
        name: 'Centro',
        techs: {}, // no demand tech override
      },
    ],
  };
}

describe('applyOps — general', () => {
  it('returns a deep copy — original model is not mutated', () => {
    const m = makeModel();
    const result = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 2, level: 'global' },
    ]);
    expect(m.technologies[0].constraints.resource_scale).toBe(1.0); // unchanged
    expect(result.technologies[0].constraints.resource_scale).toBe(2.0);
  });

  it('returns model unchanged when ops is empty', () => {
    const m = makeModel();
    const result = applyOps(m, []);
    expect(result).toEqual(m);
    expect(result).not.toBe(m); // still a copy
  });

  it('silently skips unknown op types', () => {
    const m = makeModel();
    expect(() => applyOps(m, [{ op: 'flyToTheMoon' }])).not.toThrow();
  });
});

describe('scaleParam', () => {
  it('scales global tech resource_scale', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.15, level: 'global' },
    ]);
    expect(r.technologies[0].constraints.resource_scale).toBeCloseTo(1.15);
  });

  it('does not affect other techs when using exact techMatch', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 2, level: 'global' },
    ]);
    expect(r.technologies.find(t => t.name === 'solar_pv')).toMatchObject({ parent: 'supply' });
    expect(r.technologies.find(t => t.name === 'solar_pv').constraints).toBeUndefined();
  });

  it('creates the path when missing on global tech', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'solar_pv', path: 'constraints.resource_scale', factor: 1.5, level: 'global' },
    ]);
    expect(r.technologies.find(t => t.name === 'solar_pv').constraints.resource_scale).toBeCloseTo(1.5);
  });

  it('scales location-tech when it exists, skips when missing (level=both)', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.2, level: 'both' },
    ]);
    // Norte has resource_scale = 0.8 → 0.8 * 1.2 = 0.96
    expect(r.locations[0].techs.demand_electricity.constraints.resource_scale).toBeCloseTo(0.96);
    // Sur has constraints but no resource_scale → not injected
    expect(r.locations[1].techs.demand_electricity.constraints.resource_scale).toBeUndefined();
    // Centro has no demand_electricity tech → not touched
    expect(r.locations[2].techs.demand_electricity).toBeUndefined();
    // Global tech still scaled
    expect(r.technologies[0].constraints.resource_scale).toBeCloseTo(1.2);
  });

  it('scales only location techs when level=location', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 2, level: 'location' },
    ]);
    // Global tech unchanged
    expect(r.technologies[0].constraints.resource_scale).toBe(1.0);
    // Norte scaled
    expect(r.locations[0].techs.demand_electricity.constraints.resource_scale).toBeCloseTo(1.6);
  });

  it('matches multiple techs via array techMatch', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: ['demand_electricity', 'solar_pv'], path: 'constraints.resource_scale', factor: 1.1, level: 'global' },
    ]);
    expect(r.technologies[0].constraints.resource_scale).toBeCloseTo(1.1); // demand
    expect(r.technologies[1].constraints.resource_scale).toBeCloseTo(1.1); // solar (created)
  });

  it('matches techs by parent with { parentIs }', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: { parentIs: 'demand' }, path: 'constraints.resource_scale', factor: 1.3, level: 'global' },
    ]);
    expect(r.technologies[0].constraints.resource_scale).toBeCloseTo(1.3);
    // Non-demand techs untouched
    expect(r.technologies[1].constraints?.resource_scale).toBeUndefined();
  });

  it('treats missing numeric value as 1.0 baseline when scaling', () => {
    const m = makeModel();
    // demand_electricity has resource_scale=1.0, scale to check baseline assumption
    m.technologies[0].constraints.resource_scale = undefined;
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.5, level: 'global' },
    ]);
    // undefined treated as 1.0, result = 1.5
    expect(r.technologies[0].constraints.resource_scale).toBeCloseTo(1.5);
  });

  it('compounds correctly across sequential ops', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.1, level: 'global' },
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.1, level: 'global' },
    ]);
    expect(r.technologies[0].constraints.resource_scale).toBeCloseTo(1.21);
  });
});

describe('setParam', () => {
  it('sets an absolute value on global tech', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'setParam', techMatch: 'solar_pv', path: 'costs.monetary.energy_cap', value: 300, level: 'global' },
    ]);
    expect(r.technologies[1].costs.monetary.energy_cap).toBe(300);
  });

  it('creates nested path if missing', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'setParam', techMatch: 'coal', path: 'costs.monetary.energy_cap', value: 1000, level: 'global' },
    ]);
    expect(r.technologies[2].costs.monetary.energy_cap).toBe(1000);
  });

  it('sets on location-tech when level=both', () => {
    const m = makeModel();
    const r = applyOps(m, [
      { op: 'setParam', techMatch: 'solar_pv', path: 'constraints.energy_cap_max', value: 999, level: 'both' },
    ]);
    expect(r.locations[0].techs.solar_pv.constraints.energy_cap_max).toBe(999);
  });
});

describe('disableTech', () => {
  it('sets energy_cap_max = 0 on global tech and existing location-tech overrides', () => {
    const m = makeModel();
    const r = applyOps(m, [{ op: 'disableTech', techMatch: 'solar_pv' }]);
    expect(r.technologies[1].constraints.energy_cap_max).toBe(0);
    expect(r.locations[0].techs.solar_pv.constraints.energy_cap_max).toBe(0);
  });

  it('does not inject a loc-tech entry for locations without the tech', () => {
    const m = makeModel();
    const r = applyOps(m, [{ op: 'disableTech', techMatch: 'coal' }]);
    // coal is global-only; Norte has no coal loc-tech
    expect(r.technologies[2].constraints.energy_cap_max).toBe(0);
    expect(r.locations[0].techs.coal).toBeUndefined();
  });
});

describe('systemConstraint', () => {
  it('writes to modelConfig.groupConstraints', () => {
    const m = makeModel();
    const r = applyOps(m, [{ op: 'systemConstraint', kind: 'co2_cap', value: 0 }]);
    expect(r.modelConfig.groupConstraints.co2_cap).toBe(0);
  });

  it('creates modelConfig and groupConstraints if missing', () => {
    const m = makeModel();
    delete m.modelConfig;
    const r = applyOps(m, [{ op: 'systemConstraint', kind: 'renewable_min', value: 0.7 }]);
    expect(r.modelConfig.groupConstraints.renewable_min).toBe(0.7);
  });
});

describe('addTech', () => {
  it('adds a tech not already present', () => {
    const m = makeModel();
    const r = applyOps(m, [{ op: 'addTech', tech: 'wind_onshore', defaults: { parent: 'supply' } }]);
    expect(r.technologies.find(t => t.name === 'wind_onshore')).toMatchObject({ parent: 'supply' });
  });

  it('is a no-op if tech already exists', () => {
    const m = makeModel();
    const r = applyOps(m, [{ op: 'addTech', tech: 'solar_pv', defaults: { parent: 'DIFFERENT' } }]);
    expect(r.technologies.filter(t => t.name === 'solar_pv').length).toBe(1);
    expect(r.technologies.find(t => t.name === 'solar_pv').parent).toBe('supply'); // unchanged
  });
});
