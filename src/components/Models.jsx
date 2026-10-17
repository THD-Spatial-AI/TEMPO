import React, { useState, useRef, useEffect } from 'react';
import { FiFolder, FiTrash2, FiEdit2, FiCheck, FiX, FiPlus, FiDownload, FiUpload, FiMap, FiZap, FiInfo, FiEye, FiChevronDown, FiChevronRight, FiCpu, FiDatabase, FiActivity, FiLayers, FiUploadCloud, FiPackage, FiSearch } from './ui/icons';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { useData } from '../context/DataContext';
import CSVUploader from './CSVUploader';
import CalliopeYAMLImporter from './CalliopeYAMLImporter';
import { SERVER_TEMPLATES } from '../services/serverTemplates';
import CSVImportWizard from './CSVImportWizard';
import TranslationReport from './TranslationReport';
import { detectArchiveFormat } from '../services/archiveFormat';
import { importModelArchive } from '../services/engineClient';
import { useCsvImportWizard } from '../hooks/useCsvImportWizard';
import Select from './ui/Select';
import { confirmAction } from './ui/confirm';
import { usePinnedModels, togglePinnedModel, sortPinnedFirst } from '../services/pinnedModels';
import { LuPin } from './ui/icons';
import { iconBtn, ICON_PX } from './ui/iconButton';

const Models = () => {
  const { models, setModels, currentModelId, loadModel, deleteModel, renameModel, createModel, setTimeSeries, setOverrides, setScenarios, showNotification } = useData();
  const [importerTemplate, setImporterTemplate] = useState(null);
  const importerRef = useRef(null);
  const [showYAMLImporter, setShowYAMLImporter] = useState(false);

  // The page scrolls inside <main>, not the window: bring the importer panel into view when it opens
  useEffect(() => {
    if (showYAMLImporter) importerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showYAMLImporter, importerTemplate]);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editingModelId, setEditingModelId] = useState(null);
  const [editModalName, setEditModalName] = useState('');
  const [editModalDesc, setEditModalDesc] = useState('');
  const [renamingTsId, setRenamingTsId] = useState(null);
  const [renamingTsName, setRenamingTsName] = useState('');
  const [showCSVWizard, setShowCSVWizard] = useState(false);
  const [archiveImporting, setArchiveImporting] = useState(false);
  const [importReport, setImportReport] = useState([]);
  const archiveInputRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Import a framework archive (PyPSA / OSeMOSYS / AdOpT-NET0): detect the
  // format from the ZIP file listing, then let that engine's Python service
  // parse and translate it into a TEMPO model.
  const handleArchiveFile = async (file) => {
    if (!file) return;
    setArchiveImporting(true);
    setImportReport([]);
    try {
      const zip = await JSZip.loadAsync(file);
      const format = detectArchiveFormat(Object.keys(zip.files));

      if (format === 'calliope') {
        setShowCreatePanel(false);
        setShowYAMLImporter(true);
        showNotification('This is a Calliope archive — use the YAML importer that just opened.', 'info');
        return;
      }
      if (format === 'unknown') {
        showNotification('Could not detect the archive format (expected PyPSA, OSeMOSYS, AdOpT-NET0, or Calliope).', 'error');
        return;
      }

      const { model, report, extraModels } = await importModelArchive(format, file);
      const name = model.name || file.name.replace(/\.zip$/i, '');
      createModel(
        name,
        model.locations || [],
        model.links || [],
        [],
        model.technologies || [],
        model.timeSeries || [],
        {
          source: `${format}_import`,
          modelConfig: model.modelConfig || {},
          description: `Imported from ${format} archive: ${file.name}`,
        },
      );
      for (const extra of extraModels || []) {
        const extraName = extra.name || `${name} (extra)`;
        createModel(
          extraName,
          extra.locations || [],
          extra.links || [],
          [],
          extra.technologies || [],
          extra.timeSeries || [],
          {
            source: `${format}_import`,
            modelConfig: extra.modelConfig || {},
            description: `Imported from ${format} archive: ${file.name}`,
          },
        );
      }
      setImportReport(report || []);
      const total = 1 + (extraModels?.length || 0);
      showNotification(
        total > 1 ? `${total} models imported from ${format} archive!` : `${name} imported from ${format} archive!`,
        'success'
      );
      setShowCreatePanel(false);
    } catch (err) {
      console.error('Archive import error:', err);
      showNotification(`Import failed: ${err.message}`, 'error');
    } finally {
      setArchiveImporting(false);
      if (archiveInputRef.current) archiveInputRef.current.value = '';
    }
  };
  const csvWizard = useCsvImportWizard({ createModel, setOverrides, setScenarios, showNotification, setShowCSVWizard });
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);

  const currentModel = models.find((m) => m.id === currentModelId);

  const MODEL_TYPES = [
    {
      id: 'calliope',
      name: 'Calliope',
      shortDesc: 'Multi-carrier LP energy system model',
      longDesc: 'Supports Calliope 0.6.8 and 0.7. Import via YAML archive or CSV wizard.',
      icon: <FiZap size={18} />,
      color: 'blue',
      enabled: true,
    },
    {
      id: 'adoptnet0',
      name: 'AdOpT-NET0',
      shortDesc: 'Net-zero transition pathway optimization',
      longDesc: 'Capacity expansion model focused on net-zero energy system transitions.',
      icon: <FiActivity size={18} />,
      color: 'gray',
      enabled: false,
    },
    {
      id: 'osemosys',
      name: 'OSeMOSYS',
      shortDesc: 'Open Source energy Modelling SYStem',
      longDesc: 'Long-run energy planning model widely used for policy analysis.',
      icon: <FiDatabase size={18} />,
      color: 'gray',
      enabled: false,
    },
    {
      id: 'pypsa',
      name: 'PyPSA',
      shortDesc: 'Python for Power System Analysis',
      longDesc: 'Network-constrained power flow and capacity expansion model.',
      icon: <FiCpu size={18} />,
      color: 'gray',
      enabled: false,
    },
  ];

  const getModelTypeBadgeLabel = (model) => {
    const type = model.modelType || 'calliope';
    if (type === 'calliope') {
      const ver = model.metadata?.modelConfig?.calliopeVersion;
      return ver ? `Calliope ${ver}` : 'Calliope';
    }
    const found = MODEL_TYPES.find(mt => mt.id === type);
    return found ? found.name : type;
  };

  const handleDelete = async (modelId) => {
    if (await confirmAction({ title: 'Delete this model?', message: 'Its locations, links, technologies and time series will be permanently removed.', details: models.find(m => m.id === modelId)?.name })) {
      deleteModel(modelId);
    }
  };

  const openEditModal = (model) => {
    setEditingModelId(model.id);
    setEditModalName(model.name);
    setEditModalDesc(model.metadata?.description || '');
    setRenamingTsId(null);
  };

  const saveEditName = () => {
    if (editModalName.trim()) {
      renameModel(editingModelId, editModalName.trim());
      showNotification('Name updated', 'success');
    }
  };

  const saveEditDesc = () => {
    setModels(prev => prev.map(m =>
      m.id === editingModelId
        ? { ...m, metadata: { ...m.metadata, description: editModalDesc }, updatedAt: new Date().toISOString() }
        : m
    ));
    showNotification('Description updated', 'success');
  };

  const deleteTs = (modelId, tsId) => {
    setModels(prev => prev.map(m =>
      m.id === modelId
        ? { ...m, timeSeries: (m.timeSeries || []).filter(ts => ts.id !== tsId), updatedAt: new Date().toISOString() }
        : m
    ));
    if (currentModelId === modelId) {
      setTimeSeries(prev => prev.filter(ts => ts.id !== tsId));
    }
    showNotification('Time series removed', 'success');
  };

  const saveTsRename = (modelId) => {
    if (!renamingTsName.trim()) return;
    setModels(prev => prev.map(m =>
      m.id === modelId
        ? { ...m, timeSeries: (m.timeSeries || []).map(ts => ts.id === renamingTsId ? { ...ts, name: renamingTsName.trim() } : ts), updatedAt: new Date().toISOString() }
        : m
    ));
    if (currentModelId === modelId) {
      setTimeSeries(prev => prev.map(ts => ts.id === renamingTsId ? { ...ts, name: renamingTsName.trim() } : ts));
    }
    setRenamingTsId(null);
    showNotification('Time series renamed', 'success');
  };

  const handleAddTsFile = (e) => {
    Array.from(e.target.files).forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          const columns = results.meta.fields || [];
          const newTs = {
            id: `ts_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: file.name.replace(/\.csv$/i, ''),
            fileName: file.name,
            uploadedAt: new Date().toISOString(),
            data: results.data,
            columns,
            rowCount: results.data.length,
            type: 'other',
            modelId: editingModelId,
          };
          setModels(prev => prev.map(m =>
            m.id === editingModelId
              ? { ...m, timeSeries: [...(m.timeSeries || []), newTs], updatedAt: new Date().toISOString() }
              : m
          ));
          if (currentModelId === editingModelId) {
            setTimeSeries(prev => [...prev, newTs]);
          }
          showNotification(`Added ${file.name}`, 'success');
        },
        error: (err) => showNotification(`Error reading ${file.name}: ${err.message}`, 'error'),
      });
    });
    e.target.value = '';
  };

  const pinnedIds = usePinnedModels();
  const filteredModels = sortPinnedFirst(models.filter(m => {
    const matchesSearch = !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || (m.modelType || m.metadata?.modelType || 'calliope') === filterType;
    return matchesSearch && matchesType;
  }), pinnedIds);
  const allSelected = filteredModels.length > 0 && filteredModels.every(m => selectedIds.has(m.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); filteredModels.forEach(m => next.delete(m.id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); filteredModels.forEach(m => next.add(m.id)); return next; });
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!(await confirmAction({ title: `Delete ${count} model${count > 1 ? 's' : ''}?`, message: 'The selected models and all their data will be permanently removed.' }))) return;
    selectedIds.forEach(id => deleteModel(id));
    setSelectedIds(new Set());
    showNotification(`Deleted ${count} model${count > 1 ? 's' : ''}`, 'success');
  };

  const handleBulkExport = () => {
    const toExport = models.filter(m => selectedIds.has(m.id));
    toExport.forEach(model => {
      const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    showNotification(`Exported ${toExport.length} model${toExport.length > 1 ? 's' : ''}`, 'success');
    setSelectedIds(new Set());
  };

  return (
    <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Models</h1>
        <p className="mt-1 text-sm text-slate-500">Import, manage and switch between your energy system models.</p>
      </div>

      {/* Calliope YAML Importer panel */}
      {showYAMLImporter && (
        <div className="mb-6" ref={importerRef}>
          <CalliopeYAMLImporter
            initialTemplate={importerTemplate}
            onClose={() => { setShowYAMLImporter(false); setImporterTemplate(null); }}
            onImport={(name, locations, links, parameters, technologies, timeSeries, metadata, overrides, scenarios) => {
              createModel(name, locations, links, parameters, technologies, timeSeries, { ...metadata, modelType: 'calliope' }, overrides, scenarios);
              showNotification(`Calliope model "${name}" imported successfully!`, 'success');
              setShowYAMLImporter(false);
              setImporterTemplate(null);
            }}
          />
        </div>
      )}

      {/* Create New Model — model type cards */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Import a model</h2>
          <p className="mt-0.5 text-sm text-slate-500">Choose the format of your model files.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MODEL_TYPES.map((mt) => (
            <button
              key={mt.id}
              disabled={!mt.enabled}
              onClick={() => mt.enabled && setShowCreatePanel(true)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all  flex items-center gap-3 ${
                mt.enabled
                  ? 'bg-white border-black/15 hover:border-black/15 hover: cursor-pointer'
                  : 'bg-gray-50 border-black/15 cursor-not-allowed opacity-60'
              }`}
            >
              <div className={`w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0 ${mt.enabled ? 'text-gray-600' : 'text-gray-400'}`}>
                {mt.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800 text-sm truncate">{mt.name}</div>
                <div className="text-[11px] text-slate-500 leading-snug truncate">{mt.shortDesc}</div>
              </div>
              {mt.enabled ? (
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black text-white text-[11px] font-semibold whitespace-nowrap ">
                  <FiPlus size={12} />
                  Import
                </span>
              ) : (
                <span className="flex-shrink-0 px-2 py-0.5 bg-gray-200 text-gray-600 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Calliope import method chooser modal */}
      {showCreatePanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/15">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Import Calliope Model</h3>
                <p className="text-sm text-slate-500 mt-0.5">Choose how to bring your model into TEMPO</p>
              </div>
              <button
                onClick={() => setShowCreatePanel(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FiX size={24} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <button
                onClick={() => { setShowCreatePanel(false); setShowYAMLImporter(true); }}
                className="flex flex-col items-start p-5 border-2 border-black/15 rounded-xl hover:border-black/15 hover:bg-gray-50 transition-all text-left group"
              >
                <div className="p-2 bg-gray-100 rounded-lg mb-3 group-hover:bg-gray-200 transition-colors">
                  <FiPackage size={22} className="text-gray-700" />
                </div>
                <div className="font-bold text-slate-800 mb-1">YAML Archive</div>
                <div className="text-xs text-slate-500">Import a Calliope 0.6.8 or 0.7 YAML model bundle</div>
              </button>
              <button
                onClick={() => { setShowCreatePanel(false); setShowCSVWizard(true); }}
                className="flex flex-col items-start p-5 border-2 border-black/15 rounded-xl hover:border-black/15 hover:bg-gray-50 transition-all text-left group"
              >
                <div className="p-2 bg-gray-100 rounded-lg mb-3 group-hover:bg-gray-200 transition-colors">
                  <FiUpload size={22} className="text-gray-700" />
                </div>
                <div className="font-bold text-slate-800 mb-1">CSV Wizard</div>
                <div className="text-xs text-slate-500">Build a model from locations, links and timeseries CSV files</div>
              </button>
              <button
                onClick={() => archiveInputRef.current?.click()}
                disabled={archiveImporting}
                className="flex flex-col items-start p-5 border-2 border-black/15 rounded-xl hover:border-black/15 hover:bg-gray-50 transition-all text-left group disabled:opacity-50 col-span-2"
              >
                <div className="p-2 bg-gray-100 rounded-lg mb-3 group-hover:bg-gray-200 transition-colors">
                  <FiUploadCloud size={22} className="text-gray-700" />
                </div>
                <div className="font-bold text-slate-800 mb-1">
                  {archiveImporting ? 'Importing…' : 'Framework Archive (auto-detect)'}
                </div>
                <div className="text-xs text-slate-500">
                  Import a PyPSA (netCDF/CSV), OSeMOSYS, or AdOpT-NET0 archive — TEMPO detects the
                  format and translates it. Requires the matching engine to be installed (Settings).
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for framework-archive imports */}
      <input
        ref={archiveInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => handleArchiveFile(e.target.files?.[0])}
      />

      {/* Translation report from the last framework-archive import */}
      {importReport.length > 0 && (
        <div className="mb-6">
          <TranslationReport report={importReport} title="Import translation report" />
        </div>
      )}

      {/* Your Models Section */}
      <div className="mb-8 rounded-2xl border border-black/15 bg-white p-6 ">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              Your Models
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {filteredModels.length !== models.length ? `${filteredModels.length} of ${models.length}` : models.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500">Models saved on this device.</p>
          </div>
        </div>

        {models.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <FiSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search models"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-lg border border-black/15 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-black/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="w-52">
              <Select
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: 'all', label: 'All types', description: `${models.length} model${models.length === 1 ? '' : 's'}` },
                  ...[['calliope', 'Calliope'], ['pypsa', 'PyPSA'], ['osemosys', 'OSeMOSYS'], ['adoptnet0', 'AdOpT-NET0']].map(([value, label]) => {
                    const n = models.filter(m => (m.modelType || m.metadata?.modelType || 'calliope') === value).length;
                    return { value, label, description: `${n} model${n === 1 ? '' : 's'}` };
                  }),
                ]}
              />
            </div>
            {someSelected && (
              <div className="tempo-tour-card flex h-10 items-center gap-1.5 rounded-full border border-black/15 bg-white pl-1.5 pr-1.5 shadow-sm" role="toolbar" aria-label="Selected models">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold tabular-nums text-white">
                  {selectedIds.size}
                </span>
                <span className="pr-1 text-xs font-medium text-slate-500">selected</span>
                <span className="h-5 w-px bg-black/10" aria-hidden="true" />
                <button onClick={handleBulkExport} title={`Export ${selectedIds.size} selected`} aria-label="Export selected"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
                  <FiDownload size={17} />
                </button>
                <button onClick={handleBulkDelete} title={`Delete ${selectedIds.size} selected`} aria-label="Delete selected"
                  className="grid h-8 w-8 place-items-center rounded-full text-red-600 transition-colors hover:bg-red-50">
                  <FiTrash2 size={17} />
                </button>
                <span className="h-5 w-px bg-black/10" aria-hidden="true" />
                <button onClick={() => setSelectedIds(new Set())} title="Clear selection" aria-label="Clear selection"
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <FiX size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {models.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-black/15 px-6 py-12 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500"><FiFolder size={20} /></div>
            <p className="text-sm font-semibold text-slate-800">No models yet</p>
            <p className="mb-5 mt-1 text-sm text-slate-500">Pick a model type above, or load a template below.</p>
            <button
              onClick={() => setShowCreatePanel(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white  transition-colors hover:bg-black/80"
            >
              <FiPlus size={16} />
              Create Your First Model
            </button>
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-black/15 px-6 py-10 text-center">
            <FiSearch size={18} className="mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">No matches</p>
            <p className="mt-1 text-sm text-slate-500">No models match your search or type filter.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-black/15">
            <label className="flex cursor-pointer items-center gap-3 border-b border-black/15 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 cursor-pointer rounded border-black/15 accent-slate-900"
              />
              Select all ({filteredModels.length})
            </label>
            <div className="divide-y divide-black/10">
            {filteredModels.map((model) => {
              const active = currentModelId === model.id;
              const pinned = pinnedIds.has(model.id);
              const selected = selectedIds.has(model.id);
              const stats = [
                [model.locations?.length || 0, 'locations'],
                [model.links?.length || 0, 'links'],
                [model.technologies?.length || 0, 'techs'],
                ...((model.timeSeries?.length || 0) > 0 ? [[model.timeSeries.length, 'time series']] : []),
                ...(Object.keys(model.scenarios || {}).length > 0 ? [[Object.keys(model.scenarios).length, 'scenarios']] : []),
              ];
              return (
              <div
                key={model.id}
                className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
                  selected ? 'bg-slate-100' : active ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(model.id)}
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-black/15 accent-slate-900"
                />
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-black text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <FiPackage size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{model.name}</span>
                    {pinned && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        <LuPin size={12} style={{ fontVariationSettings: "'FILL' 1" }} /> Pinned
                      </span>
                    )}
                    {active && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    )}
                    {model.metadata?.template && (
                      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Template</span>
                    )}
                    <span className="rounded-md border border-black/15 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {getModelTypeBadgeLabel(model)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {stats.map(([n, label]) => (
                      <span key={label} className="rounded-md bg-slate-100 px-1.5 py-0.5">
                        <span className="font-semibold tabular-nums text-slate-800">{n}</span> {label}
                      </span>
                    ))}
                    <span className="ml-1 text-[11px] text-slate-400">Updated {new Date(model.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {active ? (
                    <span className="h-8 w-[60px]" aria-hidden="true" />
                  ) : (
                    <button
                      onClick={() => loadModel(model.id)}
                      title="Make this the active model"
                      className="h-8 w-[60px] border border-black/15 bg-white text-[13px] font-semibold text-slate-800 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                    >
                      Load
                    </button>
                  )}
                  <button
                    onClick={() => togglePinnedModel(model.id)}
                    aria-label={pinned ? 'Unpin model' : 'Pin model to top'}
                    title={pinned ? 'Unpin model' : 'Pin to top'}
                    aria-pressed={pinned}
                    className={`${iconBtn('edit')} ${pinned ? 'text-slate-900' : ''}`}
                  >
                    {pinned ? <LuPin size={ICON_PX.md} style={{ fontVariationSettings: "'FILL' 1" }} /> : <LuPin size={ICON_PX.md} />}
                  </button>
                  <button
                    onClick={() => openEditModal(model)}
                    aria-label="Edit model"
                    title="Edit model"
                    className={`${iconBtn('edit', 'md')}`}
                  >
                    <FiEdit2 size={ICON_PX.md} />
                  </button>
                  <button
                    onClick={() => handleDelete(model.id)}
                    aria-label="Delete model"
                    title="Delete model"
                    className={`${iconBtn('delete', 'md')}`}
                  >
                    <FiTrash2 size={ICON_PX.md} />
                  </button>
                </div>
              </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Edit Model Modal */}
      {editingModelId && (() => {
        const em = models.find(m => m.id === editingModelId);
        if (!em) return null;
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-black/15">
                <h3 className="text-lg font-bold text-slate-800">Edit Model</h3>
                <button onClick={() => setEditingModelId(null)} className="text-gray-400 hover:text-gray-600">
                  <FiX size={22} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name</label>
                  <div className="flex gap-2">
                    <input
                      value={editModalName}
                      onChange={(e) => setEditModalName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                      className="flex-1 px-3 py-2 border border-black/15 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                    <button onClick={saveEditName} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-black/80">
                      Save
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={editModalDesc}
                      onChange={(e) => setEditModalDesc(e.target.value)}
                      rows={2}
                      className="flex-1 px-3 py-2 border border-black/15 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                    />
                    <button onClick={saveEditDesc} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-black/80">
                      Save
                    </button>
                  </div>
                </div>

                {/* Time Series Files */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Time Series Files
                      <span className="ml-2 text-xs font-normal text-slate-400">({em.timeSeries?.length || 0})</span>
                    </label>
                    <label className="cursor-pointer px-3 py-1.5 bg-black text-white rounded-lg text-xs font-medium hover:bg-black/80 inline-flex items-center gap-1">
                      <FiPlus size={12} />
                      Add CSV
                      <input type="file" accept=".csv" multiple className="hidden" onChange={handleAddTsFile} />
                    </label>
                  </div>

                  {(em.timeSeries?.length || 0) === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-black/15 rounded-lg">
                      No time series files — click Add CSV to upload one
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {em.timeSeries.map((ts) => (
                        <div key={ts.id} className="flex items-center gap-2 px-3 py-2 border border-black/15 rounded-lg bg-gray-50">
                          {renamingTsId === ts.id ? (
                            <>
                              <input
                                value={renamingTsName}
                                onChange={(e) => setRenamingTsName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveTsRename(editingModelId)}
                                className="flex-1 px-2 py-1 border border-gray-400 rounded text-sm focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => saveTsRename(editingModelId)} className="p-1 text-gray-600 hover:text-gray-700">
                                <FiCheck size={15} />
                              </button>
                              <button onClick={() => setRenamingTsId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <FiX size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">{ts.name || ts.fileName}</div>
                                <div className="text-[10px] text-slate-500">{ts.fileName} · {ts.rowCount || 0} rows</div>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                                ts.type === 'demand' ? 'bg-gray-100 text-gray-700' :
                                ts.type?.startsWith('resource') ? 'bg-gray-100 text-gray-700' :
                                'bg-gray-200 text-gray-600'
                              }`}>{ts.type || 'other'}</span>
                              <button
                                onClick={() => { setRenamingTsId(ts.id); setRenamingTsName(ts.name || ts.fileName || ''); }}
                                className={`${iconBtn('edit', 'md')}`}
                                title="Rename"
                              >
                                <FiEdit2 size={ICON_PX.md} />
                              </button>
                              <button
                                onClick={() => deleteTs(editingModelId, ts.id)}
                                className={`${iconBtn('delete', 'md')}`}
                                title="Delete"
                              >
                                <FiTrash2 size={ICON_PX.md} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-3 border-t flex justify-end">
                <button
                  onClick={() => setEditingModelId(null)}
                  className="px-5 py-2 border border-black/15 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Template Models Section: published models, downloaded from GitHub on first use */}
      <div className="mb-8 rounded-2xl border border-black/15 bg-white p-6 ">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            Template Models
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{SERVER_TEMPLATES.length}</span>
          </h2>
          <p className="text-xs text-slate-500">Published Calliope models. They are downloaded from GitHub the first time you load one and kept on this computer.</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SERVER_TEMPLATES.map((template) => (
            <div key={template.id} className="flex flex-col overflow-hidden rounded-xl border border-black/15 bg-white transition-all hover:border-black/15">
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-2xl ring-1 ring-slate-200">{template.flag}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{template.name}</div>
                    <div className="text-xs text-slate-500">Calliope 0.6 YAML model</div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-500" title={template.description}>{template.description}</p>
              </div>
              <div className="flex items-center gap-2 border-t border-black/10 px-4 py-2.5">
                <button
                  onClick={() => {
                    setImporterTemplate(template.id);
                    setShowYAMLImporter(true);
                  }}
                  disabled={showYAMLImporter && importerTemplate === template.id}
                  className="ml-auto h-8 rounded-lg bg-black px-4 text-xs font-semibold text-white  transition-colors hover:bg-black/80 disabled:cursor-wait disabled:opacity-60"
                >
                  {showYAMLImporter && importerTemplate === template.id ? 'Loading… see panel above' : 'Load template'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSV Import Wizard Modal */}
      {showCSVWizard && (
        <CSVImportWizard
          wizardData={csvWizard.wizardData}
          setWizardData={csvWizard.setWizardData}
          onComplete={csvWizard.completeWizard}
          onClose={() => setShowCSVWizard(false)}
          downloadTemplate={csvWizard.downloadTemplate}
          handleLocationsFileUpload={csvWizard.handleLocationsFileUpload}
          handleLinksFileUpload={csvWizard.handleLinksFileUpload}
          handleDemandFileUpload={csvWizard.handleDemandFileUpload}
          handleTechnologiesFileUpload={csvWizard.handleTechnologiesFileUpload}
          handleScenariosFileUpload={csvWizard.handleScenariosFileUpload}
          handleConfigFileUpload={csvWizard.handleConfigFileUpload}
          handleResourceFileUpload={csvWizard.handleResourceFileUpload}
          removeResourceFile={csvWizard.removeResourceFile}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default Models;
