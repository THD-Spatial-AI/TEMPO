import { describe, it, expect, vi } from 'vitest';
import { requestProfileDialog, takeProfileRequest, PROFILE_EVENT } from '../profileIntent';

describe('profileIntent', () => {
  it('stores one request, emits an event, and clears on take', () => {
    // Vitest runs in the node environment here, so stand in for window.
    globalThis.window = new EventTarget();
    try {
      const seen = vi.fn();
      window.addEventListener(PROFILE_EVENT, seen);
      requestProfileDialog('pv');
      expect(seen).toHaveBeenCalledTimes(1);
      expect(takeProfileRequest()).toBe('pv');
      expect(takeProfileRequest()).toBeNull();
    } finally {
      delete globalThis.window;
    }
  });
});
