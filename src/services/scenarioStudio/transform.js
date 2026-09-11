/**
 * Scenario Studio — engine-agnostic model transform layer.
 *
 * applyOps(model, ops) returns a deep copy of model with all ops applied.
 * The original model is never mutated.
 *
 * TransformOp shapes:
 *
 *   { op: 'scaleParam', techMatch, path, factor, level? }
 *     Scale an existing numeric param by `factor`.
 *     `level`: 'global' (only model.technologies[]) | 'location' (only loc.techs) | 'both'
 *     Default level: 'global'.
 *     For location-level, only scales params that already exist on the loc-tech —
 *     never injects a new override into a location that doesn't have one.
 *
 *   { op: 'setParam', techMatch, path, value, level? }
 *     Set a param to an absolute value.
 *
 *   { op: 'disableTech', techMatch }
 *     Set energy_cap_max = 0 globally and on all location-tech overrides.
 *
 *   { op: 'systemConstraint', kind, value }
 *     Write into modelConfig.groupConstraints[kind].
 *
 *   { op: 'addTech', tech, defaults }
 *     Append a technology to model.technologies if not already present.
 *
 *   { op: 'scaleLinkCap', linkMatch, factor }   { op: 'setLinkCap', linkMatch, value }
 *     Transmission / interconnector expansion. Scales or sets link.capacity
 *     (→ energy_cap_max). scaleLinkCap skips links with no defined capacity.
 *     linkMatch shapes:
 *       'all' | undefined        — every link
 *       string                   — match link.linkType or link.tech
 *       { linkType }             — by link type
 *       { from, to }             — a specific pair (undirected)
 *
 *   { op: 'vintageResidual', techMatch, existingCaps: { 'loc::tech': MW }, suffix? }
 *     Myopic carry-forward. For each matched tech with prior installed capacity,
 *     splits it into a fixed, capex-free `<tech>_existing` shadow (per-location
 *     energy_cap_equals) while the original stays extendable. The shadow inherits
 *     the base tech's global def + per-location resource reference so renewables
 *     keep their capacity-factor profile. Sunk (residual) capacity semantics:
 *     prior builds are free; only NEW additions pay CAPEX.
 *
 * techMatch shapes:
 *   string             — exact tech name
 *   string[]           — any of these names
 *   { parentIs: str }  — all techs whose .parent matches
 */

export function applyOps(model, ops) {
  const m = JSON.parse(JSON.stringify(model));
  for (const op of ops) {
    switch (op.op) {
      case 'scaleParam':      _scaleParam(m, op); break;
      case 'setParam':        _setParam(m, op); break;
      case 'disableTech':     _disableTech(m, op); break;
      case 'systemConstraint':_systemConstraint(m, op); break;
      case 'addTech':         _addTech(m, op); break;
      case 'vintageResidual': _vintageResidual(m, op); break;
      case 'scaleLinkCap':    _scaleLinkCap(m, op); break;
      case 'setLinkCap':      _setLinkCap(m, op); break;
      default: break; // unknown ops (and UI-only keys like _template) silently skipped
    }
  }
  return m;
}

// ─── internal helpers ─────────────────────────────────────────────────────────

function _matchTechNames(technologies, techMatch) {
  if (!technologies) return [];
  if (typeof techMatch === 'string') {
    return technologies.filter(t => t.name === techMatch).map(t => t.name);
  }
  if (Array.isArray(techMatch)) {
    const set = new Set(techMatch);
    return technologies.filter(t => set.has(t.name)).map(t => t.name);
  }
  if (techMatch && techMatch.parentIs) {
    return technologies.filter(t => t.parent === techMatch.parentIs).map(t => t.name);
  }
  return [];
}

// Returns [parentObj, lastKey] for a dot-separated path, or null if any
// intermediate object is missing.
function _resolve(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[parts[i]];
  }
  if (cur == null || typeof cur !== 'object') return null;
  return [cur, parts[parts.length - 1]];
}

// Sets a dot-separated path on obj, creating intermediates.
function _set(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function _scaleParam(m, { techMatch, path, factor, level = 'global' }) {
  const names = _matchTechNames(m.technologies, techMatch);

  if (level === 'global' || level === 'both') {
    for (const tech of (m.technologies || [])) {
      if (!names.includes(tech.name)) continue;
      const r = _resolve(tech, path);
      if (r) {
        const [obj, key] = r;
        obj[key] = (typeof obj[key] === 'number' ? obj[key] : 1.0) * factor;
      } else {
        // Path missing on global tech — set baseline×factor (baseline = 1.0)
        _set(tech, path, factor);
      }
    }
  }

  if (level === 'location' || level === 'both') {
    for (const loc of (m.locations || [])) {
      if (!loc.techs) continue;
      for (const name of names) {
        const locTech = loc.techs[name];
        if (!locTech) continue;
        const r = _resolve(locTech, path);
        if (!r) continue;
        const [obj, key] = r;
        // Only scale if the value already exists on this loc-tech — never inject.
        if (typeof obj[key] !== 'number') continue;
        obj[key] = obj[key] * factor;
      }
    }
  }
}

function _setParam(m, { techMatch, path, value, level = 'global' }) {
  const names = _matchTechNames(m.technologies, techMatch);

  if (level === 'global' || level === 'both') {
    for (const tech of (m.technologies || [])) {
      if (!names.includes(tech.name)) continue;
      _set(tech, path, value);
    }
  }

  if (level === 'location' || level === 'both') {
    for (const loc of (m.locations || [])) {
      if (!loc.techs) continue;
      for (const name of names) {
        if (!loc.techs[name]) continue;
        _set(loc.techs[name], path, value);
      }
    }
  }
}

function _disableTech(m, { techMatch }) {
  _setParam(m, { techMatch, path: 'constraints.energy_cap_max', value: 0, level: 'both' });
}

function _systemConstraint(m, { kind, value }) {
  if (!m.modelConfig) m.modelConfig = {};
  if (!m.modelConfig.groupConstraints) m.modelConfig.groupConstraints = {};
  m.modelConfig.groupConstraints[kind] = value;
}

function _addTech(m, { tech, defaults = {} }) {
  if (!m.technologies) m.technologies = [];
  if (m.technologies.some(t => t.name === tech)) return;
  m.technologies.push({ name: tech, ...defaults });
}

// One-time investment cost keys zeroed on residual (sunk) capacity. Variable /
// annual O&M keys (energy_prod, energy_con, om_annual, om_prod, …) are kept —
// existing plants still cost money to run.
const INVESTMENT_COST_KEYS = ['energy_cap', 'storage_cap', 'resource_cap', 'resource_area', 'purchase'];

function _zeroCapex(costs) {
  if (!costs || typeof costs !== 'object') return;
  for (const cls of Object.keys(costs)) {
    const c = costs[cls];
    if (c && typeof c === 'object') {
      for (const k of INVESTMENT_COST_KEYS) if (k in c) c[k] = 0;
    }
  }
}

// Normalise a location id/name the way the Calliope runner does (_safe_id().lower()),
// so result-capacity loc tokens (already normalised) match internal-model locations.
function _normId(s) { return String(s ?? '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(); }
function _locMatches(loc, token) {
  return [loc.id, loc.name].some(v => v != null && (String(v) === token || _normId(v) === token));
}

function _linkMatches(link, linkMatch) {
  if (!linkMatch || linkMatch === 'all') return true;
  if (typeof linkMatch === 'string') return link.linkType === linkMatch || link.tech === linkMatch;
  if (linkMatch.linkType) return link.linkType === linkMatch.linkType;
  if (linkMatch.from && linkMatch.to) {
    return (link.from === linkMatch.from && link.to === linkMatch.to)
        || (link.from === linkMatch.to && link.to === linkMatch.from); // undirected
  }
  return false;
}

function _scaleLinkCap(m, { linkMatch, factor }) {
  for (const link of (m.links || [])) {
    if (!_linkMatches(link, linkMatch)) continue;
    if (typeof link.capacity === 'number') link.capacity = link.capacity * factor;
  }
}

function _setLinkCap(m, { linkMatch, value }) {
  for (const link of (m.links || [])) {
    if (!_linkMatches(link, linkMatch)) continue;
    link.capacity = value;
  }
}

function _vintageResidual(m, { techMatch, existingCaps = {}, suffix = '_existing' }) {
  const names = _matchTechNames(m.technologies, techMatch);
  for (const name of names) {
    // Collect per-location prior capacity for this base tech.
    const locCaps = [];
    for (const [key, cap] of Object.entries(existingCaps)) {
      if (!(cap > 0)) continue;
      const idx = key.lastIndexOf('::');
      if (idx < 0) continue;
      if (key.slice(idx + 2) !== name) continue;
      locCaps.push({ locTok: key.slice(0, idx), cap });
    }
    if (locCaps.length === 0) continue;

    const shadowName = `${name}${suffix}`;

    // Global shadow tech: clone base def, drop cap bounds, zero investment costs.
    if (!(m.technologies || []).some(t => t.name === shadowName)) {
      const base = (m.technologies || []).find(t => t.name === name);
      const clone = JSON.parse(JSON.stringify(base || { name }));
      clone.name = shadowName;
      if (clone.constraints) {
        delete clone.constraints.energy_cap_max;
        delete clone.constraints.energy_cap_min;
        delete clone.constraints.energy_cap_equals;
      }
      _zeroCapex(clone.costs);
      clone._vintaged = true; // marker the runner uses to preserve per-loc overrides in assignment mode
      m.technologies.push(clone);
    }

    // Per-location fixed capacity + inherited resource profile.
    for (const { locTok, cap } of locCaps) {
      const loc = (m.locations || []).find(l => _locMatches(l, locTok));
      if (!loc) continue;
      if (!loc.techs) loc.techs = {};
      // Inherit the base tech's per-location override (esp. resource: file=…).
      const inherited = loc.techs[name] ? JSON.parse(JSON.stringify(loc.techs[name])) : {};
      const shadow = loc.techs[shadowName] || inherited;
      if (!shadow.constraints) shadow.constraints = {};
      delete shadow.constraints.energy_cap_max;
      delete shadow.constraints.energy_cap_min;
      shadow.constraints.energy_cap_equals = cap;
      _zeroCapex(shadow.costs);
      loc.techs[shadowName] = shadow;

      // Assignment-mode models: register the shadow so the runner includes it.
      const lta = m.locationTechAssignments;
      if (lta) {
        for (const k of [loc.id, loc.name]) {
          if (k != null && Array.isArray(lta[k]) && lta[k].includes(name) && !lta[k].includes(shadowName)) {
            lta[k] = [...lta[k], shadowName];
          }
        }
      }
    }
  }
}
