import { describe, it, expect } from 'vitest';
import { ghiColor, sunshinePixels } from '../sunshineRaster';

const hours = (f) => Array.from({ length: 24 }, (_, h) => f(h));
// 2 lats × 3 lons; rows = lats ascending (south row first), like the service.
const grid = (ghi, lats = [0, 1], lons = [0, 1, 2]) => ({ lats, lons, date: '2026-11-02', ghi });
const px = ({ data, width }, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

describe('ghiColor', () => {
  it('is transparent at night and rises in alpha from dawn orange to near white', () => {
    expect(ghiColor(0)).toEqual([0, 0, 0, 0]);
    expect(ghiColor(-3)).toEqual([0, 0, 0, 0]);
    expect(ghiColor(NaN)).toEqual([0, 0, 0, 0]);
    expect(ghiColor(150)).toEqual([255, 140, 40, 110]);
    expect(ghiColor(500)).toEqual([255, 205, 80, 165]);
    expect(ghiColor(900)).toEqual([255, 248, 225, 205]);
    expect(ghiColor(1100)).toEqual([255, 248, 225, 205]);
    const a = [50, 150, 300, 500, 700, 900].map(g => ghiColor(g)[3]);
    expect(a.every((v, i) => i === 0 || v > a[i - 1])).toBe(true);
  });
});

describe('sunshinePixels', () => {
  it('upsamples to ≤ maxPx on the long side, keeping the lon/lat aspect', () => {
    const g = grid(hours(() => [[100, 100, 100], [100, 100, 100]]));
    const img = sunshinePixels(g, 12, 256);
    expect([img.width, img.height]).toEqual([256, 128]);
    expect(img.data).toBeInstanceOf(Uint8ClampedArray);
    expect(img.data.length).toBe(256 * 128 * 4);
  });

  it('puts the north row at the top and interpolates bilinearly between nodes', () => {
    const g = grid(hours(() => [[0, 0, 0], [900, 900, 900]])); // south dark, north bright
    const img = sunshinePixels(g, 12, 64);
    expect(px(img, 10, 0)[3]).toBeGreaterThan(195); // top ≈ 900 W/m²
    expect(px(img, 10, img.height - 1)[3]).toBeLessThan(20); // bottom ≈ 0
    const col = Array.from({ length: img.height }, (_, y) => px(img, 10, y)[3]);
    expect(col.every((v, i) => i === 0 || v <= col[i - 1])).toBe(true); // smooth fade southwards
  });

  it('is fully transparent at night', () => {
    const g = grid(hours(h => (h >= 6 && h <= 18 ? [[500, 500, 500], [500, 500, 500]] : [[0, 0, 0], [0, 0, 0]])));
    const img = sunshinePixels(g, 2, 32);
    expect(img.data.every(v => v === 0)).toBe(true);
  });

  it('interpolates linearly between hours for a fractional hour', () => {
    const g = grid(hours(h => (h === 10 ? [[0, 0, 0], [0, 0, 0]] : [[500, 500, 500], [500, 500, 500]])));
    expect(px(sunshinePixels(g, 8.5, 16), 5, 5)).toEqual(ghiColor(500)); // 500 → 500
    expect(px(sunshinePixels(g, 9.5, 16), 5, 5)).toEqual(ghiColor(250)); // 500 → 0
    expect(px(sunshinePixels(g, 10.75, 16), 5, 5)).toEqual(ghiColor(375)); // 0 → 500
    // no wrap: 23:30 stays at hour 23, it does not blend into hour 0 of the same date
    const late = grid(hours(h => (h === 23 ? [[500, 500, 500], [500, 500, 500]] : [[0, 0, 0], [0, 0, 0]])));
    expect(px(sunshinePixels(late, 23.5, 16), 5, 5)).toEqual(ghiColor(500));
  });
});
