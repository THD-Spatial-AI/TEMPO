import { describe, it, expect } from 'vitest';
import {
  generateHourlyDemand, generateDemandShape, DEMAND_PROFILES,
  syntheticKeyForSlp, buildBlendedProfile, buildDemandColumns,
  SLP_CATALOGUE, SLP_TO_SYNTHETIC,
} from '../demandProfiles';

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

describe('generateHourlyDemand', () => {
  it('emits one value per hour across the inclusive day range', () => {
    const { datetimes, values } = generateHourlyDemand({
      startDate: '2024-01-01', endDate: '2024-01-02', profileKey: 'mixed', annualMWh: 8760,
    });
    expect(values).toHaveLength(48);
    expect(datetimes).toHaveLength(48);
    expect(datetimes[0]).toBe('2024-01-01 00:00:00');
    expect(datetimes[47]).toBe('2024-01-02 23:00:00');
  });

  it('scales so the mean power equals annualMWh / 8760', () => {
    const { values } = generateHourlyDemand({
      startDate: '2024-01-01', endDate: '2024-12-31', profileKey: 'residential', annualMWh: 8760,
    });
    // annual 8760 MWh over 8760 h → 1 MW average.
    expect(mean(values)).toBeCloseTo(1, 2);
  });

  it('flat profile is constant', () => {
    const { values } = generateHourlyDemand({
      startDate: '2024-01-01', endDate: '2024-01-07', profileKey: 'flat', annualMWh: 8760,
    });
    expect(Math.max(...values) - Math.min(...values)).toBeCloseTo(0, 6);
  });

  it('residential evening peak exceeds the small hours', () => {
    const { values } = generateHourlyDemand({
      startDate: '2024-06-03', endDate: '2024-06-03', profileKey: 'residential', annualMWh: 8760, // a Monday
    });
    expect(values[19]).toBeGreaterThan(values[3]); // 19:00 > 03:00
  });

  it('northern winter demand exceeds summer; hemisphere flips it', () => {
    const jan = generateHourlyDemand({ startDate: '2024-01-15', endDate: '2024-01-15', profileKey: 'residential', annualMWh: 8760, latitude: 52 });
    const jul = generateHourlyDemand({ startDate: '2024-07-15', endDate: '2024-07-15', profileKey: 'residential', annualMWh: 8760, latitude: 52 });
    expect(mean(jan.values)).toBeGreaterThan(mean(jul.values));

    const janS = generateHourlyDemand({ startDate: '2024-01-15', endDate: '2024-01-15', profileKey: 'residential', annualMWh: 8760, latitude: -33 });
    const julS = generateHourlyDemand({ startDate: '2024-07-15', endDate: '2024-07-15', profileKey: 'residential', annualMWh: 8760, latitude: -33 });
    expect(mean(julS.values)).toBeGreaterThan(mean(janS.values));
  });

  it('returns empty for an invalid range', () => {
    expect(generateHourlyDemand({ startDate: 'nope', endDate: 'nope' }).values).toHaveLength(0);
  });

  it('exposes the expected profile presets', () => {
    expect(Object.keys(DEMAND_PROFILES)).toEqual(
      expect.arrayContaining(['flat', 'residential', 'commercial', 'industrial', 'mixed']),
    );
  });
});

describe('syntheticKeyForSlp', () => {
  it('maps every catalogued SLP code to a valid synthetic profile', () => {
    for (const { code } of SLP_CATALOGUE) {
      const key = syntheticKeyForSlp(code);
      expect(DEMAND_PROFILES[key], `${code} → ${key}`).toBeDefined();
    }
  });

  it('routes the documented codes to their nearest synthetic twin', () => {
    expect(syntheticKeyForSlp('h0')).toBe('residential');
    expect(syntheticKeyForSlp('h0_dyn')).toBe('residential');
    expect(syntheticKeyForSlp('g0')).toBe('commercial');
    expect(syntheticKeyForSlp('g3')).toBe('industrial');
    expect(syntheticKeyForSlp('l0')).toBe('mixed');
    expect(syntheticKeyForSlp('flat')).toBe('flat');
  });

  it('falls back to mixed for unknown codes', () => {
    expect(syntheticKeyForSlp('zzz')).toBe('mixed');
  });

  it('the mapping and catalogue stay in sync', () => {
    for (const { code } of SLP_CATALOGUE) {
      expect(SLP_TO_SYNTHETIC[code], `catalogue code ${code} missing from map`).toBeDefined();
    }
  });
});

describe('buildBlendedProfile', () => {
  it('blends daily curves by weight and normalises the weights', () => {
    const pure = buildBlendedProfile({ residential: 1 });
    expect(pure.daily).toEqual(DEMAND_PROFILES.residential.daily);
    // Unnormalised weights blend the same as normalised ones.
    const a = buildBlendedProfile({ residential: 1, commercial: 1 });
    const b = buildBlendedProfile({ residential: 50, commercial: 50 });
    expect(a.daily).toEqual(b.daily);
    // A 50/50 residential+commercial blend sits between the two at every hour.
    for (let h = 0; h < 24; h++) {
      const lo = Math.min(DEMAND_PROFILES.residential.daily[h], DEMAND_PROFILES.commercial.daily[h]);
      const hi = Math.max(DEMAND_PROFILES.residential.daily[h], DEMAND_PROFILES.commercial.daily[h]);
      expect(a.daily[h]).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(a.daily[h]).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('treats flat sectors as a constant contribution and empty input as flat', () => {
    expect(buildBlendedProfile({}).daily.every(v => v === 1)).toBe(true);
    expect(buildBlendedProfile({ flat: 1 }).daily.every(v => v === 1)).toBe(true);
  });
});

describe('generateDemandShape (resolution + blend)', () => {
  it('emits the right count per resolution over one day', () => {
    const day = { start: '2024-03-04', end: '2024-03-04', sectors: { mixed: 1 }, annualMWh: 8760 };
    expect(generateDemandShape({ ...day, resolution: '60min' }).values).toHaveLength(24);
    expect(generateDemandShape({ ...day, resolution: '30min' }).values).toHaveLength(48);
    expect(generateDemandShape({ ...day, resolution: '15min' }).values).toHaveLength(96);
  });

  it('stamps sub-hourly datetimes correctly', () => {
    const { datetimes } = generateDemandShape({
      start: '2024-03-04', end: '2024-03-04', resolution: '15min', sectors: { flat: 1 }, annualMWh: 8760,
    });
    expect(datetimes[0]).toBe('2024-03-04 00:00:00');
    expect(datetimes[1]).toBe('2024-03-04 00:15:00');
    expect(datetimes[95]).toBe('2024-03-04 23:45:00');
  });

  it('keeps average power at annualMWh/8760 regardless of resolution', () => {
    for (const resolution of ['60min', '30min', '15min']) {
      const { values } = generateDemandShape({
        start: '2024-01-01', end: '2024-12-31', resolution, sectors: { residential: 1 }, annualMWh: 8760,
      });
      expect(mean(values), resolution).toBeCloseTo(1, 2);
    }
  });

  it('matches the hourly wrapper for a single sector at 60min', () => {
    const viaShape = generateDemandShape({
      start: '2024-06-03', end: '2024-06-03', resolution: '60min', sectors: { commercial: 1 }, annualMWh: 8760,
    });
    const viaWrapper = generateHourlyDemand({
      startDate: '2024-06-03', endDate: '2024-06-03', profileKey: 'commercial', annualMWh: 8760,
    });
    expect(viaShape.values).toEqual(viaWrapper.values);
  });

  it('returns empty for an invalid range', () => {
    expect(generateDemandShape({ start: 'nope', end: 'nope', sectors: { mixed: 1 } }).values).toHaveLength(0);
  });
});

describe('buildDemandColumns', () => {
  const datetimes = ['2024-01-01 00:00:00', '2024-01-01 01:00:00'];
  const values = [1.0, 2.0]; // normalised shape

  it('collapses equal magnitudes to a single shared column (even split)', () => {
    const r = buildDemandColumns({ datetimes, values, magnitudes: [5, 5, 5] });
    expect(r.dataColumns).toEqual(['dem_1']);
    expect(r.colBySub).toEqual(['dem_1', 'dem_1', 'dem_1']);
    expect(r.columns).toEqual(['datetime', 'dem_1']);
  });

  it('emits one column per distinct magnitude (voltage split)', () => {
    const r = buildDemandColumns({ datetimes, values, magnitudes: [5, 10, 5, 20] });
    expect(r.dataColumns).toEqual(['dem_1', 'dem_2', 'dem_3']);
    expect(r.colBySub).toEqual(['dem_1', 'dem_2', 'dem_1', 'dem_3']);
  });

  it('writes absolute NEGATIVE MW = shape × magnitude', () => {
    const r = buildDemandColumns({ datetimes, values, magnitudes: [5] });
    expect(r.data[0]).toEqual({ datetime: datetimes[0], dem_1: -5 });   // 1.0 × 5
    expect(r.data[1]).toEqual({ datetime: datetimes[1], dem_1: -10 });  // 2.0 × 5
  });

  it('groups by rounded (3 sig-fig) magnitude', () => {
    // 5.001 and 5.002 round to the same key at 3 sig figs → one column.
    const r = buildDemandColumns({ datetimes, values, magnitudes: [5.001, 5.002] });
    expect(r.dataColumns).toEqual(['dem_1']);
  });
});
