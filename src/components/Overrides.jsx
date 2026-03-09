import React, { useState, useMemo } from 'react';
import {
  FiEdit3, FiTrash2, FiPlus, FiCopy, FiChevronDown, FiChevronRight,
  FiEdit2, FiSearch, FiZap, FiBookOpen, FiList, FiX, FiCheck, FiInfo,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import {
  CATEGORY_META, CATEGORY_TEMPLATES, ALL_OVERRIDE_TEMPLATES,
} from '../data/overrideTemplates';

// ─── Template Card ─────────────────────────────────────────────────────────────
const TemplateCard = ({ template, onImport, alreadyAdded }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border transition-all ${
        alreadyAdded
          ? 'border-green-200 bg-green-50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl shrink-0 mt-0.5">{template.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-800">{template.name}</h3>
                {alreadyAdded && (
                  <span className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <FiCheck size={10} /> Added
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{template.description}</p>
              {template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {template.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="More info"
            >
              <FiInfo size={14} />
            </button>
            <button
              onClick={() => onImport(template)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                alreadyAdded
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}
            >
              {alreadyAdded ? 'Re-add' : 'Add'}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-600 leading-relaxed">{template.detail}</p>
            {template.params.length === 0 && (
              <pre className="mt-2 text-xs bg-slate-800 text-slate-100 p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(template.buildConfig({}), null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Import Modal (for parameterised templates) ────────────────────────────────
const ImportModal = ({ template, onConfirm, onClose }) => {
  const [values, setValues] = useState(
    Object.fromEntries(template.params.map((p) => [p.key, p.default]))
  );
  const [name, setName] = useState(template.id);

  const preview = useMemo(() => {
    try {
      return JSON.stringify(template.buildConfig(values), null, 2);
    } catch {
      return '{}';
    }
  }, [template, values]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{template.icon}</span>
              <h2 className="text-lg font-bold text-slate-800">{template.name}</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">{template.description}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg ml-4">
            <FiX size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Override name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Override name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>

          {/* Template params */}
          {template.params.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Parameters</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {template.params.map((param) => (
                  <div key={param.key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {param.label}
                    </label>
                    {param.type === 'select' ? (
                      <select
                        value={values[param.key]}
                        onChange={(e) => setValues({ ...values, [param.key]: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                      >
                        {param.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={param.type === 'number' ? 'number' : param.type === 'date' ? 'date' : 'text'}
                        value={values[param.key]}
                        step={param.type === 'number' ? 'any' : undefined}
                        onChange={(e) => setValues({ ...values, [param.key]: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail text */}
          {template.detail && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-blue-700 leading-relaxed">{template.detail}</p>
            </div>
          )}

          {/* JSON preview */}
          <div>
            <h3 className="text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Config preview
            </h3>
            <pre className="text-xs bg-slate-800 text-green-300 p-4 rounded-xl overflow-x-auto max-h-48 font-mono">
              {preview}
            </pre>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={() => {
              if (!name.trim()) return;
              onConfirm(name.trim(), template.buildConfig(values));
            }}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            Add to Model
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Custom Override Form ──────────────────────────────────────────────────────
const OVERRIDE_TYPES = [
  { value: 'subset_time',    label: 'Time Subset (date range)' },
  { value: 'time_resolution', label: 'Time Resolution (resample)' },
  { value: 'solver_config',  label: 'Solver Configuration' },
  { value: 'tech_parameter', label: 'Technology Parameter' },
  { value: 'raw_json',       label: 'Raw JSON (advanced)' },
];

const buildCustomConfig = (type, data) => {
  switch (type) {
    case 'subset_time':
      return { 'model.subset_time': [data.startDate, data.endDate] };
    case 'time_resolution':
      return { 'model.time': { function: 'resample', function_options: { resolution: data.resolution } } };
    case 'solver_config':
      return {
        run: {
          ensure_feasibility: data.ensureFeasibility,
          cyclic_storage: data.cyclicStorage,
          solver: data.solver,
        },
      };
    case 'tech_parameter':
      return {
        techs: {
          [data.tech]: { constraints: { [data.parameter]: isNaN(Number(data.value)) ? data.value : Number(data.value) } },
        },
      };
    case 'raw_json':
      try { return JSON.parse(data.rawJson); } catch { return {}; }
    default:
      return {};
  }
};

const CustomOverrideModal = ({ initial, onConfirm, onClose }) => {
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState('subset_time');
  const [data, setData] = useState({
    startDate: '2024-01-01', endDate: '2024-01-02',
    resolution: '3H',
    ensureFeasibility: true, cyclicStorage: false, solver: 'highs',
    tech: '', parameter: 'energy_cap_max', value: '',
    rawJson: '{}',
  });

  const set = (key, val) => setData((prev) => ({ ...prev, [key]: val }));
  const config = useMemo(() => buildCustomConfig(type, data), [type, data]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Custom Override</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <FiX size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my_debug_run"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              {OVERRIDE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {type === 'subset_time' && (
            <div className="grid grid-cols-2 gap-3">
              {['startDate', 'endDate'].map((k, i) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {i === 0 ? 'Start date' : 'End date'}
                  </label>
                  <input type="date" value={data[k]} onChange={(e) => set(k, e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
              ))}
            </div>
          )}

          {type === 'time_resolution' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Resolution</label>
              <select value={data.resolution} onChange={(e) => set('resolution', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500">
                {['1H','2H','3H','4H','6H','12H','24H'].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          {type === 'solver_config' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Solver</label>
                <select value={data.solver} onChange={(e) => set('solver', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500">
                  {['highs','gurobi','cbc','glpk','cplex'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                {[
                  { k: 'ensureFeasibility', l: 'Ensure Feasibility' },
                  { k: 'cyclicStorage',     l: 'Cyclic Storage' },
                ].map(({ k, l }) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={data[k]} onChange={(e) => set(k, e.target.checked)}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm text-slate-700">{l}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {type === 'tech_parameter' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Technology name</label>
                <input value={data.tech} onChange={(e) => set('tech', e.target.value)}
                  placeholder="e.g. solar_pv"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Parameter</label>
                  <input value={data.parameter} onChange={(e) => set('parameter', e.target.value)}
                    placeholder="e.g. energy_cap_max"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
                  <input value={data.value} onChange={(e) => set('value', e.target.value)}
                    placeholder="e.g. 100000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500" />
                </div>
              </div>
            </div>
          )}

          {type === 'raw_json' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Raw JSON config</label>
              <textarea
                value={data.rawJson}
                onChange={(e) => set('rawJson', e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-500 bg-slate-50"
                spellCheck={false}
              />
            </div>
          )}

          {type !== 'raw_json' && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Preview</p>
              <pre className="text-xs bg-slate-800 text-green-300 p-3 rounded-xl overflow-x-auto font-mono max-h-36">
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex gap-3">
          <button
            onClick={() => name.trim() && onConfirm(name.trim(), config)}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            Create Override
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const Overrides = () => {
  const { overrides, setOverrides, showNotification, currentModelId, models } = useData();
  const currentModel = models.find((m) => m.id === currentModelId);

  // View state
  const [activeTab, setActiveTab]       = useState('library'); // 'library' | 'yours'
  const [activeCategory, setActiveCategory] = useState('time');
  const [searchQuery, setSearchQuery]   = useState('');

  // Modals
  const [importModal, setImportModal]   = useState(null); // template to import (with params)
  const [customModal, setCustomModal]   = useState(null); // null | {}
  const [editingOverride, setEditingOverride] = useState(null);

  // Your overrides UI
  const [expandedOverrides, setExpandedOverrides] = useState({});
  const [showJsonEditor, setShowJsonEditor]   = useState({});
  const [jsonEditText, setJsonEditText]       = useState({});
  const [renamingId, setRenamingId]           = useState(null);
  const [renameValue, setRenameValue]         = useState('');

  // —— Template library handlers ——
  const handleImportTemplate = (template) => {
    if (template.params.length > 0) {
      setImportModal(template);
    } else {
      const config = template.buildConfig({});
      doAddOverride(template.id, config);
      setActiveTab('yours');
    }
  };

  const handleImportConfirm = (name, config) => {
    doAddOverride(name, config);
    setImportModal(null);
    setActiveTab('yours');
  };

  const doAddOverride = (name, config) => {
    const verb = overrides[name] ? 'updated' : 'added';
    setOverrides({ ...overrides, [name]: config });
    showNotification(`Override "${name}" ${verb}`, 'success');
  };

  // —— Your overrides handlers ——
  const handleDeleteOverride = (name) => {
    const { [name]: _, ...rest } = overrides;
    setOverrides(rest);
    showNotification(`Override "${name}" deleted`, 'success');
  };

  const handleDuplicate = (name) => {
    const copy = `${name}_copy`;
    setOverrides({ ...overrides, [copy]: { ...overrides[name] } });
    showNotification(`Duplicated as "${copy}"`, 'success');
  };

  const saveJsonEdit = (name) => {
    try {
      const parsed = JSON.parse(jsonEditText[name]);
      setOverrides({ ...overrides, [name]: parsed });
      showNotification(`Override "${name}" updated`, 'success');
      setShowJsonEditor((p) => ({ ...p, [name]: false }));
    } catch (e) {
      showNotification(`Invalid JSON: ${e.message}`, 'error');
    }
  };

  const commitRename = (oldName) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingId(null); return; }
    if (overrides[newName]) { showNotification('Name already exists', 'warning'); return; }
    const { [oldName]: config, ...rest } = overrides;
    setOverrides({ ...rest, [newName]: config });
    setRenamingId(null);
    showNotification(`Renamed to "${newName}"`, 'success');
  };

  // Search filtered templates
  const searchedTemplates = useMemo(() => {
    if (!searchQuery.trim()) return CATEGORY_TEMPLATES[activeCategory] || [];
    const q = searchQuery.toLowerCase();
    return ALL_OVERRIDE_TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
    );
  }, [activeCategory, searchQuery]);

  // ── No model selected ──
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

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="flex-1 h-screen overflow-hidden flex flex-col bg-slate-50">
      {/* ── Page Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FiEdit3 />
              Overrides
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Model variations for{' '}
              <span className="font-medium text-slate-700">{currentModel?.name}</span>
              {overrideCount > 0 && (
                <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {overrideCount} defined
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setCustomModal({})}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <FiPlus size={16} />
            Custom Override
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4">
          {[
            { id: 'library', icon: FiBookOpen, label: 'Template Library' },
            { id: 'yours',   icon: FiList,    label: `Your Overrides${overrideCount > 0 ? ` (${overrideCount})` : ''}` },
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

      {/* ── TEMPLATE LIBRARY TAB ── */}
      {activeTab === 'library' && (
        <div className="flex-1 overflow-hidden flex">
          {/* Category sidebar */}
          <div className="w-56 shrink-0 bg-white border-r border-slate-200 overflow-y-auto p-3">
            {/* Search */}
            <div className="relative mb-3">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <FiX size={13} />
                </button>
              )}
            </div>

            {!searchQuery && (
              <div className="space-y-1">
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const count = (CATEGORY_TEMPLATES[key] || []).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(key)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                        activeCategory === key
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{meta.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              activeCategory === key
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}>{count}</span>
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${
                            activeCategory === key ? 'text-slate-300' : 'text-slate-500'
                          }`}>{meta.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Template grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {searchQuery && (
              <p className="text-sm text-slate-500 mb-3">
                {searchedTemplates.length} result{searchedTemplates.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            )}
            {!searchQuery && (
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-700">
                  {CATEGORY_META[activeCategory]?.icon} {CATEGORY_META[activeCategory]?.label}
                </h2>
                <p className="text-sm text-slate-500">{CATEGORY_META[activeCategory]?.description}</p>
              </div>
            )}

            {searchedTemplates.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <FiSearch size={40} className="mx-auto mb-3 opacity-40" />
                <p>No templates found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {searchedTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onImport={handleImportTemplate}
                    alreadyAdded={!!overrides[template.id]}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── YOUR OVERRIDES TAB ── */}
      {activeTab === 'yours' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {overrideCount === 0 ? (
              <div className="text-center py-20">
                <FiZap className="mx-auto text-slate-200 mb-4" size={52} />
                <h3 className="text-lg font-medium text-slate-500 mb-1">No overrides yet</h3>
                <p className="text-sm text-slate-400 mb-5">
                  Browse the template library or create a custom override
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('library')}
                    className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    Browse Templates
                  </button>
                  <button
                    onClick={() => setCustomModal({})}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                  >
                    Custom Override
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(overrides).map(([name, config]) => {
                  const isExpanded = expandedOverrides[name];
                  const isJsonOpen = showJsonEditor[name];

                  return (
                    <div key={name} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {/* Row header */}
                      <div className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50">
                        <button
                          onClick={() => setExpandedOverrides((p) => ({ ...p, [name]: !p[name] }))}
                          className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                        >
                          {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                        </button>

                        {renamingId === name ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(name);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
                            />
                            <button onClick={() => commitRename(name)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <FiCheck size={15} />
                            </button>
                            <button onClick={() => setRenamingId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                              <FiX size={15} />
                            </button>
                          </div>
                        ) : (
                          <span className="flex-1 font-medium text-slate-800 text-sm">{name}</span>
                        )}

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setRenamingId(name); setRenameValue(name); }}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                            title="Rename"
                          >
                            <FiEdit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDuplicate(name)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                            title="Duplicate"
                          >
                            <FiCopy size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteOverride(name)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              {isJsonOpen ? 'Edit JSON' : 'Configuration'}
                            </span>
                            <div className="flex gap-2">
                              {isJsonOpen && (
                                <button
                                  onClick={() => saveJsonEdit(name)}
                                  className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                                >
                                  Save JSON
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setShowJsonEditor((p) => ({ ...p, [name]: !p[name] }));
                                  if (!showJsonEditor[name]) {
                                    setJsonEditText((p) => ({ ...p, [name]: JSON.stringify(config, null, 2) }));
                                  }
                                }}
                                className="px-3 py-1 text-xs bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                              >
                                {isJsonOpen ? 'View' : 'Edit JSON'}
                              </button>
                            </div>
                          </div>

                          {isJsonOpen ? (
                            <textarea
                              value={jsonEditText[name] || ''}
                              onChange={(e) => setJsonEditText((p) => ({ ...p, [name]: e.target.value }))}
                              rows={10}
                              className="w-full text-xs font-mono bg-slate-800 text-slate-100 p-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 resize-y"
                              spellCheck={false}
                            />
                          ) : (
                            <pre className="text-xs font-mono bg-slate-800 text-green-300 p-4 rounded-xl overflow-x-auto">
                              {JSON.stringify(config, null, 2)}
                            </pre>
                          )}
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

      {/* ── Modals ── */}
      {importModal && (
        <ImportModal
          template={importModal}
          onConfirm={handleImportConfirm}
          onClose={() => setImportModal(null)}
        />
      )}
      {customModal !== null && (
        <CustomOverrideModal
          initial={null}
          onConfirm={(name, config) => {
            doAddOverride(name, config);
            setCustomModal(null);
            setEditingOverride(null);
            setActiveTab('yours');
          }}
          onClose={() => { setCustomModal(null); setEditingOverride(null); }}
        />
      )}
    </div>
  );
};

export default Overrides;

