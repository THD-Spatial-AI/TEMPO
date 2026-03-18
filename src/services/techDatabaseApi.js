/**
 * techDatabaseApi.js
 * ------------------
 * Frontend client for the opentech-db Technology Catalog API
 * (default: hosted ngrok instance — no local setup required).
 *
 * Supported endpoints:
 *   GET  /api/v1/technologies                     – paginated catalog list
 *   GET  /api/v1/technologies/{id}                – full tech detail + instances
 *   GET  /api/v1/technologies/category/{cat}       – filter by category
 *   GET  /api/v1/technologies/{id}/instances       – all instances for one tech
 *   GET  /api/v1/technologies/{id}/instances/{iid} – one specific instance
 *   GET  /api/v1/technologies/calliope             – all techs as Calliope techs: block
 *   GET  /api/v1/technologies/{id}/calliope        – single tech in Calliope format
 *   GET  /health                                   – health check
 *
 * Valid categories: generation | storage | transmission | conversion
 *
 * All functions return Promises. Callers fall back to TECH_TEMPLATES when
 * the API is offline — no exceptions bubble to UI.
 *
 * Hosted URL: https://marleigh-unmuttering-effortlessly.ngrok-free.dev
 * Override with: VITE_TECH_API_URL=http://localhost:8000  (local dev)
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const OEO_API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TECH_API_URL) ||
  '/tech'; // Vite dev proxy: /tech/* → http://localhost:8000 (Docker)

// No extra headers needed for local Docker
const EXTRA_HEADERS = {};

const API_V1 = `${OEO_API_BASE_URL}/api/v1`;
const DEFAULT_TIMEOUT_MS = 10_000;

/** Valid opentech-db category names */
export const TECH_CATEGORIES = ['generation', 'storage', 'transmission', 'conversion'];

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
  const url = path.startsWith('http') ? path : `${OEO_API_BASE_URL}${path}`;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: EXTRA_HEADERS });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} (${url})`);
    }
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms (${url})`);
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
 * Check whether the opentech-db API is reachable.
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
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(`${API_V1}/technologies?limit=1`, { signal: controller.signal });
      clearTimeout(t);
      return r.ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — catalog list
// ---------------------------------------------------------------------------

/**
 * Fetch technologies in a specific category.
 *
 * @param {'generation'|'storage'|'transmission'|'conversion'} category
 * @param {{ limit?: number, skip?: number }} [opts]
 * @returns {Promise<Object[]>}
 */
export async function fetchTechsByCategory(category, { limit = 200, skip = 0 } = {}) {
  const params = new URLSearchParams({ limit, skip });
  const data = await apiFetch(`/api/v1/technologies/category/${category}?${params}`);
  return data?.technologies || data?.items || (Array.isArray(data) ? data : []);
}

/**
 * Fetch a single technology detail (includes `instances` array).
 *
 * @param {string} techId
 * @returns {Promise<Object>}
 */
export async function fetchTechDetail(techId) {
  return apiFetch(`/api/v1/technologies/${encodeURIComponent(techId)}`);
}

/**
 * Fetch all instances for a technology via the dedicated /instances endpoint.
 *
 * @param {string} techId
 * @param {{ lifecycle?: 'commercial'|'projection'|'demonstration', limit?: number }} [opts]
 * @returns {Promise<Object[]>}
 */
export async function fetchTechInstances(techId, { lifecycle, limit = 100 } = {}) {
  const params = new URLSearchParams({ limit });
  if (lifecycle) params.set('lifecycle', lifecycle);
  const data = await apiFetch(`/api/v1/technologies/${encodeURIComponent(techId)}/instances?${params}`);
  return Array.isArray(data) ? data : data?.instances || data?.items || [];
}

/**
 * Fetch a single specific instance by ID.
 *
 * @param {string} techId
 * @param {string} instanceId
 * @returns {Promise<Object>}
 */
export async function fetchSingleInstance(techId, instanceId) {
  return apiFetch(`/api/v1/technologies/${encodeURIComponent(techId)}/instances/${encodeURIComponent(instanceId)}`);
}

/**
 * Fetch all (or category-filtered) technologies as a server-side Calliope `techs:` block.
 *
 * @param {{ category?: string, instance_index?: number, cost_class?: string }} [opts]
 * @returns {Promise<{ techs: Object }>}
 */
export async function fetchCalliopeTechBlock({ category, instance_index = 0, cost_class = 'monetary' } = {}) {
  const params = new URLSearchParams({ instance_index, cost_class });
  if (category) params.set('category', category);
  return apiFetch(`/api/v1/technologies/calliope?${params}`);
}

/**
 * Fetch a single technology in Calliope format from the server-side adapter.
 *
 * @param {string} techId
 * @param {{ instance_index?: number, cost_class?: string }} [opts]
 * @returns {Promise<Object>}
 */
export async function fetchSingleTechCalliope(techId, { instance_index = 0, cost_class = 'monetary' } = {}) {
  const params = new URLSearchParams({ instance_index, cost_class });
  return apiFetch(`/api/v1/technologies/${encodeURIComponent(techId)}/calliope?${params}`);
}

/**
 * Fetch the full technology catalog from the OEO API.
 *
 * @returns {Promise<Object[]>}  Array of OEO tech objects (raw API format).
 * @throws {Error}  If the API is offline.
 */
export async function fetchRawTechCatalog() {
  const data = await apiFetch('/api/v1/technologies?limit=200');
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
const VRE_KEYWORDS = ['solar', 'wind', 'marine', 'run-of-river', 'wave', 'tidal', 'hydro', 'geothermal'];

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
 *
 * New API field names (opentech-db schema):
 *   instance_id / instance_name  – identity
 *   typical_capacity_mw          – capacity in MW → converted to kW
 *   efficiency_percent           – efficiency / CF in % (0-100) → converted to fraction
 *   capex_usd_per_kw             – capital cost USD/kW
 *   opex_fixed_usd_per_kw_year   – fixed O&M USD/kW/yr
 *   opex_variable_usd_per_kwh    – variable O&M USD/kWh
 *   lifetime_years               – economic lifetime
 *   ramp_rate_percent_per_min    – ramp rate %/min
 *   life_cycle_stage             – commercial | projection | demonstration
 *
 * Also handles old OEO API field names for backwards compatibility.
 */
export function instanceToParams(inst) {
  if (!inst || typeof inst !== 'object') return null;

  /** Extract a numeric value from a plain number or a {value} wrapper */
  const v = (...keys) => {
    for (const key of keys) {
      const raw = inst[key];
      if (raw == null) continue;
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'object' && raw.value != null) return Number(raw.value);
    }
    return null;
  };

  const constraints = {};
  const monetary = { interest_rate: 0.10 };

  // ── Efficiency ──────────────────────────────────────────────────────────
  // New API: efficiency_percent (0-100). Old API: electrical_efficiency (0-1).
  const effPct  = v('efficiency_percent');
  const effFrac = v('electrical_efficiency', 'efficiency');
  if (effPct != null) {
    constraints.energy_eff = parseFloat((effPct / 100).toFixed(4));
  } else if (effFrac != null) {
    constraints.energy_eff = parseFloat((effFrac > 1 ? effFrac / 100 : effFrac).toFixed(4));
  }

  // ── Capacity ──────────────────────────────────────────────────────────────
  // New API: typical_capacity_mw (MW) → convert to kW. Old API: capacity_kw.
  const capMw = v('typical_capacity_mw');
  const capKw = v('capacity_kw');
  if (capMw != null) {
    constraints.energy_cap_max = Math.round(capMw * 1000);
  } else if (capKw != null) {
    constraints.energy_cap_max = capKw;
  }

  // ── Lifetime ──────────────────────────────────────────────────────────────
  const lt = v('lifetime_years', 'economic_lifetime_yr', 'lifetime');
  if (lt != null) constraints.lifetime = lt;

  // ── Ramp rate ─────────────────────────────────────────────────────────────
  // %/min → fraction/hr
  const ramp = v('ramp_rate_percent_per_min', 'ramp_up_rate', 'ramping_rate_percent_per_min');
  if (ramp != null) constraints.energy_ramping = parseFloat((ramp * 60 / 100).toFixed(3));

  // ── CAPEX ─────────────────────────────────────────────────────────────────
  const capex = v('capex_usd_per_kw', 'capex_per_kw', 'capex');
  if (capex != null) monetary.energy_cap = capex;

  // ── Fixed O&M ─────────────────────────────────────────────────────────────
  const opexFixed = v('opex_fixed_usd_per_kw_year', 'opex_fixed_per_kw_yr', 'opex_fixed_usd_per_kw_yr');
  if (opexFixed != null) monetary.om_annual = opexFixed;

  // ── Variable O&M ──────────────────────────────────────────────────────────
  // New API: opex_variable_usd_per_kwh. Old API: opex_variable_per_mwh (MWh → /1000 to get kWh).
  const opexVarKwh = v('opex_variable_usd_per_kwh');
  const opexVarMwh = v('opex_variable_per_mwh', 'opex_var_usd_per_mwh');
  if (opexVarKwh != null) {
    monetary.om_prod = opexVarKwh;
  } else if (opexVarMwh != null) {
    monetary.om_prod = parseFloat((opexVarMwh / 1000).toFixed(6));
  }

  // ── Storage-specific ──────────────────────────────────────────────────────
  const capexKwh = v('capex_usd_per_kwh', 'storage_capex');
  if (capexKwh != null) monetary.storage_cap = capexKwh;

  const cRate = v('energy_cap_per_storage_cap', 'c_rate');
  if (cRate != null) constraints.energy_cap_per_storage_cap_equals = cRate;

  // ── Transmission-specific ─────────────────────────────────────────────────
  const capexPerKm = v('capex_per_distance_usd_per_kw_km', 'capex_usd_per_kw_km', 'line_capex_per_km');
  if (capexPerKm != null) monetary.energy_cap_per_distance = capexPerKm;

  // ── Identity & metadata ───────────────────────────────────────────────────
  // New API: instance_id (slug) + instance_name (display). Old API: label / id.
  const instanceId = inst.instance_id || inst.id || null;
  const instanceName =
    inst.instance_name ||
    inst.label ||
    inst.name ||
    inst.title ||
    null;

  const stage = inst.life_cycle_stage || inst.lifecycle_stage || inst.lifeCycleStage || inst.stage || null;
  const displayLabel = instanceName || instanceId || (stage ? String(stage) : null);

  return {
    id: instanceId,
    label: instanceName || instanceId || 'Instance',
    displayLabel,
    life_cycle_stage: stage,
    typical_capacity_mw: capMw,
    capex_usd_per_kw: capex,
    efficiency_percent: effPct,
    constraints,
    monetary,
    raw: inst,
  };
}

/**
 * Convert a v1 API tech detail object (with .instances[]) into a Calliope-style
 * tech definition. The first instance is used as the default parameters.
 *
 * Handles both new (technology_id / domain) and old (id / category) field names.
 *
 * @param {Object} detail - Raw v1 API tech detail
 * @returns {Object} Calliope-style tech with an extra `instances` array
 */
export function oeoDetailToCalliope(detail) {
  if (!detail || typeof detail !== 'object') return null;

  // Identity — new API: technology_id / technology_name
  const id   = detail.technology_id   || detail.id   || '';
  const name = detail.technology_name || detail.name  || id;

  // Category — new API uses `domain` (generation|storage|transmission|conversion)
  const category = detail.domain || detail.category || 'generation';
  const parent = apiCategoryToParent(name, category);

  // Carriers
  const carrier = detail.carrier || null;
  const inputCarriers  = detail.input_carriers  || (carrier ? [carrier] : []);
  const outputCarriers = detail.output_carriers || (carrier ? [carrier] : []);

  const instances = (detail.instances || []).map(instanceToParams).filter(Boolean);
  const def = instances[0] || { constraints: {}, monetary: { interest_rate: 0.10 } };

  const essentials = {
    name,
    parent,
    color: detail.color || detail.display_color || '#888888',
  };

  if (['storage', 'transmission'].includes(parent)) {
    essentials.carrier = outputCarriers[0] || inputCarriers[0] || 'electricity';
  } else if (parent === 'conversion_plus') {
    if (inputCarriers[0])  essentials.carrier_in  = inputCarriers[0];
    if (outputCarriers[0]) essentials.carrier_out = outputCarriers[0];
  } else {
    essentials.carrier_out = outputCarriers[0] || 'electricity';
  }

  return {
    id,
    name,
    parent,
    category,
    description: detail.description || name,
    tags: detail.tags || [],
    oeo_class: detail.oeo_class || detail.type_uri || '',
    source_url: detail.source_url || detail.source || '',
    n_instances: detail.n_instances || instances.length,
    instances,
    essentials,
    constraints: { ...def.constraints },
    costs: { monetary: { ...def.monetary } },
  };
}

/**
 * Fetch the full technology catalog with all instances populated.
 *
 * Strategy:
 * 1. Fetch catalog list (summary objects: technology_id, technology_name, category, n_instances)
 * 2. Fetch full detail for every tech in parallel (detail includes instances[])
 * 3. Map each detail via oeoDetailToCalliope()
 *
 * Falls back to an empty array on error — callers use TECH_TEMPLATES.
 *
 * @returns {Promise<Object[]>}
 */
export async function fetchFullCatalogWithInstances() {
  // Step 1: fetch list
  let catalogList;
  try {
    const data = await apiFetch(`/api/v1/technologies?limit=200`);
    catalogList = data?.technologies || data?.data || (Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn('[OEO] Failed to fetch technology catalog list:', err.message);
    return [];
  }

  if (!Array.isArray(catalogList) || catalogList.length === 0) {
    console.warn('[OEO] Technology catalog returned empty list');
    return [];
  }

  console.info(`[OEO] Catalog list: ${catalogList.length} technologies`);

  // Fast path: if list entries already include populated instances[], use directly
  if (Array.isArray(catalogList[0]?.instances) && catalogList[0].instances.length > 0) {
    return catalogList.map(oeoDetailToCalliope).filter(Boolean);
  }

  // Step 2: fetch detail for every tech in parallel
  const detailResults = await Promise.allSettled(
    catalogList.map(entry => {
      const techId = entry.technology_id || entry.id;
      if (!techId) return Promise.reject(new Error('Missing technology_id'));
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
      return fetch(`${API_V1}/technologies/${encodeURIComponent(techId)}`, { signal: ctrl.signal })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${techId}`);
          return r.json();
        });
    })
  );

  const failures = detailResults.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`[OEO] ${failures.length}/${catalogList.length} detail fetches failed:`,
      failures.slice(0, 3).map(r => r.reason?.message).join(', '));
  }

  const successful = detailResults
    .filter(r => r.status === 'fulfilled')
    .map(r => oeoDetailToCalliope(r.value))
    .filter(Boolean);

  console.info(`[OEO] Resolved ${successful.length} technologies with instances`);
  return successful;
}

/**
 * Fetch the complete technology catalog by fetching each category separately.
 * Useful if the main endpoint does not return all technologies reliably.
 *
 * @returns {Promise<Object[]>}
 */
export async function fetchFullCatalogByCategory() {
  const allResults = await Promise.allSettled(
    TECH_CATEGORIES.map(cat => fetchTechsByCategory(cat))
  );

  const allEntries = [];
  for (const result of allResults) {
    if (result.status === 'fulfilled') allEntries.push(...result.value);
  }

  if (allEntries.length === 0) {
    console.warn('[OEO] fetchFullCatalogByCategory: no entries found');
    return [];
  }

  // Deduplicate by technology_id
  const seen = new Set();
  const uniqueEntries = allEntries.filter(e => {
    const id = e.technology_id || e.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const detailResults = await Promise.allSettled(
    uniqueEntries.map(entry => {
      const techId = entry.technology_id || entry.id;
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
      return fetch(`${API_V1}/technologies/${encodeURIComponent(techId)}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${techId}`)));
    })
  );

  return detailResults
    .filter(r => r.status === 'fulfilled')
    .map(r => oeoDetailToCalliope(r.value))
    .filter(Boolean);
}

/** @deprecated Use fetchFullCatalogWithInstances */
export async function fetchTechCatalog() {
  const raw = await fetchRawTechCatalog();
  return raw.map(oeoToCalliope);
}

/** Fetch a single technology by ID and convert to Calliope format. */
export async function fetchTechnology(techId) {
  const raw = await fetchTechDetail(techId);
  return oeoDetailToCalliope(raw);
}

/** Fetch technologies filtered by Calliope parent type (client-side filter). */
export async function fetchTechsByType(techType) {
  // Map Calliope parent type to opentech-db category for efficient server-side filtering
  const catMap = { supply: 'generation', supply_plus: 'generation', storage: 'storage', transmission: 'transmission', conversion_plus: 'conversion' };
  const cat = catMap[techType];
  try {
    if (cat) {
      const entries = await fetchTechsByCategory(cat);
      const details = await Promise.allSettled(entries.map(e => fetchTechDetail(e.technology_id || e.id)));
      return details.filter(r => r.status === 'fulfilled').map(r => oeoDetailToCalliope(r.value)).filter(Boolean);
    }
  } catch { /* fall through */ }
  // Last-resort: fetch everything and filter client-side
  const all = await fetchFullCatalogWithInstances();
  return all.filter(t => t.parent === techType || t.essentials?.parent === techType);
}

/** Batch-fetch multiple technologies by ID. */
export async function fetchTechsBatch(techIds) {
  if (!techIds || techIds.length === 0) return [];
  const results = await Promise.allSettled(techIds.map(id => fetchTechnology(id)));
  return results.filter(r => r.status === 'fulfilled').map(r => r.value);
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
          instances: apiTech.instances?.length ? apiTech.instances : (tech.instances || []),
          constraints: { ...tech.constraints, ...apiTech.constraints },
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
