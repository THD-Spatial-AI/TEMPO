import React, { useState, useMemo, useEffect, useCallback } from "react";
import { FiEdit2, FiTrash2, FiCheck, FiX, FiPlus, FiChevronDown, FiChevronRight, FiCpu, FiSun, FiWind, FiBattery, FiZap, FiActivity, FiDroplet, FiHome, FiCircle, FiSearch, FiArrowRight, FiHelpCircle, FiSave } from "react-icons/fi";
import { useData } from "../context/DataContext";
import { TECH_TEMPLATES, useLiveTechTemplates } from "./TechnologiesData";

// Constraint definitions with categories (complete from Creation.jsx)
const CONSTRAINT_DEFINITIONS = {
  // Capacity Constraints
  energy_cap_max: { group: 'Capacity', desc: 'Maximum energy capacity (kW). Upper limit on installed capacity.' },
  energy_cap_min: { group: 'Capacity', desc: 'Minimum energy capacity (kW). Lower limit on installed capacity.' },
  energy_cap_equals: { group: 'Capacity', desc: 'Fixed energy capacity (kW). Capacity must equal this value.' },
  energy_cap_equals_systemwide: { group: 'Capacity', desc: 'System-wide fixed energy capacity across all locations.' },
  energy_cap_max_systemwide: { group: 'Capacity', desc: 'System-wide maximum energy capacity across all locations.' },
  energy_cap_min_use: { group: 'Capacity', desc: 'Minimum capacity utilization (fraction 0-1).' },
  energy_cap_per_unit: { group: 'Capacity', desc: 'Energy capacity per discrete unit (kW/unit).' },
  energy_cap_scale: { group: 'Capacity', desc: 'Scaling factor for energy capacity.' },
  energy_cap_per_storage_cap_min: { group: 'Capacity', desc: 'Minimum ratio of energy capacity to storage capacity.' },
  energy_cap_per_storage_cap_max: { group: 'Capacity', desc: 'Maximum ratio of energy capacity to storage capacity.' },
  energy_cap_per_storage_cap_equals: { group: 'Capacity', desc: 'Fixed ratio of energy capacity to storage capacity.' },
  storage_cap_max: { group: 'Capacity', desc: 'Maximum storage capacity (kWh). Upper limit on energy storage.' },
  storage_cap_min: { group: 'Capacity', desc: 'Minimum storage capacity (kWh).' },
  storage_cap_equals: { group: 'Capacity', desc: 'Fixed storage capacity (kWh).' },
  storage_cap_per_unit: { group: 'Capacity', desc: 'Storage capacity per discrete unit (kWh/unit).' },
  
  // Efficiency Constraints
  energy_eff: { group: 'Efficiency', desc: 'Energy conversion efficiency (0-1). Ratio of output to input energy.' },
  energy_eff_per_distance: { group: 'Efficiency', desc: 'Efficiency loss per unit distance for transmission.' },
  resource_eff: { group: 'Efficiency', desc: 'Resource conversion efficiency (0-1). Efficiency of resource usage.' },
  parasitic_eff: { group: 'Efficiency', desc: 'Parasitic efficiency loss (0-1). Internal energy consumption.' },
  
  // Resource Constraints
  resource: { group: 'Resource', desc: 'Resource availability (kWh or file:// path). Energy source input.' },
  resource_min_use: { group: 'Resource', desc: 'Minimum resource utilization fraction (0-1).' },
  resource_scale: { group: 'Resource', desc: 'Resource scaling factor.' },
  resource_unit: { group: 'Resource', desc: 'Unit of resource measure (energy, power, energy_per_cap, etc.).' },
  resource_area_max: { group: 'Resource', desc: 'Maximum resource collection area (m²).' },
  resource_area_min: { group: 'Resource', desc: 'Minimum resource collection area (m²).' },
  resource_area_equals: { group: 'Resource', desc: 'Fixed resource collection area (m²).' },
  resource_area_per_energy_cap: { group: 'Resource', desc: 'Resource area required per unit energy capacity (m²/kW).' },
  resource_cap_max: { group: 'Resource', desc: 'Maximum resource capacity for supply_plus technologies.' },
  resource_cap_min: { group: 'Resource', desc: 'Minimum resource capacity for supply_plus technologies.' },
  resource_cap_equals: { group: 'Resource', desc: 'Fixed resource capacity for supply_plus technologies.' },
  resource_cap_equals_energy_cap: { group: 'Resource', desc: 'Resource capacity equals energy capacity (boolean).' },
  force_resource: { group: 'Resource', desc: 'Force resource consumption to meet demand exactly (boolean).' },
  
  // Operational Constraints
  energy_ramping: { group: 'Operation', desc: 'Ramping rate limit (fraction/hour). Max change in output per timestep.' },
  charge_rate: { group: 'Operation', desc: 'Charge/discharge rate (C-rate). Storage power relative to capacity.' },
  storage_loss: { group: 'Operation', desc: 'Storage standing loss (fraction/hour). Energy lost per time period.' },
  storage_initial: { group: 'Operation', desc: 'Initial storage state of charge (fraction, 0-1).' },
  storage_time_max: { group: 'Operation', desc: 'Maximum storage duration (hours). Max time to discharge at full power.' },
  storage_discharge_depth: { group: 'Operation', desc: 'Minimum state of charge (fraction 0-1). Prevents full discharge.' },
  lifetime: { group: 'Operation', desc: 'Technology lifetime (years). Economic lifespan.' },
  one_way: { group: 'Operation', desc: 'Transmission is unidirectional (boolean). Only flows one way.' },
  force_asynchronous_prod_con: { group: 'Operation', desc: 'Force production and consumption to not occur simultaneously.' },
  
  // Production/Consumption
  energy_prod: { group: 'Energy Flow', desc: 'Energy production (kWh). Output energy per timestep.' },
  energy_con: { group: 'Energy Flow', desc: 'Energy consumption (kWh). Input energy per timestep.' },
  carrier_ratios: { group: 'Energy Flow', desc: 'Carrier input/output ratios for conversion_plus technologies (dict).' },
  export_carrier: { group: 'Energy Flow', desc: 'Carrier that can be exported from system.' },
  export_cap: { group: 'Energy Flow', desc: 'Maximum export capacity (kW).' },
  
  // Units
  units_max: { group: 'Units', desc: 'Maximum number of integer units that can be purchased.' },
  units_min: { group: 'Units', desc: 'Minimum number of integer units that must be purchased.' },
  units_equals: { group: 'Units', desc: 'Exact number of units to purchase.' },
  units_equals_systemwide: { group: 'Units', desc: 'System-wide exact number of units across all locations.' },
  units_max_systemwide: { group: 'Units', desc: 'System-wide maximum number of units across all locations.' }
};

// Cost definitions (complete from Creation.jsx)
const COST_DEFINITIONS = {
  energy_cap: { group: 'Investment', desc: 'Capital cost per unit energy capacity ($/kW). One-time installation cost.' },
  storage_cap: { group: 'Investment', desc: 'Capital cost per unit storage capacity ($/kWh).' },
  resource_cap: { group: 'Investment', desc: 'Capital cost per unit resource capacity ($/unit).' },
  resource_area: { group: 'Investment', desc: 'Capital cost per unit resource collection area ($/m²).' },
  purchase: { group: 'Investment', desc: 'Purchase cost per unit of technology ($).' },
  energy_cap_per_distance: { group: 'Investment', desc: 'Capital cost per unit capacity per unit distance ($/kW/km) for transmission.' },
  purchase_per_distance: { group: 'Investment', desc: 'Purchase cost per unit distance ($/km) for transmission.' },
  
  om_annual: { group: 'O&M', desc: 'Annual operations & maintenance cost ($/year). Fixed yearly cost.' },
  om_annual_investment_fraction: { group: 'O&M', desc: 'Annual O&M as fraction of investment cost (fraction).' },
  om_prod: { group: 'O&M', desc: 'Variable O&M cost per unit energy produced ($/kWh).' },
  om_con: { group: 'O&M', desc: 'Variable O&M cost per unit energy consumed ($/kWh).' },
  
  interest_rate: { group: 'Financial', desc: 'Interest rate for investment (fraction, e.g., 0.10 = 10%).' },
  depreciation_rate: { group: 'Financial', desc: 'Depreciation rate (fraction/year). Asset value reduction rate.' },
  
  export: { group: 'Other', desc: 'Revenue from exporting energy ($/kWh). Negative cost = revenue.' }
};

// Constraints configuration for parent types (complete from Creation.jsx)
const PARENT_CONSTRAINTS = {
  supply: [
    'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide',
    'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_eff',
    'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'force_resource', 'lifetime',
    'resource', 'resource_area_equals', 'resource_area_max', 'resource_area_min',
    'resource_area_per_energy_cap', 'resource_min_use', 'resource_scale', 'resource_unit',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  supply_plus: [
    'charge_rate', 'energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max',
    'energy_cap_per_storage_cap_equals', 'energy_cap_equals', 'energy_cap_equals_systemwide',
    'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use',
    'energy_cap_per_unit', 'energy_cap_scale', 'energy_eff', 'energy_prod', 'energy_ramping',
    'export_cap', 'export_carrier', 'force_resource', 'lifetime', 'parasitic_eff', 'resource',
    'resource_area_equals', 'resource_area_max', 'resource_area_min', 'resource_area_per_energy_cap',
    'resource_cap_equals', 'resource_cap_equals_energy_cap', 'resource_cap_max', 'resource_cap_min',
    'resource_eff', 'resource_min_use', 'resource_scale', 'resource_unit', 'storage_cap_equals',
    'storage_cap_max', 'storage_cap_min', 'storage_cap_per_unit', 'storage_initial', 'storage_loss',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  demand: [
    'energy_con', 'force_resource', 'resource', 'resource_area_equals', 'resource_scale', 'resource_unit'
  ],
  storage: [
    'charge_rate', 'energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max',
    'energy_cap_per_storage_cap_equals', 'energy_cap_equals', 'energy_cap_equals_systemwide',
    'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use',
    'energy_cap_per_unit', 'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod',
    'energy_ramping', 'export_cap', 'export_carrier', 'force_asynchronous_prod_con', 'lifetime',
    'storage_cap_equals', 'storage_cap_max', 'storage_cap_min', 'storage_cap_per_unit',
    'storage_initial', 'storage_loss', 'storage_time_max', 'storage_discharge_depth',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  transmission: [
    'energy_cap_equals', 'energy_cap_min', 'energy_cap_max', 'energy_cap_per_unit',
    'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_eff_per_distance', 'energy_prod',
    'force_asynchronous_prod_con', 'lifetime', 'one_way'
  ],
  conversion: [
    'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide',
    'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_con',
    'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'lifetime',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  conversion_plus: [
    'carrier_ratios', 'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max',
    'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit',
    'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap',
    'export_carrier', 'lifetime', 'units_equals', 'units_equals_systemwide', 'units_max',
    'units_max_systemwide', 'units_min'
  ]
};

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
    if (!template) return modelTechData;
    
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

  // Get icon for technology type
  const getTechIcon = (techName) => {
    const name = techName.toLowerCase();
    if (name.includes('solar') || name.includes('pv')) return <FiSun className="text-gray-600" />;
    if (name.includes('wind')) return <FiWind className="text-gray-600" />;
    if (name.includes('battery') || name.includes('storage')) return <FiBattery className="text-gray-600" />;
    if (name.includes('gas') || name.includes('ccgt')) return <FiZap className="text-gray-600" />;
    if (name.includes('coal')) return <FiActivity className="text-gray-700" />;
    if (name.includes('biomass')) return <FiDroplet className="text-gray-600" />;
    if (name.includes('demand')) return <FiHome className="text-gray-600" />;
    if (name.includes('transmission')) return <FiZap className="text-gray-600" />;
    return <FiCpu className="text-slate-600" />;
  };

  // Format technology name
  const formatTechName = (techName) => {
    return techName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Get unique tech types for location icons
  const getLocationTechIcons = (location) => {
    if (!location.techs || Object.keys(location.techs).length === 0) {
      return location.type === 'node' ? [<FiCircle key="node" className="text-slate-400" />] : [];
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
    <div className="flex-1 p-8 bg-gray-50">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Locations</h1>
        <p className="text-slate-600">Manage energy system nodes and locations</p>
        {currentModel && (
          <p className="text-sm text-gray-600 mt-1">Model: {currentModel.name}</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-800">
            Location List ({locations.length})
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm w-64"
              />
            </div>
            {hasChanges && (
              <button
                onClick={saveChanges}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm flex items-center gap-2 shadow-lg animate-pulse"
              >
                <FiSave /> Save Changes
              </button>
            )}
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm flex items-center gap-2"
            >
              <FiPlus /> Add Location
            </button>
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-96 flex items-center justify-center bg-slate-50">
            <p className="text-slate-500">No locations configured yet. Load a model to get started.</p>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-96 flex items-center justify-center bg-slate-50">
            <p className="text-slate-500">No locations match your search.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLocations.map((location) => {
              const originalIndex = locations.indexOf(location);
              return (
              <div key={originalIndex} className="border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 transition-colors">
                {/* Location Header */}
                <div className="bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => setExpandedLocation(expandedLocation === originalIndex ? null : originalIndex)}
                        className="text-slate-600 hover:text-slate-800"
                      >
                        {expandedLocation === originalIndex ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                      </button>
                      
                      {editingIndex === originalIndex ? (
                        <input
                          type="text"
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="px-3 py-1 border border-slate-300 rounded text-sm font-medium flex-1 max-w-xs"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-slate-800">{location.name}</span>
                      )}
                      
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        location.type === 'demand' ? 'bg-gray-100 text-gray-800' :
                        location.type === 'supply' ? 'bg-gray-100 text-gray-800' :
                        location.type === 'supply_plus' ? 'bg-gray-100 text-gray-800' :
                        location.type === 'storage' ? 'bg-gray-100 text-gray-800' :
                        location.type === 'conversion' ? 'bg-gray-100 text-gray-800' :
                        location.type === 'conversion_plus' ? 'bg-gray-100 text-gray-800' :
                        location.type === 'transmission' ? 'bg-gray-100 text-gray-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {location.type}
                      </span>

                      {/* Technology Icons */}
                      <div className="flex items-center gap-1">
                        {getLocationTechIcons(location).map((icon, iconIdx) => (
                          <div key={iconIdx} className="p-1">
                            {icon}
                          </div>
                        ))}
                      </div>

                      {location.techs && Object.keys(location.techs).length > 0 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium flex items-center gap-1">
                          <FiCpu size={12} />
                          {Object.keys(location.techs).length} techs
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">
                        {location.latitude?.toFixed(4) || 'N/A'}, {location.longitude?.toFixed(4) || 'N/A'}
                      </span>
                      {editingIndex !== originalIndex && (
                        <>
                          <button
                            onClick={() => startEdit(originalIndex)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <FiEdit2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteLocation(originalIndex)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </>
                      )}
                      {editingIndex === originalIndex && (
                        <>
                          <button onClick={saveEdit} className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                            <FiCheck size={18} />
                          </button>
                          <button onClick={cancelEdit} className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg">
                            <FiX size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edit mode: Coordinates */}
                  {editingIndex === originalIndex && (
                    <div className="mt-3 flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-600 mb-1">Latitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={editData.latitude}
                          onChange={(e) => setEditData({ ...editData, latitude: parseFloat(e.target.value) })}
                          className="w-full px-3 py-1 border border-slate-300 rounded text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-600 mb-1">Longitude</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={editData.longitude}
                          onChange={(e) => setEditData({ ...editData, longitude: parseFloat(e.target.value) })}
                          className="w-full px-3 py-1 border border-slate-300 rounded text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-600 mb-1">Type</label>
                        <select
                          value={editData.type}
                          onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                          className="w-full px-3 py-1 border border-slate-300 rounded text-sm"
                        >
                          <option value="demand">demand</option>
                          <option value="supply">supply</option>
                          <option value="supply_plus">supply_plus</option>
                          <option value="storage">storage</option>
                          <option value="conversion">conversion</option>
                          <option value="conversion_plus">conversion_plus</option>
                          <option value="transmission">transmission</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Details: Technologies */}
                {expandedLocation === originalIndex && (
                  <div className="bg-white p-4 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <FiCpu className="text-gray-600" />
                        Technologies at this Location
                      </h4>
                      {editingTech && editingTech.locationIndex === originalIndex && (
                        <button
                          onClick={saveEditTech}
                          className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
                        >
                          <FiCheck className="inline mr-1" /> Done Editing
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
                            <div key={techIdx} className="border border-slate-200 rounded-lg bg-white">
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
                                      <FiEdit2 size={14} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => removeTechnology(originalIndex, techName)}
                                    className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                                  >
                                    <FiTrash2 size={14} />
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
                                      {expandedSections[`${sectionKey}_essentials`] ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
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
                                                      className="w-8 h-6 border border-slate-300 rounded cursor-pointer"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={value}
                                                      onChange={(e) => updateTechEssential(originalIndex, techName, key, e.target.value)}
                                                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-gray-500"
                                                    />
                                                  </div>
                                                ) : key === 'parent' ? (
                                                  <span className="text-xs font-medium text-slate-800">{value}</span>
                                                ) : (
                                                  <input
                                                    type="text"
                                                    value={value}
                                                    onChange={(e) => updateTechEssential(originalIndex, techName, key, e.target.value)}
                                                    className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-gray-500"
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
                                      {expandedSections[`${sectionKey}_constraints`] ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
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
                                                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white font-mono"
                                                    />
                                                    <input
                                                      type="text"
                                                      value={typeof value === 'object' ? JSON.stringify(value) : value}
                                                      onChange={(e) => updateTechConstraint(originalIndex, techName, key, e.target.value)}
                                                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono bg-white"
                                                      placeholder={isResourceConstraint ? "Value or upload CSV below" : "Value"}
                                                    />
                                                    <button
                                                      onClick={() => removeTechConstraint(originalIndex, techName, key)}
                                                      className="text-gray-500 hover:text-gray-600"
                                                    >
                                                      <FiX size={16} />
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
                                          <div className="pt-2 border-t border-slate-200">
                                            <button
                                              onClick={() => setConstraintSearch({ ...constraintSearch, [`${sectionKey}`]: 'open' })}
                                              className="group flex h-9 w-full items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-gray-600 hover:pl-2 hover:text-white active:bg-gray-700 text-sm font-medium text-gray-800"
                                            >
                                              <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                                                <FiArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
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
                                      {expandedSections[`${sectionKey}_costs`] ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
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
                                          <div className="pt-2 border-t border-slate-200">
                                            <button
                                              onClick={() => setCostSearch({ ...costSearch, [`${sectionKey}`]: 'open' })}
                                              className="group flex h-9 w-full items-center gap-2 rounded-full bg-gray-200 pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-gray-600 hover:pl-2 hover:text-white active:bg-gray-700 text-sm font-medium text-gray-800"
                                            >
                                              <span className="rounded-full bg-gray-600 p-1 text-sm transition-colors duration-300 group-hover:bg-white">
                                                <FiArrowRight className="-translate-x-[200%] text-[0px] transition-all duration-300 group-hover:translate-x-0 group-hover:text-base group-hover:text-gray-600" />
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
                                {(!techData.essentials || Object.keys(techData.essentials).length === 0) &&
                                 (!techData.constraints || Object.keys(techData.constraints).length === 0) &&
                                 (!techData.costs || Object.keys(techData.costs).length === 0) && (
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
                      <div className="border-t border-slate-200 pt-3">
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
                              <div key={parentType} className="border border-slate-200 rounded-lg overflow-hidden">
                                {/* Category header */}
                                <button
                                  onClick={() => setExpandedTechCategories({ ...expandedTechCategories, [categoryKey]: !isCategoryExpanded })}
                                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 transition-colors"
                                >
                                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                    {categoryLabel} ({techsInCategory.length})
                                  </span>
                                  {isCategoryExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                                </button>
                                {isCategoryExpanded && (
                                  <div className="bg-white divide-y divide-slate-100">
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
                                              {isSubExpanded ? <FiChevronDown size={12} className="text-slate-400" /> : <FiChevronRight size={12} className="text-slate-400" />}
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
                                                      isAssigned ? 'bg-gray-100 opacity-60' : 'bg-white border border-slate-200'
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
                                                          : 'bg-gray-600 text-white hover:bg-gray-700'
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
        )}
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
              <div className="p-4 border-b border-slate-200 bg-gray-600 text-white">
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
                        <div key={group} className="border-b border-slate-200 last:border-b-0">
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
                            {isExpanded ? <FiChevronDown size={16} className="text-gray-600" /> : <FiChevronRight size={16} className="text-gray-600" />}
                          </button>
                          {isExpanded && (
                            <div className="divide-y divide-slate-100 bg-white">
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
              <div className="p-4 border-t border-slate-200 bg-slate-50">
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
              <div className="p-4 border-b border-slate-200 bg-gray-600 text-white">
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
                        <div key={group} className="border-b border-slate-200 last:border-b-0">
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
                            {isExpanded ? <FiChevronDown size={16} className="text-gray-600" /> : <FiChevronRight size={16} className="text-gray-600" />}
                          </button>
                          {isExpanded && (
                            <div className="divide-y divide-slate-100 bg-white">
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
              <div className="p-4 border-t border-slate-200 bg-slate-50">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-800">Add New Location</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newLocation.name}
                  onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Location name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={newLocation.type}
                  onChange={(e) => setNewLocation({ ...newLocation, type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={newLocation.latitude}
                  onChange={(e) => setNewLocation({ ...newLocation, latitude: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="e.g., 52.5200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={newLocation.longitude}
                  onChange={(e) => setNewLocation({ ...newLocation, longitude: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="e.g., 13.4050"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewLocation({ name: '', latitude: '', longitude: '', type: 'demand' });
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addLocation}
                disabled={!newLocation.name || !newLocation.latitude || !newLocation.longitude}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Add Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-800">Confirm Deletion</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-700">{deleteConfirmDialog.message}</p>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmDialog(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Locations;
