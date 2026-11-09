import { describe, it, expect } from 'vitest';
import { sampleUV } from '../windParticles';

const grid = { lats: [0, 1], lons: [0, 1], u: [[[1, 1], [1, 1]]], v: [[[0, 0], [2, 2]]] };

describe('windParticles', () => {
  it('bilinearly samples u/v and returns null outside the grid', () => {
    expect(sampleUV(grid, 0, 0.5, 0.5)).toEqual([1, 1]);
    expect(sampleUV(grid, 0, 0, 0)).toEqual([1, 0]);
    expect(sampleUV(grid, 0, 2, 0.5)).toBeNull();
  });
});
