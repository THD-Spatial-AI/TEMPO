const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

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
 * The directory where the app will install its own private Miniconda.
 * Lives in Electron's userData so it survives app updates and is writable.
 */
function getMinicondaInstallDir() {
  return path.join(app.getPath('userData'), 'miniconda3');
}

/**
 * Find the conda executable on the current platform.
 * First checks the app-managed install, then common system-wide locations.
 * Returns the full path string or null if not found.
 */
function findConda() {
  const isWin = process.platform === 'win32';
  const home = os.homedir();
  const appMiniconda = getMinicondaInstallDir();

  const candidates = isWin
    ? [
        // App-managed install (highest priority)
        path.join(appMiniconda, 'Scripts', 'conda.exe'),
        // Common user installs
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
        // App-managed install (highest priority)
        path.join(appMiniconda, 'bin', 'conda'),
        // Common user installs
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

/**
 * Download a file from a URL, following redirects.
 * @param {string} url
 * @param {string} dest  Absolute path to save to
 * @param {function} onLog  Called with progress strings
 */
function downloadFile(url, dest, onLog) {
  return new Promise((resolve, reject) => {
    const doGet = (currentUrl) => {
      const proto = currentUrl.startsWith('https') ? https : http;
      const req = proto.get(currentUrl, (res) => {
        // Follow redirects (301, 302, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          onLog(`Redirecting to ${res.headers.location}`);
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastPct = -1;

        const file = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              lastPct = pct;
              onLog(`Downloading Miniconda... ${pct}% (${Math.round(downloaded / 1024 / 1024)} / ${Math.round(total / 1024 / 1024)} MB)`);
            }
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
      });
      req.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
    };
    doGet(url);
  });
}

/**
 * Download and silently install Miniconda into getMinicondaInstallDir().
 */
async function ensureMiniconda(sendProgress) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const installDir = getMinicondaInstallDir();

  const url = isWin
    ? 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe'
    : isMac
      ? 'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh'
      : 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh';

  const tmpInstaller = path.join(os.tmpdir(), isWin ? 'miniconda_setup.exe' : 'miniconda_setup.sh');

  sendProgress({ type: 'log', line: 'Downloading Miniconda installer…' });
  await downloadFile(url, tmpInstaller, (line) => sendProgress({ type: 'log', line }));
  sendProgress({ type: 'log', line: 'Download complete. Running installer…' });

  await new Promise((resolve, reject) => {
    let child;
    if (isWin) {
      // Silent install: /S = silent, /D = install directory (must be last arg)
      child = spawn(tmpInstaller, ['/S', `/D=${installDir}`], { shell: false });
    } else {
      // Silent install: -b = batch mode (no prompts), -p = install prefix
      fs.chmodSync(tmpInstaller, '755');
      child = spawn('bash', [tmpInstaller, '-b', '-p', installDir], { shell: false });
    }

    child.stdout.on('data', d => {
      for (const l of d.toString().split('\n').filter(x => x.trim()))
        sendProgress({ type: 'log', line: l });
    });
    child.stderr.on('data', d => {
      for (const l of d.toString().split('\n').filter(x => x.trim()))
        sendProgress({ type: 'log', line: l });
    });
    child.on('close', code => {
      try { fs.unlinkSync(tmpInstaller); } catch (_) {}
      if (code === 0) resolve();
      else reject(new Error(`Miniconda installer exited with code ${code}`));
    });
    child.on('error', reject);
  });

  sendProgress({ type: 'log', line: 'Miniconda installed successfully.' });
}

// ─── Calliope IPC handlers ─────────────────────────────────────────────────

/**
 * calliope:check
 * → { condaFound: bool, envExists: bool, version: string|null, condaPath: string|null }
 *
 * Uses `conda env list` (fast, no Python startup) to detect the environment,
 * with a 20-second timeout so it never hangs the setup screen.
 */
ipcMain.handle('calliope:check', async () => {
  const conda = findConda();
  if (!conda) {
    return { condaFound: false, envExists: false, version: null, condaPath: null };
  }

  return new Promise(resolve => {
    // Use `conda env list` — it merely reads directory listings, executes in
    // under 2 seconds even on first run, and never hangs.
    const child = spawn(conda, ['env', 'list', '--json'], { shell: false });

    let stdout = '';
    let timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      // Timed out → assume env does not exist so setup runs
      resolve({ condaFound: true, envExists: false, version: null, condaPath: conda });
    }, 20000);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ condaFound: true, envExists: false, version: null, condaPath: conda });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const envs = parsed.envs || [];
        // Any path that ends with /calliope or \calliope (or is named calliope)
        const envExists = envs.some(p =>
          p.toLowerCase().endsWith(`${path.sep}calliope`) ||
          p.toLowerCase().endsWith('/calliope')
        );
        resolve({ condaFound: true, envExists, version: envExists ? 'installed' : null, condaPath: conda });
      } catch (_) {
        // JSON parse failed — fall back to plain text scan
        const envExists = stdout.toLowerCase().includes(`${path.sep}calliope`) ||
                          stdout.toLowerCase().includes('/calliope');
        resolve({ condaFound: true, envExists, version: null, condaPath: conda });
      }
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ condaFound: true, envExists: false, version: null, condaPath: conda });
    });
  });
});

/**
 * calliope:install
 * Full zero-touch setup pipeline:
 *   1. If conda not found → download + silent-install Miniconda into userData
 *   2. Create (or recreate) the "calliope" conda env with Calliope + HiGHS solver
 *
 * Streams progress via calliope:install-progress events:
 *   { type: 'log',   line: string }
 *   { type: 'stage', label: string }   ← friendly step label
 *   { type: 'done'                  }
 *   { type: 'error', error: string  }
 * → { success: bool, error?: string }
 */
ipcMain.handle('calliope:install', async () => {
  const sendProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('calliope:install-progress', data);
    }
  };

  try {
    // ── Step 1: Ensure conda ──────────────────────────────────────────
    let conda = findConda();
    if (!conda) {
      sendProgress({ type: 'stage', label: 'Downloading Miniconda…' });
      await ensureMiniconda(sendProgress);
      conda = findConda();
      if (!conda) throw new Error('Miniconda installation succeeded but conda executable was not found. Please restart the app.');
    } else {
      sendProgress({ type: 'log', line: `conda found at: ${conda}` });
    }

    // ── Step 2: Create calliope env with Calliope + HiGHS ────────────
    sendProgress({ type: 'stage', label: 'Installing Calliope & HiGHS solver…' });
    sendProgress({ type: 'log', line: 'Creating conda environment "calliope" (this takes a few minutes)…' });

    await new Promise((resolve, reject) => {
      const child = spawn(conda, [
        'create', '-y', '-n', 'calliope',
        '-c', 'conda-forge',
        'python=3.9',
        'calliope=0.6.8',  // calliope_runner.py targets the 0.6.x API
        'coin-or-cbc',     // CBC open-source LP/MIP solver (free, no licence)
        'pyomo>=6.4',      // 6.4+ required for HiGHS support in Pyomo
      ], { shell: false });

      child.stdout.on('data', d => {
        for (const l of d.toString().split('\n').filter(x => x.trim()))
          sendProgress({ type: 'log', line: l });
      });
      child.stderr.on('data', d => {
        for (const l of d.toString().split('\n').filter(x => x.trim()))
          sendProgress({ type: 'log', line: l });
      });
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`conda create exited with code ${code}`));
      });
      child.on('error', reject);
    });

    // ── Step 3: Verify the install ────────────────────────────────────
    sendProgress({ type: 'stage', label: 'Verifying installation…' });
    await new Promise((resolve, reject) => {
      const child = spawn(conda, [
        'run', '-n', 'calliope', '--no-capture-output',
        'python', '-c', 'import calliope; import pyomo.environ; print("OK calliope", calliope.__version__)',
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

    sendProgress({ type: 'done' });
    return { success: true };

  } catch (err) {
    const msg = err.message || String(err);
    sendProgress({ type: 'error', error: msg });
    return { success: false, error: msg };
  }
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
  const payload = { ...modelData, solver: solver || 'cbc' };
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

  // Prepend the bundled solver directory so calliope_runner finds cbc.exe
  // even if the user's conda env doesn't have coin-or-cbc installed.
  const solverDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'solvers', 'windows')
    : path.join(__dirname, '..', 'solvers', 'windows');

  const childEnv = Object.assign({}, process.env);
  if (fs.existsSync(solverDir)) {
    childEnv.PATH = solverDir + path.delimiter + (childEnv.PATH || '');
    childEnv.CALLIOPE_SOLVER_DIR = solverDir;
  }

  const child = spawn(conda, [
    'run', '-n', 'calliope', '--no-capture-output',
    'python', runnerPath, inputFile, outputFile,
  ], { shell: false, env: childEnv });

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

/**
 * Check whether a local TCP port is accepting connections.
 */
function isPortOpen(port) {
  const net = require('net');
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

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

app.whenReady().then(async () => {
  await startBackend();
  await createWindow();
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
