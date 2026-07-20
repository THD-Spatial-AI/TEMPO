import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, IconLayer, LineLayer } from '@deck.gl/layers';
import { Map as MapGL } from 'react-map-gl/maplibre';
import { useData } from '../context/DataContext';
import { FiLayers, FiPlus, FiLink, FiEye, FiEdit2, FiMapPin, FiTrash2, FiCpu, FiChevronDown, FiChevronRight, FiChevronLeft, FiZoomIn, FiZoomOut, FiMaximize2, FiX, FiCheck, FiHelpCircle, FiArrowRight, FiActivity, FiZap, FiCircle, FiNavigation, FiSave, FiFolder } from 'react-icons/fi';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import { TECH_TEMPLATES, useLiveTechTemplates } from './TechnologiesData';
import { canCreateWebGLContext, webglUnavailableMessage } from '../utils/webglSupport';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions';

import {
  getTechColor, ICON_TYPES, createLocationIcon, getDefaultIconType,
  formatTechName, getVoltageColor, getVoltageWidth, MAP_STYLES,
} from '../utils/mapVisuals';
import DragConfirmDialog from './map/DragConfirmDialog';
import IconSelectorDialog from './map/IconSelectorDialog';
import MapLocationEditDialog from './map/MapLocationEditDialog';
import MapSidebarLists from './map/MapSidebarLists';

const MapDeckGL = () => {
  const { locations, setLocations, links, setLinks, showNotification, technologies, models, currentModelId, loadModel, updateCurrentModel, createModel } = useData();
  const { techTemplates: liveTechTemplates } = useLiveTechTemplates();
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
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [locationsExpanded, setLocationsExpanded] = useState(true);
  const [linksExpanded, setLinksExpanded] = useState(true);
  const [lastPolylineLocation, setLastPolylineLocation] = useState(null);
  const [isNewLocation, setIsNewLocation] = useState(false);
  const [showModelPanel, setShowModelPanel] = useState(false);
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
  const [expandedTechSubcategories, setExpandedTechSubcategories] = useState({});
  const [mapReady, setMapReady] = useState(false);
  const [draggedLocation, setDraggedLocation] = useState(null);
  const [draggingPosition, setDraggingPosition] = useState(null);
  const [pendingDragChange, setPendingDragChange] = useState(null);
  const [showDragConfirmDialog, setShowDragConfirmDialog] = useState(false);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [selectedLocationForIcon, setSelectedLocationForIcon] = useState(null);
  const [isDraggingEnabled, setIsDraggingEnabled] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState(null);
  const [webglErrorMsg, setWebglErrorMsg] = useState('');
  const [webglCompatMode, setWebglCompatMode] = useState(false);
  const [webglRetryAttempted, setWebglRetryAttempted] = useState(false);
  const deckRef = useRef(null);
  const leafletMapRef = useRef(null);
  const leafletContainerRef = useRef(null);

  const toSafeString = useCallback((value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, []);

  const normalizeWebglErrorMessage = useCallback((error) => {
    const raw = toSafeString(error?.message || error?.statusMessage || error);
    if (!raw) return webglUnavailableMessage();
    const trimmed = raw.trim();

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed?.statusMessage === 'string' && parsed.statusMessage.trim()) {
          return parsed.statusMessage.trim();
        }
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
          return parsed.message.trim();
        }
      } catch {
        // Fall through to raw text when message isn't valid JSON
      }
    }

    return trimmed;
  }, [toSafeString]);
  
  // Initialize map after component mount
  useEffect(() => {
    const available = canCreateWebGLContext();
    setWebglAvailable(available);
    if (!available) {
      setWebglErrorMsg(webglUnavailableMessage());
    }
    // Use requestAnimationFrame to initialize after DOM is ready but without delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMapReady(true);
      });
    });
  }, []);

  const deckGlOptions = webglCompatMode
    ? {
        antialias: false,
        alpha: true,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        premultipliedAlpha: true,
        desynchronized: true,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      }
    : {
        antialias: false,
        alpha: true,
        depth: true,
        stencil: true,
        preserveDrawingBuffer: false,
        premultipliedAlpha: true,
        desynchronized: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      };

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
      const locs = locations.filter(loc => loc.latitude && loc.longitude);
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

      const boundsPoints = [];

      locs.forEach(loc => {
        boundsPoints.push([loc.latitude, loc.longitude]);
        const techNames = Object.keys(loc.techs || {});
        const firstTech = loc.techs?.[techNames[0]];
        const color = loc.isNode
          ? (loc.demandProfile || loc.totalDemandMWh ? [244, 67, 54, 255] : [33, 33, 33, 255])
          : getTechColor(firstTech || techNames[0] || '', techMap);
        const marker = L.circleMarker([loc.latitude, loc.longitude], {
          radius: 7,
          color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
          fillColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(map);
        marker.bindPopup(`<b>${loc.name || 'Location'}</b><br/>${techNames.length} tech${techNames.length === 1 ? '' : 's'}`);
      });

      (links || []).forEach(link => {
        const src = locs.find(l => l.id === link.from || l.name === link.from);
        const dst = locs.find(l => l.id === link.to || l.name === link.to);
        if (!src || !dst) return;
        boundsPoints.push([src.latitude, src.longitude], [dst.latitude, dst.longitude]);
        L.polyline([
          [src.latitude, src.longitude],
          [dst.latitude, dst.longitude],
        ], {
          color: '#94a3b8',
          weight: 2,
          opacity: 0.8,
        }).addTo(map);
      });

      map.invalidateSize();
      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 6);
      } else if (boundsPoints.length > 1) {
        map.fitBounds(boundsPoints, { padding: [40, 40], maxZoom: 16 });
      } else {
        map.setView([0, 0], 2);
      }
    }).catch(err => {
      console.error('Leaflet fallback map failed:', err);
    });

    return () => {
      destroyed = true;
      clearLeafletMap();
    };
  }, [webglAvailable, mapReady, locations, links]);
  
  // Create technology map — live API catalog with instance arrays, fallback to static
  const techMap = useMemo(() => {
    const map = {};
    const source = liveTechTemplates && Object.keys(liveTechTemplates).length > 0
      ? liveTechTemplates
      : TECH_TEMPLATES;
    Object.values(source).forEach(categoryTechs => {
      if (Array.isArray(categoryTechs)) {
        categoryTechs.forEach(tech => { map[tech.name] = tech; });
      }
    });
    // Override with model-specific techs but preserve instances from live API
    if (Array.isArray(technologies) && technologies.length > 0) {
      technologies.forEach(tech => {
        const existingInstances = map[tech.name]?.instances;
        map[tech.name] = existingInstances ? { ...tech, instances: existingInstances } : tech;
      });
    }
    return map;
  }, [liveTechTemplates, technologies]);
  
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

  const addTechToDialog = (techName, instanceParams = null) => {
    if (!dialogTechs.includes(techName)) {
      setDialogTechs([...dialogTechs, techName]);
      const techTemplate = techMap[techName];
      if (techTemplate && editingLocation) {
        if (!editingLocation.techs) editingLocation.techs = {};
        const baseTech = {
          parent: techTemplate.parent || 'unknown',
          essentials: { ...techTemplate.essentials },
          constraints: { ...(techTemplate.constraints || {}) },
          costs: { monetary: { ...(techTemplate.costs?.monetary || {}) } }
        };
        // Merge instance-specific params if provided
        if (instanceParams) {
          baseTech.constraints = { ...baseTech.constraints, ...(instanceParams.constraints || {}) };
          baseTech.costs = { monetary: { ...baseTech.costs.monetary, ...(instanceParams.monetary || {}) } };
          baseTech._instance = instanceParams.label;
        }
        editingLocation.techs[techName] = baseTech;
        setEditingLocation({ ...editingLocation });
        // Seed editable constraint/cost rows
        setEditingConstraints(prev => ({ ...prev, [techName]: { ...baseTech.constraints } }));
        setEditingCosts(prev => ({ ...prev, [techName]: { ...baseTech.costs.monetary } }));
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
    if (isNewLocation) return true;
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

  const handleEditLocation = (location, locationIndex, isNew = false) => {
    setIsNewLocation(isNew);
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
      const td = techData || {};
      if (td.constraints) existingConstraints[techName] = td.constraints;
      if (td.essentials) existingEssentials[techName] = td.essentials;
      if (td.costs?.monetary) existingCosts[techName] = td.costs.monetary;
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
    setIsNewLocation(false);
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
  
  // Helper: haversine distance in km between two {latitude, longitude} points
  const calcDistanceKm = (a, b) => {
    const R = 6371;
    const dLat = (b.latitude - a.latitude) * Math.PI / 180;
    const dLon = (b.longitude - a.longitude) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 100) / 100;
  };

  // Handle map click for adding locations
  const handleMapClick = (event) => {
    if (!event.coordinate) return;
    const [longitude, latitude] = event.coordinate;

    if (mode === 'single' || mode === 'add-location') {
      const newLocation = {
        name: `Location ${locations.length + 1}`,
        latitude,
        longitude,
        techs: {},
        isNode: false
      };
      const newLocations = [...locations, newLocation];
      setLocations(newLocations);
      handleEditLocation(newLocation, newLocations.length - 1, true);
      return;
    }

    if (mode === 'multiple') {
      const newLocation = {
        name: `Location ${locations.length + 1}`,
        latitude,
        longitude,
        techs: {},
        isNode: false
      };
      setLocations([...locations, newLocation]);
      showNotification('Location added!', 'success');
      return;
    }

    if (mode === 'polyline') {
      const newLocation = {
        name: `Point ${locations.length + 1}`,
        latitude,
        longitude,
        techs: {},
        isNode: false
      };
      const newLocations = [...locations, newLocation];
      setLocations(newLocations);
      if (lastPolylineLocation) {
        const dist = calcDistanceKm(lastPolylineLocation, newLocation);
        setLinks(prev => [...prev, {
          from: lastPolylineLocation.name,
          to: newLocation.name,
          distance: dist,
          techs: {}
        }]);
      }
      setLastPolylineLocation(newLocation);
      showNotification(`Point added${lastPolylineLocation ? ' and linked' : ''}`, 'success');
      return;
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
    if (mode === 'add-location' || mode === 'single' || mode === 'multiple' || mode === 'polyline') return 'crosshair';
    return 'grab';
  }, [mode]);
  
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
      <div className={`${leftSidebarCollapsed ? 'w-16' : 'w-80'} bg-white border-r border-slate-200 flex flex-col transition-all duration-200 overflow-hidden`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-200 flex items-center gap-1.5 shrink-0">
          {!leftSidebarCollapsed && (
            <h2 className="text-base font-bold text-slate-800 truncate flex-1">Map View</h2>
          )}
          {!leftSidebarCollapsed && (
            <>
              {/* Save current model */}
              <button
                onClick={() => { updateCurrentModel(); showNotification('Model saved!', 'success'); }}
                className="p-1.5 rounded hover:bg-gray-100 text-slate-500 hover:text-gray-700 transition-colors"
                title="Save current model"
              >
                <FiSave size={16} />
              </button>
              {/* Load model panel toggle */}
              <button
                onClick={() => setShowModelPanel(v => !v)}
                className={`p-1.5 rounded transition-colors ${showModelPanel ? 'bg-gray-100 text-gray-700' : 'hover:bg-gray-100 text-slate-500 hover:text-gray-700'}`}
                title="Switch / load model"
              >
                <FiFolder size={16} />
              </button>
            </>
          )}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title={leftSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {leftSidebarCollapsed ? <FiChevronRight size={18} /> : <FiChevronLeft size={18} />}
          </button>
        </div>

        {/* Model Panel */}
        {!leftSidebarCollapsed && showModelPanel && (
          <div className="border-b border-slate-200 bg-slate-50 shrink-0">
            <div className="px-3 pt-2 pb-1">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Saved Models</p>
              {models.length === 0 ? (
                <p className="text-xs text-slate-400 pb-2">No saved models yet</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {models.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { loadModel(m.id); setShowModelPanel(false); showNotification(`Loaded "${m.name}"`, 'success'); }}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        m.id === currentModelId
                          ? 'bg-gray-100 text-gray-800 font-semibold'
                          : 'hover:bg-white text-slate-700'
                      }`}
                    >
                      <span className="truncate block">{m.name}</span>
                      {m.id === currentModelId && <span className="text-gray-500 text-xs">● current</span>}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  const name = prompt('New model name:');
                  if (name) { createModel(name); setShowModelPanel(false); }
                }}
                className="mt-2 mb-1 w-full text-xs text-center py-1.5 rounded border border-dashed border-slate-300 text-slate-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
              >
                + New empty model
              </button>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className={`border-b border-slate-200 shrink-0 ${leftSidebarCollapsed ? 'p-2' : 'p-3'}`}>
          {leftSidebarCollapsed ? (
            /* Collapsed: icon-only column */
            <div className="flex flex-col items-center gap-1.5">
              {[
                { m: 'view', Icon: FiEye, title: 'View' },
                { m: 'single', Icon: FiMapPin, title: 'Single' },
                { m: 'multiple', Icon: FiPlus, title: 'Multiple' },
                { m: 'add-link', Icon: FiLink, title: 'Link' },
                { m: 'polyline', Icon: FiNavigation, title: 'Polyline' },
              ].map(({ m, Icon, title }) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setLinkStart(null); if (m !== 'polyline') setLastPolylineLocation(null); }}
                  title={title}
                  className={`p-2 rounded-lg border-2 w-full flex justify-center transition-all ${
                    mode === m
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 hover:border-gray-400 text-gray-600'
                  }`}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          ) : (
            /* Expanded: full mode grid */
            <>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Mode</label>
              {/* View — full width */}
              <button
                onClick={() => { setMode('view'); setLinkStart(null); setLastPolylineLocation(null); }}
                className={`w-full mb-2 p-2 rounded-lg border-2 flex items-center gap-2 transition-all ${
                  mode === 'view'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 hover:border-gray-400 text-gray-700'
                }`}
              >
                <FiEye size={16} className="shrink-0" />
                <span className="text-xs font-medium">View</span>
              </button>
              {/* 2×2: Single / Multiple / Link / Polyline */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { m: 'single', Icon: FiMapPin, label: 'Single' },
                  { m: 'multiple', Icon: FiPlus, label: 'Multiple' },
                  { m: 'add-link', Icon: FiLink, label: 'Link' },
                  { m: 'polyline', Icon: FiNavigation, label: 'Polyline' },
                ].map(({ m, Icon, label }) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setLinkStart(null); if (m !== 'polyline') setLastPolylineLocation(null); }}
                    className={`p-2.5 rounded-lg border-2 transition-all ${
                      mode === m
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:border-gray-400 text-gray-700'
                    }`}
                  >
                    <Icon className="mx-auto mb-0.5" size={16} />
                    <div className="text-xs font-medium">{label}</div>
                  </button>
                ))}
              </div>
              {/* Hint text */}
              <div className="mt-2 p-2 bg-slate-100 rounded text-xs text-slate-600">
                {mode === 'view' && 'Click a location on the map to view details'}
                {(mode === 'single' || mode === 'add-location') && 'Click the map to add a location and edit it'}
                {mode === 'multiple' && 'Click the map to quickly add multiple locations'}
                {mode === 'add-link' && (linkStart ? `Select destination for link from "${linkStart.name}"` : 'Click a location to start a link')}
                {mode === 'polyline' && (lastPolylineLocation ? `Continue from "${lastPolylineLocation.name}" — click to extend` : 'Click the map to start a polyline chain')}
              </div>
            </>
          )}
        </div>

        {/* Locations & Links List */}
        {!leftSidebarCollapsed && (
          <MapSidebarLists
            handleDeleteLocation={handleDeleteLocation}
            handleEditLocation={handleEditLocation}
            handleLocationSelect={handleLocationSelect}
            links={links}
            linksExpanded={linksExpanded}
            locations={locations}
            locationsExpanded={locationsExpanded}
            selectedLocation={selectedLocation}
            setLinks={setLinks}
            setLinksExpanded={setLinksExpanded}
            setLocations={setLocations}
            setLocationsExpanded={setLocationsExpanded}
            setSelectedLocation={setSelectedLocation}
            setShowTimeseriesSection={setShowTimeseriesSection}
            setTimeseriesFilter={setTimeseriesFilter}
            setTimeseriesPreview={setTimeseriesPreview}
            setTimeseriesSortBy={setTimeseriesSortBy}
            setViewState={setViewState}
            showNotification={showNotification}
            showTimeseriesSection={showTimeseriesSection}
            timeseriesFilter={timeseriesFilter}
            timeseriesPreview={timeseriesPreview}
            timeseriesSortBy={timeseriesSortBy}
            viewState={viewState}
          />
        )}
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 relative">
        {webglAvailable !== false ? (
          <DeckGL
            key={webglCompatMode ? 'deck-compat' : 'deck-default'}
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
            glOptions={deckGlOptions}
            onError={(error) => {
              const msg = normalizeWebglErrorMessage(error);
              if (/webgl|gl context|Failed to initialize WebGL|FEATURE_FAILURE_EGL_NO_CONFIG|FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS/i.test(msg)) {
                if (!webglRetryAttempted) {
                  setWebglRetryAttempted(true);
                  setWebglCompatMode(true);
                  return;
                }
                setWebglAvailable(false);
                setWebglErrorMsg(msg || webglUnavailableMessage());
                return;
              }
              if (!msg.includes('maxTextureDimension2D')) console.error('Deck.gl error:', error);
            }}
          >
            <MapGL 
              mapStyle={MAP_STYLES[currentStyle]}
              attributionControl={false}
              canvasContextAttributes={deckGlOptions}
            />
          </DeckGL>
        ) : (
          <div className="absolute inset-0 z-0">
            <div ref={leafletContainerRef} className="w-full h-full" />
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-lg px-4 py-3 max-w-md z-20">
              <div className="font-semibold text-slate-800 text-sm">Compatibility map mode</div>
              <div className="text-slate-600 text-xs mt-1">
                WebGL failed here, so this map is using Leaflet instead.
              </div>
              {webglErrorMsg && (
                <div className="text-slate-500 text-[11px] mt-1 break-words">{webglErrorMsg}</div>
              )}
            </div>
          </div>
        )}
        
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
                      
                      const td = techData || {};
                      const fmtVal = (v) => {
                        if (v === null || v === undefined) return '—';
                        if (typeof v === 'number') return isFinite(v) ? v.toFixed(2) : String(v);
                        if (typeof v === 'object') return JSON.stringify(v);
                        return String(v);
                      };
                      return (
                        <div key={techName} className={`text-xs py-2 px-2 ${bgColor} rounded mb-1 border ${borderColor}`}>
                          <div className={`font-medium ${textColor}`}>{techName}</div>
                          {td.constraints && Object.keys(td.constraints).length > 0 && (
                            <div className="text-slate-600 mt-1 space-y-0.5">
                              {Object.entries(td.constraints).slice(0, 5).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium">{key}:</span> {fmtVal(value)}
                                </div>
                              ))}
                              {Object.keys(td.constraints).length > 5 && (
                                <div className="text-slate-500 italic">+ {Object.keys(td.constraints).length - 5} more...</div>
                              )}
                            </div>
                          )}
                          {td.costs && Object.keys(td.costs).length > 0 && (
                            <div className="text-slate-600 mt-1 pt-1 border-t border-slate-200">
                              <div className="font-medium text-xs">Costs:</div>
                              {Object.entries(td.costs).slice(0, 3).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium">{key}:</span> {fmtVal(value)}
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
        <DragConfirmDialog
          locations={locations}
          pendingDragChange={pendingDragChange}
          setShowDragConfirmDialog={setShowDragConfirmDialog}
          setPendingDragChange={setPendingDragChange}
          setLocations={setLocations}
          showNotification={showNotification}
        />
      )}
      
      {/* Icon Selector Dialog */}
      {showIconSelector && selectedLocationForIcon && (
        <IconSelectorDialog
          selectedLocationForIcon={selectedLocationForIcon}
          locations={locations}
          setLocations={setLocations}
          setShowIconSelector={setShowIconSelector}
          setSelectedLocationForIcon={setSelectedLocationForIcon}
          showNotification={showNotification}
        />
      )}
      
      {/* Full Edit Location Dialog with Technology Management */}
      {showEditDialog && editingLocation && (
        <MapLocationEditDialog
          addTechToDialog={addTechToDialog}
          constraintCsvFiles={constraintCsvFiles}
          constraintSearch={constraintSearch}
          costSearch={costSearch}
          dialogTechs={dialogTechs}
          editingConstraints={editingConstraints}
          editingCosts={editingCosts}
          editingEssentials={editingEssentials}
          editingLocation={editingLocation}
          expandedSections={expandedSections}
          expandedTechConstraints={expandedTechConstraints}
          expandedTechSubcategories={expandedTechSubcategories}
          handleConstraintCsvUpload={handleConstraintCsvUpload}
          handleTechCsvUpload={handleTechCsvUpload}
          hasLocationChanged={hasLocationChanged}
          removeTechFromDialog={removeTechFromDialog}
          saveEditedLocation={saveEditedLocation}
          selectedConstraintGroup={selectedConstraintGroup}
          selectedCostGroup={selectedCostGroup}
          setConstraintSearch={setConstraintSearch}
          setCostSearch={setCostSearch}
          setEditingLocation={setEditingLocation}
          setExpandedSections={setExpandedSections}
          setExpandedTechSubcategories={setExpandedTechSubcategories}
          setSelectedConstraintGroup={setSelectedConstraintGroup}
          setSelectedCostGroup={setSelectedCostGroup}
          setShowEditDialog={setShowEditDialog}
          techCsvFiles={techCsvFiles}
          techMap={techMap}
          toggleTechConstraints={toggleTechConstraints}
          updateDialogConstraint={updateDialogConstraint}
          updateDialogCost={updateDialogCost}
          updateDialogEssential={updateDialogEssential}
        />
      )}
    </div>
  );
};

export default MapDeckGL;
