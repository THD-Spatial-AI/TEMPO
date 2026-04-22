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
  // fetch('/templates/...') would resolve against the FS root instead of the app)
  readTemplateFile: (filename) => ipcRenderer.invoke('read-template-file', filename),

  // ── Docker service management ─────────────────────────────────────────────

  /**
   * Get the running status of all TEMPO Docker services.
   * @returns Promise<{ dockerAvailable: bool, services: Array<{name, label, port, required, running, healthy, status, portOpen}> }>
   */
  getDockerStatus: () => ipcRenderer.invoke('docker:status'),

  /**
   * Start a specific Docker service by container name.
   * Progress is streamed via onDockerStartProgress.
   * @param {string} serviceName  e.g. 'calliope-runner', 'hydrogensim', 'ccssim'
   * @returns Promise<{ success: bool, error?: string }>
   */
  startDockerService: (serviceName) => ipcRenderer.invoke('docker:start', serviceName),

  /**
   * Start all Docker services that have a compose directory.
   * Progress is streamed via onDockerStartProgress.
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
   * Use in packaged builds (no Vite proxy available in file:// context).
   * @returns Promise<Record<string, { url: string, running: bool }>>
   */
  getServiceURLs: () => ipcRenderer.invoke('services:urls'),

  /**
   * Get the Calliope service URL (backward compat for calliopeClient.js).
   * @returns Promise<{ url: string, running: bool }>
   */
  getCalliopeServiceURL: () => ipcRenderer.invoke('calliope:service-url'),
});

