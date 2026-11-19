import { describe, it, expect } from 'vitest';
import { checkModel, FIX_VIEW, readinessChecklist, forDraft } from '../modelReadiness';
import shared from '../../../scripts/readiness_cases.json';
import { profileFileName } from '../techProfiles';

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
    expect(r.critical).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('flags everything an empty model is missing', () => {
    const r = checkModel({ locations: [], links: [], technologies: [] });
    expect(codes(r.critical)).toEqual(expect.arrayContaining(['no_locations', 'no_technologies']));
    expect(codes(r.errors)).toEqual(expect.arrayContaining(['no_demand', 'no_supply']));
    expect(r.ok).toBe(false);
  });

  it('stays runnable with errors but no critical issue', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    const r = checkModel(m);
    expect(codes(r.errors)).toContain('demand_no_profile');
    expect(r.critical).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('gives critical issues the critical severity', () => {
    const r = checkModel({ locations: [], links: [], technologies: [] });
    expect(r.critical.every((i) => i.severity === 'critical')).toBe(true);
  });

  it('flags duplicate location names', () => {
    const m = miniModel();
    m.locations.push({ ...m.locations[0] });
    expect(codes(checkModel(m).critical)).toContain('duplicate_location');
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
    expect(w.view).toBe('Map View');
    expect(w.targets).toHaveLength(8);
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
    expect(checkModel(m).critical.find((i) => i.code === 'duplicate_location').items).toEqual(['x']);
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

  it('flags links to unknown locations (critical) and self links (error)', () => {
    const m = miniModel({ links: [{ from: 'a', to: 'nowhere', tech: 'gen' }, { from: 'a', to: 'a', tech: 'gen' }] });
    const r = checkModel(m);
    expect(codes(r.critical)).toContain('link_unknown_location');
    expect(codes(r.errors)).toContain('link_self');
  });

  it('does not flag a link that references a location by id', () => {
    const m = miniModel({ links: [{ from: 'loc-1', to: 'a', tech: 'gen' }] });
    m.locations[0].id = 'loc-1';
    expect(codes(checkModel(m).critical)).not.toContain('link_unknown_location');
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
    expect(codes(checkModel(m).critical)).toContain('invalid_time_horizon');
  });

  it('skips the horizon check when dates are not set', () => {
    expect(codes(checkModel(miniModel({ modelConfig: {} })).critical)).not.toContain('invalid_time_horizon');
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
      const r = checkModel(c.model);
      const got = [...r.critical, ...r.errors].filter((i) => shared.shared_codes.includes(i.code));
      expect([...new Set(got.map((i) => i.code))].sort()).toEqual([...c.expect].sort());
      for (const i of got) expect(i.severity).toBe(shared.severity[i.code]);
    });
  }
});

describe('issue targets', () => {
  const find = (r, code) => [...r.critical, ...r.errors, ...r.warnings].find((i) => i.code === code);
  const twoLocs = () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { gen: null } });
    return m;
  };

  it('gives one target per item, in item order', () => {
    const m = miniModel();
    m.locations.push({ name: 'x', latitude: 1, longitude: 1, techs: {} }, { name: 'y', latitude: 1, longitude: 1, techs: {} });
    const i = find(checkModel(m), 'empty_location');
    expect(i.items).toEqual(['x', 'y']);
    expect(i.targets.map((t) => t.id)).toEqual(['x', 'y']);
  });

  it('flies the Map View to an empty location', () => {
    const m = miniModel();
    m.locations.push({ name: 'x', latitude: 1, longitude: 1, techs: {} });
    expect(find(checkModel(m), 'empty_location').targets[0]).toEqual({ view: 'Map View', kind: 'location', id: 'x', map: true });
  });

  it('opens the location field for duplicates and missing coordinates', () => {
    const dup = miniModel();
    dup.locations.push({ ...dup.locations[0] });
    expect(find(checkModel(dup), 'duplicate_location').targets[0]).toEqual({ view: 'Locations', kind: 'location', id: 'a', field: 'name' });
    const noc = miniModel();
    noc.locations[0].latitude = null;
    expect(find(checkModel(noc), 'missing_coordinates').targets[0]).toEqual({ view: 'Locations', kind: 'location', id: 'a', field: 'coordinates' });
  });

  it('points a demand with no profile at its location and tech', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    expect(find(checkModel(m), 'demand_no_profile').targets[0]).toEqual({ view: 'Locations', kind: 'location', id: 'a', tech: 'dem', field: 'demandProfile' });
  });

  it('points an undefined location tech at the location row', () => {
    const m = miniModel();
    m.locations[0].techs.ghost = null;
    expect(find(checkModel(m), 'undefined_tech').targets[0]).toEqual({ view: 'Locations', kind: 'location', id: 'a', tech: 'ghost' });
  });

  it('points link issues at the link by its ends', () => {
    const m = twoLocs();
    m.links = [{ from: 'a', to: 'b', tech: 'hvdc' }, { from: 'a', to: 'nowhere', tech: 'gen' }, { from: 'b', to: 'b', tech: 'gen' }];
    const r = checkModel(m);
    expect(find(r, 'undefined_link_tech').targets[0]).toEqual({ view: 'Links', kind: 'link', from: 'a', to: 'b', field: 'tech' });
    expect(find(r, 'link_unknown_location').targets[0]).toEqual({ view: 'Links', kind: 'link', from: 'a', to: 'nowhere' });
    expect(find(r, 'link_self').targets[0]).toEqual({ view: 'Links', kind: 'link', from: 'b', to: 'b' });
  });

  it('gives each island its member list on the map', () => {
    const t = find(checkModel(twoLocs()), 'disconnected_network').targets;
    expect(t).toHaveLength(2);
    expect(t[1]).toEqual({ view: 'Map View', kind: 'island', members: ['b'], map: true });
  });

  it('flies to a location whose demand is unserved', () => {
    const m = miniModel();
    m.locations.push({ name: 'b', latitude: 1, longitude: 1, techs: { dem: null }, demandProfile: { timeseries: [5] } });
    expect(find(checkModel(m), 'demand_unserved').targets[0]).toEqual({ view: 'Map View', kind: 'location', id: 'b', map: true });
  });

  it('points tech issues at the tech, with the profile dialog when one can be calculated', () => {
    const m = miniModel();
    m.technologies.push({ name: 'idle', essentials: { parent: 'supply' }, costs: { monetary: { energy_cap: 1 } } });
    expect(find(checkModel(m), 'unused_tech').targets[0]).toEqual({ view: 'Technologies', kind: 'tech', id: 'idle' });
    const pv = miniModel();
    pv.technologies[0].name = 'solar_pv';
    pv.locations[0].techs = { solar_pv: null, dem: null };
    expect(find(checkModel(pv), 'supply_no_resource').targets[0])
      .toEqual({ view: 'Technologies', kind: 'tech', id: 'solar_pv', location: 'a', field: 'resource', profile: true });
  });

  it('points file issues at the time series', () => {
    const m = miniModel();
    m.locations[0].techs.gen = { constraints: { resource: 'file=pv.csv:a' } };
    expect(find(checkModel(m), 'missing_timeseries').targets[0]).toEqual({ view: 'TimeSeries', kind: 'timeseries', id: 'pv.csv' });
    const ts = { fileName: 'wind.csv', dateColumn: 't', columns: ['t'], data: [{ t: '2015-01-01 00:00' }, { t: '2015-12-31 23:00' }] };
    expect(find(checkModel(miniModel({ timeSeries: [ts] })), 'timeseries_out_of_range').targets[0])
      .toEqual({ view: 'TimeSeries', kind: 'timeseries', id: 'wind.csv' });
  });

  it('leaves issue-level problems without item targets', () => {
    const r = checkModel({ locations: [], links: [], technologies: [] });
    expect(find(r, 'no_locations').targets).toBeUndefined();
    expect(find(r, 'no_locations').view).toBe('Creation');
  });
});

describe('profile readiness', () => {
  const cal = { startDate: '2023-01-01', endDate: '2023-12-31', resolution: '60min' };
  const base = (pv) => ({
    modelConfig: { startDate: '2023-01-01', endDate: '2023-12-31', resolution: '60min' },
    technologies: [{ name: 'pv', essentials: { parent: 'supply', carrier_out: 'power' } }],
    locations: [
      { name: 'A', latitude: -33.4, longitude: -70.6, techs: { pv: { constraints: { resource: 'file=profile_pv.csv:A' } } } },
      { name: 'B', latitude: -20.2, longitude: -70.1, techs: { pv: pv ?? { constraints: { resource: 'file=profile_pv.csv:B' } } } },
    ],
    timeSeries: [{ fileName: profileFileName('pv'), source: 'tech-profile', columns: ['datetime', 'A', 'B'], csvContent: 'datetime,A,B\n',
      profileSource: { calendar: cal, points: { A: { column: 'A', lat: -33.4, lon: -70.6 }, B: { column: 'B', lat: -20.2, lon: -70.1 } } } }],
  });
  const allCodes = (r) => [...r.errors, ...r.warnings].map((i) => i.code);

  it('is silent for a fresh profile', () => {
    expect(allCodes(checkModel(base()))).not.toContain('profile_stale');
  });

  it('flags exactly the moved point and carries profileTech', () => {
    const m = base();
    m.locations[1] = { ...m.locations[1], latitude: -21 };
    const i = checkModel(m).warnings.find((w) => w.code === 'profile_stale');
    expect(i.items).toEqual(['pv: moved B']);
    expect(i.profileTech).toBe('pv');
    expect(i.view).toBe('Technologies');
  });

  it('reports missing, removed and calendar reasons', () => {
    const m = base();
    m.locations.push({ name: 'C', latitude: 1, longitude: 1, techs: { pv: {} } });
    m.locations = m.locations.filter((l) => l.name !== 'B');
    m.modelConfig = { ...m.modelConfig, startDate: '2024-01-01', endDate: '2024-12-31' };
    const i = checkModel(m).warnings.find((w) => w.code === 'profile_stale');
    expect(i.items[0]).toBe('pv: missing C; removed B; calendar');
  });

  it('resolves the calendar like the section does: saved window, else subsetTime', () => {
    const m = base();
    m.parameters = [];
    m.subsetTime = '2023';
    m.modelConfig = { ...m.modelConfig, startDate: undefined, endDate: undefined };
    expect(allCodes(checkModel(m))).not.toContain('profile_stale');
    m.subsetTime = '2024';
    expect(checkModel(m).warnings.find((w) => w.code === 'profile_stale').items).toEqual(['pv: calendar']);
    m.subsetTime = '2023';
    m.modelConfig = { ...m.modelConfig, startDate: '2024-01-01', endDate: '2024-12-31' };
    expect(checkModel(m).warnings.find((w) => w.code === 'profile_stale').items).toEqual(['pv: calendar']);
  });

  it('omits profileTech and the Calculate hint when no weather-dependent tech has a profile kind', () => {
    const m = base({});
    m.timeSeries = [];
    m.technologies = [{ name: 'hydro_reservoir', essentials: { parent: 'supply', carrier_out: 'power' } }];
    m.locations.forEach((l) => { l.techs = { hydro_reservoir: {} }; });
    const i = checkModel(m).warnings.find((w) => w.code === 'supply_no_resource');
    expect(i.profileTech).toBeUndefined();
    expect(i.message).not.toMatch(/Calculate profile/);
  });

  it('points supply_no_resource at the profile dialog', () => {
    const m = base({});
    m.timeSeries = [];
    const i = checkModel(m).warnings.find((w) => w.code === 'supply_no_resource');
    expect(i.view).toBe('Technologies');
    expect(i.profileTech).toBe('pv');
    expect(i.message).toMatch(/Calculate profile/);
  });
});

describe('ignored warnings', () => {
  const unusedModel = () => {
    const m = miniModel();
    m.technologies.push(
      { name: 'idle', essentials: { parent: 'supply' }, costs: { monetary: { energy_cap: 1 } } },
      { name: 'spare', essentials: { parent: 'supply' }, costs: { monetary: { energy_cap: 1 } } },
    );
    return m;
  };

  it('drops an ignored item and lists it under ignored', () => {
    const r = checkModel(unusedModel(), { ignored: [{ code: 'unused_tech', item: 'idle' }] });
    const w = r.warnings.find((i) => i.code === 'unused_tech');
    expect(w.items).toEqual(['spare']);
    expect(w.count).toBe(1);
    expect(r.ignored).toEqual([{ code: 'unused_tech', item: 'idle', message: w.message }]);
  });

  it('drops the whole issue when every item is ignored', () => {
    const r = checkModel(unusedModel(), { ignored: [{ code: 'unused_tech', item: 'idle' }, { code: 'unused_tech', item: 'spare' }] });
    expect(codes(r.warnings)).not.toContain('unused_tech');
    expect(r.ignored).toHaveLength(2);
  });

  it('ignores an item-less warning by code', () => {
    const m = miniModel();
    m.technologies[0].costs = { monetary: {} };
    const r = checkModel(m, { ignored: [{ code: 'no_costs', item: null }] });
    expect(codes(r.warnings)).not.toContain('no_costs');
    expect(r.ignored.map((i) => i.code)).toEqual(['no_costs']);
  });

  it('never ignores errors or critical issues', () => {
    const m = miniModel();
    delete m.locations[0].demandProfile;
    const r = checkModel(m, { ignored: [{ code: 'demand_no_profile', item: 'a::dem' }] });
    expect(codes(r.errors)).toContain('demand_no_profile');
    expect(r.ignored).toEqual([]);
  });
});

describe('readinessChecklist', () => {
  it('is null once the model has locations and technologies', () => {
    expect(readinessChecklist(checkModel(miniModel()))).toBeNull();
  });

  it('lists the basics a new model is missing, with what is done', () => {
    const empty = readinessChecklist(checkModel({ locations: [], links: [], technologies: [] }));
    expect(empty.map((i) => [i.key, i.done])).toEqual([['location', false], ['supply', false], ['demand', false]]);
    const located = readinessChecklist(checkModel({ locations: [{ name: 'a', latitude: 1, longitude: 1, techs: {} }], links: [], technologies: [] }));
    expect(located.map((i) => i.done)).toEqual([true, false, false]);
  });
});

describe('forDraft', () => {
  it('sends location, island and link issues to the Creation map and drops page-only targets', () => {
    const m = miniModel();
    m.locations.push({ name: 'x', latitude: 1, longitude: 1, techs: {} });
    m.technologies.push({ name: 'idle', essentials: { parent: 'supply' }, costs: { monetary: { energy_cap: 1 } } });
    m.links = [{ from: 'a', to: 'nowhere', tech: 'gen' }];
    const r = forDraft(checkModel(m));
    const all = [...r.critical, ...r.errors, ...r.warnings];
    expect(all.every((i) => i.view === 'Creation')).toBe(true);
    expect(all.find((i) => i.code === 'empty_location').targets[0]).toEqual({ view: 'Creation', kind: 'location', id: 'x', map: true });
    expect(all.find((i) => i.code === 'link_unknown_location').targets[0]).toEqual({ view: 'Creation', kind: 'location', id: 'a', map: true });
    expect(all.find((i) => i.code === 'unused_tech').targets).toEqual([null]);
  });
});
