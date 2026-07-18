// Config-driven lifecycle for the optional Python engine services
// (Calliope 0.7, AdOpT-NET0, PyPSA, OSeMOSYS).
//
// Every engine follows the same lifecycle: resolve its isolated venv in
// userData, spawn a uvicorn FastAPI service, auto-restart on crash, and
// expose `<id>:service-url` / `<id>:check` / `<id>:install` /
// `<id>:restart-service` IPC handlers. createEngineService() implements
// that lifecycle once; each engine in main.cjs is just a spec object.
//
// Calliope 0.6.8 is NOT managed here — its install flow (HiGHS fallback
// loop, CBC download option, sim + OSM venv installs) is engine-specific
// and stays in main.cjs.
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const MAX_RESTARTS = 5;

// ─── System Python discovery ────────────────────────────────────────────────

/**
 * Find a Python 3.10+ interpreter (calliope 0.7 requires >=3.10).
 * A 3.10/3.11 interpreter can serve both engines' venvs.
 */
function findSystemPython310Plus() {
  if (IS_WIN) {
    for (const ver of ['3.11', '3.12', '3.10', '3.13']) {
      try {
        const out = execFileSync('py', [`-${ver}`, '--version'],
          { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        if (new RegExp(`Python ${ver.replace('.', '\\.')}`, 'i').test(out)) {
          return execFileSync('py', [`-${ver}`, '-c', 'import sys; print(sys.executable)'],
            { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
        }
      } catch { /* version not installed via py launcher */ }
    }
  }

  const candidates = IS_WIN
    ? ['python3.11', 'python3.12', 'python3.10', 'python3.13', 'python', 'python3']
    : ['python3.11', 'python3.12', 'python3.10', 'python3.13', 'python3', 'python'];
  for (const cmd of candidates) {
    try {
      const out = execFileSync(cmd, ['--version'],
        { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      if (/python 3\.1[0-9](?:\D|$)|python 3\.[2-9]\d(?:\D|$)/i.test(out)) return cmd;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Find a Python 3.12+ interpreter on the system PATH.
 * Returns the command/path string, or null if none found.
 */
function findSystemPython312Plus() {
  // Windows py launcher — try specific versions first
  if (IS_WIN) {
    for (const ver of ['3.13', '3.12']) {
      try {
        const out = execFileSync('py', [`-${ver}`, '--version'],
          { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        if (new RegExp(`Python ${ver.replace('.', '\\.')}`, 'i').test(out)) {
          return execFileSync('py', [`-${ver}`, '-c', 'import sys; print(sys.executable)'],
            { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
        }
      } catch { /* version not installed via py launcher */ }
    }
  }

  // Generic PATH search
  const candidates = IS_WIN ? ['python3.12', 'python3.13', 'python', 'python3']
                             : ['python3.12', 'python3.13', 'python3', 'python'];
  for (const cmd of candidates) {
    try {
      const out = execFileSync(cmd, ['--version'],
        { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      if (/python 3\.1[2-9](?:\D|$)|python 3\.[2-9]\d(?:\D|$)/i.test(out)) return cmd;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Download Python 3.12.9 from NuGet on Windows (no admin rights required).
 * Mirrors downloadAndInstallPython311Win but for 3.12.
 */
async function downloadAndInstallPython312Win(sendProgress) {
  const https = require('https');
  const os    = require('os');

  const localAppData = process.env.LOCALAPPDATA || app.getPath('temp');
  const installDir   = path.join(localAppData, 'TEMPO', 'python312');
  const pythonExe    = path.join(installDir, 'python.exe');

  const getCandidates = () => [
    pythonExe,
    path.join(installDir, 'Python312', 'python.exe'),
    path.join(installDir, 'tools', 'python.exe'),
  ].filter(Boolean);

  const resolveInstalled = () => {
    for (const p of getCandidates()) { if (fs.existsSync(p)) return p; }
    try {
      const p = execFileSync('py', ['-3.12', '-c', 'import sys; print(sys.executable)'],
        { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
      if (p) return p;
    } catch { /* py launcher not available */ }
    return null;
  };

  const cached = resolveInstalled();
  if (cached) {
    sendProgress({ type: 'log', line: `Using cached Python 3.12: ${cached}` });
    return cached;
  }

  fs.mkdirSync(installDir, { recursive: true });

  const PY_URL = 'https://www.nuget.org/api/v2/package/python/3.12.9';
  const tmpPkg = path.join(os.tmpdir(), 'tempo-python-3.12.9.nupkg');
  const tmpZip = path.join(os.tmpdir(), 'tempo-python-3.12.9.zip');

  sendProgress({ type: 'stage', label: 'Downloading Python 3.12.9…' });
  sendProgress({ type: 'log',   line: 'Source: nuget.org/package/python/3.12.9 (~35 MB)' });

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPkg);
    let downloaded = 0, lastPct = -10;
    function doGet(url) {
      const req = https.get(url, { timeout: 120_000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { req.destroy(); doGet(res.headers.location); return; }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} downloading Python 3.12`)); return; }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', chunk => {
          downloaded += chunk.length;
          const pct = total > 0 ? Math.floor(downloaded / total * 100) : 0;
          if (pct >= lastPct + 10) { lastPct = pct; sendProgress({ type: 'log', line: `  ${pct}% (${(downloaded/1024/1024).toFixed(1)} MB)` }); }
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Python 3.12 download timed out')); });
    }
    doGet(PY_URL);
  });

  sendProgress({ type: 'stage', label: 'Extracting Python 3.12.9…' });
  try {
    if (fs.existsSync(installDir)) fs.rmSync(installDir, { recursive: true, force: true });
    fs.mkdirSync(installDir, { recursive: true });
    fs.copyFileSync(tmpPkg, tmpZip);
    const ps = (s) => s.replace(/'/g, "''");
    const psCmd = `Expand-Archive -Path '${ps(tmpZip)}' -DestinationPath '${ps(installDir)}' -Force`;
    await new Promise((resolve, reject) => {
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { shell: false });
      let stderr = '';
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', code => { if (code === 0) resolve(); else reject(new Error(`Python 3.12 extraction failed (exit ${code}): ${stderr.trim()}`)); });
      child.on('error', err => reject(new Error(`Cannot run PowerShell: ${err.message}`)));
    });
  } finally {
    try { fs.unlinkSync(tmpPkg); } catch { /* ignore cleanup errors */ }
    try { fs.unlinkSync(tmpZip); } catch { /* ignore cleanup errors */ }
  }

  // Wait up to 30 s for the interpreter to appear
  const deadline = Date.now() + 30_000;
  let found = null;
  while (!found && Date.now() < deadline) {
    found = resolveInstalled();
    if (!found) await new Promise(r => setTimeout(r, 1000));
  }

  if (!found) throw new Error(
    'Python 3.12 installation completed but no interpreter was found.\n' +
    'Install Python 3.12 manually (https://www.python.org/downloads/), add it to PATH, then click Retry.'
  );

  sendProgress({ type: 'log', line: `✓ Python 3.12.9 installed: ${found}` });
  return found;
}

// ─── Engine service factory ─────────────────────────────────────────────────

/**
 * Create the full lifecycle for one optional Python engine service and
 * register its IPC handlers.
 *
 * spec:
 *   id             IPC prefix ('pypsa' → 'pypsa:check', 'pypsa:install', …)
 *   label          Human-readable name used in progress messages
 *   logTag         Console log prefix ('pypsa-svc')
 *   venvName       Venv directory name under userData ('pypsa-venv')
 *   packagePrefix  site-packages dir prefix proving the engine is installed
 *   serviceApp     uvicorn app spec ('pypsa_service:app')
 *   getPort        () => current port (ports are reassigned at startup)
 *   python         { versionLabel, find, notFoundError } — interpreter policy;
 *                  on Windows a missing interpreter auto-installs 3.12
 *   install        { stageLabel, note?, requirements? | packages? }
 *   verifySnippet  python -c source run after install
 *   checkSnippet   python -c source run by <id>:check
 *   buildEnv?      () => env object for the spawned service
 *   postInstall?   async (sendProgress) => {} — solver setup etc.
 *   extraCheck?    () => extra fields merged into the <id>:check response
 *   deps           { isPortOpen, waitForPort, getServicePaths, getMainWindow }
 *
 * Returns { start, stop } for app lifecycle wiring in main.cjs.
 */
function createEngineService(spec) {
  const {
    id, label, logTag, venvName, packagePrefix, serviceApp,
    getPort, python: pythonSpec, install: installSpec,
    verifySnippet, checkSnippet, buildEnv, postInstall, extraCheck, deps,
  } = spec;
  const { isPortOpen, waitForPort, getServicePaths, getMainWindow } = deps;

  let proc = null;
  let intentionalStop = false;
  let restartCount = 0;

  function resolveVenv() {
    const binDir = IS_WIN ? 'Scripts' : 'bin';
    const pyExe  = IS_WIN ? 'python.exe' : 'python3';
    const venvDir = path.join(app.getPath('userData'), venvName);
    const python  = path.join(venvDir, binDir, pyExe);

    const hasPkg = (dir) => {
      try { return fs.readdirSync(dir).some(d => d.startsWith(packagePrefix)); }
      catch { return false; }
    };

    let exists = false;
    if (fs.existsSync(python)) {
      const siteWin  = path.join(venvDir, 'Lib', 'site-packages');
      const siteUnix = path.join(venvDir, 'lib');
      exists = hasPkg(siteWin);
      if (!exists && fs.existsSync(siteUnix)) {
        exists = fs.readdirSync(siteUnix).some(ver => {
          try { return hasPkg(path.join(siteUnix, ver, 'site-packages')); } catch { return false; }
        });
      }
    }

    return { venvDir, python, exists };
  }

  async function ensurePython(sendProgress) {
    const found = pythonSpec.find();
    if (found) {
      try {
        const ver = execFileSync(found, ['--version'],
          { timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
        sendProgress({ type: 'log', line: `Found: ${ver} → ${found}` });
      } catch { /* version print is informational only */ }
      return found;
    }

    if (IS_WIN) {
      sendProgress({ type: 'log', line: `No Python ${pythonSpec.versionLabel} found — downloading Python 3.12.9…` });
      return downloadAndInstallPython312Win(sendProgress);
    }

    throw new Error(pythonSpec.notFoundError);
  }

  async function start() {
    intentionalStop = false;
    restartCount    = 0;
    if (await isPortOpen(getPort())) {
      console.log(`[${logTag}] Already running on port`, getPort());
      return;
    }

    const { python, exists } = resolveVenv();
    if (!exists) {
      console.log(`[${logTag}] venv not ready — skipping autostart`);
      return;
    }

    const { pythonDir } = getServicePaths();
    const childEnv = buildEnv ? buildEnv() : undefined;

    console.log(`[${logTag}] Starting uvicorn on port ${getPort()}`);
    proc = spawn(python, [
      '-m', 'uvicorn', serviceApp,
      '--host', '127.0.0.1',
      '--port', String(getPort()),
      '--workers', '1',
      '--log-level', 'warning',
    ], { cwd: pythonDir, shell: false, ...(childEnv ? { env: childEnv } : {}) });

    proc.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) console.log(`[${logTag}] ${l}`); });
    proc.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) console.log(`[${logTag}] ${l}`); });
    proc.on('close', code => {
      console.log(`[${logTag}] Exited: ${code}`);
      proc = null;
      if (!intentionalStop && restartCount < MAX_RESTARTS) {
        restartCount++;
        const delay = Math.min(2000 * restartCount, 10000);
        console.log(`[${logTag}] Unexpected exit — restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})`);
        setTimeout(() => start().catch(e => console.warn(`[${logTag}] Restart failed:`, e)), delay);
      }
    });

    try {
      await waitForPort(getPort(), 15000);
      console.log(`[${logTag}] Ready on port`, getPort());
    } catch {
      console.warn(`[${logTag}] Did not start within 15 s — continuing anyway`);
    }
  }

  function stop() {
    intentionalStop = true;
    if (proc) { proc.kill(); proc = null; }
  }

  // ─── IPC handlers ─────────────────────────────────────────────────────────

  ipcMain.handle(`${id}:service-url`, async () => ({
    url:     `http://127.0.0.1:${getPort()}`,
    running: await isPortOpen(getPort()),
  }));

  ipcMain.handle(`${id}:check`, async () => {
    const { python, exists, venvDir } = resolveVenv();
    const serviceRunning = await isPortOpen(getPort());

    let importOk = false;
    if (exists && fs.existsSync(python)) {
      try {
        execFileSync(python, ['-c', checkSnippet], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
        importOk = true;
      } catch { importOk = false; }
    }

    return {
      envExists: importOk,
      venvPath: importOk ? venvDir : null,
      serviceRunning,
      ...(extraCheck ? extraCheck() : {}),
      platform: process.platform,
    };
  });

  ipcMain.handle(`${id}:install`, async () => {
    const sendProgress = (data) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(`${id}:install-progress`, data);
    };

    try {
      sendProgress({ type: 'stage', label: `Locating Python ${pythonSpec.versionLabel}…` });
      const systemPython = await ensurePython(sendProgress);

      const venvDir    = path.join(app.getPath('userData'), venvName);
      const binDir     = IS_WIN ? 'Scripts' : 'bin';
      const pyExe      = IS_WIN ? 'python.exe' : 'python3';
      const venvPython = path.join(venvDir, binDir, pyExe);

      sendProgress({ type: 'log', line: `Stopping any running ${label} service…` });
      stop();
      await new Promise(r => setTimeout(r, 2000)); // give Windows time to release handles

      if (fs.existsSync(venvDir)) {
        sendProgress({ type: 'log', line: `Removing old ${label} environment…` });
        // On Windows use cmd /c rmdir which works even with some locked handles,
        // unlike Node's rmSync which silently skips locked files.
        if (IS_WIN) {
          try { execFileSync('cmd', ['/c', 'rmdir', '/s', '/q', venvDir], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }); }
          catch (e) { sendProgress({ type: 'log', line: `⚠ rmdir warning: ${e.message}` }); }
        } else {
          try { fs.rmSync(venvDir, { recursive: true, force: true }); }
          catch (e) { sendProgress({ type: 'log', line: `⚠ Remove warning: ${e.message}` }); }
        }
      }

      sendProgress({ type: 'stage', label: `Creating ${label} Python environment…` });
      sendProgress({ type: 'log', line: `Location: ${venvDir}` });
      fs.mkdirSync(path.dirname(venvDir), { recursive: true });

      // PIP_PREFER_BINARY / PIP_NO_CACHE_DIR reach pip sub-processes inside
      // PEP-517 build isolation, where CLI flags never arrive.
      const pipEnv = { ...process.env, PIP_PREFER_BINARY: '1', PIP_NO_CACHE_DIR: '1' };
      const recentLines = [];
      const runChild = (cmd, args, stepLabel) => new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { shell: false, env: pipEnv });
        const onLine = l => {
          recentLines.push(l);
          if (recentLines.length > 50) recentLines.shift();
          sendProgress({ type: 'log', line: l });
        };
        child.stdout.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) onLine(l); });
        child.stderr.on('data', d => { for (const l of d.toString().split('\n').filter(x => x.trim())) onLine(l); });
        child.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(`${stepLabel} failed (exit ${code})\n\n${recentLines.slice(-10).join('\n')}`));
        });
        child.on('error', err => reject(new Error(`${stepLabel} could not start: ${err.message}`)));
      });

      await runChild(systemPython, ['-m', 'venv', '--clear', venvDir], 'venv creation');
      try { await runChild(venvPython, ['-m', 'ensurepip', '--upgrade'], 'ensurepip'); } catch { /* non-fatal */ }

      sendProgress({ type: 'stage', label: 'Upgrading build tools…' });
      await runChild(venvPython, ['-m', 'pip', 'install', '--upgrade', '--quiet', 'pip', 'setuptools', 'wheel'], 'pip upgrade');

      const { pythonDir } = getServicePaths();
      const pipFlags = ['--prefer-binary', '--no-warn-script-location', '--no-cache-dir'];

      sendProgress({ type: 'stage', label: 'Installing service layer (FastAPI + uvicorn)…' });
      await runChild(venvPython, [
        '-m', 'pip', 'install', ...pipFlags,
        '-r', path.join(pythonDir, 'requirements.service.txt'),
      ], 'pip install (service layer)');

      sendProgress({ type: 'stage', label: installSpec.stageLabel });
      if (installSpec.note) sendProgress({ type: 'log', line: installSpec.note });
      recentLines.length = 0;
      const installArgs = installSpec.requirements
        ? ['-r', path.join(pythonDir, installSpec.requirements)]
        : installSpec.packages;
      await runChild(venvPython, ['-m', 'pip', 'install', ...pipFlags, ...installArgs], `pip install (${id})`);

      sendProgress({ type: 'stage', label: `Verifying ${label} installation…` });
      recentLines.length = 0;
      await runChild(venvPython, ['-c', verifySnippet], 'verification');

      if (postInstall) await postInstall(sendProgress);

      sendProgress({ type: 'stage', label: `Starting ${label} service…` });
      await start();

      sendProgress({ type: 'done' });
      return { success: true };
    } catch (err) {
      const msg = err.message || String(err);
      sendProgress({ type: 'error', error: msg });
      return { success: false, error: msg };
    }
  });

  ipcMain.handle(`${id}:restart-service`, async () => {
    stop();
    await start();
    return { running: await isPortOpen(getPort()) };
  });

  return { start, stop };
}

module.exports = {
  createEngineService,
  findSystemPython310Plus,
  findSystemPython312Plus,
};
