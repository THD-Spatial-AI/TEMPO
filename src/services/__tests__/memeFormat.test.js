import { describe, it, expect } from 'vitest';
import {
  internalToMemeCanonical,
  MEME_TARGET_FOR_ENGINE,
  engineSupportedByMeme,
} from '../memeFormat.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTech(name, parent, constraints, costs, essentialsExtra) {
  return {
    name,
    essentials: { parent, carrier_out: 'electricity', ...(essentialsExtra || {}) },
    constraints: constraints || {},
    costs: costs || {},
  };
}

const baseModel = (extra) => ({
  name: 'Test',
  technologies: [],
  locations: [],
  links: [],
  metadata: { modelConfig: {}, runConfig: {} },
  ...extra,
});

// Structural invariants of a MEME canonical Job body (documented shape, README §4).
// Stands in for real JSON-Schema validation until MEME's revised_unified_schema.json
// is vendored into the repo.
function assertCanonicalShape(payload) {
  expect(payload).toHaveProperty('model');
  expect(payload).toHaveProperty('experiment');
  const { model, experiment } = payload;
  expect(model.metadata).toBeTypeOf('object');
  expect(model.metadata.name).toBeTypeOf('string');
  expect(model.time.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(model.time.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(model.carriers).toBeTypeOf('object');
  expect(model.nodes).toBeTypeOf('object');
  expect(model.technologies).toBeTypeOf('object');
  for (const [id, t] of Object.entries(model.technologies)) {
    expect(['supply', 'demand', 'conversion', 'storage'], `role of ${id}`).toContain(t.role);
    expect(t.node, `node of ${id}`).toBeDefined();
  }
  expect(experiment.mode).toBeTypeOf('string');
  expect(experiment.solver.name).toBeTypeOf('string');
}

// ---------------------------------------------------------------------------
// Engine → target mapping
// ---------------------------------------------------------------------------

describe('MEME target mapping', () => {
  it('maps the three supported engines', () => {
    expect(MEME_TARGET_FOR_ENGINE.pypsa).toBe('pypsa');
    expect(MEME_TARGET_FOR_ENGINE.calliope07).toBe('calliope');
    expect(MEME_TARGET_FOR_ENGINE.adoptnet0).toBe('adopt-net0');
  });

  it('rejects engines MEME does not cover', () => {
    expect(engineSupportedByMeme('pypsa')).toBe(true);
    expect(engineSupportedByMeme('calliope07')).toBe(true);
    expect(engineSupportedByMeme('adoptnet0')).toBe(true);
    expect(engineSupportedByMeme('calliope')).toBe(false); // 0.6.8
    expect(engineSupportedByMeme('osemosys')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metadata / time / experiment
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – metadata & time', () => {
  it('emits model name and a default time window', () => {
    const { payload } = internalToMemeCanonical(baseModel({ name: 'My Model' }));
    expect(payload.model.metadata.name).toBe('My Model');
    expect(payload.model.time.resolution).toBe('1H');
    assertCanonicalShape(payload);
  });

  it('derives the time window from subsetTime', () => {
    const model = baseModel({ metadata: { subsetTime: ['2030-06-01', '2030-06-07'], modelConfig: {}, runConfig: {} } });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.time.start).toBe('2030-06-01');
    expect(payload.model.time.end).toBe('2030-06-07');
  });

  it('falls back to modelConfig start/end dates', () => {
    const model = baseModel({ metadata: { modelConfig: { startDate: '2025-01-01', endDate: '2025-01-03' }, runConfig: {} } });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.time.start).toBe('2025-01-01');
    expect(payload.model.time.end).toBe('2025-01-03');
  });

  it('reads a top-level modelConfig (the Run payload shape)', () => {
    // Run.jsx sends modelConfig at the top level, not under metadata.
    const model = { ...baseModel(), modelConfig: { startDate: '2040-03-01', endDate: '2040-03-02' } };
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.time.start).toBe('2040-03-01');
    expect(payload.model.time.end).toBe('2040-03-02');
  });
});

describe('internalToMemeCanonical – experiment', () => {
  it('defaults mode plan, objective min_cost', () => {
    const { payload } = internalToMemeCanonical(baseModel());
    expect(payload.experiment.mode).toBe('plan');
    expect(payload.experiment.objective).toBe('min_cost');
  });

  it('maps internal mode spores → alternatives', () => {
    const { payload } = internalToMemeCanonical(baseModel(), { mode: 'spores' });
    expect(payload.experiment.mode).toBe('alternatives');
  });

  it('maps internal mode operate → operate', () => {
    const { payload } = internalToMemeCanonical(baseModel({ metadata: { modelConfig: { mode: 'operate' }, runConfig: {} } }));
    expect(payload.experiment.mode).toBe('operate');
  });

  it('honours solver and objective opts', () => {
    const { payload } = internalToMemeCanonical(baseModel(), { solver: 'cbc', objective: 'min_emissions' });
    expect(payload.experiment.solver.name).toBe('cbc');
    expect(payload.experiment.objective).toBe('min_emissions');
  });
});

// ---------------------------------------------------------------------------
// Supply tech: role, node, capacity, efficiency, costs, lifetime, interest
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – supply tech', () => {
  const model = baseModel({
    technologies: [makeTech('solar', 'supply',
      { energy_cap_max: 2000, energy_eff: 0.95, lifetime: 25 },
      { monetary: { energy_cap: 900, om_annual: 20, om_prod: 3, interest_rate: 0.07 } })],
    locations: [{ name: 'north', latitude: 52, longitude: 10, techs: { solar: null } }],
  });
  const { payload } = internalToMemeCanonical(model);
  const solar = payload.model.technologies.solar;

  it('is a supply role placed on its single node (scalar, not array)', () => {
    expect(solar.role).toBe('supply');
    expect(solar.node).toBe('north');
  });
  it('maps energy_cap_max → capacity.max with expandable', () => {
    expect(solar.capacity).toEqual({ max: 2000, expandable: true });
  });
  it('maps energy_eff → efficiency', () => {
    expect(solar.efficiency).toBe(0.95);
  });
  it('maps monetary costs to canonical cost fields', () => {
    expect(solar.costs.monetary.investment_per_capacity).toBe(900);
    expect(solar.costs.monetary.fixed_om).toBe(20);
    expect(solar.costs.monetary.variable_om).toBe(3);
    expect(solar.costs.monetary.investment_per_capacity).toBeDefined();
  });
  it('lifts lifetime and interest_rate to top-level tech fields', () => {
    expect(solar.lifetime).toBe(25);
    expect(solar.interest_rate).toBe(0.07);
    expect(solar.cost_basis).toBe('overnight');
  });
  it('carries carrier_out and registers the carrier', () => {
    expect(solar.carrier_out).toBe('electricity');
    expect(payload.model.carriers).toHaveProperty('electricity');
  });
});

describe('internalToMemeCanonical – infinite / equals capacity', () => {
  it('treats inf energy_cap_max as expandable with no max', () => {
    const model = baseModel({
      technologies: [makeTech('wind', 'supply', { energy_cap_max: 1e15 })],
      locations: [{ name: 'n', latitude: 1, longitude: 2, techs: { wind: null } }],
    });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.technologies.wind.capacity).toEqual({ expandable: true });
  });

  it('maps energy_cap_equals to existing + expandable false', () => {
    const model = baseModel({
      technologies: [makeTech('ccgt', 'supply', { energy_cap_equals: 500 })],
      locations: [{ name: 'n', latitude: 1, longitude: 2, techs: { ccgt: null } }],
    });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.technologies.ccgt.capacity).toEqual({ existing: 500, expandable: false });
  });
});

// ---------------------------------------------------------------------------
// Demand tech: sign convention
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – demand tech', () => {
  it('maps negative resource sink → positive demand_profile with carrier_in', () => {
    const model = baseModel({
      technologies: [makeTech('power_demand', 'demand', { resource: -150, force_resource: true }, {}, { carrier_in: 'electricity', carrier_out: null })],
      locations: [{ name: 'north', latitude: 1, longitude: 2, techs: { power_demand: null } }],
    });
    const { payload } = internalToMemeCanonical(model);
    const d = payload.model.technologies.power_demand;
    expect(d.role).toBe('demand');
    expect(d.carrier_in).toBe('electricity');
    expect(d.demand_profile).toBe(150);
    expect(d.carrier_out).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Storage tech
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – storage tech', () => {
  it('maps storage_cap_max → storage.energy_capacity.max and shares one carrier', () => {
    const model = baseModel({
      technologies: [makeTech('battery', 'storage',
        { energy_cap_max: 1000, storage_cap_max: 5000, energy_eff: 0.95 }, {},
        { carrier: 'electricity', carrier_out: null })],
      locations: [{ name: 'n', latitude: 1, longitude: 2, techs: { battery: null } }],
    });
    const { payload } = internalToMemeCanonical(model);
    const b = payload.model.technologies.battery;
    expect(b.role).toBe('storage');
    expect(b.carrier_in).toBe('electricity');
    expect(b.carrier_out).toBe('electricity');
    expect(b.capacity.max).toBe(1000);
    expect(b.storage.energy_capacity.max).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// Conversion tech: two carriers
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – conversion tech', () => {
  it('carries distinct carrier_in and carrier_out', () => {
    const model = baseModel({
      technologies: [makeTech('electrolyser', 'conversion', { energy_eff: 0.7 }, {},
        { carrier_in: 'electricity', carrier_out: 'hydrogen' })],
      locations: [{ name: 'n', latitude: 1, longitude: 2, techs: { electrolyser: null } }],
    });
    const { payload } = internalToMemeCanonical(model);
    const e = payload.model.technologies.electrolyser;
    expect(e.role).toBe('conversion');
    expect(e.carrier_in).toBe('electricity');
    expect(e.carrier_out).toBe('hydrogen');
    expect(payload.model.carriers).toHaveProperty('hydrogen');
  });
});

// ---------------------------------------------------------------------------
// Multi-node placement + node_overrides
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – placement', () => {
  it('lists all nodes a tech sits on as an array', () => {
    const model = baseModel({
      technologies: [makeTech('solar', 'supply', { energy_cap_max: 100 })],
      locations: [
        { name: 'north', latitude: 1, longitude: 2, techs: { solar: null } },
        { name: 'south', latitude: 3, longitude: 4, techs: { solar: null } },
      ],
    });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.technologies.solar.node).toEqual(['north', 'south']);
  });

  it('captures per-node constraint overrides in node_overrides', () => {
    const model = baseModel({
      technologies: [makeTech('solar', 'supply', { energy_cap_max: 100 })],
      locations: [
        { name: 'north', latitude: 1, longitude: 2, techs: { solar: { constraints: { energy_cap_max: 500 } } } },
        { name: 'south', latitude: 3, longitude: 4, techs: { solar: null } },
      ],
    });
    const { payload } = internalToMemeCanonical(model);
    const solar = payload.model.technologies.solar;
    expect(solar.node_overrides.north.capacity.max).toBe(500);
    expect(solar.node_overrides.south).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Transmission from links
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – transmission', () => {
  const model = baseModel({
    technologies: [{
      name: 'ac',
      essentials: { parent: 'transmission', carrier: 'electricity' },
      constraints: { energy_cap_max: 3000, energy_eff: 0.97 },
      costs: { monetary: { energy_cap: 500 } },
    }],
    locations: [
      { name: 'north', latitude: 52, longitude: 10, techs: {} },
      { name: 'south', latitude: 48, longitude: 11, techs: {} },
    ],
    links: [{ from: 'north', to: 'south', tech: 'ac', capacity: 1000, distance: 400 }],
  });
  const { payload } = internalToMemeCanonical(model);

  it('emits a transmission entry, not a tech, for the link', () => {
    expect(payload.model.technologies.ac).toBeUndefined();
    const keys = Object.keys(payload.model.transmission);
    expect(keys).toHaveLength(1);
    const tx = payload.model.transmission[keys[0]];
    expect(tx.from).toBe('north');
    expect(tx.to).toBe('south');
    expect(tx.carrier).toBe('electricity');
    expect(tx.bidirectional).toBe(true);
    expect(tx.capacity.max).toBe(1000); // link.capacity wins over the tech's 3000
    expect(tx.capacity.expandable).toBe(true);
    expect(tx.distance).toBe(400);
    expect(tx.efficiency).toBe(0.97);
    expect(tx.costs.monetary.investment_per_capacity).toBe(500);
  });

  it('inherits capacity from the transmission tech when the link omits it', () => {
    const model2 = baseModel({
      technologies: [{
        name: 'ac',
        essentials: { parent: 'transmission', carrier: 'electricity' },
        constraints: { energy_cap_max: 3000, energy_eff: 0.97 },
        costs: {},
      }],
      locations: [
        { name: 'north', latitude: 52, longitude: 10, techs: {} },
        { name: 'south', latitude: 48, longitude: 11, techs: {} },
      ],
      links: [{ from: 'north', to: 'south', tech: 'ac', distance: 400 }], // no capacity
    });
    const { payload } = internalToMemeCanonical(model2);
    const tx = payload.model.transmission[Object.keys(payload.model.transmission)[0]];
    expect(tx.capacity).toEqual({ max: 3000, expandable: true });
  });
});

// ---------------------------------------------------------------------------
// Node coordinates: all-or-nothing
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – node coords all-or-nothing', () => {
  it('emits coords when every node has them', () => {
    const model = baseModel({
      technologies: [makeTech('solar', 'supply', { energy_cap_max: 10 })],
      locations: [
        { name: 'a', latitude: 1, longitude: 2, techs: { solar: null } },
        { name: 'b', lat: 3, lng: 4, techs: { solar: null } },
      ],
    });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.nodes.a.coords).toEqual({ lat: 1, lon: 2 });
    expect(payload.model.nodes.b.coords).toEqual({ lat: 3, lon: 4 });
  });

  it('drops coords for all nodes when any lacks them', () => {
    const model = baseModel({
      technologies: [makeTech('solar', 'supply', { energy_cap_max: 10 })],
      locations: [
        { name: 'a', latitude: 1, longitude: 2, techs: { solar: null } },
        { name: 'b', techs: { solar: null } },
      ],
    });
    const { payload } = internalToMemeCanonical(model);
    expect(payload.model.nodes.a.coords).toBeUndefined();
    expect(payload.model.nodes.b.coords).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Warnings & skips
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – warnings', () => {
  it('warns and drops an unmapped constraint', () => {
    const model = baseModel({
      technologies: [makeTech('solar', 'supply', { energy_cap_max: 10, some_exotic_param: 1 })],
      locations: [{ name: 'n', latitude: 1, longitude: 2, techs: { solar: null } }],
    });
    const { payload, log } = internalToMemeCanonical(model);
    expect(payload.model.technologies.solar.some_exotic_param).toBeUndefined();
    expect(log.some((l) => l.includes('some_exotic_param'))).toBe(true);
  });

  it('skips a tech that is not placed at any node', () => {
    const model = baseModel({
      technologies: [makeTech('orphan', 'supply', { energy_cap_max: 10 })],
      locations: [{ name: 'n', latitude: 1, longitude: 2, techs: {} }],
    });
    const { payload, log } = internalToMemeCanonical(model);
    expect(payload.model.technologies.orphan).toBeUndefined();
    expect(log.some((l) => l.includes('not placed at any node'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Calliope-safe identifiers (no hyphens, no leading digit)
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – Calliope-safe identifiers', () => {
  it('replaces hyphens in node and tech ids and keeps placement consistent', () => {
    const model = baseModel({
      technologies: [makeTech('hydro-ror', 'supply', { energy_cap_max: 10 })],
      locations: [{ name: 'N_DIESEL-QUANI-ARICA', latitude: 1, longitude: 2, techs: { 'hydro-ror': null } }],
    });
    const { payload } = internalToMemeCanonical(model);
    expect(Object.keys(payload.model.nodes)).toContain('N_DIESEL_QUANI_ARICA');
    expect(payload.model.technologies.hydro_ror).toBeDefined();
    expect(payload.model.technologies.hydro_ror.node).toBe('N_DIESEL_QUANI_ARICA');
  });

  it('prefixes transmission ids that would start with a digit', () => {
    const model = baseModel({
      technologies: [{
        name: 'ac', essentials: { parent: 'transmission', carrier: 'electricity' },
        constraints: { energy_cap_max: 100 }, costs: {},
      }],
      locations: [
        { name: 'north', latitude: 1, longitude: 2, techs: {} },
        { name: 'south', latitude: 3, longitude: 4, techs: {} },
      ],
      links: [{ from: 'north', to: 'south', tech: '110_kv_line', distance: 5 }],
    });
    const { payload } = internalToMemeCanonical(model);
    const key = Object.keys(payload.model.transmission)[0];
    expect(/^[A-Za-z]/.test(key)).toBe(true);
    expect(key.startsWith('n_110')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// File-based timeseries (demand profiles + supply availability)
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – file-based timeseries', () => {
  const model = {
    name: 'TS',
    technologies: [
      { name: 'total_demand', essentials: { parent: 'demand', carrier_in: 'electricity', carrier_out: null }, constraints: {}, costs: {} },
      makeTech('pv', 'supply', {}),
    ],
    locations: [
      { name: 'Arica', latitude: 1, longitude: 2, techs: {
        total_demand: { constraints: { resource: 'file=total_demand.csv:Arica' } },
        pv: { constraints: { resource: 'file=resource_pv.csv:Arica' } },
      } },
    ],
    links: [],
    timeSeries: [
      { fileName: 'total_demand.csv', dateColumn: 'time', dataColumns: ['Arica'], data: [{ time: 't0', Arica: -100 }, { time: 't1', Arica: -120 }] },
      { fileName: 'resource_pv.csv', dateColumn: 'time', dataColumns: ['Arica'], data: [{ time: 't0', Arica: 0.5 }, { time: 't1', Arica: 0.8 }] },
    ],
    metadata: { modelConfig: {}, runConfig: {} },
  };
  const { payload } = internalToMemeCanonical(model);

  it('materializes referenced columns into inline timeseries', () => {
    expect(payload.model.timeseries).toBeDefined();
    const entries = Object.values(payload.model.timeseries);
    expect(entries.length).toBe(2);
    entries.forEach((e) => expect(e.source).toBe('inline'));
  });

  it('maps a demand file-ref to demand_profile (positive) at node + tech level', () => {
    const d = payload.model.technologies.total_demand;
    const id = d.node_overrides.Arica.demand_profile;
    expect(id).toBeTypeOf('string');
    expect(d.demand_profile).toBe(id); // tech-level default borrowed from the node
    expect(payload.model.timeseries[id].values).toEqual([100, 120]); // sign-flipped positive
  });

  it('maps a supply availability file-ref to operation.max_pu', () => {
    const pv = payload.model.technologies.pv;
    const id = pv.node_overrides.Arica.operation.max_pu;
    expect(id).toBeTypeOf('string');
    expect(payload.model.timeseries[id].values).toEqual([0.5, 0.8]);
  });

  it('resolves file-refs from raw csvContent (non-current model)', () => {
    const m = {
      name: 'CSV',
      technologies: [
        { name: 'total_demand', essentials: { parent: 'demand', carrier_in: 'electricity', carrier_out: null }, constraints: {}, costs: {} },
      ],
      locations: [
        { name: 'Arica', latitude: 1, longitude: 2, techs: { total_demand: { constraints: { resource: 'file=total_demand.csv:Arica' } } } },
      ],
      links: [],
      timeSeries: [
        { fileName: 'total_demand.csv', csvContent: 'time,Arica\n2021-01-01 00:00,-100\n2021-01-01 01:00,-120\n' },
      ],
      metadata: { modelConfig: {}, runConfig: {} },
    };
    const { payload } = internalToMemeCanonical(m);
    const id = payload.model.technologies.total_demand.demand_profile;
    expect(id).toBeTypeOf('string');
    expect(payload.model.timeseries[id].values).toEqual([100, 120]);
  });

  it('warns when a file-ref cannot be resolved', () => {
    const bad = {
      ...model,
      timeSeries: [], // no CSVs → refs unresolvable
    };
    const { log } = internalToMemeCanonical(bad);
    expect(log.some((l) => l.includes('could not be resolved'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full-model shape
// ---------------------------------------------------------------------------

describe('internalToMemeCanonical – full model shape', () => {
  it('produces a structurally valid canonical body', () => {
    const model = baseModel({
      name: 'Integration',
      technologies: [
        makeTech('solar', 'supply', { energy_cap_max: 2000, energy_eff: 1.0, lifetime: 25 }, { monetary: { energy_cap: 900, interest_rate: 0.05 } }),
        makeTech('battery', 'storage', { energy_cap_max: 1000, storage_cap_max: 5000 }, {}, { carrier: 'electricity', carrier_out: null }),
        makeTech('power_demand', 'demand', { resource: -150, force_resource: true }, {}, { carrier_in: 'electricity', carrier_out: null }),
        { name: 'ac', essentials: { parent: 'transmission', carrier: 'electricity' }, constraints: { energy_eff: 0.97 }, costs: {} },
      ],
      locations: [
        { name: 'north', latitude: 52, longitude: 10, techs: { solar: null, battery: null, power_demand: null } },
        { name: 'south', latitude: 48, longitude: 11, techs: { power_demand: null } },
      ],
      links: [{ from: 'north', to: 'south', tech: 'ac', capacity: 500, distance: 400 }],
    });
    const { payload } = internalToMemeCanonical(model);
    assertCanonicalShape(payload);
    expect(Object.keys(payload.model.technologies)).toEqual(
      expect.arrayContaining(['solar', 'battery', 'power_demand']),
    );
    expect(Object.keys(payload.model.transmission)).toHaveLength(1);
  });
});
