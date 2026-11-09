import { describe, it, expect } from 'vitest';
import { uniqueNames, repairDuplicateLocationNames } from '../uniqueLocationNames';

describe('uniqueNames', () => {
  it('keeps the first and numbers the repeats', () => {
    expect(uniqueNames(['A', 'B', 'A', 'A'])).toEqual(['A', 'B', 'A (2)', 'A (3)']);
  });

  it('never collides with a name already in use', () => {
    expect(uniqueNames(['X', 'X', 'X (2)'])).toEqual(['X', 'X (3)', 'X (2)']);
  });

  it('leaves unique names untouched', () => {
    expect(uniqueNames(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('repairDuplicateLocationNames', () => {
  // Two plants called "Park" 50 km apart (≈0.45° of latitude), a hub near the first.
  const locs = [
    { name: 'Park', latitude: -26.0, longitude: -70.0 },
    { name: 'Hub', latitude: -26.05, longitude: -70.0 },
    { name: 'Park', latitude: -26.45, longitude: -70.0 },
  ];

  it('returns null when names are already unique', () => {
    expect(repairDuplicateLocationNames([{ name: 'a' }, { name: 'b' }], [])).toBeNull();
  });

  it('renames repeats and keeps order and other fields', () => {
    const r = repairDuplicateLocationNames(locs, []);
    expect(r.locations.map((l) => l.name)).toEqual(['Park', 'Hub', 'Park (2)']);
    expect(r.locations[2].latitude).toBe(-26.45);
    expect(r.renamed).toEqual(['Park (2)']);
  });

  it('re-points each link to the pair matching its stored distance', () => {
    const links = [
      { from: 'Hub', to: 'Park', distance: '5.5' },   // the near park
      { from: 'Park', to: 'Hub', distance: '44.5' },  // the far park
      { from: 'Park', to: 'Park', distance: '50' },   // was a self-link: now between the two
    ];
    const r = repairDuplicateLocationNames(locs, links);
    expect(r.links[0]).toMatchObject({ from: 'Hub', to: 'Park' });
    expect(r.links[1]).toMatchObject({ from: 'Park (2)', to: 'Hub' });
    expect([r.links[2].from, r.links[2].to].sort()).toEqual(['Park', 'Park (2)']);
  });

  it('picks the nearest pair when a link has no distance, and leaves other links alone', () => {
    const other = { from: 'Hub', to: 'Elsewhere', distance: '3' };
    const r = repairDuplicateLocationNames(locs, [{ from: 'Hub', to: 'Park' }, other]);
    expect(r.links[0].to).toBe('Park');
    expect(r.links[1]).toBe(other);
  });
});
