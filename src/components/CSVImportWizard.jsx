import React, { useState } from 'react';
import {
  FiX, FiCheck, FiMap, FiZap, FiActivity, FiCpu, FiLayers,
  FiDatabase, FiUploadCloud, FiDownload,
} from 'react-icons/fi';

const STEP_LABELS = ['Model Info', 'Required Files', 'Optional Files', 'Review'];
const TOTAL = 4;

const FileRow = ({ icon: Icon, label, hint, accept, onUpload, status, optional = true }) => (
  <div className={`border rounded-lg px-3 py-2.5 flex items-center gap-3 transition-all ${
    status ? 'border-gray-300 bg-gray-50' : 'border-dashed border-gray-200 hover:border-gray-300'
  }`}>
    <Icon size={14} className="text-gray-500 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-700">
        {label}{!optional && <span className="text-gray-400 font-normal"> *</span>}
      </p>
      <p className="text-xs text-gray-400 truncate">{hint}</p>
    </div>
    {status
      ? <span className="text-xs text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded flex-shrink-0">{status}</span>
      : <label className="cursor-pointer px-2.5 py-1 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800 flex-shrink-0 transition-colors">
          <input type="file" accept={accept} className="hidden"
            onChange={e => { if (e.target.files[0]) { onUpload(e.target.files[0]); e.target.value = ''; } }} />
          Upload
        </label>
    }
  </div>
);

export default function CSVImportWizard({
  wizardData,
  setWizardData,
  onComplete,
  onClose,
  downloadTemplate,
  handleLocationsFileUpload,
  handleLinksFileUpload,
  handleDemandFileUpload,
  handleTechnologiesFileUpload,
  handleScenariosFileUpload,
  handleConfigFileUpload,
  handleResourceFileUpload,
  removeResourceFile,
  showNotification,
}) {
  const [step, setStep] = useState(1);

  const handleNext = () => {
    if (step === 1 && !wizardData.modelName.trim()) {
      showNotification('Please enter a model name', 'error');
      return;
    }
    if (step === 2) {
      if (!wizardData.locationsData) { showNotification('Please upload a Locations CSV', 'error'); return; }
      if (!wizardData.linksData) { showNotification('Please upload a Links CSV', 'error'); return; }
    }
    setStep(s => s + 1);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm text-gray-800">CSV Import Wizard</span>
            <span className="text-xs text-gray-400">Step {step} of {TOTAL}</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <FiX size={15} />
          </button>
        </div>

        {/* Progress bar + label */}
        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <div className="flex gap-1">
            {Array.from({ length: TOTAL }, (_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i < step ? 'bg-gray-700' : 'bg-gray-200'}`} />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{STEP_LABELS[step - 1]}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">

          {/* ── Step 1: Model Info ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Give your model a name to get started.</p>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Model Name <span className="text-gray-400 font-normal">*</span>
                </label>
                <input
                  type="text"
                  value={wizardData.modelName}
                  onChange={e => setWizardData(p => ({ ...p, modelName: e.target.value }))}
                  placeholder="e.g., My Regional Energy System"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={wizardData.description}
                  onChange={e => setWizardData(p => ({ ...p, description: e.target.value }))}
                  placeholder="Brief description of your energy system..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 mb-1">Need example files?</p>
                <p className="text-xs text-gray-500 mb-2">Download templates to see the expected CSV / JSON format.</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { type: 'config', label: 'Config JSON' },
                    { type: 'demand', label: 'Demand CSV' },
                    { type: 'solar', label: 'Solar CSV' },
                    { type: 'wind', label: 'Wind CSV' },
                  ].map(({ type, label }) => (
                    <button key={type} onClick={() => downloadTemplate(type)}
                      className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                      <FiDownload size={11} /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Required Files ── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Upload the two required files that define your model topology.</p>

              <div className={`border-2 rounded-lg p-4 transition-all ${
                wizardData.locationsData ? 'border-gray-300 bg-gray-50' : 'border-dashed border-gray-300'
              }`}>
                <div className="flex items-start gap-3">
                  <FiMap size={15} className="text-gray-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-800">
                        Locations <span className="text-gray-400 font-normal text-xs">*</span>
                      </p>
                      {wizardData.locationsData && (
                        <span className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                          ✓ {wizardData.locationsData.length} rows
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      CSV with columns: <code className="bg-gray-100 px-1 rounded">name</code> <code className="bg-gray-100 px-1 rounded">lat</code> <code className="bg-gray-100 px-1 rounded">lon</code> <code className="bg-gray-100 px-1 rounded">type</code>
                    </p>
                    <input type="file" accept=".csv"
                      onChange={e => e.target.files[0] && handleLocationsFileUpload(e.target.files[0])}
                      className="block w-full text-xs text-gray-600
                        file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0
                        file:text-xs file:font-semibold file:bg-gray-700 file:text-white
                        hover:file:bg-gray-800 file:cursor-pointer cursor-pointer" />
                  </div>
                </div>
              </div>

              <div className={`border-2 rounded-lg p-4 transition-all ${
                wizardData.linksData ? 'border-gray-300 bg-gray-50' : 'border-dashed border-gray-300'
              }`}>
                <div className="flex items-start gap-3">
                  <FiZap size={15} className="text-gray-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-800">
                        Links <span className="text-gray-400 font-normal text-xs">*</span>
                      </p>
                      {wizardData.linksData && (
                        <span className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                          ✓ {wizardData.linksData.length} rows
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      CSV with columns: <code className="bg-gray-100 px-1 rounded">from</code> <code className="bg-gray-100 px-1 rounded">to</code> <code className="bg-gray-100 px-1 rounded">distance</code> <code className="bg-gray-100 px-1 rounded">tech</code>
                    </p>
                    <input type="file" accept=".csv"
                      onChange={e => e.target.files[0] && handleLinksFileUpload(e.target.files[0])}
                      className="block w-full text-xs text-gray-600
                        file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0
                        file:text-xs file:font-semibold file:bg-gray-700 file:text-white
                        hover:file:bg-gray-800 file:cursor-pointer cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Optional Files ── */}
          {step === 3 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">All files below are optional — add what your model needs.</p>

              <FileRow
                icon={FiActivity} label="Demand Timeseries" accept=".csv" optional
                hint="CSV — first col: date, remaining cols: location names"
                onUpload={handleDemandFileUpload}
                status={wizardData.demandData ? `✓ ${wizardData.demandData.length} rows` : null}
              />
              <FileRow
                icon={FiCpu} label="Technologies" accept=".json" optional
                hint="JSON with tech definitions (pv, wind, hydro, …)"
                onUpload={handleTechnologiesFileUpload}
                status={wizardData.technologiesData ? `✓ ${Object.keys(wizardData.technologiesData).length} techs` : null}
              />
              <FileRow
                icon={FiLayers} label="Scenarios" accept=".json" optional
                hint="JSON with scenarios and override configurations"
                onUpload={handleScenariosFileUpload}
                status={wizardData.scenariosData ? '✓ Loaded' : null}
              />
              <FileRow
                icon={FiDatabase} label="Configuration" accept=".json" optional
                hint="JSON with legacy config, constraints, and defaults"
                onUpload={handleConfigFileUpload}
                status={wizardData.parsedConfig ? '✓ Loaded' : null}
              />

              {/* Resource timeseries — multi-file */}
              <div className={`border rounded-lg px-3 py-2.5 transition-all ${
                wizardData.resourceFiles.length > 0 ? 'border-gray-300 bg-gray-50' : 'border-dashed border-gray-200'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <FiUploadCloud size={14} className="text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">Resource Timeseries</p>
                    <p className="text-xs text-gray-400">CSVs for solar / wind — first col: date</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {[
                      { type: 'pv', label: '+PV' },
                      { type: 'wind', label: '+Wind' },
                      { type: 'other', label: '+Other' },
                    ].map(({ type, label }) => (
                      <label key={type} className="cursor-pointer px-2 py-1 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800 transition-colors">
                        <input type="file" accept=".csv" className="hidden"
                          onChange={e => { if (e.target.files[0]) { handleResourceFileUpload(e.target.files[0], type); e.target.value = ''; } }} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {wizardData.resourceFiles.length > 0 && (
                  <div className="space-y-1">
                    {wizardData.resourceFiles.map((rf, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1">
                        <span className="font-mono font-semibold text-gray-600 uppercase">{rf.type}</span>
                        <span className="flex-1 truncate text-gray-700">{rf.name}</span>
                        <span className="text-gray-400">{rf.data.length} rows</span>
                        <button onClick={() => removeResourceFile(rf.name)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <FiX size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 4 && (
            <div className="space-y-3">
              {/* Model identity */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="font-semibold text-gray-800 text-sm">{wizardData.modelName}</p>
                {wizardData.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{wizardData.description}</p>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: FiMap,      value: wizardData.locationsData?.length ?? 0,      label: 'Locations' },
                  { icon: FiZap,      value: wizardData.linksData?.length ?? 0,           label: 'Links' },
                  { icon: FiActivity, value: wizardData.demandData?.length ?? 0,          label: 'Demand rows' },
                ].map(({ icon: Icon, value, label }) => (
                  <div key={label} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <Icon size={13} className="text-gray-400" />
                    <span className="text-sm font-bold text-gray-700">{value}</span>
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
              </div>

              {/* Optional summary */}
              {(wizardData.technologiesData || wizardData.scenariosData || wizardData.parsedConfig || wizardData.resourceFiles.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {wizardData.technologiesData && (
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                      ✓ {Object.keys(wizardData.technologiesData).length} techs
                    </span>
                  )}
                  {wizardData.scenariosData && (
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">✓ Scenarios</span>
                  )}
                  {wizardData.parsedConfig && (
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">✓ Config</span>
                  )}
                  {wizardData.resourceFiles.map((rf, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                      ✓ {rf.name} ({rf.type.toUpperCase()})
                    </span>
                  ))}
                </div>
              )}

              {/* Locations preview */}
              {wizardData.locationsData && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Locations preview</span>
                    <span className="text-xs text-gray-400">{wizardData.locationsData.length} total</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="border-b border-gray-200 bg-gray-50/50">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Name</th>
                        <th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Type</th>
                        <th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Lat, Lon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wizardData.locationsData.slice(0, 5).map((loc, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-1.5 font-mono text-gray-800">
                            {loc.name || loc.Name || loc.location_name || `#${i + 1}`}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600">{loc.type || loc.Type || 'site'}</td>
                          <td className="px-3 py-1.5 text-gray-500">
                            {(loc.lat ?? loc.latitude)?.toFixed?.(2) ?? '—'}, {(loc.lon ?? loc.longitude)?.toFixed?.(2) ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {wizardData.locationsData.length > 5 && (
                    <div className="text-center py-1.5 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                      +{wizardData.locationsData.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Back
          </button>
          {step < TOTAL ? (
            <button onClick={handleNext}
              className="px-4 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
              Continue →
            </button>
          ) : (
            <button onClick={onComplete}
              className="px-4 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2 transition-colors">
              <FiCheck size={14} /> Create Model
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
