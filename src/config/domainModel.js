/**
 * Domain Model Configuration for Calliope Energy System
 * 
 * This file defines the core concepts and their relationships in the energy modeling system.
 * These definitions are immutable and form the foundation of the data model.
 */

export const ENTITY_TYPES = {
  // Core Infrastructure
  SUBSTATION: {
    id: 'substation',
    name: 'Substation',
    description: 'Connection point where transmission lines meet. Can act as a node without generation/consumption.',
    isNode: true,
    allowsTechnologies: false,
    allowsTransmission: true,
    icon: '🔌',
    requiredFields: ['name', 'latitude', 'longitude', 'voltage_level'],
    optionalFields: ['capacity_limit', 'operator', 'commissioning_year'],
    color: '#6366f1' // indigo
  },
  
  // Generation Assets
  POWER_PLANT: {
    id: 'power_plant',
    name: 'Power Plant',
    description: 'Electricity generation facility (fossil, nuclear, renewable)',
    isNode: false,
    allowsTechnologies: true,
    allowsTransmission: true,
    icon: '⚡',
    requiredFields: ['name', 'latitude', 'longitude', 'plant_type', 'capacity_mw'],
    optionalFields: ['fuel_type', 'efficiency', 'commissioning_year', 'operator', 'emission_factor'],
    allowedTechTypes: ['supply', 'supply_plus', 'conversion'],
    color: '#f59e0b' // amber
  },
  
  RENEWABLE_SITE: {
    id: 'renewable_site',
    name: 'Renewable Generation Site',
    description: 'Solar, wind, hydro, or other renewable energy installation',
    isNode: false,
    allowsTechnologies: true,
    allowsTransmission: true,
    icon: '🌞',
    requiredFields: ['name', 'latitude', 'longitude', 'renewable_type', 'capacity_mw'],
    optionalFields: ['capacity_factor', 'area_sqm', 'commissioning_year', 'tilt_angle', 'azimuth'],
    allowedTechTypes: ['supply', 'supply_plus'],
    color: '#10b981' // green
  },
  
  // Demand Centers
  DEMAND_CENTER: {
    id: 'demand_center',
    name: 'Demand Center',
    description: 'City, industrial zone, or consumption point',
    isNode: false,
    allowsTechnologies: true,
    allowsTransmission: true,
    icon: '🏭',
    requiredFields: ['name', 'latitude', 'longitude', 'demand_type', 'peak_demand_mw'],
    optionalFields: ['population', 'annual_consumption_gwh', 'load_profile_type', 'industrial_share'],
    allowedTechTypes: ['demand'],
    color: '#ef4444' // red
  },
  
  // Storage
  STORAGE_FACILITY: {
    id: 'storage_facility',
    name: 'Storage Facility',
    description: 'Battery, pumped hydro, or other energy storage system',
    isNode: false,
    allowsTechnologies: true,
    allowsTransmission: true,
    icon: '🔋',
    requiredFields: ['name', 'latitude', 'longitude', 'storage_type', 'power_capacity_mw', 'energy_capacity_mwh'],
    optionalFields: ['efficiency_charge', 'efficiency_discharge', 'self_discharge_rate', 'cycles_per_year'],
    allowedTechTypes: ['storage', 'supply_plus'],
    color: '#8b5cf6' // purple
  },
  
  // Network Nodes
  NETWORK_NODE: {
    id: 'network_node',
    name: 'Network Node',
    description: 'Generic connection point in the transmission network',
    isNode: true,
    allowsTechnologies: false,
    allowsTransmission: true,
    icon: '🔘',
    requiredFields: ['name', 'latitude', 'longitude'],
    optionalFields: ['node_type', 'voltage_level'],
    color: '#64748b' // slate
  }
};

export const TRANSMISSION_TYPES = {
  AC_LINE: {
    id: 'ac_transmission',
    name: 'AC Transmission Line',
    description: 'Alternating Current transmission line',
    icon: '⚡',
    requiredFields: ['from', 'to', 'capacity_mw', 'voltage_kv'],
    optionalFields: ['length_km', 'resistance', 'reactance', 'efficiency_per_km', 'num_circuits', 'commissioning_year'],
    defaultTech: 'ac_transmission',
    color: '#3b82f6' // blue
  },
  
  DC_LINE: {
    id: 'dc_transmission',
    name: 'DC Transmission Line',
    description: 'Direct Current transmission line (HVDC)',
    icon: '⚡',
    requiredFields: ['from', 'to', 'capacity_mw', 'voltage_kv'],
    optionalFields: ['length_km', 'efficiency', 'converter_loss', 'commissioning_year'],
    defaultTech: 'dc_transmission',
    color: '#06b6d4' // cyan
  },
  
  GAS_PIPELINE: {
    id: 'gas_pipeline',
    name: 'Gas Pipeline',
    description: 'Natural gas or hydrogen pipeline',
    icon: '🔥',
    requiredFields: ['from', 'to', 'capacity_mw_thermal', 'gas_type'],
    optionalFields: ['diameter_mm', 'length_km', 'pressure_bar', 'compressor_power'],
    defaultTech: 'gas_transmission',
    color: '#f97316' // orange
  },
  
  HEAT_NETWORK: {
    id: 'heat_network',
    name: 'District Heating Network',
    description: 'Hot water or steam distribution network',
    icon: '♨️',
    requiredFields: ['from', 'to', 'capacity_mw_thermal'],
    optionalFields: ['length_km', 'temperature_c', 'heat_loss_per_km', 'pipe_diameter_mm'],
    defaultTech: 'heat_transmission',
    color: '#dc2626' // red
  }
};

export const DATA_CATEGORIES = {
  SPATIAL: {
    name: 'Spatial Data',
    description: 'Geographic locations and coordinates',
    icon: '🗺️',
    fileTypes: ['csv', 'geojson', 'json'],
    requiredColumns: ['name', 'latitude', 'longitude', 'type'],
    optionalColumns: ['voltage_level', 'capacity', 'operator']
  },
  
  TECHNICAL: {
    name: 'Technical Parameters',
    description: 'Technology specifications and constraints',
    icon: '⚙️',
    fileTypes: ['csv', 'json'],
    requiredColumns: ['location', 'technology', 'parameter', 'value'],
    optionalColumns: ['unit', 'source', 'notes']
  },
  
  TIMESERIES: {
    name: 'Time Series Data',
    description: 'Temporal data (demand profiles, weather, prices)',
    icon: '📈',
    fileTypes: ['csv'],
    requiredColumns: ['timestamp'],
    optionalColumns: ['demand_mw', 'solar_cf', 'wind_cf', 'price_eur_mwh', 'temperature_c']
  },
  
  ECONOMIC: {
    name: 'Economic Data',
    description: 'Costs, prices, and financial parameters',
    icon: '💰',
    fileTypes: ['csv', 'json'],
    requiredColumns: ['technology', 'cost_type', 'value', 'currency'],
    optionalColumns: ['unit', 'year', 'source', 'confidence']
  },
  
  NETWORK: {
    name: 'Network Topology',
    description: 'Transmission lines and connections',
    icon: '🔗',
    fileTypes: ['csv', 'json'],
    requiredColumns: ['from', 'to', 'type', 'capacity'],
    optionalColumns: ['length_km', 'voltage_kv', 'efficiency', 'cost']
  }
};

// Validation rules for each entity type
export const VALIDATION_RULES = {
  substation: {
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    voltage_level: { type: 'enum', values: [110, 220, 380, 400, 500, 765] },
    capacity_limit: { type: 'number', min: 0, unit: 'MW' }
  },
  
  power_plant: {
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    capacity_mw: { type: 'number', min: 0, max: 10000 },
    efficiency: { type: 'number', min: 0, max: 1 },
    plant_type: { type: 'enum', values: ['coal', 'gas', 'nuclear', 'oil', 'biomass', 'ccgt', 'ocgt'] },
    commissioning_year: { type: 'number', min: 1900, max: 2100 }
  },
  
  renewable_site: {
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    capacity_mw: { type: 'number', min: 0, max: 5000 },
    renewable_type: { type: 'enum', values: ['solar_pv', 'solar_csp', 'wind_onshore', 'wind_offshore', 'hydro_run_of_river', 'hydro_reservoir'] },
    capacity_factor: { type: 'number', min: 0, max: 1 },
    tilt_angle: { type: 'number', min: 0, max: 90 },
    azimuth: { type: 'number', min: 0, max: 360 }
  },
  
  demand_center: {
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    peak_demand_mw: { type: 'number', min: 0 },
    demand_type: { type: 'enum', values: ['residential', 'commercial', 'industrial', 'mixed'] },
    annual_consumption_gwh: { type: 'number', min: 0 }
  },
  
  storage_facility: {
    latitude: { type: 'number', min: -90, max: 90 },
    longitude: { type: 'number', min: -180, max: 180 },
    power_capacity_mw: { type: 'number', min: 0 },
    energy_capacity_mwh: { type: 'number', min: 0 },
    storage_type: { type: 'enum', values: ['battery_li_ion', 'battery_flow', 'pumped_hydro', 'caes', 'hydrogen', 'thermal'] },
    efficiency_charge: { type: 'number', min: 0, max: 1 },
    efficiency_discharge: { type: 'number', min: 0, max: 1 }
  }
};

// Template mapping: entity type -> recommended Calliope technologies
export const ENTITY_TO_TECH_MAPPING = {
  substation: [],
  network_node: [],
  
  power_plant: {
    coal: ['coal_power_plant'],
    gas: ['gas_ccgt', 'gas_ocgt'],
    nuclear: ['nuclear_plant'],
    biomass: ['biomass_plant']
  },
  
  renewable_site: {
    solar_pv: ['solar_pv_fixed', 'solar_pv_tracking'],
    solar_csp: ['solar_csp'],
    wind_onshore: ['wind_onshore'],
    wind_offshore: ['wind_offshore'],
    hydro_run_of_river: ['hydro_ror'],
    hydro_reservoir: ['hydro_reservoir']
  },
  
  demand_center: {
    residential: ['power_demand', 'heat_demand'],
    commercial: ['power_demand', 'cooling_demand'],
    industrial: ['power_demand', 'heat_demand', 'h2_demand'],
    mixed: ['power_demand']
  },
  
  storage_facility: {
    battery_li_ion: ['battery_storage'],
    battery_flow: ['battery_storage'],
    pumped_hydro: ['pumped_hydro_storage'],
    hydrogen: ['h2_storage']
  }
};

export default {
  ENTITY_TYPES,
  TRANSMISSION_TYPES,
  DATA_CATEGORIES,
  VALIDATION_RULES,
  ENTITY_TO_TECH_MAPPING
};
