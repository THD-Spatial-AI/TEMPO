// Full location edit dialog (name, coordinates, technologies, constraints,
// costs, CSV demand upload) for the Deck.GL map view. Extracted verbatim from
// MapDeckGL.jsx; the parent owns all edit state and passes it as props, and
// still gates rendering on `showEditDialog && editingLocation`.
import { CONSTRAINT_DEFINITIONS, COST_DEFINITIONS, PARENT_CONSTRAINTS } from '../../utils/constraintDefinitions';
import { FiArrowRight, FiCheck, FiChevronDown, FiChevronRight, FiHelpCircle, FiTrash2, FiX } from 'react-icons/fi';
import { formatTechName } from '../../utils/mapVisuals';

export default function MapLocationEditDialog({
  addTechToDialog,
  constraintCsvFiles,
  constraintSearch,
  costSearch,
  dialogTechs,
  editingConstraints,
  editingCosts,
  editingEssentials,
  editingLocation,
  expandedSections,
  expandedTechConstraints,
  expandedTechSubcategories,
  handleConstraintCsvUpload,
  handleTechCsvUpload,
  hasLocationChanged,
  removeTechFromDialog,
  saveEditedLocation,
  selectedConstraintGroup,
  selectedCostGroup,
  setConstraintSearch,
  setCostSearch,
  setEditingLocation,
  setExpandedSections,
  setExpandedTechSubcategories,
  setSelectedConstraintGroup,
  setSelectedCostGroup,
  setShowEditDialog,
  techCsvFiles,
  techMap,
  toggleTechConstraints,
  updateDialogConstraint,
  updateDialogCost,
  updateDialogEssential,
}) {
  return (
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
                    <div className="space-y-1">
                      {([
                        { key: 'supply_plus', label: 'Variable Renewables' },
                        { key: 'supply',      label: 'Dispatchable Supply' },
                        { key: 'storage',     label: 'Storage' },
                        { key: 'conversion_plus', label: 'Conversion' },
                        { key: 'transmission', label: 'Transmission' },
                        { key: 'demand',      label: 'Demand' },
                      ]).map(({ key: parentType, label: categoryLabel }) => {
                        const techsInCategory = Object.entries(techMap).filter(([, tech]) => tech.parent === parentType);
                        if (techsInCategory.length === 0) return null;
                        const isCatExpanded = expandedSections[`add_${parentType}`];
                        return (
                          <div key={parentType}>
                            {/* Category header */}
                            <button
                              onClick={() => setExpandedSections(prev => ({ ...prev, [`add_${parentType}`]: !isCatExpanded }))}
                              className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 transition-colors rounded"
                            >
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{categoryLabel}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400">{techsInCategory.length}</span>
                                {isCatExpanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                              </div>
                            </button>
                            {isCatExpanded && (
                              <div className="ml-2 mt-0.5 space-y-0.5">
                                {techsInCategory.map(([techName, tech]) => {
                                  const instances = tech.instances || [];
                                  const subKey = `sub_${parentType}_${techName}`;
                                  const isSubExpanded = expandedTechSubcategories[subKey];
                                  const isAssigned = dialogTechs.includes(techName);
                                  return (
                                    <div key={techName}>
                                      {/* Tech subcategory row */}
                                      <button
                                        onClick={() => setExpandedTechSubcategories(prev => ({ ...prev, [subKey]: !isSubExpanded }))}
                                        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-slate-50 transition-colors rounded"
                                      >
                                        <span className="text-xs font-semibold text-slate-700">{formatTechName(techName)}</span>
                                        <div className="flex items-center gap-1.5">
                                          {instances.length > 0 && <span className="text-[10px] text-slate-400">{instances.length} variant{instances.length !== 1 ? 's' : ''}</span>}
                                          {isSubExpanded ? <FiChevronDown size={12} className="text-slate-400" /> : <FiChevronRight size={12} className="text-slate-400" />}
                                        </div>
                                      </button>
                                      {/* Instance rows */}
                                      {isSubExpanded && (
                                        <div className="pl-3 pr-2 pb-1 space-y-1">
                                          {(instances.length > 0 ? instances : [null]).map((inst, idx) => {
                                            const rowLabel = inst?.displayLabel || inst?.label || inst?.raw?.label || `Variant ${idx + 1}`;
                                            return (
                                              <div key={idx} className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${
                                                isAssigned ? 'bg-gray-100 opacity-60' : 'bg-white border border-slate-200'
                                              }`}>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-[11px] font-medium text-slate-700 truncate">{rowLabel}</p>
                                                  <div className="flex gap-1 mt-0.5 flex-wrap">
                                                    {inst?.constraints?.energy_eff != null && (
                                                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                                                        η {Math.round(inst.constraints.energy_eff * 100)}%
                                                      </span>
                                                    )}
                                                    {inst?.constraints?.lifetime != null && (
                                                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">{inst.constraints.lifetime} yr</span>
                                                    )}
                                                    {inst?.monetary?.energy_cap != null && (
                                                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">CAPEX {inst.monetary.energy_cap}</span>
                                                    )}
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => !isAssigned && addTechToDialog(techName, inst)}
                                                  disabled={!!isAssigned}
                                                  className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                                                    isAssigned ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-600 text-white hover:bg-gray-700'
                                                  }`}
                                                >
                                                  {isAssigned ? '✓' : '+'}
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
  );
}
