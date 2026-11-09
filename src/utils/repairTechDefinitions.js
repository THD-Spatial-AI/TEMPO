// Engines and the profile dialogs look a location's tech up by NAME in the model's
// technology list. OSM imports put techs on locations by template id
// ("solar_pv_utility_scale") while older saves registered templates under their
// display name ("Solar PV Utility-scale"), or not at all — leaving the plant with
// no parent, carriers or costs. This fills each missing definition, keyed by the
// name the locations use.

/**
 * @param {object[]} locations model locations (techs keyed by tech name)
 * @param {object[]} technologies model technology definitions
 * @param {object[]} templates built-in templates (with `id` and `name`)
 * @returns {{technologies: object[], added: string[]}|null} null when nothing is missing
 */
export function repairTechDefinitions(locations, technologies, templates) {
  const techs = technologies || [];
  const defined = new Set(techs.map((t) => t.name));
  const used = new Set();
  (locations || []).forEach((l) => Object.keys(l.techs || {}).forEach((k) => used.add(k)));
  const missing = [...used].filter((k) => !defined.has(k));
  if (!missing.length) return null;

  const out = [...techs];
  const added = [];
  for (const key of missing) {
    // Prefer the model's own definition registered under its display name (keeps
    // any edited parameters), then a built-in template.
    const source = techs.find((t) => t.id === key)
      || (templates || []).find((t) => t.id === key || t.name === key);
    if (!source) continue;
    out.push({ ...source, name: key });
    added.push(key);
  }
  return added.length ? { technologies: out, added } : null;
}
