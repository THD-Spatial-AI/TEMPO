import { describe, it, expect } from 'vitest';
import { contractToCompletedJob } from '../importResult.js';
import { powerUnitOfJob } from '../modelUnits.js';
import { parseRunLabel } from '../../services/sporesAnalysis.js';

const now = new Date('2026-11-19T10:00:00Z');

describe('contractToCompletedJob', () => {
  it('rejects JSON that is not a contract', () => {
    expect(() => contractToCompletedJob({ foo: 1 })).toThrow(/result contract/);
    expect(() => contractToCompletedJob(null)).toThrow();
  });

  it('wraps a plain contract; unit stamped only when given', () => {
    const j = contractToCompletedJob({ objective: 5, capacities: { 'a::b': 1 } }, { name: 'x', unit: 'kW', now });
    expect(j).toMatchObject({ modelName: 'x', status: 'completed', objective: 5, framework: 'calliope07', mode: 'plan' });
    expect(j.result.model_power_unit).toBe('kW');
    expect(contractToCompletedJob({ capacities: {} }, { now }).result.model_power_unit).toBeUndefined();
  });

  it('adds the SPORES plan when missing, keeps an existing one', () => {
    const c = { spores_data: [{}], spores_meta: { slack: 0.1, planned: 120 } };
    const j = contractToCompletedJob(c, { now });
    expect(j.result.spores_meta.plan.metrics).toBe('lombardi2020Italy');
    expect(j.result.spores_meta.plan.slack).toBe(0.1);
    expect(powerUnitOfJob(j, [])).toBe('kW');       // from the preset
    const own = { algorithm: 'lombardi2020', slack: 0.2 };
    expect(contractToCompletedJob({ ...c, spores_meta: { plan: own } }, { now }).result.spores_meta.plan).toBe(own);
  });

  it('takes the slack from the SPOREs when spores_meta has none (MEME extractor)', () => {
    const c = { spores_data: [{ slack: 0.2 }, { slack: 0.2 }], spores_meta: { planned: 1 } };
    const j = contractToCompletedJob(c, { now });
    expect(j.result.spores_meta.plan.slack).toBe(0.2);
    expect(parseRunLabel(j.variantLabel).slack).toBe(20);
  });

  it('puts SPORES imports in one batch whose label the comparison parses', () => {
    const j = contractToCompletedJob({ spores_data: [{}], spores_meta: { slack: 0.05 } }, { now });
    expect(j.batchId).toBe('imported');
    expect(parseRunLabel(j.variantLabel)).toEqual({ year: 'Imported', case: 'Imported', slack: 5 });
  });
});
