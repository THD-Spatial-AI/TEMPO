import React, { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from 'leaflet';
import { FiLayers, FiSun, FiWind, FiBattery, FiZap, FiActivity, FiDroplet, FiHome, FiCircle, FiTrash2, FiPlus, FiSearch, FiX, FiMaximize2, FiMinimize2, FiMapPin, FiEdit2, FiCpu, FiChevronDown, FiChevronRight, FiHelpCircle, FiCheck, FiArrowRight, FiSave, FiLink, FiEye } from "react-icons/fi";
import { renderToStaticMarkup } from 'react-dom/server';
import { useData } from "../context/DataContext";
import { TECH_TEMPLATES } from "./TechnologiesData";

// Constraint definitions (complete set)
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

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Get icon for technology type
const getTechIcon = (techName) => {
  const name = techName.toLowerCase();
  if (name.includes('solar') || name.includes('pv')) return { icon: FiSun, color: '#ca8a04' };
  if (name.includes('wind')) return { icon: FiWind, color: '#2563eb' };
  if (name.includes('battery') || name.includes('storage')) return { icon: FiBattery, color: '#9333ea' };
  if (name.includes('gas') || name.includes('ccgt')) return { icon: FiZap, color: '#ea580c' };
  if (name.includes('coal')) return { icon: FiActivity, color: '#374151' };
  if (name.includes('biomass')) return { icon: FiDroplet, color: '#16a34a' };
  if (name.includes('demand')) return { icon: FiHome, color: '#dc2626' };
  if (name.includes('transmission')) return { icon: FiZap, color: '#4f46e5' };
  return { icon: FiCircle, color: '#64748b' };
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
      return techColor;
    }
  }
  
  // Return hex color if available
  if (colorHex && colorHex.startsWith('#')) {
    return colorHex;
  }
  
  // Fall back to name-based matching
  const name = techName.toLowerCase();
  if (name.includes('wind')) return '#4caf50';
  if (name.includes('solar') || name.includes('pv')) return '#ffeb3b';
  if (name.includes('hydro')) return '#2196f3';
  if (name.includes('coal')) return '#60390d';
  if (name.includes('gas') || name.includes('ccgt')) return '#ff9800';
  if (name.includes('nuclear')) return '#9c27b0';
  if (name.includes('oil') || name.includes('diesel')) return '#424242';
  if (name.includes('battery') || name.includes('storage')) return '#a855f7';
  if (name.includes('demand')) return '#f44336';
  
  return '#9e9e9e'; // Gray for generic
};

// Function to create pie chart paths for SVG
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
  const centerX = 12;
  const centerY = 12;
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
    
    const color = getTechColor(techName, techMap);
    
    paths.push({
      path: pathData,
      color: color
    });
  });
  
  return paths;
};

// Create custom icon from React component
const createIconFromReactComponent = (IconComponent, color, size = 24) => {
  const iconMarkup = renderToStaticMarkup(
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: `2px solid ${color}`,
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }}>
      <IconComponent style={{ color, fontSize: `${size * 0.6}px` }} />
    </div>
  );

  return L.divIcon({
    html: iconMarkup,
    className: 'custom-tech-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Format technology name
const formatTechName = (techName) => {
  return techName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Create center location marker with pie chart support
const createCenterMarker = (location, techCount, techMap) => {
  // Handle substations (nodes) - show as triangles
  if (location.isNode) {
    const techs = location.techs || {};
    const hasDemand = location.hasDemand || 
                      location.demandProfile || 
                      location.totalDemandMWh || 
                      Object.keys(techs).some(t => t.toLowerCase().includes('demand'));
    const color = hasDemand ? '#f44336' : '#212121'; // Red if demand, black if not
    
    const iconMarkup = renderToStaticMarkup(
      <div style={{
        width: '32px',
        height: '32px',
        position: 'relative'
      }}>
        <svg viewBox="0 0 24 24" width="32" height="32" style={{
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
        }}
        shapeRendering="geometricPrecision">
          <path d="M12 4 L20 18 L4 18 Z" fill={color} stroke="#000000" strokeWidth="1.5"/>
        </svg>
      </div>
    );

    return L.divIcon({
      html: iconMarkup,
      className: 'custom-center-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
  
  const techs = location.techs || {};
  const piePaths = createPieChartPaths(techs, techMap);
  
  // If single technology or no technologies, use solid color
  if (!piePaths) {
    const techNames = Object.keys(techs);
    const color = techNames.length > 0 ? getTechColor(techNames[0], techMap) : '#6366f1';
    
    const iconMarkup = renderToStaticMarkup(
      <div style={{
        width: '32px',
        height: '32px',
        position: 'relative'
      }}>
        <svg viewBox="0 0 24 24" width="32" height="32" style={{
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
        }}
        shapeRendering="geometricPrecision">
          <circle cx="12" cy="12" r="10" fill={color} stroke="#000000" strokeWidth="2"/>
        </svg>
      </div>
    );

    return L.divIcon({
      html: iconMarkup,
      className: 'custom-center-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
  
  // Multiple technologies - create pie chart
  const pathsStr = piePaths.map(p => `<path d="${p.path}" fill="${p.color}"/>`).join('');
  
  const iconMarkup = renderToStaticMarkup(
    <div style={{
      width: '32px',
      height: '32px',
      position: 'relative'
    }}>
      <svg viewBox="0 0 24 24" width="32" height="32" style={{
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
      }}
      shapeRendering="geometricPrecision"
      dangerouslySetInnerHTML={{
        __html: `
          <circle cx="12" cy="12" r="11" fill="white" stroke="white" stroke-width="1"/>
          ${pathsStr}
          <circle cx="12" cy="12" r="10" fill="none" stroke="#000000" stroke-width="2"/>
        `
      }}
      />
    </div>
  );

  return L.divIcon({
    html: iconMarkup,
    className: 'custom-center-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const MAP_LAYERS = {
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  streets: {
    name: "Streets",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
  },
  blackWhite: {
    name: "Black & White",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  },
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
  },
  terrain: {
    name: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, SRTM | Style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>',
  },
};

// High-performance Canvas Marker Layer using Leaflet Canvas renderer
const CanvasMarkerLayer = ({ locations, onMarkerClick, createMarkerIcon }) => {
  const map = useMap();
  const markersRef = useRef([]);
  
  useEffect(() => {
    if (!map || locations.length === 0) return;
    
    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];
    
    // Create canvas renderer for better performance
    const canvasRenderer = L.canvas({ padding: 0.5 });
    
    // Add markers with canvas renderer
    locations.forEach((location, index) => {
      const techs = location.techs || {};
      const techCount = Object.keys(techs).length;
      
      const marker = L.marker([location.latitude, location.longitude], {
        icon: createMarkerIcon(location, techCount),
        renderer: canvasRenderer
      }).addTo(map);
      
      // Create popup content
      const popupContent = `
        <div style="font-size: 12px; min-width: 200px;">
          <strong style="font-size: 14px;">${location.name}</strong>
          ${location.isNode ? '<p style="font-size: 10px; color: #666; margin: 4px 0;">Type: Node</p>' : ''}
          <p style="font-size: 10px; color: #666; margin: 4px 0;">Technologies: ${techCount}</p>
          <button 
            onclick="window.editLocation(${index})" 
            style="margin-top: 8px; width: 100%; padding: 6px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;"
          >
            Edit Location
          </button>
        </div>
      `;
      
      marker.bindPopup(popupContent, {
        offset: [0, -20],
        maxWidth: 300
      });
      
      marker.on('click', () => {
        if (onMarkerClick) {
          onMarkerClick(location, index);
        }
      });
      
      markersRef.current.push(marker);
    });
    
    return () => {
      markersRef.current.forEach(marker => map.removeLayer(marker));
      markersRef.current = [];
    };
  }, [map, locations, createMarkerIcon, onMarkerClick]);
  
  return null;
};

// Canvas-based link renderer for high performance with thousands of links
const CanvasLinkLayer = ({ links, locations }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!map || links.length === 0) return;
    
    const canvasLayer = L.canvas({ padding: 0.5 });
    const linkLines = [];
    
    links.forEach((link) => {
      const fromLoc = locations.find(loc => loc.name === link.from);
      const toLoc = locations.find(loc => loc.name === link.to);
      
      if (fromLoc && toLoc) {
        const line = L.polyline(
          [
            [fromLoc.latitude, fromLoc.longitude],
            [toLoc.latitude, toLoc.longitude]
          ],
          {
            color: '#4f46e5',
            weight: 2,
            opacity: 0.6,
            renderer: canvasLayer
          }
        ).addTo(map);
        
        // Add popup with link info
        line.bindPopup(`
          <div style="font-size: 12px;">
            <strong>${link.from} → ${link.to}</strong>
            ${link.capacity ? `<p>Capacity: ${link.capacity}</p>` : ''}
            ${link.distance ? `<p>Distance: ${link.distance}</p>` : ''}
            ${link.tech ? `<p>Tech: ${link.tech}</p>` : ''}
          </div>
        `);
        
        linkLines.push(line);
      }
    });
    
    return () => {
      linkLines.forEach(line => map.removeLayer(line));
    };
  }, [map, links, locations]);
  
  return null;
};

const LayerSelector = ({ currentLayer, onLayerChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative bg-white rounded-lg shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 hover:bg-gray-50 transition-colors flex items-center gap-2 rounded-lg"
      >
        <FiLayers className="text-lg text-gray-700" />
        <span className="text-sm font-medium text-gray-700">{MAP_LAYERS[currentLayer].name}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[160px]">
          {Object.entries(MAP_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              onClick={() => {
                onLayerChange(key);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors ${
                currentLayer === key ? "bg-gray-100 text-gray-800 font-medium" : "text-gray-700"
              }`}
            >
              {layer.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SearchBar = ({ locations, onLocationSelect }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredLocations = locations.filter(loc =>
    loc.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (location) => {
    onLocationSelect(location);
    setSearchQuery("");
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="bg-white rounded-lg shadow-lg flex items-center px-3 py-2">
        <FiSearch className="text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Search locations..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(e.target.value.length > 0);
          }}
          onFocus={() => setIsOpen(searchQuery.length > 0)}
          className="outline-none text-sm w-64 text-gray-700 placeholder-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setIsOpen(false);
            }}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <FiX size={16} />
          </button>
        )}
      </div>

      {isOpen && filteredLocations.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto z-[1000]">
          {filteredLocations.map((location, index) => {
            const techCount = location.techs ? Object.keys(location.techs).length : 0;
            return (
              <button
                key={index}
                onClick={() => handleSelect(location)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FiMapPin className="text-gray-600" size={16} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{location.name || `Location ${index + 1}`}</p>
                      <p className="text-xs text-gray-500">
                        {location.latitude?.toFixed(4)}, {location.longitude?.toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    {techCount} tech{techCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MapControls = ({ currentLayer, onLayerChange, locations, onLocationSelect, onZoomIn, onZoomOut, onFitBounds }) => {
  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex items-center gap-3">
      <SearchBar locations={locations} onLocationSelect={onLocationSelect} />
      <LayerSelector currentLayer={currentLayer} onLayerChange={onLayerChange} />
      
      <div className="bg-white rounded-lg shadow-lg flex gap-1 p-1">
        <button
          onClick={onZoomIn}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Zoom In"
        >
          <FiMaximize2 className="text-gray-700" size={18} />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Zoom Out"
        >
          <FiMinimize2 className="text-gray-700" size={18} />
        </button>
        <button
          onClick={onFitBounds}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          title="Fit All Locations"
        >
          <FiMapPin className="text-gray-700" size={18} />
        </button>
      </div>
    </div>
  );
};

const Map = ({ center = [51.505, -0.09], zoom = 13 }) => {
  const [currentLayer, setCurrentLayer] = useState("satellite");
  const { locations, setLocations, links, technologies, showNotification, timeSeries, setTimeSeries } = useData();
  const [mapCenter, setMapCenter] = useState(center);
  const [mapZoom, setMapZoom] = useState(zoom);
  const [mapKey, setMapKey] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const mapRef = useRef(null);
  
  // Collapsible section states
  const [showLocationsSection, setShowLocationsSection] = useState(true);
  const [showLinksSection, setShowLinksSection] = useState(true);
  const [showTimeSeriesSection, setShowTimeSeriesSection] = useState(true);
  
  // Edit dialog states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editingLocationIndex, setEditingLocationIndex] = useState(null);
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
  const [selectedForDrag, setSelectedForDrag] = useState(null);
  const selectedForDragRef = useRef(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Mode and creation states
  const [mode, setMode] = useState('view'); // 'view', 'add-location', 'add-link'
  const [linkStart, setLinkStart] = useState(null);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [isNode, setIsNode] = useState(false);
  const [openPopupLocationId, setOpenPopupLocationId] = useState(null);
  
  // Viewport filtering for performance
  const [mapBounds, setMapBounds] = useState(null);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  
  // Create technology map from context
  const techMap = useMemo(() => {
    const map = {};
    
    // Add model-specific technologies
    if (Array.isArray(technologies) && technologies.length > 0) {
      technologies.forEach(tech => {
        map[tech.name] = tech;
      });
    }
    
    return map;
  }, [technologies]);
  
  // Expose edit location function globally for canvas popups
  useEffect(() => {
    window.editLocation = (index) => {
      const location = locations[index];
      if (location) {
        handleEditLocation(location, index);
      }
    };
    return () => {
      delete window.editLocation;
    };
  }, [locations]);
  
  // Smart filtering based on zoom level for performance
  const visibleLocations = useMemo(() => {
    if (!mapBounds) return locations.slice(0, 500); // Initial load limit
    
    // At low zoom (< 8), show only major locations (sample)
    if (currentZoom < 8) {
      return locations.filter((loc, idx) => idx % 10 === 0).slice(0, 100);
    }
    
    // At medium zoom (8-12), show locations in viewport with sampling
    if (currentZoom < 12) {
      const inBounds = locations.filter(loc => 
        mapBounds.contains([loc.latitude, loc.longitude])
      );
      // Sample every 3rd location for performance
      return inBounds.filter((_, idx) => idx % 3 === 0);
    }
    
    // At high zoom (>= 12), show all in viewport
    return locations.filter(loc => 
      mapBounds.contains([loc.latitude, loc.longitude])
    );
  }, [locations, mapBounds, currentZoom]);

  useEffect(() => {
    if (locations.length > 0) {
      // Calculate center from locations
      const avgLat = locations.reduce((sum, loc) => sum + (loc.latitude || 0), 0) / locations.length;
      const avgLon = locations.reduce((sum, loc) => sum + (loc.longitude || 0), 0) / locations.length;
      setMapCenter([avgLat, avgLon]);
      setMapZoom(6);
    }
  }, [locations]);

  // Component to handle map zoom and controls
  const MapZoomHandler = ({ targetLocation }) => {
    const map = useMap();
    
    useEffect(() => {
      if (targetLocation) {
        map.flyTo([targetLocation.latitude, targetLocation.longitude], 12, {
          duration: 1.5
        });
      }
    }, [targetLocation, map]);

    // Store map reference
    useEffect(() => {
      mapRef.current = map;
    }, [map]);

    return null;
  };

  // Map control functions
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  const handleFitBounds = () => {
    if (mapRef.current && locations.length > 0) {
      const bounds = locations.map(loc => [loc.latitude, loc.longitude]);
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };
  
  // Map click handler for creating new locations
  const MapClickHandler = () => {
    const map = useMap();
    
    useMapEvents({
      click: (e) => {
        if (mode === 'add-location' && !openPopupLocationId) {
          const newLocation = {
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
            name: `Location ${locations.length + 1}`,
            techs: {},
            isNode: false
          };
          setPendingLocation(newLocation);
          setOriginalLocationData(null);
          setIsNode(false);
          setDialogTechs([]);
          setEditingConstraints({});
          setEditingEssentials({});
          setEditingCosts({});
          setShowLocationDialog(true);
        }
      },
      moveend: () => {
        setMapBounds(map.getBounds());
        setCurrentZoom(map.getZoom());
      },
      zoomend: () => {
        setMapBounds(map.getBounds());
        setCurrentZoom(map.getZoom());
      }
    });
    
    return null;
  };
  
  // Handle link creation
  const handleLocationClickForLink = (location) => {
    if (mode === 'add-link') {
      if (!linkStart) {
        setLinkStart(location);
        showNotification(`Link start: ${location.name}. Click another location to complete.`, 'info');
      } else {
        if (linkStart.name !== location.name) {
          // Calculate distance
          const R = 6371; // Earth's radius in km
          const lat1 = linkStart.latitude * Math.PI / 180;
          const lat2 = location.latitude * Math.PI / 180;
          const dLat = (location.latitude - linkStart.latitude) * Math.PI / 180;
          const dLon = (location.longitude - linkStart.longitude) * Math.PI / 180;
          
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                   Math.cos(lat1) * Math.cos(lat2) *
                   Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = Math.round(R * c * 10) / 10;
          
          // Add link to existing links
          const newLink = {
            from: linkStart.name,
            to: location.name,
            distance: distance,
            techs: {}
          };
          
          setLinks([...links, newLink]);
          showNotification(`Link created: ${linkStart.name} → ${location.name}`, 'success');
          setLinkStart(null);
        } else {
          showNotification('Cannot link a location to itself', 'warning');
        }
      }
    }
  };
  
  // Confirm location creation
  const confirmLocationCreation = () => {
    if (!pendingLocation) return;
    
    const locationToAdd = {
      ...pendingLocation,
      isNode,
      techs: {}
    };
    
    // Add technologies from dialog
    dialogTechs.forEach(techName => {
      const techTemplate = techMap[techName];
      if (techTemplate) {
        locationToAdd.techs[techName] = {
          parent: techTemplate.parent,
          essentials: {
            ...(techTemplate.essentials || {}),
            ...(editingEssentials[techName] || {})
          },
          constraints: {
            ...(techTemplate.constraints || {}),
            ...(editingConstraints[techName] || {})
          },
          costs: {
            monetary: {
              ...(techTemplate.costs?.monetary || {}),
              ...(editingCosts[techName] || {})
            }
          }
        };
      }
    });
    
    setLocations([...locations, locationToAdd]);
    showNotification(`Location "${locationToAdd.name}" created`, 'success');
    setShowLocationDialog(false);
    setPendingLocation(null);
    setDialogTechs([]);
    setEditingConstraints({});
    setEditingEssentials({});
    setEditingCosts({});
  };

  // Delete technology from location
  const deleteTechnology = (locationIndex, techName) => {
    if (window.confirm(`Remove ${techName} from ${locations[locationIndex].name}?`)) {
      const updatedLocations = [...locations];
      delete updatedLocations[locationIndex].techs[techName];
      setLocations(updatedLocations);
    }
  };

  // Add technology to location
  const addTechnologyToLocation = (locationIndex, techName) => {
    const updatedLocations = [...locations];
    if (!updatedLocations[locationIndex].techs) {
      updatedLocations[locationIndex].techs = {};
    }
    
    // Get technology template if it exists
    const techTemplate = technologies[techName];
    
    updatedLocations[locationIndex].techs[techName] = {
      parent: techTemplate?.parent || 'unknown',
      constraints: techTemplate?.constraints || {},
      costs: techTemplate?.costs || {}
    };
    
    setLocations(updatedLocations);
  };

  // Calculate positions for technology icons around a center point
  const getTechIconPositions = (centerLat, centerLon, techs) => {
    const techArray = Object.entries(techs);
    const radius = 0.05; // Distance from center in degrees
    const positions = [];

    techArray.forEach(([techName, techData], index) => {
      const angle = (2 * Math.PI * index) / techArray.length;
      const lat = centerLat + radius * Math.cos(angle);
      const lon = centerLon + radius * Math.sin(angle);
      
      positions.push({
        techName,
        techData,
        position: [lat, lon],
        ...getTechIcon(techName)
      });
    });

    return positions;
  };

  // Tech constraint management
  const toggleTechConstraints = (techName) => {
    setExpandedTechConstraints(prev => ({
      ...prev,
      [techName]: !prev[techName]
    }));
  };

  // Update dialog constraint
  const updateDialogConstraint = (techName, constraintKey, value) => {
    setEditingConstraints(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [constraintKey]: value
      }
    }));
  };

  // Update dialog essential
  const updateDialogEssential = (techName, key, value) => {
    setEditingEssentials(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [key]: value
      }
    }));
  };

  // Update dialog cost
  const updateDialogCost = (techName, key, value) => {
    setEditingCosts(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [key]: value
      }
    }));
  };

  // Handle tech CSV upload
  const handleTechCsvUpload = (techName, file) => {
    if (file && file.name.endsWith('.csv')) {
      setTechCsvFiles(prev => ({
        ...prev,
        [techName]: file
      }));
    }
  };

  // Handle constraint CSV upload
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

  // Edit location handler - opens dialog
  const handleEditLocation = (location, locationIndex) => {
    setEditingLocation({ ...location });
    setEditingLocationIndex(locationIndex);
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

  // Add technology to dialog list
  const addTechToDialog = (techName) => {
    if (!dialogTechs.includes(techName)) {
      setDialogTechs([...dialogTechs, techName]);
      // Initialize with template data
      const techTemplate = techMap[techName];
      if (techTemplate) {
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

  // Remove technology from dialog list
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

  // Toggle category expansion
  const toggleCategory = (categoryId) => {
    setExpandedCategories({
      ...expandedCategories,
      [categoryId]: !expandedCategories[categoryId]
    });
  };

  // Check if location has been modified
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

  // Save edited location
  const saveEditedLocation = async () => {
    if (!editingLocation || editingLocationIndex === null) return;

    try {
      // Process any CSV files
      const allNewTimeSeries = [];
      const Papa = (await import('papaparse')).default;
      
      // Process constraint CSV files
      for (const [fileKey, file] of Object.entries(constraintCsvFiles)) {
        if (file) {
          const parts = fileKey.split('_');
          const constraintKey = parts[parts.length - 1];
          const techName = parts.slice(0, -1).join('_');
          
          await new Promise((resolve) => {
            Papa.parse(file, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: (results) => {
                allNewTimeSeries.push({
                  id: `${Date.now()}_${editingLocation.name}_${techName}_${constraintKey}_${Math.random()}`,
                  name: file.name,
                  fileName: file.name,
                  uploadedAt: new Date().toISOString(),
                  data: results.data,
                  columns: results.meta.fields || [],
                  rowCount: results.data.length,
                  location: editingLocation.name,
                  technology: techName,
                  constraintType: constraintKey,
                  type: 'constraint'
                });
                resolve();
              }
            });
          });
        }
      }

      // Process tech CSV files (prod/cons)
      for (const [techName, file] of Object.entries(techCsvFiles)) {
        if (file) {
          await new Promise((resolve) => {
            Papa.parse(file, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: (results) => {
                allNewTimeSeries.push({
                  id: `${Date.now()}_${editingLocation.name}_${techName}_${Math.random()}`,
                  name: file.name,
                  fileName: file.name,
                  uploadedAt: new Date().toISOString(),
                  data: results.data,
                  columns: results.meta.fields || [],
                  rowCount: results.data.length,
                  location: editingLocation.name,
                  technology: techName,
                  type: 'production/consumption'
                });
                resolve();
              }
            });
          });
        }
      }

      // Add new timeseries
      if (allNewTimeSeries.length > 0) {
        setTimeSeries([...timeSeries, ...allNewTimeSeries]);
      }

      // Apply edits to location techs
      const updatedLocation = { ...editingLocation };
      Object.keys(updatedLocation.techs).forEach(techName => {
        // Apply constraints
        if (editingConstraints[techName]) {
          updatedLocation.techs[techName].constraints = {
            ...updatedLocation.techs[techName].constraints,
            ...editingConstraints[techName]
          };
        }
        // Apply essentials
        if (editingEssentials[techName]) {
          updatedLocation.techs[techName].essentials = {
            ...updatedLocation.techs[techName].essentials,
            ...editingEssentials[techName]
          };
        }
        // Apply costs
        if (editingCosts[techName]) {
          updatedLocation.techs[techName].costs = {
            monetary: {
              ...(updatedLocation.techs[techName].costs?.monetary || {}),
              ...editingCosts[techName]
            }
          };
        }
      });

      // Update location in global state
      const updatedLocations = [...locations];
      updatedLocations[editingLocationIndex] = updatedLocation;
      setLocations(updatedLocations);
      
      // Close dialog and clean up states
      setShowEditDialog(false);
      setEditingLocation(null);
      setEditingLocationIndex(null);
      setOriginalLocationData(null);
      setDialogTechs([]);
      setEditingConstraints({});
      setEditingEssentials({});
      setEditingCosts({});
      setExpandedTechConstraints({});
      setTechCsvFiles({});
      setConstraintCsvFiles({});
      setConstraintSearch({});
      setCostSearch({});
      
      if (showNotification) {
        showNotification(`Location "${updatedLocation.name}" updated successfully`, 'success');
      }
    } catch (error) {
      console.error('Error saving location:', error);
      if (showNotification) {
        showNotification('Error saving location', 'error');
      }
    }
  };

  return (
    <div className="flex-1 h-screen overflow-hidden flex">
      {/* Left Panel - Tools */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Map View</h2>
          <p className="text-sm text-slate-600">View and edit your energy system</p>
        </div>

        {/* Mode Selection */}
        <div className="p-4 border-b border-slate-200">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Mode</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { setMode('view'); setLinkStart(null); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                mode === 'view'
                  ? 'border-gray-500 bg-gray-50 text-gray-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <FiEye className="mx-auto mb-1" size={20} />
              <div className="text-xs font-medium">View</div>
            </button>
            <button
              onClick={() => { setMode('add-location'); setLinkStart(null); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                mode === 'add-location'
                  ? 'border-gray-500 bg-gray-50 text-gray-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <FiMapPin className="mx-auto mb-1" size={20} />
              <div className="text-xs font-medium">Add Location</div>
            </button>
            <button
              onClick={() => { setMode('add-link'); setLinkStart(null); }}
              className={`p-3 rounded-lg border-2 transition-all ${
                mode === 'add-link'
                  ? 'border-gray-500 bg-gray-50 text-gray-700'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <FiLink className="mx-auto mb-1" size={20} />
              <div className="text-xs font-medium">Link</div>
            </button>
          </div>

          {mode === 'view' && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-700">
              View locations and drag to reposition
            </div>
          )}
          {mode === 'add-location' && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-700">
              Click on the map to add a new location
            </div>
          )}
          {mode === 'add-link' && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-700">
              {linkStart ? `Click on another location to complete the link from ${linkStart.name}` : 'Click on a location to start a link'}
            </div>
          )}
        </div>

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
              <div className="space-y-2">
                {locations.map((location, index) => {
                  const techs = location.techs || {};
                  const techCount = Object.keys(techs).length;
                  
                  return (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-slate-200 bg-white hover:border-gray-300 transition-colors cursor-pointer"
                      onClick={() => handleLocationSelect(location)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-slate-800">{location.name}</div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditLocation(location, index);
                            }}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            <FiEdit2 size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLocation(index);
                            }}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-slate-600">
                        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                      </div>
                      {techCount > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
                          <FiCpu size={12} />
                          <span>{techCount} {techCount === 1 ? 'technology' : 'technologies'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  <div className="space-y-2">
                    {links.map((link, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg border border-slate-200 bg-white"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex-1 text-sm">
                            <div className="font-medium text-slate-800">{link.from}</div>
                            <div className="text-slate-400">↓</div>
                            <div className="font-medium text-slate-800">{link.to}</div>
                          </div>
                          <button
                            onClick={() => {
                              const newLinks = links.filter((_, i) => i !== index);
                              setLocations(locations); // Trigger update
                              showNotification('Link deleted', 'success');
                            }}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </div>
                        <div className="text-xs text-slate-600">
                          Distance: {link.distance} km
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </div>
            )}

            {/* Timeseries Section */}
            {timeSeries && timeSeries.length > 0 && (
              <div className="border-b border-slate-200">
                <button
                  onClick={() => setShowTimeSeriesSection(!showTimeSeriesSection)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FiActivity size={16} className="text-slate-700" />
                    <span className="text-sm font-semibold text-slate-700">Timeseries ({timeSeries.length})</span>
                  </div>
                  {showTimeSeriesSection ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                </button>
                
                {showTimeSeriesSection && (
                <div className="p-4 bg-slate-50">
                  <div className="space-y-3">
                    {timeSeries.map((ts, index) => {
                      // Prepare data for mini chart
                      const chartData = ts.data && ts.column ? 
                        ts.data.slice(0, 100).map(row => parseFloat(row[ts.column]) || 0) : 
                        [];
                      const maxVal = chartData.length > 0 ? Math.max(...chartData.map(Math.abs)) : 1;
                      
                      return (
                      <div
                        key={ts.id || index}
                        className="p-3 rounded-lg border border-slate-200 bg-white hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FiActivity size={14} className={`${
                              ts.type === 'demand' ? 'text-orange-600' :
                              ts.type?.includes('resource') ? 'text-green-600' :
                              'text-blue-600'
                            }`} />
                            <span className="font-medium text-sm text-slate-800">{ts.name || ts.fileName}</span>
                          </div>
                          <button
                            onClick={() => {
                              const newTimeSeries = timeSeries.filter((_, i) => i !== index);
                              setTimeSeries(newTimeSeries);
                              showNotification('Timeseries deleted', 'success');
                            }}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                        
                        {/* Mini sparkline chart */}
                        {chartData.length > 0 && (
                          <div className="mb-2 h-12 flex items-end gap-px">
                            {chartData.map((val, i) => {
                              const height = maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
                              return (
                                <div
                                  key={i}
                                  className={`flex-1 rounded-t ${
                                    ts.type === 'demand' ? 'bg-orange-400' :
                                    ts.type?.includes('resource') ? 'bg-green-400' :
                                    'bg-blue-400'
                                  } opacity-70`}
                                  style={{ height: `${height}%`, minHeight: '2px' }}
                                />
                              );
                            })}
                          </div>
                        )}
                        
                        <div className="space-y-1 text-xs text-slate-600">
                          <div className="flex justify-between">
                            <span>Location:</span>
                            <span className="font-medium text-slate-800">{ts.location}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Technology:</span>
                            <span className="font-medium text-slate-800">{ts.tech}</span>
                          </div>
                          {ts.constraint && (
                            <div className="flex justify-between">
                              <span>Constraint:</span>
                              <span className="font-medium text-slate-800">{ts.constraint}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Type:</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              ts.type === 'demand' ? 'bg-orange-100 text-orange-800' :
                              ts.type?.includes('resource') ? 'bg-green-100 text-green-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {ts.type || 'CSV'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Data points:</span>
                            <span className="font-medium text-slate-800">{ts.rowCount || ts.data?.length || 0}</span>
                          </div>
                          
                          {/* Statistics */}
                          {ts.statistics && (
                            <div className="mt-2 pt-2 border-t border-slate-200">
                              <div className="font-semibold text-slate-700 mb-1">Statistics:</div>
                              {ts.statistics.totalMWh && (
                                <div className="flex justify-between">
                                  <span>Total Energy:</span>
                                  <span className="font-medium text-slate-800">{ts.statistics.totalMWh} MWh ({ts.statistics.totalGWh} GWh)</span>
                                </div>
                              )}
                              {ts.statistics.avgMW && (
                                <>
                                  <div className="flex justify-between">
                                    <span>Average:</span>
                                    <span className="font-medium text-slate-800">{ts.statistics.avgMW} MW</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Max:</span>
                                    <span className="font-medium text-slate-800">{ts.statistics.maxMW} MW</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Min:</span>
                                    <span className="font-medium text-slate-800">{ts.statistics.minMW} MW</span>
                                  </div>
                                </>
                              )}
                              {ts.statistics.avgCapacityFactor && (
                                <>
                                  <div className="flex justify-between">
                                    <span>Avg Capacity Factor:</span>
                                    <span className="font-medium text-slate-800">{(parseFloat(ts.statistics.avgCapacityFactor) * 100).toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Max Capacity Factor:</span>
                                    <span className="font-medium text-slate-800">{(parseFloat(ts.statistics.maxCapacityFactor) * 100).toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Min Capacity Factor:</span>
                                    <span className="font-medium text-slate-800">{(parseFloat(ts.statistics.minCapacityFactor) * 100).toFixed(1)}%</span>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
                )}
              </div>
            )}
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
      
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="w-full h-full"
        zoomControl={false}
        key={mapKey}
      >
        <MapZoomHandler targetLocation={selectedLocation} />
        <MapClickHandler />
        <TileLayer
          key={currentLayer}
          url={MAP_LAYERS[currentLayer].url}
          attribution={MAP_LAYERS[currentLayer].attribution}
          maxZoom={19}
        />

        {/* High-Performance Canvas Marker Rendering */}
        <CanvasMarkerLayer 
          locations={locations}
          createMarkerIcon={(loc, techCount) => createCenterMarker(loc, techCount, techMap)}
          onMarkerClick={(location, index) => {
            if (mode === 'add-link') {
              handleLocationClickForLink(location);
            } else {
              setSelectedForDrag(location);
              selectedForDragRef.current = index;
            }
          }}
        />

        {/* Show location count indicator */}
        <div className="leaflet-bottom leaflet-left" style={{ pointerEvents: 'none' }}>
          <div className="bg-white px-3 py-2 rounded shadow-lg text-xs text-slate-600 m-4">
            Showing {locations.length} locations (Canvas Rendering)
          </div>
        </div>

        {/* OSM usage advisory — required by OpenStreetMap tile usage policy */}
        {/* https://operations.osmfoundation.org/policies/tiles/            */}
        <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: 'auto' }}>
          <div className="bg-white bg-opacity-90 px-2 py-1 rounded-tl shadow text-[10px] text-slate-500 flex items-center gap-1" style={{ maxWidth: 280 }}>
            <span>Map data</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
              onClick={e => e.stopPropagation()}
            >
              © OpenStreetMap contributors
            </a>
            <span>·</span>
            <a
              href="https://operations.osmfoundation.org/policies/nominatim/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              Usage policy
            </a>
          </div>
        </div>

        {/* Render Links with Canvas for Performance */}
        <CanvasLinkLayer links={links} locations={locations} />
      </MapContainer>
      
      <MapControls
        currentLayer={currentLayer}
        onLayerChange={setCurrentLayer}
        locations={locations}
        onLocationSelect={handleLocationSelect}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitBounds={handleFitBounds}
      />

      {/* Edit Location Dialog */}
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
                    const allConstraints = { ...(techTemplate.constraints || {}), ...(techData.constraints || {}), ...customConstraints };
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

                        {/* Demand Value or CSV Upload - Mandatory for demand technologies */}
                        {techTemplate?.parent === 'demand' ? (
                          <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
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
                        ) : (
                          /* CSV Upload for Production/Consumption - Optional for non-demand */
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
                                    const displayValue = customValue !== undefined ? customValue : (techData.essentials?.[key] !== undefined ? techData.essentials[key] : value);
                                    
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
                                            
                                            {isResourceConstraint && (
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
                                    const currentCosts = techData.costs?.monetary || {};
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
                                            const currentCosts = techData.costs?.monetary || {};
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
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <FiSave size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Creation Dialog */}
      {showLocationDialog && pendingLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 sticky top-0 bg-white">
              <h3 className="text-xl font-bold text-slate-800">
                Configure New Location
              </h3>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm text-slate-600">📍</span>
                <input
                  type="number"
                  step="0.0001"
                  value={pendingLocation.latitude}
                  onChange={(e) => setPendingLocation({ ...pendingLocation, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-32 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Latitude"
                />
                <span className="text-xs text-slate-400">,</span>
                <input
                  type="number"
                  step="0.0001"
                  value={pendingLocation.longitude}
                  onChange={(e) => setPendingLocation({ ...pendingLocation, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-32 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Longitude"
                />
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Location Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Location Name</label>
                <input
                  type="text"
                  value={pendingLocation.name}
                  onChange={(e) => setPendingLocation({ ...pendingLocation, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Enter location name"
                />
              </div>

              {/* Node Option */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                <input
                  type="checkbox"
                  id="isNode"
                  checked={isNode}
                  onChange={(e) => setIsNode(e.target.checked)}
                  className="w-4 h-4 text-gray-600 border-slate-300 rounded focus:ring-gray-500"
                />
                <label htmlFor="isNode" className="text-sm font-medium text-slate-700">
                  This is a node (connection point without technologies)
                </label>
              </div>

              {/* Technologies Selection */}
              {!isNode && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Technologies ({dialogTechs.length} selected)
                    </label>
                  </div>
                  
                  {/* Selected Technologies - Simplified for Map View */}
                  {dialogTechs.length > 0 && (
                    <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      {dialogTechs.map(techName => (
                        <div key={techName} className="bg-white rounded-lg p-3 border border-gray-300">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{formatTechName(techName)}</span>
                            <button
                              onClick={() => setDialogTechs(dialogTechs.filter(t => t !== techName))}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Available Technologies */}
                  <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-600 mb-3">
                      Available Technologies ({Object.keys(techMap).length})
                    </p>
                    {Object.keys(techMap).length === 0 ? (
                      <div className="text-center py-8 text-slate-500 text-sm">
                        <p>No technologies available.</p>
                        <p className="text-xs mt-2">Load a model or add technologies in the Technologies section.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Group technologies by parent type */}
                        {['supply', 'supply_plus', 'demand', 'storage', 'conversion', 'conversion_plus'].map(parentType => {
                          const techsInCategory = Object.entries(techMap).filter(([name, tech]) => tech.parent === parentType);
                          
                          if (techsInCategory.length === 0) return null;
                          
                          const isExpanded = expandedCategories[`dialog_${parentType}`];
                          
                          return (
                            <div key={parentType} className="border border-slate-200 rounded-lg overflow-hidden">
                              <button
                                onClick={() => toggleCategory(`dialog_${parentType}`)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                              >
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  {formatTechName(parentType)} ({techsInCategory.length})
                                </span>
                                {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                              </button>
                              
                              {isExpanded && (
                                <div className="p-2 bg-white">
                                  <div className="grid grid-cols-2 gap-2">
                                    {techsInCategory.map(([techName, tech]) => {
                                      const isSelected = dialogTechs.includes(techName);
                                      return (
                                        <button
                                          key={techName}
                                          onClick={() => !isSelected && setDialogTechs([...dialogTechs, techName])}
                                          disabled={isSelected}
                                          className={`p-2 rounded text-xs text-left transition-colors ${
                                            isSelected
                                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                              : 'bg-slate-50 hover:bg-gray-50 text-slate-700 hover:text-gray-700 border border-slate-200'
                                          }`}
                                          title={tech.description || techName}
                                        >
                                          {isSelected ? '✓ ' : '+ '}{formatTechName(techName)}
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
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setShowLocationDialog(false);
                  setPendingLocation(null);
                  setDialogTechs([]);
                  setIsNode(false);
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLocationCreation}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FiCheck size={16} />
                Create Location
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Map;
