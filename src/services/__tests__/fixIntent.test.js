import { describe, it, expect, vi } from 'vitest';
import { requestFix, takeFix, FIX_EVENT } from '../fixIntent';

describe('fixIntent', () => {
  it('hands the target to its own view once', () => {
    requestFix({ view: 'Locations', kind: 'location', id: 'a' });
    expect(takeFix('Technologies')).toBeNull();
    expect(takeFix('Locations')).toEqual({ view: 'Locations', kind: 'location', id: 'a' });
    expect(takeFix('Locations')).toBeNull();
  });

  it('keeps only the latest request', () => {
    requestFix({ view: 'Links', kind: 'link', from: 'a', to: 'b' });
    requestFix({ view: 'Locations', kind: 'location', id: 'b' });
    expect(takeFix('Links')).toBeNull();
    expect(takeFix('Locations').id).toBe('b');
  });

  it('emits an event per request and can be cleared', () => {
    // Vitest runs in the node environment here, so stand in for window.
    globalThis.window = new EventTarget();
    try {
      const seen = vi.fn();
      window.addEventListener(FIX_EVENT, seen);
      requestFix({ view: 'Technologies', kind: 'tech', id: 'pv', profile: true });
      expect(seen).toHaveBeenCalledTimes(1);
      requestFix(null);
      expect(seen).toHaveBeenCalledTimes(1);
      expect(takeFix('Technologies')).toBeNull();
    } finally {
      delete globalThis.window;
    }
  });
});
