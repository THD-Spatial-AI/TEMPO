import { describe, it, expect } from 'vitest';
import {
  EMPTY_SCENARIO, CARD_CATEGORIES, defaultCardParams, expandCard, buildScenarioVariants,
  scenarioFromGraph, canConnect, previousYear, summarizeYearOps, SCENARIO_TEMPLATES,
} from '../scenarioStudio/scenario.js';

const yearNode = (id, year) => ({ id, type: 'year', data: { year } });
const configNode = (id, category, params = {}, parentId) => ({ id, type: 'config', parentId, data: { category, params } });
const gedge = (source, target) => ({ id: `${source}->${target}`, source, target });

function makeModel() {
  return {
    technologies: [
      { name: 'solar_pv',           parent: 'supply', constraints: { energy_cap_max: 5000 } },
      { name: 'coal_power',         parent: 'supply', constraints: { energy_cap_max: 2000 } },
      { name: 'demand_electricity', parent: 'demand', constraints: { resource_scale: 1.0 } },
    ],
    locations: [],
  };
}
const card = (category, year, params = {}) => ({ id: `c_${category}_${year}`, category, year, params });

// ─── metadata + defaults ─────────────────────────────────────────────────────────

describe('scenario metadata', () => {
  it('EMPTY_SCENARIO has a default year axis and no cards', () => {
    const s = EMPTY_SCENARIO();
    expect(s.years.length).toBeGreaterThan(1);
    expect(s.cards).toEqual([]);
  });

  it('recipe trajectory cards are Global-lane only', () => {
    const recipeCats = CARD_CATEGORIES.filter(c => c.id.startsWith('recipe:'));
    expect(recipeCats.length).toBeGreaterThan(0);
    recipeCats.forEach(c => expect(c.lanes).toEqual(['global']));
  });

  it('defaultCardParams returns per-category defaults', () => {
    expect(defaultCardParams('demand')).toEqual({ scale: 1.0 });
    expect(defaultCardParams('constraint').kind).toBe('co2_cap');
    expect(defaultCardParams('recipe:carbonCap').startCap).toBeDefined();
  });
});

// ─── expandCard ───────────────────────────────────────────────────────────────────

describe('expandCard', () => {
  const model = makeModel();

  it('demand → scaleParam on demand techs by the card scale', () => {
    const ops = expandCard(model, card('demand', 2030, { scale: 1.2 }), 2030);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.2 });
  });

  it('constraint → systemConstraint op', () => {
    const ops = expandCard(model, card('constraint', null, { kind: 'co2_cap', value: 50 }), 2030);
    expect(ops).toEqual([{ op: 'systemConstraint', kind: 'co2_cap', value: 50 }]);
  });

  it('tech disable/set/scale map to the right ops', () => {
    expect(expandCard(model, card('tech', null, { mode: 'disable', techMatch: 'coal_power' }), 2030))
      .toEqual([{ op: 'disableTech', techMatch: 'coal_power' }]);
    expect(expandCard(model, card('tech', null, { mode: 'set', techMatch: 'solar_pv', path: 'constraints.energy_cap_max', value: 9000, level: 'global' }), 2030)[0])
      .toMatchObject({ op: 'setParam', techMatch: 'solar_pv', value: 9000 });
    expect(expandCard(model, card('tech', null, { mode: 'scale', techMatch: 'solar_pv', path: 'constraints.energy_cap_max', factor: 2, level: 'global' }), 2030)[0])
      .toMatchObject({ op: 'scaleParam', factor: 2 });
  });

  it('tech with no techMatch yields no ops', () => {
    expect(expandCard(model, card('tech', null, { mode: 'disable', techMatch: '' }), 2030)).toEqual([]);
  });

  it('location → a location-scoped op (locMatch + level:location)', () => {
    const disable = expandCard(model, card('location', 2030, { location: 'north', mode: 'disable', techMatch: 'coal_power' }), 2030);
    expect(disable[0]).toMatchObject({ op: 'setParam', techMatch: 'coal_power', path: 'constraints.energy_cap_max', value: 0, level: 'location', locMatch: 'north' });
    const scale = expandCard(model, card('location', null, { location: 'south', mode: 'scale', techMatch: 'solar_pv', path: 'constraints.energy_cap_max', factor: 2 }), 2030);
    expect(scale[0]).toMatchObject({ op: 'scaleParam', locMatch: 'south', level: 'location', factor: 2 });
    // Incomplete → no ops.
    expect(expandCard(model, card('location', null, { location: '', techMatch: '' }), 2030)).toEqual([]);
  });

  it('custom → raw ops passthrough', () => {
    const raw = [{ op: 'disableTech', techMatch: 'coal_power' }];
    expect(expandCard(model, card('custom', null, { ops: raw }), 2030)).toEqual(raw);
  });

  it('recipe trajectory card emits ops for the matching year only', () => {
    const c = card('recipe:carbonCap', null, defaultCardParams('recipe:carbonCap'));
    const ops = expandCard(model, c, 2030);
    expect(ops.some(o => o.op === 'systemConstraint' && o.kind === 'co2_cap')).toBe(true);
    // A year outside the recipe's snapshot range yields nothing.
    expect(expandCard(model, c, 1999)).toEqual([]);
  });
});

// ─── buildScenarioVariants ─────────────────────────────────────────────────────────

describe('buildScenarioVariants', () => {
  const model = makeModel();

  it('produces one variant per year, sorted', () => {
    const scenario = { years: [2040, 2025, 2030], cards: [] };
    const { variants } = buildScenarioVariants(model, scenario);
    expect(variants.map(v => v.year)).toEqual([2025, 2030, 2040]);
    expect(variants.every(v => Array.isArray(v.ops))).toBe(true);
  });

  it('broadcasts a Global-lane card to every year', () => {
    const scenario = { years: [2025, 2030], cards: [card('constraint', null, { kind: 'co2_cap', value: 10 })] };
    const { variants } = buildScenarioVariants(model, scenario);
    variants.forEach(v => expect(v.ops).toContainEqual({ op: 'systemConstraint', kind: 'co2_cap', value: 10 }));
  });

  it('applies a year-column card only to its year', () => {
    const scenario = { years: [2025, 2030], cards: [card('constraint', 2030, { kind: 'co2_cap', value: 5 })] };
    const { variants } = buildScenarioVariants(model, scenario);
    const y2025 = variants.find(v => v.year === 2025);
    const y2030 = variants.find(v => v.year === 2030);
    expect(y2025.ops).toEqual([]);
    expect(y2030.ops).toContainEqual({ op: 'systemConstraint', kind: 'co2_cap', value: 5 });
  });

  it('composes overlapping demand scales multiplicatively within a year', () => {
    const scenario = {
      years: [2030],
      cards: [
        card('demand', null, { scale: 1.1 }),   // global broadcast
        card('demand', 2030, { scale: 1.2 }),   // year-specific
      ],
    };
    const { variants } = buildScenarioVariants(model, scenario);
    const op = variants[0].ops.find(o => o.op === 'scaleParam' && o.techMatch === 'demand_electricity');
    expect(op.factor).toBeCloseTo(1.32); // 1.1 * 1.2
  });

  it('empty board / no years yields no variants', () => {
    expect(buildScenarioVariants(model, { years: [], cards: [] }).variants).toEqual([]);
    expect(buildScenarioVariants(null, { years: [2025], cards: [] }).variants).toEqual([]);
  });
});

// ─── scenarioFromGraph + canConnect ────────────────────────────────────────────

describe('scenarioFromGraph', () => {
  it('reads years from year nodes, sorted & unique', () => {
    const nodes = [yearNode('y1', 2040), yearNode('y2', 2025), yearNode('y3', 2025)];
    expect(scenarioFromGraph(nodes, []).years).toEqual([2025, 2040]);
  });

  it('a config with no year parent becomes a Global (year=null) card', () => {
    const nodes = [yearNode('y1', 2030), configNode('c1', 'constraint', { kind: 'co2_cap', value: 10 })];
    const { cards } = scenarioFromGraph(nodes);
    expect(cards).toEqual([{ id: 'c1', category: 'constraint', year: null, params: { kind: 'co2_cap', value: 10 } }]);
  });

  it('a config nested in a Year (parentId) applies to that year', () => {
    const nodes = [yearNode('y1', 2025), yearNode('y2', 2030), configNode('c1', 'demand', { scale: 1.1 }, 'y2')];
    const { cards } = scenarioFromGraph(nodes);
    expect(cards).toEqual([{ id: 'c1', category: 'demand', year: 2030, params: { scale: 1.1 } }]);
  });

  it('feeds buildScenarioVariants end-to-end (nested = that year only)', () => {
    const nodes = [yearNode('y1', 2025), yearNode('y2', 2030),
      configNode('c1', 'constraint', { kind: 'co2_cap', value: 5 }, 'y2')]; // nested in 2030
    const scenario = scenarioFromGraph(nodes);
    const { variants } = buildScenarioVariants(makeModel(), scenario);
    expect(variants.find(v => v.year === 2025).ops).toEqual([]);
    expect(variants.find(v => v.year === 2030).ops).toContainEqual({ op: 'systemConstraint', kind: 'co2_cap', value: 5 });
  });
});

describe('canConnect (Year → Year only; scoping is by nesting)', () => {
  const nodes = [yearNode('y1', 2030), configNode('c1', 'demand'), configNode('c2', 'tech')];
  it('rejects year → config (configs are nested, not wired)', () => {
    expect(canConnect(nodes, [], { source: 'y1', target: 'c1' })).toBe(false);
  });
  it('rejects config → anything and self', () => {
    expect(canConnect(nodes, [], { source: 'c1', target: 'y1' })).toBe(false);
    expect(canConnect(nodes, [], { source: 'c1', target: 'c2' })).toBe(false);
    expect(canConnect(nodes, [], { source: 'y1', target: 'y1' })).toBe(false);
  });

  it('allows Year → Year (consecutive) but keeps it linear & acyclic', () => {
    const ns = [yearNode('y1', 2025), yearNode('y2', 2030), yearNode('y3', 2035)];
    expect(canConnect(ns, [], { source: 'y1', target: 'y2' })).toBe(true);
    // y1 already has a successor:
    expect(canConnect(ns, [gedge('y1', 'y2')], { source: 'y1', target: 'y3' })).toBe(false);
    // y2 already has a predecessor:
    expect(canConnect(ns, [gedge('y1', 'y2')], { source: 'y3', target: 'y2' })).toBe(false);
    // cycle:
    expect(canConnect(ns, [gedge('y1', 'y2'), gedge('y2', 'y3')], { source: 'y3', target: 'y1' })).toBe(false);
  });
});

describe('previousYear', () => {
  it('uses the Year→Year chain predecessor when present', () => {
    const ns = [yearNode('y1', 2025), yearNode('y2', 2030)];
    expect(previousYear(ns, [gedge('y1', 'y2')], 2030)).toBe(2025);
  });
  it('falls back to the next-lower year value', () => {
    const ns = [yearNode('y1', 2025), yearNode('y2', 2030), yearNode('y3', 2040)];
    expect(previousYear(ns, [], 2040)).toBe(2030);
    expect(previousYear(ns, [], 2025)).toBeNull();
  });
});

describe('summarizeYearOps', () => {
  const model = makeModel();
  it('extracts demand scale, constraints, disabled techs', () => {
    const ops = [
      { op: 'scaleParam', techMatch: 'demand_electricity', path: 'constraints.resource_scale', factor: 1.2 },
      { op: 'systemConstraint', kind: 'co2_cap', value: 40 },
      { op: 'disableTech', techMatch: 'coal_power' },
    ];
    const s = summarizeYearOps(model, ops);
    expect(s.demandScale).toBe(1.2);
    expect(s.constraints).toEqual({ co2_cap: 40 });
    expect(s.disabled).toEqual(['coal_power']);
  });
});

describe('SCENARIO_TEMPLATES', () => {
  it('each template builds a valid graph that yields variants', () => {
    const model = makeModel();
    SCENARIO_TEMPLATES.forEach(t => {
      const { nodes, edges } = t.build();
      expect(nodes.some(n => n.type === 'year')).toBe(true);
      const scenario = scenarioFromGraph(nodes, edges);
      const { variants } = buildScenarioVariants(model, scenario);
      expect(variants.length).toBeGreaterThan(0);
    });
  });
});
