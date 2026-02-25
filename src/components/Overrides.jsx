import React, { useState } from "react";
import { FiEdit3, FiTrash2, FiPlus, FiCopy, FiChevronDown, FiChevronRight, FiSettings, FiEdit2 } from "react-icons/fi";
import { useData } from "../context/DataContext";

const Overrides = () => {
  const { overrides, setOverrides, showNotification, currentModelId, models } = useData();
  const currentModel = models.find(m => m.id === currentModelId);
  const [expandedOverrides, setExpandedOverrides] = useState({});
  const [editingOverride, setEditingOverride] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState({});
  const [jsonEditText, setJsonEditText] = useState({});
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState("");

  // Form states for new/edit override
  const [overrideName, setOverrideName] = useState("");
  const [overrideType, setOverrideType] = useState("subset_time"); // subset_time, time_resolution, solver_config, tech_parameter
  const [overrideData, setOverrideData] = useState({
    // For subset_time
    startDate: "2024-01-01",
    endDate: "2024-01-02",
    // For time_resolution
    resolution: "3H",
    // For solver_config
    ensureFeasibility: true,
    cyclicStorage: false,
    solver: "gurobi",
    solverOptions: {},
    // For tech_parameter
    location: "",
    tech: "",
    parameter: "",
    value: ""
  });

  const handleAddOverride = () => {
    if (!overrideName.trim()) {
      showNotification("Please enter an override name", "warning");
      return;
    }

    // Allow saving with same name when editing
    if (!editingOverride && overrides[overrideName]) {
      showNotification("Override name already exists", "warning");
      return;
    }

    let newOverride = {};

    switch (overrideType) {
      case "subset_time":
        newOverride = {
          "model.subset_time": [overrideData.startDate, overrideData.endDate]
        };
        break;
      case "time_resolution":
        newOverride = {
          "model.time": {
            function: "resample",
            function_options: {
              resolution: overrideData.resolution
            }
          }
        };
        break;
      case "solver_config":
        newOverride = {
          run: {
            ensure_feasibility: overrideData.ensureFeasibility,
            cyclic_storage: overrideData.cyclicStorage,
            solver: overrideData.solver,
            solver_options: overrideData.solverOptions
          }
        };
        break;
      case "tech_parameter":
        if (!overrideData.location || !overrideData.tech || !overrideData.parameter) {
          showNotification("Please fill all technology parameter fields", "warning");
          return;
        }
        newOverride = {
          locations: {
            [`${overrideData.location}.techs.${overrideData.tech}`]: {
              [overrideData.parameter]: overrideData.value
            }
          }
        };
        break;
      default:
        break;
    }

    // If editing and name changed, remove old entry
    if (editingOverride && editingOverride !== overrideName) {
      const { [editingOverride]: removed, ...rest } = overrides;
      setOverrides({ ...rest, [overrideName]: newOverride });
      showNotification(`Override renamed and updated: "${overrideName}"`, "success");
    } else {
      setOverrides({ ...overrides, [overrideName]: newOverride });
      showNotification(`Override "${overrideName}" ${editingOverride ? 'updated' : 'created'}`, "success");
    }
    resetForm();
  };

  const handleDeleteOverride = (name) => {
    const { [name]: removed, ...rest } = overrides;
    setOverrides(rest);
    showNotification(`Override "${name}" deleted`, "success");
  };

  const handleDuplicateOverride = (name) => {
    const duplicate = { ...overrides[name] };
    const newName = `${name}_copy`;
    setOverrides({ ...overrides, [newName]: duplicate });
    showNotification(`Override duplicated as "${newName}"`, "success");
  };

  const toggleJsonEditor = (name) => {
    setShowJsonEditor(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
    if (!showJsonEditor[name]) {
      setJsonEditText(prev => ({
        ...prev,
        [name]: JSON.stringify(overrides[name], null, 2)
      }));
    }
  };

  const saveJsonEdit = (name) => {
    try {
      const parsed = JSON.parse(jsonEditText[name]);
      setOverrides({ ...overrides, [name]: parsed });
      showNotification(`Override "${name}" updated from JSON`, "success");
      setShowJsonEditor(prev => ({ ...prev, [name]: false }));
    } catch (error) {
      showNotification(`Invalid JSON: ${error.message}`, "error");
    }
  };

  const handleRenameOverride = (oldName) => {
    if (!newName.trim()) {
      showNotification("Please enter a new name", "warning");
      return;
    }
    if (newName === oldName) {
      setEditingName(null);
      setNewName("");
      return;
    }
    if (overrides[newName]) {
      showNotification("An override with this name already exists", "warning");
      return;
    }
    const { [oldName]: config, ...rest } = overrides;
    setOverrides({ ...rest, [newName]: config });
    showNotification(`Override renamed from "${oldName}" to "${newName}"`, "success");
    setEditingName(null);
    setNewName("");
  };

  const resetForm = () => {
    setShowAddDialog(false);
    setEditingOverride(null);
    setOverrideName("");
    setOverrideType("subset_time");
    setOverrideData({
      startDate: "2024-01-01",
      endDate: "2024-01-02",
      resolution: "3H",
      ensureFeasibility: true,
      cyclicStorage: false,
      solver: "gurobi",
      solverOptions: {},
      location: "",
      tech: "",
      parameter: "",
      value: ""
    });
  };

  const toggleOverride = (name) => {
    setExpandedOverrides({
      ...expandedOverrides,
      [name]: !expandedOverrides[name]
    });
  };

  if (!currentModelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <FiEdit3 className="mx-auto text-slate-300 mb-4" size={64} />
          <h2 className="text-xl font-semibold text-slate-600 mb-2">No Model Selected</h2>
          <p className="text-slate-500">Please select or create a model to manage overrides</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FiEdit3 />
              Overrides
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Create model variations for: <span className="font-medium">{currentModel?.name}</span>
            </p>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <FiPlus size={16} />
            New Override
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {Object.keys(overrides).length === 0 ? (
            <div className="text-center py-12">
              <FiEdit3 className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-600 mb-4">No overrides defined yet</p>
              <button
                onClick={() => setShowAddDialog(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Create Your First Override
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(overrides).map(([name, config]) => (
                <div key={name} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <button
                      onClick={() => toggleOverride(name)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {expandedOverrides[name] ? <FiChevronDown size={18} /> : <FiChevronRight size={18} />}
                      <span className="font-semibold text-slate-800">{name}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      {editingName === name ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleRenameOverride(name)}
                            placeholder="New name"
                            className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-gray-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameOverride(name)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Save"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => {
                              setEditingName(null);
                              setNewName("");
                            }}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingName(name);
                              setNewName(name);
                            }}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Rename"
                          >
                            <FiEdit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDuplicateOverride(name)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Duplicate"
                          >
                            <FiCopy size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteOverride(name)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Delete"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {expandedOverrides[name] && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-700">
                          {showJsonEditor[name] ? 'Edit JSON' : 'Configuration'}
                        </span>
                        <div className="flex gap-2">
                          {showJsonEditor[name] && (
                            <button
                              onClick={() => saveJsonEdit(name)}
                              className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                            >
                              Save JSON
                            </button>
                          )}
                          <button
                            onClick={() => toggleJsonEditor(name)}
                            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                          >
                            {showJsonEditor[name] ? 'View Mode' : 'Edit JSON'}
                          </button>
                        </div>
                      </div>
                      {showJsonEditor[name] ? (
                        <textarea
                          value={jsonEditText[name] || ''}
                          onChange={(e) => setJsonEditText(prev => ({ ...prev, [name]: e.target.value }))}
                          className="w-full h-64 text-xs text-slate-100 font-mono bg-slate-800 p-4 rounded overflow-x-auto focus:ring-2 focus:ring-gray-500 focus:outline-none"
                          spellCheck={false}
                        />
                      ) : (
                        <pre className="text-xs text-slate-700 font-mono bg-slate-800 text-slate-100 p-4 rounded overflow-x-auto">
                          {JSON.stringify(config, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Override Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">{editingOverride ? 'Edit Override' : 'Create New Override'}</h2>

              <div className="space-y-4">
                {/* Override Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Override Name</label>
                  <input
                    type="text"
                    value={overrideName}
                    onChange={(e) => setOverrideName(e.target.value)}
                    placeholder="e.g., 1_day, 3H_resolution, debug"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                {/* Override Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Override Type</label>
                  <select
                    value={overrideType}
                    onChange={(e) => setOverrideType(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <option value="subset_time">Time Subset (Date Range)</option>
                    <option value="time_resolution">Time Resolution (Resampling)</option>
                    <option value="solver_config">Solver Configuration</option>
                    <option value="tech_parameter">Technology Parameter</option>
                  </select>
                </div>

                {/* Type-specific fields */}
                {overrideType === "subset_time" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
                      <input
                        type="date"
                        value={overrideData.startDate}
                        onChange={(e) => setOverrideData({ ...overrideData, startDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
                      <input
                        type="date"
                        value={overrideData.endDate}
                        onChange={(e) => setOverrideData({ ...overrideData, endDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                  </div>
                )}

                {overrideType === "time_resolution" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Resolution</label>
                    <select
                      value={overrideData.resolution}
                      onChange={(e) => setOverrideData({ ...overrideData, resolution: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="1H">1 Hour</option>
                      <option value="3H">3 Hours</option>
                      <option value="6H">6 Hours</option>
                      <option value="12H">12 Hours</option>
                      <option value="1D">1 Day</option>
                    </select>
                  </div>
                )}

                {overrideType === "solver_config" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Solver</label>
                      <select
                        value={overrideData.solver}
                        onChange={(e) => setOverrideData({ ...overrideData, solver: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      >
                        <option value="gurobi">Gurobi</option>
                        <option value="cbc">CBC</option>
                        <option value="glpk">GLPK</option>
                        <option value="cplex">CPLEX</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={overrideData.ensureFeasibility}
                          onChange={(e) => setOverrideData({ ...overrideData, ensureFeasibility: e.target.checked })}
                          className="w-4 h-4 text-gray-600 border-slate-300 rounded focus:ring-gray-500"
                        />
                        <span className="text-sm text-slate-700">Ensure Feasibility</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={overrideData.cyclicStorage}
                          onChange={(e) => setOverrideData({ ...overrideData, cyclicStorage: e.target.checked })}
                          className="w-4 h-4 text-gray-600 border-slate-300 rounded focus:ring-gray-500"
                        />
                        <span className="text-sm text-slate-700">Cyclic Storage</span>
                      </label>
                    </div>
                  </div>
                )}

                {overrideType === "tech_parameter" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Location</label>
                      <input
                        type="text"
                        value={overrideData.location}
                        onChange={(e) => setOverrideData({ ...overrideData, location: e.target.value })}
                        placeholder="e.g., CSP CERRO DOMINADOR"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Technology</label>
                      <input
                        type="text"
                        value={overrideData.tech}
                        onChange={(e) => setOverrideData({ ...overrideData, tech: e.target.value })}
                        placeholder="e.g., battery"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Parameter</label>
                        <input
                          type="text"
                          value={overrideData.parameter}
                          onChange={(e) => setOverrideData({ ...overrideData, parameter: e.target.value })}
                          placeholder="e.g., energy_cap_max"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Value</label>
                        <input
                          type="text"
                          value={overrideData.value}
                          onChange={(e) => setOverrideData({ ...overrideData, value: e.target.value })}
                          placeholder="e.g., 1000"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleAddOverride}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  {editingOverride ? 'Update Override' : 'Create Override'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Overrides;
