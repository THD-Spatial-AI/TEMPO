/**
 * calliope07Format.js
 * -------------------
 * Pure translation between Calliope 0.7 model documents and TEMPO's internal
 * (0.6-flavoured) model representation.
 *
 * All parameter renames come from python/calliope07_mapping.json — the SAME
 * table the Python 0.7 runner uses (bundled at build time), so the mapping
 * can never drift between the run, import, and export paths. Only structural
 * transforms live here.
 *
 * Used by CalliopeYAMLImporter.jsx (0.7 archive import) and Export.jsx
 * (0.7 archive export).
 */

import mapping from '../../python/calliope07_mapping.json';

const TECH_PARAMS = mapping.tech_params;       // 0.6 → 0.7
const EQUALS_PARAMS = mapping.equals_params;   // 0.6 X_equals → [min, max]
const COST_PARAMS = mapping.cost_params;       // 0.6 cost key → 0.7 cost_*
const BASE_TECH = mapping.base_tech;           // 0.6 parent → {base_tech, extra}
const MODE_MAP = mapping.mode_map;             // 0.6 plan → 0.7 base

// 0.6 keys that are deprecated aliases — excluded when building the
// 0.7 → 0.6 inverse so the canonical name wins.
const DEPRECATED_06_KEYS = new Set(['charge_rate']);

// Inverse tables (0.7 → 0.6)
const TECH_PARAMS_INV = {};
for (const [k06, k07] of Object.entries(TECH_PARAMS)) {
  if (!DEPRECATED_06_KEYS.has(k06) && !(k07 in TECH_PARAMS_INV)) TECH_PARAMS_INV[k07] = k06;
}
const COST_PARAMS_INV = {};
for (const [k06, k07] of Object.entries(COST_PARAMS)) {
  if (!(k07 in COST_PARAMS_INV)) COST_PARAMS_INV[k07] = k06;
}
const MODE_MAP_INV = {};
for (const [k06, k07] of Object.entries(MODE_MAP)) MODE_MAP_INV[k07] = k06;

// 0.7 source/sink params → internal 'resource' semantics
const SOURCE_SINK_INV = {
  sink_use_equals: { param: 'resource', force: true, sign: -1 },
  sink_use_max: { param: 'resource', force: false, sign: -1 },
  source_use_equals: { param: 'resource', force: true, sign: 1 },
  source_use_max: { param: 'resource', force: false, sign: 1 },
};

function safeId(name) {
  let s = String(name ?? '').trim();
  s = s.replace(/::/g, '__').replace(/:/g, '_');
  s = s.replace(/[^A-Za-z0-9_-]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'unknown';
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a merged Calliope model document is 0.6 or 0.7 format.
 * @param {object} doc  merged YAML document
 * @returns {'0.6'|'0.7'}
 */
export function detectCalliopeFormat(doc) {
  if (!doc || typeof doc !== 'object') return '0.6';
  if (doc.nodes || doc.data_tables || doc.data_sources) return '0.7';
  if (doc.config && (doc.config.init || doc.config.build || doc.config.solve)) return '0.7';
  const techs = doc.techs || {};
  for (const t of Object.values(techs)) {
    if (t && typeof t === 'object') {
      if ('base_tech' in t) return '0.7';
      if ('essentials' in t) return '0.6';
    }
  }
  if (doc.locations || doc.run || doc.tech_groups) return '0.6';
  return '0.6';
}

// ---------------------------------------------------------------------------
// 0.7 → internal (import)
// ---------------------------------------------------------------------------

/** Resolve 0.7 `template:` references (templates may themselves use templates). */
function resolveTemplate(entity, templates, seen = new Set()) {
  if (!entity || typeof entity !== 'object' || !entity.template) return entity;
  const name = entity.template;
  if (seen.has(name)) return entity;
  seen.add(name);
  const base = resolveTemplate(templates[name] || {}, templates, seen);
  const { template: _ignored, ...rest } = entity;
  return { ...base, ...rest };
}

/** Unwrap a 0.7 cost value: {data, index: monetary, dims: costs} → number. */
function unwrapCost(val, log, ctx) {
  if (val && typeof val === 'object' && 'data' in val) {
    const idx = val.index;
    const isMonetary = idx == null || idx === 'monetary'
      || (Array.isArray(idx) && idx.length === 1 && idx[0] === 'monetary');
    if (!isMonetary) {
      log.push(`⚠ ${ctx}: non-monetary cost index ${JSON.stringify(idx)} dropped`);
      return null;
    }
    if (Array.isArray(val.data)) return val.data[0];
    return val.data;
  }
  return val;
}

/**
 * Translate flat 0.7 tech params into internal constraints/costs, splitting
 * source/sink params back into the 0.6 'resource' convention.
 */
function paramsToInternal(params, log, ctx) {
  const constraints = {};
  const costs = {};
  const fileRefs = {};   // param values like 'file=x.csv:col' pass through as resource refs

  for (const [key, raw] of Object.entries(params || {})) {
    if (key in SOURCE_SINK_INV) {
      const { param, force, sign } = SOURCE_SINK_INV[key];
      if (typeof raw === 'string' && raw.startsWith('file=')) {
        fileRefs[param] = raw;
      } else if (typeof raw === 'number') {
        constraints[param] = key.startsWith('sink') ? sign * Math.abs(raw) : raw;
      } else {
        constraints[param] = raw;
      }
      if (force) constraints.force_resource = true;
      continue;
    }
    if (key in COST_PARAMS_INV) {
      const v = unwrapCost(raw, log, `${ctx}.${key}`);
      if (v != null) costs[COST_PARAMS_INV[key]] = v;
      continue;
    }
    if (key in TECH_PARAMS_INV) {
      constraints[TECH_PARAMS_INV[key]] = raw;
      continue;
    }
    if (key.startsWith('cost_')) {
      log.push(`⚠ ${ctx}: unknown 0.7 cost parameter '${key}' dropped`);
      continue;
    }
    log.push(`⚠ ${ctx}: 0.7 parameter '${key}' has no internal equivalent — dropped`);
  }

  return { constraints, costs, fileRefs };
}

const TECH_META_KEYS = new Set(['base_tech', 'name', 'color', 'carrier_in', 'carrier_out',
  'carrier_export', 'template', 'link_from', 'link_to', 'distance', 'one_way',
  'include_storage', 'active']);

/** One flat 0.7 tech → internal tech shape (essentials/constraints/costs). */
function techToInternal(id, tech07, log) {
  const base = tech07.base_tech || 'supply';
  const parent = (base === 'supply' && tech07.include_storage) ? 'supply_plus' : base;

  const isStorageTrans = base === 'storage' || base === 'transmission';
  const carrierIn = tech07.carrier_in ?? null;
  const carrierOut = tech07.carrier_out ?? null;

  const params = {};
  for (const [k, v] of Object.entries(tech07)) {
    if (!TECH_META_KEYS.has(k)) params[k] = v;
  }
  const { constraints, costs, fileRefs } = paramsToInternal(params, log, id);
  for (const [param, ref] of Object.entries(fileRefs)) constraints[param] = ref;

  return {
    name: id,
    parent,
    description: tech07.name || id,
    essentials: {
      name: tech07.name || id,
      color: tech07.color || null,
      parent,
      carrier_out: isStorageTrans || base === 'demand' ? null : (carrierOut || 'electricity'),
      carrier_in: isStorageTrans ? null
        : base === 'demand' ? (carrierIn || 'electricity')
          : base === 'conversion' ? (carrierIn || 'electricity')
            : carrierIn,
      carrier: isStorageTrans ? (carrierIn || carrierOut || 'electricity') : null,
      ...(tech07.carrier_export != null ? { export_carrier: tech07.carrier_export } : {}),
    },
    constraints,
    costs: Object.keys(costs).length ? { monetary: costs } : {},
  };
}

/**
 * Translate a merged Calliope 0.7 document + its files into the same result
 * shape produced by the 0.6 importer path:
 *   { modelName, locations, links, technologies, timeSeries,
 *     runConfig, subsetTime, overrides, scenarios, log }
 *
 * @param {object} doc       merged 0.7 YAML document
 * @param {Map}    filesMap  filename → text content (CSVs)
 * @param {object} papa      the papaparse module (injected to keep this file dependency-light)
 */
export function from07ToInternal(doc, filesMap, papa) {
  const log = ['Detected Calliope 0.7 model format'];
  const templates = doc.templates || {};
  if (Object.keys(templates).length) {
    log.push(`Found ${Object.keys(templates).length} templates (resolved inline)`);
  }

  // ── Techs: split link techs (link_from/link_to) from regular techs ────────
  const technologies = [];
  const links = [];
  const linkTechDefs = new Map();   // representative tech def per link tech id

  for (const [id, raw] of Object.entries(doc.techs || {})) {
    if (!raw || typeof raw !== 'object') continue;
    const tech07 = resolveTemplate(raw, templates);
    if (tech07.active === false) { log.push(`Skipped inactive tech '${id}'`); continue; }

    if (tech07.base_tech === 'transmission' || tech07.link_from || tech07.link_to) {
      const from = tech07.link_from || '';
      const to = tech07.link_to || '';
      if (from && to) {
        links.push({
          from, to, tech: id,
          capacity: tech07.flow_cap_max ?? tech07.flow_cap_min ?? 0,
          distance: tech07.distance ?? 0,
        });
      }
      linkTechDefs.set(id, tech07);
      continue;
    }
    technologies.push(techToInternal(id, tech07, log));
  }

  // Link techs become internal transmission tech definitions
  for (const [id, def] of linkTechDefs.entries()) {
    technologies.push(techToInternal(id, { ...def, base_tech: 'transmission' }, log));
  }
  log.push(`Found ${technologies.length} technologies`);
  log.push(`Found ${links.length} links (from transmission techs)`);

  // ── Nodes → locations ─────────────────────────────────────────────────────
  const locations = Object.entries(doc.nodes || {}).map(([name, rawNode]) => {
    const node = resolveTemplate(rawNode || {}, templates);
    const lat = node.latitude ?? 0;
    const lon = node.longitude ?? 0;
    const techs = {};
    for (const [tid, tcfg] of Object.entries(node.techs || {})) {
      if (linkTechDefs.has(tid)) continue; // 0.7 does not put link techs on nodes, but be safe
      if (tcfg && typeof tcfg === 'object') {
        const { constraints, costs, fileRefs } = paramsToInternal(tcfg, log, `${name}.${tid}`);
        for (const [param, ref] of Object.entries(fileRefs)) constraints[param] = ref;
        techs[tid] = Object.keys(constraints).length || Object.keys(costs).length
          ? { constraints, ...(Object.keys(costs).length ? { costs: { monetary: costs } } : {}) }
          : null;
      } else {
        techs[tid] = null;
      }
    }
    return { name, latitude: lat, longitude: lon, lat, lon, type: 'site', techs };
  });
  log.push(`Found ${locations.length} locations`);

  // ── Config → runConfig / subsetTime ───────────────────────────────────────
  const cfg = doc.config || {};
  const init = cfg.init || {};
  const build = cfg.build || {};
  const solve = cfg.solve || {};
  const modelName = init.name || 'Imported Calliope 0.7 Model';

  let subsetTime = null;
  const ts = init.subset?.timesteps;
  if (Array.isArray(ts) && ts.length === 2) {
    subsetTime = [String(ts[0]).slice(0, 10), String(ts[1]).slice(0, 10)];
  }

  const runConfig = {
    solver: solve.solver || 'cbc',
    mode: MODE_MAP_INV[init.mode] || 'plan',
    ensure_feasibility: !!build.ensure_feasibility,
    cyclic_storage: doc.parameters?.cyclic_storage ?? true,
    solver_options: solve.solver_options || {},
  };

  // ── Data tables → timeSeries + per-location file= refs ───────────────────
  const timeSeries = [];
  const tables = doc.data_tables || doc.data_sources || {};
  for (const [tableId, rawTable] of Object.entries(tables)) {
    const table = rawTable || {};
    const csvPath = table.data || table.source;
    if (!csvPath) continue;
    const csvName = String(csvPath).split('/').pop();
    const content = filesMap.get(String(csvPath).replace(/\\/g, '/'))
      ?? filesMap.get(csvName) ?? null;
    if (!content) {
      log.push(`⚠ CSV not available: ${csvPath} (data table '${tableId}')`);
      continue;
    }

    const addDims = table.add_dims || {};
    const param07 = typeof addDims.parameters === 'string' ? addDims.parameters : null;
    const techId = typeof addDims.techs === 'string' ? addDims.techs : null;
    const isSink = !!param07 && param07.startsWith('sink');
    const inv = param07 ? SOURCE_SINK_INV[param07] : null;
    if (param07 && !inv) {
      log.push(`⚠ data table '${tableId}': parameter '${param07}' not supported — loaded as plain timeseries`);
    }

    const parsed = papa.parse(content, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const rawCols = parsed.meta.fields || [];
    const allCols = rawCols.map((c, i) => (i === 0 && c === '') ? 'time' : c);
    let rowData = (rawCols[0] === '')
      ? parsed.data.map(row => { const { '': dateVal, ...rest } = row; return { time: dateVal, ...rest }; })
      : parsed.data;
    const dateCol = allCols[0] || 'time';
    const dataCols = allCols.slice(1);

    // 0.7 demand values are positive; internal (0.6) convention is negative
    if (isSink) {
      rowData = rowData.map(row => {
        const out = { ...row };
        for (const c of dataCols) {
          const v = parseFloat(out[c]);
          if (!isNaN(v)) out[c] = -Math.abs(v);
        }
        return out;
      });
      log.push(`Data table '${tableId}': demand values converted to internal (negative) convention`);
    }

    const statistics = {};
    dataCols.forEach(col => {
      const vals = rowData.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (vals.length > 0) {
        statistics[col] = {
          min: Math.min(...vals),
          max: Math.max(...vals),
          mean: vals.reduce((a, b) => a + b, 0) / vals.length,
          sum: vals.reduce((a, b) => a + b, 0),
        };
      }
    });

    const refs = [];
    const locationColumns = {};
    if (inv && techId && table.columns === 'nodes') {
      // Inject internal resource refs so the run path (either engine) finds them
      for (const col of dataCols) {
        const loc = locations.find(l => l.name === col || safeId(l.name).toLowerCase() === String(col).toLowerCase());
        if (!loc) continue;
        loc.techs[techId] = loc.techs[techId] && typeof loc.techs[techId] === 'object'
          ? loc.techs[techId] : {};
        loc.techs[techId].constraints = {
          ...(loc.techs[techId].constraints || {}),
          [inv.param]: `file=${csvName}:${col}`,
          ...(inv.force ? { force_resource: true } : {}),
        };
        refs.push({ location: loc.name, tech: techId, param: inv.param, column: col });
        locationColumns[loc.name] = col;
      }
    }

    timeSeries.push({
      id: 'ts_' + csvName.replace('.csv', '') + '_' + Date.now(),
      name: csvName.replace('.csv', ''),
      fileName: csvName,
      file: csvName,
      data: rowData,
      columns: allCols,
      dateColumn: dateCol,
      dataColumns: dataCols,
      rowCount: rowData.length,
      statistics,
      locationColumns,
      refs,
      type: 'resource',
      source: 'calliope_yaml',
    });
    log.push(`Loaded CSV: ${csvName} (${dataCols.length} columns, ${rowData.length} rows)`);
  }

  // Overrides/scenarios: kept verbatim (0.7 vocabulary) — flagged so the run
  // path knows not to re-translate them.
  const overrides = doc.overrides || {};
  const scenarios = doc.scenarios || {};
  if (Object.keys(overrides).length) {
    log.push(`Found ${Object.keys(overrides).length} overrides (kept in 0.7 vocabulary)`);
  }

  return {
    modelName, locations, links, technologies, timeSeries,
    runConfig, subsetTime, overrides, scenarios, log,
    calliopeVersion: '0.7.0',
  };
}

// ---------------------------------------------------------------------------
// internal → 0.7 (export)
// ---------------------------------------------------------------------------

function wrapCost(value) {
  return { data: value, index: 'monetary', dims: 'costs' };
}

function toNumberOrInf(val) {
  if (typeof val === 'string') {
    const low = val.toLowerCase();
    if (low === 'inf' || low === '.inf') return '.inf';
    if (low === '-inf' || low === '-.inf') return '-.inf';
  }
  if (typeof val === 'number' && val >= 1e14) return '.inf';
  if (typeof val === 'number' && val <= -1e14) return '-.inf';
  return val;
}

/** Internal constraints dict → flat 0.7 params (mirrors the Python translate). */
function constraintsTo07(constraints, parent, log, ctx) {
  const out = {};
  const c = { ...(constraints || {}) };
  const force = !!c.force_resource;
  delete c.force_resource;

  if ('resource' in c) {
    const resource = toNumberOrInf(c.resource);
    delete c.resource;
    const isDemand = parent === 'demand' || parent === 'unmet_demand';
    // demand is always a fixed sink (matches the Python translate module)
    const param = isDemand
      ? mapping.resource_params.demand.forced
      : mapping.resource_params.supply[force ? 'forced' : 'max'];
    if (typeof resource === 'string' && resource.startsWith('file=')) {
      out.__resource_file__ = { ref: resource, param };
    } else if (resource === '.inf') {
      // unconstrained source — 0.7 default, omit
    } else if (typeof resource === 'number') {
      out[param] = isDemand ? Math.abs(resource) : resource;
    } else if (resource != null) {
      log.push(`⚠ ${ctx}: unsupported resource value dropped`);
    }
  }

  for (const [key, raw] of Object.entries(c)) {
    const val = toNumberOrInf(raw);
    if (key in EQUALS_PARAMS) {
      for (const target of EQUALS_PARAMS[key]) out[target] = val;
    } else if (key in TECH_PARAMS) {
      out[TECH_PARAMS[key]] = val;
    } else {
      log.push(`⚠ ${ctx}: parameter '${key}' has no Calliope 0.7 equivalent — dropped`);
    }
  }
  return out;
}

function costsTo07(costs, log, ctx) {
  const out = {};
  for (const [costClass, vals] of Object.entries(costs || {})) {
    if (costClass !== 'monetary') {
      log.push(`⚠ ${ctx}: cost class '${costClass}' dropped (0.7 export supports monetary only)`);
      continue;
    }
    if (!vals || typeof vals !== 'object') continue;
    for (const [key, raw] of Object.entries(vals)) {
      if (key in COST_PARAMS) out[COST_PARAMS[key]] = wrapCost(toNumberOrInf(raw));
      else log.push(`⚠ ${ctx}: cost '${key}' has no Calliope 0.7 equivalent — dropped`);
    }
  }
  return out;
}

/**
 * Translate a TEMPO model (internal representation) into Calliope 0.7 YAML
 * document objects + demand/timeseries CSV contents.
 *
 * @returns {{ modelDoc: object, csvs: Record<string, string>, log: string[] }}
 *   modelDoc — single 0.7 model definition (config/techs/nodes/data_tables)
 *   csvs     — filename → CSV text (positive demand, 0.7 convention)
 */
export function internalTo07Yaml(model, timeSeriesList) {
  const log = [];
  const technologies = model.technologies || [];
  const locations = model.locations || [];
  const links = model.links || [];
  const meta = model.metadata || {};
  const modelCfg = meta.modelConfig || {};
  const runCfg = meta.runConfig || {};

  const parentOf = (t) => (t.essentials?.parent) || t.parent || 'supply';
  const techId = (t) => safeId(t.name || t.id);

  // ── Techs ────────────────────────────────────────────────────────────────
  const techs07 = {};
  const transmissionDefs = {};
  for (const tech of technologies) {
    const id = techId(tech);
    const parent = parentOf(tech);
    const baseMap = BASE_TECH[parent];
    if (!baseMap) { log.push(`⚠ tech '${id}': class '${parent}' skipped`); continue; }

    const ess = tech.essentials || {};
    const out = { base_tech: baseMap.base_tech, ...(baseMap.extra || {}) };
    if (ess.name || tech.name) out.name = ess.name || tech.name;
    if (ess.color) out.color = ess.color;

    const carrier = ess.carrier;
    const cIn = ess.carrier_in || carrier;
    const cOut = ess.carrier_out || carrier;
    if (baseMap.base_tech === 'storage' || baseMap.base_tech === 'transmission') {
      out.carrier_in = cIn || cOut || 'electricity';
      out.carrier_out = cOut || cIn || 'electricity';
    } else if (baseMap.base_tech === 'demand') {
      out.carrier_in = cIn || 'electricity';
    } else if (baseMap.base_tech === 'conversion') {
      out.carrier_in = cIn || 'electricity';
      out.carrier_out = cOut || 'electricity';
    } else {
      out.carrier_out = cOut || 'electricity';
    }

    const translated = constraintsTo07(tech.constraints, parent, log, id);
    if (translated.__resource_file__) {
      // file refs are re-expressed as data tables below via timeSeries entries
      delete translated.__resource_file__;
    }
    Object.assign(out, translated, costsTo07(tech.costs, log, id));

    if (baseMap.base_tech === 'transmission') transmissionDefs[id] = out;
    else techs07[id] = out;
  }

  // ── Links → per-link transmission techs ─────────────────────────────────
  for (const link of links) {
    const from = safeId(link.from).toLowerCase();
    const to = safeId(link.to).toLowerCase();
    if (!from || !to) continue;
    const baseId = safeId(link.tech || 'ac_transmission').toLowerCase();
    const baseDef = transmissionDefs[baseId] || transmissionDefs[safeId(link.tech || '')] || {
      base_tech: 'transmission', carrier_in: 'electricity', carrier_out: 'electricity',
    };
    const entry = { ...baseDef, link_from: from, link_to: to };
    if (link.distance != null && link.distance !== 0) entry.distance = Number(link.distance);
    if (link.capacity) entry.flow_cap_max = Number(link.capacity);
    techs07[`${baseId}_${from}_${to}`] = entry;
  }

  // ── Nodes ────────────────────────────────────────────────────────────────
  const nodes07 = {};
  for (const loc of locations) {
    const nodeId = safeId(loc.name || loc.id).toLowerCase();
    const node = {};
    const lat = loc.lat ?? loc.latitude;
    const lon = loc.lng ?? loc.lon ?? loc.longitude;
    if (lat != null && lon != null) { node.latitude = lat; node.longitude = lon; }

    const techsAtNode = {};
    for (const [ref, tcfg] of Object.entries(loc.techs || {})) {
      const tid = safeId(ref);
      const techDef = technologies.find(t => techId(t) === tid || t.name === ref || t.id === ref);
      if (!techDef) continue;
      const parent = parentOf(techDef);
      if (parent === 'transmission') continue; // links carry these in 0.7
      if (tcfg && typeof tcfg === 'object') {
        const per = tcfg.constraints || tcfg;
        const translated = constraintsTo07(per, parent, log, `${nodeId}.${tid}`);
        delete translated.__resource_file__;
        techsAtNode[techId(techDef)] = Object.keys(translated).length ? translated : null;
      } else {
        techsAtNode[techId(techDef)] = null;
      }
    }
    if (Object.keys(techsAtNode).length) node.techs = techsAtNode;
    nodes07[nodeId] = node;
  }

  // ── Demand data tables (positive values, 0.7 convention) ─────────────────
  const csvs = {};
  const dataTables = {};
  const demandTechIds = technologies.filter(t => parentOf(t) === 'demand').map(techId);

  const profiledLocs = locations.filter(l => (l.demandProfile?.timeseries || []).length > 0);
  if (profiledLocs.length && demandTechIds.length) {
    const hours = 168; // one representative week; runtime tiles profiles anyway
    const header = ['timesteps', ...profiledLocs.map(l => safeId(l.name).toLowerCase())];
    const start = new Date('2005-01-01T00:00:00Z');
    const rows = [];
    for (let h = 0; h < hours; h++) {
      const ts = new Date(start.getTime() + h * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
      const row = [ts];
      for (const l of profiledLocs) {
        const series = l.demandProfile.timeseries;
        row.push(Math.abs(series[h % series.length]));
      }
      rows.push(row.join(','));
    }
    csvs['demand_profiles.csv'] = header.join(',') + '\n' + rows.join('\n') + '\n';
    for (const tid of demandTechIds) {
      dataTables[`demand_${tid}`] = {
        data: 'demand_profiles.csv',
        rows: 'timesteps',
        columns: 'nodes',
        add_dims: { parameters: 'sink_use_equals', techs: tid },
      };
    }
    log.push(`Wrote demand_profiles.csv (${profiledLocs.length} nodes, positive 0.7 convention)`);
  }

  // Existing imported timeseries CSVs pass through with sink columns flipped positive
  for (const ts of timeSeriesList || []) {
    if (!ts.fileName || !Array.isArray(ts.data) || !ts.data.length) continue;
    const cols = ts.columns || [];
    const dateCol = ts.dateColumn || cols[0];
    const dataCols = cols.filter(cc => cc !== dateCol);
    const isDemandCsv = (ts.refs || []).some(r => r.param === 'resource'
      && demandTechIds.includes(safeId(r.tech || '')));
    const lines = [[dateCol, ...dataCols].join(',')];
    for (const row of ts.data) {
      const vals = dataCols.map(cc => {
        const v = parseFloat(row[cc]);
        if (isNaN(v)) return row[cc] ?? '';
        return isDemandCsv ? Math.abs(v) : v;
      });
      lines.push([row[dateCol], ...vals].join(','));
    }
    csvs[ts.fileName] = lines.join('\n') + '\n';
    log.push(`Included timeseries CSV: ${ts.fileName}${isDemandCsv ? ' (values made positive)' : ''}`);
  }

  // ── Config ───────────────────────────────────────────────────────────────
  const mode = modelCfg.mode || runCfg.mode || 'plan';
  const subset = meta.subsetTime || [modelCfg.startDate || '2005-01-01', modelCfg.endDate || '2005-01-07'];
  const modelDoc = {
    config: {
      init: {
        name: model.name || 'TEMPO Model',
        mode: MODE_MAP[mode] || 'base',
        subset: {
          timesteps: [
            `${String(subset[0]).slice(0, 10)} 00:00:00`,
            `${String(subset[1]).slice(0, 10)} 23:00:00`,
          ],
        },
      },
      build: {
        backend: 'pyomo',
        ensure_feasibility: modelCfg.ensureFeasibility ?? runCfg.ensure_feasibility ?? true,
      },
      solve: {
        solver: 'cbc',
      },
    },
    techs: techs07,
    nodes: nodes07,
    ...(Object.keys(dataTables).length ? { data_tables: dataTables } : {}),
  };

  return { modelDoc, csvs, log };
}
