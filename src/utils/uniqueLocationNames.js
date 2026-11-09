// Location names are the model's keys: Calliope, every engine translator, link
// endpoints and resource-profile columns all address a location by name. OSM
// imports often repeat names (line taps named after their line, two plants with
// one name), so TEMPO keeps names unique: the first keeps its name, repeats get
// " (2)", " (3)", … — never colliding with a name already in use.
import { calculateDistance } from '../meshGenerator/MeshUtils';

/** Unique names for a list, in order. */
export function uniqueNames(names) {
  const taken = new Set(names);
  const used = new Set();
  return names.map((n) => {
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
    let i = 2;
    let candidate;
    do candidate = `${n} (${i++})`; while (used.has(candidate) || taken.has(candidate));
    used.add(candidate);
    return candidate;
  });
}

const coord = (v) => (v === '' || v == null ? NaN : Number(v));

/**
 * Make the names of a saved model unique and re-point the links that used a
 * repeated name. Saved links name their ends, so for each such link the pair of
 * same-named locations whose distance best matches the link's stored `distance`
 * is chosen (the nearest pair when it has none). Locations keep their order and
 * the first of each name keeps it, so references to it stay valid.
 * @returns {{locations, links, renamed: string[]}|null} null when names are already unique
 */
export function repairDuplicateLocationNames(locations, links) {
  const names = (locations || []).map((l) => l.name);
  const fixed = uniqueNames(names);
  if (fixed.every((n, i) => n === names[i])) return null;

  const byOld = new Map();
  (locations || []).forEach((l, i) => {
    const list = byOld.get(names[i]) || [];
    list.push({ name: fixed[i], lat: coord(l.latitude), lon: coord(l.longitude) });
    byOld.set(names[i], list);
  });
  const ends = (name) => byOld.get(name) || [{ name, lat: NaN, lon: NaN }];

  const repairedLinks = (links || []).map((link) => {
    const as = ends(link.from);
    const bs = ends(link.to);
    if (as.length < 2 && bs.length < 2) return link;
    const want = Number(link.distance);
    let best = null;
    let bestErr = Infinity;
    for (const a of as) {
      for (const b of bs) {
        if (a.name === b.name) continue;
        const d = calculateDistance(a.lat, a.lon, b.lat, b.lon);
        const err = Number.isFinite(d) ? (Number.isFinite(want) ? Math.abs(d - want) : d) : Infinity;
        if (best === null || err < bestErr) {
          best = [a.name, b.name];
          bestErr = err;
        }
      }
    }
    return best && (best[0] !== link.from || best[1] !== link.to) ? { ...link, from: best[0], to: best[1] } : link;
  });

  return {
    locations: (locations || []).map((l, i) => (fixed[i] === names[i] ? l : { ...l, name: fixed[i] })),
    links: repairedLinks,
    renamed: fixed.filter((n, i) => n !== names[i]),
  };
}
