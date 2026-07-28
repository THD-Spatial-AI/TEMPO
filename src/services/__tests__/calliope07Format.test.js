import { describe, it, expect, beforeAll } from 'vitest';
import { detectCalliopeFormat, from07ToInternal, internalTo07Yaml } from '../calliope07Format.js';

// Minimal PapaParse mock — avoids a browser dependency in the test environment
const papa = {
  parse(content, opts) {
    const lines = content.trim().split('\n');
    const fields = lines[0].split(',');
    const data = lines.slice(1).map(line => {
      const vals = line.split(',');
      const row = {};
      fields.forEach((f, i) => {
        const raw = (vals[i] ?? '').trim();
        row[f] = opts?.dynamicTyping && raw !== '' && !isNaN(raw) ? Number(raw) : raw;
      });
      return row;
    });
    return { meta: { fields }, data };
  },
};

// ---------------------------------------------------------------------------
// detectCalliopeFormat
// ---------------------------------------------------------------------------

describe('detectCalliopeFormat', () => {
  it('returns 0.6 for null/empty', () => {
    expect(detectCalliopeFormat(null)).toBe('0.6');
    expect(detectCalliopeFormat({})).toBe('0.6');
  });

  it('detects 0.7 from nodes key', () => {
    expect(detectCalliopeFormat({ nodes: {} })).toBe('0.7');
  });

  it('detects 0.7 from config.init', () => {
    expect(detectCalliopeFormat({ config: { init: { name: 'x' } } })).toBe('0.7');
  });

  it('detects 0.7 from base_tech in a tech', () => {
    expect(detectCalliopeFormat({ techs: { solar: { base_tech: 'supply' } } })).toBe('0.7');
  });

  it('detects 0.7 from data_tables key', () => {
    expect(detectCalliopeFormat({ data_tables: {} })).toBe('0.7');
  });

  it('detects 0.6 from locations key', () => {
    expect(detectCalliopeFormat({ locations: {} })).toBe('0.6');
  });

  it('detects 0.6 from run key', () => {
    expect(detectCalliopeFormat({ run: {} })).toBe('0.6');
  });

  it('detects 0.6 from essentials in a tech', () => {
    expect(detectCalliopeFormat({
      techs: { solar: { essentials: { parent: 'supply' } } },
    })).toBe('0.6');
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – tech translation
// ---------------------------------------------------------------------------

function makeDoc07(techDef) {
  return { techs: { test_tech: techDef }, nodes: {}, config: {} };
}

describe('from07ToInternal – tech constraint renames', () => {
  it('renames flow_cap_max → energy_cap_max', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({ base_tech: 'supply', flow_cap_max: 1000, carrier_out: 'electricity' }),
      new Map(), papa,
    );
    expect(technologies[0].constraints.energy_cap_max).toBe(1000);
  });

  it('renames flow_out_eff → energy_eff', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({ base_tech: 'supply', flow_out_eff: 0.9, carrier_out: 'electricity' }),
      new Map(), papa,
    );
    expect(technologies[0].constraints.energy_eff).toBe(0.9);
  });

  it('maps include_storage supply tech → parent supply_plus', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({ base_tech: 'supply', include_storage: true, carrier_out: 'electricity' }),
      new Map(), papa,
    );
    expect(technologies[0].parent).toBe('supply_plus');
  });
});

describe('from07ToInternal – demand sign convention', () => {
  it('translates sink_use_equals to negative resource + force_resource', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({ base_tech: 'demand', sink_use_equals: 150, carrier_in: 'electricity' }),
      new Map(), papa,
    );
    const c = technologies[0].constraints;
    expect(c.resource).toBe(-150);
    expect(c.force_resource).toBe(true);
  });

  it('translates sink_use_max without force_resource', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({ base_tech: 'demand', sink_use_max: 100, carrier_in: 'electricity' }),
      new Map(), papa,
    );
    const c = technologies[0].constraints;
    expect(c.resource).toBe(-100);
    expect(c.force_resource).toBeUndefined();
  });
});

describe('from07ToInternal – cost unwrapping', () => {
  it('unwraps {data, index: monetary, dims: costs} → monetary.energy_cap', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({
        base_tech: 'supply',
        carrier_out: 'electricity',
        cost_flow_cap: { data: 900, index: 'monetary', dims: 'costs' },
      }),
      new Map(), papa,
    );
    expect(technologies[0].costs.monetary.energy_cap).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – transmission techs → links
// ---------------------------------------------------------------------------

describe('from07ToInternal – transmission techs become links', () => {
  it('puts link_from/link_to techs into links[] not technologies', () => {
    const doc = {
      techs: {
        grid_n_s: {
          base_tech: 'transmission', link_from: 'north', link_to: 'south',
          flow_cap_max: 500, carrier_in: 'electricity', carrier_out: 'electricity',
        },
        solar: { base_tech: 'supply', carrier_out: 'electricity' },
      },
      nodes: {}, config: {},
    };
    const { technologies, links } = from07ToInternal(doc, new Map(), papa);
    expect(links).toHaveLength(1);
    expect(links[0].from).toBe('north');
    expect(links[0].to).toBe('south');
    // A transmission tech def is still added to technologies so the runner can use it
    const txTech = technologies.find(t => t.name === 'grid_n_s');
    expect(txTech).toBeDefined();
    expect(txTech.parent).toBe('transmission');
    // Regular tech unaffected
    expect(technologies.find(t => t.name === 'solar')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – nodes → locations
// ---------------------------------------------------------------------------

describe('from07ToInternal – nodes to locations', () => {
  it('converts node with lat/lon to location', () => {
    const doc = {
      techs: {},
      nodes: { north: { latitude: 52.0, longitude: 10.0, techs: {} } },
      config: {},
    };
    const { locations } = from07ToInternal(doc, new Map(), papa);
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe('north');
    expect(locations[0].latitude).toBe(52.0);
    expect(locations[0].longitude).toBe(10.0);
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – config → runConfig / subsetTime
// ---------------------------------------------------------------------------

describe('from07ToInternal – config translation', () => {
  it('maps mode base → plan and extracts subsetTime', () => {
    const doc = {
      techs: {}, nodes: {},
      config: {
        init: { mode: 'base', subset: { timesteps: ['2005-01-01 00:00:00', '2005-01-07 23:00:00'] } },
        solve: { solver: 'cbc' },
      },
    };
    const { runConfig, subsetTime } = from07ToInternal(doc, new Map(), papa);
    expect(runConfig.mode).toBe('plan');
    expect(subsetTime).toEqual(['2005-01-01', '2005-01-07']);
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – data tables: demand sign flip
// ---------------------------------------------------------------------------

describe('from07ToInternal – data table sink sign flip', () => {
  it('converts positive 0.7 demand CSV values to negative internal convention', () => {
    const csv = 'timesteps,north\n2005-01-01 00:00:00,100\n2005-01-01 01:00:00,120\n';
    const filesMap = new Map([['demand.csv', csv]]);
    const doc = {
      techs: { power_demand: { base_tech: 'demand', carrier_in: 'electricity' } },
      nodes: { north: { techs: { power_demand: null } } },
      config: {},
      data_tables: {
        demand_data: {
          data: 'demand.csv',
          rows: 'timesteps',
          columns: 'nodes',
          add_dims: { parameters: 'sink_use_equals', techs: 'power_demand' },
        },
      },
    };
    const { timeSeries } = from07ToInternal(doc, filesMap, papa);
    expect(timeSeries).toHaveLength(1);
    const vals = timeSeries[0].data.map(r => r.north);
    expect(vals[0]).toBe(-100);
    expect(vals[1]).toBe(-120);
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – data tables: 0.7.0 release "inputs" dim + columns:techs
// ---------------------------------------------------------------------------

describe('from07ToInternal – 0.7.0 release data-table shapes (THD model)', () => {
  it('reads add_dims.inputs (0.7.0) and columns:techs with scalar node for demand', () => {
    const csv = 'timesteps,demand_electricity\n2025-01-01 00:00:00,180\n2025-01-01 01:00:00,200\n';
    const filesMap = new Map([['electricity_demand.csv', csv]]);
    const doc = {
      techs: { demand_electricity: { base_tech: 'demand', carrier_in: 'electricity' } },
      nodes: { campus: { techs: { demand_electricity: null } } },
      config: {},
      data_tables: {
        electricity_demand: {
          table: 'data_tables/electricity_demand.csv',
          rows: 'timesteps',
          columns: 'techs',
          add_dims: { nodes: 'campus', inputs: 'sink_use_equals' },
        },
      },
    };
    const { locations, timeSeries } = from07ToInternal(doc, filesMap, papa);
    // demand values flipped negative for internal convention
    expect(timeSeries[0].data.map(r => r.demand_electricity)).toEqual([-180, -200]);
    // resource file ref injected on campus.demand_electricity with force_resource
    const campus = locations.find(l => l.name === 'campus');
    expect(campus.techs.demand_electricity.constraints.resource)
      .toBe('file=electricity_demand.csv:demand_electricity');
    expect(campus.techs.demand_electricity.constraints.force_resource).toBe(true);
  });

  it('links columns:techs source_use_max to every hosting node (PV capacity factor)', () => {
    const csv = 'timesteps,pv_a,pv_b\n2025-01-01 00:00:00,0.1,0.2\n';
    const filesMap = new Map([['pv.csv', csv]]);
    const doc = {
      techs: {
        pv_a: { base_tech: 'supply', carrier_out: 'electricity', source_unit: 'per_cap' },
        pv_b: { base_tech: 'supply', carrier_out: 'electricity', source_unit: 'per_cap' },
      },
      nodes: { n1: { techs: { pv_a: null } }, n2: { techs: { pv_b: null } } },
      config: {},
      data_tables: {
        pv_capacity_factor: {
          table: 'pv.csv', rows: 'timesteps', columns: 'techs',
          add_dims: { inputs: 'source_use_max' },
        },
      },
    };
    const { locations, technologies } = from07ToInternal(doc, filesMap, papa);
    expect(locations.find(l => l.name === 'n1').techs.pv_a.constraints.resource)
      .toBe('file=pv.csv:pv_a');
    expect(locations.find(l => l.name === 'n2').techs.pv_b.constraints.resource)
      .toBe('file=pv.csv:pv_b');
    // source_unit passes through on the tech (not dropped)
    expect(technologies.find(t => t.name === 'pv_a').constraints.source_unit).toBe('per_cap');
    // supply source refs are NOT forced and NOT sign-flipped
    expect(locations.find(l => l.name === 'n1').techs.pv_a.constraints.force_resource).toBeUndefined();
  });

  it('keeps columns:inputs tables (custom-math params) as passthrough data_table', () => {
    const csv = 'timesteps,battery_charge_baseline,battery_discharge_baseline\n2025-01-01 00:00:00,5,0\n';
    const filesMap = new Map([['batt.csv', csv]]);
    const doc = {
      techs: { batt: { base_tech: 'storage', carrier_in: 'electricity', carrier_out: 'electricity' } },
      nodes: { n1: { techs: { batt: null } } },
      config: {},
      data_tables: {
        existing_battery: {
          table: 'batt.csv', rows: 'timesteps', columns: 'inputs',
          add_dims: { nodes: 'n1', techs: 'batt', carriers: 'electricity' },
        },
      },
    };
    const { timeSeries } = from07ToInternal(doc, filesMap, papa);
    const ts = timeSeries[0];
    expect(ts.type).toBe('data_table');
    expect(ts.dataTableConfig.columns).toBe('parameters');   // normalised for TEMPO's engine
    expect(ts.dataTableConfig.add_dims).toMatchObject({ nodes: 'n1', techs: 'batt', carriers: 'electricity' });
    // values untouched (not sign-flipped)
    expect(ts.data[0].battery_charge_baseline).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// from07ToInternal – passthrough params, node available_area, math, params
// ---------------------------------------------------------------------------

describe('from07ToInternal – 0.7-native passthrough + node/model metadata', () => {
  it('keeps flow_in_eff and cyclic_storage verbatim on a storage tech', () => {
    const { technologies } = from07ToInternal(
      makeDoc07({ base_tech: 'storage', carrier_in: 'electricity', carrier_out: 'electricity',
        flow_in_eff: 0.95, flow_out_eff: 0.95, cyclic_storage: true }),
      new Map(), papa,
    );
    const c = technologies[0].constraints;
    expect(c.flow_in_eff).toBe(0.95);
    expect(c.energy_eff).toBe(0.95);   // flow_out_eff still maps to energy_eff
    expect(c.cyclic_storage).toBe(true);
  });

  it('captures node available_area', () => {
    const doc = { techs: {}, nodes: { parking: { available_area: 2800, techs: {} } }, config: {} };
    const { locations } = from07ToInternal(doc, new Map(), papa);
    expect(locations[0].available_area).toBe(2800);
  });

  it('loads named conditional math and top-level data_definitions', () => {
    const mathYaml = 'constraints:\n  fix_x:\n    where: battery_charge_baseline\n';
    const filesMap = new Map([['additional_math.yaml', mathYaml]]);
    const doc = {
      techs: {}, nodes: {},
      config: { init: { math_paths: { baseline_calibration: 'additional_math.yaml' } } },
      data_definitions: { cost_interest_rate: { data: 0.05, index: 'monetary', dims: 'costs' } },
    };
    const { mathModules, modelParameters, overridesFormat } = from07ToInternal(doc, filesMap, papa);
    expect(mathModules).toHaveLength(1);
    expect(mathModules[0]).toMatchObject({ name: 'baseline_calibration', unconditional: false });
    expect(mathModules[0].text).toContain('fix_x');
    expect(modelParameters.cost_interest_rate).toBeDefined();
    expect(overridesFormat).toBe('0.7');
  });

  it('marks extra_math modules as unconditional', () => {
    const filesMap = new Map([['additional_math.yaml', 'constraints: {}\n']]);
    const doc = {
      techs: {}, nodes: {},
      config: { init: {
        math_paths: { additional_math: 'additional_math.yaml' },
        extra_math: ['additional_math'],
      } },
    };
    const { mathModules } = from07ToInternal(doc, filesMap, papa);
    expect(mathModules[0].unconditional).toBe(true);
  });

  it('normalizes override-embedded data_tables and loads their CSVs', () => {
    const csv = 'timesteps,pv_x\n2025-01-01 00:00:00,0.1\n';
    const filesMap = new Map([['pv_profile.csv', csv]]);
    const doc = {
      techs: { pv_x: { base_tech: 'supply', carrier_out: 'electricity' } },
      nodes: { n1: { techs: { pv_x: null } } },
      config: {},
      overrides: {
        swap_pv: {
          data_tables: {
            pv_profile: {
              table: 'data_tables/pv_profile.csv',   // 0.7.0-release key
              rows: 'timesteps', columns: 'techs',
              add_dims: { inputs: 'source_use_max' }, // 0.7.0-release dim
            },
          },
        },
      },
    };
    const { overrides, timeSeries } = from07ToInternal(doc, filesMap, papa);
    const tbl = overrides.swap_pv.data_tables.pv_profile;
    expect(tbl.data).toBe('model_config/pv_profile.csv');
    expect(tbl.table).toBeUndefined();
    expect(tbl.add_dims.parameters).toBe('source_use_max');
    expect(tbl.add_dims.inputs).toBeUndefined();
    expect(timeSeries.some(t => t.fileName === 'pv_profile.csv')).toBe(true);
  });

  it('drops a redundant override data table that re-declares the base CSV', () => {
    // Base loads heat_demand.csv for demand_heat; the override re-declares the
    // SAME csv → redundant, so the override table is dropped (base keeps it),
    // avoiding a double sink that would make the model infeasible.
    const csv = 'timesteps,demand_heat\n2025-01-01 00:00:00,250\n';
    const filesMap = new Map([['heat_demand.csv', csv]]);
    const doc = {
      techs: { demand_heat: { base_tech: 'demand', carrier_in: 'heat' } },
      nodes: { campus: { techs: { demand_heat: null } } },
      config: {},
      data_tables: {
        heat_demand: {
          table: 'data_tables/heat_demand.csv', rows: 'timesteps', columns: 'techs',
          add_dims: { nodes: 'campus', inputs: 'sink_use_equals' },
        },
      },
      overrides: {
        heat_profile: {
          data_tables: {
            heat_demand: {
              table: 'data_tables/heat_demand.csv', rows: 'timesteps', columns: 'techs',
              add_dims: { nodes: 'campus', inputs: 'sink_use_equals' },
            },
          },
        },
      },
    };
    const { overrides, locations } = from07ToInternal(doc, filesMap, papa);
    // override table removed (redundant); base ref retained on campus.demand_heat
    expect(overrides.heat_profile.data_tables).toBeUndefined();
    const campus = locations.find(l => l.name === 'campus');
    expect(campus.techs.demand_heat.constraints.resource).toContain('file=heat_demand.csv');
  });

  it('supersedes the base ref when an override table uses a different CSV', () => {
    // Base loads pv_base.csv for pv_x; override swaps in pv_alt.csv → genuine
    // supersede: base ref cleared, override table kept & normalized.
    const base = 'timesteps,pv_x\n2025-01-01 00:00:00,0.1\n';
    const alt = 'timesteps,pv_x\n2025-01-01 00:00:00,0.9\n';
    const filesMap = new Map([['pv_base.csv', base], ['pv_alt.csv', alt]]);
    const doc = {
      techs: { pv_x: { base_tech: 'supply', carrier_out: 'electricity' } },
      nodes: { n1: { techs: { pv_x: null } } },
      config: {},
      data_tables: {
        pv_base: { table: 'pv_base.csv', rows: 'timesteps', columns: 'techs', add_dims: { inputs: 'source_use_max' } },
      },
      overrides: {
        swap: {
          data_tables: {
            pv_alt: { table: 'pv_alt.csv', rows: 'timesteps', columns: 'techs', add_dims: { inputs: 'source_use_max' } },
          },
        },
      },
    };
    const { overrides, locations } = from07ToInternal(doc, filesMap, papa);
    expect(overrides.swap.data_tables.pv_alt.data).toBe('model_config/pv_alt.csv');
    // base ref cleared so the override owns pv_x's timeseries
    const n1 = locations.find(l => l.name === 'n1');
    expect(n1.techs.pv_x.constraints.resource).toBeUndefined();
  });

  it('imports a conversion tech and preserves carrier-indexed cost verbatim', () => {
    const heatPumpCost = { data: 1000, index: [['monetary', 'heat']], dims: ['costs', 'carriers'] };
    const { technologies } = from07ToInternal(
      makeDoc07({
        base_tech: 'conversion', carrier_in: 'electricity', carrier_out: 'heat',
        flow_out_eff: { data: 2.8, index: 'heat', dims: 'carriers' },
        cost_flow_cap: heatPumpCost,
      }),
      new Map(), papa,
    );
    const t = technologies[0];
    expect(t.parent).toBe('conversion');
    expect(t.essentials.carrier_in).toBe('electricity');
    expect(t.essentials.carrier_out).toBe('heat');
    // carrier-indexed efficiency round-trips as an opaque object
    expect(t.constraints.energy_eff).toMatchObject({ data: 2.8, index: 'heat' });
    // multi-carrier cost preserved (not dropped) under the __raw07__ class
    expect(t.costs.__raw07__.cost_flow_cap).toEqual(heatPumpCost);
  });
});

describe('carrier-indexed cost survives internal → 0.7 export', () => {
  it('re-emits a preserved __raw07__ cost verbatim', () => {
    const heatPumpCost = { data: 1000, index: [['monetary', 'heat']], dims: ['costs', 'carriers'] };
    const model = baseModel({
      technologies: [{
        name: 'heat_pump',
        essentials: { parent: 'conversion', carrier_in: 'electricity', carrier_out: 'heat' },
        constraints: {},
        costs: { __raw07__: { cost_flow_cap: heatPumpCost } },
      }],
    });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.techs.heat_pump.cost_flow_cap).toEqual(heatPumpCost);
  });
});

// ---------------------------------------------------------------------------
// internalTo07Yaml – tech export
// ---------------------------------------------------------------------------

function makeTech(name, parent, constraints, costs) {
  return {
    name,
    essentials: { parent, carrier_out: 'electricity' },
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

describe('internalTo07Yaml – constraint renames', () => {
  it('translates energy_cap_max → flow_cap_max', () => {
    const model = baseModel({ technologies: [makeTech('solar', 'supply', { energy_cap_max: 2000 })] });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.techs.solar.flow_cap_max).toBe(2000);
  });

  it('translates energy_eff → flow_out_eff', () => {
    const model = baseModel({ technologies: [makeTech('solar', 'supply', { energy_eff: 0.95 })] });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.techs.solar.flow_out_eff).toBe(0.95);
  });
});

describe('internalTo07Yaml – cost wrapping', () => {
  it('wraps monetary.energy_cap as {data, index, dims}', () => {
    const model = baseModel({
      technologies: [makeTech('solar', 'supply', {}, { monetary: { energy_cap: 900 } })],
    });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.techs.solar.cost_flow_cap).toMatchObject({
      data: 900, index: 'monetary', dims: 'costs',
    });
  });
});

describe('internalTo07Yaml – config', () => {
  it('maps mode plan → base', () => {
    const model = baseModel({
      metadata: { modelConfig: { mode: 'plan', startDate: '2005-01-01', endDate: '2005-01-07' }, runConfig: {} },
    });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.config.init.mode).toBe('base');
  });

  it('always sets solver to cbc', () => {
    const { modelDoc } = internalTo07Yaml(baseModel({}), []);
    expect(modelDoc.config.solve.solver).toBe('cbc');
  });
});

describe('internalTo07Yaml – node coordinates are all-or-nothing', () => {
  it('drops coordinates for all nodes when any node lacks them', () => {
    const model = baseModel({
      locations: [
        { name: 'a', latitude: 52.5, longitude: 13.4, techs: {} },
        { name: 'b', techs: {} }, // no coordinates
      ],
    });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.nodes.a.latitude).toBeUndefined();
    expect(modelDoc.nodes.a.longitude).toBeUndefined();
    expect(modelDoc.nodes.b.latitude).toBeUndefined();
  });

  it('keeps coordinates when every node has them', () => {
    const model = baseModel({
      locations: [
        { name: 'a', latitude: 1, longitude: 2, techs: {} },
        { name: 'b', lat: 3, lng: 4, techs: {} },
      ],
    });
    const { modelDoc } = internalTo07Yaml(model, []);
    expect(modelDoc.nodes.a).toMatchObject({ latitude: 1, longitude: 2 });
    expect(modelDoc.nodes.b).toMatchObject({ latitude: 3, longitude: 4 });
  });
});

// ---------------------------------------------------------------------------
// internalTo07Yaml – links → per-link transmission techs
// ---------------------------------------------------------------------------

describe('internalTo07Yaml – links become per-link techs', () => {
  it('creates a per-link tech with link_from, link_to, distance', () => {
    const model = baseModel({
      technologies: [{
        name: 'ac_transmission',
        essentials: { parent: 'transmission', carrier: 'electricity' },
        constraints: { energy_cap_max: 1000 },
        costs: {},
      }],
      locations: [
        { name: 'north', latitude: 52, longitude: 10, techs: {} },
        { name: 'south', latitude: 48, longitude: 11, techs: {} },
      ],
      links: [{ from: 'north', to: 'south', tech: 'ac_transmission', distance: 400 }],
    });
    const { modelDoc } = internalTo07Yaml(model, []);
    const linkTech = modelDoc.techs['ac_transmission_north_south'];
    expect(linkTech).toBeDefined();
    expect(linkTech.link_from).toBe('north');
    expect(linkTech.link_to).toBe('south');
    expect(linkTech.distance).toBe(400);
    // Base transmission def must not appear as a standalone tech
    expect(modelDoc.techs.ac_transmission).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// internalTo07Yaml – demand CSV must be positive (0.7 convention)
// ---------------------------------------------------------------------------

describe('internalTo07Yaml – demand profiles CSV sign', () => {
  it('writes positive values to demand_profiles.csv', () => {
    const model = baseModel({
      technologies: [makeTech('power_demand', 'demand', {}, {})],
      locations: [{
        name: 'north', latitude: 52, longitude: 10,
        techs: { power_demand: null },
        demandProfile: { timeseries: [100, 90, 80] },
      }],
    });
    const { csvs } = internalTo07Yaml(model, []);
    expect(csvs['demand_profiles.csv']).toBeDefined();
    const rows = csvs['demand_profiles.csv'].trim().split('\n').slice(1); // skip header
    const vals = rows.map(r => parseFloat(r.split(',')[1]));
    vals.forEach(v => expect(v).toBeGreaterThan(0));
  });
});

// ---------------------------------------------------------------------------
// Format roundtrip: internal → 0.7 YAML → internal
// ---------------------------------------------------------------------------

describe('format roundtrip (internal → 0.7 → internal)', () => {
  const roundtripModel = {
    name: 'Roundtrip Model',
    technologies: [
      makeTech('solar_pv', 'supply', { energy_cap_max: 2000, energy_eff: 1.0, lifetime: 25 },
        { monetary: { energy_cap: 900, interest_rate: 0.05 } }),
      makeTech('battery', 'storage', { storage_cap_max: 5000, energy_cap_max: 1000, energy_eff: 0.95 }, {}),
      makeTech('power_demand', 'demand', { resource: -150, force_resource: true }, {}),
      {
        name: 'ac_transmission',
        essentials: { parent: 'transmission', carrier: 'electricity' },
        constraints: { energy_cap_max: 3000, energy_eff: 0.97, lifetime: 40 },
        costs: { monetary: { energy_cap_per_distance: 0.5, interest_rate: 0.05 } },
      },
    ],
    locations: [
      { name: 'north', latitude: 52.0, longitude: 10.0, techs: { solar_pv: null, battery: null, power_demand: null } },
      { name: 'south', latitude: 48.0, longitude: 11.0, techs: { power_demand: null } },
    ],
    links: [{ from: 'north', to: 'south', tech: 'ac_transmission', distance: 400 }],
    metadata: {
      modelConfig: { mode: 'plan', startDate: '2005-01-01', endDate: '2005-01-07' },
      runConfig: { solver: 'highs' },
    },
  };

  let rt; // roundtrip result
  beforeAll(() => {
    const { modelDoc, csvs } = internalTo07Yaml(roundtripModel, []);
    const filesMap = new Map(Object.entries(csvs));
    rt = from07ToInternal(modelDoc, filesMap, papa);
  });

  it('preserves non-transmission tech count', () => {
    // ac_transmission disappears as standalone; its per-link variant lands in links[]
    const nonTx = roundtripModel.technologies.filter(t =>
      (t.essentials?.parent || t.parent) !== 'transmission'
    );
    const rtNonTx = rt.technologies.filter(t => t.parent !== 'transmission');
    expect(rtNonTx.length).toBe(nonTx.length);
  });

  it('preserves supply tech capacity constraint', () => {
    const solar = rt.technologies.find(t => t.name === 'solar_pv');
    expect(solar).toBeDefined();
    expect(solar.constraints.energy_cap_max).toBe(2000);
  });

  it('preserves supply tech efficiency', () => {
    const solar = rt.technologies.find(t => t.name === 'solar_pv');
    expect(solar.constraints.energy_eff).toBe(1.0);
  });

  it('preserves monetary cost', () => {
    const solar = rt.technologies.find(t => t.name === 'solar_pv');
    expect(solar.costs.monetary.energy_cap).toBe(900);
  });

  it('preserves location count and names', () => {
    expect(rt.locations).toHaveLength(2);
    const names = rt.locations.map(l => l.name).sort();
    expect(names).toEqual(['north', 'south']);
  });

  it('preserves link count', () => {
    expect(rt.links).toHaveLength(1);
    expect(rt.links[0].from).toBe('north');
    expect(rt.links[0].to).toBe('south');
  });

  it('roundtrips config mode plan → base → plan', () => {
    expect(rt.runConfig.mode).toBe('plan');
  });
});
