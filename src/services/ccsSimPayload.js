/**
 * ccsSimPayload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the canonical JSON payload for POST /api/ccs/simulate.
 *
 * Schema v2.0 — every field carries its unit in the key name for clarity
 * never has to guess.  The full structure is documented in the JSDoc below.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REQUEST SCHEMA  (what we POST to the simulation service)
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
 *     tech_type:           string,  // "coal"|"gas"|"cement"|"steel"|"refinery"|"biomass"
 *     name:                string,
 *     capacity_kw:         number,  // rated electrical/thermal capacity [kW]
 *     efficiency_pct:      number|null, // plant efficiency [%]
 *     co2_emission_kg_kwh: number,  // CO₂ emission factor [kg CO₂/kWh]
 *     profile: [                     // flue gas CO₂ concentration time-series
 *       { time_s: number, co2_pct: number }, ...
 *     ]
 *   },
 *
 *   absorber: {
 *     tech_type:               string,  // "mea"|"advanced_amine"|"carbonate"|"membrane"|"calcium_loop"
 *     name:                    string,
 *     capture_rate_pct:        number,  // CO₂ capture efficiency [%]
 *     energy_requirement_gj_tco2: number, // specific energy [GJ/tCO₂]
 *     solvent_flow_rate_m3h:   number,  // solvent circulation [m³/h]
 *     absorption_temp_c:       number,  // absorber operating temp [°C]
 *   },
 *
 *   stripper: {
 *     tech_type:               string,  // "conventional"|"vapor_recomp"|"multi_pressure"|"flash"
 *     name:                    string,
 *     thermal_efficiency_pct:  number,  // regeneration efficiency [%]
 *     reboiler_temp_c:         number,  // reboiler temperature [°C]
 *     steam_pressure_bar:      number,  // steam supply pressure [bar]
 *   },
 *
 *   compressor: {
 *     tech_type:                  string,  // "multistage"|"supercritical"|"isothermal"
 *     name:                       string,
 *     isentropic_efficiency_frac: number,  // 0–1
 *     inlet_pressure_bar:         number,  // stripper outlet → compressor inlet [bar]
 *     target_pressure_bar:        number,  // pipeline/storage target [bar]
 *   },
 *
 *   storage: {
 *     tech_type:                  string,  // "saline_aquifer"|"depleted_gas"|"depleted_oil"|"basalt"|"pipeline"
 *     name:                       string,
 *     injection_rate_mtco2_yr:    number,  // injection rate [MtCO₂/yr]
 *     storage_depth_m:            number,  // geological depth [m]
 *     reservoir_pressure_bar:     number,  // formation pressure [bar]
 *     storage_efficiency_pct:     number,  // storage efficiency [%]
 *   }
 * }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * EXPECTED RESPONSE SCHEMA  (what the simulation service returns)
 * ──────────────────────────────────────────────────────────────────────────
 * {
 *   time_s: number[],                  // simulation time axis
 *
 *   // Per-device time series
 *   source: {
 *     power_output_kw:      number[],  // source plant power output
 *     flue_gas_flow_kg_s:   number[],  // flue gas mass flow
 *     co2_concentration_pct: number[], // CO₂ concentration in flue gas
 *   },
 *   absorber: {
 *     co2_captured_kg_h:    number[],  // CO₂ capture rate [kg/h]
 *     solvent_temperature_c: number[], // absorber solvent temp
 *     capture_efficiency_pct: number[], // instantaneous capture efficiency
 *   },
 *   stripper: {
 *     thermal_input_kw:     number[],  // steam/heat input
 *     co2_released_kg_h:    number[],  // CO₂ desorption rate [kg/h]
 *     solvent_regeneration_pct: number[], // solvent regeneration efficiency
 *   },
 *   compressor: {
 *     power_consumed_kw:    number[],  // electrical power for compression
 *     outlet_pressure_bar:  number[],  // CO₂ outlet pressure
 *     outlet_temp_c:        number[],  // CO₂ outlet temperature
 *   },
 *   storage: {
 *     injection_rate_kg_h:  number[],  // CO₂ injection rate [kg/h]
 *     reservoir_pressure_bar: number[], // formation pressure
 *     cumulative_stored_tco2: number[], // cumulative CO₂ stored [tCO₂]
 *   },
 *
 *   // KPIs
 *   kpi: {
 *     total_co2_captured_tco2:      number,  // total CO₂ captured [tCO₂]
 *     total_co2_stored_tco2:        number,  // total CO₂ stored [tCO₂]
 *     avg_capture_rate_pct:         number,  // average capture efficiency [%]
 *     specific_energy_gj_tco2:      number,  // energy penalty [GJ/tCO₂]
 *     total_energy_consumed_gwh:    number,  // total energy consumed [GWh]
 *     avoided_emissions_tco2:       number,  // emissions avoided [tCO₂]
 *     capture_cost_usd_tco2:        number,  // estimated cost [USD/tCO₂]
 *   }
 * }
 */

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete simulation payload from UI state.
 *
 * @param {{
 *   sim: { t_end_s: number, dt_s: number },
 *   source: { tech_type, name, capacity_kw, efficiency_pct, co2_emission_kg_kwh, profile },
 *   absorber: { tech_type, name, capture_rate_pct, energy_requirement_gj_tco2, solvent_flow_rate_m3h, absorption_temp_c },
 *   stripper: { tech_type, name, thermal_efficiency_pct, reboiler_temp_c, steam_pressure_bar },
 *   compressor: { tech_type, name, isentropic_efficiency_frac, inlet_pressure_bar, target_pressure_bar },
 *   storage: { tech_type, name, injection_rate_mtco2_yr, storage_depth_m, reservoir_pressure_bar, storage_efficiency_pct },
 *   selectedModels: { source, absorber, stripper, compressor, storage }
 * }} params
 *
 * @returns {object} Schema v2.0 payload ready for POST /api/ccs/simulate
 */
export function buildSimPayload(params) {
  const { sim, source, absorber, stripper, compressor, storage, selectedModels } = params;

  // ── Flue gas profile generation ────────────────────────────────────────────
  // Generate a default CO₂ concentration profile if not provided
  const flueGasProfile = source.profile?.length > 0
    ? source.profile
    : generateDefaultFlueGasProfile(sim.t_end_s, sim.dt_s, source.tech_type);

  return {
    schema_version: "2.0",

    simulation: {
      t_end_s: sim.t_end_s ?? 3600,
      dt_s:    sim.dt_s ?? 60,
    },

    source: {
      tech_type:           source.tech_type ?? selectedModels?.source?.id ?? "gas_ccgt",
      name:                selectedModels?.source?.name ?? source.name ?? "Default Flue Gas Source",
      capacity_kw:         source.capacity_kw ?? selectedModels?.source?.capacity_kw ?? 400000,
      efficiency_pct:      source.efficiency_pct ?? selectedModels?.source?.efficiency_pct ?? 58,
      co2_emission_kg_kwh: source.co2_emission_kg_kwh ?? selectedModels?.source?.co2_emission_kg_kwh ?? 0.35,
      profile:             flueGasProfile,
    },

    absorber: {
      tech_type:               absorber.tech_type ?? selectedModels?.absorber?.id ?? "mea_absorb",
      name:                    selectedModels?.absorber?.name ?? absorber.name ?? "MEA Absorber",
      capture_rate_pct:        absorber.capture_rate_pct ?? selectedModels?.absorber?.efficiency_pct ?? 90,
      energy_requirement_gj_tco2: absorber.energy_requirement_gj_tco2 ?? selectedModels?.absorber?.energy_gj_tco2 ?? 3.7,
      solvent_flow_rate_m3h:   absorber.solvent_flow_rate_m3h ?? 500,
      absorption_temp_c:       absorber.absorption_temp_c ?? 40,
    },

    stripper: {
      tech_type:               stripper.tech_type ?? selectedModels?.stripper?.id ?? "conv_stripper",
      name:                    selectedModels?.stripper?.name ?? stripper.name ?? "Conventional Stripper",
      thermal_efficiency_pct:  stripper.thermal_efficiency_pct ?? selectedModels?.stripper?.efficiency_pct ?? 82,
      reboiler_temp_c:         stripper.reboiler_temp_c ?? 120,
      steam_pressure_bar:      stripper.steam_pressure_bar ?? 3.5,
    },

    compressor: {
      tech_type:                  compressor.tech_type ?? selectedModels?.compressor?.id ?? "multistage_110",
      name:                       selectedModels?.compressor?.name ?? compressor.name ?? "Multi-Stage Compressor",
      isentropic_efficiency_frac: compressor.isentropic_efficiency_frac ?? (selectedModels?.compressor?.efficiency_pct ? selectedModels.compressor.efficiency_pct / 100 : 0.82),
      inlet_pressure_bar:         compressor.inlet_pressure_bar ?? 1.5,
      target_pressure_bar:        compressor.target_pressure_bar ?? selectedModels?.compressor?.target_pressure_bar ?? 110,
    },

    storage: {
      tech_type:               storage.tech_type ?? selectedModels?.storage?.id ?? "saline_aquifer",
      name:                    selectedModels?.storage?.name ?? storage.name ?? "Saline Aquifer Storage",
      injection_rate_mtco2_yr: storage.injection_rate_mtco2_yr ?? selectedModels?.storage?.injection_rate_mtco2_yr ?? 5,
      storage_depth_m:         storage.storage_depth_m ?? 1500,
      reservoir_pressure_bar:  storage.reservoir_pressure_bar ?? 150,
      storage_efficiency_pct:  storage.storage_efficiency_pct ?? selectedModels?.storage?.efficiency_pct ?? 99,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a default flue gas CO₂ concentration profile based on source type.
 */
function generateDefaultFlueGasProfile(t_end_s, dt_s, techType) {
  const steps = Math.ceil(t_end_s / dt_s);
  const profile = [];

  // Base CO₂ concentration by source type (vol %)
  const baseConcentration = {
    coal: 14.0,      // coal power plants: ~12-16% CO₂
    gas: 4.0,        // natural gas CCGT: ~3-6% CO₂
    cement: 20.0,    // cement kilns: ~15-25% CO₂
    steel: 25.0,     // blast furnace: ~20-30% CO₂
    refinery: 8.0,   // refinery: ~5-10% CO₂
    biomass: 15.0,   // biomass: ~12-18% CO₂
  }[techType] ?? 10.0;

  for (let i = 0; i <= steps; i++) {
    const time_s = i * dt_s;
    // Add slight variation (±5%) to simulate realistic fluctuations
    const variation = 1 + (Math.random() - 0.5) * 0.1;
    const co2_pct = baseConcentration * variation;

    profile.push({ time_s, co2_pct: parseFloat(co2_pct.toFixed(2)) });
  }

  return profile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result normalizer (handles both nested v2 and flat v1 responses)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize the simulation result from the service to a consistent structure.
 * Handles both nested (v2) and flat (v1) response formats.
 */
export function normalizeSimResult(raw) {
  if (!raw) return null;

  // If already nested, return as-is
  if (raw.source || raw.absorber || raw.stripper) {
    return raw;
  }

  // Otherwise, assume flat v1 format and restructure
  return {
    time_s: raw.time_s ?? [],

    source: {
      power_output_kw:       raw.source_power_kw ?? [],
      flue_gas_flow_kg_s:    raw.flue_gas_flow_kg_s ?? [],
      co2_concentration_pct: raw.source_co2_pct ?? [],
    },

    absorber: {
      co2_captured_kg_h:     raw.co2_captured_kg_h ?? [],
      solvent_temperature_c: raw.absorber_temp_c ?? [],
      capture_efficiency_pct: raw.capture_efficiency_pct ?? [],
    },

    stripper: {
      thermal_input_kw:      raw.thermal_input_kw ?? [],
      co2_released_kg_h:     raw.co2_released_kg_h ?? [],
      solvent_regeneration_pct: raw.solvent_regen_pct ?? [],
    },

    compressor: {
      power_consumed_kw:     raw.compressor_power_kw ?? [],
      outlet_pressure_bar:   raw.compressor_outlet_bar ?? [],
      outlet_temp_c:         raw.compressor_outlet_c ?? [],
    },

    storage: {
      injection_rate_kg_h:   raw.injection_rate_kg_h ?? [],
      reservoir_pressure_bar: raw.reservoir_pressure_bar ?? [],
      cumulative_stored_tco2: raw.cumulative_stored_tco2 ?? [],
    },

    kpi: raw.kpi ?? {
      total_co2_captured_tco2: raw.total_co2_captured_tco2 ?? null,
      total_co2_stored_tco2:   raw.total_co2_stored_tco2 ?? null,
      avg_capture_rate_pct:    raw.avg_capture_rate_pct ?? null,
      specific_energy_gj_tco2: raw.specific_energy_gj_tco2 ?? null,
      total_energy_consumed_gwh: raw.total_energy_gwh ?? null,
      avoided_emissions_tco2:  raw.avoided_emissions_tco2 ?? null,
      capture_cost_usd_tco2:   raw.capture_cost_usd_tco2 ?? null,
    },
  };
}
