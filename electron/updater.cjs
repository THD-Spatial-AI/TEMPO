// In-app updater: GitHub release → SHA-256-verified download → install for this install type.
const { app, ipcMain, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const REPO = 'THD-Spatial-AI/TEMPO';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

let latest = null;      // last check result
let downloaded = null;  // { file, version, kind }
let downloading = null; // AbortController
const TEST_VERSION = !app.isPackaged && process.env.TEMPO_UPDATE_TEST_VERSION;
const currentVersion = () => TEST_VERSION || app.getVersion();

function parseVersion(text = '') {
  const m = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1, 4).map(Number) : null;
}

function isNewer(remote, local) {
  for (let i = 0; i < 3; i++) {
    if (remote[i] !== local[i]) return remote[i] > local[i];
  }
  return false;
}

function hasCommand(cmd) {
  try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
}

// How this copy was installed decides which asset we can apply.
function installKind() {
  if (!app.isPackaged) return TEST_VERSION ? 'devtest' : 'dev';
  if (process.platform === 'win32') return 'nsis';
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage';
    if (hasCommand('dpkg')) {
      try {
        execFileSync('dpkg', ['-S', process.execPath], { stdio: 'ignore' });
        return 'deb';
      } catch { /* not owned by a package */ }
    }
  }
  return 'manual';
}

const ASSET_PATTERN = { nsis: /\.exe$/i, appimage: /\.AppImage$/i, deb: /_amd64\.deb$/i, devtest: process.platform === 'win32' ? /\.exe$/i : /\.AppImage$/i };

async function checkForUpdates() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'TEMPO-Updater' },
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const rel = await res.json();
  const remote = parseVersion(rel.tag_name) || parseVersion(rel.name);
  const local = parseVersion(currentVersion());
  if (!remote || !local) throw new Error('Could not read version numbers');

  const kind = installKind();
  const pattern = ASSET_PATTERN[kind];
  const asset = pattern && (rel.assets || []).find((a) => pattern.test(a.name));
  latest = {
    available: isNewer(remote, local),
    currentVersion: currentVersion(),
    version: remote.join('.'),
    name: rel.name || rel.tag_name,
    notes: rel.body || '',
    publishedAt: rel.published_at,
    pageUrl: rel.html_url || RELEASES_PAGE,
    kind,
    canInstall: Boolean(asset),
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size, digest: asset.digest || null } : null,
  };
  return latest;
}

async function downloadUpdate(sender) {
  if (!latest?.asset) throw new Error('No installable update for this copy of TEMPO');
  if (downloaded?.version === latest.version && fs.existsSync(downloaded.file)) return { ok: true, file: downloaded.file };

  const { asset } = latest;
  const dir = path.join(app.getPath('temp'), 'tempo-update');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(asset.name));
  const partial = `${file}.part`;

  downloading = new AbortController();
  const res = await net.fetch(asset.url, { signal: downloading.signal, headers: { 'User-Agent': 'TEMPO-Updater' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(partial);
  let received = 0;
  let lastSent = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (now - lastSent > 150) {
        lastSent = now;
        sender.send('update:progress', { received, total });
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(partial, { force: true });
    throw err;
  } finally {
    downloading = null;
  }
  sender.send('update:progress', { received, total, verifying: true });

  const expected = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : null;
  const actual = hash.digest('hex');
  if (expected && expected !== actual) {
    fs.rmSync(partial, { force: true });
    throw new Error('Downloaded file failed the checksum check');
  }
  fs.renameSync(partial, file);
  downloaded = { file, version: latest.version, kind: latest.kind };
  return { ok: true, file, verified: Boolean(expected) };
}

// app.quit (not app.exit) so before-quit stops the backend and engine services.
function relaunch(execPath) {
  app.relaunch(execPath ? { execPath } : undefined);
  app.quit();
}

async function installUpdate() {
  if (!downloaded || !fs.existsSync(downloaded.file)) throw new Error('Download the update first');
  const { file, kind } = downloaded;

  // Dev test mode: never install, just reveal the verified download.
  if (kind === 'devtest') {
    shell.showItemInFolder(file);
    return { ok: true, devtest: true };
  }

  if (kind === 'nsis') {
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 500);
    return { ok: true };
  }

  if (kind === 'appimage') {
    const target = process.env.APPIMAGE;
    const staged = `${target}.new`;
    try {
      fs.copyFileSync(file, staged);
      fs.chmodSync(staged, 0o755);
      fs.renameSync(staged, target);
    } catch (err) {
      fs.rmSync(staged, { force: true });
      shell.showItemInFolder(file);
      throw new Error(`Cannot replace ${path.basename(target)} (${err.code || err.message}). The new AppImage is in the folder that just opened.`);
    }
    relaunch(target);
    return { ok: true };
  }

  if (kind === 'deb') {
    if (!hasCommand('pkexec')) {
      shell.showItemInFolder(file);
      throw new Error('pkexec is not available. Install the downloaded .deb manually.');
    }
    await new Promise((resolve, reject) => {
      const child = spawn('pkexec', ['dpkg', '-i', file], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(code === 126 || code === 127 ? 'Installation was cancelled' : `dpkg exited with code ${code}`))));
    });
    relaunch();
    return { ok: true };
  }

  shell.openExternal(latest?.pageUrl || RELEASES_PAGE);
  return { ok: true, manual: true };
}

function registerUpdater() {
  try { fs.rmSync(path.join(app.getPath('temp'), 'tempo-update'), { recursive: true, force: true }); } catch { /* best effort */ }
  const wrap = (fn) => async (event) => {
    try { return await fn(event); } catch (err) { return { error: err.message || String(err) }; }
  };
  ipcMain.handle('update:check', wrap(() => checkForUpdates()));
  ipcMain.handle('update:download', wrap((event) => downloadUpdate(event.sender)));
  ipcMain.handle('update:cancel', () => { downloading?.abort(); return { ok: true }; });
  ipcMain.handle('update:install', wrap(() => installUpdate()));
  ipcMain.handle('update:open-page', () => shell.openExternal(latest?.pageUrl || RELEASES_PAGE));
}

module.exports = { registerUpdater, parseVersion, isNewer };
