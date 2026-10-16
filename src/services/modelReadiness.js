// Authoring-time checks on the internal model, the object every engine translator
// receives. Runs in the renderer, so it works before any engine service is up.
// Codes shared with python/engine_diagnostics.py keep the same meaning on both sides;
// scripts/readiness_cases.json pins them.

const PRODUCER_PARENTS = new Set(['supply', 'supply_plus', 'conversion', 'conversion_plus']);
// Weather-dependent output: without a resource these run flat out every hour.
const VARIABLE_RESOURCE = /solar|pv|wind|hydro|ror|wave|tidal/i;
const IGNORED_COST_KEYS = new Set(['interest_rate', 'depreciation_rate']);
// Topology markers the Calliope 0.6 runner skips silently; copy of _HUB_LABELS in python/calliope_runner.py.
const HUB_LABELS = new Set(['substation', 'transformer', 'bus', 'hub', 'switching_station', 'transmission_hub', 'node']);

// Page (App.jsx view key) where each issue is fixed; drives the "Fix" link.
export const FIX_VIEW = {
  no_locations: 'Creation',
  duplicate_location: 'Locations',
  missing_coordinates: 'Locations',
  empty_location: 'Locations',
  no_technologies: 'Technologies',
  undefined_tech: 'Technologies',
  undefined_link_tech: 'Links',
  unused_tech: 'Technologies',
  no_costs: 'Technologies',
  no_demand: 'Technologies',
  no_supply: 'Technologies',
  demand_no_profile: 'Locations',
  demand_unserved: 'Links',
  supply_no_resource: 'TimeSeries',
  link_unknown_location: 'Links',
  link_self: 'Links',
  disconnected_network: 'Links',
  missing_timeseries: 'TimeSeries',
  timeseries_out_of_range: 'TimeSeries',
  invalid_time_horizon: 'Run',
};

export const parentOf = (tech) => String(tech?.essentials?.parent || tech?.parent || 'supply');

const keyOf = (x) => String(x?.name || x?.id || '');

const isFileRef = (v) => typeof v === 'string' && v.startsWith('file=');

const isFiniteNumber = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// Carrier fields may be a list (Calliope conversion_plus carrier_out: [electricity, heat]).
const asList = (v) => [v].flat().filter(Boolean).map(String);

function outputCarriers(tech) {
  const e = tech.essentials || {};
  const list = [e.carrier_out, e.carrier_out_2, e.carrier_out_3].flat().filter(Boolean);
  return list.length ? list : asList(e.carrier || 'electricity');
}

function inputCarriers(tech) {
  const e = tech.essentials || {};
  const list = asList(e.carrier_in);
  return list.length ? list : asList(e.carrier || 'electricity');
}

// Same normalisation as _safe_id in calliope_runner.py.
const safeId = (name) => String(name).trim().replace(/::/g, '__').replace(/:/g, '_')
  .replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';

// Mirrors build_locations_config: exact name / id / safe id, then the ref with spaces to underscores, lowercased.
function makeTechResolver(technologies) {
  const byKey = new Map();
  for (const t of technologies) {
    for (const k of [t?.name, t?.id, safeId(t?.name || t?.id || 'unknown')]) if (k) byKey.set(String(k), t);
  }
  return (ref) => byKey.get(String(ref)) || byKey.get(String(ref).replace(/ /g, '_').toLowerCase());
}

// Same name matching as engine_common.resolve_file_series: fileName / file / name, with or without .csv.
function timeSeriesNames(timeSeries) {
  const names = new Set();
  for (const ts of timeSeries) {
    for (const k of ['fileName', 'file', 'name']) {
      const v = ts?.[k] ? String(ts[k]).toLowerCase() : '';
      if (v) {
        names.add(v);
        names.add(v.replace(/\.csv$/, ''));
      }
    }
  }
  return names;
}

function fileRefResolves(ref, names) {
  const fname = ref.slice('file='.length).split(':')[0].trim().toLowerCase();
  return names.has(fname) || names.has(fname.replace(/\.csv$/, ''));
}

const hasProfile = (loc) => (loc?.demandProfile?.timeseries || []).length > 0;

function locationTechs(loc) {
  const t = loc?.techs;
  if (Array.isArray(t)) return t.map((name) => [String(name), null]);
  return Object.entries(t || {});
}

function linkTechs(link) {
  if (link?.tech) return [String(link.tech)];
  return Object.keys(link?.techs || {});
}

function linkCarriers(link, techByName) {
  const tech = techByName.get(linkTechs(link)[0]);
  const list = asList(link.carrier || tech?.essentials?.carrier || tech?.essentials?.carrier_out);
  return list.length ? list : ['electricity'];
}

// Parses as UTC so coverage does not depend on the viewer's timezone; non-ISO timestamps give NaN and the series is skipped.
function parseUtc(value) {
  const str = String(value ?? '').trim();
  if (!str) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /(Z|[+-]\d{2}:?\d{2})$/i.test(str)) return Date.parse(str);
  return Date.parse(`${str.replace(' ', 'T')}Z`);
}

function connectedComponents(names, links) {
  const adj = new Map(names.map((n) => [n, []]));
  for (const l of links) {
    const a = String(l.from);
    const b = String(l.to);
    if (adj.has(a) && adj.has(b)) {
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
  }
  const seen = new Set();
  const groups = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const group = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop();
      group.push(n);
      for (const m of adj.get(n)) {
        if (!seen.has(m)) {
          seen.add(m);
          stack.push(m);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function issue(code, severity, message, items) {
  const out = { code, severity, message, view: FIX_VIEW[code] };
  if (items?.length) {
    out.items = items.slice(0, 8);
    out.count = items.length;
  }
  return out;
}

function checkLocations({ locations, links }, add) {
  if (!locations.length) {
    add('no_locations', 'error', 'The model has no locations. Place at least one on the map.');
    return;
  }
  const seen = new Set();
  const dupes = [];
  for (const loc of locations) {
    const name = keyOf(loc);
    if (seen.has(name)) dupes.push(name);
    else seen.add(name);
  }
  if (dupes.length) add('duplicate_location', 'error', 'Two or more locations share a name. Engines key locations by name, so one would overwrite the other.', dupes);

  const noCoords = locations.filter((l) => !isFiniteNumber(l.latitude) || !isFiniteNumber(l.longitude)).map(keyOf);
  if (noCoords.length) add('missing_coordinates', 'warning', 'These locations have no coordinates, so they do not show on the map and link distances cannot be computed.', noCoords);

  const linked = new Set(links.flatMap((l) => [String(l.from), String(l.to)]));
  const empty = locations.filter((l) => !locationTechs(l).length && !linked.has(keyOf(l))).map(keyOf);
  if (empty.length) add('empty_location', 'warning', 'These locations have no technologies and no links, so they do nothing in the model.', empty);
}

function hasUsableCost(costs) {
  return Object.entries(costs || {})
    .some(([k, v]) => !IGNORED_COST_KEYS.has(k) && (isFileRef(v) || (isFiniteNumber(v) && Number(v) !== 0)));
}

function checkTechnologies({ locations, links, technologies, techByName, resolveTech }, add) {
  if (!technologies.length) {
    add('no_technologies', 'error', 'The model has no technologies. Assign at least one supply and one demand technology to a location.');
    return;
  }
  const used = new Set();
  const undefinedRefs = [];
  for (const loc of locations) {
    for (const [ref] of locationTechs(loc)) {
      used.add(ref);
      const tech = resolveTech(ref);
      if (tech) used.add(keyOf(tech));
      else if (!HUB_LABELS.has(ref.replace(/ /g, '_').toLowerCase())) undefinedRefs.push(`${keyOf(loc)}::${ref}`);
    }
  }
  if (undefinedRefs.length) add('undefined_tech', 'warning', 'These locations list technologies that are not defined; engines skip them.', undefinedRefs);

  const undefinedLinkRefs = [];
  for (const link of links) {
    const label = `${link.from}\u2192${link.to}`;
    for (const ref of linkTechs(link)) {
      used.add(ref);
      if (!techByName.has(ref)) undefinedLinkRefs.push(`${label}::${ref}`);
    }
    if (!linkTechs(link).length) undefinedLinkRefs.push(`${label} (no tech)`);
  }
  if (undefinedLinkRefs.length) add('undefined_link_tech', 'warning', 'These links use a transmission technology that is not defined. Calliope 0.6 creates a default line for them; PyPSA, OSeMOSYS and AdOpT-NET0 skip them.', undefinedLinkRefs);

  // A location profile implicitly places every demand tech there (Calliope 0.6 runner).
  const implicitDemand = locations.some(hasProfile);
  const unused = technologies
    .filter((t) => parentOf(t) !== 'transmission' && !(implicitDemand && parentOf(t) === 'demand')
      && !used.has(t.name) && !used.has(t.id))
    .map(keyOf);
  if (unused.length) add('unused_tech', 'warning', 'These technologies are defined but not assigned to any location.', unused);

  const hasCost = technologies.some((t) => hasUsableCost(t.costs?.monetary))
    || locations.some((loc) => locationTechs(loc).some(([, cfg]) => hasUsableCost(cfg?.costs?.monetary)));
  if (!hasCost) add('no_costs', 'warning', 'No technology has a cost, so the optimiser has nothing to minimise and any feasible dispatch counts as optimal.');
}

function checkLinks({ locations, links }, add) {
  const names = new Set(locations.flatMap((l) => [l.name, l.id]).filter(Boolean).map(String));
  const unknown = links.filter((l) => !names.has(String(l.from)) || !names.has(String(l.to))).map((l) => `${l.from} \u2192 ${l.to}`);
  if (unknown.length) add('link_unknown_location', 'error', 'These links connect to a location that does not exist.', unknown);

  const self = links.filter((l) => String(l.from) === String(l.to)).map((l) => String(l.from));
  if (self.length) add('link_self', 'error', 'These links start and end at the same location.', self);

  if (locations.length > 1) {
    const islands = connectedComponents(locations.map(keyOf), links);
    if (islands.length > 1) {
      const labels = islands.map((g) => g.slice(0, 3).join(', ') + (g.length > 3 ? ` (+${g.length - 3})` : ''));
      add('disconnected_network', 'warning', `The network splits into ${islands.length} disconnected groups. Each group must meet its own demand.`, labels);
    }
  }
}

function checkDemandAndSupply({ locations, links, technologies, techByName, resolveTech, modelConfig, scenarioSelected }, add) {
  const assignedDemand = new Set();
  const produced = new Set();
  const noProfile = [];
  const noResource = [];
  const unserved = [];

  // Carriers reachable over links, per location, in one pass.
  const linked = new Map();
  for (const l of links) {
    const carriers = linkCarriers(l, techByName);
    for (const end of [String(l.from), String(l.to)]) {
      if (!linked.has(end)) linked.set(end, new Set());
      for (const c of carriers) linked.get(end).add(c);
    }
  }
  // A location profile makes the runner add every defined demand tech there.
  const profileCarriers = technologies.filter((t) => parentOf(t) === 'demand').flatMap(inputCarriers);
  const demanded = new Set();
  let profileDemand = false;

  for (const loc of locations) {
    const lname = keyOf(loc);
    const profile = hasProfile(loc);
    const localOut = new Set();
    const localIn = new Set();
    if (profile && profileCarriers.length) {
      profileDemand = true;
      for (const c of profileCarriers) localIn.add(c);
    }
    for (const [ref, cfg] of locationTechs(loc)) {
      const tech = resolveTech(ref);
      if (!tech) continue;
      const parent = parentOf(tech);
      const resource = { ...(tech.constraints || {}), ...(cfg?.constraints || {}) }.resource;
      if (parent === 'demand') {
        assignedDemand.add(tech);
        for (const c of inputCarriers(tech)) localIn.add(c);
        if (!profile && !isFileRef(resource) && !isFiniteNumber(resource)) noProfile.push(`${lname}::${ref}`);
      } else if (PRODUCER_PARENTS.has(parent)) {
        for (const c of outputCarriers(tech)) {
          localOut.add(c);
          produced.add(c);
        }
        const unbounded = resource === undefined || resource === null || resource === '' || String(resource).toLowerCase() === 'inf';
        if (parent.startsWith('supply') && unbounded && VARIABLE_RESOURCE.test(`${ref} ${tech.essentials?.name || ''}`)) {
          noResource.push(`${lname}::${ref}`);
        }
      }
    }
    const imported = linked.get(lname) || new Set();
    for (const c of localIn) {
      demanded.add(c);
      if (!localOut.has(c) && !imported.has(c)) unserved.push(`${lname} (${c})`);
    }
  }

  if (!assignedDemand.size && !profileDemand) {
    add('no_demand', 'error', 'No demand technology is assigned to a location, so there is nothing to supply and results would be trivial.');
  }
  const met = demanded.size ? [...demanded].some((c) => produced.has(c)) : produced.size > 0;
  if (!met) add('no_supply', 'error', 'No location has a supply or conversion technology that produces the demanded carrier, so demand cannot be met.');

  if (noProfile.length) {
    // Python skips this check when a scenario or override is set.
    add('demand_no_profile', scenarioSelected ? 'warning' : 'error', 'These demand technologies have no demand profile or resource value. Engines would substitute a placeholder or drop the demand, so results would not reflect your system.', noProfile);
  }
  if (noResource.length) add('supply_no_resource', 'warning', 'These weather-dependent technologies have no resource time series, so engines let them produce at full capacity every hour.', noResource);
  if (unserved.length) {
    const message = modelConfig.ensureFeasibility
      ? 'Nothing at these locations produces or imports the demanded carrier, so this demand will show up as unmet demand.'
      : 'Nothing at these locations produces or imports the demanded carrier. The run is infeasible unless unmet demand is allowed.';
    add('demand_unserved', 'warning', message, unserved);
  }
}

function checkFileRefs({ locations, technologies, resolveTech, timeSeries }, add) {
  const tsNames = timeSeriesNames(timeSeries);
  const missingDemand = new Set();
  const missingOther = new Set();
  const scan = (label, tech, constraints, costs) => {
    const isDemand = parentOf(tech) === 'demand';
    for (const v of [...Object.values(constraints), ...Object.values(costs)]) {
      if (isFileRef(v) && !fileRefResolves(v, tsNames)) (isDemand ? missingDemand : missingOther).add(`${label} \u2192 ${v}`);
    }
  };
  const assigned = new Set();
  for (const loc of locations) {
    const lname = keyOf(loc);
    for (const [ref, cfg] of locationTechs(loc)) {
      const tech = resolveTech(ref);
      if (!tech) continue;
      assigned.add(tech);
      scan(`${lname}::${ref}`, tech,
        { ...(tech.constraints || {}), ...(cfg?.constraints || {}) },
        { ...(tech.costs?.monetary || {}), ...(cfg?.costs?.monetary || {}) });
    }
  }
  // Python also checks the tech-level definitions of techs no location uses.
  for (const tech of technologies) {
    if (!assigned.has(tech)) scan(keyOf(tech), tech, tech.constraints || {}, tech.costs?.monetary || {});
  }
  if (missingDemand.size) add('missing_timeseries', 'error', 'These demand technologies point to a time-series file that is not in the model. Upload it in Time Series or re-import the model with its CSV files.', [...missingDemand]);
  if (missingOther.size) add('missing_timeseries', 'warning', 'These technologies point to a time-series file that is not in the model; engines fall back to a placeholder.', [...missingOther]);
}

function checkTime({ timeSeries, modelConfig }, add) {
  const { startDate, endDate } = modelConfig;
  if (!startDate || !endDate) return;
  const start = parseUtc(startDate);
  const end = parseUtc(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
    add('invalid_time_horizon', 'error', 'The model period is invalid: the start date must be on or before the end date.');
    return;
  }
  const HOUR = 3600 * 1000;
  // Only the first, second and last rows are read, so this stays cheap on 8760-row series.
  const short = [];
  for (const ts of timeSeries) {
    const col = ts?.dateColumn;
    const rows = ts?.data || [];
    if (!col || !rows.length) continue;
    const firstRaw = rows[0]?.[col];
    const lastRaw = rows[rows.length - 1]?.[col];
    const first = parseUtc(firstRaw);
    const last = parseUtc(lastRaw);
    if (Number.isNaN(first) || Number.isNaN(last)) continue;
    // The end day counts in full: the last row must be within one step of the day's end.
    const gap = parseUtc(rows[1]?.[col]) - first;
    const step = gap > 0 ? gap : HOUR;
    if (first > start || last < end + 24 * HOUR - step) short.push(`${ts.fileName || ts.name}: ${firstRaw} to ${lastRaw}`);
  }
  if (short.length) add('timeseries_out_of_range', 'warning', 'These time series do not cover the model period. Calliope fails on missing dates; the other engines cycle or pad the series.', short);
}

export function checkModel(model, options = {}) {
  const technologies = model?.technologies || [];
  const techByName = new Map();
  for (const t of technologies) {
    for (const k of [t?.name, t?.id]) if (k) techByName.set(String(k), t);
  }
  const ctx = {
    locations: model?.locations || [],
    links: model?.links || [],
    technologies,
    techByName,
    resolveTech: makeTechResolver(technologies),
    scenarioSelected: Boolean(options.scenarioSelected),
    timeSeries: model?.timeSeries || [],
    modelConfig: model?.modelConfig || {},
  };
  const errors = [];
  const warnings = [];
  const add = (code, severity, message, items) =>
    (severity === 'error' ? errors : warnings).push(issue(code, severity, message, items));

  checkLocations(ctx, add);
  checkTechnologies(ctx, add);
  checkLinks(ctx, add);
  checkDemandAndSupply(ctx, add);
  checkFileRefs(ctx, add);
  checkTime(ctx, add);

  return { ok: errors.length === 0, errors, warnings };
}
