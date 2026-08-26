import { describe, it, expect } from 'vitest';
import {
  COMMON_PARAMS,
  COMMON_PARAM_IDS,
  getCommonParam,
  commonParamsForParent,
  engineTargetsFor,
  calliopeToCommon,
  commonToCalliope,
} from '../parameterOntology.js';

describe('ontology integrity', () => {
  it('every common param maps to a single Calliope constraint or cost', () => {
    for (const id of COMMON_PARAM_IDS) {
      const c = COMMON_PARAMS[id].calliope;
      expect(c, id).toBeTruthy();
      expect(['constraint', 'cost'], id).toContain(c.kind);
      expect(typeof c.name, id).toBe('string');
    }
  });

  it('Calliope targets are unique (bijective reverse-map)', () => {
    const seen = new Set();
    for (const id of COMMON_PARAM_IDS) {
      const { kind, name } = COMMON_PARAMS[id].calliope;
      const key = `${kind}:${name}`;
      expect(seen.has(key), `duplicate target ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('exposes definitions with label/description/unit', () => {
    const p = getCommonParam('capacity_max');
    expect(p.calliope).toEqual({ kind: 'constraint', name: 'energy_cap_max' });
    expect(p.unit).toBe('kW');
    expect(p.label).toBeTruthy();
    expect(getCommonParam('nope')).toBeNull();
  });
});

describe('commonParamsForParent', () => {
  it('includes storage-only params for storage but not for supply', () => {
    const supply = commonParamsForParent('supply').map((p) => p.id);
    const storage = commonParamsForParent('storage').map((p) => p.id);
    expect(supply).toContain('capacity_max');
    expect(supply).not.toContain('storage_capex');
    expect(storage).toContain('storage_capex');
    expect(storage).toContain('c_rate');
  });
});

describe('calliopeToCommon', () => {
  it('reverse-maps known Calliope constraints and costs, preserving unknowns', () => {
    const { common, leftoverConstraints, leftoverCosts } = calliopeToCommon(
      { energy_cap_max: 50000, energy_eff: 0.45, some_exotic_constraint: 3 },
      { energy_cap: 800, om_annual: 15, purchase: 200 }
    );
    expect(common).toEqual({
      capacity_max: 50000,
      efficiency: 0.45,
      capex: 800,
      opex_fixed: 15,
    });
    expect(leftoverConstraints).toEqual({ some_exotic_constraint: 3 });
    expect(leftoverCosts).toEqual({ purchase: 200 });
  });

  it('handles empty input', () => {
    expect(calliopeToCommon()).toEqual({
      common: {},
      leftoverConstraints: {},
      leftoverCosts: {},
    });
  });
});

describe('commonToCalliope', () => {
  it('forward-maps common values into constraints and costs.monetary', () => {
    const out = commonToCalliope({
      capacity_max: 50000,
      efficiency: 0.45,
      capex: 800,
      opex_variable: 0.003,
    });
    expect(out.constraints).toEqual({ energy_cap_max: 50000, energy_eff: 0.45 });
    expect(out.costs.monetary).toEqual({ energy_cap: 800, om_prod: 0.003 });
  });

  it('skips empty/undefined/null values', () => {
    const out = commonToCalliope({ capacity_max: '', efficiency: null, lifetime: undefined, capex: 0 });
    expect(out.constraints).toEqual({});
    // 0 is a real value and must be kept
    expect(out.costs.monetary).toEqual({ energy_cap: 0 });
  });
});

describe('round-trip', () => {
  it('common params survive calliope -> common -> calliope', () => {
    const constraints = { energy_cap_max: 100, energy_eff: 0.9, lifetime: 25 };
    const monetary = { energy_cap: 700, om_annual: 12, interest_rate: 0.07 };
    const { common } = calliopeToCommon(constraints, monetary);
    const back = commonToCalliope(common);
    expect(back.constraints).toEqual(constraints);
    expect(back.costs.monetary).toEqual(monetary);
  });
});

describe('engineTargetsFor', () => {
  it('returns per-engine target names', () => {
    const t = engineTargetsFor('capacity_max');
    expect(t.pypsa.name).toBe('p_nom_max');
    expect(t.osemosys.name).toBe('TotalAnnualMaxCapacity');
    expect(engineTargetsFor('interest_rate')).toEqual({});
  });
});
