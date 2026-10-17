import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { WebMercatorViewport } from '@deck.gl/core';
import { ScatterplotLayer, IconLayer, LineLayer } from '@deck.gl/layers';
import { Map as MapGL } from 'react-map-gl/maplibre';
import { useData } from '../context/DataContext';
import { LuPanelLeftClose, LuPanelLeftOpen } from './ui/icons';
import { FiLayers, FiLink, FiEye, FiEdit2, FiMapPin, FiTrash2, FiCpu, FiChevronDown, FiChevronRight, FiChevronLeft, FiZoomIn, FiZoomOut, FiMaximize2, FiX, FiCheck, FiHelpCircle, FiArrowRight, FiActivity, FiZap, FiCircle, FiNavigation, FiSave, FiFolder } from './ui/icons';
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
import LocationEditDialog from './LocationEditDialog';
import EntityListsPanel from './shared/EntityListsPanel';
import HoverTooltip from './creation/HoverTooltip';
import LayerSelector from './creation/LayerSelector';
import MapZoomControls from './creation/MapZoomControls';
import { confirmAction } from './ui/confirm';

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
  const [currentStyle, setCurrentStyle] = useState('grey');
  const [mode, setMode] = useState('view');
  const [linkStart, setLinkStart] = useState(null);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [locationsExpanded, setLocationsExpanded] = useState(true);
  const [linksExpanded, setLinksExpanded] = useState(true);
  const [lastPolylineLocation, setLastPolylineLocation] = useState(null);
  const [isNewLocation, setIsNewLocation] = useState(false);
  const [showModelPanel, setShowModelPanel] = useState(false);

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
  const [techCsvFiles, setTechCsvFiles] = useState({});
  const [constraintCsvFiles, setConstraintCsvFiles] = useState({});
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
      onClick: (info) => {
        if (info.object) {
          if (mode === 'add-link') {
            handleLocationClickForLink(info.object);
          } else {
            // View/inspect: open the tech editor (same as the Creation view).
            handleEditLocation(info.object, locations.indexOf(info.object));
          }
        }
      },
      onHover: (info) => {
        if (info.object) {
          const o = info.object;
          const kind = o.metadata?.kind;
          const accentColor = kind === 'substation' ? '#ef4444'
            : kind === 'plant' ? '#22c55e'
            : kind === 'transmission_node' ? '#f59e0b' : '#6B7280';
          const details = [{ label: 'Technologies', value: String(Object.keys(o.techs || {}).length) }];
          if (o.latitude != null && o.longitude != null) {
            details.push({ label: 'Lat, Lon', value: `${Number(o.latitude).toFixed(3)}, ${Number(o.longitude).toFixed(3)}` });
          }
          setHoveredInfo({
            name: o.name,
            layerType: kind ? kind.replace(/_/g, ' ') : (o.isNode ? 'node' : 'location'),
            details,
            accentColor,
            x: info.x,
            y: info.y,
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

    if (mode === 'add-location') {
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
    setSelectedLocation(location); // keeps the sidebar row highlighted
    setViewState({
      ...viewState,
      longitude: location.longitude,
      latitude: location.latitude,
      zoom: 12,
      transitionDuration: 1000
    });
  };
  
  // Handle delete location
  const handleDeleteLocation = async (index) => {
    if (await confirmAction({ title: 'Delete this location?', message: 'Links connected to it will be removed as well.', details: locations[index]?.name })) {
      const locationName = locations[index].name;
      const newLocations = locations.filter((_, i) => i !== index);
      const newLinks = links.filter(link => link.from !== locationName && link.to !== locationName);
      setLocations(newLocations);
      setLinks(newLinks);
      showNotification('Location deleted', 'success');
    }
  };
  
  // Compute a viewState that frames all valid locations (proper zoom from the
  // bounding box, not a fixed level). Returns null when there's nothing to frame.
  const computeFitViewState = useCallback((locs) => {
    const valid = (locs || []).filter(loc =>
      !isNaN(loc.longitude) && !isNaN(loc.latitude) && isFinite(loc.longitude) && isFinite(loc.latitude));
    if (valid.length === 0) return null;
    const lngs = valid.map(l => l.longitude);
    const lats = valid.map(l => l.latitude);
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
    if (![minLng, maxLng, minLat, maxLat].every(isFinite)) return null;
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    if (minLng === maxLng && minLat === maxLat) {
      return { longitude: centerLng, latitude: centerLat, zoom: 11 }; // single point
    }
    try {
      const vp = new WebMercatorViewport({ width: window.innerWidth || 1200, height: window.innerHeight || 800 });
      const { longitude, latitude, zoom } = vp.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]], { padding: 80 });
      return { longitude, latitude, zoom: Math.min(zoom, 15) };
    } catch {
      return { longitude: centerLng, latitude: centerLat, zoom: 6 };
    }
  }, []);

  // Fit bounds to show all locations (toolbar button).
  const fitBounds = () => {
    const fit = computeFitViewState(locations);
    if (fit) setViewState(v => ({ ...v, ...fit, transitionDuration: 1000 }));
  };

  const fittedModelRef = useRef(null);
  useEffect(() => {
    if (fittedModelRef.current === currentModelId) return;
    const fit = computeFitViewState(locations);
    if (!fit) return; // wait until locations are available
    fittedModelRef.current = currentModelId;
    setViewState(v => ({ ...v, ...fit, transitionDuration: 600 }));
  }, [locations, currentModelId, computeFitViewState]);
  
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
    if (mode === 'add-location' || mode === 'polyline') return 'crosshair';
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
      <div className={`${leftSidebarCollapsed ? 'w-14' : 'w-72'} shrink-0 bg-white border-r border-black/15 transition-[width] duration-300 ease-out overflow-hidden`}>
      <div className={`flex h-full flex-col ${leftSidebarCollapsed ? 'w-14' : 'w-72'}`}>
        {/* Header */}
        <div className={`flex items-center border-b border-black/15 shrink-0 ${leftSidebarCollapsed ? 'justify-center py-3' : 'gap-1 px-4 py-3'}`}>
          {!leftSidebarCollapsed && (
            <>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900">Map View</h2>
                <p className="truncate text-[11px] text-slate-500">Edit the active model on the map</p>
              </div>
              <button
                onClick={() => { updateCurrentModel(); showNotification('Model saved!', 'success'); }}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                title="Save current model"
              >
                <FiSave size={16} />
              </button>
            </>
          )}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title={leftSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {leftSidebarCollapsed ? <LuPanelLeftOpen size={18} /> : <LuPanelLeftClose size={18} />}
          </button>
        </div>

        {leftSidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1 py-3">
            {[
              { m: 'add-location', Icon: FiMapPin, title: 'Add location' },
              { m: 'add-link', Icon: FiLink, title: 'Link' },
              { m: 'polyline', Icon: FiNavigation, title: 'Polyline' },
            ].map(({ m, Icon, title }) => (
              <button
                key={m}
                onClick={() => { setMode(mode === m ? 'view' : m); setLinkStart(null); if (m !== 'polyline') setLastPolylineLocation(null); }}
                title={title}
                className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
                  mode === m ? 'bg-black text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 flex-col" style={{ animation: 'panelContentIn 0.15s ease-out 0.25s both' }}>
        <div className="border-b border-black/15 px-4 py-3 shrink-0">
          <button
            onClick={() => setShowModelPanel(v => !v)}
            className={`flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left transition-colors ${
              showModelPanel ? 'border-black/15 bg-slate-50' : 'border-black/15 hover:border-black/15 hover:bg-slate-50'
            }`}
            title="Switch / load model"
          >
            <FiFolder size={14} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">
              {models.find(m => m.id === currentModelId)?.name || 'No model loaded'}
            </span>
            <FiChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${showModelPanel ? 'rotate-180' : ''}`} />
          </button>

          {showModelPanel && (
            <div className="mt-2 rounded-lg border border-black/15 bg-white p-1 ">
              {models.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-400">No saved models yet</p>
              ) : (
                <div className="max-h-44 space-y-0.5 overflow-y-auto">
                  {models.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { loadModel(m.id); setShowModelPanel(false); showNotification(`Loaded "${m.name}"`, 'success'); }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        m.id === currentModelId ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      {m.id === currentModelId && <FiCheck size={12} className="shrink-0 text-slate-500" />}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  const name = prompt('New model name:');
                  if (name) { createModel(name); setShowModelPanel(false); }
                }}
                className="mt-1 w-full rounded-md border border-dashed border-black/15 py-1.5 text-xs text-slate-500 transition-colors hover:border-black/15 hover:text-slate-800"
              >
                + New empty model
              </button>
            </div>
          )}
        </div>

        {/* Edit tools — add nodes, links, polylines to the imported model */}
        <div className="border-b border-black/15 px-4 py-3 shrink-0">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { m: 'add-location', Icon: FiMapPin, label: 'Location' },
              { m: 'add-link', Icon: FiLink, label: 'Link' },
              { m: 'polyline', Icon: FiNavigation, label: 'Polyline' },
            ].map(({ m, Icon, label }) => (
              <button
                key={m}
                onClick={() => { setMode(mode === m ? 'view' : m); setLinkStart(null); if (m !== 'polyline') setLastPolylineLocation(null); }}
                aria-pressed={mode === m}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
                  mode === m ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 px-0.5 text-[11px] leading-snug text-slate-500">
            {mode === 'view' && 'Click a location to edit it, or pick a tool to add nodes and links'}
            {mode === 'add-location' && 'Click the map to add a location and edit it'}
            {mode === 'add-link' && (linkStart ? `Select the destination for the link from "${linkStart.name}"` : 'Click a location to start a link')}
            {mode === 'polyline' && (lastPolylineLocation ? `Continue from "${lastPolylineLocation.name}" — click to extend` : 'Click the map to start a polyline chain')}
          </p>
        </div>

        {/* Locations & Links List */}
          <EntityListsPanel
            locations={locations}
            links={links}
            selectedLocationId={selectedLocation?.id ?? null}
            onSelectLocation={(loc) => handleLocationSelect(loc)}
            onEditLocation={(loc, index) => handleEditLocation(loc, index)}
            onDeleteLocation={(loc, index) => handleDeleteLocation(index)}
            onClearLocations={async () => {
              if (await confirmAction({ title: 'Delete all locations?', message: `All ${locations.length} locations and every link between them will be removed.`, confirmLabel: 'Delete all' })) {
                setLocations([]); setLinks([]); showNotification('All locations and links deleted', 'success');
              }
            }}
            onClearLinks={async () => {
              if (!links.length) return;
              if (await confirmAction({ title: 'Delete all links?', message: `All ${links.length} links will be removed. Locations are kept.`, confirmLabel: 'Delete all' })) {
                setLinks([]); showNotification('All links deleted', 'success');
              }
            }}
            onUpdateLink={(link, patch, index) => setLinks(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))}
            onDeleteLink={(link, index) => setLinks(prev => prev.filter((_, i) => i !== index))}
            locationsExpanded={locationsExpanded}
            setLocationsExpanded={setLocationsExpanded}
            linksExpanded={linksExpanded}
            setLinksExpanded={setLinksExpanded}
          />
        </div>
        )}
      </div>
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
          // Node types by kind (matches the on-map palette) + per-technology colors.
          const techMapEntries = new Map();
          const kindCounts = { substation: 0, plant: 0, transmission_node: 0 };

          locations.forEach(loc => {
            const kind = loc.metadata?.kind;
            if (kind && kindCounts[kind] != null) kindCounts[kind] += 1;
            const techs = loc.techs || {};
            Object.keys(techs).forEach(techName => {
              if (techName.toLowerCase().includes('demand')) return; // demand isn't a colour chip
              if (!techMapEntries.has(techName)) {
                const color = getTechColor(techName, techMap);
                const displayName = techMap[techName]?.essentials?.name || techName;
                techMapEntries.set(techName, { color, displayName });
              }
            });
          });

          const totalNodes = kindCounts.substation + kindCounts.plant + kindCounts.transmission_node;

          return (
            <div className="absolute bottom-4 right-4 z-50 w-64 overflow-hidden rounded-2xl bg-white/90 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 backdrop-blur-md">
              <button
                onClick={() => setLegendOpen(o => !o)}
                aria-expanded={legendOpen}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50/80"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-black text-white"><FiLayers size={14} /></span>
                <span className="flex-1 text-sm font-semibold text-slate-900">Legend</span>
                <FiChevronDown size={15} className={`text-slate-400 transition-transform ${legendOpen ? '' : '-rotate-180'}`} />
              </button>
              {legendOpen && (
              <div className="max-h-80 space-y-4 overflow-y-auto border-t border-black/10 px-4 pb-4 pt-3">
              {totalNodes === 0 && techMapEntries.size === 0 && links.length === 0 && (
                <p className="text-xs text-slate-500">Add technologies or links to see them here.</p>
              )}
              
              {/* Node types — same palette as the map (red subs / green plants / amber transmission) */}
              {totalNodes > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Node types</div>
                  <div className="space-y-1.5 text-xs">
                    {kindCounts.substation > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white " style={{ backgroundColor: 'rgb(239, 68, 68)' }} />
                        <span className="flex-1 text-slate-700">Substations</span>
                        <span className="tabular-nums text-slate-400">{kindCounts.substation}</span>
                      </div>
                    )}
                    {kindCounts.plant > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white " style={{ backgroundColor: 'rgb(34, 197, 94)' }} />
                        <span className="flex-1 text-slate-700">Power plants</span>
                        <span className="tabular-nums text-slate-400">{kindCounts.plant}</span>
                      </div>
                    )}
                    {kindCounts.transmission_node > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white " style={{ backgroundColor: 'rgb(245, 158, 11)' }} />
                        <span className="flex-1 text-slate-700">Transmission nodes</span>
                        <span className="tabular-nums text-slate-400">{kindCounts.transmission_node}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Technologies */}
              {techMapEntries.size > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Technologies</div>
                  <div className="space-y-1.5 text-xs">
                    {Array.from(techMapEntries.entries()).map(([techName, { color, displayName }]) => {
                      const rgbaColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
                      return (
                        <div key={techName} className="flex items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white " style={{ backgroundColor: rgbaColor }} />
                          <span className="truncate text-slate-700">{displayName}</span>
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
                  
                  techName = techName || 'unknown';
                  {
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
                  <div>
                    <div className="mb-2 flex items-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <span className="flex-1">Transmission</span>
                      <span className="normal-case tracking-normal">{links.length} link{links.length === 1 ? '' : 's'}</span>
                    </div>
                    
                    {/* Power Lines (Plant to Substation) */}
                    {powerLines.length > 0 && (
                      <div className="mb-2">
                        <div className="mb-1 text-[11px] text-slate-500">Power plant connections</div>
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <span className="h-1 w-5 shrink-0 rounded-full" style={{ backgroundColor: 'rgb(28, 3, 255)' }} />
                          <span className="flex-1 text-slate-700">Power lines</span>
                          <span className="tabular-nums text-slate-400">{powerLines.length}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Voltage Level Lines */}
                    {sortedVoltages.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] text-slate-500">By voltage level</div>
                        {sortedVoltages.map(voltage => {
                          const color = getVoltageColor(voltage);
                          const count = voltageGroups[voltage].length;
                          return (
                            <div key={voltage} className="mb-1 flex items-center gap-2 text-xs">
                              <span
                                className="h-1 w-5 shrink-0 rounded-full"
                                style={{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                              />
                              <span className="flex-1 truncate text-slate-700">
                                {voltage === 'unknown' ? 'Other links' : voltage.replace(/_/g, ' ').replace(/\b(ac|dc|hv|hvac|hvdc)\b/gi, m => m.toUpperCase()).replace(/\b[a-z]/g, c => c.toUpperCase())}
                              </span>
                              <span className="tabular-nums text-slate-400">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              </div>
              )}
            </div>
          );
        })()}
        
        {/* Hover tooltip — shared component, same structure as the Creation view */}
        {hoveredInfo && <HoverTooltip hoveredInfo={hoveredInfo} />}
        
        
        {/* Map Controls — shared components, same as the Creation view */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <LayerSelector currentLayer={currentStyle} onLayerChange={setCurrentStyle} />
          <MapZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onFitBounds={fitBounds} />
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
      
      {/* Shared Location edit popup — identical to the Creation view */}
      <LocationEditDialog
        isOpen={showEditDialog && !!editingLocation}
        onClose={() => setShowEditDialog(false)}
        location={editingLocation}
        techMap={techMap}
        onSave={(updated) => {
          setLocations(prev => {
            const copy = [...prev];
            if (editingIndex != null && editingIndex >= 0 && editingIndex < copy.length) copy[editingIndex] = updated;
            return copy;
          });
          setShowEditDialog(false);
          showNotification(`Location "${updated.name}" updated`, 'success');
        }}
      />
    </div>
  );
};

export default MapDeckGL;
