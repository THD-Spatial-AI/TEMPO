import { describe, it, expect } from 'vitest';
import { readDemand, demandStats, describeDemand, rescaleTo, replaceDemand } from '../locationDemand';

const series = {
  fileName: 'osm_substation_demand.csv', name: 'osm_substation_demand', source: 'osm-demand',
  dataColumns: ['Copiap', 'Vallenar'],
  data: [
    { datetime: '2024-01-01 00:00', Copiap: -1, Vallenar: -2 },
    { datetime: '2024-01-01 01:00', Copiap: -3, Vallenar: -2 },
  ],
};
const pipelineTech = {
  constraints: { resource: 'file=osm_substation_demand.csv:Copiap', force_resource: true },
  metadata: { estimatedFromPopulation: true, perCapitaKWh: 3500, sectors: { h0_dyn: 1 }, source: 'synthetic' },
};

describe('readDemand', () => {
  it('reads a pipeline column as positive values', () => {
    const d = readDemand(pipelineTech, null, [series], 'Copiapó');
    expect(d).toMatchObject({ kind: 'pipeline', file: 'osm_substation_demand.csv', column: 'Copiap', scale: 1, found: true });
    expect(d.values).toEqual([1, 3]);
  });

  it('applies resource_scale to the values', () => {
    const d = readDemand({ ...pipelineTech, constraints: { ...pipelineTech.constraints, resource_scale: 2 } }, null, [series], 'x');
    expect(d.values).toEqual([2, 6]);
  });

  it('uses the location name as the column when the ref has none, like Calliope', () => {
    const d = readDemand({ constraints: { resource: 'file=osm_substation_demand.csv' } }, null, [{ ...series, source: 'upload' }], 'Vallenar');
    expect(d).toMatchObject({ kind: 'file', column: 'Vallenar', found: true });
  });

  it('reads a saved series from its csv text', () => {
    const saved = { fileName: 'd.csv', csvContent: 'datetime,a\n2024-01-01 00:00,-4\n2024-01-01 01:00,-6' };
    expect(readDemand({ constraints: { resource: 'file=d.csv:a' } }, null, [saved], 'x').values).toEqual([4, 6]);
  });

  it('reports a missing file or column', () => {
    expect(readDemand({ constraints: { resource: 'file=gone.csv:a' } }, null, [series], 'x')).toMatchObject({ kind: 'file', found: false });
  });

  it('reads a constant and an empty demand', () => {
    expect(readDemand({ constraints: { resource: -5 } }, null, [], 'x')).toMatchObject({ kind: 'constant', value: 5 });
    expect(readDemand({ constraints: {} }, null, [], 'x').kind).toBe('none');
  });

  it('falls back to the tech definition constraints', () => {
    expect(readDemand({}, { constraints: { resource: -2 } }, [], 'x')).toMatchObject({ kind: 'constant', value: 2 });
  });
});

describe('demandStats', () => {
  it('gives average, peak and yearly energy in GWh', () => {
    expect(demandStats([1, 3], 'MW')).toEqual({ avg: 2, peak: 3, annualGWh: 2 * 8760 / 1000 });
    expect(demandStats([1000, 3000], 'kW').annualGWh).toBeCloseTo(17.52);
  });
});

describe('describeDemand', () => {
  it('says how the pipeline built the demand', () => {
    const d = readDemand(pipelineTech, null, [series], 'x');
    expect(describeDemand(d)).toEqual({
      title: 'From the study-area demand pipeline',
      detail: 'Population × 3,500 kWh per person per year · Household — dynamic (h0_dyn) shape (synthetic)',
    });
  });

  it('names the file column for an uploaded series', () => {
    const d = readDemand({ constraints: { resource: 'file=d.csv:a' } }, null, [], 'x');
    expect(describeDemand(d).title).toBe('Time series d.csv, column a');
  });
});

describe('rescaleTo', () => {
  it('sets resource_scale so the average hits the target, keeping the shape', () => {
    const d = readDemand(pipelineTech, null, [series], 'x');
    const c = rescaleTo(pipelineTech.constraints, d, 4);
    expect(c).toEqual({ ...pipelineTech.constraints, resource_scale: 2 });
  });

  it('builds on an existing scale', () => {
    const scaled = { ...pipelineTech.constraints, resource_scale: 2 };
    const d = readDemand({ ...pipelineTech, constraints: scaled }, null, [series], 'x');
    expect(rescaleTo(scaled, d, 2).resource_scale).toBe(1);
  });

  it('scales a constant directly', () => {
    const d = readDemand({ constraints: { resource: -5 } }, null, [], 'x');
    expect(rescaleTo({ resource: -5 }, d, 8)).toEqual({ resource: -8 });
  });
});

describe('replaceDemand', () => {
  it('points at a series column and drops the old scale', () => {
    expect(replaceDemand({ resource: 'file=a.csv:x', resource_scale: 3, force_resource: true, energy_con: true }, { file: 'b.csv', column: 'y' }))
      .toEqual({ resource: 'file=b.csv:y', force_resource: true, energy_con: true });
  });

  it('sets a constant demand as a negative resource', () => {
    expect(replaceDemand({ resource: 'file=a.csv:x' }, { constant: 7 })).toEqual({ resource: -7, force_resource: true });
  });
});
