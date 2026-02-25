import React, { useState } from "react";
import { FiLayers, FiTrash2, FiPlus, FiCopy, FiChevronDown, FiChevronRight, FiPlay, FiEdit2 } from "react-icons/fi";
import { useData } from "../context/DataContext";

const Scenarios = () => {
  const { overrides, scenarios, setScenarios, showNotification, currentModelId, models } = useData();
  const currentModel = models.find(m => m.id === currentModelId);
  const [expandedScenarios, setExpandedScenarios] = useState({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [newName, setNewName] = useState("");

  // Form states for new scenario
  const [scenarioName, setScenarioName] = useState("");
  const [selectedOverrides, setSelectedOverrides] = useState([]);

  const handleAddScenario = () => {
    if (!scenarioName.trim()) {
      showNotification("Please enter a scenario name", "warning");
      return;
    }

    // Allow saving with same name when editing
    if (!editingScenario && scenarios[scenarioName]) {
      showNotification("Scenario name already exists", "warning");
      return;
    }

    if (selectedOverrides.length === 0) {
      showNotification("Please select at least one override", "warning");
      return;
    }

    // If editing and name changed, remove old entry
    if (editingScenario && editingScenario !== scenarioName) {
      const { [editingScenario]: removed, ...rest } = scenarios;
      setScenarios({ ...rest, [scenarioName]: selectedOverrides });
      showNotification(`Scenario renamed and updated: "${scenarioName}"`, "success");
    } else {
      setScenarios({ ...scenarios, [scenarioName]: selectedOverrides });
      showNotification(`Scenario "${scenarioName}" ${editingScenario ? 'updated' : 'created'}`, "success");
    }
    resetForm();
  };

  const handleDeleteScenario = (name) => {
    const { [name]: removed, ...rest } = scenarios;
    setScenarios(rest);
    showNotification(`Scenario "${name}" deleted`, "success");
  };

  const handleDuplicateScenario = (name) => {
    const duplicate = [...scenarios[name]];
    const newName = `${name}_copy`;
    setScenarios({ ...scenarios, [newName]: duplicate });
    showNotification(`Scenario duplicated as "${newName}"`, "success");
  };

  const handleRenameScenario = (oldName) => {
    if (!newName.trim()) {
      showNotification("Please enter a new name", "warning");
      return;
    }
    if (newName === oldName) {
      setEditingName(null);
      setNewName("");
      return;
    }
    if (scenarios[newName]) {
      showNotification("A scenario with this name already exists", "warning");
      return;
    }
    const { [oldName]: config, ...rest } = scenarios;
    setScenarios({ ...rest, [newName]: config });
    showNotification(`Scenario renamed from "${oldName}" to "${newName}"`, "success");
    setEditingName(null);
    setNewName("");
  };

  const resetForm = () => {
    setShowAddDialog(false);
    setEditingScenario(null);
    setScenarioName("");
    setSelectedOverrides([]);
  };

  const toggleScenario = (name) => {
    setExpandedScenarios({
      ...expandedScenarios,
      [name]: !expandedScenarios[name]
    });
  };

  const toggleOverrideSelection = (overrideName) => {
    if (selectedOverrides.includes(overrideName)) {
      setSelectedOverrides(selectedOverrides.filter(o => o !== overrideName));
    } else {
      setSelectedOverrides([...selectedOverrides, overrideName]);
    }
  };

  const moveOverrideUp = (index) => {
    if (index === 0) return;
    const newOverrides = [...selectedOverrides];
    [newOverrides[index - 1], newOverrides[index]] = [newOverrides[index], newOverrides[index - 1]];
    setSelectedOverrides(newOverrides);
  };

  const moveOverrideDown = (index) => {
    if (index === selectedOverrides.length - 1) return;
    const newOverrides = [...selectedOverrides];
    [newOverrides[index], newOverrides[index + 1]] = [newOverrides[index + 1], newOverrides[index]];
    setSelectedOverrides(newOverrides);
  };

  if (!currentModelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <FiLayers className="mx-auto text-slate-300 mb-4" size={64} />
          <h2 className="text-xl font-semibold text-slate-600 mb-2">No Model Selected</h2>
          <p className="text-slate-500">Please select or create a model to manage scenarios</p>
        </div>
      </div>
    );
  }

  const availableOverrides = Object.keys(overrides);

  return (
    <div className="flex-1 h-screen overflow-hidden flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FiLayers />
              Scenarios
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Combine overrides into scenarios for: <span className="font-medium">{currentModel?.name}</span>
            </p>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            disabled={availableOverrides.length === 0}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            <FiPlus size={16} />
            New Scenario
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {availableOverrides.length === 0 ? (
            <div className="text-center py-12">
              <FiLayers className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-600 mb-2">No overrides available</p>
              <p className="text-sm text-slate-500 mb-4">Create overrides first before defining scenarios</p>
            </div>
          ) : Object.keys(scenarios).length === 0 ? (
            <div className="text-center py-12">
              <FiLayers className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-600 mb-4">No scenarios defined yet</p>
              <button
                onClick={() => setShowAddDialog(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Create Your First Scenario
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(scenarios).map(([name, overrideList]) => (
                <div key={name} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between p-4 hover:bg-slate-50">
                    <button
                      onClick={() => toggleScenario(name)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {expandedScenarios[name] ? <FiChevronDown size={18} /> : <FiChevronRight size={18} />}
                      <span className="font-semibold text-slate-800">{name}</span>
                      <span className="text-xs text-slate-500">({overrideList.length} overrides)</span>
                    </button>
                    <div className="flex items-center gap-2">
                      {editingName === name ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleRenameScenario(name)}
                            placeholder="New name"
                            className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-gray-500"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameScenario(name)}
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
                            onClick={() => handleDuplicateScenario(name)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Duplicate"
                          >
                            <FiCopy size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteScenario(name)}
                            className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                            title="Delete"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {expandedScenarios[name] && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50">
                      <div className="space-y-2">
                        {overrideList.map((overrideName, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 p-3 bg-white rounded border border-slate-200"
                          >
                            <span className="text-xs font-mono text-slate-500">{index + 1}.</span>
                            <span className="flex-1 text-sm font-medium text-slate-700">{overrideName}</span>
                            {!overrides[overrideName] && (
                              <span className="text-xs text-gray-600">(missing)</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 p-3 bg-slate-800 rounded">
                        <code className="text-xs text-slate-100">
                          {name}: [{overrideList.map(o => `"${o}"`).join(", ")}]
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Scenario Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">{editingScenario ? 'Edit Scenario' : 'Create New Scenario'}</h2>

              <div className="space-y-4">
                {/* Scenario Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Scenario Name</label>
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    placeholder="e.g., Main_2023, Battery_2023"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                {/* Override Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Available Overrides (click to select, order matters)
                  </label>
                  <div className="border border-slate-300 rounded-lg p-3 max-h-60 overflow-y-auto bg-slate-50">
                    {availableOverrides.map((overrideName) => (
                      <button
                        key={overrideName}
                        onClick={() => toggleOverrideSelection(overrideName)}
                        className={`w-full text-left p-2 rounded mb-2 transition-colors ${
                          selectedOverrides.includes(overrideName)
                            ? 'bg-gray-100 border-2 border-gray-500 text-gray-900'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{overrideName}</span>
                          {selectedOverrides.includes(overrideName) && (
                            <span className="text-xs bg-gray-600 text-white px-2 py-1 rounded">
                              #{selectedOverrides.indexOf(overrideName) + 1}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Overrides Order */}
                {selectedOverrides.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Selected Overrides (in order)
                    </label>
                    <div className="border border-slate-300 rounded-lg p-3 bg-white">
                      {selectedOverrides.map((overrideName, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 mb-2 bg-slate-50 rounded border border-slate-200"
                        >
                          <span className="text-xs font-mono text-slate-500 w-6">{index + 1}.</span>
                          <span className="flex-1 text-sm font-medium text-slate-700">{overrideName}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => moveOverrideUp(index)}
                              disabled={index === 0}
                              className="p-1 text-slate-600 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveOverrideDown(index)}
                              disabled={index === selectedOverrides.length - 1}
                              className="p-1 text-slate-600 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              ▼
                            </button>
                            <button
                              onClick={() => toggleOverrideSelection(overrideName)}
                              className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleAddScenario}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  {editingScenario ? 'Update Scenario' : 'Create Scenario'}
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

export default Scenarios;
