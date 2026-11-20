import { describe, it, expect } from 'vitest';
import {
  zoneOf, sumByNode, sumByZone, maxShare, lineMetrics, zoneEnergy, zoneTransmission, spearman,
  correlationMatrix, kde, jitter, sporeFamily, familyMinimum, fig5Point, fig6Point,
  capacityAndPotential, fig1Data, fig4Data, tableS1, table1Rows, utilisationRanges,
} from '../sporesFigures.js';

// Two zones (A: regions r1, r2; B: zone node only), one foreign node X.
const metrics = {
  zones: ['A', 'B'],
  foreign: ['X'],
  regionZone: { R1: 'A', R2: 'A', A: 'A', B: 'B' },
  regions: ['R1', 'R2'],
  lineTechs: ['line', 'line_new'],
  expansionLineTechs: ['line_new'],
  windTechs: ['wind'],
  pvTechs: ['pv', 'pv_new'],
  regionWindTechs: ['wind'],
  expandable: ['pv_new', 'bat'],
  curtailmentTech: 'curt',
  hydrogenTech: 'elec',
  methaneTech: 'meth',
  gasLineTechs: ['gasline'],
  groups: [
    { label: 'PV', techs: ['pv_new'] },
    { label: 'Battery', techs: ['bat'] },
    { label: 'Bio', techs: ['bio'], potential: 10 },
    { label: 'Trans', techs: ['line_new'], ends: 'zonal' },
  ],
  fig3Groups: [{ label: 'PV', techs: ['pv_new'] }, { label: 'Transmission', lines: true }],
  fig1Small: [{ label: 'Bio', techs: ['bio'], color: 'g' }],
  fig1Large: [{ label: 'PV', techs: ['pv', 'pv_new'], color: 'y' }],
  fig4Legend: [{ label: 'PV', techs: ['pv', 'pv_new'], color: 'y' }],
  problematic: [
    { id: 'bat', techs: ['bat'], group: 'Battery' },
    { id: 'p2g', techs: ['elec', 'meth'], group: 'Bio' },
  ],
  p2gGroups: ['Bio'], transmissionGroups: ['Trans'], renewableGroups: ['PV'], storageGroups: ['Battery'],
};
const meta = {
  hours: 10,
  potentials: { energy_cap_max: { 'R1::pv_new': 10, 'R2::pv_new': 30, 'A::bat': 20, 'A::line_new:B': 8, 'B::line_new:A': 8 } },
};
const spore = (id, o = {}) => ({
  spore_id: id, stage: o.stage || 'explore', target: o.target || null, cost: 1,
  capacities: {
    'R1::pv': 5, 'R1::pv_new': o.pv1 ?? 5, 'R2::pv_new': o.pv2 ?? 15, 'A::bat': o.bat ?? 10,
    'R1::wind': 3, 'R2::wind': 1, 'A::line:B': 2, 'B::line:A': 2, 'A::line_new:B': o.ln ?? 4, 'B::line_new:A': o.ln ?? 4,
    'X::line_new:R1': 1, 'R1::line_new:X': 1, 'A::meth': 2, 'B::meth': 6,
    ...(o.caps || {}),
  },
  generation: {
    'A::line:B::electricity': 10, 'B::line:A::electricity': 30, 'B::line_new:A::electricity': 30,
    'R1::pv::electricity': 7, 'R1::pv_new::electricity': 3, 'R2::wind::electricity': 4,
    'R1::elec::hydrogen': 5, 'B::meth::methane': 2, 'B::gasline:A::methane': 1.5,
  },
  consumption: { 'R1::curt::electricity': -2, 'R2::curt::electricity': -1, 'R1::elec::electricity': -8 },
});

describe('aggregation', () => {
  it('maps nodes to zones case-insensitively', () => {
    expect(zoneOf('r2', metrics)).toBe('A');
    expect(zoneOf('x', metrics)).toBeNull();
  });
  it('sums per node and per zone, filtering on carrier', () => {
    const s = spore(1);
    expect(sumByNode(s.capacities, ['pv', 'pv_new'])).toEqual({ R1: 10, R2: 15 });
    expect(sumByZone(s.capacities, ['meth'], metrics)).toEqual({ A: 2, B: 6 });
    expect(sumByNode(s.generation, ['elec'], { carrier: 'electricity' })).toEqual({});
    expect(sumByNode(s.generation, ['elec'], { carrier: 'hydrogen' })).toEqual({ R1: 5 });
  });
  it('finds the largest share', () => {
    expect(maxShare({ R1: 1, R2: 3 })).toEqual({ share: 0.75, loc: 'R2' });
    expect(maxShare({ R1: 0 }).share).toBeNull();
  });
});

describe('lines', () => {
  const lines = lineMetrics(spore(1), meta, metrics);
  const ab = lines.find(l => l.key === 'A–B');
  it('one entry per node pair with capacity, expansion and potential', () => {
    expect(lines.map(l => l.key).sort()).toEqual(['A–B', 'R1–X']);
    expect(ab).toMatchObject({ cap: 6, expansion: 4, potential: 8, utilisation: 0.5 });
  });
  it('energy into each end, CF of the dominant direction, net flow a→b', () => {
    expect(ab.into).toEqual({ A: 10, B: 60 });
    expect(ab.cf).toBeCloseTo(60 / (6 * 10));
    expect(ab.net).toBe(50);
  });
  it('zone transmission counts each line once per zone it touches', () => {
    expect(zoneTransmission(spore(1), meta, metrics)).toEqual({ A: 5, B: 4 });
  });
  it('gas lines through the techs option', () => {
    const g = lineMetrics(spore(1), meta, metrics, { techs: ['gasline'], expansionTechs: [] });
    expect(g).toHaveLength(1);
    expect(g[0].into).toEqual({ A: 0, B: 1.5 });
  });
});

describe('zone energy', () => {
  it('curtailment, hydrogen and methane per zone', () => {
    expect(zoneEnergy(spore(1), metrics)).toEqual({
      A: { curtailment: 3, hydrogen: 5, methane: 0 }, B: { curtailment: 0, hydrogen: 0, methane: 2 },
    });
  });
});

describe('Spearman', () => {
  it('matches scipy on ties', () => {
    // scipy.stats.spearmanr([1,2,2,3],[1,3,2,4]).statistic = 0.9486832980505138
    expect(spearman([1, 2, 2, 3], [1, 3, 2, 4])).toBeCloseTo(0.9486832980505138, 12);
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });
  it('is null for constant series', () => {
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it('builds the zone × group matrix in config order, diagonal empty', () => {
    const { atoms, rho } = correlationMatrix([spore(0, { pv1: 1, ln: 1 }), spore(1, { pv1: 2, ln: 2 }), spore(2, { pv1: 3, ln: 3 })], meta, metrics);
    expect(atoms.map(a => `${a.zone}:${a.group}`)).toEqual(['A:PV', 'A:Transmission', 'B:PV', 'B:Transmission']);
    expect(rho[0][0]).toBeNull();
    expect(rho[0][1]).toBeCloseTo(1);
    expect(rho[0][2]).toBeNull(); // B has no PV → constant 0
  });
});

describe('KDE', () => {
  it('uses Scott bandwidth (scipy gaussian_kde)', () => {
    // scipy.stats.gaussian_kde([0.2,0.4,0.5,0.9])(0.5)[0] = 1.1219628196615992
    const d = kde([0.2, 0.4, 0.5, 0.9], { points: 3 });
    expect(d[1].y).toBe(0.5);
    expect(d[1].d).toBeCloseTo(1.1219628196615992, 10);
  });
  it('is null without spread', () => {
    expect(kde([0.3, 0.3])).toBeNull();
    expect(kde([0.3])).toBeNull();
  });
  it('jitter is deterministic and within ±1', () => {
    expect(jitter(5)).toBe(jitter(5));
    for (let i = 0; i < 50; i++) expect(Math.abs(jitter(i))).toBeLessThanOrEqual(1);
  });
});

describe('families', () => {
  const sps = [
    spore(0, { stage: 'cost_optimal' }),
    spore(1, { stage: 'minimise', target: ['bat'], bat: 8 }),
    spore(2, { stage: 'minimise', target: ['bat'], bat: 2 }),
    spore(3, { stage: 'minimise', target: ['meth', 'elec'] }),
    spore(4, { target: ['bat'] }),
  ];
  it('matches a minimise target to its family regardless of order', () => {
    expect(sps.map(s => sporeFamily(s, metrics)?.id ?? null)).toEqual([null, 'bat', 'bat', 'p2g', null]);
  });
  it('picks the family SPORE with the lowest utilisation (D3)', () => {
    expect(familyMinimum(sps, meta, metrics, 'bat').spore_id).toBe(2);
    expect(familyMinimum(sps, meta, metrics, 'nope')).toBeNull();
  });
});

describe('Fig 5 / Fig 6 points', () => {
  it('Fig 5 coordinates', () => {
    const p = fig5Point(spore(1), meta, metrics, { maxWindShare: 0.7, minLineCF: 0.4 });
    expect(p.pvUtil).toBeCloseTo(20 / 40);
    expect(p.pvShare).toBeCloseTo(15 / 25);
    expect(p.methShare).toBeCloseTo(0.75);
    expect(p.windShare).toBe(0.7);
    expect(p.minCF).toBe(0.4);
    expect(p.transUtil).toBeCloseTo(4 / 8);
  });
  it('Fig 6 coordinates', () => {
    expect(fig6Point(spore(1), meta, metrics)).toEqual({ x: 0.5, y: 0.5, storage: 0.5, p2g: 0 });
  });
});

describe('Fig 1 and Fig 4 data', () => {
  it('potential = existing + expansion potential, or a system-wide cap', () => {
    expect(capacityAndPotential(spore(1), meta, ['pv', 'pv_new'], { potentialTechs: ['pv_new'] })).toEqual({ cap: 25, potential: 45 });
    expect(capacityAndPotential(spore(1), meta, ['bio'], { potentialTechs: ['bio'], systemwide: 10 })).toEqual({ cap: 0, potential: 10 });
  });
  it('Fig 1 regions, lines and bars', () => {
    const d = fig1Data(spore(1), meta, metrics);
    expect(d.pv).toEqual({ R1: { cap: 10, potential: 15 }, R2: { cap: 15, potential: 30 } });
    expect(d.lines.map(l => l.key)).toEqual(['A–B']);
    expect(d.large[0]).toMatchObject({ label: 'PV', cap: 25, potential: 45, scope: true });
    expect(d.small[0]).toMatchObject({ cap: 0, potential: 0, scope: false });
  });
  it('Fig 4 regional production and national stack', () => {
    const d = fig4Data(spore(1), meta, metrics);
    expect(d.regions).toEqual({ R1: { pv: 10, wind: 0 }, R2: { pv: 0, wind: 4 } });
    expect(d.stack).toEqual([{ label: 'PV', color: 'y', cap: 25 }]);
    expect(d.gasLines[0].key).toBe('A–B');
  });
});

describe('tables', () => {
  const rows = [
    { spore_id: 0, maxWindShare: 0.5, minLineCF: 0.2, overcapacity: 0 },
    { spore_id: 1, maxWindShare: 0.3, minLineCF: 0.5, overcapacity: 9 },
    { spore_id: 2, maxWindShare: 0.45, minLineCF: 0.6, overcapacity: 1 },
    { spore_id: 3, maxWindShare: 0.35, minLineCF: 0.4, overcapacity: 2 },
    { spore_id: 4, maxWindShare: 0.6, minLineCF: 0.1, overcapacity: 3 },
  ];
  it('Table S1 counts', () => {
    expect(tableS1(rows)).toEqual({ markedlyLower: 2, lower: 3, cf: 3, both: 2 });
  });
  it('Table 1 merges a SPORE that wins several metrics', () => {
    const t = table1Rows(rows);
    expect(t.subset.map(r => r.spore_id)).toEqual([1, 3]);
    expect(t.rows.map(r => [r.names.join('/'), r.row.spore_id])).toEqual([
      ['high overcapacity/low wind concentration/high transmission use', 1],
    ]);
  });
  it('Table 2 utilisation ranges', () => {
    const r = utilisationRanges([spore(1, { bat: 4 }), spore(2, { bat: 10 })], meta, metrics, ['Battery', 'Bio']);
    expect(r.Battery).toEqual([0.2, 0.5]);
    expect(r.Bio).toEqual([0, 0]);
  });
});
