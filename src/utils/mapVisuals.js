// Pure map-visual helpers for the Deck.GL map view: the tech colour palette,
// location pie-chart icon generation, transmission voltage styling, and the
// MapLibre base-map style presets. Extracted from MapDeckGL.jsx so the giant
// component holds only interaction/state and these stay reusable + testable.
// No React — plain data + SVG/string builders.

import { LINK_TYPES, getLinkTypeColorRgb } from '../config/linkTypes';
import { getCarrierColorRgb, getCarrierLabel } from '../config/carriers';

// Technology color mapping for power plants and other types
const TECH_COLORS = {
  wind: [76, 175, 80, 220],        // Green
  solar: [255, 235, 59, 220],      // Yellow
  hydro: [33, 150, 243, 220],      // Blue
  coal: [96, 57, 19, 220],         // Dark Brown
  gas: [255, 152, 0, 220],         // Orange
  nuclear: [156, 39, 176, 220],    // Purple
  oil: [66, 66, 66, 220],          // Dark Gray
  battery: [168, 85, 247, 220],    // Light Purple
  demand: [244, 67, 54, 220],      // Red
  transformer_no_demand: [33, 33, 33, 255],  // Black for substations without demand
  transformer_demand: [244, 67, 54, 255],    // Red for substations with demand
  generic: [158, 158, 158, 200]    // Gray
};

// Function to get color from technology object (with color property) or name
export const getTechColor = (techNameOrObject, techMap = null) => {
  // If it's an object with a color property, extract the color
  let colorHex = null;
  let techName = '';
  
  if (typeof techNameOrObject === 'object' && techNameOrObject !== null) {
    colorHex = techNameOrObject.essentials?.color || techNameOrObject.color;
    techName = techNameOrObject.essentials?.name || techNameOrObject.name || '';
  } else {
    techName = techNameOrObject;
  }
  
  // If we have a techMap, look up the color from there first
  if (techMap && techName && techMap[techName]) {
    const techDef = techMap[techName];
    const techColor = techDef.essentials?.color || techDef.color;
    if (techColor && techColor.startsWith('#')) {
      const r = parseInt(techColor.slice(1, 3), 16);
      const g = parseInt(techColor.slice(3, 5), 16);
      const b = parseInt(techColor.slice(5, 7), 16);
      return [r, g, b, 220];
    }
  }
  
  // Convert hex color to RGB array
  if (colorHex && colorHex.startsWith('#')) {
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return [r, g, b, 220];
  }
  
  // Fall back to name-based matching
  const name = techName.toLowerCase();
  if (name.includes('wind')) return TECH_COLORS.wind;
  if (name.includes('solar') || name.includes('pv')) return TECH_COLORS.solar;
  if (name.includes('hydro')) return TECH_COLORS.hydro;
  if (name.includes('coal')) return TECH_COLORS.coal;
  if (name.includes('gas') || name.includes('ccgt')) return TECH_COLORS.gas;
  if (name.includes('nuclear')) return TECH_COLORS.nuclear;
  if (name.includes('oil') || name.includes('diesel')) return TECH_COLORS.oil;
  if (name.includes('battery') || name.includes('storage')) return TECH_COLORS.battery;
  if (name.includes('demand')) return TECH_COLORS.demand;
  
  return hashedTechColor(name);
};

// Stable, distinct colour for a tech with no defined colour and no keyword
// match: hue/saturation/lightness from a hash of the name, so the same tech is
// the same colour in every view and different techs rarely look alike.
const hashedTechColor = (name) => {
  if (!name) return TECH_COLORS.generic;
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  const hue = h % 360;
  const sat = 0.6 + ((h >>> 9) % 4) * 0.08;   // 60–84 %
  const light = 0.4 + ((h >>> 13) % 4) * 0.06; // 40–58 %
  const k = n => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = n => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4), 220];
};

// Icon type definitions with SVG path data for simple black and white icons
export const ICON_TYPES = {
  wind: { 
    path: 'M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z',
    label: 'Wind Turbine'
  },
  solar: { 
    path: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    label: 'Solar PV'
  },
  transformer: { 
    path: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
    label: 'Transformer'
  },
  power: { 
    path: 'M13 10V3L4 14h7v7l9-11h-7z',
    label: 'Power Plant'
  },
  hydro: { 
    path: 'M12 2.69l5.66 5.66a8 8 0 11-11.31 0z',
    label: 'Hydro'
  },
  battery: { 
    path: 'M4 7h14a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2zM22 10v4M8 10h2m2 0h2',
    label: 'Battery Storage'
  },
  demand: { 
    path: 'M3 3v18h18M7 16l4-4 4 4 6-6',
    label: 'Demand'
  },
  coal: { 
    path: 'M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z',
    label: 'Coal/Fossil'
  },
  factory: { 
    path: 'M3 21h18M5 21V7l6 4V7l6 4v10',
    label: 'Factory'
  },
  transmission: { 
    path: 'M12 2l9 4.5v3L12 14 3 9.5v-3L12 2zM12 14v8',
    label: 'Transmission'
  },
  generic: { 
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
    label: 'Generic'
  }
};

// Function to determine color based on location characteristics
const getLocationColor = (location) => {
  if (location.isNode) {
    // Check if substation has demand
    const hasDemand = location.demandProfile || location.totalDemandMWh;
    return hasDemand ? TECH_COLORS.transformer_demand : TECH_COLORS.transformer_no_demand;
  }
  
  const techs = location.techs || {};
  const techNames = Object.keys(techs);
  
  // If location has multiple technologies, use the first tech's color
  // (pie chart will handle multiple colors visually)
  if (techNames.length > 0) {
    const firstTech = techs[techNames[0]];
    return getTechColor(firstTech || techNames[0]);
  }
  
  // Check for demand
  const hasDemand = location.demandProfile || location.totalDemandMWh;
  if (hasDemand) return TECH_COLORS.demand;
  
  return TECH_COLORS.generic;
};

// Node-kind colours (OSM study-area imports). Used as the marker RING so the
// fill stays free to show the location's technologies.
export const NODE_KIND_COLORS = {
  substation: 'rgb(239, 68, 68)',
  plant: 'rgb(34, 197, 94)',
  transmission_node: 'rgb(245, 158, 11)',
};
export const NODE_KIND_LABELS = {
  substation: 'Substations',
  plant: 'Power plants',
  transmission_node: 'Transmission nodes',
};

const rgbStr = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const svgIcon = body => ({
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`
  )}`,
  width: 32,
  height: 32,
  anchorX: 16,
  anchorY: 16,
});

// Location marker shared by the Creation and Map views: fill = one colour per
// technology (pie slices when there are several), ring = node kind.
// `cache` (a Map) is optional.
export const createLocationIcon = (location, techMap, cache) => {
  const techNames = Object.keys(location?.techs || {});
  const kind = location?.metadata?.kind;
  const ring = NODE_KIND_COLORS[kind] || (location?.isNode ? 'rgb(33, 33, 33)' : 'rgb(0, 0, 0)');
  const fills = techNames.map(t => rgbStr(getTechColor(t, techMap)));

  const key = `${ring}|${fills.join(';')}`;
  if (cache?.has(key)) return cache.get(key);

  const r = 11;
  let body;
  if (fills.length === 0) {
    // No techs yet: kind colour if known, else neutral grey
    const fill = NODE_KIND_COLORS[kind] || (location?.isNode ? 'rgb(33, 33, 33)' : 'rgb(148, 163, 184)');
    body = `<circle cx="16" cy="16" r="${r}" fill="${fill}" stroke="#ffffff" stroke-width="2.5"/>`;
  } else if (fills.length === 1) {
    body = `<circle cx="16" cy="16" r="${r}" fill="${fills[0]}" stroke="${ring}" stroke-width="2.5"/>`;
  } else {
    const step = (2 * Math.PI) / fills.length;
    const slices = fills.map((fill, i) => {
      const a0 = i * step - Math.PI / 2;
      const a1 = (i + 1) * step - Math.PI / 2;
      const large = step > Math.PI ? 1 : 0;
      return `<path d="M 16 16 L ${16 + r * Math.cos(a0)} ${16 + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${16 + r * Math.cos(a1)} ${16 + r * Math.sin(a1)} Z" fill="${fill}"/>`;
    }).join('');
    body = `<circle cx="16" cy="16" r="${r}" fill="white"/>${slices}<circle cx="16" cy="16" r="${r}" fill="none" stroke="${ring}" stroke-width="2.5"/>`;
  }

  const icon = svgIcon(body);
  cache?.set(key, icon);
  return icon;
};

// Tech key of a link (saved links carry `techs` or `tech`; Creation drafts may carry neither).
export const getLinkTechName = (link) =>
  (link.techs && Object.keys(link.techs)[0]) || link.tech || '';

// Link colour shared by the Creation and Map views: link type → carrier colour,
// voltage-named techs (e.g. 66_kv, power_line) → voltage gradient, else carrier.
export const getLinkColor = (link, alpha = 220) => {
  if (link.linkType && LINK_TYPES[link.linkType]) return getLinkTypeColorRgb(link.linkType, alpha);
  const tech = getLinkTechName(link);
  if (/\d+_?kv/i.test(tech) || /power_line/i.test(tech)) return [...getVoltageColor(tech).slice(0, 3), alpha];
  if (link.carrier) return getCarrierColorRgb(link.carrier, alpha);
  return [99, 102, 241, alpha];
};

// Legend label for a link, matching getLinkColor's grouping.
export const getLinkLabel = (link) => {
  if (link.linkType && LINK_TYPES[link.linkType]) return LINK_TYPES[link.linkType].label;
  const tech = getLinkTechName(link);
  if (tech) return formatTechName(tech);
  return link.carrier ? getCarrierLabel(link.carrier) : 'Link';
};

// Function to determine default icon type based on location characteristics
export const getDefaultIconType = (location) => {
  if (location.isNode) return 'transformer';
  
  const techs = location.techs || {};
  const techNames = Object.keys(techs);
  
  // Check for demand
  const hasDemand = location.demandProfile || location.totalDemandMWh || 
    techNames.some(t => t.toLowerCase().includes('demand'));
  if (hasDemand) return 'demand';
  
  // Check for specific technology types
  const hasWind = techNames.some(t => t.toLowerCase().includes('wind'));
  if (hasWind) return 'wind';
  
  const hasSolar = techNames.some(t => {
    const lower = t.toLowerCase();
    return lower.includes('pv') || lower.includes('solar') || lower.includes('csp');
  });
  if (hasSolar) return 'solar';
  
  const hasHydro = techNames.some(t => {
    const lower = t.toLowerCase();
    return lower.includes('hydro') || lower.includes('reservoir');
  });
  if (hasHydro) return 'hydro';
  
  const hasStorage = techNames.some(t => {
    const lower = t.toLowerCase();
    return lower.includes('battery') || lower.includes('storage');
  });
  if (hasStorage) return 'battery';
  
  const hasPowerPlant = techNames.some(t => {
    const lower = t.toLowerCase();
    return lower.includes('coal') || lower.includes('oil') || 
           lower.includes('diesel') || lower.includes('gas') ||
           lower.includes('ccgt') || lower.includes('nuclear') ||
           lower.includes('supply');
  });
  if (hasPowerPlant) return 'coal';
  
  return 'generic';
};







// Helper function to format technology names
export const formatTechName = (techName) => {
  return techName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Function to get color based on voltage level (green for low, red for high)
export const getVoltageColor = (techName) => {
  // Special case for power_lines (plant to substation connections)
  if (techName.toLowerCase().includes('power_line')) {
    return [0, 120, 255, 200]; // Blue for power plant connections
  }
  
  // Extract voltage from tech name (e.g., "66_kv" -> 66)
  const match = techName.match(/(\d+)_?kv/i);
  if (!match) return [0, 120, 255, 200]; // Blue for unknown
  
  const voltage = parseInt(match[1]);
  
  // Create linear gradient from green (11kV) through yellow to red (500kV)
  // Voltage range: 11 to 500
  const minV = 11;
  const maxV = 500;
  const normalized = Math.min(Math.max((voltage - minV) / (maxV - minV), 0), 1);
  
  // More linear color scale:
  // 0.0 - 0.33: Green (0,255,0) to Yellow (255,255,0)
  // 0.33 - 0.66: Yellow (255,255,0) to Orange (255,128,0)
  // 0.66 - 1.0: Orange (255,128,0) to Red (255,0,0)
  let r, g, b;
  
  if (normalized < 0.33) {
    // Green to Yellow (0-33%)
    const t = normalized / 0.33;
    r = Math.round(255 * t);
    g = 255;
    b = 0;
  } else if (normalized < 0.66) {
    // Yellow to Orange (33-66%)
    const t = (normalized - 0.33) / 0.33;
    r = 255;
    g = Math.round(255 - (127 * t));
    b = 0;
  } else {
    // Orange to Red (66-100%)
    const t = (normalized - 0.66) / 0.34;
    r = 255;
    g = Math.round(128 * (1 - t));
    b = 0;
  }
  
  return [r, g, b, 200];
};

// Function to get line width based on voltage level
export const getVoltageWidth = (techName) => {
  const match = techName.match(/(\d+)_?kv/i);
  if (!match) return 1.5; // Default for power_lines
  
  const voltage = parseInt(match[1]);
  
  // Map voltage to line width: 11kV=1px, 500kV=4px
  if (voltage <= 69) return 1;
  if (voltage <= 110) return 1.5;
  if (voltage <= 220) return 2;
  if (voltage <= 345) return 2.5;
  return 3;
};

// Open source map styles — all tile sources are key-free.
// streets/dark: OSM standard + OpenTopoMap (no auth required).
// satellite/terrain: ESRI ArcGIS public tiles (no auth required).
export const MAP_STYLES = {
  // Same muted OSM look as the Dashboard map (Leaflet grayscale(0.9) contrast(0.85) filter).
  grey: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © Esri',
        maxzoom: 19
      }
    },
    layers: [{
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: { 'raster-saturation': -0.9, 'raster-contrast': -0.15, 'raster-brightness-min': 0.05 }
    }]
  },
  streets: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © Esri',
        maxzoom: 19
      }
    },
    layers: [{
      id: 'osm',
      type: 'raster',
      source: 'osm'
    }]
  },
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri',
        maxzoom: 19
      }
    },
    layers: [{
      id: 'satellite',
      type: 'raster',
      source: 'satellite'
    }]
  },
  terrain: {
    version: 8,
    sources: {
      terrain: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '© Esri, HERE, Garmin, OpenStreetMap contributors',
        maxzoom: 19
      }
    },
    layers: [{
      id: 'terrain',
      type: 'raster',
      source: 'terrain'
    }]
  },
  dark: {
    version: 8,
    sources: {
      dark: {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxzoom: 17
      }
    },
    layers: [{
      id: 'dark',
      type: 'raster',
      source: 'dark'
    }]
  }
};
