import { describe, it, expect } from 'vitest';
import { buildDraftModel } from '../draftModel';

const techMap = {
  solar_pv: { essentials: { parent: 'supply', carrier_out: 'electricity' }, constraints: { energy_cap_max: 100 }, costs: { monetary: { energy_cap: 900 } } },
};

describe('buildDraftModel', () => {
  it('converts temp locations and links and collects techs', () => {
    const draft = buildDraftModel({
      tempLocations: [
        { id: 1, name: 'a', latitude: 1, longitude: 2, techs: { solar_pv: { constraints: { energy_cap_max: 50 } } } },
        { id: 2, name: 'b', latitude: 3, longitude: 4, techs: {} },
      ],
      tempLinks: [{ id: 9, from: 1, to: 2, distance: 10 }],
    }, techMap, { timeSeries: [], currentModelId: null });

    expect(draft.locations.map((l) => l.name)).toEqual(['a', 'b']);
    expect(draft.links[0]).toMatchObject({ from: 'a', to: 'b', tech: 'ac_transmission' });
    expect(draft.technologies[0]).toMatchObject({ name: 'solar_pv', constraints: { energy_cap_max: 50 } });
  });

  it('keeps the raw id of a link end that no longer exists', () => {
    const draft = buildDraftModel({ tempLocations: [{ id: 1, name: 'a', techs: {} }], tempLinks: [{ id: 9, from: 1, to: 7 }] }, {}, { timeSeries: [] });
    expect(draft.links[0]).toMatchObject({ from: 'a', to: '7' });
  });

  it('carries session time series and strips their modelId', () => {
    const ts = { name: 'osm', columns: ['t'], data: [{}], source: 'osm-demand', modelId: 'old' };
    const draft = buildDraftModel({ tempLocations: [], tempLinks: [] }, {}, { timeSeries: [ts], currentModelId: 'x' });
    expect(draft.timeSeries).toEqual([{ name: 'osm', columns: ['t'], data: [{}], source: 'osm-demand' }]);
  });
});
