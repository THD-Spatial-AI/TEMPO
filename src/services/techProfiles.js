/**
 * techProfiles.js
 * ---------------
 * Pure helpers for technology resource profiles (PV / wind / availability /
 * capacity-factor). A profile is written INTO the model as a time series entry
 * plus a `resource: file=<csv>:<col>` ref on each location tech — the same
 * plumbing the OSM substation demand uses (Creation.jsx).
 */

import { RESOLUTION_MINUTES } from './demandProfiles';

const NO_PROFILE_PARENTS = new Set(['storage', 'transmission', 'distribution', 'demand']);

const has = (text, ...words) => words.some(w => text.includes(w));

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Which kind of profile a technology takes, or null when none applies.
 * @param {{id?:string, name?:string, parent?:string}} tech
 * @returns {'pv'|'wind'|'availability'|'capacity_factor'|null}
 */
export function classifyProfileKind(tech) {
  if (!tech || NO_PROFILE_PARENTS.has(tech.parent)) return null;
  const t = `${tech.id || ''} ${tech.name || ''}`.toLowerCase();
  const tokens = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  // Short abbreviations match whole tokens only (no 'error' -> ror, 'pvc' -> pv).
  const tok = (...words) => words.some(w => tokens.has(w));
  if (has(t, 'reform', 'methane', 'hydrogen', 'electroly')) return null;
  if (tok('csp') || has(t, 'concentrated solar', 'solar thermal', 'solar_thermal')) return null;
  if (tok('pv') || has(t, 'photovoltaic')) return 'pv';
  if (has(t, 'wind')) return 'wind';
  if (tok('ror') || has(t, 'marine', 'tidal', 'run_of_river', 'run-of-river', 'run of river')) return 'capacity_factor';
  if (tok('smr', 'ccgt', 'ocgt', 'chp') || has(t, 'nuclear', 'coal', 'gas turbine', 'combustion', 'biogas', 'biomass',
    'waste', 'geothermal')) return 'availability';
  return null;
}

/**
 * Whether a profile can be applied to a tech of this parent. CHP on
 * conversion / conversion_plus is shown but not applied (D14).
 */
export function canApplyProfile(parent) {
  return parent === 'supply' || parent === 'supply_plus';
}

/** True when the profile is a full hourly year (8760, or 8784 in a leap year). */
export function isFullHourlyYear(p) {
  if (!p || p.time_resolution !== '1h') return false;
  const expected = isLeap(Number(p.year)) ? 8784 : 8760;
  return Number(p.n_values) === expected;
}

/**
 * Choose the otdb profile for a role. timeseries_profiles (measured/linked) win
 * over embedded ones; a null profile_role matches any role (legacy entries).
 * @returns {object|null} the profile metadata, tagged with `_origin`
 */
export function pickProfile(resp, role) {
  const fits = p => isFullHourlyYear(p) && (p.profile_role == null || p.profile_role === role);
  const ts = (resp?.timeseries_profiles || []).find(fits);
  if (ts) return { ...ts, _origin: 'timeseries' };
  const emb = (resp?.embedded_profiles || []).find(fits);
  return emb ? { ...emb, _origin: 'embedded' } : null;
}

// Hour-of-year index for (month 0-11, day 1-31, hour) in `year`.
function hourOfYear(year, month, day, hour) {
  return Math.round((Date.UTC(year, month, day, hour) - Date.UTC(year, 0, 1)) / 3_600_000);
}

/**
 * Re-stamp a full-year hourly series from `sourceYear` onto the model window.
 * @param {number[]} values 8760 / 8784 hourly values (UTC)
 * @param {number} sourceYear year the values belong to
 * @param {{startDate:string, endDate:string, resolution?:string}} cal model calendar
 * @returns {{ datetimes:string[], values:number[] }}
 */
export function restampToModelCalendar(values, sourceYear, { startDate, endDate, resolution = '60min' }) {
  const n = isLeap(sourceYear) ? 8784 : 8760;
  if (!Array.isArray(values) || values.length !== n) {
    throw new Error(`profile must have ${n} hourly values for ${sourceYear} (8760/8784), got ${values?.length ?? 0}`);
  }
  const stepMs = (RESOLUTION_MINUTES[resolution] || 60) * 60_000;
  const s = new Date(`${startDate}T00:00:00Z`).getTime();
  const e = new Date(`${endDate}T23:59:59Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) throw new Error('invalid model calendar');
  const datetimes = [];
  const out = [];
  for (let t = s; t <= e; t += stepMs) {
    const d = new Date(t);
    let month = d.getUTCMonth();
    let day = d.getUTCDate();
    if (month === 1 && day === 29 && !isLeap(sourceYear)) day = 28;
    out.push(values[hourOfYear(sourceYear, month, day, d.getUTCHours())]);
    datetimes.push(d.toISOString().slice(0, 19).replace('T', ' '));
  }
  return { datetimes, values: out };
}

export const PROFILE_KIND_LABEL = {
  pv: 'Solar PV profile', wind: 'Wind profile',
  availability: 'Availability profile', capacity_factor: 'Capacity-factor profile',
};

/** Safe id for a tech: the profile file-name stem and its CSV column name. */
export function profileColumnId(techName) {
  return String(techName).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Time-series file name of a tech's profile: `profile_<safe>.csv`. */
export function profileFileName(techName) {
  return `profile_${profileColumnId(techName)}.csv`;
}

/**
 * Calendar a profile is stamped onto (D3). The run window is resolved like
 * Run.jsx: subset_time_start/end parameters → metadata.subsetTime →
 * metadata.modelConfig dates, then widened to full calendar years so any run
 * window inside them works without re-fetching.
 * @returns {{startDate:string, endDate:string, resolution:string,
 *            window:{start:string, end:string}}|null} window = raw run window (display only)
 */
export function modelCalendar(model) {
  const meta = model?.metadata || {};
  const mc = meta.modelConfig || {};
  let start = null;
  let end = null;
  (model?.parameters || []).forEach(p => {
    if (p.key === 'subset_time_start') start = p.value;
    if (p.key === 'subset_time_end') end = p.value;
  });
  if (!start && !end && meta.subsetTime) {
    const st = meta.subsetTime;
    if (Array.isArray(st) && st.length === 2) {
      start = String(st[0]);
      end = String(st[1]);
    } else {
      const v = String(st).trim().slice(0, 10);
      start = /^\d{4}$/.test(v) ? `${v}-01-01` : v;
      end = /^\d{4}$/.test(v) ? `${v}-12-31` : v;
    }
  }
  if (!start && !end) {
    start = mc.startDate || null;
    end = mc.endDate || null;
  }
  const toDate = (v) => {
    const d = v ? String(v).slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };
  start = toDate(start);
  end = toDate(end);
  if (!start || !end) return null;
  return {
    startDate: `${start.slice(0, 4)}-01-01`,
    endDate: `${end.slice(0, 4)}-12-31`,
    resolution: mc.resolution || '60min',
    window: { start, end },
  };
}

/**
 * Time-series entry for a tech profile. One file per tech; `columns` maps CSV
 * column → values aligned with `datetimes`. `profileSource` is the recipe used
 * to regenerate / detect staleness (D9).
 */
export function buildProfileTimeSeries({ modelId, techName, datetimes, columns, profileSource }) {
  const name = `profile_${profileColumnId(techName)}`;
  const fileName = profileFileName(techName);
  const dataColumns = Object.keys(columns);
  for (const c of dataColumns) {
    if (!/^[A-Za-z0-9_-]+$/.test(c)) throw new Error(`invalid column name "${c}"`);
    if (columns[c].length !== datetimes.length) throw new Error(`column "${c}" has ${columns[c].length} values, expected ${datetimes.length}`);
    if (!columns[c].every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error(`column "${c}" has non-finite values`);
  }
  const allColumns = ['datetime', ...dataColumns];
  const data = datetimes.map((dt, i) => ({
    datetime: dt,
    ...Object.fromEntries(dataColumns.map(c => [c, columns[c][i]])),
  }));
  // csvContent is REQUIRED to survive a backend save/reload (prepareModelForBackend strips `data`).
  const csvContent = [allColumns.join(','), ...data.map(r => allColumns.map(c => r[c]).join(','))].join('\n');
  return {
    id: `${modelId || 'model'}_${name}`,
    modelId: modelId || null,
    source: 'tech-profile',
    name, fileName, columns: allColumns, dateColumn: 'datetime', dataColumns, data, csvContent,
    rowCount: data.length,
    profileSource,
  };
}

/**
 * Return new locations with `resource: file=<fileName>:<col>` on `techName` for
 * every location in `colByLocation`. Availability → upper bound
 * (force_resource false); capacity factor / pv / wind → forced.
 */
export function applyProfileToLocations(locations, { techName, fileName, colByLocation, kind }) {
  const force = kind !== 'availability';
  return locations.map(loc => {
    const col = colByLocation[loc.name];
    if (!col || !loc.techs?.[techName]) return loc;
    const lt = loc.techs[techName] || {};
    return {
      ...loc,
      techs: {
        ...loc.techs,
        [techName]: {
          ...lt,
          constraints: {
            ...(lt.constraints || {}),
            resource: `file=${fileName}:${col}`,
            resource_unit: 'energy_per_cap',
            force_resource: force,
          },
        },
      },
    };
  });
}

/**
 * Compare a stored profile recipe against the current model. Never regenerates —
 * the caller shows a badge and lets the user regenerate (D9).
 */
export function profileStaleness(entry, { modelConfig, locations, techName }) {
  const src = entry?.profileSource;
  if (!src) return { stale: false, reasons: [], missing: [], removed: [], moved: [] };
  const reasons = [];
  const cal = src.calendar || {};
  const mc = modelConfig || {};
  if (cal.startDate !== mc.startDate || cal.endDate !== mc.endDate || (RESOLUTION_MINUTES[cal.resolution] || 60) !== (RESOLUTION_MINUTES[mc.resolution] || 60)) {
    reasons.push('calendar');
  }
  const hosting = (locations || []).filter(l => l.techs?.[techName]).map(l => l.name);
  const pts = src.points || {};
  const missing = hosting.filter(n => !pts[n]);
  const removed = Object.keys(pts).filter(n => !hosting.includes(n));
  if (missing.length) reasons.push('missing');
  if (removed.length) reasons.push('removed');
  // ~10 m: a point whose location moved needs recalculating (weather-based profiles).
  const moved = hosting.filter(n => {
    const p = pts[n];
    const loc = locations.find(l => l.name === n);
    return p && p.lat != null && p.lon != null
      && (Math.abs(p.lat - loc.latitude) > 1e-4 || Math.abs(p.lon - loc.longitude) > 1e-4);
  });
  if (moved.length) reasons.push('moved');
  return { stale: reasons.length > 0, reasons, missing, removed, moved };
}

/** Equator-facing default orientation (compass azimuth: 0 = N, 180 = S). */
export function defaultPvOrientation(lat) {
  return { tilt: Math.round(Math.min(60, Math.abs(lat) * 0.76 + 3.1)), azimuth: lat < 0 ? 0 : 180 };
}

/**
 * Recipe key of one PV point (R8): a result or stored stat is current only while
 * this key is unchanged. `settings` must be built the same way on both sides.
 */
export function pvPointKey(settings, lat, lon, tilt, azimuth) {
  return JSON.stringify([settings, lat, lon, tilt, azimuth]);
}

/** Wind defaults (W5): offshore → generic 15 MW at 150 m, else generic IEC II at 100 m; 12 % loss. */
export function defaultWindSettings(techName, weatherYear) {
  const offshore = /offshore/i.test(String(techName));
  return {
    weatherYear,
    turbine: offshore ? 'generic_offshore' : 'generic_iec2',
    hubHeight: offshore ? 150 : 100,
    loss: 0.12,
  };
}

/** Recipe key of one wind point (W8): settings plus the weather site. */
export function windPointKey(settings, siteLat, siteLon) {
  return JSON.stringify([settings, siteLat, siteLon]);
}

/** One unique, CSV-safe column id per location name (D4: one column per point). */
export function pointColumnIds(names) {
  const used = new Set(['datetime']); // the CSV's date column
  return Object.fromEntries(names.map(n => {
    const base = profileColumnId(n) || 'point';
    let col = base;
    for (let i = 2; used.has(col); i++) col = `${base}_${i}`;
    used.add(col);
    return [n, col];
  }));
}
