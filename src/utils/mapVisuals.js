// Pure map-visual helpers for the Deck.GL map view: the tech colour palette,
// location pie-chart icon generation, transmission voltage styling, and the
// MapLibre base-map style presets. Extracted from MapDeckGL.jsx so the giant
// component holds only interaction/state and these stay reusable + testable.
// No React, no external deps — plain data + SVG/string builders.

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
  
  return TECH_COLORS.generic;
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

// Function to create pie chart path for SVG
const createPieChartPaths = (technologies, techMap) => {
  if (!technologies || Object.keys(technologies).length === 0) {
    return [];
  }
  
  const techNames = Object.keys(technologies);
  const count = techNames.length;
  
  if (count === 1) {
    return null; // Single tech, use regular circle
  }
  
  const paths = [];
  const centerX = 16;
  const centerY = 16;
  const radius = 10;
  const anglePerSlice = (2 * Math.PI) / count;
  
  techNames.forEach((techName, index) => {
    const startAngle = index * anglePerSlice - Math.PI / 2;
    const endAngle = (index + 1) * anglePerSlice - Math.PI / 2;
    
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    
    const largeArcFlag = anglePerSlice > Math.PI ? 1 : 0;
    
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');
    
    const tech = technologies[techName];
    const color = getTechColor(techName, techMap);
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    
    paths.push({
      path: pathData,
      color: colorHex
    });
  });
  
  return paths;
};

// Function to create SVG icon for location with pie chart
export const createLocationIcon = (location, techMap) => {
  if (!location) {
    // Fallback for undefined location
    return {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10" fill="rgb(158, 158, 158)" stroke="#000000" stroke-width="1"/>
        </svg>
      `)}`,
      width: 16,
      height: 16,
      anchorX: 8,
      anchorY: 8
    };
  }
  
  const techs = location.techs || {};
  const techNames = Object.keys(techs);
  
  // Detect substations (simple check for performance)
  const locationName = (location.name || '').toUpperCase();
  const isSubstation = locationName.includes('S/E') || locationName.includes('SUBSTATION') || locationName.includes('TAP OFF');
  
  // For substations, use simple triangle icon
  if (isSubstation) {
    const hasDemand = techNames.some(t => t.toLowerCase().includes('demand'));
    const color = hasDemand ? '#F44336' : '#212121';
    
    return {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 32 32">
          <path d="M16 4 L28 28 L4 28 Z" fill="${color}" stroke="#000" stroke-width="1"/>
        </svg>
      `)}`,
      width: 24,
      height: 24,
      anchorX: 12,
      anchorY: 12
    };
  }
  
  // Handle location with no technologies or single technology
  if (techNames.length <= 1) {
    const color = techNames.length > 0 ? getTechColor(techNames[0], techMap) : TECH_COLORS.generic;
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    
    return {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10" fill="${colorHex}" stroke="#000000" stroke-width="1"/>
        </svg>
      `)}`,
      width: 16,
      height: 16,
      anchorX: 8,
      anchorY: 8
    };
  }
  
  // Multiple technologies - create pie chart
  const piePaths = createPieChartPaths(techs, techMap);
  
  if (!piePaths || piePaths.length === 0) {
    // Fallback if pie chart creation fails
    const color = getTechColor(techNames[0], techMap);
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    
    return {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10" fill="${colorHex}" stroke="#000000" stroke-width="1"/>
        </svg>
      `)}`,
      width: 16,
      height: 16,
      anchorX: 8,
      anchorY: 8
    };
  }
  
  const pathsStr = piePaths.map(p => `<path d="${p.path}" fill="${p.color}"/>`).join('');
  
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="11" fill="white"/>
        ${pathsStr}
        <circle cx="16" cy="16" r="10" fill="none" stroke="#000000" stroke-width="1"/>
      </svg>
    `)}`,
    width: 16,
    height: 16,
    anchorX: 8,
    anchorY: 8
  };
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

// Open source map styles
export const MAP_STYLES = {
  streets: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxzoom: 20
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
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        maxzoom: 20
      }
    },
    layers: [{
      id: 'dark',
      type: 'raster',
      source: 'dark'
    }]
  }
};
