import { describe, it, expect } from 'vitest';
import { buildResultContext, buildResultContextString, summarizeResult, estimateTokens } from '../aiContext.js';

const makeResult = () => ({
  framework: 'calliope',
  objective: 1234.5,
  termination_condition: 'optimal',
  capacities: { 'A::solar': 100, 'A::gas': 5, 'B::wind': 50, 'B::gas': 2, 'C::coal': 1 },
  generation: { 'A::solar': 900, 'A::gas': 10 },
  costs_by_tech: { solar: 500, gas: 50 },
  costs_by_location: {
    A: { solar: 400, gas: 20 },
    B: { wind: 300 },
    C: { coal: 5 },
  },
  tech_metadata: { solar: { parent: 'supply' } },
  timestamps: ['2025-01-01T00:00', '2025-01-01T01:00', '2025-01-01T02:00', '2025-01-01T03:00'],
  dispatch: { solar: [1, 2, 3, 4], gas: [0, 1, 0, 1] },
  demand_timeseries: [1, 3, 3, 5],
  transmission_flow: { 'A::B': { from: 'A', to: 'B', timeseries: [10, 20, 30, 40] } },
  shadow_prices: { 'electricity::A': [1, 1, 1, 1] },
});

describe('estimateTokens', () => {
  it('is roughly chars/4 and monotonic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('a'.repeat(800))).toBeGreaterThan(estimateTokens('a'.repeat(400)));
  });
  it('handles null/undefined', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
});

describe('buildResultContext', () => {
  it('returns {} for missing result', () => {
    expect(buildResultContext(null)).toEqual({});
    expect(buildResultContext(undefined)).toEqual({});
  });

  it('includes full contract by default and summarizes timestamps', () => {
    const ctx = buildResultContext(makeResult());
    expect(ctx.framework).toBe('calliope');
    expect(ctx.objective).toBe(1234.5);
    expect(Object.keys(ctx.capacities)).toHaveLength(5);
    expect(ctx.timesteps).toBe(4);
    expect(ctx.time_range).toEqual(['2025-01-01T00:00', '2025-01-01T03:00']);
    // full timestamp array is NOT forwarded (token waste)
    expect(ctx.timestamps).toBeUndefined();
    expect(ctx.dispatch.solar).toEqual([1, 2, 3, 4]);
    expect(ctx.shadow_prices).toBeDefined();
  });

  it('caps capacities/generation to the top-N by value', () => {
    const ctx = buildResultContext(makeResult(), { topNKeys: 2 });
    expect(Object.keys(ctx.capacities)).toEqual(['A::solar', 'B::wind']); // 100, 50 win
    expect(ctx.capacities['C::coal']).toBeUndefined();
  });

  it('caps costs_by_location to top-N locations by summed cost', () => {
    const ctx = buildResultContext(makeResult(), { topNKeys: 2 });
    // A=420, B=300, C=5 → keep A and B
    expect(Object.keys(ctx.costs_by_location).sort()).toEqual(['A', 'B']);
  });

  it('downsamples dispatch and timeseries by stride', () => {
    const ctx = buildResultContext(makeResult(), { dispatchStride: 2 });
    expect(ctx.dispatch.solar).toEqual([1, 3]);
    expect(ctx.demand_timeseries).toEqual([1, 3]);
    expect(ctx.transmission_flow['A::B'].timeseries).toEqual([10, 30]);
    expect(ctx.dispatch_stride).toBe(2);
  });

  it('drops dispatch and timeseries when excluded', () => {
    const ctx = buildResultContext(makeResult(), { includeDispatch: false, includeTimeseries: false });
    expect(ctx.dispatch).toBeUndefined();
    expect(ctx.demand_timeseries).toBeUndefined();
    expect(ctx.transmission_flow).toBeUndefined();
  });

  it('drops shadow prices when excluded', () => {
    const ctx = buildResultContext(makeResult(), { includeShadowPrices: false });
    expect(ctx.shadow_prices).toBeUndefined();
  });

  it('falls back to tech_parents when tech_metadata absent', () => {
    const r = makeResult();
    delete r.tech_metadata;
    r.tech_parents = { solar: 'supply' };
    const ctx = buildResultContext(r);
    expect(ctx.tech_parents).toEqual({ solar: 'supply' });
  });

  it('produces valid JSON and capping shrinks it', () => {
    const full = buildResultContextString(makeResult());
    const capped = buildResultContextString(makeResult(), { topNKeys: 1, includeDispatch: false, includeTimeseries: false, includeShadowPrices: false });
    expect(() => JSON.parse(full)).not.toThrow();
    expect(capped.length).toBeLessThan(full.length);
  });
});

describe('summarizeResult', () => {
  it('returns empty string for missing result', () => {
    expect(summarizeResult(null)).toBe('');
    expect(summarizeResult(undefined)).toBe('');
  });

  it('aggregates capacity/generation and computes shares from loc::tech keys', () => {
    const s = summarizeResult(makeResult());
    // 3 locations (A, B, C), transmission excluded from capByTech
    expect(s).toMatch(/Locations with capacity: 3/);
    // solar cap 100 of total 158 ≈ 63.3%
    expect(s).toMatch(/solar: 100/);
    expect(s).toMatch(/Generation mix/);
    expect(s).toMatch(/Renewable share:/);
    expect(s).toMatch(/Costs \(total/);
    expect(s).toMatch(/LCOE/);
  });

  it('excludes transmission keys from generation/storage capacity', () => {
    const r = makeResult();
    r.capacities = { 'A::solar': 10, 'A::ac_transmission:B': 99 };
    const s = summarizeResult(r);
    expect(s).toMatch(/solar: 10/);
    expect(s).toMatch(/Transmission/);
    // total gen/storage capacity should be 10, not 109
    expect(s).toMatch(/Installed capacity by technology \(total 10\)/);
  });

  it('reports demand peak/mean', () => {
    const s = summarizeResult(makeResult());
    expect(s).toMatch(/Peak demand: 5/);
  });
});
