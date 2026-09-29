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
 * Objective weights excl:nos = 10:1 follow the script (the paper's Eq. 4 prints 10 and 0.1).
 */
export const SPORES_PLAN = {
  algorithm: 'lombardi2020',
  metrics: 'lombardi2020Italy', // result analysis config (services/sporesAnalysis.js); ignored by the runner
  scoredTechs: SCORED_TECHS,
  weights: { excl: 10, nos: 1 },
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
  zones: ['NORD', 'CNOR', 'CSUD', 'SUD', 'SARD', 'SICI'],
  foreign: ['FR', 'AT', 'CH', 'SI', 'GR'],
  windTechs: ['wind', 'wind_new'],                       // national onshore wind
  lineTechs: ['inter_zonal', 'inter_zonal_new'],          // inter-zonal lines
  expansionLineTechs: ['inter_zonal_new'],
  // "renewable and storage discharge capacity" incl. synthetic-methane turbines (Table 1 note)
  overcapTechs: ['pv_farm', 'pv_farm_new', 'pv_rooftop', 'pv_rooftop_new', 'wind', 'wind_new',
                 'wind_offshore', 'phs', 'phs_new', 'battery', 'ccgt_syngas'],
  curtailmentTech: 'el_curtailment',
  units: { power: 1e6, powerLabel: 'GW', energy: 1e6, energyLabel: 'GWh' }, // model is in kW / kWh
  // Fig 2 rows; "Gas turbines" stands for the whole power-to-gas chain in the paper.
  groups: [
    { label: 'Onshore wind', techs: ['wind_new'] },
    { label: 'Offshore wind', techs: ['wind_offshore'] },
    { label: 'PV', techs: ['pv_farm_new', 'pv_rooftop_new'] },
    { label: 'Battery', techs: ['battery'] },
    { label: 'Pumped hydro', techs: ['phs_new'] },
    { label: 'Bioenergy', techs: ['biogas_new'], potential: 4e6 }, // energy_cap_max_systemwide
    { label: 'International transmission', techs: ['inter_zonal_new'], ends: 'international' },
    { label: 'Inter-zone transmission', techs: ['inter_zonal_new'], ends: 'zonal' },
    { label: 'Gas turbines', techs: ['ccgt_syngas'] },
  ],
};
