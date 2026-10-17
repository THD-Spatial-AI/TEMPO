/**
 * Calliope models published on GitHub that TEMPO offers as templates. They are downloaded on first
 * use and cached (electron/templateStore.cjs); `rootYaml` / `basePath` are relative to the templates root.
 */
// ─── known server-side YAML templates ────────────────────────────────────────
// Add entries here as more YAML models are placed in public/templates/
export const SERVER_TEMPLATES = [
  {
    id:          'italian_model',
    name:        'Italian Energy System',
    description: 'Multi-region Italian power system (6–20 nodes) with VRE, thermal, hydro, storage and import/export technologies. Includes 2015 timeseries data.',
    flag:        '🇮🇹',
    rootYaml:    'Italian_model/model.yaml',
    basePath:    'Italian_model',
    // All YAML imports relative to basePath (resolved automatically but listed for transparency)
    imports:     [
      'model_config/techs.yaml',
      'model_config/locations.yaml',
      'overrides.yaml',
      'model_config/new_techs.yaml',
      'model_config/new_locations.yaml',
    ],
    // Timeseries CSVs in timeseries_data/ (optional, loaded if present)
    csvFiles:    [
      'timeseries_data/regional_demand.csv',
      'timeseries_data/pv_series.csv',
      'timeseries_data/wind_series.csv',
      'timeseries_data/wind_offshore_series.csv',
      'timeseries_data/hydro_reservoirs.csv',
    ],
    // Not referenced by the YAML, but swapped in by the Lombardi et al. (2020)
    // sensitivity cases (worst / best weather year) — carried in the model so
    // remote (MEME) runs have them too.
    extraCsvFiles: [
      'timeseries_data/pv_1989.csv', 'timeseries_data/wind_1989.csv', 'timeseries_data/windoff_1989.csv',
      'timeseries_data/pv_2010.csv', 'timeseries_data/wind_2010.csv', 'timeseries_data/windoff_2010.csv',
    ],
    color: 'green',
  },
  {
    id:          'uk_model',
    name:        'UK Energy System',
    description: 'Multi-zone UK power system (17 zones) with wind, solar, hydro, fossil, nuclear, storage and HVAC/HVDC transmission. Based on UK-Calliope 0.6.3.',
    flag:        '🇬🇧',
    rootYaml:    'uk-calliope-master/uk-calliope-master/model.yaml',
    basePath:    'uk-calliope-master/uk-calliope-master',
    // YAML imports are auto-discovered recursively — no need to list them explicitly
    imports:     [],
    csvFiles:    [
      'data/demand.csv',
      'data/pv.csv',
      'data/wind_onshore.csv',
      'data/wind_offshore.csv',
    ],
    color: 'blue',
  },
  {
    id:          'cambridge_model',
    name:        'Cambridge District Energy',
    description: 'West Cambridge district-scale multi-carrier model (~50 building nodes) with CHP, GSHP, PV, solar thermal, storage and district heat/gas/electricity networks.',
    flag:        '🎓',
    rootYaml:    'cambridge-calliope-master/model/model.yaml',
    basePath:    'cambridge-calliope-master/model',
    // YAML imports + CSVs are auto-discovered via fetchYamlRecursive
    imports:     [],
    csvFiles:    [],
    auto:        true,
    color: 'purple',
  },
];
