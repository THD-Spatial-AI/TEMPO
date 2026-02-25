/**
 * CSV/JSON Data Templates and Examples for Bulk Import
 * 
 * This file provides example structures for different types of data imports
 */

export const CSV_TEMPLATES = {
  // Locations template (substations, plants, demand centers, etc.)
  LOCATIONS: {
    filename: 'locations_template.csv',
    description: 'Geographic locations with entity type classification',
    headers: [
      'name',
      'type',          // substation, power_plant, renewable_site, demand_center, storage_facility, network_node
      'latitude',
      'longitude',
      'capacity_mw',   // For plants/renewables
      'voltage_level', // For substations
      'subtype',       // e.g., 'coal', 'solar_pv', 'residential'
      'operator',
      'commissioning_year',
      'notes'
    ],
    example: [
      ['Berlin_Main', 'substation', '52.5200', '13.4050', '', '380', '', 'GridCo', '2010', 'Main transmission hub'],
      ['Solar_Farm_1', 'renewable_site', '52.3730', '13.0640', '100', '', 'solar_pv', 'SolarPower GmbH', '2020', ''],
      ['Gas_Plant_Berlin', 'power_plant', '52.4500', '13.3500', '500', '', 'gas', 'PowerGen AG', '2015', 'CCGT plant'],
      ['Berlin_City', 'demand_center', '52.5200', '13.4050', '2000', '', 'mixed', '', '', 'City demand'],
      ['Battery_Storage_1', 'storage_facility', '52.4800', '13.3800', '50', '', 'battery_li_ion', 'StorageCo', '2022', '200 MWh capacity']
    ],
    csvString: `name,type,latitude,longitude,capacity_mw,voltage_level,subtype,operator,commissioning_year,notes
Berlin_Main,substation,52.5200,13.4050,,380,,GridCo,2010,Main transmission hub
Solar_Farm_1,renewable_site,52.3730,13.0640,100,,solar_pv,SolarPower GmbH,2020,
Gas_Plant_Berlin,power_plant,52.4500,13.3500,500,,gas,PowerGen AG,2015,CCGT plant
Berlin_City,demand_center,52.5200,13.4050,2000,,mixed,,,City demand
Battery_Storage_1,storage_facility,52.4800,13.3800,50,,battery_li_ion,StorageCo,2022,200 MWh capacity`
  },

  // Transmission lines template
  TRANSMISSION_LINES: {
    filename: 'transmission_lines_template.csv',
    description: 'Connections between locations (power lines, pipelines, etc.)',
    headers: [
      'from',
      'to',
      'type',          // ac_transmission, dc_transmission, gas_pipeline, heat_network
      'capacity_mw',
      'voltage_kv',
      'length_km',
      'efficiency',
      'num_circuits',
      'commissioning_year',
      'notes'
    ],
    example: [
      ['Berlin_Main', 'Hamburg_Main', 'ac_transmission', '2000', '380', '255', '0.97', '2', '2012', ''],
      ['Solar_Farm_1', 'Berlin_Main', 'ac_transmission', '120', '110', '35', '0.98', '1', '2020', 'Solar connection'],
      ['Gas_Plant_Berlin', 'Berlin_Main', 'ac_transmission', '550', '220', '15', '0.99', '1', '2015', '']
    ],
    csvString: `from,to,type,capacity_mw,voltage_kv,length_km,efficiency,num_circuits,commissioning_year,notes
Berlin_Main,Hamburg_Main,ac_transmission,2000,380,255,0.97,2,2012,
Solar_Farm_1,Berlin_Main,ac_transmission,120,110,35,0.98,1,2020,Solar connection
Gas_Plant_Berlin,Berlin_Main,ac_transmission,550,220,15,0.99,1,2015,`
  },

  // Technology parameters template
  TECHNOLOGY_PARAMETERS: {
    filename: 'technology_parameters_template.csv',
    description: 'Technical constraints and parameters for technologies at each location',
    headers: [
      'location',
      'technology',
      'constraint_name',
      'constraint_value',
      'unit',
      'notes'
    ],
    example: [
      ['Solar_Farm_1', 'solar_pv_fixed', 'energy_cap_max', '100', 'MW', 'Maximum capacity'],
      ['Solar_Farm_1', 'solar_pv_fixed', 'energy_eff', '0.20', '', 'Panel efficiency'],
      ['Solar_Farm_1', 'solar_pv_fixed', 'resource_area', '500000', 'm2', 'Available land area'],
      ['Gas_Plant_Berlin', 'gas_ccgt', 'energy_cap_max', '500', 'MW', ''],
      ['Gas_Plant_Berlin', 'gas_ccgt', 'energy_eff', '0.58', '', 'Conversion efficiency'],
      ['Berlin_City', 'power_demand', 'resource', 'file=berlin_demand.csv', '', 'Link to time series']
    ],
    csvString: `location,technology,constraint_name,constraint_value,unit,notes
Solar_Farm_1,solar_pv_fixed,energy_cap_max,100,MW,Maximum capacity
Solar_Farm_1,solar_pv_fixed,energy_eff,0.20,,Panel efficiency
Solar_Farm_1,solar_pv_fixed,resource_area,500000,m2,Available land area
Gas_Plant_Berlin,gas_ccgt,energy_cap_max,500,MW,
Gas_Plant_Berlin,gas_ccgt,energy_eff,0.58,,Conversion efficiency
Berlin_City,power_demand,resource,file=berlin_demand.csv,,Link to time series`
  },

  // Cost parameters template
  COST_PARAMETERS: {
    filename: 'cost_parameters_template.csv',
    description: 'Economic parameters (CAPEX, OPEX, fuel costs)',
    headers: [
      'location',
      'technology',
      'cost_type',      // energy_cap, storage_cap, om_annual, om_prod, om_con, purchase
      'value',
      'currency',
      'unit',
      'year',
      'notes'
    ],
    example: [
      ['Solar_Farm_1', 'solar_pv_fixed', 'energy_cap', '800000', 'EUR', 'EUR/MW', '2023', 'CAPEX per MW'],
      ['Solar_Farm_1', 'solar_pv_fixed', 'om_annual', '15000', 'EUR', 'EUR/MW/year', '2023', 'Fixed O&M'],
      ['Gas_Plant_Berlin', 'gas_ccgt', 'energy_cap', '600000', 'EUR', 'EUR/MW', '2023', ''],
      ['Gas_Plant_Berlin', 'gas_ccgt', 'om_prod', '0.005', 'EUR', 'EUR/kWh', '2023', 'Variable O&M'],
      ['Battery_Storage_1', 'battery_storage', 'energy_cap', '150000', 'EUR', 'EUR/MW', '2023', 'Power cost'],
      ['Battery_Storage_1', 'battery_storage', 'storage_cap', '200000', 'EUR', 'EUR/MWh', '2023', 'Energy cost']
    ],
    csvString: `location,technology,cost_type,value,currency,unit,year,notes
Solar_Farm_1,solar_pv_fixed,energy_cap,800000,EUR,EUR/MW,2023,CAPEX per MW
Solar_Farm_1,solar_pv_fixed,om_annual,15000,EUR,EUR/MW/year,2023,Fixed O&M
Gas_Plant_Berlin,gas_ccgt,energy_cap,600000,EUR,EUR/MW,2023,
Gas_Plant_Berlin,gas_ccgt,om_prod,0.005,EUR,EUR/kWh,2023,Variable O&M
Battery_Storage_1,battery_storage,energy_cap,150000,EUR,EUR/MW,2023,Power cost
Battery_Storage_1,battery_storage,storage_cap,200000,EUR,EUR/MWh,2023,Energy cost`
  },

  // Time series template (hourly data for a full year)
  TIMESERIES_DEMAND: {
    filename: 'timeseries_demand_template.csv',
    description: 'Hourly electricity demand profile (8760 hours for a full year)',
    headers: ['timestamp', 'demand_mw'],
    example: [
      ['2023-01-01 00:00', '1250.5'],
      ['2023-01-01 01:00', '1150.3'],
      ['2023-01-01 02:00', '1100.8'],
      ['2023-01-01 03:00', '1080.2'],
      ['2023-01-01 04:00', '1090.5']
    ],
    csvString: `timestamp,demand_mw
2023-01-01 00:00,1250.5
2023-01-01 01:00,1150.3
2023-01-01 02:00,1100.8
2023-01-01 03:00,1080.2
2023-01-01 04:00,1090.5
... (continues for 8760 hours)`
  },

  TIMESERIES_SOLAR: {
    filename: 'timeseries_solar_capacity_factor_template.csv',
    description: 'Hourly solar capacity factor (0-1 range)',
    headers: ['timestamp', 'capacity_factor'],
    example: [
      ['2023-01-01 00:00', '0'],
      ['2023-01-01 01:00', '0'],
      ['2023-01-01 08:00', '0.15'],
      ['2023-01-01 12:00', '0.85'],
      ['2023-01-01 18:00', '0.10']
    ],
    csvString: `timestamp,capacity_factor
2023-01-01 00:00,0
2023-01-01 01:00,0
2023-01-01 08:00,0.15
2023-01-01 12:00,0.85
2023-01-01 18:00,0.10
... (continues for 8760 hours)`
  },

  TIMESERIES_WIND: {
    filename: 'timeseries_wind_capacity_factor_template.csv',
    description: 'Hourly wind capacity factor (0-1 range)',
    headers: ['timestamp', 'capacity_factor'],
    example: [
      ['2023-01-01 00:00', '0.65'],
      ['2023-01-01 01:00', '0.72'],
      ['2023-01-01 02:00', '0.68'],
      ['2023-01-01 03:00', '0.55'],
      ['2023-01-01 04:00', '0.48']
    ],
    csvString: `timestamp,capacity_factor
2023-01-01 00:00,0.65
2023-01-01 01:00,0.72
2023-01-01 02:00,0.68
2023-01-01 03:00,0.55
2023-01-01 04:00,0.48
... (continues for 8760 hours)`
  },

  TIMESERIES_ELECTRICITY_PRICE: {
    filename: 'timeseries_electricity_price_template.csv',
    description: 'Hourly electricity market price',
    headers: ['timestamp', 'price_eur_mwh'],
    example: [
      ['2023-01-01 00:00', '45.5'],
      ['2023-01-01 01:00', '42.3'],
      ['2023-01-01 08:00', '65.8'],
      ['2023-01-01 12:00', '55.2'],
      ['2023-01-01 18:00', '85.5']
    ],
    csvString: `timestamp,price_eur_mwh
2023-01-01 00:00,45.5
2023-01-01 01:00,42.3
2023-01-01 08:00,65.8
2023-01-01 12:00,55.2
2023-01-01 18:00,85.5
... (continues for 8760 hours)`
  }
};

// JSON template for complete model configuration
export const JSON_TEMPLATE = {
  filename: 'complete_model_template.json',
  description: 'Complete Calliope model configuration in JSON format',
  structure: {
    model: {
      name: 'My Energy System Model',
      description: 'Description of the energy system',
      timeseries_data_path: './timeseries',
      subset_time: ['2023-01-01', '2023-12-31']
    },
    
    locations: {
      Berlin_Main: {
        coordinates: { lat: 52.5200, lon: 13.4050 },
        available_area: 1000000,
        techs: {
          power_demand: {
            constraints: {
              resource: 'file=berlin_demand.csv',
              force_resource: true
            }
          },
          solar_pv_fixed: {
            constraints: {
              resource: 'file=berlin_solar_cf.csv',
              energy_cap_max: 500,
              resource_area_max: 50000
            }
          }
        }
      },
      Solar_Farm_1: {
        coordinates: { lat: 52.3730, lon: 13.0640 },
        techs: {
          solar_pv_fixed: {
            constraints: {
              resource: 'file=solar_cf.csv',
              energy_cap_max: 100,
              energy_eff: 0.20
            },
            costs: {
              monetary: {
                energy_cap: 800000,
                om_annual: 15000
              }
            }
          }
        }
      }
    },
    
    links: {
      'Berlin_Main,Solar_Farm_1': {
        techs: {
          ac_transmission: {
            constraints: {
              energy_cap_max: 120,
              energy_eff: 0.98
            },
            distance: 35
          }
        }
      }
    },
    
    tech_groups: {
      power_demand: {
        essentials: {
          name: 'Power demand',
          carrier: 'electricity',
          parent: 'demand'
        }
      },
      solar_pv_fixed: {
        essentials: {
          name: 'Solar PV (fixed)',
          carrier_out: 'electricity',
          parent: 'supply'
        },
        constraints: {
          resource: 'file=solar_resource.csv',
          resource_unit: 'energy_per_cap'
        }
      },
      ac_transmission: {
        essentials: {
          name: 'AC transmission',
          carrier: 'electricity',
          parent: 'transmission'
        },
        constraints: {
          energy_eff: 0.98
        }
      }
    }
  }
};

// Helper function to generate downloadable CSV
export const generateCSVDownload = (templateKey) => {
  const template = CSV_TEMPLATES[templateKey];
  if (!template) return null;
  
  const blob = new Blob([template.csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', template.filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Helper function to generate downloadable JSON
export const generateJSONDownload = () => {
  const jsonString = JSON.stringify(JSON_TEMPLATE.structure, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', JSON_TEMPLATE.filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default {
  CSV_TEMPLATES,
  JSON_TEMPLATE,
  generateCSVDownload,
  generateJSONDownload
};
