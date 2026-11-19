// One-shot request to show the entity a readiness issue points at, set by a
// "Fix" link and consumed by the view that owns the entity.
// A target is { view, kind, id?, from?, to?, members?, tech?, location?, field?, map?, profile? }.
export const FIX_EVENT = 'tempo:fix';
let pending = null;

// requestFix(null) drops a pending request (e.g. when navigation is cancelled).
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

// Value of the data-fix attribute that marks an entity's element.
export const fixKey = (kind, ...parts) => [kind, ...parts].join(':');

function clearHighlight() {
  document.querySelectorAll('.fix-highlight').forEach((e) => e.classList.remove('fix-highlight'));
}

// Scrolls to the element marked data-fix={key}, highlights it and optionally focuses
// the field marked data-fix-field={field} inside it. Waits a few frames for the
// element to render, since the view opens it in the same tick.
export function revealFix(key, field) {
  let tries = 0;
  const run = () => {
    const el = document.querySelector(`[data-fix="${CSS.escape(key)}"]`);
    if (!el) {
      if (tries++ < 30) requestAnimationFrame(run);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    clearHighlight();
    void el.offsetWidth; // restart the animation on a repeat click
    el.classList.add('fix-highlight');
    // The mark stays until the next click anywhere.
    document.addEventListener('pointerdown', clearHighlight, { once: true, capture: true });
    const input = field && el.querySelector(`[data-fix-field="${CSS.escape(field)}"]`);
    if (input) input.focus({ preventScroll: true });
  };
  requestAnimationFrame(run);
}
