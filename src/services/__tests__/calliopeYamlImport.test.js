import { describe, it, expect } from 'vitest';
import jsyaml from 'js-yaml';
import { translateCalliopeModel, parseFilesMap } from '../calliopeYamlImport';

// ── Root detection by structure (not filename) ──────────────────────────────
describe('parseFilesMap — root detection', () => {
  const techsYaml = 'techs:\n  grid:\n    base_tech: supply\n    carrier_out: electricity\n';
  const nodesYaml = 'nodes:\n  a:\n    techs:\n      grid:\n';
  const scenariosYaml = 'overrides:\n  o1:\n    config:\n      init.name: x\n';
  const mkMap = (entries) => {
    const m = new Map();
    for (const [k, v] of entries) { m.set(k, v); m.set(k.split('/').pop(), v); }
    return m;
  };

  it('identifies a structurally-detected root when no model.yaml exists', async () => {
    const rootYaml = 'import:\n  - model_config/techs.yaml\n  - model_config/nodes.yaml\nconfig:\n  init:\n    name: THD\n';
    const map = mkMap([
      ['proj/model_main.yaml', rootYaml],
      ['proj/model_config/techs.yaml', techsYaml],
      ['proj/model_config/nodes.yaml', nodesYaml],
      ['proj/scenarios.yaml', scenariosYaml],
    ]);
    const merged = await parseFilesMap(map, () => {});
    expect(merged.config?.init?.name).toBe('THD');
    expect(merged.techs.grid).toBeDefined();  // import resolved
    expect(merged.nodes.a).toBeDefined();
  });

  it('picks the shortest-named root when several candidates exist', async () => {
    const main = 'import:\n  - t.yaml\nconfig:\n  init:\n    name: main\n';
    const incr = 'import:\n  - t.yaml\nconfig:\n  init:\n    name: incremental\n';
    const map = mkMap([
      ['p/model_main.yaml', main],
      ['p/model_incremental.yaml', incr],
      ['p/t.yaml', techsYaml],
    ]);
    const logs = [];
    const merged = await parseFilesMap(map, (m) => logs.push(m));
    expect(merged.config.init.name).toBe('main');
    expect(logs.some(l => /Multiple model roots/.test(l))).toBe(true);
  });

  it('still throws helpfully when only sub-configs are present', async () => {
    const map = mkMap([['p/techs.yaml', techsYaml], ['p/scenarios.yaml', scenariosYaml]]);
    await expect(parseFilesMap(map, () => {})).rejects.toThrow(/root model file/i);
  });
});

describe('translateCalliopeModel — location coordinates', () => {
  it('reads geographic coordinates: {lat, lon}', () => {
    const doc = {
      locations: {
        A: { coordinates: { lat: 49.1, lon: 12.8 } },
      },
    };
    const { locations } = translateCalliopeModel(doc, new Map());
    expect(locations[0]).toMatchObject({ name: 'A', latitude: 49.1, longitude: 12.8, lat: 49.1, lon: 12.8 });
  });

  // Regression: EnerPlanet exports use Calliope's cartesian coordinates: {x, y},
  // where x is longitude and y is latitude. Before the fix these were ignored and
  // every location collapsed to 0,0 ("can't detect location").
  it('reads cartesian coordinates: {x, y} (EnerPlanet), mapping x→lon and y→lat', () => {
    const doc = {
      locations: {
        ID_1: { coordinates: { x: 12.849082360000002, y: 49.00277283663287 } },
        ID_2: { coordinates: { x: 12.837828199999995, y: 49.00561005663367 } },
      },
    };
    const { locations } = translateCalliopeModel(doc, new Map());
    const byName = Object.fromEntries(locations.map(l => [l.name, l]));
    expect(byName.ID_1).toMatchObject({ latitude: 49.00277283663287, longitude: 12.849082360000002 });
    expect(byName.ID_2).toMatchObject({ latitude: 49.00561005663367, longitude: 12.837828199999995 });
    // No location should fall through to the 0,0 default.
    expect(locations.every(l => l.latitude !== 0 && l.longitude !== 0)).toBe(true);
  });

  it('prefers explicit lat/lon over x/y when both are present', () => {
    const doc = {
      locations: {
        A: { coordinates: { lat: 1, lon: 2, x: 99, y: 99 } },
      },
    };
    const { locations } = translateCalliopeModel(doc, new Map());
    expect(locations[0]).toMatchObject({ latitude: 1, longitude: 2 });
  });

  it('defaults to 0,0 when no coordinates are given', () => {
    const { locations } = translateCalliopeModel({ locations: { A: {} } }, new Map());
    expect(locations[0]).toMatchObject({ latitude: 0, longitude: 0 });
  });
});

describe('translateCalliopeModel — missing timeseries', () => {
  const doc = {
    techs: {
      pv_supply:  { essentials: { parent: 'supply_plus', carrier: 'power' } },
      sfh_demand: { essentials: { parent: 'demand', carrier: 'power' } },
    },
    locations: {
      A: {
        coordinates: { x: 12.8, y: 49.0 },
        techs: {
          pv_supply:  { constraints: { resource: 'file=pv_A.csv:capacity_factor' } },
          sfh_demand: { constraints: { resource: 'file=SFH.csv:1550' } },
        },
      },
    },
  };

  it('flags a missing demand-tech CSV as isDemand and a missing supply CSV as not', () => {
    // No CSVs supplied → both files are missing.
    const { missingTimeSeries } = translateCalliopeModel(doc, new Map());
    const byFile = Object.fromEntries(missingTimeSeries.map(m => [m.file, m]));
    expect(byFile['SFH.csv']).toMatchObject({ isDemand: true, refCount: 1 });
    expect(byFile['pv_A.csv']).toMatchObject({ isDemand: false, refCount: 1 });
  });

  it('reports no missing entries when the referenced CSVs are present', () => {
    const files = new Map([
      ['pv_A.csv', 'time,capacity_factor\n2025-01-01 00:00:00,0.1\n'],
      ['SFH.csv',  'time,1550\n2025-01-01 00:00:00,2.0\n'],
    ]);
    const { missingTimeSeries } = translateCalliopeModel(doc, files);
    expect(missingTimeSeries).toEqual([]);
  });
});

describe('translateCalliopeModel — subset_time', () => {
  // Regression: EnerPlanet's subset_time uses ISO timestamps (…T00:00:00Z), which
  // js-yaml parses into Date objects. sanitizeInfinity used to rebuild them as {},
  // yielding "[object Object]" → an invalid date that crashed the Run view.
  it('normalises ISO-timestamp subset_time (parsed by js-yaml as Dates) to YYYY-MM-DD', () => {
    const doc = jsyaml.load(
      'model:\n  subset_time:\n    - 2025-12-10T00:00:00Z\n    - 2025-12-14T00:00:00Z\n',
      { schema: jsyaml.DEFAULT_SCHEMA }
    );
    // Sanity: js-yaml really did give us Date objects, not strings.
    expect(doc.model.subset_time[0]).toBeInstanceOf(Date);
    const { subsetTime } = translateCalliopeModel(doc, new Map());
    expect(subsetTime).toEqual(['2025-12-10', '2025-12-14']);
  });
});
