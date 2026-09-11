import { describe, it, expect } from 'vitest';
import { applyOps } from '../scenarioStudio/transform.js';
import { accumulateExistingCaps, carryForwardTechs, buildCarryForwardOp } from '../scenarioStudio/pathway.js';

function makeModel() {
  return {
    technologies: [
      { name: 'solar_pv',   parent: 'supply',  constraints: { energy_cap_max: 5000 }, costs: { monetary: { energy_cap: 600, energy_prod: 0.01 } } },
      { name: 'coal_power', parent: 'supply',  constraints: { energy_cap_max: 2000 }, costs: { monetary: { energy_cap: 1500, energy_prod: 0.03 } } },
      { name: 'demand_el',  parent: 'demand',  constraints: { resource_scale: 1.0 } },
      { name: 'battery',    parent: 'storage', constraints: { storage_cap_max: 1000 }, costs: { monetary: { storage_cap: 300 } } },
    ],
    locations: [
      { name: 'Norte', techs: { solar_pv: { constraints: { resource: 'file=cf.csv:Norte', energy_cap_max: 2000 } }, coal_power: {} } },
      { name: 'Sur',   techs: { solar_pv: { constraints: { resource: 'file=cf.csv:Sur' } } } },
    ],
    locationTechAssignments: { Norte: ['solar_pv', 'coal_power'], Sur: ['solar_pv'] },
  };
}

// ─── accumulateExistingCaps ─────────────────────────────────────────────────────

describe('accumulateExistingCaps', () => {
  it('collapses _existing shadow onto base tech and sums', () => {
    const caps = {
      'norte::solar_pv': 100,
      'norte::solar_pv_existing': 400,
      'sur::solar_pv': 50,
    };
    const out = accumulateExistingCaps(caps);
    expect(out['norte::solar_pv']).toBe(500);
    expect(out['sur::solar_pv']).toBe(50);
    expect(out['norte::solar_pv_existing']).toBeUndefined();
  });

  it('drops zero / negative capacities', () => {
    const out = accumulateExistingCaps({ 'a::t': 0, 'b::t': -5, 'c::t': 10 });
    expect(out).toEqual({ 'c::t': 10 });
  });
});

// ─── carryForwardTechs ──────────────────────────────────────────────────────────

describe('carryForwardTechs', () => {
  it('includes supply and storage, excludes demand', () => {
    const techs = carryForwardTechs(makeModel());
    expect(techs).toContain('solar_pv');
    expect(techs).toContain('battery');
    expect(techs).not.toContain('demand_el');
  });
});

// ─── vintageResidual via applyOps ───────────────────────────────────────────────

describe('vintageResidual', () => {
  const priorCaps = { 'norte::solar_pv': 1200, 'sur::solar_pv': 800, 'norte::coal_power': 500 };

  it('creates a capex-free _existing shadow tech that keeps opex', () => {
    const m = makeModel();
    const op = buildCarryForwardOp(m, priorCaps);
    const out = applyOps(m, [op]);
    const shadow = out.technologies.find(t => t.name === 'solar_pv_existing');
    expect(shadow).toBeTruthy();
    expect(shadow.costs.monetary.energy_cap).toBe(0);     // capex zeroed
    expect(shadow.costs.monetary.energy_prod).toBe(0.01); // opex kept
    expect(shadow.parent).toBe('supply');
  });

  it('fixes per-location capacity via energy_cap_equals', () => {
    const m = makeModel();
    const out = applyOps(m, [buildCarryForwardOp(m, priorCaps)]);
    const norte = out.locations.find(l => l.name === 'Norte');
    const sur = out.locations.find(l => l.name === 'Sur');
    expect(norte.techs.solar_pv_existing.constraints.energy_cap_equals).toBe(1200);
    expect(sur.techs.solar_pv_existing.constraints.energy_cap_equals).toBe(800);
  });

  it('inherits the resource profile from the base per-location override', () => {
    const m = makeModel();
    const out = applyOps(m, [buildCarryForwardOp(m, priorCaps)]);
    const norte = out.locations.find(l => l.name === 'Norte');
    expect(norte.techs.solar_pv_existing.constraints.resource).toBe('file=cf.csv:Norte');
  });

  it('leaves the original extendable tech untouched (still pays capex)', () => {
    const m = makeModel();
    const out = applyOps(m, [buildCarryForwardOp(m, priorCaps)]);
    const orig = out.technologies.find(t => t.name === 'solar_pv');
    expect(orig.costs.monetary.energy_cap).toBe(600);
    expect(orig.constraints.energy_cap_max).toBe(5000);
  });

  it('registers the shadow tech in locationTechAssignments (assignment-mode)', () => {
    const m = makeModel();
    const out = applyOps(m, [buildCarryForwardOp(m, priorCaps)]);
    expect(out.locationTechAssignments.Norte).toContain('solar_pv_existing');
    expect(out.locationTechAssignments.Sur).toContain('solar_pv_existing');
  });

  it('does not mutate the original model', () => {
    const m = makeModel();
    applyOps(m, [buildCarryForwardOp(m, priorCaps)]);
    expect(m.technologies.some(t => t.name === 'solar_pv_existing')).toBe(false);
    expect(m.locationTechAssignments.Norte).not.toContain('solar_pv_existing');
  });

  it('buildCarryForwardOp returns null on empty prior capacities', () => {
    expect(buildCarryForwardOp(makeModel(), {})).toBeNull();
    expect(buildCarryForwardOp(makeModel(), null)).toBeNull();
  });

  it('matches locations by normalised id (lowercase/space-safe)', () => {
    const m = makeModel();
    // result loc token normalised: "Norte" → "norte"
    const out = applyOps(m, [{ op: 'vintageResidual', techMatch: ['solar_pv'], existingCaps: { 'norte::solar_pv': 999 } }]);
    const norte = out.locations.find(l => l.name === 'Norte');
    expect(norte.techs.solar_pv_existing.constraints.energy_cap_equals).toBe(999);
  });
});
