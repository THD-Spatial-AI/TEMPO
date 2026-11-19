// Techs the study-area wizard places on OSM nodes that have no catalog entry. Model loads
// and the Creation draft resolve them like built-in templates, so a model never ends up
// with substations whose tech is undefined.

// Substation nodes get a Calliope-valid conversion tech (electricity → electricity with
// transformer losses) so they aren't empty; enrichable from opentech-db like the others.
export const SUBSTATION_TECH_ID = 'electricity_substation';
export const SUBSTATION_TECH_DEF = {
  id: SUBSTATION_TECH_ID,
  name: SUBSTATION_TECH_ID, // the key locations use; display name in essentials
  parent: 'conversion',
  description: 'Substation / transformer node (electricity in → electricity out, with losses).',
  essentials: { name: 'Electricity Substation', color: '#4A148C', parent: 'conversion', carrier_in: 'electricity', carrier_out: 'electricity' },
  constraints: { energy_cap_max: 'inf', energy_eff: 0.995, lifetime: 40 },
  costs: { monetary: { interest_rate: 0.05, energy_cap: 50 } },
};

export const GRID_TECHS = [SUBSTATION_TECH_DEF];
