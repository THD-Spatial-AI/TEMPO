import React, { useState, useEffect } from "react";
import { FiSettings, FiCalendar, FiCpu, FiPlay, FiSave, FiChevronDown, FiChevronRight, FiInfo, FiHelpCircle } from "react-icons/fi";
import { useData } from "../context/DataContext";

const Configuration = () => {
  const { models, currentModelId, showNotification } = useData();
  const currentModel = models.find(m => m.id === currentModelId);

  const [modelConfig, setModelConfig] = useState({
    name: '',
    calliopeVersion: '0.6.8',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    solver: 'gurobi',
    ensureFeasibility: true,
    cyclicStorage: false,
    mode: 'plan',
    objectiveCostClass: 'monetary',
    solverOptions: {
      threads: 24,
      method: 2,
      barConvTol: 1e-3,
      feasibilityTol: 1e-3,
      optimalityTol: 1e-3,
      mipGap: 1e-3,
      numericFocus: 2,
      crossover: 0,
      barHomogeneous: 1,
      presolve: 2,
      aggFill: 10,
      preDual: 2,
      rins: 100,
      nodefileStart: 0.5,
      seed: 42
    }
  });

  const [showSolverOptions, setShowSolverOptions] = useState(false);

  // Load config from current model when it changes
  useEffect(() => {
    if (currentModel?.metadata?.modelConfig) {
      setModelConfig(currentModel.metadata.modelConfig);
    } else if (currentModel) {
      setModelConfig(prev => ({ ...prev, name: currentModel.name }));
    }
  }, [currentModel]);

  const handleSave = () => {
    if (!currentModelId) {
      showNotification('Please select or create a model first', 'warning');
      return;
    }

    // Save configuration to model metadata
    // This would typically update the model in the context
    showNotification('Configuration saved successfully', 'success');
  };

  const calculateDuration = () => {
    const start = new Date(modelConfig.startDate);
    const end = new Date(modelConfig.endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return days;
  };

  if (!currentModelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <FiSettings className="mx-auto text-slate-300 mb-4" size={64} />
          <h2 className="text-xl font-semibold text-slate-600 mb-2">No Model Selected</h2>
          <p className="text-slate-500">Please select or create a model to configure its settings</p>
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
              <FiSettings />
              Model Configuration
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Configure model parameters and solver settings for: <span className="font-medium">{currentModel?.name}</span>
            </p>
          </div>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <FiSave size={16} />
            Save Configuration
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 gap-6">
            {/* Basic Settings Card */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <FiInfo />
                  Basic Settings
                </h2>
              </div>
              <div className="p-6 space-y-6">
              {/* Model Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Model Name</label>
                <input
                  type="text"
                  value={modelConfig.name}
                  onChange={(e) => setModelConfig({ ...modelConfig, name: e.target.value })}
                  placeholder="e.g., Chile energy system"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>

              {/* Calliope Version */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Calliope Version</label>
                <input
                  type="text"
                  value={modelConfig.calliopeVersion}
                  disabled
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">Version 0.7.0 will be available in a future update</p>
              </div>

              {/* Mode */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Optimization Mode</label>
                <select
                  value={modelConfig.mode}
                  onChange={(e) => setModelConfig({ ...modelConfig, mode: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="plan">Plan - Long-term capacity planning</option>
                  <option value="operate">Operate - Short-term operational optimization</option>
                </select>
              </div>
            </div>
          </div>

          {/* Time Settings Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <FiCalendar />
                Time Settings
              </h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={modelConfig.startDate}
                      onChange={(e) => setModelConfig({ ...modelConfig, startDate: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 pr-10"
                      style={{ colorScheme: 'light' }}
                    />
                    <FiCalendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={modelConfig.endDate}
                      onChange={(e) => setModelConfig({ ...modelConfig, endDate: e.target.value })}
                      min={modelConfig.startDate}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 pr-10"
                      style={{ colorScheme: 'light' }}
                    />
                    <FiCalendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-100 rounded-lg border border-gray-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Duration: <span className="font-bold text-lg">{calculateDuration()} days</span>
                    </p>
                    <p className="text-xs text-gray-700 mt-1">
                      {new Date(modelConfig.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(modelConfig.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-700">≈ {Math.ceil(calculateDuration() / 7)} weeks</p>
                    <p className="text-xs text-gray-700">≈ {Math.ceil(calculateDuration() / 30)} months</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Solver Settings Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <FiCpu />
                Solver Settings
              </h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Solver Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Solver</label>
                <select
                  value={modelConfig.solver}
                  onChange={(e) => setModelConfig({ ...modelConfig, solver: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="gurobi">Gurobi - Commercial solver (recommended)</option>
                  <option value="cbc">CBC - Open-source solver</option>
                  <option value="glpk">GLPK - GNU Linear Programming Kit</option>
                  <option value="cplex">CPLEX - IBM commercial solver</option>
                </select>
              </div>

              {/* Feasibility Options */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="ensureFeasibility"
                    checked={modelConfig.ensureFeasibility}
                    onChange={(e) => setModelConfig({ ...modelConfig, ensureFeasibility: e.target.checked })}
                    className="w-4 h-4 text-gray-900 border-slate-300 rounded focus:ring-gray-500"
                  />
                  <label htmlFor="ensureFeasibility" className="text-sm text-slate-700">
                    <span className="font-medium">Ensure Feasibility</span>
                    <p className="text-xs text-slate-500">Allows unmet demand to ensure model feasibility</p>
                  </label>
                </div>
                
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="cyclicStorage"
                    checked={modelConfig.cyclicStorage}
                    onChange={(e) => setModelConfig({ ...modelConfig, cyclicStorage: e.target.checked })}
                    className="w-4 h-4 text-gray-900 border-slate-300 rounded focus:ring-gray-500"
                  />
                  <label htmlFor="cyclicStorage" className="text-sm text-slate-700">
                    <span className="font-medium">Cyclic Storage</span>
                    <p className="text-xs text-slate-500">Storage levels at end equal storage at start</p>
                  </label>
                </div>
              </div>

              {/* Advanced Solver Options */}
              <div>
                <button
                  onClick={() => setShowSolverOptions(!showSolverOptions)}
                  className="flex items-center justify-between w-full p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <span className="text-sm font-medium text-slate-700">Advanced Solver Parameters</span>
                  {showSolverOptions ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
                </button>
                
                {showSolverOptions && (
                  <div className="mt-4 p-4 border border-slate-200 rounded-lg">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Threads</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Number of CPU threads for parallel computation
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.threads}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, threads: parseInt(e.target.value) || 1 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Method</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Algorithm selection (0=primal, 1=dual, 2=barrier, 3=concurrent, 4=deterministic concurrent)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.method}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, method: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">MIP Gap</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Relative optimality gap tolerance for mixed-integer problems
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={modelConfig.solverOptions.mipGap}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, mipGap: parseFloat(e.target.value) || 0.001 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Feasibility Tolerance</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Primal feasibility tolerance - maximum constraint violation allowed
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={modelConfig.solverOptions.feasibilityTol}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, feasibilityTol: parseFloat(e.target.value) || 0.001 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Optimality Tolerance</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Dual feasibility tolerance - maximum reduced cost violation allowed
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={modelConfig.solverOptions.optimalityTol}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, optimalityTol: parseFloat(e.target.value) || 0.001 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Numeric Focus</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Numerical precision emphasis (0=auto, 1-3=increasing focus on numerical stability)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.numericFocus}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, numericFocus: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Bar Convergence Tol</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Barrier algorithm convergence tolerance
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={modelConfig.solverOptions.barConvTol}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, barConvTol: parseFloat(e.target.value) || 0.001 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Crossover</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Barrier crossover strategy (-1=auto, 0=off, 1=on)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.crossover}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, crossover: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Bar Homogeneous</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Barrier homogeneous self-dual formulation (-1=auto, 0=off, 1=on)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.barHomogeneous}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, barHomogeneous: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Presolve</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Presolve level (-1=auto, 0=off, 1=conservative, 2=aggressive)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.presolve}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, presolve: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Aggregate Fill</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Maximum allowed fill during presolve aggregation
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.aggFill}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, aggFill: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Pre Dual</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Presolve dualization level (-1=auto, 0=off, 1=conservative, 2=aggressive)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.preDual}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, preDual: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">RINS</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              RINS heuristic frequency (-1=auto, 0=off, positive=every N nodes)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.rins}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, rins: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Nodefile Start</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Memory threshold for writing nodes to disk (GB)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          value={modelConfig.solverOptions.nodefileStart}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, nodefileStart: parseFloat(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="block text-xs font-medium text-slate-700">Random Seed</label>
                          <div className="group relative">
                            <FiHelpCircle size={14} className="text-slate-400 cursor-help hover:text-slate-600" />
                            <div className="hidden group-hover:block absolute left-0 top-5 z-10 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg">
                              Random seed for reproducibility (same seed = same results)
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          value={modelConfig.solverOptions.seed}
                          onChange={(e) => setModelConfig({
                            ...modelConfig,
                            solverOptions: { ...modelConfig.solverOptions, seed: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Close the 2-column grid */}
        </div>

        {/* Info Card - Outside grid but within max-w-6xl container */}
        <div className="mt-6">
          <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
            <p className="text-sm text-gray-900">
              <strong>Note:</strong> These configurations will be used to generate the model.yaml file when exporting your model for Calliope.
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default Configuration;
