import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FiMapPin, FiLink, FiCpu, FiTrash2, FiSave, FiX, FiPlus, FiCheck, FiChevronDown,FiChevronLeft, FiChevronRight, FiSun, FiWind, FiBattery, FiZap, FiActivity, FiDroplet, FiHome, FiCircle, FiHelpCircle, FiArrowRight, FiLayers, FiSearch, FiMaximize2, FiMinimize2, FiEdit2, FiSettings, FiCalendar, FiZoomIn, FiZoomOut, FiPlay } from "react-icons/fi";
import { useData } from "../context/DataContext";
import { TECH_TEMPLATES, useLiveTechTemplates } from "./TechnologiesData";
import { renderToStaticMarkup } from 'react-dom/server';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer, IconLayer, GeoJsonLayer, PathLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import { Map as MapGL } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import GlobalDataPanel from './GlobalDataPanel';
import OsmInfrastructurePanel from './OsmInfrastructurePanel';
import MapToolbar from './MapToolbar';
import LocationEditDialog from './LocationEditDialog';
import { useGeoServerData } from '../hooks/useGeoServerData';
import { getFuelColorRgb, getFuelColor } from '../utils/colorMapping';
import { generatePowerMesh, meshToCalliopeLocations, exportMeshToJson, validateMesh } from '../meshGenerator/MeshGenerator.js';
import { calculateDistance, calculateMeshStatistics } from '../meshGenerator/MeshUtils.js';
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, ESSENTIAL_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions';
import api from '../services/api';
import { LINK_TYPES, LINK_TYPES_BY_GROUP, getLinkTypeColorRgb, getLinkTypeColor } from '../config/linkTypes';
import { CARRIERS, getCarrierColorRgb, getCarrierLabel, getCarrierColor } from '../config/carriers';

// Import new custom hooks
import { useLocationManager } from '../hooks/useLocationManager';
import { useOSMLayerFilters } from '../hooks/useOSMLayerFilters';
import { useMapInteractions } from '../hooks/useMapInteractions';
import { useTechnologyManager } from '../hooks/useTechnologyManager';
import { usePolylineMode } from '../hooks/usePolylineMode';

// Function to normalize region names to match folder structure
const normalizeFolderName = (name) => {
  if (!name) return '';
  return name
    .replace(/\s+/g, '_')           // Spaces to underscores
    .replace(/-/g, '_')              // Hyphens to underscores
    .replace(/á/g, 'a')              // Spanish accents
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ü/g, 'ue')             // German umlaut ü -> ue
    .replace(/ö/g, 'oe')             // German umlaut ö -> oe
    .replace(/ä/g, 'ae')             // German umlaut ä -> ae
    .replace(/ß/g, 'ss')             // German ß -> ss
    .replace(/'/g, '')               // Remove apostrophes
    .replace(/"/g, '');              // Remove quotes
};

// Format technology name: capitalize first letter only and replace underscores and hyphens
const formatTechName = (techName) => {
  if (!techName) return '';
  const formatted = techName
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
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
  if (name.includes('wind')) return [76, 175, 80, 220];
  if (name.includes('solar') || name.includes('pv')) return [255, 235, 59, 220];
  if (name.includes('hydro')) return [33, 150, 243, 220];
  if (name.includes('coal')) return [96, 57, 19, 220];
  if (name.includes('gas') || name.includes('ccgt')) return [255, 152, 0, 220];
  if (name.includes('nuclear')) return [156, 39, 176, 220];
  if (name.includes('oil') || name.includes('diesel')) return [66, 66, 66, 220];
  if (name.includes('battery') || name.includes('storage')) return [168, 85, 247, 220];
  if (name.includes('demand')) return [244, 67, 54, 220];
  
  return [158, 158, 158, 200]; // Gray for generic
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
    
    const tech = technologies[techName];
    const color = getTechColor(tech || techName, techMap);
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    
    paths.push({
      path: pathData,
      color: colorHex
    });
  });
  
  return paths;
};

// Function to create SVG icon for location with pie chart
// Icon creation with caching (cache parameter handles memoization)
const createLocationIcon = (location, techMap, cache) => {
  if (!location) {
    // Fallback for undefined location
    const cacheKey = 'fallback';
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    
    const icon = {
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
    cache.set(cacheKey, icon);
    return icon;
  }
  
  // Create cache key based on location properties
  const techKeys = Object.keys(location.techs || {}).sort().join(',');
  const cacheKey = `${location.id}-${location.isNode}-${techKeys}`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  // Handle substations (nodes) - show as triangles
  if (location.isNode) {
    const techs = location.techs || {};
    const hasDemand = Object.keys(techs).some(t => t.toLowerCase().includes('demand')) || 
                      location.demandProfile || location.totalDemandMWh;
    const color = hasDemand ? 'rgb(244, 67, 54)' : 'rgb(33, 33, 33)'; // Red if demand, black if not
    
    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <path d="M12 4 L20 18 L4 18 Z" fill="${color}" stroke="#000000" stroke-width="1.5"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }
  
  const techs = location.techs || {};
  const techNames = Object.keys(techs);
  
  // Handle location with no technologies or single technology
  if (techNames.length <= 1) {
    const color = techNames.length > 0 ? getTechColor(techNames[0], techMap) : [148, 163, 184, 200];
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    
    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <circle cx="12" cy="12" r="10" fill="${colorHex}" stroke="#000000" stroke-width="2"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }
  
  // Multiple technologies - create pie chart
  const piePaths = createPieChartPaths(techs, techMap);
  
  if (!piePaths || piePaths.length === 0) {
    // Fallback if pie chart creation fails
    const color = getTechColor(techNames[0], techMap);
    const colorHex = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    
    const icon = {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
          <circle cx="12" cy="12" r="10" fill="${colorHex}" stroke="#000000" stroke-width="2"/>
        </svg>
      `)}`,
      width: 32,
      height: 32,
      anchorX: 16,
      anchorY: 16
    };
    cache.set(cacheKey, icon);
    return icon;
  }
  
  const pathsStr = piePaths.map(p => `<path d="${p.path}" fill="${p.color}"/>`).join('');
  
  const icon = {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" shape-rendering="geometricPrecision">
        <circle cx="12" cy="12" r="11" fill="white" stroke="white" stroke-width="1"/>
        ${pathsStr}
        <circle cx="12" cy="12" r="10" fill="none" stroke="#000000" stroke-width="2"/>
      </svg>
    `)}`,
    width: 32,
    height: 32,
    anchorX: 16,
    anchorY: 16
  };
  cache.set(cacheKey, icon);
  return icon;
};

// Open source map styles for Deck.gl
const MAP_STYLES = {
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

// Map style names for display
const MAP_STYLE_NAMES = {
  streets: 'Streets',
  satellite: 'Satellite',
  terrain: 'Terrain',
  dark: 'Dark'
};

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
  return { icon: FiCircle, color: '#64748b' };
};

// Create center location marker with modern pin design
const createCenterMarker = (locationName, techCount) => {
  const iconMarkup = renderToStaticMarkup(
    <div style={{
      width: '44px',
      height: '44px',
      position: 'relative'
    }}>
      <svg viewBox="0 0 24 24" width="44" height="44" style={{
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))'
      }}>
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          fill="#6366f1"
          stroke="white"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="9" r="3" fill="white" />
        <text
          x="12"
          y="10"
          textAnchor="middle"
          fontSize="6"
          fontWeight="bold"
          fill="#6366f1"
        >
          {techCount || ''}
        </text>
      </svg>
    </div>
  );

  // Leaflet marker creation removed - map moved to Map View with Deck.gl
  return null;
};

// Layer selector component
const LayerSelector = ({ currentLayer, onLayerChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative bg-white rounded-lg shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 hover:bg-gray-50 transition-colors flex items-center gap-2 rounded-lg"
      >
        <FiLayers className="text-lg text-gray-700" />
        <span className="text-sm font-medium text-gray-700">{MAP_STYLE_NAMES[currentLayer]}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[160px] z-[10002]">
          {Object.entries(MAP_STYLE_NAMES).map(([key, name]) => (
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
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Search bar component
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto z-[10002]">
          {filteredLocations.map((location, index) => {
            const techCount = location.techs ? Object.keys(location.techs).length : 0;
            return (
              <button
                key={location.id || index}
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

// Map controls with zoom
const MapZoomControls = ({ onZoomIn, onZoomOut, onFitBounds }) => {
  return (
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
  );
};

// Cache for substation icons to avoid recreating them on every render
const substationIconCache = {};

// Function to create hatched rectangle icon for substations (cached)
const getSubstationIcon = (type) => {
  if (substationIconCache[type]) {
    return substationIconCache[type];
  }
  
  const colors = {
    transmission: [220, 20, 60],      // Crimson red
    distribution: [255, 69, 0],       // Red-orange
    converter: [255, 0, 0],           // Pure red
    traction: [178, 34, 34],          // Firebrick
    other: [139, 0, 0]                // Dark red
  };
  
  const color = colors[type] || colors.other;
  const canvas = document.createElement('canvas');
  canvas.width = 64;  // Reduced from 128
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  // Draw rectangle with hatched pattern
  const rectSize = 50;
  const x = (64 - rectSize) / 2;
  const y = (64 - rectSize) / 2;
  
  // Fill with semi-transparent red
  ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.75)`;
  ctx.fillRect(x, y, rectSize, rectSize);
  
  // Draw diagonal hatch lines (fewer lines for performance)
  ctx.strokeStyle = `rgba(${Math.max(0, color[0] - 50)}, ${Math.max(0, color[1] - 20)}, ${Math.max(0, color[2] - 20)}, 0.9)`;
  ctx.lineWidth = 1.5;
  
  for (let i = -rectSize; i < rectSize * 2; i += 8) {  // Increased spacing from 10 to 8
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + rectSize, y + rectSize);
    ctx.stroke();
  }
  
  // Draw rectangle border
  ctx.strokeStyle = `rgba(${Math.max(0, color[0] - 30)}, ${Math.max(0, color[1] - 10)}, ${Math.max(0, color[2] - 10)}, 1)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, rectSize, rectSize);
  
  const iconData = {
    url: canvas.toDataURL(),
    width: 64,
    height: 64,
    anchorY: 32
  };
  
  substationIconCache[type] = iconData;
  return iconData;
};

const Creation = () => {
  const { 
    locations, setLocations, 
    links, setLinks, 
    technologies, 
    showNotification, 
    createModel, 
    timeSeries, setTimeSeries, 
    setNavigationWarning, 
    currentModelId,
    // OSM data and region selection (from context - persisted)
    osmSubstations, setOsmSubstations,
    osmPowerPlants, setOsmPowerPlants,
    osmPowerLines, setOsmPowerLines,
    osmCommunes, setOsmCommunes,
    osmDistricts, setOsmDistricts,
    osmRegionPath, setOsmRegionPath,
    selectedRegionBoundary, setSelectedRegionBoundary,
    selectedRegionInfo, setSelectedRegionInfo,
    currentBbox, setCurrentBbox,
    // Mesh generation (from context - persisted)
    generatedMesh, setGeneratedMesh,
    meshVisible, setMeshVisible,
  } = useData();
  
  // Mode state
  const [mode, setMode] = useState(null); // null (no mode), 'single', 'multiple', 'link', 'polyline'
  const [currentLinkType, setCurrentLinkType] = useState('hvac_overhead'); // link type used when drawing new links
  
  // Initialize custom hooks
  const locationManager = useLocationManager();
  const techManager = useTechnologyManager();
  const polylineMode = usePolylineMode(locationManager, showNotification);
  
  // OSM Filters (local state - not persisted)
  const [powerLineFilters, setPowerLineFilters] = useState({
    minVoltage: 0,
    maxVoltage: 1000,
    minCables: 0,
    showUnderground: true,
    showOverhead: true
  });
  const [powerPlantFilters, setPowerPlantFilters] = useState({
    selectedSources: ['solar', 'wind', 'hydro', 'nuclear', 'gas', 'coal', 'biomass', 'geothermal', 'oil', 'other'],
    minCapacity: 0
  });
  const [substationFilters, setSubstationFilters] = useState({
    selectedTypes: ['transmission', 'distribution', 'converter', 'traction', 'other'],
    minVoltage: 0,
    maxVoltage: 1000
  });
  
  // Use OSM layer filters hook
  const { filteredSubstations, filteredPowerPlants, filteredPowerLines } = useOSMLayerFilters(
    osmSubstations,
    osmPowerPlants,
    osmPowerLines,
    substationFilters,
    powerPlantFilters,
    powerLineFilters
  );
  
  // Use map interactions hook
  // Custom handleMapClick with modal
  const handleMapClickWithModal = useCallback((info, event) => {
    // If clicking on an existing object (except the region boundary), let the layer handle it
    // Allow clicks through the region boundary so users can place locations inside it
    if (info.object && info.layer?.id !== 'selected-region-overlay') {
      return;
    }
    
    // Only allow left-click (button 0) to create locations
    if (event?.srcEvent?.button !== 0) {
      return;
    }
    
    // Only create points when explicitly in single, multiple, or polyline mode
    if (mode !== 'single' && mode !== 'multiple' && mode !== 'polyline') {
      return;
    }
    
    const { coordinate } = info;
    if (coordinate) {
      // Polyline mode: create location instantly without dialog
      if (mode === 'polyline') {
        polylineMode.handlePolylineClick(coordinate);
      } else {
        // Single/Multiple modes: open dialog
        const newLocation = {
          // Don't set ID here - let it be assigned during save
          latitude: coordinate[1],
          longitude: coordinate[0],
          name: `Location ${(locationManager.tempLocations?.length || 0) + 1}`,
          techs: {},
          isNode: false
        };
        
        setPendingLocation(newLocation);
        setShowLocationDialog(true);
      }
    }
  }, [mode, locationManager.tempLocations, polylineMode]);
  
  const { handleLocationClick } = useMapInteractions(
    mode,
    locationManager.addLocation,
    locationManager.handleLocationClickForLink,
    locationManager.tempLocations
  );
  
  // Sidebar collapse states
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  
  // Collapsible section states
  const [locationsExpanded, setLocationsExpanded] = useState(true);
  const [linksExpanded, setLinksExpanded] = useState(true);
  
  // GeoServer data hook
  const { loadRegionData, loading: geoServerLoading } = useGeoServerData();
  const [showOsmLayers, setShowOsmLayers] = useState({
    substations: true,
    powerPlants: true,
    powerLines: true,
    boundaries: true
  });
  
  // Sync layerVisibility with showOsmLayers
  useEffect(() => {
    setLayerVisibility(prev => ({
      ...prev,
      powerLines: showOsmLayers.powerLines,
      powerPlants: showOsmLayers.powerPlants,
      substations: showOsmLayers.substations
    }));
  }, [showOsmLayers]);
  const [infrastructureSizes, setInfrastructureSizes] = useState({
    powerLines: 1.0,
    powerPlants: 1.0,
    substations: 1.0
  });
  
  // Dialog states
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showNodeConfirmDialog, setShowNodeConfirmDialog] = useState(false);
  const [modelName, setModelName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [isNode, setIsNode] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [originalLocationData, setOriginalLocationData] = useState(null);
  
  // UI states
  const [expandedTechConstraints, setExpandedTechConstraints] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [constraintGroupExpanded, setConstraintGroupExpanded] = useState({});
  const [selectedConstraintGroup, setSelectedConstraintGroup] = useState({});
  const [selectedCostGroup, setSelectedCostGroup] = useState({});
  const [constraintSearch, setConstraintSearch] = useState({});
  const [costSearch, setCostSearch] = useState({});
  const [newConstraintKey, setNewConstraintKey] = useState('');
  const [newConstraintValue, setNewConstraintValue] = useState('');
  const [openPopupLocationId, setOpenPopupLocationId] = useState(null);
  
  // Power Mesh Generation (local state)
  const [selectedMeshNode, setSelectedMeshNode] = useState(null);
  
  // Map Toolbar States
  const [pointSizes, setPointSizes] = useState({
    locations: 8,
    osm: 3
  });
  const [lineSizes, setLineSizes] = useState({
    links: 2,
    osm: 1.5
  });
  const [layerVisibility, setLayerVisibility] = useState({
    locations: true,
    links: true,
    powerLines: true,
    powerPlants: true,
    substations: true
  });
  
  // Calliope execution states
  const [isRunningModel, setIsRunningModel] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [modelResults, setModelResults] = useState(null);
  
  // Create technology map — live API catalog first, then static fallback, then model-specific overrides
  const { techTemplates: liveTechTemplates } = useLiveTechTemplates();
  const techMap = useMemo(() => {
    const map = {};

    // Start with live templates (falls back to static TECH_TEMPLATES inside the hook)
    const source = liveTechTemplates && Object.keys(liveTechTemplates).length > 0
      ? liveTechTemplates
      : TECH_TEMPLATES;
    Object.values(source).forEach(categoryTechs => {
      if (Array.isArray(categoryTechs)) {
        categoryTechs.forEach(tech => { map[tech.name] = tech; });
      }
    });

    // Override / extend with any model-specific technologies, but KEEP instances from live API
    if (Array.isArray(technologies) && technologies.length > 0) {
      technologies.forEach(tech => {
        const existingInstances = map[tech.name]?.instances;
        map[tech.name] = existingInstances ? { ...tech, instances: existingInstances } : tech;
      });
    }

    return map;
  }, [liveTechTemplates, technologies]);
  
  // Deck.gl Map States
  const [viewState, setViewState] = useState({
    longitude: -70.6693,
    latitude: -33.4489,
    zoom: 4,
    pitch: 0,
    bearing: 0
  });
  const [currentStyle, setCurrentStyle] = useState('streets');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const deckRef = useRef(null);
  const iconCache = useRef(new Map());
  const selectedForDragRef = useRef(null);
  
  // Model Configuration States
  const [modelConfig, setModelConfig] = useState({
    name: '',
    calliopeVersion: '0.6.8',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    solver: 'highs',
    ensureFeasibility: true,
    cyclicStorage: false,
    mode: 'plan',
    objectiveCostClass: 'monetary',
    solverOptions: {
      threads: 4,
      mip_rel_gap: 1e-3,
      primal_feasibility_tolerance: 1e-6,
      dual_feasibility_tolerance: 1e-6,
      ipm_optimality_tolerance: 1e-6,
    }
  });

  // Helper function to check if a point is inside a polygon using ray casting algorithm
  const isPointInPolygon = (point, polygon) => {
    const [lon, lat] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  };
  
  // Helper function to filter GeoJSON features by polygon boundary
  const filterFeaturesByPolygon = (geojson, boundaryPolygon) => {
    if (!geojson || !geojson.features || !boundaryPolygon) return geojson;
    
    const filtered = {
      type: 'FeatureCollection',
      features: geojson.features.filter(feature => {
        // Get feature coordinates based on geometry type
        if (feature.geometry.type === 'Point') {
          return isPointInPolygon(feature.geometry.coordinates, boundaryPolygon);
        } else if (feature.geometry.type === 'LineString') {
          // For lines, check if any point is inside the polygon
          return feature.geometry.coordinates.some(coord => isPointInPolygon(coord, boundaryPolygon));
        } else if (feature.geometry.type === 'Polygon') {
          // For polygons, check if centroid or any vertex is inside
          const firstRing = feature.geometry.coordinates[0];
          return firstRing.some(coord => isPointInPolygon(coord, boundaryPolygon));
        } else if (feature.geometry.type === 'MultiPolygon') {
          // For multipolygons, check if any polygon intersects
          return feature.geometry.coordinates.some(polygon => 
            polygon[0].some(coord => isPointInPolygon(coord, boundaryPolygon))
          );
        }
        return false;
      })
    };
    
    return filtered;
  };
  
  // Helper function to get boundary polygon from districts/states file
  const getBoundaryPolygon = (geojson, regionName) => {
    if (!geojson || !geojson.features) return null;
    
    // Find the feature matching the region name (case insensitive)
    const feature = geojson.features.find(f => 
      f.properties.name && f.properties.name.toLowerCase() === regionName.toLowerCase()
    );
    
    if (!feature) {
      return null;
    }
    
    // Extract coordinates based on geometry type
    if (feature.geometry.type === 'Polygon') {
      return feature.geometry.coordinates[0]; // First ring of polygon
    } else if (feature.geometry.type === 'MultiPolygon') {
      // For multipolygon, use the first polygon's first ring
      return feature.geometry.coordinates[0][0];
    }
    
    return null;
  };
  
  // Initialize map after component mount to avoid WebGL context errors
  useEffect(() => {
    // Use requestAnimationFrame to initialize after DOM is ready but without delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMapReady(true);
      });
    });
  }, []);
  
  // Map toolbar handlers
  const handleFitBounds = useCallback(() => {
    if (locations.length === 0) return;
    
    const lons = locations.map(loc => loc.coordinates.lon);
    const lats = locations.map(loc => loc.coordinates.lat);
    
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    
    // Calculate zoom level based on bounds
    const lonDiff = maxLon - minLon;
    const latDiff = maxLat - minLat;
    const maxDiff = Math.max(lonDiff, latDiff);
    const zoom = Math.max(4, Math.min(14, 10 - Math.log2(maxDiff)));
    
    setViewState({
      ...viewState,
      longitude: centerLon,
      latitude: centerLat,
      zoom: zoom,
      transitionDuration: 1000,
      transitionInterpolator: new FlyToInterpolator()
    });
  }, [locations, viewState]);
  
  const handleResetView = useCallback(() => {
    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setViewState({
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
            zoom: 12,
            pitch: 0,
            bearing: 0,
            transitionDuration: 1000,
            transitionInterpolator: new FlyToInterpolator()
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          // Fallback to default location
          setViewState({
            longitude: -70.6693,
            latitude: -33.4489,
            zoom: 4,
            pitch: 0,
            bearing: 0,
            transitionDuration: 1000,
            transitionInterpolator: new FlyToInterpolator()
          });
        }
      );
    } else {
      // Geolocation not supported, use default
      setViewState({
        longitude: -70.6693,
        latitude: -33.4489,
        zoom: 4,
        pitch: 0,
        bearing: 0,
        transitionDuration: 1000,
        transitionInterpolator: new FlyToInterpolator()
      });
    }
  }, []);
  
  // Load OSM infrastructure data from GeoServer when bbox changes
  useEffect(() => {
    const loadOsmData = async () => {
      if (!currentBbox) {
        setOsmSubstations(null);
        setOsmPowerPlants(null);
        setOsmPowerLines(null);
        setOsmCommunes(null);
        setOsmDistricts(null);
        return;
      }

      try {
        // Load data prioritising GeoServer (curated local data) with Overpass as fallback.
        // Pass the region path so GeoServer can use its CQL_FILTER on region_path column.
        const data = await loadRegionData(osmRegionPath, showOsmLayers, currentBbox);
        
        if (data) {
          setOsmSubstations(data.substations);
          setOsmPowerPlants(data.powerPlants);
          setOsmPowerLines(data.powerLines);
          setOsmCommunes(data.communes);
          setOsmDistricts(data.districts);
        }
      } catch (error) {
        console.error('Error loading GeoServer data:', error);
        setOsmSubstations(null);
        setOsmPowerPlants(null);
        setOsmPowerLines(null);
        setOsmCommunes(null);
        setOsmDistricts(null);
      }
    };
    
    loadOsmData();
  }, [currentBbox, osmRegionPath, showOsmLayers, loadRegionData]);
  
  // Detect unsaved work and warn before navigation
  useEffect(() => {
    const hasUnsavedWork = (
      locations.length > 0 || 
      links.length > 0 || 
      generatedMesh !== null ||
      osmSubstations !== null ||
      osmPowerPlants !== null ||
      osmPowerLines !== null
    );
    
    // Only warn if there's work and no saved model
    if (hasUnsavedWork && !currentModelId) {
      setNavigationWarning('creation');
    } else {
      setNavigationWarning(null);
    }
    
    // Cleanup: remove warning when component unmounts
    return () => setNavigationWarning(null);
  }, [locations, links, generatedMesh, osmSubstations, osmPowerPlants, osmPowerLines, currentModelId, setNavigationWarning]);
  
  // Handle bbox changes from OsmInfrastructurePanel
  const handleBboxChange = useCallback((bbox) => {
    setCurrentBbox(bbox);
    
    // Zoom to the bbox center
    if (bbox) {
      const centerLon = (bbox.minLon + bbox.maxLon) / 2;
      const centerLat = (bbox.minLat + bbox.maxLat) / 2;
      
      // Calculate appropriate zoom level based on bbox size
      const lonRange = bbox.maxLon - bbox.minLon;
      const latRange = bbox.maxLat - bbox.minLat;
      const maxRange = Math.max(lonRange, latRange);
      let zoom = 6;
      if (maxRange < 0.5) zoom = 11;
      else if (maxRange < 1) zoom = 10;
      else if (maxRange < 2) zoom = 9;
      else if (maxRange < 5) zoom = 8;
      else if (maxRange < 10) zoom = 7;
      
      setViewState(prev => ({
        ...prev,
        longitude: centerLon,
        latitude: centerLat,
        zoom: zoom,
        transitionDuration: 1000,
        transitionInterpolator: new FlyToInterpolator()
      }));
    }
  }, []);
  
  // Handle region selection from OsmInfrastructurePanel
  const handleRegionSelect = useCallback(async (regionInfo) => {
    setSelectedRegionInfo(regionInfo);
    
    // Build the GeoServer region_path from the selection hierarchy.
    // Parts are only added when defined (country selection = "Europe/Germany",
    // subregion selection = "Europe/Germany/Bayern/Niederbayern").
    if (regionInfo) {
      const parts = [
        regionInfo.continent,
        regionInfo.country,
        regionInfo.region,
        regionInfo.subregion,
      ].filter(Boolean);
      const regionPath = parts.length >= 2 ? parts.join('/') : null;
      setOsmRegionPath(regionPath);
      
      // Load the boundary geometry for the selected region to show territory overlay
      if (regionPath && parts.length >= 2) {
        try {
          // Determine which boundary layer to query (communes for detailed, districts for broader)
          const layerName = parts.length >= 3 ? 'osm_communes' : 'osm_districts';
          const boundaryData = await api.getOSMLayer(layerName, null, regionPath);
          
          if (boundaryData && boundaryData.features && boundaryData.features.length > 0) {
            setSelectedRegionBoundary(boundaryData);
            
            // Calculate bbox from boundary geometry for automatic zoom
            const bbox = calculateBboxFromGeoJSON(boundaryData);
            if (bbox) {
              // Calculate center point
              const centerLon = (bbox.minLon + bbox.maxLon) / 2;
              const centerLat = (bbox.minLat + bbox.maxLat) / 2;
              
              // Calculate appropriate zoom level based on bbox size
              const lonDelta = bbox.maxLon - bbox.minLon;
              const latDelta = bbox.maxLat - bbox.minLat;
              const maxDelta = Math.max(lonDelta, latDelta);
              
              // Zoom formula: larger areas need lower zoom
              let zoomLevel;
              if (maxDelta > 20) zoomLevel = 4;        // Very large area (country/continent)
              else if (maxDelta > 10) zoomLevel = 5;   // Large area
              else if (maxDelta > 5) zoomLevel = 6;    // Medium-large area
              else if (maxDelta > 2) zoomLevel = 7;    // Medium area (state/region)
              else if (maxDelta > 1) zoomLevel = 8;    // Smaller region
              else if (maxDelta > 0.5) zoomLevel = 9;  // District
              else if (maxDelta > 0.2) zoomLevel = 10; // Small district
              else zoomLevel = 11;                      // Very small area
              
              // Apply the new view state with smooth transition
              setViewState({
                longitude: centerLon,
                latitude: centerLat,
                zoom: zoomLevel,
                pitch: 0,
                bearing: 0,
                transitionDuration: 1000,
                transitionInterpolator: new FlyToInterpolator()
              });
              
              // Also update bbox for data loading
              handleBboxChange(bbox);
            }
          } else {
            setSelectedRegionBoundary(null);
            // Fallback to manual center/zoom if provided
            if (regionInfo.center && regionInfo.zoom) {
              applyManualZoom(regionInfo);
            }
          }
        } catch (error) {
          console.error('Error loading region boundary:', error);
          setSelectedRegionBoundary(null);
          // Fallback to manual center/zoom if provided
          if (regionInfo.center && regionInfo.zoom) {
            applyManualZoom(regionInfo);
          }
        }
      } else {
        setSelectedRegionBoundary(null);
        // For continent-only selection, use predefined center/zoom
        if (regionInfo.center && regionInfo.zoom) {
          applyManualZoom(regionInfo);
        }
      }
    } else {
      setOsmRegionPath(null);
      setSelectedRegionBoundary(null);
    }
    
    // Helper function to apply manual zoom (for continents or fallback)
    function applyManualZoom(info) {
      const [latitude, longitude] = info.center;
      const zoom = info.zoom;
      
      setViewState({
        longitude,
        latitude,
        zoom,
        pitch: 0,
        bearing: 0,
        transitionDuration: 1000,
        transitionInterpolator: new FlyToInterpolator()
      });
      
      // Calculate bbox from center and zoom
      const factor = 1 / Math.pow(2, zoom - 10);
      const delta = 0.5 * factor;
      
      const bbox = {
        minLon: longitude - delta,
        minLat: latitude - delta,
        maxLon: longitude + delta,
        maxLat: latitude + delta
      };
      
      handleBboxChange(bbox);
    }
    
    // Helper function to calculate bbox from GeoJSON FeatureCollection
    function calculateBboxFromGeoJSON(geojson) {
      if (!geojson || !geojson.features || geojson.features.length === 0) {
        return null;
      }
      
      let minLon = Infinity, minLat = Infinity;
      let maxLon = -Infinity, maxLat = -Infinity;
      
      geojson.features.forEach(feature => {
        if (!feature.geometry || !feature.geometry.coordinates) return;
        
        const processCoordinates = (coords) => {
          if (typeof coords[0] === 'number') {
            // Single coordinate pair [lon, lat]
            const [lon, lat] = coords;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          } else {
            // Array of coordinates, recurse
            coords.forEach(processCoordinates);
          }
        };
        
        processCoordinates(feature.geometry.coordinates);
      });
      
      if (minLon === Infinity || minLat === Infinity) {
        return null;
      }
      
      return { minLon, minLat, maxLon, maxLat };
    }
  }, [handleBboxChange]);
  
  // Clear all locations and links
  const clearAll = useCallback(() => {
    if (window.confirm('Clear all unsaved locations and links?')) {
      locationManager.clearAll();
    }
  }, [locationManager]);
  
  // Save model to main data
  const saveToMainData = useCallback(async () => {
    if (!modelName.trim()) {
      showNotification('Please enter a model name', 'warning');
      return;
    }

    // Convert temp locations to final format using locationManager data
    const finalLocations = locationManager.tempLocations.map(loc => ({
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      type: loc.isNode ? 'node' : 'site',
      coordinates: {
        lat: loc.latitude,
        lon: loc.longitude
      },
      techs: loc.techs || {},
      available_techs: Object.keys(loc.techs || {}).join(',')
    }));

    // Convert temp links to final format using locationManager data
    const finalLinks = locationManager.tempLinks.map(link => {
      const fromLoc = locationManager.tempLocations.find(l => l.id === link.from);
      const toLoc = locationManager.tempLocations.find(l => l.id === link.to);
      const lt = link.linkType ? LINK_TYPES[link.linkType] : null;
      return {
        from: fromLoc.name,
        to: toLoc.name,
        distance: link.distance,
        linkType: link.linkType || null,
        carrier: link.carrier || lt?.carrier || 'electricity',
        // Calliope tech key used in techs.yaml and links section
        tech: lt?.calliopeTech || link.linkType || 'ac_transmission',
      };
    });

    // Collect all unique technologies from locations
    const techsToAdd = [];
    locationManager.tempLocations.forEach(loc => {
      if (loc.techs) {
        Object.entries(loc.techs).forEach(([techName, techData]) => {
          if (!techsToAdd.find(t => t.name === techName)) {
            const template = techMap[techName];
            if (template) {
              techsToAdd.push({
                ...template,
                name: techName,
                constraints: { ...template.constraints, ...techData.constraints },
                costs: { ...template.costs, ...techData.costs },
                essentials: { ...template.essentials, ...techData.essentials }
              });
            }
          }
        });
      }
    });

    // Auto-add transmission tech definitions for each unique link type used
    const seenTechs = new Set(techsToAdd.map(t => t.name));
    locationManager.tempLinks.forEach(link => {
      if (!link.linkType) return;
      const lt = LINK_TYPES[link.linkType];
      if (!lt) return;
      const techId = lt.calliopeTech;
      if (seenTechs.has(techId)) return;
      seenTechs.add(techId);
      techsToAdd.push({
        name: techId,
        parent: 'transmission',
        essentials: { name: lt.label, parent: 'transmission', carrier: lt.carrier, color: '#94A3B8' },
        constraints: {
          energy_cap_max: 'inf',
          energy_eff: lt.defaults.energy_eff ?? 0.98,
          lifetime: lt.defaults.lifetime ?? 40,
        },
        costs: {
          monetary: {
            interest_rate: 0.05,
            ...(lt.defaults.energy_cap_per_distance != null
              ? { energy_cap_per_distance: lt.defaults.energy_cap_per_distance }
              : {}),
          },
        },
      });
    });

    // Create new model
    createModel(
      modelConfig.name || modelName.trim(),
      finalLocations,
      finalLinks,
      [],
      techsToAdd,
      [],
      {
        description: `Model created in Creation mode with ${locationManager.tempLocations.length} locations and ${locationManager.tempLinks.length} links`,
        createdInCreationMode: true,
        modelConfig: {
          calliopeVersion: modelConfig.calliopeVersion,
          startDate: modelConfig.startDate,
          endDate: modelConfig.endDate,
          solver: modelConfig.solver,
          ensureFeasibility: modelConfig.ensureFeasibility,
          cyclicStorage: modelConfig.cyclicStorage,
          mode: modelConfig.mode,
          objectiveCostClass: modelConfig.objectiveCostClass,
          solverOptions: modelConfig.solverOptions
        }
      }
    );
    
    showNotification(`Model "${modelConfig.name || modelName}" created successfully!`, 'success');
    
    // Reset creation state
    locationManager.clearAll();
    setModelName('');
    setShowSaveDialog(false);
  }, [modelName, locationManager, modelConfig, techMap, createModel, showNotification]);
  
  // Generate power mesh from OSM power lines
  const generateMeshFromLines = useCallback(() => {
    if (!osmPowerLines) {
      showNotification('Please load OSM power lines data first', 'warning');
      return;
    }

    // Generate mesh with current filters
    const meshOptions = {
      deduplicationThreshold: 0.5,
      snapThreshold: 0.5,
      minVoltage: powerLineFilters.minVoltage,
      maxVoltage: powerLineFilters.maxVoltage
    };

    const result = generatePowerMesh(osmPowerLines, meshOptions);

    if (result.success) {
      setGeneratedMesh(result);
      setMeshVisible(true);
      
      const validation = validateMesh(result);
      if (!validation.valid) {
        console.error('Mesh validation errors:', validation.issues);
        showNotification('Mesh generated with errors. Check console for details.', 'warning');
      } else if (validation.warnings.length > 0) {
        console.warn('Mesh validation warnings:', validation.warnings);
      }

      showNotification(
        `✅ ${result.message}\n📊 Stats: ${result.statistics.avgConnectivity} avg connections, ${result.statistics.isolatedNodes} isolated nodes`,
        'success'
      );
    } else {
      showNotification(`Failed to generate mesh: ${result.message}`, 'error');
    }
  }, [osmPowerLines, powerLineFilters, showNotification]);

  // Convert mesh to Calliope locations
  const importMeshAsLocations = useCallback(() => {
    if (!generatedMesh) {
      showNotification('No mesh generated yet', 'warning');
      return;
    }

    const baseTimestamp = Date.now();
    const meshLocations = generatedMesh.nodes.map((node, index) => ({
      id: baseTimestamp + index,
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
      techs: {},
      isNode: false,
      metadata: {
        meshNodeId: node.id,
        voltage: node.voltage,
        clusterSize: node.clusterSize,
        alternativeNames: node.alternativeNames || [],
        importedFromMesh: true
      }
    }));
    
    locationManager.importMultipleLocations(meshLocations);
    
    const nodeIdToLocationId = {};
    generatedMesh.nodes.forEach((node, index) => {
      nodeIdToLocationId[node.id] = baseTimestamp + index;
    });
    
    const meshLinks = generatedMesh.edges.map((edge, index) => {
      const fromLocationId = nodeIdToLocationId[edge.from];
      const toLocationId = nodeIdToLocationId[edge.to];
      const fromNode = generatedMesh.nodes.find(n => n.id === edge.from);
      const toNode = generatedMesh.nodes.find(n => n.id === edge.to);
      const linkDistance = edge.realDistance || edge.distance;
      return {
        id: baseTimestamp + 100000 + index,
        from: fromLocationId,
        to: toLocationId,
        fromName: fromNode.name,
        toName: toNode.name,
        distance: linkDistance.toFixed(2),
        realDistance: edge.realDistance ? edge.realDistance.toFixed(2) : null,
        straightDistance: edge.distance.toFixed(2),
        techs: {}
      };
    });

    locationManager.importMultipleLinks(meshLinks);
    setGeneratedMesh(null);
    
    showNotification(
      `Imported ${meshLocations.length} locations and ${meshLinks.length} links from mesh.`,
      'success'
    );
  }, [generatedMesh, showNotification, locationManager]);

  // Handle saving location from modal
  const handleSaveLocation = useCallback((locationData) => {
    if (locationData.id && locationManager.tempLocations.find(l => l.id === locationData.id)) {
      // Update existing location
      locationManager.updateLocation(locationData.id, locationData);
      showNotification(`Updated location: ${locationData.name}`, 'success');
    } else {
      // Add new location
      locationManager.addLocation(locationData);
      showNotification(`Created location: ${locationData.name}`, 'success');
    }
  }, [locationManager, showNotification]);
  
  // Export mesh to JSON
  const exportMesh = useCallback(() => {
    if (!generatedMesh) {
      showNotification('No mesh generated yet', 'warning');
      return;
    }

    const json = exportMeshToJson(generatedMesh);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `power_mesh_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showNotification('Mesh exported successfully', 'success');
  }, [generatedMesh, showNotification]);

  // Add edge between two mesh nodes
  const addMeshEdge = useCallback((fromNodeId, toNodeId) => {
    if (!generatedMesh) return;

    const fromNode = generatedMesh.nodes.find(n => n.id === fromNodeId);
    const toNode = generatedMesh.nodes.find(n => n.id === toNodeId);

    if (!fromNode || !toNode || fromNodeId === toNodeId) {
      showNotification('Invalid nodes selected for edge creation', 'warning');
      return;
    }

    const edgeExists = generatedMesh.edges.some(
      e => (e.from === fromNodeId && e.to === toNodeId) || 
           (e.from === toNodeId && e.to === fromNodeId)
    );

    if (edgeExists) {
      showNotification('Edge already exists between these nodes', 'warning');
      return;
    }

    const distance = calculateDistance(
      fromNode.latitude,
      fromNode.longitude,
      toNode.latitude,
      toNode.longitude
    );

    const newEdge = {
      id: `edge_manual_${Date.now()}`,
      from: fromNodeId,
      to: toNodeId,
      fromNode: fromNode,
      toNode: toNode,
      voltage: Math.max(fromNode.voltage || 0, toNode.voltage || 0),
      distance: distance,
      lineId: 'manual',
      properties: { manual: true }
    };

    setGeneratedMesh({
      ...generatedMesh,
      edges: [...generatedMesh.edges, newEdge],
      statistics: calculateMeshStatistics({
        nodes: generatedMesh.nodes,
        edges: [...generatedMesh.edges, newEdge]
      })
    });

    showNotification('Edge added successfully', 'success');
  }, [generatedMesh, showNotification]);

  // Expose mesh functions to window for OsmInfrastructurePanel
  useEffect(() => {
    window.generateMeshFromLines = generateMeshFromLines;
    window.importMeshAsLocations = importMeshAsLocations;
    window.exportMesh = exportMesh;
    window.toggleMeshVisibility = () => setMeshVisible(prev => !prev);
    window.clearMesh = () => {
      setGeneratedMesh(null);
      setMeshVisible(false);
      showNotification('Mesh cleared', 'info');
    };
    
    // Update mesh existence and statistics
    window.generatedMeshExists = !!generatedMesh;
    if (generatedMesh) {
      const stats = calculateMeshStatistics(generatedMesh);
      window.meshStatistics = {
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        avgConnectivity: stats.avgConnectivity,
        isolatedNodes: stats.isolatedNodes
      };
    } else {
      window.meshStatistics = null;
    }

    return () => {
      delete window.generateMeshFromLines;
      delete window.importMeshAsLocations;
      delete window.exportMesh;
      delete window.toggleMeshVisibility;
      delete window.clearMesh;
      delete window.generatedMeshExists;
      delete window.meshStatistics;
    };
  }, [generateMeshFromLines, importMeshAsLocations, exportMesh, generatedMesh, showNotification]);

  // Remove edge from mesh
  const removeMeshEdge = useCallback((edgeId) => {
    if (!generatedMesh) return;

    const updatedEdges = generatedMesh.edges.filter(e => e.id !== edgeId);

    setGeneratedMesh({
      ...generatedMesh,
      edges: updatedEdges,
      statistics: calculateMeshStatistics({
        nodes: generatedMesh.nodes,
        edges: updatedEdges
      })
    });

    showNotification('Edge removed successfully', 'success');
  }, [generatedMesh, showNotification]);

  // Update mesh node properties
  const updateMeshNode = useCallback((nodeId, updates) => {
    if (!generatedMesh) return;

    const updatedNodes = generatedMesh.nodes.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    );

    setGeneratedMesh({
      ...generatedMesh,
      nodes: updatedNodes
    });

    if (selectedMeshNode && selectedMeshNode.id === nodeId) {
      setSelectedMeshNode({ ...selectedMeshNode, ...updates });
    }

    showNotification('Node updated successfully', 'success');
  }, [generatedMesh, selectedMeshNode, showNotification]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Sidebar */}
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${leftSidebarCollapsed ? 'w-16' : 'w-80'} flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          {!leftSidebarCollapsed && (
            <div>
              <h2 className="text-lg font-bold text-gray-800">Creation Mode</h2>
              <p className="text-xs text-gray-600">Build your energy system</p>
            </div>
          )}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
          >
            {leftSidebarCollapsed ? <FiChevronRight size={20} /> : <FiChevronLeft size={20} />}
          </button>
        </div>

        {!leftSidebarCollapsed && (
          <>
            {/* Mode Selection */}
            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mode</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => {
                    setMode('single');
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'single'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiMapPin className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Single</div>
                </button>
                <button
                  onClick={() => {
                    setMode('multiple');
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'multiple'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiCpu className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Multiple</div>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMode('link');
                    locationManager.setLinkStart(null);
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'link'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiLink className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Link</div>
                </button>
                <button
                  onClick={() => {
                    setMode('polyline');
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'polyline'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiActivity className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Polyline</div>
                </button>
              </div>
            </div>

            {/* Locations List */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Locations Section */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-3">
                  <button
                    onClick={() => setLocationsExpanded(!locationsExpanded)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  >
                    <FiChevronDown 
                      size={16} 
                      className={`transition-transform ${locationsExpanded ? '' : '-rotate-90'}`}
                    />
                    Locations ({locationManager.tempLocations.length})
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={clearAll}
                      className="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors"
                      title="Clear all"
                    >
                      <FiTrash2 size={14} />
                    </button>
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      className="p-1.5 hover:bg-green-50 text-green-600 rounded transition-colors"
                      title="Save model"
                      disabled={locationManager.tempLocations.length === 0}
                    >
                      <FiSave size={14} />
                    </button>
                  </div>
                </div>

                {locationsExpanded && (
                  locationManager.tempLocations.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <FiMapPin className="mx-auto mb-2" size={32} />
                      <p>No locations yet</p>
                      <p className="text-xs mt-1">Select a mode and click the map</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {locationManager.tempLocations.map((loc, index) => (
                        <div
                          key={loc.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            locationManager.selectedLocation?.id === loc.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            locationManager.setSelectedLocation(loc);
                          }}
                          onDoubleClick={() => {
                            setPendingLocation(loc);
                            setShowLocationDialog(true);
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm text-gray-800">{loc.name || `Location ${index + 1}`}</h4>
                              <p className="text-xs text-gray-500">
                                {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                              </p>
                              {loc.techs && Object.keys(loc.techs).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {Object.keys(loc.techs).map(techName => (
                                    <span
                                      key={techName}
                                      className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded"
                                    >
                                      {formatTechName(techName)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingLocation(loc);
                                  setShowLocationDialog(true);
                                }}
                                className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                                title="Edit location"
                              >
                                <FiEdit2 size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  locationManager.removeLocation(loc.id);
                                }}
                                className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
                                title="Delete location"
                              >
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Links Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <button
                    onClick={() => setLinksExpanded(!linksExpanded)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  >
                    <FiChevronDown 
                      size={16} 
                      className={`transition-transform ${linksExpanded ? '' : '-rotate-90'}`}
                    />
                    Links ({locationManager.tempLinks.length})
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        locationManager.setTempLinks([]);
                        showNotification('All links cleared', 'success');
                      }}
                      className="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors"
                      title="Clear all links"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Link type selector — applies to new links drawn on the map */}
                <div className="px-3 pb-2">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">New link type</label>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getLinkTypeColor(currentLinkType) }}
                    />
                    <select
                      value={currentLinkType}
                      onChange={e => setCurrentLinkType(e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                        <optgroup key={group} label={group}>
                          {types.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {linksExpanded && (
                  locationManager.tempLinks.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <FiLink className="mx-auto mb-2" size={32} />
                      <p>No links yet</p>
                      <p className="text-xs mt-1">Create links between locations</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {locationManager.tempLinks.map((link, index) => (
                        <div
                          key={link.id}
                          className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-gray-800 flex items-center gap-1">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: link.linkType ? getLinkTypeColor(link.linkType) : (link.carrier ? getCarrierColor(link.carrier) : '#6366f1') }}
                                />
                                <span className="truncate">{link.fromName}</span>
                                <FiArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                                <span className="truncate">{link.toName}</span>
                              </h4>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {link.distance != null && !isNaN(parseFloat(link.distance)) ? `${parseFloat(link.distance).toFixed(2)} km` : 'N/A'}
                                {link.linkType && <span className="ml-1 text-gray-400">· {LINK_TYPES[link.linkType]?.label || link.linkType}</span>}
                              </p>
                              {/* Inline link type changer */}
                              <div className="mt-1.5">
                                <select
                                  value={link.linkType || ''}
                                  onChange={e => {
                                    const lt = e.target.value;
                                    locationManager.updateLink(link.id, {
                                      linkType: lt || null,
                                      carrier: lt ? (LINK_TYPES[lt]?.carrier || null) : link.carrier,
                                    });
                                  }}
                                  className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:outline-none"
                                >
                                  <option value="">— no type —</option>
                                  {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                                    <optgroup key={group} label={group}>
                                      {types.map(t => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-1 ml-1 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  locationManager.removeLink(link.id);
                                }}
                                className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
                                title="Delete link"
                              >
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Map View */}
      <div className="flex-1 relative">
        {/* Loading Overlay */}
        {geoServerLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg p-6 shadow-xl">
              <div className="flex items-center space-x-3">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                <span className="text-lg font-semibold text-gray-800">Loading infrastructure data...</span>
              </div>
            </div>
          </div>
        )}

        {mapReady && (
          <DeckGL
            ref={deckRef}
            viewState={viewState}
            onViewStateChange={({ viewState }) => setViewState(viewState)}
            controller={true}
            onClick={handleMapClickWithModal}
            onHover={(info) => {
              // Clear hover info when mouse is not over any pickable object
              if (!info.object) {
                setHoveredInfo(null);
              }
            }}
            layers={[
              // Selected Region Territory Overlay (shown first so it appears under infrastructure)
              ...(selectedRegionBoundary && selectedRegionBoundary.features?.length > 0 && showOsmLayers.boundaries ? [
                new GeoJsonLayer({
                  id: 'selected-region-overlay',
                  data: selectedRegionBoundary,
                  filled: true,
                  stroked: true,
                  getFillColor: [100, 149, 237, 40], // Cornflower blue with low opacity (transparent center)
                  getLineColor: [30, 60, 114, 200], // Dark blue border
                  getLineWidth: 3,
                  lineWidthUnits: 'pixels',
                  lineWidthMinPixels: 2,
                  lineWidthMaxPixels: 5,
                  pickable: true,
                  autoHighlight: false,
                  onHover: (info) => {
                    if (info.object) {
                      const props = info.object.properties;
                      setHoveredInfo({
                        name: props.name || 'Selected Region',
                        layerType: 'Region Boundary',
                        details: [
                          props.admin_level && { label: 'Admin Level', value: props.admin_level },
                          props.population && { label: 'Population', value: props.population.toLocaleString() },
                          props.region_path && { label: 'Region Path', value: props.region_path },
                        ].filter(Boolean),
                        x: info.x,
                        y: info.y
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  }
                })
              ] : []),
              
              // OSM Power Lines Layer  
              ...(osmPowerLines && layerVisibility.powerLines && filteredPowerLines?.features?.length > 0 ? (() => {
                // Flatten MultiLineString → multiple LineString entries so PathLayer renders correctly
                const lineData = filteredPowerLines.features.flatMap(f => {
                  if (f.geometry?.type === 'MultiLineString') {
                    return f.geometry.coordinates.map(coords => ({
                      ...f, geometry: { type: 'LineString', coordinates: coords }
                    }));
                  }
                  return [f];
                });
                return [
                  new PathLayer({
                    id: 'osm-power-lines',
                    data: lineData,
                    getPath: d => d.geometry?.coordinates || [],
                    getColor: d => {
                      const voltageStr = d.properties.voltage || '0';
                      let voltage = parseFloat(String(voltageStr).replace(/[^0-9.]/g, '')) || 0;
                      // Convert from volts to kilovolts if needed (voltage > 1000 means it's in volts)
                      if (voltage > 1000) voltage = voltage / 1000;
                      
                      // Color by voltage level (in kV)
                      if (voltage >= 220) return [220, 20, 60, 255];      // High voltage (220-380kV): red
                      if (voltage >= 110) return [255, 140, 0, 255];      // Medium-high voltage (110-220kV): orange
                      if (voltage >= 20) return [255, 215, 0, 255];       // Medium voltage (20-110kV): gold
                      return [100, 100, 100, 255];                         // Low voltage (<20kV): gray
                    },
                    getWidth: d => {
                      const voltageStr = d.properties.voltage || '0';
                      let voltage = parseFloat(String(voltageStr).replace(/[^0-9.]/g, '')) || 0;
                      // Convert from volts to kilovolts if needed
                      if (voltage > 1000) voltage = voltage / 1000;
                      const baseWidth = voltage >= 220 ? 5 : voltage >= 110 ? 3 : 2;
                      return baseWidth * (infrastructureSizes.powerLines || 1.0);
                    },
                    widthUnits: 'pixels',
                    widthMinPixels: 2,
                    widthMaxPixels: 20,
                    billboard: false,
                    capRounded: true,
                    jointRounded: true,
                    pickable: true,
                    autoHighlight: true,
                    highlightColor: [0, 255, 255, 255],
                    onHover: (info) => {
                      if (info.object) {
                        const props = info.object.properties;
                        let voltage = parseFloat(String(props.voltage || '0').replace(/[^0-9.]/g, '')) || 0;
                        if (voltage > 1000) voltage = voltage / 1000;
                        const vLabel = voltage > 0 ? `${voltage.toFixed(0)} kV` : null;
                        setHoveredInfo({
                          name: props.name || props.ref || (vLabel ? `${vLabel} Line` : 'Power Line'),
                          layerType: 'Power Line',
                          details: [
                            vLabel             && { label: 'Voltage',   value: vLabel },
                            props.ref          && { label: 'Ref',       value: props.ref },
                            props.operator     && { label: 'Operator',  value: props.operator },
                            props.cables       && { label: 'Cables',    value: props.cables },
                            props.wires        && { label: 'Wires',     value: props.wires },
                            props.frequency    && { label: 'Frequency', value: `${props.frequency} Hz` },
                            props.location     && { label: 'Location',  value: props.location },
                          ].filter(Boolean),
                          x: info.x,
                          y: info.y
                        });
                      } else {
                        setHoveredInfo(null);
                      }
                    }
                  })
                ];
              })() : []),

              // OSM Power Plants Layer
              ...(osmPowerPlants && layerVisibility.powerPlants && filteredPowerPlants?.features?.length > 0 ? [
                new ScatterplotLayer({
                  id: 'osm-power-plants',
                  data: filteredPowerPlants.features,
                  getPosition: d => {
                    const g = d.geometry;
                    if (!g) return [0, 0];
                    if (g.type === 'Point') return g.coordinates;
                    if (g.type === 'Polygon') {
                      const ring = g.coordinates[0];
                      return [ring.reduce((s,c)=>s+c[0],0)/ring.length, ring.reduce((s,c)=>s+c[1],0)/ring.length];
                    }
                    if (g.type === 'MultiPolygon') {
                      const ring = g.coordinates[0][0];
                      return [ring.reduce((s,c)=>s+c[0],0)/ring.length, ring.reduce((s,c)=>s+c[1],0)/ring.length];
                    }
                    return [0, 0];
                  },
                  getRadius: d => {
                    const capacity = d.properties.capacity__MW_ || 1;
                    const zoom = viewState.zoom;
                    const baseRadius = Math.sqrt(capacity) * 50000 / Math.pow(2, zoom);
                    return baseRadius * (infrastructureSizes.powerPlants || 1.0);
                  },
                  radiusUnits: 'meters',
                  radiusMinPixels: 2,
                  radiusMaxPixels: 20,
                  getFillColor: d => getFuelColorRgb(d.properties.plant_source || d.properties.source) || [100, 100, 100, 180],
                  getLineColor: [0, 0, 0, 255],
                  lineWidthMinPixels: 1,
                  pickable: true,
                  onHover: (info) => {
                    if (info.object) {
                      const props = info.object.properties;
                      const source = props.plant_source || props.source;
                      setHoveredInfo({
                        name: props.name || 'Power Plant',
                        layerType: 'Power Plant',
                        accentColor: source ? getFuelColor(source) : '#6B7280',
                        details: [
                          source             && { label: 'Source',   value: source.charAt(0).toUpperCase() + source.slice(1) },
                          props.plant_type   && { label: 'Type',     value: props.plant_type },
                          props.capacity__MW_&& { label: 'Capacity', value: `${props.capacity__MW_} MW` },
                          props.operator     && { label: 'Operator', value: props.operator },
                          props.start_date   && { label: 'Since',    value: props.start_date },
                          props.ref          && { label: 'Ref',      value: props.ref },
                        ].filter(Boolean),
                        x: info.x,
                        y: info.y
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  }
                })
              ] : []),

              // OSM Substations Layer
              ...(osmSubstations && layerVisibility.substations && filteredSubstations?.features?.length > 0 ? [
                new IconLayer({
                  id: 'osm-substations',
                  data: filteredSubstations.features.filter(f => f.geometry),
                  getPosition: d => {
                    const g = d.geometry;
                    if (g.type === 'Point') return g.coordinates;
                    if (g.type === 'Polygon') {
                      const ring = g.coordinates[0];
                      return [ring.reduce((s,c)=>s+c[0],0)/ring.length, ring.reduce((s,c)=>s+c[1],0)/ring.length];
                    }
                    if (g.type === 'MultiPolygon') {
                      const ring = g.coordinates[0][0];
                      return [ring.reduce((s,c)=>s+c[0],0)/ring.length, ring.reduce((s,c)=>s+c[1],0)/ring.length];
                    }
                    return [0, 0];
                  },
                  getIcon: d => getSubstationIcon(d.properties.substation || 'other'),
                  getSize: d => {
                    const zoom = viewState.zoom;
                    const baseSize = 30000 / Math.pow(2, zoom);
                    return baseSize * (infrastructureSizes.substations || 1.0);
                  },
                  sizeUnits: 'meters',
                  sizeMinPixels: 8,
                  sizeMaxPixels: 32,
                  pickable: true,
                  onHover: (info) => {
                    if (info.object) {
                      const props = info.object.properties;
                      let voltageLabel = null;
                      if (props.voltage) {
                        let v = parseFloat(String(props.voltage).replace(/[^0-9.]/g, '')) || 0;
                        if (v > 1000) v = v / 1000;
                        if (v > 0) voltageLabel = `${v.toFixed(0)} kV`;
                      }
                      setHoveredInfo({
                        name: props.name || 'Substation',
                        layerType: 'Substation',
                        details: [
                          props.substation      && { label: 'Type',      value: props.substation.charAt(0).toUpperCase() + props.substation.slice(1) },
                          voltageLabel          && { label: 'Voltage',   value: voltageLabel },
                          props.voltage_primary && { label: 'Primary V', value: props.voltage_primary },
                          props.operator        && { label: 'Operator',  value: props.operator },
                          props.frequency       && { label: 'Frequency', value: `${props.frequency} Hz` },
                          props.ref             && { label: 'Ref',       value: props.ref },
                        ].filter(Boolean),
                        x: info.x,
                        y: info.y
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  }
                })
              ] : []),

              // User Locations Layer
              ...(layerVisibility.locations && locationManager.tempLocations.length > 0 ? [
                new IconLayer({
                  id: 'user-locations',
                  data: locationManager.tempLocations,
                  getPosition: d => [d.longitude, d.latitude],
                  getIcon: d => createLocationIcon(d, techMap, iconCache.current),
                  getSize: 40,
                  sizeUnits: 'pixels',
                  pickable: true,
                  onClick: (info) => {
                    if (info.object) {
                      if (mode === 'link') {
                        // Handle link creation — pass current link type & carrier
                        handleLocationClick(info.object, {
                          linkOptions: {
                            linkType: currentLinkType,
                            carrier: LINK_TYPES[currentLinkType]?.carrier || 'electricity',
                          }
                        });
                      } else {
                        // Open edit dialog for the location
                        setPendingLocation(info.object);
                        setShowLocationDialog(true);
                      }
                    }
                  },
                  onHover: (info) => {
                    if (info.object) {
                      const loc = info.object;
                      const techCount = Object.keys(loc.techs || {}).length;
                      setHoveredInfo({
                        name: loc.name || 'Location',
                        techs: `${techCount} technolog${techCount !== 1 ? 'ies' : 'y'}`,
                        x: info.x,
                        y: info.y
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  }
                })
              ] : []),

              // User Links Layer
              ...(layerVisibility.links && locationManager.tempLinks.length > 0 ? [
                new LineLayer({
                  id: 'user-links',
                  data: locationManager.tempLinks,
                  getSourcePosition: d => {
                    const fromLoc = locationManager.tempLocations.find(l => l.id === d.from);
                    return fromLoc ? [fromLoc.longitude, fromLoc.latitude] : [0, 0];
                  },
                  getTargetPosition: d => {
                    const toLoc = locationManager.tempLocations.find(l => l.id === d.to);
                    return toLoc ? [toLoc.longitude, toLoc.latitude] : [0, 0];
                  },
                  // Colour by carrier / link type
                  getColor: d => {
                    if (d.linkType) return getLinkTypeColorRgb(d.linkType, 220);
                    if (d.carrier)  return getCarrierColorRgb(d.carrier, 220);
                    return [99, 102, 241, 200];
                  },
                  getWidth: lineSizes.links || 2,
                  widthUnits: 'pixels',
                  pickable: true,
                  updateTriggers: { getColor: locationManager.tempLinks },
                  onHover: (info) => {
                    if (info.object) {
                      const link = info.object;
                      const carrierLabel = link.carrier ? getCarrierLabel(link.carrier) : 'Electricity';
                      setHoveredInfo({
                        name: `Link: ${link.fromName || link.from} → ${link.toName || link.to}`,
                        techs: `${carrierLabel}${link.distance ? ` | ${link.distance} km` : ''}`,
                        x: info.x,
                        y: info.y
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  }
                })
              ] : []),

              // Mesh Visualization Layer
              ...(meshVisible && generatedMesh ? [
                new LineLayer({
                  id: 'mesh-edges',
                  data: generatedMesh.edges,
                  getSourcePosition: edge => {
                    const fromNode = generatedMesh.nodes.find(n => n.id === edge.from);
                    return fromNode ? [fromNode.longitude, fromNode.latitude] : [0, 0];
                  },
                  getTargetPosition: edge => {
                    const toNode = generatedMesh.nodes.find(n => n.id === edge.to);
                    return toNode ? [toNode.longitude, toNode.latitude] : [0, 0];
                  },
                  getColor: [168, 85, 247, 180],
                  getWidth: 2,
                  widthUnits: 'pixels',
                  pickable: true,
                  autoHighlight: true,
                  onHover: (info) => {
                    if (info.object) {
                      const fromNode = generatedMesh.nodes.find(n => n.id === info.object.from);
                      const toNode = generatedMesh.nodes.find(n => n.id === info.object.to);
                      const distance = info.object.distance || info.object.realDistance || 0;
                      setHoveredInfo({
                        x: info.x,
                        y: info.y,
                        name: `${fromNode?.name || 'Node'} → ${toNode?.name || 'Node'}`,
                        techs: `Distance: ${distance.toFixed(2)} km${info.object.voltage ? ` | ${info.object.voltage} kV` : ''}`
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  }
                }),
                new ScatterplotLayer({
                  id: 'mesh-nodes',
                  data: generatedMesh.nodes,
                  getPosition: node => [node.longitude, node.latitude],
                  getRadius: node => {
                    const zoom = viewState.zoom;
                    return 150000 / Math.pow(2, zoom);
                  },
                  radiusUnits: 'meters',
                  radiusMinPixels: 3,
                  radiusMaxPixels: 30,
                  getFillColor: [220, 20, 60, 220],
                  getLineColor: [0, 0, 0, 255],
                  lineWidthMinPixels: 1,
                  pickable: true,
                  autoHighlight: true,
                  onHover: (info) => {
                    if (info.object) {
                      const node = info.object;
                      setHoveredInfo({
                        x: info.x,
                        y: info.y,
                        name: node.name || 'Mesh Node',
                        techs: `${node.voltage ? `Voltage: ${node.voltage} kV | ` : ''}Connections: ${node.clusterSize || 1}${node.alternativeNames?.length > 0 ? ` | Alt: ${node.alternativeNames[0]}` : ''}`
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  },
                  onClick: (info) => {
                    if (info.object) {
                      setSelectedMeshNode(info.object);
                    }
                  }
                })
              ] : [])
            ]}
          >
            <MapGL
              mapStyle={MAP_STYLES[currentStyle]}
              attributionControl={false}
            />
          </DeckGL>
        )}

        {/* Hover Tooltip */}
        {hoveredInfo && (
          <div
            style={{
              position: 'absolute',
              left: hoveredInfo.x + 14,
              top: hoveredInfo.y + 14,
              pointerEvents: 'none',
              backgroundColor: 'white',
              padding: '10px 14px',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              fontSize: '12px',
              zIndex: 1000,
              minWidth: '160px',
              maxWidth: '260px',
              borderLeft: `3px solid ${hoveredInfo.accentColor || '#6B7280'}`,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2, color: '#1f2937' }}>{hoveredInfo.name}</div>
            {hoveredInfo.layerType && (
              <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {hoveredInfo.layerType}
              </div>
            )}
            {hoveredInfo.details && hoveredInfo.details.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {hoveredInfo.details.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ color: '#6b7280' }}>{d.label}</span>
                    <span style={{ fontWeight: 500, color: '#374151', textAlign: 'right' }}>{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            {!hoveredInfo.details && hoveredInfo.techs && (
              <div style={{ color: '#4b5563' }}>{hoveredInfo.techs}</div>
            )}
          </div>
        )}

        {/* Mode Indicator */}
        <div className="absolute bottom-4 left-4 bg-white px-4 py-2 rounded-lg shadow-lg">
          <div className="text-xs text-gray-600 mb-1">Current Mode</div>
          <div className="font-semibold text-gray-800">
            {mode === 'single' && 'Single Location'}
            {mode === 'multiple' && 'Multiple Locations'}
            {mode === 'link' && (locationManager.linkStart ? 'Link: Select End Location' : 'Link: Select Start Location')}
            {mode === 'polyline' && 'Polyline Mode'}
          </div>
          {mode === 'link' && locationManager.linkStart && (
            <div className="text-xs text-gray-600 mt-1">
              From: {locationManager.linkStart.name}
            </div>
          )}
          {mode === 'polyline' && (
            <div className="text-xs text-gray-600 mt-1">
              {polylineMode.lastCreatedLocation 
                ? `Last: ${polylineMode.lastCreatedLocation.name} • Click to add next point and auto-link`
                : 'Click map to start creating connected points'}
            </div>
          )}
        </div>

        {/* Map Legends */}
        {(osmPowerLines || osmPowerPlants) && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white bg-opacity-95 rounded-lg shadow-lg p-3 max-w-2xl">
            <div className="flex gap-6">
              {/* Power Lines Legend */}
              {osmPowerLines && layerVisibility.powerLines && (
                <div>
                  <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Transmission Lines
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(220,20,60)] rounded"></div>
                      <span className="text-xs text-slate-600">≥220 kV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(255,140,0)] rounded"></div>
                      <span className="text-xs text-slate-600">110-220 kV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(255,215,0)] rounded"></div>
                      <span className="text-xs text-slate-600">20-110 kV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-[rgb(100,100,100)] rounded"></div>
                      <span className="text-xs text-slate-600">&lt;20 kV</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Power Plants Legend */}
              {osmPowerPlants && layerVisibility.powerPlants && (
                <div>
                  <div className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                    Power Plants
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FDB813]"></div>
                      <span className="text-xs text-slate-600">Solar</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00A8CC]"></div>
                      <span className="text-xs text-slate-600">Wind</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#1976D2]"></div>
                      <span className="text-xs text-slate-600">Hydro</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#689F38]"></div>
                      <span className="text-xs text-slate-600">Biomass</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF6F00]"></div>
                      <span className="text-xs text-slate-600">Gas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#424242]"></div>
                      <span className="text-xs text-slate-600">Coal</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#E91E63]"></div>
                      <span className="text-xs text-slate-600">Nuclear</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#9C27B0]"></div>
                      <span className="text-xs text-slate-600">Battery</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <LayerSelector currentLayer={currentStyle} onLayerChange={setCurrentStyle} />
        </div>
      </div>

      {/* Right Sidebar — OSM Infrastructure Panel (owns its own header + collapse button) */}
      <div className={`flex-shrink-0 transition-all duration-300 ${rightSidebarCollapsed ? 'w-14' : 'w-96'}`}>
        <OsmInfrastructurePanel
          collapsed={rightSidebarCollapsed}
          onToggleCollapse={() => setRightSidebarCollapsed(c => !c)}
          onRegionSelect={handleRegionSelect}
          showOsmLayers={showOsmLayers}
          onOsmLayersChange={setShowOsmLayers}
          infrastructureSizes={infrastructureSizes}
          onInfrastructureSizesChange={setInfrastructureSizes}
          powerLineFilters={powerLineFilters}
          onPowerLineFiltersChange={setPowerLineFilters}
          powerPlantFilters={powerPlantFilters}
          onPowerPlantFiltersChange={setPowerPlantFilters}
          substationFilters={substationFilters}
          onSubstationFiltersChange={setSubstationFilters}
        />
      </div>

      {/* Save Model Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800">Save as New Model</h3>
                <p className="text-sm text-gray-500 mt-0.5">{locationManager.tempLocations.length} locations · {locationManager.tempLinks.length} links</p>
              </div>
              <button onClick={() => setShowSaveDialog(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <FiX size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name + Description */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Model Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. Germany 2030 High-Res"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    value={modelConfig.description || ''}
                    onChange={(e) => setModelConfig(c => ({ ...c, description: e.target.value }))}
                    placeholder="Optional notes about this model..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                  />
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Time horizon */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Time Horizon</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={modelConfig.startDate}
                      onChange={(e) => setModelConfig(c => ({ ...c, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                    <input
                      type="date"
                      value={modelConfig.endDate}
                      onChange={(e) => setModelConfig(c => ({ ...c, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Solver + Mode */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Solver &amp; Mode</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Solver</label>
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700">
                      HiGHS
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                    <select
                      value={modelConfig.mode}
                      onChange={(e) => setModelConfig(c => ({ ...c, mode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    >
                      <option value="plan">Planning (optimise capacity)</option>
                      <option value="operate">Operate (fixed capacity)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Calliope Version</label>
                    <select
                      value={modelConfig.calliopeVersion}
                      onChange={(e) => setModelConfig(c => ({ ...c, calliopeVersion: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    >
                      <option value="0.6.8">0.6.8</option>
                      <option value="0.6.7">0.6.7</option>
                      <option value="0.7.0">0.7.0 (beta)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Objective Cost Class</label>
                    <select
                      value={modelConfig.objectiveCostClass}
                      onChange={(e) => setModelConfig(c => ({ ...c, objectiveCostClass: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    >
                      <option value="monetary">Monetary</option>
                      <option value="co2">CO₂</option>
                    </select>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Advanced toggles */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Advanced Options</h4>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelConfig.ensureFeasibility}
                      onChange={(e) => setModelConfig(c => ({ ...c, ensureFeasibility: e.target.checked }))}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Ensure Feasibility</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelConfig.cyclicStorage}
                      onChange={(e) => setModelConfig(c => ({ ...c, cyclicStorage: e.target.checked }))}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Cyclic Storage</span>
                  </label>
                </div>
              </div>

              {/* Solver threads */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Solver Threads</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={modelConfig.solverOptions?.threads ?? 4}
                    onChange={(e) => setModelConfig(c => ({ ...c, solverOptions: { ...c.solverOptions, threads: parseInt(e.target.value) || 1 } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">MIP Relative Gap</label>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={modelConfig.solverOptions?.mip_rel_gap ?? 0.001}
                    onChange={(e) => setModelConfig(c => ({ ...c, solverOptions: { ...c.solverOptions, mip_rel_gap: parseFloat(e.target.value) || 0.001 } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveToMainData}
                disabled={!modelName.trim()}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Save Model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Edit Dialog */}
      <LocationEditDialog
        isOpen={showLocationDialog}
        onClose={() => {
          setShowLocationDialog(false);
          setPendingLocation(null);
        }}
        location={pendingLocation}
        mode={mode}
        techMap={techMap}
        onSave={(savedLocation) => {
          if (savedLocation.id && locationManager.tempLocations.find(l => l.id === savedLocation.id)) {
            // Update existing location
            locationManager.updateLocation(savedLocation.id, savedLocation);
            showNotification(`Updated location: ${savedLocation.name}`, 'success');
          } else {
            // Add new location with generated ID (for Single/Multiple modes)
            const newLocationWithId = {
              ...savedLocation,
              id: Date.now()
            };
            locationManager.addLocation(newLocationWithId);
            showNotification(`Created location: ${savedLocation.name}`, 'success');
          }
          setShowLocationDialog(false);
          setPendingLocation(null);
        }}
        onModeChange={setMode}
      />
    </div>
  );
};

export default Creation;
