/**
 * windParticles.js — pure CPU particle advection for the wind-flow overlay (V6).
 * grid = { lats[n], lons[n], u[24][n][n], v[24][n][n] } (m/s, rows = lats).
 */
const TRAIL = 8;

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

function spawn(bounds, rng) {
  const lon = bounds.west + rng() * (bounds.east - bounds.west);
  const lat = bounds.south + rng() * (bounds.north - bounds.south);
  return { lon, lat, age: 0, maxAge: 60 + Math.floor(rng() * 60), trail: [[lon, lat]] };
}

export function createParticles(count, bounds, rng = Math.random) {
  return Array.from({ length: count }, () => spawn(bounds, rng));
}

/** One animation step. `scale` = degrees moved per (m/s) per frame (zoom-dependent). */
export function stepParticles(particles, grid, h, bounds, scale, rng = Math.random) {
  return particles.map((p) => {
    const uv = p.age >= p.maxAge ? null : sampleUV(grid, h, p.lon, p.lat);
    if (!uv) return spawn(bounds, rng);
    const [u, v] = uv;
    const cos = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
    const lon = p.lon + (u * scale) / cos;
    const lat = p.lat + v * scale;
    if (!sampleUV(grid, h, lon, lat)) return spawn(bounds, rng);
    const trail = [...p.trail, [lon, lat]].slice(-TRAIL);
    return { ...p, lon, lat, age: p.age + 1, trail };
  });
}
