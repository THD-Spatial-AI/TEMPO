// electron/ai/keystore.cjs
// -------------------------------------------------------------------------
// Encrypted at-rest storage for user-supplied AI provider API keys.
//
// Keys are encrypted with Electron's safeStorage (OS keychain / DPAPI) and
// written to userData/ai-keys.json. If OS encryption is unavailable we fall
// back to base64 (obfuscation only, NOT security) so the feature still works,
// and record `enc: false` so we know how to decode later.
//
// Only the main process touches keys — the renderer sees provider IDs and a
// boolean "hasKey", never the secret itself.

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function keyFilePath() {
  return path.join(app.getPath('userData'), 'ai-keys.json');
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(keyFilePath(), 'utf-8')) || {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  fs.writeFileSync(keyFilePath(), JSON.stringify(obj), 'utf-8');
}

function setKey(provider, key) {
  const all = readAll();
  if (!key) {
    delete all[provider];
  } else if (safeStorage.isEncryptionAvailable()) {
    all[provider] = { enc: true, v: safeStorage.encryptString(key).toString('base64') };
  } else {
    all[provider] = { enc: false, v: Buffer.from(key, 'utf-8').toString('base64') };
  }
  writeAll(all);
  return { success: true };
}

function getKey(provider) {
  const rec = readAll()[provider];
  if (!rec) return null;
  try {
    const buf = Buffer.from(rec.v, 'base64');
    return rec.enc ? safeStorage.decryptString(buf) : buf.toString('utf-8');
  } catch {
    return null;
  }
}

function hasKey(provider) {
  return Boolean(readAll()[provider]);
}

function clearKey(provider) {
  const all = readAll();
  delete all[provider];
  writeAll(all);
  return { success: true };
}

module.exports = { setKey, getKey, hasKey, clearKey };
