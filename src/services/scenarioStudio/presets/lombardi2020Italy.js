/**
 * Lombardi et al. (2020), Joule 4, 2185–2207 — the Calliope-Italy SPORES study,
 * expressed as Scenario Studio transform ops.
 *
 * Every value is taken from the published model repository
 * (github.com/FLomb/Calliope-Italy, `paper_scenarios/*` diffed against `reference`):
 *   base        = scenario `2050_eff,no_old_techs` of the reference model
 *   variants    = the 9 sensitivity cases (× 3 cost slacks = the paper's 27 scenarios)
 *
 * The reference weather year is 2007: the shipped pv/wind/wind_offshore series equal
 * `full_list_of_weather_years/*_2007.csv` exactly (the model README's "2016" is wrong).
 */

const setCost = (tech, key, value) =>
  ({ op: 'setParam', techMatch: tech, path: `costs.monetary.${key}`, value, level: 'global' });

const swapWeather = (year) => [
  { op: 'swapTimeseries', fromFile: 'pv_series.csv',            toFile: `pv_${year}.csv` },
  { op: 'swapTimeseries', fromFile: 'wind_series.csv',          toFile: `wind_${year}.csv` },
  { op: 'swapTimeseries', fromFile: 'wind_offshore_series.csv', toFile: `windoff_${year}.csv` },
];

/** Scenario `2050_eff,no_old_techs`: 2050 efficient demand, no fossil plants. */
export const BASE_OPS = [
  { op: 'swapTimeseries', fromFile: 'regional_demand.csv', toFile: 'demand_2050_eff.csv', techMatch: ['demand_power'] },
  { op: 'removeTech', techMatch: ['ccgt', 'coal_usc', 'coal', 'oil_&_other'] },
];

/** The 9 sensitivity cases; ops are applied on top of BASE_OPS. */
export const SENSITIVITY_VARIANTS = [
  { id: 'reference', label: 'Reference', ops: [] },
  { id: 'high_p2g_costs', label: 'High P2G costs', ops: [
    setCost('electrolysis', 'energy_cap', 1932), setCost('electrolysis', 'om_annual', 58),
    setCost('methanation_dac', 'energy_cap', 1404), setCost('methanation_dac', 'om_annual', 56),
  ] },
  { id: 'low_p2g_costs', label: 'Low P2G costs', ops: [
    setCost('electrolysis', 'energy_cap', 530), setCost('electrolysis', 'om_annual', 16),
    setCost('methanation_dac', 'energy_cap', 696), setCost('methanation_dac', 'om_annual', 27.8),
  ] },
  { id: 'high_vres_bat_costs', label: 'High VRES + battery costs', ops: [
    setCost('wind_offshore', 'energy_cap', 2976), setCost('pv_farm_new', 'energy_cap', 781),
    setCost('pv_rooftop_new', 'energy_cap', 1005), setCost('battery', 'storage_cap', 620),
  ] },
  { id: 'low_vres_bat_costs', label: 'Low VRES + battery costs', ops: [
    setCost('wind_offshore', 'energy_cap', 1581), setCost('wind_new', 'energy_cap', 744),
    setCost('pv_farm_new', 'energy_cap', 316), setCost('pv_rooftop_new', 'energy_cap', 407),
    setCost('battery', 'storage_cap', 245),
  ] },
  // Demand: GEA-Eff (reference) → DESSTinEE low-growth / IEA 2DS (paper, Experimental Procedures)
  { id: 'low_demand', label: 'Low demand', ops: [
    { op: 'swapTimeseries', fromFile: 'demand_2050_eff.csv', toFile: 'demand_2050_lowgr.csv', techMatch: ['demand_power'] },
  ] },
  { id: 'high_demand', label: 'High demand', ops: [
    { op: 'swapTimeseries', fromFile: 'demand_2050_eff.csv', toFile: 'demand_2050_IEA.csv', techMatch: ['demand_power'] },
  ] },
  { id: 'weather_year_1989', label: 'Worst weather year (1989)', ops: swapWeather(1989) },
  { id: 'weather_year_2010', label: 'Best weather year (2010)', ops: swapWeather(2010) },
];

/** Cost relaxations studied in the paper. */
export const SLACKS = [0.05, 0.10, 0.20];

/**
 * Run settings of the original study, mapped to TEMPO: no unmet-demand slack
 * (run.ensure_feasibility: False) and Gurobi "barrier, tolerances 1e-4" mapped to the
 * HiGHS interior-point method at 1e-4.  Crossover stays ON: unlike Gurobi, HiGHS IPM
 * without crossover fails to return a loadable solution on the degenerate SPORES
 * objectives (verified on the Italy model; the cost-optimal run alone solves either way).
 */
export const MODEL_CONFIG = {
  ensureFeasibility: false,
  solverOptions: { method: 'ipm', crossover: 'on', primalTol: 1e-4, dualTol: 1e-4, optimalityTol: 1e-4 },
};

// ─── SPORES (Lombardi et al. 2020, Experimental Procedures; spores_model_run.py) ──

const INTL = ['FR', 'AT', 'CH', 'SI', 'GR'].map(r => `inter_zonal_new:${r}`);
const ZONES = ['NORD', 'CNOR', 'CSUD', 'SUD', 'SARD', 'SICI'].map(r => `inter_zonal_new:${r}`);
const P2G = ['electrolysis', 'methanation_dac', 'ccgt_syngas'];

/** Scored loc::techs (`techs_new`): every tech with new capacity to deploy. */
export const SCORED_TECHS = [
  'electrolysis', 'ccgt_syngas', 'methanation_dac',
  'biogas_new', 'wind_new', 'wind_offshore', 'pv_farm_new', 'pv_rooftop_new', 'phs_new', 'battery',
  ...INTL, ...ZONES,
];

/**
 * The paper's 178 SPORES per scenario: 50 explore + 3 per minimised tech (18) +
 * 3 per group (EU interconnectors, P2G) + 17 extra for each of the 4 potentially
 * problematic items (bioenergy, offshore wind, batteries, P2G). The repository
 * script ships a smaller test config (10 explore, 3 problematic → 121).
 * Objective weights excl:nos = 10:0.1 follow the paper's Eq. 4 (the original script uses nos 1);
 * all validated ensembles (plan 19) used 0.1.
 */
export const SPORES_PLAN = {
  algorithm: 'lombardi2020',
  metrics: 'lombardi2020Italy', // result analysis config (services/sporesAnalysis.js); ignored by the runner
  scoredTechs: SCORED_TECHS,
  weights: { excl: 10, nos: 0.1 },
  stages: [
    { type: 'explore', count: 50 },
    { type: 'minimise', label: 'Each technology', targets: SCORED_TECHS.filter(t => !P2G.includes(t)).map(t => [t]), countEach: 3 },
    { type: 'minimise', label: 'Technology groups', targets: [INTL, P2G], countEach: 3 },
    { type: 'minimise', label: 'Potentially problematic', targets: [['biogas_new'], ['wind_offshore'], ['battery'], P2G], countEach: 17 },
  ],
};

/** Number of SPORES a plan generates (mirrors spores_lombardi.expand_schedule). */
export function sporesCount(plan) {
  return (plan?.stages || []).reduce((n, s) => n + (s.type === 'explore'
    ? Number(s.count) || 0
    : (s.targets || []).length * (Number(s.countEach) || 0)), 0);
}

// ─── Result metrics (paper Fig 2, Table 1) — config for services/sporesAnalysis.js ──

export const METRICS = {
  modelPowerUnit: 'kW', // for runs saved before results carried their unit
  zones: ['NORD', 'CNOR', 'CSUD', 'SUD', 'SARD', 'SICI'],
  foreign: ['FR', 'AT', 'CH', 'SI', 'GR'],
  // Paper's Fig 4 text says "onshore", but only this total gives its 19.5 % Sardinia share
  windTechs: ['wind', 'wind_new', 'wind_offshore'],
  lineTechs: ['inter_zonal', 'inter_zonal_new'],          // inter-zonal lines
  expansionLineTechs: ['inter_zonal_new'],
  // "renewable and storage discharge capacity" incl. synthetic-methane turbines (Table 1 note)
  overcapTechs: ['pv_farm', 'pv_farm_new', 'pv_rooftop', 'pv_rooftop_new', 'wind', 'wind_new',
                 'wind_offshore', 'phs', 'phs_new', 'battery', 'ccgt_syngas'],
  curtailmentTech: 'el_curtailment',
  units: { power: 1e3, powerLabel: 'GW', energy: 1e3, energyLabel: 'GWh' }, // views get results in MW / MWh
  // Fig 2 rows; "Gas turbines" stands for the whole power-to-gas chain in the paper.
  groups: [
    { label: 'Onshore wind', techs: ['wind_new'] },
    { label: 'Offshore wind', techs: ['wind_offshore'] },
    { label: 'PV', techs: ['pv_farm_new', 'pv_rooftop_new'] },
    // Paper's battery potential, inferred: Fig 1D draws ~100 GW and Fig 2's cost-optimal diamond sits
    // at ~0.18 (17 GW installed). The model itself allows 50 GW per zone (300 GW).
    { label: 'Battery', techs: ['battery'], potential: 100e3 }, // MW
    { label: 'Pumped hydro', techs: ['phs_new'] },
    { label: 'Bioenergy', techs: ['biogas_new'], potential: 4e3 }, // MW; energy_cap_max_systemwide
    { label: 'International transmission', techs: ['inter_zonal_new'], ends: 'international' },
    { label: 'Inter-zone transmission', techs: ['inter_zonal_new'], ends: 'zonal' },
    { label: 'Gas turbines', techs: ['ccgt_syngas'], potential: 44e3 }, // MW; existing fleet (Supplement Table S3)
  ],

  // ── Paper figures (services/sporesFigures.js) ──
  // Bidding zone of each node (Supplement Table S4). SICI / SARD are both region and zone;
  // zone nodes hold battery, P2G turbines, bioenergy and the inter-zonal lines.
  regionZone: {
    R1: 'NORD', R2: 'NORD', R3: 'NORD', R4: 'NORD', R5: 'NORD', R6: 'NORD', R7: 'NORD', R8: 'NORD',
    R9: 'CNOR', R10: 'CNOR', R11: 'CNOR', R12: 'CSUD', R13: 'CSUD', R14: 'CSUD',
    R15: 'SUD', R16: 'SUD', R17: 'SUD', R18: 'SUD',
    SICI: 'SICI', SARD: 'SARD', NORD: 'NORD', CNOR: 'CNOR', CSUD: 'CSUD', SUD: 'SUD',
  },
  // The 20 political regions (Table S4), in the model's numbering
  regions: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14',
            'R15', 'R16', 'R17', 'R18', 'SICI', 'SARD'],
  regionNames: {
    R1: 'Piemonte', R2: "Valle d'Aosta", R3: 'Lombardia', R4: 'Trentino-Alto Adige', R5: 'Veneto',
    R6: 'Friuli-Venezia Giulia', R7: 'Liguria', R8: 'Emilia-Romagna', R9: 'Toscana', R10: 'Umbria',
    R11: 'Marche', R12: 'Lazio', R13: 'Abruzzo', R14: 'Campania', R15: 'Molise', R16: 'Puglia',
    R17: 'Basilicata', R18: 'Calabria', SICI: 'Sicilia', SARD: 'Sardegna',
  },
  // Node coordinates of the published model (paper_scenarios/reference/model_config/locations.yaml),
  // used when the result has no TEMPO model to take locations from (imported contracts).
  coordinates: {
    FR: [44.653819, 6.465166], CH: [46.382945, 8.756699], AT: [47.227596, 11.384870],
    SI: [46.072433, 14.132276], GR: [39.430745, 20.610642],
    NORD: [45.219847, 9.624722], R1: [45.070290, 7.682126], R2: [45.734799, 7.312156],
    R3: [45.856052, 9.396109], R4: [46.073988, 11.121034], R5: [45.437532, 10.994262],
    R6: [46.181871, 13.263686], R7: [44.405555, 8.939465], R8: [44.495152, 11.339577],
    CNOR: [43.460750, 11.861967], R9: [43.770988, 11.245764], R10: [43.070978, 12.619476],
    R11: [43.535521, 13.242770], CSUD: [41.634090, 13.335471], R12: [41.902775, 12.509888],
    R13: [42.351498, 14.146327], R14: [40.855620, 14.273227], SUD: [40.678274, 16.597098],
    R15: [41.578717, 14.659385], R16: [40.352813, 18.169182], R17: [40.647472, 15.804026],
    R18: [39.279639, 16.255107], SICI: [37.511642, 15.085379], SARD: [40.302551, 9.319396],
  },
  // Fig 3 groups, in the paper's order (bottom to top within a zone). Storage = PHS + battery;
  // Transmission = new capacity of the lines with an end in the zone (not defined in the paper).
  fig3Groups: [
    { label: 'PV', techs: ['pv_farm_new', 'pv_rooftop_new'] },
    { label: 'Storage', techs: ['phs_new', 'battery'] },
    { label: 'Gas turbines', techs: ['ccgt_syngas'] },
    { label: 'Bioenergy', techs: ['biogas_new'] },
    { label: 'Transmission', lines: true },
    { label: 'Onshore wind', techs: ['wind_new'] },
    { label: 'Offshore wind', techs: ['wind_offshore'] },
  ],
  // Techs with a capacity expansion potential (energy_cap_max); the others are fixed at today's fleet
  expandable: ['pv_farm_new', 'pv_rooftop_new', 'wind_new', 'wind_offshore', 'battery', 'phs_new',
               'biogas_new', 'electrolysis', 'methanation_dac', 'ccgt_syngas'],
  // Fig 1 panels C and D, in the paper's order: installed cost-optimal capacity (existing + new)
  // against the potential (existing + expansion potential). Conversion techs are sized on their
  // output (hydrogen, methane), as the result contract sizes them.
  fig1Small: [
    { label: 'Pumped hydro', techs: ['phs', 'phs_new'], color: '#1ccfee' },
    { label: 'Waste-to-energy', techs: ['wte'], color: '#33a02c' },
    { label: 'Biogas', techs: ['biogas', 'biogas_new'], systemwide: 4e3, color: '#33a02c' },
    { label: 'Biofuel', techs: ['biofuel'], color: '#33a02c' },
    { label: 'Solid biomass', techs: ['biomass_wood'], color: '#33a02c' },
    { label: 'Hydro dam', techs: ['hydro_dam'], color: '#1ccfee' },
    { label: 'Hydro run-of-river', techs: ['hydro_ror'], color: '#1ccfee' },
    { label: 'Geothermal', techs: ['geothermal'], color: '#d95f0e' },
    { label: 'Methanation', techs: ['methanation_dac'], color: '#a52a2a' },
    { label: 'Electrolysis', techs: ['electrolysis'], color: '#a52a2a' },
    { label: 'Gas turbine', techs: ['ccgt_syngas'], color: '#c9a882' },
  ],
  fig1Large: [
    { label: 'Battery', techs: ['battery'], systemwide: 100e3, color: '#9b3fe0' }, // as groups' Battery
    { label: 'Farm-scale PV', techs: ['pv_farm', 'pv_farm_new'], color: '#f0c020' },
    { label: 'Rooftop PV', techs: ['pv_rooftop', 'pv_rooftop_new'], color: '#f0c020' },
    { label: 'Onshore wind', techs: ['wind', 'wind_new'], color: '#1060f0' },
    { label: 'Offshore wind', techs: ['wind_offshore'], color: '#6f8ff2' },
  ],
  // Fig 1A / Fig 4 column 1: the two bars per region
  pvTechs: ['pv_farm', 'pv_farm_new', 'pv_rooftop', 'pv_rooftop_new'],
  regionWindTechs: ['wind', 'wind_new', 'wind_offshore'],
  // Fig 4 column 4, bottom to top of the stack; legend lists them top to bottom
  fig4Legend: [
    { label: 'Bioenergy', techs: ['biogas', 'biogas_new', 'biofuel', 'biomass_wood', 'wte'], color: '#33a02c' },
    { label: 'Hydro', techs: ['hydro_dam', 'hydro_ror', 'geothermal'], color: '#a6e3f5' },
    { label: 'Farm-scale PV', techs: ['pv_farm', 'pv_farm_new'], color: '#f0c020' },
    { label: 'Rooftop PV', techs: ['pv_rooftop', 'pv_rooftop_new'], color: '#fae3a0' },
    { label: 'Onshore wind', techs: ['wind', 'wind_new'], color: '#1060f0' },
    { label: 'Offshore wind', techs: ['wind_offshore'], color: '#9fb3f5' },
    { label: 'Electrolysis', techs: ['electrolysis'], color: '#a52a2a' },
    { label: 'Methanation', techs: ['methanation_dac'], color: '#d4a0a0' },
    { label: 'Gas turbine', techs: ['ccgt_syngas'], color: '#c9a882' },
    { label: 'Battery', techs: ['battery'], color: '#8a2be2' },
    { label: 'Pumped hydro', techs: ['phs', 'phs_new'], color: '#1ccfee' },
  ],
  hydrogenTech: 'electrolysis',
  methaneTech: 'methanation_dac',
  gasLineTechs: ['gas_inter_zonal_transmission'],
  // Fig 5 families: SPOREs minimising one potentially problematic technology (both the 3-run
  // and the 17-run family of a target count, Fig 5 caption)
  problematic: [
    { id: 'p2g', label: 'Power-to-gas minimised', techs: ['electrolysis', 'methanation_dac', 'ccgt_syngas'], color: '#e8a0b4', group: 'Gas turbines' },
    { id: 'bioenergy', label: 'Bioenergy minimised', techs: ['biogas_new'], color: '#2e8b3e', group: 'Bioenergy' },
    { id: 'offshore', label: 'Offshore wind minimised', techs: ['wind_offshore'], color: '#8fa8e8', group: 'Offshore wind' },
    { id: 'batteries', label: 'Batteries minimised', techs: ['battery'], color: '#b070c8', group: 'Battery' },
  ],
  fig5Axes: { A: [0.10, 0.40], B: [0.10, 0.40], C: [0, 0.5], D: [0, 0.5], x: [0, 1] },
  fig6Axes: { x: [0, 0.8], y: [0.25, 0.60], color: [0, 0.70] },
  // Fig 6 pooled axes (labels of `groups`)
  renewableGroups: ['Onshore wind', 'Offshore wind', 'PV'],
  transmissionGroups: ['International transmission', 'Inter-zone transmission'],
  storageGroups: ['Battery', 'Pumped hydro'],
  p2gGroups: ['Gas turbines'],
  // Fig 6 panels in the paper's order (labels of SENSITIVITY_VARIANTS)
  caseOrder: ['Reference', 'Low P2G costs', 'High P2G costs', 'Low VRES + battery costs', 'High VRES + battery costs',
              'Low demand', 'High demand', 'Best weather year (2010)', 'Worst weather year (1989)'],
};
