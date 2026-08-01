/**
 * memeFormat.js
 * -------------
 * Pure translation from TEMPO's internal model representation into MEME's
 * canonical JSON payload (the request body for MEME's /validate, /convert and
 * /simulate endpoints).
 *
 * MEME (Multi Energy Model Execution) is a remote, stateless translator +
 * orchestrator: it takes ONE canonical model and emits/solves it on PyPSA,
 * Calliope 0.7 and/or AdOpT-NET0 (chosen by the request's ?target=). TEMPO's
 * own per-engine translators are bypassed on a remote run — MEME does that
 * step — so the only mapping TEMPO owns for the remote path is
 * internal → MEME-canonical (here) and, on the way back, MEME's frozen-contract
 * JSON → Results (no mapping needed; MEME is extended to emit the contract).
 *
 * Scope (v2, step 1): a single plain run. Scenario/sweep expansion, SPORES and
 * file-backed resource timeseries are deliberately out of scope and warned
 * about rather than half-mapped.
 *
 * This module is PURE (no fetch, no secrets): it returns the `{ model, experiment }`
 * Job body. memeClient.js injects the top-level `api_key` and the ?target= query.
 *
 * The canonical schema is documented in MEME's README §4 and published as
 * docs/revised_unified_schema.json in the MEME repo; a JSON-Schema validation
 * test should be added once that file is vendored here (see the test module).
 */

// MEME ?target= value per TEMPO engine. Only these three engines can run
// remotely; Calliope 0.6.8 and OSeMOSYS have no MEME target and always run
// locally (the caller must not route them here).
export const MEME_TARGET_FOR_ENGINE = {
  pypsa: 'pypsa',
  calliope07: 'calliope',
  adoptnet0: 'adopt-net0',
};

/** True if an engine id can be executed on a MEME remote. */
export function engineSupportedByMeme(engine) {
  return engine in MEME_TARGET_FOR_ENGINE;
}

// internal 0.6 `parent` → MEME `role`. transmission is NOT a role — it maps to
// the top-level `transmission` block, built from links below.
const ROLE_FOR_PARENT = {
  supply: 'supply',
  supply_plus: 'supply',
  demand: 'demand',
  storage: 'storage',
  conversion: 'conversion',
  conversion_plus: 'conversion',
};

// internal monetary cost key → MEME tech cost field. interest_rate and lifetime
// are top-level tech fields, handled separately.
const COST_MAP = {
  energy_cap: 'investment_per_capacity',
  storage_cap: 'investment_per_energy_capacity',
  om_annual: 'fixed_om',
  om_prod: 'variable_om',
  om_con: 'variable_om',
  purchase: 'purchase',
};

// internal run mode → MEME experiment.mode
const MODE_MAP = {
  plan: 'plan',
  operate: 'operate',
  spores: 'alternatives',
};

const INF = 1e14;

// Produce an identifier accepted by every target. Calliope 0.7 is the strictest:
// ids must match ^[^_^\d][\w]*$ — no leading digit/underscore, and only word
// characters (so hyphens are out). Applied uniformly, so a node id and every
// reference to it (placement keys, transmission from/to) stay consistent.
function safeId(name) {
  let s = String(name ?? '').trim();
  s = s.replace(/::/g, '__').replace(/:/g, '_');
  s = s.replace(/[^A-Za-z0-9]+/g, '_');       // hyphens & any other punctuation → _
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(s)) s = 'n_' + s;          // no leading digit (e.g. 110_kv → n_110_kv)
  return s || 'unknown';
}

function isInf(v) {
  if (typeof v === 'string') return /^-?\.?inf$/i.test(v.trim());
  return typeof v === 'number' && Math.abs(v) >= INF;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const parentOf = (t) => t.essentials?.parent || t.parent || 'supply';
const techIdOf = (t) => safeId(t.name || t.id);

/**
 * Build a resolver for internal `file=<csv>:<column>` resource references.
 * Reads the model's timeSeries CSVs, and on demand materializes a referenced
 * column into a MEME inline timeseries (deduped), returning its generated id.
 * The accumulated `timeseries` object becomes model.timeseries.
 */
// Extract { column → number[] } from a timeSeries entry — either the parsed
// `data` rows (present for the currently-loaded model) or the raw `csvContent`
// string (all that's kept for other saved models). First CSV column is the
// timestamp; the rest are data columns (names may contain spaces).
function columnsFromTs(ts) {
  if (Array.isArray(ts.data) && ts.data.length) {
    const dateCol = ts.dateColumn || (ts.columns || [])[0];
    const cols = ts.dataColumns || (ts.columns || []).filter((cc) => cc !== dateCol);
    const colMap = {};
    for (const col of cols) colMap[col] = ts.data.map((r) => Number(r[col]));
    return colMap;
  }
  if (typeof ts.csvContent === 'string' && ts.csvContent.trim()) {
    const raw = ts.csvContent.charCodeAt(0) === 0xFEFF ? ts.csvContent.slice(1) : ts.csvContent;
    const lines = raw.trim().split(/\r?\n/);
    if (lines.length < 2) return {};
    const dataCols = lines[0].split(',').slice(1).map((h) => h.trim());
    const colMap = {};
    dataCols.forEach((col) => { colMap[col] = []; });
    for (let r = 1; r < lines.length; r++) {
      const vals = lines[r].split(',');
      dataCols.forEach((col, i) => { colMap[col].push(Number(vals[i + 1])); });
    }
    return colMap;
  }
  return {};
}

function makeTsContext(model) {
  const files = new Map(); // fileName → { column → number[] }
  for (const ts of model.timeSeries || []) {
    const fname = ts.fileName || ts.file;
    if (!fname) continue;
    const colMap = columnsFromTs(ts);
    if (Object.keys(colMap).length) files.set(fname, colMap);
  }

  const timeseries = {};
  const idByKey = new Map();

  /** @returns {string|null} the inline-timeseries id, or null if unresolvable. */
  const register = (ref, { abs = false } = {}) => {
    if (typeof ref !== 'string' || !ref.startsWith('file=')) return null;
    const key = `${ref}|${abs}`;
    if (idByKey.has(key)) return idByKey.get(key);
    const body = ref.slice(5);
    const sep = body.indexOf(':');
    if (sep < 0) return null;
    const fname = body.slice(0, sep);
    const col = body.slice(sep + 1);
    const colMap = files.get(fname);
    let values = colMap ? colMap[col] : null;
    if (!values || !values.length) return null;
    if (abs) values = values.map((v) => Math.abs(v));
    const id = safeId(`ts_${fname.replace(/\.csv$/i, '')}_${col}`);
    timeseries[id] = { source: 'inline', values };
    idByKey.set(key, id);
    return id;
  };

  return { timeseries, register };
}

// ---------------------------------------------------------------------------
// Constraints / costs → MEME tech fields
// ---------------------------------------------------------------------------

/**
 * Fold an internal constraints dict into MEME tech fields on `out`
 * (capacity / efficiency / storage / demand_profile / source). Mutates `out`.
 * Unmapped keys are warned about and dropped.
 */
function applyConstraints(out, constraints, role, log, ctx, tsCtx) {
  const c = { ...(constraints || {}) };
  delete c.lifetime; // → tech.lifetime, handled by caller

  const cap = {};
  if ('energy_cap_max' in c) {
    if (isInf(c.energy_cap_max)) cap.expandable = true;
    else { cap.max = num(c.energy_cap_max); cap.expandable = true; }
    delete c.energy_cap_max;
  }
  if ('energy_cap_min' in c) { cap.min = num(c.energy_cap_min); delete c.energy_cap_min; }
  if ('energy_cap_equals' in c) {
    cap.existing = num(c.energy_cap_equals);
    cap.expandable = false;
    delete c.energy_cap_equals;
  }
  if (Object.keys(cap).length) out.capacity = cap;

  if ('energy_eff' in c) { out.efficiency = num(c.energy_eff); delete c.energy_eff; }

  const storage = {};
  if ('storage_cap_max' in c) {
    storage.energy_capacity = { ...(storage.energy_capacity || {}), max: num(c.storage_cap_max) };
    delete c.storage_cap_max;
  }
  if ('storage_cap_min' in c) {
    storage.energy_capacity = { ...(storage.energy_capacity || {}), min: num(c.storage_cap_min) };
    delete c.storage_cap_min;
  }
  if ('storage_cap_equals' in c) {
    storage.energy_capacity = { ...(storage.energy_capacity || {}), existing: num(c.storage_cap_equals) };
    delete c.storage_cap_equals;
  }
  if (Object.keys(storage).length) out.storage = { ...(out.storage || {}), ...storage };

  const force = !!c.force_resource;
  delete c.force_resource;
  if ('resource' in c) {
    const r = c.resource;
    delete c.resource;
    const fileRef = typeof r === 'string' && r.startsWith('file=');
    if (role === 'demand') {
      // internal demand is a negative sink; MEME demand_profile is positive.
      if (typeof r === 'number') {
        out.demand_profile = Math.abs(r);
      } else if (fileRef) {
        const id = tsCtx?.register(r, { abs: true });
        if (id) out.demand_profile = id;
        else log.push(`⚠ ${ctx}: demand timeseries '${r}' could not be resolved — dropped`);
      } else if (r != null) {
        out.demand_profile = r;
      }
    } else if (role === 'supply') {
      if (fileRef) {
        // a per-timestep availability series → capacity-factor bound (max_pu)
        const id = tsCtx?.register(r, { abs: false });
        if (id) out.operation = { ...(out.operation || {}), max_pu: id };
        else log.push(`⚠ ${ctx}: availability timeseries '${r}' could not be resolved — dropped`);
      } else if (isInf(r)) {
        // resource: inf → an unlimited source (the import/slack tech). Calliope
        // leaves energy_cap unbounded; MEME defaults an unspecified supply
        // capacity to 0, so make it explicitly expandable/unbounded — otherwise
        // the source can never produce and demand is unservable → infeasible.
        out.capacity = { ...(out.capacity || {}), expandable: true };
      } else if (typeof r === 'number') {
        // scalar resource is Calliope-only in MEME (source.max, curtailable)
        out.source = { ...(out.source || {}), max: r };
      }
      if (force) log.push(`⚠ ${ctx}: force_resource (source_use_equals) not mapped — using a curtailable bound`);
    }
  }

  for (const key of Object.keys(c)) {
    log.push(`⚠ ${ctx}: constraint '${key}' has no MEME canonical field — dropped`);
  }
}

/** internal costs.monetary → MEME tech `costs` block (single 'monetary' class). */
function buildCosts(costs, log, ctx) {
  const monetary = costs?.monetary;
  if (!monetary || typeof monetary !== 'object') return null;
  const out = {};
  for (const [key, raw] of Object.entries(monetary)) {
    if (key === 'interest_rate') continue; // → tech.interest_rate
    if (key in COST_MAP) {
      const v = num(raw);
      if (v != null) out[COST_MAP[key]] = v;
    } else {
      log.push(`⚠ ${ctx}: cost '${key}' has no MEME canonical field — dropped`);
    }
  }
  return Object.keys(out).length ? { monetary: out } : null;
}

/** Assign carrier_in/carrier_out on a MEME tech per its role. */
function applyCarriers(out, ess, role) {
  const carrier = ess.carrier;
  const cIn = ess.carrier_in || carrier || 'electricity';
  const cOut = ess.carrier_out || carrier || 'electricity';
  if (role === 'supply') {
    out.carrier_out = cOut;
  } else if (role === 'demand') {
    out.carrier_in = cIn;
  } else if (role === 'storage') {
    const single = carrier || cIn || cOut;
    out.carrier_in = single;
    out.carrier_out = single;
  } else if (role === 'conversion') {
    out.carrier_in = cIn;
    out.carrier_out = cOut;
  }
}

// ---------------------------------------------------------------------------
// internal → MEME canonical (the whole model)
// ---------------------------------------------------------------------------

/**
 * Translate a TEMPO internal model into a MEME canonical Job body.
 *
 * @param {object} model  TEMPO internal model: { name, technologies[], locations[],
 *                        links[], metadata:{ modelConfig, runConfig, subsetTime } }
 * @param {object} [opts]
 * @param {string} [opts.mode]      internal run mode ('plan'|'operate'|'spores')
 * @param {string} [opts.objective] 'min_cost' (default) | 'min_emissions'
 * @param {string} [opts.solver]    solver name hint (MEME forces per target anyway)
 * @param {string} [opts.currency]
 * @param {number} [opts.currencyYear]
 * @param {string} [opts.resolution] time resolution, default '1H'
 * @returns {{ payload: { model: object, experiment: object }, log: string[] }}
 */
export function internalToMemeCanonical(model, opts = {}) {
  const log = [];
  const technologies = model.technologies || [];
  const locations = model.locations || [];
  const links = model.links || [];
  const meta = model.metadata || {};
  // The Run payload carries modelConfig/runConfig at the top level (the live
  // choices for this run); imported models carry them under metadata. Top-level
  // wins so a run's chosen dates/mode take precedence over a model's saved ones.
  const modelCfg = model.modelConfig || meta.modelConfig || {};
  const runCfg = model.runConfig || meta.runConfig || {};

  const tsCtx = makeTsContext(model);

  const techById = new Map();
  for (const t of technologies) techById.set(techIdOf(t), t);

  const resolveTechId = (ref) => {
    const sid = safeId(ref);
    if (techById.has(sid)) return sid;
    const match = technologies.find((t) => t.name === ref || t.id === ref);
    return match ? techIdOf(match) : sid;
  };

  // ── Placement: which nodes each (non-transmission) tech sits on, plus any
  //    per-node constraint/cost overrides and per-node demand profiles. ──────
  const nodesForTech = new Map();       // techId → string[]
  const overridesForTech = new Map();   // techId → { node → overrideObj }

  const addNode = (tid, node) => {
    if (!nodesForTech.has(tid)) nodesForTech.set(tid, []);
    const arr = nodesForTech.get(tid);
    if (!arr.includes(node)) arr.push(node);
  };
  const addOverride = (tid, node, patch) => {
    if (!patch || !Object.keys(patch).length) return;
    if (!overridesForTech.has(tid)) overridesForTech.set(tid, {});
    const byNode = overridesForTech.get(tid);
    byNode[node] = { ...(byNode[node] || {}), ...patch };
  };

  for (const loc of locations) {
    const nodeId = safeId(loc.name || loc.id);
    for (const [ref, cfg] of Object.entries(loc.techs || {})) {
      const tid = resolveTechId(ref);
      const tech = techById.get(tid);
      if (!tech) { log.push(`⚠ node '${nodeId}': references unknown tech '${ref}' — skipped`); continue; }
      if (parentOf(tech) === 'transmission') continue; // links carry these
      addNode(tid, nodeId);

      if (cfg && typeof cfg === 'object') {
        const per = cfg.constraints || cfg;
        const patch = {};
        applyConstraints(patch, per, ROLE_FOR_PARENT[parentOf(tech)], log, `${nodeId}.${tid}`, tsCtx);
        const costs = buildCosts(cfg.costs, log, `${nodeId}.${tid}`);
        if (costs) patch.costs = costs;
        addOverride(tid, nodeId, patch);
      }
    }
  }

  // ── Technologies ──────────────────────────────────────────────────────────
  const memeTechs = {};
  const carriers = new Set();
  for (const tech of technologies) {
    const id = techIdOf(tech);
    const parent = parentOf(tech);
    if (parent === 'transmission') continue; // handled via transmission/links

    const role = ROLE_FOR_PARENT[parent];
    if (!role) { log.push(`⚠ tech '${id}': class '${parent}' has no MEME role — skipped`); continue; }

    const nodes = nodesForTech.get(id);
    if (!nodes || !nodes.length) {
      log.push(`⚠ tech '${id}': not placed at any node — skipped (MEME requires a node)`);
      continue;
    }

    const ess = tech.essentials || {};
    const out = { role, node: nodes.length === 1 ? nodes[0] : nodes };
    applyCarriers(out, ess, role);
    if (out.carrier_in) carriers.add(out.carrier_in);
    if (out.carrier_out) carriers.add(out.carrier_out);

    applyConstraints(out, tech.constraints, role, log, id, tsCtx);

    const costs = buildCosts(tech.costs, log, id);
    if (costs) out.costs = costs;

    const lifetime = num(tech.constraints?.lifetime);
    if (lifetime != null) out.lifetime = lifetime;
    const interest = num(tech.costs?.monetary?.interest_rate);
    if (interest != null) out.interest_rate = interest;
    out.cost_basis = 'overnight';

    const overrides = overridesForTech.get(id);
    if (overrides && Object.keys(overrides).length) out.node_overrides = overrides;

    // MEME requires a tech-level demand_profile on a demand tech. When the
    // profile is per-node (via node_overrides), borrow one as the default so
    // validation passes — every node still gets its own via the override.
    if (role === 'demand' && out.demand_profile == null && overrides) {
      for (const node of Object.keys(overrides)) {
        if (overrides[node].demand_profile != null) { out.demand_profile = overrides[node].demand_profile; break; }
      }
    }

    memeTechs[id] = out;
  }

  // ── Transmission (from links + transmission tech defs) ───────────────────
  const transmission = {};
  const txDefs = new Map();
  for (const tech of technologies) {
    if (parentOf(tech) === 'transmission') txDefs.set(techIdOf(tech), tech);
  }
  for (const link of links) {
    const from = safeId(link.from);
    const to = safeId(link.to);
    if (!from || !to) continue;
    const def = txDefs.get(resolveTechId(link.tech)) || txDefs.get(safeId(link.tech));
    const ess = def?.essentials || {};
    const carrier = ess.carrier || ess.carrier_out || 'electricity';
    carriers.add(carrier);

    const entry = { carrier, from, to, bidirectional: link.oneWay ? false : true };

    // Capacity: a positive link capacity wins; otherwise inherit the
    // transmission tech's energy_cap_* constraints. Without this a link with a
    // tech-level cap (the common case) would emit no capacity and PyPSA would
    // fix it at 0 → infeasible.
    // A link capacity of 0 (the common case here) means "unspecified — optimize
    // freely" in TEMPO: Calliope treats an unset link cap as unbounded. It must
    // NOT become capacity.max = 0, which MEME emits as flow_cap_max: 0 and
    // islands the node → infeasible. So 0/absent ⇒ expandable with no max.
    const txc = def?.constraints || {};
    const cap = {};
    const linkCap = num(link.capacity);
    const capMax = linkCap != null && linkCap > 0 ? linkCap : txc.energy_cap_max;
    if (capMax != null && !isInf(capMax) && num(capMax) > 0) {
      cap.max = num(capMax);
      cap.expandable = true;
    } else {
      cap.expandable = true; // unbounded — build transmission as needed
    }
    if (txc.energy_cap_equals != null) { cap.existing = num(txc.energy_cap_equals); cap.expandable = false; }
    if (txc.energy_cap_min != null) cap.min = num(txc.energy_cap_min);
    if (Object.keys(cap).length) entry.capacity = cap;

    if (link.distance != null && link.distance !== 0) entry.distance = num(link.distance);
    const eff = num(txc.energy_eff);
    if (eff != null) entry.efficiency = eff;
    const costs = buildCosts(def?.costs, log, `link ${from}→${to}`);
    if (costs) entry.costs = costs;

    transmission[`${safeId(link.tech || 'transmission')}_${from}_${to}`] = entry;
  }

  // ── Nodes (coords all-or-nothing, matching Calliope 0.7's requirement) ────
  const coordOf = (loc) => {
    const lat = loc.lat ?? loc.latitude;
    const lon = loc.lng ?? loc.lon ?? loc.longitude;
    return (lat != null && lat !== '' && lon != null && lon !== '')
      ? { lat: Number(lat), lon: Number(lon) } : null;
  };
  const emitCoords = locations.length > 0 && locations.every((l) => coordOf(l) != null);
  if (!emitCoords && locations.some((l) => coordOf(l) != null)) {
    const missing = locations.filter((l) => coordOf(l) == null).length;
    log.push(`⚠ node coordinates dropped: ${missing}/${locations.length} node(s) lack lat/lon (all-or-nothing)`);
  }
  const nodes = {};
  for (const loc of locations) {
    const nodeId = safeId(loc.name || loc.id);
    const node = {};
    if (emitCoords) node.coords = coordOf(loc);
    nodes[nodeId] = node;
  }

  // ── Carriers ──────────────────────────────────────────────────────────────
  const carriersBlock = {};
  for (const cid of carriers) carriersBlock[cid] = {};

  // ── Time window ───────────────────────────────────────────────────────────
  // Live run dates (modelConfig) win; fall back to a saved subsetTime, then a default.
  const subset = (modelCfg.startDate && modelCfg.endDate)
    ? [modelCfg.startDate, modelCfg.endDate]
    : (meta.subsetTime || model.subsetTime || ['2005-01-01', '2005-01-07']);
  const start = String(subset[0]).slice(0, 10);
  const end = String(subset[1]).slice(0, 10);
  const time = {
    start,
    end,
    // MEME labels the full series from start+resolution but only *slices* the
    // run when time.subset has two elements (emitter.go:60 → config.init.subset.
    // timesteps). Without this it always solves the whole series (the full year).
    //
    // The bounds carry a 'T00:00'/'T23:00' time component (no seconds): MEME
    // emits them UNQUOTED, and a bare 'YYYY-MM-DD' would be parsed by PyYAML as
    // a datetime.date, which Calliope 0.7's pydantic schema rejects (it wants a
    // string). The 'THH:MM' form doesn't match YAML's timestamp resolver, so it
    // stays a string. End-of-day (23:00) keeps the window inclusive of the last
    // day, matching a local run.
    subset: [`${start}T00:00`, `${end}T23:00`],
    resolution: opts.resolution || modelCfg.resolution || '1H',
  };

  // ── Assemble ──────────────────────────────────────────────────────────────
  const metadataBlock = { name: model.name || modelCfg.name || 'TEMPO Model' };
  if (opts.currency) metadataBlock.currency = opts.currency;
  if (opts.currencyYear) metadataBlock.currency_year = opts.currencyYear;

  const memeModel = {
    metadata: metadataBlock,
    time,
    carriers: carriersBlock,
    nodes,
    technologies: memeTechs,
  };
  if (Object.keys(tsCtx.timeseries).length) memeModel.timeseries = tsCtx.timeseries;
  if (Object.keys(transmission).length) memeModel.transmission = transmission;

  const mode = opts.mode || modelCfg.mode || runCfg.mode || 'plan';
  // Unmet-demand slack. TEMPO enables ensure_feasibility by default on local
  // runs; MEME only emits config.build.ensure_feasibility when this flag is set
  // (emitter.go:134). Without it a model whose peak demand exceeds a feeder's
  // capacity is reported infeasible even though it solves fine locally.
  const ensureFeasibility = modelCfg.ensureFeasibility ?? true;
  const experiment = {
    mode: MODE_MAP[mode] || 'plan',
    objective: opts.objective || 'min_cost',
    allow_unmet_demand: { enabled: !!ensureFeasibility },
    solver: { name: opts.solver || runCfg.solver || 'highs' },
  };

  return { payload: { model: memeModel, experiment }, log };
}
