const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Core ─────────────────────────────────────────────────────────────────
  getBackendURL:   () => ipcRenderer.invoke('get-backend-url'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),

  // ── Privacy & data management ─────────────────────────────────────────────
  getPrivacyConsent: () => ipcRenderer.invoke('privacy:get-consent'),
  setPrivacyConsent: (accepted) => ipcRenderer.invoke('privacy:set-consent', accepted),
  clearAllData: () => ipcRenderer.invoke('data:clear-all'),

  // Read a file from the templates directory (works in packaged builds where
  // fetch('/templates/...') would resolve against the FS root)
  readTemplateFile: (filename) => ipcRenderer.invoke('read-template-file', filename),

  // ── Docker service management ─────────────────────────────────────────────

  /**
   * Get the running status of all TEMPO Docker services.
   * @returns Promise<{ dockerAvailable: bool, services: Array }>
   */
  getDockerStatus: () => ipcRenderer.invoke('docker:status'),

  /**
   * Start a specific Docker service by container name.
   * @param {string} serviceName  e.g. 'calliope-runner', 'opentech-db'
   * @returns Promise<{ success: bool, error?: string }>
   */
  startDockerService: (serviceName) => ipcRenderer.invoke('docker:start', serviceName),

  /**
   * Start all Docker services that have a compose directory.
   * @returns Promise<Record<string, { success: bool, error?: string }>>
   */
  startAllDockerServices: () => ipcRenderer.invoke('docker:start-all'),

  /**
   * Subscribe to Docker start-up progress events.
   * Callback receives: { type: 'log'|'stage'|'done'|'error', line?: string, label?: string }
   * @returns {Function} unsubscribe
   */
  onDockerStartProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('docker:start-progress', handler);
    return () => ipcRenderer.removeListener('docker:start-progress', handler);
  },

  // ── Service URL resolution ────────────────────────────────────────────────

  /**
   * Get all TEMPO service URLs and whether each port is open.
   * @returns Promise<Record<string, { url: string, running: bool }>>
   */
  getServiceURLs: () => ipcRenderer.invoke('services:urls'),

  /**
   * Get the Calliope service URL (used by calliopeClient.js).
   * @returns Promise<{ url: string, running: bool }>
   */
  getCalliopeServiceURL: () => ipcRenderer.invoke('calliope:service-url'),

  // ── Calliope Python service (direct venv mode) ────────────────────────────

  /**
   * Check whether the Python venv exists and the service is running.
   * @returns Promise<{ envExists: bool, venvPath: string|null, serviceRunning: bool }>
   */
  checkCalliopeEnv: () => ipcRenderer.invoke('calliope:check'),

  /**
   * Full zero-touch install: create venv, pip install, verify, start service.
   * Streams progress via onCalliopeInstallProgress.
   * @param {string[]} [modules=['calliope']]  Module IDs to install
   * @param {boolean}  [downloadSolvers=false] Download CBC binary for Windows
   * @returns Promise<{ success: bool, error?: string }>
   */
  installCalliopeEnv: (modules = ['calliope'], downloadSolvers = false) =>
    ipcRenderer.invoke('calliope:install', modules, downloadSolvers),

  /**
   * Subscribe to Calliope install progress events.
   * @returns {Function} unsubscribe
   */
  onCalliopeInstallProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('calliope:install-progress', handler);
    return () => ipcRenderer.removeListener('calliope:install-progress', handler);
  },

  /**
   * Restart the running Calliope uvicorn service.
   * @returns Promise<{ running: bool }>
   */
  restartCalliopeService: () => ipcRenderer.invoke('calliope:restart-service'),

  // ── Calliope 0.7 engine service (experimental, direct venv mode) ──────────

  /** Get the Calliope 0.7 service URL (used by calliopeClient.js for 0.7 models). */
  getCalliope07ServiceURL: () => ipcRenderer.invoke('calliope07:service-url'),

  /** Check whether the Calliope 0.7 venv exists and the service is running. */
  checkCalliope07Env: () => ipcRenderer.invoke('calliope07:check'),

  /**
   * Install the Calliope 0.7 venv (Python 3.10+, isolated from the 0.6.8 venv)
   * and start the service. Streams progress via onCalliope07InstallProgress.
   */
  installCalliope07Env: () => ipcRenderer.invoke('calliope07:install'),

  /** Subscribe to Calliope 0.7 install progress events. */
  onCalliope07InstallProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('calliope07:install-progress', handler);
    return () => ipcRenderer.removeListener('calliope07:install-progress', handler);
  },

  /** Restart the running Calliope 0.7 uvicorn service. */
  restartCalliope07Service: () => ipcRenderer.invoke('calliope07:restart-service'),

  // ── AdOpT-NET0 Python service (direct venv mode) ──────────────────────────

  /** Get the AdOpT-NET0 service URL (used by adoptnet0Client.js). */
  getAdoptnet0ServiceURL: () => ipcRenderer.invoke('adoptnet0:service-url'),

  /** Check whether the AdOpT-NET0 venv exists and the service is running. */
  checkAdoptnet0Env: () => ipcRenderer.invoke('adoptnet0:check'),

  /**
   * Install the AdOpT-NET0 venv (Python 3.12+) and start the service.
   * Streams progress via onAdoptnet0InstallProgress.
   */
  installAdoptnet0Env: () => ipcRenderer.invoke('adoptnet0:install'),

  /** Subscribe to AdOpT-NET0 install progress events. */
  onAdoptnet0InstallProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('adoptnet0:install-progress', handler);
    return () => ipcRenderer.removeListener('adoptnet0:install-progress', handler);
  },

  /** Restart the running AdOpT-NET0 uvicorn service. */
  restartAdoptnet0Service: () => ipcRenderer.invoke('adoptnet0:restart-service'),

  // ── opentech-db URL ───────────────────────────────────────────────────────

  /**
   * Get the opentech-db API base URL.
   * Reads TEMPO_TECH_API_URL env var in main process; falls back to localhost:8000.
   * Set TEMPO_TECH_API_URL to point at the deployed public opentech-db instance.
   * @returns Promise<string>
   */
  getTechApiURL: () => ipcRenderer.invoke('tech:api-url'),

  /**
   * Check simulation services (CCS + Hydrogen) venv and port status.
   * @returns Promise<{ ccssim: { venvExists, running }, hydrogensim: { venvExists, running } }>
   */
  checkSimEnvs: () => ipcRenderer.invoke('sim:check'),

  /**
   * Restart simulation services.
   * @returns Promise<{ ccssim: bool, hydrogensim: bool }>
   */
  restartSimServices: () => ipcRenderer.invoke('sim:restart'),

  // ── Setup version tracking ────────────────────────────────────────────────

  /**
   * Returns the stored setup version and the current app version.
   * If setupVersion !== currentVersion (or setupVersion is null), setup must run.
   * @returns Promise<{ setupVersion: string|null, currentVersion: string }>
   */
  getSetupVersion: () => ipcRenderer.invoke('setup:get-version'),

  /**
   * Record that setup completed successfully for the running app version.
   * Call this once the user finishes the setup wizard.
   * @returns Promise<{ success: bool }>
   */
  markSetupComplete: () => ipcRenderer.invoke('setup:mark-complete'),
});


