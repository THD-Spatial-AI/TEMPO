// Turns run log lines into Fix targets: the [issue:<code>] tags engines log from their
// readiness check, and the entity names an engine error quotes (`solar_pv`, 'arica::pv').

export const issueCodeOf = (line) => String(line).match(/\[issue:([a-z0-9_]+)\]/)?.[1] || null;

// Error or warning lines, by the same words the log viewer colours them by. Only these get
// entity links: informational lines quote names too ("Generated CSV for 'el_import'").
export const isProblemLine = (line) =>
  /\b(error|exception|traceback|failed|infeasible|warn(ing)?|dropped|skipp(ed|ing))\b/i.test(String(line));

// Engines report ids like Calliope 0.6.8's _safe_id (lowercased, non-alphanumerics as _),
// so names and ids are compared in that form.
const norm = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function entityIndex(model) {
  const locations = new Map((model?.locations || []).map((l) => [norm(l.name || l.id), String(l.name || l.id)]));
  const techs = new Map((model?.technologies || []).map((t) => [norm(t.name || t.id), String(t.name || t.id)]));
  return { locations, techs };
}

// Returns line => [{ label, target }] for the quoted locations and techs it names.
export function makeEntityMatcher(model) {
  const { locations, techs } = entityIndex(model);
  return (line) => {
    const out = [];
    const seen = new Set();
    for (const [, quoted] of String(line).matchAll(/[`'"]([^`'"\n]{1,120})[`'"]/g)) {
      for (const part of quoted.split('::')) {
        const key = norm(part);
        const target = locations.has(key) ? { view: 'Locations', kind: 'location', id: locations.get(key) }
          : techs.has(key) ? { view: 'Technologies', kind: 'tech', id: techs.get(key) }
          : null;
        if (!target || seen.has(`${target.kind}:${target.id}`)) continue;
        seen.add(`${target.kind}:${target.id}`);
        out.push({ label: target.id, target });
      }
    }
    return out;
  };
}

// Locations where a run left demand unmet, as Map View targets.
export function unmetDemandTargets(result, model) {
  const { locations } = entityIndex(model);
  return Object.keys(result?.unmet_demand_by_location || {})
    .map((id) => locations.get(norm(id)))
    .filter(Boolean)
    .map((name) => ({ label: name, target: { view: 'Map View', kind: 'location', id: name, map: true } }));
}
