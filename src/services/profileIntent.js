// One-shot request to open a technology's resource-profile dialog, set by a
// readiness "Fix" link and consumed by the Technologies view (S5).
export const PROFILE_EVENT = 'tempo:open-profile';
let pending = null;

export function requestProfileDialog(techName) {
  pending = techName || null;
  if (pending && typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_EVENT));
}

export function takeProfileRequest() {
  const t = pending;
  pending = null;
  return t;
}
