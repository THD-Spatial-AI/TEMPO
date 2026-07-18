/**
 * CalliopeYAMLImporter.jsx
 *
 * Imports a Calliope 0.6.x model from three sources:
 *  1. Pre-loaded server templates (already in public/templates/)
 *  2. A .zip archive (download from GitHub / Zenodo and drop here)
 *  3. Folder or individual files (multi-select YAML + CSV)
 *
 * Parsing strategy
 *  1. Find the root model YAML (model.yaml / model.yml).
 *  2. Resolve every `import:` reference recursively.
 *  3. Deep-merge all YAML documents into one.
 *  4. Translate locations / links / techs → app-internal format.
 *  5. Scan `file=xxx.csv` references in constraints and load CSV timeseries if present.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  FiUploadCloud, FiPackage, FiCheckCircle,
  FiAlertTriangle, FiX, FiChevronDown, FiChevronRight,
  FiMap, FiZap, FiDatabase, FiActivity, FiInfo, FiRefreshCw,
  FiServer, FiFolder,
} from 'react-icons/fi';
import JSZip from 'jszip';
import jsyaml from 'js-yaml';
import Papa from 'papaparse';
import { fetchTemplate } from '../utils/templateFetch';
import { detectCalliopeFormat, from07ToInternal } from '../services/calliope07Format';
import { translateCalliopeModel, readText, parseFilesMap, getFilesFromDataTransfer } from '../services/calliopeYamlImport';

// ─── known server-side YAML templates ────────────────────────────────────────
// Add entries here as more YAML models are placed in public/templates/
const SERVER_TEMPLATES = [
  {
    id:          'italian_model',
    name:        'Italian Energy System',
    description: 'Multi-region Italian power system (6–20 nodes) with VRE, thermal, hydro, storage and import/export technologies. Includes 2015 timeseries data.',
    flag:        '🇮🇹',
    rootYaml:    'Italian_model/model.yaml',
    basePath:    'Italian_model',
    // All YAML imports relative to basePath (resolved automatically but listed for transparency)
    imports:     [
      'model_config/techs.yaml',
      'model_config/locations.yaml',
      'overrides.yaml',
      'model_config/new_techs.yaml',
      'model_config/new_locations.yaml',
    ],
    // Timeseries CSVs in timeseries_data/ (optional, loaded if present)
    csvFiles:    [
      'timeseries_data/regional_demand.csv',
      'timeseries_data/pv_series.csv',
      'timeseries_data/wind_series.csv',
      'timeseries_data/wind_offshore_series.csv',
      'timeseries_data/hydro_reservoirs.csv',
    ],
    color: 'green',
  },
  {
    id:          'uk_model',
    name:        'UK Energy System',
    description: 'Multi-zone UK power system (17 zones) with wind, solar, hydro, fossil, nuclear, storage and HVAC/HVDC transmission. Based on UK-Calliope 0.6.3.',
    flag:        '🇬🇧',
    rootYaml:    'uk-calliope-master/uk-calliope-master/model.yaml',
    basePath:    'uk-calliope-master/uk-calliope-master',
    // YAML imports are auto-discovered recursively — no need to list them explicitly
    imports:     [],
    csvFiles:    [
      'data/demand.csv',
      'data/pv.csv',
      'data/wind_onshore.csv',
      'data/wind_offshore.csv',
    ],
    color: 'blue',
  },
  {
    id:          'cambridge_model',
    name:        'Cambridge District Energy',
    description: 'West Cambridge district-scale multi-carrier model (~50 building nodes) with CHP, GSHP, PV, solar thermal, storage and district heat/gas/electricity networks.',
    flag:        '🎓',
    rootYaml:    'cambridge-calliope-master/model/model.yaml',
    basePath:    'cambridge-calliope-master/model',
    // YAML imports + CSVs are auto-discovered via fetchYamlRecursive
    imports:     [],
    csvFiles:    [],
    auto:        true,
    color: 'purple',
  },
];


// ─── component ────────────────────────────────────────────────────────────────

export default function CalliopeYAMLImporter({ onImport, onClose }) {
  const [uploadMode, setUploadMode] = useState('server');
  const [dragOver,   setDragOver]   = useState(false);
  const [status,     setStatus]     = useState('idle');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [parseLog,   setParseLog]   = useState([]);
  const [preview,    setPreview]    = useState(null);
  const [showLog,    setShowLog]    = useState(false);
  const [modelName,  setModelName]  = useState('');
  const [loadingTpl, setLoadingTpl] = useState(null);
  const [tplAvailable, setTplAvailable] = useState({});

  // Check which server templates are actually present on first switch to 'server' tab
  useEffect(() => {
    if (uploadMode !== 'server') return;
    (async () => {
      const avail = {};
      await Promise.all(SERVER_TEMPLATES.map(async tpl => {
        try {
          const resp = await fetchTemplate(tpl.rootYaml);
          avail[tpl.id] = resp.ok;
        } catch { avail[tpl.id] = false; }
      }));
      setTplAvailable(avail);
    })();
  }, [uploadMode]);

  const zipRef    = useRef(null);
  const filesRef  = useRef(null);
  const folderRef = useRef(null);

  const addLog = useCallback(msg => setParseLog(p => [...p, msg]), []);

  const reset = () => {
    setStatus('idle'); setErrorMsg(''); setParseLog([]);
    setPreview(null);  setShowLog(false); setModelName(''); setLoadingTpl(null);
  };

  // ── shared: parse a filesMap ───────────────────────────────────────────────
  const runParse = useCallback(async (filesMap) => {
    setStatus('parsing');
    try {
      const mergedDoc = await parseFilesMap(filesMap, addLog);
      const format    = detectCalliopeFormat(mergedDoc);
      addLog('Detected Calliope model format: ' + format);
      const result    = format === '0.7'
        ? from07ToInternal(mergedDoc, filesMap, Papa)
        : translateCalliopeModel(mergedDoc, filesMap);
      result.log.forEach(l => addLog(l));
      setPreview(result);
      setModelName(result.modelName);
      setStatus('preview');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatus('error');
    }
  }, [addLog]);

  // ── ZIP mode ───────────────────────────────────────────────────────────────
  const handleZIP = useCallback(async (file) => {
    setStatus('parsing');
    setParseLog([]);
    addLog('Opening ZIP: ' + file.name);
    try {
      const zip      = await JSZip.loadAsync(file);
      const filesMap = new Map();
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const ext = path.split('.').pop().toLowerCase();
        if (['yaml', 'yml', 'csv'].includes(ext)) {
          const text = await entry.async('string');
          const norm = path.replace(/\\/g, '/');
          filesMap.set(norm, text);
          filesMap.set(norm.split('/').pop(), text);
        }
      }
      addLog('Extracted YAML/CSV files from ZIP');
      await runParse(filesMap);
    } catch (err) {
      setErrorMsg('ZIP error: ' + err.message);
      setStatus('error');
    }
  }, [addLog, runParse]);

  // ── files/folder mode ─────────────────────────────────────────────────────
  const handleFileList = useCallback(async (fileList) => {
    setStatus('parsing');
    setParseLog([]);
    const filesMap = new Map();
    let skipped    = 0;
    for (const f of fileList) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!['yaml', 'yml', 'csv'].includes(ext)) continue;
      try {
        const text    = await readText(f);
        const relPath = (f._entryPath || f.webkitRelativePath || f.name).replace(/\\/g, '/');
        filesMap.set(relPath, text);
        filesMap.set(relPath.split('/').pop(), text);
      } catch (err) {
        skipped++;
        addLog('⚠ Skipped: ' + err.message);
      }
    }
    if (filesMap.size === 0) {
      setErrorMsg(
        skipped > 0
          ? 'All files were skipped (possibly directories). Use the "Select Folder" button or drag the model folder here.'
          : 'No YAML or CSV files found in the selection.'
      );
      setStatus('error');
      return;
    }
    addLog('Loaded ' + (filesMap.size / 2) + ' YAML/CSV files');
    await runParse(filesMap);
  }, [addLog, runParse]);

  // ── server template mode ──────────────────────────────────────────────────
  const loadServerTemplate = useCallback(async (tpl) => {
    setLoadingTpl(tpl.id);
    setStatus('parsing');
    setParseLog([]);
    try {
      const filesMap = new Map();

      const fetchFile = async (templateRelPath, storeAs) => {
        const resp = await fetchTemplate(templateRelPath);
        if (!resp.ok) return false;
        const text = await resp.text();
        if (storeAs) filesMap.set(storeAs, text);
        filesMap.set(templateRelPath.split('/').pop(), text);
        // also store relative to basePath for import: resolution
        const subPath = templateRelPath.replace(tpl.basePath + '/', '');
        if (subPath !== storeAs) filesMap.set(subPath, text);
        return text;
      };

      // Recursively fetch all YAML files referenced via `import:` in the model,
      // starting from the root. This handles models with arbitrary directory structures
      // without needing to enumerate every file in the template definition.
      const fetchedPaths = new Set();
      const fetchYamlRecursive = async (relPathFromBase) => {
        if (fetchedPaths.has(relPathFromBase)) return;
        fetchedPaths.add(relPathFromBase);
        const fullPath = tpl.basePath + '/' + relPathFromBase;
        const text = await fetchFile(fullPath, relPathFromBase);
        if (!text) { addLog('⚠ Import not found on server: ' + relPathFromBase); return; }
        try {
          const parsed = jsyaml.load(text, { schema: jsyaml.DEFAULT_SCHEMA }) || {};
          for (const imp of (parsed.import || [])) {
            // import paths in Calliope are always relative to the model root
            if (!fetchedPaths.has(imp)) await fetchYamlRecursive(imp);
          }
        } catch (_) { /* ignore parse errors during pre-fetch */ }
      };

      addLog('Fetching ' + tpl.rootYaml);
      // Determine the root yaml path relative to basePath
      const rootRelPath = tpl.rootYaml.replace(tpl.basePath + '/', '');
      await fetchYamlRecursive(rootRelPath);
      if (!filesMap.has(rootRelPath) && !filesMap.has('model.yaml')) {
        throw new Error('Cannot fetch ' + tpl.rootYaml);
      }
      // Ensure the root is also accessible as 'model.yaml'
      const rootContent = filesMap.get(rootRelPath);
      if (rootContent && !filesMap.has('model.yaml')) filesMap.set('model.yaml', rootContent);

      // Also fetch any explicitly listed imports (legacy / extra files)
      for (const imp of (tpl.imports || [])) {
        if (!fetchedPaths.has(imp)) {
          addLog('Fetching ' + imp);
          await fetchFile(tpl.basePath + '/' + imp, imp);
        }
      }

      for (const csv of (tpl.csvFiles || [])) {
        const csvOk = await fetchFile(tpl.basePath + '/' + csv, csv.split('/').pop());
        if (csvOk) addLog('Fetched CSV: ' + csv.split('/').pop());
      }

      // Auto-discover and fetch any 'file=xxx.csv' references found across all
      // fetched YAML content (handles cost timeseries like export_price.csv that
      // are not listed in tpl.csvFiles and not reachable via YAML import: chains).
      const allCsvRefs = new Set();
      for (const [, yamlText] of filesMap) {
        if (!yamlText || typeof yamlText !== 'string' || !yamlText.includes('file=')) continue;
        for (const m of yamlText.matchAll(/file=([^\s:'"]+\.csv)/gi)) {
          allCsvRefs.add(m[1]);
        }
      }
      for (const ref of allCsvRefs) {
        if (filesMap.has(ref)) continue; // already loaded
        // Try tsPath (timeseries_data subdirs) first, then basePath root
        const tryPaths = [
          tpl.basePath + '/timeseries_data/DMUU/' + ref,
          tpl.basePath + '/timeseries_data/' + ref,
          tpl.basePath + '/data/' + ref,
          tpl.basePath + '/' + ref,
        ];
        let fetched = false;
        for (const p of tryPaths) {
          const ok = await fetchFile(p, ref);
          if (ok) { addLog('Auto-fetched CSV: ' + ref); fetched = true; break; }
        }
        if (!fetched) addLog('⚠ CSV not on server: ' + ref + ' (safety net will handle it)');
      }

      await runParse(filesMap);
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatus('error');
    } finally {
      setLoadingTpl(null);
    }
  }, [addLog, runParse]);

  // ── drag/drop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploadMode === 'zip') {
      const zip = [...e.dataTransfer.files].find(f => f.name.endsWith('.zip'));
      if (zip) { handleZIP(zip); return; }
      setErrorMsg('Please drop a .zip file.'); setStatus('error'); return;
    }
    const items = e.dataTransfer.items;
    if (items && [...items].some(i => i.webkitGetAsEntry?.()?.isDirectory)) {
      addLog('Expanding folder…');
      const files = await getFilesFromDataTransfer(e.dataTransfer);
      handleFileList(files);
    } else {
      handleFileList([...e.dataTransfer.files]);
    }
  }, [uploadMode, handleZIP, handleFileList, addLog]);

  // ── confirm import ────────────────────────────────────────────────────────
  const doImport = () => {
    if (!preview) return;
    const name = (modelName.trim() || preview.modelName).trim() || 'Calliope Model';
    onImport(
      name,
      preview.locations,
      preview.links,
      [],
      preview.technologies,
      preview.timeSeries,
      {
        source: 'calliope_yaml',
        runConfig: preview.runConfig,
        subsetTime: preview.subsetTime,
        description: 'Imported: ' + name,
        // 0.7 archives run on the 0.7 engine; absent for 0.6 imports
        ...(preview.calliopeVersion ? { modelConfig: { calliopeVersion: preview.calliopeVersion } } : {}),
      },
      preview.overrides,
      preview.scenarios,
    );
    setStatus('done');
  };

  // ─── sub-components ───────────────────────────────────────────────────────

  const StatBadge = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <Icon size={14} className="text-gray-400" />
      <span className="text-sm font-bold text-gray-700">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );

  const DropZone = () => (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={'border-2 border-dashed rounded-lg p-6 text-center transition-all ' +
        (dragOver ? 'border-gray-400 bg-gray-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50')}
    >
      <FiUploadCloud size={24} className="mx-auto text-gray-400 mb-2" />
      {uploadMode === 'zip' ? (
        <>
          <p className="text-slate-700 font-medium text-sm mb-1">Drop a .zip file here</p>
          <p className="text-slate-400 text-xs mb-3">or click to browse</p>
          <button onClick={() => zipRef.current?.click()}
            className="px-3 py-1.5 bg-gray-700 text-white rounded-md text-xs font-medium hover:bg-gray-800 transition-colors">
            Select ZIP
          </button>
          <input ref={zipRef} type="file" accept=".zip" className="hidden"
            onChange={e => e.target.files[0] && handleZIP(e.target.files[0])} />
        </>
      ) : (
        <>
          <p className="text-slate-700 font-medium text-sm mb-1">Drop the model folder or files here</p>
          <p className="text-slate-400 text-xs mb-3">or use the buttons below</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => folderRef.current?.click()}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-md text-xs font-medium hover:bg-gray-800 transition-colors flex items-center gap-1.5">
              <FiFolder size={12} /> Select Folder
            </button>
            <button onClick={() => filesRef.current?.click()}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-300 transition-colors flex items-center gap-1.5">
              <FiUploadCloud size={12} /> Select Files
            </button>
          </div>
          <input ref={folderRef} type="file" className="hidden"
            {...{ webkitdirectory: 'true', mozdirectory: 'true' }}
            onChange={e => handleFileList([...e.target.files])} />
          <input ref={filesRef} type="file" multiple accept=".yaml,.yml,.csv" className="hidden"
            onChange={e => handleFileList([...e.target.files])} />
          <p className="text-xs text-slate-400 mt-2">
            Subdirectories are expanded automatically when using Select Folder or dragging the folder.
          </p>
        </>
      )}
    </div>
  );

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiPackage size={15} className="text-gray-500" />
          <span className="font-semibold text-sm text-gray-800">Import Calliope YAML</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <FiX size={15} />
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">

        {status === 'idle' && (
          <>
            {/* Mode tabs */}
            <div className="flex gap-1.5 bg-gray-100 rounded-lg p-1">
              {[
                { id: 'server', icon: FiServer,      label: 'Built-in Templates' },
                { id: 'zip',    icon: FiPackage,     label: 'ZIP Archive'        },
                { id: 'files',  icon: FiUploadCloud, label: 'Files / Folder'     },
              ].map(({ id, icon: Icon, label }) => (
                <button key={id} onClick={() => setUploadMode(id)}
                  className={'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ' +
                    (uploadMode === id ? 'bg-white shadow text-gray-700' : 'text-gray-500 hover:text-gray-700')}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            {uploadMode === 'server' && (
              <div className="space-y-3">
                {SERVER_TEMPLATES.map(tpl => {
                  const available = tplAvailable[tpl.id] !== false; // default true while checking
                  const checking  = !(tpl.id in tplAvailable);
                  return (
                  <div key={tpl.id} className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${available ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-gray-50 opacity-50'}`}>
                    <span className="text-xl flex-shrink-0">{tpl.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-tight ${available ? 'text-gray-800' : 'text-gray-500'}`}>{tpl.name}</p>
                      <p className={`text-xs truncate mt-0.5 ${available ? 'text-gray-500' : 'text-gray-400'}`}>{tpl.description}</p>
                      {!available && !checking && (
                        <p className="text-xs text-gray-500 mt-0.5">Not available in public/templates/</p>
                      )}
                    </div>
                    <button
                      onClick={() => loadServerTemplate(tpl)}
                      disabled={loadingTpl !== null || !available || checking}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 flex-shrink-0 ${available && !checking ? 'bg-gray-700 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-wait' : 'bg-gray-300 cursor-not-allowed text-gray-500'}`}
                    >
                      {loadingTpl === tpl.id && <FiRefreshCw size={11} className="animate-spin" />}
                      {checking ? '…' : loadingTpl === tpl.id ? 'Loading…' : available ? 'Load' : 'Unavailable'}
                    </button>
                  </div>
                  );
                })}
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3 text-center text-xs text-gray-400">
                  Add templates by placing YAML models in <code className="bg-white border border-gray-200 px-1 rounded">public/templates/</code>
                </div>
              </div>
            )}

            {uploadMode === 'zip' && (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex gap-2 text-xs text-gray-600">
                  <FiInfo size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
                  <span>Upload a <strong>.zip</strong> of the model folder — <code className="bg-white border border-gray-200 px-1 rounded">import:</code> chains are resolved automatically from files inside the archive.</span>
                </div>
                <DropZone />
              </>
            )}

            {uploadMode === 'files' && (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex gap-2 text-xs text-gray-600">
                  <FiInfo size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
                  <span>Use <strong>Select Folder</strong> (or drag the folder) to load the whole model directory including <code className="bg-white border border-gray-200 px-1 rounded">model_config/</code> and <code className="bg-white border border-gray-200 px-1 rounded">timeseries_data/</code>.</span>
                </div>
                <DropZone />
              </>
            )}
          </>
        )}

        {/* Parsing spinner */}
        {status === 'parsing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <FiRefreshCw size={22} className="text-gray-500 animate-spin" />
            <p className="text-slate-600 text-sm font-medium">Parsing model…</p>
            <div className="w-full max-h-40 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 space-y-0.5">
              {parseLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex gap-3">
              <FiAlertTriangle size={20} className="text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-700 mb-1">Import failed</p>
                <pre className="text-gray-600 text-sm whitespace-pre-wrap">{errorMsg}</pre>
              </div>
            </div>
            {parseLog.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-36 overflow-y-auto space-y-0.5">
                {parseLog.map((l, i) => <div key={i} className={l.startsWith('⚠') ? 'text-yellow-400' : ''}>{l}</div>)}
              </div>
            )}
            <button onClick={reset}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
              <FiRefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {/* Preview */}
        {status === 'preview' && preview && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Model Name</label>
              <input value={modelName} onChange={e => setModelName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBadge icon={FiMap}      label="Locations"    value={preview.locations.length}    color="blue"   />
              <StatBadge icon={FiActivity} label="Links"        value={preview.links.length}        color="green"  />
              <StatBadge icon={FiZap}      label="Technologies" value={preview.technologies.length} color="yellow" />
              <StatBadge icon={FiDatabase} label="Timeseries"   value={preview.timeSeries.length}   color="purple" />
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs flex flex-wrap gap-2">
              <span className="bg-white border border-slate-200 rounded px-2 py-1">Solver: <strong>{preview.runConfig.solver}</strong></span>
              <span className="bg-white border border-slate-200 rounded px-2 py-1">Mode: <strong>{preview.runConfig.mode}</strong></span>
              {preview.subsetTime && (
                <span className="bg-white border border-slate-200 rounded px-2 py-1">
                  Subset: <strong>{Array.isArray(preview.subsetTime) ? preview.subsetTime.join(' → ') : preview.subsetTime}</strong>
                </span>
              )}
            </div>

            {preview.technologies.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Technologies ({preview.technologies.length})</p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {preview.technologies.map(t => (
                    <span key={t.name}
                      className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.essentials.color }} />
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button onClick={() => setShowLog(v => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
                {showLog ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
                {showLog ? 'Hide' : 'Show'} parse log ({parseLog.length} entries)
              </button>
              {showLog && (
                <div className="mt-2 bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 max-h-44 overflow-y-auto space-y-0.5">
                  {parseLog.map((l, i) => <div key={i} className={l.startsWith('⚠') ? 'text-yellow-400' : ''}>{l}</div>)}
                </div>
              )}
            </div>

            {parseLog.some(l => l.includes('⚠ Timeseries CSV')) && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex gap-2 text-sm text-gray-800">
                <FiAlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-gray-500" />
                <span>Some timeseries CSV files were not found. The model imports without them — you can add them later in the TimeSeries section.</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={doImport}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2">
                <FiCheckCircle size={14} /> Import Model
              </button>
              <button onClick={reset}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {status === 'done' && (
          <div className="flex flex-col items-center gap-2 py-5">
            <FiCheckCircle size={32} className="text-gray-500" />
            <p className="font-semibold text-slate-800">Model Imported!</p>
            <p className="text-slate-500 text-xs text-center">
              <strong>{modelName}</strong> is ready. Open <strong>Map</strong> or <strong>Locations</strong> to explore it.
            </p>
            {onClose && (
              <button onClick={onClose}
                className="mt-1 px-4 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-md font-medium text-sm">
                Close
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
