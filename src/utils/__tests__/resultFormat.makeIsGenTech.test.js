import { describe, it, expect } from 'vitest';
import { makeIsGenTech } from '../resultFormat.js';

describe('makeIsGenTech', () => {
  it('uses tech_metadata parent (authoritative)', () => {
    const isGen = makeIsGenTech({
      tech_metadata: {
        solar_pv:     { parent: 'supply' },
        battery:      { parent: 'storage' },
        electrolyser: { parent: 'conversion' },
        power_demand: { parent: 'demand' },
        grid_link:    { parent: 'transmission' },
      },
    });
    expect(isGen('solar_pv')).toBe(true);
    expect(isGen('battery')).toBe(true);
    expect(isGen('electrolyser')).toBe(true);
    expect(isGen('power_demand')).toBe(false);
    expect(isGen('grid_link')).toBe(false);
  });

  it('treats transmission entries with a colon suffix as non-gen', () => {
    const isGen = makeIsGenTech({ tech_metadata: { ac: { parent: 'transmission' } } });
    expect(isGen('ac:north')).toBe(false);
    expect(isGen('solar_pv:north')).toBe(false); // colon → transmission entry regardless
  });

  it('falls back to flat tech_parents when tech_metadata is absent', () => {
    const isGen = makeIsGenTech({ tech_parents: { wind: 'supply', dem: 'demand' } });
    expect(isGen('wind')).toBe(true);
    expect(isGen('dem')).toBe(false);
  });

  it('uses name heuristics when no parent info is available', () => {
    const isGen = makeIsGenTech({});
    expect(isGen('solar_pv')).toBe(true);          // not demand/transmission → gen
    expect(isGen('power_demand')).toBe(false);     // name contains demand
    expect(isGen('unmet_demand')).toBe(false);
    expect(isGen('some_transmission')).toBe(false);
    expect(isGen('electricity_import')).toBe(false);
  });

  it('ignores a "nan" parent and falls through to heuristics', () => {
    const isGen = makeIsGenTech({ tech_metadata: { foo_demand: { parent: 'nan' } } });
    expect(isGen('foo_demand')).toBe(false); // heuristic catches "demand"
  });

  it('returns false for empty / falsy tech', () => {
    const isGen = makeIsGenTech({ tech_metadata: {} });
    expect(isGen('')).toBe(false);
    expect(isGen(undefined)).toBe(false);
  });
});
