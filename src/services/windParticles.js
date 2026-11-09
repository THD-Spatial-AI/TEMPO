/**
 * windParticles.js — bilinear sampling of the wind grid (used by windStreamlines).
 * grid = { lats[n], lons[n], u[24][n][n], v[24][n][n] } (m/s, rows = lats).
 */

function cellPos(axis, x) {
  const n = axis.length;
  if (x < axis[0] || x > axis[n - 1]) return null;
  const f = ((x - axis[0]) / (axis[n - 1] - axis[0])) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  return [i, f - i];
}

/** Bilinear [u, v] at (lon, lat) for hour h, or null outside the grid. */
export function sampleUV(grid, h, lon, lat) {
  const cx = cellPos(grid.lons, lon);
  const cy = cellPos(grid.lats, lat);
  if (!cx || !cy) return null;
  const [i, fx] = cx;
  const [j, fy] = cy;
  const lerp2 = (m) => {
    const a = m[j][i] * (1 - fx) + m[j][i + 1] * fx;
    const b = m[j + 1][i] * (1 - fx) + m[j + 1][i + 1] * fx;
    return a * (1 - fy) + b * fy;
  };
  return [lerp2(grid.u[h]), lerp2(grid.v[h])];
}
