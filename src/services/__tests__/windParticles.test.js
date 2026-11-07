import { describe, it, expect } from 'vitest';
import { sampleUV, createParticles, stepParticles } from '../windParticles';

const grid = { lats: [0, 1], lons: [0, 1], u: [[[1, 1], [1, 1]]], v: [[[0, 0], [2, 2]]] };

describe('windParticles', () => {
  it('bilinearly samples u/v and returns null outside the grid', () => {
    expect(sampleUV(grid, 0, 0.5, 0.5)).toEqual([1, 1]);
    expect(sampleUV(grid, 0, 0, 0)).toEqual([1, 0]);
    expect(sampleUV(grid, 0, 2, 0.5)).toBeNull();
  });

  it('creates particles inside the bounds with deterministic rng', () => {
    let s = 1; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const ps = createParticles(50, { south: 0, west: 0, north: 1, east: 1 }, rng);
    expect(ps).toHaveLength(50);
    expect(ps.every(p => p.lon >= 0 && p.lon <= 1 && p.lat >= 0 && p.lat <= 1 && p.trail.length === 1)).toBe(true);
  });

  it('moves particles downwind and keeps an 8-point trail', () => {
    const ps = [{ lon: 0.2, lat: 0.5, age: 0, maxAge: 100, trail: [[0.2, 0.5]] }];
    let next = ps;
    for (let i = 0; i < 12; i++) next = stepParticles(next, grid, 0, { south: 0, west: 0, north: 1, east: 1 }, 0.01, () => 0.5);
    expect(next[0].lon).toBeGreaterThan(0.2); // u > 0 → east
    expect(next[0].trail.length).toBe(8);
  });

  it('respawns particles that leave the grid or age out', () => {
    const ps = [{ lon: 0.999, lat: 0.5, age: 0, maxAge: 100, trail: [[0.999, 0.5]] },
      { lon: 0.5, lat: 0.5, age: 100, maxAge: 100, trail: [[0.5, 0.5]] }];
    const next = stepParticles(ps, grid, 0, { south: 0, west: 0, north: 1, east: 1 }, 0.5, () => 0.25);
    expect(next.every(p => p.age === 0 && p.trail.length === 1)).toBe(true);
  });
});
