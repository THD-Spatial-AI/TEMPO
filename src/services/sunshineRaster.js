/**
 * sunshineRaster.js — hourly sunshine glow (S4): GHI grid → upsampled RGBA pixels.
 * grid = { lats[n], lons[m], ghi[24][n][m] } (W/m², rows = lats ascending, evenly spaced).
 * Pure (no canvas): the hook wraps the pixels in an ImageData for a BitmapLayer whose
 * bounds are the grid extent [west, south, east, north].
 */

// [GHI W/m², [r, g, b, a]]: transparent at night, dawn orange, warm yellow, near white.
const STOPS = [
  [0, [255, 120, 30, 0]],
  [150, [255, 140, 40, 110]],
  [500, [255, 205, 80, 165]],
  [900, [255, 248, 225, 205]],
];

/** RGBA for one GHI value; 0 (night), negative or NaN → fully transparent. */
export function ghiColor(ghi) {
  if (!(ghi > 0)) return [0, 0, 0, 0];
  for (let i = 1; i < STOPS.length; i++) {
    const [x1, c1] = STOPS[i];
    if (ghi <= x1) {
      const [x0, c0] = STOPS[i - 1];
      const f = (ghi - x0) / (x1 - x0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    }
  }
  return [...STOPS[STOPS.length - 1][1]];
}

// Per-W/m² lookup (0..LUT_MAX), so a frame does not allocate a colour per pixel.
const LUT_MAX = 1200;
let lut = null;
function lutColor(ghi) {
  if (!lut) {
    lut = new Uint8ClampedArray((LUT_MAX + 1) * 4);
    for (let g = 0; g <= LUT_MAX; g++) lut.set(ghiColor(g), g * 4);
  }
  return ghi > 0 ? Math.min(LUT_MAX, Math.round(ghi)) * 4 : 0;
}

/** The n×m field at fractional hour `t` (linear between floor(t) and the next hour;
 * hour 23 is not blended into hour 0, which is the start of the same date). */
function fieldAt(ghi, t) {
  const hours = ghi.length;
  const h0 = ((Math.floor(t) % hours) + hours) % hours;
  const h1 = Math.min(h0 + 1, hours - 1);
  const w = t - Math.floor(t);
  if (w === 0) return ghi[h0];
  return ghi[h0].map((row, j) => row.map((v, i) => v * (1 - w) + ghi[h1][j][i] * w));
}

/**
 * Pixels for fractional hour `t`, bilinearly upsampled to ≤ `maxPx` on the long side
 * (aspect from the lon/lat extent). Row 0 is the north edge.
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
 */
export function sunshinePixels(grid, t, maxPx = 256) {
  const f = fieldAt(grid.ghi, t);
  const ny = grid.lats.length;
  const nx = grid.lons.length;
  const dx = Math.abs(grid.lons[nx - 1] - grid.lons[0]);
  const dy = Math.abs(grid.lats[ny - 1] - grid.lats[0]);
  const long = Math.max(dx, dy) || 1;
  const width = Math.max(2, Math.round((maxPx * dx) / long));
  const height = Math.max(2, Math.round((maxPx * dy) / long));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) {
    const gy = (1 - (py + 0.5) / height) * (ny - 1); // north at the top
    const j = Math.min(ny - 2, Math.floor(gy));
    const fy = gy - j;
    for (let px = 0; px < width; px++) {
      const gx = ((px + 0.5) / width) * (nx - 1);
      const i = Math.min(nx - 2, Math.floor(gx));
      const fx = gx - i;
      const a = f[j][i] * (1 - fx) + f[j][i + 1] * fx;
      const b = f[j + 1][i] * (1 - fx) + f[j + 1][i + 1] * fx;
      const k = lutColor(a * (1 - fy) + b * fy);
      const o = (py * width + px) * 4;
      data[o] = lut[k]; data[o + 1] = lut[k + 1]; data[o + 2] = lut[k + 2]; data[o + 3] = lut[k + 3];
    }
  }
  return { data, width, height };
}
