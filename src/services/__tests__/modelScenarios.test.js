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
    expect(r.modelConfig.timeResolution).toBe('3H');
    expect(report.some(l => l.includes('model.time') && l.includes('skipped'))).toBe(false);
    expect(model.technologies[0].constraints.energy_cap_max).toBe(500); // input untouched
  });
  it('skips a non-resample time function', () => {
    const ov = { cluster: { model: { time: { function: 'apply_clustering' } } } };
    const { model: r, report } = resolveScenario(model, ov, {}, { type: 'override', name: 'cluster' });
    expect(r.modelConfig?.timeResolution).toBeUndefined();
    expect(report.some(l => l.includes('model.time.function') && l.includes('skipped'))).toBe(true);
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
    expect(isPortableOverrideKey('model.time.function_options.resolution')).toBe(true);
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

describe('editing overrides', () => {
  it('unflattens dotted keys to nested YAML', async () => {
    const { unflattenOverride } = await import('../modelScenarios.js');
    expect(unflattenOverride({ 'techs.ccgt.exists': false, 'model.subset_time': ['a', 'b'] }))
      .toEqual({ techs: { ccgt: { exists: false } }, model: { subset_time: ['a', 'b'] } });
  });

  it('sets and removes a key, keeping nested shape and pruning empty parents', async () => {
    const { setOverrideKey, removeOverrideKey } = await import('../modelScenarios.js');
    const ov = model.overrides['2050_eff'];
    const changed = setOverrideKey(ov, 'locations.NORD.techs.demand_power.constraints.resource', 'file=demand_2050_IEA.csv');
    expect(changed.locations.NORD.techs.demand_power.constraints.resource).toBe('file=demand_2050_IEA.csv');
    expect(ov.locations.NORD.techs.demand_power.constraints.resource).toBe('file=demand_2050_eff.csv'); // not mutated
    const added = setOverrideKey({}, 'techs.ccgt.constraints.energy_cap_max', 5);
    expect(added).toEqual({ techs: { ccgt: { constraints: { energy_cap_max: 5 } } } });
    expect(removeOverrideKey(added, 'techs.ccgt.constraints.energy_cap_max')).toEqual({});
    // a dotted (hand-written) override becomes nested once edited
    expect(setOverrideKey(model.overrides.dotted, 'techs.ccgt.costs.monetary.energy_cap', 1000))
      .toEqual({ techs: { ccgt: { costs: { monetary: { energy_cap: 1000 } } } } });
  });

  it('parses typed input values', async () => {
    const { parseOverrideValue, formatOverrideValue } = await import('../modelScenarios.js');
    expect(parseOverrideValue('5000')).toBe(5000);
    expect(parseOverrideValue('-1.5e3')).toBe(-1500);
    expect(parseOverrideValue('false')).toBe(false);
    expect(parseOverrideValue('null')).toBe(null);
    expect(parseOverrideValue("['2015-01-01', '2015-01-07']")).toEqual(['2015-01-01', '2015-01-07']);
    expect(parseOverrideValue('file=demand.csv')).toBe('file=demand.csv');
    expect(parseOverrideValue('  inf ')).toBe('inf');
    expect(formatOverrideValue(['a', 'b'])).toBe('["a","b"]');
    expect(formatOverrideValue('file=x.csv')).toBe('file=x.csv');
    expect(formatOverrideValue(false)).toBe('false');
  });

  it('checks override / scenario names', async () => {
    const { overrideNameError } = await import('../modelScenarios.js');
    expect(overrideNameError('', model)).toMatch(/name/i);
    expect(overrideNameError('2050_eff', model)).toMatch(/exists/i);
    expect(overrideNameError('base_2050', model)).toMatch(/exists/i);
    expect(overrideNameError('my case', model)).toMatch(/letters/i);
    expect(overrideNameError('my_case-2', model)).toBe(null);
  });
});
