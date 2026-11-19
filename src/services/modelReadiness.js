// Authoring-time checks on the internal model, the object every engine translator
// receives. Runs in the renderer, so it works before any engine service is up.
// Codes shared with python/engine_diagnostics.py keep the same meaning on both sides;
// scripts/readiness_cases.json pins them.

import { classifyProfileKind, modelCalendar, profileFileName, profileStaleness } from './techProfiles';

const PRODUCER_PARENTS = new Set(['supply', 'supply_plus', 'conversion', 'conversion_plus']);
// Weather-dependent output: without a resource these run flat out every hour.
const VARIABLE_RESOURCE = /solar|pv|wind|hydro|ror|wave|tidal/i;
// Storage hydro: dispatchable, but its yearly output is bounded by the water flowing in.
const RESERVOIR = /reservoir|(^|[^a-z])dams?([^a-z]|$)/i;
const IGNORED_COST_KEYS = new Set(['interest_rate', 'depreciation_rate']);
// Topology markers the Calliope 0.6 runner skips silently; copy of _HUB_LABELS in python/calliope_runner.py.
const HUB_LABELS = new Set(['substation', 'transformer', 'bus', 'hub', 'switching_station', 'transmission_hub', 'node']);

// Page (App.jsx view key) where each issue is fixed; the default view of its item targets.
export const FIX_VIEW = {
  no_locations: 'Creation',
  duplicate_location: 'Locations',
  missing_coordinates: 'Locations',
  empty_location: 'Map View',
  no_technologies: 'Technologies',
  undefined_tech: 'Locations',
  undefined_link_tech: 'Links',
  unused_tech: 'Technologies',
  no_costs: 'Technologies',
  no_demand: 'Technologies',
  no_supply: 'Technologies',
  demand_no_profile: 'Locations',
  demand_unserved: 'Map View',
  supply_no_resource: 'Technologies',
  hydro_no_inflow: 'Technologies',
  profile_stale: 'Technologies',
  link_unknown_location: 'Links',
  link_self: 'Links',
  disconnected_network: 'Map View',
  missing_timeseries: 'TimeSeries',
  timeseries_out_of_range: 'TimeSeries',
  invalid_time_horizon: 'Run',
  tech_no_capacity_bound: 'Technologies',
  capex_no_lifetime: 'Technologies',
  conversion_no_eff: 'Technologies',
  storage_no_cap: 'Technologies',
  tech_no_carrier: 'Technologies',
  model_unit_unset: 'Run',
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

// An item is a label, or { label, ...target } where the target says which entity (and field) fixes it.
// Map targets open on the Map View of the loaded model; the rest on the code's FIX_VIEW page.
function issue(code, severity, message, items, extra) {
  const out = { code, severity, message, view: FIX_VIEW[code], ...extra };
  if (items?.length) {
    // Items are capped for display; targets cover every item so inline markers reach all of them.
    out.items = items.slice(0, 8).map((x) => (typeof x === 'string' ? x : x.label));
    if (items.some((x) => typeof x !== 'string')) {
      out.targets = items.map((x) => {
        if (typeof x === 'string') return null;
        const { label: _label, ...target } = x;
        return { view: target.map ? 'Map View' : FIX_VIEW[code], ...target };
      });
    }
    out.count = items.length;
  }
  return out;
}

function checkLocations({ locations, links }, add) {
  if (!locations.length) {
    add('no_locations', 'critical', 'The model has no locations. Place at least one on the map.');
    return;
  }
  const seen = new Set();
  const dupes = [];
  for (const loc of locations) {
    const name = keyOf(loc);
    if (seen.has(name)) dupes.push({ label: name, kind: 'location', id: name, field: 'name' });
    else seen.add(name);
  }
  if (dupes.length) add('duplicate_location', 'critical', 'Two or more locations share a name. Engines key locations by name, so one would overwrite the other.', dupes);

  const noCoords = locations.filter((l) => !isFiniteNumber(l.latitude) || !isFiniteNumber(l.longitude))
    .map((l) => ({ label: keyOf(l), kind: 'location', id: keyOf(l), field: 'coordinates' }));
  if (noCoords.length) add('missing_coordinates', 'warning', 'These locations have no coordinates, so they do not show on the map and link distances cannot be computed.', noCoords);

  const linked = new Set(links.flatMap((l) => [String(l.from), String(l.to)]));
  const empty = locations.filter((l) => !locationTechs(l).length && !linked.has(keyOf(l)))
    .map((l) => ({ label: keyOf(l), kind: 'location', id: keyOf(l), map: true }));
  if (empty.length) add('empty_location', 'warning', 'These locations have no technologies and no links, so they do nothing in the model.', empty);
}

function hasUsableCost(costs) {
  return Object.entries(costs || {})
    .some(([k, v]) => !IGNORED_COST_KEYS.has(k) && (isFileRef(v) || (isFiniteNumber(v) && Number(v) !== 0)));
}

function checkTechnologies({ locations, links, technologies, techByName, resolveTech }, add) {
  if (!technologies.length) {
    add('no_technologies', 'critical', 'The model has no technologies. Assign at least one supply and one demand technology to a location.');
    return;
  }
  const used = new Set();
  const undefinedRefs = [];
  for (const loc of locations) {
    for (const [ref] of locationTechs(loc)) {
      used.add(ref);
      const tech = resolveTech(ref);
      if (tech) used.add(keyOf(tech));
      else if (!HUB_LABELS.has(ref.replace(/ /g, '_').toLowerCase())) {
        undefinedRefs.push({ label: `${keyOf(loc)}::${ref}`, kind: 'location', id: keyOf(loc), tech: ref });
      }
    }
  }
  if (undefinedRefs.length) add('undefined_tech', 'warning', 'These locations list technologies that are not defined; engines skip them.', undefinedRefs);

  const undefinedLinkRefs = [];
  for (const link of links) {
    const label = `${link.from}\u2192${link.to}`;
    const target = { kind: 'link', from: String(link.from), to: String(link.to), field: 'tech' };
    for (const ref of linkTechs(link)) {
      used.add(ref);
      if (!techByName.has(ref)) undefinedLinkRefs.push({ label: `${label}::${ref}`, ...target });
    }
    if (!linkTechs(link).length) undefinedLinkRefs.push({ label: `${label} (no tech)`, ...target });
  }
  if (undefinedLinkRefs.length) add('undefined_link_tech', 'warning', 'These links use a transmission technology that is not defined. Calliope 0.6 creates a default line for them; PyPSA, OSeMOSYS and AdOpT-NET0 skip them.', undefinedLinkRefs);

  // A location profile implicitly places every demand tech there (Calliope 0.6 runner).
  const implicitDemand = locations.some(hasProfile);
  const unused = technologies
    .filter((t) => parentOf(t) !== 'transmission' && !(implicitDemand && parentOf(t) === 'demand')
      && !used.has(t.name) && !used.has(t.id))
    .map((t) => ({ label: keyOf(t), kind: 'tech', id: keyOf(t) }));
  if (unused.length) add('unused_tech', 'warning', 'These technologies are defined but not assigned to any location.', unused);

  const hasCost = technologies.some((t) => hasUsableCost(t.costs?.monetary))
    || locations.some((loc) => locationTechs(loc).some(([, cfg]) => hasUsableCost(cfg?.costs?.monetary)));
  if (!hasCost) add('no_costs', 'warning', 'No technology has a cost, so the optimiser has nothing to minimise and any feasible dispatch counts as optimal.');
}

function checkLinks({ locations, links }, add) {
  const names = new Set(locations.flatMap((l) => [l.name, l.id]).filter(Boolean).map(String));
  const linkItem = (label, l) => ({ label, kind: 'link', from: String(l.from), to: String(l.to) });
  const unknown = links.filter((l) => !names.has(String(l.from)) || !names.has(String(l.to)))
    .map((l) => linkItem(`${l.from} \u2192 ${l.to}`, l));
  if (unknown.length) add('link_unknown_location', 'critical', 'These links connect to a location that does not exist.', unknown);

  const self = links.filter((l) => String(l.from) === String(l.to)).map((l) => linkItem(String(l.from), l));
  if (self.length) add('link_self', 'error', 'These links start and end at the same location.', self);

  if (locations.length > 1) {
    const islands = connectedComponents(locations.map(keyOf), links);
    if (islands.length > 1) {
      const labels = islands.map((g) => ({
        label: g.slice(0, 3).join(', ') + (g.length > 3 ? ` (+${g.length - 3})` : ''),
        kind: 'island',
        members: g,
        map: true,
      }));
      add('disconnected_network', 'warning', `The network splits into ${islands.length} disconnected groups. Each group must meet its own demand.`, labels);
    }
  }
}

function checkDemandAndSupply({ locations, links, technologies, techByName, resolveTech, modelConfig, scenarioSelected }, add) {
  const assignedDemand = new Set();
  const produced = new Set();
  const noProfile = [];
  const noResource = [];
  const noInflow = [];
  let profileTech;
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
        if (!profile && !isFileRef(resource) && !isFiniteNumber(resource)) {
          noProfile.push({ label: `${lname}::${ref}`, kind: 'location', id: lname, tech: ref, field: 'demandProfile' });
        }
      } else if (PRODUCER_PARENTS.has(parent)) {
        for (const c of outputCarriers(tech)) {
          localOut.add(c);
          produced.add(c);
        }
        const unbounded = resource === undefined || resource === null || resource === '' || String(resource).toLowerCase() === 'inf';
        const named = `${ref} ${tech.essentials?.name || ''}`;
        if (parent.startsWith('supply') && unbounded && RESERVOIR.test(named)) {
          noInflow.push({ label: `${lname}::${ref}`, kind: 'tech', id: keyOf(tech), location: lname, field: 'resource' });
        } else if (parent.startsWith('supply') && unbounded && VARIABLE_RESOURCE.test(named)) {
          const canProfile = Boolean(classifyProfileKind({ id: ref, name: keyOf(tech), parent }));
          noResource.push({ label: `${lname}::${ref}`, kind: 'tech', id: keyOf(tech), location: lname, field: 'resource', profile: canProfile });
          profileTech ||= canProfile ? keyOf(tech) : undefined;
        }
      }
    }
    const imported = linked.get(lname) || new Set();
    for (const c of localIn) {
      demanded.add(c);
      if (!localOut.has(c) && !imported.has(c)) unserved.push({ label: `${lname} (${c})`, kind: 'location', id: lname, map: true });
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
  if (noResource.length) {
    const hint = profileTech ? ' Open the technology and use Calculate profile.' : '';
    add('supply_no_resource', 'warning', `These weather-dependent technologies have no resource time series, so engines let them produce at full capacity every hour.${hint}`, noResource, profileTech ? { profileTech } : undefined);
  }
  if (noInflow.length) {
    add('hydro_no_inflow', 'warning', 'These hydro reservoirs have no water inflow limit, so the model may run them at full capacity every hour of the year. A real reservoir is limited by the water it receives. Set an inflow time series as the resource, or ignore this if treating it as a dispatchable plant is intended.', noInflow);
  }
  if (unserved.length) {
    const message = modelConfig.ensureFeasibility
      ? 'Nothing at these locations produces or imports the demanded carrier, so this demand will show up as unmet demand.'
      : 'Nothing at these locations produces or imports the demanded carrier. The run is infeasible unless unmet demand is allowed.';
    add('demand_unserved', 'warning', message, unserved);
  }
}

const hasBound = (c, keys) => keys.some((k) => isFiniteNumber(c[k]));
const positive = (v) => isFiniteNumber(v) && Number(v) > 0;
const STORAGE_RATIOS = ['energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max', 'energy_cap_per_storage_cap_equals'];
// The 0.6 runner fills in electricity for these when no carrier is set; others fail without one.
const CARRIER_DEFAULTED = new Set(['storage', 'transmission', 'demand']);

function missingCarrier(tech) {
  const e = tech.essentials || {};
  const parent = parentOf(tech);
  const out = asList(e.carrier_out).length || asList(e.carrier).length;
  if (parent === 'demand') return !asList(e.carrier_in).length && !out;
  if (parent.startsWith('conversion')) return !asList(e.carrier_in).length || !asList(e.carrier_out).length;
  return !out;
}

// Parameter gaps on the techs placed at locations; a location override counts, and each
// tech is reported once however many locations it sits at.
function checkParameters({ locations, resolveTech }, add) {
  const found = { bound: new Map(), lifetime: new Map(), eff: new Map(), storage: new Map(), carrierError: new Map(), carrierWarn: new Map() };
  const flag = (kind, tech, field) => {
    const id = keyOf(tech);
    if (!found[kind].has(id)) found[kind].set(id, { label: id, kind: 'tech', id, ...(field ? { field } : {}) });
  };
  for (const loc of locations) {
    for (const [ref, cfg] of locationTechs(loc)) {
      const tech = resolveTech(ref);
      if (!tech) continue;
      const parent = parentOf(tech);
      const c = { ...(tech.constraints || {}), ...(cfg?.constraints || {}) };
      const costs = { ...(tech.costs?.monetary || {}), ...(cfg?.costs?.monetary || {}) };
      if (PRODUCER_PARENTS.has(parent) && !hasBound(c, ['energy_cap_max', 'energy_cap_equals'])
        && Object.entries(costs).some(([k, v]) => !IGNORED_COST_KEYS.has(k) && isFiniteNumber(v) && Number(v) < 0)) {
        flag('bound', tech, 'energy_cap_max');
      }
      if (parent !== 'demand' && positive(costs.energy_cap) && !isFiniteNumber(c.lifetime)) flag('lifetime', tech, 'lifetime');
      if (parent.startsWith('conversion') && !isFiniteNumber(c.energy_eff)) flag('eff', tech, 'energy_eff');
      // A power-to-energy ratio sizes storage through energy_cap, which carries its own cost and bounds.
      if (parent === 'storage' && !hasBound(c, ['storage_cap_max', 'storage_cap_equals', ...STORAGE_RATIOS]) && !positive(costs.storage_cap)) {
        flag('storage', tech, 'storage_cap_max');
      }
      if (missingCarrier(tech)) flag(CARRIER_DEFAULTED.has(parent) ? 'carrierWarn' : 'carrierError', tech);
    }
  }
  const list = (kind) => [...found[kind].values()];
  if (found.bound.size) add('tech_no_capacity_bound', 'warning', 'These technologies have a negative cost and no maximum capacity, so the optimiser can build them without limit and the run may be unbounded. Set energy_cap_max.', list('bound'));
  if (found.lifetime.size) add('capex_no_lifetime', 'error', 'These technologies have a capacity cost but no lifetime. Calliope 0.6.8 refuses to run; the other engines charge the whole investment in one year. Set lifetime.', list('lifetime'));
  if (found.eff.size) add('conversion_no_eff', 'warning', 'These conversion technologies have no efficiency, so they convert without losses. Set energy_eff.', list('eff'));
  if (found.storage.size) add('storage_no_cap', 'warning', 'These storage technologies have no maximum storage capacity and no storage cost, so the optimiser treats storage as free and unlimited. Set storage_cap_max or a storage_cap cost.', list('storage'));
  if (found.carrierError.size) add('tech_no_carrier', 'error', 'These technologies have no output carrier (or, for conversion, no input carrier), so engines cannot connect them. Set the carriers in Essentials.', list('carrierError'));
  if (found.carrierWarn.size) add('tech_no_carrier', 'warning', 'These technologies have no carrier, so electricity is assumed. Set the carrier in Essentials if they carry something else.', list('carrierWarn'));
}

// Templates are in kW and TEMPO models in MW; a demand peak this large with no unit set is
// most likely kW, which would make every result 1000x too big.
const KW_SUSPECT_PEAK = 1e5;

function peakDemand({ locations, resolveTech, timeSeries }) {
  let peak = 0;
  const bump = (v) => { if (isFiniteNumber(v)) peak = Math.max(peak, Math.abs(Number(v))); };
  for (const loc of locations) {
    for (const v of loc?.demandProfile?.timeseries || []) bump(v);
    for (const [ref, cfg] of locationTechs(loc)) {
      const tech = resolveTech(ref);
      if (!tech || parentOf(tech) !== 'demand') continue;
      const resource = { ...(tech.constraints || {}), ...(cfg?.constraints || {}) }.resource;
      if (!isFileRef(resource)) {
        bump(resource);
        continue;
      }
      const [file, column] = resource.slice('file='.length).split(':').map((x) => x.trim());
      const ts = timeSeries.find((t) => [t.fileName, t.name].some((n) => n && String(n).replace(/\.csv$/, '') === file.replace(/\.csv$/, '')));
      for (const row of ts?.data || []) bump(row?.[column || keyOf(loc)]);
    }
  }
  return peak;
}

function checkUnits(ctx, add) {
  if (ctx.modelConfig.powerUnit) return;
  if (peakDemand(ctx) > KW_SUSPECT_PEAK) {
    add('model_unit_unset', 'warning', 'Demand peaks above 100,000 and no model unit is set, so the model is probably in kW while results are read as MW. Set the model unit on the Run page.');
  }
}

function checkFileRefs({ locations, technologies, resolveTech, timeSeries }, add) {
  const tsNames = timeSeriesNames(timeSeries);
  // Keyed by label so a file referenced twice is reported once.
  const missingDemand = new Map();
  const missingOther = new Map();
  const scan = (label, tech, constraints, costs) => {
    const isDemand = parentOf(tech) === 'demand';
    for (const v of [...Object.values(constraints), ...Object.values(costs)]) {
      if (!isFileRef(v) || fileRefResolves(v, tsNames)) continue;
      const item = `${label} \u2192 ${v}`;
      const file = v.slice('file='.length).split(':')[0].trim();
      (isDemand ? missingDemand : missingOther).set(item, { label: item, kind: 'timeseries', id: file });
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
  if (missingDemand.size) add('missing_timeseries', 'error', 'These demand technologies point to a time-series file that is not in the model. Upload it in Time Series or re-import the model with its CSV files.', [...missingDemand.values()]);
  if (missingOther.size) add('missing_timeseries', 'warning', 'These technologies point to a time-series file that is not in the model; engines fall back to a placeholder.', [...missingOther.values()]);
}

// Resource profiles written by the profile dialogs, compared against the model they were built for.
function checkProfiles({ locations, technologies, timeSeries, modelConfig, parameters, subsetTime }, add) {
  const cal = modelCalendar({ parameters, metadata: { modelConfig, subsetTime } });
  const stale = [];
  let first = null;
  for (const t of technologies) {
    const name = keyOf(t);
    const entry = timeSeries.find((ts) => ts.fileName === profileFileName(name) && ts.profileSource);
    if (!entry) continue;
    const s = profileStaleness(entry, { modelConfig: cal || entry.profileSource.calendar || {}, locations, techName: name });
    const parts = [];
    if (s.missing.length) parts.push(`missing ${s.missing.join(', ')}`);
    if (s.removed.length) parts.push(`removed ${s.removed.join(', ')}`);
    if (s.moved.length) parts.push(`moved ${s.moved.join(', ')}`);
    if (cal && s.reasons.includes('calendar')) parts.push('calendar');
    if (!parts.length) continue;
    stale.push({ label: `${name}: ${parts.join('; ')}`, kind: 'tech', id: name, field: 'resource', profile: true });
    first ||= name;
  }
  if (stale.length) add('profile_stale', 'warning', 'These resource profiles no longer match the model (locations moved, added or removed, or the model years changed). Open the profile and recalculate the changed points.', stale, { profileTech: first });
}

function checkTime({ timeSeries, modelConfig }, add) {
  const { startDate, endDate } = modelConfig;
  if (!startDate || !endDate) return;
  const start = parseUtc(startDate);
  const end = parseUtc(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
    add('invalid_time_horizon', 'critical', 'The model period is invalid: the start date must be on or before the end date.');
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
    if (first > start || last < end + 24 * HOUR - step) {
      short.push({ label: `${ts.fileName || ts.name}: ${firstRaw} to ${lastRaw}`, kind: 'timeseries', id: ts.fileName || ts.name });
    }
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
    parameters: model?.parameters || [],
    subsetTime: model?.subsetTime ?? model?.metadata?.subsetTime,
  };
  // Only critical issues block a run; errors ask for confirmation, warnings inform.
  const lists = { critical: [], error: [], warning: [] };
  // Warnings the user marked as intended ({ code, item }, item null for an item-less warning)
  // are left out of the list and reported under `ignored` so they can be restored.
  const ignoreKeys = new Set((options.ignored || []).map((i) => ignoreKey(i.code, i.item)));
  const ignored = [];
  const add = (code, severity, message, items, extra) => {
    if (severity === 'warning' && ignoreKeys.size) {
      if (!items?.length) {
        if (ignoreKeys.has(ignoreKey(code, null))) {
          ignored.push({ code, item: null, message });
          return;
        }
      } else {
        items = items.filter((x) => {
          const label = typeof x === 'string' ? x : x.label;
          if (!ignoreKeys.has(ignoreKey(code, label))) return true;
          ignored.push({ code, item: label, message });
          return false;
        });
        if (!items.length) return;
      }
    }
    lists[severity].push(issue(code, severity, message, items, extra));
  };

  checkLocations(ctx, add);
  checkTechnologies(ctx, add);
  checkLinks(ctx, add);
  checkDemandAndSupply(ctx, add);
  checkParameters(ctx, add);
  checkUnits(ctx, add);
  checkFileRefs(ctx, add);
  checkProfiles(ctx, add);
  checkTime(ctx, add);

  return { ok: lists.critical.length === 0, critical: lists.critical, errors: lists.error, warnings: lists.warning, ignored };
}

const ignoreKey = (code, item) => `${code}\u0000${item ?? ''}`;

// Key of an entity in issuesByEntity: entityKey('location', name), ('tech', name), ('link', from, to).
export const entityKey = (kind, ...parts) => [kind, ...parts].join('\u0000');

const SEVERITY_RANK = { critical: 0, error: 1, warning: 2 };

// Issues per entity, for inline markers on rows, cards and map markers; each list is ordered
// worst first. Islands are left out: they would mark every location in the model.
export function issuesByEntity(readiness) {
  const index = new Map();
  const put = (key, issue) => {
    const list = index.get(key) || [];
    if (!list.includes(issue)) list.push(issue);
    index.set(key, list);
  };
  for (const issue of [...readiness.critical, ...readiness.errors, ...readiness.warnings]) {
    for (const t of issue.targets || []) {
      if (!t) continue;
      if (t.kind === 'location' || t.kind === 'tech' || t.kind === 'timeseries') put(entityKey(t.kind, t.id), issue);
      if (t.kind === 'tech' && t.location) put(entityKey('location', t.location), issue);
      else if (t.kind === 'link') put(entityKey('link', t.from, t.to), issue);
    }
  }
  for (const list of index.values()) list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return index;
}

// The basics a new model still lacks, as a to-do list; null once it has locations and technologies.
export function readinessChecklist(readiness) {
  const has = (code) => [...readiness.critical, ...readiness.errors].some((i) => i.code === code);
  if (!has('no_locations') && !has('no_technologies')) return null;
  return [
    { key: 'location', label: 'Add a location', done: !has('no_locations') },
    { key: 'supply', label: 'Add a power plant', done: !has('no_technologies') && !has('no_supply') },
    { key: 'demand', label: 'Add a demand', done: !has('no_technologies') && !has('no_demand') },
  ];
}

// An unsaved Creation draft is only on the Creation map, so its issues point there: locations,
// islands and link ends fly the map; targets on other pages (techs, files) are dropped.
export function forDraft(readiness) {
  const retarget = (t) => {
    if (!t) return null;
    if (t.kind === 'location') return { view: 'Creation', kind: 'location', id: t.id, map: true };
    if (t.kind === 'island') return { view: 'Creation', kind: 'island', members: t.members, map: true };
    if (t.kind === 'link') return { view: 'Creation', kind: 'location', id: t.from, map: true };
    if (t.kind === 'tech' && t.location) return { view: 'Creation', kind: 'location', id: t.location, map: true };
    return null;
  };
  const move = (i) => ({ ...i, view: 'Creation', ...(i.targets ? { targets: i.targets.map(retarget) } : {}) });
  return { ...readiness, critical: readiness.critical.map(move), errors: readiness.errors.map(move), warnings: readiness.warnings.map(move) };
}
