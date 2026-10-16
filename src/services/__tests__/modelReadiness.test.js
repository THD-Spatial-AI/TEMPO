import { describe, it, expect } from 'vitest';
import { checkModel, FIX_VIEW } from '../modelReadiness';
import shared from '../../../scripts/readiness_cases.json';

// One location with a supply and a demand that can run on every engine.
function miniModel(extra = {}) {
  return {
    locations: [{ name: 'a', latitude: 52, longitude: 10, techs: { gen: null, dem: null }, demandProfile: { timeseries: [10, 12] } }],
    links: [],
    technologies: [
      { name: 'gen', essentials: { parent: 'supply', carrier_out: 'electricity' }, constraints: { energy_cap_max: 1000 }, costs: { monetary: { energy_cap: 900 } } },
      { name: 'dem', essentials: { parent: 'demand', carrier_in: 'electricity' }, constraints: {}, costs: { monetary: {} } },
    ],
    timeSeries: [],
    modelConfig: { startDate: '2024-01-01', endDate: '2024-01-07' },
    ...extra,
  };
}

const codes = (list) => list.map((i) => i.code);

describe('checkModel structure', () => {
  it('passes a complete minimal model', () => {
    const r = checkModel(miniModel());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('flags everything an empty model is missing', () => {
    const r = checkModel({ locations: [], links: [], technologies: [] });
    expect(codes(r.errors)).toEqual(expect.arrayContaining(['no_locations', 'no_technologies', 'no_demand', 'no_supply']));
    expect(r.ok).toBe(false);
  });

  it('flags duplicate location names', () => {
    const m = miniModel();
    m.locations.push({ ...m.locations[0] });
    expect(codes(checkModel(m).errors)).toContain('duplicate_location');
  });

  it('warns about locations without coordinates', () => {
    const m = miniModel();
    m.locations[0].latitude = null;
    const w = checkModel(m).warnings.find((i) => i.code === 'missing_coordinates');
    expect(w.items).toEqual(['a']);
  });

  it('warns about locations with no techs and no links', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: {} });
    expect(codes(checkModel(m).warnings)).toContain('empty_location');
  });

  it('tags every issue with the page that fixes it and caps items at 8', () => {
    const m = miniModel();
    for (let i = 0; i < 12; i++) m.locations.push({ name: `x${i}`, latitude: 1, longitude: 1, techs: {} });
    const w = checkModel(m).warnings.find((i) => i.code === 'empty_location');
    expect(w.view).toBe('Locations');
    expect(w.items).toHaveLength(8);
    expect(w.count).toBe(12);
  });
});

describe('checkModel technologies and links', () => {
  it('warns, without blocking, about location techs that are not defined', () => {
    const m = miniModel();
    m.locations[0].techs.ghost = null;
    const r = checkModel(m);
    expect(r.warnings.find((i) => i.code === 'undefined_tech').items).toEqual(['a::ghost']);
    expect(codes(r.errors)).not.toContain('undefined_tech');
    expect(r.ok).toBe(true);
  });

  it('ignores hub labels and matches tech names the way the runner does', () => {
    const m = miniModel();
    m.locations[0].techs['Substation'] = null;
    m.locations[0].techs['Switching Station'] = null;
    m.locations[0].techs['GEN'] = null;
    expect(codes(checkModel(m).warnings)).not.toContain('undefined_tech');
    m.technologies.push({ name: 'Wind Farm', essentials: { parent: 'supply' }, costs: { monetary: {} } });
    m.locations[0].techs['Wind Farm'] = null;
    expect(codes(checkModel(m).warnings)).not.toContain('undefined_tech');
  });

  it('counts a tech as used when only its id is referenced', () => {
    const m = miniModel();
    m.technologies.push({ id: 't9', name: 'extra', essentials: { parent: 'supply' }, costs: { monetary: {} } });
    m.locations[0].techs.t9 = null;
    expect(codes(checkModel(m).warnings)).not.toContain('unused_tech');
  });

  it('points the missing-profile issue at Locations', () => {
    expect(FIX_VIEW.demand_no_profile).toBe('Locations');
  });

  it('warns, without blocking, about link techs that are not defined', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    m.links = [{ from: 'a', to: 'b', tech: 'hvdc' }];
    const r = checkModel(m);
    expect(r.warnings.find((i) => i.code === 'undefined_link_tech').items).toEqual(['a→b::hvdc']);
    expect(codes(r.errors)).not.toContain('undefined_tech');
  });

  it('warns about a link that names no transmission tech at all', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    m.links = [{ from: 'a', to: 'b', linkType: 'ac' }];
    expect(checkModel(m).warnings.find((i) => i.code === 'undefined_link_tech').items).toEqual(['a→b (no tech)']);
  });

  it('warns about a link with an empty techs object', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    m.links = [{ from: 'a', to: 'b', techs: {} }];
    expect(checkModel(m).warnings.find((i) => i.code === 'undefined_link_tech').items).toEqual(['a→b (no tech)']);
  });

  it('accepts a link that lists its techs as an object', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    m.links = [{ from: 'a', to: 'b', techs: { line: {} } }];
    m.technologies.push({ name: 'line', essentials: { parent: 'transmission', carrier: 'electricity' }, costs: { monetary: {} } });
    const r = checkModel(m);
    expect(codes(r.warnings)).not.toContain('undefined_link_tech');
    expect(codes(r.warnings)).not.toContain('unused_tech');
    expect(codes(r.errors)).toEqual([]);
  });

  it('accepts location techs given as an array', () => {
    const m = miniModel();
    m.locations[0].techs = ['gen', 'dem'];
    const r = checkModel(m);
    expect(r.errors).toEqual([]);
    expect(codes(r.warnings)).not.toContain('empty_location');
  });

  it('does not call a location empty when it only has links', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: {} });
    m.links = [{ from: 'a', to: 'b', tech: 'line' }];
    m.technologies.push({ name: 'line', essentials: { parent: 'transmission', carrier: 'electricity' }, costs: { monetary: {} } });
    expect(codes(checkModel(m).warnings)).not.toContain('empty_location');
  });

  it('does not report islands when locations are linked', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    m.links = [{ from: 'a', to: 'b', tech: 'line' }];
    m.technologies.push({ name: 'line', essentials: { parent: 'transmission', carrier: 'electricity' }, costs: { monetary: {} } });
    expect(codes(checkModel(m).warnings)).not.toContain('disconnected_network');
  });

  it('keys a location by id when its name is empty', () => {
    const m = miniModel();
    m.locations[0] = { ...m.locations[0], name: '', id: 'x' };
    m.locations.push({ name: '', id: 'x', latitude: 1, longitude: 1, techs: { gen: null } });
    expect(checkModel(m).errors.find((i) => i.code === 'duplicate_location').items).toEqual(['x']);
  });

  it('counts a cost set only as a location override', () => {
    const m = miniModel();
    m.technologies[0].costs = { monetary: {} };
    expect(codes(checkModel(m).warnings)).toContain('no_costs');
    m.locations[0].techs.gen = { costs: { monetary: { energy_cap: 5 } } };
    expect(codes(checkModel(m).warnings)).not.toContain('no_costs');
  });

  it('warns about techs assigned nowhere, ignoring transmission', () => {
    const m = miniModel();
    m.technologies.push({ name: 'idle', essentials: { parent: 'supply' }, costs: { monetary: { energy_cap: 1 } } });
    m.technologies.push({ name: 'line', essentials: { parent: 'transmission' }, costs: { monetary: {} } });
    expect(checkModel(m).warnings.find((i) => i.code === 'unused_tech').items).toEqual(['idle']);
  });

  it('warns when no tech has a cost (interest rate alone does not count)', () => {
    const m = miniModel();
    m.technologies[0].costs = { monetary: { interest_rate: 0.05 } };
    expect(codes(checkModel(m).warnings)).toContain('no_costs');
  });

  it('flags links to unknown locations and self links', () => {
    const m = miniModel({ links: [{ from: 'a', to: 'nowhere', tech: 'gen' }, { from: 'a', to: 'a', tech: 'gen' }] });
    const c = codes(checkModel(m).errors);
    expect(c).toContain('link_unknown_location');
    expect(c).toContain('link_self');
  });

  it('does not flag a link that references a location by id', () => {
    const m = miniModel({ links: [{ from: 'loc-1', to: 'a', tech: 'gen' }] });
    m.locations[0].id = 'loc-1';
    expect(codes(checkModel(m).errors)).not.toContain('link_unknown_location');
  });

  it('warns when the network splits into islands', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    const w = checkModel(m).warnings.find((i) => i.code === 'disconnected_network');
    expect(w.message).toMatch(/2 disconnected groups/);
  });

  it('does not ask a single-location model for links', () => {
    expect(codes(checkModel(miniModel()).warnings)).not.toContain('disconnected_network');
  });
});

describe('checkModel demand and supply', () => {
  it('flags demand with no profile and no resource', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    expect(checkModel(m).errors.find((i) => i.code === 'demand_no_profile').items).toEqual(['a::dem']);
  });

  it('accepts a scalar or file resource as demand', () => {
    const scalar = miniModel();
    delete scalar.locations[0].demandProfile;
    scalar.technologies[1].constraints.resource = -10;
    expect(codes(checkModel(scalar).errors)).not.toContain('demand_no_profile');

    const file = miniModel({ timeSeries: [{ fileName: 'demand.csv', columns: ['t', 'a'], data: [] }] });
    delete file.locations[0].demandProfile;
    file.locations[0].techs.dem = { constraints: { resource: 'file=demand.csv' } };
    expect(codes(checkModel(file).errors)).not.toContain('demand_no_profile');
  });

  it('flags a missing demand time series as an error and a missing supply one as a warning', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    m.locations[0].techs.dem = { constraints: { resource: 'file=demand.csv:a' } };
    m.locations[0].techs.gen = { constraints: { resource: 'file=pv.csv:a' } };
    const r = checkModel(m);
    expect(r.errors.find((i) => i.code === 'missing_timeseries').items).toEqual(['a::dem → file=demand.csv:a']);
    expect(r.warnings.find((i) => i.code === 'missing_timeseries').items).toEqual(['a::gen → file=pv.csv:a']);
  });

  it('flags a model where nothing produces the demanded carrier', () => {
    const m = miniModel();
    m.technologies[0].essentials.carrier_out = 'heat';
    expect(codes(checkModel(m).errors)).toContain('no_supply');
  });

  it('warns about a location whose demand nothing local or linked can serve', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { dem: null }, demandProfile: { timeseries: [5] } });
    expect(checkModel(m).warnings.find((i) => i.code === 'demand_unserved').items).toEqual(['b (electricity)']);
    m.links = [{ from: 'a', to: 'b', tech: 'line' }];
    m.technologies.push({ name: 'line', essentials: { parent: 'transmission', carrier: 'electricity' }, costs: { monetary: {} } });
    expect(codes(checkModel(m).warnings)).not.toContain('demand_unserved');
  });

  it('warns about weather-dependent supply with no resource', () => {
    const m = miniModel();
    m.technologies[0].name = 'solar_pv';
    m.locations[0].techs = { solar_pv: null, dem: null };
    expect(checkModel(m).warnings.find((i) => i.code === 'supply_no_resource').items).toEqual(['a::solar_pv']);
  });

  it('treats an inf resource as unbounded but a set resource as fine', () => {
    const m = miniModel();
    m.technologies[0].name = 'solar_pv';
    m.locations[0].techs = { solar_pv: null, dem: null };
    m.technologies[0].constraints.resource = 5;
    expect(codes(checkModel(m).warnings)).not.toContain('supply_no_resource');
    m.technologies[0].constraints.resource = 'inf';
    expect(codes(checkModel(m).warnings)).toContain('supply_no_resource');
  });

  it('accepts a zero scalar resource as a valid zero load', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    m.technologies[1].constraints.resource = 0;
    expect(codes(checkModel(m).errors)).not.toContain('demand_no_profile');
  });

  it('does not flag a time-series file that exists, with or without .csv', () => {
    const ts = [{ fileName: 'pv.csv', columns: ['t', 'a'], data: [] }];
    for (const ref of ['file=pv.csv:a', 'file=pv:a']) {
      const m = miniModel({ timeSeries: ts });
      m.locations[0].techs.gen = { constraints: { resource: ref } };
      const r = checkModel(m);
      expect(codes(r.errors)).not.toContain('missing_timeseries');
      expect(codes(r.warnings)).not.toContain('missing_timeseries');
    }
  });

  it('reports a missing file once even when it is referenced twice', () => {
    const m = miniModel();
    m.locations[0].techs.gen = { constraints: { resource: 'file=pv.csv:a' }, costs: { monetary: { om_prod: 'file=pv.csv:a' } } };
    const w = checkModel(m).warnings.find((i) => i.code === 'missing_timeseries');
    expect(w.items).toEqual(['a::gen → file=pv.csv:a']);
  });

  it('lets a conversion tech meet the demanded carrier', () => {
    const m = miniModel();
    m.technologies[0].essentials = { parent: 'conversion', carrier_in: 'gas', carrier_out: 'electricity' };
    expect(codes(checkModel(m).errors)).not.toContain('no_supply');
  });

  it('flags no demand when the demand tech is defined but assigned nowhere', () => {
    const m = miniModel();
    m.locations[0].techs = { gen: null };
    delete m.locations[0].demandProfile;
    expect(codes(checkModel(m).errors)).toContain('no_demand');
  });

  it('treats a location profile as demand even when it lists no demand tech', () => {
    const m = miniModel();
    m.locations[0].techs = { gen: null };
    const r = checkModel(m);
    expect(codes(r.errors)).toEqual([]);
    expect(codes(r.warnings)).not.toContain('unused_tech');
    m.technologies[0].essentials.carrier_out = 'heat';
    expect(codes(checkModel(m).errors)).toContain('no_supply');
  });

  it('still flags no demand when a profile exists but no demand tech is defined', () => {
    const m = miniModel();
    m.technologies = [m.technologies[0]];
    m.locations[0].techs = { gen: null };
    expect(codes(checkModel(m).errors)).toContain('no_demand');
  });

  it('flattens list carriers on conversion_plus techs', () => {
    const m = miniModel();
    m.technologies = [
      { name: 'gas', essentials: { parent: 'supply', carrier_out: 'gas' }, costs: { monetary: { energy_cap: 1 } } },
      { name: 'chp', essentials: { parent: 'conversion_plus', carrier_in: ['gas'], carrier_out: ['electricity', 'heat'] }, costs: { monetary: {} } },
      { name: 'hdem', essentials: { parent: 'demand', carrier_in: ['heat'] }, costs: { monetary: {} } },
    ];
    m.locations[0].techs = { gas: null, chp: null, hdem: null };
    const r = checkModel(m);
    expect(codes(r.errors)).not.toContain('no_supply');
    expect(codes(r.warnings)).not.toContain('demand_unserved');
  });

  it('downgrades a missing demand profile to a warning on scenario runs', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    const r = checkModel(m, { scenarioSelected: true });
    expect(codes(r.errors)).not.toContain('demand_no_profile');
    expect(r.warnings.find((i) => i.code === 'demand_no_profile').items).toEqual(['a::dem']);
    expect(r.ok).toBe(true);
  });

  it('scans tech-level files of techs assigned nowhere', () => {
    const m = miniModel();
    m.technologies.push({ name: 'idle_dem', essentials: { parent: 'demand', carrier_in: 'electricity' }, constraints: { resource: 'file=gone.csv:a' }, costs: { monetary: {} } });
    m.technologies.push({ name: 'idle_pv', essentials: { parent: 'supply' }, constraints: { resource: 'file=pv.csv:a' }, costs: { monetary: { om_prod: 'file=pv.csv:a' } } });
    const r = checkModel(m);
    expect(r.errors.find((i) => i.code === 'missing_timeseries').items).toEqual(['idle_dem → file=gone.csv:a']);
    expect(r.warnings.find((i) => i.code === 'missing_timeseries').items).toEqual(['idle_pv → file=pv.csv:a']);
  });

  it('says unserved demand will show as unmet when feasibility is ensured', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { dem: null }, demandProfile: { timeseries: [5] } });
    m.modelConfig.ensureFeasibility = true;
    const w = checkModel(m).warnings.find((i) => i.code === 'demand_unserved');
    expect(w.message).toMatch(/show up as unmet demand/);
  });
});

describe('checkModel time', () => {
  it('flags a start date after the end date', () => {
    const m = miniModel({ modelConfig: { startDate: '2024-02-01', endDate: '2024-01-01' } });
    expect(codes(checkModel(m).errors)).toContain('invalid_time_horizon');
  });

  it('skips the horizon check when dates are not set', () => {
    expect(codes(checkModel(miniModel({ modelConfig: {} })).errors)).not.toContain('invalid_time_horizon');
  });

  it('warns when a time series does not cover the model period', () => {
    const ts = { fileName: 'pv.csv', dateColumn: 't', columns: ['t', 'a'],
      data: [{ t: '2015-01-01 00:00', a: 0 }, { t: '2015-12-31 23:00', a: 0 }] };
    const w = checkModel(miniModel({ timeSeries: [ts] })).warnings.find((i) => i.code === 'timeseries_out_of_range');
    expect(w.items[0]).toMatch(/^pv\.csv/);
  });

  it('counts the end day fully: a series stopping at midnight of the last day is short', () => {
    const ts = { fileName: 'pv.csv', dateColumn: 't', columns: ['t', 'a'],
      data: [{ t: '2024-01-01 00:00', a: 0 }, null, { t: '2024-01-07 00:00', a: 0 }] };
    const w = checkModel(miniModel({ timeSeries: [ts] })).warnings.find((i) => i.code === 'timeseries_out_of_range');
    expect(w.items[0]).toMatch(/^pv\.csv/);
  });

  it('uses the series step for the end boundary', () => {
    const series = (rows) => miniModel({ timeSeries: [{ fileName: 'pv.csv', dateColumn: 't', columns: ['t'], data: rows.map((t) => ({ t })) }] });
    const flagged = (m) => codes(checkModel(m).warnings).includes('timeseries_out_of_range');
    expect(flagged(series(['2024-01-01 00:00', '2024-01-01 01:00', '2024-01-07 23:00']))).toBe(false);
    expect(flagged(series(['2024-01-01', '2024-01-02', '2024-01-07']))).toBe(false);
    expect(flagged(series(['2024-01-01 00:00', '2024-01-01 01:00', '2024-01-07 22:00']))).toBe(true);
  });

  it('does not throw on a null last row', () => {
    const ts = { fileName: 'pv.csv', dateColumn: 't', columns: ['t'], data: [{ t: '2024-01-01 00:00' }, null] };
    expect(() => checkModel(miniModel({ timeSeries: [ts] }))).not.toThrow();
  });

  it('accepts a time series covering the period', () => {
    const ts = { fileName: 'pv.csv', dateColumn: 't', columns: ['t', 'a'],
      data: [{ t: '2024-01-01 00:00', a: 0 }, { t: '2024-12-31 23:00', a: 0 }] };
    expect(codes(checkModel(miniModel({ timeSeries: [ts] })).warnings)).not.toContain('timeseries_out_of_range');
  });
});

describe('shared readiness cases', () => {
  for (const c of shared.cases) {
    it(c.name, () => {
      const got = checkModel(c.model).errors.map((i) => i.code).filter((code) => shared.shared_codes.includes(code));
      expect([...new Set(got)].sort()).toEqual([...c.expect].sort());
    });
  }
});
