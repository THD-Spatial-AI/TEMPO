const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');

// ─── Top-level process handles ───────────────────────────────────────────────
let mainWindow         = null;
let backendProcess     = null;   // Go REST backend (port 8082)
let calliopeService    = null;   // Python uvicorn service (port 5000, optional)
let ccsSimService      = null;   // CCS simulation FastAPI service (port 8766)
let hydrogenSimService = null;   // Hydrogen simulation FastAPI service (port 8765)

let BACKEND_PORT  = 8082;   // may be reassigned at startup if port is taken
let CALLIOPE_PORT = 5000;   // may be reassigned at startup if port is taken
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

  const geoComposeDir = app.isPackaged
    ? path.join(process.resourcesPath, 'geoserver')
    : repoRoot;

  const geoComposeFile = 'docker-compose.geoserver.yml';

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
      name: 'calliope-postgis',
      label: 'PostGIS Database',
      port: 5432,
      composeDir: geoComposeDir,
      composeFile: geoComposeFile,
      required: false,
    },
    {
      name: 'calliope-geoserver',
      label: 'GeoServer (OSM Layers)',
      port: 8081,
      composeDir: geoComposeDir,
      composeFile: geoComposeFile,
      required: false,
    },
  ];
}

// ─── Port helper ───────────────────────────────────────────────────────────
/**
 * Find a free TCP port starting at `preferred`, scanning upward up to +20.
 * Returns `preferred` if it is already free, otherwise the first free port found.
 */
function findFreePort(preferred) {
  return new Promise((resolve, reject) => {
    let candidate = preferred;
    const tryNext = () => {
      if (candidate > preferred + 20) { reject(new Error(`No free port in range ${preferred}–${preferred + 20}`)); return; }
      const server = net.createServer();
      server.listen(candidate, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', () => { candidate++; tryNext(); });
    };
    tryNext();
  });
}

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

  // OSM pipeline: python with psycopg2/osmium/geopandas lives in osm-venv
  const osmPython = IS_WIN
    ? path.join(app.getPath('userData'), 'osm-venv', 'Scripts', 'python.exe')
    : path.join(app.getPath('userData'), 'osm-venv', 'bin', 'python3');

  // OSM data (PBF downloads + GeoJSON extracts) must be written to a writable
  // directory; in packaged mode resources/ is read-only so we use userData.
  const osmDataDir = path.join(app.getPath('userData'), 'osm_data');
  const osmScriptsRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..');

  console.log('[backend] Starting:', backendPath);
  if (!fs.existsSync(backendPath)) {
    console.warn('[backend] Not found at:', backendPath);
    return Promise.resolve();
  }

  backendProcess = spawn(backendPath, ['--port', BACKEND_PORT.toString(), '--db', dbPath], {
    shell: false,
    cwd: osmScriptsRoot,
    env: {
      ...process.env,
      TEMPO_OSM_PYTHON: osmPython,
      TEMPO_DATA_DIR:   osmDataDir,
      TEMPO_OSM_SCRIPTS: osmScriptsRoot,
    },
  });
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

    if (svc.name === 'ccssim') {
      try {
        execFileSync('docker', ['network', 'inspect', 'tempo-network'], { timeout: 6000, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch {
        try {
          emit('log', { line: 'Creating Docker network tempo-network…' });
          execFileSync('docker', ['network', 'create', 'tempo-network'], { timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (networkErr) {
          resolve({ success: false, error: `Failed to create Docker network tempo-network: ${networkErr.message}` });
          return;
        }
      }
    }

    const child = spawn('docker', ['compose', ...(svc.composeFile ? ['-f', svc.composeFile] : []), 'up', '-d', '--remove-orphans'], { cwd: svc.composeDir, shell: false });
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
  const composeServices = getDockerServices().filter(s => s.composeDir != null);
  for (const svc of composeServices) {
    results[svc.name] = await startDockerService(svc.name, 'docker:start-progress');
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('docker:start-progress', { type: 'done' });
  }
  return results;
});

// ─── IPC: Service URL registry ───────────────────────────────────────────────
ipcMain.handle('services:urls', async () => {
  const [c, o, h2, ccs, gs, be] = await Promise.all([
    isPortOpen(CALLIOPE_PORT), isPortOpen(8000), isPortOpen(8765), isPortOpen(8766), isPortOpen(8081), isPortOpen(BACKEND_PORT),
  ]);
  return {
    calliope:  { url: `http://localhost:${CALLIOPE_PORT}`, running: c   },
    opentech:  { url: 'http://localhost:8000',             running: o   },
    hydrogen:  { url: 'http://localhost:8765',             running: h2  },
    ccs:       { url: 'http://localhost:8766',             running: ccs },
    geoserver: { url: 'http://localhost:8081',             running: gs  },
    backend:   { url: `http://localhost:${BACKEND_PORT}`,  running: be  },
  };
});

// opentech-db base URL — override by setting TEMPO_TECH_API_URL at build/launch time
const TECH_API_URL = process.env.TEMPO_TECH_API_URL || 'http://localhost:8000';
ipcMain.handle('tech:api-url', () => TECH_API_URL);

// Backward compat — calliopeClient.js calls this
ipcMain.handle('calliope:service-url', async () => ({
  url:     `http://127.0.0.1:${CALLIOPE_PORT}`,
  running: await isPortOpen(CALLIOPE_PORT),
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

// ─── IPC: Setup version tracking ─────────────────────────────────────────────
// Shows the setup wizard whenever the user runs a *new* version of the app
// for the first time on this machine — even if the old env is still healthy.
function getSetupVersionFilePath() {
  return path.join(app.getPath('userData'), 'setup-version.json');
}

ipcMain.handle('setup:get-version', () => {
  const filePath = getSetupVersionFilePath();
  const currentVersion = app.getVersion();
  if (!fs.existsSync(filePath)) return { setupVersion: null, currentVersion };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return { setupVersion: data.setupVersion || null, currentVersion };
  } catch {
    return { setupVersion: null, currentVersion };
  }
});

ipcMain.handle('setup:mark-complete', () => {
  const record = { setupVersion: app.getVersion(), timestamp: new Date().toISOString() };
  try {
    fs.writeFileSync(getSetupVersionFilePath(), JSON.stringify(record, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
 * Only accepts 3.9–3.11 — calliope 0.6.8 is incompatible with 3.12+.
 */
function findSystemPython() {
  const candidates = IS_WIN ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const out = execFileSync(cmd, ['--version'], { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      if (/python 3\.[9](?:\D|$)|python 3\.1[01](?:\D|$)/i.test(out)) return cmd;
    } catch { /* continue */ }
  }
  return null;
}

// ─── Auto-install Python 3.11 on Windows ────────────────────────────────────

/**
 * Download Python 3.11.9 from the official NuGet package and extract it to
 * LocalAppData/TEMPO/python311. This avoids the flaky GUI installer path on
 * locked-down Windows machines and still provides a full interpreter with venv.
 * @param {Function} sendProgress
 * @returns {Promise<string>} path to python.exe
 */
async function downloadAndInstallPython311Win(sendProgress) {
  const https = require('https');
  const os    = require('os');

  const localAppData = process.env.LOCALAPPDATA || app.getPath('temp');
  const installDir = path.join(localAppData, 'TEMPO', 'python311');
  const pythonExe  = path.join(installDir, 'python.exe');
  const legacyInstallDir = path.join(app.getPath('userData'), 'python311');

  const getWinPythonCandidates = () => {
    const candidates = [
      pythonExe,
      path.join(installDir, 'Python311', 'python.exe'),
      path.join(installDir, 'tools', 'python.exe'),
      path.join(legacyInstallDir, 'python.exe'),
      path.join(legacyInstallDir, 'Python311', 'python.exe'),
      path.join(legacyInstallDir, 'tools', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python311-32', 'python.exe'),
    ];
    return [...new Set(candidates.filter(Boolean))];
  };

  const resolveInstalledPython311 = () => {
    for (const p of getWinPythonCandidates()) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const pyPath = execFileSync('py', ['-3.11', '-c', 'import sys; print(sys.executable)'],
        { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
      if (pyPath) return pyPath;
    } catch {
      // py launcher may not be installed; ignore
    }
    return null;
  };

  // Re-use a previous download if it's there and healthy
  const cachedPython = resolveInstalledPython311();
  if (cachedPython) {
    sendProgress({ type: 'log', line: `Using cached Python 3.11: ${cachedPython}` });
    return cachedPython;
  }

  fs.mkdirSync(installDir, { recursive: true });

  const PY_URL = 'https://www.nuget.org/api/v2/package/python/3.11.9';
  const tmpPkg = path.join(os.tmpdir(), 'tempo-python-3.11.9.nupkg');
  const tmpZip = path.join(os.tmpdir(), 'tempo-python-3.11.9.zip');

  sendProgress({ type: 'stage', label: 'Downloading Python 3.11.9…' });
  sendProgress({ type: 'log',   line: 'Source: nuget.org/package/python/3.11.9' });
  sendProgress({ type: 'log',   line: 'Size: ~35 MB — please wait…' });

  // Fetch with redirect support
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPkg);
    let downloaded = 0, lastPct = -10;

    function doGet(url) {
      const req = https.get(url, { timeout: 120_000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          req.destroy(); doGet(res.headers.location); return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading Python — check your internet connection`)); return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', chunk => {
          downloaded += chunk.length;
          const pct = total > 0 ? Math.floor(downloaded / total * 100) : 0;
          if (pct >= lastPct + 10) {
            lastPct = pct;
            sendProgress({ type: 'log', line: `  ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)` });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error',  reject);
        res.on('error',   reject);
      });
      req.on('error',   reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Python download timed out')); });
    }
    doGet(PY_URL);
  });

  sendProgress({ type: 'stage', label: 'Extracting Python 3.11.9 (no admin required)…' });
  sendProgress({ type: 'log',   line: `Target: ${installDir}` });

  const waitForPython = async (timeoutMs = 120_000) => {
    const deadline = Date.now() + timeoutMs;
    let found = null;
    while (!found && Date.now() < deadline) {
      found = resolveInstalledPython311();
      if (found) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    return found;
  };

  try {
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.mkdirSync(installDir, { recursive: true });
    fs.copyFileSync(tmpPkg, tmpZip);

    const ps = (s) => s.replace(/'/g, "''");
    const psCmd = `Expand-Archive -Path '${ps(tmpZip)}' -DestinationPath '${ps(installDir)}' -Force`;
    await new Promise((resolve, reject) => {
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { shell: false });
      let stderr = '';
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Python package extraction failed (exit ${code}): ${stderr.trim()}`));
      });
      child.on('error', err => reject(new Error(`Cannot run PowerShell for Python extraction: ${err.message}`)));
    });
  } finally {
    try { fs.unlinkSync(tmpPkg); } catch { /* ignore cleanup errors */ }
    try { fs.unlinkSync(tmpZip); } catch { /* ignore cleanup errors */ }
  }

  const foundPython = await waitForPython(30_000);

  if (!foundPython) {
    const checked = getWinPythonCandidates().join('\n  - ');
    throw new Error(
      'Python 3.11 installation completed but no interpreter was found in known locations.\n' +
      `Checked:\n  - ${checked}\n` +
      'Install Python 3.11 manually (Add Python to PATH), then click Retry.'
    );
  }

  sendProgress({ type: 'log', line: `✓ Python 3.11.9 installed: ${foundPython}` });
  return foundPython;
}

/**
 * Download the CBC 2.10.x solver binary for Windows and place it in targetDir.
 * Uses the official COIN-OR GitHub release.
 * @param {string} targetDir   Directory where cbc.exe will be placed.
 * @param {Function} sendProgress
 */
async function downloadCbcWin(targetDir, sendProgress) {
  const https = require('https');
  const os    = require('os');

  // COIN-OR CBC release asset naming changed across versions (releases. prefix, w64 vs win64).
  // Try candidates in preference order — first HTTP-200 wins.
  const CBC_CANDIDATES = [
    { version: '2.10.13', zip: 'Cbc-releases.2.10.13-w64-msvc17-md.zip' },
    { version: '2.10.12', zip: 'Cbc-releases.2.10.12-w64-msvc17-md.zip' },
    { version: '2.10.11', zip: 'Cbc-releases.2.10.11-w64-msvc17-md.zip' },
    { version: '2.10.10', zip: 'Cbc-releases.2.10.10-w64-msvc17-md.zip' },
  ];

  const cbcExeDst = path.join(targetDir, 'cbc.exe');

  // Re-use an already-downloaded binary
  if (fs.existsSync(cbcExeDst)) {
    sendProgress({ type: 'log', line: `CBC already present: ${cbcExeDst}` });
    return;
  }

  // Find the first candidate URL that actually exists (HEAD check)
  let chosen = null;
  for (const c of CBC_CANDIDATES) {
    const url = `https://github.com/coin-or/Cbc/releases/download/releases/${c.version}/${c.zip}`;
    sendProgress({ type: 'log', line: `Checking CBC ${c.version}…` });
    const ok = await new Promise(resolve => {
      const req = https.request(url, { method: 'HEAD', timeout: 10_000 }, res => {
        resolve(res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 301);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
    if (ok) { chosen = { ...c, url }; break; }
  }
  if (!chosen) throw new Error('No CBC binary found at any known URL — install manually via https://github.com/coin-or/Cbc/releases');

  const tmpZip     = path.join(os.tmpdir(), chosen.zip);
  const tmpExtract = path.join(os.tmpdir(), 'tempo-cbc-extract');

  sendProgress({ type: 'log', line: `Downloading CBC ${chosen.version} (~20 MB)…` });

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpZip);
    function doGet(url) {
      const req = https.get(url, { timeout: 120_000 }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { req.destroy(); doGet(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} downloading CBC`)); return; }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('CBC download timed out')); });
    }
    doGet(chosen.url);
  });

  sendProgress({ type: 'log', line: 'Extracting cbc.exe…' });
  fs.mkdirSync(targetDir, { recursive: true });

  // Use PowerShell's Expand-Archive (built into Windows 5.1+) to extract the zip
  const ps = (s) => s.replace(/'/g, "''"); // PowerShell single-quote escape
  const psCmd = [
    `if (Test-Path '${ps(tmpExtract)}') { Remove-Item '${ps(tmpExtract)}' -Recurse -Force }`,
    `Expand-Archive -Path '${ps(tmpZip)}' -DestinationPath '${ps(tmpExtract)}' -Force`,
    `$f = Get-ChildItem -Path '${ps(tmpExtract)}' -Filter 'cbc.exe' -Recurse | Select-Object -First 1`,
    `if ($f) { Copy-Item $f.FullName -Destination '${ps(cbcExeDst)}' -Force } else { exit 1 }`,
  ].join('; ');

  await new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { shell: false });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      try { if (fs.existsSync(tmpZip))     fs.unlinkSync(tmpZip);          } catch { /* ignore */ }
      try { if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { /* ignore */ }
      if (code === 0 && fs.existsSync(cbcExeDst)) resolve();
      else reject(new Error(`CBC extraction failed (exit ${code}): ${stderr.trim()}`));
    });
    child.on('error', err => reject(new Error(`Cannot run PowerShell for CBC extraction: ${err.message}`)));
  });

  sendProgress({ type: 'log', line: `✓ CBC ${chosen.version} installed: ${cbcExeDst}` });
}

/**
 * Resolve a Python 3.9–3.11 interpreter, auto-installing Python 3.11 on
 * Windows if no compatible version is present on the system PATH.
 * @param {Function} sendProgress
 * @returns {Promise<string>} path or command for the Python interpreter
 */
async function ensureCompatiblePython(sendProgress) {
  // Windows: try the py launcher so we can request a specific version
  if (IS_WIN) {
    for (const ver of ['3.11', '3.10', '3.9']) {
      try {
        const verOut = execFileSync('py', [`-${ver}`, '--version'],
          { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
        if (new RegExp(`Python ${ver.replace('.', '\\.')}`, 'i').test(verOut)) {
          const pyPath = execFileSync('py', [`-${ver}`, '-c', 'import sys; print(sys.executable)'],
            { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
          sendProgress({ type: 'log', line: `${verOut} → ${pyPath}` });
          return pyPath;
        }
      } catch { /* version not installed via py launcher */ }
    }
  }

  // Generic PATH search (3.9–3.11 only)
  const sysPy = findSystemPython();
  if (sysPy) {
    try {
      const verOut = execFileSync(sysPy, ['--version'],
        { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
      sendProgress({ type: 'log', line: `Found: ${verOut}` });
    } catch { /* ignore */ }
    return sysPy;
  }

  // Windows fallback: download + install Python 3.11 automatically
  if (IS_WIN) {
    sendProgress({ type: 'log', line: 'No Python 3.9–3.11 found on this machine — downloading Python 3.11.9…' });
    return downloadAndInstallPython311Win(sendProgress);
  }

  // Linux / macOS — tell the user what to install
  throw new Error(
    'Python 3.9–3.11 not found.\n' +
    'Install it, then relaunch TEMPO:\n' +
    '  Ubuntu/Debian: sudo apt-get install python3.11 python3.11-venv python3.11-pip\n' +
    '  macOS:         brew install python@3.11\n' +
    '  Other:         https://www.python.org/downloads/release/python-3119/',
  );
}

function getServicePaths() {
  const pythonDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'python')
    : path.join(__dirname, '..', 'python');
  return { pythonDir };
}

// ─── Simulation services (CCS + Hydrogen) — Python venv, no Docker ──────────

/**
 * Resolve the venv for a simulation service.
 * simId: 'ccssim' | 'hydrogensim'
 */
function resolveSimVenv(simId) {
  const binDir = IS_WIN ? 'Scripts' : 'bin';
  const pyExe  = IS_WIN ? 'python.exe' : 'python3';
  const venvDir = path.join(app.getPath('userData'), `${simId}-venv`);
  const python  = path.join(venvDir, binDir, pyExe);
  return { venvDir, python, exists: fs.existsSync(python) };
}

/**
 * Resolve the directory where main.py lives for a sim service.
 * Packaged: resources/ccssim or resources/hydrogensim
 * Dev: sibling folder ../ccssim or ../hydrogenmatsim
 */
function getSimSrcDir(simId) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, simId);
  }
  const devDir = simId === 'hydrogensim' ? 'hydrogenmatsim' : simId;
  return path.join(__dirname, '..', '..', devDir);
}

let _simIntentionalStop = false;

async function startSimService(simId, port, getRef, setRef) {
  if (await isPortOpen(port)) {
    console.log(`[${simId}] Already running on port ${port}`);
    return;
  }
  const { python, exists } = resolveSimVenv(simId);
  if (!exists) {
    console.log(`[${simId}] venv not ready — skipping autostart`);
    return;
  }
  const srcDir = getSimSrcDir(simId);
  if (!fs.existsSync(srcDir)) {
    console.warn(`[${simId}] Source directory not found: ${srcDir}`);
    return;
  }

  console.log(`[${simId}] Starting uvicorn on port ${port} from ${srcDir}`);
  const proc = spawn(python, [
    '-m', 'uvicorn', 'main:app',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--workers', '1',
    '--log-level', 'warning',
  ], { cwd: srcDir, shell: false });

  setRef(proc);
  proc.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) console.log(`[${simId}] ${l}`); });
  proc.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) console.log(`[${simId}] ${l}`); });
  proc.on('close', code => {
    console.log(`[${simId}] Exited: ${code}`);
    setRef(null);
    if (!_simIntentionalStop) {
      setTimeout(() => startSimService(simId, port, getRef, setRef).catch(e => console.warn(`[${simId}] Restart failed:`, e)), 5000);
    }
  });

  try { await waitForPort(port, 15000); console.log(`[${simId}] Ready on port ${port}`); }
  catch { console.warn(`[${simId}] Did not start within 15 s — continuing anyway`); }
}

function stopSimServices() {
  _simIntentionalStop = true;
  if (ccsSimService)      { ccsSimService.kill();      ccsSimService      = null; }
  if (hydrogenSimService) { hydrogenSimService.kill();  hydrogenSimService = null; }
}

async function startAllSimServices() {
  _simIntentionalStop = false;
  await Promise.all([
    startSimService('ccssim',      8766, () => ccsSimService,      p => { ccsSimService      = p; }),
    startSimService('hydrogensim', 8765, () => hydrogenSimService, p => { hydrogenSimService = p; }),
  ]);
}

// ─── IPC: Simulation service management ──────────────────────────────────────

ipcMain.handle('sim:check', async () => {
  const ccs = resolveSimVenv('ccssim');
  const h2  = resolveSimVenv('hydrogensim');
  const [ccsPort, h2Port] = await Promise.all([isPortOpen(8766), isPortOpen(8765)]);
  return {
    ccssim:      { venvExists: ccs.exists, running: ccsPort  },
    hydrogensim: { venvExists: h2.exists,  running: h2Port   },
  };
});

ipcMain.handle('sim:restart', async () => {
  stopSimServices();
  await new Promise(r => setTimeout(r, 1500));
  await startAllSimServices();
  const [ccsPort, h2Port] = await Promise.all([isPortOpen(8766), isPortOpen(8765)]);
  return { ccssim: ccsPort, hydrogensim: h2Port };
});

// ─── Calliope service (FastAPI / uvicorn) ────────────────────────────────────
let _svcIntentionalStop = false;  // set true before deliberate kills so no restart happens
let _svcRestartCount    = 0;
const _SVC_MAX_RESTARTS = 5;

/**
 * Start the persistent Calliope FastAPI service.
 * Used only when NOT relying on Docker (i.e. direct venv mode).
 */
async function startCalliopeService() {
  _svcIntentionalStop = false;
  _svcRestartCount    = 0;
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

  // Platform-specific solver directory (bundled with app)
  const solverSubdir = IS_WIN ? 'windows' : IS_LINUX ? 'linux' : '';
  const solverDir = solverSubdir
    ? (app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'solvers', solverSubdir)
      : path.join(__dirname, '..', 'solvers', solverSubdir))
    : null;

  // User-downloaded solver directory (e.g. CBC downloaded via setup screen)
  const userSolverDir = solverSubdir
    ? path.join(app.getPath('userData'), 'solvers', solverSubdir)
    : null;

  const childEnv = { ...process.env };
  // Prepend bundled solver dir, then user solver dir, to PATH
  const solverDirs = [solverDir, userSolverDir].filter(d => d && fs.existsSync(d));
  if (solverDirs.length > 0) {
    childEnv.PATH = solverDirs.join(path.delimiter) + path.delimiter + (childEnv.PATH || '');
    // Tell calliope_runner.py where to find solvers
    childEnv.CALLIOPE_SOLVER_DIR = solverDirs[0];
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
  calliopeService.on('close', code => {
    console.log(`[calliope-svc] Exited: ${code}`);
    calliopeService = null;
    if (!_svcIntentionalStop && _svcRestartCount < _SVC_MAX_RESTARTS) {
      _svcRestartCount++;
      const delay = Math.min(2000 * _svcRestartCount, 10000);
      console.log(`[calliope-svc] Unexpected exit — restarting in ${delay}ms (attempt ${_svcRestartCount}/${_SVC_MAX_RESTARTS})`);
      setTimeout(() => startCalliopeService().catch(e => console.warn('[calliope-svc] Restart failed:', e)), delay);
    }
  });

  try {
    await waitForPort(CALLIOPE_PORT, 15000);
    console.log('[calliope-svc] Ready on port', CALLIOPE_PORT);
  } catch {
    console.warn('[calliope-svc] Did not start within 15 s — continuing anyway');
  }
}

function stopCalliopeService() {
  _svcIntentionalStop = true;
  if (calliopeService) { calliopeService.kill(); calliopeService = null; }
}

// ─── IPC: Calliope service management ───────────────────────────────────────

ipcMain.handle('calliope:check', async () => {
  const { python, exists, venvDir } = resolveVenv();
  const serviceRunning = await isPortOpen(CALLIOPE_PORT);

  // Deep health check: verify the packages that actually fail at runtime.
  // "import calliope" alone is NOT sufficient — it succeeds even with
  // ruamel.yaml 0.18+ or missing jinja2, because safe_load is only called
  // when calliope reads a YAML file, not at module import time.
  let importOk = false;
  if (exists && fs.existsSync(python)) {
    try {
      execFileSync(python, ['-c',
        'import calliope, jinja2, ruamel.yaml as ry;' +
        'assert hasattr(ry, "safe_load"), ' +
          'f"ruamel.yaml {ry.version_info} incompatible (>= 0.18, safe_load removed)";' +
        'print("ok", calliope.__version__)'
      ], { timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
      importOk = true;
    } catch { importOk = false; }
  }

  return { envExists: importOk, venvPath: importOk ? venvDir : null, serviceRunning, platform: process.platform };
});

ipcMain.handle('calliope:install', async (_event, selectedModules = ['calliope'], downloadSolvers = false) => {
  const sendProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('calliope:install-progress', data);
  };

  // Verify imports expected per module
  const MODULE_VERIFY = {
    calliope: 'import calliope; print("calliope", calliope.__version__)',
    pypsa:    'import pypsa;    print("pypsa",    pypsa.__version__)',
    adopt:    'import adopt;    print("adopt OK")',
  };

  try {
    sendProgress({ type: 'stage', label: 'Locating Python 3.9–3.11…' });

    // ensureCompatiblePython resolves a Python 3.9–3.11 binary.
    // On Windows it auto-downloads Python 3.11 if no compatible version is found.
    const systemPython = await ensureCompatiblePython(sendProgress);

    // ── Always install to userData ──────────────────────────────────────
    // NEVER write to the app resources dir — it's in Program Files on some
    // machines and the path may change across installer upgrades.
    const venvDir = path.join(app.getPath('userData'), 'calliope-venv');
    const binDir  = IS_WIN ? 'Scripts' : 'bin';
    const pyExe   = IS_WIN ? 'python.exe' : 'python3';
    const venvPython = path.join(venvDir, binDir, pyExe);

    // Stop the running service BEFORE touching the venv.
    // On Windows, a running Python process holds file handles; rmSync would
    // silently skip locked files and leave a half-deleted corrupted venv.
    sendProgress({ type: 'log', line: 'Stopping any running Calliope service…' });
    stopCalliopeService();
    await new Promise(r => setTimeout(r, 2000)); // give Windows time to release handles

    // Wipe ALL known venv locations so there is no stale venv for resolveVenv()
    // to find on the next startup (e.g. old resources-dir venv from a prior version).
    const allVenvCandidates = [
      venvDir,  // userData/calliope-venv (primary target)
      app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', '.venv-calliope')
        : path.join(__dirname, '..', '.venv-calliope'),
    ];
    for (const loc of allVenvCandidates) {
      if (!fs.existsSync(loc)) continue;
      sendProgress({ type: 'log', line: `Removing old environment: ${path.basename(loc)}…` });
      // On Windows use cmd /c rmdir which works even with some locked handles,
      // unlike Node's rmSync which silently skips locked files.
      if (IS_WIN) {
        try {
          execFileSync('cmd', ['/c', 'rmdir', '/s', '/q', loc],
            { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) {
          sendProgress({ type: 'log', line: `⚠ rmdir warning: ${e.message}` });
        }
      } else {
        try { fs.rmSync(loc, { recursive: true, force: true }); } catch (e) {
          sendProgress({ type: 'log', line: `⚠ Remove warning: ${e.message}` });
        }
      }
      if (fs.existsSync(loc)) {
        sendProgress({ type: 'log', line: `⚠ ${loc} still exists after delete — some files may be locked by another process. Close all Python windows and click Retry.` });
      }
    }

    sendProgress({ type: 'stage', label: 'Creating fresh Python environment…' });
    sendProgress({ type: 'log', line: `Location: ${venvDir}` });
    fs.mkdirSync(path.dirname(venvDir), { recursive: true }); // ensure parent exists

    // ── Collect recent lines for error context ─────────────────────────────
    const recentLines = [];
    // PIP_PREFER_BINARY and PIP_NO_CACHE_DIR are env vars that pip reads in
    // EVERY invocation — including pip sub-processes spawned inside PEP-517
    // build isolation environments (where CLI flags like --prefer-binary never
    // reach).  This is the only reliable way to prevent source builds there.
    const pipEnv = {
      ...process.env,
      PIP_PREFER_BINARY: '1',
      PIP_NO_CACHE_DIR: '1',
    };
    const runChild = (cmd, args, label) => new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { shell: false, env: pipEnv });
      const onLine = l => {
        recentLines.push(l);
        if (recentLines.length > 50) recentLines.shift();
        sendProgress({ type: 'log', line: l });
      };
      child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) onLine(l); });
      child.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) onLine(l); });
      child.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          const tail = recentLines.slice(-10).join('\n');
          reject(new Error(`${label} failed (exit ${code})\n\n${tail}`));
        }
      });
      child.on('error', err => reject(new Error(`${label} could not start: ${err.message}`)));
    });

    // ── Create venv ────────────────────────────────────────────────────────
    await runChild(systemPython, ['-m', 'venv', '--clear', venvDir], 'venv creation');

    // Ensure pip is bootstrapped in the new venv (some Windows installs omit it)
    try {
      await runChild(venvPython, ['-m', 'ensurepip', '--upgrade'], 'ensurepip');
    } catch { /* non-fatal — pip may already be present */ }

    sendProgress({ type: 'stage', label: 'Upgrading build tools…' });
    recentLines.length = 0;
    await runChild(venvPython, [
      '-m', 'pip', 'install', '--upgrade', '--quiet',
      'pip', 'setuptools', 'wheel',
    ], 'pip/setuptools/wheel upgrade');

    const { pythonDir } = getServicePaths();
    // --prefer-binary  → prefer wheels over source distributions
    // --no-cache-dir   → ignore any cached (possibly corrupt) source builds from prior attempts
    const pipFlags = ['--prefer-binary', '--no-warn-script-location', '--no-cache-dir'];

    // ── Service layer (FastAPI + uvicorn) — always installed ────────────────
    sendProgress({ type: 'stage', label: 'Installing service layer…' });
    recentLines.length = 0;
    await runChild(venvPython, [
      '-m', 'pip', 'install', ...pipFlags,
      '-r', path.join(pythonDir, 'requirements.service.txt'),
    ], 'pip install (service layer)');

    // ── Selected modules ──────────────────────────────────────────────────
    for (const moduleId of selectedModules) {
      const reqFile = path.join(pythonDir, `requirements.${moduleId}.txt`);
      if (!fs.existsSync(reqFile)) {
        sendProgress({ type: 'log', line: `⚠ No requirements file for "${moduleId}" — skipping` });
        continue;
      }

      if (moduleId === 'calliope') {
        // calliope 0.6.8's PyPI metadata declares numpy<1.21.  numpy 1.20-1.22
        // ships no cp311-win_amd64 wheels, so pip would attempt a source build
        // and fail (requires MSVC).  We bypass this permanently by:
        //   1. Installing all of calliope's runtime deps from requirements.calliope.txt
        //      (which lists them with modern, wheel-friendly pin ranges and does NOT
        //      include calliope itself).
        //   2. Installing calliope with --no-deps so pip never reads or applies the
        //      broken numpy<1.21 constraint from calliope's own metadata.
        sendProgress({ type: 'stage', label: 'Installing calliope dependencies…' });
        recentLines.length = 0;
        await runChild(venvPython, [
          '-m', 'pip', 'install', ...pipFlags,
          '-r', reqFile,
        ], 'pip install (calliope deps)');
        sendProgress({ type: 'stage', label: 'Aligning numeric stack…' });
        sendProgress({ type: 'log', line: 'Pinning NumPy/Pandas/SciPy to a known Calliope-compatible wheel set…' });
        recentLines.length = 0;
        await runChild(venvPython, [
          '-m', 'pip', 'install',
          '--upgrade',
          '--force-reinstall',
          '--no-cache-dir',
          'numpy==1.23.5',
          'pandas==1.5.3',
          'scipy==1.10.1',
        ], 'numeric stack alignment');
        sendProgress({ type: 'stage', label: 'Installing calliope…' });
        sendProgress({ type: 'log', line: 'Using --no-deps to bypass outdated numpy<1.21 constraint in calliope metadata…' });
        recentLines.length = 0;
        await runChild(venvPython, [
          '-m', 'pip', 'install', '--no-deps', '--no-cache-dir',
          'calliope==0.6.8',
        ], 'pip install calliope (no-deps)');
      } else {
        sendProgress({ type: 'stage', label: `Installing ${moduleId}…` });
        recentLines.length = 0;
        await runChild(venvPython, [
          '-m', 'pip', 'install', ...pipFlags,
          '-r', reqFile,
        ], `pip install (${moduleId})`);
      }
    }

    // ── HiGHS solver (required for Calliope default) ───────────────────────
    if (selectedModules.includes('calliope')) {
      sendProgress({ type: 'log', line: 'Installing HiGHS solver…' });

      // Some locked-down Windows machines fail to load the newest highspy wheel
      // at runtime (ImportError: DLL load failed while importing _core).
      // Try a small list of known-good 1.x wheels and keep the first that imports.
      const highspyCandidates = [
        'highspy>=1.5,<2.0',
        'highspy==1.7.2',
        'highspy==1.5.3',
      ];

      let highspyOk = false;
      let highspyLastErr = '';
      for (const spec of highspyCandidates) {
        sendProgress({ type: 'log', line: `  Trying ${spec}…` });
        try {
          await runChild(venvPython, [
            '-m', 'pip', 'install',
            '--no-deps',
            '--only-binary=highspy',
            '--upgrade',
            '--force-reinstall',
            '--no-cache-dir',
            '--quiet',
            spec,
          ], `highspy install (${spec})`);

          recentLines.length = 0;
          await runChild(venvPython, ['-c', 'import highspy; print("highspy-import-ok", getattr(highspy, "__file__", "module"))'], `highspy import check (${spec})`);
          sendProgress({ type: 'log', line: `✓ HiGHS solver installed and importable (${spec})` });
          highspyOk = true;
          break;
        } catch (e) {
          highspyLastErr = e?.message || String(e);
          sendProgress({ type: 'log', line: `  ${spec} failed: ${highspyLastErr.split('\n')[0]}` });
        }
      }

      if (!highspyOk) {
        throw new Error(
          'HiGHS installation failed on this machine. highspy is installed but cannot load its native DLLs.\n\n' +
          `${highspyLastErr}\n\n` +
          'Install the Microsoft Visual C++ 2015-2022 Redistributable (x64) and retry setup.'
        );
      }
    }

    // ── Download CBC solver (optional — Windows only) ─────────────────────
    if (downloadSolvers && IS_WIN && selectedModules.includes('calliope')) {
      sendProgress({ type: 'stage', label: 'Downloading CBC solver…' });
      const cbcTargetDir = path.join(app.getPath('userData'), 'solvers', 'windows');
      try {
        await downloadCbcWin(cbcTargetDir, sendProgress);
      } catch (cbcErr) {
        sendProgress({ type: 'log', line: `⚠ CBC download failed: ${cbcErr.message}` });
        sendProgress({ type: 'log', line: '  HiGHS (via highspy) will be used instead — no action needed.' });
      }
    }

    // ── Verification ──────────────────────────────────────────────────────
    sendProgress({ type: 'stage', label: 'Verifying installation…' });
    const verifyStatements = selectedModules
      .map(m => MODULE_VERIFY[m])
      .filter(Boolean);
    if (verifyStatements.length > 0) {
      recentLines.length = 0;
      await runChild(venvPython, ['-c', verifyStatements.join('; ')], 'verification');
    }

    if (selectedModules.includes('calliope')) {
      const solverVerification = [
        'import highspy',
        'import pyomo.environ',
        'from pyomo.opt import SolverFactory',
        's = SolverFactory("appsi_highs")',
        'ok = type(s).__name__ != "UnknownSolver" and getattr(s, "available", lambda **kwargs: False)(exception_flag=False) is True',
        'assert ok, "appsi_highs registered but unavailable"',
        'print("solver-ok", "appsi_highs", getattr(highspy, "__file__", "module"))',
      ].join('; ');
      recentLines.length = 0;
      await runChild(venvPython, ['-c', solverVerification], 'solver verification');
    }

    // ── Start Calliope service ────────────────────────────────────────────
    if (selectedModules.includes('calliope')) {
      sendProgress({ type: 'stage', label: 'Starting Calliope service…' });
      await startCalliopeService();
    }

    // ── Install simulation services (CCS + Hydrogen) ──────────────────────
    // These are independent FastAPI services; each gets its own venv in userData.
    const simDefs = [
      { id: 'ccssim',      label: 'CCS Simulation',      port: 8766 },
      { id: 'hydrogensim', label: 'Hydrogen Simulation',  port: 8765 },
    ];
    for (const sim of simDefs) {
      sendProgress({ type: 'stage', label: `Installing ${sim.label} service…` });
      try {
        const simVenvDir  = path.join(app.getPath('userData'), `${sim.id}-venv`);
        const simVenvPy   = path.join(simVenvDir, IS_WIN ? 'Scripts' : 'bin', IS_WIN ? 'python.exe' : 'python3');
        const simReqFile  = path.join(pythonDir, `requirements.${sim.id}.txt`);

        // Create fresh venv for this sim
        await runChild(systemPython, ['-m', 'venv', '--clear', simVenvDir], `${sim.id} venv creation`);
        try { await runChild(simVenvPy, ['-m', 'ensurepip', '--upgrade'], `${sim.id} ensurepip`); } catch { /* non-fatal */ }
        await runChild(simVenvPy, ['-m', 'pip', 'install', '--upgrade', '--quiet', 'pip', 'setuptools', 'wheel'], `${sim.id} pip upgrade`);

        if (fs.existsSync(simReqFile)) {
          await runChild(simVenvPy, ['-m', 'pip', 'install', '--prefer-binary', '--no-cache-dir', '-r', simReqFile], `${sim.id} deps`);
        } else {
          sendProgress({ type: 'log', line: `⚠ No requirements file for ${sim.id} — skipping pip install` });
        }

        // Verify import
        await runChild(simVenvPy, ['-c', 'import fastapi, uvicorn; print("sim-ok fastapi uvicorn")'], `${sim.id} verify`);
        sendProgress({ type: 'log', line: `✓ ${sim.label} service installed` });

        // Auto-start the service
        sendProgress({ type: 'stage', label: `Starting ${sim.label}…` });
        await startSimService(sim.id, sim.port, () => (sim.id === 'ccssim' ? ccsSimService : hydrogenSimService), p => { if (sim.id === 'ccssim') ccsSimService = p; else hydrogenSimService = p; });
      } catch (simErr) {
        sendProgress({ type: 'log', line: `⚠ ${sim.label} install failed: ${(simErr.message || String(simErr)).split('\n')[0]}` });
        sendProgress({ type: 'log', line: `  ${sim.label} will use local fallback physics — no action needed` });
      }
    }

    // ── Install OSM processing venv ───────────────────────────────────────
    // Separate venv because osm_processing needs numpy>=1.24 (conflicts with
    // calliope's pinned numpy==1.23.5) plus osmium, geopandas, psycopg2-binary.
    sendProgress({ type: 'stage', label: 'Installing OSM processing tools…' });
    try {
      const osmVenvDir = path.join(app.getPath('userData'), 'osm-venv');
      const osmVenvPy  = path.join(osmVenvDir, IS_WIN ? 'Scripts' : 'bin', IS_WIN ? 'python.exe' : 'python3');
      const osmReqFile = path.join(pythonDir, 'requirements.osm.txt');
      const osmDataDir = path.join(app.getPath('userData'), 'osm_data');
      const osmExtractsDir = path.join(osmDataDir, 'osm_extracts');
      const dbDst = path.join(osmExtractsDir, 'regions_database.json');
      const dbSrc = app.isPackaged
        ? path.join(process.resourcesPath, 'osm_processing', 'geofabrik_regions_database.json')
        : path.join(__dirname, '..', 'osm_processing', 'geofabrik_regions_database.json');

      fs.mkdirSync(osmExtractsDir, { recursive: true });
      if (!fs.existsSync(dbDst) && fs.existsSync(dbSrc)) {
        fs.copyFileSync(dbSrc, dbDst);
        sendProgress({ type: 'log', line: 'Seeded OSM regions database' });
      }

      await runChild(systemPython, ['-m', 'venv', '--clear', osmVenvDir], 'osm-venv creation');
      try { await runChild(osmVenvPy, ['-m', 'ensurepip', '--upgrade'], 'osm ensurepip'); } catch { /* non-fatal */ }
      await runChild(osmVenvPy, ['-m', 'pip', 'install', '--upgrade', '--quiet', 'pip', 'setuptools', 'wheel'], 'osm pip upgrade');

      if (fs.existsSync(osmReqFile)) {
        await runChild(osmVenvPy, ['-m', 'pip', 'install', '--prefer-binary', '--no-cache-dir', '-r', osmReqFile], 'osm deps');
      }

      await runChild(osmVenvPy, ['-c', 'import psycopg2, requests; print("osm-ok")'], 'osm verify');
      sendProgress({ type: 'log', line: '✓ OSM processing tools installed' });
    } catch (osmErr) {
      sendProgress({ type: 'log', line: `⚠ OSM tools install failed: ${(osmErr.message || String(osmErr)).split('\n')[0]}` });
      sendProgress({ type: 'log', line: '  OSM download will fall back to Overpass API — no action needed' });
    }

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
  stopSimServices();
  stopBackend();
}

app.whenReady().then(async () => {
  // ── OSM tile / Nominatim policy compliance ─────────────────────────────
  // Electron loads pages from file:// which sends no Referer header.
  // OSM tile servers and Nominatim REQUIRE a valid Referer + User-Agent per
  // their tile usage policy and Nominatim usage policy:
  //   https://operations.osmfoundation.org/policies/tiles/
  //   https://operations.osmfoundation.org/policies/nominatim/
  // Without a Referer the tile CDN returns 403.  We inject at the network
  // layer so every tile/geocode request from any renderer component is
  // compliant automatically — no per-component changes needed.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://*.tile.openstreetmap.org/*',
        'https://tile.openstreetmap.org/*',
        'https://nominatim.openstreetmap.org/*',
        'https://*.basemaps.cartocdn.com/*',
        'https://*.tile.opentopomap.org/*',
        'https://server.arcgisonline.com/*',
      ],
    },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          Referer: 'https://www.openstreetmap.org/',
          'User-Agent': `TEMPO-Energy-Tool/${app.getVersion()} (https://tempo-energy.app)`,
        },
      });
    },
  );

  // Allocate free ports before starting services so we don't collide with
  // other applications that may already be using the default ports.
  try { BACKEND_PORT  = await findFreePort(BACKEND_PORT);  } catch { /* keep default */ }
  try { CALLIOPE_PORT = await findFreePort(CALLIOPE_PORT); } catch { /* keep default */ }
  console.log(`[ports] backend=${BACKEND_PORT}  calliope=${CALLIOPE_PORT}`);

  await startBackend();
  // Start native calliope service (no-op if venv not installed yet)
  startCalliopeService().catch(err => console.warn('[calliope-svc] autostart error:', err.message));
  // Start simulation services (no-op if venvs not installed yet)
  startAllSimServices().catch(err => console.warn('[sim-svc] autostart error:', err.message));
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
