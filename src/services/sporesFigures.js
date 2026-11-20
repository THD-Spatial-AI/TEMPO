/**
 * Quantities plotted in the SPORES figures of Lombardi et al. (2020), Figs 1-6 and Tables 1, 2, S1.
 * Pure functions over a SPORES result (`spores_data` + `spores_meta`) and a metrics config
 * (presets/lombardi2020Italy.js METRICS). Values stay in the result's units (views get MW / MWh).
 *
 * Where the paper doesn't define a quantity, the choice is stated next to the function and in
 * docs/user-guide/spores.md.
 */

import { parsedEntries, groupUtilisation, aggregateUtilisation, bestRanking } from './sporesAnalysis.js';

const up = (s) => String(s).toUpperCase();

/** Bidding zone of a node ('r3' → 'NORD'), or null for foreign nodes. */
export function zoneOf(loc, metrics) {
  return metrics?.regionZone?.[up(loc)] ?? null;
}

/** Σ of a loc::tech[...] map over `techs`, per node (upper-case ids). `carrier` filters 3-part keys. */
export function sumByNode(map, techs, { carrier } = {}) {
  const set = new Set(techs);
  const out = {};
  if (!map) return out;
  for (const [key, pt] of parsedEntries(map)) {
    if (!set.has(pt.tech)) continue;
    if (carrier && String(key).split('::')[2] !== carrier) continue;
    const n = up(pt.loc);
    out[n] = (out[n] || 0) + Math.abs(Number(map[key]) || 0);
  }
  return out;
}

/** Σ of a loc::tech[...] map over `techs`, per bidding zone. */
export function sumByZone(map, techs, metrics, opts) {
  const out = {};
  for (const [n, v] of Object.entries(sumByNode(map, techs, opts))) {
    const z = zoneOf(n, metrics);
    if (z) out[z] = (out[z] || 0) + v;
  }
  return out;
}

const total = (byNode) => Object.values(byNode).reduce((a, b) => a + b, 0);

/** Largest share of the total held by one node: { share, loc } (null share when the total is 0). */
export function maxShare(byNode) {
  const t = total(byNode);
  if (!(t > 0)) return { share: null, loc: null };
  let best = { share: -1, loc: null };
  for (const [loc, v] of Object.entries(byNode)) if (v / t > best.share) best = { share: v / t, loc };
  return best;
}

const lcPotentials = new WeakMap();
function potentialOf(meta, key) {
  const pot = meta?.potentials?.energy_cap_max;
  if (!pot) return 0;
  let m = lcPotentials.get(pot);
  if (!m) {
    m = {};
    for (const [k, v] of Object.entries(pot)) m[k.toLowerCase()] = (m[k.toLowerCase()] || 0) + v;
    lcPotentials.set(pot, m);
  }
  return m[key.toLowerCase()] || 0;
}

/**
 * One entry per line (node pair) built from `techs`: capacity (one direction), new capacity and
 * its potential (`expansionTechs`), energy delivered into each end over the run, and CF (dominant
 * direction, as sporeMetrics). Inter-zonal and international lines; node ids upper-case.
 */
export function lineMetrics(spore, meta, metrics, {
  techs = metrics?.lineTechs || [], expansionTechs = metrics?.expansionLineTechs || [],
} = {}) {
  const ts = new Set(techs), exp = new Set(expansionTechs);
  const lines = {};
  const line = (a, b) => {
    const [x, y] = [up(a), up(b)].sort();
    const k = `${x}–${y}`;
    return (lines[k] = lines[k] || { key: k, a: x, b: y, cap: 0, expansion: 0, potential: 0, into: { [x]: 0, [y]: 0 } });
  };
  const caps = spore.capacities || {}, gen = spore.generation || {};
  for (const [lt, pt] of parsedEntries(caps)) {
    const c = caps[lt];
    if (!ts.has(pt.tech) || !pt.remote || pt.loc > pt.remote) continue;
    const l = line(pt.loc, pt.remote);
    l.cap += Number(c) || 0;
    if (exp.has(pt.tech)) {
      l.expansion += Number(c) || 0;
      l.potential += potentialOf(meta, String(lt).split('::').slice(0, 2).join('::'));
    }
  }
  for (const [ltc, pt] of parsedEntries(gen)) {
    const f = gen[ltc];
    if (!ts.has(pt.tech) || !pt.remote) continue;
    const l = line(pt.loc, pt.remote);
    l.into[up(pt.loc)] += Math.abs(Number(f) || 0);
  }
  return Object.values(lines).map(l => ({
    ...l,
    cf: l.cap > 0 && meta?.hours ? Math.max(...Object.values(l.into)) / (l.cap * meta.hours) : null,
    utilisation: l.potential > 0 ? l.expansion / l.potential : null,
    // net annual flow: positive from a to b
    net: l.into[l.b] - l.into[l.a],
  }));
}

/** Techs of a role: the list form (`hydrogenTechs`, derived configs) or the single tech (`hydrogenTech`, presets). */
export function techList(metrics, one) {
  const many = metrics?.[`${one}s`];
  if (Array.isArray(many)) return many;
  return metrics?.[one] ? [metrics[one]] : [];
}

/** Per bidding zone: curtailed electricity, hydrogen and methane produced (energy units). */
export function zoneEnergy(spore, metrics) {
  const curt = sumByZone(spore.consumption, techList(metrics, 'curtailmentTech'), metrics);
  const h2 = sumByZone(spore.generation, techList(metrics, 'hydrogenTech'), metrics, { carrier: 'hydrogen' });
  const ch4 = sumByZone(spore.generation, techList(metrics, 'methaneTech'), metrics, { carrier: 'methane' });
  return Object.fromEntries((metrics.zones || []).map(z => [z, {
    curtailment: curt[z] || 0, hydrogen: h2[z] || 0, methane: ch4[z] || 0,
  }]));
}

/** Transmission per zone (Fig 3, decision D4): new capacity of the lines with an end in the zone. */
export function zoneTransmission(spore, meta, metrics) {
  const out = Object.fromEntries((metrics.zones || []).map(z => [z, 0]));
  for (const l of lineMetrics(spore, meta, metrics)) {
    const za = zoneOf(l.a, metrics), zb = zoneOf(l.b, metrics);
    if (za) out[za] += l.expansion;
    if (zb && zb !== za) out[zb] += l.expansion;
  }
  return out;
}

// ─── Fig 3: Spearman correlation of zone × group capacity ─────────────────────

function ranks(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; // average rank for ties
    i = j + 1;
  }
  return r;
}

/** Spearman ρ (Pearson on average ranks, as scipy.stats.spearmanr); null if a series is constant. */
export function spearman(a, b) {
  if (a.length !== b.length || a.length < 3) return null;
  const ra = ranks(a), rb = ranks(b), n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

/**
 * Fig 3 cells: for each zone (metrics.zones order) and group (metrics.fig3Groups order) the
 * series of its capacity across SPOREs, and ρ between every pair (diagonal null).
 */
export function correlationMatrix(spores, meta, metrics) {
  const zones = metrics.zones || [], groups = metrics.fig3Groups || [];
  const perSpore = spores.map(s => {
    const tr = groups.some(g => g.lines) ? zoneTransmission(s, meta, metrics) : {};
    return groups.map(g => (g.lines ? tr : sumByZone(s.capacities, g.techs, metrics)));
  });
  const atoms = zones.flatMap(z => groups.map((g, gi) => ({
    zone: z, group: g.label, series: perSpore.map(p => p[gi][z] || 0),
  })));
  const rho = atoms.map((a, i) => atoms.map((b, j) => (i === j ? null : spearman(a.series, b.series))));
  return { atoms, rho };
}

// ─── Fig 2: kernel density for the violins ───────────────────────────────────

/**
 * Gaussian KDE with Scott's bandwidth (scipy gaussian_kde default, as seaborn's violinplot),
 * evaluated on `points` values between lo and hi (the violin is clipped to the data range 0-1).
 * Returns [{ y, d }] or null when the values don't vary.
 */
export function kde(values, { lo = 0, hi = 1, points = 101 } = {}) {
  const v = values.filter(x => x != null && Number.isFinite(x));
  const n = v.length;
  if (n < 2) return null;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  if (!(sd > 0)) return null;
  const h = sd * n ** (-1 / 5);
  const k = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return Array.from({ length: points }, (_, i) => {
    const y = lo + (hi - lo) * i / (points - 1);
    return { y, d: k * v.reduce((s, x) => s + Math.exp(-0.5 * ((y - x) / h) ** 2), 0) };
  });
}

/** Deterministic jitter in [-1, 1] for strip plots (same SPORE, same offset on every render). */
export function jitter(i, seed = 1) {
  const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

// ─── SPORE families (Fig 2 diamond, Fig 5 colours) ───────────────────────────

/** The potentially problematic family a SPORE belongs to (metrics.problematic entry), or null. */
export function sporeFamily(spore, metrics) {
  if (spore?.stage !== 'minimise' || !spore.target) return null;
  const t = [...new Set([].concat(spore.target))].sort().join('|');
  return (metrics.problematic || []).find(p => [...p.techs].sort().join('|') === t) || null;
}

/**
 * Decision D3: the SPORE of a family with the lowest utilisation of the family's group
 * (first such SPORE on ties). null when the ensemble has no SPORE of that family.
 */
export function familyMinimum(spores, meta, metrics, familyId) {
  const fam = (metrics.problematic || []).find(p => p.id === familyId);
  if (!fam) return null;
  let best = null, bestU = Infinity;
  for (const s of spores) {
    if (sporeFamily(s, metrics)?.id !== familyId) continue;
    if (!fam.group) return s; // no group to rank on: the family's first SPORE
    const u = groupUtilisation(s, meta, metrics)[fam.group];
    if (u != null && u < bestU) { best = s; bestU = u; }
  }
  return best;
}

// ─── Fig 5 / Fig 6 points ────────────────────────────────────────────────────

/**
 * Fig 5 coordinates of one SPORE. `row` is its sporeMetrics row (wind share, minimum line CF).
 * PV and wind concentration: share of national capacity (existing + new) in one region;
 * methanation: share in one region (paper's axis label); wind utilisation pools onshore and offshore.
 */
export function fig5Point(spore, meta, metrics, row) {
  // Groups holding PV / wind techs (Italy: 'PV'; 'Onshore wind' + 'Offshore wind')
  const groupsWith = (techs) => (metrics.groups || []).filter(g => (g.techs || []).some(t => (techs || []).includes(t))).map(g => g.label);
  const pvGroups = groupsWith(metrics.pvTechs), windGroups = groupsWith(metrics.windTechs);
  return {
    pvUtil: pvGroups.length ? aggregateUtilisation(spore, meta, metrics, pvGroups) : null,
    pvShare: maxShare(sumByNode(spore.capacities, metrics.pvTechs || [])).share,
    windUtil: windGroups.length ? aggregateUtilisation(spore, meta, metrics, windGroups) : null,
    windShare: row?.maxWindShare ?? null,
    p2gUtil: metrics.p2gGroups?.length ? aggregateUtilisation(spore, meta, metrics, metrics.p2gGroups) : null,
    methShare: maxShare(sumByNode(spore.capacities, techList(metrics, 'methaneTech'))).share,
    transUtil: metrics.transmissionGroups?.length ? aggregateUtilisation(spore, meta, metrics, metrics.transmissionGroups) : null,
    minCF: row?.minLineCF ?? null,
  };
}

/** Fig 6 coordinates: transmission (x), renewables (y), storage and P2G (colour). */
export function fig6Point(spore, meta, metrics) {
  return {
    x: aggregateUtilisation(spore, meta, metrics, metrics.transmissionGroups),
    y: aggregateUtilisation(spore, meta, metrics, metrics.renewableGroups),
    storage: aggregateUtilisation(spore, meta, metrics, metrics.storageGroups),
    p2g: aggregateUtilisation(spore, meta, metrics, metrics.p2gGroups),
  };
}

// ─── Fig 1 and Fig 4 ─────────────────────────────────────────────────────────

const sumKeys = (map, techs) => total(sumByNode(map, techs));

/**
 * Installed capacity of a tech list (existing + new) and its potential: the installed existing
 * capacity plus the new techs' energy_cap_max (Σ per node, or a system-wide `systemwide` cap).
 */
export function capacityAndPotential(spore, meta, techs, { potentialTechs = [], systemwide } = {}) {
  const cap = sumKeys(spore.capacities, techs);
  const fixed = sumKeys(spore.capacities, techs.filter(t => !potentialTechs.includes(t)));
  const newPot = systemwide ?? sumKeys(meta?.potentials?.energy_cap_max, potentialTechs);
  return { cap, potential: potentialTechs.length ? fixed + newPot : cap };
}

/**
 * Fig 1 (cost optimum): per region PV and wind capacity vs potential (A), line utilisation of the
 * expansion potential (B), national bars (C, D). A bar of C has scope for increase when its
 * potential exceeds the capacity by more than 0.1 %.
 */
export function fig1Data(spore, meta, metrics) {
  const expandable = (techs) => techs.filter(t => (metrics.expandable || []).includes(t));
  const regionBars = (techs) => {
    const newTechs = expandable(techs);
    const cap = sumByNode(spore.capacities, techs);
    const fixed = sumByNode(spore.capacities, techs.filter(t => !newTechs.includes(t)));
    const pot = sumByNode(meta?.potentials?.energy_cap_max, newTechs);
    return Object.fromEntries((metrics.regions || []).map(r => [r, { cap: cap[r] || 0, potential: (fixed[r] || 0) + (pot[r] || 0) }]));
  };
  const bar = (b) => {
    const { cap, potential } = capacityAndPotential(spore, meta, b.techs, {
      potentialTechs: expandable(b.techs), systemwide: b.systemwide,
    });
    return { label: b.label, color: b.color, cap, potential, scope: potential > cap * 1.001 + 1e-9 };
  };
  return {
    pv: regionBars(metrics.pvTechs),
    wind: regionBars(metrics.regionWindTechs),
    lines: lineMetrics(spore, meta, metrics).filter(l => l.potential > 0),
    small: (metrics.fig1Small || []).map(bar),
    large: (metrics.fig1Large || []).map(bar),
  };
}

/** Fig 4 (one SPORE): regional PV / wind production, zone energy, line flows, national stack. */
export function fig4Data(spore, meta, metrics) {
  const pv = sumByNode(spore.generation, metrics.pvTechs, { carrier: 'electricity' });
  const wind = sumByNode(spore.generation, metrics.regionWindTechs, { carrier: 'electricity' });
  return {
    regions: Object.fromEntries((metrics.regions || []).map(r => [r, { pv: pv[r] || 0, wind: wind[r] || 0 }])),
    zones: zoneEnergy(spore, metrics),
    lines: lineMetrics(spore, meta, metrics),
    gasLines: lineMetrics(spore, meta, metrics, { techs: metrics.gasLineTechs, expansionTechs: [] }),
    stack: (metrics.fig4Legend || []).map(g => ({ label: g.label, color: g.color, cap: sumKeys(spore.capacities, g.techs) })),
  };
}

// ─── Tables 1, 2, S1 ─────────────────────────────────────────────────────────

/** Table S1 (counts over SPOREs ≠ 0): wind concentration markedly (≥ 20 %) lower, lower, min CF ≥ 30 %, both. */
export function tableS1(rows, { minCF = 0.3, minWindReduction = 0.2 } = {}) {
  const opt = rows.find(r => r.spore_id === 0);
  const alt = rows.filter(r => r.spore_id !== 0);
  const w = opt?.maxWindShare;
  const marked = (r) => r.maxWindShare != null && w != null && r.maxWindShare <= w * (1 - minWindReduction);
  const cf = (r) => r.minLineCF != null && r.minLineCF >= minCF;
  return {
    markedlyLower: alt.filter(marked).length,
    lower: alt.filter(r => r.maxWindShare != null && w != null && r.maxWindShare < w).length,
    cf: alt.filter(cf).length,
    both: alt.filter(r => marked(r) && cf(r)).length,
  };
}

/**
 * Table 1 rows of one ensemble, in the paper's order. A SPORE that wins several metrics is one
 * row with the names joined (paper, 5 %). `best` lists the metrics it is best on.
 */
export function table1Rows(rows, opts) {
  const r = bestRanking(rows, opts);
  const picks = [
    ['high overcapacity', r.highOvercapacity, 'overcapacity'],
    ['low wind concentration', r.lowWindConcentration, 'maxWindShare'],
    ['high transmission use', r.highTransmissionUse, 'minLineCF'],
  ];
  const out = [];
  for (const [name, row, metric] of picks) {
    if (!row) continue;
    const same = out.find(o => o.row.spore_id === row.spore_id);
    if (same) { same.names.push(name); same.best.push(metric); } else out.push({ names: [name], row, best: [metric] });
  }
  return { subset: r.subset, rows: out };
}

/** Table 2: min and max utilisation of each group label within a set of SPOREs. */
export function utilisationRanges(spores, meta, metrics, labels) {
  const us = spores.map(s => groupUtilisation(s, meta, metrics));
  return Object.fromEntries(labels.map(l => {
    const v = us.map(u => u[l]).filter(x => x != null);
    return [l, v.length ? [Math.min(...v), Math.max(...v)] : null];
  }));
}

/** The paper's figures need at least the cost optimum and one SPORE (any model: see sporesAutoMetrics). */
export const hasPaperFigures = (result) => (result?.spores_data?.length ?? 0) >= 2;

/** Display unit for MW / MWh values up to `max`: { div, label }. */
export function pickUnit(max, kind = 'power') {
  const steps = kind === 'power'
    ? [[1e3, 'GW'], [1, 'MW']]
    : [[1e6, 'TWh'], [1e3, 'GWh'], [1, 'MWh']];
  const [div, label] = steps.find(([d]) => Math.abs(max) >= d) || steps[steps.length - 1];
  return { div, label };
}

/** A round number (1, 2 or 5 × 10^k) not above `x`, for scale bars. */
export function niceNumber(x) {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  return [5, 2, 1].map(m => m * p).find(v => v <= x) || p;
}
