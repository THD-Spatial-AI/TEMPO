import React, { useState, useMemo } from 'react';
import {
  FiLayers, FiTrash2, FiPlus, FiCopy, FiChevronDown, FiChevronRight,
  FiPlay, FiEdit2, FiSliders, FiZap, FiX, FiCheck, FiArrowUp, FiArrowDown,
  FiBookOpen, FiList,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import SaveBar from './ui/SaveBar';
import {
  SCENARIO_TEMPLATES, SWEEP_PRESETS, ALL_OVERRIDE_TEMPLATES, setNestedValue,
} from '../data/overrideTemplates';

// ─── Scenario Template Cards ───────────────────────────────────────────────────
const ScenarioTemplateCard = ({ template, overrides, onImport }) => {
  const [expanded, setExpanded] = useState(false);
  const missingOverrides = template.suggestedOverrides.filter((id) => !overrides[id]);
  const allPresent = missingOverrides.length === 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl shrink-0 mt-0.5">{template.icon}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">{template.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{template.description}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-slate-400">
                  {template.suggestedOverrides.length} override{template.suggestedOverrides.length !== 1 ? 's' : ''}
                </span>
                {!allPresent && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    {missingOverrides.length} missing
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
            </button>
            <button
              onClick={() => onImport(template)}
              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors"
            >
              Import
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <p className="text-xs text-slate-600">{template.detail}</p>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Overrides used:</p>
              <div className="flex flex-wrap gap-1">
                {template.suggestedOverrides.map((id) => (
                  <span
                    key={id}
                    className={`text-xs px-2 py-0.5 rounded font-mono ${
                      overrides[id]
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {id} {!overrides[id] && '(not added)'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Sweep Generator ──────────────────────────────────────────────────────────
const SweepGenerator = ({ overrides, onGenerate }) => {
  const [presetId, setPresetId]         = useState(SWEEP_PRESETS[0].id);
  const [customPath, setCustomPath]     = useState('');
  const [useCustom, setUseCustom]       = useState(false);
  const [baseName, setBaseName]         = useState('sweep');
  const [minVal, setMinVal]             = useState('');
  const [maxVal, setMaxVal]             = useState('');
  const [steps, setSteps]               = useState(5);
  const [baseOverrides, setBaseOverrides] = useState([]);
  const [createScenarios, setCreateScenarios] = useState(true);

  const preset = SWEEP_PRESETS.find((p) => p.id === presetId);

  const effectivePath = useCustom ? customPath : preset?.configPath || '';
  const effectiveMin  = minVal !== '' ? Number(minVal) : (preset?.defaultMin ?? 0);
  const effectiveMax  = maxVal !== '' ? Number(maxVal) : (preset?.defaultMax ?? 100);
  const effectiveUnit = preset?.unit || '';

  const stepValues = useMemo(() => {
    if (steps < 2) return [effectiveMin];
    const arr = [];
    for (let i = 0; i < steps; i++) {
      arr.push(+(effectiveMin + (i * (effectiveMax - effectiveMin)) / (steps - 1)).toFixed(6));
    }
    return arr;
  }, [effectiveMin, effectiveMax, steps]);

  const toggleBase = (name) => {
    setBaseOverrides((p) => p.includes(name) ? p.filter((x) => x !== name) : [...p, name]);
  };

  const preview = stepValues.slice(0, 4).map((v) => `${baseName}_${v}`);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <FiSliders className="text-slate-600" size={18} />
        <h3 className="text-base font-semibold text-slate-800">Parameter Sweep Generator</h3>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
          auto-generate {steps} scenarios
        </span>
      </div>

      {/* Step 1: path */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          1. Parameter to sweep
        </label>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setUseCustom(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!useCustom ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Preset
          </button>
          <button
            onClick={() => setUseCustom(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${useCustom ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Custom path
          </button>
        </div>

        {!useCustom ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SWEEP_PRESETS.map((p) => (
              <label
                key={p.id}
                className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                  presetId === p.id ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input type="radio" name="sweep-preset" value={p.id}
                  checked={presetId === p.id} onChange={() => setPresetId(p.id)}
                  className="mt-0.5 accent-slate-800" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.description}</p>
                  <code className="text-xs text-slate-400">{p.configPath}</code>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <input
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="e.g. techs.solar_pv.costs.monetary.energy_cap"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        )}
      </div>

      {/* Step 2: range */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          2. Value range {effectiveUnit && <span className="text-slate-400 font-normal">({effectiveUnit})</span>}
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Min</label>
            <input type="number" step="any"
              value={minVal !== '' ? minVal : effectiveMin}
              onChange={(e) => setMinVal(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max</label>
            <input type="number" step="any"
              value={maxVal !== '' ? maxVal : effectiveMax}
              onChange={(e) => setMaxVal(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Steps</label>
            <input type="number" min="2" max="50"
              value={steps}
              onChange={(e) => setSteps(Math.max(2, Math.min(50, Number(e.target.value))))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          Will generate values: {stepValues.slice(0, 5).join(', ')}{stepValues.length > 5 ? ` … (${stepValues.length} total)` : ''}
        </p>
      </div>

      {/* Step 3: base name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">3. Base name for generated items</label>
        <input
          value={baseName}
          onChange={(e) => setBaseName(e.target.value.replace(/\s/g, '_'))}
          placeholder="e.g. co2_cap"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <p className="text-xs text-slate-400 mt-1">
          Overrides: {preview.join(', ')}{steps > 4 ? ` … (+${steps - 4} more)` : ''}
        </p>
      </div>

      {/* Step 4: base overrides */}
      {Object.keys(overrides).length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            4. Combine with (optional base overrides)
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(overrides).map((name) => (
              <button
                key={name}
                onClick={() => toggleBase(name)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  baseOverrides.includes(name)
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'text-slate-600 border-slate-300 hover:border-slate-500'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Options */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={createScenarios} onChange={(e) => setCreateScenarios(e.target.checked)}
          className="w-4 h-4 rounded accent-slate-800" />
        <span className="text-sm text-slate-700">Also create one scenario per step</span>
      </label>

      {/* Generate button */}
      <button
        onClick={() => onGenerate({ effectivePath, stepValues, baseName, baseOverrides, createScenarios })}
        disabled={!effectivePath.trim() || !baseName.trim() || stepValues.length < 2}
        className="w-full px-4 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <FiPlay size={16} />
        Generate {steps} Overrides{createScenarios ? ` + ${steps} Scenarios` : ''}
      </button>
    </div>
  );
};

// ─── New/Edit Scenario Modal ──────────────────────────────────────────────────
const ScenarioModal = ({ initial, overrides, onConfirm, onClose }) => {
  const [name, setName] = useState(initial?.name || '');
  const [selected, setSelected] = useState(initial?.overrides || []);

  const toggle = (n) =>
    setSelected((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const moveUp   = (i) => { if (i === 0) return; const a = [...selected]; [a[i-1],a[i]] = [a[i],a[i-1]]; setSelected(a); };
  const moveDown = (i) => { if (i === selected.length-1) return; const a = [...selected]; [a[i],a[i+1]] = [a[i+1],a[i]]; setSelected(a); };

  const availableKeys = Object.keys(overrides);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {initial ? 'Edit Scenario' : 'Create Scenario'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <FiX size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Scenario name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. net_zero_2050"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
          </div>

          {availableKeys.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>No overrides defined yet.</p>
              <p className="text-xs mt-1">Add overrides in the Overrides section first.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Select overrides (order matters)
              </label>
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1">
                {availableKeys.map((n) => (
                  <button
                    key={n}
                    onClick={() => toggle(n)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                      selected.includes(n)
                        ? 'bg-slate-800 text-white'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <span>{n}</span>
                    {selected.includes(n) && (
                      <span className="text-xs opacity-70">#{selected.indexOf(n)+1}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Order</label>
              <div className="space-y-1.5">
                {selected.map((n, i) => (
                  <div key={n} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-400 w-4">{i+1}.</span>
                    <span className="flex-1 text-sm font-medium text-slate-800">{n}</span>
                    <button onClick={() => moveUp(i)} disabled={i===0} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                      <FiArrowUp size={13} />
                    </button>
                    <button onClick={() => moveDown(i)} disabled={i===selected.length-1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-20">
                      <FiArrowDown size={13} />
                    </button>
                    <button onClick={() => toggle(n)} className="p-1 text-red-400 hover:text-red-600">
                      <FiX size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-3 bg-slate-800 rounded-xl">
                <code className="text-xs text-green-300">
                  {name || 'scenario'}: [{selected.map((o) => `"${o}"`).join(', ')}]
                </code>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={() => name.trim() && selected.length > 0 && onConfirm(name.trim(), selected)}
            disabled={!name.trim() || selected.length === 0}
            className="flex-1 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 disabled:opacity-40"
          >
            {initial ? 'Update Scenario' : 'Create Scenario'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const Scenarios = () => {
  const { overrides, setOverrides, scenarios, setScenarios, showNotification, currentModelId, models } = useData();
  const currentModel = models.find((m) => m.id === currentModelId);

  const [activeTab, setActiveTab]         = useState('templates'); // 'templates' | 'sweep' | 'yours'
  const [expandedScenarios, setExpandedScenarios] = useState({});
  const [renamingId, setRenamingId]       = useState(null);
  const [renameValue, setRenameValue]     = useState('');
  const [scenarioModal, setScenarioModal] = useState(null); // null | {} | {name, overrides: []}

  const scenarioCount = Object.keys(scenarios).length;
  const overrideCount = Object.keys(overrides).length;

  // —— Scenario template import ——
  const handleImportTemplate = (template) => {
    const name = template.id;
    const overrideList = template.suggestedOverrides;

    // Import any missing override templates first
    const missingTemplates = overrideList
      .filter((id) => !overrides[id])
      .map((id) => ALL_OVERRIDE_TEMPLATES.find((t) => t.id === id))
      .filter(Boolean);

    let newOverrides = { ...overrides };
    for (const tmpl of missingTemplates) {
      newOverrides[tmpl.id] = tmpl.buildConfig({});
    }
    if (missingTemplates.length > 0) setOverrides(newOverrides);

    setScenarios({ ...scenarios, [name]: overrideList });
    showNotification(
      `Scenario "${name}" imported${missingTemplates.length > 0 ? ` (+ ${missingTemplates.length} new overrides)` : ''}`,
      'success'
    );
    setActiveTab('yours');
  };

  // —— Sweep generator ——
  const handleGenerate = ({ effectivePath, stepValues, baseName, baseOverrides, createScenarios }) => {
    if (!effectivePath || !baseName || stepValues.length < 1) return;

    const newOverrides = { ...overrides };
    const newScenarios = { ...scenarios };

    for (const v of stepValues) {
      const overrideName = `${baseName}_${v}`;
      const config = setNestedValue({}, effectivePath, v);
      newOverrides[overrideName] = config;

      if (createScenarios) {
        newScenarios[`${baseName}_scenario_${v}`] = [...baseOverrides, overrideName];
      }
    }

    setOverrides(newOverrides);
    setScenarios(newScenarios);
    showNotification(
      `Generated ${stepValues.length} override${stepValues.length !== 1 ? 's' : ''}${createScenarios ? ` + ${stepValues.length} scenario${stepValues.length !== 1 ? 's' : ''}` : ''}`,
      'success'
    );
    setActiveTab('yours');
  };

  // —— Manual scenario management ——
  const handleConfirmModal = (name, overrideList) => {
    const isEdit = scenarioModal?.existing;
    if (isEdit && scenarioModal.name !== name) {
      const { [scenarioModal.name]: _, ...rest } = scenarios;
      setScenarios({ ...rest, [name]: overrideList });
    } else {
      setScenarios({ ...scenarios, [name]: overrideList });
    }
    showNotification(`Scenario "${name}" ${isEdit ? 'updated' : 'created'}`, 'success');
    setScenarioModal(null);
  };

  const handleDeleteScenario = (name) => {
    const { [name]: _, ...rest } = scenarios;
    setScenarios(rest);
    showNotification(`Scenario "${name}" deleted`, 'success');
  };

  const handleDuplicate = (name) => {
    const copy = `${name}_copy`;
    setScenarios({ ...scenarios, [copy]: [...scenarios[name]] });
    showNotification(`Duplicated as "${copy}"`, 'success');
  };

  const commitRename = (oldName) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingId(null); return; }
    if (scenarios[newName]) { showNotification('Name already exists', 'warning'); return; }
    const { [oldName]: list, ...rest } = scenarios;
    setScenarios({ ...rest, [newName]: list });
    setRenamingId(null);
    showNotification(`Renamed to "${newName}"`, 'success');
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

  return (
    <div className="flex-1 h-screen overflow-hidden flex flex-col bg-slate-50">
      <SaveBar label="Scenarios" />
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FiLayers />
              Scenarios
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Override combinations for{' '}
              <span className="font-medium text-slate-700">{currentModel?.name}</span>
              {scenarioCount > 0 && (
                <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {scenarioCount} defined
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setScenarioModal({})}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <FiPlus size={16} />
            New Scenario
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4">
          {[
            { id: 'templates', icon: FiBookOpen, label: 'Template Scenarios' },
            { id: 'sweep',     icon: FiSliders,  label: 'Parameter Sweep' },
            { id: 'yours',     icon: FiList,     label: `Your Scenarios${scenarioCount > 0 ? ` (${scenarioCount})` : ''}` },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TEMPLATE SCENARIOS TAB ── */}
      {activeTab === 'templates' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-700">Predefined Scenario Blueprints</h2>
              <p className="text-sm text-slate-500">
                One-click import. Missing overrides are created automatically from their templates.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {SCENARIO_TEMPLATES.map((template) => (
                <ScenarioTemplateCard
                  key={template.id}
                  template={template}
                  overrides={overrides}
                  onImport={handleImportTemplate}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PARAMETER SWEEP TAB ── */}
      {activeTab === 'sweep' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-700">Parameter Sweep / Sensitivity Analysis</h2>
              <p className="text-sm text-slate-500">
                Automatically generate overrides and scenarios by iterating a parameter over a range of values.
                Ideal for year-by-year analysis, CO₂ cap pathways, cost sensitivity, and more.
              </p>
            </div>
            <SweepGenerator overrides={overrides} onGenerate={handleGenerate} />
          </div>
        </div>
      )}

      {/* ── YOUR SCENARIOS TAB ── */}
      {activeTab === 'yours' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {scenarioCount === 0 ? (
              <div className="text-center py-20">
                <FiZap className="mx-auto text-slate-200 mb-4" size={52} />
                <h3 className="text-lg font-medium text-slate-500 mb-1">No scenarios yet</h3>
                <p className="text-sm text-slate-400 mb-5">
                  Import a template, generate a sweep, or create a custom scenario
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('templates')}
                    className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    Browse Templates
                  </button>
                  <button
                    onClick={() => setScenarioModal({})}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                  >
                    Create Scenario
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(scenarios).map(([name, overrideList]) => {
                  const isExpanded = expandedScenarios[name];
                  const missingCount = overrideList.filter((o) => !overrides[o]).length;

                  return (
                    <div key={name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50">
                        <button
                          onClick={() => setExpandedScenarios((p) => ({ ...p, [name]: !p[name] }))}
                          className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                        >
                          {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                        </button>

                        {renamingId === name ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key==='Enter') commitRename(name); if (e.key==='Escape') setRenamingId(null); }}
                              className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400" />
                            <button onClick={() => commitRename(name)} className="p-1 text-green-600 hover:bg-green-50 rounded"><FiCheck size={15} /></button>
                            <button onClick={() => setRenamingId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><FiX size={15} /></button>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="font-medium text-slate-800 text-sm truncate">{name}</span>
                            <span className="text-xs text-slate-400 shrink-0">{overrideList.length} override{overrideList.length!==1?'s':''}</span>
                            {missingCount > 0 && (
                              <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded shrink-0">
                                {missingCount} missing
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setScenarioModal({ existing: true, name, overrideList })}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" title="Edit">
                            <FiEdit2 size={14} />
                          </button>
                          <button onClick={() => { setRenamingId(name); setRenameValue(name); }}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" title="Rename">
                            <FiEdit2 size={14} />
                          </button>
                          <button onClick={() => handleDuplicate(name)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg" title="Duplicate">
                            <FiCopy size={14} />
                          </button>
                          <button onClick={() => handleDeleteScenario(name)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50 p-4">
                          <div className="space-y-1 mb-3">
                            {overrideList.map((o, i) => (
                              <div key={i}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                  overrides[o]
                                    ? 'bg-white border-slate-200 text-slate-800'
                                    : 'bg-amber-50 border-amber-200 text-amber-700'
                                }`}
                              >
                                <span className="text-xs text-slate-400 w-4">{i+1}.</span>
                                <span className="flex-1 font-medium">{o}</span>
                                {!overrides[o] && <span className="text-xs">(missing override)</span>}
                              </div>
                            ))}
                          </div>
                          <div className="p-3 bg-slate-800 rounded-xl">
                            <code className="text-xs text-green-300">
                              {name}: [{overrideList.map((o) => `"${o}"`).join(', ')}]
                            </code>
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

      {/* ── Modal ── */}
      {scenarioModal !== null && (
        <ScenarioModal
          initial={scenarioModal.existing ? { name: scenarioModal.name, overrides: scenarioModal.overrideList } : null}
          overrides={overrides}
          onConfirm={handleConfirmModal}
          onClose={() => setScenarioModal(null)}
        />
      )}
    </div>
  );
};

export default Scenarios;

