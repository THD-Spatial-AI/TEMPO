const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let backendProcess;
const BACKEND_PORT = 8082;

// Active Calliope jobs: jobId → ChildProcess
const activeCalliopeJobs = {};

// ─── Go backend ────────────────────────────────────────────────────────────

function startBackend() {
  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'backend-go', 'backend.exe')
    : path.join(__dirname, '..', 'backend-go', 'backend.exe');

  const dbPath = path.join(app.getPath('userData'), 'calliope.db');

  console.log('Starting backend:', backendPath);
  if (!fs.existsSync(backendPath)) {
    console.warn('Backend not found at:', backendPath);
    return Promise.resolve();
  }

  backendProcess = spawn(backendPath, ['--port', BACKEND_PORT.toString(), '--db', dbPath]);
  backendProcess.stdout.on('data', d => console.log(`Backend: ${d}`));
  backendProcess.stderr.on('data', d => console.error(`Backend Error: ${d}`));
  backendProcess.on('close', code => console.log(`Backend exited: ${code}`));
  return new Promise(resolve => setTimeout(resolve, 2000));
}

function stopBackend() {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
}

// ─── Conda / Python detection ──────────────────────────────────────────────

/**
 * Find the conda executable on the current platform.
 * Returns the full path string or null if not found.
 */
function findConda() {
  const isWin = process.platform === 'win32';
  const home = os.homedir();

  const candidates = isWin
    ? [
        path.join(home, 'Miniconda3', 'Scripts', 'conda.exe'),
        path.join(home, 'miniconda3', 'Scripts', 'conda.exe'),
        path.join(home, 'Anaconda3', 'Scripts', 'conda.exe'),
        path.join(home, 'anaconda3', 'Scripts', 'conda.exe'),
        'C:\\ProgramData\\Miniconda3\\Scripts\\conda.exe',
        'C:\\ProgramData\\miniconda3\\Scripts\\conda.exe',
        'C:\\ProgramData\\Anaconda3\\Scripts\\conda.exe',
        'C:\\tools\\miniconda3\\Scripts\\conda.exe',
      ]
    : [
        path.join(home, 'miniconda3', 'bin', 'conda'),
        path.join(home, 'Miniconda3', 'bin', 'conda'),
        path.join(home, 'anaconda3', 'bin', 'conda'),
        path.join(home, 'Anaconda3', 'bin', 'conda'),
        '/opt/conda/bin/conda',
        '/usr/local/anaconda3/bin/conda',
      ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Resolve the path to calliope_runner.py (packaged or dev).
 */
function getRunnerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'python', 'calliope_runner.py')
    : path.join(__dirname, '..', 'python', 'calliope_runner.py');
}

// ─── Calliope IPC handlers ─────────────────────────────────────────────────

/**
 * calliope:check
 * → { condaFound: bool, envExists: bool, version: string|null, condaPath: string|null }
 */
ipcMain.handle('calliope:check', async () => {
  const conda = findConda();
  if (!conda) {
    return { condaFound: false, envExists: false, version: null, condaPath: null };
  }

  return new Promise(resolve => {
    const child = spawn(conda, [
      'run', '-n', 'calliope', '--no-capture-output',
      'python', '-c', 'import calliope; print(calliope.__version__)',
    ], { shell: false });

    let version = '';
    child.stdout.on('data', d => { version += d.toString(); });
    child.on('close', code => {
      if (code === 0) {
        resolve({ condaFound: true, envExists: true, version: version.trim(), condaPath: conda });
      } else {
        resolve({ condaFound: true, envExists: false, version: null, condaPath: conda });
      }
    });
  });
});

/**
 * calliope:install
 * Creates the calliope conda environment.
 * Streams progress via calliope:install-progress events:
 *   { type: 'log',     line: string }
 *   { type: 'done'                  }
 *   { type: 'error',   error: string }
 * → { success: bool, error?: string }
 */
ipcMain.handle('calliope:install', async (event) => {
  const conda = findConda();
  if (!conda) {
    return { success: false, error: 'conda not found. Please install Miniconda first.' };
  }

  const sendProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('calliope:install-progress', data);
    }
  };

  return new Promise(resolve => {
    // Create the environment with calliope and cbc solver
    const child = spawn(conda, [
      'create', '-y', '-n', 'calliope',
      '-c', 'conda-forge',
      'python=3.9', 'calliope', 'coin-or-cbc',
    ], { shell: false });

    child.stdout.on('data', data => {
      for (const line of data.toString().split('\n').filter(l => l.trim())) {
        sendProgress({ type: 'log', line });
      }
    });

    child.stderr.on('data', data => {
      for (const line of data.toString().split('\n').filter(l => l.trim())) {
        sendProgress({ type: 'log', line });
      }
    });

    child.on('close', code => {
      if (code === 0) {
        sendProgress({ type: 'done' });
        resolve({ success: true });
      } else {
        const err = `conda create exited with code ${code}`;
        sendProgress({ type: 'error', error: err });
        resolve({ success: false, error: err });
      }
    });

    child.on('error', err => {
      sendProgress({ type: 'error', error: err.message });
      resolve({ success: false, error: err.message });
    });
  });
});

/**
 * calliope:run  → { jobId: string }
 *
 * Launches the Python runner asynchronously. Streams progress via
 * calliope:event messages to the renderer:
 *   { type: 'log',   jobId, line }
 *   { type: 'done',  jobId, result }
 *   { type: 'error', jobId, error }
 */
ipcMain.handle('calliope:run', async (event, { modelData, solver }) => {
  const jobId = `job_${Date.now()}`;
  const tmpDir = os.tmpdir();
  const inputFile  = path.join(tmpDir, `calliope_in_${jobId}.json`);
  const outputFile = path.join(tmpDir, `calliope_out_${jobId}.json`);

  // Write the model payload to a temp file
  const payload = { ...modelData, solver: solver || 'glpk' };
  fs.writeFileSync(inputFile, JSON.stringify(payload, null, 2), 'utf-8');

  const conda = findConda();
  if (!conda) {
    event.sender.send('calliope:event', {
      type: 'error', jobId,
      error: 'conda not found. Please restart the app and complete the setup.',
    });
    return { jobId };
  }

  const runnerPath = getRunnerPath();

  const child = spawn(conda, [
    'run', '-n', 'calliope', '--no-capture-output',
    'python', runnerPath, inputFile, outputFile,
  ], { shell: false });

  activeCalliopeJobs[jobId] = child;

  const sendEvent = data => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('calliope:event', data);
    }
  };

  child.stdout.on('data', data => {
    for (const line of data.toString().split('\n').filter(l => l.trim())) {
      sendEvent({ type: 'log', jobId, line });
    }
  });

  child.stderr.on('data', data => {
    for (const line of data.toString().split('\n').filter(l => l.trim())) {
      sendEvent({ type: 'log', jobId, line: `[STDERR] ${line}` });
    }
  });

  child.on('close', code => {
    delete activeCalliopeJobs[jobId];
    try { fs.unlinkSync(inputFile); } catch (_) {}

    if (fs.existsSync(outputFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        try { fs.unlinkSync(outputFile); } catch (_) {}
        sendEvent({ type: 'done', jobId, result });
      } catch (e) {
        sendEvent({ type: 'error', jobId, error: `Failed to parse results: ${e.message}` });
      }
    } else {
      sendEvent({
        type: 'error', jobId,
        error: code !== 0
          ? `Process exited with code ${code}. Check logs for details.`
          : 'Output file was not created – check logs.',
      });
    }
  });

  return { jobId };
});

/**
 * calliope:stop  → void
 */
ipcMain.handle('calliope:stop', async (_event, { jobId }) => {
  const child = activeCalliopeJobs[jobId];
  if (child) { child.kill(); delete activeCalliopeJobs[jobId]; }
});

// ─── Legacy IPC ────────────────────────────────────────────────────────────

ipcMain.handle('get-backend-url', () => `http://localhost:${BACKEND_PORT}`);
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

ipcMain.handle('save-file', async (_event, { filename, content }) => {
  const savePath = path.join(app.getPath('userData'), 'exports', filename);
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, content, 'utf-8');
  return savePath;
});

// ─── Window ────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  Object.values(activeCalliopeJobs).forEach(c => { try { c.kill(); } catch (_) {} });
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
  Object.values(activeCalliopeJobs).forEach(c => { try { c.kill(); } catch (_) {} });
});
