/**
 * ENERGY CARRIER REGISTRY
 *
 * Defines all supported energy carriers for the Calliope energy system model.
 * Each carrier includes display metadata (color, icon, unit) and a description.
 *
 * Used by:
 *  - Technology editor (carrier_in / carrier_out selectors)
 *  - Links panel (carrier selector per link)
 *  - Map visualization (line coloring by carrier)
 *  - YAML export (essentials.carrier, carrier_in, carrier_out)
 */

export const CARRIERS = {
  // ── Electrical ────────────────────────────────────────────────────────────
  electricity: {
    id: 'electricity',
    label: 'Electricity',
    color: '#FBBF24',      // amber
    colorRgb: [251, 191, 36],
    unit: 'kWh',
    icon: '⚡',
    description: 'Electric power transmitted via power grids.',
    group: 'Electrical',
  },

  // ── Thermal ───────────────────────────────────────────────────────────────
  heat: {
    id: 'heat',
    label: 'Heat',
    color: '#EF4444',      // red
    colorRgb: [239, 68, 68],
    unit: 'kWh_th',
    icon: '🔥',
    description: 'Thermal energy for district heating or industrial processes.',
    group: 'Thermal',
  },
  cooling: {
    id: 'cooling',
    label: 'Cooling',
    color: '#06B6D4',      // cyan
    colorRgb: [6, 182, 212],
    unit: 'kWh_th',
    icon: '❄️',
    description: 'Cooling energy for district cooling or refrigeration.',
    group: 'Thermal',
  },
  steam: {
    id: 'steam',
    label: 'Steam',
    color: '#94A3B8',      // slate
    colorRgb: [148, 163, 184],
    unit: 'kWh_th',
    icon: '💨',
    description: 'High-pressure steam for industrial process heat.',
    group: 'Thermal',
  },

  // ── Gaseous Fuels ─────────────────────────────────────────────────────────
  gas: {
    id: 'gas',
    label: 'Natural Gas',
    color: '#F97316',      // orange
    colorRgb: [249, 115, 22],
    unit: 'kWh',
    icon: '🔆',
    description: 'Natural gas (methane-rich) for combustion or conversion.',
    group: 'Gas',
  },
  hydrogen: {
    id: 'hydrogen',
    label: 'Hydrogen',
    color: '#A78BFA',      // violet
    colorRgb: [167, 139, 250],
    unit: 'kWh',
    icon: 'H₂',
    description: 'Green / blue hydrogen for sector coupling or fuel cells.',
    group: 'Gas',
  },
  biogas: {
    id: 'biogas',
    label: 'Biogas',
    color: '#4ADE80',      // green
    colorRgb: [74, 222, 128],
    unit: 'kWh',
    icon: '🌿',
    description: 'Anaerobic digestion biogas (CH₄ + CO₂ mix).',
    group: 'Gas',
  },
  syngas: {
    id: 'syngas',
    label: 'Syngas',
    color: '#D97706',      // amber-600
    colorRgb: [217, 119, 6],
    unit: 'kWh',
    icon: '🧪',
    description: 'Synthetic gas (CO + H₂) from gasification or electrolysis.',
    group: 'Gas',
  },
  methane: {
    id: 'methane',
    label: 'Methane (SNG)',
    color: '#FB923C',      // orange-400
    colorRgb: [251, 146, 60],
    unit: 'kWh',
    icon: 'CH₄',
    description: 'Synthetic methane from Power-to-Gas methanation.',
    group: 'Gas',
  },
  ammonia: {
    id: 'ammonia',
    label: 'Ammonia',
    color: '#818CF8',      // indigo
    colorRgb: [129, 140, 248],
    unit: 'kWh',
    icon: 'NH₃',
    description: 'Ammonia as hydrogen carrier or fertiliser feedstock.',
    group: 'Gas',
  },

  // ── Liquid Fuels ──────────────────────────────────────────────────────────
  oil: {
    id: 'oil',
    label: 'Oil / Diesel',
    color: '#78716C',      // stone
    colorRgb: [120, 113, 108],
    unit: 'kWh',
    icon: '🛢️',
    description: 'Liquid petroleum for transport or backup generation.',
    group: 'Liquid Fuels',
  },
  liquid_fuel: {
    id: 'liquid_fuel',
    label: 'Liquid Fuel (e-fuel)',
    color: '#92400E',      // amber-800
    colorRgb: [146, 64, 14],
    unit: 'kWh',
    icon: '⛽',
    description: 'Synthetic liquid fuel (e-methanol, e-kerosene, FT-fuel).',
    group: 'Liquid Fuels',
  },
  methanol: {
    id: 'methanol',
    label: 'Methanol',
    color: '#C084FC',      // purple-400
    colorRgb: [192, 132, 252],
    unit: 'kWh',
    icon: 'MeOH',
    description: 'Methanol for chemical industry or fuel cells.',
    group: 'Liquid Fuels',
  },

  // ── Solid Fuels & Biomass ─────────────────────────────────────────────────
  biomass: {
    id: 'biomass',
    label: 'Biomass',
    color: '#16A34A',      // green-600
    colorRgb: [22, 163, 74],
    unit: 'kWh',
    icon: '🌾',
    description: 'Solid biomass (wood chips, pellets, agricultural residues).',
    group: 'Biomass',
  },
  coal: {
    id: 'coal',
    label: 'Coal',
    color: '#44403C',      // stone-700
    colorRgb: [68, 64, 60],
    unit: 'kWh',
    icon: '⬛',
    description: 'Hard coal or lignite for combustion.',
    group: 'Biomass',
  },

  // ── Carbon ────────────────────────────────────────────────────────────────
  co2: {
    id: 'co2',
    label: 'CO₂',
    color: '#64748B',      // slate-500
    colorRgb: [100, 116, 139],
    unit: 'tCO2',
    icon: 'CO₂',
    description: 'Carbon dioxide for carbon capture, transport and storage.',
    group: 'Carbon',
  },

  // ── Water ─────────────────────────────────────────────────────────────────
  water: {
    id: 'water',
    label: 'Water',
    color: '#3B82F6',      // blue
    colorRgb: [59, 130, 246],
    unit: 'm³',
    icon: '💧',
    description: 'Water for hydro, irrigation, industrial processes.',
    group: 'Water',
  },

  // ── Transport / Mobility ──────────────────────────────────────────────────
  freight: {
    id: 'freight',
    label: 'Freight',
    color: '#B45309',      // amber-700
    colorRgb: [180, 83, 9],
    unit: 'tkm',
    icon: '📦',
    description: 'Goods transportation (tonne-kilometre).',
    group: 'Transport',
  },
  mobility: {
    id: 'mobility',
    label: 'Passenger Mobility',
    color: '#0EA5E9',      // sky
    colorRgb: [14, 165, 233],
    unit: 'pkm',
    icon: '🚗',
    description: 'Passenger transportation (person-kilometre).',
    group: 'Transport',
  },
};

/** Ordered list of carrier IDs for dropdowns */
export const CARRIER_IDS = Object.keys(CARRIERS);

/** Carriers grouped by `group` for grouped select UI */
export const CARRIERS_BY_GROUP = CARRIER_IDS.reduce((acc, id) => {
  const c = CARRIERS[id];
  if (!acc[c.group]) acc[c.group] = [];
  acc[c.group].push(c);
  return acc;
}, {});

/** Helper: get carrier color as RGB array (for deck.gl layers) */
export function getCarrierColorRgb(carrierId, alpha = 220) {
  const c = CARRIERS[carrierId];
  if (!c) return [158, 158, 158, alpha];
  return [...c.colorRgb, alpha];
}

/** Helper: get carrier hex color */
export function getCarrierColor(carrierId) {
  return CARRIERS[carrierId]?.color ?? '#94A3B8';
}

/** Helper: get carrier label */
export function getCarrierLabel(carrierId) {
  return CARRIERS[carrierId]?.label ?? carrierId;
}
