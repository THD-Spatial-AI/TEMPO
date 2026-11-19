/**
 * What an override setting means, for the guided override editor in the Scenario Studio.
 *
 * A setting is a dotted Calliope path (e.g. techs.ccgt.constraints.energy_cap_max). This module
 * reads it as target (tech / tech at a location / location / link / time window / resolution /
 * run settings / advanced) + parameter, builds paths back, knows each parameter's kind and unit,
 * reads the model's own value, and checks a setting against the model. No React here.
 */

import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions.js';
import { COMMON_PARAMS } from './parameterOntology.js';
import { timeSeriesRange, modelTimeWindow } from '../utils/modelTimeWindow.js';

export const RESOLUTIONS = ['1H', '2H', '3H', '4H', '6H', '12H', '1D'];

const ENUMS = {
  resource_unit: ['energy', 'energy_per_cap', 'energy_per_area'],
  'run.mode': ['plan', 'operate', 'spores'],
  'run.solver': ['highs', 'cbc', 'glpk', 'gurobi', 'cplex'],
};

// ── Paths ─────────────────────────────────────────────────────────────────────

// The part after techs.<t>. / locations.<l>.techs.<t>. / links.<a,b>.techs.<t>.
function techTail(rest) {
  if (rest.length === 1 && rest[0] === 'exists') return { section: 'exists', param: 'exists' };
  if (rest.length === 2 && rest[0] === 'constraints') return { section: 'constraints', param: rest[1] };
  if (rest.length === 3 && rest[0] === 'costs') return { section: 'costs', costClass: rest[1], param: rest[2] };
  return null;
}

const advanced = (key) => ({ target: { type: 'advanced' }, section: 'advanced', param: key });

/** Read a dotted override key as { target, section, costClass?, param }. */
export function parseSettingKey(key) {
  const p = String(key).split('.');
  if (p[0] === 'techs' && p.length >= 3) {
    const tail = techTail(p.slice(2));
    return tail ? { target: { type: 'tech', tech: p[1] }, ...tail } : advanced(key);
  }
  if ((p[0] === 'locations' || p[0] === 'links') && p.length >= 3) {
    if (p.length === 3 && p[2] === 'exists') {
      const target = p[0] === 'locations' ? { type: 'loc', loc: p[1] } : { type: 'link', link: p[1] };
      return { target, section: 'exists', param: 'exists' };
    }
    if (p[2] === 'techs' && p.length >= 5) {
      const tail = techTail(p.slice(4));
      if (!tail) return advanced(key);
      const target = p[0] === 'locations' ? { type: 'locTech', loc: p[1], tech: p[3] } : { type: 'link', link: p[1], tech: p[3] };
      return { target, ...tail };
    }
    return advanced(key);
  }
  if (key === 'model.subset_time') return { target: { type: 'time' }, section: 'model', param: 'subset_time' };
  if (key === 'model.time.function_options.resolution') return { target: { type: 'resolution' }, section: 'model', param: 'resolution' };
  if (p[0] === 'run' && p.length >= 2) return { target: { type: 'run' }, section: 'run', param: p.slice(1).join('.') };
  return advanced(key);
}

/** The dotted key for { target, section, costClass?, param } (inverse of parseSettingKey). */
export function settingKey({ target, section, costClass, param }) {
  const tail = section === 'exists' ? 'exists'
    : section === 'costs' ? `costs.${costClass || 'monetary'}.${param}`
    : `constraints.${param}`;
  switch (target.type) {
    case 'tech': return `techs.${target.tech}.${tail}`;
    case 'locTech': return `locations.${target.loc}.techs.${target.tech}.${tail}`;
    case 'loc': return `locations.${target.loc}.exists`;
    case 'link': return target.tech ? `links.${target.link}.techs.${target.tech}.${tail}` : `links.${target.link}.exists`;
    case 'time': return 'model.subset_time';
    case 'resolution': return 'model.time.function_options.resolution';
    case 'run': return `run.${param}`;
    default: return param;
  }
}

// ── Parameter kinds, units, labels ───────────────────────────────────────────

const CONSTRAINT_KINDS = {
  power: ['energy_cap_max', 'energy_cap_min', 'energy_cap_equals', 'energy_cap_max_systemwide', 'energy_cap_equals_systemwide',
    'energy_cap_per_unit', 'export_cap', 'resource_cap_max', 'resource_cap_min', 'resource_cap_equals'],
  energy: ['storage_cap_max', 'storage_cap_min', 'storage_cap_equals', 'storage_cap_per_unit'],
  bool: ['energy_prod', 'energy_con', 'force_resource', 'one_way', 'force_asynchronous_prod_con', 'resource_cap_equals_energy_cap'],
  fraction: ['energy_eff', 'resource_eff', 'parasitic_eff', 'energy_cap_min_use', 'resource_min_use', 'storage_initial', 'storage_discharge_depth'],
  rate: ['energy_ramping', 'storage_loss'],
  years: ['lifetime'],
  hours: ['storage_time_max'],
  int: ['units_max', 'units_min', 'units_equals', 'units_max_systemwide', 'units_equals_systemwide'],
  area: ['resource_area_max', 'resource_area_min', 'resource_area_equals'],
  resource: ['resource'],
  text: ['export_carrier'],
  enum: ['resource_unit'],
};
const COST_KINDS = {
  costPower: ['energy_cap', 'resource_cap'],
  costPowerYear: ['om_annual'],
  costPowerKm: ['energy_cap_per_distance'],
  costEnergy: ['om_prod', 'om_con', 'export', 'storage_cap'],
  fraction: ['interest_rate', 'om_annual_investment_fraction', 'depreciation_rate'],
};
// Costs that only make sense for some tech types (others apply to all).
const COST_PARENTS = {
  storage_cap: ['storage', 'supply_plus'],
  energy_cap_per_distance: ['transmission'],
  purchase_per_distance: ['transmission'],
  resource_cap: ['supply_plus'],
  resource_area: ['supply', 'supply_plus'],
  om_con: ['supply_plus', 'conversion', 'conversion_plus', 'storage', 'demand'],
};
const costApplies = (param, parent) => !parent || !COST_PARENTS[param] || COST_PARENTS[param].includes(parent);

const invert = (m) => Object.fromEntries(Object.entries(m).flatMap(([kind, names]) => names.map(n => [n, kind])));
const CONSTRAINT_KIND = invert(CONSTRAINT_KINDS);
const COST_KIND = invert(COST_KINDS);

/** Editor kind of a parameter: power, energy, fraction, bool, resource, dateRange, … or 'number' / 'any'. */
export function paramKind(param, section) {
  if (section === 'exists') return 'bool';
  if (section === 'costs') return COST_KIND[param] || 'number';
  if (section === 'model') return param === 'subset_time' ? 'dateRange' : 'resolution';
  if (section === 'run') {
    if (ENUMS[`run.${param}`]) return 'enum';
    return ['ensure_feasibility', 'cyclic_storage'].includes(param) ? 'bool' : 'any';
  }
  if (section === 'advanced') return 'any';
  return CONSTRAINT_KIND[param] || 'number';
}

/** Options of an enum parameter. */
export function enumOptions(param, section) {
  return ENUMS[section === 'run' ? `run.${param}` : param] || [];
}

/** Unit text for a kind, in the model's power unit (kW / MW / GW). */
export function unitLabel(kind, powerUnit = 'MW') {
  switch (kind) {
    case 'power': return powerUnit;
    case 'energy': return `${powerUnit}h`;
    case 'costPower': return `per ${powerUnit}`;
    case 'costPowerYear': return `per ${powerUnit}/yr`;
    case 'costPowerKm': return `per ${powerUnit}/km`;
    case 'costEnergy': return `per ${powerUnit}h`;
    case 'fraction': return '0–1';
    case 'rate': return '0–1 per hour';
    case 'years': return 'years';
    case 'hours': return 'hours';
    case 'area': return 'm²';
    default: return '';
  }
}

const ONTOLOGY_LABEL = Object.fromEntries(Object.values(COMMON_PARAMS)
  .filter(d => d.calliope).map(d => [`${d.calliope.kind === 'cost' ? 'costs' : 'constraints'}:${d.calliope.name}`, d.label]));
const humanize = (s) => String(s).replace(/[._]/g, ' ').replace(/^\w/, c => c.toUpperCase());
const SPECIAL_LABELS = {
  'exists:exists': 'Available (on/off)', 'model:subset_time': 'Period', 'model:resolution': 'Resolution',
  'run:mode': 'Run mode', 'run:solver': 'Solver', 'run:ensure_feasibility': 'Ensure feasibility', 'run:cyclic_storage': 'Cyclic storage',
};

/** Readable name of a parameter. */
export function paramLabel(param, section) {
  return SPECIAL_LABELS[`${section}:${param}`] || ONTOLOGY_LABEL[`${section}:${param}`] || humanize(param);
}

/** Description of a parameter, when known. */
export function paramDescription(param, section) {
  if (section === 'costs') return COST_DEFINITIONS[param]?.desc || '';
  if (section === 'constraints') return CONSTRAINT_DEFINITIONS[param]?.desc || '';
  if (section === 'exists') return 'Switch this off to remove it from the run.';
  return '';
}

// ── Model lookups ─────────────────────────────────────────────────────────────

const techOf = (model, name) => (model?.technologies || []).find(t => t.name === name);
const parentOf = (tech) => tech?.parent || tech?.essentials?.parent || '';
const locOf = (model, name) => (model?.locations || []).find(l => l.name === name);

/** Names of the techs placed at a location. */
export function techsAtLocation(model, locName) {
  const techs = locOf(model, locName)?.techs;
  if (Array.isArray(techs)) return techs.map(t => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
  return Object.keys(techs || {});
}

/** Links as 'a,b' keys with their tech. */
export function modelLinks(model) {
  return (model?.links || []).filter(l => l.from && l.to).map(l => ({ key: `${l.from},${l.to}`, tech: l.tech, from: l.from, to: l.to }));
}

/** The parameters that make sense for a target: [{ section, costClass?, param, label, description, kind }]. */
export function paramsForTarget(target, model) {
  const item = (section, param, costClass) => ({
    section, param, ...(costClass ? { costClass } : {}),
    label: paramLabel(param, section), description: paramDescription(param, section), kind: paramKind(param, section),
  });
  switch (target?.type) {
    case 'tech': case 'locTech': case 'link': {
      if (target.type === 'link' && !target.tech) return [item('exists', 'exists')];
      const parent = parentOf(techOf(model, target.tech)) || (target.type === 'link' ? 'transmission' : '');
      const constraints = PARENT_CONSTRAINTS[parent] || Object.keys(CONSTRAINT_DEFINITIONS);
      return [
        item('exists', 'exists'),
        ...constraints.map(p => item('constraints', p)),
        ...Object.keys(COST_DEFINITIONS).filter(p => costApplies(p, parent)).map(p => item('costs', p, 'monetary')),
      ];
    }
    case 'loc': return [item('exists', 'exists')];
    case 'time': return [item('model', 'subset_time')];
    case 'resolution': return [item('model', 'resolution')];
    case 'run': return ['mode', 'solver', 'ensure_feasibility', 'cyclic_storage'].map(p => item('run', p));
    default: return [];
  }
}

/** The model's own value for a parameter (a location's value wins over its tech's). */
export function modelValue(model, target, section, param, costClass = 'monetary') {
  if (target?.type === 'time') {
    const w = modelTimeWindow(model);
    return [w.startDate, w.endDate];
  }
  const tech = techOf(model, target?.tech);
  const own = (obj) => (section === 'costs' ? obj?.costs?.[costClass]?.[param] : obj?.constraints?.[param]);
  if (section !== 'constraints' && section !== 'costs') return undefined;
  if (target?.type === 'locTech') {
    const atLoc = locOf(model, target.loc)?.techs?.[target.tech];
    const v = own(atLoc);
    if (v !== undefined) return v;
  }
  return own(tech);
}

// ── Display ───────────────────────────────────────────────────────────────────

const targetId = (t) => JSON.stringify(t);

function targetTitle(target, model) {
  const parent = (name) => parentOf(techOf(model, name)) || '?';
  switch (target.type) {
    case 'tech': return `Technology · ${target.tech} (${parent(target.tech)})`;
    case 'locTech': return `${target.loc} · ${target.tech} (${parent(target.tech)})`;
    case 'loc': return `Location · ${target.loc}`;
    case 'link': return `Link · ${target.link.replace(',', ' ↔ ')}${target.tech ? ` · ${target.tech}` : ''}`;
    case 'time': return 'Time window';
    case 'resolution': return 'Time resolution';
    case 'run': return 'Run settings';
    default: return 'Advanced';
  }
}

/** Settings grouped by target, in order of appearance: [{ title, target, entries:[{key, value, ...parsed}] }]. */
export function groupSettings(flat, model) {
  const groups = new Map();
  for (const [key, value] of Object.entries(flat || {})) {
    if (key === 'model.time.function' && value === 'resample') continue; // set together with the resolution
    const parsed = parseSettingKey(key);
    const id = targetId(parsed.target);
    if (!groups.has(id)) groups.set(id, { title: targetTitle(parsed.target, model), target: parsed.target, entries: [] });
    groups.get(id).entries.push({ key, value, ...parsed });
  }
  return [...groups.values()];
}

// ── Checks ────────────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fileRef(value) {
  if (typeof value !== 'string' || !value.startsWith('file=')) return null;
  const [file, column] = value.slice(5).split(':');
  return { file: file.trim(), column: column?.trim() || null };
}

/**
 * Problems with one setting: [{ code, message }]. `flat` is the whole override (dotted),
 * `series` the model's time series.
 */
export function checkSetting(model, key, value, flat = {}, series = []) {
  const out = [];
  const add = (code, message) => out.push({ code, message });
  const { target, section, costClass, param } = parseSettingKey(key);
  const kind = paramKind(param, section);

  if (target.tech) {
    const tech = techOf(model, target.tech);
    if (!tech) add('unknown_tech', `"${target.tech}" is not a technology in this model.`);
    else if (section === 'constraints') {
      const allowed = PARENT_CONSTRAINTS[parentOf(tech)];
      if (allowed && !allowed.includes(param)) add('param_not_for_type', `${paramLabel(param, section)} does not apply to ${parentOf(tech)} technologies.`);
    }
  }
  if (target.loc) {
    if (!locOf(model, target.loc)) add('unknown_location', `"${target.loc}" is not a location in this model.`);
    else if (target.tech && techOf(model, target.tech) && !techsAtLocation(model, target.loc).includes(target.tech)) {
      add('tech_not_at_location', `${target.tech} is not placed at ${target.loc}.`);
    }
  }

  const ref = fileRef(value);
  if (ref) {
    const ts = (series || []).find(s => [s.fileName, s.file, s.name].filter(Boolean)
      .some(n => n === ref.file || `${n}.csv` === ref.file));
    if (!ts) add('file_not_in_model', `${ref.file} is not one of this model's time series (Calliope runs will look for it in the model templates).`);
    else if (ref.column) {
      const cols = ts.dataColumns?.length ? ts.dataColumns : (ts.columns || []).slice(1);
      if (cols.length && !cols.includes(ref.column)) add('column_not_in_file', `${ref.file} has no column "${ref.column}".`);
    }
  }

  if (kind === 'dateRange' && Array.isArray(value) && value.length === 2) {
    const [s, e] = value.map(v => String(v).slice(0, 10));
    if (s > e) add('window_reversed', 'The period ends before it starts.');
    const range = timeSeriesRange(series);
    if (range && (s < range.startDate || e > range.endDate)) {
      add('window_outside_data', `The model's data covers ${range.startDate} → ${range.endDate}.`);
    }
  }

  if (isNum(value)) {
    if ((kind === 'fraction' || kind === 'rate') && (value < 0 || value > 1)) add('out_of_range', `${paramLabel(param, section)} must be between 0 and 1.`);
    if (['power', 'energy', 'years', 'hours', 'int', 'area'].includes(kind) && value < 0) add('out_of_range', `${paramLabel(param, section)} cannot be negative.`);
    const m = /^(.*)_(min|max)$/.exec(param);
    if (m && section === 'constraints') {
      const otherParam = `${m[1]}_${m[2] === 'min' ? 'max' : 'min'}`;
      const otherKey = settingKey({ target, section, costClass, param: otherParam });
      const other = otherKey in flat ? flat[otherKey] : modelValue(model, target, section, otherParam, costClass);
      if (isNum(other)) {
        const [min, max] = m[2] === 'min' ? [value, other] : [other, value];
        if (min > max) add('min_above_max', `Minimum (${min}) is above maximum (${max}).`);
      }
    }
  }
  return out;
}
