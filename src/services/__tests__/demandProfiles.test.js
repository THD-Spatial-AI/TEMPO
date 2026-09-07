import { describe, it, expect } from 'vitest';
import { generateHourlyDemand, DEMAND_PROFILES } from '../demandProfiles';

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
