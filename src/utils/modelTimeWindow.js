// A model's run window (startDate–endDate, inclusive days). One resolver for the whole app:
// the Run page, Scenario Studio, Export, readiness checks and profile tools all read it, and
// the Run page / Studio save edits to metadata.modelConfig, so a change shows up everywhere.

const toDate = (v) => {
  const d = v == null ? '' : String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

const result = (start, end, source) => {
  const s = toDate(start);
  const e = toDate(end);
  return s && e && s <= e ? { startDate: s, endDate: e, source } : null;
};

function subsetTimeWindow(st) {
  if (Array.isArray(st) && st.length === 2) return [st[0], st[1]];
  if (st == null || st === '') return [null, null];
  const v = String(st).trim();
  if (/^\d{4}$/.test(v)) return [`${v}-01-01`, `${v}-12-31`];
  return [v, v];
}

// First and last dated row of one time-series entry (parsed `data`, else raw `csvContent`).
function seriesSpan(entry) {
  const data = entry?.data;
  if (Array.isArray(data) && data.length) {
    const key = entry.dateColumn || Object.keys(data[0] || {})[0];
    return [toDate(data[0]?.[key]), toDate(data[data.length - 1]?.[key])];
  }
  const csv = entry?.csvContent;
  if (typeof csv !== 'string' || !csv) return [null, null];
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [null, null];
  const header = lines[0].split(',');
  const col = Math.max(0, entry.dateColumn ? header.indexOf(entry.dateColumn) : 0);
  const cell = (line) => toDate(line.split(',')[col] ?? '');
  return [cell(lines[1]), cell(lines[lines.length - 1])];
}

/** Earliest first date and latest last date across time-series entries, or null. */
export function timeSeriesRange(timeSeries) {
  let start = null;
  let end = null;
  for (const entry of timeSeries || []) {
    const [s, e] = seriesSpan(entry);
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
  }
  return start && end ? { startDate: start, endDate: end } : null;
}

/**
 * The window a model runs over: saved (metadata.modelConfig) → subset_time parameters →
 * import window (metadata.subsetTime) → span of its time series → the current year.
 * @param {object} model
 * @param {object[]} [timeSeries] defaults to model.timeSeries (pass the context list for the loaded model)
 * @returns {{startDate:string, endDate:string, source:'saved'|'parameters'|'import'|'data'|'default'}}
 */
export function modelTimeWindow(model, timeSeries = model?.timeSeries) {
  const mc = model?.metadata?.modelConfig || {};
  const saved = result(mc.startDate, mc.endDate, 'saved');
  if (saved) return saved;

  const param = (key) => (model?.parameters || []).find(p => p.key === key)?.value;
  const params = result(param('subset_time_start'), param('subset_time_end'), 'parameters');
  if (params) return params;

  const imported = result(...subsetTimeWindow(model?.metadata?.subsetTime ?? model?.subsetTime), 'import');
  if (imported) return imported;

  const range = timeSeriesRange(timeSeries);
  if (range) return { ...range, source: 'data' };

  const y = new Date().getFullYear();
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31`, source: 'default' };
}

/** Inclusive days in a window (0 when invalid). */
export function windowDays(startDate, endDate) {
  const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** "Jan 1, 2015" */
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
