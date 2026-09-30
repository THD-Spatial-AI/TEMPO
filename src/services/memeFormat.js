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
  // om_con (per unit consumed) is role-dependent — see buildCosts.
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
  const times = new Map(); // fileName → timestamp strings (row order)
  for (const ts of model.timeSeries || []) {
    const fname = ts.fileName || ts.file;
    if (!fname) continue;
    const colMap = columnsFromTs(ts);
    if (Object.keys(colMap).length) files.set(fname, colMap);
    if (Array.isArray(ts.data) && ts.data.length) {
      const dateCol = ts.dateColumn || (ts.columns || [])[0];
      times.set(fname, ts.data.map((r) => String(r[dateCol])));
    }
  }

  const timeseries = {};
  const idByKey = new Map();

  /**
   * `file=x.csv:col`, or Calliope's implicit `file=x.csv` whose column is the
   * location name (`node`). Columns match exactly, then case-insensitively.
   * `scale` multiplies the series (e.g. resource_eff).
   * @returns {string|null} the inline-timeseries id, or null if unresolvable.
   */
  const register = (ref, { abs = false, node = null, scale = 1 } = {}) => {
    if (typeof ref !== 'string' || !ref.startsWith('file=')) return null;
    const body = ref.slice(5);
    const sep = body.indexOf(':');
    const fname = sep < 0 ? body : body.slice(0, sep);
    const wanted = sep < 0 ? node : body.slice(sep + 1);
    const colMap = files.get(fname);
    if (!colMap || wanted == null) return null;
    const col = wanted in colMap ? wanted
      : Object.keys(colMap).find((c) => c.toLowerCase() === String(wanted).toLowerCase());
    let values = col != null ? colMap[col] : null;
    if (!values || !values.length) return null;
    const key = `${fname}|${col}|${abs}|${scale}`;
    if (idByKey.has(key)) return idByKey.get(key);
    if (abs) values = values.map((v) => Math.abs(v));
    if (scale !== 1) values = values.map((v) => v * scale);
    const id = safeId(`ts_${fname.replace(/\.csv$/i, '')}_${col}${scale !== 1 ? `_x${scale}` : ''}`);
    timeseries[id] = { source: 'inline', values };
    idByKey.set(key, id);
    return id;
  };

  /** Raw { times, values } of a `file=` reference (column = node when implicit), or null. */
  const raw = (ref, node = null) => {
    if (typeof ref !== 'string' || !ref.startsWith('file=')) return null;
    const body = ref.slice(5);
    const sep = body.indexOf(':');
    const fname = sep < 0 ? body : body.slice(0, sep);
    const wanted = sep < 0 ? node : body.slice(sep + 1);
    const colMap = files.get(fname);
    if (!colMap || wanted == null || !times.has(fname)) return null;
    const col = wanted in colMap ? wanted
      : Object.keys(colMap).find((c) => c.toLowerCase() === String(wanted).toLowerCase());
    return col != null ? { times: times.get(fname), values: colMap[col] } : null;
  };

  return { timeseries, register, raw };
}

// ---------------------------------------------------------------------------
// Constraints / costs → MEME tech fields
// ---------------------------------------------------------------------------

/**
 * Fold an internal constraints dict into MEME tech fields on `out`
 * (capacity / efficiency / storage / demand_profile / source). Mutates `out`.
 * Unmapped keys are warned about and dropped.
 */
function applyConstraints(out, constraints, role, log, ctx, tsCtx, { node = null, inherited = {} } = {}) {
  const c = { ...(constraints || {}) };
  delete c.lifetime; // → tech.lifetime, handled by caller
  // Settings that shape how a node-level resource series is read may live on
  // the tech (Calliope inherits them): force_resource, resource_eff.
  const pick = (k) => (k in c ? c[k] : inherited[k]);

  const cap = {};
  if ('energy_cap_max' in c) {
    if (isInf(c.energy_cap_max)) cap.expandable = true;
    else { cap.max = num(c.energy_cap_max); cap.expandable = true; }
    delete c.energy_cap_max;
  }
  if ('energy_cap_min' in c) { cap.min = num(c.energy_cap_min); delete c.energy_cap_min; }
  if ('energy_cap_max_systemwide' in c) {
    if (!isInf(c.energy_cap_max_systemwide)) cap.systemwide_max = num(c.energy_cap_max_systemwide);
    delete c.energy_cap_max_systemwide;
  }
  if ('energy_cap_equals' in c) {
    cap.existing = num(c.energy_cap_equals);
    cap.expandable = false;
    delete c.energy_cap_equals;
  }
  if (Object.keys(cap).length) out.capacity = cap;

  if ('energy_eff' in c) {
    // 0.6 storage applies energy_eff on charge AND discharge; MEME storage has
    // no generic efficiency, only the two directions.
    if (role === 'storage') {
      out.storage = { ...(out.storage || {}), charge_eff: num(c.energy_eff), discharge_eff: num(c.energy_eff) };
    } else {
      out.efficiency = num(c.energy_eff);
    }
    delete c.energy_eff;
  }

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
    storage.energy_capacity = { ...(storage.energy_capacity || {}), existing: num(c.storage_cap_equals), expandable: false };
    delete c.storage_cap_equals;
  }
  if ('storage_loss' in c) { storage.self_discharge = num(c.storage_loss); delete c.storage_loss; }
  if ('storage_initial' in c) { storage.initial_soc = num(c.storage_initial); delete c.storage_initial; }
  // One power cap bounds charge and discharge (Calliope 0.6), so both rates.
  for (const key of ['energy_cap_per_storage_cap_max', 'energy_cap_per_storage_cap_equals']) {
    if (!(key in c)) continue;
    storage.max_charge_rate = num(c[key]);
    storage.max_discharge_rate = num(c[key]);
    if (key.endsWith('_equals')) {
      // MEME can only bound the ratio from above; pin the minimum natively.
      out.native = { ...(out.native || {}), calliope: { ...(out.native?.calliope || {}), flow_cap_per_storage_cap_min: num(c[key]) } };
    }
    delete c[key];
  }
  if (Object.keys(storage).length) out.storage = { ...(out.storage || {}), ...storage };

  const operation = {};
  if ('energy_cap_min_use' in c) { operation.min_pu = num(c.energy_cap_min_use); delete c.energy_cap_min_use; }
  if ('energy_ramping' in c) {
    operation.ramp_up = num(c.energy_ramping);
    operation.ramp_down = num(c.energy_ramping);
    delete c.energy_ramping;
  }
  if (Object.keys(operation).length) out.operation = { ...(out.operation || {}), ...operation };

  // energy_per_cap is what a per-unit availability series already means;
  // energy_prod: true is Calliope's default. Anything else is not mappable.
  if (c.resource_unit === 'energy_per_cap') delete c.resource_unit;
  if (c.energy_prod === true) delete c.energy_prod;
  const resourceEff = num(pick('resource_eff')) ?? 1;
  delete c.resource_eff;
  if ('resource_cap_equals' in c || 'resource_cap_max' in c) {
    out.source = { ...(out.source || {}), cap: num(c.resource_cap_equals ?? c.resource_cap_max) };
    delete c.resource_cap_equals;
    delete c.resource_cap_max;
  }

  const forceRaw = pick('force_resource');
  const force = !!forceRaw;
  delete c.force_resource;
  if ('resource' in c) {
    const r = c.resource;
    delete c.resource;
    const fileRef = typeof r === 'string' && r.startsWith('file=');
    if (role === 'demand') {
      // force_resource: false → a flexible sink up to the profile (export,
      // curtailment, market) rather than a demand that must be met exactly.
      if (forceRaw === false) out.demand_curtailable = true;
      // internal demand is a negative sink; MEME demand_profile is positive.
      if (typeof r === 'number') {
        out.demand_profile = Math.abs(r);
      } else if (fileRef) {
        const id = tsCtx?.register(r, { abs: true, node });
        if (id) out.demand_profile = id;
        else log.push(`⚠ ${ctx}: demand timeseries '${r}' could not be resolved — dropped`);
      } else if (r != null) {
        out.demand_profile = r;
      }
    } else if (role === 'supply') {
      if (fileRef) {
        // A per-timestep availability series (× resource_eff): a ceiling
        // (max_pu), or the exact output when force_resource is set (equals_pu).
        const id = tsCtx?.register(r, { abs: false, node, scale: resourceEff });
        if (id) out.operation = { ...(out.operation || {}), [force ? 'equals_pu' : 'max_pu']: id };
        else if (node || r.slice(5).includes(':')) log.push(`⚠ ${ctx}: availability timeseries '${r}' could not be resolved — dropped`);
        else out._implicitResource = r; // tech-level: expanded per node by the caller
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
      if (force && !fileRef) log.push(`⚠ ${ctx}: force_resource on a scalar resource not mapped — using a curtailable bound`);
    }
  }

  for (const key of Object.keys(c)) {
    log.push(`⚠ ${ctx}: constraint '${key}' has no MEME canonical field — dropped`);
  }
}

/**
 * internal costs.monetary → MEME tech `costs` block (single 'monetary' class).
 * om_con is a cost per unit consumed: on techs with an input carrier it is
 * MEME fuel_cost (Calliope cost_flow_in). A supply tech has no input flow:
 * Calliope 0.6 charges it on output / energy_eff, so it becomes a per-output
 * cost om_con / eff added to variable_om (portable; a Calliope 0.7
 * cost_source would only apply to techs with a source model).
 */
function buildCosts(costs, log, ctx, role = null, eff = 1) {
  const monetary = costs?.monetary;
  if (!monetary || typeof monetary !== 'object') return null;
  const res = {};
  for (const [key, raw] of Object.entries(monetary)) {
    if (key === 'interest_rate') continue; // → tech.interest_rate
    if (key === 'om_con') {
      const v = num(raw);
      if (v == null) continue;
      if (role === 'supply') res.variable_om = (res.variable_om ?? 0) + v / (eff || 1);
      else res.fuel_cost = v;
      continue;
    }
    if (key in COST_MAP) {
      const v = num(raw);
      if (v != null) res[COST_MAP[key]] = (COST_MAP[key] === 'variable_om' ? (res.variable_om ?? 0) : 0) + v;
    } else {
      log.push(`⚠ ${ctx}: cost '${key}' has no MEME canonical field — dropped`);
    }
  }
  return Object.keys(res).length ? { monetary: res } : null;
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

/**
 * Calliope 0.6 `model.reserve_margin` as native Calliope 0.7 math (0.7 has no
 * reserve margin). Mirrors 0.6.8's reserve_margin_constraint_rule per carrier c:
 *   Σ capacity of supply/supply_plus/conversion techs producing c
 *     ≥ (1 + margin) × Σ consumption of c by demand techs at 0.6.8's
 *       peak-demand timestep (idxmin of summed demand resource in the window).
 * MEME's conversion capacity is input-referenced, so conversions count as
 * input flow_cap × efficiency (their output flow_cap is a free variable).
 * Returns { math, data_definitions } or null.
 */
function reserveMarginNative(margins, technologies, locations, tsCtx, window, log) {
  if (!margins || !Object.keys(margins).length) return null;
  const math = { parameters: {}, constraints: {} };
  const dd = {};
  const inWindow = (t) => t.slice(0, 10) >= window[0] && t.slice(0, 10) <= window[1];
  for (const [carrier, margin] of Object.entries(margins)) {
    const m = num(margin);
    if (m == null) continue;
    const capIdx = [], capVal = [], demIdx = [];
    const demandSeries = [];
    for (const t of technologies) {
      const parent = parentOf(t);
      const ess = t.essentials || {};
      const id = techIdOf(t);
      const cOut = ess.carrier_out || ess.carrier;
      const cIn = ess.carrier_in || ess.carrier;
      if ((parent === 'supply' || parent === 'supply_plus') && cOut === carrier) {
        capIdx.push([id, carrier]); capVal.push(1);
      } else if ((parent === 'conversion' || parent === 'conversion_plus') && cOut === carrier) {
        capIdx.push([id, cIn]); capVal.push(num(t.constraints?.energy_eff) ?? 1);
      } else if (parent === 'demand' && cIn === carrier) {
        demIdx.push([id, carrier]);
        for (const loc of locations) {
          const lt = loc.techs?.[t.name];
          if (lt === undefined) continue;
          const series = tsCtx.raw((lt?.constraints || {}).resource ?? t.constraints?.resource, loc.name ?? loc.id);
          if (series) demandSeries.push(series);
        }
      }
    }
    // 0.6.8 add_max_demand_timesteps: idxmin of the summed (negative) demand resource.
    const total = new Map();
    for (const { times, values } of demandSeries) {
      times.forEach((ts, i) => { if (inWindow(ts)) total.set(ts, (total.get(ts) || 0) + Math.min(values[i], 0)); });
    }
    let peak = null;
    for (const [ts, v] of total) if (peak == null || v < total.get(peak)) peak = ts;
    if (!peak || !capIdx.length) { log.push(`⚠ reserve margin for '${carrier}': no demand series / capacity found — not applied`); continue; }
    const cap = `tempo_rm_cap_${carrier}`, dem = `tempo_rm_dem_${carrier}`, pk = `tempo_rm_peak_${carrier}`;
    dd[cap] = { data: capVal, index: capIdx, dims: ['techs', 'carriers'] };
    dd[dem] = { data: demIdx.map(() => 1), index: demIdx, dims: ['techs', 'carriers'] };
    dd[pk] = { data: 1, index: [peak], dims: 'timesteps' };
    for (const k of [cap, dem, pk]) math.parameters[k] = { default: 0 };
    math.constraints[`tempo_reserve_margin_${carrier}`] = {
      description: `Calliope 0.6 reserve margin (${m}) on ${carrier}, peak ${peak}`,
      equations: [{ expression:
        `sum(flow_cap * ${cap}, over=[nodes, techs, carriers]) >= ${+(1 + m).toFixed(12)} * ` +
        `sum(flow_in * ${dem} * ${pk}, over=[nodes, techs, carriers, timesteps])` }],
    };
  }
  return Object.keys(dd).length ? { math, data_definitions: dd } : null;
}

/** Output-referenced capacity/costs (Calliope 0.6 conversion) → input basis. */
function toInputBasis(obj, eff) {
  if (!obj || !(eff > 0) || eff === 1) return;
  const cap = obj.capacity;
  if (cap) {
    for (const k of ['max', 'min', 'existing', 'systemwide_max', 'systemwide_min']) {
      if (typeof cap[k] === 'number') cap[k] = cap[k] / eff;
    }
  }
  const m = obj.costs?.monetary;
  if (m) {
    for (const k of ['investment_per_capacity', 'fixed_om']) {
      if (typeof m[k] === 'number') m[k] = m[k] * eff;
    }
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

  const locNameOf = new Map();
  for (const loc of locations) {
    const nodeId = safeId(loc.name || loc.id);
    locNameOf.set(nodeId, loc.name ?? loc.id);
    for (const [ref, cfg] of Object.entries(loc.techs || {})) {
      const tid = resolveTechId(ref);
      const tech = techById.get(tid);
      if (!tech) { log.push(`⚠ node '${nodeId}': references unknown tech '${ref}' — skipped`); continue; }
      if (parentOf(tech) === 'transmission') continue; // links carry these
      addNode(tid, nodeId);

      if (cfg && typeof cfg === 'object') {
        const per = cfg.constraints || cfg;
        const patch = {};
        applyConstraints(patch, per, ROLE_FOR_PARENT[parentOf(tech)], log, `${nodeId}.${tid}`, tsCtx,
          { node: loc.name ?? loc.id, inherited: tech.constraints || {} });
        const costs = buildCosts(cfg.costs, log, `${nodeId}.${tid}`, ROLE_FOR_PARENT[parentOf(tech)],
          num(per?.energy_eff ?? tech.constraints?.energy_eff) ?? 1);
        if (costs) patch.costs = costs;
        addOverride(tid, nodeId, patch);
      }
    }
  }

  // ── Technologies ──────────────────────────────────────────────────────────
  const memeTechs = {};
  const tradeEntries = {};
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

    // AdOpT-NET0 is database-driven: a plain supply role has no database mapping.
    // Infinite-resource supply_plus techs (grid import / slack) map to MEME's
    // trade.import concept, which adopt_net0 natively supports.
    if (opts.engine === 'adoptnet0' && parent === 'supply_plus') {
      const r = tech.constraints?.resource;
      if (isInf(r)) {
        const ess0 = tech.essentials || {};
        const carrier = ess0.carrier_out || ess0.carrier || 'electricity';
        carriers.add(carrier);
        const price = num(tech.costs?.monetary?.om_prod ?? tech.costs?.monetary?.om_con);
        const capMax = tech.constraints?.energy_cap_max;
        const limit = (capMax != null && !isInf(capMax)) ? (num(capMax) ?? INF) : INF;
        for (const nodeId of nodes) {
          tradeEntries[`${id}_${nodeId}`] = {
            node: nodeId,
            carrier,
            import: { limit, ...(price != null && { price }) },
          };
        }
        log.push(`ℹ tech '${id}': infinite-resource supply mapped to trade import for adopt-net0`);
        continue;
      }
    }

    const ess = tech.essentials || {};
    const out = { role, node: nodes.length === 1 ? nodes[0] : nodes };
    applyCarriers(out, ess, role);
    if (out.carrier_in) carriers.add(out.carrier_in);
    if (out.carrier_out) carriers.add(out.carrier_out);

    applyConstraints(out, tech.constraints, role, log, id, tsCtx);

    const costs = buildCosts(tech.costs, log, id, role, num(tech.constraints?.energy_eff) ?? 1);
    if (costs) out.costs = costs;

    const lifetime = num(tech.constraints?.lifetime);
    if (lifetime != null) out.lifetime = lifetime;
    const interest = num(tech.costs?.monetary?.interest_rate);
    if (interest != null) out.interest_rate = interest;
    out.cost_basis = 'overnight';

    // A tech-level implicit `file=x.csv` means "each node reads its own column".
    if (out._implicitResource) {
      const ref = out._implicitResource;
      delete out._implicitResource;
      const force = !!tech.constraints?.force_resource;
      const scale = num(tech.constraints?.resource_eff) ?? 1;
      for (const nodeId of nodes) {
        const own = overridesForTech.get(id)?.[nodeId]?.operation;
        if (own?.max_pu != null || own?.equals_pu != null) continue; // node sets its own
        const tsId = tsCtx.register(ref, { node: locNameOf.get(nodeId), scale });
        if (!tsId) { log.push(`⚠ ${nodeId}.${id}: availability timeseries '${ref}' could not be resolved — dropped`); continue; }
        addOverride(id, nodeId, { operation: { ...(own || {}), [force ? 'equals_pu' : 'max_pu']: tsId } });
      }
    }

    // Cyclic storage is Calliope 0.6.8's default (the local runner keeps it);
    // a non-cyclic 0.7 model can start with free stored energy.
    const cyclic = modelCfg.cyclicStorage ?? runCfg.cyclic_storage ?? true;
    if (role === 'storage' && cyclic) out.storage = { ...(out.storage || {}), cyclic: true };

    // Calliope 0.6 conversion capacity/costs are per unit of OUTPUT; MEME's
    // canonical conversion capacity is input-referenced (PyPSA link p_nom).
    if (role === 'conversion') {
      const eff = num(tech.constraints?.energy_eff) ?? 1;
      toInputBasis(out, eff);
      for (const [nodeId, ov] of Object.entries(overridesForTech.get(id) || {})) {
        const nodeCfg = locations.find(l => safeId(l.name || l.id) === nodeId)?.techs?.[tech.name];
        toInputBasis(ov, num((nodeCfg?.constraints || nodeCfg)?.energy_eff) ?? eff);
      }
    }

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
    // Imported YAML links carry their own per-link tech config (linkConfig) and
    // the constraint the capacity came from (capacityKey): existing lines are
    // energy_cap_equals (fixed), new ones energy_cap_max (expandable).
    const lcc = link.linkConfig?.constraints || {};
    const txc = { ...(def?.constraints || {}), ...lcc };
    const cap = {};
    const linkCap = num(link.capacity);
    if (link.capacityKey === 'energy_cap_equals' && linkCap != null) {
      cap.existing = linkCap;
      cap.expandable = false;
    } else if (link.capacityKey === 'energy_cap_min' && linkCap != null) {
      cap.min = linkCap;
      cap.expandable = true;
    } else {
      const capMax = linkCap != null && linkCap > 0 ? linkCap : txc.energy_cap_max;
      if (capMax != null && !isInf(capMax) && num(capMax) > 0) {
        cap.max = num(capMax);
        cap.expandable = true;
      } else {
        cap.expandable = true; // unbounded — build transmission as needed
      }
      if (!link.capacityKey && txc.energy_cap_equals != null) { cap.existing = num(txc.energy_cap_equals); cap.expandable = false; }
      if (!link.capacityKey && txc.energy_cap_min != null) cap.min = num(txc.energy_cap_min);
    }
    if (Object.keys(cap).length) entry.capacity = cap;

    if (link.distance != null && link.distance !== 0) entry.distance = num(link.distance);
    const eff = num(txc.energy_eff);
    if (eff != null) entry.efficiency = eff;
    const techCosts = buildCosts(def?.costs, log, `link ${from}→${to}`)?.monetary || {};
    const linkCosts = buildCosts(link.linkConfig?.costs, log, `link ${from}→${to}`)?.monetary || {};
    const monetary = { ...techCosts, ...linkCosts }; // per-link costs override the tech's
    if (Object.keys(monetary).length) entry.costs = { monetary };
    // Annualisation of the link investment: canonical links have no lifetime /
    // interest-rate fields, so pass Calliope's natively.
    const lifetime = num(lcc.lifetime ?? def?.constraints?.lifetime);
    const rate = num(link.linkConfig?.costs?.monetary?.interest_rate ?? def?.costs?.monetary?.interest_rate);
    if (lifetime != null || rate != null) {
      entry.native = { calliope: {
        ...(lifetime != null ? { lifetime } : {}),
        ...(rate != null ? { cost_interest_rate: { data: rate, index: 'monetary', dims: 'costs' } } : {}),
      } };
    }

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
  if (Object.keys(tradeEntries).length) memeModel.trade = tradeEntries;
  // Model-wide Calliope-only settings (native): the 0.6 reserve margin.
  const rm = reserveMarginNative(runCfg.reserve_margin ?? meta.runConfig?.reserve_margin,
    technologies, locations, tsCtx, [start, end], log);
  if (rm) memeModel.native = { calliope: rm };

  const sporesPlan = modelCfg.sporesPlan;
  const mode = sporesPlan ? 'spores' : (opts.mode || modelCfg.mode || runCfg.mode || 'plan');
  // Unmet-demand slack. TEMPO enables ensure_feasibility by default on local
  // runs; MEME only emits config.build.ensure_feasibility when this flag is set
  // (emitter.go:134). Without it a model whose peak demand exceeds a feeder's
  // capacity is reported infeasible even though it solves fine locally.
  // AdOpT-NET0 exception: MEME's validator requires penalty_price alongside
  // allow_unmet_demand.enabled=true; TEMPO has no penalty_price concept for
  // AdOpT, so disable it unconditionally for that target to avoid a 422 error.
  const ensureFeasibility = opts.engine === 'adoptnet0'
    ? false
    : (modelCfg.ensureFeasibility ?? true);
  const experiment = {
    mode: MODE_MAP[mode] || 'plan',
    objective: opts.objective || 'min_cost',
    allow_unmet_demand: { enabled: !!ensureFeasibility },
    solver: { name: opts.solver || runCfg.solver || 'highs' },
  };

  // SPORES → Calliope 0.7 spores mode ("alternatives"). A Lombardi-2020 plan
  // runs its explore stage natively: relative_deployment scoring (installed /
  // max capacity, accumulated — the paper's Eq. 2) with the paper's 1e-3
  // threshold, restricted to the scored techs via a tracking parameter.
  if (sporesPlan) {
    const explore = (sporesPlan.stages || []).filter((st) => st.type === 'explore')
      .reduce((n, st) => n + (Number(st.count) || 0), 0);
    experiment.alternatives = { number: explore, slack: num(sporesPlan.slack) ?? 0, scoring_algorithm: 'relative_deployment' };
    const tracked = sporesTrackedTechs(sporesPlan.scoredTechs || [], memeTechs, transmission);
    experiment.alternatives.score_threshold_factor = 0.001;
    if (tracked.length) {
      experiment.alternatives.tracking_parameter = 'tempo_spores_track';
      const cal = memeModel.native?.calliope || {};
      memeModel.native = { calliope: { ...cal, data_definitions: {
        ...(cal.data_definitions || {}), tempo_spores_track: { data: true, index: tracked, dims: 'techs' } } } };
    }
    // The full schedule (Lombardi et al. 2020 minimise stages) runs through
    // MEME's SPORES driver; targets are translated to MEME tech ids.
    experiment.alternatives.stages = (sporesPlan.stages || []).map((st) => {
      if (st.type === 'explore') return { type: 'explore', count: Number(st.count) || 0 };
      const targets = (st.targets || []).map((tg) => {
        const ids = sporesTrackedTechs(tg, memeTechs, transmission);
        if (!ids.length) log.push(`⚠ SPORES: minimise target '${tg.join('+')}' matches no tech — skipped`);
        return ids;
      }).filter((ids) => ids.length);
      return { type: 'minimise', targets, count_each: Number(st.countEach) || 0 };
    }).filter((st) => st.type === 'explore' || st.targets.length);
    experiment.alternatives.weights = {
      excl: num(sporesPlan.weights?.excl) ?? 10, nos: num(sporesPlan.weights?.nos) ?? 1,
    };
  } else if (mode === 'spores' && modelCfg.sporesOptions) {
    const o = modelCfg.sporesOptions;
    experiment.alternatives = { number: Number(o.sporesNumber) || 0, slack: (Number(o.slack) || 0) / 100 };
  }

  return { payload: { model: memeModel, experiment }, log };
}

/**
 * MEME tech ids for a SPORES plan's scored techs: node techs by id; a
 * transmission entry 'tech:REMOTE' → every emitted link of that tech with an
 * end at REMOTE (Calliope 0.7 has one tech per link).
 */
function sporesTrackedTechs(scored, memeTechs, transmission) {
  const out = [];
  for (const t of scored) {
    const [base, remote] = String(t).split(':');
    const id = safeId(base);
    if (!remote) {
      if (memeTechs[id]) out.push(id);
      continue;
    }
    const end = safeId(remote).toLowerCase();
    for (const [linkId, l] of Object.entries(transmission)) {
      if (linkId.startsWith(id + '_') && [l.from, l.to].some((n) => String(n).toLowerCase() === end)) out.push(linkId);
    }
  }
  return [...new Set(out)];
}
