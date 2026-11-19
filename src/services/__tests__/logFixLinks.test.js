import { describe, it, expect } from 'vitest';
import { issueCodeOf, isProblemLine, makeEntityMatcher, unmetDemandTargets } from '../logFixLinks';

const model = {
  locations: [{ name: 'Arica' }, { name: 'S/E ARICA' }],
  technologies: [{ name: 'solar_pv' }, { name: 'Hydro ROR' }],
};

describe('issueCodeOf', () => {
  it('reads the code of a tagged line, wherever the tag sits', () => {
    expect(issueCodeOf('[CALLIOPE]   [issue:capex_no_lifetime] These technologies … (solar_pv)')).toBe('capex_no_lifetime');
    expect(issueCodeOf('[limitation] Ramping limits')).toBeNull();
  });
});

describe('makeEntityMatcher', () => {
  const match = makeEntityMatcher(model);

  it('links quoted tech and location names in an engine error', () => {
    expect(match('Must specify constraints.lifetime for `solar_pv`. Set lifetime to 1'))
      .toEqual([{ label: 'solar_pv', target: { view: 'Technologies', kind: 'tech', id: 'solar_pv' } }]);
  });

  it('splits loc::tech and matches engine ids back to model names', () => {
    expect(match("KeyError: 's_e_arica::hydro_ror'").map((m) => m.target)).toEqual([
      { view: 'Locations', kind: 'location', id: 'S/E ARICA' },
      { view: 'Technologies', kind: 'tech', id: 'Hydro ROR' },
    ]);
  });

  it('ignores unquoted words and unknown names, and lists an entity once', () => {
    expect(match('solar_pv failed at Arica')).toEqual([]);
    expect(match("'unknown' and 'Arica' and 'arica'").map((m) => m.label)).toEqual(['Arica']);
  });
});

describe('unmetDemandTargets', () => {
  it('flies the map to each location with unmet demand', () => {
    expect(unmetDemandTargets({ unmet_demand_by_location: { arica: 12.5, nowhere: 1 } }, model))
      .toEqual([{ label: 'Arica', target: { view: 'Map View', kind: 'location', id: 'Arica', map: true } }]);
    expect(unmetDemandTargets({}, model)).toEqual([]);
  });
});

describe('isProblemLine', () => {
  it('is true for errors and warnings, false for informational lines', () => {
    // calliope_service logs a failed run as "ERROR [<exception>]: <message>".
    expect(isProblemLine("ERROR [ModelError]: Errors during model processing: * Must specify constraints.lifetime for `solar_pv`")).toBe(true);
    expect(isProblemLine('WARNING: unmet demand at arica')).toBe(true);
    expect(isProblemLine("Generated timeseries CSV for 'el_import': el_import_resource.csv")).toBe(false);
  });
});
