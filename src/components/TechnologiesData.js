// Technology images mapping - using local image files
import React from "react";
import { enrichTechsFromApi, isTechApiAvailable, fetchFullCatalogWithInstances } from '../services/techDatabaseApi';

import pv from "../assets/img/pv.jpg";
import wind from "../assets/img/wind.jpg";
import hydro from "../assets/img/hydro.jpg";
import coal from "../assets/img/coal.jpg";
import gas from "../assets/img/gas.jpg";
import oil from "../assets/img/oil.jpg";
import diesel from "../assets/img/diesel.jpg";
import nuclear from "../assets/img/nuclear.jpg";
import battery from "../assets/img/battery.jpg";
import biomass from "../assets/img/biomass.jpg";
import biogas from "../assets/img/biogas.jpg";
import geothermal from "../assets/img/geothermal.jpg";
import boiler from "../assets/img/boiler.jpg";
import power_demand from "../assets/img/power_demand.jpg";
import heat_demand from "../assets/img/heat_demand.jpg";


export const TECH_IMAGES = {
  // Generation â€“ Solar
  solar_pv_utility_scale: pv,
  solar_pv_distributed: pv,
  concentrated_solar_power_csp: pv,
  // Generation â€“ Wind
  onshore_wind: wind,
  offshore_wind_fixed_bottom: wind,
  offshore_wind_floating: wind,
  // Generation â€“ Hydro
  hydroelectric_run_of_river: hydro,
  hydroelectric_reservoir: hydro,
  pumped_hydro_storage: hydro,
  // Generation â€“ Conventional Gas
  combined_cycle_gas_turbine_ccgt: gas,
  open_cycle_gas_turbine_ocgt: gas,
  internal_combustion_engine: diesel,
  // Generation â€“ Coal / Nuclear
  coal_power_plant: coal,
  nuclear_power_conventional: nuclear,
  small_modular_reactors_smr: nuclear,
  // Generation â€“ Bio / Geo / Other
  geothermal_power: geothermal,
  biomass_power_plant: biomass,
  biogas_power_plant: biogas,
  waste_to_energy: biomass,
  marine_energy: hydro,
  // Storage â€“ Electrochemical
  lithium_ion_bess: battery,
  redox_flow_batteries: battery,
  sodium_sulfur_batteries: battery,
  lead_acid_batteries: battery,
  // Storage â€“ Mechanical / Thermal
  compressed_air_energy_storage_caes: battery,
  liquid_air_energy_storage_laes: battery,
  flywheels: battery,
  sensible_thermal_storage: boiler,
  latent_thermal_storage: boiler,
  // Storage â€“ Hydrogen
  hydrogen_storage_tanks: battery,
  hydrogen_underground_storage: battery,
  // Conversion â€“ Electrolyzers
  alkaline_water_electrolyzer_awe: battery,
  proton_exchange_membrane_electrolyzer_pem: battery,
  solid_oxide_electrolyzer_cell_soec: battery,
  // Conversion â€“ Fuel Cells
  pem_fuel_cell: gas,
  solid_oxide_fuel_cell_sofc: gas,
  // Conversion â€“ Heat
  air_source_heat_pump: boiler,
  ground_source_heat_pump: boiler,
  electric_boilers: boiler,
  combined_heat_and_power_chp: gas,
  biomass_chp: biomass,
  // Conversion â€“ Chemicals / Carbon
  methanation_reactors: gas,
  fischer_tropsch_synthesis: oil,
  haber_bosch_process: gas,
  direct_air_capture_dac: gas,
  carbon_capture_systems: gas,
  // Transmission
  hvac_overhead_lines: gas,
  hvdc_overhead_lines: gas,
  hvac_underground_cables: gas,
  hvdc_subsea_cables: gas,
  electrical_transformers: gas,
  natural_gas_pipelines: gas,
  hydrogen_pipelines: battery,
  co2_pipelines: gas,
  district_heating_networks: boiler,
  // Demand
  power_demand: power_demand,
  heat_demand: heat_demand,
  h2_demand: battery,
  gas_demand: gas,
  cooling_demand: boiler,
  // Default
  default: gas
};

export const PARENT_TYPES = {
  supply: 'Supply',
  supply_plus: 'Supply Plus',
  storage: 'Storage',
  conversion: 'Conversion',
  conversion_plus: 'Conversion Plus',
  transmission: 'Transmission',
  demand: 'Demand'
};

// ---------------------------------------------------------------------------
// OEO API Technology Catalog
// Each tech's `id` field is the exact API endpoint key used for live lookups.
// Costs and constraints below are FALLBACK values only â€“ the OEO API will
// overwrite them at runtime via enrichTechsFromApi().
// ---------------------------------------------------------------------------

export const TECH_TEMPLATES = {
  // â”€â”€ 1. Generation Technologies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  supply_plus: [
    {
      id: 'solar_pv_utility_scale',
      name: 'Solar PV Utility-scale',
      parent: 'supply_plus',
      description: 'Large-scale ground-mounted photovoltaic power plant',
      essentials: { name: 'Solar PV Utility-scale', color: '#FDB813', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 30, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 800, om_annual: 15 } }
    },
    {
      id: 'solar_pv_distributed',
      name: 'Solar PV Distributed',
      parent: 'supply_plus',
      description: 'Rooftop and small-scale distributed photovoltaic systems',
      essentials: { name: 'Solar PV Distributed', color: '#FFD54F', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 25, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 1100, om_annual: 20 } }
    },
    {
      id: 'concentrated_solar_power_csp',
      name: 'Concentrated Solar Power (CSP)',
      parent: 'supply_plus',
      description: 'Concentrated solar power with thermal storage',
      essentials: { name: 'Concentrated Solar Power (CSP)', color: '#FF8F00', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 30, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 6381, om_annual: 124 } }
    },
    {
      id: 'onshore_wind',
      name: 'Onshore Wind',
      parent: 'supply_plus',
      description: 'Land-based wind turbines',
      essentials: { name: 'Onshore Wind', color: '#47D154', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 25, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 1200, om_annual: 41 } }
    },
    {
      id: 'offshore_wind_fixed_bottom',
      name: 'Offshore Wind Fixed-bottom',
      parent: 'supply_plus',
      description: 'Fixed-bottom offshore wind turbines in shallow water',
      essentials: { name: 'Offshore Wind Fixed-bottom', color: '#00897B', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 25, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 2500, om_annual: 80 } }
    },
    {
      id: 'offshore_wind_floating',
      name: 'Offshore Wind Floating',
      parent: 'supply_plus',
      description: 'Floating offshore wind turbines for deep-water deployment',
      essentials: { name: 'Offshore Wind Floating', color: '#00695C', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 25, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 3500, om_annual: 110 } }
    },
    {
      id: 'hydroelectric_run_of_river',
      name: 'Hydroelectric Run-of-River',
      parent: 'supply_plus',
      description: 'Run-of-river hydroelectric plant without large reservoir',
      essentials: { name: 'Hydroelectric Run-of-River', color: '#64D7CE', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 60, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 4746, om_annual: 138 } }
    },
    {
      id: 'marine_energy',
      name: 'Marine Energy',
      parent: 'supply_plus',
      description: 'Tidal, wave, and other marine renewable energy technologies',
      essentials: { name: 'Marine Energy', color: '#0277BD', parent: 'supply_plus', carrier_out: 'electricity' },
      constraints: { resource_unit: 'energy_per_cap', lifetime: 20, energy_cap_max: 'inf' },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 5000, om_annual: 200 } }
    }
  ],

  supply: [
    {
      id: 'hydroelectric_reservoir',
      name: 'Hydroelectric Reservoir',
      parent: 'supply',
      description: 'Reservoir-type hydroelectric power plant',
      essentials: { name: 'Hydroelectric Reservoir', color: '#1976D2', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.85, lifetime: 80 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 5369, om_annual: 52 } }
    },
    {
      id: 'combined_cycle_gas_turbine_ccgt',
      name: 'Combined Cycle Gas Turbine (CCGT)',
      parent: 'supply',
      description: 'High-efficiency combined cycle natural gas power plant',
      essentials: { name: 'Combined Cycle Gas Turbine (CCGT)', color: '#5B7494', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.55, energy_ramping: 0.5, lifetime: 30 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 900, om_annual: 20, om_prod: 0.004 } }
    },
    {
      id: 'open_cycle_gas_turbine_ocgt',
      name: 'Open Cycle Gas Turbine (OCGT)',
      parent: 'supply',
      description: 'Fast-ramping open cycle peaker gas turbine',
      essentials: { name: 'Open Cycle Gas Turbine (OCGT)', color: '#78909C', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.38, energy_ramping: 0.9, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 450, om_annual: 12, om_prod: 0.006 } }
    },
    {
      id: 'internal_combustion_engine',
      name: 'Internal Combustion Engine',
      parent: 'supply',
      description: 'Reciprocating engine generator (diesel / gas)',
      essentials: { name: 'Internal Combustion Engine', color: '#607D8B', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.40, energy_ramping: 0.8, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 487, om_annual: 9, om_prod: 0.023 } }
    },
    {
      id: 'coal_power_plant',
      name: 'Coal Power Plant',
      parent: 'supply',
      description: 'Pulverised coal thermal power station',
      essentials: { name: 'Coal Power Plant', color: '#5A5A5A', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.40, energy_ramping: 0.4, lifetime: 35 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1600, om_annual: 40, om_prod: 0.008 } }
    },
    {
      id: 'nuclear_power_conventional',
      name: 'Nuclear Power Conventional',
      parent: 'supply',
      description: 'Large-scale conventional nuclear fission reactor',
      essentials: { name: 'Nuclear Power Conventional', color: '#E91E63', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.33, energy_ramping: 0.2, lifetime: 60 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 5000, om_annual: 100, om_prod: 0.005 } }
    },
    {
      id: 'small_modular_reactors_smr',
      name: 'Small Modular Reactors (SMR)',
      parent: 'supply',
      description: 'Advanced small modular nuclear reactors',
      essentials: { name: 'Small Modular Reactors (SMR)', color: '#AD1457', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 300000, resource: 'inf', energy_eff: 0.33, energy_ramping: 0.3, lifetime: 60 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 6000, om_annual: 120 } }
    },
    {
      id: 'geothermal_power',
      name: 'Geothermal Power',
      parent: 'supply',
      description: 'Geothermal electricity generation',
      essentials: { name: 'Geothermal Power', color: '#873737', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.15, lifetime: 30 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 5291, om_annual: 154, om_prod: 0.001 } }
    },
    {
      id: 'biomass_power_plant',
      name: 'Biomass Power Plant',
      parent: 'supply',
      description: 'Dedicated biomass combustion power plant',
      essentials: { name: 'Biomass Power Plant', color: '#D800FF', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.25, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 3885, om_annual: 75, om_prod: 0.005 } }
    },
    {
      id: 'biogas_power_plant',
      name: 'Biogas Power Plant',
      parent: 'supply',
      description: 'Biogas combustion or anaerobic digestion power plant',
      essentials: { name: 'Biogas Power Plant', color: '#5AA24D', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.30, lifetime: 20 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1384, om_annual: 27, om_prod: 0.018 } }
    },
    {
      id: 'waste_to_energy',
      name: 'Waste-to-Energy',
      parent: 'supply',
      description: 'Municipal solid waste incineration with energy recovery',
      essentials: { name: 'Waste-to-Energy', color: '#8D6E63', parent: 'supply', carrier_out: 'electricity' },
      constraints: { energy_cap_max: 'inf', resource: 'inf', energy_eff: 0.22, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 4000, om_annual: 100, om_prod: 0.01 } }
    }
  ],

  // â”€â”€ 2. Storage Technologies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  storage: [
    {
      id: 'lithium_ion_bess',
      name: 'Lithium-ion BESS',
      parent: 'storage',
      description: 'Lithium-ion battery energy storage system',
      essentials: { name: 'Lithium-ion BESS', color: '#177202', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.92, lifetime: 15, energy_cap_per_storage_cap_equals: 0.25 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 300, om_annual: 8 } }
    },
    {
      id: 'redox_flow_batteries',
      name: 'Redox Flow Batteries',
      parent: 'storage',
      description: 'Vanadium or other redox flow battery storage',
      essentials: { name: 'Redox Flow Batteries', color: '#2E7D32', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.80, lifetime: 20, energy_cap_per_storage_cap_equals: 0.125 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 400, om_annual: 10 } }
    },
    {
      id: 'sodium_sulfur_batteries',
      name: 'Sodium-Sulfur Batteries',
      parent: 'storage',
      description: 'High-temperature sodium-sulfur grid batteries',
      essentials: { name: 'Sodium-Sulfur Batteries', color: '#558B2F', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.85, lifetime: 15, energy_cap_per_storage_cap_equals: 0.167 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 500, om_annual: 12 } }
    },
    {
      id: 'lead_acid_batteries',
      name: 'Lead-Acid Batteries',
      parent: 'storage',
      description: 'Conventional lead-acid battery backup storage',
      essentials: { name: 'Lead-Acid Batteries', color: '#9E9E9E', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.75, lifetime: 10, energy_cap_per_storage_cap_equals: 0.20 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 200, om_annual: 6 } }
    },
    {
      id: 'pumped_hydro_storage',
      name: 'Pumped Hydro Storage',
      parent: 'storage',
      description: 'Large-scale pumped hydroelectric energy storage',
      essentials: { name: 'Pumped Hydro Storage', color: '#1565C0', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.80, lifetime: 80, energy_cap_per_storage_cap_equals: 0.10 },
      costs: { monetary: { interest_rate: 0.05, storage_cap: 60, om_annual: 3 } }
    },
    {
      id: 'compressed_air_energy_storage_caes',
      name: 'Compressed Air Energy Storage (CAES)',
      parent: 'storage',
      description: 'Grid-scale compressed air storage in underground caverns',
      essentials: { name: 'Compressed Air Energy Storage (CAES)', color: '#546E7A', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.70, lifetime: 40, energy_cap_per_storage_cap_equals: 0.083 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 50, om_annual: 2 } }
    },
    {
      id: 'liquid_air_energy_storage_laes',
      name: 'Liquid Air Energy Storage (LAES)',
      parent: 'storage',
      description: 'Cryogenic liquid air energy storage system',
      essentials: { name: 'Liquid Air Energy Storage (LAES)', color: '#455A64', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.60, lifetime: 30, energy_cap_per_storage_cap_equals: 0.10 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 80, om_annual: 3 } }
    },
    {
      id: 'flywheels',
      name: 'Flywheels',
      parent: 'storage',
      description: 'High-speed flywheel kinetic energy storage',
      essentials: { name: 'Flywheels', color: '#78909C', parent: 'storage', carrier: 'electricity' },
      constraints: { energy_eff: 0.90, lifetime: 20, energy_cap_per_storage_cap_equals: 1.0 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 2000, om_annual: 20 } }
    },
    {
      id: 'sensible_thermal_storage',
      name: 'Sensible Thermal Storage',
      parent: 'storage',
      description: 'Hot water tanks or molten salt sensible heat storage',
      essentials: { name: 'Sensible Thermal Storage', color: '#FF8F00', parent: 'storage', carrier: 'heat' },
      constraints: { energy_eff: 0.90, lifetime: 25, energy_cap_per_storage_cap_equals: 0.10 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 30, om_annual: 1 } }
    },
    {
      id: 'latent_thermal_storage',
      name: 'Latent Thermal Storage',
      parent: 'storage',
      description: 'Phase-change material latent heat storage',
      essentials: { name: 'Latent Thermal Storage', color: '#F57C00', parent: 'storage', carrier: 'heat' },
      constraints: { energy_eff: 0.85, lifetime: 20, energy_cap_per_storage_cap_equals: 0.125 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 50, om_annual: 1.5 } }
    },
    {
      id: 'hydrogen_storage_tanks',
      name: 'Hydrogen Storage Tanks',
      parent: 'storage',
      description: 'Above-ground pressurised hydrogen storage vessels',
      essentials: { name: 'Hydrogen Storage Tanks', color: '#FFD700', parent: 'storage', carrier: 'hydrogen' },
      constraints: { energy_eff: 0.98, lifetime: 30 },
      costs: { monetary: { interest_rate: 0.07, storage_cap: 500, om_annual: 10 } }
    },
    {
      id: 'hydrogen_underground_storage',
      name: 'Hydrogen Underground Storage',
      parent: 'storage',
      description: 'Salt cavern or aquifer underground hydrogen storage',
      essentials: { name: 'Hydrogen Underground Storage', color: '#F9A825', parent: 'storage', carrier: 'hydrogen' },
      constraints: { energy_eff: 0.95, lifetime: 50 },
      costs: { monetary: { interest_rate: 0.06, storage_cap: 4578, om_annual: 137 } }
    }
  ],

  // â”€â”€ 3. Conversion & Sector Coupling Technologies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  conversion_plus: [
    // Electrolyzers
    {
      id: 'alkaline_water_electrolyzer_awe',
      name: 'Alkaline Water Electrolyzer (AWE)',
      parent: 'conversion_plus',
      description: 'Alkaline water electrolysis for hydrogen production',
      essentials: { name: 'Alkaline Water Electrolyzer (AWE)', color: '#FDD835', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'hydrogen' },
      constraints: { energy_eff: 0.70, lifetime: 20 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 800, om_annual: 25 } }
    },
    {
      id: 'proton_exchange_membrane_electrolyzer_pem',
      name: 'Proton Exchange Membrane Electrolyzer (PEM)',
      parent: 'conversion_plus',
      description: 'PEM water electrolysis for high-purity hydrogen',
      essentials: { name: 'Proton Exchange Membrane Electrolyzer (PEM)', color: '#F9A825', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'hydrogen' },
      constraints: { energy_eff: 0.72, lifetime: 15 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1060, om_annual: 37 } }
    },
    {
      id: 'solid_oxide_electrolyzer_cell_soec',
      name: 'Solid Oxide Electrolyzer Cell (SOEC)',
      parent: 'conversion_plus',
      description: 'High-temperature solid oxide electrolysis',
      essentials: { name: 'Solid Oxide Electrolyzer Cell (SOEC)', color: '#FFB300', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'hydrogen' },
      constraints: { energy_eff: 0.82, lifetime: 15 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1500, om_annual: 50 } }
    },
    // Fuel Cells
    {
      id: 'pem_fuel_cell',
      name: 'PEM Fuel Cell',
      parent: 'conversion_plus',
      description: 'Proton exchange membrane fuel cell for power generation',
      essentials: { name: 'PEM Fuel Cell', color: '#FF8C00', parent: 'conversion_plus', carrier_in: 'hydrogen', carrier_out: 'electricity' },
      constraints: { energy_eff: 0.55, lifetime: 15 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1600, om_annual: 80 } }
    },
    {
      id: 'solid_oxide_fuel_cell_sofc',
      name: 'Solid Oxide Fuel Cell (SOFC)',
      parent: 'conversion_plus',
      description: 'High-temperature solid oxide fuel cell',
      essentials: { name: 'Solid Oxide Fuel Cell (SOFC)', color: '#E65100', parent: 'conversion_plus', carrier_in: 'hydrogen', carrier_out: 'electricity' },
      constraints: { energy_eff: 0.60, lifetime: 20 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 2000, om_annual: 60 } }
    },
    // Heat & Power
    {
      id: 'air_source_heat_pump',
      name: 'Air-Source Heat Pump',
      parent: 'conversion_plus',
      description: 'Air-source heat pump for space and water heating',
      essentials: { name: 'Air-Source Heat Pump', color: '#EF5350', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'heat' },
      constraints: { energy_eff: 3.0, lifetime: 20 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 800, om_annual: 20 } }
    },
    {
      id: 'ground_source_heat_pump',
      name: 'Ground-Source Heat Pump',
      parent: 'conversion_plus',
      description: 'Ground-coupled heat pump with higher COP',
      essentials: { name: 'Ground-Source Heat Pump', color: '#C62828', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'heat' },
      constraints: { energy_eff: 4.0, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 1400, om_annual: 25 } }
    },
    {
      id: 'electric_boilers',
      name: 'Electric Boilers',
      parent: 'conversion_plus',
      description: 'Electric resistance or electrode boilers for heat',
      essentials: { name: 'Electric Boilers', color: '#B71C1C', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'heat' },
      constraints: { energy_eff: 0.99, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 100, om_annual: 3 } }
    },
    {
      id: 'combined_heat_and_power_chp',
      name: 'Combined Heat and Power (CHP)',
      parent: 'conversion_plus',
      description: 'Gas CHP cogeneration unit (electricity + heat)',
      essentials: { name: 'Combined Heat and Power (CHP)', color: '#5B7494', parent: 'conversion_plus', carrier_in: 'gas', carrier_out: 'electricity' },
      constraints: { energy_eff: 0.85, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1000, om_annual: 30 } }
    },
    {
      id: 'biomass_chp',
      name: 'Biomass CHP',
      parent: 'conversion_plus',
      description: 'Biomass-fired combined heat and power plant',
      essentials: { name: 'Biomass CHP', color: '#388E3C', parent: 'conversion_plus', carrier_in: 'biomass', carrier_out: 'electricity' },
      constraints: { energy_eff: 0.80, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 2500, om_annual: 60 } }
    },
    // Chemical Conversion
    {
      id: 'methanation_reactors',
      name: 'Methanation Reactors',
      parent: 'conversion_plus',
      description: 'Power-to-gas methanation (Hâ‚‚ + COâ‚‚ â†’ CHâ‚„)',
      essentials: { name: 'Methanation Reactors', color: '#1B5E20', parent: 'conversion_plus', carrier_in: 'hydrogen', carrier_out: 'gas' },
      constraints: { energy_eff: 0.78, lifetime: 20 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 600, om_annual: 20 } }
    },
    {
      id: 'fischer_tropsch_synthesis',
      name: 'Fischer-Tropsch Synthesis',
      parent: 'conversion_plus',
      description: 'Fischer-Tropsch synthesis for synthetic liquid fuels',
      essentials: { name: 'Fischer-Tropsch Synthesis', color: '#004D40', parent: 'conversion_plus', carrier_in: 'hydrogen', carrier_out: 'liquid_fuel' },
      constraints: { energy_eff: 0.65, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 1200, om_annual: 40 } }
    },
    {
      id: 'haber_bosch_process',
      name: 'Haber-Bosch Process',
      parent: 'conversion_plus',
      description: 'Electrified Haber-Bosch ammonia synthesis',
      essentials: { name: 'Haber-Bosch Process', color: '#006064', parent: 'conversion_plus', carrier_in: 'hydrogen', carrier_out: 'ammonia' },
      constraints: { energy_eff: 0.60, lifetime: 30 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 900, om_annual: 30 } }
    },
    {
      id: 'direct_air_capture_dac',
      name: 'Direct Air Capture (DAC)',
      parent: 'conversion_plus',
      description: 'Direct air COâ‚‚ capture and compression',
      essentials: { name: 'Direct Air Capture (DAC)', color: '#37474F', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'co2' },
      constraints: { energy_eff: 0.30, lifetime: 25 },
      costs: { monetary: { interest_rate: 0.08, energy_cap: 3000, om_annual: 100 } }
    },
    {
      id: 'carbon_capture_systems',
      name: 'Carbon Capture Systems',
      parent: 'conversion_plus',
      description: 'Post-combustion carbon capture systems for power plants',
      essentials: { name: 'Carbon Capture Systems', color: '#263238', parent: 'conversion_plus', carrier_in: 'electricity', carrier_out: 'co2' },
      constraints: { energy_eff: 0.85, lifetime: 30 },
      costs: { monetary: { interest_rate: 0.07, energy_cap: 800, om_annual: 25 } }
    }
  ],

  // â”€â”€ 4. Transmission & Distribution Technologies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  transmission: [
    {
      id: 'hvac_overhead_lines',
      name: 'HVAC Overhead Lines',
      parent: 'transmission',
      description: 'High-voltage AC overhead transmission lines',
      essentials: { name: 'HVAC Overhead Lines', color: '#966F9E', parent: 'transmission', carrier: 'electricity' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.98, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.05, energy_cap_per_distance: 0.91 } }
    },
    {
      id: 'hvdc_overhead_lines',
      name: 'HVDC Overhead Lines',
      parent: 'transmission',
      description: 'High-voltage DC overhead long-distance transmission',
      essentials: { name: 'HVDC Overhead Lines', color: '#7B1FA2', parent: 'transmission', carrier: 'electricity' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.97, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.05, energy_cap_per_distance: 1.10 } }
    },
    {
      id: 'hvac_underground_cables',
      name: 'HVAC Underground Cables',
      parent: 'transmission',
      description: 'High-voltage AC underground cable grid',
      essentials: { name: 'HVAC Underground Cables', color: '#AB47BC', parent: 'transmission', carrier: 'electricity' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.97, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.05, energy_cap_per_distance: 3.00 } }
    },
    {
      id: 'hvdc_subsea_cables',
      name: 'HVDC Subsea Cables',
      parent: 'transmission',
      description: 'Submarine HVDC cable interconnectors',
      essentials: { name: 'HVDC Subsea Cables', color: '#6A1B9A', parent: 'transmission', carrier: 'electricity' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.96, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.05, energy_cap_per_distance: 4.50 } }
    },
    {
      id: 'electrical_transformers',
      name: 'Electrical Transformers',
      parent: 'transmission',
      description: 'Power transformers for voltage step-up/down',
      essentials: { name: 'Electrical Transformers', color: '#4A148C', parent: 'transmission', carrier: 'electricity' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.995, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.05, energy_cap: 50 } }
    },
    {
      id: 'natural_gas_pipelines',
      name: 'Natural Gas Pipelines',
      parent: 'transmission',
      description: 'High-pressure natural gas transmission pipelines',
      essentials: { name: 'Natural Gas Pipelines', color: '#5B7494', parent: 'transmission', carrier: 'gas' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.99, lifetime: 50 },
      costs: { monetary: { interest_rate: 0.05, energy_cap_per_distance: 0.50 } }
    },
    {
      id: 'hydrogen_pipelines',
      name: 'Hydrogen Pipelines',
      parent: 'transmission',
      description: 'Dedicated hydrogen transport pipelines',
      essentials: { name: 'Hydrogen Pipelines', color: '#FFD700', parent: 'transmission', carrier: 'hydrogen' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.98, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.06, energy_cap_per_distance: 1.20 } }
    },
    {
      id: 'co2_pipelines',
      name: 'CO2 Pipelines',
      parent: 'transmission',
      description: 'CO₂ transport pipelines for carbon capture & storage',
      essentials: { name: 'CO2 Pipelines', color: '#616161', parent: 'transmission', carrier: 'co2' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.99, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.06, energy_cap_per_distance: 0.80 } }
    },
    {
      id: 'district_heating_networks',
      name: 'District Heating Networks',
      parent: 'transmission',
      description: 'Insulated pipe networks for district heat distribution',
      essentials: { name: 'District Heating Networks', color: '#BF360C', parent: 'transmission', carrier: 'heat' },
      constraints: { energy_cap_max: 'inf', energy_eff: 0.90, lifetime: 40 },
      costs: { monetary: { interest_rate: 0.05, energy_cap_per_distance: 0.60 } }
    }
  ],
  // Note: additional multi-carrier transmission techs (cooling pipelines, H₂ trucks,
  // biomass transport, oil pipelines, water pipelines, etc.) are provided by the
  // opentech-db API when online. Add them there instead of here.

  // â”€â”€ 5. Demand Technologies (framework-internal, not in OEO catalog) â”€â”€â”€â”€â”€â”€â”€
  demand: [
    {
      id: 'power_demand',
      name: 'power_demand',
      parent: 'demand',
      description: 'Electricity power demand',
      essentials: { name: 'Power demand', color: '#072486', parent: 'demand', carrier: 'electricity' },
      constraints: { energy_con: true, force_resource: true, resource_unit: 'energy' },
      costs: {}
    },
    {
      id: 'heat_demand',
      name: 'heat_demand',
      parent: 'demand',
      description: 'Heat energy demand',
      essentials: { name: 'Heat demand', color: '#DC2626', parent: 'demand', carrier: 'heat' },
      constraints: { energy_con: true, force_resource: true, resource_unit: 'energy' },
      costs: {}
    },
    {
      id: 'h2_demand',
      name: 'h2_demand',
      parent: 'demand',
      description: 'Hydrogen demand',
      essentials: { name: 'Hydrogen demand', color: '#7C3AED', parent: 'demand', carrier: 'hydrogen' },
      constraints: { energy_con: true, force_resource: true, resource_unit: 'energy' },
      costs: {}
    },
    {
      id: 'gas_demand',
      name: 'gas_demand',
      parent: 'demand',
      description: 'Natural gas demand',
      essentials: { name: 'Gas demand', color: '#EA580C', parent: 'demand', carrier: 'gas' },
      constraints: { energy_con: true, force_resource: true, resource_unit: 'energy' },
      costs: {}
    },
    {
      id: 'cooling_demand',
      name: 'cooling_demand',
      parent: 'demand',
      description: 'Cooling energy demand',
      essentials: { name: 'Cooling demand', color: '#06B6D4', parent: 'demand', carrier: 'cooling' },
      constraints: { energy_con: true, force_resource: true, resource_unit: 'energy' },
      costs: {}
    }
  ]
};

// Backwards-compat: ensure every tech entry has an `id` equal to its `name`
// field if no explicit id was set (guards against old code that keyed by name).
Object.values(TECH_TEMPLATES).forEach((arr) => {
  if (!Array.isArray(arr)) return;
  arr.forEach((tech) => {
    if (!tech.id) tech.id = (tech.name || '').replace(/\s+/g, '_').toLowerCase();
  });
});
// ---------------------------------------------------------------------------
// Live OEO API integration
// ---------------------------------------------------------------------------

/**
 * Fetch a TECH_TEMPLATES-shaped object enriched with live data from the
 * OEO Technology Database API (http://127.0.0.1:8005).
 *
 * Returns the static TECH_TEMPLATES unchanged when the API is offline so
 * existing behaviour is fully preserved.
 *
 * @returns {Promise<typeof TECH_TEMPLATES>}
 */
export async function fetchLiveTechTemplates() {
  try {
    const online = await isTechApiAvailable(3000);
    if (!online) {
      console.info('[OEO] API offline - using static TECH_TEMPLATES.');
      return TECH_TEMPLATES;
    }

    // Fetch full catalog with instances from v1 API
    console.info('[OEO] Fetching full catalog with instances from API...');
    const apiTechs = await fetchFullCatalogWithInstances();

    if (!apiTechs || apiTechs.length === 0) {
      console.warn('[OEO] fetchFullCatalogWithInstances returned empty - using static.');
      return TECH_TEMPLATES;
    }

    // Group by parent type (generation split into supply/supply_plus by apiCategoryToParent)
    const grouped = {};
    apiTechs.forEach(tech => {
      const parent = tech.parent;
      if (!grouped[parent]) grouped[parent] = [];
      grouped[parent].push(tech);
    });

    // Demand is not in the API - always keep from static templates
    grouped.demand = TECH_TEMPLATES.demand || [];

    // Fill missing categories from static templates as fallback
    ['supply_plus', 'supply', 'storage', 'conversion_plus', 'transmission'].forEach(cat => {
      if (!grouped[cat] || grouped[cat].length === 0) {
        grouped[cat] = TECH_TEMPLATES[cat] || [];
        console.info(`[OEO] Category '${cat}' not in API - using static templates.`);
      }
    });

    console.info(`[OEO] Live catalog built: ${apiTechs.length} technologies with instances.`);
    return grouped;
  } catch (err) {
    console.warn('[OEO] fetchLiveTechTemplates failed, falling back to static data:', err);
    return TECH_TEMPLATES;
  }
}

/**
 * React hook that returns the tech templates, upgrading them from the OEO API
 * in the background once available.
 *
 * @returns {{ techTemplates: typeof TECH_TEMPLATES, isLive: boolean, isLoading: boolean }}
 */
export function useLiveTechTemplates() {
  const [techTemplates, setTechTemplates] = React.useState(TECH_TEMPLATES);
  const [isLive, setIsLive] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    fetchLiveTechTemplates().then((live) => {
      if (cancelled) return;
      setTechTemplates(live);
      setIsLive(live !== TECH_TEMPLATES);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  return { techTemplates, isLive, isLoading };
}
