// Save-model modal (name, description, time horizon, solver/mode, advanced
// options, threads) for the Creation view. Extracted verbatim from
// Creation.jsx; the parent still gates rendering on `showSaveDialog`.
import { FiX } from 'react-icons/fi';

export default function SaveModelDialog({
  locationManager,
  modelConfig,
  modelName,
  saveToMainData,
  setModelConfig,
  setModelName,
  setShowSaveDialog,
}) {
  return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800">Save as New Model</h3>
                <p className="text-sm text-gray-500 mt-0.5">{locationManager.tempLocations.length} locations · {locationManager.tempLinks.length} links</p>
              </div>
              <button onClick={() => setShowSaveDialog(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <FiX size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name + Description */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Model Name <span className="text-gray-500">*</span></label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. Germany 2030 High-Res"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                  <textarea
                    value={modelConfig.description || ''}
                    onChange={(e) => setModelConfig(c => ({ ...c, description: e.target.value }))}
                    placeholder="Optional notes about this model..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm resize-none"
                  />
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Time horizon */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Time Horizon</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={modelConfig.startDate}
                      onChange={(e) => setModelConfig(c => ({ ...c, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                    <input
                      type="date"
                      value={modelConfig.endDate}
                      onChange={(e) => setModelConfig(c => ({ ...c, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                    />
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Solver + Mode */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Solver &amp; Mode</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Solver</label>
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700">
                      HiGHS
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                    <select
                      value={modelConfig.mode}
                      onChange={(e) => setModelConfig(c => ({ ...c, mode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm bg-white"
                    >
                      <option value="plan">Planning (optimise capacity)</option>
                      <option value="operate">Operate (fixed capacity)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Calliope Version</label>
                    <select
                      value={modelConfig.calliopeVersion}
                      onChange={(e) => setModelConfig(c => ({ ...c, calliopeVersion: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm bg-white"
                    >
                      <option value="0.6.8">0.6.8 (stable, default)</option>
                      <option value="0.7.0">0.7.0.dev7 (experimental)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Objective Cost Class</label>
                    <select
                      value={modelConfig.objectiveCostClass}
                      onChange={(e) => setModelConfig(c => ({ ...c, objectiveCostClass: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm bg-white"
                    >
                      <option value="monetary">Monetary</option>
                      <option value="co2">CO₂</option>
                    </select>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* Advanced toggles */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Advanced Options</h4>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelConfig.ensureFeasibility}
                      onChange={(e) => setModelConfig(c => ({ ...c, ensureFeasibility: e.target.checked }))}
                      className="w-4 h-4 rounded text-gray-600"
                    />
                    <span className="text-sm text-gray-700">Ensure Feasibility</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modelConfig.cyclicStorage}
                      onChange={(e) => setModelConfig(c => ({ ...c, cyclicStorage: e.target.checked }))}
                      className="w-4 h-4 rounded text-gray-600"
                    />
                    <span className="text-sm text-gray-700">Cyclic Storage</span>
                  </label>
                </div>
              </div>

              {/* Solver threads */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Solver Threads</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={modelConfig.solverOptions?.threads ?? 4}
                    onChange={(e) => setModelConfig(c => ({ ...c, solverOptions: { ...c.solverOptions, threads: parseInt(e.target.value) || 1 } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">MIP Relative Gap</label>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={modelConfig.solverOptions?.mip_rel_gap ?? 0.001}
                    onChange={(e) => setModelConfig(c => ({ ...c, solverOptions: { ...c.solverOptions, mip_rel_gap: parseFloat(e.target.value) || 0.001 } }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveToMainData}
                disabled={!modelName.trim()}
                className="px-5 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Save Model
              </button>
            </div>
          </div>
        </div>
  );
}
