import React, { useState, useMemo, useEffect, useCallback } from "react";
import { LuPencil, LuTrash2, LuCheck, LuX, LuPlus, LuChevronDown, LuChevronRight, LuCpu, LuSun, LuWind, LuBatteryCharging, LuZap, LuActivity, LuDroplet, LuMapPin, LuHouse, LuCircle, LuSearch, LuArrowRight, LuCircleHelp, LuSave, LuLayers } from './ui/icons';
import { useData } from "../context/DataContext";
import SaveBar from './ui/SaveBar';
import { KpiCard } from './dashboard/DashboardWidgets';
import SortHeader from './ui/SortHeader';
import { nextSort, compareValues } from '../utils/sorting';
import { TECH_TEMPLATES, useLiveTechTemplates } from "./TechnologiesData";
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions';







const Locations = () => {
  const { locations, setLocations, getCurrentModel, technologies, links, showNotification, models, setModels, setNavigationWarning, timeSeries, setTimeSeries } = useData();
  const currentModel = getCurrentModel();
  // Live tech templates from OEO API (falls back to static TECH_TEMPLATES)
  const { techTemplates: liveTechTemplates, isLoading: techsLoading } = useLiveTechTemplates();
  // Track selected instance index per tech in the picker: key = `${locationIndex}_${techName}`
  const [selectedTechInstances, setSelectedTechInstances] = useState({});
  const [editingIndex, setEditingIndex] = useState(null);
  const [editData, setEditData] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [editingTech, setEditingTech] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [constraintSearch, setConstraintSearch] = useState({});
  const [costSearch, setCostSearch] = useState({});
  const [selectedConstraintGroup, setSelectedConstraintGroup] = useState({});
  const [selectedCostGroup, setSelectedCostGroup] = useState({});
  const [expandedTechCategories, setExpandedTechCategories] = useState({});
  const [editingEssentials, setEditingEssentials] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(null);
  const [constraintCsvFiles, setConstraintCsvFiles] = useState({});
  
  // Track original data for change detection
  const [originalLocations, setOriginalLocations] = useState(JSON.stringify(locations));
  const [originalLinks, setOriginalLinks] = useState(JSON.stringify(links));
  
  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(locations) !== originalLocations || JSON.stringify(links) !== originalLinks;
  }, [locations, links, originalLocations, originalLinks]);

  // Create stable navigation warning callback
  const navigationWarningCallback = useCallback(() => {
    return true; // Handled by custom dialog in handleNavigation
  }, []);

  // Update navigation warning in context - only triggers when switching sidebar sections
  useEffect(() => {
    if (!setNavigationWarning) return;
    
    if (hasChanges) {
      setNavigationWarning(navigationWarningCallback);
    } else {
      setNavigationWarning(null);
    }
    
    // Cleanup on unmount
    return () => {
      if (setNavigationWarning) {
        setNavigationWarning(null);
      }
    };
  }, [hasChanges, navigationWarningCallback]); // Remove setNavigationWarning from dependencies

  // Convert technologies array to object for easier access
  // Use live tech templates from API; fall back to static TECH_TEMPLATES
  const techMap = useMemo(() => {
    const map = {};
    // Use live templates (which fall back to static if API unavailable)
    const source = liveTechTemplates && Object.keys(liveTechTemplates).length > 0 ? liveTechTemplates : TECH_TEMPLATES;
    Object.values(source).forEach(categoryTechs => {
      if (Array.isArray(categoryTechs)) {
        categoryTechs.forEach(tech => {
          map[tech.name] = tech;
        });
      }
    });
    // Then override with any model-specific technologies, but KEEP instances from live API
    if (Array.isArray(technologies) && technologies.length > 0) {
      technologies.forEach(tech => {
        const existingInstances = map[tech.name]?.instances;
        map[tech.name] = existingInstances ? { ...tech, instances: existingInstances } : tech;
      });
    }
    return map;
  }, [liveTechTemplates, technologies]);
  const [newLocation, setNewLocation] = useState({
    name: '',
    latitude: '',
    longitude: '',
    type: 'demand'
  });

  // Helper function to merge template defaults with actual model data
  const getMergedTechData = useCallback((techName, modelTechData) => {
    const template = techMap[techName];
    if (!template) return modelTechData || { essentials: {}, constraints: {}, costs: {} };
    
    // Start with template data
    const merged = {
      essentials: { ...template.essentials },
      constraints: { ...template.constraints },
      costs: template.costs ? { ...template.costs } : {}
    };
    
    // Override with model data
    if (modelTechData) {
      if (modelTechData.essentials) {
        merged.essentials = { ...merged.essentials, ...modelTechData.essentials };
      }
      if (modelTechData.constraints) {
        merged.constraints = { ...merged.constraints, ...modelTechData.constraints };
      }
      if (modelTechData.costs) {
        merged.costs = { ...merged.costs, ...modelTechData.costs };
      }
    }
    
    return merged;
  }, [techMap]);

  // Filter locations based on search query
  const filteredLocations = locations.filter(location => {
    const searchLower = searchQuery.toLowerCase();
    return (
      location.name?.toLowerCase().includes(searchLower) ||
      location.type?.toLowerCase().includes(searchLower) ||
      Object.keys(location.techs || {}).some(tech => tech.toLowerCase().includes(searchLower))
    );
  });

  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const onSort = (key) => setSort(prev => nextSort(prev, key));
  const sortedLocations = useMemo(() => {
    if (!sort.key) return filteredLocations;
    const value = (l) => sort.key === 'techs' ? Object.keys(l.techs || {}).length : l[sort.key];
    const sorted = [...filteredLocations].sort((a, b) => compareValues(value(a), value(b)));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [filteredLocations, sort]);

  // Get icon for technology type
  const getTechIcon = (techName) => {
    const name = techName.toLowerCase();
    if (name.includes('solar') || name.includes('pv')) return <LuSun className="text-gray-600" />;
    if (name.includes('wind')) return <LuWind className="text-gray-600" />;
    if (name.includes('battery') || name.includes('storage')) return <LuBatteryCharging className="text-gray-600" />;
    if (name.includes('gas') || name.includes('ccgt')) return <LuZap className="text-gray-600" />;
    if (name.includes('coal')) return <LuActivity className="text-gray-700" />;
    if (name.includes('biomass')) return <LuDroplet className="text-gray-600" />;
    if (name.includes('demand')) return <LuHouse className="text-gray-600" />;
    if (name.includes('transmission')) return <LuZap className="text-gray-600" />;
    return <LuCpu className="text-slate-600" />;
  };

  // Format technology name
  const formatTechName = (techName) => {
    return techName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Get unique tech types for location icons
  const getLocationTechIcons = (location) => {
    if (!location.techs || Object.keys(location.techs).length === 0) {
      return location.type === 'node' ? [<LuCircle key="node" className="text-slate-400" />] : [];
    }
    
    const icons = new Set();
    const iconMap = {};
    
    Object.keys(location.techs).forEach(techName => {
      const name = techName.toLowerCase();
      let iconKey = 'other';
      
      if (name.includes('solar') || name.includes('pv')) iconKey = 'solar';
      else if (name.includes('wind')) iconKey = 'wind';
      else if (name.includes('battery') || name.includes('storage')) iconKey = 'battery';
      else if (name.includes('gas') || name.includes('ccgt')) iconKey = 'gas';
      else if (name.includes('coal')) iconKey = 'coal';
      else if (name.includes('biomass')) iconKey = 'biomass';
      else if (name.includes('demand')) iconKey = 'demand';
      
      iconMap[iconKey] = getTechIcon(techName);
    });
    
    return Object.values(iconMap).slice(0, 3); // Show max 3 icons
  };

  const startEdit = (index) => {
    setEditingIndex(index);
    setEditData({ ...locations[index] });
  };

  const saveEdit = () => {
    const updatedLocations = [...locations];
    updatedLocations[editingIndex] = editData;
    setLocations(updatedLocations);
    setEditingIndex(null);
    setEditData({});
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditData({});
  };

  const deleteLocation = (index) => {
    setDeleteConfirmDialog({
      type: 'location',
      index: index,
      message: 'Are you sure you want to delete this location?'
    });
  };

  const confirmDelete = () => {
    if (deleteConfirmDialog) {
      const updatedLocations = locations.filter((_, i) => i !== deleteConfirmDialog.index);
      setLocations(updatedLocations);
      setDeleteConfirmDialog(null);
    }
  };

  const addLocation = () => {
    if (newLocation.name && newLocation.latitude && newLocation.longitude) {
      setLocations([...locations, {
        ...newLocation,
        latitude: parseFloat(newLocation.latitude),
        longitude: parseFloat(newLocation.longitude),
        coordinates: {
          lat: parseFloat(newLocation.latitude),
          lon: parseFloat(newLocation.longitude)
        },
        techs: {}
      }]);
      setNewLocation({ name: '', latitude: '', longitude: '', type: 'demand' });
      setIsAdding(false);
    }
  };

  // Technology editing functions
  const startEditTech = (locationIndex, techName) => {
    setEditingTech({ locationIndex, techName });
  };

  const saveEditTech = () => {
    setEditingTech(null);
  };

  const updateTechConstraint = (locationIndex, techName, key, value) => {
    const updatedLocations = [...locations];
    if (!updatedLocations[locationIndex].techs[techName].constraints) {
      updatedLocations[locationIndex].techs[techName].constraints = {};
    }
    
    let parsedValue = value;
    if (!isNaN(value) && value !== '') {
      parsedValue = parseFloat(value);
    }
    
    updatedLocations[locationIndex].techs[techName].constraints[key] = parsedValue;
    setLocations(updatedLocations);
  };

  const removeTechConstraint = (locationIndex, techName, key) => {
    const updatedLocations = [...locations];
    delete updatedLocations[locationIndex].techs[techName].constraints[key];
    setLocations(updatedLocations);
  };

  const handleConstraintCsvUpload = (locationIndex, techName, constraintKey, file) => {
    if (file && file.name.endsWith('.csv')) {
      const fileKey = `${locationIndex}_${techName}_${constraintKey}`;
      setConstraintCsvFiles({
        ...constraintCsvFiles,
        [fileKey]: file
      });
      updateTechConstraint(locationIndex, techName, constraintKey, `file:${file.name}`);
    }
  };

  const updateTechEssential = (locationIndex, techName, key, value) => {
    const updatedLocations = [...locations];
    if (!updatedLocations[locationIndex].techs[techName].essentials) {
      updatedLocations[locationIndex].techs[techName].essentials = {};
    }
    updatedLocations[locationIndex].techs[techName].essentials[key] = value;
    setLocations(updatedLocations);
    
    // Track in editing state
    const sectionKey = `${locationIndex}_${techName}`;
    setEditingEssentials({
      ...editingEssentials,
      [sectionKey]: {
        ...(editingEssentials[sectionKey] || {}),
        [key]: value
      }
    });
  };

  const addTechConstraint = (locationIndex, techName) => {
    if (newConstraintKey.trim()) {
      const updatedLocations = [...locations];
      if (!updatedLocations[locationIndex].techs[techName].constraints) {
        updatedLocations[locationIndex].techs[techName].constraints = {};
      }
      
      let parsedValue = newConstraintValue;
      if (!isNaN(newConstraintValue) && newConstraintValue !== '') {
        parsedValue = parseFloat(newConstraintValue);
      }
      
      updatedLocations[locationIndex].techs[techName].constraints[newConstraintKey] = parsedValue;
      setLocations(updatedLocations);
      setNewConstraintKey('');
      setNewConstraintValue('');
    }
  };

  const removeTechnology = (locationIndex, techName) => {
    if (window.confirm(`Remove ${techName} from this location?`)) {
      const updatedLocations = [...locations];
      delete updatedLocations[locationIndex].techs[techName];
      setLocations(updatedLocations);
    }
  };

  const addTechnologyToLocation = (locationIndex, techName, instanceParams) => {
    const updatedLocations = [...locations];
    if (!updatedLocations[locationIndex].techs) {
      updatedLocations[locationIndex].techs = {};
    }
    
    // Copy structure from techMap, then overlay selected instance params
    const techTemplate = techMap[techName];
    const baseConstraints = techTemplate?.constraints ? { ...techTemplate.constraints } : {};
    const baseCosts = techTemplate?.costs?.monetary ? { ...techTemplate.costs.monetary } : 
                      techTemplate?.costs ? { ...techTemplate.costs } : {};

    // Merge instance-specific constraints and costs if provided
    const mergedConstraints = instanceParams?.constraints
      ? { ...baseConstraints, ...instanceParams.constraints }
      : baseConstraints;
    const mergedCosts = instanceParams?.monetary
      ? { ...baseCosts, ...instanceParams.monetary }
      : baseCosts;

    updatedLocations[locationIndex].techs[techName] = {
      essentials: techTemplate?.essentials ? { ...techTemplate.essentials } : {},
      constraints: mergedConstraints,
      costs: { monetary: mergedCosts }
    };

    // Store the instance label as metadata if present
    if (instanceParams?.label) {
      updatedLocations[locationIndex].techs[techName]._instance = instanceParams.label;
    }

    setLocations(updatedLocations);
  };

  // Save changes to the model
  const saveChanges = async () => {
    if (!currentModel) {
      showNotification('No model selected', 'error');
      return;
    }

    // Process any new CSV files that were uploaded
    const allNewTimeSeries = [];
    const Papa = (await import('papaparse')).default;
    
    for (const [fileKey, file] of Object.entries(constraintCsvFiles)) {
      if (file) {
        // Parse the fileKey to get location index, tech name, and constraint key
        const parts = fileKey.split('_');
        const locationIndex = parseInt(parts[0]);
        const constraintKey = parts[parts.length - 1];
        const techName = parts.slice(1, -1).join('_');
        const location = locations[locationIndex];
        
        if (location) {
          await new Promise((resolve) => {
            Papa.parse(file, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: (results) => {
                allNewTimeSeries.push({
                  id: `${Date.now()}_${location.name}_${techName}_${constraintKey}_${Math.random()}`,
                  name: file.name,
                  fileName: file.name,
                  uploadedAt: new Date().toISOString(),
                  data: results.data,
                  columns: results.meta.fields || [],
                  rowCount: results.data.length,
                  location: location.name,
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
    }

    // Add new timeseries to existing ones
    if (allNewTimeSeries.length > 0) {
      setTimeSeries([...timeSeries, ...allNewTimeSeries]);
      // Clear the constraintCsvFiles after processing
      setConstraintCsvFiles({});
    }

    const updatedModels = models.map(model => {
      if (model.id === currentModel.id) {
        return {
          ...model,
          locations: [...locations],
          links: links ? [...links] : []
        };
      }
      return model;
    });

    setModels(updatedModels);
    setOriginalLocations(JSON.stringify(locations));
    setOriginalLinks(JSON.stringify(links));
    showNotification('Changes saved successfully', 'success');
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      <SaveBar label="Locations" />
      <div className="flex-1 overflow-y-auto">
      <div className="w-full px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-black">Locations</h1>
          <p className="mt-1 text-[15px] text-slate-500">Manage energy system nodes and locations</p>
        </div>
        {currentModel && (
          <span className="inline-flex items-center gap-2 border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {currentModel.name}
          </span>
        )}
      </div>

      {locations.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
          <KpiCard icon={LuMapPin} label="Locations" value={locations.length} sub="nodes" />
          <KpiCard icon={LuCpu} label="With technologies" value={locations.filter(l => l.techs && Object.keys(l.techs).length > 0).length} sub="locations" />
          <KpiCard icon={LuLayers} label="Location types" value={new Set(locations.map(l => l.type).filter(Boolean)).size} sub="types" />
        </div>
      )}

      <div className="rounded-2xl border border-black/15 bg-white ">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            All locations
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{locations.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search locations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-64 rounded-lg border border-black/15 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-black/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            {hasChanges && (
              <button
                onClick={saveChanges}
                className="flex h-10 items-center gap-2 rounded-lg border border-black/15 bg-white px-4 text-sm font-semibold text-slate-800  transition-colors hover:bg-slate-50"
              >
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <LuSave size={16} /> Save changes
              </button>
            )}
            <button
              onClick={() => setIsAdding(true)}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-black px-4 text-sm font-semibold text-white  transition-colors hover:bg-black/80"
            >
              <LuPlus size={16} /> Add location
            </button>
          </div>
        </div>

        <div className="p-3">
        {locations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-black/15 px-6 py-20 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
              <LuMapPin size={20} />
            </div>
            <p className="text-sm font-semibold text-slate-800">No locations yet</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Load a model from Structure → Models, or add your first location here.</p>
            <button
              onClick={() => setIsAdding(true)}
              className="mt-5 flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-[13px] font-semibold text-white  transition-colors hover:bg-black/80"
            >
              <LuPlus size={14} /> Add location
            </button>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-black/15 px-6 py-16 text-center">
            <LuSearch size={20} className="mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">No matches</p>
            <p className="mt-1 text-sm text-slate-500">No locations match “{searchQuery}”.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-black/15">
            <div className="grid grid-cols-[28px_minmax(0,2fr)_130px_minmax(0,1.6fr)_104px_104px_68px] items-center gap-3 sticky top-0 z-10 border-b border-black/15 bg-slate-50/95 px-3 py-2.5 backdrop-blur">
              <span />
              <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
              <SortHeader label="Type" sortKey="type" sort={sort} onSort={onSort} />
              <SortHeader label="Technologies" sortKey="techs" sort={sort} onSort={onSort} />
              <SortHeader label="Latitude" sortKey="latitude" sort={sort} onSort={onSort} align="right" className="justify-self-end" />
              <SortHeader label="Longitude" sortKey="longitude" sort={sort} onSort={onSort} align="right" className="justify-self-end" />
              <span />
            </div>
            <div className="divide-y divide-black/10">
            {sortedLocations.map((location) => {
              const originalIndex = locations.indexOf(location);
              const isEditing = editingIndex === originalIndex;
              const isExpanded = expandedLocation === originalIndex;
              const techCount = location.techs ? Object.keys(location.techs).length : 0;
              return (
              <div key={originalIndex} className={`group transition-colors ${isExpanded || isEditing ? 'bg-slate-50/60' : 'hover:bg-slate-50/70'}`}>
                <div className="grid grid-cols-[28px_minmax(0,2fr)_130px_minmax(0,1.6fr)_104px_104px_68px] items-center gap-3 px-3 py-2">
                  <button
                    onClick={() => setExpandedLocation(isExpanded ? null : originalIndex)}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
                  </button>

                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                      {(location.name || '?').slice(0, 2)}
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 font-medium"
                      />
                    ) : (
                      <span className="truncate text-sm font-semibold text-slate-900">{location.name}</span>
                    )}
                  </div>

                  {isEditing ? (
                    <select
                      value={editData.type}
                      onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                      className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-xs"
                    >
                      <option value="demand">demand</option>
                      <option value="supply">supply</option>
                      <option value="supply_plus">supply_plus</option>
                      <option value="storage">storage</option>
                      <option value="conversion">conversion</option>
                      <option value="conversion_plus">conversion_plus</option>
                      <option value="transmission">transmission</option>
                    </select>
                  ) : (
                    <span className="w-fit rounded-md border border-black/15 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                      {location.type || '—'}
                    </span>
                  )}

                  <div className="flex min-w-0 items-center gap-1.5">
                    {techCount > 0 ? (
                      <>
                        <div className="flex items-center text-slate-400">
                          {getLocationTechIcons(location).map((icon, iconIdx) => (
                            <div key={iconIdx} className="p-0.5">{icon}</div>
                          ))}
                        </div>
                        <span className="flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          <LuCpu size={11} />
                          {techCount}
                        </span>
                      </>
                    ) : (
                      <button
                        onClick={() => setExpandedLocation(originalIndex)}
                        className="text-xs text-slate-400 transition-colors hover:text-slate-800"
                      >
                        + Add technologies
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <input
                        type="number"
                        step="0.0001"
                        value={editData.latitude}
                        onChange={(e) => setEditData({ ...editData, latitude: parseFloat(e.target.value) })}
                        className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-right font-mono text-xs"
                        aria-label="Latitude"
                      />
                      <input
                        type="number"
                        step="0.0001"
                        value={editData.longitude}
                        onChange={(e) => setEditData({ ...editData, longitude: parseFloat(e.target.value) })}
                        className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 text-right font-mono text-xs"
                        aria-label="Longitude"
                      />
                    </>
                  ) : (
                    <>
                      <span className="text-right font-mono text-xs tabular-nums text-slate-600">{location.latitude?.toFixed(4) ?? '—'}</span>
                      <span className="text-right font-mono text-xs tabular-nums text-slate-600">{location.longitude?.toFixed(4) ?? '—'}</span>
                    </>
                  )}

                  <div className="flex justify-end gap-0.5">
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} title="Save" className="grid h-7 w-7 place-items-center rounded-md bg-black text-white hover:bg-black/80">
                          <LuCheck size={14} />
                        </button>
                        <button onClick={cancelEdit} title="Cancel" className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-200/70">
                          <LuX size={14} />
                        </button>
                      </>
                    ) : (
                      <span className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          onClick={() => startEdit(originalIndex)}
                          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-900"
                          title="Edit location"
                        >
                          <LuPencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteLocation(originalIndex)}
                          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Delete location"
                        >
                          <LuTrash2 size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details: Technologies */}
                {expandedLocation === originalIndex && (
                  <div className="border-t border-black/10 px-4 pb-4 pl-[52px] pt-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <LuCpu className="text-gray-600" />
                        Technologies at this Location
                      </h4>
                      {editingTech && editingTech.locationIndex === originalIndex && (
                        <button
                          onClick={saveEditTech}
                          className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-black/80"
                        >
                          <LuCheck className="inline mr-1" /> Done Editing
                        </button>
                      )}
                    </div>
                    
                    {!location.techs || Object.keys(location.techs).length === 0 ? (
                      <p className="text-sm text-slate-500 italic mb-3">No technologies assigned to this location yet.</p>
                    ) : (
                      <div className="space-y-3 mb-4">
                        {Object.entries(location.techs).map(([techName, techData], techIdx) => {
                          const isEditing = editingTech && editingTech.locationIndex === originalIndex && editingTech.techName === techName;
                          const sectionKey = `${originalIndex}_${techName}`;
                          // Merge template defaults with model data
                          const mergedTechData = getMergedTechData(techName, techData);
                          
                          return (
                            <div key={techIdx} className="border border-black/15 rounded-lg bg-white">
                              {/* Tech Header */}
                              <div className="bg-slate-50 p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {getTechIcon(techName)}
                                  <span className="font-medium text-slate-800">{formatTechName(techName)}</span>
                                </div>
                                <div className="flex gap-2">
                                  {!isEditing && (
                                    <button
                                      onClick={() => startEditTech(originalIndex, techName)}
                                      className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                    >
                                      <LuPencil size={14} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => removeTechnology(originalIndex, techName)}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                  >
                                    <LuTrash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {/* Tech Details */}
                              <div className="p-3 space-y-2">
                                {/* Essentials Section - Collapsible & Editable */}
                                {mergedTechData.essentials && Object.keys(mergedTechData.essentials).length > 0 && (
                                  <div>
                                    <button
                                      onClick={() => setExpandedSections({ ...expandedSections, [`${sectionKey}_essentials`]: !expandedSections[`${sectionKey}_essentials`] })}
                                      className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2 hover:text-gray-600"
                                    >
                                      {expandedSections[`${sectionKey}_essentials`] ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                      <span>Essentials</span>
                                    </button>
                                    {expandedSections[`${sectionKey}_essentials`] && (
                                      <div className="pl-4 space-y-2 mb-2">
                                        {Object.entries(mergedTechData.essentials).map(([key, value], eIdx) => (
                                          <div key={eIdx} className="flex gap-2 items-center text-xs">
                                            {isEditing ? (
                                              <>
                                                <span className="text-slate-600 w-24">{formatTechName(key)}:</span>
                                                {key === 'color' ? (
                                                  <div className="flex items-center gap-2 flex-1">
                                                    <input
                                                      type="color"
                                                      value={value}
                                                      onChange={(e) => updateTechEssential(originalIndex, techName, key, e.target.value)}
                                                      className="w-8 h-6 border border-black/15 rounded cursor-pointer"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={value}
                                                      onChange={(e) => updateTechEssential(originalIndex, techName, key, e.target.value)}
                                                      className="flex-1 px-2 py-1 text-xs border border-black/15 rounded focus:ring-2 focus:ring-gray-500"
                                                    />
                                                  </div>
                                                ) : key === 'parent' ? (
                                                  <span className="text-xs font-medium text-slate-800">{value}</span>
                                                ) : (
                                                  <input
                                                    type="text"
                                                    value={value}
                                                    onChange={(e) => updateTechEssential(originalIndex, techName, key, e.target.value)}
                                                    className="flex-1 px-2 py-1 text-xs border border-black/15 rounded focus:ring-2 focus:ring-gray-500"
                                                  />
                                                )}
                                              </>
                                            ) : (
                                              <>
                                                <span className="text-slate-600 flex-1">{formatTechName(key)}:</span>
                                                <span className="font-medium text-slate-800 flex-1 text-right">
                                                  {typeof value === 'object' ? JSON.stringify(value) : value}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Constraints Section - Collapsible (always show when editing or when constraints exist) */}
                                {(isEditing || (mergedTechData.constraints && Object.keys(mergedTechData.constraints).length > 0)) && (
                                  <div>
                                    <button
                                      onClick={() => setExpandedSections({ ...expandedSections, [`${sectionKey}_constraints`]: !expandedSections[`${sectionKey}_constraints`] })}
                                      className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2 hover:text-gray-600"
                                    >
                                      {expandedSections[`${sectionKey}_constraints`] ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                      <span>Constraints ({mergedTechData.constraints ? Object.keys(mergedTechData.constraints).length : 0})</span>
                                    </button>
                                    {expandedSections[`${sectionKey}_constraints`] && (
                                      <div className="pl-4 space-y-2">
                                        {mergedTechData.constraints && Object.entries(mergedTechData.constraints).map(([key, value], cIdx) => {
                                          const fileKey = `${originalIndex}_${techName}_${key}`;
                                          const csvFile = constraintCsvFiles[fileKey];
                                          const isResourceConstraint = key === 'resource';
                                          
                                          return (
                                            <div key={cIdx} className="space-y-2">
                                              <div className="flex items-center gap-2">
                                                {isEditing ? (
                                                  <>
                                                    <input
                                                      type="text"
                                                      value={key}
                                                      disabled
                                                      className="flex-1 px-2 py-1 border border-black/15 rounded text-xs bg-white font-mono"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={typeof value === 'object' ? JSON.stringify(value) : value}
                                                      onChange={(e) => updateTechConstraint(originalIndex, techName, key, e.target.value)}
                                                      className="flex-1 px-2 py-1 border border-black/15 rounded text-xs font-mono bg-white"
                                                      placeholder={isResourceConstraint ? "Value or upload CSV below" : "Value"}
                                                    />
                                                    <button
                                                      onClick={() => removeTechConstraint(originalIndex, techName, key)}
                                                      className="text-gray-500 hover:text-gray-600"
                                                    >
                                                      <LuX size={16} />
                                                    </button>
                                                  </>
                                                ) : (
                                                  <>
                                                    <span className="flex-1 text-xs text-slate-600">{formatTechName(key)}:</span>
                                                    <span className="flex-1 text-xs font-medium text-slate-800 text-right">
                                                      {typeof value === 'object' ? JSON.stringify(value) : value}
                                                    </span>
                                                  </>
                                                )}
                                              </div>
                                              
                                              {/* File upload for resource constraint */}
                                              {isEditing && isResourceConstraint && (
                                                <div className="pl-4 mt-1">
                                                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                                    <span>Or upload timeseries CSV:</span>
                                                    <input
                                                      type="file"
                                                      accept=".csv"
                                                      onChange={(e) => handleConstraintCsvUpload(originalIndex, techName, key, e.target.files[0])}
                                                      className="text-xs"
                                                    />
                                                  </label>
                                                  {csvFile && (
                                                    <p className="text-xs text-gray-600 mt-1">✓ {csvFile.name}</p>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                        
                                        {/* Add Constraint Button - Animated (only when editing) */}
                                        {isEditing && (
                                          <div className="pt-2 border-t border-black/15">
                                            <button
                                              onClick={() => setConstraintSearch({ ...constraintSearch, [`${sectionKey}`]: 'open' })}
                                              className="group flex h-9 w-full items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-gray-600 hover:pl-2 hover:text-white active:bg-black text-sm font-medium text-gray-800"
                                            >
                                              <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                                                <LuArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
                                              </span>
                                              <span>Add Constraint</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Costs Section - Collapsible (always show when editing or when costs exist) */}
                                {(isEditing || (mergedTechData.costs && Object.keys(mergedTechData.costs).length > 0)) && (
                                  <div>
                                    <button
                                      onClick={() => setExpandedSections({ ...expandedSections, [`${sectionKey}_costs`]: !expandedSections[`${sectionKey}_costs`] })}
                                      className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2 hover:text-gray-600"
                                    >
                                      {expandedSections[`${sectionKey}_costs`] ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                      <span>Costs ({mergedTechData.costs ? Object.keys(mergedTechData.costs.monetary || mergedTechData.costs || {}).length : 0})</span>
                                    </button>
                                    {expandedSections[`${sectionKey}_costs`] && (
                                      <div className="pl-4 space-y-2">
                                        {mergedTechData.costs && Object.entries(mergedTechData.costs.monetary || mergedTechData.costs).map(([key, value], costIdx) => (
                                          <div key={costIdx} className="flex justify-between items-center text-xs">
                                            <span className="text-slate-600">{key}:</span>
                                            <span className="font-medium text-slate-800">
                                              {typeof value === 'object' ? JSON.stringify(value) : value}
                                            </span>
                                          </div>
                                        ))}
                                        
                                        {/* Add Cost Button - Animated (only when editing) */}
                                        {isEditing && (
                                          <div className="pt-2 border-t border-black/15">
                                            <button
                                              onClick={() => setCostSearch({ ...costSearch, [`${sectionKey}`]: 'open' })}
                                              className="group flex h-9 w-full items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-gray-600 hover:pl-2 hover:text-white active:bg-black text-sm font-medium text-gray-800"
                                            >
                                              <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                                                <LuArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
                                              </span>
                                              <span>Add Cost</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* If no data sections exist */}
                                {(!mergedTechData.essentials || Object.keys(mergedTechData.essentials).length === 0) &&
                                 (!mergedTechData.constraints || Object.keys(mergedTechData.constraints).length === 0) &&
                                 (!mergedTechData.costs || Object.keys(mergedTechData.costs).length === 0) && (
                                  <p className="text-xs text-slate-500 italic">No configuration data available for this technology.</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Technology from Library - Organized by Category */}
                    {techMap && Object.keys(techMap).length > 0 && (
                      <div className="border-t border-black/15 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Add Technology from Library
                          </label>
                          {techsLoading && (
                            <span className="text-xs text-gray-400 italic">Loading catalog…</span>
                          )}
                        </div>
                        <div className="space-y-2 max-h-[480px] overflow-y-auto">
                          {[
                            { key: 'supply_plus', label: 'Variable Renewables' },
                            { key: 'supply', label: 'Dispatchable Generation' },
                            { key: 'demand', label: 'Demand' },
                            { key: 'storage', label: 'Storage' },
                            { key: 'conversion_plus', label: 'Sector Coupling' },
                            { key: 'conversion', label: 'Conversion' },
                          ].map(({ key: parentType, label: categoryLabel }) => {
                            const techsInCategory = Object.entries(techMap).filter(([, tech]) => tech.parent === parentType);
                            if (techsInCategory.length === 0) return null;

                            const categoryKey = `${originalIndex}_${parentType}`;
                            const isCategoryExpanded = expandedTechCategories[categoryKey];

                            return (
                              <div key={parentType} className="border border-black/15 rounded-lg overflow-hidden">
                                {/* Category header */}
                                <button
                                  onClick={() => setExpandedTechCategories({ ...expandedTechCategories, [categoryKey]: !isCategoryExpanded })}
                                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 transition-colors"
                                >
                                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                    {categoryLabel} ({techsInCategory.length})
                                  </span>
                                  {isCategoryExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                </button>
                                {isCategoryExpanded && (
                                  <div className="bg-white divide-y divide-black/10">
                                    {techsInCategory.map(([techName, techData]) => {
                                      const instances = techData.instances || [];
                                      const subKey = `${originalIndex}_${parentType}_${techName}`;
                                      const isSubExpanded = expandedTechCategories[subKey];
                                      return (
                                        <div key={techName}>
                                          {/* Tech subcategory header */}
                                          <button
                                            onClick={() => setExpandedTechCategories({ ...expandedTechCategories, [subKey]: !isSubExpanded })}
                                            className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-slate-50 transition-colors"
                                          >
                                            <div className="flex items-center gap-1.5">
                                              {getTechIcon(techName)}
                                              <span className="text-xs font-semibold text-slate-700">{formatTechName(techName)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {instances.length > 0 && (
                                                <span className="text-[10px] text-slate-400">{instances.length} variant{instances.length !== 1 ? 's' : ''}</span>
                                              )}
                                              {isSubExpanded ? <LuChevronDown size={12} className="text-slate-400" /> : <LuChevronRight size={12} className="text-slate-400" />}
                                            </div>
                                          </button>
                                          {/* Instance rows */}
                                          {isSubExpanded && (
                                            <div className="pl-4 pr-2 pb-2 bg-slate-50 space-y-1">
                                              {(instances.length > 0 ? instances : [null]).map((inst, idx) => {
                                                const isAssigned = location.techs && location.techs[techName];
                                                const eff = inst?.constraints?.energy_eff ?? inst?.constraints?.electrical_efficiency;
                                                const lifetime = inst?.constraints?.lifetime;
                                                const capex = inst?.monetary?.energy_cap;
                                                const rowLabel = inst?.displayLabel || inst?.label || inst?.raw?.label || `Variant ${idx + 1}`;
                                                return (
                                                  <div
                                                    key={idx}
                                                    className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${
                                                      isAssigned ? 'bg-gray-100 opacity-60' : 'bg-white border border-black/15'
                                                    }`}
                                                  >
                                                    <div className="flex-1 min-w-0">
                                                      <p className="text-[11px] font-medium text-slate-700 truncate">
                                                        {rowLabel}
                                                      </p>
                                                      {(eff != null || lifetime != null || capex != null) && (
                                                        <div className="flex gap-1 mt-0.5 flex-wrap">
                                                          {eff != null && (
                                                            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                                                              η {typeof eff === 'number' && eff <= 1 ? `${Math.round(eff * 100)}%` : eff}
                                                            </span>
                                                          )}
                                                          {lifetime != null && (
                                                            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">{lifetime} yr</span>
                                                          )}
                                                          {capex != null && (
                                                            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">CAPEX {capex}</span>
                                                          )}
                                                        </div>
                                                      )}
                                                    </div>
                                                    <button
                                                      onClick={() => { if (!isAssigned) addTechnologyToLocation(originalIndex, techName, inst); }}
                                                      disabled={!!isAssigned}
                                                      className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                                                        isAssigned
                                                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                          : 'bg-gray-600 text-white hover:bg-black/80'
                                                      }`}
                                                    >
                                                      {isAssigned ? '✓' : '+ Add'}
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            </div>
            <div className="border-t border-black/10 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
              Showing {sortedLocations.length} of {locations.length} locations
            </div>
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Constraint Search Modals - Browsable like Creation */}
      {Object.entries(constraintSearch).map(([sectionKey, value]) => {
        if (value !== 'open') return null;
        
        // Extract locationIndex and techName from sectionKey (format: "index_techname")
        const parts = sectionKey.split('_');
        const locationIndex = parts[0];
        const techName = parts.slice(1).join('_'); // Rejoin in case tech name has underscores
        const location = locations[locationIndex];
        const techData = location?.techs?.[techName];
        const techTemplate = techMap[techName];
        const allConstraints = { ...techTemplate?.constraints, ...techData?.constraints };
        const available = PARENT_CONSTRAINTS[techTemplate?.parent]?.filter(c => !allConstraints[c]) || [];
        
        return (
          <div key={sectionKey} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]" onClick={() => { setConstraintSearch({ ...constraintSearch, [sectionKey]: '' }); setSelectedConstraintGroup({}); }}>
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-black/15 bg-gray-600 text-white">
                <h3 className="text-lg font-bold">Available Constraints for {formatTechName(techTemplate?.parent || '')}</h3>
                <p className="text-xs text-gray-100 mt-1">Browse by category and click to add</p>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
                {available.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <p className="text-sm">All available constraints have been added.</p>
                  </div>
                ) : (
                  (() => {
                    // Group available constraints
                    const groupedAvailable = {};
                    available.forEach(constraint => {
                      const group = CONSTRAINT_DEFINITIONS[constraint]?.group || 'Other';
                      if (!groupedAvailable[group]) groupedAvailable[group] = [];
                      groupedAvailable[group].push(constraint);
                    });
                    
                    return Object.entries(groupedAvailable).map(([group, constraints]) => {
                      if (!constraints || constraints.length === 0) return null;
                      
                      const isExpanded = selectedConstraintGroup[`${sectionKey}_${group}`];
                      
                      return (
                        <div key={group} className="border-b border-black/15 last:border-b-0">
                          <button
                            onClick={() => setSelectedConstraintGroup({ 
                              ...selectedConstraintGroup, 
                              [`${sectionKey}_${group}`]: !isExpanded 
                            })}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <span className="text-sm font-semibold text-gray-900">
                              {formatTechName(group)} ({constraints.length})
                            </span>
                            {isExpanded ? <LuChevronDown size={16} className="text-gray-600" /> : <LuChevronRight size={16} className="text-gray-600" />}
                          </button>
                          {isExpanded && (
                            <div className="divide-y divide-black/10 bg-white">
                              {constraints.map(constraint => {
                                const definition = CONSTRAINT_DEFINITIONS[constraint];
                                return (
                                  <button
                                    key={constraint}
                                    onClick={() => {
                                      const updatedLocations = [...locations];
                                      if (!updatedLocations[locationIndex].techs[techName].constraints) {
                                        updatedLocations[locationIndex].techs[techName].constraints = {};
                                      }
                                      updatedLocations[locationIndex].techs[techName].constraints[constraint] = '';
                                      setLocations(updatedLocations);
                                      setConstraintSearch({ ...constraintSearch, [sectionKey]: '' });
                                      setSelectedConstraintGroup({});
                                    }}
                                    className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors"
                                  >
                                    <div className="font-medium text-slate-800 text-sm mb-1">{formatTechName(constraint)}</div>
                                    {definition && (
                                      <div className="text-slate-600 text-xs leading-relaxed">
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
                  })()
                )}
              </div>
              <div className="p-4 border-t border-black/15 bg-slate-50">
                <button
                  onClick={() => {
                    setConstraintSearch({ ...constraintSearch, [sectionKey]: '' });
                    setSelectedConstraintGroup({});
                  }}
                  className="w-full px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Cost Search Modals - Browsable like Creation */}
      {Object.entries(costSearch).map(([sectionKey, value]) => {
        if (value !== 'open') return null;
        
        // Extract locationIndex and techName from sectionKey (format: "index_techname")
        const parts = sectionKey.split('_');
        const locationIndex = parts[0];
        const techName = parts.slice(1).join('_'); // Rejoin in case tech name has underscores
        const location = locations[locationIndex];
        const techData = location?.techs?.[techName];
        const allCosts = { ...(techData?.costs?.monetary || {}), ...(techData?.costs || {}) };
        const available = Object.keys(COST_DEFINITIONS).filter(c => !allCosts[c]);
        
        return (
          <div key={sectionKey} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]" onClick={() => { setCostSearch({ ...costSearch, [sectionKey]: '' }); setSelectedCostGroup({}); }}>
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-black/15 bg-gray-600 text-white">
                <h3 className="text-lg font-bold">Available Costs</h3>
                <p className="text-xs text-gray-100 mt-1">Browse by category and click to add</p>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-120px)]">
                {available.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <p className="text-sm">All available costs have been added.</p>
                  </div>
                ) : (
                  (() => {
                    // Group available costs
                    const groupedAvailable = {};
                    available.forEach(cost => {
                      const group = COST_DEFINITIONS[cost]?.group || 'Other';
                      if (!groupedAvailable[group]) groupedAvailable[group] = [];
                      groupedAvailable[group].push(cost);
                    });
                    
                    return Object.entries(groupedAvailable).map(([group, costs]) => {
                      if (!costs || costs.length === 0) return null;
                      
                      const isExpanded = selectedCostGroup[`${sectionKey}_${group}`];
                      
                      return (
                        <div key={group} className="border-b border-black/15 last:border-b-0">
                          <button
                            onClick={() => setSelectedCostGroup({ 
                              ...selectedCostGroup, 
                              [`${sectionKey}_${group}`]: !isExpanded 
                            })}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <span className="text-sm font-semibold text-gray-900">
                              {formatTechName(group)} ({costs.length})
                            </span>
                            {isExpanded ? <LuChevronDown size={16} className="text-gray-600" /> : <LuChevronRight size={16} className="text-gray-600" />}
                          </button>
                          {isExpanded && (
                            <div className="divide-y divide-black/10 bg-white">
                              {costs.map(cost => {
                                const definition = COST_DEFINITIONS[cost];
                                return (
                                  <button
                                    key={cost}
                                    onClick={() => {
                                      const updatedLocations = [...locations];
                                      if (!updatedLocations[locationIndex].techs[techName].costs) {
                                        updatedLocations[locationIndex].techs[techName].costs = {};
                                      }
                                      if (!updatedLocations[locationIndex].techs[techName].costs.monetary) {
                                        updatedLocations[locationIndex].techs[techName].costs.monetary = {};
                                      }
                                      updatedLocations[locationIndex].techs[techName].costs.monetary[cost] = 0;
                                      setLocations(updatedLocations);
                                      setCostSearch({ ...costSearch, [sectionKey]: '' });
                                      setSelectedCostGroup({});
                                    }}
                                    className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors"
                                  >
                                    <div className="font-medium text-slate-800 text-sm mb-1">{cost}</div>
                                    {definition && (
                                      <div className="text-slate-600 text-xs leading-relaxed">
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
                  })()
                )}
              </div>
              <div className="p-4 border-t border-black/15 bg-slate-50">
                <button
                  onClick={() => {
                    setCostSearch({ ...costSearch, [sectionKey]: '' });
                    setSelectedCostGroup({});
                  }}
                  className="w-full px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add Location Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
            <div className="flex items-start justify-between border-b border-black/10 px-6 py-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Add location</h3>
                <p className="mt-0.5 text-xs text-slate-500">Create a new node in the active model.</p>
              </div>
              <button
                onClick={() => { setIsAdding(false); setNewLocation({ name: '', latitude: '', longitude: '', type: 'demand' }); }}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <LuX size={16} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  value={newLocation.name}
                  onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                  className="h-9 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="e.g. Berlin"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">Type</label>
                <select
                  value={newLocation.type}
                  onChange={(e) => setNewLocation({ ...newLocation, type: e.target.value })}
                  className="h-9 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="demand">Demand</option>
                  <option value="supply">Supply</option>
                  <option value="supply_plus">Supply Plus</option>
                  <option value="storage">Storage</option>
                  <option value="conversion">Conversion</option>
                  <option value="conversion_plus">Conversion Plus</option>
                  <option value="transmission">Transmission</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newLocation.latitude}
                    onChange={(e) => setNewLocation({ ...newLocation, latitude: e.target.value })}
                    className="h-9 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono"
                    placeholder="52.5200"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newLocation.longitude}
                    onChange={(e) => setNewLocation({ ...newLocation, longitude: e.target.value })}
                    className="h-9 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono"
                    placeholder="13.4050"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/10 bg-slate-50/60 px-6 py-4">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewLocation({ name: '', latitude: '', longitude: '', type: 'demand' });
                }}
                className="h-9 rounded-lg border border-black/15 bg-white px-4 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={addLocation}
                disabled={!newLocation.name || !newLocation.latitude || !newLocation.longitude}
                className="h-9 rounded-lg bg-black px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Add location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-black/15">
              <h3 className="text-xl font-bold text-slate-800">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-700">{deleteConfirmDialog.message}</p>
            </div>
            <div className="p-6 border-t border-black/15 flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmDialog(null)}
                className="px-4 py-2 border border-black/15 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-black/80 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Locations;
