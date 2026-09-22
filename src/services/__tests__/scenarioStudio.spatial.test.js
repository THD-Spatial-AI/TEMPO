import { describe, it, expect } from 'vitest';
import { applyOps } from '../scenarioStudio/transform.js';
import { TECH_TEMPLATES, templateAddTechOp } from '../scenarioStudio/techTemplates.js';

function makeModel() {
  return {
    technologies: [
      { name: 'solar_pv', parent: 'supply', constraints: { energy_cap_max: 5000 } },
    ],
    locations: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    links: [
      { from: 'A', to: 'B', linkType: 'hvac_overhead', capacity: 1000 },
      { from: 'B', to: 'C', linkType: 'hvdc_subsea',   capacity: 500 },
      { from: 'A', to: 'C', linkType: 'hvac_overhead' }, // no capacity set
    ],
  };
}

// ─── link ops ──────────────────────────────────────────────────────────────────

describe('scaleLinkCap / setLinkCap', () => {
  it('scales all links with a defined capacity, skips undefined', () => {
    const out = applyOps(makeModel(), [{ op: 'scaleLinkCap', linkMatch: 'all', factor: 2 }]);
    expect(out.links[0].capacity).toBe(2000);
    expect(out.links[1].capacity).toBe(1000);
    expect(out.links[2].capacity).toBeUndefined(); // had none, not injected
  });

  it('scales only links of a given linkType', () => {
    const out = applyOps(makeModel(), [{ op: 'scaleLinkCap', linkMatch: { linkType: 'hvac_overhead' }, factor: 1.5 }]);
    expect(out.links[0].capacity).toBe(1500); // hvac
    expect(out.links[1].capacity).toBe(500);  // hvdc untouched
  });

  it('matches a specific pair undirected', () => {
    const out = applyOps(makeModel(), [{ op: 'setLinkCap', linkMatch: { from: 'C', to: 'B' }, value: 9999 }]);
    expect(out.links[1].capacity).toBe(9999); // B,C matched via C,B
    expect(out.links[0].capacity).toBe(1000);
  });

  it('setLinkCap sets capacity even when previously undefined', () => {
    const out = applyOps(makeModel(), [{ op: 'setLinkCap', linkMatch: { linkType: 'hvac_overhead' }, value: 750 }]);
    expect(out.links[0].capacity).toBe(750);
    expect(out.links[2].capacity).toBe(750);
  });

  it('does not mutate the original model', () => {
    const m = makeModel();
    applyOps(m, [{ op: 'scaleLinkCap', linkMatch: 'all', factor: 3 }]);
    expect(m.links[0].capacity).toBe(1000);
  });

  it('is a no-op on a model with no links', () => {
    const out = applyOps({ technologies: [] }, [{ op: 'scaleLinkCap', linkMatch: 'all', factor: 2 }]);
    expect(out.technologies).toEqual([]);
  });
});

// ─── tech templates ─────────────────────────────────────────────────────────────

describe('techTemplates', () => {
  it('builds an addTech op from a template', () => {
    const op = templateAddTechOp('electrolyser', 'my_electrolyser');
    expect(op.op).toBe('addTech');
    expect(op.tech).toBe('my_electrolyser');
    expect(op.defaults.essentials.carrier_in).toBe('electricity');
    expect(op.defaults.essentials.carrier_out).toBe('hydrogen');
  });

  it('applies knob overrides into the tech def', () => {
    const op = templateAddTechOp('electrolyser', 'ely', {
      'costs.monetary.energy_cap': 500,
      'constraints.energy_eff': 0.7,
    });
    expect(op.defaults.costs.monetary.energy_cap).toBe(500);
    expect(op.defaults.constraints.energy_eff).toBe(0.7);
  });

  it('ignores empty / NaN knob overrides', () => {
    const op = templateAddTechOp('electrolyser', 'ely', { 'costs.monetary.energy_cap': '' });
    expect(op.defaults.costs.monetary.energy_cap).toBe(800); // default retained
  });

  it('adds the templated tech to the model via applyOps', () => {
    const m = makeModel();
    const op = templateAddTechOp('hydrogen_storage', 'h2_store');
    const out = applyOps(m, [op]);
    const added = out.technologies.find(t => t.name === 'h2_store');
    expect(added).toBeTruthy();
    expect(added.essentials.carrier).toBe('hydrogen');
    expect(added.parent).toBe('storage');
    // original model untouched
    expect(m.technologies.some(t => t.name === 'h2_store')).toBe(false);
  });

  it('returns null for an unknown template', () => {
    expect(templateAddTechOp('nope', 'x')).toBeNull();
  });

  it('every template has a label, def with essentials.parent, and knobs', () => {
    for (const [id, tpl] of Object.entries(TECH_TEMPLATES)) {
      expect(tpl.label, id).toBeTruthy();
      expect(tpl.def.essentials.parent, id).toBeTruthy();
      expect(Array.isArray(tpl.knobs), id).toBe(true);
    }
  });
});
