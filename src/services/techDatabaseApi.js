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
const API_V1 = `${OEO_API_BASE_URL}/api/v1`;
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
    await apiFetch('/health', timeoutMs);
    return true;
  } catch {
    try {
      // Check v1 catalog endpoint
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(`${API_V1}/technologies`, { signal: controller.signal });
      clearTimeout(t);
      return r.ok;
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

// ---------------------------------------------------------------------------
// v1 API: instance-aware catalog helpers
// ---------------------------------------------------------------------------

/** VRE keywords used to distinguish supply_plus from supply in API 'generation' category */
const VRE_KEYWORDS = ['solar', 'wind', 'marine', 'run-of-river', 'wave', 'tidal'];

function apiCategoryToParent(name, category) {
  if (category === 'storage') return 'storage';
  if (category === 'transmission') return 'transmission';
  if (category === 'generation') {
    const lower = (name || '').toLowerCase();
    return VRE_KEYWORDS.some(k => lower.includes(k)) ? 'supply_plus' : 'supply';
  }
  if (category === 'conversion') return 'conversion_plus';
  return 'supply';
}

/**
 * Convert a raw API instance object into flat constraints/monetary dicts.
 * Each param field is an object with { value, unit, min, max, source }.
 */
export function instanceToParams(inst) {
  // Helper: extract a numeric value from either a direct number or a {value} wrapper
  const v = (directKey, ...aliases) => {
    for (const key of [directKey, ...aliases]) {
      const raw = inst[key];
      if (raw == null) continue;
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'object' && raw.value != null) return raw.value;
    }
    return null;
  };

  // DEBUG: log all keys so we can see what fields the API actually provides
  if (typeof window !== 'undefined' && window.__oeoDebug) {
    console.log('[OEO instanceToParams] keys:', Object.keys(inst), 'instance_name:', inst.instance_name, 'name:', inst.name);
  }

  const constraints = {};
  const monetary = { interest_rate: 0.10 };

  // Efficiency: API returns `electrical_efficiency: { value: 0.67 }` (already 0-1 fraction)
  const eff = v('electrical_efficiency', 'efficiency_percent', 'efficiency');
  if (eff != null) {
    // If > 1 it was a percentage, convert to fraction
    constraints.energy_eff = parseFloat((eff > 1 ? eff / 100 : eff).toFixed(4));
  }

  // Lifetime: `economic_lifetime_yr`, fallback to `lifetime_years`
  const lt = v('economic_lifetime_yr', 'lifetime_years', 'lifetime');
  if (lt != null) constraints.lifetime = lt;

  // Capacity: API uses `capacity_kw: { value }` (already in kW)
  const capKw = v('capacity_kw', 'typical_capacity_mw');
  if (capKw != null) {
    // If the value looks like MW scale (e.g. 0.001 – 100) and field is typical_capacity_mw, convert
    const isMwField = inst['typical_capacity_mw'] != null && inst['capacity_kw'] == null;
    constraints.energy_cap_max = isMwField ? capKw * 1000 : capKw;
  }

  // Ramping: `ramp_up_rate: { value: 10, unit: "%capacity/min" }` → fraction/hr
  const ramp = v('ramp_up_rate', 'ramping_rate_percent_per_min');
  if (ramp != null) constraints.energy_ramping = parseFloat((ramp * 60 / 100).toFixed(3));

  // CAPEX: `capex_per_kw: { value }` (USD/kW)
  const capex = v('capex_per_kw', 'capex_usd_per_kw', 'capex');
  if (capex != null) monetary.energy_cap = capex;

  // Fixed O&M: `opex_fixed_per_kw_yr: { value }` (USD/kW/yr)
  const opexFixed = v('opex_fixed_per_kw_yr', 'opex_fixed_usd_per_kw_yr');
  if (opexFixed != null) monetary.om_annual = opexFixed;

  // Variable O&M: `opex_variable_per_mwh: { value }` (USD/MWh) → convert to USD/kWh
  const opexVar = v('opex_variable_per_mwh', 'opex_var_usd_per_mwh', 'opex_variable_per_kwh');
  if (opexVar != null) monetary.om_prod = parseFloat((opexVar / 1000).toFixed(6));

  // Build the human-readable display label — try every plausible field name
  // Real API uses `label` field; fallbacks for other schemas
  const instanceName =
    inst.label ||
    inst.instance_name ||
    inst.instanceName ||
    inst.title ||
    inst.name ||
    null;

  const stage = inst.life_cycle_stage || inst.lifeCycleStage || inst.stage ||
    inst.scenario || (inst.extra && (inst.extra.stage || inst.extra.life_cycle_stage));

  const displayLabel = instanceName ||
    (stage ? String(stage).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null);

  // Log what we resolved (unconditionally on first 3 instances for easy debugging)
  if (typeof window !== 'undefined') {
    console.log('[OEO] instanceToParams →', { label: inst.label, instance_name: inst.instance_name, displayLabel, id: inst.instance_id || inst.id });
  }

  return {
    id: inst.id || inst.instance_id,
    label: instanceName || 'Instance',
    displayLabel,
    life_cycle_stage: inst.life_cycle_stage || null,
    constraints,
    monetary,
    raw: inst,
  };
}

/**
 * Convert a v1 API tech detail object (with .instances[]) into a Calliope-style
 * tech definition. The first instance is used as the default parameters.
 *
 * @param {Object} detail - Raw v1 API tech detail
 * @returns {Object} Calliope-style tech with an extra `instances` array
 */
export function oeoDetailToCalliope(detail) {
  // Support both JSON-native names (technology_id, domain, carrier) and old API names (id, category)
  const name = detail.technology_name || detail.name || '';
  const id   = detail.technology_id   || detail.id   || name;
  const category = detail.domain || detail.category || 'supply';
  const parent = apiCategoryToParent(name, category);

  // Carriers — new format uses a single `carrier` string; old format uses arrays
  const carrier  = detail.carrier || null;
  const inputCarriers  = detail.input_carriers  || (carrier ? [carrier] : []);
  const outputCarriers = detail.output_carriers || (carrier ? [carrier] : []);

  const instances = (detail.instances || []).map(instanceToParams);
  const def = instances[0] || { constraints: {}, monetary: {} };

  const essentials = {
    name,
    parent,
    color: '#888888',
  };

  if (['storage', 'transmission'].includes(parent)) {
    essentials.carrier = outputCarriers[0] || inputCarriers[0] || 'electricity';
  } else if (parent === 'conversion_plus') {
    if (inputCarriers[0]) essentials.carrier_in = inputCarriers[0];
    if (outputCarriers[0]) essentials.carrier_out = outputCarriers[0];
  } else {
    essentials.carrier_out = outputCarriers[0] || 'electricity';
  }

  return {
    id,
    name,
    parent,
    description: detail.description || name,
    oeo_class: detail.oeo_class || '',
    instances,
    essentials,
    constraints: def.constraints,
    costs: { monetary: def.monetary },
  };
}

/**
 * Fetch the full v1 catalog, then fetch each tech's detail (with instances)
 * in parallel.  Returns an array of Calliope-style tech objects with
 * `instances` populated.
 *
 * Falls back to an empty array on error (caller uses static TECH_TEMPLATES).
 *
 * @returns {Promise<Object[]>}
 */
export async function fetchFullCatalogWithInstances() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let catalog;
  try {
    const resp = await fetch(`${API_V1}/technologies`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // Support { technologies: [...] } wrapper, plain array, or { data: [...] }
    catalog = data?.technologies || data?.data || (Array.isArray(data) ? data : []);
  } finally {
    clearTimeout(t);
  }

  // Debug: log first catalog entry to understand structure
  if (catalog.length > 0) {
    const first = catalog[0];
    console.log('[OEO] catalog[0] keys:', Object.keys(first));
    console.log('[OEO] catalog[0] sample:', JSON.stringify(first).slice(0, 400));
    if (Array.isArray(first.instances) && first.instances.length > 0) {
      console.log('[OEO] instances[0] keys:', Object.keys(first.instances[0]));
      console.log('[OEO] instances[0] sample:', JSON.stringify(first.instances[0]).slice(0, 300));
    }
  }

  // Fast path: if entries already have instances populated, skip detail fetches
  if (catalog.length > 0 && Array.isArray(catalog[0]?.instances)) {
    return catalog.map(oeoDetailToCalliope);
  }

  // Fetch all details in parallel — id may be technology_id or id
  const detailResults = await Promise.allSettled(
    catalog.map(entry => {
      const techId = entry.technology_id || entry.id;
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
      return fetch(`${API_V1}/technologies/${techId}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${techId}`)));
    })
  );

  const failed = detailResults.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[OEO] ${failed.length} detail fetches failed:`, failed.slice(0, 3).map(r => r.reason?.message));
  }

  return detailResults
    .filter(r => r.status === 'fulfilled')
    .map(r => oeoDetailToCalliope(r.value));
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
