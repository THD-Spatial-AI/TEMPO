/**
 * Scenario Studio — recipe composition (stacking).
 *
 * Lets a scenario be built from MULTIPLE recipe layers at once
 * (e.g. demand growth + carbon cap + renewable-min together).
 *
 * Each recipe already expands to Variant[] where Variant = { label, year?, ops }.
 * Composition aligns year-based layers by `year` and concatenates their ops per
 * year, then resolves overlapping ops with fixed precedence rules (Q-A):
 *
 *   - scaleParam × scaleParam on the same slot  → MULTIPLICATIVE compose (factors multiplied)
 *   - setParam   × setParam   on the same slot  → LAST-LAYER WINS  (+ warning)
 *   - systemConstraint × systemConstraint, same kind → LAST WINS   (+ warning)
 *   - disableTech duplicates                    → deduped
 *   - mixed set/scale on the same slot          → both kept in order (+ warning, ambiguous)
 *
 * A "slot" is the target a tech-param op writes to: techMatch + path + level.
 * systemConstraint slots are keyed by kind.
 *
 * Sweep layers (multiple variants without a `year`, e.g. cost sensitivity) cannot
 * be aligned on a year axis; v1 rejects mixing them with pathways and returns a
 * warning instead of a nonsensical cross-product.
 *
 * A single-variant layer without a `year` (e.g. a custom op set) is treated as a
 * CONSTANT layer: its ops are broadcast onto every composed year.
 */

import { expandRecipe } from './recipes/index.js';

// ─── slot keys ─────────────────────────────────────────────────────────────────

function techMatchKey(tm) {
  if (typeof tm === 'string') return `name:${tm}`;
  if (Array.isArray(tm)) return `names:${[...tm].sort().join(',')}`;
  if (tm && tm.parentIs) return `parent:${tm.parentIs}`;
  return 'name:*';
}

// Target slot shared by set/scale/disable ops so set-vs-scale overlaps collide.
function slotKey(op) {
  if (op.op === 'systemConstraint') return `sys|${op.kind}`;
  if (op.op === 'disableTech') return `tech|${techMatchKey(op.techMatch)}|constraints.energy_cap_max`;
  if (op.op === 'setParam' || op.op === 'scaleParam') {
    return `tech|${techMatchKey(op.techMatch)}|${op.path}`;
  }
  return null; // addTech / vintageResidual etc. — never merged, always kept
}

function paramLabel(op) {
  const key = (op.path || '').split('.').pop();
  const tm = typeof op.techMatch === 'string' ? op.techMatch
    : Array.isArray(op.techMatch) ? op.techMatch.join('/')
    : op.techMatch?.parentIs ? `parent:${op.techMatch.parentIs}` : '*';
  return `${tm}.${key}`;
}

// ─── merge a flat op list for a single variant ──────────────────────────────────

/**
 * @param {object[]} ops  ops already concatenated in layer order
 * @returns {{ ops: object[], warnings: string[] }}
 */
export function composeOps(ops) {
  const warnings = [];
  const order = [];            // slot keys in first-seen order
  const bySlot = new Map();    // slotKey → op[]
  const passthrough = [];      // ops with no slot (addTech etc.), kept as-is with an order marker

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
      // multiplicative compose
      const factor = group.reduce((f, o) => f * (typeof o.factor === 'number' ? o.factor : 1), 1);
      out.push({ ...group[0], factor });
      continue;
    }
    if (kinds.size === 1 && kinds.has('setParam')) {
      out.push(group[group.length - 1]);
      warnings.push(`Multiple layers set ${paramLabel(group[0])}; using the last layer's value (${group[group.length - 1].value}).`);
      continue;
    }
    if (kinds.size === 1 && kinds.has('systemConstraint')) {
      out.push(group[group.length - 1]);
      const kind = group[0].kind;
      warnings.push(`Multiple layers set system constraint "${kind}"; using the last layer's value.`);
      continue;
    }
    if (kinds.size === 1 && kinds.has('disableTech')) {
      out.push(group[0]); // dedupe
      continue;
    }
    // mixed set/scale (or disable + scale/set) on the same slot — order-dependent, keep all
    group.forEach(o => out.push(o));
    warnings.push(`Layers both set and scale ${paramLabel(group[0])}; applied in layer order (result is order-dependent).`);
  }

  return { ops: out, warnings };
}

// ─── compose whole recipes ──────────────────────────────────────────────────────

const isYearVariants = (vs) => vs.length > 0 && vs.every(v => typeof v.year === 'number');
const isConstant     = (vs) => vs.length === 1 && typeof vs[0].year !== 'number';

/**
 * Expand and compose multiple recipe layers into a single variant list.
 *
 * @param {object} model
 * @param {Array<{ recipeId: string, params: object }>} layers
 * @returns {{ variants: Array<{label, year?, ops, layerLabels?}>, warnings: string[] }}
 */
export function composeRecipes(model, layers) {
  const active = (layers || []).filter(l => l && l.recipeId);
  if (active.length === 0) return { variants: [], warnings: [] };

  const expanded = active.map(l => {
    let vs;
    try { vs = expandRecipe(model, l.recipeId, l.params) || []; }
    catch { vs = []; }
    return { recipeId: l.recipeId, variants: vs };
  }).filter(e => e.variants.length > 0);

  if (expanded.length === 0) return { variants: [], warnings: [] };
  if (expanded.length === 1) return { variants: expanded[0].variants, warnings: [] };

  const warnings = [];
  const yearLayers = expanded.filter(e => isYearVariants(e.variants));
  const constLayers = expanded.filter(e => isConstant(e.variants));
  const sweepLayers = expanded.filter(e => !isYearVariants(e.variants) && !isConstant(e.variants));

  if (sweepLayers.length > 0) {
    warnings.push('Multi-step sweeps (e.g. cost sensitivity) cannot be stacked with other recipes yet — run them on their own.');
  }

  const constOps = constLayers.flatMap(e => e.variants[0].ops);

  // No year axis: compose the constant layers into a single variant.
  if (yearLayers.length === 0) {
    if (constOps.length === 0) return { variants: [], warnings };
    const { ops, warnings: w } = composeOps(constOps);
    return { variants: [{ label: 'Combined', ops }], warnings: [...warnings, ...dedupe(w)] };
  }

  // Union of years across year-based layers, ascending.
  const years = [...new Set(yearLayers.flatMap(e => e.variants.map(v => v.year)))].sort((a, b) => a - b);

  const variants = years.map((year) => {
    const layerOps = yearLayers.flatMap(e => {
      const v = e.variants.find(x => x.year === year);
      return v ? v.ops : [];
    });
    const { ops, warnings: w } = composeOps([...layerOps, ...constOps]);
    w.forEach(msg => warnings.push(msg));
    return { label: String(year), year, ops };
  });

  return { variants, warnings: dedupe(warnings) };
}

function dedupe(arr) {
  return [...new Set(arr)];
}
