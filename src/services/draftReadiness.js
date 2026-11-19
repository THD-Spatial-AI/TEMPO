// Readiness of the unsaved Creation draft. Creation publishes it while open so the
// sidebar's readiness indicator can show the draft instead of the loaded model.
import { useSyncExternalStore } from 'react';

let current = null;
const listeners = new Set();

export function publishDraftReadiness(readiness) {
  current = readiness;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDraftReadiness() {
  return useSyncExternalStore(subscribe, () => current);
}
