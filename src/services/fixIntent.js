// One-shot request to show the entity a readiness issue points at, set by a
// "Fix" link and consumed by the view that owns the entity.
// A target is { view, kind, id?, from?, to?, members?, tech?, location?, field?, map?, profile? }.
export const FIX_EVENT = 'tempo:fix';
let pending = null;

export function requestFix(target) {
  pending = target || null;
  if (pending && typeof window !== 'undefined') window.dispatchEvent(new Event(FIX_EVENT));
}

// Returns the pending target if it is meant for `view`, and clears it.
export function takeFix(view) {
  if (!pending || pending.view !== view) return null;
  const t = pending;
  pending = null;
  return t;
}
