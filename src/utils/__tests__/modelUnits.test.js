import { describe, it, expect } from 'vitest';
import { modelPowerUnit, powerUnitOfJob, resultInMW, jobInMW, stampPowerUnit } from '../modelUnits.js';

const kwResult = {
  objective: 1000,
  costs_by_tech: { pv: 500 },
  capacities: { 'a::pv': 768000 },
  storage_capacities: { 'a::battery': 2000 },
  generation: { 'a::pv::electricity': 5000 },
  dispatch: { pv: [1000, 2000] },
  transmission_flow: { 'a-b': { flow: [1000], label: 'keep' } },
  demand_timeseries: [3000],
  demand_by_location: { a: 4000 },
  total_unmet_demand_mwh: 7000,
  shadow_prices: { 'a::electricity': [0.05] },
  timestamps: ['2015-01-01'],
};

describe('resultInMW', () => {
  const r = resultInMW(kwResult, 'kW');

  it('converts power and energy to MW / MWh', () => {
    expect(r.capacities['a::pv']).toBeCloseTo(768);
    expect(r.storage_capacities['a::battery']).toBeCloseTo(2);
    expect(r.generation['a::pv::electricity']).toBeCloseTo(5);
    expect(r.dispatch.pv).toEqual([1, 2]);
    expect(r.transmission_flow['a-b'].flow).toEqual([1]);
    expect(r.demand_timeseries).toEqual([3]);
    expect(r.demand_by_location.a).toBeCloseTo(4);
    expect(r.total_unmet_demand_mwh).toBeCloseTo(7);
  });

  it('converts prices per kWh to prices per MWh', () => {
    expect(r.shadow_prices['a::electricity'][0]).toBeCloseTo(50);
  });

  it('leaves costs, text and timestamps alone', () => {
    expect(r.objective).toBe(1000);
    expect(r.costs_by_tech.pv).toBe(500);
    expect(r.timestamps).toEqual(['2015-01-01']);
    expect(r.transmission_flow['a-b'].label).toBe('keep');
  });

  it('converts SPORES capacities, flows and potentials, but not cost or hours', () => {
    const s = resultInMW({
      spores_data: [{ spore_id: 0, cost: 9, capacities: { 'a::pv': 1000 }, generation: { x: 2000 }, consumption: { y: -3000 }, storage_capacities: { z: 4000 } }],
      spores_meta: { hours: 8760, cost_optimal: 9, potentials: { energy_cap_max: { 'a::pv': 5000 }, storage_cap_max: { z: 6000 } } },
    }, 'kW');
    expect(s.spores_data[0]).toMatchObject({ spore_id: 0, cost: 9, capacities: { 'a::pv': 1 }, generation: { x: 2 }, consumption: { y: -3 }, storage_capacities: { z: 4 } });
    expect(s.spores_meta).toMatchObject({ hours: 8760, cost_optimal: 9, potentials: { energy_cap_max: { 'a::pv': 5 }, storage_cap_max: { z: 6 } } });
  });

  it('returns MW results and unknown units untouched', () => {
    expect(resultInMW(kwResult, 'MW')).toBe(kwResult);
    expect(resultInMW(kwResult, undefined)).toBe(kwResult);
    expect(resultInMW(kwResult, 'parsecs')).toBe(kwResult);
    expect(resultInMW(null, 'kW')).toBe(null);
  });

  it('says what the converted values are, for downloads', () => {
    expect(r.model_power_unit).toBe('MW');
    expect(r.source_power_unit).toBe('kW');
  });

  it('does not change the original', () => {
    expect(kwResult.capacities['a::pv']).toBe(768000);
  });

  it('scales up a GW model', () => {
    expect(resultInMW({ capacities: { x: 2 } }, 'GW').capacities.x).toBe(2000);
  });
});

describe('which unit a run is in', () => {
  const models = [
    { name: 'Italy', metadata: { modelConfig: { powerUnit: 'kW' } } },
    { name: 'Chile', metadata: {} },
  ];

  it('reads the model setting, defaulting to MW', () => {
    expect(modelPowerUnit(models[0])).toBe('kW');
    expect(modelPowerUnit(models[1])).toBe('MW');
    expect(modelPowerUnit(null)).toBe('MW');
  });

  it('stamps a unit on a result without touching the rest', () => {
    expect(stampPowerUnit({ objective: 1 }, 'kW')).toEqual({ objective: 1, model_power_unit: 'kW' });
    expect(stampPowerUnit({ objective: 1 }, undefined)).toEqual({ objective: 1 });
    expect(stampPowerUnit(null, 'kW')).toBe(null);
  });

  it('prefers the unit stamped on the run', () => {
    expect(powerUnitOfJob({ modelName: 'Italy', result: { model_power_unit: 'GW' } }, models)).toBe('GW');
  });

  it('falls back to the model with the run name, ignoring the version suffix', () => {
    expect(powerUnitOfJob({ modelName: 'Italy (version 3)', result: {} }, models)).toBe('kW');
    expect(powerUnitOfJob({ modelName: 'Chile', result: {} }, models)).toBe('MW');
  });

  it('falls back to the SPORES preset for old Italy runs', () => {
    const job = { modelName: 'gone', result: { spores_meta: { plan: { metrics: 'lombardi2020Italy' } } } };
    expect(powerUnitOfJob(job, [])).toBe('kW');
  });

  it('treats anything unknown as MW', () => {
    expect(powerUnitOfJob({ modelName: 'gone', result: {} }, [])).toBe('MW');
  });
});

describe('jobInMW', () => {
  const models = [{ name: 'Italy', metadata: { modelConfig: { powerUnit: 'kW' } } }];

  it('returns the same job for MW runs and caches converted ones', () => {
    const mw = { modelName: 'other', result: { capacities: { x: 1 } } };
    expect(jobInMW(mw, models)).toBe(mw);
    const kw = { modelName: 'Italy', result: { capacities: { x: 1000 } } };
    const a = jobInMW(kw, models);
    expect(a.result.capacities.x).toBe(1);
    expect(jobInMW(kw, models)).toBe(a);
  });
});
