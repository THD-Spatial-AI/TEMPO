import { describe, it, expect } from 'vitest';
import {
  parseSettingKey, settingKey, paramKind, unitLabel, paramsForTarget, modelValue,
  groupSettings, checkSetting, techsAtLocation, RESOLUTIONS,
} from '../overrideSchema.js';

const model = {
  metadata: { modelConfig: { powerUnit: 'kW' } },
  technologies: [
    { name: 'ccgt', parent: 'supply', constraints: { energy_cap_max: 300, energy_cap_min: 50 }, costs: { monetary: { energy_cap: 750 } } },
    { name: 'battery', parent: 'storage', constraints: { storage_cap_max: 4000 } },
    { name: 'demand_power', parent: 'demand', constraints: { resource: 'file=regional_demand.csv' } },
    { name: 'inter_zonal', parent: 'transmission', constraints: {} },
  ],
  locations: [
    { name: 'NORD', techs: { demand_power: { constraints: { resource: 'file=regional_demand.csv:NORD' } }, ccgt: null } },
    { name: 'SARD', techs: { battery: {} } },
  ],
  links: [{ from: 'NORD', to: 'SARD', tech: 'inter_zonal' }],
};
const series = [
  { fileName: 'regional_demand.csv', dataColumns: ['NORD', 'SARD'], csvContent: 'time,NORD,SARD\n2015-01-01 00:00,1,1\n2015-12-31 23:00,1,1\n' },
];

describe('parseSettingKey / settingKey', () => {
  const cases = [
    ['techs.ccgt.constraints.energy_cap_max', { target: { type: 'tech', tech: 'ccgt' }, section: 'constraints', param: 'energy_cap_max' }],
    ['techs.ccgt.costs.monetary.energy_cap', { target: { type: 'tech', tech: 'ccgt' }, section: 'costs', costClass: 'monetary', param: 'energy_cap' }],
    ['techs.ccgt.exists', { target: { type: 'tech', tech: 'ccgt' }, section: 'exists', param: 'exists' }],
    ['locations.NORD.techs.demand_power.constraints.resource', { target: { type: 'locTech', loc: 'NORD', tech: 'demand_power' }, section: 'constraints', param: 'resource' }],
    ['locations.SARD.exists', { target: { type: 'loc', loc: 'SARD' }, section: 'exists', param: 'exists' }],
    ['links.NORD,SARD.techs.inter_zonal.constraints.energy_cap_max', { target: { type: 'link', link: 'NORD,SARD', tech: 'inter_zonal' }, section: 'constraints', param: 'energy_cap_max' }],
    ['model.subset_time', { target: { type: 'time' }, section: 'model', param: 'subset_time' }],
    ['model.time.function_options.resolution', { target: { type: 'resolution' }, section: 'model', param: 'resolution' }],
    ['run.mode', { target: { type: 'run' }, section: 'run', param: 'mode' }],
    ['group_constraints.g.cost_max.co2', { target: { type: 'advanced' }, section: 'advanced', param: 'group_constraints.g.cost_max.co2' }],
  ];
  it.each(cases)('%s', (key, parsed) => {
    expect(parseSettingKey(key)).toEqual(parsed);
    expect(settingKey(parsed)).toBe(key);
  });
});

describe('parameter kinds and units', () => {
  it('classifies parameters', () => {
    expect(paramKind('energy_cap_max', 'constraints')).toBe('power');
    expect(paramKind('storage_cap_max', 'constraints')).toBe('energy');
    expect(paramKind('energy_eff', 'constraints')).toBe('fraction');
    expect(paramKind('lifetime', 'constraints')).toBe('years');
    expect(paramKind('resource', 'constraints')).toBe('resource');
    expect(paramKind('exists', 'exists')).toBe('bool');
    expect(paramKind('energy_cap', 'costs')).toBe('costPower');
    expect(paramKind('om_prod', 'costs')).toBe('costEnergy');
    expect(paramKind('subset_time', 'model')).toBe('dateRange');
    expect(paramKind('resolution', 'model')).toBe('resolution');
    expect(paramKind('mode', 'run')).toBe('enum');
  });
  it('labels units in the model unit', () => {
    expect(unitLabel('power', 'MW')).toBe('MW');
    expect(unitLabel('energy', 'kW')).toBe('kWh');
    expect(unitLabel('costPower', 'MW')).toBe('per MW');
    expect(unitLabel('costEnergy', 'kW')).toBe('per kWh');
    expect(unitLabel('fraction', 'MW')).toBe('0–1');
    expect(RESOLUTIONS).toContain('3H');
  });
});

describe('paramsForTarget / modelValue / techsAtLocation', () => {
  it('lists only parameters valid for the tech type, plus costs and on/off', () => {
    const storage = paramsForTarget({ type: 'tech', tech: 'battery' }, model).map(p => p.param);
    expect(storage).toContain('storage_cap_max');
    expect(storage).toContain('exists');
    const demand = paramsForTarget({ type: 'tech', tech: 'demand_power' }, model);
    expect(demand.map(p => p.param)).not.toContain('storage_cap_max');
    expect(demand.find(p => p.param === 'resource').section).toBe('constraints');
    const ccgtCosts = paramsForTarget({ type: 'tech', tech: 'ccgt' }, model).filter(p => p.section === 'costs').map(p => p.param);
    expect(ccgtCosts).toContain('energy_cap');
    expect(ccgtCosts).not.toContain('storage_cap'); // storage cost only for storage-type techs
    expect(paramsForTarget({ type: 'tech', tech: 'battery' }, model).some(p => p.param === 'storage_cap')).toBe(true);
  });
  it('reads the model value (location value wins over the tech value)', () => {
    expect(modelValue(model, { type: 'tech', tech: 'ccgt' }, 'constraints', 'energy_cap_max')).toBe(300);
    expect(modelValue(model, { type: 'tech', tech: 'ccgt' }, 'costs', 'energy_cap', 'monetary')).toBe(750);
    expect(modelValue(model, { type: 'locTech', loc: 'NORD', tech: 'demand_power' }, 'constraints', 'resource')).toBe('file=regional_demand.csv:NORD');
    expect(modelValue(model, { type: 'locTech', loc: 'NORD', tech: 'ccgt' }, 'constraints', 'energy_cap_max')).toBe(300);
    expect(techsAtLocation(model, 'NORD')).toEqual(['demand_power', 'ccgt']);
  });
});

describe('groupSettings', () => {
  it('groups by target with readable titles and hides the resample function key', () => {
    const groups = groupSettings({
      'techs.ccgt.constraints.energy_cap_max': 500,
      'model.time.function': 'resample',
      'model.time.function_options.resolution': '3H',
      'locations.NORD.techs.demand_power.constraints.resource': 'file=x.csv',
    }, model);
    expect(groups.map(g => g.title)).toEqual(['Technology · ccgt (supply)', 'Time resolution', 'NORD · demand_power (demand)']);
    expect(groups[1].entries.map(e => e.key)).toEqual(['model.time.function_options.resolution']);
  });
});

describe('checkSetting', () => {
  const codes = (key, value, flat = {}) => checkSetting(model, key, value, flat, series).map(w => w.code);
  it('flags parameters that do not apply to the tech type', () => {
    expect(codes('techs.demand_power.constraints.storage_cap_max', 5)).toContain('param_not_for_type');
    expect(codes('techs.battery.constraints.storage_cap_max', 5)).toEqual([]);
  });
  it('flags techs or locations that are not in the model', () => {
    expect(codes('locations.SARD.techs.ccgt.constraints.energy_cap_max', 5)).toContain('tech_not_at_location');
    expect(codes('techs.nuclear.constraints.energy_cap_max', 5)).toContain('unknown_tech');
    expect(codes('locations.XYZ.exists', false)).toContain('unknown_location');
  });
  it('flags missing files / columns and windows outside the data', () => {
    expect(codes('locations.NORD.techs.demand_power.constraints.resource', 'file=demand_2050_eff.csv')).toContain('file_not_in_model');
    expect(codes('locations.NORD.techs.demand_power.constraints.resource', 'file=regional_demand.csv:SUD')).toContain('column_not_in_file');
    expect(codes('locations.NORD.techs.demand_power.constraints.resource', 'file=regional_demand.csv')).toEqual([]);
    expect(codes('model.subset_time', ['2014-12-01', '2015-01-07'])).toContain('window_outside_data');
    expect(codes('model.subset_time', ['2015-01-07', '2015-01-01'])).toContain('window_reversed');
    expect(codes('model.subset_time', ['2015-01-01', '2015-01-07'])).toEqual([]);
  });
  it('flags min above max (override or model value) and fractions outside 0–1', () => {
    expect(codes('techs.ccgt.constraints.energy_cap_max', 20)).toContain('min_above_max'); // model min 50
    expect(codes('techs.ccgt.constraints.energy_cap_min', 400, { 'techs.ccgt.constraints.energy_cap_max': 350 })).toContain('min_above_max');
    expect(codes('techs.ccgt.constraints.energy_eff', 1.4)).toContain('out_of_range');
    expect(codes('techs.ccgt.constraints.energy_cap_max', -5)).toContain('out_of_range');
  });
});
