/**
 * demandProfiles.js
 * -----------------
 * Representative synthetic electricity-demand SHAPES for the Study Area importer.
 * No per-country data is needed — each profile is a 24-hour weight curve + a
 * weekend factor + a seasonal amplitude (peaks in local winter, hemisphere-aware).
 *
 * This module is the OFFLINE FALLBACK (and the live preview source) for the
 * demandlib-powered path: when the demandlib venv isn't installed, or in the
 * plain browser dev server, `generateDemandShape()` produces a comparable curve
 * from these synthetic presets. It walks the model's real date range at a chosen
 * resolution (15/30/60 min), blends one or more sectors, and scales the shape so
 * its MEAN power equals annualMWh / 8760. Values are returned in MW (positive);
 * the caller negates them for Calliope's demand convention when writing the CSV.
 */

// 24 hourly weights (relative, 0..1) per sector. Evening-peaked residential,
// daytime-plateau commercial, near-flat industrial.
const DAILY = {
  residential: [0.55, 0.50, 0.47, 0.46, 0.47, 0.55, 0.70, 0.85, 0.80, 0.74, 0.71, 0.71, 0.72, 0.71, 0.71, 0.75, 0.85, 0.95, 1.00, 0.98, 0.90, 0.80, 0.68, 0.60],
  commercial: [0.40, 0.38, 0.37, 0.37, 0.38, 0.42, 0.55, 0.75, 0.90, 0.98, 1.00, 1.00, 0.98, 0.98, 0.97, 0.95, 0.90, 0.80, 0.65, 0.55, 0.50, 0.46, 0.43, 0.41],
  industrial: [0.80, 0.78, 0.78, 0.77, 0.78, 0.80, 0.85, 0.90, 0.95, 0.98, 1.00, 1.00, 0.98, 0.98, 0.98, 0.97, 0.95, 0.92, 0.90, 0.88, 0.86, 0.84, 0.82, 0.80],
};
DAILY.mixed = DAILY.residential.map((v, i) => (v + DAILY.commercial[i]) / 2);

export const DEMAND_PROFILES = {
  flat: { label: 'Flat (constant)', daily: null, weekend: 1.0, seasonalAmp: 0.0 },
  residential: { label: 'Residential', daily: DAILY.residential, weekend: 1.05, seasonalAmp: 0.18 },
  commercial: { label: 'Commercial / services', daily: DAILY.commercial, weekend: 0.70, seasonalAmp: 0.12 },
  industrial: { label: 'Industrial', daily: DAILY.industrial, weekend: 0.75, seasonalAmp: 0.06 },
  mixed: { label: 'Mixed (typical region)', daily: DAILY.mixed, weekend: 0.88, seasonalAmp: 0.14 },
};

export const DEMAND_PROFILE_KEYS = Object.keys(DEMAND_PROFILES);

// ── BDEW SLP catalogue ──────────────────────────────────────────────────────
// The wizard exposes BDEW standard load profile codes. The live list is
// data-driven from `ElecSlp.get_profiles()` when the demandlib venv is present;
// this static catalogue is the fallback (labels + grouping) and the anchor for
// the synthetic mapping below.
export const SLP_CATALOGUE = [
  { code: 'flat',   label: 'Flat (constant)',                 group: 'Flat' },
  { code: 'h0_dyn', label: 'Household — dynamic (h0_dyn)',    group: 'Residential' },
  { code: 'h0',     label: 'Household (h0)',                  group: 'Residential' },
  { code: 'g0',     label: 'Commercial — general (g0)',       group: 'Commercial' },
  { code: 'g1',     label: 'Business / offices (g1)',         group: 'Commercial' },
  { code: 'g2',     label: 'Evening-heavy (g2)',              group: 'Commercial' },
  { code: 'g3',     label: 'Continuous 24/7 (g3)',            group: 'Commercial' },
  { code: 'g4',     label: 'Shop / services (g4)',            group: 'Commercial' },
  { code: 'g5',     label: 'Bakery (g5)',                     group: 'Commercial' },
  { code: 'g6',     label: 'Weekend-heavy (g6)',              group: 'Commercial' },
  { code: 'l0',     label: 'Agriculture — general (l0)',      group: 'Agriculture' },
  { code: 'l1',     label: 'Agriculture — dairy/livestock (l1)', group: 'Agriculture' },
  { code: 'l2',     label: 'Agriculture — other (l2)',        group: 'Agriculture' },
];

// BDEW SLP code → nearest synthetic profile key, for the offline fallback and
// the preview. g2 (evening) maps to residential; g3 (continuous) to industrial;
// agriculture (l*) to mixed as a crude stand-in.
export const SLP_TO_SYNTHETIC = {
  flat: 'flat',
  h0: 'residential', h0_dyn: 'residential',
  g0: 'commercial', g1: 'commercial', g4: 'commercial', g5: 'commercial', g6: 'commercial',
  g2: 'residential',
  g3: 'industrial',
  l0: 'mixed', l1: 'mixed', l2: 'mixed',
};

/** Nearest synthetic profile key for a BDEW SLP code (defaults to 'mixed'). */
export function syntheticKeyForSlp(code) {
  return SLP_TO_SYNTHETIC[code] || 'mixed';
}

export const RESOLUTION_MINUTES = { '15min': 15, '30min': 30, '60min': 60 };

const HOURS_PER_YEAR = 8760;
const HOUR_MS = 3600 * 1000;

// Seasonal multiplier: peaks in local winter (heating-led), flips by hemisphere.
function seasonalFactor(doy, amp, southern) {
  if (!amp) return 1;
  const peak = southern ? 196 : 15; // ~mid-Jul (S) vs ~mid-Jan (N)
  return 1 + amp * Math.cos((2 * Math.PI * (doy - peak)) / 365);
}

function dayOfYear(d) {
  return Math.floor(
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000,
  );
}

/**
 * Blend one or more synthetic sectors (by weight) into a single profile.
 * `sectors` maps a synthetic profile key → weight (need not sum to 1). Flat
 * sectors contribute a constant 1 to the daily curve. Falls back to flat when
 * no valid sector is given.
 *
 * @param {Record<string, number>} sectors
 * @returns {{ daily: number[], weekend: number, seasonalAmp: number }}
 */
export function buildBlendedProfile(sectors) {
  const entries = Object.entries(sectors || {})
    .filter(([k, w]) => DEMAND_PROFILES[k] && Number(w) > 0);
  if (!entries.length) return { daily: new Array(24).fill(1), weekend: 1, seasonalAmp: 0 };
  const total = entries.reduce((s, [, w]) => s + Number(w), 0);
  const daily = new Array(24).fill(0);
  let weekend = 0;
  let seasonalAmp = 0;
  for (const [k, w] of entries) {
    const p = DEMAND_PROFILES[k];
    const frac = Number(w) / total;
    for (let h = 0; h < 24; h++) daily[h] += frac * (p.daily ? p.daily[h] : 1);
    weekend += frac * p.weekend;
    seasonalAmp += frac * p.seasonalAmp;
  }
  return { daily, weekend, seasonalAmp };
}

/**
 * Demand series over [start 00:00 … end 23:59] at the given resolution, scaled
 * so its average power = annualMWh / 8760. Supports 15/30/60-min steps and a
 * weighted blend of synthetic sectors.
 *
 * The shape is normalised against the FULL reference year (not the requested
 * range) so seasonal/weekly variation is preserved — a winter day is genuinely
 * higher than a summer day, and a full-year range integrates to annualMWh.
 *
 * @param {{ start:string, end:string, resolution?:string, sectors?:Record<string,number>, latitude?:number, annualMWh?:number }} opts
 * @returns {{ datetimes: string[], values: number[] }} values in MW (positive)
 */
export function generateDemandShape({
  start, end, resolution = '60min', sectors, latitude = 0, annualMWh = 0,
}) {
  const stepMs = (RESOLUTION_MINUTES[resolution] || 60) * 60 * 1000;
  const prof = buildBlendedProfile(sectors);
  const southern = Number(latitude) < 0;
  const startD = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T23:59:59Z`);
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime()) || endD < startD) {
    return { datetimes: [], values: [] };
  }

  // Raw shape weight for one timestamp (daily curve is piecewise-constant per hour).
  const weight = (d) => {
    let s = prof.daily[d.getUTCHours()];
    const dow = d.getUTCDay(); // 0=Sun … 6=Sat
    if (dow === 0 || dow === 6) s *= prof.weekend;
    return s * seasonalFactor(dayOfYear(d), prof.seasonalAmp, southern);
  };

  const datetimes = [];
  const shape = [];
  for (let t = startD.getTime(); t <= endD.getTime(); t += stepMs) {
    const d = new Date(t);
    shape.push(weight(d));
    datetimes.push(d.toISOString().slice(0, 19).replace('T', ' ')); // 'YYYY-MM-DD HH:MM:SS'
  }
  if (!shape.length) return { datetimes: [], values: [] };

  // Reference full year at the same resolution, so the average-power scaling is
  // resolution-independent.
  const refYear = startD.getUTCFullYear();
  let refSum = 0; let refN = 0;
  for (let t = Date.UTC(refYear, 0, 1); t < Date.UTC(refYear + 1, 0, 1); t += stepMs) {
    refSum += weight(new Date(t)); refN += 1;
  }
  const meanAnnual = refN ? refSum / refN : 1;
  const avgMW = (Number(annualMWh) || 0) / HOURS_PER_YEAR;
  const k = meanAnnual > 0 ? avgMW / meanAnnual : 0;
  const values = shape.map(s => Number((s * k).toFixed(4)));
  return { datetimes, values };
}

/**
 * Backward-compatible hourly wrapper around {@link generateDemandShape}.
 *
 * @param {{startDate:string, endDate:string, profileKey?:string, annualMWh?:number, latitude?:number}} opts
 * @returns {{ datetimes: string[], values: number[] }} values in MW (positive)
 */
export function generateHourlyDemand({ startDate, endDate, profileKey = 'mixed', annualMWh = 0, latitude = 0 }) {
  return generateDemandShape({
    start: startDate, end: endDate, resolution: '60min',
    sectors: { [profileKey]: 1 }, annualMWh, latitude,
  });
}
