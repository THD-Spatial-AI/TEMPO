// Frontend API client for Go backend
// In Vite dev mode the /api prefix is proxied to localhost:8082 by vite.config.js,
// so the browser never makes a cross-origin request (avoids CORS issues).
// In Electron (file://) or an unknown context we ask the main process for the URL.
let _backendURLPromise = null;

function getBackendURL() {
  if (_backendURLPromise) return _backendURLPromise;
  if (typeof window !== 'undefined' && window.electronAPI?.getBackendURL) {
    _backendURLPromise = window.electronAPI.getBackendURL().catch(() => 'http://localhost:8082');
  } else if (import.meta.env.DEV) {
    _backendURLPromise = Promise.resolve('');
  } else {
    _backendURLPromise = Promise.resolve('http://localhost:8082');
  }
  return _backendURLPromise;
}

async function apiFetch(path, opts) {
  const base = await getBackendURL();
  return fetch(`${base}${path}`, opts);
}

export const api = {
  // Model Management
  async saveModel(modelData) {
    const response = await apiFetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData)
    });
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Failed to save model (${response.status}): ${errBody}`);
    }
    return response.json();
  },

  async getModels() {
    const response = await apiFetch('/api/models');
    if (!response.ok) throw new Error(`Failed to fetch models (${response.status})`);
    return response.json();
  },

  async getModel(id) {
    const response = await apiFetch(`/api/models/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch model (${response.status})`);
    return response.json();
  },

  async updateModel(id, modelData) {
    const response = await apiFetch(`/api/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData)
    });
    if (!response.ok) throw new Error(`Failed to update model: ${response.statusText}`);
    return response.json();
  },

  async deleteModel(id) {
    const response = await apiFetch(`/api/models/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`Failed to delete model: ${response.statusText}`);
    return response.json();
  },

  // Job Management
  async runModel(modelId) {
    const response = await apiFetch(`/api/models/${modelId}/run`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error(`Failed to run model (${response.status})`);
    return response.json();
  },

  async getJobStatus(jobId) {
    const response = await apiFetch(`/api/jobs/${jobId}`);
    if (!response.ok) throw new Error(`Failed to fetch job status (${response.status})`);
    return response.json();
  },

  async getJobResults(jobId) {
    const response = await apiFetch(`/api/jobs/${jobId}/results`);
    if (!response.ok) throw new Error(`Failed to fetch job results (${response.status})`);
    return response.json();
  },

  // Completed Runs (persisted history)
  async saveCompletedRun(run) {
    const response = await apiFetch('/api/completed-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
    if (!response.ok) throw new Error(`Failed to save completed run: ${response.statusText}`);
    return response.json();
  },

  async getCompletedRuns() {
    const response = await apiFetch('/api/completed-runs');
    if (!response.ok) throw new Error('Failed to fetch completed runs');
    return response.json();
  },

  async deleteCompletedRun(id) {
    const response = await apiFetch(`/api/completed-runs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Failed to delete completed run: ${response.statusText}`);
    return response.json();
  },

  // OSM Data from GeoServer
  // layerName  : osm_substations | osm_power_plants | osm_power_lines | osm_communes | osm_districts
  // bbox       : {minLon, minLat, maxLon, maxLat}  – optional spatial filter
  // regionPath : e.g. "Europe/Germany" or "South_America/Chile/Metropolitana"
  //              pass empty string / null to retrieve ALL loaded regions
  async getOSMLayer(layerName, bbox = null, regionPath = null) {
    const params = new URLSearchParams();
    if (bbox) {
      params.append('bbox', `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`);
    }
    if (regionPath) {
      params.append('region', regionPath);
    }

    const response = await apiFetch(`/api/osm/${layerName}?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${layerName}: ${response.statusText}`);
    }
    return response.json();
  },

  async getAvailableLayers() {
    const response = await apiFetch('/api/osm/layers');
    return response.json();
  },

  // Returns distinct region_paths currently loaded in PostGIS
  async getLoadedRegions() {
    const response = await apiFetch('/api/osm/regions');
    if (!response.ok) return { regions: [] };
    return response.json();
  },

  // Returns the full Geofabrik regions database (countries + sub-regions).
  async getRegionsDatabase() {
    const response = await apiFetch('/api/osm/regions-db');
    if (!response.ok) throw new Error('Could not load regions database');
    return response.json();
  },

  // Start an OSM download via the Python pipeline.
  downloadOSMRegionStream(continent, country, region = '') {
    const body = JSON.stringify({ continent, country, region: region || '' });
    return apiFetch('/api/osm/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  },

  // Geocode a free-text query via Nominatim (proxied through the backend).
  async geocode(query) {
    if (!query) return [];
    const response = await apiFetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    return response.json();
  },

  // Health Check
  async checkHealth() {
    try {
      const response = await apiFetch('/api/health');
      return response.ok;
    } catch {
      return false;
    }
  },

  // Poll job until complete
  async pollJob(jobId, onProgress) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const job = await this.getJobStatus(jobId);
          
          if (onProgress) {
            onProgress(job);
          }

          if (job.status === 'completed') {
            clearInterval(interval);
            const results = await this.getJobResults(jobId);
            resolve(results);
          } else if (job.status === 'failed') {
            clearInterval(interval);
            reject(new Error(job.error || 'Job failed'));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, 2000); // Poll every 2 seconds
    });
  }
};

export default api;

