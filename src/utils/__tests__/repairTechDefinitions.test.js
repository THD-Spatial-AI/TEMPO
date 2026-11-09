import { describe, it, expect } from 'vitest';
import { repairTechDefinitions } from '../repairTechDefinitions';

const templates = [
  { id: 'solar_pv_utility_scale', name: 'Solar PV Utility-scale', parent: 'supply_plus',
    essentials: { parent: 'supply_plus', carrier_out: 'electricity' } },
];

describe('repairTechDefinitions', () => {
  it('returns null when every location tech is defined', () => {
    expect(repairTechDefinitions([{ techs: { a: {} } }], [{ name: 'a' }], templates)).toBeNull();
  });

  it('adds a missing tech from the built-in template, keyed by the id the locations use', () => {
    const r = repairTechDefinitions([{ techs: { solar_pv_utility_scale: {} } }], [], templates);
    expect(r.added).toEqual(['solar_pv_utility_scale']);
    expect(r.technologies[0]).toMatchObject({ name: 'solar_pv_utility_scale', parent: 'supply_plus' });
  });

  it("prefers the model's own definition registered under its display name", () => {
    const own = { id: 'electricity_substation', name: 'Electricity Substation', parent: 'conversion',
      constraints: { energy_eff: 0.99 } };
    const r = repairTechDefinitions([{ techs: { electricity_substation: {} } }], [own], templates);
    expect(r.technologies[1]).toMatchObject({ name: 'electricity_substation', parent: 'conversion',
      constraints: { energy_eff: 0.99 } });
    expect(r.technologies[0]).toBe(own);
  });

  it('leaves unknown techs for the readiness check to report', () => {
    expect(repairTechDefinitions([{ techs: { mystery: {} } }], [], templates)).toBeNull();
  });
});
