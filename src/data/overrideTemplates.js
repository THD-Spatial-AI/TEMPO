/**
 * Calliope Override & Scenario Template Library
 *
 * Config structures follow Calliope 0.6.x YAML conventions.
 * Dotted keys like "model.subset_time" are resolved by Calliope as nested paths.
 *
 * Categories:
 *   time       – time subset and resolution overrides
 *   solver     – solver choice, mode, feasibility
 *   climate    – CO₂ caps, renewable share, emission costs
 *   economic   – objective function, cost sensitivity
 *   technology – per-technology parameter changes (parameterised)
 *   demand     – demand scaling and flexibility (parameterised)
 */

// ─── TIME OVERRIDES ──────────────────────────────────────────────────────────
export const TIME_TEMPLATES = [
  {
    id: 'debug_1day',
    name: '1-Day Debug',
    icon: '⚡',
    description: 'Run just one day of data — fastest possible test run.',
    detail: 'Use this to quickly verify that the model structure is correct before committing to a full solve. Sets time range to the first 24 h of your timeseries.',
    tags: ['debug', 'fast', 'test'],
    params: [
      { key: 'start', label: 'Start date', type: 'date', default: '2024-01-01' },
      { key: 'end',   label: 'End date',   type: 'date', default: '2024-01-02' },
    ],
    buildConfig: (p) => ({ 'model.subset_time': [p.start, p.end] }),
  },
  {
    id: 'debug_3days',
    name: '3-Day Debug',
    icon: '📅',
    description: 'Three days — enough to capture a daily storage cycle.',
    detail: 'Good first validation step that exercises storage charge/discharge dynamics without long runtimes.',
    tags: ['debug', 'fast', 'storage'],
    params: [
      { key: 'start', label: 'Start date', type: 'date', default: '2024-01-01' },
      { key: 'end',   label: 'End date',   type: 'date', default: '2024-01-04' },
    ],
    buildConfig: (p) => ({ 'model.subset_time': [p.start, p.end] }),
  },
  {
    id: 'week_summer',
    name: 'Summer Week',
    icon: '☀️',
    description: 'Representative high-solar, low-demand summer week.',
    detail: 'A single week is sufficient to analyse short-run operational dispatch. Adjust dates to a peak-solar week in your region.',
    tags: ['week', 'summer', 'solar'],
    params: [
      { key: 'start', label: 'Week start', type: 'date', default: '2024-07-01' },
      { key: 'end',   label: 'Week end',   type: 'date', default: '2024-07-08' },
    ],
    buildConfig: (p) => ({ 'model.subset_time': [p.start, p.end] }),
  },
  {
    id: 'week_winter',
    name: 'Winter Week',
    icon: '❄️',
    description: 'Representative high-demand, low-solar winter week.',
    detail: 'Tests the hardest reliability period for most European grids. High heating demand with short days and low PV output.',
    tags: ['week', 'winter', 'demand'],
    params: [
      { key: 'start', label: 'Week start', type: 'date', default: '2024-01-08' },
      { key: 'end',   label: 'Week end',   type: 'date', default: '2024-01-15' },
    ],
    buildConfig: (p) => ({ 'model.subset_time': [p.start, p.end] }),
  },
  {
    id: 'full_year',
    name: 'Full Year',
    icon: '🗓️',
    description: 'Run all 8 760 h — the standard planning horizon.',
    detail: 'Required to correctly capture seasonal storage, annual capacity factors, and investment decisions. Longest runtime.',
    tags: ['annual', 'full', 'planning'],
    params: [
      { key: 'start', label: 'Year start', type: 'date', default: '2024-01-01' },
      { key: 'end',   label: 'Year end',   type: 'date', default: '2024-12-31' },
    ],
    buildConfig: (p) => ({ 'model.subset_time': [p.start, p.end] }),
  },
  {
    id: 'res_1H',
    name: '1-Hour Resolution',
    icon: '🔬',
    description: 'Highest temporal detail — native hourly timesteps.',
    detail: 'Use when frequency regulation or intra-hour ramps are important. Maximises accuracy but increases solve time.',
    tags: ['resolution', 'hourly'],
    params: [],
    buildConfig: () => ({
      'model.time': { function: 'resample', function_options: { resolution: '1H' } },
    }),
  },
  {
    id: 'res_3H',
    name: '3-Hour Resolution',
    icon: '⏱️',
    description: 'Good balance between accuracy and solve speed.',
    detail: 'A 3-hour resolution is the most common choice in academic and commercial energy system studies.',
    tags: ['resolution', '3h'],
    params: [],
    buildConfig: () => ({
      'model.time': { function: 'resample', function_options: { resolution: '3H' } },
    }),
  },
  {
    id: 'res_6H',
    name: '6-Hour Resolution',
    icon: '⌛',
    description: 'Faster solves with moderate accuracy loss.',
    detail: 'Suitable for long-term capacity planning where intra-day dynamics matter less than seasonal patterns.',
    tags: ['resolution', '6h', 'fast'],
    params: [],
    buildConfig: () => ({
      'model.time': { function: 'resample', function_options: { resolution: '6H' } },
    }),
  },
  {
    id: 'res_daily',
    name: 'Daily Resolution',
    icon: '📆',
    description: 'Aggregate to daily timesteps — very fast.',
    detail: 'Best for multi-decade planning horizons where hourly dispatch is not modelled. Loses intra-day storage cycling.',
    tags: ['resolution', 'daily', 'fast'],
    params: [],
    buildConfig: () => ({
      'model.time': { function: 'resample', function_options: { resolution: '24H' } },
    }),
  },
];

// ─── SOLVER OVERRIDES ────────────────────────────────────────────────────────
export const SOLVER_TEMPLATES = [
  {
    id: 'solver_highs',
    name: 'HiGHS Solver',
    icon: '⚙️',
    description: 'Open-source LP/MIP solver — recommended free option.',
    detail: 'HiGHS is fast, free, and works for most energy system models. No licence required.',
    tags: ['solver', 'highs', 'free'],
    params: [],
    buildConfig: () => ({ run: { solver: 'highs' } }),
  },
  {
    id: 'solver_gurobi',
    name: 'Gurobi Solver',
    icon: '🚀',
    description: 'Commercial LP/MIP solver — fastest for large models.',
    detail: 'Requires a licence. Typically 5–10× faster than open-source alternatives for large MILPs.',
    tags: ['solver', 'gurobi', 'commercial'],
    params: [],
    buildConfig: () => ({ run: { solver: 'gurobi' } }),
  },
  {
    id: 'solver_cbc',
    name: 'CBC Solver',
    icon: '🔧',
    description: 'Calliope default open-source solver.',
    detail: 'Reliable and well-tested with Calliope. Good for small to medium models.',
    tags: ['solver', 'cbc', 'default'],
    params: [],
    buildConfig: () => ({ run: { solver: 'cbc' } }),
  },
  {
    id: 'solver_glpk',
    name: 'GLPK Solver',
    icon: '🔩',
    description: 'GNU Linear Programming Kit — lightweight open-source.',
    detail: 'Slowest of the common options but very portable. Good for simple LP-only models.',
    tags: ['solver', 'glpk'],
    params: [],
    buildConfig: () => ({ run: { solver: 'glpk' } }),
  },
  {
    id: 'ensure_feasibility',
    name: 'Ensure Feasibility',
    icon: '🛡️',
    description: 'Allow unmet demand — prevents infeasibility errors.',
    detail: 'Adds an "unmet demand" slack variable so the optimisation always finds a solution. Recommended during development. Any unmet demand appears in results with a high cost.',
    tags: ['feasibility', 'slack', 'debug'],
    params: [
      { key: 'bigM', label: 'Unmet demand penalty (bigM)', type: 'number', default: 1000000 },
    ],
    buildConfig: (p) => ({ run: { ensure_feasibility: true, bigM: Number(p.bigM) } }),
  },
  {
    id: 'strict_no_slack',
    name: 'Strict (No Slack)',
    icon: '🔒',
    description: 'Disable unmet demand — model must fully balance supply.',
    detail: 'Use once the model is validated. The optimisation will fail if supply cannot meet demand, which highlights structural issues.',
    tags: ['strict', 'production'],
    params: [],
    buildConfig: () => ({ run: { ensure_feasibility: false } }),
  },
  {
    id: 'cyclic_storage_on',
    name: 'Cyclic Storage On',
    icon: '🔄',
    description: 'Storage level wraps from last to first timestep.',
    detail: 'Enforces that the storage level at the end of the period equals the level at the start. Useful for annual planning to avoid "free storage" at period end.',
    tags: ['storage', 'cyclic'],
    params: [],
    buildConfig: () => ({ run: { cyclic_storage: true } }),
  },
  {
    id: 'cyclic_storage_off',
    name: 'Cyclic Storage Off',
    icon: '➡️',
    description: 'Storage does not wrap — can empty fully at period end.',
    detail: 'Allows the model to exploit end-of-period storage depletion. Suitable for sub-year simulations where continuity is not required.',
    tags: ['storage', 'cyclic'],
    params: [],
    buildConfig: () => ({ run: { cyclic_storage: false } }),
  },
  {
    id: 'plan_mode',
    name: 'Planning Mode',
    icon: '📐',
    description: 'Optimise capacity investment decisions.',
    detail: 'The default Calliope mode. The model chooses how much capacity to build at each location to minimise total system cost.',
    tags: ['mode', 'planning', 'investment'],
    params: [],
    buildConfig: () => ({ run: { mode: 'plan' } }),
  },
  {
    id: 'operation_mode',
    name: 'Operation Mode',
    icon: '▶️',
    description: 'Dispatch simulation with fixed capacities.',
    detail: 'Use after a planning run. Capacities are fixed and only dispatch decisions are optimised. Useful for profiling system operation.',
    tags: ['mode', 'dispatch', 'operation'],
    params: [],
    buildConfig: () => ({ run: { mode: 'operation' } }),
  },
];

// ─── CLIMATE / EMISSIONS OVERRIDES ───────────────────────────────────────────
export const CLIMATE_TEMPLATES = [
  {
    id: 'minimize_emissions',
    name: 'Minimise Emissions',
    icon: '🌍',
    description: 'Set CO₂ cost as the sole objective.',
    detail: 'Requires a "co2" cost class defined on your technologies. Sets the objective to minimise total CO₂ at zero monetary weighting. Useful for finding the minimum-emissions configuration.',
    tags: ['co2', 'emissions', 'objective'],
    params: [],
    buildConfig: () => ({
      run: {
        objective_options: {
          cost_class: { monetary: 0, co2: 1 },
          sense: 'minimize',
        },
      },
    }),
  },
  {
    id: 'balanced_objective',
    name: 'Balanced Cost+CO₂',
    icon: '⚖️',
    description: 'Equal weight on cost and emissions in the objective.',
    detail: 'Jointly minimises monetary cost and CO₂ emissions. Normalise both cost classes to comparable units for meaningful results.',
    tags: ['co2', 'cost', 'multi-objective'],
    params: [
      { key: 'monetary_weight', label: 'Monetary weight', type: 'number', default: 1 },
      { key: 'co2_weight',      label: 'CO₂ weight',      type: 'number', default: 1 },
    ],
    buildConfig: (p) => ({
      run: {
        objective_options: {
          cost_class: { monetary: Number(p.monetary_weight), co2: Number(p.co2_weight) },
          sense: 'minimize',
        },
      },
    }),
  },
  {
    id: 'co2_cap_net_zero',
    name: 'Net Zero CO₂',
    icon: '🌿',
    description: 'Hard cap: zero net CO₂ emissions from the system.',
    detail: 'Uses a Calliope group_constraints cost_max on the co2 cost class. Requires technologies to have co2 costs defined.',
    tags: ['net-zero', 'co2', 'constraint'],
    params: [
      { key: 'cap', label: 'Max CO₂ (cost units)', type: 'number', default: 0 },
    ],
    buildConfig: (p) => ({
      group_constraints: {
        global_co2_cap: { cost_max: { co2: Number(p.cap) } },
      },
    }),
  },
  {
    id: 'co2_cap_strict',
    name: 'Strict CO₂ Cap (−80%)',
    icon: '🔴',
    description: 'Cap total system CO₂ at 80% below a reference value.',
    detail: 'Set the cap in your CO₂ cost units (e.g. tonnes/MWh × capacity). Adjust the default to match your model\'s cost-class scale.',
    tags: ['co2', 'cap', 'strict', 'deep-decarbonisation'],
    params: [
      { key: 'cap', label: 'CO₂ cap (cost units)', type: 'number', default: 200 },
    ],
    buildConfig: (p) => ({
      group_constraints: {
        global_co2_cap: { cost_max: { co2: Number(p.cap) } },
      },
    }),
  },
  {
    id: 'co2_cap_medium',
    name: 'Medium CO₂ Cap (−50%)',
    icon: '🟡',
    description: 'Moderate decarbonisation — halfway to net zero.',
    detail: 'A good intermediate scenario to compare with the strict cap and baseline.',
    tags: ['co2', 'cap', 'medium'],
    params: [
      { key: 'cap', label: 'CO₂ cap (cost units)', type: 'number', default: 500 },
    ],
    buildConfig: (p) => ({
      group_constraints: {
        global_co2_cap: { cost_max: { co2: Number(p.cap) } },
      },
    }),
  },
  {
    id: 'co2_cap_relaxed',
    name: 'Relaxed CO₂ Cap',
    icon: '🟢',
    description: 'Light-touch emissions constraint — minimal cost impact.',
    detail: 'Sets a loose upper bound on CO₂. Useful as a policy-neutral reference to compare against stricter scenarios.',
    tags: ['co2', 'cap', 'relaxed'],
    params: [
      { key: 'cap', label: 'CO₂ cap (cost units)', type: 'number', default: 1000 },
    ],
    buildConfig: (p) => ({
      group_constraints: {
        global_co2_cap: { cost_max: { co2: Number(p.cap) } },
      },
    }),
  },
  {
    id: 'renewable_target_70',
    name: '70% Renewable Target',
    icon: '💚',
    description: 'Require ≥70% of electricity from renewables.',
    detail: 'Uses a group_constraints carrier_prod_min_systemwide constraint. List your renewable technology names in the techs field.',
    tags: ['renewable', 'target', '70%'],
    params: [
      {
        key: 'techs',
        label: 'Renewable tech names (comma-separated)',
        type: 'text',
        default: 'solar_pv,wind_onshore,wind_offshore,hydro_run_of_river',
      },
      { key: 'share', label: 'Minimum share (0–1)', type: 'number', default: 0.7 },
    ],
    buildConfig: (p) => ({
      group_constraints: {
        renewables_min: {
          techs: p.techs.split(',').map((t) => t.trim()),
          carrier_prod_min_systemwide: { electricity: Number(p.share) },
        },
      },
    }),
  },
  {
    id: 'renewable_target_100',
    name: '100% Renewable',
    icon: '🌱',
    description: 'Full renewable electricity system — no fossil generation.',
    detail: 'Sets a 100% minimum renewable share via group_constraints. Combine with battery_expansion or hydrogen_storage for reliability.',
    tags: ['renewable', '100%', 'net-zero'],
    params: [
      {
        key: 'techs',
        label: 'Renewable tech names (comma-separated)',
        type: 'text',
        default: 'solar_pv,wind_onshore,wind_offshore,hydro_run_of_river',
      },
    ],
    buildConfig: (p) => ({
      group_constraints: {
        renewables_100pct: {
          techs: p.techs.split(',').map((t) => t.trim()),
          carrier_prod_min_systemwide: { electricity: 1.0 },
        },
      },
    }),
  },
];

// ─── ECONOMIC OVERRIDES ───────────────────────────────────────────────────────
export const ECONOMIC_TEMPLATES = [
  {
    id: 'minimize_cost',
    name: 'Minimise Total Cost',
    icon: '💰',
    description: 'Standard least-cost system planning objective.',
    detail: 'The Calliope default. Minimises the sum of capital + operating costs across all technologies and locations.',
    tags: ['cost', 'objective', 'default'],
    params: [],
    buildConfig: () => ({
      run: {
        objective_options: {
          cost_class: { monetary: 1 },
          sense: 'minimize',
        },
      },
    }),
  },
  {
    id: 'solver_threads',
    name: 'Multi-Thread Solver',
    icon: '🧵',
    description: 'Use multiple CPU threads to speed up solving.',
    detail: 'Passes thread count to the solver. Gurobi and HiGHS both support this. Not all solvers do.',
    tags: ['performance', 'speed', 'threads'],
    params: [
      { key: 'threads', label: 'Number of threads', type: 'number', default: 4 },
    ],
    buildConfig: (p) => ({
      run: {
        solver_options: { threads: Number(p.threads) },
      },
    }),
  },
  {
    id: 'mip_gap',
    name: 'MIP Optimality Gap',
    icon: '🎯',
    description: 'Accept near-optimal solutions for faster MIP solves.',
    detail: 'A 1% gap (0.01) typically cuts solve time dramatically with negligible impact on results. Only relevant for MILP models with integer variables.',
    tags: ['mip', 'gap', 'speed', 'integer'],
    params: [
      { key: 'gap', label: 'Relative gap (e.g. 0.01 = 1%)', type: 'number', default: 0.01 },
    ],
    buildConfig: (p) => ({
      run: {
        solver_options: { MIPGap: Number(p.gap) },
      },
    }),
  },
  {
    id: 'spores_mode',
    name: 'SPORES Mode',
    icon: '🌐',
    description: 'Generate spatially-explicit practically-optimal solutions.',
    detail: 'Explores near-optimal solution space. Requires run.mode=spores and spores_options configured. Produces a set of diverse system designs within a cost slack.',
    tags: ['spores', 'near-optimal', 'diversity'],
    params: [
      { key: 'number', label: 'Number of SPORES',             type: 'number', default: 10 },
      { key: 'slack',  label: 'Cost slack fraction (e.g. 0.1)', type: 'number', default: 0.1 },
    ],
    buildConfig: (p) => ({
      run: {
        mode: 'spores',
        spores_options: {
          spores_number: Number(p.number),
          slack: Number(p.slack),
          objective: 'scored',
        },
      },
    }),
  },
  {
    id: 'reserve_margin',
    name: 'Capacity Reserve Margin',
    icon: '🔋',
    description: 'Require extra installed capacity as reliability buffer.',
    detail: 'Forces total installed capacity to exceed peak demand by a given margin. Common in planning studies for grid reliability (e.g. 10–20% reserve).',
    tags: ['reliability', 'reserve', 'security'],
    params: [
      { key: 'carrier', label: 'Carrier name', type: 'text', default: 'electricity' },
      { key: 'margin',  label: 'Reserve margin fraction (e.g. 0.1)', type: 'number', default: 0.1 },
    ],
    buildConfig: (p) => ({
      'model.reserve_margin': { [p.carrier]: Number(p.margin) },
    }),
  },
];

// ─── TECHNOLOGY OVERRIDES (parameterised) ────────────────────────────────────
export const TECHNOLOGY_TEMPLATES = [
  {
    id: 'tech_cap_max',
    name: 'Set Max Capacity',
    icon: '📏',
    description: 'Limit the maximum buildable capacity of one technology.',
    detail: 'Good for imposing external constraints like site limits, grid connection ceilings, or policy caps. Leave location empty to apply system-wide (energy_cap_max_systemwide).',
    tags: ['capacity', 'max', 'constraint'],
    params: [
      { key: 'tech',     label: 'Technology name',        type: 'text',   default: 'solar_pv' },
      { key: 'cap_max',  label: 'Max capacity (kW)',       type: 'number', default: 100000 },
      { key: 'systemwide', label: 'System-wide? (true/false)', type: 'select', default: 'true',
        options: ['true', 'false'] },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: {
          constraints: p.systemwide === 'true'
            ? { energy_cap_max_systemwide: Number(p.cap_max) }
            : { energy_cap_max: Number(p.cap_max) },
        },
      },
    }),
  },
  {
    id: 'disable_technology',
    name: 'Disable Technology',
    icon: '🚫',
    description: 'Zero out the max capacity — effectively removes the technology.',
    detail: 'Equivalent to a moratoria or phase-out policy. The technology remains in the model structure but cannot be built.',
    tags: ['phase-out', 'ban', 'zero'],
    params: [
      { key: 'tech', label: 'Technology name to disable', type: 'text', default: 'coal' },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: {
          constraints: { energy_cap_max: 0, energy_cap_max_systemwide: 0 },
        },
      },
    }),
  },
  {
    id: 'tech_efficiency',
    name: 'Change Efficiency',
    icon: '⚡',
    description: 'Override the energy conversion efficiency of a technology.',
    detail: 'Values between 0 and 1 (fraction, not %). Used to model technology improvement over time or test sensitivity.',
    tags: ['efficiency', 'sensitivity'],
    params: [
      { key: 'tech', label: 'Technology name', type: 'text', default: 'ccgt_gas' },
      { key: 'eff',  label: 'Energy efficiency (0–1)', type: 'number', default: 0.55 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { energy_eff: Number(p.eff) } },
      },
    }),
  },
  {
    id: 'tech_capex_override',
    name: 'Change Capital Cost',
    icon: '💵',
    description: 'Override the capital cost (CAPEX) for one technology.',
    detail: 'Set in cost_class units per kW installed. Useful for cost-reduction roadmap scenarios (e.g. future lower solar costs).',
    tags: ['cost', 'capex', 'investment'],
    params: [
      { key: 'tech',       label: 'Technology name',              type: 'text',   default: 'solar_pv' },
      { key: 'cost_class', label: 'Cost class name',              type: 'text',   default: 'monetary' },
      { key: 'capex',      label: 'Energy cap cost (€/kW)',       type: 'number', default: 500 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: {
          costs: { [p.cost_class]: { energy_cap: Number(p.capex) } },
        },
      },
    }),
  },
  {
    id: 'storage_cap_max',
    name: 'Set Storage Capacity',
    icon: '🔋',
    description: 'Limit maximum storage (kWh) for a storage technology.',
    detail: 'Prevents unconstrained battery build-out. Common in scenarios where storage is limited by resource (e.g. pumped hydro site limits).',
    tags: ['storage', 'capacity', 'constraint'],
    params: [
      { key: 'tech',    label: 'Storage tech name',           type: 'text',   default: 'battery' },
      { key: 'cap_kwh', label: 'Max storage capacity (kWh)',  type: 'number', default: 500000 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { storage_cap_max: Number(p.cap_kwh) } },
      },
    }),
  },
  {
    id: 'storage_initial',
    name: 'Set Initial Storage Level',
    icon: '📊',
    description: 'Define the starting state-of-charge for storage.',
    detail: 'Fraction of storage_cap_max (0 = empty, 1 = full). Affects first-timestep dispatch. Pair with cyclic_storage for consistent multi-period analysis.',
    tags: ['storage', 'initial', 'soc'],
    params: [
      { key: 'tech',    label: 'Storage tech name',      type: 'text',   default: 'battery' },
      { key: 'initial', label: 'Initial level (0–1)',    type: 'number', default: 0.5 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { storage_initial: Number(p.initial) } },
      },
    }),
  },
  {
    id: 'transmission_cap_max',
    name: 'Set Transmission Limit',
    icon: '🔌',
    description: 'Cap the maximum power flow on a transmission link.',
    detail: 'Applies energy_cap_max to the transmission technology, limiting the power exchange between two nodes.',
    tags: ['transmission', 'grid', 'capacity'],
    params: [
      { key: 'tech',    label: 'Transmission tech name',   type: 'text',   default: 'ac_transmission' },
      { key: 'cap_max', label: 'Max capacity (kW)',         type: 'number', default: 200000 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { energy_cap_max: Number(p.cap_max) } },
      },
    }),
  },
];

// ─── DEMAND OVERRIDES ─────────────────────────────────────────────────────────
export const DEMAND_TEMPLATES = [
  {
    id: 'demand_scale_up',
    name: 'Demand Growth (+%)',
    icon: '📈',
    description: 'Scale up all demand by a percentage — simulates load growth.',
    detail: 'Uses resource_scale to uniformly multiply the demand timeseries. For example 1.2 represents +20% growth. Applies to the named demand technology.',
    tags: ['demand', 'growth', 'future'],
    params: [
      { key: 'tech',  label: 'Demand tech name',          type: 'text',   default: 'demand_electricity' },
      { key: 'scale', label: 'Scale factor (e.g. 1.2)',   type: 'number', default: 1.2 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { resource_scale: Number(p.scale) } },
      },
    }),
  },
  {
    id: 'demand_scale_down',
    name: 'Demand Efficiency (−%)',
    icon: '📉',
    description: 'Reduce demand through efficiency — simulates conservation.',
    detail: 'A resource_scale < 1 reduces demand. 0.85 represents a 15% reduction. Common in energy efficiency policy scenarios.',
    tags: ['demand', 'efficiency', 'reduction'],
    params: [
      { key: 'tech',  label: 'Demand tech name',          type: 'text',   default: 'demand_electricity' },
      { key: 'scale', label: 'Scale factor (e.g. 0.85)',  type: 'number', default: 0.85 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { resource_scale: Number(p.scale) } },
      },
    }),
  },
  {
    id: 'electrification',
    name: 'Electrification Scenario',
    icon: '⚡',
    description: 'Large increase in electricity demand from sector coupling.',
    detail: 'Models electrification of heating, transport, and industry. Increases demand tech resource scale by 40–60% to simulate EV uptake, heat pumps, and industrial electrification.',
    tags: ['electrification', 'sector-coupling', 'ev'],
    params: [
      { key: 'tech',  label: 'Electricity demand tech',  type: 'text',   default: 'demand_electricity' },
      { key: 'scale', label: 'Scale factor (e.g. 1.5)',  type: 'number', default: 1.5 },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { resource_scale: Number(p.scale) } },
      },
    }),
  },
  {
    id: 'force_demand',
    name: 'Force All Demand',
    icon: '❗',
    description: 'Force the model to meet all demand in every timestep.',
    detail: 'Sets force_resource: true on the demand technology. The model cannot curtail demand. Combine with ensure_feasibility to avoid infeasibility.',
    tags: ['demand', 'forced', 'reliability'],
    params: [
      { key: 'tech', label: 'Demand tech name', type: 'text', default: 'demand_electricity' },
    ],
    buildConfig: (p) => ({
      techs: {
        [p.tech]: { constraints: { force_resource: true } },
      },
    }),
  },
];

// ─── SCENARIO TEMPLATES ───────────────────────────────────────────────────────
export const SCENARIO_TEMPLATES = [
  {
    id: 'quick_debug',
    name: 'Quick Debug',
    icon: '🐛',
    color: 'bg-gray-100 border-gray-300 text-gray-700',
    badge: 'Testing',
    badgeColor: 'bg-gray-200 text-gray-600',
    description: 'Fastest possible run to verify model structure.',
    detail: 'A 1-day window with 6-hour resolution and feasibility slack. Run this first whenever you change the model structure.',
    suggestedOverrides: ['debug_1day', 'res_6H', 'ensure_feasibility', 'solver_highs'],
  },
  {
    id: 'standard_planning',
    name: 'Standard Planning',
    icon: '📐',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    badge: 'Planning',
    badgeColor: 'bg-blue-100 text-blue-700',
    description: 'Full-year least-cost capacity expansion — the standard study.',
    detail: 'Full 8,760-hour year at 3-hour resolution with planning mode. The baseline for most academic and commercial studies.',
    suggestedOverrides: ['full_year', 'res_3H', 'plan_mode', 'solver_highs', 'cyclic_storage_on'],
  },
  {
    id: 'net_zero_2050',
    name: 'Net Zero 2050',
    icon: '🌍',
    color: 'bg-green-50 border-green-200 text-green-800',
    badge: 'Climate',
    badgeColor: 'bg-green-100 text-green-700',
    description: 'Hard net-zero constraint with full renewables push.',
    detail: 'Combines a zero CO₂ cap with a 100% renewable target. Reveals the minimum-cost path to a fully decarbonised system.',
    suggestedOverrides: ['full_year', 'res_3H', 'co2_cap_net_zero', 'renewable_target_100', 'ensure_feasibility'],
  },
  {
    id: 'decarbonisation_pathway',
    name: 'Decarbonisation Path (−80%)',
    icon: '📉',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    badge: 'Climate',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    description: 'Deep decarbonisation without full net-zero requirement.',
    detail: 'Applies an 80% CO₂ reduction cap and a 70% renewable share target — common in national energy strategy analyses.',
    suggestedOverrides: ['full_year', 'res_3H', 'co2_cap_strict', 'renewable_target_70'],
  },
  {
    id: 'coal_phaseout',
    name: 'Coal Phase-Out',
    icon: '🏭',
    color: 'bg-slate-50 border-slate-200 text-slate-800',
    badge: 'Policy',
    badgeColor: 'bg-slate-200 text-slate-600',
    description: 'Remove coal from the capacity mix entirely.',
    detail: 'Sets coal energy_cap_max = 0. Use alongside a CO₂ cap to also restrict gas-fired generation. Compare with the baseline to see cost and reliability impacts.',
    suggestedOverrides: ['full_year', 'res_3H', 'disable_technology', 'ensure_feasibility'],
    paramHints: { disable_technology: { tech: 'coal' } },
  },
  {
    id: 'demand_growth',
    name: 'Demand Growth +20%',
    icon: '📈',
    color: 'bg-orange-50 border-orange-200 text-orange-800',
    badge: 'Demand',
    badgeColor: 'bg-orange-100 text-orange-700',
    description: 'Test system adequacy with 20% higher electricity demand.',
    detail: 'Scales all demand up by 1.2×. Reveals grid bottlenecks and capacity shortfalls under future electrification pressure.',
    suggestedOverrides: ['full_year', 'res_3H', 'demand_scale_up', 'ensure_feasibility'],
    paramHints: { demand_scale_up: { scale: 1.2 } },
  },
  {
    id: 'electrification_scenario',
    name: 'Full Electrification',
    icon: '⚡',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    badge: 'Demand',
    badgeColor: 'bg-yellow-100 text-yellow-700',
    description: 'Sector coupling: +50% demand from EVs, heat pumps, industry.',
    detail: 'Models large-scale electrification of transport and heating. Tests whether renewables + storage can handle a much larger, more flexible load.',
    suggestedOverrides: ['full_year', 'res_3H', 'electrification', 'renewable_target_70', 'ensure_feasibility'],
  },
  {
    id: 'demand_efficiency',
    name: 'Energy Efficiency −15%',
    icon: '🏠',
    color: 'bg-teal-50 border-teal-200 text-teal-800',
    badge: 'Demand',
    badgeColor: 'bg-teal-100 text-teal-700',
    description: 'Efficiency measures cut demand by 15% — lower system cost.',
    detail: 'Scales demand to 0.85×. Combined with renewable expansion it is often the cheapest path to deep decarbonisation.',
    suggestedOverrides: ['full_year', 'res_3H', 'demand_scale_down', 'co2_cap_medium'],
  },
  {
    id: 'operational_dispatch',
    name: 'Operational Dispatch',
    icon: '▶️',
    color: 'bg-purple-50 border-purple-200 text-purple-800',
    badge: 'Operation',
    badgeColor: 'bg-purple-100 text-purple-700',
    description: 'Fixed-capacity dispatch simulation at hourly resolution.',
    detail: 'Run in operation mode after a planning solve. Evaluates real-time dispatch patterns, reserve margins, and storage cycling under fixed installed capacities.',
    suggestedOverrides: ['full_year', 'res_1H', 'operation_mode', 'ensure_feasibility', 'cyclic_storage_on'],
  },
  {
    id: 'cost_sensitivity_high',
    name: 'High Cost Sensitivity',
    icon: '💹',
    color: 'bg-red-50 border-red-200 text-red-800',
    badge: 'Sensitivity',
    badgeColor: 'bg-red-100 text-red-700',
    description: 'Test robustness: all capital costs +20% from baseline.',
    detail: 'Apply cost overrides for key technologies to test how sensitive total system cost and optimal mix are to CAPEX uncertainty.',
    suggestedOverrides: ['full_year', 'res_3H', 'tech_capex_override'],
    paramHints: { tech_capex_override: { capex: 600 } },
  },
  {
    id: 'spores_diversity',
    name: 'SPORES — Near-Optimal',
    icon: '🌐',
    color: 'bg-gray-50 border-gray-200 text-gray-800',
    badge: 'SPORES',
    badgeColor: 'bg-gray-100 text-gray-700',
    description: 'Generate 10 diverse near-optimal system configurations.',
    detail: 'SPORES reveals the breadth of cost-equivalent solutions. Useful for policy-makers who need flexibility in choosing system designs.',
    suggestedOverrides: ['full_year', 'res_6H', 'spores_mode', 'solver_highs'],
  },
];

// ─── PARAMETER SWEEP PRESETS ──────────────────────────────────────────────────
export const SWEEP_PRESETS = [
  {
    id: 'co2_cap_sweep',
    name: 'CO₂ Cap Sweep',
    description: 'Vary the CO₂ emission cap from unconstrained to net-zero.',
    configPath: 'group_constraints.global_co2_cap.cost_max.co2',
    defaultMin: 0,
    defaultMax: 1000,
    defaultSteps: 5,
    unit: 'cost units',
  },
  {
    id: 'demand_growth_sweep',
    name: 'Demand Scale Sweep',
    description: 'Vary demand load from efficiency to high-growth scenarios.',
    configPath: 'techs.demand_electricity.constraints.resource_scale',
    defaultMin: 0.8,
    defaultMax: 1.5,
    defaultSteps: 5,
    unit: 'fraction',
  },
  {
    id: 'renewable_share_sweep',
    name: 'Renewable Share Sweep',
    description: 'Sweep the minimum renewable share from 0% to 100%.',
    configPath: 'group_constraints.renewables_min.carrier_prod_min_systemwide.electricity',
    defaultMin: 0.2,
    defaultMax: 1.0,
    defaultSteps: 5,
    unit: 'fraction (0–1)',
  },
  {
    id: 'solar_capex_sweep',
    name: 'Solar CAPEX Sweep',
    description: 'Test sensitivity to future solar cost reductions.',
    configPath: 'techs.solar_pv.costs.monetary.energy_cap',
    defaultMin: 200,
    defaultMax: 800,
    defaultSteps: 5,
    unit: '€/kW',
  },
  {
    id: 'storage_cap_sweep',
    name: 'Battery Storage Limit Sweep',
    description: 'Vary the maximum allowed battery storage capacity.',
    configPath: 'techs.battery.constraints.storage_cap_max',
    defaultMin: 100000,
    defaultMax: 2000000,
    defaultSteps: 5,
    unit: 'kWh',
  },
  {
    id: 'transmission_cap_sweep',
    name: 'Transmission Capacity Sweep',
    description: 'Explore how interconnection capacity affects the system.',
    configPath: 'techs.ac_transmission.constraints.energy_cap_max',
    defaultMin: 50000,
    defaultMax: 500000,
    defaultSteps: 5,
    unit: 'kW',
  },
];

// ─── ALL TEMPLATES FLAT ───────────────────────────────────────────────────────
export const ALL_OVERRIDE_TEMPLATES = [
  ...TIME_TEMPLATES,
  ...SOLVER_TEMPLATES,
  ...CLIMATE_TEMPLATES,
  ...ECONOMIC_TEMPLATES,
  ...TECHNOLOGY_TEMPLATES,
  ...DEMAND_TEMPLATES,
];

export const CATEGORY_META = {
  time:       { label: 'Time',        icon: '⏱️',  description: 'Time horizon and resolution settings' },
  solver:     { label: 'Solver',      icon: '⚙️',  description: 'Solver choice, modes and feasibility' },
  climate:    { label: 'Climate',     icon: '🌍',  description: 'CO₂ caps and renewable share targets' },
  economic:   { label: 'Economic',    icon: '💰',  description: 'Objectives, costs and performance' },
  technology: { label: 'Technology',  icon: '🔧',  description: 'Per-technology parameter overrides' },
  demand:     { label: 'Demand',      icon: '📊',  description: 'Demand scaling and flexibility' },
};

export const CATEGORY_TEMPLATES = {
  time:       TIME_TEMPLATES,
  solver:     SOLVER_TEMPLATES,
  climate:    CLIMATE_TEMPLATES,
  economic:   ECONOMIC_TEMPLATES,
  technology: TECHNOLOGY_TEMPLATES,
  demand:     DEMAND_TEMPLATES,
};

/**
 * Build a nested object from a dot-path + value.
 * e.g. setNestedValue({}, 'run.solver', 'highs') → {run: {solver: 'highs'}}
 */
export const setNestedValue = (obj, path, value) => {
  const parts = path.split('.');
  const result = { ...obj };
  let cur = result;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = { ...cur[parts[i]] };
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return result;
};
