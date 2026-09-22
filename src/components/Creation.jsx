import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FiMapPin, FiLink, FiCpu, FiTrash2, FiSave, FiX, FiPlus, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiActivity, FiHelpCircle, FiArrowRight, FiEdit2, FiSettings, FiCalendar, FiZoomIn, FiZoomOut, FiPlay } from "react-icons/fi";
import { useData } from "../context/DataContext";
import { TECH_TEMPLATES, useLiveTechTemplates } from "./TechnologiesData";
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer, IconLayer, GeoJsonLayer, PathLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import { Map as MapGL } from 'react-map-gl/maplibre';
import { canCreateWebGLContext, webglUnavailableMessage } from '../utils/webglSupport';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import GlobalDataPanel from './GlobalDataPanel';
import OsmInfrastructurePanel from './OsmInfrastructurePanel';
import SaveModelDialog from './creation/SaveModelDialog';
import CreationSidebar from './creation/CreationSidebar';
import MapLegends from './creation/MapLegends';
import HoverTooltip from './creation/HoverTooltip';
import MapToolbar from './MapToolbar';
import LocationEditDialog from './LocationEditDialog';
import { useGeoServerData } from '../hooks/useGeoServerData';
import { getFuelColorRgb, getFuelColor } from '../utils/colorMapping';
import { generatePowerMesh, meshToCalliopeLocations, exportMeshToJson, validateMesh } from '../meshGenerator/MeshGenerator.js';
import { calculateDistance, calculateMeshStatistics } from '../meshGenerator/MeshUtils.js';
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, ESSENTIAL_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions';
import api from '../services/api';
import { LINK_TYPES, getLinkTypeColorRgb } from '../config/linkTypes';
import { CARRIERS, getCarrierColorRgb, getCarrierLabel } from '../config/carriers';
import { fetchPowerLayers, fetchNeighborCandidates } from '../services/overpassClient';
import { fetchGeometries } from '../services/nominatim';
import { parseSource, parseCapacityMW, parseVoltageKv } from '../services/zonalInfraExtract';
import { OSM_SOURCE_TO_TECH } from '../services/zonalModelBuilder';
import { getDemandShape } from '../services/demandlibClient';
import { buildDemandColumns } from '../services/demandProfiles';

// Import new custom hooks
import { useLocationManager } from '../hooks/useLocationManager';
import { useOSMLayerFilters } from '../hooks/useOSMLayerFilters';
import { useMapInteractions } from '../hooks/useMapInteractions';
import { useTechnologyManager } from '../hooks/useTechnologyManager';
import { usePolylineMode } from '../hooks/usePolylineMode';

import { normalizeFolderName } from '../utils/nameUtils';
import { getTechColor, getTechIcon } from '../utils/techUtils';
import { createLocationIcon, getSubstationIcon, substationIconCache } from '../utils/mapIcons';
import { MAP_STYLES, MAP_STYLE_NAMES } from '../config/mapStyles';
import LayerSelector from './creation/LayerSelector';
import SearchBar from './creation/SearchBar';
import MapZoomControls from './creation/MapZoomControls';
import TechLibraryPanel from './creation/TechLibraryPanel';

// Colour of each Study Area wizard preview element, keyed by metadata.kind.
// The transmission mesh is amber (matches the OSM lines); each wiring type gets a
// DISTINCT colour so you can tell plant→substation from substation→grid at a glance.
const PLAN_COLORS = {
  transmission_node: [245, 158, 11], transmission_link: [245, 158, 11], // amber
  substation: [239, 68, 68], plant: [34, 197, 94],
  substation_to_transmission: [79, 70, 229],  // indigo
  plant_to_substation: [219, 39, 119],         // rose
  plant_to_transmission: [13, 148, 136],       // teal
};

// Grid technologies attached on import (see the wizard's substation step).
// Links use the existing HVAC-overhead link type → `hvac_overhead_lines`
// transmission tech (enriched from opentech-db on the Technologies page).
const GRID_LINK_TYPE = 'hvac_overhead';
// Substation nodes get a Calliope-valid conversion tech (electricity → electricity
// with transformer losses) so they aren't empty. Registered in `technologies`
// on commit if missing; enrichable from opentech-db later like the other techs.
const SUBSTATION_TECH_ID = 'electricity_substation';
const SUBSTATION_TECH_DEF = {
  id: SUBSTATION_TECH_ID,
  name: 'Electricity Substation',
  parent: 'conversion',
  description: 'Substation / transformer node (electricity in → electricity out, with losses).',
  essentials: { name: 'Electricity Substation', color: '#4A148C', parent: 'conversion', carrier_in: 'electricity', carrier_out: 'electricity' },
  constraints: { energy_cap_max: 'inf', energy_eff: 0.995, lifetime: 40 },
  costs: { monetary: { interest_rate: 0.05, energy_cap: 50 } },
};
// Global demand tech for OSM substation demand. Registering it (parent: demand)
// lets every engine's translator resolve the tech's parent — OSeMOSYS/AdOpT-NET0
// look it up in the global technologies list, so an inline-only power_demand was
// invisible to them. Per-location constraints (the `resource` file ref) stay on
// the location; this only supplies the essentials/parent.
const POWER_DEMAND_TECH_ID = 'power_demand';
const POWER_DEMAND_TECH_DEF = {
  id: POWER_DEMAND_TECH_ID,
  name: 'Power demand',
  parent: 'demand',
  description: 'Electricity withdrawal (demand) attached to substation nodes.',
  essentials: { name: 'Power demand', color: '#607D8B', parent: 'demand', carrier: 'electricity' },
};
const HOURS_PER_YEAR = 8760;

const Creation = ({ onNavigate }) => {
  const {
    locations, setLocations,
    links, setLinks,
    technologies, setTechnologies,
    showNotification,
    createModel, 
    timeSeries, setTimeSeries, 
    setNavigationWarning, 
    currentModelId,
    // OSM data and region selection (from context - persisted)
    osmSubstations, setOsmSubstations,
    osmPowerPlants, setOsmPowerPlants,
    osmPowerLines, setOsmPowerLines,
    osmLoading, setOsmLoading,
    osmLoadingStage, setOsmLoadingStage,
    candidateBoundaries, setCandidateBoundaries,
    osmCommunes, setOsmCommunes,
    osmDistricts, setOsmDistricts,
    osmRegionPath, setOsmRegionPath,
    selectedRegionBoundary, setSelectedRegionBoundary,
    selectedRegionInfo, setSelectedRegionInfo,
    currentBbox, setCurrentBbox,
    studyArea, setStudyArea,
    studyBuildConfig, setStudyBuildConfig, setPlanSummary,
    // Mesh generation (from context - persisted)
    generatedMesh, setGeneratedMesh,
    meshVisible, setMeshVisible,
  } = useData();
  
  // Mode state
  const [mode, setMode] = useState(null); // null (no mode), 'add', 'link', 'polyline'
  const [currentLinkType, setCurrentLinkType] = useState('hvac_overhead'); // link type used when drawing new links
  const [showTechLibrary, setShowTechLibrary] = useState(false);
  
  // Initialize custom hooks
  const locationManager = useLocationManager();
  const techManager = useTechnologyManager(technologies);
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
    selectedSources: ['solar', 'wind', 'hydro', 'nuclear', 'gas', 'coal', 'biomass', 'geothermal', 'oil', 'other', 'unknown'],
    minCapacity: 0
  });
  const [substationFilters, setSubstationFilters] = useState({
    selectedTypes: ['transmission', 'distribution', 'converter', 'traction', 'other'],
    minVoltage: 0,
    maxVoltage: 1000
  });
  
  // Restrict displayed power lines to the voltage levels selected in the panel
  // (auto-detected). When none selected yet, show all.
  const linesForDisplay = useMemo(() => {
    const levels = studyArea?.voltageLevels;
    if (!osmPowerLines?.features || !Array.isArray(levels) || levels.length === 0) return osmPowerLines;
    const set = new Set(levels);
    return {
      ...osmPowerLines,
      features: osmPowerLines.features.filter(f => {
        const kv = f.properties?.voltage_kv ?? parseVoltageKv(f.properties);
        return set.has(Math.round(kv));
      }),
    };
  }, [osmPowerLines, studyArea]);

  // Use OSM layer filters hook
  const { filteredSubstations, filteredPowerPlants, filteredPowerLines } = useOSMLayerFilters(
    osmSubstations,
    osmPowerPlants,
    linesForDisplay,
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
    
    // Only create points when explicitly in add or polyline mode
    if (mode !== 'add' && mode !== 'polyline') {
      return;
    }

    const { coordinate } = info;
    if (coordinate) {
      // Polyline mode: create location instantly without dialog
      if (mode === 'polyline') {
        polylineMode.handlePolylineClick(coordinate);
      } else {
        // Add mode: open the location dialog
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
  const { loading: geoServerLoading } = useGeoServerData();
  const [showOsmLayers, setShowOsmLayers] = useState({
    substations: true,
    powerPlants: true,
    powerLines: true,
    boundaries: true
  });
  // Study Area wizard preview: a { locations, links } plan drawn on the map but
  // not yet committed to the model. Null when the wizard isn't previewing.
  const [planPreview, setPlanPreview] = useState(null);
  // Map geometry for the preview overlay (endpoints resolved from plan node ids).
  // Declared here (before the Leaflet/deck.gl layer effects that read it).
  const planPreviewGeo = useMemo(() => {
    if (!planPreview) return null;
    const byId = {};
    planPreview.locations.forEach(l => { byId[l.id] = l; });
    const nodes = planPreview.locations.map(l => ({
      position: [l.longitude, l.latitude], kind: l.metadata.kind, name: l.name,
    }));
    const links = [];
    planPreview.links.forEach(k => {
      const a = byId[k.from]; const b = byId[k.to];
      if (!a || !b) return;
      links.push({
        path: [[a.longitude, a.latitude], [b.longitude, b.latitude]],
        kind: k.metadata.kind,
      });
    });
    return { nodes, links };
  }, [planPreview]);
  
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

  // Escape exits Add mode (only when no location dialog is open)
  useEffect(() => {
    if (mode !== 'add') return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !showLocationDialog) {
        setMode(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, showLocationDialog]);

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
  const { techTemplates: liveTechTemplates, isLive: isApiLive } = useLiveTechTemplates();
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
    longitude: 12.9576,   // Deggendorf, Germany
    latitude: 48.8372,
    zoom: 8,
    pitch: 0,
    bearing: 0
  });
  const [currentStyle, setCurrentStyle] = useState('streets');
  const [showLayerSelector, setShowLayerSelector] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState(null);
  const [webglErrorMsg, setWebglErrorMsg] = useState('');
  const deckRef = useRef(null);
  const leafletMapRef = useRef(null);
  const leafletContainerRef = useRef(null);
  const leafletOsmLayerRef = useRef(null);
  const leafletCandidateLayerRef = useRef(null);
  // True while neighbour candidates are being fetched — drives the breathing
  // "calculating surrounding areas" contour + badge.
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  // "Calculating" = fetching the grid OR the surrounding areas. Drives the
  // breathing/glowing contour + badge.
  const calculating = osmLoading || candidatesLoading;
  const candidatesLoadingRef = useRef(false);
  candidatesLoadingRef.current = calculating;
  // 0..1 pulse for the animated deck.gl glow contour (Leaflet uses CSS instead).
  const [contourPulse, setContourPulse] = useState(0);
  useEffect(() => {
    if (!calculating) { setContourPulse(0); return undefined; }
    let raf; let last = 0; const start = performance.now();
    const tick = (t) => {
      if (t - last >= 50) { // ~20fps is plenty for a breathing effect
        setContourPulse((Math.sin(((t - start) / 1000) * Math.PI) + 1) / 2);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [calculating]);
  const iconCache = useRef(new Map());
  const selectedForDragRef = useRef(null);
  
  // Model Configuration States
  const [modelConfig, setModelConfig] = useState({
    name: '',
    calliopeVersion: '0.6.8',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    resolution: '60min',
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

  useEffect(() => {
    const available = canCreateWebGLContext();
    setWebglAvailable(available);
    if (!available) {
      setWebglErrorMsg(webglUnavailableMessage());
    }
  }, []);

  useEffect(() => {
    if (webglAvailable !== false || !leafletContainerRef.current) return;
    let destroyed = false;

    const clearLeafletMap = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };

    import('leaflet').then(({ default: leaflet }) => {
      if (destroyed || !leafletContainerRef.current) return;
      const L = leaflet;
      clearLeafletMap();

      const map = L.map(leafletContainerRef.current, {
        zoomControl: true,
        preferCanvas: true,
      });
      leafletMapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      const tempLocations = locationManager.tempLocations || [];
      const tempLinks = locationManager.tempLinks || [];
      const boundsPoints = [];

      tempLocations.forEach(loc => {
        boundsPoints.push([loc.latitude, loc.longitude]);
        const techCount = Object.keys(loc.techs || {}).length;
        L.circleMarker([loc.latitude, loc.longitude], {
          radius: 7,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map).bindPopup(`<b>${loc.name || 'Location'}</b><br/>${techCount} tech${techCount === 1 ? '' : 's'}`);
      });

      tempLinks.forEach(link => {
        const fromLoc = tempLocations.find(loc => loc.id === link.from);
        const toLoc = tempLocations.find(loc => loc.id === link.to);
        if (!fromLoc || !toLoc) return;
        boundsPoints.push([fromLoc.latitude, fromLoc.longitude], [toLoc.latitude, toLoc.longitude]);
        L.polyline([
          [fromLoc.latitude, fromLoc.longitude],
          [toLoc.latitude, toLoc.longitude],
        ], {
          color: '#94a3b8',
          weight: 2,
          opacity: 0.8,
        }).addTo(map);
      });

      // NOTE: the selected-region boundary is NOT drawn here — it's managed by a
      // separate incremental effect so a boundary/view change doesn't rebuild the
      // whole map (which was wiping the power layers right after they loaded).
      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 6);
      } else if (boundsPoints.length > 1) {
        map.fitBounds(boundsPoints, { padding: [40, 40], maxZoom: 14 });
      } else {
        map.setView([viewState.latitude, viewState.longitude], viewState.zoom || 4);
      }

      map.on('click', (event) => {
        handleMapClickWithModal(
          { coordinate: [event.latlng.lng, event.latlng.lat], object: null, layer: { id: 'leaflet-base' } },
          { srcEvent: { button: 0 } }
        );
      });
    }).catch((err) => {
      console.error('Creation Leaflet fallback failed:', err);
      setWebglErrorMsg(err?.message || 'Leaflet fallback map failed to initialize');
    });

    return () => {
      destroyed = true;
      clearLeafletMap();
    };
    // Boundary + viewState intentionally excluded — they're handled by separate
    // incremental effects so they don't rebuild (and wipe) the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglAvailable, mapReady, locationManager.tempLocations, locationManager.tempLinks, handleMapClickWithModal]);

  // Draw the selected-region boundary on the Leaflet map incrementally (its own
  // layer, so updating it doesn't rebuild the base map / wipe other overlays).
  const leafletBoundaryLayerRef = useRef(null);
  useEffect(() => {
    if (webglAvailable !== false) return undefined;
    let cancelled = false;
    import('leaflet').then(({ default: L }) => {
      const map = leafletMapRef.current;
      if (cancelled || !map) return;
      if (leafletBoundaryLayerRef.current) {
        leafletBoundaryLayerRef.current.remove();
        leafletBoundaryLayerRef.current = null;
      }
      if (showOsmLayers.boundaries === false) return;
      if (!selectedRegionBoundary?.features?.length) return;
      const layer = L.geoJSON(selectedRegionBoundary, {
        style: { color: '#1d4ed8', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 0.32 },
      }).addTo(map);
      leafletBoundaryLayerRef.current = layer;
      // If we're already calculating surrounding areas, start the breathing glow
      // now (the layer is created async, after the toggle effect may have run).
      if (candidatesLoadingRef.current) {
        try {
          layer.eachLayer(l => {
            const el = l.getElement && l.getElement();
            if (el) el.classList.add('tempo-breathing-contour');
          });
        } catch { /* ignore */ }
      }
      try {
        const bnds = layer.getBounds();
        if (bnds.isValid()) map.fitBounds(bnds, { padding: [30, 30], maxZoom: 14 });
      } catch { /* ignore invalid bounds */ }
    }).catch(() => { /* leaflet import handled elsewhere */ });
    return () => { cancelled = true; };
  }, [webglAvailable, selectedRegionBoundary, showOsmLayers.boundaries]);

  // Draw the Study Area wizard preview plan on the Leaflet map (its own layer).
  const leafletPlanPreviewLayerRef = useRef(null);
  useEffect(() => {
    if (webglAvailable !== false) return undefined;
    let cancelled = false;
    import('leaflet').then(({ default: L }) => {
      const map = leafletMapRef.current;
      if (cancelled || !map) return;
      if (leafletPlanPreviewLayerRef.current) {
        leafletPlanPreviewLayerRef.current.remove();
        leafletPlanPreviewLayerRef.current = null;
      }
      if (!planPreviewGeo) return;
      const rgb = c => `rgb(${(c || [148, 163, 184]).join(',')})`;
      const group = L.layerGroup();
      planPreviewGeo.links.forEach(k => {
        L.polyline(k.path.map(([lon, lat]) => [lat, lon]), {
          color: rgb(PLAN_COLORS[k.kind]), weight: 3, opacity: 0.95,
        }).addTo(group);
      });
      // Only the new transmission junctions get a dot; substation/plant nodes sit
      // on the existing OSM markers.
      planPreviewGeo.nodes.filter(n => n.kind === 'transmission_node').forEach(n => {
        L.circleMarker([n.position[1], n.position[0]], {
          radius: 3.5, color: rgb(PLAN_COLORS[n.kind]), weight: 2, fillColor: '#fff', fillOpacity: 0.95,
        }).addTo(group);
      });
      group.addTo(map);
      leafletPlanPreviewLayerRef.current = group;
    }).catch(() => { /* leaflet import handled elsewhere */ });
    return () => { cancelled = true; };
  }, [webglAvailable, planPreviewGeo]);

  // Draw OSM power layers on the Leaflet fallback map (the deck.gl path renders
  // them via its own layers). Without this, Leaflet-mode users saw the boundary
  // but no lines/substations/plants.
  useEffect(() => {
    if (webglAvailable !== false) return;
    let cancelled = false;
    import('leaflet').then(({ default: L }) => {
      const map = leafletMapRef.current;
      console.info(`[leaflet] OSM layer effect: map=${!!map}, lines=${osmPowerLines?.features?.length ?? 0}, subs=${osmSubstations?.features?.length ?? 0}, plants=${osmPowerPlants?.features?.length ?? 0}`);
      if (cancelled || !map) return;
      if (leafletOsmLayerRef.current) {
        leafletOsmLayerRef.current.remove();
        leafletOsmLayerRef.current = null;
      }
      const group = L.layerGroup();
      if (filteredPowerLines?.features?.length && layerVisibility.powerLines) {
        L.geoJSON(filteredPowerLines, { style: { color: '#f59e0b', weight: 1.5, opacity: 0.85 } }).addTo(group);
      }
      if (filteredSubstations?.features?.length && layerVisibility.substations) {
        L.geoJSON(filteredSubstations, {
          pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0.9, weight: 1 }),
          style: { color: '#b91c1c', weight: 1, fillColor: '#ef4444', fillOpacity: 0.4 },
        }).addTo(group);
      }
      if (filteredPowerPlants?.features?.length && layerVisibility.powerPlants) {
        L.geoJSON(filteredPowerPlants, {
          pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.9, weight: 1 }),
          style: { color: '#15803d', weight: 1, fillColor: '#22c55e', fillOpacity: 0.4 },
        }).addTo(group);
      }
      group.addTo(map);
      try { group.bringToFront(); } catch { /* keep infra above the boundary fill */ }
      leafletOsmLayerRef.current = group;
    }).catch(() => { /* leaflet import failed elsewhere already */ });
    return () => { cancelled = true; };
  }, [webglAvailable, filteredPowerLines, filteredSubstations, filteredPowerPlants, layerVisibility]);
  
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
            longitude: 12.961127,
            latitude: 48.833195,
            zoom: 3,
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
        longitude: 12.961127,
        latitude: 48.833195,
        zoom: 3,
        pitch: 0,
        bearing: 0,
        transitionDuration: 1000,
        transitionInterpolator: new FlyToInterpolator()
      });
    }
  }, []);
  
  // Load OSM infrastructure data from GeoServer when bbox changes
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const loadOsmData = async () => {
      if (!currentBbox) {
        setOsmSubstations(null);
        setOsmPowerPlants(null);
        setOsmPowerLines(null);
        setOsmCommunes(null);
        setOsmDistricts(null);
        return;
      }
      setOsmLoading(true);
      setOsmLoadingStage('Querying OpenStreetMap for the power grid…');
      try {
        // Fetch power infrastructure directly from Overpass (no backend / PostGIS),
        // clipped to the selected territory polygon(s) so bbox-corner features
        // outside the actual area are dropped.
        const clip = (selectedRegionBoundary?.features || [])
          .map(f => f.geometry)
          .filter(Boolean);
        const data = await fetchPowerLayers(currentBbox, { signal: controller.signal, clip });
        if (cancelled) return;
        const nLines = data.powerLines?.features?.length || 0;
        const nSubs = data.substations?.features?.length || 0;
        const nPlants = data.powerPlants?.features?.length || 0;
        const hadData = (osmPowerLines?.features?.length || 0)
          + (osmSubstations?.features?.length || 0)
          + (osmPowerPlants?.features?.length || 0) > 0;
        // An all-zero result after we already had data almost always means a
        // transient Overpass failure (a mirror returned empty) — keep what we
        // have rather than blanking the map.
        if (nLines + nSubs + nPlants === 0 && hadData) {
          showNotification('Could not refresh the grid (OpenStreetMap returned nothing) — kept the previous data. Try again.', 'warning');
        } else {
          setOsmLoadingStage('Rendering grid on the map…');
          setOsmSubstations(data.substations);
          setOsmPowerPlants(data.powerPlants);
          setOsmPowerLines(data.powerLines);
          setOsmCommunes(null);
          setOsmDistricts(null);
          showNotification(
            `Grid loaded: ${nLines} lines · ${nSubs} substations · ${nPlants} plants`,
            nLines + nSubs + nPlants > 0 ? 'success' : 'warning',
          );
        }
      } catch (error) {
        if (cancelled || error.name === 'AbortError') return;
        console.error('Error loading Overpass data:', error);
        const timedOut = /50\d|429|timeout|aborted|connection/i.test(error.message || '');
        showNotification(
          timedOut
            ? 'OpenStreetMap is busy or the area is too large. Try a smaller region or raise the min-voltage, then reselect.'
            : `Grid load failed: ${error.message}`,
          'error',
        );
        setOsmSubstations(null);
        setOsmPowerPlants(null);
        setOsmPowerLines(null);
      } finally {
        if (!cancelled) { setOsmLoading(false); setOsmLoadingStage(''); }
      }
    };
    loadOsmData();
    return () => { cancelled = true; controller.abort(); };
  }, [currentBbox]);
  
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

    // Live Study Area path: the panel provides the territory boundary + bbox
    // directly (Nominatim). Draw the boundary immediately and set the bbox,
    // which triggers the Overpass grid fetch. Short-circuits the legacy logic.
    if (regionInfo && (regionInfo.clear || regionInfo.bbox) && !regionInfo.continent) {
      setOsmRegionPath(null);
      if (regionInfo.clear) {
        setSelectedRegionBoundary(null);
        setCurrentBbox(null);
        return;
      }
      setSelectedRegionBoundary(regionInfo.boundary || null);
      handleBboxChange(regionInfo.bbox); // sets currentBbox (loads grid) + flies map
      return;
    }

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
      // Guard against a missing/invalid center (e.g. a selection that provided
      // no coordinates) — otherwise the map flies to null-island (0,0).
      if (!Array.isArray(info.center) || info.center.length < 2
          || info.center[0] == null || info.center[1] == null
          || Number.isNaN(Number(info.center[0])) || Number.isNaN(Number(info.center[1]))) {
        return;
      }
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
      
      // Prefer the caller-provided bbox (the region's real extent) so data
      // loads for the whole territory; fall back to a square around center.
      let bbox = info.bbox;
      if (!bbox) {
        const factor = 1 / Math.pow(2, zoom - 10);
        const delta = 0.5 * factor;
        bbox = {
          minLon: longitude - delta,
          minLat: latitude - delta,
          maxLon: longitude + delta,
          maxLat: latitude + delta,
        };
      }
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
      isNode: loc.isNode,
      // Keep metadata (kind: substation/plant/transmission_node) so the Map View
      // renders these with the same palette/shape as the Creation OSM overlay.
      metadata: loc.metadata || {},
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
        // Per-link transmission capacity (MW) → energy_cap_max on Calliope export.
        capacity: link.capacity ?? null,
        linkType: link.linkType || null,
        carrier: link.carrier || lt?.carrier || 'electricity',
        // Calliope tech key used in techs.yaml and links section
        tech: lt?.calliopeTech || link.tech || link.linkType || 'ac_transmission',
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

    // Carry forward any generated/session timeSeries (e.g. the OSM substation
    // demand CSV). createModel does setTimeSeries(newModel.timeSeries), so if we
    // pass [] here the demand entry is WIPED from context on save. Strip modelId
    // so createModel assigns the new model's id.
    const modelTimeSeries = (timeSeries || [])
      .filter(ts => ts && ts.columns && ts.data && (ts.source === 'osm-demand' || !ts.modelId || ts.modelId === currentModelId))
      // eslint-disable-next-line no-unused-vars
      .map(({ modelId, ...rest }) => rest);

    // Create new model
    createModel(
      modelConfig.name || modelName.trim(),
      finalLocations,
      finalLinks,
      [],
      techsToAdd,
      modelTimeSeries,
      {
        description: `Model created in Creation mode with ${locationManager.tempLocations.length} locations and ${locationManager.tempLinks.length} links`,
        createdInCreationMode: true,
        modelConfig: {
          calliopeVersion: modelConfig.calliopeVersion,
          startDate: modelConfig.startDate,
          endDate: modelConfig.endDate,
          resolution: modelConfig.resolution,
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

    // Take the user straight to the Map View to inspect the saved model.
    onNavigate?.('Map View');
  }, [modelName, locationManager, modelConfig, techMap, createModel, showNotification, timeSeries, currentModelId, onNavigate]);
  
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
  const importMeshAsLocations = useCallback((meshArg) => {
    const mesh = (meshArg && meshArg.nodes) ? meshArg : generatedMesh;
    if (!mesh) {
      showNotification('No mesh generated yet', 'warning');
      return;
    }

    const baseTimestamp = Date.now();
    const meshLocations = mesh.nodes.map((node, index) => ({
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
    mesh.nodes.forEach((node, index) => {
      nodeIdToLocationId[node.id] = baseTimestamp + index;
    });

    const meshLinks = mesh.edges.map((edge, index) => {
      const fromLocationId = nodeIdToLocationId[edge.from];
      const toLocationId = nodeIdToLocationId[edge.to];
      const fromNode = mesh.nodes.find(n => n.id === edge.from);
      const toNode = mesh.nodes.find(n => n.id === edge.to);
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

  // Staged network builder driven by the Study Area wizard. Builds a CONNECTED
  // network plan (nodes + links) from the live dropdown-filtered layers, WITHOUT
  // touching the model — the wizard previews it on the map and only commits at
  // the end. `config` = { transmission:{include}, substations:{include,target,maxKm},
  // plants:{include,target,maxKm} }. Categories (voltages / substation types /
  // plant sources) come from the filters already applied to linesForDisplay /
  // filteredSubstations / filteredPowerPlants.
  //   substations.target: 'transmission' | 'none'
  //   plants.target:      'substation' | 'transmission' | 'none'
  //   *.maxKm:            skip a connection if the nearest target is farther (0/undef = no limit)
  const buildStudyAreaPlan = useCallback((config = {}) => {
    // Representative point [lon,lat] for a geometry (node or area).
    const repPoint = (geom) => {
      if (!geom) return null;
      if (geom.type === 'Point') return geom.coordinates;
      const flat = [];
      const walk = (c) => { if (typeof c[0] === 'number') flat.push(c); else c.forEach(walk); };
      walk(geom.coordinates);
      if (!flat.length) return null;
      const s = flat.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
      return [s[0] / flat.length, s[1] / flat.length];
    };
    // Nearest node in `arr` ({ id, name, lat, lon }) within maxKm, or null.
    const nearestWithin = (lat, lon, arr, maxKm) => {
      let best = null; let bd = Infinity;
      for (const n of arr) {
        const d = calculateDistance(lat, lon, n.lat, n.lon);
        if (d < bd) { bd = d; best = n; }
      }
      if (!best) return null;
      if (maxKm && bd > maxKm) return null;
      return { id: best.id, name: best.name, d: bd };
    };
    const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    const tx = config.transmission || {};
    const su = config.substations || {};
    const pl = config.plants || {};

    const base = Date.now();
    let seq = 0;
    const nextId = () => base + (seq++);
    const locations = [];
    const links = [];
    const transNodes = [];  // { id, name, lat, lon }
    const subNodes = [];    // { id, name, lat, lon }

    // 1) Transmission backbone from the selected voltage lines.
    if (tx.include !== false && linesForDisplay?.features?.length) {
      try {
        const mesh = generatePowerMesh(linesForDisplay, {
          deduplicationThreshold: 0.5, snapThreshold: 0.5, minVoltage: 0, maxVoltage: 1000,
        });
        if (mesh?.success && mesh.nodes?.length) {
          const nodeIdToLoc = {};
          let txCounter = 0;
          mesh.nodes.forEach(node => {
            const id = nextId();
            txCounter += 1;
            // Keep a real OSM name if the mesh found one; otherwise "Grid_node_N".
            const named = node.name && node.name !== 'Unknown' && !/^Node_/.test(node.name);
            const name = named ? node.name : `Grid_node_${txCounter}`;
            nodeIdToLoc[node.id] = id;
            locations.push({
              id, name, latitude: node.latitude, longitude: node.longitude,
              techs: {}, isNode: true,
              metadata: { fromOSM: true, kind: 'transmission_node', voltage: node.voltage, clusterSize: node.clusterSize },
            });
            transNodes.push({ id, name, lat: node.latitude, lon: node.longitude });
          });
          mesh.edges.forEach(edge => {
            const from = nodeIdToLoc[edge.from]; const to = nodeIdToLoc[edge.to];
            if (from == null || to == null) return;
            const fromNode = mesh.nodes.find(n => n.id === edge.from);
            const toNode = mesh.nodes.find(n => n.id === edge.to);
            const dist = edge.realDistance || edge.distance;
            links.push({
              id: nextId(), from, to, fromName: fromNode?.name, toName: toNode?.name,
              distance: dist.toFixed(2), linkType: GRID_LINK_TYPE, carrier: 'electricity',
              metadata: { kind: 'transmission_link' },
            });
          });
        }
      } catch (e) {
        console.error('Line mesh build failed:', e);
      }
    }

    // 2) Substations → nodes (with a transformer tech), wired to the grid if asked.
    if (su.include !== false) {
      const target = su.target || 'transmission';
      let subCounter = 0;
      const subLocs = [];
      (filteredSubstations?.features || []).forEach(f => {
        const pt = repPoint(f.geometry); if (!pt) return;
        const grid = f.properties?.substation || 'substation';
        const id = nextId();
        subCounter += 1;
        // Prefer the real OSM name; otherwise an identifier "<what it is>_<n>".
        const gridLabel = grid && grid !== 'substation' ? `${cap(grid)}_substation` : 'Substation';
        const name = f.properties?.name || `${gridLabel}_${subCounter}`;
        // Substation node carries a transformer/conversion tech so it isn't empty.
        const techs = {
          [SUBSTATION_TECH_ID]: {
            constraints: {},
            essentials: { carrier_in: 'electricity', carrier_out: 'electricity' },
            metadata: { fromOSM: true, grid },
          },
        };
        const loc = {
          id, name, latitude: pt[1], longitude: pt[0], techs, isNode: true,
          metadata: { fromOSM: true, kind: 'substation', grid, voltageKv: f.properties?.voltage_kv ?? null },
        };
        locations.push(loc);
        subLocs.push(loc);
        subNodes.push({ id, name, lat: pt[1], lon: pt[0] });
        if (target === 'transmission' && transNodes.length) {
          const near = nearestWithin(pt[1], pt[0], transNodes, su.maxKm);
          if (near) links.push({
            id: nextId(), from: id, to: near.id, fromName: name, toName: near.name,
            distance: near.d.toFixed(2), linkType: GRID_LINK_TYPE, carrier: 'electricity',
            metadata: { kind: 'substation_to_transmission' },
          });
        }
      });
      // Optional: estimate an electricity demand from the study-area population,
      // split across the substations (evenly, or weighted by voltage as a size
      // proxy). They're the withdrawal points. A flat scalar is set here; a shaped
      // timeseries replaces it on commit (commitStudyAreaPlan).
      const dm = su.demand || {};
      if (dm.enabled && subLocs.length) {
        const population = (studyArea?.units || []).reduce((s, u) => s + (Number(u.population) || 0), 0);
        const perCapita = Number(dm.perCapitaKWh) || 0;
        if (population > 0 && perCapita > 0) {
          const totalAvgMW = (population * perCapita) / 1000 / HOURS_PER_YEAR; // kWh/yr → avg MW
          const byVoltage = (dm.weightBy || 'even') === 'voltage';
          let weights = subLocs.map(l => (byVoltage ? (Number(l.metadata?.voltageKv) || 0) : 1));
          if (weights.reduce((a, b) => a + b, 0) <= 0) weights = subLocs.map(() => 1); // no voltages → even
          const sumW = weights.reduce((a, b) => a + b, 0);
          subLocs.forEach((loc, i) => {
            const mw = totalAvgMW * weights[i] / sumW;
            if (mw > 0) {
              loc.techs.power_demand = {
                constraints: { resource: -Number(mw.toFixed(4)), force_resource: true },
                essentials: { carrier: 'electricity' },
                metadata: { estimatedFromPopulation: true, perCapitaKWh: perCapita, avgMW: Number(mw.toFixed(4)) },
              };
            }
          });
        }
      }
    }

    // 3) Plants → nodes, connected to the nearest substation / transmission node.
    if (pl.include !== false) {
      const target = pl.target || 'substation';
      const anchors = target === 'transmission' ? transNodes : target === 'substation' ? subNodes : [];
      const linkKind = target === 'transmission' ? 'plant_to_transmission' : 'plant_to_substation';
      let plantCounter = 0;
      (filteredPowerPlants?.features || []).forEach(f => {
        const pt = repPoint(f.geometry); if (!pt) return;
        const src = f.properties?.plant_source || parseSource(f.properties);
        const capMW = f.properties?.capacity_mw ?? parseCapacityMW(f.properties);
        const techId = OSM_SOURCE_TO_TECH[src] || null;
        const techs = {};
        if (techId) {
          techs[techId] = {
            constraints: { energy_cap_equals: capMW ?? 0 },
            essentials: { carrier: 'electricity' },
            metadata: { fromOSM: true, source: src, estimated: capMW == null },
          };
        }
        const id = nextId();
        plantCounter += 1;
        // Prefer the real OSM name; otherwise an identifier "<source>_plant_<n>".
        const srcLabel = src && src !== 'unknown' ? cap(src) : 'Unknown';
        const name = f.properties?.name || `${srcLabel}_plant_${plantCounter}`;
        locations.push({
          id, name, latitude: pt[1], longitude: pt[0], techs, isNode: false,
          metadata: { fromOSM: true, kind: 'plant', source: src, capacityMW: capMW },
        });
        if (anchors.length) {
          const near = nearestWithin(pt[1], pt[0], anchors, pl.maxKm);
          if (near) links.push({
            id: nextId(), from: id, to: near.id, fromName: name, toName: near.name,
            distance: near.d.toFixed(2), linkType: GRID_LINK_TYPE, carrier: 'electricity',
            metadata: { kind: linkKind },
          });
        }
      });
    }

    return { locations, links };
  }, [linesForDisplay, filteredSubstations, filteredPowerPlants, studyArea]);

  // Wizard: recompute the preview plan + per-layer counts whenever the wizard
  // config OR the underlying dropdown-filtered layers change. The panel writes
  // `studyBuildConfig` into context; here we build the plan (drawn on the map,
  // not yet committed) and publish `planSummary` back for the panel to show.
  useEffect(() => {
    if (!studyBuildConfig) { setPlanPreview(null); setPlanSummary(null); return; }
    const plan = buildStudyAreaPlan(studyBuildConfig);
    setPlanPreview((plan.locations.length || plan.links.length) ? plan : null);
    const c = { txNodes: 0, txLinks: 0, subNodes: 0, subLinks: 0, plantNodes: 0, plantLinks: 0 };
    for (const l of plan.locations) {
      if (l.metadata.kind === 'transmission_node') c.txNodes++;
      else if (l.metadata.kind === 'substation') c.subNodes++;
      else if (l.metadata.kind === 'plant') c.plantNodes++;
    }
    for (const k of plan.links) {
      if (k.metadata.kind === 'transmission_link') c.txLinks++;
      else if (k.metadata.kind === 'substation_to_transmission') c.subLinks++;
      else c.plantLinks++;
    }
    setPlanSummary(c);
  }, [studyBuildConfig, buildStudyAreaPlan, setPlanSummary]);

  // Wizard: commit the previewed plan into the model (final step) and reset.
  const commitStudyAreaPlan = useCallback(async () => {
    const plan = planPreview;
    if (!plan || !plan.locations.length) {
      showNotification('Nothing to import — every step was skipped or empty.', 'warning');
      return;
    }
    // Register the substation conversion tech + the demand tech in the model if
    // any node uses them (so every engine can resolve their parent).
    const toRegister = [];
    if (plan.locations.some(l => l.techs?.[SUBSTATION_TECH_ID]) && !technologies.some(t => t.id === SUBSTATION_TECH_ID)) {
      toRegister.push(SUBSTATION_TECH_DEF);
    }
    if (plan.locations.some(l => l.techs?.[POWER_DEMAND_TECH_ID]) && !technologies.some(t => t.id === POWER_DEMAND_TECH_ID)) {
      toRegister.push(POWER_DEMAND_TECH_DEF);
    }
    if (toRegister.length) setTechnologies(prev => [...prev, ...toRegister]);

    // Turn the substation demand into a generated timeseries when a non-flat load
    // shape (or sector mix) was chosen. The shape comes from demandlib (BDEW SLPs)
    // when installed, else a synthetic fallback — both NORMALISED (mean ≈ 1). We
    // write ABSOLUTE demand (shape × avgMW, negative MW) so every engine that
    // resolves a `file=` ref gets the right magnitude without engine-specific
    // scaling; substations sharing a magnitude share one CSV column (even split →
    // 1 column; voltage split → a few).
    const demandCfg = studyBuildConfig?.substations?.demand || {};
    const sectors = demandCfg.sectors && Object.keys(demandCfg.sectors).length
      ? demandCfg.sectors
      : (demandCfg.profile && demandCfg.profile !== 'flat' ? { [demandCfg.profile]: 1 } : null);
    const resolution = demandCfg.resolution || modelConfig.resolution || '60min';
    const demandSubs = plan.locations.filter(l => l.techs?.power_demand?.metadata?.estimatedFromPopulation);
    let demandNote = '';
    if (sectors && demandSubs.length) {
      const latitude = demandSubs.reduce((s, l) => s + (l.latitude || 0), 0) / demandSubs.length;
      const { datetimes, values, source } = await getDemandShape({
        start: modelConfig.startDate, end: modelConfig.endDate,
        resolution, sectors, country: demandCfg.country, family: demandCfg.family, latitude,
      });
      if (values?.length) {
        const fileName = 'osm_substation_demand.csv';
        const { columns, dataColumns, data, colBySub, groups } = buildDemandColumns({
          datetimes, values,
          subs: demandSubs.map(l => ({ name: l.name, mw: l.techs.power_demand.metadata.avgMW || 0 })),
        });
        // Carry the build config on the entry so it can be regenerated later (from
        // the TimeSeries panel) when the model dates or resolution change.
        // modelId/id/source are REQUIRED for the entry to appear in the TimeSeries
        // panel (which filters by ts.modelId === currentModel.id). csvContent is
        // REQUIRED to survive a backend save/reload — prepareModelForBackend strips
        // `data` and re-parses it from csvContent on load.
        const csvContent = [columns.join(','), ...data.map(r => columns.map(c => r[c]).join(','))].join('\n');
        const tsEntry = {
          id: `${currentModelId || 'model'}_osm_substation_demand`,
          modelId: currentModelId || null,
          source: 'osm-demand',
          name: 'osm_substation_demand', fileName, columns, dateColumn: 'datetime', dataColumns, data, csvContent,
          rowCount: data.length,
          demandConfig: { sectors, country: demandCfg.country, family: demandCfg.family, resolution, latitude, source, groups },
        };
        setTimeSeries(prev => [...(prev || []).filter(t => (t.fileName || t.name) !== fileName), tsEntry]);
        demandSubs.forEach((l, i) => {
          // Absolute series → no resource_scale (portable across Calliope & PyPSA).
          l.techs.power_demand.constraints = { resource: `file=${fileName}:${colBySub[i]}`, force_resource: true };
          l.techs.power_demand.metadata = {
            ...l.techs.power_demand.metadata, sectors, source, resolution, timeseriesFile: fileName,
          };
        });
        // Record the resolution on the model so later timeseries share it.
        if (modelConfig.resolution !== resolution) setModelConfig(prev => ({ ...prev, resolution }));
        const nCols = dataColumns.length;
        demandNote = ` · generated a ${source} demand timeseries (${values.length} steps, ${nCols} column${nCols > 1 ? 's' : ''}) on ${demandSubs.length} substations`;
      }
    }

    locationManager.importMultipleLocations(plan.locations);
    if (plan.links.length) locationManager.importMultipleLinks(plan.links);
    setPlanPreview(null);
    setPlanSummary(null);
    setStudyBuildConfig(null);
    showNotification(`Imported ${plan.locations.length} nodes and ${plan.links.length} links into the model${demandNote}.`, 'success');
  }, [planPreview, locationManager, showNotification, setPlanSummary, setStudyBuildConfig, technologies, setTechnologies, studyBuildConfig, modelConfig, setModelConfig, setTimeSeries, currentModelId]);

  // Add a neighbouring admin unit (hovered/clicked on the map) to the study area.
  // The panel's unitsKey effect then reloads the boundary + grid for the union.
  const addStudyAreaUnit = useCallback((props) => {
    if (!props || props.osm_id == null) return;
    const osmType = props.osm_type || 'relation';
    const cur = studyArea?.units || [];
    if (cur.some(u => u.osmId === props.osm_id && u.osmType === osmType)) return;
    setStudyArea({
      units: [...cur, {
        osmId: props.osm_id, osmType, name: props.name, adminLevel: props.adminLevel ?? null,
        bbox: props.bbox, centroid: props.centroid, population: null,
      }],
      voltageThreshold: studyArea?.voltageThreshold ?? 0,
    });
    showNotification(`Added ${props.name} to the study area.`, 'success');
  }, [studyArea, setStudyArea, showNotification]);

  // Neighbour candidates: a LIGHT Overpass call finds nearby same-level admin
  // units, then Nominatim fetches their polygons (fillable → hover + click to
  // add). Runs only when the selected-unit set changes.
  const studyAreaUnitKey = (studyArea?.units || []).map(u => `${u.osmType}/${u.osmId}`).join(',');
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const units = studyArea?.units || [];
    if (!units.length) { setCandidateBoundaries(null); setCandidatesLoading(false); return undefined; }
    // Show the "calculating surrounding areas" state from the moment of
    // selection (covers the delay below + the fetch).
    setCandidatesLoading(true);
    // Delay so the primary boundary + grid fetches (Nominatim/Overpass) finish
    // first — otherwise the candidate lookups race them and hit rate limits,
    // making even the selected area fail to appear.
    const timer = setTimeout(() => {
      (async () => {
      try {
        const meta = await fetchNeighborCandidates(units, { signal: controller.signal });
        if (cancelled) return;
        if (!meta.length) { setCandidateBoundaries(null); return; }
        const capped = meta.slice(0, 25);
        const geoms = await fetchGeometries(capped);
        if (cancelled) return;
        const features = capped
          .map(c => {
            const g = geoms[`${c.osmType}/${c.osmId}`];
            return g ? {
              type: 'Feature',
              properties: { osm_id: c.osmId, osm_type: c.osmType, name: c.name, adminLevel: c.adminLevel, bbox: c.bbox, centroid: c.centroid },
              geometry: g,
            } : null;
          })
          .filter(Boolean);
        setCandidateBoundaries(features.length ? { type: 'FeatureCollection', features } : null);
      } catch {
        if (!cancelled) setCandidateBoundaries(null);
      } finally {
        if (!cancelled) setCandidatesLoading(false);
      }
      })();
    }, 2500);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyAreaUnitKey]);

  // Toggle the breathing/glowing contour on the Leaflet boundary paths while
  // surrounding areas are being calculated.
  useEffect(() => {
    if (webglAvailable !== false) return undefined;
    const layer = leafletBoundaryLayerRef.current;
    if (!layer) return undefined;
    const setBreath = (on) => {
      try {
        layer.eachLayer(l => {
          const el = l.getElement && l.getElement();
          if (el) el.classList.toggle('tempo-breathing-contour', on);
        });
      } catch { /* ignore */ }
    };
    setBreath(calculating);
    return () => setBreath(false);
  }, [calculating, selectedRegionBoundary, webglAvailable]);

  // Draw neighbour candidates as DIAGONAL-HATCHED areas (distinct from the solid
  // selected region) on the Leaflet map. Hover highlights, click adds.
  useEffect(() => {
    if (webglAvailable !== false) return undefined;
    let cancelled = false;
    let applyHatch = null;
    import('leaflet').then(({ default: L }) => {
      const map = leafletMapRef.current;
      if (cancelled || !map) return;
      if (leafletCandidateLayerRef.current) {
        leafletCandidateLayerRef.current.remove();
        leafletCandidateLayerRef.current = null;
      }
      if (!candidateBoundaries?.features?.length) return;

      // Inject a diagonal-line hatch pattern into the overlay SVG once.
      try {
        const svg = map.getPanes()?.overlayPane?.querySelector('svg');
        if (svg && !svg.querySelector('#candidate-hatch')) {
          const NS = 'http://www.w3.org/2000/svg';
          const defs = document.createElementNS(NS, 'defs');
          defs.innerHTML = '<pattern id="candidate-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#6366f1" stroke-width="1.2" stroke-opacity="0.55"/></pattern>';
          svg.appendChild(defs);
        }
      } catch { /* pattern is best-effort; base fill still shows */ }

      const layer = L.geoJSON(candidateBoundaries, {
        interactive: true,
        // Faint base fill keeps the interior click/hoverable even if the hatch
        // pattern isn't applied; the hatch overrides the fill visually.
        style: { color: '#6366f1', weight: 1, dashArray: '4 4', fillColor: '#6366f1', fillOpacity: 0.05 },
        onEachFeature: (feature, lyr) => {
          lyr.bindTooltip(`➕ Click to add ${feature.properties?.name || 'this region'}`, { sticky: true });
          lyr.on('mouseover', () => lyr.setStyle({ weight: 2.5, color: '#4f46e5' }));
          lyr.on('mouseout', () => lyr.setStyle({ weight: 1, color: '#6366f1' }));
          lyr.on('click', (e) => {
            if (e.originalEvent) e.originalEvent.stopPropagation();
            addStudyAreaUnit(feature.properties);
          });
        },
      });
      layer.addTo(map);
      leafletCandidateLayerRef.current = layer;

      // Point each candidate path's fill at the hatch pattern (re-applied on
      // zoom because Leaflet recreates the path elements).
      applyHatch = () => {
        try {
          layer.eachLayer(l => {
            const el = l.getElement && l.getElement();
            if (el) { el.setAttribute('fill', 'url(#candidate-hatch)'); el.setAttribute('fill-opacity', '1'); }
          });
        } catch { /* ignore */ }
      };
      applyHatch();
      map.on('zoomend', applyHatch);
    }).catch(() => { /* leaflet import handled elsewhere */ });
    return () => {
      cancelled = true;
      try { if (applyHatch && leafletMapRef.current) leafletMapRef.current.off('zoomend', applyHatch); } catch { /* ignore */ }
    };
  }, [webglAvailable, candidateBoundaries, addStudyAreaUnit]);

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
    window.commitStudyAreaPlan = commitStudyAreaPlan;
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
      delete window.commitStudyAreaPlan;
      delete window.exportMesh;
      delete window.toggleMeshVisibility;
      delete window.clearMesh;
      delete window.generatedMeshExists;
      delete window.meshStatistics;
    };
  }, [generateMeshFromLines, importMeshAsLocations, commitStudyAreaPlan, exportMesh, generatedMesh, showNotification]);

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
      <CreationSidebar
        clearAll={clearAll}
        currentLinkType={currentLinkType}
        leftSidebarCollapsed={leftSidebarCollapsed}
        linksExpanded={linksExpanded}
        locationManager={locationManager}
        locationsExpanded={locationsExpanded}
        mode={mode}
        polylineMode={polylineMode}
        setCurrentLinkType={setCurrentLinkType}
        setLeftSidebarCollapsed={setLeftSidebarCollapsed}
        setLinksExpanded={setLinksExpanded}
        setLocationsExpanded={setLocationsExpanded}
        setMode={setMode}
        setPendingLocation={setPendingLocation}
        setShowLocationDialog={setShowLocationDialog}
        setShowSaveDialog={setShowSaveDialog}
        showNotification={showNotification}
      />

      {/* Main Map View */}
      <div className="flex-1 relative">
        {/* Prominent, always-visible Save action (shows once there's something to save) */}
        {locationManager.tempLocations.length > 0 && (
          <button
            onClick={() => setShowSaveDialog(true)}
            className="absolute top-4 right-4 z-[600] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-lg ring-1 ring-emerald-700/40 hover:bg-emerald-700 transition-colors"
            title="Save this model and open it in the Map View"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save model ({locationManager.tempLocations.length})
          </button>
        )}
        {/* Breathing badge while calculating; the contour glows around the area */}
        {calculating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none">
            <div className="tempo-calc-badge flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-600/95 text-white text-xs font-medium shadow-lg">
              <span className="inline-block w-2 h-2 rounded-full bg-white animate-ping" />
              {osmLoading
                ? 'Calculating power lines, substations & plants…'
                : 'Getting the surrounding regions…'}
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {geoServerLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg p-6 shadow-xl">
              <div className="flex items-center space-x-3">
                <div className="animate-spin h-8 w-8 border-4 border-gray-500 border-t-transparent rounded-full"></div>
                <span className="text-lg font-semibold text-gray-800">Loading infrastructure data...</span>
              </div>
            </div>
          </div>
        )}

        {mapReady && webglAvailable !== false && (
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
            onError={(error) => {
              const msg = error?.message || error?.statusMessage || 'Failed to initialize WebGL';
              if (/webgl|gl context|webglcontextcreationerror|FEATURE_FAILURE_EGL_NO_CONFIG|FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS|Failed to initialize WebGL/i.test(msg)) {
                setWebglAvailable(false);
                setWebglErrorMsg(msg);
                return;
              }
              console.error('Creation map error:', error);
            }}
            layers={[
              // Breathing/glowing contour while calculating (grid + surrounding).
              // A SINGLE rounded ring (no stacked rings → uniform colour, no
              // darker patches where segments overlap). Drawn under the region
              // fill, which masks its inner half so the halo reads OUTSIDE the
              // perimeter. Width/opacity pulse to "breathe".
              ...(calculating && selectedRegionBoundary?.features?.length > 0 ? [
                new GeoJsonLayer({
                  id: 'calc-glow', data: selectedRegionBoundary,
                  stroked: true, filled: false, lineJointRounded: true, lineCapRounded: true,
                  getLineColor: [59, 130, 246, Math.round(80 + contourPulse * 90)], // uniform blue
                  getLineWidth: 12 + contourPulse * 26, // 12→38 px (mostly masked inside)
                  lineWidthUnits: 'pixels',
                  updateTriggers: { getLineColor: contourPulse, getLineWidth: contourPulse },
                  parameters: { depthTest: false },
                  pickable: false,
                }),
              ] : []),
              // Neighbour candidates — filled indigo areas; hover shows a prompt,
              // click adds the region to the study area.
              ...(candidateBoundaries && candidateBoundaries.features?.length > 0 ? [
                new GeoJsonLayer({
                  id: 'neighbor-candidates',
                  data: candidateBoundaries,
                  stroked: true,
                  filled: true,
                  getFillColor: [99, 102, 241, 30], // indigo, low opacity
                  getLineColor: [99, 102, 241, 220],
                  getLineWidth: 2,
                  lineWidthUnits: 'pixels',
                  lineWidthMinPixels: 1.5,
                  parameters: { depthTest: false },
                  pickable: true,
                  autoHighlight: true,
                  highlightColor: [79, 70, 229, 90],
                  onHover: (info) => {
                    if (info.object) {
                      setHoveredInfo({
                        name: `➕ Click to add ${info.object.properties?.name || 'this region'}`,
                        layerType: 'Neighbour region',
                        details: [],
                        x: info.x, y: info.y,
                      });
                    } else {
                      setHoveredInfo(null);
                    }
                  },
                  onClick: (info) => { if (info.object) addStudyAreaUnit(info.object.properties); },
                }),
              ] : []),
              // Selected Region Territory Overlay (shown first so it appears under infrastructure)
              ...(selectedRegionBoundary && selectedRegionBoundary.features?.length > 0 && showOsmLayers.boundaries ? [
                new GeoJsonLayer({
                  id: 'selected-region-overlay',
                  data: selectedRegionBoundary,
                  filled: true,
                  stroked: true,
                  getFillColor: [59, 130, 246, 110], // masks the glow's inner half
                  getLineColor: [30, 60, 114, 220], // Dark blue border
                  getLineWidth: 3,
                  lineWidthUnits: 'pixels',
                  lineWidthMinPixels: 2,
                  lineWidthMaxPixels: 5,
                  // Don't write depth — otherwise this filled polygon occludes the
                  // point/line layers drawn after it (plants/substations look faded).
                  parameters: { depthTest: false },
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
                      const source = props.plant_source || props.source || 'unknown';
                      const cap = props.capacity_mw;
                      setHoveredInfo({
                        name: props.name || 'Power Plant',
                        layerType: 'Power Plant',
                        accentColor: source && source !== 'unknown' ? getFuelColor(source) : '#6B7280',
                        details: [
                          { label: 'Source', value: source === 'unknown' ? 'Unknown ⚠' : source.charAt(0).toUpperCase() + source.slice(1) },
                          props.plant_method && { label: 'Method', value: props.plant_method },
                          { label: 'Capacity', value: (cap != null) ? `${cap} MW` : 'unknown ⚠' },
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
                      const kv = props.voltage_kv || null;
                      const grid = props.substation; // classified: transmission | distribution | …
                      const gridLabel = grid === 'transmission' ? 'Transmission (HV)'
                        : grid === 'distribution' ? 'Distribution (MV/LV)'
                        : grid ? grid.charAt(0).toUpperCase() + grid.slice(1)
                        : 'Unknown ⚠';
                      setHoveredInfo({
                        name: props.name || 'Substation',
                        layerType: 'Substation',
                        details: [
                          { label: 'Grid', value: gridLabel },
                          kv                    && { label: 'Voltage',   value: `${kv} kV` },
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
                  // Zoom-adaptive in PIXELS: small & non-overlapping when zoomed out
                  // (~6px), growing as you zoom in (~30px). Works for any region size
                  // (a metres footprint would pin to max on small areas). updateTriggers
                  // forces a recompute whenever the zoom changes.
                  getSize: () => Math.max(6, Math.min(30, (viewState.zoom - 5) * 3)),
                  sizeUnits: 'pixels',
                  updateTriggers: { getSize: viewState.zoom },
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
              ] : []),

              // Study Area wizard preview — plan not yet committed to the model.
              // Draw the connection wiring clearly (solid, thick); show dots ONLY
              // for the genuinely-new transmission junctions (substation/plant
              // nodes sit on the existing OSM markers, so drawing them would just
              // double up).
              ...(planPreviewGeo ? [
                new PathLayer({
                  id: 'plan-preview-links',
                  data: planPreviewGeo.links,
                  getPath: d => d.path,
                  getColor: d => [...(PLAN_COLORS[d.kind] || [148, 163, 184]), 255],
                  getWidth: 3,
                  widthUnits: 'pixels',
                  widthMinPixels: 2,
                  capRounded: true,
                  jointRounded: true,
                  parameters: { depthTest: false },
                  updateTriggers: { getColor: planPreviewGeo },
                }),
                new ScatterplotLayer({
                  id: 'plan-preview-nodes',
                  data: planPreviewGeo.nodes.filter(n => n.kind === 'transmission_node'),
                  getPosition: d => d.position,
                  getRadius: 4,
                  radiusUnits: 'pixels',
                  radiusMinPixels: 2,
                  radiusMaxPixels: 7,
                  getFillColor: [255, 255, 255, 230],
                  getLineColor: [...PLAN_COLORS.transmission_node, 255],
                  lineWidthMinPixels: 2,
                  stroked: true,
                  parameters: { depthTest: false },
                  updateTriggers: { data: planPreviewGeo },
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

        {mapReady && webglAvailable === false && (
          <div className="absolute inset-0 z-10">
            <div ref={leafletContainerRef} className="w-full h-full" />
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-lg px-4 py-3 max-w-md">
              <div className="font-semibold text-slate-800 text-sm">Compatibility map mode</div>
              <div className="text-slate-600 text-xs mt-1">
                DeckGL could not create a WebGL context, so Creation is using Leaflet instead.
              </div>
              {webglErrorMsg && (
                <div className="text-slate-500 text-[11px] mt-1 break-words">{webglErrorMsg}</div>
              )}
            </div>
          </div>
        )}

        {/* Hover Tooltip */}
        {hoveredInfo && (
          <HoverTooltip
            hoveredInfo={hoveredInfo}
          />
        )}

        {/* Tech Library toggle button */}
        <button
          onClick={() => setShowTechLibrary(v => !v)}
          className={`absolute top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-md text-[11px] font-semibold transition-colors border ${
            showTechLibrary
              ? 'bg-indigo-600 text-white border-indigo-700'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FiCpu size={12} />
          Tech Library
          {technologies.filter(t => t.uuid).length > 0 && (
            <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ml-0.5 ${
              showTechLibrary ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-600'
            }`}>
              {technologies.filter(t => t.uuid).length}
            </span>
          )}
        </button>

        {/* Tech Library panel */}
        {showTechLibrary && (
          <TechLibraryPanel
            onClose={() => setShowTechLibrary(false)}
            liveTechTemplates={liveTechTemplates}
            isApiLive={isApiLive}
          />
        )}

        {/* Mode Indicator */}
        <div className="absolute bottom-4 left-4 bg-white px-4 py-2 rounded-lg shadow-lg">
          <div className="text-xs text-gray-600 mb-1">Current Mode</div>
          <div className="font-semibold text-gray-800">
            {mode === 'add' && 'Add Location'}
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
          <MapLegends
            layerVisibility={layerVisibility}
            osmPowerLines={osmPowerLines}
            osmPowerPlants={osmPowerPlants}
          />
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
        <SaveModelDialog
          locationManager={locationManager}
          modelConfig={modelConfig}
          modelName={modelName}
          saveToMainData={saveToMainData}
          setModelConfig={setModelConfig}
          setModelName={setModelName}
          setShowSaveDialog={setShowSaveDialog}
        />
      )}

      {/* Location Edit Dialog */}
      <LocationEditDialog
        isOpen={showLocationDialog}
        onClose={() => {
          setShowLocationDialog(false);
          setPendingLocation(null);
        }}
        location={pendingLocation}
        techMap={techMap}
        onSave={(savedLocation) => {
          if (savedLocation.id && locationManager.tempLocations.find(l => l.id === savedLocation.id)) {
            // Update existing location
            locationManager.updateLocation(savedLocation.id, savedLocation);
            showNotification(`Updated location: ${savedLocation.name}`, 'success');
          } else {
            // Add new location with generated ID
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
      />
    </div>
  );
};

export default Creation;
