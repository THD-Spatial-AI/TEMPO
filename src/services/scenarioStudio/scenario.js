/**
 * Scenario Studio — single-scenario model (year swimlanes).
 *
 * A scenario is ONE thing built from many cards organized by year:
 *   scenario = { years: number[], cards: Card[] }
 *   Card     = { id, category, year: number|null, params }   // year=null → Global lane
 *
 * A Global-lane card (year=null) broadcasts its ops to every year; a year-column
 * card contributes only to that year. Each card expands to transform ops via
 * `expandCard`, ops are aggregated per year and resolved with `composeOps`
 * (a local conflict resolver — see below), producing the existing variant shape
 * `{ label, year, ops }`, one per year — fed straight into the run pipeline.
 *
 * NOTE (dev baseline): the richer scenarioStudio/compose.js, pathway.js and
 * techTemplates.js from the `main` branch are not present here, so composeOps is
 * implemented locally and the Process (H₂/CCS) card + myopic pathway are deferred.
 */

import { expandRecipe } from './recipes/index.js';
import { buildRecipeParams, DEFAULT_PARAMS as RECIPE_DEFAULT_PARAMS } from './recipeParams.js';

// Recipes usable as Global-lane trajectory shortcuts (year-based only — cost
// sensitivity is a sweep = multiple scenarios, deferred to multi-scenario step).
const TRAJECTORY_RECIPES = ['demandGrowth', 'carbonCap', 'renewableTransition'];

export const EMPTY_SCENARIO = () => ({
  years: [2025, 2030, 2035, 2040],
  cards: [],
});

// Card category metadata. `icon` is a name string resolved to a component in the
// UI (keeps this service free of react-icons). `lanes` restricts placement.
export const CARD_CATEGORIES = [
  { id: 'demand',     label: 'Demand',     icon: 'FiTrendingUp', color: 'from-blue-500 to-blue-600',     lanes: ['global', 'year'] },
  { id: 'constraint', label: 'Constraint', icon: 'FiCloud',      color: 'from-green-500 to-emerald-600', lanes: ['global', 'year'] },
  { id: 'tech',       label: 'Technology', icon: 'FiZap',        color: 'from-amber-500 to-orange-500',  lanes: ['global', 'year'] },
  { id: 'location',   label: 'Location',   icon: 'FiMapPin',     color: 'from-rose-500 to-pink-600',     lanes: ['global', 'year'] },
  { id: 'custom',     label: 'Custom ops', icon: 'FiSliders',    color: 'from-slate-500 to-slate-600',   lanes: ['global', 'year'] },
  // Global-lane trajectory shortcuts (expand across the year axis).
  { id: 'recipe:demandGrowth',        label: 'Demand growth (trajectory)',   icon: 'FiTrendingUp', color: 'from-blue-500 to-blue-600',     lanes: ['global'] },
  { id: 'recipe:carbonCap',           label: 'Carbon cap (trajectory)',      icon: 'FiCloud',      color: 'from-green-500 to-emerald-600', lanes: ['global'] },
  { id: 'recipe:renewableTransition', label: 'Renewable transition (traj.)', icon: 'FiSun',        color: 'from-amber-500 to-orange-500',  lanes: ['global'] },
];

export const CATEGORY_BY_ID = Object.fromEntries(CARD_CATEGORIES.map(c => [c.id, c]));

/** Default params for a freshly created card of a category. */
export function defaultCardParams(category) {
  if (category?.startsWith('recipe:')) {
    return clone(RECIPE_DEFAULT_PARAMS[category.slice(7)] || {});
  }
  switch (category) {
    case 'demand':     return { scale: 1.0 };
    case 'constraint': return { kind: 'co2_cap', value: 0 };
    case 'tech':       return { mode: 'disable', techMatch: '', path: 'constraints.energy_cap_max', value: 0, factor: 1, level: 'global' };
    case 'location':   return { location: '', mode: 'disable', techMatch: '', path: 'constraints.energy_cap_max', value: 0, factor: 1 };
    case 'custom':     return { ops: [], variantLabel: 'Custom' };
    default:           return {};
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

function demandTechNames(model) {
  return (model?.technologies || []).filter(t => t.parent === 'demand').map(t => t.name);
}

/**
 * Expand a single card into transform ops for a given year.
 * @returns {object[]}
 */
export function expandCard(model, card, year) {
  const p = card?.params || {};
  const cat = card?.category;

  if (cat === 'demand') {
    const scale = Number(p.scale ?? 1);
    return demandTechNames(model).map(name => ({
      op: 'scaleParam', techMatch: name, path: 'constraints.resource_scale', factor: scale, level: 'both',
    }));
  }

  if (cat === 'constraint') {
    return [{ op: 'systemConstraint', kind: p.kind || 'co2_cap', value: Number(p.value) || 0 }];
  }

  if (cat === 'tech') {
    if (!p.techMatch) return [];
    if (p.mode === 'scale') return [{ op: 'scaleParam', techMatch: p.techMatch, path: p.path, factor: Number(p.factor) || 1, level: p.level || 'global' }];
    if (p.mode === 'set')   return [{ op: 'setParam',   techMatch: p.techMatch, path: p.path, value: Number(p.value) || 0, level: p.level || 'global' }];
    return [{ op: 'disableTech', techMatch: p.techMatch }];
  }

  if (cat === 'location') {
    if (!p.location || !p.techMatch) return [];
    const base = { techMatch: p.techMatch, level: 'location', locMatch: p.location };
    if (p.mode === 'scale') return [{ op: 'scaleParam', path: p.path, factor: Number(p.factor) || 1, ...base }];
    if (p.mode === 'set')   return [{ op: 'setParam',   path: p.path, value: Number(p.value) || 0, ...base }];
    // disable at this location only
    return [{ op: 'setParam', path: 'constraints.energy_cap_max', value: 0, ...base }];
  }

  if (cat === 'custom') {
    return Array.isArray(p.ops) ? p.ops : [];
  }

  if (cat?.startsWith('recipe:')) {
    const rid = cat.slice(7);
    if (!TRAJECTORY_RECIPES.includes(rid)) return [];
    let variants = [];
    try { variants = expandRecipe(model, rid, buildRecipeParams(rid, p, model)) || []; }
    catch { variants = []; }
    const v = variants.find(x => x.year === year);
    return v ? v.ops : [];
  }

  return [];
}

/**
 * Derive a scenario ({years, cards}) from the React Flow graph.
 *
 * Node types: 'year' (data.year) and 'config' (data.category, data.params).
 * Config cards are scoped by NESTING: a config whose `parentId` is a Year card
 * applies to that year; a config with no year parent applies to all years
 * (Global). Feeds buildScenarioVariants unchanged.
 *
 * @param {object[]} nodes
 * @returns {{ years:number[], cards:Array<{id,category,year,params}> }}
 */
export function scenarioFromGraph(nodes) {
  const yearById = new Map();
  (nodes || []).forEach(n => {
    if (n.type === 'year' && Number.isFinite(n.data?.year)) yearById.set(n.id, n.data.year);
  });
  const years = [...new Set([...yearById.values()])].sort((a, b) => a - b);

  const cards = (nodes || [])
    .filter(n => n.type === 'config')
    .map(n => ({
      id: n.id,
      category: n.data.category,
      year: yearById.has(n.parentId) ? yearById.get(n.parentId) : null,
      params: n.data.params || {},
    }));

  return { years, cards };
}

/**
 * Is a proposed connection valid? Only Year → Year (consecutive-timeline link,
 * linear chain, no cycles). Config↔year scoping is done by nesting, not wiring.
 */
export function canConnect(nodes, edges, connection) {
  const { source, target } = connection || {};
  if (!source || !target || source === target) return false;
  const byId = new Map((nodes || []).map(n => [n.id, n]));
  const src = byId.get(source);
  const tgt = byId.get(target);
  if (!src || !tgt) return false;

  if (src.type === 'year' && tgt.type === 'year') {
    const ye = yearEdges(nodes, edges);
    if (ye.some(e => e.source === source)) return false; // one successor per year
    if (ye.some(e => e.target === target)) return false; // one predecessor per year
    if (reaches(ye, target, source)) return false;       // no cycle
    return true;
  }

  return false;
}

// Year→Year edges only.
function yearEdges(nodes, edges) {
  const isYear = new Set((nodes || []).filter(n => n.type === 'year').map(n => n.id));
  return (edges || []).filter(e => isYear.has(e.source) && isYear.has(e.target));
}

function reaches(edgeList, from, to) {
  const out = new Map();
  edgeList.forEach(e => { if (!out.has(e.source)) out.set(e.source, []); out.get(e.source).push(e.target); });
  const seen = new Set(); const stack = [from];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (out.get(cur) || []).forEach(n => stack.push(n));
  }
  return false;
}

/**
 * The year value immediately before `year` — the Year→Year chain predecessor if
 * one exists, otherwise the next-lower year value on the board. Null if none.
 */
export function previousYear(nodes, edges, year) {
  const yearById = new Map((nodes || []).filter(n => n.type === 'year').map(n => [n.id, n.data?.year]));
  // Chain predecessor.
  for (const e of yearEdges(nodes, edges)) {
    if (yearById.get(e.target) === year) return yearById.get(e.source) ?? null;
  }
  // Fallback: next-lower distinct year value.
  const vals = [...new Set([...yearById.values()])].filter(Number.isFinite).sort((a, b) => a - b);
  const idx = vals.indexOf(year);
  return idx > 0 ? vals[idx - 1] : null;
}

/**
 * Summarize a year's composed ops for the "what's different this year" view.
 * @returns {{ demandScale:number, constraints:Object, disabled:string[], otherCount:number }}
 */
export function summarizeYearOps(model, ops) {
  const demand = new Set(demandTechNames(model));
  const dOp = (ops || []).find(o => o.op === 'scaleParam' && o.path === 'constraints.resource_scale' && demand.has(o.techMatch));
  const constraints = {};
  const disabled = [];
  let otherCount = 0;
  (ops || []).forEach(o => {
    if (o.op === 'systemConstraint') constraints[o.kind] = o.value;
    else if (o.op === 'disableTech') disabled.push(typeof o.techMatch === 'string' ? o.techMatch : '*');
    else if (o === dOp) { /* counted as demand */ }
    else if (o.op === 'scaleParam' && o.path === 'constraints.resource_scale' && demand.has(o.techMatch)) { /* extra demand tech */ }
    else otherCount++;
  });
  return { demandScale: dOp ? dOp.factor : 1, constraints, disabled, otherCount };
}

// ─── Starter templates (populate the board with ready-made cards) ────────────────

function rangeYears(from, to, step) {
  const ys = []; for (let y = from; y <= to; y += step) ys.push(y); return ys;
}

// Default Year container size (holds nested config cards).
export const YEAR_SIZE = { width: 250, height: 150 };

// Lay out chained Year containers down the left; return nodes + chain edges.
function chainedYears(years, rid) {
  const x = 70, y0 = 60, dy = YEAR_SIZE.height + 40;
  const nodes = years.map((yr, i) => ({
    id: `${rid}_y${yr}`, type: 'year', position: { x, y: y0 + i * dy },
    style: { ...YEAR_SIZE }, data: { year: yr },
  }));
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ id: `${rid}_e_${years[i]}_${years[i + 1]}`, source: nodes[i].id, target: nodes[i + 1].id });
  }
  return { nodes, edges };
}

// A config card nested inside a Year container.
function nestedConfig(id, parentId, category, params) {
  return { id, type: 'config', parentId, position: { x: 20, y: 58 }, data: { category, params } };
}

export const SCENARIO_TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank timeline',
    description: 'Three consecutive years, no configs — start from scratch.',
    build: () => {
      const { nodes, edges } = chainedYears([2025, 2030, 2035], 'tpl');
      return { nodes, edges };
    },
  },
  {
    id: 'demandGrowth',
    label: 'Demand growth pathway',
    description: 'A Demand card nested in each year, compounding at 1.5 %/yr.',
    build: () => {
      const years = rangeYears(2025, 2040, 5);
      const { nodes, edges } = chainedYears(years, 'tpl');
      years.forEach((yr) => {
        const scale = +Math.pow(1.015, yr - years[0]).toFixed(3);
        nodes.push(nestedConfig(`tpl_d${yr}`, `tpl_y${yr}`, 'demand', { scale }));
      });
      return { nodes, edges };
    },
  },
  {
    id: 'carbonCap',
    label: 'Carbon cap / net-zero',
    description: 'A CO₂-cap card nested in each year, tightening linearly to net-zero.',
    build: () => {
      const years = rangeYears(2025, 2040, 5);
      const { nodes, edges } = chainedYears(years, 'tpl');
      years.forEach((yr, i) => {
        const t = years.length > 1 ? i / (years.length - 1) : 1;
        const cap = Math.round(100 * (1 - t));
        nodes.push(nestedConfig(`tpl_c${yr}`, `tpl_y${yr}`, 'constraint', { kind: 'co2_cap', value: cap }));
      });
      return { nodes, edges };
    },
  },
  {
    id: 'renewableTransition',
    label: 'Renewable transition',
    description: 'Yearly snapshots + a global Renewable-transition trajectory card.',
    build: () => {
      const years = rangeYears(2025, 2040, 5);
      const { nodes, edges } = chainedYears(years, 'tpl');
      nodes.push({
        id: 'tpl_rt', type: 'config', position: { x: 360, y: 60 },
        data: { category: 'recipe:renewableTransition', params: defaultCardParams('recipe:renewableTransition') },
      });
      return { nodes, edges };
    },
  },
];

/**
 * Build the scenario's runnable variants — one per year.
 * @returns {{ variants: Array<{label:string, year:number, ops:object[]}>, warnings: string[] }}
 */
export function buildScenarioVariants(model, scenario) {
  if (!model || !scenario) return { variants: [], warnings: [] };
  const years = [...new Set(scenario.years || [])].filter(y => Number.isFinite(y)).sort((a, b) => a - b);
  if (years.length === 0) return { variants: [], warnings: [] };

  const cards = scenario.cards || [];
  const warnings = [];

  const variants = years.map(year => {
    const active = cards.filter(c => c.year == null || c.year === year);
    const ops = active.flatMap(c => {
      try { return expandCard(model, c, year) || []; } catch { return []; }
    });
    const { ops: composed, warnings: w } = composeOps(ops);
    w.forEach(m => warnings.push(m));
    return { label: String(year), year, ops: composed };
  });

  return { variants, warnings: [...new Set(warnings)] };
}

// ─── Local op composition (conflict resolution) ────────────────────────────────
// A slimmed copy of the `main` branch's compose.js composeOps: overlapping
// scaleParam multiply, setParam/systemConstraint last-wins, disableTech dedupe.

function techMatchKey(tm) {
  if (typeof tm === 'string') return `name:${tm}`;
  if (Array.isArray(tm)) return `names:${[...tm].sort().join(',')}`;
  if (tm && tm.parentIs) return `parent:${tm.parentIs}`;
  return 'name:*';
}

function slotKey(op) {
  if (op.op === 'systemConstraint') return `sys|${op.kind}`;
  if (op.op === 'disableTech') return `tech|${techMatchKey(op.techMatch)}|constraints.energy_cap_max`;
  if (op.op === 'setParam' || op.op === 'scaleParam') return `tech|${techMatchKey(op.techMatch)}|${op.path}`;
  return null; // addTech / custom-only ops — never merged, always kept
}

function paramLabel(op) {
  const key = (op.path || '').split('.').pop();
  const tm = typeof op.techMatch === 'string' ? op.techMatch
    : Array.isArray(op.techMatch) ? op.techMatch.join('/')
    : op.techMatch?.parentIs ? `parent:${op.techMatch.parentIs}` : '*';
  return `${tm}.${key}`;
}

/**
 * Merge a flat op list, resolving overlaps on the same slot.
 * @returns {{ ops: object[], warnings: string[] }}
 */
export function composeOps(ops) {
  const warnings = [];
  const order = [];
  const bySlot = new Map();
  const passthrough = [];

  ops.forEach((op) => {
    const slot = slotKey(op);
    if (slot == null) {
      const marker = `__pass_${passthrough.length}`;
      passthrough.push(op);
      order.push(marker);
      bySlot.set(marker, [op]);
      return;
    }
    if (!bySlot.has(slot)) { bySlot.set(slot, []); order.push(slot); }
    bySlot.get(slot).push(op);
  });

  const out = [];
  for (const slot of order) {
    const group = bySlot.get(slot);
    if (group.length === 1) { out.push(group[0]); continue; }

    const kinds = new Set(group.map(o => o.op));

    if (kinds.size === 1 && kinds.has('scaleParam')) {
      const factor = group.reduce((f, o) => f * (typeof o.factor === 'number' ? o.factor : 1), 1);
      out.push({ ...group[0], factor });
      continue;
    }
    if (kinds.size === 1 && kinds.has('setParam')) {
      out.push(group[group.length - 1]);
      warnings.push(`Multiple cards set ${paramLabel(group[0])}; using the last value (${group[group.length - 1].value}).`);
      continue;
    }
    if (kinds.size === 1 && kinds.has('systemConstraint')) {
      out.push(group[group.length - 1]);
      warnings.push(`Multiple cards set system constraint "${group[0].kind}"; using the last value.`);
      continue;
    }
    if (kinds.size === 1 && kinds.has('disableTech')) {
      out.push(group[0]); // dedupe
      continue;
    }
    // mixed set/scale on the same slot — order-dependent, keep all
    group.forEach(o => out.push(o));
    warnings.push(`Cards both set and scale ${paramLabel(group[0])}; applied in order (result is order-dependent).`);
  }

  return { ops: out, warnings };
}
