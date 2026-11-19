import { describe, it, expect } from 'vitest';
import { checkRunConfigs, issueLogLines, markSetBy } from '../scenarioReadiness';
import { checkModel } from '../modelReadiness';

function miniModel() {
  return {
    locations: [{ name: 'a', latitude: 52, longitude: 10, techs: { gen: null, dem: null, pv: null } }],
    links: [],
    technologies: [
      { name: 'gen', essentials: { parent: 'supply', carrier_out: 'electricity' }, constraints: { energy_cap_max: 1000, lifetime: 25 }, costs: { monetary: { energy_cap: 900 } } },
      { name: 'dem', essentials: { parent: 'demand', carrier_in: 'electricity' }, constraints: {}, costs: { monetary: {} } },
      { name: 'pv', essentials: { parent: 'supply', carrier_out: 'electricity' }, constraints: { energy_cap_max: 10 }, costs: { monetary: {} } },
    ],
    timeSeries: [],
    modelConfig: { startDate: '2024-01-01', endDate: '2024-01-07' },
  };
}

const codes = (r) => [...r.critical, ...r.errors, ...r.warnings].map((i) => i.code);

describe('checkRunConfigs', () => {
  const overrides = {
    with_demand: { 'locations.a.techs.dem.constraints.resource': -5 },
    pv_capex: { 'techs.pv.costs.monetary.energy_cap': 700 },
    calliope_only: { 'run.solver': 'gurobi' },
  };
  const scenarios = { both: ['with_demand', 'pv_capex'] };

  it('checks the base model when nothing is selected', () => {
    const [run] = checkRunConfigs(miniModel(), [null], { overrides, scenarios });
    expect(run.name).toBe(null);
    expect(codes(run.readiness)).toContain('demand_no_profile');
  });

  it('clears an issue the scenario fixes', () => {
    const [run] = checkRunConfigs(miniModel(), [{ type: 'override', name: 'with_demand' }], { overrides, scenarios });
    expect(codes(run.readiness)).not.toContain('demand_no_profile');
  });

  it('marks issues the scenario brings in, not those already in the model', () => {
    const [run] = checkRunConfigs(miniModel(), [{ type: 'scenario', name: 'both' }], { overrides, scenarios });
    const lifetime = run.readiness.errors.find((i) => i.code === 'capex_no_lifetime');
    expect(lifetime.setBy).toBe('both');
    expect(run.readiness.errors.find((i) => i.code === 'demand_no_profile')).toBeUndefined();
  });

  it('keeps demand_no_profile at full strength when the whole override applies', () => {
    const [run] = checkRunConfigs(miniModel(), [{ type: 'override', name: 'pv_capex' }], { overrides, scenarios });
    expect(run.readiness.errors.map((i) => i.code)).toContain('demand_no_profile');
  });

  it('softens demand_no_profile when part of the override only Calliope applies', () => {
    const [run] = checkRunConfigs(miniModel(), [{ type: 'override', name: 'calliope_only' }], { overrides, scenarios });
    expect(run.readiness.warnings.map((i) => i.code)).toContain('demand_no_profile');
  });

  it('blocks only the scenario with a critical issue', () => {
    const withBad = { ...overrides, reversed: { 'model.subset_time': ['2024-02-01', '2024-01-01'] } };
    const runs = checkRunConfigs(miniModel(), [{ type: 'override', name: 'with_demand' }, { type: 'override', name: 'reversed' }], { overrides: withBad, scenarios });
    expect(runs.map((r) => r.name)).toEqual(['with_demand', 'reversed']);
    expect(runs.map((r) => r.readiness.ok)).toEqual([true, false]);
    expect(runs[1].readiness.critical[0]).toMatchObject({ code: 'invalid_time_horizon', setBy: 'reversed' });
  });
});

describe('markSetBy', () => {
  it('leaves issues the base model already has unmarked', () => {
    const base = checkModel(miniModel());
    const marked = markSetBy(checkModel(miniModel()), base, 'x');
    expect([...marked.errors, ...marked.warnings].some((i) => i.setBy)).toBe(false);
  });

  it('marks an issue when the scenario adds an item to it', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 50, longitude: 9, techs: { dem: null } });
    const base = checkModel(miniModel());
    const marked = markSetBy(checkModel(m), base, 'x');
    expect(marked.errors.find((i) => i.code === 'demand_no_profile').setBy).toBe('x');
  });
});

describe('issueLogLines', () => {
  it('writes the critical issues as [issue:<code>] lines', () => {
    const r = checkModel({ ...miniModel(), modelConfig: { startDate: '2024-02-01', endDate: '2024-01-01' } });
    expect(issueLogLines(r)).toEqual([`[issue:invalid_time_horizon] ${r.critical[0].message}`]);
  });

  it('lists the items and how many more there are', () => {
    const r = { critical: [{ code: 'link_unknown_location', message: 'Bad links.', items: ['a-x', 'a-y'], count: 5 }] };
    expect(issueLogLines(r)).toEqual(['[issue:link_unknown_location] Bad links. (a-x, a-y +3 more)']);
  });
});
