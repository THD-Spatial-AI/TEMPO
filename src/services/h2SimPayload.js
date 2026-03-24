/**
 * h2SimPayload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the canonical JSON payload for POST /api/hydrogen/simulate.
 *
 * Schema v2.0 — every field carries its unit in the key name so MATLAB
 * never has to guess.  The full structure is documented in the JSDoc below.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REQUEST SCHEMA  (what we POST to the MATLAB bridge)
 * ──────────────────────────────────────────────────────────────────────────
 * {
 *   schema_version: "2.0",
 *
 *   simulation: {
 *     t_end_s:  number,   // simulation horizon [seconds]
 *     dt_s:     number,   // integration time-step [seconds]
 *   },
 *
 *   source: {
 *     tech_type:      string,  // "solar"|"wind"|"nuclear"|"hydro"|"gas"|"coal"|"biomass"|"geothermal"|"generic"
 *     name:           string,
 *     capacity_kw:    number,  // rated electrical capacity [kW]
 *     efficiency_pct: number|null, // generator efficiency [%], null for renewables
 *     profile: [               // power time-series fed to the ELZ AC bus
 *       { time_s: number, power_kw: number }, ...
 *     ]
 *   },
 *
 *   electrolyzer: {
 *     tech_type:                  string,  // "pem"|"alkaline"|"soec"|"aem"
 *     name:                       string,
 *     capacity_kw:                number,  // rated AC input capacity [kW]
 *     nominal_efficiency_pct_hhv: number,  // efficiency at rated point, HHV basis [%]
 *     min_load_pct:               number,  // minimum partial load [%]
 *     max_load_pct:               number,  // 100 in most cases [%]
 *     operating_temperature_c:    number,  // stack temperature [°C]
 *     water_flow_rate_lpm:        number,  // DI water feed [L/min]
 *     h2_hhv_kwh_per_kg:          39.4,    // reference constant [kWh/kg] — tells MATLAB which basis
 *   },
 *
 *   compressor: {
 *     tech_type:                  string,  // "reciprocating"|"ionic"|"linear"
 *     name:                       string,
 *     isentropic_efficiency_frac: number,  // 0–1
 *     inlet_pressure_bar:         number,  // ELZ outlet → compressor inlet [bar]
 *     target_pressure_bar:        number,  // storage fill target [bar]
 *   },
 *
 *   storage: {
 *     tech_type:                  string,  // "compressed_h2"|"liquid_h2"|"metal_hydride"|"cavern"
 *     name:                       string,
 *     max_pressure_bar:           number,  // max allowable pressure [bar]
 *     min_pressure_bar:           number,  // min usable pressure [bar]
 *     initial_soc_pct:            number,  // initial state-of-charge [%]
 *     round_trip_efficiency_pct:  number,  // storage round-trip eff [%]
 *   },
 *
 *   fuel_cell: {
 *     tech_type:              string,  // "pem"|"sofc"|"mcfc"|"pafc"|"alkaline"
 *     name:                   string,
 *     rated_power_kw:         number,  // rated AC power output [kW]
 *     nominal_efficiency_pct: number,  // DC electrical efficiency, LHV basis [%]
 *     min_load_pct:           number,  // minimum load [%]
 *     h2_flow_rate_nm3h:      number,  // H₂ feed at rated power [Nm³/h]
 *     operating_pressure_bar: number,  // cathode/anode operating pressure [bar]
 *     cooling_capacity_kw:    number,  // thermal management [kW]
 *   }
 * }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * EXPECTED RESPONSE SCHEMA  (what MATLAB should return)
 * ──────────────────────────────────────────────────────────────────────────
 * {
 *   time_s: number[],                  // simulation time axis
 *
 *   // Per-device time series
 *   electrolyzer: {
 *     power_in_kw:          number[],  // AC power consumed
 *     h2_production_nm3h:   number[],  // volumetric H₂ rate [Nm³/h]
 *     h2_production_kg_h:   number[],  // mass H₂ rate [kg/h]
 *     efficiency_pct:       number[],  // actual instantaneous efficiency [%]
 *     stack_temperature_c:  number[],  // optional
 *   },
 *   compressor: {
 *     power_consumed_kw:    number[],
 *     outlet_pressure_bar:  number[],
 *   },
 *   storage: {
 *     pressure_bar:         number[],
 *     soc_pct:              number[],
 *     h2_mass_kg:           number[],
 *   },
 *   fuel_cell: {
 *     power_output_kw:      number[],
 *     h2_consumed_nm3h:     number[],
 *     terminal_voltage_v:   number[],
 *     current_density_acm2: number[],
 *     efficiency_pct:       number[],
 *   },
 *
 *   // Aggregate KPIs
 *   kpi: {
 *     total_h2_produced_kg:          number,
 *     total_h2_consumed_kg:          number,
 *     total_energy_consumed_kwh:     number,
 *     overall_system_efficiency_pct: number,
 *     specific_energy_kwh_kg:        number,  // kWh per kg H₂ produced
 *     peak_h2_production_kg_h:       number,
 *     avg_electrolyzer_load_pct:     number,
 *     capacity_factor_pct:           number,
 *   },
 *
 *   // Backward-compat flat aliases (MATLAB may return either form)
 *   electrolyzer_power_kw:    number[],  // = electrolyzer.power_in_kw
 *   h2_production_nm3h:       number[],  // = electrolyzer.h2_production_nm3h
 *   tank_pressure_bar:        number[],  // = storage.pressure_bar
 *   fc_terminal_voltage_v:    number[],  // = fuel_cell.terminal_voltage_v
 *   fc_current_density_acm2:  number[],  // = fuel_cell.current_density_acm2
 *   fc_power_output_kw:       number[],  // = fuel_cell.power_output_kw
 * }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const safeN = (x) => { const n = Number(x); return isFinite(n) ? n : null; };

/** Detect generator tech type from model id/name */
function detectSrcTechType(model) {
  if (!model) return 'generic';
  const key = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (/solar|pv|photovoltaic/.test(key))   return 'solar';
  if (/wind/.test(key))                     return 'wind';
  if (/nuclear|pwr|bwr|smr/.test(key))     return 'nuclear';
  if (/hydro|water|river|dam/.test(key))   return 'hydro';
  if (/geotherm/.test(key))                return 'geothermal';
  if (/biomass|biogas|bio/.test(key))      return 'biomass';
  if (/coal|lignite/.test(key))            return 'coal';
  if (/gas|ccgt|ocgt|lng/.test(key))       return 'gas';
  return 'generic';
}

/** Detect ELZ tech type */
function detectElzTechType(model) {
  if (!model) return 'pem';
  const key = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (/alkaline|alk/.test(key))             return 'alkaline';
  if (/soec|solid.oxide|high.temp/.test(key)) return 'soec';
  if (/aem|anion/.test(key))               return 'aem';
  return 'pem';
}

/** Detect fuel cell type */
function detectFcTechType(model) {
  if (!model) return 'pem';
  const key = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (/sofc/.test(key))    return 'sofc';
  if (/mcfc/.test(key))    return 'mcfc';
  if (/pafc/.test(key))    return 'pafc';
  if (/alkaline/.test(key)) return 'alkaline';
  return 'pem';
}

/** Detect compressor type */
function detectCompressorType(model) {
  if (!model) return 'reciprocating';
  const key = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (/ionic/.test(key))  return 'ionic';
  if (/linear/.test(key)) return 'linear';
  return 'reciprocating';
}

/** Detect storage type */
function detectStorageTechType(model) {
  if (!model) return 'compressed_h2';
  const key = `${model.id ?? ''} ${model.name ?? ''}`.toLowerCase();
  if (/liquid|lh2/.test(key))      return 'liquid_h2';
  if (/hydride|mh/.test(key))      return 'metal_hydride';
  if (/cavern|underground/.test(key)) return 'cavern';
  return 'compressed_h2';
}

/**
 * Build a [{time_s, power_kw}] power profile from the tech-type shape.
 * Used when no custom CSV is uploaded — provides MATLAB a realistic
 * time-varying power signal instead of a flat constant.
 */
function buildTheoreticalProfile(techType, capacityKw, t_end_s, dt_s) {
  const cap = safeN(capacityKw);
  if (!cap || cap <= 0) return null;
  const pts = [];
  for (let t = 0; t <= t_end_s; t += dt_s) {
    const h = (t / 3600) % 24;
    let frac;
    switch (techType) {
      case 'solar': {
        const raw = Math.exp(-0.5 * ((h - 12.5) / 2.4) ** 2);
        frac = (h < 5.5 || h > 19.5) ? 0 : raw;
        break;
      }
      case 'wind':
        frac = Math.min(1, Math.max(0,
          0.38 + 0.18 * Math.sin(h * 0.65 + 1.2)
               + 0.12 * Math.sin(h * 1.7  + 0.5)
               + 0.07 * Math.sin(h * 3.1  + 2.0)));
        break;
      case 'nuclear':
      case 'geothermal':
        frac = 0.90 + 0.015 * Math.sin((h / 24) * 2 * Math.PI);
        break;
      case 'coal':
      case 'biomass':
        frac = (h >= 7 && h < 22 ? 0.82 : 0.55) + 0.03 * Math.sin(h * 0.9);
        break;
      case 'gas':
        frac = Math.min(1, Math.max(0.15,
          0.45 + 0.25 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + 0.08 * Math.sin(h * 2.1)));
        break;
      case 'hydro': {
        const morn = 0.55 * Math.exp(-0.5 * ((h - 8)  / 2.2) ** 2);
        const eve  = 0.65 * Math.exp(-0.5 * ((h - 19) / 2.5) ** 2);
        frac = Math.min(1, Math.max(0.15, morn + eve + 0.18));
        break;
      }
      default: frac = 0.75;
    }
    pts.push({ time_s: t, power_kw: Math.round(frac * cap) });
  }
  return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — payload builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full simulation payload for /api/hydrogen/simulate.
 *
 * @param {{
 *   selectedModels:   { source, electrolyzer, compressor, storage, fuel_cell }
 *   genParamOverrides: object   – overrides from generator panel
 *   elzParamOverrides: object   – overrides from electrolyzer panel
 *   elz:              { grid_power_kw, water_flow_rate_lpm, temperature_c }
 *   sto:              { compressor_efficiency, max_tank_pressure_bar }
 *   fc:               { h2_flow_rate_nm3h, oxidant_pressure_bar, cooling_capacity_kw }
 *   sim:              { t_end_s, dt_s }
 *   customProfile:    { data: Array } | null
 * }} opts
 * @returns {object} payload  ready for JSON.stringify
 */
export function buildSimPayload({
  selectedModels = {},
  genParamOverrides = {},
  elzParamOverrides = {},
  elz = {},
  sto = {},
  fc  = {},
  sim = {},
  customProfile = null,
}) {
  // ── 1. SOURCE ─────────────────────────────────────────────────────────────
  const srcModel  = selectedModels?.source;
  const srcTech   = detectSrcTechType(srcModel);
  const srcCap    = safeN(genParamOverrides?.capacity_kw)    ?? safeN(srcModel?.capacity_kw)    ?? null;
  const srcEff    = safeN(genParamOverrides?.efficiency_pct) ?? safeN(srcModel?.efficiency_pct) ?? null;

  // Normalise profile points to { time_s, power_kw } regardless of CSV format
  const rawProfile = customProfile?.data ?? buildTheoreticalProfile(srcTech, srcCap, sim.t_end_s, sim.dt_s);
  const profile = rawProfile?.map((pt) => ({
    time_s:   safeN(pt.time_s) ?? Math.round((pt.time_h ?? 0) * 3600),
    power_kw: safeN(pt.power_kw) ?? safeN(pt.value_kw) ?? 0,
  })) ?? null;

  // ── 2. ELECTROLYZER ───────────────────────────────────────────────────────
  const elzModel  = selectedModels?.electrolyzer;
  const elzTech   = detectElzTechType(elzModel);
  const elzCap    = safeN(elzParamOverrides?.capacity_kw)    ?? safeN(elzModel?.capacity_kw)    ?? srcCap ?? safeN(elz.grid_power_kw) ?? null;
  const elzEff    = safeN(elzParamOverrides?.efficiency_pct) ?? safeN(elzModel?.efficiency_pct) ?? 70;
  const elzMinLd  = safeN(elzParamOverrides?.min_load_pct)
                 ?? (elzTech === 'alkaline' ? 20 : elzTech === 'soec' ? 30 : 5);

  // ── 3. COMPRESSOR ─────────────────────────────────────────────────────────
  const compModel = selectedModels?.compressor;
  const compType  = detectCompressorType(compModel);
  const compEff   = safeN(sto.compressor_efficiency) ?? safeN(compModel?.efficiency_pct != null ? compModel.efficiency_pct / 100 : null) ?? 0.78;
  const targetBar = safeN(sto.max_tank_pressure_bar)  ?? 350;

  // ── 4. STORAGE ────────────────────────────────────────────────────────────
  const stoModel  = selectedModels?.storage;
  const stoType   = detectStorageTechType(stoModel);

  // ── 5. FUEL CELL ──────────────────────────────────────────────────────────
  const fcModel   = selectedModels?.fuel_cell;
  const fcType    = detectFcTechType(fcModel);
  const fcCap     = safeN(fcModel?.capacity_kw) ?? null;
  const fcEff     = safeN(fcModel?.efficiency_pct) ?? 58;

  // ── Assemble ──────────────────────────────────────────────────────────────
  return {
    schema_version: '2.0',

    simulation: {
      t_end_s: safeN(sim.t_end_s) ?? 3600,
      dt_s:    safeN(sim.dt_s)    ?? 60,
    },

    source: {
      tech_type:      srcTech,
      name:           srcModel?.name ?? null,
      capacity_kw:    srcCap,
      efficiency_pct: srcEff,       // null for renewables — MATLAB ignores
      profile,                       // [{time_s, power_kw}] — full input waveform
    },

    electrolyzer: {
      tech_type:                  elzTech,
      name:                       elzModel?.name ?? null,
      capacity_kw:                elzCap,
      nominal_efficiency_pct_hhv: elzEff,   // H₂ HHV basis
      min_load_pct:               elzMinLd,
      max_load_pct:               100,
      operating_temperature_c:    safeN(elz.temperature_c)        ?? 80,
      water_flow_rate_lpm:        safeN(elz.water_flow_rate_lpm)  ?? 90,
      h2_hhv_kwh_per_kg:          39.4,     // constant reference
    },

    compressor: {
      tech_type:                  compType,
      name:                       compModel?.name ?? null,
      isentropic_efficiency_frac: compEff,
      inlet_pressure_bar:         30,        // typical ELZ outlet to compressor
      target_pressure_bar:        targetBar,
    },

    storage: {
      tech_type:                  stoType,
      name:                       stoModel?.name ?? null,
      max_pressure_bar:           targetBar,
      min_pressure_bar:           20,
      initial_soc_pct:            20,
      round_trip_efficiency_pct:  safeN(stoModel?.efficiency_pct) ?? 99,
    },

    fuel_cell: {
      tech_type:               fcType,
      name:                    fcModel?.name ?? null,
      rated_power_kw:          fcCap,
      nominal_efficiency_pct:  fcEff,
      min_load_pct:            10,
      h2_flow_rate_nm3h:       safeN(fc.h2_flow_rate_nm3h)    ?? 40,
      operating_pressure_bar:  safeN(fc.oxidant_pressure_bar) ?? 2.5,
      cooling_capacity_kw:     safeN(fc.cooling_capacity_kw)  ?? 35,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Result normaliser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise the MATLAB API response into a flat object understood by all
 * existing chart components.  MATLAB may return either the nested v2 schema
 * OR the legacy flat schema — this function handles both.
 *
 * Flat aliases produced:
 *   electrolyzer_power_kw       ← electrolyzer.power_in_kw  (v2)
 *   h2_production_nm3h          ← electrolyzer.h2_production_nm3h  (v2)
 *   h2_production_kg_h          ← electrolyzer.h2_production_kg_h  (v2)
 *   elz_efficiency_pct          ← electrolyzer.efficiency_pct  (v2)
 *   compressor_power_kw         ← compressor.power_consumed_kw  (v2)
 *   tank_pressure_bar           ← storage.pressure_bar  (v2)
 *   tank_soc_pct                ← storage.soc_pct  (v2)
 *   fc_power_output_kw          ← fuel_cell.power_output_kw  (v2)
 *   fc_terminal_voltage_v       ← fuel_cell.terminal_voltage_v  (v2)
 *   fc_current_density_acm2     ← fuel_cell.current_density_acm2  (v2)
 *
 * @param {object} raw  – raw API result
 * @returns {object}    – normalised result with flat + nested keys
 */
export function normalizeSimResult(raw) {
  if (!raw) return raw;

  const pick = (nested, flat) => nested ?? raw[flat] ?? null;

  return {
    // ── preserve everything as-is ──
    ...raw,

    // ── time axis ──
    time_s: raw.time_s ?? [],

    // ── flat aliases for backward compat with existing chart components ──
    electrolyzer_power_kw:   pick(raw.electrolyzer?.power_in_kw,          'electrolyzer_power_kw'),
    h2_production_nm3h:      pick(raw.electrolyzer?.h2_production_nm3h,   'h2_production_nm3h'),
    h2_production_kg_h:      pick(raw.electrolyzer?.h2_production_kg_h,   'h2_production_kg_h'),
    elz_efficiency_pct:      pick(raw.electrolyzer?.efficiency_pct,       'elz_efficiency_pct'),

    compressor_power_kw:     pick(raw.compressor?.power_consumed_kw,      'compressor_power_kw'),

    tank_pressure_bar:       pick(raw.storage?.pressure_bar,             'tank_pressure_bar'),
    tank_soc_pct:            pick(raw.storage?.soc_pct,                  'tank_soc_pct'),
    h2_mass_kg:              pick(raw.storage?.h2_mass_kg,               'h2_mass_kg'),

    fc_power_output_kw:      pick(raw.fuel_cell?.power_output_kw,        'fc_power_output_kw'),
    h2_consumption_nm3h:     pick(raw.fuel_cell?.h2_consumed_nm3h,       'h2_consumption_nm3h'),
    fc_terminal_voltage_v:   pick(raw.fuel_cell?.terminal_voltage_v,     'fc_terminal_voltage_v'),
    fc_current_density_acm2: pick(raw.fuel_cell?.current_density_acm2,   'fc_current_density_acm2'),
    fc_efficiency_pct:       pick(raw.fuel_cell?.efficiency_pct,         'fc_efficiency_pct'),
  };
}
