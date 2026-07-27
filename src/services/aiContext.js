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

// ── Pre-aggregated summary ────────────────────────────────────────────────
// Fast models reason poorly over thousands of raw loc::tech entries. This
// digests the contract into the same headline stats the dashboard shows, so
// the model is handed conclusions to explain rather than raw data to crunch.

const RENEWABLE_RE = /solar|pv|wind|hydro|biomass|geothermal|renewable/i;

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
  if (Array.isArray(demand) && demand.length) {
    const peak = Math.max(...demand.map((x) => Math.abs(Number(x) || 0)));
    const mean = demand.reduce((s, x) => s + Math.abs(Number(x) || 0), 0) / demand.length;
    L.push('## Demand');
    L.push(`- Peak demand: ${num(peak, 1)}, mean ${num(mean, 1)}, load factor ${num(peak > 0 ? mean / peak * 100 : 0, 1)}%`);
    L.push('');
  }

  return L.join('\n').trim();
}
