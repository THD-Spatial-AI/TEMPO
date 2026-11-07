import { describe, it, expect } from 'vitest';
import { padded, gridServes } from '../../components/map/useResourceOverlays';

const view = { south: -33.1, west: -71.3, north: -32.1, east: -70.3 };
const DATE = '2026-10-31';
const gridFor = (b, date = DATE) => ({ lats: [b.south, b.north], lons: [b.west, b.east], date });

describe('resource overlay wind-grid reuse', () => {
  it('pads the view by 25 % and snaps outward to 0.25°', () => {
    expect(padded(view)).toEqual({ south: -33.5, west: -71.75, north: -31.75, east: -70 });
    expect(padded({ south: -84, west: -179, north: 84, east: 179 })).toEqual({ south: -85, west: -180, north: 85, east: 180 });
  });

  it('a grid fetched for the padded view always serves it, even at high zoom (no refetch loop)', () => {
    const tiny = { south: -33.45, west: -70.65, north: -33.40, east: -70.60 };
    expect(gridServes(gridFor(padded(tiny)), tiny, DATE)).toBe(true);
    expect(gridServes(gridFor(padded(view)), view, DATE)).toBe(true);
  });

  it('refetches after panning out, zooming out, zooming far in or changing the date', () => {
    const grid = gridFor(padded(view));
    expect(gridServes(grid, { ...view, west: -72, east: -71 }, DATE)).toBe(false); // panned out
    expect(gridServes(grid, { south: -34, west: -72, north: -31, east: -69 }, DATE)).toBe(false); // zoomed out
    expect(gridServes(grid, { south: -33, west: -71, north: -32.9, east: -70.9 }, DATE)).toBe(false); // zoomed far in
    expect(gridServes(grid, { ...view, south: -33.0, north: -32.2 }, DATE)).toBe(true); // small zoom-in reuses
    expect(gridServes(grid, view, '2026-10-30')).toBe(false);
    expect(gridServes(null, view, DATE)).toBe(false);
  });
});
