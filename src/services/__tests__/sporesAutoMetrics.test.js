import { describe, it, expect } from 'vitest';
import { techType, autoMetrics, figureMetrics } from '../sporesAutoMetrics.js';
import { groupUtilisation, sporeMetrics } from '../sporesAnalysis.js';
import { fig5Point, fig6Point, fig1Data, correlationMatrix, familyMinimum } from '../sporesFigures.js';

describe('techType', () => {
  it.each([
    ['wind_onshore', {}, 'wind'], ['eol_norte', {}, 'wind'], ['solar_pv', {}, 'pv'], ['pFV_arica', {}, 'pv'],
    ['hydro_ror', {}, 'hydro'], ['hydrogen_tank', {}, 'hydrogen'], ['electrolyser', {}, 'hydrogen'],
    ['battery', {}, 'storage'], ['anything', { parent: 'storage' }, 'storage'], ['biomass_chp', {}, 'bioenergy'],
    ['ccgt', {}, 'thermal'], ['methanation_dac', {}, 'p2g'], ['ac_line', { parent: 'transmission' }, 'transmission'],
    ['demand_power', { parent: 'demand' }, null], ['el_curtailment', {}, null], ['widget', {}, 'other'],
    ['x', { carrier: 'hydrogen' }, 'hydrogen'],
  ])('%s → %s', (tech, info, type) => {
    expect(techType(tech, info)).toBe(type);
  });
});

// A small generic model: two locations a, b; a line between them.
const spore = (id, o = {}) => ({
  spore_id: id, stage: o.stage || (id ? 'explore' : 'cost_optimal'), target: o.target || null, cost: 100 + id,
  capacities: {
    'a::wind_new': o.wind ?? 10, 'b::wind_new': 5, 'a::solar_pv': o.pv ?? 4, 'a::battery': o.bat ?? 2, 'b::ccgt': 3,
    'a::ac_line:b': o.line ?? 1, 'b::ac_line:a': o.line ?? 1,
  },
  generation: { 'a::wind_new::electricity': 30, 'b::ac_line:a::electricity': 2 },
  consumption: {},
});
const spores = [spore(0), spore(1, { wind: 20, stage: 'minimise' }), spore(2, { stage: 'minimise', target: ['battery'], bat: 0 }), spore(3, { stage: 'minimise', target: ['battery'], bat: 1 })];
const meta = {
  hours: 10,
  potentials: { energy_cap_max: { 'a::wind_new': 40, 'b::wind_new': 10, 'a::solar_pv': 8, 'a::battery': 4, 'a::ac_line:b': 2, 'b::ac_line:a': 2 } },
};
const techMeta = { battery: { parent: 'storage' }, ccgt: { parent: 'supply' }, ac_line: { parent: 'transmission' } };

describe('autoMetrics with potentials', () => {
  const m = autoMetrics(spores, meta, { techMeta, locations: [{ name: 'A', calliopeName: 'a', latitude: 1, longitude: 2 }] });
  it('groups expandable techs by type, in figure order', () => {
    expect(m.groups.map(g => [g.label, g.techs])).toEqual([
      ['Wind', ['wind_new']], ['PV', ['solar_pv']], ['Storage', ['battery']], ['Transmission', ['ac_line']],
    ]);
    expect(m.relative).toBe(false);
  });
  it('locations as zones, coordinates and names from the model', () => {
    expect(m.zones).toEqual(['A', 'B']);
    expect(m.coordinates).toEqual({ A: [1, 2] });
    expect(m.regionNames.A).toBe('A');
  });
  it('fixed techs go to Fig 1C, expandable ones to Fig 1D', () => {
    expect(m.fig1Small.map(b => b.label)).toEqual(['Thermal']);
    expect(m.fig1Large.map(b => b.label)).toEqual(['Wind', 'PV', 'Storage']);
  });
  it('families from minimise targets, ranked on their type group', () => {
    expect(m.problematic.map(f => [f.id, f.group])).toEqual([['battery', 'Storage']]);
    expect(familyMinimum(spores, meta, m, 'battery').spore_id).toBe(2);
  });
  it('utilisation over the potentials', () => {
    expect(groupUtilisation(spores[0], meta, m)).toMatchObject({ Wind: 15 / 50, PV: 0.5, Storage: 0.5, Transmission: 0.5 });
  });
  it('drives the figure functions', () => {
    const rows = spores.map(s => sporeMetrics(s, meta, m, spores[0]));
    expect(rows[0].maxWindShare).toBeCloseTo(10 / 15);
    expect(rows[0].minLineCF).toBeCloseTo(2 / (1 * 10));
    const p5 = fig5Point(spores[0], meta, m, rows[0]);
    expect(p5.windUtil).toBeCloseTo(0.3);
    expect(p5.pvUtil).toBeCloseTo(0.5);
    expect(fig6Point(spores[0], meta, m)).toMatchObject({ x: 0.5, y: (15 + 4) / (50 + 8), storage: 0.5 });
    expect(fig1Data(spores[0], meta, m).large.find(b => b.label === 'Wind')).toMatchObject({ cap: 15, potential: 50 });
    expect(correlationMatrix(spores, meta, m).atoms).toHaveLength(2 * 4);
  });
});

describe('autoMetrics without potentials (native Calliope SPORES)', () => {
  const m = autoMetrics(spores, { hours: 10 }, { techMeta });
  it('expandable = capacity changes across SPOREs; utilisation relative to the ensemble maximum', () => {
    expect(m.relative).toBe(true);
    expect(m.groups.map(g => g.label)).toEqual(['Wind', 'Storage']);
    expect(m.groups[0].potential).toBe(25);
    expect(groupUtilisation(spores[0], {}, m).Wind).toBeCloseTo(15 / 25);
  });
});

describe('figureMetrics', () => {
  it('uses the Italy preset only for the Italy model', () => {
    const italyCaps = Object.fromEntries(['NORD', 'CNOR', 'CSUD', 'SUD', 'SARD', 'SICI'].map(z => [`${z}::battery`, 1]));
    expect(figureMetrics({ spores_data: [{ capacities: italyCaps }], spores_meta: { plan: { metrics: 'lombardi2020Italy' } } }).auto).toBeUndefined();
    expect(figureMetrics({ spores_data: spores, spores_meta: { plan: { metrics: 'lombardi2020Italy' } } }).auto).toBe(true);
    expect(figureMetrics({ spores_data: spores }).auto).toBe(true);
  });
});
