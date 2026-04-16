const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const net = require('net');

let mainWindow;
let backendProcess = null;   // Go REST backend (port 8082)

const BACKEND_PORT = 8082;

// ─── Docker service registry ────────────────────────────────────────────────
// Returns the full list of TEMPO Docker services with their metadata.
// Uses a function so `app.isPackaged` is evaluated after app init.
function getDockerServices() {
  // In dev: __dirname = calliope_editiontool/electron/
  //         tempoRoot = calliope_editiontool/../../.. = three levels up = TEMPO/
  // In packaged: docker compose files are bundled as extraResources/docker/
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
      port: 5000,
      composeDir: repoRoot,   // docker-compose.yml lives in repo root
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
      name: 'hydrogensim',
      label: 'Hydrogen Plant Simulation (OpenModelica)',
      port: 8765,
      composeDir: path.join(tempoRoot, 'hydrogenmatsim'),
      required: false,
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
      composeDir: null,   // managed by scripts/setup_geoserver_docker.ps1
      required: false,
    },
    {
      name: 'calliope-postgis',
      label: 'PostGIS Database',
      port: 5432,
      composeDir: null,   // managed together with GeoServer
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

/**
 * Wait until a TCP port accepts connections, or time out.
 */
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
  const binName = process.platform === 'win32' ? 'backend.exe' : 'backend';
  const backendPath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend-go', binName)
    : path.join(__dirname, '..', 'backend-go', binName);

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

// ─── Docker helpers ─────────────────────────────────────────────────────────

/**
 * Verify Docker daemon is accessible.
 * @returns {Promise<boolean>}
 */
function checkDocker() {
  return new Promise(resolve => {
    execFile('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 6000 }, (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}

/**
 * Inspect a single container and return its runtime state.
 * @param {string} name  Container name (e.g. 'calliope-runner')
 * @returns {Promise<{ name, running, healthy, status }>}
 */
function getContainerStatus(name) {
  return new Promise(resolve => {
    execFile(
      'docker',
      ['inspect', '--format', '{{.State.Running}}|{{.State.Health.Status}}|{{.State.Status}}', name],
      { timeout: 6000 },
      (err, stdout) => {
        if (err) {
          resolve({ name, running: false, healthy: null, status: 'not found' });
          return;
        }
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

/**
 * Collect status for all registered TEMPO Docker services.
 * @returns {Promise<{ dockerAvailable: bool, services: Array }>}
 */
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
    return {
      name:     svc.name,
      label:    svc.label,
      port:     svc.port,
      required: svc.required,
      running:  st.running,
      healthy:  st.healthy,
      status:   st.status,
      portOpen,
    };
  }));

  return { dockerAvailable: true, services: results };
}

/**
 * Start a Docker service via `docker compose up -d`.
 * Streams log lines to the renderer via the given event name.
 *
 * @param {string} serviceName   Container name from the registry
 * @param {string} progressEvent IPC event name for progress messages (or null to suppress)
 * @returns {Promise<{ success: bool, error?: string }>}
 */
function startDockerService(serviceName, progressEvent = null) {
  const svc = getDockerServices().find(s => s.name === serviceName);
  if (!svc)           return Promise.resolve({ success: false, error: `Unknown service: ${serviceName}` });
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
    const child = spawn('docker', ['compose', 'up', '-d', '--remove-orphans'], {
      cwd: svc.composeDir,
      shell: false,
    });
    let stderr = '';
    child.stdout.on('data', d => {
      for (const l of d.toString().split('\n').filter(x => x.trim())) emit('log', { line: l });
    });
    child.stderr.on('data', d => {
      stderr += d.toString();
      for (const l of d.toString().split('\n').filter(x => x.trim())) emit('log', { line: l });
    });
    child.on('close', code => {
      if (code === 0) resolve({ success: true });
      else            resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
    });
    child.on('error', err => resolve({ success: false, error: err.message }));
  });
}

// ─── IPC: Docker management ──────────────────────────────────────────────────

// Poll Docker and return per-container status
ipcMain.handle('docker:status', async () => getAllDockerStatus());

// Start a single named service
ipcMain.handle('docker:start', async (_event, serviceName) =>
  startDockerService(serviceName, 'docker:start-progress'),
);

// Start all services that have a composeDir, streaming progress
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

/**
 * services:urls
 * Returns all known service base-URLs plus whether their port is open.
 * The renderer uses this to bypass the Vite proxy in packaged builds.
 */
ipcMain.handle('services:urls', async () => {
  const [c, o, h2, ccs, gs, be] = await Promise.all([
    isPortOpen(5000),
    isPortOpen(8000),
    isPortOpen(8765),
    isPortOpen(8766),
    isPortOpen(8081),
    isPortOpen(BACKEND_PORT),
  ]);
  return {
    calliope:  { url: 'http://localhost:5000',        running: c  },
    opentech:  { url: 'http://localhost:8000',        running: o  },
    h2:        { url: 'http://localhost:8765',        running: h2 },
    ccs:       { url: 'http://localhost:8766',        running: ccs },
    geoserver: { url: 'http://localhost:8081',        running: gs },
    backend:   { url: `http://localhost:${BACKEND_PORT}`, running: be },
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
// In packaged builds, fetch('/templates/...') resolves from the FS root (wrong).
// The renderer calls this IPC handler instead to read template files safely.
ipcMain.handle('read-template-file', async (_event, filename) => {
  // Resolve template directory: resources/templates/ when packaged, public/templates/ in dev
  const templateDir = app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(__dirname, '..', 'public', 'templates');

  // Prevent path traversal: normalise and ensure the result stays inside templateDir
  const resolved = path.resolve(templateDir, filename);
  if (!resolved.startsWith(path.resolve(templateDir) + path.sep) &&
      resolved !== path.resolve(templateDir)) {
    return null; // Reject paths that escape the template directory
  }
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, 'utf-8');
});

ipcMain.handle('save-file', async (_event, { filename, content }) => {
  const savePath = path.join(app.getPath('userData'), 'exports', filename);
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, content, 'utf-8');
  return savePath;
});

// ─── Window ────────────────────────────────────────────────────────────────

async function createWindow_PLACEHOLDER() {
  const isWin = process.platform === 'win32';
  const binDir = isWin ? 'Scripts' : 'bin';
  const pyExe  = isWin ? 'python.exe' : 'python3';
  const pipExe = isWin ? 'pip.exe'    : 'pip3';

  // Candidate venv directories
  const candidates = [
    // Repo-local venv (dev or packaged with app.asar.unpacked peer)
    app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', '.venv-calliope')
      : path.join(__dirname, '..', '.venv-calliope'),
    // Managed install in userData (created by calliope:install)
    path.join(app.getPath('userData'), 'calliope-venv'),
  ];

  for (const venvDir of candidates) {
    const python = path.join(venvDir, binDir, pyExe);
    const pip    = path.join(venvDir, binDir, pipExe);
    // Mark as existing only when both the interpreter AND a calliope package marker are present
    const calliopeMarker = path.join(venvDir, 'Lib', 'site-packages', 'calliope', '__init__.py');
    const calliopeMarkerUnix = path.join(venvDir, 'lib', 'python3.9', 'site-packages', 'calliope', '__init__.py');
    const calliopeMarkerGlob = fs.existsSync(calliopeMarker) || fs.existsSync(calliopeMarkerUnix)
      || (fs.existsSync(path.join(venvDir, 'Lib', 'site-packages'))
          && fs.readdirSync(path.join(venvDir, 'Lib', 'site-packages')).some(d => d.startsWith('calliope')))
      || (fs.existsSync(path.join(venvDir, 'lib'))
          && fs.readdirSync(path.join(venvDir, 'lib')).some(sub => {
               try {
                 return fs.readdirSync(path.join(venvDir, 'lib', sub, 'site-packages'))
                          .some(d => d.startsWith('calliope'));
               } catch { return false; }
             }));

    if (fs.existsSync(python)) {
      return { venvDir, python, pip, exists: calliopeMarkerGlob };
    }
  }

  // No venv present yet
  const managedDir = path.join(app.getPath('userData'), 'calliope-venv');
  const python = path.join(managedDir, binDir, pyExe);
  const pip    = path.join(managedDir, binDir, pipExe);
  return { venvDir: managedDir, python, pip, exists: false };
}

/**
 * Find the system Python 3 executable (used only to create the venv on first run).
 * Returns the path string or null if not found.
 */
function findSystemPython() {
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(cmd, ['--version'], { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
      const ver = out.toString().trim();
      if (/python 3\.[89]|python 3\.1[0-9]/i.test(ver)) return cmd;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Resolve paths used by the Python calliope service.
 */
function getServicePaths() {
  const pythonDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'python')
    : path.join(__dirname, '..', 'python');
  const serviceModule = 'calliope_service:app';
  return { pythonDir, serviceModule };
}

// ─── Calliope service (FastAPI / uvicorn) ─────────────────────────────────

/**
 * Start the persistent Calliope FastAPI service.
 * The service stays alive for the whole app lifetime so runs are cheap.
 */
async function startCalliopeService() {
  if (await isPortOpen(CALLIOPE_PORT)) {
    console.log('[calliope-svc] Already running on port', CALLIOPE_PORT);
    return;
  }

  const { python, exists } = resolveVenv();
  if (!exists) {
    console.log('[calliope-svc] venv not ready — skipping autostart (setup screen will handle install)');
    return;
  }

  const { pythonDir } = getServicePaths();
  const solverDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'solvers', 'windows')
    : path.join(__dirname, '..', 'solvers', 'windows');

  const childEnv = { ...process.env };
  if (fs.existsSync(solverDir)) {
    childEnv.PATH          = solverDir + path.delimiter + (childEnv.PATH || '');
    childEnv.CALLIOPE_SOLVER_DIR = solverDir;
  }

  console.log(`[calliope-svc] Starting uvicorn with python: ${python}`);
  calliopeService = spawn(python, [
    '-m', 'uvicorn', 'calliope_service:app',
    '--host', '127.0.0.1',
    '--port', String(CALLIOPE_PORT),
    '--workers', '1',
    '--log-level', 'warning',
  ], {
    cwd: pythonDir,
    shell: false,
    env: childEnv,
  });

  calliopeService.stdout.on('data', d => {
    for (const l of d.toString().split('\n').filter(x => x.trim()))
      console.log(`[calliope-svc] ${l}`);
  });
  calliopeService.stderr.on('data', d => {
    for (const l of d.toString().split('\n').filter(x => x.trim()))
      console.log(`[calliope-svc] ${l}`);
  });
  calliopeService.on('close', code => {
    console.log(`[calliope-svc] Process exited with code ${code}`);
    calliopeService = null;
  });

  // Wait up to 15 s for the port to open
  try {
    await waitForPort(CALLIOPE_PORT, 15000);
    console.log('[calliope-svc] Service ready on port', CALLIOPE_PORT);
  } catch {
    console.warn('[calliope-svc] Service did not start within 15 s — continuing without it');
  }
}

function stopCalliopeService() {
  if (calliopeService) {
    calliopeService.kill();
    calliopeService = null;
  }
}

// ─── MATLAB bridge auto-start ────────────────────────────────────────────────

/**
 * Resolve the hydrogenmatsim directory (sibling of calliope_editiontool).
 * Returns null in packaged builds where MATLAB is not bundled.
 */
function getBridgeDir() {
  if (app.isPackaged) return null;
  return path.join(__dirname, '..', '..', 'hydrogenmatsim');
}

/**
 * Start the MATLAB bridge (conda env matlab-bridge, uvicorn on port 8765).
 * Fire-and-forget: does not block app startup.
 * Skips silently if already running, conda not found, or dir missing.
 */
async function startMatlabBridge() {
  if (await isPortOpen(BRIDGE_PORT)) {
    console.log('[bridge] MATLAB bridge already running on port', BRIDGE_PORT);
    return;
  }

  const bridgeDir = getBridgeDir();
  if (!bridgeDir || !fs.existsSync(bridgeDir)) {
    console.log('[bridge] hydrogenmatsim directory not found, skipping');
    return;
  }

  // Prefer the calliope venv's uvicorn if available; otherwise fall back to system python
  const { python: venvPython, exists: venvExists } = resolveVenv();
  const bridgePython = venvExists ? venvPython : (findSystemPython() || 'python3');

  // Load .env vars from hydrogenmatsim/.env
  const childEnv = { ...process.env };
  const envFile = path.join(bridgeDir, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const idx = t.indexOf('=');
        childEnv[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
      }
    }
  }

  console.log('[bridge] Starting MATLAB bridge (python uvicorn)…');
  matlabBridgeProcess = spawn(bridgePython, [
    '-m', 'uvicorn', 'main:app',
    '--host', '0.0.0.0',
    '--port', String(BRIDGE_PORT),
    '--workers', '1',
    '--log-level', 'info',
  ], { cwd: bridgeDir, shell: false, env: childEnv });

  matlabBridgeProcess.stdout.on('data', d => {
    for (const l of d.toString().split('\n').filter(x => x.trim()))
      console.log(`[bridge] ${l}`);
  });
  matlabBridgeProcess.stderr.on('data', d => {
    for (const l of d.toString().split('\n').filter(x => x.trim()))
      console.log(`[bridge] ${l}`);
  });
  matlabBridgeProcess.on('close', code => {
    console.log(`[bridge] Process exited with code ${code}`);
    matlabBridgeProcess = null;
  });
}

function stopMatlabBridge() {
  if (matlabBridgeProcess) {
    console.log('[bridge] Stopping MATLAB bridge…');
    matlabBridgeProcess.kill();
    matlabBridgeProcess = null;
  }
}

// ─── Calliope IPC handlers ─────────────────────────────────────────────────

/**
 * calliope:check
 * → { envExists: bool, venvPath: string|null, serviceRunning: bool }
 *
 * Checks for the Python venv and whether the uvicorn service is already up.
 */
ipcMain.handle('_calliope:check_DISABLED', async () => {
  const { python, exists, venvDir } = resolveVenv();
  const serviceRunning = await isPortOpen(CALLIOPE_PORT);
  return {
    envExists: exists,
    venvPath: exists ? venvDir : null,
    serviceRunning,
  };
});

/**
 * calliope:install
 * Full zero-touch setup pipeline (pure pip, no conda required):
 *   1. Locate system Python 3 (or embedded Python in packaged build)
 *   2. Create a venv in userData/calliope-venv
 *   3. pip install -r python/requirements.txt -r python/requirements.service.txt
 *   4. Verify the install
 *   5. Start the persistent uvicorn service
 *
 * Streams progress via calliope:install-progress events:
 *   { type: 'log',   line: string }
 *   { type: 'stage', label: string }
 *   { type: 'done'                 }
 *   { type: 'error', error: string }
 * → { success: bool, error?: string }
 */
ipcMain.handle('_calliope:install_DISABLED', async () => {
  const sendProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('calliope:install-progress', data);
    }
  };

  try {
    // ── Step 1: Find Python ───────────────────────────────────────────
    sendProgress({ type: 'stage', label: 'Locating Python interpreter…' });

    // In a packaged build we bundle a private Python (e.g. python-embed or
    // a full CPython distributable). Point at it first.
    const isWin = process.platform === 'win32';
    let systemPython = null;

    if (app.isPackaged) {
      const embeddedPy = path.join(
        process.resourcesPath, 'app.asar.unpacked',
        isWin ? 'python-embed' : 'python-embed',
        isWin ? 'python.exe' : 'bin/python3',
      );
      if (fs.existsSync(embeddedPy)) systemPython = embeddedPy;
    }

    if (!systemPython) systemPython = findSystemPython();
    if (!systemPython) {
      throw new Error(
        'Python 3.9+ not found on this system. ' +
        'Please install Python from https://python.org and re-open TEMPO.',
      );
    }
    sendProgress({ type: 'log', line: `Python interpreter: ${systemPython}` });

    // ── Step 2: Create venv ───────────────────────────────────────────
    const { python: venvPython, venvDir } = resolveVenv();
    sendProgress({ type: 'stage', label: 'Creating Python environment…' });
    sendProgress({ type: 'log', line: `Creating venv at: ${venvDir}` });

    if (fs.existsSync(venvDir)) {
      sendProgress({ type: 'log', line: 'Existing venv found — removing and recreating…' });
      fs.rmSync(venvDir, { recursive: true, force: true });
    }

    await new Promise((resolve, reject) => {
      const child = spawn(systemPython, ['-m', 'venv', venvDir], { shell: false });
      child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.on('close', code => { if (code === 0) resolve(); else reject(new Error(`venv creation failed (exit ${code})`)); });
      child.on('error', reject);
    });

    // ── Step 3: pip install ───────────────────────────────────────────
    sendProgress({ type: 'stage', label: 'Installing Calliope & dependencies…' });
    sendProgress({ type: 'log', line: 'Running pip install — this takes a few minutes…' });

    const pythonDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'python')
      : path.join(__dirname, '..', 'python');

    const reqMain    = path.join(pythonDir, 'requirements.txt');
    const reqService = path.join(pythonDir, 'requirements.service.txt');

    const pipArgs = ['-m', 'pip', 'install', '--upgrade', 'pip'];
    await new Promise((resolve, reject) => {
      const child = spawn(venvPython, pipArgs, { shell: false });
      child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.on('close', code => { if (code === 0) resolve(); else reject(new Error(`pip upgrade failed (exit ${code})`)); });
      child.on('error', reject);
    });

    const installArgs = ['-m', 'pip', 'install', '-r', reqMain, '-r', reqService];
    await new Promise((resolve, reject) => {
      const child = spawn(venvPython, installArgs, { shell: false });
      child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) sendProgress({ type: 'log', line: l }); });
      child.on('close', code => { if (code === 0) resolve(); else reject(new Error(`pip install failed (exit ${code})`)); });
      child.on('error', reject);
    });

    // ── Step 4: Verify ────────────────────────────────────────────────
    sendProgress({ type: 'stage', label: 'Verifying installation…' });
    await new Promise((resolve, reject) => {
      const child = spawn(venvPython, [
        '-c',
        'import calliope; import pyomo.environ; import uvicorn; print("OK calliope", calliope.__version__)',
      ], { shell: false });
      let out = '';
      child.stdout.on('data', d => { out += d.toString(); });
      child.stderr.on('data', d => { out += d.toString(); });
      child.on('close', code => {
        sendProgress({ type: 'log', line: out.trim() || '(no output)' });
        if (code === 0) resolve();
        else reject(new Error(`Verification failed (exit ${code}). Check log for details.`));
      });
      child.on('error', reject);
    });

    // ── Step 5: Start service ─────────────────────────────────────────
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

/**
 * calliope:service-url  → { url: string, running: bool }
 * Returns the URL of the running Calliope service so the renderer
 * can use it directly for HTTP calls (bypassing Vite proxy in packaged builds).
 */
ipcMain.handle('_calliope:service-url_DISABLED', async () => {
  const running = false;
  return { url: `http://127.0.0.1:${CALLIOPE_PORT}`, running };
});

/**
 * calliope:restart-service
 * Stops and restarts the Python uvicorn service.
 */
ipcMain.handle('calliope:restart-service', async () => {
  stopCalliopeService();
  await startCalliopeService();
  const running = await isPortOpen(CALLIOPE_PORT);
  return { running };
});



// ─── Window ────────────────────────────────────────────────────────────────

async function createWindow() {
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
    // Prefer the Vite dev server (hot-reload), fall back to the built dist/
    const viteRunning = await isPortOpen(5173);
    if (viteRunning) {
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      } else {
        // Nothing built yet — show a helpful message
        mainWindow.loadURL('data:text/html,<h2 style="font-family:sans-serif;padding:2rem">'
          + 'No build found.<br><br>'
          + 'Run <code>npm run dev</code> in the project folder, then relaunch Electron.<br>'
          + 'Or run <code>npm run build</code> to create a static build first.</h2>');
      }
    }
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function stopAll() {
  stopBackend();
}

app.whenReady().then(async () => {
  startBackend();
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
