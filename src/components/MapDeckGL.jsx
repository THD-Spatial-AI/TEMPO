import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, IconLayer, LineLayer } from '@deck.gl/layers';
import { Map as MapGL } from 'react-map-gl/maplibre';
import { useData } from '../context/DataContext';
import { FiLayers, FiPlus, FiLink, FiEye, FiEdit2, FiMapPin, FiTrash2, FiCpu, FiChevronDown, FiChevronRight, FiZoomIn, FiZoomOut, FiMaximize2, FiX, FiCheck, FiHelpCircle, FiArrowRight, FiActivity, FiZap, FiCircle } from 'react-icons/fi';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import { TECH_TEMPLATES } from './TechnologiesData';
import 'maplibre-gl/dist/maplibre-gl.css';

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
const getTechColor = (techNameOrObject, techMap = null) => {
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
const ICON_TYPES = {
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
const createLocationIcon = (location, techMap) => {
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
const getDefaultIconType = (location) => {
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

// Constraint definitions
const CONSTRAINT_DEFINITIONS = {
  energy_cap_max: { group: 'Capacity', desc: 'Maximum energy capacity (kW)' },
  energy_cap_min: { group: 'Capacity', desc: 'Minimum energy capacity (kW)' },
  energy_cap_equals: { group: 'Capacity', desc: 'Fixed energy capacity (kW)' },
  energy_cap_equals_systemwide: { group: 'Capacity', desc: 'System-wide fixed energy capacity' },
  energy_cap_max_systemwide: { group: 'Capacity', desc: 'System-wide maximum energy capacity' },
  energy_cap_min_use: { group: 'Capacity', desc: 'Minimum capacity utilization (0-1)' },
  energy_cap_per_unit: { group: 'Capacity', desc: 'Energy capacity per unit (kW/unit)' },
  energy_cap_scale: { group: 'Capacity', desc: 'Scaling factor for energy capacity' },
  energy_cap_per_storage_cap_min: { group: 'Capacity', desc: 'Min energy/storage capacity ratio' },
  energy_cap_per_storage_cap_max: { group: 'Capacity', desc: 'Max energy/storage capacity ratio' },
  energy_cap_per_storage_cap_equals: { group: 'Capacity', desc: 'Fixed energy/storage capacity ratio' },
  storage_cap_max: { group: 'Capacity', desc: 'Maximum storage capacity (kWh)' },
  storage_cap_min: { group: 'Capacity', desc: 'Minimum storage capacity (kWh)' },
  storage_cap_equals: { group: 'Capacity', desc: 'Fixed storage capacity (kWh)' },
  storage_cap_per_unit: { group: 'Capacity', desc: 'Storage capacity per unit (kWh/unit)' },
  energy_eff: { group: 'Efficiency', desc: 'Energy conversion efficiency (0-1)' },
  energy_eff_per_distance: { group: 'Efficiency', desc: 'Efficiency loss per distance' },
  resource_eff: { group: 'Efficiency', desc: 'Resource conversion efficiency (0-1)' },
  parasitic_eff: { group: 'Efficiency', desc: 'Parasitic efficiency loss (0-1)' },
  resource: { group: 'Resource', desc: 'Resource availability (kWh or file://)' },
  resource_min_use: { group: 'Resource', desc: 'Minimum resource utilization (0-1)' },
  resource_scale: { group: 'Resource', desc: 'Resource scaling factor' },
  resource_unit: { group: 'Resource', desc: 'Unit of resource measure' },
  resource_area_max: { group: 'Resource', desc: 'Maximum resource area (m²)' },
  resource_area_min: { group: 'Resource', desc: 'Minimum resource area (m²)' },
  resource_area_equals: { group: 'Resource', desc: 'Fixed resource area (m²)' },
  resource_area_per_energy_cap: { group: 'Resource', desc: 'Resource area per capacity (m²/kW)' },
  resource_cap_max: { group: 'Resource', desc: 'Maximum resource capacity' },
  resource_cap_min: { group: 'Resource', desc: 'Minimum resource capacity' },
  resource_cap_equals: { group: 'Resource', desc: 'Fixed resource capacity' },
  resource_cap_equals_energy_cap: { group: 'Resource', desc: 'Resource cap equals energy cap' },
  force_resource: { group: 'Resource', desc: 'Force resource consumption' },
  energy_ramping: { group: 'Operation', desc: 'Ramping rate limit (fraction/hour)' },
  charge_rate: { group: 'Operation', desc: 'Charge/discharge rate (C-rate)' },
  storage_loss: { group: 'Operation', desc: 'Storage standing loss (fraction/hour)' },
  storage_initial: { group: 'Operation', desc: 'Initial storage state (0-1)' },
  storage_time_max: { group: 'Operation', desc: 'Maximum storage duration (hours)' },
  storage_discharge_depth: { group: 'Operation', desc: 'Minimum state of charge (0-1)' },
  lifetime: { group: 'Operation', desc: 'Technology lifetime (years)' },
  one_way: { group: 'Operation', desc: 'Unidirectional transmission' },
  force_asynchronous_prod_con: { group: 'Operation', desc: 'Force async production/consumption' },
  energy_prod: { group: 'Energy Flow', desc: 'Energy production (kWh)' },
  energy_con: { group: 'Energy Flow', desc: 'Energy consumption (kWh)' },
  carrier_ratios: { group: 'Energy Flow', desc: 'Carrier input/output ratios' },
  export_carrier: { group: 'Energy Flow', desc: 'Exportable carrier' },
  export_cap: { group: 'Energy Flow', desc: 'Maximum export capacity (kW)' },
  units_max: { group: 'Units', desc: 'Maximum number of units' },
  units_min: { group: 'Units', desc: 'Minimum number of units' },
  units_equals: { group: 'Units', desc: 'Exact number of units' },
  units_equals_systemwide: { group: 'Units', desc: 'System-wide exact units' },
  units_max_systemwide: { group: 'Units', desc: 'System-wide maximum units' }
};

const COST_DEFINITIONS = {
  energy_cap: { group: 'Investment', desc: 'Capital cost per capacity ($/kW)' },
  storage_cap: { group: 'Investment', desc: 'Capital cost per storage ($/kWh)' },
  resource_cap: { group: 'Investment', desc: 'Capital cost per resource capacity' },
  resource_area: { group: 'Investment', desc: 'Capital cost per area ($/m²)' },
  purchase: { group: 'Investment', desc: 'Purchase cost per unit ($)' },
  energy_cap_per_distance: { group: 'Investment', desc: 'Cost per capacity per distance' },
  purchase_per_distance: { group: 'Investment', desc: 'Purchase cost per distance' },
  om_annual: { group: 'O&M', desc: 'Annual O&M cost ($/year)' },
  om_annual_investment_fraction: { group: 'O&M', desc: 'Annual O&M as fraction of investment' },
  om_prod: { group: 'O&M', desc: 'Variable O&M per production ($/kWh)' },
  om_con: { group: 'O&M', desc: 'Variable O&M per consumption ($/kWh)' },
  interest_rate: { group: 'Financial', desc: 'Interest rate (fraction)' },
  depreciation_rate: { group: 'Financial', desc: 'Depreciation rate (fraction/year)' },
  export: { group: 'Other', desc: 'Export revenue ($/kWh)' }
};

const PARENT_CONSTRAINTS = {
  supply: ['energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'force_resource', 'lifetime', 'resource', 'resource_area_equals', 'resource_area_max', 'resource_area_min', 'resource_area_per_energy_cap', 'resource_min_use', 'resource_scale', 'resource_unit', 'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'],
  supply_plus: ['charge_rate', 'energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max', 'energy_cap_per_storage_cap_equals', 'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'force_resource', 'lifetime', 'parasitic_eff', 'resource', 'resource_area_equals', 'resource_area_max', 'resource_area_min', 'resource_area_per_energy_cap', 'resource_cap_equals', 'resource_cap_equals_energy_cap', 'resource_cap_max', 'resource_cap_min', 'resource_eff', 'resource_min_use', 'resource_scale', 'resource_unit', 'storage_cap_equals', 'storage_cap_max', 'storage_cap_min', 'storage_cap_per_unit', 'storage_initial', 'storage_loss', 'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'],
  demand: ['energy_con', 'force_resource', 'resource', 'resource_area_equals', 'resource_scale', 'resource_unit'],
  storage: ['charge_rate', 'energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max', 'energy_cap_per_storage_cap_equals', 'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'force_asynchronous_prod_con', 'lifetime', 'storage_cap_equals', 'storage_cap_max', 'storage_cap_min', 'storage_cap_per_unit', 'storage_initial', 'storage_loss', 'storage_time_max', 'storage_discharge_depth', 'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'],
  transmission: ['energy_cap_equals', 'energy_cap_min', 'energy_cap_max', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_eff_per_distance', 'energy_prod', 'force_asynchronous_prod_con', 'lifetime', 'one_way'],
  conversion: ['energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'lifetime', 'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'],
  conversion_plus: ['carrier_ratios', 'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'lifetime', 'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min']
};

// Helper function to format technology names
const formatTechName = (techName) => {
  return techName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Function to get color based on voltage level (green for low, red for high)
const getVoltageColor = (techName) => {
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
const getVoltageWidth = (techName) => {
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
const MAP_STYLES = {
  streets: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap Contributors',
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
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenTopoMap',
        maxzoom: 17
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
        tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© Stadia Maps',
        maxzoom: 19
      }
    },
    layers: [{
      id: 'dark',
      type: 'raster',
      source: 'dark'
    }]
  }
};

const MapDeckGL = () => {
  const { locations, setLocations, links, setLinks, showNotification, technologies } = useData();
  const [viewState, setViewState] = useState({
    longitude: -70.6693,
    latitude: -33.4489,
    zoom: 4,
    pitch: 0,
    bearing: 0
  });
  
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [currentStyle, setCurrentStyle] = useState('streets');
  const [mode, setMode] = useState('view');
  const [linkStart, setLinkStart] = useState(null);
  const [showLocationsSection, setShowLocationsSection] = useState(false);
  const [showLinksSection, setShowLinksSection] = useState(false);
  const [showTimeseriesSection, setShowTimeseriesSection] = useState(false);
  const [timeseriesFilter, setTimeseriesFilter] = useState('');
  const [timeseriesSortBy, setTimeseriesSortBy] = useState('name');
  const [timeseriesPreview, setTimeseriesPreview] = useState(null);
  
  // Edit dialog states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [originalLocationData, setOriginalLocationData] = useState(null);
  const [dialogTechs, setDialogTechs] = useState([]);
  const [expandedTechConstraints, setExpandedTechConstraints] = useState({});
  const [editingConstraints, setEditingConstraints] = useState({});
  const [editingEssentials, setEditingEssentials] = useState({});
  const [editingCosts, setEditingCosts] = useState({});
  const [constraintSearch, setConstraintSearch] = useState({});
  const [costSearch, setCostSearch] = useState({});
  const [selectedConstraintGroup, setSelectedConstraintGroup] = useState({});
  const [selectedCostGroup, setSelectedCostGroup] = useState({});
  const [techCsvFiles, setTechCsvFiles] = useState({});
  const [constraintCsvFiles, setConstraintCsvFiles] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [mapReady, setMapReady] = useState(false);
  const [draggedLocation, setDraggedLocation] = useState(null);
  const [draggingPosition, setDraggingPosition] = useState(null);
  const [pendingDragChange, setPendingDragChange] = useState(null);
  const [showDragConfirmDialog, setShowDragConfirmDialog] = useState(false);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [selectedLocationForIcon, setSelectedLocationForIcon] = useState(null);
  const [isDraggingEnabled, setIsDraggingEnabled] = useState(false);
  const deckRef = useRef(null);
  
  // Initialize map after component mount to avoid WebGL context errors
  useEffect(() => {
    // Use requestAnimationFrame to initialize after DOM is ready but without delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMapReady(true);
      });
    });
  }, []);
  
  // Create technology map from context
  const techMap = useMemo(() => {
    const map = {};
    
    // Start with ALL technologies from TECH_TEMPLATES database
    Object.values(TECH_TEMPLATES).forEach(categoryTechs => {
      if (Array.isArray(categoryTechs)) {
        categoryTechs.forEach(tech => {
          map[tech.name] = tech;
        });
      }
    });
    
    // Then override with any model-specific technologies
    if (Array.isArray(technologies) && technologies.length > 0) {
      technologies.forEach(tech => {
        map[tech.name] = tech;
      });
    }
    
    return map;
  }, [technologies]);
  
  // Helper functions for edit dialog
  const toggleTechConstraints = (techName) => {
    setExpandedTechConstraints(prev => ({
      ...prev,
      [techName]: !prev[techName]
    }));
  };

  const updateDialogConstraint = (techName, constraintKey, value) => {
    setEditingConstraints(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [constraintKey]: value
      }
    }));
  };

  const updateDialogEssential = (techName, key, value) => {
    setEditingEssentials(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [key]: value
      }
    }));
  };

  const updateDialogCost = (techName, key, value) => {
    setEditingCosts(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [key]: value
      }
    }));
  };

  const handleTechCsvUpload = (techName, file) => {
    if (file && file.name.endsWith('.csv')) {
      setTechCsvFiles(prev => ({
        ...prev,
        [techName]: file
      }));
    }
  };

  const handleConstraintCsvUpload = (techName, constraintKey, file) => {
    if (file && file.name.endsWith('.csv')) {
      const fileKey = `${techName}_${constraintKey}`;
      setConstraintCsvFiles(prev => ({
        ...prev,
        [fileKey]: file
      }));
      updateDialogConstraint(techName, constraintKey, `file:${file.name}`);
    }
  };

  const addTechToDialog = (techName) => {
    if (!dialogTechs.includes(techName)) {
      setDialogTechs([...dialogTechs, techName]);
      // Initialize with template data
      const techTemplate = techMap[techName];
      if (techTemplate && editingLocation) {
        if (!editingLocation.techs) editingLocation.techs = {};
        editingLocation.techs[techName] = {
          parent: techTemplate.parent || 'unknown',
          essentials: { ...techTemplate.essentials },
          constraints: { ...techTemplate.constraints },
          costs: { monetary: { ...(techTemplate.costs?.monetary || {}) } }
        };
        setEditingLocation({ ...editingLocation });
      }
    }
  };

  const removeTechFromDialog = (techName) => {
    setDialogTechs(dialogTechs.filter(t => t !== techName));
    // Remove from editing location
    if (editingLocation?.techs) {
      const newTechs = { ...editingLocation.techs };
      delete newTechs[techName];
      setEditingLocation({ ...editingLocation, techs: newTechs });
    }
    // Clean up editing states
    const newConstraints = { ...editingConstraints };
    delete newConstraints[techName];
    setEditingConstraints(newConstraints);
    const newEssentials = { ...editingEssentials };
    delete newEssentials[techName];
    setEditingEssentials(newEssentials);
    const newCosts = { ...editingCosts };
    delete newCosts[techName];
    setEditingCosts(newCosts);
    const newExpanded = { ...expandedTechConstraints };
    delete newExpanded[techName];
    setExpandedTechConstraints(newExpanded);
    const newCsvFiles = { ...techCsvFiles };
    delete newCsvFiles[techName];
    setTechCsvFiles(newCsvFiles);
  };

  const hasLocationChanged = () => {
    if (!originalLocationData) return true;
    if (editingLocation.latitude !== originalLocationData.latitude) return true;
    if (editingLocation.longitude !== originalLocationData.longitude) return true;
    if (editingLocation.name !== originalLocationData.name) return true;
    if (JSON.stringify(editingLocation.techs) !== JSON.stringify(originalLocationData.techs)) return true;
    if (JSON.stringify(editingConstraints) !== '{}') return true;
    if (JSON.stringify(editingEssentials) !== '{}') return true;
    if (JSON.stringify(editingCosts) !== '{}') return true;
    return false;
  };

  const handleEditLocation = (location, locationIndex) => {
    // Create a deep copy that preserves all properties including demandProfile
    const locationCopy = {
      ...location,
      demandProfile: location.demandProfile ? { ...location.demandProfile } : undefined,
      totalDemandMWh: location.totalDemandMWh
    };
    
    setEditingLocation(locationCopy);
    setEditingIndex(locationIndex);
    // Store original location data for change detection
    setOriginalLocationData({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      techs: JSON.parse(JSON.stringify(location.techs || {}))
    });
    setDialogTechs(Object.keys(location.techs || {}));
    // Pre-populate editing states with existing data
    const existingConstraints = {};
    const existingEssentials = {};
    const existingCosts = {};
    Object.entries(location.techs || {}).forEach(([techName, techData]) => {
      if (techData.constraints) existingConstraints[techName] = techData.constraints;
      if (techData.essentials) existingEssentials[techName] = techData.essentials;
      if (techData.costs?.monetary) existingCosts[techName] = techData.costs.monetary;
    });
    setEditingConstraints(existingConstraints);
    setEditingEssentials(existingEssentials);
    setEditingCosts(existingCosts);
    setTechCsvFiles({});
    setConstraintCsvFiles({});
    setExpandedTechConstraints({});
    setShowEditDialog(true);
  };

  const saveEditedLocation = () => {
    if (!editingLocation || editingIndex === null) return;

    const updatedLocation = {
      ...editingLocation,
      // Explicitly preserve demand profile data
      demandProfile: editingLocation.demandProfile,
      totalDemandMWh: editingLocation.totalDemandMWh,
      techs: {}
    };

    // Build updated technologies with all changes
    dialogTechs.forEach(techName => {
      const techTemplate = techMap[techName];
      if (techTemplate) {
        updatedLocation.techs[techName] = {
          parent: techTemplate.parent,
          essentials: {
            ...(techTemplate.essentials || {}),
            ...(editingEssentials[techName] || {})
          },
          constraints: {
            ...(techTemplate.constraints || {}),
            ...(editingLocation.techs[techName]?.constraints || {}),
            ...(editingConstraints[techName] || {})
          },
          costs: {
            monetary: {
              ...(techTemplate.costs?.monetary || {}),
              ...(editingLocation.techs[techName]?.costs?.monetary || {}),
              ...(editingCosts[techName] || {})
            }
          }
        };
      }
    });

    const updatedLocations = [...locations];
    updatedLocations[editingIndex] = updatedLocation;
    setLocations(updatedLocations);
    showNotification(`Location "${updatedLocation.name}" updated successfully`, 'success');
    setShowEditDialog(false);
    setEditingLocation(null);
    setEditingIndex(null);
    setDialogTechs([]);
    setEditingConstraints({});
    setEditingEssentials({});
    setEditingCosts({});
  };

  // Handle location drag to reposition - show confirmation dialog
  const handleLocationDrag = useCallback((coordinate, locationIndex, originalLocation) => {
    if (mode !== 'view') return; // Only allow drag in view mode
    
    // Store the pending change and show confirmation dialog
    setPendingDragChange({
      locationIndex,
      originalLocation,
      newCoordinate: coordinate,
      newLatitude: coordinate[1],
      newLongitude: coordinate[0]
    });
    setShowDragConfirmDialog(true);
  }, [mode]);
  
  // Handle real-time drag movement - just update visual position for preview
  const handleDragMove = useCallback((coordinate, locationIndex) => {
    if (mode !== 'view') return;
    
    // Just update the dragging position for visual feedback
    setDraggingPosition({ coordinate, locationIndex });
  }, [mode]);
  
  // Create scatter plot layer for locations with viewport culling
  const locationsLayer = useMemo(() => {
    // Only render locations within viewport for better performance
    const visibleLocations = locations.map((loc, idx) => {
      // If this location is being dragged, use the dragging position
      if (draggingPosition && draggingPosition.locationIndex === idx) {
        return {
          ...loc,
          longitude: draggingPosition.coordinate[0],
          latitude: draggingPosition.coordinate[1]
        };
      }
      return loc;
    });
    
    // Create unified icon layer for all locations (circles and triangles)
    const circleLayer = new IconLayer({
      id: 'locations-unified-layer',
      data: visibleLocations.filter(loc => loc && loc.longitude && loc.latitude),
      getPosition: d => [d.longitude, d.latitude],
      getIcon: d => {
        try {
          return createLocationIcon(d, techMap);
        } catch (error) {
          console.warn('Error creating icon for location:', d, error);
          // Return a fallback icon
          return {
            url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
                <circle cx="12" cy="12" r="10" fill="rgb(158, 158, 158)" stroke="#000000" stroke-width="2"/>
              </svg>
            `)}`,
            width: 32,
            height: 32,
            anchorX: 16,
            anchorY: 16
          };
        }
      },
      getSize: 20,
      sizeScale: 1,
      sizeMinPixels: 10,
      sizeMaxPixels: 80,
      pickable: true,
      onClick: (info, event) => {
        if (info.object) {
          if (mode === 'add-link') {
            handleLocationClickForLink(info.object);
          } else if (mode === 'view') {
            setSelectedLocation(info.object);
            setIsDraggingEnabled(true);
            setViewState({
              ...viewState,
              longitude: info.object.longitude,
              latitude: info.object.latitude,
              zoom: 12,
              transitionDuration: 1000
            });
          }
        }
      },
      onHover: (info) => {
        if (info.object) {
          setHoveredInfo({
            name: info.object.name,
            techs: Object.keys(info.object.techs || {}).length,
            x: info.x,
            y: info.y
          });
        } else {
          setHoveredInfo(null);
        }
      },
      onDragStart: (info, event) => {
        if (mode === 'view' && info.object && isDraggingEnabled) {
          const locationIndex = locations.findIndex(loc => loc.name === info.object.name);
          if (locationIndex !== -1) {
            setDraggedLocation({ 
              ...info.object, 
              index: locationIndex,
              originalLatitude: info.object.latitude,
              originalLongitude: info.object.longitude
            });
          }
        }
      },
      onDrag: (info, event) => {
        if (mode === 'view' && draggedLocation && info.coordinate && isDraggingEnabled) {
          handleDragMove(info.coordinate, draggedLocation.index);
        }
      },
      onDragEnd: (info, event) => {
        if (mode === 'view' && draggedLocation && info.coordinate && isDraggingEnabled) {
          handleLocationDrag(info.coordinate, draggedLocation.index, {
            latitude: draggedLocation.originalLatitude,
            longitude: draggedLocation.originalLongitude
          });
          setDraggedLocation(null);
          setDraggingPosition(null);
          setIsDraggingEnabled(false);
        }
      },
      updateTriggers: {
        getIcon: [locations],
        getPosition: [locations, draggingPosition]
      }
    });
    
    return [circleLayer];
  }, [locations, mode, draggedLocation, draggingPosition, isDraggingEnabled, handleLocationDrag, handleDragMove, viewState, techMap]);
  
  // Create line layer for transmission links
  const linksLayer = useMemo(() => {
    // Debug: Log first 3 links to see structure
    if (links.length > 0) {
      console.log('DEBUG - First 3 links structure:', links.slice(0, 3).map(l => ({
        from: l.from,
        to: l.to,
        techs: l.techs,
        tech: l.tech,
        techKeys: Object.keys(l.techs || {}),
        allKeys: Object.keys(l)
      })));
    }
    
    const linkData = links.map(link => {
      const from = locations.find(loc => loc.name === link.from);
      const to = locations.find(loc => loc.name === link.to);
      
      if (from && to) {
        // Get the first tech from the link
        // Handle both formats: link.techs object OR link.tech string
        let techName = 'unknown';
        
        if (link.techs && Object.keys(link.techs).length > 0) {
          // Format: { techs: { "66_kv": { distance: 0.1 } } }
          techName = Object.keys(link.techs)[0];
        } else if (link.tech) {
          // Format: { tech: "66_kv" } (CSV format)
          techName = link.tech;
        }
        
        const color = getVoltageColor(techName);
        const width = getVoltageWidth(techName);
        
        return {
          from: [from.longitude, from.latitude],
          to: [to.longitude, to.latitude],
          linkInfo: link,
          techName: techName,
          color: color,
          width: width
        };
      }
      return null;
    }).filter(Boolean);
    
    return new LineLayer({
      id: 'links-layer',
      data: linkData,
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getColor: d => d.color,
      getWidth: d => d.width,
      widthMinPixels: 1,
      widthMaxPixels: 6,
      antialiasing: true,
      pickable: true,
      onClick: (info) => {
        if (info.object && info.object.linkInfo) {
          setSelectedLocation({ 
            isLink: true, 
            ...info.object.linkInfo,
            techName: info.object.techName
          });
        }
      },
      onHover: (info) => {
        // Cursor will be handled by getCursor property
      }
    });
  }, [links, locations]);
  
  // Flatten and order layers: links at bottom, circles in middle, triangles on top
  const layers = useMemo(() => {
    const locationLayers = Array.isArray(locationsLayer) ? locationsLayer : [locationsLayer];
    return [linksLayer, ...locationLayers];
  }, [linksLayer, locationsLayer]);
  
  // Handle location click for link creation
  const handleLocationClickForLink = (location) => {
    if (mode !== 'add-link') return;
    
    if (!linkStart) {
      setLinkStart(location);
      showNotification(`Link start: ${location.name}. Click another location to complete.`, 'info');
    } else {
      if (linkStart.name === location.name) {
        showNotification('Cannot link location to itself', 'error');
        return;
      }
      
      // Calculate distance
      const R = 6371;
      const dLat = (location.latitude - linkStart.latitude) * Math.PI / 180;
      const dLon = (location.longitude - linkStart.longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(linkStart.latitude * Math.PI / 180) * Math.cos(location.latitude * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = Math.round(R * c * 100) / 100;
      
      const newLink = {
        from: linkStart.name,
        to: location.name,
        distance: distance,
        techs: {}
      };
      
      setLinks([...links, newLink]);
      showNotification(`Link created: ${linkStart.name} → ${location.name}`, 'success');
      setLinkStart(null);
    }
  };
  
  // Handle map click for adding locations
  const handleMapClick = (event) => {
    if (mode === 'add-location' && event.coordinate) {
      const [longitude, latitude] = event.coordinate;
      const newLocation = {
        name: `Location ${locations.length + 1}`,
        latitude,
        longitude,
        techs: {},
        isNode: false
      };
      setLocations([...locations, newLocation]);
      showNotification('Location added!', 'success');
    }
  };
  
  // Handle location select from sidebar
  const handleLocationSelect = (location) => {
    setViewState({
      ...viewState,
      longitude: location.longitude,
      latitude: location.latitude,
      zoom: 12,
      transitionDuration: 1000
    });
  };
  
  // Handle delete location
  const handleDeleteLocation = (index) => {
    if (window.confirm('Delete this location?')) {
      const locationName = locations[index].name;
      const newLocations = locations.filter((_, i) => i !== index);
      const newLinks = links.filter(link => link.from !== locationName && link.to !== locationName);
      setLocations(newLocations);
      setLinks(newLinks);
      showNotification('Location deleted', 'success');
    }
  };
  
  // Fit bounds to show all locations
  const fitBounds = () => {
    if (locations.length === 0) return;
    
    // Filter out locations with invalid coordinates
    const validLocations = locations.filter(loc => 
      !isNaN(loc.longitude) && !isNaN(loc.latitude) &&
      isFinite(loc.longitude) && isFinite(loc.latitude)
    );

    if (validLocations.length === 0) {
      console.error('No valid locations with coordinates found');
      return;
    }

    const lngs = validLocations.map(loc => loc.longitude);
    const lats = validLocations.map(loc => loc.latitude);
    
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    
    // Additional validation
    if (!isFinite(minLng) || !isFinite(maxLng) || !isFinite(minLat) || !isFinite(maxLat)) {
      console.error('Invalid bounds calculated:', { minLng, maxLng, minLat, maxLat });
      return;
    }

    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    
    console.log('Fitting bounds to:', { centerLat, centerLng, locations: validLocations.length });
    
    setViewState({
      ...viewState,
      longitude: centerLng,
      latitude: centerLat,
      zoom: 6,
      transitionDuration: 1000
    });
  };
  
  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setViewState(prev => ({ ...prev, zoom: prev.zoom + 1, transitionDuration: 300 }));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setViewState(prev => ({ ...prev, zoom: prev.zoom - 1, transitionDuration: 300 }));
  }, []);

  // Memoized callbacks to prevent re-renders
  const handleViewStateChange = useCallback(({ viewState: newViewState }) => {
    setViewState(newViewState);
  }, []);

  const getCursorStyle = useCallback(({isHovering, isDragging}) => {
    if (isDragging) return 'grabbing';
    if (isHovering) return 'pointer';
    if (mode === 'add-location') return 'crosshair';
    return 'grab';
  }, [mode]);
  
  // Show loading state while WebGL initializes
  if (!mapReady) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Initializing map...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 h-screen overflow-hidden flex">
      {/* Left Panel - Sidebar */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Map View</h2>
        </div>

        {/* Mode Selection */}
        <div className="p-4 border-b border-slate-200">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Mode</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setMode('view'); setLinkStart(null); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                mode === 'view'
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 hover:border-gray-400 text-gray-700'
              }`}
            >
              <FiEye className="mx-auto mb-1" size={20} />
              <div className="text-xs font-medium">View</div>
            </button>
            <button
              onClick={() => { setMode('add-location'); setLinkStart(null); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                mode === 'add-location'
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 hover:border-gray-400 text-gray-700'
              }`}
            >
              <FiMapPin className="mx-auto mb-1" size={20} />
              <div className="text-xs font-medium">Add Location</div>
            </button>
            <button
              onClick={() => { setMode('add-link'); setLinkStart(null); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                mode === 'add-link'
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 hover:border-gray-400 text-gray-700'
              }`}
            >
              <FiLink className="mx-auto mb-1" size={20} />
              <div className="text-xs font-medium">Link</div>
            </button>
          </div>

          {mode === 'view' && (
            <div className="mt-3 p-3 bg-gray-100 rounded-lg text-xs text-gray-900">
              View locations and links
            </div>
          )}
          {mode === 'add-location' && (
            <div className="mt-3 p-3 bg-gray-100 rounded-lg text-xs text-gray-900">
              Click on the map to add a new location
            </div>
          )}
          {mode === 'add-link' && (
            <div className="mt-3 p-3 bg-gray-100 rounded-lg text-xs text-gray-900">
              {linkStart ? `Click on another location to complete the link from ${linkStart.name}` : 'Click on a location to start a link'}
            </div>
          )}
        </div>

        {/* Locations & Links List */}
        <div className="flex-1 overflow-y-auto">
          {locations.length > 0 ? (
            <div>
              {/* Locations Section */}
              <div className="border-b border-slate-200">
                <button
                  onClick={() => setShowLocationsSection(!showLocationsSection)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FiMapPin size={16} className="text-slate-700" />
                    <span className="text-sm font-semibold text-slate-700">Locations ({locations.length})</span>
                  </div>
                  {showLocationsSection ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                </button>
                
                {showLocationsSection && (
                  <div className="p-4 bg-slate-50">
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                      Click any location on the map to view details and edit
                    </div>
                    <div className="text-xs text-slate-600">
                      Total: {locations.length} locations • {locations.filter(l => Object.keys(l.techs || {}).length > 0).length} with technologies
                    </div>
                  </div>
                )}
              </div>

              {/* Links Section */}
              {links.length > 0 && (
                <div className="border-b border-slate-200">
                  <button
                    onClick={() => setShowLinksSection(!showLinksSection)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FiLink size={16} className="text-slate-700" />
                      <span className="text-sm font-semibold text-slate-700">Links ({links.length})</span>
                    </div>
                    {showLinksSection ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                  </button>
                  
                  {showLinksSection && (
                    <div className="p-4 bg-slate-50">
                      <div className="text-xs text-slate-600">
                        Total transmission links: {links.length}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Timeseries Section */}
              {(() => {
                const locationsWithDemand = locations.filter(loc => loc.demandProfile);
                return locationsWithDemand.length > 0 ? (
                  <div className="border-b border-slate-200">
                    <button
                      onClick={() => setShowTimeseriesSection(!showTimeseriesSection)}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FiActivity size={16} className="text-slate-700" />
                        <span className="text-sm font-semibold text-slate-700">Timeseries Data ({locationsWithDemand.length})</span>
                      </div>
                      {showTimeseriesSection ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                    </button>
                    
                    {showTimeseriesSection && (
                      <div className="p-4 bg-slate-50 space-y-3">
                        {/* Statistics Summary */}
                        {locationsWithDemand.length > 0 && (() => {
                          const totalMWh = locationsWithDemand.reduce((sum, loc) => sum + parseFloat(loc.totalDemandMWh || 0), 0);
                          const totalGWh = totalMWh / 1000;
                          const avgMWh = totalMWh / locationsWithDemand.length;
                          return (
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-200">
                              <div className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-wide">Demand Statistics</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white/60 p-2 rounded">
                                  <div className="text-slate-600">Total Energy</div>
                                  <div className="font-bold text-gray-700">{totalGWh.toFixed(2)} GWh</div>
                                </div>
                                <div className="bg-white/60 p-2 rounded">
                                  <div className="text-slate-600">Avg/Substation</div>
                                  <div className="font-bold text-gray-700">{avgMWh.toFixed(2)} MWh</div>
                                </div>
                                <div className="bg-white/60 p-2 rounded">
                                  <div className="text-slate-600">Substations</div>
                                  <div className="font-bold text-gray-700">{locationsWithDemand.length}</div>
                                </div>
                                <div className="bg-white/60 p-2 rounded">
                                  <div className="text-slate-600">Time Period</div>
                                  <div className="font-bold text-gray-700">{locationsWithDemand[0]?.demandProfile?.hours || 0}h</div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Filter Controls */}
                        {locationsWithDemand.length > 0 && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Filter substations..."
                              value={timeseriesFilter}
                              onChange={(e) => setTimeseriesFilter(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                            />
                            <select
                              value={timeseriesSortBy}
                              onChange={(e) => setTimeseriesSortBy(e.target.value)}
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                            >
                              <option value="name">Sort by Name</option>
                              <option value="total">Sort by Total (High to Low)</option>
                              <option value="total-asc">Sort by Total (Low to High)</option>
                              <option value="avg">Sort by Average (High to Low)</option>
                              <option value="max">Sort by Peak Demand</option>
                            </select>
                          </div>
                        )}
                        
                        {/* Demand Profiles List */}
                        {locationsWithDemand.length > 0 && (() => {
                          let filtered = locationsWithDemand.filter(loc => 
                            !timeseriesFilter || loc.name.toLowerCase().includes(timeseriesFilter.toLowerCase())
                          );
                          
                          // Sort
                          switch(timeseriesSortBy) {
                            case 'total':
                              filtered.sort((a, b) => parseFloat(b.totalDemandMWh) - parseFloat(a.totalDemandMWh));
                              break;
                            case 'total-asc':
                              filtered.sort((a, b) => parseFloat(a.totalDemandMWh) - parseFloat(b.totalDemandMWh));
                              break;
                            case 'avg':
                              filtered.sort((a, b) => parseFloat(b.demandProfile.avgMW) - parseFloat(a.demandProfile.avgMW));
                              break;
                            case 'max':
                              filtered.sort((a, b) => parseFloat(b.demandProfile.maxMW) - parseFloat(a.demandProfile.maxMW));
                              break;
                            default:
                              filtered.sort((a, b) => a.name.localeCompare(b.name));
                          }
                          
                          return (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center justify-between">
                                <span>Demand Profiles</span>
                                <span className="text-slate-500 font-normal">{filtered.length} of {locationsWithDemand.length}</span>
                              </div>
                              <div className="max-h-96 overflow-y-auto space-y-1.5">
                                {filtered.map(loc => (
                                  <div 
                                    key={loc.name}
                                    onClick={() => {
                                      setSelectedLocation(loc);
                                      setViewState({
                                        ...viewState,
                                        longitude: loc.longitude,
                                        latitude: loc.latitude,
                                        zoom: 10,
                                        transitionDuration: 1000
                                      });
                                    }}
                                    className="p-2.5 bg-white rounded border border-slate-200 hover:border-gray-400 hover:shadow-sm cursor-pointer transition-all"
                                  >
                                    <div className="text-xs font-semibold text-slate-800 mb-1">{loc.name}</div>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                      <div className="text-slate-600">
                                        <span className="font-medium">Total:</span> {(parseFloat(loc.totalDemandMWh) / 1000).toFixed(2)} GWh
                                      </div>
                                      <div className="text-slate-600">
                                        <span className="font-medium">Avg:</span> {loc.demandProfile.avgMW} MW
                                      </div>
                                      <div className="text-slate-600">
                                        <span className="font-medium">Peak:</span> {loc.demandProfile.maxMW} MW
                                      </div>
                                      <div className="text-slate-600">
                                        <span className="font-medium">Min:</span> {loc.demandProfile.minMW} MW
                                      </div>
                                    </div>
                                    {timeseriesPreview === loc.name && loc.demandProfile.timeseries && (
                                      <div className="mt-2 pt-2 border-t border-slate-200">
                                        <div className="h-12 flex items-end gap-0.5">
                                          {loc.demandProfile.timeseries.slice(0, 168).map((val, idx) => {
                                            const height = (val / parseFloat(loc.demandProfile.maxMW)) * 100;
                                            return (
                                              <div
                                                key={idx}
                                                className="flex-1 bg-gray-400 rounded-t"
                                                style={{ height: `${height}%`, minWidth: '1px' }}
                                                title={`Hour ${idx}: ${val.toFixed(0)} MW`}
                                              />
                                            );
                                          })}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1 text-center">
                                          First 7 days • Click location for full details
                                        </div>
                                      </div>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTimeseriesPreview(timeseriesPreview === loc.name ? null : loc.name);
                                      }}
                                      className="mt-2 w-full text-xs text-gray-600 hover:text-gray-800 font-medium"
                                    >
                                      {timeseriesPreview === loc.name ? '− Hide Preview' : '+ Show Preview'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <FiMapPin className="mx-auto mb-2" size={32} />
              <p className="text-sm">No locations yet</p>
              <p className="text-xs mt-1">Switch to "Add Location" mode and click on the map</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 relative">
        <DeckGL
          ref={deckRef}
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          controller={!draggedLocation}
          layers={layers}
          onClick={handleMapClick}
          getCursor={getCursorStyle}
          getTooltip={null}
          _pickable={true}
          parameters={{
            depthTest: false,
            blend: true,
            blendFunc: [770, 771],
            blendEquation: 32774
          }}
          _typedArrayManagerProps={{
            overAlloc: 1,
            poolSize: 0
          }}
          onError={(error) => {
            // Suppress WebGL context initialization errors
            if (!error?.message?.includes('maxTextureDimension2D')) {
              console.error('Deck.gl error:', error);
            }
          }}
        >
          <MapGL 
            mapStyle={MAP_STYLES[currentStyle]}
            attributionControl={false}
          />
        </DeckGL>
        
        {/* Map Legend - Dynamic based on model technologies */}
        {(locations.length > 0 || links.length > 0) && (() => {
          // Extract unique technologies from all locations (not grouped)
          const techMapEntries = new Map();
          
          // Count substations
          let substationsWithDemand = 0;
          let substationsWithoutDemand = 0;
          
          locations.forEach(loc => {
            const locationName = (loc.name || '').toUpperCase();
            const isSubstation = locationName.includes('S/E') || locationName.includes('SUBSTATION') || locationName.includes('TAP OFF');
            
            if (isSubstation) {
              const techs = loc.techs || {};
              const hasDemand = Object.keys(techs).some(t => t.toLowerCase().includes('demand'));
              if (hasDemand) {
                substationsWithDemand++;
              } else {
                substationsWithoutDemand++;
              }
            } else {
              // Not a substation, add its technologies
              const techs = loc.techs || {};
              Object.keys(techs).forEach(techName => {
                if (!techMapEntries.has(techName)) {
                  const color = getTechColor(techName, techMap);
                  const displayName = techMap[techName]?.essentials?.name || techName;
                  techMapEntries.set(techName, { color, displayName });
                }
              });
            }
          });
          
          const totalSubstations = substationsWithDemand + substationsWithoutDemand;
          
          return (
            <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-xl p-4 z-50 max-w-xs max-h-96 overflow-y-auto">
              <h4 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
                <FiLayers size={16} />
                Map Legend
              </h4>
              
              {/* Substations */}
              {totalSubstations > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Substations ({totalSubstations})</div>
                  <div className="space-y-1.5 text-xs">
                    {substationsWithoutDemand > 0 && (
                      <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" className="flex-shrink-0">
                          <path fill="#212121" stroke="#000" strokeWidth="1" d="M12 2L22 22L2 22Z"/>
                        </svg>
                        <span className="text-gray-700">No demand ({substationsWithoutDemand})</span>
                      </div>
                    )}
                    {substationsWithDemand > 0 && (
                      <div className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" className="flex-shrink-0">
                          <path fill="#F44336" stroke="#000" strokeWidth="1" d="M12 2L22 22L2 22Z"/>
                        </svg>
                        <span className="text-gray-700">With demand ({substationsWithDemand})</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Technologies */}
              {techMapEntries.size > 0 && (
                <div className="mb-4 pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Technologies</div>
                  <div className="space-y-1.5 text-xs">
                    {Array.from(techMapEntries.entries()).map(([techName, { color, displayName }]) => {
                      const rgbaColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
                      return (
                        <div key={techName} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full border-2 border-gray-800" style={{ backgroundColor: rgbaColor }}></div>
                          <span className="text-gray-700">{displayName}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Transmission Links */}
              {links.length > 0 && (() => {
                // Group links by voltage level
                const voltageGroups = {};
                const powerLines = [];
                
                links.forEach(link => {
                  // Handle both formats: link.techs object OR link.tech string
                  let techName = null;
                  
                  if (link.techs && Object.keys(link.techs).length > 0) {
                    techName = Object.keys(link.techs)[0];
                  } else if (link.tech) {
                    techName = link.tech;
                  }
                  
                  if (techName) {
                    if (techName.toLowerCase().includes('power_line')) {
                      powerLines.push(link);
                    } else {
                      if (!voltageGroups[techName]) {
                        voltageGroups[techName] = [];
                      }
                      voltageGroups[techName].push(link);
                    }
                  }
                });
                
                // Sort voltage levels
                const sortedVoltages = Object.keys(voltageGroups).sort((a, b) => {
                  const aMatch = a.match(/(\d+)/);
                  const bMatch = b.match(/(\d+)/);
                  const aNum = aMatch ? parseInt(aMatch[1]) : 0;
                  const bNum = bMatch ? parseInt(bMatch[1]) : 0;
                  return aNum - bNum;
                });
                
                return (
                  <div className="pt-3 border-t border-gray-200">
                    <div className="text-xs font-semibold text-gray-700 mb-2">
                      Transmission Lines ({links.length} links)
                    </div>
                    
                    {/* Power Lines (Plant to Substation) */}
                    {powerLines.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs text-gray-500 mb-1">Power Plant Connections</div>
                        <div className="flex items-center gap-2 text-xs mb-1">
                          <div className="w-6 h-0.5" style={{ backgroundColor: 'rgb(28, 3, 255)' }}></div>
                          <span className="text-gray-700">Power Lines ({powerLines.length})</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Voltage Level Lines */}
                    {sortedVoltages.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">By Voltage Level</div>
                        {sortedVoltages.map(voltage => {
                          const color = getVoltageColor(voltage);
                          const count = voltageGroups[voltage].length;
                          return (
                            <div key={voltage} className="flex items-center gap-2 text-xs mb-1">
                              <div 
                                className="w-6 h-0.5" 
                                style={{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                              ></div>
                              <span className="text-gray-700">
                                {voltage.replace('_', ' ').toUpperCase()} ({count})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}
        
        {/* Hover tooltip */}
        {hoveredInfo && (
          <div
            style={{
              position: 'absolute',
              left: hoveredInfo.x + 10,
              top: hoveredInfo.y + 10,
              pointerEvents: 'none'
            }}
            className="bg-white px-3 py-2 rounded shadow-lg text-xs z-50"
          >
            <div className="font-semibold">{hoveredInfo.name}</div>
            {hoveredInfo.isLink ? (
              <div className="text-slate-600">{hoveredInfo.distance} km</div>
            ) : (
              <div className="text-slate-600">Technologies: {hoveredInfo.techs}</div>
            )}
          </div>
        )}
        
        {/* Selected Location Panel */}
        {selectedLocation && (
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-xl p-4 w-80 max-h-96 overflow-y-auto z-50">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-bold text-slate-800">
                  {selectedLocation.isLink ? 'Transmission Link' : selectedLocation.name}
                </h3>
                {selectedLocation.isNode && (
                  <p className="text-xs text-gray-600 mt-1 font-medium">⚡ Substation/Node</p>
                )}
              </div>
              <div className="flex gap-2">
                {!selectedLocation.isLink && (
                  <button
                    onClick={() => {
                      setSelectedLocationForIcon(selectedLocation);
                      setShowIconSelector(true);
                    }}
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                    title="Change Icon"
                  >
                    <FiLayers size={18} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedLocation(null);
                    setIsDraggingEnabled(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            
            {selectedLocation.isLink ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-slate-700">{selectedLocation.from}</span>
                  </div>
                  <div className="text-center text-slate-400 my-1">↓</div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{selectedLocation.to}</span>
                  </div>
                </div>
                <div className="text-xs border-t border-slate-200 pt-2 space-y-1">
                  <div>
                    <span className="text-slate-600">Distance:</span>{' '}
                    <span className="font-medium">{selectedLocation.distance} km</span>
                  </div>
                  {selectedLocation.techName && (
                    <div>
                      <span className="text-slate-600">Type:</span>{' '}
                      <span className="font-medium">
                        {selectedLocation.techName.replace('_', ' ').toUpperCase()}
                      </span>
                      <div className="mt-1 flex items-center gap-2">
                        <div 
                          className="w-8 h-1 rounded" 
                          style={{ 
                            backgroundColor: `rgb(${getVoltageColor(selectedLocation.techName).join(',')})` 
                          }}
                        ></div>
                        <span className="text-xs text-slate-500">
                          {selectedLocation.techName.toLowerCase().includes('power_line') 
                            ? 'Power Plant Connection' 
                            : 'Transmission Line'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {selectedLocation.techs && Object.keys(selectedLocation.techs).length > 0 && (
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <div className="text-xs font-medium text-slate-700 mb-2">Technologies:</div>
                    {Object.entries(selectedLocation.techs).map(([techName, techData]) => (
                      <div key={techName} className="text-xs py-2 px-2 bg-gray-50 rounded mb-1 border border-gray-200">
                        <div className="font-medium text-gray-800">{techName}</div>
                        {techData.constraints && Object.keys(techData.constraints).length > 0 && (
                          <div className="text-slate-600 mt-1 space-y-0.5">
                            {Object.entries(techData.constraints).slice(0, 3).map(([key, value]) => (
                              <div key={key}>{key}: {value}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs">
                  <span className="text-slate-600">Coordinates:</span>{' '}
                  <span className="font-medium">{selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}</span>
                </div>
                
                <div className="text-xs">
                  <span className="text-slate-600">Technologies:</span>{' '}
                  <span className="font-medium">{Object.keys(selectedLocation.techs || {}).length}</span>
                </div>
                
                {/* Always show total demand if available */}
                {(selectedLocation.totalDemandMWh || selectedLocation.demandProfile) && (
                  <div className="text-xs bg-gradient-to-r from-gray-100 to-gray-200 p-2 rounded-lg border border-gray-300 my-2">
                    <span className="text-slate-600 font-semibold">Total Energy Demand:</span>{' '}
                    <span className="font-bold text-gray-900 text-base">
                      {selectedLocation.totalDemandMWh || selectedLocation.demandProfile?.totalMWh || 'N/A'} MWh
                    </span>
                    {selectedLocation.demandProfile?.totalGWh && (
                      <span className="text-xs text-slate-600 ml-2">({selectedLocation.demandProfile.totalGWh} GWh)</span>
                    )}
                  </div>
                )}
                
                {Object.keys(selectedLocation.techs || {}).length > 0 && (
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <div className="text-xs font-medium text-slate-700 mb-2">Installed Technologies:</div>
                    {Object.entries(selectedLocation.techs).map(([techName, techData]) => {
                      // Determine color based on tech type - matching Chile model names
                      let bgColor = 'bg-gray-50';
                      let borderColor = 'border-gray-200';
                      let textColor = 'text-gray-800';
                      const lower = techName.toLowerCase();
                      
                      if (lower.includes('solar') || lower.includes('pv') || lower.includes('csp')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-300'; textColor = 'text-gray-900';
                      } else if (lower.includes('wind')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-300'; textColor = 'text-gray-900';
                      } else if (lower.includes('hydro') || lower.includes('reservoir')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-300'; textColor = 'text-gray-900';
                      } else if (lower.includes('battery') || lower.includes('storage')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-200'; textColor = 'text-gray-800';
                      } else if (lower.includes('coal') || lower.includes('oil') || lower.includes('diesel') || lower.includes('gas') || lower.includes('ccgt') || lower.includes('nuclear')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-300'; textColor = 'text-gray-900';
                      } else if (lower.includes('geo') || lower.includes('geothermal')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-300'; textColor = 'text-gray-900';
                      } else if (lower.includes('bio') || lower.includes('biomass') || lower.includes('biogas')) {
                        bgColor = 'bg-gray-50'; borderColor = 'border-gray-300'; textColor = 'text-gray-900';
                      }
                      
                      return (
                        <div key={techName} className={`text-xs py-2 px-2 ${bgColor} rounded mb-1 border ${borderColor}`}>
                          <div className={`font-medium ${textColor}`}>{techName}</div>
                          {techData.constraints && Object.keys(techData.constraints).length > 0 && (
                            <div className="text-slate-600 mt-1 space-y-0.5">
                              {Object.entries(techData.constraints).slice(0, 5).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium">{key}:</span> {typeof value === 'number' ? value.toFixed(2) : value}
                                </div>
                              ))}
                              {Object.keys(techData.constraints).length > 5 && (
                                <div className="text-slate-500 italic">+ {Object.keys(techData.constraints).length - 5} more...</div>
                              )}
                            </div>
                          )}
                          {techData.costs && Object.keys(techData.costs).length > 0 && (
                            <div className="text-slate-600 mt-1 pt-1 border-t border-slate-200">
                              <div className="font-medium text-xs">Costs:</div>
                              {Object.entries(techData.costs).slice(0, 3).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium">{key}:</span> {typeof value === 'number' ? value.toFixed(2) : value}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedLocation.demandProfile && (
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <div className="text-xs font-medium text-slate-700 mb-2">Demand Profile Timeseries:</div>
                    <div className="text-xs text-slate-600 space-y-1.5">
                      <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-3 rounded-lg border-2 border-gray-300 mb-2">
                        <div className="text-slate-600 text-xs font-semibold mb-1">Annual Energy Demand</div>
                        <div className="flex items-baseline gap-2">
                          <div className="text-2xl font-bold text-gray-900">{selectedLocation.totalDemandMWh}</div>
                          <div className="text-sm font-semibold text-gray-700">MWh</div>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">= {selectedLocation.demandProfile.totalGWh} GWh</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-slate-500 text-xs">Total Energy</div>
                          <div className="font-bold text-gray-700">{selectedLocation.demandProfile.totalGWh} GWh</div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-slate-500 text-xs">Average Power</div>
                          <div className="font-bold text-gray-700">{selectedLocation.demandProfile.avgMW} MW</div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-slate-500 text-xs">Peak Demand</div>
                          <div className="font-bold text-gray-700">{selectedLocation.demandProfile.maxMW} MW</div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                          <div className="text-slate-500 text-xs">Min Demand</div>
                          <div className="font-bold text-gray-700">{selectedLocation.demandProfile.minMW} MW</div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-200">
                        <div><span className="font-medium">Data Points:</span> {selectedLocation.demandProfile.hours} hours</div>
                        <div><span className="font-medium">Source:</span> {selectedLocation.demandProfile.file}</div>
                        <div><span className="font-medium">Column:</span> {selectedLocation.demandProfile.column}</div>
                      </div>
                    </div>
                  </div>
                )}
              
                <button
                  onClick={() => {
                    const locationIndex = locations.findIndex(loc => loc.name === selectedLocation.name);
                    if (locationIndex !== -1) {
                      handleEditLocation(selectedLocation, locationIndex);
                      setSelectedLocation(null);
                    }
                  }}
                  className="w-full mt-3 px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 flex items-center justify-center gap-1"
                  title="Edit this location and manage technologies"
                >
                  <FiEdit2 size={14} />
                  Edit Location
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Map Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <select
            value={currentStyle}
            onChange={(e) => setCurrentStyle(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded shadow-md text-sm"
          >
            <option value="streets">Streets</option>
            <option value="satellite">Satellite</option>
            <option value="terrain">Terrain</option>
            <option value="dark">Dark</option>
          </select>
          
          <button
            onClick={handleZoomIn}
            className="p-2 bg-white border border-slate-300 rounded shadow-md hover:bg-slate-50"
            title="Zoom In"
          >
            <FiZoomIn size={20} />
          </button>
          
          <button
            onClick={handleZoomOut}
            className="p-2 bg-white border border-slate-300 rounded shadow-md hover:bg-slate-50"
            title="Zoom Out"
          >
            <FiZoomOut size={20} />
          </button>
          
          <button
            onClick={fitBounds}
            className="p-2 bg-white border border-slate-300 rounded shadow-md hover:bg-slate-50"
            title="Fit All Locations"
          >
            <FiMaximize2 size={20} />
          </button>
        </div>
      </div>
      
      {/* Drag Confirmation Dialog */}
      {showDragConfirmDialog && pendingDragChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-4 rounded-t-xl">
              <h3 className="text-lg font-bold">Confirm Location Change</h3>
            </div>
            
            <div className="p-6">
              <p className="text-slate-700 mb-4">
                Do you want to move <span className="font-semibold">{locations[pendingDragChange.locationIndex]?.name}</span> to the new position?
              </p>
              
              <div className="bg-slate-50 p-4 rounded-lg space-y-2 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Original Position:</span>
                  <span className="font-mono text-slate-800">
                    {pendingDragChange.originalLocation.latitude.toFixed(4)}, {pendingDragChange.originalLocation.longitude.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-center text-slate-400">
                  <FiArrowRight size={16} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">New Position:</span>
                  <span className="font-mono text-gray-600 font-semibold">
                    {pendingDragChange.newLatitude.toFixed(4)}, {pendingDragChange.newLongitude.toFixed(4)}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Cancel - revert to original position
                    setShowDragConfirmDialog(false);
                    setPendingDragChange(null);
                    showNotification('Location change cancelled', 'info');
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <FiX size={18} />
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Accept - apply the change
                    const updatedLocations = [...locations];
                    updatedLocations[pendingDragChange.locationIndex] = {
                      ...updatedLocations[pendingDragChange.locationIndex],
                      latitude: pendingDragChange.newLatitude,
                      longitude: pendingDragChange.newLongitude
                    };
                    setLocations(updatedLocations);
                    showNotification(
                      `Location repositioned to ${pendingDragChange.newLatitude.toFixed(4)}, ${pendingDragChange.newLongitude.toFixed(4)}`,
                      'success'
                    );
                    setShowDragConfirmDialog(false);
                    setPendingDragChange(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-900 hover:to-gray-900 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <FiCheck size={18} />
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Icon Selector Dialog */}
      {showIconSelector && selectedLocationForIcon && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10002]">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-4 rounded-t-xl">
              <h3 className="text-lg font-bold">Select Icon</h3>
              <p className="text-sm text-gray-100 mt-1">{selectedLocationForIcon.name}</p>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Choose an icon to represent this location on the map:
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(ICON_TYPES).map(([key, iconInfo]) => {
                  const currentIconType = selectedLocationForIcon.iconType || getDefaultIconType(selectedLocationForIcon);
                  const isSelected = currentIconType === key;
                  
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const locationIndex = locations.findIndex(
                          loc => loc.name === selectedLocationForIcon.name
                        );
                        if (locationIndex !== -1) {
                          const updatedLocations = [...locations];
                          updatedLocations[locationIndex] = {
                            ...updatedLocations[locationIndex],
                            iconType: key
                          };
                          setLocations(updatedLocations);
                          showNotification(`Icon changed to ${iconInfo.label}`, 'success');
                          setShowIconSelector(false);
                          setSelectedLocationForIcon(null);
                        }
                      }}
                      className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-gray-500 bg-gray-50'
                          : 'border-slate-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-center mb-2">
                        <svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path d={iconInfo.path} fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="text-xs text-center text-slate-700 font-medium">
                        {iconInfo.label}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    const locationIndex = locations.findIndex(
                      loc => loc.name === selectedLocationForIcon.name
                    );
                    if (locationIndex !== -1) {
                      const updatedLocations = [...locations];
                      // Remove custom icon to use default
                      delete updatedLocations[locationIndex].iconType;
                      setLocations(updatedLocations);
                      showNotification('Icon reset to default', 'info');
                      setShowIconSelector(false);
                      setSelectedLocationForIcon(null);
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                >
                  Reset to Default
                </button>
                <button
                  onClick={() => {
                    setShowIconSelector(false);
                    setSelectedLocationForIcon(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-900 hover:to-gray-900 text-white rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Full Edit Location Dialog with Technology Management */}
      {showEditDialog && editingLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-slate-800">Edit Location</h3>
                <button
                  onClick={() => setShowEditDialog(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <FiX size={24} />
                </button>
              </div>
              
              {/* Editable Location Name */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">Location Name</label>
                <input
                  type="text"
                  value={editingLocation.name}
                  onChange={(e) => setEditingLocation({ ...editingLocation, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Enter location name"
                />
              </div>
              
              {/* Editable Coordinates */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">📍</span>
                <input
                  type="number"
                  step="0.0001"
                  value={editingLocation.latitude}
                  onChange={(e) => setEditingLocation({ ...editingLocation, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-32 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Latitude"
                />
                <span className="text-xs text-slate-400">,</span>
                <input
                  type="number"
                  step="0.0001"
                  value={editingLocation.longitude}
                  onChange={(e) => setEditingLocation({ ...editingLocation, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-32 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Longitude"
                />
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Technologies List */}
              {dialogTechs.length > 0 ? (
                <div className="space-y-4">
                  {dialogTechs.map(techName => {
                    const techData = editingLocation.techs[techName];
                    const techTemplate = techMap[techName] || {};
                    const customConstraints = editingConstraints[techName] || {};
                    const allConstraints = { ...(techTemplate.constraints || {}), ...(techData?.constraints || {}), ...customConstraints };
                    const isExpanded = expandedTechConstraints[techName];
                    const csvFile = techCsvFiles[techName];
                    
                    return (
                      <div key={techName} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold text-lg text-slate-800">{formatTechName(techName)}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleTechConstraints(techName)}
                              className="text-slate-600 hover:text-slate-800 text-sm flex items-center gap-1 px-3 py-1 bg-white rounded-md hover:bg-slate-50"
                            >
                              {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                              <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                            </button>
                            <button
                              onClick={() => removeTechFromDialog(techName)}
                              className="text-gray-500 hover:text-gray-700 p-2 bg-white rounded-md hover:bg-gray-50"
                              title="Remove technology"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* CSV Upload for Technology */}
                        {techTemplate?.parent === 'demand' ? (
                          <div className="mb-3">
                            {editingLocation.demandProfile ? (
                              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <FiCheck className="text-gray-600" size={16} />
                                  <label className="text-xs font-semibold text-gray-800">
                                    Demand Timeseries Loaded
                                  </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="bg-white p-2 rounded">
                                    <div className="text-slate-500">Total Energy</div>
                                    <div className="font-bold text-gray-700">{editingLocation.demandProfile.totalGWh} GWh</div>
                                  </div>
                                  <div className="bg-white p-2 rounded">
                                    <div className="text-slate-500">Average Power</div>
                                    <div className="font-bold text-gray-700">{editingLocation.demandProfile.avgMW} MW</div>
                                  </div>
                                  <div className="bg-white p-2 rounded">
                                    <div className="text-slate-500">Peak Demand</div>
                                    <div className="font-bold text-gray-700">{editingLocation.demandProfile.maxMW} MW</div>
                                  </div>
                                  <div className="bg-white p-2 rounded">
                                    <div className="text-slate-500">Data Points</div>
                                    <div className="font-bold text-gray-700">{editingLocation.demandProfile.hours}h</div>
                                  </div>
                                </div>
                                <div className="bg-gray-50 p-2 rounded border border-gray-200 mt-2">
                                  <div className="text-xs font-semibold text-gray-900 mb-1">Annual Demand: {editingLocation.totalDemandMWh} MWh</div>
                                </div>
                                <div className="mt-2 text-xs text-slate-600">
                                  <div><span className="font-medium">Source:</span> {editingLocation.demandProfile.file}</div>
                                  <div><span className="font-medium">Column:</span> {editingLocation.demandProfile.column}</div>
                                  <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded">
                                    <span className="font-medium text-gray-800">⚡ Linked to constraint:</span>
                                    <span className="ml-1 font-mono text-gray-900">resource = file={editingLocation.demandProfile.file}:{editingLocation.demandProfile.column}</span>
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer mt-2 pt-2 border-t border-gray-200">
                                  <span>Replace with different timeseries:</span>
                                  <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => handleTechCsvUpload(techName, e.target.files[0])}
                                    className="text-xs"
                                  />
                                </label>
                              </div>
                            ) : (
                              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2 p-2 bg-gray-100 border border-gray-300 rounded">
                                  <span className="text-xs text-gray-800">
                                    ⚠️ <strong>No demand data found.</strong> If this is the Chile model, please delete it and reload from templates to get the demand timeseries.
                                  </span>
                                </div>
                                <label className="block text-xs font-semibold text-gray-800 mb-2">
                                  Energy Demand * (Required)
                                </label>
                                <input
                                  type="text"
                                  value={editingConstraints[techName]?.energy_cap || ''}
                                  onChange={(e) => updateDialogConstraint(techName, 'energy_cap', e.target.value)}
                                  placeholder="Enter demand value (kW) or upload CSV below"
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-gray-500 mb-2"
                                />
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                  <span>Or upload timeseries CSV:</span>
                                  <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => handleTechCsvUpload(techName, e.target.files[0])}
                                    className="text-xs"
                                  />
                                </label>
                                {csvFile && (
                                  <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                                    <FiCheck size={12} /> {csvFile.name}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mb-3">
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                              <span className="font-medium">Production/Consumption CSV:</span>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleTechCsvUpload(techName, e.target.files[0])}
                                className="text-xs"
                              />
                            </label>
                            {csvFile && (
                              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                                <FiCheck size={12} /> {csvFile.name}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="space-y-4 mt-4 pt-4 border-t border-gray-300">
                            {/* Essentials Section */}
                            <div>
                              <button
                                onClick={() => setExpandedSections({ ...expandedSections, [`${techName}_essentials`]: !expandedSections[`${techName}_essentials`] })}
                                className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2 hover:text-gray-600"
                              >
                                {expandedSections[`${techName}_essentials`] ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                                <span>Essentials</span>
                              </button>
                              {expandedSections[`${techName}_essentials`] && (
                                <div className="pl-4 space-y-2 bg-white p-3 rounded">
                                  {Object.entries(techTemplate.essentials || {}).map(([key, value]) => {
                                    const customValue = editingEssentials[techName]?.[key];
                                    const displayValue = customValue !== undefined ? customValue : (techData?.essentials?.[key] !== undefined ? techData.essentials[key] : value);
                                    
                                    return (
                                      <div key={key} className="flex gap-2 items-center text-xs">
                                        <span className="text-slate-600 w-32">{formatTechName(key)}:</span>
                                        {key === 'parent' ? (
                                          <span className="font-medium text-slate-800">{displayValue}</span>
                                        ) : key === 'color' ? (
                                          <div className="flex items-center gap-2 flex-1">
                                            <input
                                              type="color"
                                              value={displayValue}
                                              onChange={(e) => updateDialogEssential(techName, key, e.target.value)}
                                              className="w-8 h-6 border border-slate-300 rounded cursor-pointer"
                                            />
                                            <input
                                              type="text"
                                              value={displayValue}
                                              onChange={(e) => updateDialogEssential(techName, key, e.target.value)}
                                              className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded"
                                            />
                                          </div>
                                        ) : (
                                          <input
                                            type="text"
                                            value={displayValue}
                                            onChange={(e) => updateDialogEssential(techName, key, e.target.value)}
                                            className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded"
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Constraints Section */}
                            <div>
                              <button
                                onClick={() => setExpandedSections({ ...expandedSections, [`${techName}_constraints`]: !expandedSections[`${techName}_constraints`] })}
                                className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2 hover:text-gray-600"
                              >
                                {expandedSections[`${techName}_constraints`] ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                                <span>Constraints ({Object.keys(allConstraints).length})</span>
                              </button>
                              {expandedSections[`${techName}_constraints`] && (
                                <div className="pl-4 space-y-3 bg-white p-3 rounded">
                                  {Object.keys(allConstraints).length > 0 && (
                                    <div className="space-y-2">
                                      {Object.entries(allConstraints).map(([key, value]) => {
                                        const definition = CONSTRAINT_DEFINITIONS[key];
                                        const fileKey = `${techName}_${key}`;
                                        const csvFile = constraintCsvFiles[fileKey];
                                        const isResourceConstraint = key === 'resource';
                                        const customValue = editingConstraints[techName]?.[key];
                                        const displayValue = customValue !== undefined ? customValue : value;
                                        
                                        return (
                                          <div key={key} className="space-y-2">
                                            <div className="flex gap-2 items-center text-xs">
                                              <div className="flex items-center gap-1 w-40">
                                                <span className="text-slate-600">{key}:</span>
                                                {definition && (
                                                  <div className="relative group">
                                                    <FiHelpCircle size={12} className="text-slate-400 cursor-help" />
                                                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-56 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-50">
                                                      {definition.desc}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                              <input
                                                type="text"
                                                value={typeof displayValue === 'object' ? JSON.stringify(displayValue) : displayValue}
                                                onChange={(e) => updateDialogConstraint(techName, key, e.target.value)}
                                                className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded"
                                                placeholder={isResourceConstraint ? "Value or upload CSV below" : "Value"}
                                              />
                                            </div>
                                            
                                            {isResourceConstraint && techTemplate?.parent === 'demand' && editingLocation.demandProfile && (
                                              <div className="pl-4 p-2 bg-gray-50 border border-gray-200 rounded">
                                                <div className="flex items-center gap-1 text-xs text-gray-800 font-semibold mb-1">
                                                  <FiCheck size={12} />
                                                  <span>Timeseries file linked to this constraint:</span>
                                                </div>
                                                <div className="text-xs text-slate-700">
                                                  <div><span className="font-medium">File:</span> {editingLocation.demandProfile.file}</div>
                                                  <div><span className="font-medium">Column:</span> {editingLocation.demandProfile.column}</div>
                                                  <div><span className="font-medium">Resource value:</span> file={editingLocation.demandProfile.file}:{editingLocation.demandProfile.column}</div>
                                                </div>
                                              </div>
                                            )}
                                            {isResourceConstraint && !(techTemplate?.parent === 'demand' && editingLocation.demandProfile) && (
                                              <div className="pl-4">
                                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                                  <span>Or upload timeseries CSV:</span>
                                                  <input
                                                    type="file"
                                                    accept=".csv"
                                                    onChange={(e) => handleConstraintCsvUpload(techName, key, e.target.files[0])}
                                                    className="text-xs"
                                                  />
                                                </label>
                                                {csvFile && (
                                                  <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                                                    <FiCheck size={12} /> {csvFile.name}
                                                  </p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  
                                  {/* Add Constraint Button */}
                                  <div className="pt-2 border-t border-slate-200">
                                    <button
                                      onClick={() => setConstraintSearch({ ...constraintSearch, [techName]: 'open' })}
                                      className="group flex h-9 w-full items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 hover:bg-gray-600 hover:pl-2 hover:text-white text-sm font-medium text-gray-800"
                                    >
                                      <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                                        <FiArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
                                      </span>
                                      <span>Add Constraint</span>
                                    </button>
                                  </div>

                                  {/* Constraint Browser Modal */}
                                  {constraintSearch[techName] === 'open' && (
                                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]" onClick={() => setConstraintSearch({ ...constraintSearch, [techName]: '' })}>
                                      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                        <div className="p-4 border-b border-slate-200 bg-gray-600 text-white">
                                          <h3 className="text-lg font-bold">Available Constraints for {formatTechName(techTemplate.parent || '')}</h3>
                                        </div>
                                        <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
                                          {(() => {
                                            const available = PARENT_CONSTRAINTS[techTemplate.parent]?.filter(c => !allConstraints[c]) || [];
                                            
                                            if (available.length === 0) {
                                              return (
                                                <div className="p-8 text-center text-slate-500">
                                                  <p className="text-sm">All available constraints have been added.</p>
                                                </div>
                                              );
                                            }
                                            
                                            const groupedAvailable = {};
                                            available.forEach(constraint => {
                                              const group = CONSTRAINT_DEFINITIONS[constraint]?.group || 'Other';
                                              if (!groupedAvailable[group]) groupedAvailable[group] = [];
                                              groupedAvailable[group].push(constraint);
                                            });
                                            
                                            return Object.entries(groupedAvailable).map(([group, constraints]) => {
                                              if (!constraints || constraints.length === 0) return null;
                                              
                                              const isExpanded = selectedConstraintGroup[`${techName}_${group}`];
                                              
                                              return (
                                                <div key={group} className="border-b border-slate-200 last:border-b-0">
                                                  <button
                                                    onClick={() => setSelectedConstraintGroup({ 
                                                      ...selectedConstraintGroup, 
                                                      [`${techName}_${group}`]: !isExpanded 
                                                    })}
                                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                  >
                                                    <span className="text-sm font-semibold text-gray-900">
                                                      {formatTechName(group)} ({constraints.length})
                                                    </span>
                                                    {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                                                  </button>
                                                  {isExpanded && (
                                                    <div className="divide-y divide-slate-100 bg-white">
                                                      {constraints.map(constraint => {
                                                        const definition = CONSTRAINT_DEFINITIONS[constraint];
                                                        return (
                                                          <button
                                                            key={constraint}
                                                            onClick={() => {
                                                              updateDialogConstraint(techName, constraint, '');
                                                              setConstraintSearch({ ...constraintSearch, [techName]: '' });
                                                            }}
                                                            className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors"
                                                          >
                                                            <div className="font-medium text-slate-800 text-sm mb-1">{formatTechName(constraint)}</div>
                                                            {definition && (
                                                              <div className="text-slate-600 text-xs">
                                                                {definition.desc}
                                                              </div>
                                                            )}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            });
                                          })()}
                                        </div>
                                        <div className="p-4 border-t border-slate-200 bg-slate-50">
                                          <button
                                            onClick={() => {
                                              setConstraintSearch({ ...constraintSearch, [techName]: '' });
                                              setSelectedConstraintGroup({});
                                            }}
                                            className="w-full px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
                                          >
                                            Close
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Costs Section */}
                            <div>
                              <button
                                onClick={() => setExpandedSections({ ...expandedSections, [`${techName}_costs`]: !expandedSections[`${techName}_costs`] })}
                                className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2 hover:text-gray-600"
                              >
                                {expandedSections[`${techName}_costs`] ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                                <span>Costs</span>
                              </button>
                              {expandedSections[`${techName}_costs`] && (
                                <div className="pl-4 space-y-3 bg-white p-3 rounded">
                                  {(() => {
                                    const monetaryCosts = techTemplate.costs?.monetary || {};
                                    const currentCosts = techData?.costs?.monetary || {};
                                    const customCosts = editingCosts[techName] || {};
                                    const allCosts = { ...monetaryCosts, ...currentCosts, ...customCosts };
                                    
                                    if (Object.keys(allCosts).length === 0) {
                                      return <p className="text-slate-500 italic text-xs">No costs defined.</p>;
                                    }
                                    
                                    return (
                                      <div className="space-y-2">
                                        {Object.entries(allCosts).map(([key, value]) => {
                                          const definition = COST_DEFINITIONS[key];
                                          const customValue = editingCosts[techName]?.[key];
                                          const displayValue = customValue !== undefined ? customValue : value;
                                          
                                          return (
                                            <div key={key} className="flex gap-2 items-center text-xs">
                                              <div className="flex items-center gap-1 w-40">
                                                <span className="text-slate-600">{key}:</span>
                                                {definition && (
                                                  <div className="relative group">
                                                    <FiHelpCircle size={14} className="text-slate-400 cursor-help" />
                                                    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-56 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-50">
                                                      {definition.desc}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                              <input
                                                type="number"
                                                step="any"
                                                value={displayValue}
                                                onChange={(e) => updateDialogCost(techName, key, e.target.value)}
                                                className="w-32 px-2 py-1 text-xs border border-slate-300 rounded"
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                  
                                  {/* Add Cost Button */}
                                  <div className="pt-2 border-t border-slate-200">
                                    <button
                                      onClick={() => setCostSearch({ ...costSearch, [techName]: 'open' })}
                                      className="group flex h-9 w-full items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 hover:bg-gray-600 hover:pl-2 hover:text-white text-sm font-medium text-gray-800"
                                    >
                                      <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                                        <FiArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
                                      </span>
                                      <span>Add Cost</span>
                                    </button>
                                  </div>

                                  {/* Cost Browser Modal */}
                                  {costSearch[techName] === 'open' && (
                                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]" onClick={() => setCostSearch({ ...costSearch, [techName]: '' })}>
                                      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                        <div className="p-4 border-b border-slate-200 bg-gray-600 text-white">
                                          <h3 className="text-lg font-bold">Available Costs</h3>
                                        </div>
                                        <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
                                          {(() => {
                                            const monetaryCosts = techTemplate.costs?.monetary || {};
                                            const currentCosts = techData?.costs?.monetary || {};
                                            const customCosts = editingCosts[techName] || {};
                                            const allCosts = { ...monetaryCosts, ...currentCosts, ...customCosts };
                                            const available = Object.keys(COST_DEFINITIONS).filter(c => !allCosts[c]);
                                            
                                            if (available.length === 0) {
                                              return (
                                                <div className="p-8 text-center text-slate-500">
                                                  <p className="text-sm">All available costs have been added.</p>
                                                </div>
                                              );
                                            }
                                            
                                            const groupedAvailable = {};
                                            available.forEach(cost => {
                                              const group = COST_DEFINITIONS[cost]?.group || 'Other';
                                              if (!groupedAvailable[group]) groupedAvailable[group] = [];
                                              groupedAvailable[group].push(cost);
                                            });
                                            
                                            return Object.entries(groupedAvailable).map(([group, costs]) => {
                                              if (!costs || costs.length === 0) return null;
                                              
                                              const isExpanded = selectedCostGroup[`${techName}_${group}`];
                                              
                                              return (
                                                <div key={group} className="border-b border-slate-200 last:border-b-0">
                                                  <button
                                                    onClick={() => setSelectedCostGroup({ 
                                                      ...selectedCostGroup, 
                                                      [`${techName}_${group}`]: !isExpanded 
                                                    })}
                                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                  >
                                                    <span className="text-sm font-semibold text-gray-900">
                                                      {formatTechName(group)} ({costs.length})
                                                    </span>
                                                    {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                                                  </button>
                                                  {isExpanded && (
                                                    <div className="divide-y divide-slate-100 bg-white">
                                                      {costs.map(cost => {
                                                        const definition = COST_DEFINITIONS[cost];
                                                        return (
                                                          <button
                                                            key={cost}
                                                            onClick={() => {
                                                              updateDialogCost(techName, cost, '');
                                                              setCostSearch({ ...costSearch, [techName]: '' });
                                                            }}
                                                            className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors"
                                                          >
                                                            <div className="font-medium text-slate-800 text-sm mb-1">{formatTechName(cost)}</div>
                                                            {definition && (
                                                              <div className="text-slate-600 text-xs">
                                                                {definition.desc}
                                                              </div>
                                                            )}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            });
                                          })()}
                                        </div>
                                        <div className="p-4 border-t border-slate-200 bg-slate-50">
                                          <button
                                            onClick={() => {
                                              setCostSearch({ ...costSearch, [techName]: '' });
                                              setSelectedCostGroup({});
                                            }}
                                            className="w-full px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700"
                                          >
                                            Close
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p>No technologies assigned to this location.</p>
                </div>
              )}
              
              {/* Available Technologies to Add */}
              <div className="border-t border-slate-200 pt-6">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Available Technologies ({Object.keys(techMap).length - dialogTechs.length} available)
                </label>
                <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-3">
                  {Object.keys(techMap).length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      <p>No technologies available.</p>
                      <p className="text-xs mt-2">Load a model or add technologies in the Technologies section.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {['supply', 'supply_plus', 'demand', 'storage', 'conversion', 'conversion_plus'].map(parentType => {
                        const techsInCategory = Object.entries(techMap).filter(([name, tech]) => tech.parent === parentType);
                        
                        if (techsInCategory.length === 0) return null;
                        
                        const isExpanded = expandedSections[`add_${parentType}`];
                        
                        return (
                          <div key={parentType} className="border border-slate-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setExpandedSections({ ...expandedSections, [`add_${parentType}`]: !isExpanded })}
                              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                            >
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                {formatTechName(parentType)} ({techsInCategory.length})
                              </span>
                              {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                            </button>
                            
                            {isExpanded && (
                              <div className="p-2 bg-white">
                                <div className="space-y-1">
                                  {techsInCategory.map(([techName, tech]) => {
                                    const isAssigned = dialogTechs.includes(techName);
                                    return (
                                      <button
                                        key={techName}
                                        onClick={() => !isAssigned && addTechToDialog(techName)}
                                        disabled={isAssigned}
                                        className={`w-full text-left p-2 rounded text-xs transition-colors ${
                                          isAssigned
                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                            : 'bg-slate-50 hover:bg-gray-50 text-slate-700 hover:text-gray-700 border border-slate-200'
                                        }`}
                                        title={tech.description || techName}
                                      >
                                        {isAssigned ? '✓ ' : '+ '}{formatTechName(techName)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end sticky bottom-0 bg-white">
              <button
                onClick={() => setShowEditDialog(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedLocation}
                disabled={!hasLocationChanged()}
                className={`px-4 py-2 rounded-md transition-colors ${
                  hasLocationChanged()
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapDeckGL;
