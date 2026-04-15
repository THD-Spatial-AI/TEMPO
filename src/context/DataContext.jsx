import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
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
    const toSave = models.map(prepareModelForBackend);
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

function prepareModelForBackend(model) {
  return {
    ...model,
    timeSeries: [],
    locations: (model.locations || []).map(stripHeavyLocationFields),
  };
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
    setCurrentModelId(model.id);
    setLocations(model.locations || []);
    setLinks(model.links || []);
    setParameters(model.parameters || []);
    setTechnologies(model.technologies?.length ? model.technologies : getDefaultTechnologies());
    setTimeSeries(model.timeSeries || []);
    setOverrides(model.overrides || {});
    setScenarios(model.scenarios || {});
  };

  const normaliseModel = (m) => ({
    ...m,
    locations: m.locations || [],
    links: m.links || [],
    parameters: m.parameters || [],
    technologies: m.technologies || [],
    timeSeries: [],                        // never load large TS from storage
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
          setModels(normalised);
          if (normalised.length > 0) applyModelToState(normalised[0]);
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

  // ── Sync to localStorage when backend is unavailable ──────────────────────
  useEffect(() => {
    if (!backendAvailable && models.length > 0) {
      saveToLocalStorage(models);
    }
  }, [models, backendAvailable]);

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

    const tempId = Date.now().toString();
    const newModel = {
      id: tempId,
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

    import.meta.env.DEV && console.log('Model created (optimistic):', { id: tempId, locationsSet: newModel.locations.length });

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
            import.meta.env.DEV && console.log('Model id updated to backend id:', finalId);
          }
        })
        .catch(e => {
          pendingSaveIds.current.delete(tempId);
          console.error('Failed to save model to backend, using local fallback:', e);
          showNotification('Model saved locally (backend unavailable).', 'warning');
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
            .catch(e => console.error('Failed to sync model to backend:', e))
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

  const clearData = () => {
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

  // ── Debounced auto-save ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentModelId) return;
    const hasData =
      locations.length > 0 || links.length > 0 || parameters.length > 0 ||
      technologies.length > 0 || timeSeries.length > 0 ||
      Object.keys(overrides).length > 0 || Object.keys(scenarios).length > 0;
    if (!hasData) return;

    const timeout = setTimeout(() => updateCurrentModel(), 1500);
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
