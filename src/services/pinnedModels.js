// Per-device pinned models (kept in localStorage; pinning does not modify the model).
import { useEffect, useState } from 'react';

const KEY = 'tempo:pinnedModels';
const EVENT = 'tempo-pins-change';

const read = () => {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
};

export function togglePinnedModel(id) {
  const pins = read();
  if (pins.has(id)) pins.delete(id); else pins.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...pins])); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
}

export function usePinnedModels() {
  const [pins, setPins] = useState(read);
  useEffect(() => {
    const update = () => setPins(read());
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return pins;
}

// Pinned first, original order otherwise.
export const sortPinnedFirst = (models, pins) =>
  [...models].sort((a, b) => Number(pins.has(b.id)) - Number(pins.has(a.id)));
