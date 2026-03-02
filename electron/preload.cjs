const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Legacy ───────────────────────────────────────────────────────────────
  getBackendURL:   () => ipcRenderer.invoke('get-backend-url'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),

  // ── Calliope local execution ─────────────────────────────────────────────

  /**
   * Verify that conda + the calliope environment are available.
   * @returns Promise<{ condaFound: bool, envExists: bool, version: string|null, condaPath: string|null }>
   */
  checkCalliope: () => ipcRenderer.invoke('calliope:check'),

  /**
   * Create the calliope conda environment (auto-install).
   * Progress is streamed via onInstallProgress.
   * @returns Promise<{ success: bool, error?: string }>
   */
  installCalliope: () => ipcRenderer.invoke('calliope:install'),

  /**
   * Subscribe to installation progress events.
   * Callback receives: { type: 'log'|'done'|'error', line?: string, error?: string }
   * @returns {Function} call to remove the listener
   */
  onInstallProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('calliope:install-progress', handler);
    return () => ipcRenderer.removeListener('calliope:install-progress', handler);
  },

  /**
   * Start a Calliope optimisation run.
   * Progress, logs, and the final result are delivered via onCalliopeEvent.
   * @param {{ modelData: object, solver: string }} config
   * @returns Promise<{ jobId: string }>
   */
  runCalliope: (config) => ipcRenderer.invoke('calliope:run', config),

  /**
   * Stop a running Calliope job.
   * @param {string} jobId
   */
  stopCalliope: (jobId) => ipcRenderer.invoke('calliope:stop', { jobId }),

  /**
   * Subscribe to all Calliope events.
   * Callback receives: { type: 'log'|'done'|'error', jobId, line?, result?, error? }
   * @returns {Function} call to remove the listener
   */
  onCalliopeEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('calliope:event', handler);
    return () => ipcRenderer.removeListener('calliope:event', handler);
  },
});
