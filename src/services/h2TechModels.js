/**
 * h2TechModels.js
 * ───────────────────────────────────────────────────────────────────────────
 * Maps hydrogen-plant component slots to opentech-db API queries.
 * Falls back gracefully to hardcoded catalog when the API is offline.
 *
 * Usage:
 *   import { fetchH2Models, H2_SLOTS, getBestModel } from './h2TechModels';
 *   const genModels = await fetchH2Models('source');
 */

import { fetchTechsByCategory, fetchRawTechCatalog, isTechApiAvailable } from './techDatabaseApi';

// ─────────────────────────────────────────────────────────────────────────────
// Component slot definitions
// Each slot maps to an opentech-db category + optional keyword filter
// ─────────────────────────────────────────────────────────────────────────────
export const H2_SLOTS = {
  source: {
    label: 'Power Source',
    category: 'generation',
    keywords: null,   // show all generation techs
    paramMap: {
      grid_power_kw: (inst) => {
        const mw = inst?.typical_capacity_mw ?? inst?.capacity_mw;
        if (mw != null) return Math.round(Number(mw) * 1000);
        return inst?.capacity_kw ?? null;
      },
    },
  },
  electrolyzer: {
    label: 'Electrolyzer',
    category: 'conversion',
    keywords: ['electrolyz', 'pem', 'alkaline', 'aec', 'soec', 'hydrogen production'],
    paramMap: {
      // efficiency_percent (0-100) → we expose as an info label, not a direct slider
    },
  },
  compressor: {
    label: 'H₂ Compressor',
    category: 'conversion',
    keywords: ['compress', 'pump', 'h2 compress', 'hydrogen compress'],
    paramMap: {
      compressor_efficiency: (inst) => {
        const pct = inst?.efficiency_percent;
        if (pct != null) return parseFloat((Number(pct) / 100).toFixed(3));
        const frac = inst?.electrical_efficiency ?? inst?.efficiency;
        if (frac != null) return parseFloat((Number(frac) > 1 ? Number(frac) / 100 : Number(frac)).toFixed(3));
        return null;
      },
    },
  },
  storage: {
    label: 'H₂ Storage Tank',
    category: 'storage',
    keywords: ['hydrogen', 'h2', 'compressed hydrogen', 'tank', 'pressure vessel'],
    paramMap: {},
  },
  fuel_cell: {
    label: 'Fuel Cell',
    category: 'conversion',
    keywords: ['fuel cell', 'fuelcell', 'pemfc', 'sofc', 'mcfc', 'pafc', 'h2 power'],
    paramMap: {
      // h2_flow_rate_nm3h, oxidant_pressure_bar are process-specific not in DB
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded fallback catalog (used when API is offline)
// ─────────────────────────────────────────────────────────────────────────────
export const FALLBACK_CATALOG = {
  source: [
    { id: 'solar_pv',        name: 'Solar PV (Utility)',       category: 'generation', icon: '☀️', color: '#f59e0b', efficiency_pct: null,  capacity_kw: 10000, capex_usd_per_kw: 900,  lifetime_yr: 25, description: 'Large-scale ground-mounted photovoltaic', lifecycle: 'commercial' },
    { id: 'wind_onshore',    name: 'Wind Onshore',             category: 'generation', icon: '💨', color: '#60a5fa', efficiency_pct: null,  capacity_kw: 3000,  capex_usd_per_kw: 1200, lifetime_yr: 25, description: 'Onshore wind turbine (3 MW class)', lifecycle: 'commercial' },
    { id: 'wind_offshore',   name: 'Wind Offshore',            category: 'generation', icon: '🌊', color: '#3b82f6', efficiency_pct: null,  capacity_kw: 8000,  capex_usd_per_kw: 2900, lifetime_yr: 25, description: 'Offshore wind turbine (8 MW class)', lifecycle: 'commercial' },
    { id: 'natural_gas_ccgt',name: 'Natural Gas (CCGT)',        category: 'generation', icon: '🔥', color: '#f97316', efficiency_pct: 58,    capacity_kw: 400000,capex_usd_per_kw: 900,  lifetime_yr: 30, description: 'Combined-cycle gas turbine', lifecycle: 'commercial' },
    { id: 'coal_supercrit',  name: 'Coal (Supercritical)',      category: 'generation', icon: '⚫', color: '#374151', efficiency_pct: 43,    capacity_kw: 600000,capex_usd_per_kw: 2000, lifetime_yr: 40, description: 'Supercritical coal steam cycle', lifecycle: 'commercial' },
    { id: 'nuclear_pwr',     name: 'Nuclear (PWR)',             category: 'generation', icon: '⚛️', color: '#8b5cf6', efficiency_pct: 33,    capacity_kw: 1000000,capex_usd_per_kw:6500, lifetime_yr: 60, description: 'Pressurised water reactor', lifecycle: 'commercial' },
    { id: 'biomass_chp',     name: 'Biomass CHP',              category: 'generation', icon: '🌿', color: '#22c55e', efficiency_pct: 35,    capacity_kw: 5000,  capex_usd_per_kw: 2500, lifetime_yr: 25, description: 'Combined heat & power from biomass', lifecycle: 'commercial' },
    { id: 'hydro_ror',       name: 'Hydro (Run-of-River)',      category: 'generation', icon: '💧', color: '#06b6d4', efficiency_pct: 90,    capacity_kw: 5000,  capex_usd_per_kw: 2200, lifetime_yr: 60, description: 'Run-of-river hydropower', lifecycle: 'commercial' },
    { id: 'geothermal',      name: 'Geothermal',               category: 'generation', icon: '🌋', color: '#dc2626', efficiency_pct: 12,    capacity_kw: 50000, capex_usd_per_kw: 4000, lifetime_yr: 30, description: 'Single-flash geothermal plant', lifecycle: 'commercial' },
  ],
  electrolyzer: [
    { id: 'pem_elz',         name: 'PEM Electrolyzer',         category: 'conversion', icon: '⚗️', color: '#6366f1', efficiency_pct: 70, capacity_kw: 1000,  capex_usd_per_kw: 700,  lifetime_yr: 20, description: 'Proton-exchange membrane electrolyzer (state-of-art)', lifecycle: 'commercial' },
    { id: 'alkaline_elz',    name: 'Alkaline Electrolyzer',    category: 'conversion', icon: '⚗️', color: '#4f46e5', efficiency_pct: 65, capacity_kw: 2000,  capex_usd_per_kw: 500,  lifetime_yr: 25, description: 'Mature alkaline water electrolysis', lifecycle: 'commercial' },
    { id: 'soec_elz',        name: 'SOEC (High-Temp)',          category: 'conversion', icon: '🔬', color: '#7c3aed', efficiency_pct: 80, capacity_kw: 500,   capex_usd_per_kw: 1500, lifetime_yr: 15, description: 'Solid-oxide electrolyzer cell (1000°C steam)', lifecycle: 'demonstration' },
    { id: 'anion_elz',       name: 'Anion Exchange Membrane',  category: 'conversion', icon: '⚗️', color: '#8b5cf6', efficiency_pct: 68, capacity_kw: 200,   capex_usd_per_kw: 600,  lifetime_yr: 15, description: 'AEM electrolyzer — next-gen low-cost', lifecycle: 'demonstration' },
  ],
  compressor: [
    { id: 'recip_comp_350',  name: 'Reciprocating (350 bar)',   category: 'conversion', icon: '🔩', color: '#d97706', efficiency_pct: 80, capacity_kw: 100,  capex_usd_per_kw: 400,  lifetime_yr: 20, description: 'Multi-stage reciprocating compressor to 350 bar', lifecycle: 'commercial' },
    { id: 'recip_comp_700',  name: 'Reciprocating (700 bar)',   category: 'conversion', icon: '🔩', color: '#b45309', efficiency_pct: 75, capacity_kw: 150,  capex_usd_per_kw: 600,  lifetime_yr: 20, description: 'High-pressure reciprocating compressor to 700 bar', lifecycle: 'commercial' },
    { id: 'ionic_comp',      name: 'Ionic Liquid Compressor',   category: 'conversion', icon: '💧', color: '#92400e', efficiency_pct: 78, capacity_kw: 50,   capex_usd_per_kw: 900,  lifetime_yr: 15, description: 'Near-isothermal ionic liquid compressor', lifecycle: 'demonstration' },
    { id: 'linear_comp',     name: 'Linear Compressor',         category: 'conversion', icon: '🔩', color: '#78350f', efficiency_pct: 82, capacity_kw: 20,   capex_usd_per_kw: 800,  lifetime_yr: 15, description: 'Low-vibration linear compressor for small scale', lifecycle: 'demonstration' },
  ],
  storage: [
    { id: 'ch2_tank_350',    name: 'Compressed H₂ (350 bar)',   category: 'storage', icon: '🛢️', color: '#f59e0b', efficiency_pct: 99, capacity_kw: 5000,  capex_usd_per_kw: 15,   lifetime_yr: 30, description: 'Type-IV composite pressure vessel at 350 bar', lifecycle: 'commercial' },
    { id: 'ch2_tank_700',    name: 'Compressed H₂ (700 bar)',   category: 'storage', icon: '🛢️', color: '#d97706', efficiency_pct: 99, capacity_kw: 2000,  capex_usd_per_kw: 30,   lifetime_yr: 25, description: 'Type-IV pressure vessel at 700 bar for mobility', lifecycle: 'commercial' },
    { id: 'lh2_tank',        name: 'Liquid H₂ Tank',            category: 'storage', icon: '🧊', color: '#60a5fa', efficiency_pct: 85, capacity_kw: 50000, capex_usd_per_kw: 8,    lifetime_yr: 30, description: 'Cryogenic liquid hydrogen storage (–253 °C)', lifecycle: 'commercial' },
    { id: 'mh_storage',      name: 'Metal Hydride Storage',     category: 'storage', icon: '⚙️', color: '#10b981', efficiency_pct: 97, capacity_kw: 500,   capex_usd_per_kw: 200,  lifetime_yr: 20, description: 'Solid-state metal hydride H₂ storage', lifecycle: 'demonstration' },
    { id: 'cavern_storage',  name: 'Underground Cavern',        category: 'storage', icon: '🪨', color: '#6b7280', efficiency_pct: 98, capacity_kw: 500000,capex_usd_per_kw: 1,    lifetime_yr: 50, description: 'Salt cavern large-scale seasonal H₂ storage', lifecycle: 'commercial' },
  ],
  fuel_cell: [
    { id: 'pemfc',           name: 'PEM Fuel Cell',             category: 'conversion', icon: '⚡', color: '#8b5cf6', efficiency_pct: 58, capacity_kw: 1000,  capex_usd_per_kw: 800,  lifetime_yr: 15, description: 'Proton-exchange membrane fuel cell (stationary)', lifecycle: 'commercial' },
    { id: 'sofc',            name: 'Solid Oxide FC (SOFC)',      category: 'conversion', icon: '🔥', color: '#a78bfa', efficiency_pct: 65, capacity_kw: 200,   capex_usd_per_kw: 2000, lifetime_yr: 20, description: 'High-temperature solid oxide fuel cell + CHP', lifecycle: 'commercial' },
    { id: 'mcfc',            name: 'Molten Carbonate FC',       category: 'conversion', icon: '🔥', color: '#c4b5fd', efficiency_pct: 60, capacity_kw: 1400,  capex_usd_per_kw: 2500, lifetime_yr: 20, description: 'MCFC for utility-scale CHP applications', lifecycle: 'commercial' },
    { id: 'pafc',            name: 'Phosphoric Acid FC',        category: 'conversion', icon: '⚡', color: '#7c3aed', efficiency_pct: 42, capacity_kw: 400,   capex_usd_per_kw: 4000, lifetime_yr: 20, description: 'PAFC — robust, widely deployed', lifecycle: 'commercial' },
    { id: 'alkaline_fc',     name: 'Alkaline FC',               category: 'conversion', icon: '⚡', color: '#6d28d9', efficiency_pct: 55, capacity_kw: 100,   capex_usd_per_kw: 1000, lifetime_yr: 10, description: 'Alkaline fuel cell — low cost, pure H₂ required', lifecycle: 'commercial' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Scoring / "best model" selection
// Higher = better: prefer efficiency, then commercial lifecycle, penalise cost
// ─────────────────────────────────────────────────────────────────────────────
export function getBestModel(models) {
  if (!models?.length) return null;
  // Commercial lifecycle gets highest priority
  const scored = models.map((m) => {
    let score = 0;
    if (m.lifecycle === 'commercial') score += 100;
    if (m.lifecycle === 'projection') score += 50;
    score += (m.efficiency_pct ?? 50);
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise a raw API tech → our model shape
// ─────────────────────────────────────────────────────────────────────────────
function normaliseTech(raw, slotKey) {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name || raw.id || 'Unknown';
  const eff   = raw.efficiency_percent ?? raw.electrical_efficiency ?? raw.efficiency ?? null;
  const effPct = eff != null ? (Number(eff) > 1 ? Number(eff) : Number(eff) * 100) : null;
  const capMw  = raw.typical_capacity_mw ?? raw.capacity_mw ?? null;
  const capKw  = raw.capacity_kw ?? (capMw != null ? capMw * 1000 : null);
  const stage  = raw.life_cycle_stage || raw.lifecycle_stage || raw.stage || 'commercial';

  return {
    id:            raw.id || raw.tech_id || name.toLowerCase().replace(/\s+/g, '_'),
    name,
    category:      raw.category || H2_SLOTS[slotKey]?.category,
    icon:          '',
    color:         raw.color || raw.display_color || '#888888',
    efficiency_pct: effPct,
    capacity_kw:   capKw,
    capex_usd_per_kw: raw.capex_usd_per_kw ?? raw.capex ?? null,
    lifetime_yr:   raw.lifetime_years ?? raw.lifetime ?? null,
    description:   raw.description || name,
    lifecycle:     stage,
    _raw:          raw,
  };
}

// keyword filter helper
function matchesKeywords(model, keywords) {
  if (!keywords?.length) return true;
  const haystack = `${model.name} ${model.description || ''} ${model.id || ''}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

// Module-level cache  {slotKey → model[]}
const _cache = {};

/**
 * Fetch models for a given H2 component slot.
 * Tries the live opentech-db API first, falls back to FALLBACK_CATALOG.
 *
 * @param {'source'|'electrolyzer'|'compressor'|'storage'|'fuel_cell'} slotKey
 * @returns {Promise<Array>}
 */
export async function fetchH2Models(slotKey) {
  if (_cache[slotKey]) return _cache[slotKey];

  const slot = H2_SLOTS[slotKey];
  if (!slot) return FALLBACK_CATALOG[slotKey] ?? [];

  try {
    const available = await isTechApiAvailable(3000);
    if (!available) throw new Error('API offline');

    const raw = await fetchTechsByCategory(slot.category, { limit: 200 });
    const models = raw
      .map((t) => normaliseTech(t, slotKey))
      .filter(Boolean)
      .filter((m) => matchesKeywords(m, slot.keywords));

    // If no matches after filtering, use all from category
    const result = models.length > 0 ? models : FALLBACK_CATALOG[slotKey] ?? [];
    _cache[slotKey] = result;
    return result;
  } catch {
    // Network/API error → use fallback
    const result = FALLBACK_CATALOG[slotKey] ?? [];
    _cache[slotKey] = result;
    return result;
  }
}

/**
 * Clear model cache (call after VITE_TECH_API_URL changes).
 */
export function clearH2ModelCache() {
  Object.keys(_cache).forEach((k) => delete _cache[k]);
}

/**
 * Apply a selected model's parameters to the elz/sto/fc state objects.
 * Returns the partial patch object for setState merging.
 *
 * @param {string} slotKey
 * @param {Object} model
 * @returns {Object|null}
 */
export function applyModelParams(slotKey, model) {
  if (!model) return null;
  const slot = H2_SLOTS[slotKey];
  if (!slot?.paramMap) return null;

  const patch = {};
  for (const [stateKey, extractFn] of Object.entries(slot.paramMap)) {
    const val = extractFn(model._raw ?? model);
    if (val != null) patch[stateKey] = val;
  }
  return Object.keys(patch).length ? patch : null;
}
