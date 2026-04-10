import React, { useState, useEffect } from 'react';
import { FiX, FiTrash2, FiCheck, FiChevronDown, FiChevronRight, FiHelpCircle, FiCpu, FiArrowRight, FiPlus } from 'react-icons/fi';
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, ESSENTIAL_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions';
import { CARRIERS_BY_GROUP } from '../config/carriers';

// Format technology name: capitalize first letter only and replace underscores and hyphens
const formatTechName = (techName) => {
  if (!techName) return '';
  const formatted = techName
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
};

// Common cost names tech templates use
const COMMON_COST_KEYS = ['energy_cap', 'om_annual', 'om_prod', 'om_con', 'purchase', 'resource_cap', 'storage_cap'];

// Inline helper: select an available constraint from the parent's list and add it
const AddConstraintInline = ({ techTemplate, existing, onAdd }) => {
  const parentType = techTemplate?.parent;
  const available = (PARENT_CONSTRAINTS[parentType] || []).filter(c => !(c in existing));
  const [selected, setSelected] = useState('');
  if (available.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
      >
        <option value="">+ Add constraint…</option>
        {available.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <button
        onClick={() => { if (selected) { onAdd(selected); setSelected(''); } }}
        disabled={!selected}
        className="px-2 py-0.5 text-xs bg-gray-600 text-white rounded disabled:bg-gray-300"
      >
        Add
      </button>
    </div>
  );
};

// Inline helper: select a common cost key and add it
const AddCostInline = ({ existing, onAdd }) => {
  const available = COMMON_COST_KEYS.filter(k => !(k in existing));
  const [selected, setSelected] = useState('');
  if (available.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
      >
        <option value="">+ Add cost…</option>
        {available.map(k => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <button
        onClick={() => { if (selected) { onAdd(selected); setSelected(''); } }}
        disabled={!selected}
        className="px-2 py-0.5 text-xs bg-gray-600 text-white rounded disabled:bg-gray-300"
      >
        Add
      </button>
    </div>
  );
};

const LocationEditDialog = ({
  isOpen,
  onClose,
  location,
  mode,
  techMap,
  onSave,
  onModeChange
}) => {
  // Dialog-specific state
  const [pendingLocation, setPendingLocation] = useState(null);
  const [isNode, setIsNode] = useState(false);
  const [dialogTechs, setDialogTechs] = useState([]);
  const [editingConstraints, setEditingConstraints] = useState({});
  const [editingEssentials, setEditingEssentials] = useState({});
  const [editingCosts, setEditingCosts] = useState({});
  const [techCsvFiles, setTechCsvFiles] = useState({});
  const [constraintCsvFiles, setConstraintCsvFiles] = useState({});
  const [expandedTechConstraints, setExpandedTechConstraints] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [constraintSearch, setConstraintSearch] = useState({});
  const [costSearch, setCostSearch] = useState({});
  const [selectedConstraintGroup, setSelectedConstraintGroup] = useState({});
  const [selectedCostGroup, setSelectedCostGroup] = useState({});
  const [showNodeConfirmDialog, setShowNodeConfirmDialog] = useState(false);
  const [originalLocationData, setOriginalLocationData] = useState(null);
  // Instance selection state: key = techName, value = selected index
  const [selectedInstances, setSelectedInstances] = useState({});

  // Initialize dialog state when location changes
  useEffect(() => {
    if (isOpen && location) {
      setPendingLocation(location);
      setIsNode(location.isNode || false);
      
      // Extract technologies from existing location
      const techs = Object.keys(location.techs || {});
      setDialogTechs(techs);
      
      // Extract constraints, essentials, and costs
      const constraints = {};
      const essentials = {};
      const costs = {};
      
      techs.forEach(techName => {
        const tech = location.techs[techName];
        if (tech) {
          constraints[techName] = tech.constraints || {};
          essentials[techName] = tech.essentials || {};
          costs[techName] = tech.costs?.monetary || {};
        }
      });
      
      setEditingConstraints(constraints);
      setEditingEssentials(essentials);
      setEditingCosts(costs);
      
      // Store original data for change detection
      if (location.id) {
        setOriginalLocationData({
          ...location,
          dialogTechs: techs
        });
      } else {
        setOriginalLocationData(null);
      }
    }
  }, [isOpen, location]);

  // Add technology to dialog, optionally with instance params pre-filled
  const addTechToDialog = (techName, instanceParams) => {
    if (dialogTechs.includes(techName)) return;
    const techTemplate = techMap[techName];
    setDialogTechs(prev => [...prev, techName]);
    // Seed constraints
    const baseConstraints = techTemplate?.constraints ? { ...techTemplate.constraints } : {};
    setEditingConstraints(prev => ({
      ...prev,
      [techName]: instanceParams?.constraints
        ? { ...baseConstraints, ...instanceParams.constraints }
        : baseConstraints
    }));
    // Seed essentials
    setEditingEssentials(prev => ({
      ...prev,
      [techName]: techTemplate?.essentials ? { ...techTemplate.essentials } : {}
    }));
    // Seed costs
    const baseCosts = techTemplate?.costs?.monetary
      ? { ...techTemplate.costs.monetary }
      : techTemplate?.costs ? { ...techTemplate.costs } : {};
    setEditingCosts(prev => ({
      ...prev,
      [techName]: instanceParams?.monetary
        ? { ...baseCosts, ...instanceParams.monetary }
        : baseCosts
    }));
  };

  // Remove technology from dialog
  const removeTechFromDialog = (techName) => {
    setDialogTechs(dialogTechs.filter(t => t !== techName));
    
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

  // Update constraint for a technology
  const updateDialogConstraint = (techName, key, value) => {
    setEditingConstraints({
      ...editingConstraints,
      [techName]: {
        ...(editingConstraints[techName] || {}),
        [key]: isNaN(value) || value === '' ? value : parseFloat(value)
      }
    });
  };

  // Update essential for a technology
  const updateDialogEssential = (techName, key, value) => {
    setEditingEssentials({
      ...editingEssentials,
      [techName]: {
        ...(editingEssentials[techName] || {}),
        [key]: value
      }
    });
  };

  // Update cost for a technology
  const updateDialogCost = (techName, key, value) => {
    setEditingCosts({
      ...editingCosts,
      [techName]: {
        ...(editingCosts[techName] || {}),
        [key]: isNaN(value) || value === '' ? value : parseFloat(value)
      }
    });
  };

  // Handle CSV uploads
  const handleTechCsvUpload = (techName, file) => {
    if (file && file.name.endsWith('.csv')) {
      setTechCsvFiles({
        ...techCsvFiles,
        [techName]: file
      });
    }
  };

  const handleConstraintCsvUpload = (techName, constraintKey, file) => {
    if (file && file.name.endsWith('.csv')) {
      const fileKey = `${techName}_${constraintKey}`;
      setConstraintCsvFiles({
        ...constraintCsvFiles,
        [fileKey]: file
      });
      updateDialogConstraint(techName, constraintKey, `file:${file.name}`);
    }
  };

  // Toggle tech constraints
  const toggleTechConstraints = (techName) => {
    setExpandedTechConstraints({
      ...expandedTechConstraints,
      [techName]: !expandedTechConstraints[techName]
    });
  };

  // Toggle category
  const toggleCategory = (categoryKey) => {
    setExpandedCategories({
      ...expandedCategories,
      [categoryKey]: !expandedCategories[categoryKey]
    });
  };

  // Handle node checkbox change
  const handleNodeCheckboxChange = (checked) => {
    if (checked && dialogTechs.length > 0) {
      setShowNodeConfirmDialog(true);
    } else {
      setIsNode(checked);
    }
  };

  // Confirm node conversion
  const confirmNodeConversion = () => {
    setIsNode(true);
    setDialogTechs([]);
    setEditingConstraints({});
    setEditingEssentials({});
    setEditingCosts({});
    setTechCsvFiles({});
    setConstraintCsvFiles({});
    setPendingLocation({ ...pendingLocation, techs: {} });
    setShowNodeConfirmDialog(false);
  };

  // Check if location has been modified
  const hasLocationChanged = () => {
    if (!originalLocationData) return true;
    
    if (pendingLocation.latitude !== originalLocationData.latitude) return true;
    if (pendingLocation.longitude !== originalLocationData.longitude) return true;
    if (pendingLocation.name !== originalLocationData.name) return true;
    if (isNode !== originalLocationData.isNode) return true;
    
    const currentTechs = [...dialogTechs].sort();
    const originalTechs = [...originalLocationData.dialogTechs].sort();
    if (JSON.stringify(currentTechs) !== JSON.stringify(originalTechs)) return true;
    
    for (const techName of dialogTechs) {
      const originalTech = originalLocationData.techs[techName];
      const currentConstraints = editingConstraints[techName] || {};
      const currentEssentials = editingEssentials[techName] || {};
      const currentCosts = editingCosts[techName] || {};
      
      if (originalTech) {
        if (JSON.stringify(currentConstraints) !== JSON.stringify(originalTech.constraints || {})) return true;
        if (JSON.stringify(currentEssentials) !== JSON.stringify(originalTech.essentials || {})) return true;
        if (JSON.stringify(currentCosts) !== JSON.stringify(originalTech.costs?.monetary || {})) return true;
      } else {
        return true;
      }
    }
    
    return false;
  };

  // Confirm location creation/update
  const confirmLocationCreation = () => {
    if (!pendingLocation) return;
    
    const locationType = mode === 'single' ? 'single' : mode === 'multiple' ? 'multiple' : (pendingLocation.locationType || 'single');
    
    const finalLocation = {
      ...pendingLocation,
      isNode: isNode,
      locationType: locationType,
      techs: {}
    };

    // Add selected technologies with their configurations
    dialogTechs.forEach(techName => {
      const techTemplate = techMap[techName];
      const customConstraints = editingConstraints[techName] || {};
      const customEssentials = editingEssentials[techName] || {};
      const customCosts = editingCosts[techName] || {};
      
      finalLocation.techs[techName] = {
        parent: techTemplate?.parent || 'unknown',
        essentials: { ...techTemplate?.essentials, ...customEssentials },
        constraints: { ...techTemplate?.constraints, ...customConstraints },
        costs: {
          monetary: { ...(techTemplate?.costs?.monetary || {}), ...customCosts }
        },
        csvFile: techCsvFiles[techName] || null
      };
    });

    // Validate based on location type
    if (locationType === 'single' && dialogTechs.length > 1 && !isNode) {
      alert('Single location can only have one technology');
      return;
    }

    // Call parent save handler
    onSave(finalLocation, originalLocationData !== null);
    
    // Close dialog
    handleClose();
  };

  const handleClose = () => {
    // Reset all state
    setPendingLocation(null);
    setIsNode(false);
    setDialogTechs([]);
    setEditingConstraints({});
    setEditingEssentials({});
    setEditingCosts({});
    setTechCsvFiles({});
    setConstraintCsvFiles({});
    setExpandedTechConstraints({});
    setExpandedCategories({});
    setExpandedSections({});
    setConstraintSearch({});
    setCostSearch({});
    setSelectedConstraintGroup({});
    setSelectedCostGroup({});
    setSelectedInstances({});
    setOriginalLocationData(null);
    onClose();
  };

  if (!isOpen || !pendingLocation) return null;

  return (
    <>
      {/* Main Dialog */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="p-6 border-b border-slate-200 sticky top-0 bg-white">
            <h3 className="text-xl font-bold text-slate-800">
              Configure {mode === 'single' ? 'Single' : mode === 'multiple' ? 'Multiple' : ''} Location
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

            {/* Node Option - Only for Single Location Mode */}
            {mode === 'single' && (
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                <input
                  type="checkbox"
                  id="isNode"
                  checked={isNode}
                  onChange={(e) => handleNodeCheckboxChange(e.target.checked)}
                  className="w-4 h-4 text-gray-600 border-slate-300 rounded focus:ring-gray-500"
                />
                <label htmlFor="isNode" className="text-sm font-medium text-slate-700">
                  This is a node (connection point without technologies)
                </label>
              </div>
            )}

            {/* Technologies Selection */}
            {!isNode && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Technologies ({dialogTechs.length} selected)
                  </label>
                  {mode === 'single' && dialogTechs.length === 1 && onModeChange && (
                    <button
                      onClick={() => onModeChange('multiple')}
                      className="px-3 py-1 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-1"
                    >
                      <FiCpu size={12} />
                      Add More Techs
                    </button>
                  )}
                </div>
                
                {/* Selected Technologies List */}
                {dialogTechs.length > 0 && (
                  <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    {dialogTechs.map(techName => {
                      const techTemplate = techMap[techName];
                      const customConstraints = editingConstraints[techName] || {};
                      const allConstraints = { ...techTemplate?.constraints, ...customConstraints };
                      const isExpanded = expandedTechConstraints[techName];
                      const csvFile = techCsvFiles[techName];
                      
                      return (
                        <div key={techName} className="bg-white rounded-lg p-3 border border-gray-300">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{formatTechName(techName)}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleTechConstraints(techName)}
                                className="text-slate-600 hover:text-slate-800 text-xs flex items-center gap-1"
                              >
                                {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => removeTechFromDialog(techName)}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                <FiTrash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {/* Demand Value or CSV Upload - Mandatory for demand technologies */}
                          {techTemplate?.parent === 'demand' && (
                            <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
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
                                <p className="text-xs text-gray-600 mt-1">✓ {csvFile.name}</p>
                              )}
                            </div>
                          )}
                          
                          {/* Production/Consumption CSV - Optional for non-demand technologies */}
                          {techTemplate?.parent !== 'demand' && (
                            <div className="mt-2">
                              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <span>Production/Consumption CSV:</span>
                                <input
                                  type="file"
                                  accept=".csv"
                                  onChange={(e) => handleTechCsvUpload(techName, e.target.files[0])}
                                  className="text-xs"
                                />
                              </label>
                              {csvFile && (
                                <p className="text-xs text-gray-600 mt-1">✓ {csvFile.name}</p>
                              )}
                            </div>
                          )}
                          
                          {/* Expanded tech editor: constraints + costs */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                              {/* Essentials (carrier fields) */}
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-1">Essentials</p>
                                {Object.keys(editingEssentials[techName] || {}).filter(
                                  k => !['name','color','parent'].includes(k)
                                ).length === 0 && (
                                  <p className="text-xs text-slate-400 italic mb-1">No essentials overridden</p>
                                )}
                                <div className="space-y-1">
                                  {Object.entries(editingEssentials[techName] || {})
                                    .filter(([k]) => !['name','color','parent'].includes(k))
                                    .map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-1">
                                      <span className="text-[11px] text-slate-500 w-24 flex-shrink-0 font-mono">{key}</span>
                                      {['carrier','carrier_in','carrier_out'].includes(key) ? (
                                        <select
                                          value={Array.isArray(val) ? val[0] : (val || '')}
                                          onChange={e => updateDialogEssential(techName, key, e.target.value)}
                                          className="flex-1 text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                        >
                                          <option value="">— select carrier —</option>
                                          {Object.entries(CARRIERS_BY_GROUP).map(([group, carriers]) => (
                                            <optgroup key={group} label={group}>
                                              {carriers.map(c => (
                                                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                                              ))}
                                            </optgroup>
                                          ))}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          value={val ?? ''}
                                          onChange={e => updateDialogEssential(techName, key, e.target.value)}
                                          className="flex-1 px-2 py-0.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-gray-400 font-mono"
                                        />
                                      )}
                                      <button
                                        onClick={() => {
                                          const e = { ...editingEssentials[techName] };
                                          delete e[key];
                                          setEditingEssentials({ ...editingEssentials, [techName]: e });
                                        }}
                                        className="text-slate-400 hover:text-red-500"
                                      >
                                        <FiX size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                {/* Quick-add carrier keys */}
                                {(() => {
                                  const existing = Object.keys(editingEssentials[techName] || {});
                                  const parent = techTemplate?.parent;
                                  const suggestions = [];
                                  if (!existing.includes('carrier')) suggestions.push('carrier');
                                  if (!existing.includes('carrier_in') && ['conversion','conversion_plus'].includes(parent)) suggestions.push('carrier_in');
                                  if (!existing.includes('carrier_out') && ['conversion','conversion_plus','supply','supply_plus'].includes(parent)) suggestions.push('carrier_out');
                                  if (suggestions.length === 0) return null;
                                  return (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {suggestions.map(key => (
                                        <button
                                          key={key}
                                          onClick={() => updateDialogEssential(techName, key, '')}
                                          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] border border-dashed border-slate-300 rounded text-slate-500 hover:border-gray-400 hover:text-gray-700"
                                        >
                                          <FiPlus size={9} /> {key}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                              {/* Constraints */}
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-1">Constraints</p>
                                {Object.entries(editingConstraints[techName] || {}).length === 0 && (
                                  <p className="text-xs text-slate-400 italic mb-1">No constraints set</p>
                                )}
                                <div className="space-y-1">
                                  {Object.entries(editingConstraints[techName] || {}).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-1">
                                      <span className="text-[11px] text-slate-500 w-36 flex-shrink-0 font-mono">{key}</span>
                                      <input
                                        type="text"
                                        value={val ?? ''}
                                        onChange={(e) => updateDialogConstraint(techName, key, e.target.value)}
                                        className="flex-1 px-2 py-0.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-gray-400 font-mono"
                                      />
                                      <button
                                        onClick={() => {
                                          const c = { ...editingConstraints[techName] };
                                          delete c[key];
                                          setEditingConstraints({ ...editingConstraints, [techName]: c });
                                        }}
                                        className="text-slate-400 hover:text-red-500"
                                      >
                                        <FiX size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                {/* Quick-add common constraint */}
                                <AddConstraintInline
                                  techTemplate={techTemplate}
                                  existing={editingConstraints[techName] || {}}
                                  onAdd={(key) => updateDialogConstraint(techName, key, '')}
                                />
                              </div>
                              {/* Costs */}
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-1">Costs (monetary)</p>
                                {Object.entries(editingCosts[techName] || {}).length === 0 && (
                                  <p className="text-xs text-slate-400 italic mb-1">No costs set</p>
                                )}
                                <div className="space-y-1">
                                  {Object.entries(editingCosts[techName] || {}).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-1">
                                      <span className="text-[11px] text-slate-500 w-36 flex-shrink-0 font-mono">{key}</span>
                                      <input
                                        type="text"
                                        value={val ?? ''}
                                        onChange={(e) => updateDialogCost(techName, key, e.target.value)}
                                        className="flex-1 px-2 py-0.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-gray-400 font-mono"
                                      />
                                      <button
                                        onClick={() => {
                                          const c = { ...editingCosts[techName] };
                                          delete c[key];
                                          setEditingCosts({ ...editingCosts, [techName]: c });
                                        }}
                                        className="text-slate-400 hover:text-red-500"
                                      >
                                        <FiX size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <AddCostInline
                                  existing={editingCosts[techName] || {}}
                                  onAdd={(key) => updateDialogCost(techName, key, '')}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Technology Library */}
                <div className="max-h-[480px] overflow-y-auto border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-3">
                    Technology Library ({Object.keys(techMap).length})
                  </p>
                  {Object.keys(techMap).length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      <p>No technologies available.</p>
                      <p className="text-xs mt-2">The API catalog will load automatically.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Note: transmission lines/pipelines are for links only. 
                          Transformers/substations are point infrastructure and can be added to locations. */}
                      {[
                        { key: 'supply_plus', label: 'Variable Renewables' },
                        { key: 'supply',      label: 'Dispatchable Generation' },
                        { key: 'demand',      label: 'Demand' },
                        { key: 'storage',     label: 'Storage' },
                        { key: 'conversion_plus', label: 'Sector Coupling' },
                        { key: 'conversion',  label: 'Conversion' },
                        { key: 'transmission', label: 'Substations & Transformers' },
                      ].map(({ key: parentType, label: categoryLabel }) => {
                        // For transmission, only show point infrastructure (transformers/substations)
                        // Exclude line/pipeline techs (cables, pipelines, networks)
                        const techsInCategory = Object.entries(techMap).filter(([techName, tech]) => {
                          if (tech.parent !== parentType) return false;
                          if (parentType === 'transmission') {
                            // Only include point infrastructure: transformers and substations
                            // Exclude: lines, cables, pipelines, networks, overhead, subsea, underground, heating, cooling
                            const lowerName = (techName || '').toLowerCase();
                            const lowerLabel = (tech.name || '').toLowerCase();
                            const excludedKeywords = [
                              'line', 'cable', 'pipeline', 'network', 'overhead', 'subsea', 
                              'underground', 'heating', 'cooling', 'hvac', 'hvdc', 'district'
                            ];
                            const isLinear = excludedKeywords.some(keyword => 
                              lowerName.includes(keyword) || lowerLabel.includes(keyword)
                            );
                            // Also exclude if has per_distance cost (definitive sign it's a line/pipeline)
                            const hasPerDistanceCost = tech.costs?.monetary?.energy_cap_per_distance !== undefined;
                            return !isLinear && !hasPerDistanceCost;
                          }
                          return true;
                        });
                        if (techsInCategory.length === 0) return null;
                        const catExpanded = expandedCategories[`dialog_${parentType}`];
                        return (
                          <div key={parentType} className="border border-slate-200 rounded-lg overflow-hidden">
                            {/* Category header */}
                            <button
                              onClick={() => toggleCategory(`dialog_${parentType}`)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                {categoryLabel} ({techsInCategory.length})
                              </span>
                              {catExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                            </button>
                            {catExpanded && (
                              <div className="bg-white divide-y divide-slate-100">
                                {techsInCategory.map(([techName, tech]) => {
                                  const instances = tech.instances || [];
                                  // True if every instance of this tech has been added
                                  const allAdded = instances.length > 0
                                    ? instances.every((inst, idx) => dialogTechs.includes(idx === 0 ? techName : `${techName}__${idx}`))
                                    : dialogTechs.includes(techName);
                                  const subKey = `dialog_${parentType}_${techName}`;
                                  const subExpanded = expandedCategories[subKey];
                                  return (
                                    <div key={techName}>
                                      {/* Tech subcategory header */}
                                      <button
                                        onClick={() => toggleCategory(subKey)}
                                        className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors ${
                                          allAdded ? 'bg-gray-50 opacity-60' : 'hover:bg-slate-50'
                                        }`}
                                      >
                                        <span className="text-xs font-semibold text-slate-700">{formatTechName(techName)}</span>
                                        <div className="flex items-center gap-2">
                                          {instances.length > 0 && (
                                            <span className="text-[10px] text-slate-400">{instances.length} variant{instances.length !== 1 ? 's' : ''}</span>
                                          )}
                                          {subExpanded ? <FiChevronDown size={12} className="text-slate-400" /> : <FiChevronRight size={12} className="text-slate-400" />}
                                        </div>
                                      </button>
                                      {/* Instance rows */}
                                      {subExpanded && (
                                        <div className="pl-4 pr-2 pb-2 bg-slate-50 space-y-1">
                                          {(instances.length > 0 ? instances : [null]).map((inst, idx) => {
                                            const instTechName = instances.length > 0 && idx > 0 ? `${techName}__${idx}` : techName;
                                            const isAdded = dialogTechs.includes(instTechName) ||
                                              (idx === 0 && dialogTechs.includes(techName));
                                            const eff = inst?.constraints?.energy_eff;
                                            const lifetime = inst?.constraints?.lifetime;
                                            const capex = inst?.monetary?.energy_cap;
                                            const rowLabel = inst?.displayLabel || inst?.label || inst?.raw?.label || `Variant ${idx + 1}`;
                                            return (
                                              <div
                                                key={idx}
                                                className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${
                                                  isAdded ? 'bg-gray-100 opacity-60' : 'bg-white border border-slate-200'
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
                                                  onClick={() => { if (!isAdded) addTechToDialog(techName, inst); }}
                                                  disabled={isAdded}
                                                  className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                                                    isAdded
                                                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                      : 'bg-gray-600 text-white hover:bg-gray-700'
                                                  }`}
                                                >
                                                  {isAdded ? '✓' : '+ Add'}
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
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-200 flex gap-3 justify-end sticky bottom-0 bg-white">
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmLocationCreation}
              disabled={originalLocationData && !hasLocationChanged()}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              <FiCheck size={16} />
              {originalLocationData ? 'Update Location' : 'Create Location'}
            </button>
          </div>
        </div>
      </div>

      {/* Node Conversion Confirmation Dialog */}
      {showNodeConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Convert to Node?</h3>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700">
                A node is a connection point without technologies.
              </p>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm font-semibold text-gray-800 mb-2">
                  This will permanently remove {dialogTechs.length} technolog{dialogTechs.length === 1 ? 'y' : 'ies'}:
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {dialogTechs.map(techName => (
                    <li key={techName} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-gray-500 mt-0.5">•</span>
                      <span>{formatTechName(techName)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowNodeConfirmDialog(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmNodeConversion}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FiTrash2 size={16} />
                Convert to Node
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LocationEditDialog;
