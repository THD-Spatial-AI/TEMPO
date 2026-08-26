/**
 * Load the bundled Chile commune boundary GeoJSON (public/data/geo/chile_communes.geojson).
 *
 * Resolved relative to document.baseURI so it works both in the Vite dev server
 * (http://localhost) and a packaged Electron build loaded from file:// (Vite's
 * `base: './'` copies public/ into dist/). Cached after first load.
 */
let _cache = null;
let _inflight = null;

export function loadCommunesGeo() {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  const url = new URL('data/geo/chile_communes.geojson', document.baseURI).href;
  _inflight = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`commune GeoJSON not found (${r.status})`);
      return r.json();
    })
    .then((gj) => { _cache = gj; return gj; })
    .catch((e) => { _inflight = null; throw e; });
  return _inflight;
}

/** Normalize a commune/location name for matching (lowercase, strip accents/extra space). */
export function normComuna(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase();
}
