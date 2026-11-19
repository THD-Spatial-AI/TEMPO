/**
 * Helpers for a model's own scenarios / overrides (imported from Calliope YAML,
 * Calliope 0.7, or a TEMPO-exported engine archive).
 *
 *   overrides: { name: { ...nested Calliope YAML or "dotted.key": value } }
 *   scenarios: { name: ["override_or_scenario", ...] | "a,b" }
 */

/**
 * Flatten a (possibly nested) override dict to dotted keys. Arrays and scalars
 * are leaves; already-dotted keys pass through unchanged.
 * @returns {Record<string, any>}
 */
export function flattenOverride(override, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(override || {})) {
    if (k === '_meta') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flattenOverride(v, key, out);
    else out[key] = v;
  }
  return out;
}

function scenarioEntries(scenarios, name) {
  const def = scenarios?.[name];
  if (Array.isArray(def)) return def.map(String);
  if (typeof def === 'string') return def.split(',').map(s => s.trim()).filter(Boolean);
  return [name];
}

/**
 * Expand a scenario (or a single override) to its ordered, de-duplicated list of
 * override names. Scenarios may reference other scenarios (as Calliope allows).
 */
export function expandScenario(model, name, seen = new Set()) {
  const scenarios = model?.scenarios || {};
  if (!(name in scenarios)) return [name];
  if (seen.has(name)) return [];
  seen.add(name);
  const out = [];
  for (const entry of scenarioEntries(scenarios, name)) {
    const names = entry in scenarios && entry !== name ? expandScenario(model, entry, seen) : [entry];
    names.forEach(n => { if (!out.includes(n)) out.push(n); });
  }
  return out;
}

/** True when the model carries any scenarios or overrides. */
export function hasModelScenarios(model) {
  return Object.keys(model?.scenarios || {}).length > 0 || Object.keys(model?.overrides || {}).length > 0;
}

// ── Editing (Scenario Studio) ─────────────────────────────────────────────────
// Edits flatten to dotted keys, change one, and write back nested YAML — the shape
// imported overrides have and the runner normalises (calliope_runner.normalize_override_ids).

/** Nested override from dotted keys. */
export function unflattenOverride(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat || {})) {
    const parts = key.split('.');
    let node = out;
    parts.slice(0, -1).forEach(p => {
      if (!node[p] || typeof node[p] !== 'object' || Array.isArray(node[p])) node[p] = {};
      node = node[p];
    });
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

/** Copy of `override` with `dotKey` set to `value`. */
export function setOverrideKey(override, dotKey, value) {
  return unflattenOverride({ ...flattenOverride(override), [dotKey]: value });
}

/** Copy of `override` without `dotKey` (empty parents dropped). */
export function removeOverrideKey(override, dotKey) {
  const { [dotKey]: _removed, ...rest } = flattenOverride(override);
  return unflattenOverride(rest);
}

/** Typed value from an input: numbers, true/false/null, JSON or YAML-style lists, else text. */
export function parseOverrideValue(text) {
  const t = String(text ?? '').trim();
  if (/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return Number(t);
  if (t === 'true' || t === 'false') return t === 'true';
  if (t === 'null') return null;
  if (/^[[{]/.test(t)) {
    try { return JSON.parse(t.replace(/'/g, '"')); } catch { /* keep as text */ }
  }
  return t;
}

/** Text for an input showing an override value. */
export function formatOverrideValue(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Why a new override / scenario name is not allowed, or null. */
export function overrideNameError(name, model) {
  const n = String(name || '').trim();
  if (!n) return 'Give it a name.';
  if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Use letters, digits, _ or - only.';
  if (n in (model?.overrides || {}) || n in (model?.scenarios || {})) return `"${n}" already exists.`;
  return null;
}
