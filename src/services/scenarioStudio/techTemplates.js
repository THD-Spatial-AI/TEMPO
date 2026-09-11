/**
 * Scenario Studio — curated technology templates (sector coupling).
 *
 * Drop-in Calliope-0.6-shaped tech definitions the optimizer sizes itself.
 * Used by the `addTech` transform op. These are deliberately simple starting
 * points (a few knobs); specialists tune constraints/costs afterwards.
 *
 * Internal tech shape (see python/calliope_runner.py build_techs_config):
 *   { name, parent, essentials:{ parent, carrier_in?/carrier_out?/carrier }, constraints, costs:{monetary:{…}} }
 *
 * Each template exposes `knobs`: { path, label, unit } entries the UI can edit
 * (path is relative to the tech def, e.g. 'costs.monetary.energy_cap').
 */

export const TECH_TEMPLATES = {
  electrolyser: {
    label: 'Electrolyser (power → H₂)',
    group: 'Hydrogen',
    def: {
      parent: 'conversion',
      essentials: { parent: 'conversion', carrier_in: 'electricity', carrier_out: 'hydrogen' },
      constraints: { energy_eff: 0.65, energy_cap_max: 1e7, lifetime: 20 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 800, om_annual: 20 } },
    },
    knobs: [
      { path: 'costs.monetary.energy_cap', label: 'CAPEX', unit: '€/kW' },
      { path: 'constraints.energy_eff',    label: 'Efficiency', unit: 'fraction' },
    ],
  },
  hydrogen_storage: {
    label: 'Hydrogen storage',
    group: 'Hydrogen',
    def: {
      parent: 'storage',
      essentials: { parent: 'storage', carrier: 'hydrogen' },
      constraints: { energy_eff: 0.95, storage_cap_max: 5e6, energy_cap_max: 5e5, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, storage_cap: 10, energy_cap: 100 } },
    },
    knobs: [
      { path: 'costs.monetary.storage_cap', label: 'Storage CAPEX', unit: '€/kWh' },
      { path: 'constraints.energy_eff',     label: 'Round-trip eff.', unit: 'fraction' },
    ],
  },
  hydrogen_turbine: {
    label: 'Hydrogen turbine (H₂ → power)',
    group: 'Hydrogen',
    def: {
      parent: 'conversion',
      essentials: { parent: 'conversion', carrier_in: 'hydrogen', carrier_out: 'electricity' },
      constraints: { energy_eff: 0.58, energy_cap_max: 1e7, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 700, om_annual: 25 } },
    },
    knobs: [
      { path: 'costs.monetary.energy_cap', label: 'CAPEX', unit: '€/kW' },
      { path: 'constraints.energy_eff',    label: 'Efficiency', unit: 'fraction' },
    ],
  },
  ccs_capture: {
    label: 'CCS capture (power → captured CO₂)',
    group: 'Carbon capture',
    // Simplified: a parasitic-load conversion that turns electricity into a
    // "captured_co2" carrier (sink). A starting template — tune the capture
    // energy penalty (energy_eff) and cost for your system.
    def: {
      parent: 'conversion',
      essentials: { parent: 'conversion', carrier_in: 'electricity', carrier_out: 'captured_co2' },
      constraints: { energy_eff: 0.9, energy_cap_max: 1e7, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1200, om_prod: 30 } },
    },
    knobs: [
      { path: 'costs.monetary.energy_cap', label: 'CAPEX', unit: '€/kW' },
      { path: 'constraints.energy_eff',    label: 'Capture eff.', unit: 'fraction' },
    ],
  },
};

/** Build an `addTech` TransformOp for a template id, with optional knob overrides. */
export function templateAddTechOp(templateId, name, knobOverrides = {}) {
  const tpl = TECH_TEMPLATES[templateId];
  if (!tpl) return null;
  const defaults = JSON.parse(JSON.stringify(tpl.def));
  for (const [path, value] of Object.entries(knobOverrides)) {
    if (value == null || value === '' || isNaN(value)) continue;
    _setPath(defaults, path, Number(value));
  }
  return { op: 'addTech', tech: name || templateId, defaults };
}

function _setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
