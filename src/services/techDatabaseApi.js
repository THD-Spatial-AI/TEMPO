/**
 * techDatabaseApi.js
 * ------------------
 * Frontend client for the local OEO Technology Database API
 * (default: http://127.0.0.1:8005).
 *
 * All functions return Promises and resolve to either live API data or
 * fallback static data from TechnologiesData.js when the API is offline.
 *
 * Usage
 * -----
 *   import { fetchTechCatalog, fetchTechnology, isTechApiAvailable } from './techDatabaseApi';
 *
 *   const techs = await fetchTechCatalog();              // full catalog
 *   const solar = await fetchTechnology('solar_pv');     // single tech
 *   const online = await isTechApiAvailable();           // health check
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const OEO_API_BASE_URL = 'http://127.0.0.1:8005';
const DEFAULT_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Low-level fetch helper (with timeout + graceful error handling)
// ---------------------------------------------------------------------------

/**
 * @param {string} path  - API path, e.g. "/api/technologies"
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 * @throws {Error} if the request fails or times out
 */
async function apiFetch(path, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = `${OEO_API_BASE_URL}${path}`;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`OEO API returned ${response.status}: ${response.statusText} (${url})`);
    }
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OEO API request timed out after ${timeoutMs}ms (${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timerId);
  }
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Convert an OEO API technology object into the Calliope-style dict format
 * that the rest of the application expects (same shape as TECH_TEMPLATES entries).
 *
 * This is the JavaScript twin of python/adapters/calliope_adapter.py.
 *
 * @param {Object} apiTech  - Raw OEO API technology object
 * @returns {Object}  - Calliope-style tech definition
 */
export function oeoToCalliope(apiTech) {
  const get = (...keys) => {
    for (const k of keys) {
      if (apiTech[k] !== undefined && apiTech[k] !== null) return apiTech[k];
    }
    return undefined;
  };

  const techType = get('tech_type', 'techType', 'type', 'category') || 'supply';
  const id = get('id', 'tech_id') || 'unknown';
  const name = get('name') || id;

  // ── essentials ──────────────────────────────────────────────────────────
  const essentials = {
    name,
    parent: techType,
    color: get('color', 'display_color') || '#888888',
  };

  if (['storage', 'transmission'].includes(techType)) {
    const carrier = get('carrier') || get('carrier_out') || 'electricity';
    essentials.carrier = carrier;
  } else if (techType === 'conversion_plus') {
    if (get('carrier_in')) essentials.carrier_in = get('carrier_in');
    if (get('carrier_out')) essentials.carrier_out = get('carrier_out');
  } else {
    essentials.carrier_out = get('carrier_out', 'output_carrier') || 'electricity';
  }

  // ── constraints ─────────────────────────────────────────────────────────
  const constraints = {};

  const lifetime = get('lifetime_years', 'lifetime');
  if (lifetime != null) constraints.lifetime = Number(lifetime);

  const eff = get('electrical_efficiency', 'efficiency', 'storage_eff', 'energy_efficiency');
  if (eff != null) constraints.energy_eff = Number(eff);

  const maxCap = get('energy_cap_max_kw', 'max_capacity_kw');
  if (maxCap != null) {
    constraints.energy_cap_max = Number(maxCap) === Infinity ? 'inf' : Number(maxCap);
  }

  const ramping = get('energy_ramping', 'ramp_rate');
  if (ramping != null) constraints.energy_ramping = Number(ramping);

  const resourceUnit = get('resource_unit');
  if (resourceUnit) constraints.resource_unit = resourceUnit;

  const cRate = get('energy_cap_per_storage_cap', 'c_rate');
  if (cRate != null) constraints.energy_cap_per_storage_cap_equals = Number(cRate);

  if (['supply', 'supply_plus'].includes(techType)) {
    if (!constraints.resource) constraints.resource = 'inf';
    if (!constraints.energy_cap_max) constraints.energy_cap_max = 'inf';
  }

  // ── costs ────────────────────────────────────────────────────────────────
  const monetary = {
    interest_rate: get('interest_rate', 'wacc', 'discount_rate') ?? 0.10,
  };

  const capexKw = get('capex_usd_per_kw', 'capex', 'capital_cost_usd_per_kw');
  if (capexKw != null) monetary.energy_cap = Number(capexKw);

  const capexKwh = get('capex_usd_per_kwh', 'storage_capex');
  if (capexKwh != null) monetary.storage_cap = Number(capexKwh);

  const opexFixed = get('opex_fixed_usd_per_kw_year', 'fixed_om', 'om_annual_usd_per_kw');
  if (opexFixed != null) monetary.om_annual = Number(opexFixed);

  const opexVar = get('opex_variable_usd_per_kwh', 'variable_om', 'om_prod_usd_per_kwh');
  if (opexVar != null) monetary.om_prod = Number(opexVar);

  const capexPerKm = get('capex_per_distance_usd_per_kw_km', 'line_capex_per_km');
  if (capexPerKm != null) monetary.energy_cap_per_distance = Number(capexPerKm);

  return {
    id,
    name,
    parent: techType,
    description: get('description') || name,
    oeo_class: get('oeo_class', 'oeoClass', 'type_uri') || '',
    source_url: get('source_url', 'source') || '',
    essentials,
    constraints,
    costs: { monetary },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the OEO Tech Database API is reachable.
 *
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<boolean>}
 */
export async function isTechApiAvailable(timeoutMs = 3000) {
  try {
    // Try /health first, fall back to a catalog call
    await apiFetch('/health', timeoutMs);
    return true;
  } catch {
    try {
      await apiFetch('/api/technologies', timeoutMs);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Fetch the full technology catalog from the OEO API.
 *
 * @returns {Promise<Object[]>}  Array of OEO tech objects (raw API format).
 * @throws {Error}  If the API is offline.
 */
export async function fetchRawTechCatalog() {
  const data = await apiFetch('/api/technologies');
  // Normalise: API may return an array or a wrapper object
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['technologies', 'items', 'data', 'results']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

/**
 * Fetch the full technology catalog and convert to Calliope-style objects.
 *
 * Falls back to an empty array if the API is offline (caller should use
 * TECH_TEMPLATES as fallback).
 *
 * @returns {Promise<Object[]>}  Array of Calliope-style tech definitions.
 */
export async function fetchTechCatalog() {
  const raw = await fetchRawTechCatalog();
  return raw.map(oeoToCalliope);
}

/**
 * Fetch a single technology by OEO identifier and convert to Calliope format.
 *
 * @param {string} techId  - Technology ID in the OEO API, e.g. "solar_pv".
 * @returns {Promise<Object>}  Calliope-style tech definition.
 * @throws {Error}  If the API is offline or the tech is not found.
 */
export async function fetchTechnology(techId) {
  const raw = await apiFetch(`/api/technologies/${techId}`);
  return oeoToCalliope(raw);
}

/**
 * Fetch technologies of a specific functional type.
 *
 * @param {string} techType  - "supply" | "storage" | "conversion_plus" | etc.
 * @returns {Promise<Object[]>}  Array of Calliope-style tech definitions.
 */
export async function fetchTechsByType(techType) {
  try {
    const data = await apiFetch(`/api/technologies/types/${techType}`);
    const list = Array.isArray(data) ? data : [];
    return list.map(oeoToCalliope);
  } catch {
    // Fallback: fetch full catalog and filter client-side
    const all = await fetchTechCatalog();
    return all.filter(
      (t) => t.parent === techType || t.essentials?.parent === techType
    );
  }
}

/**
 * Fetch multiple specific technologies by ID in a single request (batch).
 *
 * Falls back to parallel individual fetches if the batch endpoint is absent.
 *
 * @param {string[]} techIds
 * @returns {Promise<Object[]>}  Array of Calliope-style tech definitions.
 */
export async function fetchTechsBatch(techIds) {
  if (!techIds || techIds.length === 0) return [];

  try {
    const response = await fetch(`${OEO_API_BASE_URL}/api/technologies/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: techIds }),
    });
    if (response.ok) {
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      return list.map(oeoToCalliope);
    }
  } catch {
    // fall through to individual fetches
  }

  // Individual fallback (runs in parallel)
  const results = await Promise.allSettled(techIds.map((id) => fetchTechnology(id)));
  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
}

/**
 * Merge OEO API data into an array of existing (static) tech definitions.
 *
 * For each tech in `existingTechs`, attempts to fetch a fresh version from the
 * OEO API using the tech's `name` or `id` as the lookup key.  On success the
 * cost/efficiency parameters are updated.  If the API is offline or the tech
 * is not found the original object is left unchanged.
 *
 * This is the key integration function called by the Technologies component.
 *
 * @param {Object[]} existingTechs  - Array of TECH_TEMPLATES-style tech objects.
 * @returns {Promise<Object[]>}  Enriched array (original if API offline).
 */
export async function enrichTechsFromApi(existingTechs) {
  const online = await isTechApiAvailable(3000);
  if (!online) {
    console.info(
      '[OEO] Tech Database API offline – using local technology data.'
    );
    return existingTechs;
  }

  console.info('[OEO] Tech Database API online – enriching technology catalog…');

  const enriched = await Promise.all(
    existingTechs.map(async (tech) => {
      const apiId = (tech.id || tech.name || '').replace(/\s+/g, '_').toLowerCase();
      if (!apiId) return tech;

      try {
        const apiTech = await fetchTechnology(apiId);
        // Deep-merge: OEO values override costs/constraints, keep UI metadata
        return {
          ...tech,
          oeo_class: apiTech.oeo_class || tech.oeo_class,
          source_url: apiTech.source_url || tech.source_url,
          constraints: {
            ...tech.constraints,
            ...apiTech.constraints,
          },
          costs: {
            monetary: {
              ...(tech.costs?.monetary || {}),
              ...(apiTech.costs?.monetary || {}),
            },
          },
        };
      } catch {
        // API offline / tech not found – return original silently
        return tech;
      }
    })
  );

  console.info(`[OEO] Tech enrichment complete (${enriched.length} technologies).`);
  return enriched;
}
