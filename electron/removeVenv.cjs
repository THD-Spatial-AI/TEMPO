// Deletes an engine's venv. No electron dependency so it can be unit-tested.
const fs = require('fs');
const { execFile } = require('child_process');

// Native modules stay locked until every process that loaded them has exited,
// which can outlast stopping the service: a calliope:check import runs for up to
// 20 s. So keep retrying for longer than that before reporting failure.
const ATTEMPTS = 15;
const INTERVAL_MS = 2000;

function removeOnce(dir) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // cmd rmdir copes with some locked handles that Node's rm silently skips.
      execFile('cmd', ['/c', 'rmdir', '/s', '/q', dir], { timeout: 120000, windowsHide: true }, () => resolve());
    } else {
      fs.rm(dir, { recursive: true, force: true }, () => resolve());
    }
  });
}

async function removeVenvDir(venvDir, { remove = removeOnce, attempts = ATTEMPTS, intervalMs = INTERVAL_MS } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (!fs.existsSync(venvDir)) return { success: true };
    await remove(venvDir);
    if (!fs.existsSync(venvDir)) return { success: true };
    if (attempt < attempts) await new Promise(r => setTimeout(r, intervalMs));
  }
  return { success: false, error: `Could not remove ${venvDir} — some files are in use. Close any Python windows and try again.` };
}

module.exports = { removeVenvDir };
