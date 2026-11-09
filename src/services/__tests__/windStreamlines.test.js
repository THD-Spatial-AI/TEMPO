import { describe, it, expect } from 'vitest';
import { computeStreamlines, toTrips, speedColor, linePhase, TRAIL } from '../windStreamlines';

// n×n grid over [0, 1]° × [0, 1]° with one hour of u/v from f(lon, lat).
function field(f, n = 9) {
  const axis = Array.from({ length: n }, (_, i) => i / (n - 1));
  const u = axis.map(lat => axis.map(lon => f(lon, lat)[0]));
  const v = axis.map(lat => axis.map(lon => f(lon, lat)[1]));
  return { lats: axis, lons: axis, u: [u], v: [v] };
}
const BOX = { south: 0, west: 0, north: 1, east: 1 };
const seq = (s = 1) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe('computeStreamlines', () => {
  it('traces straight eastward lines in a uniform westerly, ordered downwind', async () => {
    const lines = await computeStreamlines(field(() => [8, 0]), 0, BOX).promise;
    expect(lines.length).toBeGreaterThan(10);
    for (const { path, speeds } of lines) {
      expect(path.length).toBeGreaterThanOrEqual(4);
      const lats = path.map(p => p[1]);
      expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(1e-9); // horizontal
      for (let i = 1; i < path.length; i++) expect(path[i][0]).toBeGreaterThan(path[i - 1][0]); // west → east
      expect(speeds.every(s => Math.abs(s - 8) < 1e-9)).toBe(true);
      expect(path.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
    }
    // Evenly spaced: distinct latitudes, about dSep (= 1/45 at the equator) apart.
    const ys = [...new Set(lines.map(l => l.path[0][1].toFixed(6)))].map(Number).sort((a, b) => a - b);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    expect(Math.min(...gaps)).toBeGreaterThan(0.5 / 45);
  });

  it('circles the centre of a rotational field at a constant radius, counter-clockwise', async () => {
    // Rotation about (0.5, 0.5): u = -(lat - 0.5), v = lon - 0.5.
    const grid = field((lon, lat) => [-(lat - 0.5) * 10, (lon - 0.5) * 10], 17);
    const lines = await computeStreamlines(grid, 0, BOX).promise;
    expect(lines.length).toBeGreaterThan(3);
    for (const { path } of lines) {
      const r = path.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5));
      expect(Math.max(...r) - Math.min(...r)).toBeLessThan(0.05 * Math.max(...r) + 0.01);
      const [[x0, y0], [x1, y1]] = path;
      expect((x0 - 0.5) * (y1 - y0) - (y0 - 0.5) * (x1 - x0)).toBeGreaterThan(0);
    }
  });

  it('stops at maxLines', async () => {
    const lines = await computeStreamlines(field(() => [5, 5]), 0, BOX, { maxLines: 3 }).promise;
    expect(lines).toHaveLength(3);
  });

  it('resolves to no lines for a zero-width or zero-height box instead of throwing', async () => {
    const g = field(() => [5, 0]);
    expect(await computeStreamlines(g, 0, { ...BOX, east: 0 }).promise).toEqual([]);
    expect(await computeStreamlines(g, 0, { ...BOX, north: 0 }).promise).toEqual([]);
  });

  it('dispose stops a run so its promise never settles', async () => {
    const run = computeStreamlines(field(() => [5, 0]), 0, BOX);
    run.dispose();
    const r = await Promise.race([run.promise, new Promise(res => setTimeout(() => res('pending'), 50))]);
    expect(r).toBe('pending');
  });
});

describe('toTrips', () => {
  const line = (n, speed) => ({ path: Array.from({ length: n }, (_, i) => [i * 0.01, 0]), speeds: Array(n).fill(speed) });
  const dur = t => t.timestamps[t.timestamps.length - 1] - t.timestamps[0];

  it('times trips by travel time (faster wind → shorter trip) with the loop period normalised to 1', () => {
    const trips = toTrips([line(11, 10), line(11, 5)], () => 0);
    const fast = trips.find(t => t.color[3] > 200 && t.timestamps[0] === 0);
    const slow = trips.find(t => t.color[3] < 200 && t.timestamps[0] === 0);
    expect(dur(slow)).toBeCloseTo(1); // T = 95th percentile = the slower of two
    expect(dur(fast)).toBeCloseTo(0.5);
    expect(fast.timestamps.every((t, i, a) => i === 0 || t > a[i - 1])).toBe(true);
  });

  it('repeats each line at offsets −1, −2, … while a copy can be visible, so the loop wraps', () => {
    const lines = Array.from({ length: 20 }, (_, i) => line(5 + i, 3 + i / 2));
    const trips = toTrips(lines, seq(7));
    expect(trips.length).toBeGreaterThan(lines.length);
    for (const l of lines) {
      const copies = trips.filter(t => t.path === l.path).sort((a, b) => b.timestamps[0] - a.timestamps[0]);
      const first = copies[0].timestamps;
      expect(first[0]).toBeGreaterThanOrEqual(0);
      expect(first[0]).toBeLessThan(1);
      copies.forEach((c, k) => {
        expect(c.timestamps[0]).toBeCloseTo(first[0] - k);
        expect(c.timestamps[c.timestamps.length - 1]).toBeGreaterThanOrEqual(-TRAIL);
      });
      // one more copy would end before the visible window [−TRAIL, 1)
      expect(first[first.length - 1] - copies.length).toBeLessThan(-TRAIL);
    }
  });

  it('gives each line a stable phase from its first point (no jump on recompute)', () => {
    const a = line(11, 6);
    const b = { path: a.path.map(p => [...p]), speeds: [...a.speeds] }; // same line, recomputed
    expect(linePhase(a)).toBe(linePhase(b));
    expect(linePhase(a)).toBeGreaterThanOrEqual(0);
    expect(linePhase(a)).toBeLessThan(1);
    expect(toTrips([a])[0].timestamps).toEqual(toTrips([b])[0].timestamps);
    expect(linePhase({ path: [[-70.5, -33.2]] })).not.toBe(linePhase({ path: [[-70.4, -33.2]] }));
  });

  it('returns no trips for no lines or zero-length lines', () => {
    expect(toTrips([])).toEqual([]);
    expect(toTrips([{ path: [[0, 0], [0, 0]], speeds: [1, 1] }])).toEqual([]);
  });
});

describe('speedColor', () => {
  it('ramps from dim blue-white at 2 m/s to bright white at 14 m/s', () => {
    expect(speedColor(0)).toEqual([120, 160, 220, 120]);
    expect(speedColor(2)).toEqual([120, 160, 220, 120]);
    expect(speedColor(14)).toEqual([255, 255, 255, 255]);
    expect(speedColor(30)).toEqual([255, 255, 255, 255]);
    expect(speedColor(8)[3]).toBeGreaterThan(120);
    expect(speedColor(8)[3]).toBeLessThan(255);
  });
});
