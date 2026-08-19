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
      default: break; // unknown ops silently skipped
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
