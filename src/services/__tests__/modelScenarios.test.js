import { describe, it, expect } from 'vitest';
import { flattenOverride, expandScenario, hasModelScenarios } from '../modelScenarios.js';
import { resolveScenario, isPortableOverrideKey } from '../scenarioResolver.js';
import { importLegacyOverride } from '../scenarioStudio/legacyImport.js';
import { expandCard } from '../scenarioStudio/scenario.js';

// Shapes as stored after a Calliope YAML import (Italy / Arica models).
const model = {
  technologies: [{ name: 'ccgt', constraints: { energy_cap_max: 500 } }, { name: 'demand_power', parent: 'demand' }],
  locations: [{ name: 'NORD', techs: { demand_power: null } }],
  overrides: {
    '2050_eff': { locations: { NORD: { techs: { demand_power: { constraints: { resource: 'file=demand_2050_eff.csv' } } } } } },
    no_old_techs: { techs: { ccgt: { exists: false } } },
    '3H_resolution': { model: { time: { function: 'resample', function_options: { resolution: '3H' } } } },
    dotted: { 'techs.ccgt.costs.monetary.energy_cap': 900 },
  },
  scenarios: {
    base_2050: ['2050_eff', 'no_old_techs'],
    coarse: '3H_resolution,base_2050',
  },
};

describe('flattenOverride', () => {
  it('flattens nested YAML and keeps dotted keys and array leaves', () => {
    expect(flattenOverride({ a: { b: { c: 1 } }, 'x.y': 2, model: { subset_time: ['2005-01-01', '2005-01-07'] } })).toEqual({
      'a.b.c': 1, 'x.y': 2, 'model.subset_time': ['2005-01-01', '2005-01-07'],
    });
  });
});

describe('expandScenario', () => {
  it('expands nested scenarios and comma strings, de-duplicated, in order', () => {
    expect(expandScenario(model, 'coarse')).toEqual(['3H_resolution', '2050_eff', 'no_old_techs']);
  });
  it('treats an override name as itself', () => {
    expect(expandScenario(model, 'no_old_techs')).toEqual(['no_old_techs']);
  });
  it('reads a self-reference as an override of the same name (no recursion)', () => {
    expect(expandScenario({ scenarios: { a: ['a', 'x'] } }, 'a')).toEqual(['a', 'x']);
  });
  it('hasModelScenarios', () => {
    expect(hasModelScenarios(model)).toBe(true);
    expect(hasModelScenarios({ overrides: {}, scenarios: {} })).toBe(false);
  });
});

describe('resolveScenario with nested overrides', () => {
  it('applies a nested location file swap and exists:false', () => {
    const { model: r, report } = resolveScenario(model, model.overrides, model.scenarios, { type: 'scenario', name: 'coarse' });
    expect(r.locations[0].techs.demand_power.constraints.resource).toBe('file=demand_2050_eff.csv');
    expect(r.technologies[0].constraints.energy_cap_max).toBe(0);
    expect(report.some(l => l.includes('model.time.function') && l.includes('skipped'))).toBe(true);
    expect(model.technologies[0].constraints.energy_cap_max).toBe(500); // input untouched
  });
  it('still applies dotted overrides', () => {
    const { model: r } = resolveScenario(model, model.overrides, model.scenarios, { type: 'override', name: 'dotted' });
    expect(r.technologies[0].costs.monetary.energy_cap).toBe(900);
  });
});

describe('isPortableOverrideKey', () => {
  it('matches the keys resolveScenario applies', () => {
    expect(isPortableOverrideKey('techs.ccgt.exists')).toBe(true);
    expect(isPortableOverrideKey('locations.NORD.techs.demand_power.constraints.resource')).toBe(true);
    expect(isPortableOverrideKey('model.subset_time')).toBe(true);
    expect(isPortableOverrideKey('model.time.function')).toBe(false);
    expect(isPortableOverrideKey('group_constraints.g.cost_max.co2')).toBe(false);
  });
});

describe('legacy import of nested overrides', () => {
  it('converts nested location keys to setParam ops', () => {
    const { ops } = importLegacyOverride(model.overrides['2050_eff']);
    expect(ops).toEqual([{ op: 'setParam', techMatch: 'demand_power', path: 'constraints.resource', value: 'file=demand_2050_eff.csv', level: 'location' }]);
  });
});

describe('Model scenario card', () => {
  it('expands to a modelOverrides op with the override chain', () => {
    expect(expandCard(model, { category: 'modelScenario', params: { name: 'base_2050' } }, 2050))
      .toEqual([{ op: 'modelOverrides', source: 'base_2050', names: ['2050_eff', 'no_old_techs'] }]);
    expect(expandCard(model, { category: 'modelScenario', params: { name: '' } }, 2050)).toEqual([]);
  });
});
