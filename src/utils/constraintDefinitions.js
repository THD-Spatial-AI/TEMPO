import { tr } from '../i18n';
// Constraint definitions with categories
export const CONSTRAINT_DEFINITIONS = {
  // Capacity Constraints
  energy_cap_max: { group: 'Capacity', desc: tr("Maximum energy capacity (kW). Upper limit on installed capacity.") },
  energy_cap_min: { group: 'Capacity', desc: tr("Minimum energy capacity (kW). Lower limit on installed capacity.") },
  energy_cap_equals: { group: 'Capacity', desc: tr("Fixed energy capacity (kW). Capacity must equal this value.") },
  energy_cap_equals_systemwide: { group: 'Capacity', desc: tr("System-wide fixed energy capacity across all locations.") },
  energy_cap_max_systemwide: { group: 'Capacity', desc: tr("System-wide maximum energy capacity across all locations.") },
  energy_cap_min_use: { group: 'Capacity', desc: tr("Minimum capacity utilization (fraction 0-1).") },
  energy_cap_per_unit: { group: 'Capacity', desc: tr("Energy capacity per discrete unit (kW/unit).") },
  energy_cap_scale: { group: 'Capacity', desc: tr("Scaling factor for energy capacity.") },
  energy_cap_per_storage_cap_min: { group: 'Capacity', desc: tr("Minimum ratio of energy capacity to storage capacity.") },
  energy_cap_per_storage_cap_max: { group: 'Capacity', desc: tr("Maximum ratio of energy capacity to storage capacity.") },
  energy_cap_per_storage_cap_equals: { group: 'Capacity', desc: tr("Fixed ratio of energy capacity to storage capacity.") },
  storage_cap_max: { group: 'Capacity', desc: tr("Maximum storage capacity (kWh). Upper limit on energy storage.") },
  storage_cap_min: { group: 'Capacity', desc: tr("Minimum storage capacity (kWh).") },
  storage_cap_equals: { group: 'Capacity', desc: tr("Fixed storage capacity (kWh).") },
  storage_cap_per_unit: { group: 'Capacity', desc: tr("Storage capacity per discrete unit (kWh/unit).") },
  
  // Efficiency Constraints
  energy_eff: { group: 'Efficiency', desc: tr("Energy conversion efficiency (0-1). Ratio of output to input energy.") },
  energy_eff_per_distance: { group: 'Efficiency', desc: tr("Efficiency loss per unit distance for transmission.") },
  resource_eff: { group: 'Efficiency', desc: tr("Resource conversion efficiency (0-1). Efficiency of resource usage.") },
  parasitic_eff: { group: 'Efficiency', desc: tr("Parasitic efficiency loss (0-1). Internal energy consumption.") },
  
  // Resource Constraints
  resource: { group: 'Resource', desc: tr("Resource availability (kWh or file:// path). Energy source input.") },
  resource_min_use: { group: 'Resource', desc: tr("Minimum resource utilization fraction (0-1).") },
  resource_scale: { group: 'Resource', desc: tr("Resource scaling factor.") },
  resource_unit: { group: 'Resource', desc: tr("Unit of resource measure (energy, power, energy_per_cap, etc.).") },
  resource_area_max: { group: 'Resource', desc: tr("Maximum resource collection area (m²).") },
  resource_area_min: { group: 'Resource', desc: tr("Minimum resource collection area (m²).") },
  resource_area_equals: { group: 'Resource', desc: tr("Fixed resource collection area (m²).") },
  resource_area_per_energy_cap: { group: 'Resource', desc: tr("Resource area required per unit energy capacity (m²/kW).") },
  resource_cap_max: { group: 'Resource', desc: tr("Maximum resource capacity for supply_plus technologies.") },
  resource_cap_min: { group: 'Resource', desc: tr("Minimum resource capacity for supply_plus technologies.") },
  resource_cap_equals: { group: 'Resource', desc: tr("Fixed resource capacity for supply_plus technologies.") },
  resource_cap_equals_energy_cap: { group: 'Resource', desc: tr("Resource capacity equals energy capacity (boolean).") },
  force_resource: { group: 'Resource', desc: tr("Force resource consumption to meet demand exactly (boolean).") },
  
  // Operational Constraints
  energy_ramping: { group: 'Operation', desc: tr("Ramping rate limit (fraction/hour). Max change in output per timestep.") },
  charge_rate: { group: 'Operation', desc: tr("Charge/discharge rate (C-rate). Storage power relative to capacity.") },
  storage_loss: { group: 'Operation', desc: tr("Storage standing loss (fraction/hour). Energy lost per time period.") },
  storage_initial: { group: 'Operation', desc: tr("Initial storage state of charge (fraction, 0-1).") },
  storage_time_max: { group: 'Operation', desc: tr("Maximum storage duration (hours). Max time to discharge at full power.") },
  storage_discharge_depth: { group: 'Operation', desc: tr("Minimum state of charge (fraction 0-1). Prevents full discharge.") },
  lifetime: { group: 'Operation', desc: tr("Technology lifetime (years). Economic lifespan.") },
  one_way: { group: 'Operation', desc: tr("Transmission is unidirectional (boolean). Only flows one way.") },
  force_asynchronous_prod_con: { group: 'Operation', desc: tr("Force production and consumption to not occur simultaneously.") },
  
  // Production/Consumption
  energy_prod: { group: 'Energy Flow', desc: tr("Energy production (kWh). Output energy per timestep.") },
  energy_con: { group: 'Energy Flow', desc: tr("Energy consumption (kWh). Input energy per timestep.") },
  carrier_ratios: { group: 'Energy Flow', desc: tr("Carrier input/output ratios for conversion_plus technologies (dict).") },
  export_carrier: { group: 'Energy Flow', desc: tr("Carrier that can be exported from system.") },
  export_cap: { group: 'Energy Flow', desc: tr("Maximum export capacity (kW).") },
  
  // Units
  units_max: { group: 'Units', desc: tr("Maximum number of integer units that can be purchased.") },
  units_min: { group: 'Units', desc: tr("Minimum number of integer units that must be purchased.") },
  units_equals: { group: 'Units', desc: tr("Exact number of units to purchase.") },
  units_equals_systemwide: { group: 'Units', desc: tr("System-wide exact number of units across all locations.") },
  units_max_systemwide: { group: 'Units', desc: tr("System-wide maximum number of units across all locations.") }
};

// Cost definitions
export const COST_DEFINITIONS = {
  energy_cap: { group: 'Investment', desc: tr("Capital cost per unit energy capacity ($/kW). One-time installation cost.") },
  storage_cap: { group: 'Investment', desc: tr("Capital cost per unit storage capacity ($/kWh).") },
  resource_cap: { group: 'Investment', desc: tr("Capital cost per unit resource capacity ($/unit).") },
  resource_area: { group: 'Investment', desc: tr("Capital cost per unit resource collection area ($/m²).") },
  purchase: { group: 'Investment', desc: tr("Purchase cost per unit of technology ($).") },
  energy_cap_per_distance: { group: 'Investment', desc: tr("Capital cost per unit capacity per unit distance ($/kW/km) for transmission.") },
  purchase_per_distance: { group: 'Investment', desc: tr("Purchase cost per unit distance ($/km) for transmission.") },
  
  om_annual: { group: 'O&M', desc: tr("Annual operations & maintenance cost ($/year). Fixed yearly cost.") },
  om_annual_investment_fraction: { group: 'O&M', desc: tr("Annual O&M as fraction of investment cost (fraction).") },
  om_prod: { group: 'O&M', desc: tr("Variable O&M cost per unit energy produced ($/kWh).") },
  om_con: { group: 'O&M', desc: tr("Variable O&M cost per unit energy consumed ($/kWh).") },
  
  interest_rate: { group: 'Financial', desc: tr("Interest rate for investment (fraction, e.g., 0.10 = 10%).") },
  depreciation_rate: { group: 'Financial', desc: tr("Depreciation rate (fraction/year). Asset value reduction rate.") },
  
  export: { group: 'Other', desc: tr("Revenue from exporting energy ($/kWh). Negative cost = revenue.") }
};

// Essential field definitions
export const ESSENTIAL_DEFINITIONS = {
  name: { desc: tr("Display name of the technology") },
  color: { desc: tr("Color code for visualization (hex format)") },
  parent: { desc: tr("Technology type: supply, demand, storage, conversion, transmission") },
  carrier: { desc: tr("Energy carrier (electricity, heat, gas, hydrogen, etc.)") },
  carrier_in: { desc: tr("Input energy carrier for conversion technologies") },
  carrier_out: { desc: tr("Output energy carrier for conversion technologies") }
};

// Constraints configuration for parent types
export const PARENT_CONSTRAINTS = {
  supply: [
    'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide',
    'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_eff',
    'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'force_resource', 'lifetime',
    'resource', 'resource_area_equals', 'resource_area_max', 'resource_area_min',
    'resource_area_per_energy_cap', 'resource_min_use', 'resource_scale', 'resource_unit',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  supply_plus: [
    'charge_rate', 'energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max',
    'energy_cap_per_storage_cap_equals', 'energy_cap_equals', 'energy_cap_equals_systemwide',
    'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use',
    'energy_cap_per_unit', 'energy_cap_scale', 'energy_eff', 'energy_prod', 'energy_ramping',
    'export_cap', 'export_carrier', 'force_resource', 'lifetime', 'parasitic_eff', 'resource',
    'resource_area_equals', 'resource_area_max', 'resource_area_min', 'resource_area_per_energy_cap',
    'resource_cap_equals', 'resource_cap_equals_energy_cap', 'resource_cap_max', 'resource_cap_min',
    'resource_eff', 'resource_min_use', 'resource_scale', 'resource_unit', 'storage_cap_equals',
    'storage_cap_max', 'storage_cap_min', 'storage_cap_per_unit', 'storage_initial', 'storage_loss',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  demand: [
    'energy_con', 'force_resource', 'resource', 'resource_area_equals', 'resource_scale', 'resource_unit'
  ],
  storage: [
    'charge_rate', 'energy_cap_per_storage_cap_min', 'energy_cap_per_storage_cap_max',
    'energy_cap_per_storage_cap_equals', 'energy_cap_equals', 'energy_cap_equals_systemwide',
    'energy_cap_max', 'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use',
    'energy_cap_per_unit', 'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod',
    'energy_ramping', 'export_cap', 'export_carrier', 'force_asynchronous_prod_con', 'lifetime',
    'storage_cap_equals', 'storage_cap_max', 'storage_cap_min', 'storage_cap_per_unit',
    'storage_initial', 'storage_loss', 'storage_time_max', 'storage_discharge_depth',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  transmission: [
    'energy_cap_equals', 'energy_cap_min', 'energy_cap_max', 'energy_cap_per_unit',
    'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_eff_per_distance', 'energy_prod',
    'force_asynchronous_prod_con', 'lifetime', 'one_way'
  ],
  conversion: [
    'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max', 'energy_cap_max_systemwide',
    'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit', 'energy_cap_scale', 'energy_con',
    'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap', 'export_carrier', 'lifetime',
    'units_equals', 'units_equals_systemwide', 'units_max', 'units_max_systemwide', 'units_min'
  ],
  conversion_plus: [
    'carrier_ratios', 'energy_cap_equals', 'energy_cap_equals_systemwide', 'energy_cap_max',
    'energy_cap_max_systemwide', 'energy_cap_min', 'energy_cap_min_use', 'energy_cap_per_unit',
    'energy_cap_scale', 'energy_con', 'energy_eff', 'energy_prod', 'energy_ramping', 'export_cap',
    'export_carrier', 'lifetime', 'units_equals', 'units_equals_systemwide', 'units_max',
    'units_max_systemwide', 'units_min'
  ]
};
