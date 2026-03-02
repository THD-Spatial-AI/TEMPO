/**
 * useLoadedRegions
 *
 * Fetches the list of region_paths currently loaded in PostGIS from the backend,
 * then enriches each path with coordinates (center + derived bbox) by cross-
 * referencing the static regions_database.json.
 *
 * Returns a nested tree:
 *   {
 *     "South_America": {
 *       label: "South America",
 *       countries: {
 *         "Chile": {
 *           label: "Chile",
 *           path: "South_America/Chile",
 *           center: [-33.45, -70.67],
 *           zoom: 5,
 *           bbox: { minLon, minLat, maxLon, maxLat },
 *           regions: { ... }          // sub-paths if any
 *         }
 *       }
 *     }
 *   }
 */

import { useState, useEffect, useCallback } from 'react';
import regionsDb from '../../public/data/osm_extracts/regions_database.json';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a center [lat, lon] + zoom level into an approximate bounding box.
 * The deltas are chosen to produce a "nice" viewport at that zoom level.
 */
function centerZoomToBbox(center, zoom) {
  // latitude, longitude order in regions_database.json
  const [lat, lon] = center;
  // Degrees of coverage at each zoom (rough but sufficient for map fly-to)
  const delta = 180 / Math.pow(2, zoom - 1);
  return {
    minLon: lon - delta,
    maxLon: lon + delta,
    minLat: Math.max(lat - delta * 0.6, -90),
    maxLat: Math.min(lat + delta * 0.6, 90),
  };
}

/**
 * Pretty-print a region path segment: underscores → spaces.
 * "South_America" → "South America", "Bayern" → "Bayern"
 */
function prettify(str) {
  return str.replace(/_/g, ' ');
}

/**
 * Navigate the regions_database tree using a path array like
 * ["South_America", "Chile"] or ["Europe", "Germany", "Bayern", "Niederbayern"]
 * and return the matching node (with center/zoom) or null.
 */
function lookupDbNode(pathParts) {
  const db = regionsDb.continents || regionsDb;
  const [continent, country, region, subregion] = pathParts;

  const contData = db[continent];
  if (!contData) return null;

  if (!country) return contData;

  const countries = contData.countries || contData;
  // Try exact key first, then case-insensitive
  let countryKey = Object.keys(countries).find(
    k => k === country || k.toLowerCase() === country.toLowerCase()
         || k.toLowerCase().replace(/[\s_-]/g, '') === country.toLowerCase().replace(/[\s_-]/g, '')
  );
  if (!countryKey) return null;
  const countryData = countries[countryKey];

  if (!region) return countryData;

  const regions = countryData.regions || {};
  let regionKey = Object.keys(regions).find(
    k => k === region || k.toLowerCase() === region.toLowerCase()
         || k.toLowerCase().replace(/[\s_-]/g, '') === region.toLowerCase().replace(/[\s_-]/g, '')
  );
  if (!regionKey) return null;
  const regionData = regions[regionKey];

  if (!subregion) return regionData;

  const subregions = regionData.subregions || {};
  let subKey = Object.keys(subregions).find(
    k => k === subregion || k.toLowerCase() === subregion.toLowerCase()
         || k.toLowerCase().replace(/[\s_-]/g, '') === subregion.toLowerCase().replace(/[\s_-]/g, '')
  );
  return subKey ? subregions[subKey] : null;
}

/**
 * Build a hierarchical tree from a flat list of path strings.
 * e.g. ["South_America/Chile", "Europe/Germany/Bayern/Niederbayern"]
 */
function buildTree(paths) {
  const tree = {};

  for (const fullPath of paths) {
    const parts = fullPath.split('/').filter(Boolean);
    if (parts.length < 2) continue;

    const [continent, country, region, subregion] = parts;

    // ── Continent ──────────────────────────────────────────────────────────
    if (!tree[continent]) {
      tree[continent] = { label: prettify(continent), countries: {} };
    }
    const contNode = tree[continent];

    // ── Country ────────────────────────────────────────────────────────────
    if (!contNode.countries[country]) {
      const dbNode = lookupDbNode([continent, country]);
      const center = dbNode?.center || [0, 0];
      const zoom   = dbNode?.zoom   || 5;
      contNode.countries[country] = {
        label:   prettify(country),
        path:    `${continent}/${country}`,
        center,
        zoom,
        bbox:    centerZoomToBbox(center, zoom),
        regions: {},
      };
    }
    const countryNode = contNode.countries[country];

    if (!region) continue;

    // ── Region ─────────────────────────────────────────────────────────────
    if (!countryNode.regions[region]) {
      const dbNode = lookupDbNode([continent, country, region]);
      const center = dbNode?.center || countryNode.center;
      const zoom   = dbNode?.zoom   || countryNode.zoom + 1;
      countryNode.regions[region] = {
        label:      prettify(region),
        path:       `${continent}/${country}/${region}`,
        center,
        zoom,
        bbox:       centerZoomToBbox(center, zoom),
        subregions: {},
      };
    }
    const regionNode = countryNode.regions[region];

    if (!subregion) continue;

    // ── Subregion ──────────────────────────────────────────────────────────
    if (!regionNode.subregions[subregion]) {
      const dbNode = lookupDbNode([continent, country, region, subregion]);
      const center = dbNode?.center || regionNode.center;
      const zoom   = dbNode?.zoom   || regionNode.zoom + 1;
      regionNode.subregions[subregion] = {
        label:  prettify(subregion),
        path:   `${continent}/${country}/${region}/${subregion}`,
        center,
        zoom,
        bbox:   centerZoomToBbox(center, zoom),
      };
    }
  }

  return tree;
}

// ── hook ──────────────────────────────────────────────────────────────────────
// Build the region tree directly from the bundled regions_database.json.
// This removes the PostGIS/GeoServer dependency — all defined regions are
// always available; live OSM data for any selected region is fetched on-demand
// via the Overpass API.

export function useLoadedRegions() {
  const [tree,    setTree]    = useState({});
  const [paths,   setPaths]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Flatten the nested regions_database.json into a list of path strings and
  // build the tree in one pass.  Uses the statically-bundled import so this
  // works in both Vite dev mode AND Electron file:// production mode.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const continents = regionsDb.continents || regionsDb;

      // Collect all paths (continent/country, and deeper if present)
      const allPaths = [];
      for (const [cont, contData] of Object.entries(continents)) {
        const countries = contData.countries || contData;
        for (const [country, countryData] of Object.entries(countries)) {
          if (typeof countryData !== 'object') continue;
          allPaths.push(`${cont}/${country}`);
          const regions = countryData.regions || {};
          for (const [region, regionData] of Object.entries(regions)) {
            if (typeof regionData !== 'object') continue;
            allPaths.push(`${cont}/${country}/${region}`);
            const subregions = regionData.subregions || {};
            for (const subregion of Object.keys(subregions)) {
              allPaths.push(`${cont}/${country}/${region}/${subregion}`);
            }
          }
        }
      }

      setPaths(allPaths);
      setTree(buildTree(allPaths));
    } catch (err) {
      console.error('useLoadedRegions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { tree, paths, loading, error, refresh };
}
