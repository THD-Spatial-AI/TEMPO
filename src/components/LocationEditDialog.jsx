import React, { useState, useEffect } from 'react';
import { FiX, FiTrash2, FiCheck, FiChevronDown, FiChevronRight, FiHelpCircle, FiCpu, FiArrowRight } from 'react-icons/fi';
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, ESSENTIAL_DEFINITIONS, PARENT_CONSTRAINTS } from '../utils/constraintDefinitions';

// Format technology name: capitalize first letter only and replace underscores and hyphens
const formatTechName = (techName) => {
  if (!techName) return '';
  const formatted = techName
    .replace(/_/g, ' ')
    .replace(/-/g, ' ');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
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

  // Add technology to dialog
  const addTechToDialog = (techName) => {
    if (!dialogTechs.includes(techName)) {
      setDialogTechs([...dialogTechs, techName]);
    }
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
                          
                          {/* Collapsible Tech Editor - Will be added in next message due to size */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 space-y-4">
                              <p className="text-xs text-slate-500 italic">
                                Advanced editing (constraints, costs, essentials) available in full version
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                                        onClick={() => !isSelected && addTechToDialog(techName)}
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
