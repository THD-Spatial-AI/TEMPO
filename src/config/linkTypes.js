/**
 * LINK TYPE REGISTRY
 *
 * Defines all supported physical link (transmission) infrastructure types.
 * Each link type maps to:
 *   - A Calliope transmission technology template (essentials.parent = 'transmission')
 *   - A carrier (single carrier transported by this link)
 *   - Visual properties for map rendering
 *
 * Users select a link type when drawing connections between locations on the map.
 * The link type determines:
 *   1. Which carrier the link transports
 *   2. Default constraints (efficiency, cost per km, lifetime)
 *   3. How the link is rendered on the map (color, line dash)
 */

import { CARRIERS } from './carriers';

/** @type {Record<string, LinkTypeDefinition>} */
export const LINK_TYPES = {
  // ── Electricity ───────────────────────────────────────────────────────────
  hvac_overhead: {
    id: 'hvac_overhead',
    label: 'HVAC Overhead Line',
    carrier: 'electricity',
    group: 'Electricity',
    icon: '⚡',
    description: 'High-voltage AC overhead transmission line. Best for regional grids up to ~800 km.',
    calliopeTech: 'hvac_overhead_lines',
    defaults: { energy_eff: 0.98, lifetime: 40, energy_cap_per_distance: 0.91 },
    lineDash: [],
    lineWidth: 2,
  },
  hvdc_overhead: {
    id: 'hvdc_overhead',
    label: 'HVDC Overhead Line',
    carrier: 'electricity',
    group: 'Electricity',
    icon: '⚡',
    description: 'High-voltage DC overhead line for long-distance bulk power transfer.',
    calliopeTech: 'hvdc_overhead_lines',
    defaults: { energy_eff: 0.97, lifetime: 40, energy_cap_per_distance: 1.10 },
    lineDash: [],
    lineWidth: 2.5,
  },
  hvac_cable: {
    id: 'hvac_cable',
    label: 'HVAC Underground Cable',
    carrier: 'electricity',
    group: 'Electricity',
    icon: '⚡',
    description: 'Underground high-voltage AC cable for urban or sensitive areas.',
    calliopeTech: 'hvac_underground_cables',
    defaults: { energy_eff: 0.97, lifetime: 40, energy_cap_per_distance: 3.00 },
    lineDash: [4, 4],
    lineWidth: 2,
  },
  hvdc_subsea: {
    id: 'hvdc_subsea',
    label: 'HVDC Subsea Cable',
    carrier: 'electricity',
    group: 'Electricity',
    icon: '⚡',
    description: 'Submarine HVDC cable interconnector across bodies of water.',
    calliopeTech: 'hvdc_subsea_cables',
    defaults: { energy_eff: 0.96, lifetime: 40, energy_cap_per_distance: 4.50 },
    lineDash: [6, 3],
    lineWidth: 2.5,
  },

  // ── Heat ─────────────────────────────────────────────────────────────────
  district_heat: {
    id: 'district_heat',
    label: 'District Heating Network',
    carrier: 'heat',
    group: 'Heat',
    icon: '🔥',
    description: 'Insulated pipe network for district heat distribution.',
    calliopeTech: 'district_heating_networks',
    defaults: { energy_eff: 0.90, lifetime: 40, energy_cap_per_distance: 0.60 },
    lineDash: [],
    lineWidth: 2,
  },
  district_cooling: {
    id: 'district_cooling',
    label: 'District Cooling Network',
    carrier: 'cooling',
    group: 'Heat',
    icon: '❄️',
    description: 'Chilled water pipe network for district cooling.',
    calliopeTech: 'district_cooling_networks',
    defaults: { energy_eff: 0.92, lifetime: 40, energy_cap_per_distance: 0.70 },
    lineDash: [3, 3],
    lineWidth: 2,
  },

  // ── Hydrogen ─────────────────────────────────────────────────────────────
  h2_pipeline: {
    id: 'h2_pipeline',
    label: 'Hydrogen Pipeline',
    carrier: 'hydrogen',
    group: 'Hydrogen',
    icon: 'H₂',
    description: 'Dedicated high-pressure hydrogen pipeline. Can be new-build or repurposed gas pipeline.',
    calliopeTech: 'hydrogen_pipelines',
    defaults: { energy_eff: 0.98, lifetime: 40, energy_cap_per_distance: 1.20 },
    lineDash: [],
    lineWidth: 2,
  },
  h2_truck: {
    id: 'h2_truck',
    label: 'Hydrogen Truck Transport',
    carrier: 'hydrogen',
    group: 'Hydrogen',
    icon: '🚚',
    description: 'Compressed or liquid H₂ transport by road vehicle. Suitable for dispersed demand.',
    calliopeTech: 'hydrogen_truck',
    defaults: { energy_eff: 0.95, lifetime: 15, energy_cap_per_distance: 0.20 },
    lineDash: [8, 4],
    lineWidth: 1.5,
  },

  // ── Natural Gas ──────────────────────────────────────────────────────────
  gas_pipeline: {
    id: 'gas_pipeline',
    label: 'Natural Gas Pipeline',
    carrier: 'gas',
    group: 'Gas',
    icon: '🔆',
    description: 'High-pressure natural gas transmission pipeline.',
    calliopeTech: 'natural_gas_pipelines',
    defaults: { energy_eff: 0.99, lifetime: 50, energy_cap_per_distance: 0.50 },
    lineDash: [],
    lineWidth: 2,
  },

  // ── Biogas ────────────────────────────────────────────────────────────────
  biogas_pipeline: {
    id: 'biogas_pipeline',
    label: 'Biogas Pipeline',
    carrier: 'biogas',
    group: 'Gas',
    icon: '🌿',
    description: 'Low-pressure biogas distribution pipeline.',
    calliopeTech: 'biogas_pipelines',
    defaults: { energy_eff: 0.98, lifetime: 30, energy_cap_per_distance: 0.40 },
    lineDash: [4, 4],
    lineWidth: 1.5,
  },

  // ── CO₂ ──────────────────────────────────────────────────────────────────
  co2_pipeline: {
    id: 'co2_pipeline',
    label: 'CO₂ Pipeline',
    carrier: 'co2',
    group: 'Carbon',
    icon: 'CO₂',
    description: 'Supercritical CO₂ pipeline for CCS/CCU transport to storage or utilisation sites.',
    calliopeTech: 'co2_pipelines',
    defaults: { energy_eff: 0.99, lifetime: 40, energy_cap_per_distance: 0.80 },
    lineDash: [],
    lineWidth: 2,
  },

  // ── Biomass ───────────────────────────────────────────────────────────────
  biomass_truck: {
    id: 'biomass_truck',
    label: 'Biomass Truck Transport',
    carrier: 'biomass',
    group: 'Biomass',
    icon: '🌾',
    description: 'Solid biomass transport by truck.',
    calliopeTech: 'biomass_truck',
    defaults: { energy_eff: 0.97, lifetime: 15, energy_cap_per_distance: 0.10 },
    lineDash: [8, 4],
    lineWidth: 1.5,
  },
  biomass_train: {
    id: 'biomass_train',
    label: 'Biomass Rail Transport',
    carrier: 'biomass',
    group: 'Biomass',
    icon: '🚂',
    description: 'Solid biomass bulk transport by rail.',
    calliopeTech: 'biomass_train',
    defaults: { energy_eff: 0.98, lifetime: 30, energy_cap_per_distance: 0.05 },
    lineDash: [5, 5],
    lineWidth: 2,
  },

  // ── Oil & Liquid Fuels ────────────────────────────────────────────────────
  oil_pipeline: {
    id: 'oil_pipeline',
    label: 'Oil Pipeline',
    carrier: 'oil',
    group: 'Liquid Fuels',
    icon: '🛢️',
    description: 'Crude oil or refined products pipeline.',
    calliopeTech: 'oil_pipelines',
    defaults: { energy_eff: 0.995, lifetime: 50, energy_cap_per_distance: 0.45 },
    lineDash: [],
    lineWidth: 2,
  },
  oil_truck: {
    id: 'oil_truck',
    label: 'Fuel Truck',
    carrier: 'oil',
    group: 'Liquid Fuels',
    icon: '⛽',
    description: 'Liquid fuel distribution by tanker truck.',
    calliopeTech: 'fuel_truck',
    defaults: { energy_eff: 0.98, lifetime: 15, energy_cap_per_distance: 0.15 },
    lineDash: [8, 4],
    lineWidth: 1.5,
  },

  // ── Water ─────────────────────────────────────────────────────────────────
  water_pipeline: {
    id: 'water_pipeline',
    label: 'Water Pipeline',
    carrier: 'water',
    group: 'Water',
    icon: '💧',
    description: 'Water transmission pipeline (drinking, industrial or cooling water).',
    calliopeTech: 'water_pipelines',
    defaults: { energy_eff: 0.99, lifetime: 60, energy_cap_per_distance: 0.30 },
    lineDash: [3, 3],
    lineWidth: 1.5,
  },

  // ── Generic ───────────────────────────────────────────────────────────────
  generic: {
    id: 'generic',
    label: 'Generic Link',
    carrier: 'electricity',
    group: 'Generic',
    icon: '🔗',
    description: 'Generic connection — select a specific type above for more accurate defaults.',
    calliopeTech: 'power_lines',
    defaults: { energy_eff: 1.0, lifetime: 40 },
    lineDash: [],
    lineWidth: 1,
  },
};

/** Ordered list of link type IDs */
export const LINK_TYPE_IDS = Object.keys(LINK_TYPES);

/** Link types grouped by technology group */
export const LINK_TYPES_BY_GROUP = LINK_TYPE_IDS.reduce((acc, id) => {
  const lt = LINK_TYPES[id];
  if (!acc[lt.group]) acc[lt.group] = [];
  acc[lt.group].push(lt);
  return acc;
}, {});

/**
 * Get the carrier color (hex) for a given link type id
 * @param {string} linkTypeId
 * @returns {string} hex color
 */
export function getLinkTypeColor(linkTypeId) {
  const lt = LINK_TYPES[linkTypeId];
  if (!lt) return '#94A3B8';
  return CARRIERS[lt.carrier]?.color ?? '#94A3B8';
}

/**
 * Get the carrier color (RGB array for deck.gl) for a given link type id
 * @param {string} linkTypeId
 * @param {number} alpha
 * @returns {number[]} [r, g, b, a]
 */
export function getLinkTypeColorRgb(linkTypeId, alpha = 220) {
  const lt = LINK_TYPES[linkTypeId];
  if (!lt) return [148, 163, 184, alpha];
  return [...(CARRIERS[lt.carrier]?.colorRgb ?? [148, 163, 184]), alpha];
}
