import { describe, it, expect } from 'vitest';
import {
  groupUtilisation, classifyTechs, sporeMetrics, bestRanking,
} from '../sporesAnalysis.js';

// Two zones (NORD, SARD), one foreign node (FR), kW / kWh like Calliope-Italy.
const METRICS = {
  zones: ['NORD', 'SARD'],
  foreign: ['FR'],
  windTechs: ['wind', 'wind_new'],
  lineTechs: ['inter_zonal', 'inter_zonal_new'],
  expansionLineTechs: ['inter_zonal_new'],
  overcapTechs: ['pv_farm_new', 'wind_new', 'battery'],
  curtailmentTech: 'el_curtailment',
  groups: [
    { label: 'PV', techs: ['pv_farm_new'] },
    { label: 'Battery', techs: ['battery'], storage: true },
    { label: 'International transmission', techs: ['inter_zonal_new'], ends: 'international' },
    { label: 'Inter-zonal transmission', techs: ['inter_zonal_new'], ends: 'zonal' },
  ],
};

const meta = {
  hours: 10,
  potentials: {
    energy_cap_max: {
      'nord::pv_farm_new': 100, 'sard::pv_farm_new': 100,
      'nord::inter_zonal_new:sard': 50, 'sard::inter_zonal_new:nord': 50,
      'nord::inter_zonal_new:fr': 20, 'fr::inter_zonal_new:nord': 20,
    },
    storage_cap_max: { 'nord::battery': 400 },
  },
};

const spore = (id, pv, bat, line, windN, windS, flow, curt) => ({
  spore_id: id, cost: 100 + id,
  capacities: {
    'nord::pv_farm_new': pv, 'nord::battery': bat,
    'nord::wind': windN, 'sard::wind_new': windS,
    'nord::inter_zonal:sard': 10, 'sard::inter_zonal:nord': 10,
    'nord::inter_zonal_new:sard': line, 'sard::inter_zonal_new:nord': line,
    'nord::inter_zonal_new:fr': 5, 'fr::inter_zonal_new:nord': 5,
  },
  storage_capacities: { 'nord::battery': bat * 4 },
  generation: {
    'nord::inter_zonal:sard::electricity': flow, 'sard::inter_zonal:nord::electricity': flow,
    'nord::inter_zonal_new:sard::electricity': flow, 'sard::inter_zonal_new:nord::electricity': 0,
  },
  consumption: { 'sard::el_curtailment::electricity': -curt },
});

describe('groupUtilisation — installed / potential per paper group', () => {
  it('sums capacity over potential, storage groups use storage_cap', () => {
    const u = groupUtilisation(spore(0, 50, 10, 25, 0, 0, 0, 0), meta, METRICS);
    expect(u.PV).toBeCloseTo(0.25);                 // 50 / 200
    expect(u.Battery).toBeCloseTo(0.1);             // 40 kWh / 400
    expect(u['Inter-zonal transmission']).toBeCloseTo(0.5);   // 2×25 / 2×50
    expect(u['International transmission']).toBeCloseTo(0.25); // 2×5 / 2×20
  });
});

describe('classifyTechs — paper rule across cost relaxations', () => {
  it('must-have never zero; real choice zero at the lowest slack; costly otherwise', () => {
    const ens = [
      { slack: 0.05, utilisation: [{ A: 0.5, B: 0.2, C: 0 }, { A: 0.4, B: 0.1, C: 0.3 }] },
      { slack: 0.20, utilisation: [{ A: 0.3, B: 0, C: 0 }, { A: 0.2, B: 0.1, C: 0.1 }] },
    ];
    const c = Object.fromEntries(classifyTechs(ens).map(r => [r.tech, r]));
    expect(c.A.class).toBe('must-have');
    expect(c.B.class).toBe('costly to replace');
    expect(c.C.class).toBe('real choice');
    expect(c.C.zeroShare).toEqual({ 0.05: 0.5, 0.2: 0.5 });
  });
});

describe('sporeMetrics — Lombardi 2020 Table 1', () => {
  const opt = spore(0, 50, 10, 25, 30, 70, 100, 5);
  const alt = spore(1, 80, 20, 5, 50, 50, 20, 9);
  const m0 = sporeMetrics(opt, meta, METRICS);
  const m1 = sporeMetrics(alt, meta, METRICS, opt);

  it('max regional share of national onshore wind', () => {
    expect(m0.maxWindShare).toBeCloseTo(0.7);
    expect(m0.maxWindRegion).toBe('sard');
    expect(m1.maxWindShare).toBeCloseTo(0.5);
  });

  it('minimum inter-zonal line capacity factor (both directions, all line techs)', () => {
    // NORD–SARD: cap 10 + 25 = 35, flow 100 + 100 + 100 = 300 over 10 h → 300 / 350
    expect(m0.minLineCF).toBeCloseTo(300 / 350);
  });

  it('transmission expansion, overcapacity vs cost-optimal, curtailment', () => {
    expect(m0.transmissionExpansion).toBeCloseTo(25);
    expect(m1.transmissionExpansion).toBeCloseTo(5);
    expect(m0.overcapacity).toBe(0);
    expect(m1.overcapacity).toBeCloseTo((80 + 50 + 20) - (50 + 70 + 10));
    expect(m1.curtailment).toBeCloseTo(9);
  });
});

describe('bestRanking — Table 1 subset + best per metric', () => {
  it('keeps SPORES with lower wind concentration than optimal and all lines ≥ 30 % CF', () => {
    const rows = [
      { spore_id: 0, maxWindShare: 0.2, minLineCF: 0.26, overcapacity: 0 },
      { spore_id: 1, maxWindShare: 0.15, minLineCF: 0.35, overcapacity: 5 },
      { spore_id: 2, maxWindShare: 0.10, minLineCF: 0.31, overcapacity: 1 },
      { spore_id: 3, maxWindShare: 0.09, minLineCF: 0.20, overcapacity: 9 },
    ];
    const r = bestRanking(rows);
    expect(r.subset.map(x => x.spore_id)).toEqual([1, 2]);
    expect(r.lowWindConcentration.spore_id).toBe(2);
    expect(r.highTransmissionUse.spore_id).toBe(1);
    expect(r.highOvercapacity.spore_id).toBe(1);
  });
});

describe('groupUtilisation — system-wide potential', () => {
  it('uses a fixed potential when the group gives one (energy_cap_max_systemwide)', () => {
    const s = { capacities: { 'nord::biogas_new': 1, 'sard::biogas_new': 1 } };
    const m = { potentials: { energy_cap_max: { 'nord::biogas_new': 4, 'sard::biogas_new': 4 } } };
    expect(groupUtilisation(s, m, { groups: [{ label: 'Bio', techs: ['biogas_new'], potential: 4 }] }).Bio).toBeCloseTo(0.5);
  });
});

describe('aggregate utilisation (paper Fig 6 axes) and run labels', () => {
  it('pools several groups as Σ used / Σ potential', async () => {
    const { aggregateUtilisation } = await import('../sporesAnalysis.js');
    const s = { capacities: { 'nord::pv_farm_new': 50, 'nord::inter_zonal_new:fr': 5, 'fr::inter_zonal_new:nord': 5 } };
    // PV 50/200, International 10/40 → pooled 60/240
    expect(aggregateUtilisation(s, meta, METRICS, ['PV', 'International transmission'])).toBeCloseTo(0.25);
  });

  it('splits a Studio run label into year, case and slack', async () => {
    const { parseRunLabel } = await import('../sporesAnalysis.js');
    expect(parseRunLabel('2050 · High P2G costs · SPORES 10%')).toEqual({ year: '2050', case: 'High P2G costs', slack: 10 });
    expect(parseRunLabel('2050 · SPORES 5%')).toEqual({ year: '2050', case: 'Reference', slack: 5 });
  });

  it('resolves the Italy metrics from the plan, else one group per scored tech', async () => {
    const { resolveMetrics } = await import('../sporesAnalysis.js');
    expect(resolveMetrics({ plan: { metrics: 'lombardi2020Italy' } }).zones).toContain('SARD');
    const generic = resolveMetrics({ plan: {}, potentials: { energy_cap_max: { 'a::pv': 1, 'b::pv': 2, 'a::wind': 3 } } });
    expect(generic.groups.map(g => g.label)).toEqual(['pv', 'wind']);
  });
});
