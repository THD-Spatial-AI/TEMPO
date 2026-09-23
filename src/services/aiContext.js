// aiContext.js
// -------------------------------------------------------------------------
// Turns a frozen result contract into the JSON context sent to the LLM.
//
// The default is the full contract, but massive models (thousands of loc::tech
// keys × 8760-step series) blow past every context window. So callers can cap:
//   - topNKeys     : keep only the N highest-value capacity/generation/cost keys
//   - includeDispatch / dispatchStride : drop or downsample per-tech dispatch
//   - includeTimeseries : drop demand + transmission_flow series
//   - includeShadowPrices
//
// `estimateTokens` gives a rough budget indicator (≈ chars / 4) so the UI can
// warn before a request is sent. Pure functions only — unit-tested.

/** Rough token estimate for a string (chars / 4). Good enough for a budget UI. */
export function estimateTokens(str) {
  return Math.ceil((str ? String(str).length : 0) / 4);
}

/** Keep the N highest-value entries of a {key: number} map; null/0 = keep all. */
function topEntries(obj, n) {
  if (!obj || typeof obj !== 'object') return undefined;
  const entries = Object.entries(obj);
  if (!n || entries.length <= n) return { ...obj };
  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => (Number(b) || 0) - (Number(a) || 0))
      .slice(0, n),
  );
}

/** Keep the N locations with the largest summed cost from costs_by_location. */
function topLocations(byLoc, n) {
  if (!byLoc || typeof byLoc !== 'object') return undefined;
  const locs = Object.keys(byLoc);
  if (!n || locs.length <= n) return byLoc;
  const total = (l) => Object.values(byLoc[l] || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  return Object.fromEntries(
    locs.sort((a, b) => total(b) - total(a)).slice(0, n).map((l) => [l, byLoc[l]]),
  );
}

/** Take every `stride`-th sample of a numeric array. stride<=1 => unchanged. */
function strideArray(arr, stride) {
  if (!Array.isArray(arr) || stride <= 1) return arr;
  return arr.filter((_, i) => i % stride === 0);
}

/** Downsample every series in a {tech: number[]} dispatch map. */
function strideSeriesMap(obj, stride) {
  if (!obj || typeof obj !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = strideArray(v, stride);
  return out;
}

/** Downsample transmission_flow { key: { from, to, timeseries[] } }. */
function strideFlows(flows, stride) {
  if (!flows || typeof flows !== 'object') return undefined;
  const out = {};
  for (const [k, f] of Object.entries(flows)) {
    out[k] = { ...f, timeseries: strideArray(f?.timeseries, stride) };
  }
  return out;
}

/**
 * Build the context object from a result contract.
 * @param {object} result  frozen result contract
 * @param {object} [opts]
 * @returns {object} trimmed, JSON-serializable context
 */
export function buildResultContext(result, opts = {}) {
  const {
    includeDispatch = true,
    dispatchStride = 1,
    includeTimeseries = true,
    topNKeys = null,
    includeShadowPrices = true,
  } = opts;

  if (!result || typeof result !== 'object') return {};

  const out = {};

  // Scalars / metadata
  for (const k of ['framework', 'objective', 'termination_condition']) {
    if (result[k] !== undefined) out[k] = result[k];
  }

  // Capacities / generation / costs (optionally top-N capped)
  out.capacities = topEntries(result.capacities, topNKeys);
  out.generation = topEntries(result.generation, topNKeys);
  if (result.costs_by_tech) out.costs_by_tech = result.costs_by_tech;
  if (result.costs_by_location) {
    out.costs_by_location = topNKeys ? topLocations(result.costs_by_location, topNKeys) : result.costs_by_location;
  }

  // Tech metadata helps the model name/classify technologies
  if (result.tech_metadata) out.tech_metadata = result.tech_metadata;
  else if (result.tech_parents) out.tech_parents = result.tech_parents;

  // Time axis summarized (full timestamp arrays are pure token waste)
  const ts = result.timestamps || [];
  out.timesteps = ts.length;
  if (ts.length) out.time_range = [ts[0], ts[ts.length - 1]];

  if (includeDispatch && result.dispatch) {
    out.dispatch = strideSeriesMap(result.dispatch, dispatchStride);
    out.dispatch_stride = dispatchStride;
  }
  if (includeTimeseries) {
    if (result.demand_timeseries) out.demand_timeseries = strideArray(result.demand_timeseries, dispatchStride);
    if (result.transmission_flow) out.transmission_flow = strideFlows(result.transmission_flow, dispatchStride);
  }
  if (includeShadowPrices && result.shadow_prices) out.shadow_prices = result.shadow_prices;

  // Drop undefined keys for a clean payload
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** Convenience: build + stringify. */
export function buildResultContextString(result, opts = {}) {
  return JSON.stringify(buildResultContext(result, opts));
}

// ── Model inputs digest ───────────────────────────────────────────────────
// The result contract carries only outputs. To let the assistant critique the
// ASSUMPTIONS behind a run (cost inputs, potentials, efficiencies), this emits a
// slim per-technology digest of the model's input definitions. Only assumption-
// relevant params are surfaced; timeseries/file refs are collapsed to a marker.

// Constraint keys worth showing (potentials, limits, efficiencies, lifetime).
// Anything not listed (file refs, internal flags) is skipped to stay slim.
const INPUT_CONSTRAINT_KEYS = [
  'energy_cap_max', 'energy_cap_min', 'energy_cap_equals', 'energy_cap_max_systemwide',
  'storage_cap_max', 'storage_cap_equals', 'resource', 'resource_area_max',
  'resource_area_per_energy_cap', 'energy_eff', 'parasitic_eff', 'storage_loss',
  'energy_ramping', 'lifetime', 'force_resource',
];

/** Render a constraint value slim: collapse timeseries/file refs, pass numbers. */
function inputVal(v) {
  if (typeof v === 'string') return /^file=|\.csv/i.test(v) ? 'timeseries' : v;
  if (typeof v === 'number') return String(Number(v.toFixed(4))); // no locale commas
  if (typeof v === 'boolean') return String(v);
  return undefined;
}

/** Compact "k=v" clauses for the present keys of an object (given a key order). */
function clauses(obj, keys) {
  const out = [];
  for (const k of keys) {
    if (obj == null || obj[k] === undefined || obj[k] === null || obj[k] === '') continue;
    const v = inputVal(obj[k]);
    if (v !== undefined) out.push(`${k}=${v}`);
  }
  return out;
}

/**
 * Build a slim markdown digest of a model's INPUT assumptions.
 * @param {object} model  frontend internal model ({ technologies[], locations[], links[] })
 * @param {object} [opts] { maxTechs=60 }
 * @returns {string} markdown digest (empty string if no usable inputs)
 */
export function summarizeModelInputs(model, opts = {}) {
  if (!model || typeof model !== 'object') return '';
  const { maxTechs = 60 } = opts;
  const techs = Array.isArray(model.technologies) ? model.technologies : [];
  const locations = Array.isArray(model.locations) ? model.locations : [];
  const links = Array.isArray(model.links) ? model.links : [];
  if (!techs.length && !locations.length && !links.length) return '';

  const L = [];
  L.push('# Model input assumptions (definitions, not results — critique these)');
  L.push('');
  L.push('## Model scale');
  L.push(`- Technologies defined: ${techs.length}`);
  L.push(`- Locations: ${locations.length}`);
  if (links.length) L.push(`- Links: ${links.length}`);
  // Location-specific overrides hint at heterogeneity the global defaults hide.
  const overrideCount = locations.reduce((n, l) => n + Object.keys(l?.techs || {}).length, 0);
  if (overrideCount) L.push(`- Location-specific technology overrides: ${overrideCount}`);
  L.push('');

  if (techs.length) {
    const shown = techs.slice(0, maxTechs);
    L.push(`## Technology assumptions${techs.length > maxTechs ? ` (first ${maxTechs} of ${techs.length})` : ''}`);
    for (const t of shown) {
      const id = t.id || t.name || '(unnamed)';
      const ess = t.essentials || {};
      const parent = ess.parent || t.parent || '';
      let carrier = ess.carrier_out || ess.carrier || '';
      if (Array.isArray(carrier)) carrier = carrier[0] || '';
      const cost = clauses(t.costs?.monetary, Object.keys(t.costs?.monetary || {}));
      const limit = clauses(t.constraints, INPUT_CONSTRAINT_KEYS);
      const tag = [parent, carrier].filter(Boolean).join(', ');
      const parts = [];
      if (cost.length) parts.push(`costs ${cost.join(' ')}`);
      if (limit.length) parts.push(`constraints ${limit.join(' ')}`);
      L.push(`- ${id}${tag ? ` (${tag})` : ''}: ${parts.length ? parts.join('; ') : 'no cost/limit assumptions set'}`);
    }
    L.push('');
  }

  return L.join('\n').trim();
}

// ── Pre-aggregated summary ────────────────────────────────────────────────
// Fast models reason poorly over thousands of raw loc::tech entries. This
// digests the contract into the same headline stats the dashboard shows, so
// the model is handed conclusions to explain rather than raw data to crunch.

const RENEWABLE_RE = /solar|pv|wind|hydro|biomass|geothermal|renewable/i;
const STORAGE_RE = /storage|battery|store|phs|pumped|_bess|flywheel/i;
const DEMAND_RE = /demand|unmet|load_shed|unserved/i;

/** Parse a Calliope key: "loc::tech" or transmission "loc::tech:dest". */
function parseKey(k) {
  const dd = k.indexOf('::');
  const loc = dd >= 0 ? k.slice(0, dd) : '';
  const rest = dd >= 0 ? k.slice(dd + 2) : k;
  const c = rest.indexOf(':');
  return c >= 0 ? { loc, tech: rest.slice(0, c), isTx: true } : { loc, tech: rest, isTx: false };
}

const sumVals = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const num = (x, d = 0) => Number(x || 0).toLocaleString('en-US', { maximumFractionDigits: d });
function topList(obj, n) {
  return Object.entries(obj || {})
    .filter(([, v]) => (Number(v) || 0) > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n);
}

/**
 * Build a compact, human-readable digest of a result contract.
 * @param {object} result
 * @param {object} [opts] { topTechs=12, topLocs=10 }
 * @returns {string} markdown digest (empty string if no result)
 */
export function summarizeResult(result, opts = {}) {
  if (!result || typeof result !== 'object') return '';
  const { topTechs = 12, topLocs = 10 } = opts;

  // Aggregate capacities (generation/storage vs transmission)
  const capByTech = {}, capByLoc = {}, txCapByTech = {};
  const locSet = new Set();
  let txLinks = 0;
  for (const [k, v] of Object.entries(result.capacities || {})) {
    const val = Number(v) || 0;
    if (val <= 0) continue;
    const { loc, tech, isTx } = parseKey(k);
    if (loc) locSet.add(loc);
    if (isTx) { txCapByTech[tech] = (txCapByTech[tech] || 0) + val; txLinks++; continue; }
    capByTech[tech] = (capByTech[tech] || 0) + val;
    capByLoc[loc] = (capByLoc[loc] || 0) + val;
  }

  // Aggregate generation
  const genByTech = {}, genByLoc = {};
  for (const [k, v] of Object.entries(result.generation || {})) {
    const val = Number(v) || 0;
    if (val <= 0) continue;
    const { loc, tech, isTx } = parseKey(k);
    if (isTx) continue;
    genByTech[tech] = (genByTech[tech] || 0) + val;
    genByLoc[loc] = (genByLoc[loc] || 0) + val;
  }

  const hours = (result.timestamps || []).length;
  const totalCap = sumVals(capByTech);
  const totalGen = sumVals(genByTech);
  const totalCost = sumVals(result.costs_by_tech);
  const renewGen = Object.entries(genByTech)
    .filter(([t]) => RENEWABLE_RE.test(t))
    .reduce((s, [, v]) => s + v, 0);

  const L = [];
  L.push('# Result summary (pre-computed — treat as authoritative)');
  L.push('');
  L.push('## System scale');
  if (result.framework) L.push(`- Framework: ${result.framework}`);
  if (result.termination_condition) L.push(`- Termination: ${result.termination_condition}`);
  if (result.objective != null) L.push(`- Objective value: ${num(result.objective, 2)}`);
  L.push(`- Locations with capacity: ${locSet.size}`);
  L.push(`- Distinct generation/storage technologies: ${Object.keys(capByTech).length}`);
  L.push(`- Timesteps: ${num(hours)}${hours ? ` (range ${result.timestamps[0]} → ${result.timestamps[hours - 1]})` : ''}`);
  L.push('');

  if (totalCap > 0) {
    L.push(`## Installed capacity by technology (total ${num(totalCap, 1)})`);
    for (const [t, v] of topList(capByTech, topTechs)) {
      const cf = hours && v > 0 ? Math.min(100, (genByTech[t] || 0) / (v * hours) * 100) : null;
      L.push(`- ${t}: ${num(v, 1)} (${num(v / totalCap * 100, 1)}% of capacity${cf != null ? `, avg CF ${num(cf, 1)}%` : ''})`);
    }
    L.push('');
  }

  if (totalGen > 0) {
    L.push(`## Generation mix (total ${num(totalGen, 0)})`);
    for (const [t, v] of topList(genByTech, topTechs)) {
      L.push(`- ${t}: ${num(v, 0)} (${num(v / totalGen * 100, 1)}%)`);
    }
    L.push(`- Renewable share: ${num(totalGen > 0 ? renewGen / totalGen * 100 : 0, 1)}%`);
    L.push('');
  }

  if (totalCost > 0) {
    const lcoe = totalGen > 0 ? totalCost / totalGen : null;
    L.push(`## Costs (total ${num(totalCost, 0)})`);
    if (lcoe != null) L.push(`- System average LCOE: ${num(lcoe, 2)} per unit generated`);
    for (const [t, v] of topList(result.costs_by_tech, topTechs)) {
      const perMwh = genByTech[t] > 0 ? v / genByTech[t] : null;
      L.push(`- ${t}: ${num(v, 0)} (${num(v / totalCost * 100, 1)}%${perMwh != null ? `, ${num(perMwh, 2)}/unit` : ''})`);
    }
    L.push('');
  }

  // Top locations by capacity and by cost
  if (Object.keys(capByLoc).length) {
    L.push(`## Largest locations by installed capacity (of ${locSet.size})`);
    for (const [loc, v] of topList(capByLoc, topLocs)) L.push(`- ${loc}: ${num(v, 1)}`);
    L.push('');
  }
  if (result.costs_by_location && Object.keys(result.costs_by_location).length) {
    const costByLoc = Object.fromEntries(
      Object.entries(result.costs_by_location).map(([l, techs]) => [l, sumVals(techs)]),
    );
    L.push('## Most expensive locations');
    for (const [loc, v] of topList(costByLoc, topLocs)) L.push(`- ${loc}: ${num(v, 0)}`);
    L.push('');
  }

  // Transmission
  if (txLinks > 0) {
    L.push('## Transmission');
    L.push(`- Directed transmission entries: ${txLinks}, total transmission capacity ${num(sumVals(txCapByTech), 1)}`);
    for (const [t, v] of topList(txCapByTech, 6)) L.push(`- ${t}: ${num(v, 1)}`);
    L.push('');
  }

  // Demand / dispatch peaks
  const demand = result.demand_timeseries;
  let demandEnergy = 0;
  if (Array.isArray(demand) && demand.length) {
    const peak = Math.max(...demand.map((x) => Math.abs(Number(x) || 0)));
    demandEnergy = demand.reduce((s, x) => s + Math.abs(Number(x) || 0), 0);
    const mean = demandEnergy / demand.length;
    L.push('## Demand');
    L.push(`- Peak demand: ${num(peak, 1)}, mean ${num(mean, 1)}, load factor ${num(peak > 0 ? mean / peak * 100 : 0, 1)}%`);
    L.push('');
  }

  // ── Derived diagnostics (these are what should drive recommendations) ─────
  // System adequacy: generation vs demanded energy. Won't match exactly
  // (storage/transmission losses, exports), so only flag large deviations.
  if (demandEnergy > 0 && totalGen > 0) {
    const coverage = totalGen / demandEnergy * 100;
    L.push('## System adequacy');
    L.push(`- Total generation ${num(totalGen, 0)} vs demanded energy ${num(demandEnergy, 0)} (coverage ${num(coverage, 1)}%)`);
    L.push('');
  }

  // Binding constraints: any non-zero shadow price marks a scarce/limiting
  // constraint — the single richest source of actionable recommendations.
  const sp = result.shadow_prices;
  if (sp && typeof sp === 'object') {
    const rows = [];
    for (const [k, v] of Object.entries(sp)) {
      const arr = Array.isArray(v) ? v : [v];
      let peak = 0, sum = 0;
      for (const x of arr) { const a = Math.abs(Number(x) || 0); if (a > peak) peak = a; sum += a; }
      if (peak > 0) rows.push([k, peak, arr.length ? sum / arr.length : 0]);
    }
    if (rows.length) {
      rows.sort((a, b) => b[1] - a[1]);
      L.push('## Binding constraints (non-zero shadow price ⇒ scarce/limiting)');
      L.push(`- ${rows.length} constraint(s) with a non-zero shadow price`);
      for (const [k, peak, mean] of rows.slice(0, 8)) L.push(`- ${k}: peak ${num(peak, 2)}, mean ${num(mean, 2)}`);
      L.push('');
    }
  }

  // Flags: over/under-built techs (capacity factor), adequacy gaps, and
  // technologies the solver left unbuilt. Storage is exempt from CF flags
  // (low utilisation is expected for it).
  const flags = [];
  if (demandEnergy > 0 && totalGen > 0) {
    const coverage = totalGen / demandEnergy * 100;
    if (coverage < 99) flags.push(`Generation covers only ${num(coverage, 1)}% of demanded energy — possible unmet load / unserved-energy slack; check demand-balance feasibility.`);
    else if (coverage > 115) flags.push(`Generation exceeds demand by ${num(coverage - 100, 1)}% — notable oversupply, curtailment, or unaccounted exports/losses.`);
  }
  if (hours > 0) {
    for (const [t, cap] of Object.entries(capByTech)) {
      if (cap <= 0 || STORAGE_RE.test(t)) continue;
      const cf = (genByTech[t] || 0) / (cap * hours) * 100;
      if (cf < 12) flags.push(`${t}: ${num(cf, 1)}% capacity factor (built ${num(cap, 1)} but barely dispatched — overbuild, must-run, or curtailment).`);
      else if (cf > 88) flags.push(`${t}: ${num(cf, 1)}% capacity factor (near-saturated — likely capacity-constrained/bottleneck).`);
    }
  }
  // Available-but-unbuilt: techs the solver could have used but rejected.
  const available = new Set(Object.keys(result.tech_metadata || {}));
  if (!available.size && result.tech_parents) for (const t of Object.keys(result.tech_parents)) available.add(t);
  const unbuilt = [...available].filter((t) => !(t in capByTech) && !(t in txCapByTech) && !DEMAND_RE.test(t));
  if (unbuilt.length) {
    flags.push(`Available but not built: ${unbuilt.slice(0, 12).join(', ')}${unbuilt.length > 12 ? ` (+${unbuilt.length - 12} more)` : ''} — the solver rejected these on cost/constraints.`);
  }
  if (flags.length) {
    L.push('## Diagnostics & flags');
    for (const f of flags.slice(0, 14)) L.push(`- ${f}`);
    L.push('');
  }

  return L.join('\n').trim();
}
