/**
 * SPORES ensemble analysis — the quantities Lombardi et al. (2020) report, computed
 * from a Lombardi-2020 SPORES result (`spores_data` + `spores_meta`, see
 * python/calliope_runner.py::_run_lombardi_spores).
 *
 * Model-specific groupings (zones, line techs, the paper's technology groups) come
 * from a `metrics` config — for Calliope-Italy, presets/lombardi2020Italy.js METRICS.
 *
 * Keys follow Calliope 0.6: capacities 'loc::tech[:remote]', generation /
 * consumption 'loc::tech[:remote]::carrier'. Location ids are lowercased by the
 * runner, so all comparisons are case-insensitive.
 */

const lc = (s) => String(s).toLowerCase();

/** 'r1::inter_zonal_new:fr::electricity' → { loc:'r1', tech:'inter_zonal_new', remote:'fr' } */
export function parseLocTech(key) {
  const [loc, techFull = ''] = String(key).split('::');
  const [tech, remote = null] = techFull.split(':');
  return { loc: lc(loc), tech, remote: remote && lc(remote) };
}

function endsMatch(pt, ends, metrics) {
  if (!ends) return true;
  const foreign = new Set((metrics?.foreign || []).map(lc));
  const zones = new Set((metrics?.zones || []).map(lc));
  if (ends === 'international') return foreign.has(pt.loc) || foreign.has(pt.remote);
  if (ends === 'zonal') return zones.has(pt.loc) && zones.has(pt.remote);
  return true;
}

import { METRICS as ITALY_METRICS } from './scenarioStudio/presets/lombardi2020Italy.js';

const METRICS_PRESETS = { lombardi2020Italy: ITALY_METRICS };

/** Metric config for a SPORES result: the preset named by the plan, else one
 *  utilisation group per technology that has a finite potential. */
export function resolveMetrics(meta) {
  const preset = METRICS_PRESETS[meta?.plan?.metrics];
  if (preset) return preset;
  const techs = [...new Set(Object.keys(meta?.potentials?.energy_cap_max || {}).map(k => parseLocTech(k).tech))].sort();
  return { groups: techs.map(t => ({ label: t, techs: [t] })) };
}

/** '2050 · High P2G costs · SPORES 10%' → { year, case, slack } (Scenario Studio run labels). */
export function parseRunLabel(label) {
  const parts = String(label || '').split(' · ');
  const sp = parts.find(p => /^SPORES \d/.test(p));
  const rest = parts.filter(p => p !== sp);
  return { year: rest[0] ?? '', case: rest.slice(1).join(' · ') || 'Reference', slack: sp ? Number(sp.match(/[\d.]+/)[0]) : null };
}

function groupTotals(spore, meta, metrics) {
  const out = {};
  for (const g of metrics?.groups || []) {
    const techs = new Set(g.techs);
    const pot = (g.storage ? meta?.potentials?.storage_cap_max : meta?.potentials?.energy_cap_max) || {};
    const caps = (g.storage ? spore.storage_capacities : spore.capacities) || {};
    let used = 0, max = 0;
    for (const [lt, p] of Object.entries(pot)) {
      const pt = parseLocTech(lt);
      if (!techs.has(pt.tech) || !endsMatch(pt, g.ends, metrics) || !(p > 0)) continue;
      max += p;
      used += Number(caps[lt]) || 0;
    }
    if (g.potential > 0) max = g.potential; // system-wide cap (energy_cap_max_systemwide)
    out[g.label] = { used, max };
  }
  return out;
}

/** Share of the expansion potential used, per technology group (paper Fig 2). */
export function groupUtilisation(spore, meta, metrics) {
  return Object.fromEntries(Object.entries(groupTotals(spore, meta, metrics))
    .map(([k, { used, max }]) => [k, max > 0 ? used / max : null]));
}

/** Several groups pooled as Σ used / Σ potential (paper Fig 6 axes). */
export function aggregateUtilisation(spore, meta, metrics, labels) {
  const t = groupTotals(spore, meta, metrics);
  let used = 0, max = 0;
  labels.forEach(l => { if (t[l]) { used += t[l].used; max += t[l].max; } });
  return max > 0 ? used / max : null;
}

const ZERO = 1e-3; // same threshold the SPORES scoring uses

/**
 * Must-have / costly to replace / real choice (paper Fig 2 reading):
 *   must-have         — never fully avoided in any SPORE at any relaxation
 *   real choice       — fully avoided in some SPORE already at the lowest relaxation
 *   costly to replace — avoidable only at higher relaxations
 * @param ensembles [{ slack, utilisation: [{ group: share }] }]
 */
export function classifyTechs(ensembles) {
  const ens = [...(ensembles || [])].sort((a, b) => a.slack - b.slack);
  const techs = [...new Set(ens.flatMap(e => e.utilisation.flatMap(u => Object.keys(u))))];
  return techs.map(tech => {
    const zeroShare = {}, median = {};
    ens.forEach(e => {
      const vals = e.utilisation.map(u => u[tech]).filter(v => v != null);
      zeroShare[e.slack] = vals.length ? vals.filter(v => v < ZERO).length / vals.length : null;
      const s = [...vals].sort((a, b) => a - b);
      median[e.slack] = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
    });
    const shares = ens.map(e => zeroShare[e.slack]).filter(v => v != null);
    const cls = shares.every(v => v === 0) ? 'must-have'
      : (shares[0] > 0 ? 'real choice' : 'costly to replace');
    return { tech, class: cls, zeroShare, median };
  });
}

/** Per-SPORE metrics of the paper's Table 1 (+ curtailment, transmission expansion). */
export function sporeMetrics(spore, meta, metrics, optimal = null) {
  const caps = spore.capacities || {};
  const wind = new Set(metrics.windTechs || []);
  const lineTechs = new Set(metrics.lineTechs || []);
  const expTechs = new Set(metrics.expansionLineTechs || []);
  const overTechs = new Set(metrics.overcapTechs || []);
  const zones = new Set((metrics.zones || []).map(lc));

  // Regional concentration of national onshore wind
  const windByLoc = {};
  let windTotal = 0;
  for (const [lt, c] of Object.entries(caps)) {
    const pt = parseLocTech(lt);
    if (!wind.has(pt.tech)) continue;
    windByLoc[pt.loc] = (windByLoc[pt.loc] || 0) + c;
    windTotal += c;
  }
  let maxWindShare = null, maxWindRegion = null;
  if (windTotal > 0) {
    for (const [loc, c] of Object.entries(windByLoc)) {
      if (maxWindShare == null || c / windTotal > maxWindShare) { maxWindShare = c / windTotal; maxWindRegion = loc; }
    }
  }

  // Inter-zonal lines: capacity (one direction per tech) and flows (both directions)
  const lines = {};
  const pairKey = (a, b) => [a, b].sort().join('–');
  for (const [lt, c] of Object.entries(caps)) {
    const pt = parseLocTech(lt);
    if (!lineTechs.has(pt.tech) || !zones.has(pt.loc) || !zones.has(pt.remote) || pt.loc > pt.remote) continue;
    const k = pairKey(pt.loc, pt.remote);
    lines[k] = lines[k] || { cap: 0, flow: 0 };
    lines[k].cap += c;
  }
  for (const [ltc, f] of Object.entries(spore.generation || {})) {
    const pt = parseLocTech(ltc);
    if (!lineTechs.has(pt.tech) || !zones.has(pt.loc) || !zones.has(pt.remote)) continue;
    const k = pairKey(pt.loc, pt.remote);
    if (lines[k]) lines[k].flow += Math.abs(f);
  }
  const lineCF = Object.fromEntries(Object.entries(lines)
    .filter(([, l]) => l.cap > 0 && meta?.hours)
    .map(([k, l]) => [k, l.flow / (l.cap * meta.hours)]));
  const cfs = Object.values(lineCF);

  let transmissionExpansion = 0;
  for (const [lt, c] of Object.entries(caps)) {
    const pt = parseLocTech(lt);
    if (expTechs.has(pt.tech) && zones.has(pt.loc) && zones.has(pt.remote) && pt.loc < pt.remote) transmissionExpansion += c;
  }

  const overSum = (s) => Object.entries(s?.capacities || {})
    .reduce((acc, [lt, c]) => acc + (overTechs.has(parseLocTech(lt).tech) ? c : 0), 0);

  const curtailment = Object.entries(spore.consumption || {})
    .reduce((acc, [ltc, v]) => acc + (parseLocTech(ltc).tech === metrics.curtailmentTech ? Math.abs(v) : 0), 0);

  return {
    spore_id: spore.spore_id, stage: spore.stage, target: spore.target, cost: spore.cost,
    maxWindShare, maxWindRegion,
    minLineCF: cfs.length ? Math.min(...cfs) : null, lineCF,
    transmissionExpansion,
    overcapacity: optimal ? overSum(spore) - overSum(optimal) : 0,
    curtailment,
  };
}

/**
 * Paper Table 1: among SPORES with lower wind concentration than the cost-optimal
 * one (spore 0) and every inter-zonal line at ≥ 30 % capacity factor, the best
 * SPORE on each metric.
 */
export function bestRanking(rows, { minCF = 0.3 } = {}) {
  const opt = rows.find(r => r.spore_id === 0);
  const subset = rows.filter(r => r.spore_id !== 0
    && r.maxWindShare != null && opt?.maxWindShare != null && r.maxWindShare < opt.maxWindShare
    && r.minLineCF != null && r.minLineCF >= minCF);
  const best = (key, dir) => subset.reduce((b, r) => (b == null || dir * (r[key] - b[key]) > 0 ? r : b), null);
  return {
    subset,
    lowWindConcentration: best('maxWindShare', -1),
    highTransmissionUse: best('minLineCF', +1),
    highOvercapacity: best('overcapacity', +1),
  };
}

/** Rows → CSV text (for filling the paper's tables). */
export function toCsv(rows, columns) {
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.join(','), ...rows.map(r => columns.map(c => esc(Array.isArray(r[c]) ? r[c].join('+') : r[c])).join(','))].join('\n');
}
