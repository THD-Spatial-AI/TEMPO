// A location's demand tech as a person reads it: where the demand comes from, its values,
// and the two edits the demand card offers (rescale, replace). Demand is a negative
// `resource` in the model; here values are positive.
import { SLP_CATALOGUE } from './demandProfiles';

// Constraints the demand card owns; the generic constraint list leaves them out.
export const DEMAND_CARD_KEYS = ['resource', 'resource_scale', 'force_resource'];

const FILE_REF = /^file=([^:]+?)(?::(.+))?$/;
const isNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

function findSeries(timeSeries, file) {
  const want = file.toLowerCase().replace(/\.csv$/, '');
  return (timeSeries || []).find((ts) => [ts.fileName, ts.name]
    .some((n) => n && String(n).toLowerCase().replace(/\.csv$/, '') === want));
}

// The column's values, from parsed rows (loaded model) or the csv text (saved model).
function columnValues(ts, column) {
  if (ts.data?.length) {
    if (!(column in ts.data[0])) return null;
    return ts.data.map((r) => Number(r[column]));
  }
  const lines = String(ts.csvContent || '').split(/\r?\n/).filter(Boolean);
  const col = (lines[0] || '').split(',').indexOf(column);
  if (col < 0) return null;
  return lines.slice(1).map((l) => Number(l.split(',')[col]));
}

/**
 * @returns {{kind: 'pipeline'|'file'|'constant'|'none', scale: number, values?: number[],
 *   file?: string, column?: string, found?: boolean, value?: number, meta: object}}
 */
export function readDemand(techCfg, techDef, timeSeries, locationName) {
  const c = { ...(techDef?.constraints || {}), ...(techCfg?.constraints || {}) };
  const meta = techCfg?.metadata || {};
  const scale = isNum(c.resource_scale) ? Number(c.resource_scale) : 1;
  const ref = typeof c.resource === 'string' ? c.resource.trim().match(FILE_REF) : null;
  if (ref) {
    const file = ref[1];
    const column = ref[2] || locationName;
    const ts = findSeries(timeSeries, file);
    const raw = ts ? columnValues(ts, column) : null;
    const pipeline = Boolean(meta.estimatedFromPopulation || meta.estimatedFromSubstationEstimate || ts?.source === 'osm-demand');
    return {
      kind: pipeline ? 'pipeline' : 'file', file, column, scale, meta,
      found: Boolean(raw), values: raw ? raw.map((v) => Math.abs(v) * scale) : null,
    };
  }
  if (isNum(c.resource)) return { kind: 'constant', value: Math.abs(Number(c.resource)) * scale, scale, meta };
  return { kind: 'none', scale, meta };
}

// Average and peak in the model's power unit, and the yearly energy that average gives.
export function demandStats(values, unit = 'MW') {
  if (!values?.length) return null;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const peak = Math.max(...values);
  return { avg, peak, annualGWh: (avg * 8760) / (unit === 'kW' ? 1e6 : 1e3) };
}

const SECTOR_LABEL = Object.fromEntries(SLP_CATALOGUE.map((s) => [s.code, s.label]));
const SHAPE_SOURCE = { demandlib: 'BDEW profile from demandlib', synthetic: 'synthetic' };

export function describeDemand(d) {
  if (d.kind === 'pipeline') {
    const m = d.meta;
    const how = m.estimatedFromPopulation
      ? `Population × ${Number(m.perCapitaKWh).toLocaleString('en-US')} kWh per person per year`
      : 'Population density around the substation';
    const sectors = Object.keys(m.sectors || {}).map((k) => SECTOR_LABEL[k] || k);
    const shape = sectors.length ? `${sectors.join(' + ')} shape${m.source ? ` (${SHAPE_SOURCE[m.source] || m.source})` : ''}` : '';
    return { title: 'From the study-area demand pipeline', detail: [how, shape].filter(Boolean).join(' · ') };
  }
  if (d.kind === 'file') return { title: `Time series ${d.file}, column ${d.column}`, detail: '' };
  if (d.kind === 'constant') return { title: 'Constant demand', detail: '' };
  return { title: 'No demand set', detail: '' };
}

// Constraints with the demand rescaled to `targetAvg` (model unit). A series keeps its shape
// through resource_scale, so a column shared with other locations stays as it is.
export function rescaleTo(constraints, d, targetAvg) {
  if (d.kind === 'constant') return { ...constraints, resource: -targetAvg };
  const stats = demandStats(d.values);
  if (!stats?.avg) return constraints;
  const scale = d.scale * (targetAvg / stats.avg);
  return { ...constraints, resource_scale: Number(scale.toPrecision(6)) };
}

// Constraints with the demand replaced by a series column ({file, column}) or a constant.
export function replaceDemand(constraints, { file, column, constant }) {
  // eslint-disable-next-line no-unused-vars
  const { resource, resource_scale, ...rest } = constraints || {};
  return {
    ...rest,
    resource: constant !== undefined ? -Math.abs(Number(constant)) : `file=${file}:${column}`,
    force_resource: true,
  };
}
