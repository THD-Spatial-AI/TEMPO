// Centralized color definitions for technologies across the platform
// These colors are used in Technologies, Creation, Map, and GlobalDataPanel components

export const FUEL_TYPE_COLORS = {
  // Renewable Energy
  'solar': '#FDB813', // Solar yellow
  'solar_pv': '#FDB813',
  'solar pv': '#FDB813',
  'wind': '#00A8CC', // Wind cyan
  'wind_onshore': '#00A8CC',
  'wind_offshore': '#005082', // Darker blue for offshore
  'wind onshore': '#00A8CC',
  'wind offshore': '#005082',
  'hydro': '#1976D2', // Hydro blue
  'hydroelectric': '#1976D2',
  'biomass': '#689F38', // Biomass green
  'bio': '#689F38',
  'geothermal': '#F44336', // Geothermal red
  'geo': '#F44336',
  
  // Fossil Fuels
  'gas': '#FF6F00', // Gas orange
  'gas_ccgt': '#FF6F00',
  'natural gas': '#FF6F00',
  'coal': '#424242', // Coal dark gray
  'coal_plant': '#424242',
  'oil': '#9E9E9E', // Oil gray
  'diesel': '#757575', // Diesel medium gray
  'petcoke': '#616161',
  
  // Nuclear
  'nuclear': '#E91E63', // Nuclear pink/magenta
  'uranium': '#E91E63',
  
  // Storage
  'battery': '#9C27B0', // Battery purple
  'battery_storage': '#9C27B0',
  'storage': '#9C27B0',
  'pumped_storage': '#673AB7', // Pumped hydro purple-blue
  
  // Transmission
  'transmission': '#78909C', // Transmission blue-gray
  'ac_transmission': '#78909C',
  'hvdc_transmission': '#546E7A',
  'power_lines': '#966F9E',
  
  // Demand
  'demand': '#D32F2F', // Demand red
  'power_demand': '#D32F2F',
  
  // Other
  'waste': '#795548', // Waste brown
  'cogeneration': '#FF9800', // Cogen amber
  'other': '#94A3B8', // Other slate gray
  'unknown': '#94A3B8'
};

// Get color for a fuel/technology type
export const getFuelColor = (fuelType) => {
  if (!fuelType) return FUEL_TYPE_COLORS.unknown;
  
  const normalizedFuel = fuelType.toLowerCase().trim();
  
  // Direct match
  if (FUEL_TYPE_COLORS[normalizedFuel]) {
    return FUEL_TYPE_COLORS[normalizedFuel];
  }
  
  // Partial match
  for (const [key, color] of Object.entries(FUEL_TYPE_COLORS)) {
    if (normalizedFuel.includes(key) || key.includes(normalizedFuel)) {
      return color;
    }
  }
  
  return FUEL_TYPE_COLORS.unknown;
};

// Convert hex color to RGB array for deck.gl
export const hexToRgb = (hex, alpha = 255) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        alpha
      ]
    : [148, 163, 184, alpha]; // Default gray
};

// Get RGB color for fuel type (for deck.gl layers)
export const getFuelColorRgb = (fuelType, alpha = 180) => {
  const hex = getFuelColor(fuelType);
  return hexToRgb(hex, alpha);
};

// Technology parent type colors (for technology icons/badges)
export const PARENT_TYPE_COLORS = {
  'supply': '#10B981', // Green
  'supply_plus': '#059669', // Dark green
  'demand': '#EF4444', // Red
  'storage': '#8B5CF6', // Purple
  'transmission': '#6B7280', // Gray
  'conversion': '#F59E0B', // Amber
  'conversion_plus': '#D97706' // Dark amber
};

// Get color for parent technology type
export const getParentTypeColor = (parentType) => {
  return PARENT_TYPE_COLORS[parentType] || '#94A3B8';
};
