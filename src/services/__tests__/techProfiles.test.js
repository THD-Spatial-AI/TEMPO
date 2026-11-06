import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchTechProfiles, fetchTechProfileValues } from '../techDatabaseApi';
import {
  classifyProfileKind, pickProfile, restampToModelCalendar,
  buildProfileTimeSeries, applyProfileToLocations, profileStaleness, canApplyProfile,
  modelCalendar, profileFileName, profileColumnId, PROFILE_KIND_LABEL,
  defaultPvOrientation, pointColumnIds, pvPointKey,
} from '../techProfiles';

describe('classifyProfileKind', () => {
  it('detects PV and wind by id/name', () => {
    expect(classifyProfileKind({ id: 'solar_pv_utility', name: 'Solar PV Utility-scale', parent: 'supply_plus' })).toBe('pv');
    expect(classifyProfileKind({ id: 'onshore_wind', name: 'Onshore Wind', parent: 'supply' })).toBe('wind');
    expect(classifyProfileKind({ id: 'offshore_wind_floating', name: 'Offshore Wind Floating', parent: 'supply' })).toBe('wind');
  });
  it('maps tidal and run-of-river to capacity_factor', () => {
    expect(classifyProfileKind({ id: 'marine_energy', name: 'Marine Energy', parent: 'supply' })).toBe('capacity_factor');
    expect(classifyProfileKind({ id: 'hydro_run_of_river', name: 'Hydroelectric Run-of-River', parent: 'supply' })).toBe('capacity_factor');
  });
  it('maps thermal / dispatchable plants to availability', () => {
    for (const id of ['nuclear_conventional', 'smr', 'coal_power_plant', 'ccgt', 'ocgt', 'internal_combustion_engine',
      'biogas_power_plant', 'biomass_power_plant', 'waste_to_energy', 'geothermal_power', 'chp_gas', 'biomass_chp']) {
      expect(classifyProfileKind({ id, name: id, parent: 'supply' })).toBe('availability');
    }
  });
  it('returns null for storage, transmission, demand, CSP and solar thermal', () => {
    expect(classifyProfileKind({ id: 'lithium_ion_bess', name: 'Lithium-ion BESS', parent: 'storage' })).toBeNull();
    expect(classifyProfileKind({ id: 'hvac_overhead', name: 'HVAC Overhead Lines', parent: 'transmission' })).toBeNull();
    expect(classifyProfileKind({ id: 'power_demand', name: 'Power demand', parent: 'demand' })).toBeNull();
    expect(classifyProfileKind({ id: 'csp', name: 'Concentrated Solar Power (CSP)', parent: 'supply' })).toBeNull();
    expect(classifyProfileKind({ id: 'solar_thermal_collector', name: 'Solar Thermal Collector', parent: 'supply' })).toBeNull();
  });
});

const meta = (over = {}) => ({ profile_id: 'p', kind: 'annual_series', time_resolution: '1h', n_values: 8760, year: 2025, ...over });

describe('pickProfile', () => {
  it('prefers a linked timeseries profile over an embedded one with the same role', () => {
    const resp = {
      embedded_profiles: [meta({ profile_id: 'emb', profile_role: 'capacity_factor' })],
      timeseries_profiles: [meta({ profile_id: 'ts', profile_role: 'capacity_factor' })],
    };
    expect(pickProfile(resp, 'capacity_factor').profile_id).toBe('ts');
  });
  it('filters by role, treating a null role as matching', () => {
    const resp = { embedded_profiles: [meta({ profile_id: 'a', profile_role: 'capacity_factor' }), meta({ profile_id: 'b', profile_role: 'availability' })] };
    expect(pickProfile(resp, 'availability').profile_id).toBe('b');
    expect(pickProfile({ embedded_profiles: [meta({ profile_id: 'c', profile_role: null })] }, 'availability').profile_id).toBe('c');
  });
  it('rejects profiles that are not a full hourly year', () => {
    const resp = { embedded_profiles: [meta({ profile_id: 'bad', n_values: 864, profile_role: 'availability' })] };
    expect(pickProfile(resp, 'availability')).toBeNull();
  });
  it('accepts 8784 values in a leap year', () => {
    const resp = { embedded_profiles: [meta({ profile_id: 'leap', n_values: 8784, year: 2024, profile_role: 'availability' })] };
    expect(pickProfile(resp, 'availability').profile_id).toBe('leap');
  });
});

const hourIndexYear = (y) => Array.from({ length: (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 8784 : 8760) }, (_, i) => i);

describe('restampToModelCalendar', () => {
  it('maps same-calendar hours one-to-one', () => {
    const { datetimes, values } = restampToModelCalendar(hourIndexYear(2025), 2025, { startDate: '2030-01-01', endDate: '2030-01-02', resolution: '60min' });
    expect(values).toHaveLength(48);
    expect(datetimes[0]).toBe('2030-01-01 00:00:00');
    expect(values[0]).toBe(0);
    expect(values[47]).toBe(47);
  });
  it('fills a model leap day from Feb 28 of a non-leap source year', () => {
    const src = hourIndexYear(2025);
    const { values } = restampToModelCalendar(src, 2025, { startDate: '2028-02-28', endDate: '2028-03-01', resolution: '60min' });
    expect(values).toHaveLength(72);
    const feb28h0 = (31 + 27) * 24;
    expect(values[0]).toBe(feb28h0);       // Feb 28 00:00
    expect(values[24]).toBe(feb28h0);      // Feb 29 00:00 → copy of Feb 28
    expect(values[48]).toBe(feb28h0 + 24); // Mar 1 00:00
  });
  it('skips a leap-source Feb 29 when the model year is not leap', () => {
    const src = hourIndexYear(2024);
    const { values } = restampToModelCalendar(src, 2024, { startDate: '2025-03-01', endDate: '2025-03-01', resolution: '60min' });
    expect(values[0]).toBe((31 + 29) * 24); // Mar 1 in the 2024 series
  });
  it('repeats the hourly value for 15-minute steps', () => {
    const { values } = restampToModelCalendar(hourIndexYear(2025), 2025, { startDate: '2030-01-01', endDate: '2030-01-01', resolution: '15min' });
    expect(values).toHaveLength(96);
    expect(values.slice(0, 5)).toEqual([0, 0, 0, 0, 1]);
  });
  it('throws on a series that is not a full year', () => {
    expect(() => restampToModelCalendar([1, 2, 3], 2025, { startDate: '2030-01-01', endDate: '2030-01-01' })).toThrow(/8760/);
  });
});

describe('buildProfileTimeSeries', () => {
  it('builds a reload-safe entry with csvContent and profileSource', () => {
    const ts = buildProfileTimeSeries({
      modelId: 'm1', techName: 'nuclear_conventional',
      datetimes: ['2030-01-01 00:00:00', '2030-01-01 01:00:00'],
      columns: { nuclear_conventional: [0.9, 0.95] },
      profileSource: { provider: 'opentech-db', profileId: 'nuclear_conventional_availability_2025', role: 'availability' },
    });
    expect(ts.fileName).toBe('profile_nuclear_conventional.csv');
    expect(ts.id).toBe('m1_profile_nuclear_conventional');
    expect(ts.source).toBe('tech-profile');
    expect(ts.dataColumns).toEqual(['nuclear_conventional']);
    expect(ts.csvContent).toBe('datetime,nuclear_conventional\n2030-01-01 00:00:00,0.9\n2030-01-01 01:00:00,0.95');
    expect(ts.rowCount).toBe(2);
    expect(ts.profileSource.profileId).toBe('nuclear_conventional_availability_2025');
  });
});

describe('applyProfileToLocations', () => {
  const locs = [
    { name: 'A', techs: { nuclear_conventional: { constraints: { energy_cap_max: 1000 } } } },
    { name: 'B', techs: { ccgt: {} } },
  ];
  it('writes file= refs with force_resource=false for availability and leaves other locations alone', () => {
    const out = applyProfileToLocations(locs, {
      techName: 'nuclear_conventional', fileName: 'profile_nuclear_conventional.csv',
      colByLocation: { A: 'nuclear_conventional' }, kind: 'availability',
    });
    expect(out[0].techs.nuclear_conventional.constraints).toEqual({
      energy_cap_max: 1000,
      resource: 'file=profile_nuclear_conventional.csv:nuclear_conventional',
      resource_unit: 'energy_per_cap',
      force_resource: false,
    });
    expect(out[1]).toBe(locs[1]);
    expect(locs[0].techs.nuclear_conventional.constraints.resource).toBeUndefined(); // not mutated
  });
  it('uses force_resource=true for capacity_factor', () => {
    const out = applyProfileToLocations([{ name: 'A', techs: { marine_energy: {} } }], {
      techName: 'marine_energy', fileName: 'f.csv', colByLocation: { A: 'marine_energy' }, kind: 'capacity_factor',
    });
    expect(out[0].techs.marine_energy.constraints.force_resource).toBe(true);
  });
});

describe('profileStaleness', () => {
  const entry = { profileSource: {
    calendar: { startDate: '2030-01-01', endDate: '2030-12-31', resolution: '60min' },
    points: { A: { column: 'x' } },
  } };
  const locs = [{ name: 'A', techs: { t: {} } }];
  it('is fresh when calendar and points match', () => {
    expect(profileStaleness(entry, { modelConfig: { startDate: '2030-01-01', endDate: '2030-12-31', resolution: '60min' }, locations: locs, techName: 't' }))
      .toEqual({ stale: false, reasons: [], missing: [], removed: [], moved: [] });
  });
  it('flags a calendar change', () => {
    const r = profileStaleness(entry, { modelConfig: { startDate: '2030-01-01', endDate: '2030-06-30', resolution: '60min' }, locations: locs, techName: 't' });
    expect(r.stale).toBe(true);
    expect(r.reasons).toContain('calendar');
  });
  it('lists locations that host the tech but have no column, and removed points', () => {
    const r = profileStaleness(entry, { modelConfig: entry.profileSource.calendar, locations: [{ name: 'B', techs: { t: {} } }], techName: 't' });
    expect(r.missing).toEqual(['B']);
    expect(r.removed).toEqual(['A']);
    expect(r.stale).toBe(true);
  });
  it('treats a missing entry as not stale (nothing applied yet)', () => {
    expect(profileStaleness(null, { modelConfig: {}, locations: [], techName: 't' }).stale).toBe(false);
  });
});

describe('classifyProfileKind hardening', () => {
  it('does not match abbreviations inside other words', () => {
    expect(classifyProfileKind({ id: 'error_tech', name: 'error_tech', parent: 'supply' })).toBeNull();
    expect(classifyProfileKind({ id: 'mirror', name: 'mirror', parent: 'supply' })).toBeNull();
    expect(classifyProfileKind({ id: 'pvc_plant', name: 'pvc_plant', parent: 'supply' })).toBeNull();
  });
  it('matches abbreviations as whole tokens', () => {
    expect(classifyProfileKind({ id: 'solar_pv_utility', name: 'x', parent: 'supply' })).toBe('pv');
    expect(classifyProfileKind({ id: 'pv_rooftop', name: 'x', parent: 'supply' })).toBe('pv');
    expect(classifyProfileKind({ id: 'hydro_ror', name: 'x', parent: 'supply' })).toBe('capacity_factor');
    expect(classifyProfileKind({ id: 'hydro_x', name: 'Run of River', parent: 'supply' })).toBe('capacity_factor');
  });
  it('returns null for steam methane reforming and hydrogen techs', () => {
    expect(classifyProfileKind({ id: 'smr', name: 'Steam Methane Reforming (SMR)', parent: 'conversion' })).toBeNull();
  });
});

describe('canApplyProfile', () => {
  it('is true only for supply and supply_plus', () => {
    expect(canApplyProfile('supply')).toBe(true);
    expect(canApplyProfile('supply_plus')).toBe(true);
    expect(canApplyProfile('conversion')).toBe(false);
    expect(canApplyProfile('conversion_plus')).toBe(false);
    expect(canApplyProfile(undefined)).toBe(false);
  });
});

describe('buildProfileTimeSeries validation', () => {
  const base = { modelId: 'm', techName: 't', datetimes: ['a', 'b'], columns: { c: [1, 2] }, profileSource: {} };
  it('throws on length mismatch', () => {
    expect(() => buildProfileTimeSeries({ ...base, columns: { c: [1] } })).toThrow();
  });
  it('throws on non-finite values', () => {
    expect(() => buildProfileTimeSeries({ ...base, columns: { c: [1, NaN] } })).toThrow();
    expect(() => buildProfileTimeSeries({ ...base, columns: { c: [1, '2'] } })).toThrow();
    expect(() => buildProfileTimeSeries({ ...base, columns: { c: [1, Infinity] } })).toThrow();
  });
  it('throws on unsafe column names', () => {
    for (const bad of ['a,b', 'a"b', 'a:b', 'a b', 'a\nb']) {
      expect(() => buildProfileTimeSeries({ ...base, columns: { [bad]: [1, 2] } })).toThrow();
    }
  });
  it('sanitises the tech name for the file name', () => {
    expect(buildProfileTimeSeries({ ...base, techName: 'a b' }).fileName).toBe('profile_a_b.csv');
    expect(buildProfileTimeSeries({ ...base, techName: ' a/b! ' }).fileName).toBe('profile_a_b.csv');
  });
});

describe('restampToModelCalendar bad calendar', () => {
  it('throws on invalid or reversed dates', () => {
    const v = hourIndexYear(2025);
    expect(() => restampToModelCalendar(v, 2025, { startDate: 'nope', endDate: '2030-01-01' })).toThrow(/invalid model calendar/);
    expect(() => restampToModelCalendar(v, 2025, { startDate: '2030-01-02', endDate: '2030-01-01' })).toThrow(/invalid model calendar/);
    expect(() => restampToModelCalendar(v, 2025, {})).toThrow(/invalid model calendar/);
  });
});

describe('profileStaleness resolution', () => {
  it('compares resolutions by minutes, not raw strings', () => {
    const entry = { profileSource: { calendar: { startDate: '2030-01-01', endDate: '2030-01-02', resolution: '60min' }, points: {} } };
    const r = profileStaleness(entry, { modelConfig: { startDate: '2030-01-01', endDate: '2030-01-02', resolution: '1H' }, locations: [], techName: 't' });
    expect(r.stale).toBe(false);
  });
});

afterEach(() => vi.unstubAllGlobals());

const okResponse = (body) => ({ ok: true, text: async () => JSON.stringify(body) });

describe('otdb profile fetchers', () => {
  it('fetchTechProfiles hits /profiles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ embedded_profiles: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchTechProfiles('uuid-1');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/technologies\/uuid-1\/profiles$/);
  });
  it('fetchTechProfileValues returns tech-level values, else the instance profile with that id', async () => {
    const body = {
      generation_profile: null,
      instances: [{ generation_profile: { profile_id: 'tidal_stream_cf_2025', values: [0.1, 0.2] } }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(body)));
    expect(await fetchTechProfileValues('uuid-2', 'tidal_stream_cf_2025')).toEqual([0.1, 0.2]);
  });
});

describe('modelCalendar', () => {
  it('prefers subset_time params over metadata.subsetTime and modelConfig (Run.jsx order)', () => {
    const model = {
      metadata: { modelConfig: { startDate: '2025-01-01', endDate: '2025-01-07', resolution: '30min' }, subsetTime: ['2020-01-01', '2020-12-31'] },
      parameters: [{ key: 'subset_time_start', value: '2019-02-01 00:00' }, { key: 'subset_time_end', value: '2019-02-28' }],
    };
    expect(modelCalendar(model)).toEqual({
      startDate: '2019-01-01', endDate: '2019-12-31', resolution: '30min',
      window: { start: '2019-02-01', end: '2019-02-28' },
    });
  });
  it('then metadata.subsetTime (pair or bare year) over modelConfig', () => {
    const mc = { modelConfig: { startDate: '2025-01-01', endDate: '2025-01-07' } };
    expect(modelCalendar({ metadata: { ...mc, subsetTime: ['2020-03-01', '2020-03-31 23:00'] } }))
      .toEqual({ startDate: '2020-01-01', endDate: '2020-12-31', resolution: '60min', window: { start: '2020-03-01', end: '2020-03-31' } });
    expect(modelCalendar({ metadata: { subsetTime: 2021 } }))
      .toEqual({ startDate: '2021-01-01', endDate: '2021-12-31', resolution: '60min', window: { start: '2021-01-01', end: '2021-12-31' } });
  });
  it('falls back to metadata.modelConfig dates last, normalising them', () => {
    const model = { metadata: { modelConfig: { startDate: '2025-01-01T00:00', endDate: '2025-01-07 23:00', resolution: '15min' } } };
    expect(modelCalendar(model)).toEqual({
      startDate: '2025-01-01', endDate: '2025-12-31', resolution: '15min',
      window: { start: '2025-01-01', end: '2025-01-07' },
    });
  });
  it('widens a mid-year window to the full calendar year', () => {
    const cal = modelCalendar({ parameters: [{ key: 'subset_time_start', value: '2024-06-10' }, { key: 'subset_time_end', value: '2024-06-16' }] });
    expect([cal.startDate, cal.endDate]).toEqual(['2024-01-01', '2024-12-31']);
  });
  it('widens a window spanning two years to both full years', () => {
    const cal = modelCalendar({ metadata: { subsetTime: ['2024-12-01', '2025-01-31'] } });
    expect([cal.startDate, cal.endDate]).toEqual(['2024-01-01', '2025-12-31']);
    expect(cal.window).toEqual({ start: '2024-12-01', end: '2025-01-31' });
  });
  it('returns null when no dates are available', () => {
    expect(modelCalendar(null)).toBeNull();
    expect(modelCalendar({})).toBeNull();
    expect(modelCalendar({ metadata: { modelConfig: { startDate: '2025-01-01' } } })).toBeNull();
    expect(modelCalendar({ metadata: { modelConfig: { startDate: 'garbage', endDate: 'x' } } })).toBeNull();
  });
});

describe('profile naming', () => {
  it('sanitises the tech name into file name and column id', () => {
    expect(profileColumnId('nuclear_conventional')).toBe('nuclear_conventional');
    expect(profileColumnId('Gas turbine (OCGT)')).toBe('Gas_turbine_OCGT');
    expect(profileFileName('Gas turbine (OCGT)')).toBe('profile_Gas_turbine_OCGT.csv');
  });
  it('matches buildProfileTimeSeries', () => {
    const e = buildProfileTimeSeries({ modelId: 'm', techName: 'Gas turbine (OCGT)', datetimes: ['2025-01-01 00:00:00'], columns: { [profileColumnId('Gas turbine (OCGT)')]: [0.5] } });
    expect(e.fileName).toBe(profileFileName('Gas turbine (OCGT)'));
    expect(e.dataColumns).toEqual([profileColumnId('Gas turbine (OCGT)')]);
  });
  it('labels every kind', () => {
    for (const k of ['pv', 'wind', 'availability', 'capacity_factor']) expect(typeof PROFILE_KIND_LABEL[k]).toBe('string');
  });
});

describe('defaultPvOrientation', () => {
  it('faces the equator with a latitude-based tilt', () => {
    expect(defaultPvOrientation(-33.4)).toEqual({ tilt: 28, azimuth: 0 });
    expect(defaultPvOrientation(48.8)).toEqual({ tilt: 40, azimuth: 180 });
    expect(defaultPvOrientation(0)).toEqual({ tilt: 3, azimuth: 180 });
    expect(defaultPvOrientation(80).tilt).toBe(60);
  });
});

describe('pvPointKey', () => {
  const s = { weatherYear: 2023, tracking: 'fixed', losses: 0.1, dcAc: 1.2, tempCoeff: -0.004 };
  it('is equal for the same recipe and differs when any part changes', () => {
    expect(pvPointKey({ ...s }, -33.4, -70.6, 28, 0)).toBe(pvPointKey(s, -33.4, -70.6, 28, 0));
    expect(pvPointKey(s, -33.4, -70.6, 29, 0)).not.toBe(pvPointKey(s, -33.4, -70.6, 28, 0));
    expect(pvPointKey(s, -33.4, -70.6, 28, 10)).not.toBe(pvPointKey(s, -33.4, -70.6, 28, 0));
    expect(pvPointKey(s, -30, -70.6, 28, 0)).not.toBe(pvPointKey(s, -33.4, -70.6, 28, 0));
    expect(pvPointKey({ ...s, weatherYear: 2022 }, -33.4, -70.6, 28, 0)).not.toBe(pvPointKey(s, -33.4, -70.6, 28, 0));
  });
});

describe('pointColumnIds', () => {
  it('gives each location a unique safe column', () => {
    expect(pointColumnIds(['Santiago Centro', 'Santiago_Centro', 'Arica'])).toEqual({
      'Santiago Centro': 'Santiago_Centro', Santiago_Centro: 'Santiago_Centro_2', Arica: 'Arica',
    });
    expect(pointColumnIds(['ñ'])).toEqual({ 'ñ': 'point' });
  });

  it('never reuses the datetime column name', () => {
    expect(pointColumnIds(['datetime', 'A'])).toEqual({ datetime: 'datetime_2', A: 'A' });
  });
});

describe('profileStaleness moved points', () => {
  const entry = { profileSource: {
    calendar: { startDate: '2023-01-01', endDate: '2023-12-31', resolution: '60min' },
    points: { A: { column: 'A', lat: -33.4, lon: -70.6 }, B: { column: 'B' } },
  } };
  const mc = { startDate: '2023-01-01', endDate: '2023-12-31', resolution: '60min' };
  const locs = (latA) => [
    { name: 'A', latitude: latA, longitude: -70.6, techs: { pv: {} } },
    { name: 'B', latitude: 1, longitude: 1, techs: { pv: {} } },
  ];

  it('flags a point whose coordinates changed', () => {
    const s = profileStaleness(entry, { modelConfig: mc, locations: locs(-30), techName: 'pv' });
    expect(s.moved).toEqual(['A']);
    expect(s.reasons).toContain('moved');
    expect(s.stale).toBe(true);
  });

  it('ignores sub-metre jitter and points stored without coordinates', () => {
    const s = profileStaleness(entry, { modelConfig: mc, locations: locs(-33.40001), techName: 'pv' });
    expect(s).toEqual({ stale: false, reasons: [], missing: [], removed: [], moved: [] });
  });
});
