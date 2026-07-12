import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import Notification from '../components/Notification';
import { TECH_TEMPLATES } from '../components/TechnologiesData';
import { api } from '../services/api';

// Convert TECH_TEMPLATES to flat array of technologies
const getDefaultTechnologies = () => {
  const defaultTechs = [];
  Object.values(TECH_TEMPLATES).forEach(categoryTechs => {
    if (Array.isArray(categoryTechs)) {
      defaultTechs.push(...categoryTechs);
    }
  });
  return defaultTechs;
};

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};

// ─── LocalStorage utilities (fallback when backend is unavailable) ─────────
const LS_KEY = 'calliopeModels';

function saveToLocalStorage(models) {
  try {
    const toSave = models.map(prepareModelForLocalStorage);
    localStorage.setItem(LS_KEY, JSON.stringify(toSave));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded. Clearing old data...');
      localStorage.removeItem(LS_KEY);
    }
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(m => ({ ...m, timeSeries: m.timeSeries || [] }));
    }
  } catch (e) {
    console.error('Error loading from localStorage:', e);
    localStorage.removeItem(LS_KEY);
  }
  return [];
}

// Strip runtime-only large fields from location objects before persisting.
// demandProfile / resourcePV / resourceWind contain full timeseries arrays
// (up to 8760 values × thousands of locations) that balloon payloads to ~88 MB.
// The Python runner and the TimeSeries editor re-read these from template CSV files.
function stripHeavyLocationFields(loc) {
  const { demandProfile, resourcePV, resourceWind, hasDemand, totalDemandMWh, ...rest } = loc;
  return rest;
}

// For localStorage (quota ~5-10 MB): strip timeSeries CSV data to avoid QuotaExceededError.
function prepareModelForLocalStorage(model) {
  return {
    ...model,
    timeSeries: [],
    locations: (model.locations || []).map(stripHeavyLocationFields),
  };
}

// For the Go backend (local SQLite, no quota): keep timeSeries so they survive a page refresh.
// Only strip the per-location demand/resource arrays that can reach 88 MB, and strip
// timeSeries[].data (parsed row objects) — csvContent (raw string) is kept instead and
// is ~3-4× smaller. data is re-parsed from csvContent on load via restoreTimeSeries().
function prepareModelForBackend(model) {
  return {
    ...model,
    locations: (model.locations || []).map(stripHeavyLocationFields),
    timeSeries: (model.timeSeries || []).map(({ data: _data, ...ts }) => ts),
  };
}

// Re-parse csvContent back into the derived fields (data, columns, etc.) that were
// stripped before saving. Called by normaliseModel when loading from the backend.
function restoreTimeSeries(ts) {
  if (!ts.csvContent || ts.data) return ts;
  try {
    const parsed   = Papa.parse(ts.csvContent, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const rawCols  = parsed.meta.fields || [];
    const allCols  = rawCols.map((c, i) => (i === 0 && c === '') ? 'time' : c);
    const rowData  = (rawCols[0] === '')
      ? parsed.data.map(row => { const { '': dateVal, ...rest } = row; return { time: dateVal, ...rest }; })
      : parsed.data;
    const dateCol  = allCols[0] || 'time';
    const dataCols = allCols.slice(1);
    const statistics = {};
    dataCols.forEach(col => {
      const vals = rowData.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (vals.length > 0) {
        statistics[col] = {
          min:  vals.reduce((a, b) => a < b ? a : b),
          max:  vals.reduce((a, b) => a > b ? a : b),
          mean: vals.reduce((a, b) => a + b, 0) / vals.length,
          sum:  vals.reduce((a, b) => a + b, 0),
        };
      }
    });
    return { ...ts, data: rowData, columns: allCols, dateColumn: dateCol, dataColumns: dataCols, rowCount: rowData.length, statistics };
  } catch (e) {
    console.warn('[restoreTimeSeries] Failed to re-parse csvContent for', ts.fileName, '—', e?.message);
    return ts; // return without data rather than crashing model load
  }
}

// ─── Provider ──────────────────────────────────────────────────────────────
export const DataProvider = ({ children }) => {
  const [models, setModels] = useState([]);
  const [currentModelId, setCurrentModelId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [links, setLinks] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [technologies, setTechnologies] = useState(getDefaultTechnologies());
  const [timeSeries, setTimeSeries] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [scenarios, setScenarios] = useState({});
  const [notification, setNotification] = useState(null);
  const [navigationWarning, setNavigationWarning] = useState(null);
  const [backendAvailable, setBackendAvailable] = useState(false);

  // ── Unsaved-changes tracking ───────────────────────────────────────────────
  // `isDirty` is true whenever model state has changed since the last explicit
  // save or model load.  It is set automatically by a useEffect watching the
  // six mutable slices, and cleared by the debounced auto-save or an explicit
  // save triggered by the user.
  const [isDirty, setIsDirty] = useState(false);
  // Timestamp-based suppress window: after applyModelToState we ignore effect
  // firings for 200 ms so React StrictMode's double-invocation does not falsely
  // mark a freshly-loaded model as dirty. 200 ms is long enough to absorb both
  // strict-mode runs (synchronous), but no real user edit can happen that fast.
  const suppressDirtyUntilRef = useRef(0);

  // OSM Infrastructure data and region selection (persisted across navigation)
  const [osmSubstations, setOsmSubstations] = useState(null);
  const [osmPowerPlants, setOsmPowerPlants] = useState(null);
  const [osmPowerLines, setOsmPowerLines] = useState(null);
  const [osmCommunes, setOsmCommunes] = useState(null);
  const [osmDistricts, setOsmDistricts] = useState(null);
  const [osmRegionPath, setOsmRegionPath] = useState(null);
  const [selectedRegionBoundary, setSelectedRegionBoundary] = useState(null);
  const [selectedRegionInfo, setSelectedRegionInfo] = useState(null);
  const [currentBbox, setCurrentBbox] = useState(null);
  
  // Region selection state (persisted across navigation)
  const [selectedContinent, setSelectedContinent] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedSubregion, setSelectedSubregion] = useState(null);
  const [selectedCommune, setSelectedCommune] = useState(null);
  
  // Generated mesh data (persisted across navigation)
  const [generatedMesh, setGeneratedMesh] = useState(null);
  const [meshVisible, setMeshVisible] = useState(false);

  // Which completed job the Results view should open (set from Run section)
  const [activeResultJobId, setActiveResultJobId] = useState(null);

  // Completed Calliope jobs – shared between Run and Results views
  const [completedJobs, setCompletedJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('calliopeCompletedJobs');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  // Track whether we have loaded from DB (avoid double-load in StrictMode)
  const completedJobsLoadedRef = useRef(false);

  // Tracks model IDs whose initial POST to the backend is still in-flight.
  // updateCurrentModel must not PUT until the real DB id is confirmed.
  const pendingSaveIds = useRef(new Set());
  // Tracks model IDs that have been confirmed in the backend DB.
  // Only these IDs should trigger PUT requests.
  const confirmedBackendIds = useRef(new Set());
  // Tracks model IDs for which a PUT is currently in-flight.
  // Prevents overlapping PUTs for the same model when debounce fires quickly.
  const activePutIds = useRef(new Set());
  // Set synchronously (pre-render) in createModel so the mount effect's
  // applyModelToState guard works even before React has flushed the batch.
  const userCreatedModelRef = useRef(false);

  // Ref keeps latest state accessible inside debounced / async callbacks
  // without causing extra re-renders or stale closure issues.
  const stateRef = useRef({});
  stateRef.current = {
    models, currentModelId,
    locations, links, parameters, technologies, timeSeries, overrides, scenarios,
    backendAvailable,
  };

  const showNotification = (text, type = 'info') => {
    setNotification({ id: Date.now(), text, type });
  };
  const removeNotif = () => setNotification(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Also seed confirmedBackendIds when loading from backend on mount so that
  // models loaded from the DB can be updated immediately.
  const applyModelToState = (model) => {
    // Open a 200 ms window during which the dirty-tracking effect will not fire.
    // This absorbs both React StrictMode double-invocations and any normal first
    // flush that would otherwise falsely mark a freshly-loaded model as dirty.
    suppressDirtyUntilRef.current = Date.now() + 200;
    setCurrentModelId(model.id);
    setLocations(model.locations || []);
    setLinks(model.links || []);
    setParameters(model.parameters || []);
    setTechnologies(model.technologies?.length ? model.technologies : getDefaultTechnologies());
    // Restore csvContent → data for the active model only (normaliseModel skips this
    // to avoid blocking the renderer while processing the full model list).
    // Also backfill modelId for legacy entries that were saved without it.
    setTimeSeries((model.timeSeries || []).map(ts => {
      const restored = restoreTimeSeries(ts);
      return restored.modelId ? restored : { ...restored, modelId: model.id };
    }));
    setOverrides(model.overrides || {});
    setScenarios(model.scenarios || {});
    setIsDirty(false);
  };

  const normaliseModel = (m) => ({
    ...m,
    modelType: m.modelType || 'calliope',
    locations: m.locations || [],
    links: m.links || [],
    parameters: m.parameters || [],
    technologies: m.technologies || [],
    timeSeries: m.timeSeries || [],
    overrides: m.overrides || {},
    scenarios: m.scenarios || {},
    locationTechAssignments: m.locationTechAssignments || {},
    metadata: m.metadata || {},
  });

  // ── On mount: check backend, then load models ─────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      const healthy = await api.checkHealth();
      if (!mounted) return;
      setBackendAvailable(healthy);

      if (healthy) {
        try {
          const remoteModels = await api.getModels();
          if (!mounted) return;
          const normalised = (remoteModels || []).map(normaliseModel);
          // All models fetched from the DB are already confirmed
          normalised.forEach(m => confirmedBackendIds.current.add(m.id));

          // Guard: if createModel fired while we were awaiting getModels(),
          // don't overwrite the user's active session. We use a plain ref
          // (not stateRef) because stateRef is only updated at render time —
          // the batch from createModel may not have flushed yet.
          const userAlreadyActive = userCreatedModelRef.current;

          if (normalised.length > 0) {
            // Recover models whose POST failed and were only saved to localStorage.
            // tempIds are 13-digit timestamps; real backend IDs are small integers.
            const local = loadFromLocalStorage();
            const backendIdSet = new Set(normalised.map(m => String(m.id)));
            const orphans = local.filter(
              m => !backendIdSet.has(String(m.id)) && String(m.id).length >= 13
            );
            const allModels = orphans.length > 0 ? [...normalised, ...orphans] : normalised;

            if (userAlreadyActive) {
              // Merge backend models into state without disturbing the active model
              setModels(prev => {
                const existingIds = new Set(prev.map(m => String(m.id)));
                const toAdd = allModels.filter(m => !existingIds.has(String(m.id)));
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
              });
            } else {
              setModels(allModels);
              applyModelToState(allModels[0]);
            }

            // Try to re-save orphans to backend now that it's available
            orphans.forEach(orphan => {
              api.saveModel(prepareModelForBackend(orphan))
                .then(result => {
                  const finalId = result?.id ?? orphan.id;
                  if (finalId && String(finalId) !== String(orphan.id) && mounted) {
                    confirmedBackendIds.current.add(finalId);
                    setModels(prev => prev.map(m => m.id === orphan.id ? { ...m, id: finalId } : m));
                    setCurrentModelId(prev => prev === orphan.id ? finalId : prev);
                  }
                })
                .catch(() => {});
            });
          } else {
            // Backend is healthy but has no models — a previous save may have failed.
            // Fall back to localStorage so the user doesn't lose their work.
            const local = loadFromLocalStorage();
            if (mounted && local.length > 0 && !userAlreadyActive) {
              setModels(local);
              applyModelToState(local[0]);
            }
          }
          // Load completed runs from backend (once)
          if (!completedJobsLoadedRef.current) {
            completedJobsLoadedRef.current = true;
            try {
              const remoteRuns = await api.getCompletedRuns();
              if (mounted && Array.isArray(remoteRuns) && remoteRuns.length > 0) {
                setCompletedJobs(remoteRuns);
              }
            } catch (e) {
              console.warn('Could not load completed runs from backend:', e);
            }
          }
        } catch (e) {
          console.error('Failed to load models from backend:', e);
          showNotification('Could not load models from database.', 'error');
          // Try localStorage as a last resort
          const local = loadFromLocalStorage();
          if (mounted && local.length > 0) {
            setModels(local);
            applyModelToState(local[0]);
          }
        }
      } else {
        // Fallback: localStorage
        const local = loadFromLocalStorage();
        if (!mounted) return;
        setModels(local);
        if (local.length > 0) applyModelToState(local[0]);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Always mirror models to localStorage as a safety net ─────────────────
  // This ensures models survive a page refresh even when the backend save fails.
  // prepareModelForLocalStorage strips timeSeries so quota is never exceeded.
  useEffect(() => {
    if (models.length > 0) {
      saveToLocalStorage(models);
    }
  }, [models]);

  // ── createModel ───────────────────────────────────────────────────────────
  // Synchronous (optimistic): model is added to state immediately with a
  // temporary ID.  If the backend is available the real DB id is swapped in
  // once the POST completes, so callers never need to await this function.
  const createModel = (
    name,
    locationsData,
    linksData,
    parametersData,
    technologiesData = [],
    timeSeriesData = [],
    templateMetadata = {},
    overridesData = {},
    scenariosData = {}
  ) => {
    import.meta.env.DEV && console.log('DataContext.createModel called with:', {
      name,
      locationsCount: locationsData?.length,
      linksCount: linksData?.length,
      technologiesCount: technologiesData?.length,
    });

    // Mark synchronously (pre-render) so the mount effect guard works even
    // before React has flushed this batch to stateRef.
    userCreatedModelRef.current = true;

    const tempId = Date.now().toString();
    const newModel = {
      id: tempId,
      modelType: templateMetadata.modelType || 'calliope',
      name: name || `Model ${stateRef.current.models.length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locations: locationsData || [],
      links: linksData || [],
      parameters: parametersData || [],
      technologies: technologiesData || [],
      timeSeries: (timeSeriesData || []).map(ts => ({
        ...ts,
        modelId: ts.modelId || tempId,
        modelName: ts.modelName || name,
      })),
      overrides: overridesData || {},
      scenarios: scenariosData || {},
      metadata: {
        description: templateMetadata.description || '',
        country: templateMetadata.country || '',
        template: templateMetadata.template || false,
        ...templateMetadata,
      },
      locationTechAssignments: {},
    };

    // ── Optimistic state update ──────────────────────────────────────────────
    setModels(prev => [...prev, newModel]);
    setCurrentModelId(tempId);
    setLocations(newModel.locations);
    setLinks(newModel.links);
    setParameters(newModel.parameters);
    setTechnologies(newModel.technologies);
    setTimeSeries(newModel.timeSeries);
    setOverrides(newModel.overrides);
    setScenarios(newModel.scenarios);

    import.meta.env.DEV && console.log('[TEMPO] createModel: timeSeries count=', newModel.timeSeries.length, newModel.timeSeries.map(ts => ({id: ts.id, hasCsvContent: !!ts.csvContent, csvLen: ts.csvContent?.length})));

    // ── Async backend persist ────────────────────────────────────────────────
    if (stateRef.current.backendAvailable) {
      // Pre-validate that the payload can be serialized before sending.
      let payload;
      const modelForBackend = prepareModelForBackend(newModel);

      try {
        payload = JSON.stringify(modelForBackend);
      } catch (serError) {
        console.error('Model contains non-serializable data, skipping backend save:', serError);
        showNotification('Model saved locally (serialization error).', 'warning');
        return tempId;
      }
      import.meta.env.DEV && console.log(`Saving model to backend, payload size: ${(payload.length / 1024).toFixed(1)} KB`);

      pendingSaveIds.current.add(tempId);
      api.saveModel(modelForBackend)
        .then(result => {
          const finalId = result?.id ?? tempId;
          pendingSaveIds.current.delete(tempId);
          confirmedBackendIds.current.add(finalId);
          if (finalId && finalId !== tempId) {
            // Swap tempId → real DB id without disrupting the current session
            setModels(prev =>
              prev.map(m => m.id === tempId ? { ...m, id: finalId } : m)
            );
            setCurrentModelId(prev => prev === tempId ? finalId : prev);
            // Keep timeSeries modelId in sync so they remain visible after the ID swap
            setTimeSeries(prev =>
              prev.map(ts => ts.modelId === tempId ? { ...ts, modelId: finalId } : ts)
            );
            import.meta.env.DEV && console.log('Model id updated to backend id:', finalId);
          }
        })
        .catch(e => {
          pendingSaveIds.current.delete(tempId);
          console.error('Failed to save model to backend, using local fallback:', e);
          showNotification('Model saved locally (backend save failed).', 'warning');
          // Actually persist to localStorage so the model survives a page refresh.
          // stateRef.current.models already has the optimistic model entry.
          saveToLocalStorage(stateRef.current.models);
        });
    }

    return tempId;
  };

  // ── loadModel ─────────────────────────────────────────────────────────────
  const loadModel = (modelId) => {
    const model = stateRef.current.models.find(m => m.id === modelId);
    if (model) applyModelToState(model);
  };

  // ── updateCurrentModel ────────────────────────────────────────────────────
  const updateCurrentModel = useCallback(() => {
    const {
      currentModelId, locations, links, parameters,
      technologies, timeSeries, overrides, scenarios, backendAvailable,
    } = stateRef.current;
    if (!currentModelId) return;

    setModels(prev => {
      const updated = prev.map(model =>
        model.id === currentModelId
          ? {
              ...model, locations, links, parameters, technologies,
              timeSeries, overrides, scenarios,
              updatedAt: new Date().toISOString(),
            }
          : model
      );

      // Only fire PUT if:
      // 1. This ID is NOT still being POSTed (in-flight check)
      // 2. The ID was confirmed by a successful POST (we have a real DB id)
      // 3. No PUT is already in-flight for this model
      const isPending = pendingSaveIds.current.has(currentModelId);
      const isConfirmed = confirmedBackendIds.current.has(currentModelId);
      const isActivePut = activePutIds.current.has(currentModelId);

      if (backendAvailable && !isPending && isConfirmed && !isActivePut) {
        const updatedModel = updated.find(m => m.id === currentModelId);
        if (updatedModel) {
          activePutIds.current.add(currentModelId);
          api.updateModel(currentModelId, prepareModelForBackend(updatedModel))
            .catch(e => {
              console.error('Failed to sync model to backend:', e);
              saveToLocalStorage(stateRef.current.models);
            })
            .finally(() => activePutIds.current.delete(currentModelId));
        }
      }

      return updated;
    });
  }, []); // stable – reads via stateRef

  // ── deleteModel ───────────────────────────────────────────────────────────
  const deleteModel = (modelId) => {
    // Optimistic: update UI immediately
    setModels(prev => prev.filter(m => m.id !== modelId));    confirmedBackendIds.current.delete(modelId);
    pendingSaveIds.current.delete(modelId);
    if (stateRef.current.currentModelId === modelId) {
      setCurrentModelId(null);
      setLocations([]);
      setLinks([]);
      setParameters([]);
      setTechnologies([]);
      setTimeSeries([]);
      setOverrides({});
      setScenarios({});
    }

    // Fire-and-forget backend delete
    if (stateRef.current.backendAvailable) {
      api.deleteModel(modelId)
        .catch(e => console.error('Failed to delete model from backend:', e));
    }
  };

  // ── renameModel ───────────────────────────────────────────────────────────
  const renameModel = (modelId, newName) => {
    setModels(prev =>
      prev.map(model =>
        model.id === modelId
          ? { ...model, name: newName, updatedAt: new Date().toISOString() }
          : model
      )
    );

    if (stateRef.current.backendAvailable) {
      const model = stateRef.current.models.find(m => m.id === modelId);
      if (model && confirmedBackendIds.current.has(modelId)) {
        api.updateModel(modelId, prepareModelForBackend({ ...model, name: newName }))
          .catch(e => console.error('Failed to rename model in backend:', e));
      }
    }
  };

  const getCurrentModel = () =>
    stateRef.current.models.find(m => m.id === stateRef.current.currentModelId);

  // Explicit user-triggered save: persist immediately and clear dirty flag.
  const saveNow = useCallback(() => {
    updateCurrentModel();
    setIsDirty(false);
  }, [updateCurrentModel]);

  const clearData = () => {
    suppressDirtyUntilRef.current = Date.now() + 200;
    setIsDirty(false);
    setCurrentModelId(null);
    setLocations([]);
    setLinks([]);
    setParameters([]);
    setTechnologies([]);
    setTimeSeries([]);
    setOverrides({});
    setScenarios({});
    // Clear OSM data and region selection
    setOsmSubstations(null);
    setOsmPowerPlants(null);
    setOsmPowerLines(null);
    setOsmCommunes(null);
    setOsmDistricts(null);
    setOsmRegionPath(null);
    setSelectedRegionBoundary(null);
    setSelectedRegionInfo(null);
    setCurrentBbox(null);
    // Clear region selection
    setSelectedContinent(null);
    setSelectedCountry(null);
    setSelectedRegion(null);
    setSelectedSubregion(null);
    setSelectedCommune(null);
    // Clear mesh generation
    setGeneratedMesh(null);
    setMeshVisible(false);
  };

  // ── Mark dirty whenever any model slice changes ───────────────────────────
  // Skip changes that occur within 200 ms of a model load so that React
  // StrictMode's double-invocation of effects doesn't falsely mark a freshly
  // loaded model as dirty.
  useEffect(() => {
    if (!currentModelId) return;
    if (Date.now() <= suppressDirtyUntilRef.current) {
      setIsDirty(false); // actively clear any prior false-dirty set by previous run
      return;
    }
    setIsDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, links, parameters, technologies, timeSeries, overrides, scenarios]);

  // ── Debounced auto-save ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentModelId) return;
    const hasData =
      locations.length > 0 || links.length > 0 || parameters.length > 0 ||
      technologies.length > 0 || timeSeries.length > 0 ||
      Object.keys(overrides).length > 0 || Object.keys(scenarios).length > 0;
    if (!hasData) return;

    const timeout = setTimeout(() => {
      updateCurrentModel();
      setIsDirty(false);   // optimistically clear; data is already in local state
    }, 1500);
    return () => clearTimeout(timeout);
  }, [locations, links, parameters, technologies, timeSeries, overrides, scenarios, currentModelId, updateCurrentModel]);

  // ── Context value ─────────────────────────────────────────────────────────

  // Persist completed jobs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('calliopeCompletedJobs', JSON.stringify(completedJobs));
    } catch {}
  }, [completedJobs]);

  const addCompletedJob = (job) => {
    setCompletedJobs(prev => {
      // Deduplicate by id — prevents double entries from StrictMode or duplicate events
      if (prev.some(j => j.id === job.id)) return prev;
      const next = [job, ...prev].slice(0, 100);
      // Persist to backend (fire-and-forget)
      if (stateRef.current.backendAvailable) {
        api.saveCompletedRun(job).catch(e => console.warn('Failed to persist completed run:', e));
      }
      return next;
    });
  };

  const removeCompletedJob = (jobId) => {
    setCompletedJobs(prev => prev.filter(j => j.id !== jobId));
    if (stateRef.current.backendAvailable) {
      api.deleteCompletedRun(jobId).catch(e => console.warn('Failed to delete completed run:', e));
    }
  };

  const value = {
    models,
    currentModelId,
    backendAvailable,
    isDirty,
    saveNow,
    locations, setLocations,
    links, setLinks,
    parameters, setParameters,
    technologies, setTechnologies,
    timeSeries, setTimeSeries,
    overrides, setOverrides,
    scenarios, setScenarios,
    createModel,
    loadModel,
    updateCurrentModel,
    deleteModel,
    renameModel,
    getCurrentModel,
    clearData,
    showNotification,
    setModels,
    navigationWarning,
    setNavigationWarning,
    completedJobs,
    addCompletedJob,
    removeCompletedJob,
    activeResultJobId,
    setActiveResultJobId,
    // OSM data and region selection
    osmSubstations, setOsmSubstations,
    osmPowerPlants, setOsmPowerPlants,
    osmPowerLines, setOsmPowerLines,
    osmCommunes, setOsmCommunes,
    osmDistricts, setOsmDistricts,
    osmRegionPath, setOsmRegionPath,
    selectedRegionBoundary, setSelectedRegionBoundary,
    selectedRegionInfo, setSelectedRegionInfo,
    currentBbox, setCurrentBbox,
    // Region selection (continent, country, region, subregion)
    selectedContinent, setSelectedContinent,
    selectedCountry, setSelectedCountry,
    selectedRegion, setSelectedRegion,
    selectedSubregion, setSelectedSubregion,
    selectedCommune, setSelectedCommune,
    // Mesh generation
    generatedMesh, setGeneratedMesh,
    meshVisible, setMeshVisible,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {notification && (
          <Notification
            key={notification.id}
            id={notification.id}
            text={notification.text}
            type={notification.type}
            removeNotif={removeNotif}
          />
        )}
      </AnimatePresence>
    </DataContext.Provider>
  );
};
