import { describe, it, expect } from 'vitest';
import {
  buildScenarioVariants, scenarioFromGraph, expandCard, SCENARIO_TEMPLATES,
} from '../scenarioStudio/scenario.js';
import {
  BASE_OPS, SENSITIVITY_VARIANTS, SLACKS, MODEL_CONFIG, SPORES_PLAN, sporesCount,
} from '../scenarioStudio/presets/lombardi2020Italy.js';

const model = {
  technologies: [
    { name: 'demand_power', parent: 'demand' }, { name: 'ccgt', parent: 'supply' },
    { name: 'electrolysis', parent: 'conversion' }, { name: 'battery', parent: 'storage' },
  ],
  locations: [],
};

const byLabel = (vs) => Object.fromEntries(vs.map(v => [v.label, v]));

describe('Lombardi 2020 preset', () => {
  it('reproduces the paper’s 178 SPORES per scenario', () => {
    expect(sporesCount(SPORES_PLAN)).toBe(178);
  });
});

describe('new Studio cards', () => {
  it('Technology card "remove" → removeTech (Calliope exists: false)', () => {
    const ops = expandCard(model, { category: 'tech', params: { target: 'single', techMatch: ['ccgt'], mode: 'remove' } }, 2050);
    expect(ops).toEqual([{ op: 'removeTech', techMatch: ['ccgt'] }]);
  });

  it('Time-series card → swapTimeseries', () => {
    const ops = expandCard(model, { category: 'timeseries', params: { fromFile: 'pv_series.csv', toFile: 'pv_1989.csv', techMatch: '' } }, 2050);
    expect(ops).toEqual([{ op: 'swapTimeseries', fromFile: 'pv_series.csv', toFile: 'pv_1989.csv' }]);
  });

  it('a Sensitivity card multiplies each year by its variants', () => {
    const scenario = {
      years: [2050],
      cards: [{ id: 's', category: 'sensitivity', year: null, params: { variants: [
        { id: 'a', label: 'A', ops: [] },
        { id: 'b', label: 'B', ops: [{ op: 'removeTech', techMatch: ['battery'] }] },
      ] } }],
    };
    const { variants } = buildScenarioVariants(model, scenario);
    expect(variants.map(v => v.label)).toEqual(['2050 · A', '2050 · B']);
    expect(variants[1].ops).toEqual([{ op: 'removeTech', techMatch: ['battery'] }]);
    expect(variants.every(v => v.year === 2050)).toBe(true);
  });

  it('a SPORES card attaches one plan per slack and the run settings', () => {
    const scenario = {
      years: [2050],
      cards: [{ id: 'sp', category: 'spores', year: null, params: { slacks: [5, 20], plan: SPORES_PLAN, modelConfig: MODEL_CONFIG } }],
    };
    const { variants } = buildScenarioVariants(model, scenario);
    expect(variants.map(v => v.label)).toEqual(['2050 · SPORES 5%', '2050 · SPORES 20%']);
    expect(variants.map(v => v.sporesPlan.slack)).toEqual([0.05, 0.2]);
    expect(variants[0].sporesPlan.stages).toEqual(SPORES_PLAN.stages);
    expect(variants[0].modelConfig).toEqual(MODEL_CONFIG);
  });
});

describe('Lombardi 2020 — Italy template', () => {
  const tpl = SCENARIO_TEMPLATES.find(t => t.id === 'lombardi2020Italy');
  const { variants } = buildScenarioVariants(model, scenarioFromGraph(tpl.build().nodes));

  it('expands to the paper’s 27 scenarios (9 sensitivity cases × 3 cost relaxations)', () => {
    expect(variants).toHaveLength(SENSITIVITY_VARIANTS.length * SLACKS.length);
    expect(variants).toHaveLength(27);
    expect(new Set(variants.map(v => v.sporesPlan.slack))).toEqual(new Set(SLACKS));
  });

  it('every run carries the base scenario 2050_eff,no_old_techs plus its sensitivity ops', () => {
    const v = byLabel(variants);
    expect(v['2050 · Reference · SPORES 10%'].ops).toEqual(BASE_OPS);
    const p2g = SENSITIVITY_VARIANTS.find(s => s.id === 'high_p2g_costs');
    expect(v['2050 · High P2G costs · SPORES 20%'].ops).toEqual([...BASE_OPS, ...p2g.ops]);
    expect(variants.every(x => JSON.stringify(x.modelConfig) === JSON.stringify(MODEL_CONFIG))).toBe(true);
  });
});
