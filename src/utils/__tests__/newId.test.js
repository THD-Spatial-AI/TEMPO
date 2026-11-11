import { describe, it, expect } from 'vitest';
import { newId } from '../newId';

describe('newId', () => {
  it('never repeats, even when called many times in one millisecond', () => {
    const ids = Array.from({ length: 5000 }, newId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is strictly increasing', () => {
    const a = newId();
    const b = newId();
    expect(b).toBeGreaterThan(a);
  });
});
