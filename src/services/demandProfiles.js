/**
 * demandProfiles.js
 * -----------------
 * Representative synthetic electricity-demand SHAPES for the Study Area importer.
 * No per-country data is needed — each profile is a 24-hour weight curve + a
 * weekend factor + a seasonal amplitude (peaks in local winter, hemisphere-aware).
 *
 * `generateHourlyDemand()` walks the model's real date range (so leap years and
 * partial periods are handled correctly) and scales the shape so its MEAN power
 * equals annualMWh / 8760. Values are returned in MW (positive); the caller
 * negates them for Calliope's demand convention when writing the CSV.
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
 * Hourly demand series over [startDate 00:00 … endDate 23:00], scaled so its
 * average power = annualMWh / 8760.
 *
 * @param {{startDate:string, endDate:string, profileKey?:string, annualMWh?:number, latitude?:number}} opts
 * @returns {{ datetimes: string[], values: number[] }} values in MW (positive)
 */
export function generateHourlyDemand({ startDate, endDate, profileKey = 'mixed', annualMWh = 0, latitude = 0 }) {
  const prof = DEMAND_PROFILES[profileKey] || DEMAND_PROFILES.mixed;
  const southern = Number(latitude) < 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { datetimes: [], values: [] };
  }

  // Raw shape weight for one timestamp.
  const weight = (d) => {
    let s = prof.daily ? prof.daily[d.getUTCHours()] : 1;
    const dow = d.getUTCDay(); // 0=Sun … 6=Sat
    if (dow === 0 || dow === 6) s *= prof.weekend;
    return s * seasonalFactor(dayOfYear(d), prof.seasonalAmp, southern);
  };

  const datetimes = [];
  const shape = [];
  for (let t = start.getTime(); t <= end.getTime(); t += HOUR_MS) {
    const d = new Date(t);
    shape.push(weight(d));
    datetimes.push(d.toISOString().slice(0, 19).replace('T', ' ')); // 'YYYY-MM-DD HH:MM:SS'
  }
  if (!shape.length) return { datetimes: [], values: [] };

  // Normalise against the FULL reference year (not the requested range) so that
  // seasonal/weekly variation is preserved — a winter day is genuinely higher
  // than a summer day, and a full-year range integrates to exactly annualMWh.
  const refYear = start.getUTCFullYear();
  let refSum = 0; let refN = 0;
  for (let t = Date.UTC(refYear, 0, 1); t < Date.UTC(refYear + 1, 0, 1); t += HOUR_MS) {
    refSum += weight(new Date(t)); refN += 1;
  }
  const meanAnnual = refN ? refSum / refN : 1;
  const avgMW = (Number(annualMWh) || 0) / HOURS_PER_YEAR;
  const k = meanAnnual > 0 ? avgMW / meanAnnual : 0;
  const values = shape.map(s => Number((s * k).toFixed(4)));
  return { datetimes, values };
}
