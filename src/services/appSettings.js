// Lightweight persistent app preferences, backed by localStorage.
// Used by the Settings › General panel (writer) and by App.jsx / DataContext
// (readers). Changes fire a `tempo-settings-change` event so readers in the
// same tab can react immediately (the native `storage` event only fires
// across tabs).

const KEY = 'tempoSettings';

export const SETTINGS_EVENT = 'tempo-settings-change';

const DEFAULTS = {
  defaultView: 'Dashboard', // matches the view keys in App.jsx's switch
  autoSave: true,           // 1.5s debounced auto-save in DataContext
};

export function getSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSetting(key) {
  return getSettings()[key];
}

export function setSetting(key, value) {
  const next = { ...getSettings(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / quota) — settings just won't persist
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
  return next;
}
