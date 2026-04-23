const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');

// ─── Top-level process handles ───────────────────────────────────────────────
let mainWindow       = null;
let backendProcess   = null;   // Go REST backend (port 8082)
let calliopeService  = null;   // Python uvicorn service (port 5000, optional)

const BACKEND_PORT  = 8082;
const CALLIOPE_PORT = 5000;
const IS_WIN        = process.platform === 'win32';
const IS_LINUX      = process.platform === 'linux';

// ─── Docker service registry ────────────────────────────────────────────────
function getDockerServices() {
  const repoRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');

  const tempoRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'docker')
    : path.join(__dirname, '..', '..');

  return [
    {
      name: 'calliope-runner',
      label: 'Calliope Energy Optimizer',
      port: CALLIOPE_PORT,
      composeDir: repoRoot,
      required: true,
    },
    {
      name: 'opentech-db',
      label: 'Technology Database',
      port: 8000,
      composeDir: path.join(tempoRoot, 'opentech-db'),
      required: true,
    },
    {
      name: 'ccssim',
      label: 'CCS Simulation (OpenModelica)',
      port: 8766,
      composeDir: path.join(tempoRoot, 'ccssim'),
      required: false,
    },
    {
      name: 'calliope-geoserver',
      label: 'GeoServer (OSM Layers)',
      port: 8081,
      composeDir: null,
      required: false,
    },
    {
      name: 'calliope-postgis',
      label: 'PostGIS Database',
      port: 5432,
      composeDir: null,
      required: false,
    },
  ];
}

// ─── Port helper ───────────────────────────────────────────────────────────
function isPortOpen(port) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.on('connect',  () => { sock.destroy(); resolve(true); });
    sock.on('error',    () => resolve(false));
    sock.on('timeout',  () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

function waitForPort(port, timeoutMs = 30000, intervalMs = 400) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      isPortOpen(port).then(open => {
        if (open) { resolve(); return; }
        if (Date.now() >= deadline) { reject(new Error(`Port ${port} not open after ${timeoutMs}ms`)); return; }
        setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

// ─── Go backend ────────────────────────────────────────────────────────────
function startBackend() {
  const binName = IS_WIN ? 'backend.exe' : 'backend';
  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend-go', binName)
    : path.join(__dirname, '..', 'backend-go', binName);

  const dbPath = path.join(app.getPath('userData'), 'calliope.db');

  console.log('[backend] Starting:', backendPath);
  if (!fs.existsSync(backendPath)) {
    console.warn('[backend] Not found at:', backendPath);
    return Promise.resolve();
  }

  backendProcess = spawn(backendPath, ['--port', BACKEND_PORT.toString(), '--db', dbPath], { shell: false });
  backendProcess.stdout.on('data', d => console.log(`[backend] ${d.toString().trim()}`));
  backendProcess.stderr.on('data', d => console.error(`[backend] ${d.toString().trim()}`));
  backendProcess.on('close', code => console.log(`[backend] Exited: ${code}`));
  return new Promise(resolve => setTimeout(resolve, 1500));
}

function stopBackend() {
  if (backendProcess) { backendProcess.kill(); backendProcess = null; }
}

// ─── Docker helpers ─────────────────────────────────────────────────────────
function checkDocker() {
  return new Promise(resolve => {
    execFile('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 6000 }, (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}

function getContainerStatus(name) {
  return new Promise(resolve => {
    execFile(
      'docker',
      ['inspect', '--format', '{{.State.Running}}|{{.State.Health.Status}}|{{.State.Status}}', name],
      { timeout: 6000 },
      (err, stdout) => {
        if (err) { resolve({ name, running: false, healthy: null, status: 'not found' }); return; }
        const [running, health, status] = stdout.trim().split('|');
        resolve({
          name,
          running: running === 'true',
          healthy: health === 'healthy' ? true : health === 'unhealthy' ? false : null,
          status:  status || 'unknown',
        });
      },
    );
  });
}

async function getAllDockerStatus() {
  const dockerAvailable = await checkDocker();
  const services = getDockerServices();

  if (!dockerAvailable) {
    return {
      dockerAvailable: false,
      services: services.map(s => ({ name: s.name, label: s.label, port: s.port, required: s.required, running: false, healthy: null, status: 'docker not running', portOpen: false })),
    };
  }

  const results = await Promise.all(services.map(async svc => {
    const [st, portOpen] = await Promise.all([getContainerStatus(svc.name), isPortOpen(svc.port)]);
    return { name: svc.name, label: svc.label, port: svc.port, required: svc.required, running: st.running, healthy: st.healthy, status: st.status, portOpen };
  }));

  return { dockerAvailable: true, services: results };
}

function startDockerService(serviceName, progressEvent = null) {
  const svc = getDockerServices().find(s => s.name === serviceName);
  if (!svc)            return Promise.resolve({ success: false, error: `Unknown service: ${serviceName}` });
  if (!svc.composeDir) return Promise.resolve({ success: false, error: `${serviceName} has no compose dir — start it manually` });
  if (!fs.existsSync(svc.composeDir)) {
    return Promise.resolve({ success: false, error: `Compose directory not found: ${svc.composeDir}` });
  }

  const emit = (type, payload) => {
    if (progressEvent && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(progressEvent, { type, ...payload });
    }
  };

  return new Promise(resolve => {
    emit('stage', { label: `Starting ${svc.label}…` });
    const child = spawn('docker', ['compose', 'up', '-d', '--remove-orphans'], { cwd: svc.composeDir, shell: false });
    let stderr = '';
    child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) emit('log', { line: l }); });
    child.stderr.on('data', d => { stderr += d.toString(); for (const l of d.toString().split('\n').filter(x => x.trim())) emit('log', { line: l }); });
    child.on('close', code => { resolve(code === 0 ? { success: true } : { success: false, error: stderr.trim() || `Exit code ${code}` }); });
    child.on('error', err => resolve({ success: false, error: err.message }));
  });
}

// ─── IPC: Docker management ──────────────────────────────────────────────────
ipcMain.handle('docker:status', async () => getAllDockerStatus());

ipcMain.handle('docker:start', async (_event, serviceName) =>
  startDockerService(serviceName, 'docker:start-progress'),
);

ipcMain.handle('docker:start-all', async () => {
  const results = {};
  const required = getDockerServices().filter(s => s.composeDir != null);
  for (const svc of required) {
    results[svc.name] = await startDockerService(svc.name, 'docker:start-progress');
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('docker:start-progress', { type: 'done' });
  }
  return results;
});

// ─── IPC: Service URL registry ───────────────────────────────────────────────
ipcMain.handle('services:urls', async () => {
  const [c, o, ccs, gs, be] = await Promise.all([
    isPortOpen(5000), isPortOpen(8000), isPortOpen(8766), isPortOpen(8081), isPortOpen(BACKEND_PORT),
  ]);
  return {
    calliope:  { url: 'http://localhost:5000',            running: c   },
    opentech:  { url: 'http://localhost:8000',            running: o   },
    ccs:       { url: 'http://localhost:8766',            running: ccs },
    geoserver: { url: 'http://localhost:8081',            running: gs  },
    backend:   { url: `http://localhost:${BACKEND_PORT}`, running: be  },
  };
});

// Backward compat — calliopeClient.js calls this
ipcMain.handle('calliope:service-url', async () => ({
  url:     'http://127.0.0.1:5000',
  running: await isPortOpen(5000),
}));

// ─── IPC: General ───────────────────────────────────────────────────────────
ipcMain.handle('get-backend-url',    () => `http://localhost:${BACKEND_PORT}`);
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

// ─── Template file reader ────────────────────────────────────────────────────
ipcMain.handle('read-template-file', async (_event, filename) => {
  const templateDir = app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(__dirname, '..', 'public', 'templates');

  const resolved = path.resolve(templateDir, filename);
  if (!resolved.startsWith(path.resolve(templateDir) + path.sep) && resolved !== path.resolve(templateDir)) {
    return null;
  }
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, 'utf-8');
});

ipcMain.handle('save-file', async (_event, { filename, content }) => {
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') throw new Error('Invalid filename');
  if (typeof content !== 'string' || content.length > 10 * 1024 * 1024) throw new Error('Content exceeds maximum size limit');

  const exportDir = path.resolve(app.getPath('userData'), 'exports');
  const savePath  = path.resolve(exportDir, safeName);
  if (!savePath.startsWith(exportDir + path.sep)) throw new Error('Path traversal detected');

  fs.mkdirSync(exportDir, { recursive: true });
  fs.writeFileSync(savePath, content, 'utf-8');
  return savePath;
});

// ─── IPC: Privacy consent ────────────────────────────────────────────────────
const CONSENT_VERSION = 1;

function getConsentFilePath() {
  return path.join(app.getPath('userData'), 'privacy-consent.json');
}

ipcMain.handle('privacy:get-consent', () => {
  const filePath = getConsentFilePath();
  if (!fs.existsSync(filePath)) return { accepted: false, timestamp: null, version: null };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { accepted: data.accepted === true, timestamp: data.timestamp || null, version: data.version || null };
  } catch {
    return { accepted: false, timestamp: null, version: null };
  }
});

ipcMain.handle('privacy:set-consent', (_event, accepted) => {
  const record = { version: CONSENT_VERSION, accepted: accepted === true, timestamp: new Date().toISOString() };
  try {
    fs.writeFileSync(getConsentFilePath(), JSON.stringify(record, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Clear all user data (GDPR right to erasure) ───────────────────────
ipcMain.handle('data:clear-all', () => {
  const userData = app.getPath('userData');
  const toDelete = [
    path.join(userData, 'calliope.db'),
    path.join(userData, 'calliope.db-shm'),
    path.join(userData, 'calliope.db-wal'),
    path.join(userData, 'exports'),
    path.join(userData, 'privacy-consent.json'),
  ];

  const deleted = [];
  for (const target of toDelete) {
    try {
      if (!fs.existsSync(target)) continue;
      fs.statSync(target).isDirectory()
        ? fs.rmSync(target, { recursive: true, force: true })
        : fs.unlinkSync(target);
      deleted.push(path.basename(target));
    } catch (err) {
      console.warn(`[data:clear-all] Could not remove ${target}:`, err.message);
    }
  }
  return { success: true, deleted };
});

// ─── Python venv resolver ─────────────────────────────────────────────────
/**
 * Find the Calliope Python venv, whether it's the repo-local .venv-calliope
 * or a managed copy in userData/calliope-venv.
 *
 * Returns { venvDir, python, pip, exists }
 * where `exists` is true only when Calliope is actually installed.
 */
function resolveVenv() {
  const binDir = IS_WIN ? 'Scripts' : 'bin';
  const pyExe  = IS_WIN ? 'python.exe' : 'python3';
  const pipExe = IS_WIN ? 'pip.exe'    : 'pip3';

  const candidates = [
    app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', '.venv-calliope')
      : path.join(__dirname, '..', '.venv-calliope'),
    path.join(app.getPath('userData'), 'calliope-venv'),
  ];

  for (const venvDir of candidates) {
    const python = path.join(venvDir, binDir, pyExe);
    const pip    = path.join(venvDir, binDir, pipExe);
    if (!fs.existsSync(python)) continue;

    // Detect Calliope installation across Python version sub-dirs
    const siteWin   = path.join(venvDir, 'Lib', 'site-packages');
    const siteUnix  = path.join(venvDir, 'lib');
    const hasCalliope = (dir) => {
      try { return fs.readdirSync(dir).some(d => d.startsWith('calliope')); } catch { return false; }
    };
    let exists = hasCalliope(siteWin);
    if (!exists && fs.existsSync(siteUnix)) {
      exists = fs.readdirSync(siteUnix).some(ver => {
        try { return hasCalliope(path.join(siteUnix, ver, 'site-packages')); } catch { return false; }
      });
    }
    return { venvDir, python, pip, exists };
  }

  const managedDir = path.join(app.getPath('userData'), 'calliope-venv');
  const binD = IS_WIN ? 'Scripts' : 'bin';
  return {
    venvDir: managedDir,
    python:  path.join(managedDir, binD, pyExe),
    pip:     path.join(managedDir, binD, pipExe),
    exists:  false,
  };
}

/**
 * Find the system Python 3 executable (used only to create a venv).
 */
function findSystemPython() {
  const candidates = IS_WIN ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const out = execFileSync(cmd, ['--version'], { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      if (/python 3\.[89]|python 3\.1[0-9]/i.test(out)) return cmd;
    } catch { /* continue */ }
  }
  return null;
}

function getServicePaths() {
  const pythonDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'python')
    : path.join(__dirname, '..', 'python');
  return { pythonDir };
}

// ─── Calliope service (FastAPI / uvicorn) ────────────────────────────────────
/**
 * Start the persistent Calliope FastAPI service.
 * Used only when NOT relying on Docker (i.e. direct venv mode).
 */
async function startCalliopeService() {
  if (await isPortOpen(CALLIOPE_PORT)) {
    console.log('[calliope-svc] Already running on port', CALLIOPE_PORT);
    return;
  }

  const { python, exists } = resolveVenv();
  if (!exists) {
    console.log('[calliope-svc] venv not ready — skipping autostart');
    return;
  }

  const { pythonDir } = getServicePaths();

  // Platform-specific solver directory
  const solverSubdir = IS_WIN ? 'windows' : IS_LINUX ? 'linux' : '';
  const solverDir = solverSubdir
    ? (app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'solvers', solverSubdir)
      : path.join(__dirname, '..', 'solvers', solverSubdir))
    : null;

  const childEnv = { ...process.env };
  if (solverDir && fs.existsSync(solverDir)) {
    childEnv.PATH                = solverDir + path.delimiter + (childEnv.PATH || '');
    childEnv.CALLIOPE_SOLVER_DIR = solverDir;
  }

  // Tell the Python runner where Calliope YAML templates are stored so it can
  // copy missing CSV files from the bundled templates rather than generating
  // placeholder data with wrong signs (demand CSVs need negative values).
  childEnv.TEMPO_TEMPLATES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(__dirname, '..', 'public', 'templates');

  console.log(`[calliope-svc] Starting uvicorn with: ${python}`);
  calliopeService = spawn(python, [
    '-m', 'uvicorn', 'calliope_service:app',
    '--host', '127.0.0.1',
    '--port', String(CALLIOPE_PORT),
    '--workers', '1',
    '--log-level', 'warning',
  ], { cwd: pythonDir, shell: false, env: childEnv });

  calliopeService.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) console.log(`[calliope-svc] ${l}`); });
  calliopeService.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) console.log(`[calliope-svc] ${l}`); });
  calliopeService.on('close', code => { console.log(`[calliope-svc] Exited: ${code}`); calliopeService = null; });

  try {
    await waitForPort(CALLIOPE_PORT, 15000);
    console.log('[calliope-svc] Ready on port', CALLIOPE_PORT);
  } catch {
    console.warn('[calliope-svc] Did not start within 15 s — continuing anyway');
  }
}

function stopCalliopeService() {
  if (calliopeService) { calliopeService.kill(); calliopeService = null; }
}

// ─── IPC: Calliope service management ───────────────────────────────────────

ipcMain.handle('calliope:check', async () => {
  const { python, exists, venvDir } = resolveVenv();
  const serviceRunning = await isPortOpen(CALLIOPE_PORT);
  return { envExists: exists, venvPath: exists ? venvDir : null, serviceRunning };
});

ipcMain.handle('calliope:install', async () => {
  const sendProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('calliope:install-progress', data);
  };

  try {
    sendProgress({ type: 'stage', label: 'Locating Python interpreter…' });

    let systemPython = null;
    if (app.isPackaged) {
      const embeddedPy = path.join(
        process.resourcesPath, 'app.asar.unpacked',
        IS_WIN ? path.join('python-embed', 'python.exe') : path.join('python-embed', 'bin', 'python3'),
      );
      if (fs.existsSync(embeddedPy)) systemPython = embeddedPy;
    }
    if (!systemPython) systemPython = findSystemPython();
    if (!systemPython) throw new Error('Python 3.9+ not found. Install from https://python.org and relaunch TEMPO.');
    sendProgress({ type: 'log', line: `Python: ${systemPython}` });

    const { python: venvPython, venvDir } = resolveVenv();
    sendProgress({ type: 'stage', label: 'Creating Python environment…' });
    sendProgress({ type: 'log', line: `venv: ${venvDir}` });

    if (fs.existsSync(venvDir)) {
      sendProgress({ type: 'log', line: 'Removing existing venv…' });
      fs.rmSync(venvDir, { recursive: true, force: true });
    }

    const runChild = (cmd, args, label) => new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { shell: false });
      child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.on('close', code => { if (code === 0) resolve(); else reject(new Error(`${label} failed (exit ${code})`)); });
      child.on('error', reject);
    });

    await runChild(systemPython, ['-m', 'venv', venvDir], 'venv creation');

    sendProgress({ type: 'stage', label: 'Installing Calliope & dependencies…' });
    await runChild(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], 'pip upgrade');

    const { pythonDir } = getServicePaths();
    const reqMain    = path.join(pythonDir, 'requirements.txt');
    const reqService = path.join(pythonDir, 'requirements.service.txt');
    await runChild(venvPython, ['-m', 'pip', 'install', '-r', reqMain, '-r', reqService], 'pip install');

    sendProgress({ type: 'stage', label: 'Verifying installation…' });
    await runChild(venvPython, ['-c', 'import calliope, pyomo.environ, uvicorn; print("OK", calliope.__version__)'], 'verification');

    sendProgress({ type: 'stage', label: 'Starting Calliope service…' });
    await startCalliopeService();

    sendProgress({ type: 'done' });
    return { success: true };
  } catch (err) {
    const msg = err.message || String(err);
    sendProgress({ type: 'error', error: msg });
    return { success: false, error: msg };
  }
});

ipcMain.handle('calliope:restart-service', async () => {
  stopCalliopeService();
  await startCalliopeService();
  return { running: await isPortOpen(CALLIOPE_PORT) };
});

// ─── Window ────────────────────────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    // Try common Vite dev-server ports (can shift if port is busy)
    let devPort = null;
    for (const port of [5173, 5174, 5175]) {
      if (await isPortOpen(port)) { devPort = port; break; }
    }

    if (devPort) {
      mainWindow.loadURL(`http://localhost:${devPort}`);
      mainWindow.webContents.openDevTools();
    } else {
      const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      } else {
        mainWindow.loadURL(
          'data:text/html,<body style="font-family:sans-serif;padding:2rem">'
          + '<h2>No build found</h2>'
          + '<p>Run <code>npm run dev</code> then relaunch Electron, '
          + 'or run <code>npm run build</code> first.</p></body>',
        );
      }
    }
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function stopAll() {
  stopCalliopeService();
  stopBackend();
}

app.whenReady().then(async () => {
  await startBackend();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopAll);
