/**
 * windStreamlines.js — evenly spaced wind streamlines (S1) and their TripsLayer timing (S2).
 * grid = { lats[n], lons[n], u[24][n][n], v[24][n][n] } (m/s, rows = lats ascending).
 * Lines come from @anvaka/streamlines (MIT) in a local equirectangular frame
 * (x = lon·cos(lat₀), y = lat); the library integrates the unit direction, and the
 * speed is sampled separately per point for colour and timing.
 */
import streamlines from '@anvaka/streamlines';
import { sampleUV } from './windParticles';

const KM_PER_DEG = 111.32;
const MIN_SPEED = 0.5; // m/s floor for timing, so calm segments do not stall a trip
export const MAX_LINES = 800;
export const TRAIL = 0.35; // trail length as a fraction of the loop period

const speedAt = (grid, h, lon, lat) => {
  const uv = sampleUV(grid, h, lon, lat);
  return uv ? Math.hypot(uv[0], uv[1]) : 0;
};

// Seed: the windiest of a 5×5 sample of the box (a calm seed would end the run at once).
function seedPoint(grid, h, bbox) {
  let best = null;
  for (let a = 0.1; a < 1; a += 0.2) {
    for (let b = 0.1; b < 1; b += 0.2) {
      const lon = bbox.west + a * (bbox.east - bbox.west);
      const lat = bbox.south + b * (bbox.north - bbox.south);
      const s = speedAt(grid, h, lon, lat);
      if (!best || s > best.s) best = { lon, lat, s };
    }
  }
  return best;
}

/**
 * Streamlines of hour `h` inside `bbox` ({south, west, north, east}, within the grid).
 * @returns {{ promise: Promise<Array<{path:number[][], speeds:number[]}>>, dispose: Function }}
 *   `dispose` stops a run in progress; its promise then never resolves.
 */
export function computeStreamlines(grid, h, bbox, { maxLines = MAX_LINES } = {}) {
  if (!(bbox.east > bbox.west && bbox.north > bbox.south)) return { promise: Promise.resolve([]), dispose: () => {} };
  const cos = Math.max(0.2, Math.cos((((bbox.south + bbox.north) / 2) * Math.PI) / 180));
  const width = (bbox.east - bbox.west) * cos;
  const dSep = width / 45;
  const seed = seedPoint(grid, h, bbox);
  const lines = [];
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  const finish = () => resolve(lines);
  const run = streamlines({
    vectorField: (p) => {
      const uv = sampleUV(grid, h, p.x / cos, p.y);
      return uv ? { x: uv[0], y: uv[1] } : undefined;
    },
    boundingBox: { left: bbox.west * cos, top: bbox.south, width, height: bbox.north - bbox.south },
    seed: { x: seed.lon * cos, y: seed.lat },
    dSep,
    dTest: dSep / 2,
    timeStep: dSep / 8,
    forwardOnly: false,
    onStreamlineAdded: (points) => {
      if (lines.length >= maxLines || points.length < 4) return;
      const path = points.map(p => [p.x / cos, p.y]);
      lines.push({ path, speeds: path.map(([lon, lat]) => speedAt(grid, h, lon, lat)) });
      if (lines.length >= maxLines) { run.dispose(); finish(); }
    },
  });
  run.run()?.then(finish);
  return { promise, dispose: () => run.dispose() };
}

const RAMP_LO = [120, 160, 220, 120]; // 2 m/s: dim blue-white
const RAMP_HI = [255, 255, 255, 255]; // 14 m/s: bright white

/** winvelviz-like colour for a mean wind speed (m/s). */
export function speedColor(speed) {
  const f = Math.min(1, Math.max(0, (speed - 2) / 12));
  return RAMP_LO.map((lo, i) => Math.round(lo + (RAMP_HI[i] - lo) * f));
}

/** Cumulative travel time along a line: segment length (km) / mean speed (m/s); units cancel in the loop. */
function travelTimes({ path, speeds }) {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    const c = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const km = Math.hypot((x1 - x0) * c, y1 - y0) * KM_PER_DEG;
    out.push(out[i - 1] + km / Math.max(MIN_SPEED, (speeds[i - 1] + speeds[i]) / 2));
  }
  return out;
}

/**
 * Stable phase in [0, 1) from a line's first point, so the pulses do not jump when the lines
 * are recomputed for the next hour or a small pan (similar lines start near the same point).
 */
export function linePhase({ path }) {
  const [lon, lat] = path[0];
  const x = Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * TripsLayer data for streamlines, with timestamps normalised so the loop period T = 1
 * (T = 95th percentile of trip durations; currentTime loops over [0, 1)). Each line gets a
 * phase (`phaseOf(line)`, default `linePhase`); it is repeated at offsets −1, −2, … while
 * that copy can still be visible, so its pulse wraps seamlessly from currentTime 1 back to 0.
 * @returns {Array<{ path, timestamps, color }>}
 */
export function toTrips(lines, phaseOf = linePhase) {
  const timed = lines.map(l => ({ ...l, times: travelTimes(l) }));
  const durations = timed.map(l => l.times[l.times.length - 1]).sort((a, b) => a - b);
  const T = durations[Math.min(durations.length - 1, Math.floor(0.95 * durations.length))];
  if (!(T > 0)) return [];
  const trips = [];
  for (const l of timed) {
    const phase = phaseOf(l);
    const ts = l.times.map(t => phase + t / T);
    const color = speedColor(l.speeds.reduce((a, b) => a + b, 0) / l.speeds.length);
    for (let k = 0; k <= Math.floor(ts[ts.length - 1] + TRAIL); k++) {
      trips.push({ path: l.path, timestamps: k ? ts.map(t => t - k) : ts, color });
    }
  }
  return trips;
}
