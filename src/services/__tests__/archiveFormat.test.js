import { describe, it, expect } from 'vitest';
import { detectArchiveFormat } from '../archiveFormat';

describe('detectArchiveFormat', () => {
  it('detects a Calliope archive by model.yaml at any depth', () => {
    expect(detectArchiveFormat(['my_model/model.yaml', 'my_model/techs.yaml'])).toBe('calliope');
    expect(detectArchiveFormat(['model.yml'])).toBe('calliope');
  });

  it('detects an AdOpT-NET0 case directory by Topology.json + ConfigModel.json', () => {
    expect(detectArchiveFormat([
      'case/Topology.json',
      'case/ConfigModel.json',
      'case/period1/node_data/n1/Technologies.json',
    ])).toBe('adoptnet0');
  });

  it('does not classify Topology.json alone as AdOpT-NET0', () => {
    expect(detectArchiveFormat(['Topology.json'])).toBe('unknown');
  });

  it('detects a PyPSA archive by a netCDF file', () => {
    expect(detectArchiveFormat(['export/model.nc', 'export/report.txt'])).toBe('pypsa');
  });

  it('detects a PyPSA CSV folder by buses.csv', () => {
    expect(detectArchiveFormat([
      'csv/buses.csv', 'csv/generators.csv', 'csv/snapshots.csv',
    ])).toBe('pypsa');
  });

  it('detects an otoole OSeMOSYS dataset', () => {
    expect(detectArchiveFormat([
      'data/SpecifiedAnnualDemand.csv', 'data/TECHNOLOGY.csv',
    ])).toBe('osemosys');
    expect(detectArchiveFormat(['TECHNOLOGY.csv', 'REGION.csv'])).toBe('osemosys');
    expect(detectArchiveFormat(['YearSplit.csv'])).toBe('osemosys');
  });

  it('does not classify TECHNOLOGY.csv alone as OSeMOSYS', () => {
    expect(detectArchiveFormat(['TECHNOLOGY.csv'])).toBe('unknown');
  });

  it('is case-insensitive and separator-agnostic', () => {
    expect(detectArchiveFormat(['CSV\\Buses.CSV'])).toBe('pypsa');
    expect(detectArchiveFormat(['a\\b\\MODEL.YAML'])).toBe('calliope');
  });

  it('prefers calliope when model.yaml coexists with CSVs', () => {
    expect(detectArchiveFormat(['model.yaml', 'buses.csv'])).toBe('calliope');
  });

  it('returns unknown for empty or unrelated listings', () => {
    expect(detectArchiveFormat([])).toBe('unknown');
    expect(detectArchiveFormat(undefined)).toBe('unknown');
    expect(detectArchiveFormat(['readme.md', 'data.xlsx'])).toBe('unknown');
  });
});
