// Technology images mapping - using local image files
import React from "react";

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
  // Renewable Energy
  solar: pv,
  'solar-pv': pv,
  'solar-thermal': pv,
  wind: wind,
  'wind-offshore': wind,
  'wind-onshore': wind,
  hydro: hydro,
  'reservoir-hydro': hydro,
  'run-of-river-hydro': hydro,
  geothermal: geothermal,
  biomass: biomass,
  biogas: biogas,
  
  // Conventional
  coal: coal,
  gas: gas,
  oil: oil,
  diesel: diesel,
  nuclear: nuclear,
  
  // Storage
  battery: battery,
  'pumped-hydro': hydro,
  'hydrogen-storage': battery,
  'thermal-storage': battery,
  
  // Conversion
  'heat-pump': boiler,
  boiler: boiler,
  'chp': gas,
  electrolyzer: battery,
  'fuel-cell': battery,
  
  // Demand
  power_demand: power_demand,
  heat_demand: heat_demand,
  h2_demand: gas,
  cooling_demand: hydro,
  
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

export const TECH_TEMPLATES = {
  supply: [
    // Conventional Technologies
    {
      name: 'coal',
      parent: 'supply',
      description: 'Coal plant traditional',
      essentials: {
        name: 'Coal plant traditional',
        color: '#5A5A5A',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        energy_eff: 0.4,
        energy_ramping: 0.6,
        lifetime: 35
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 816,
          om_annual: 23.73,
          om_prod: 0.043
        }
      }
    },
    {
      name: 'oil',
      parent: 'supply',
      description: 'Oil power plant',
      essentials: {
        name: 'Oil',
        color: '#000000',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        energy_eff: 0.4,
        energy_ramping: 0.6,
        lifetime: 35
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 487,
          om_annual: 9.4,
          om_prod: 0.023
        }
      }
    },
    {
      name: 'diesel',
      parent: 'supply',
      description: 'Diesel plant',
      essentials: {
        name: 'Diesel plant',
        color: '#000000',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        energy_eff: 0.4,
        energy_ramping: 0.6,
        lifetime: 35
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 487,
          om_annual: 9.4,
          om_prod: 0.023
        }
      }
    },
    {
      name: 'gas',
      parent: 'supply',
      description: 'Gas power plant',
      essentials: {
        name: 'gas plant',
        color: '#5B7494',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        energy_eff: 0.5,
        energy_ramping: 0.6,
        lifetime: 35
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 1086,
          om_annual: 21.06,
          om_prod: 0.0052
        }
      }
    },
    {
      name: 'reservoir-hydro',
      parent: 'supply',
      description: 'Hydroelectric power - reservoir and basin',
      essentials: {
        name: 'Hydroelectric power - reservoir and basin',
        color: '#50A6D4',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        energy_eff: 0.85,
        lifetime: 80
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 5369,
          om_annual: 52.05
        }
      }
    },
    // Renewable Technologies
    {
      name: 'biogas',
      parent: 'supply',
      description: 'Biogas power plant',
      essentials: {
        name: 'Biogas power plant',
        color: '#5AA24D',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        energy_eff: 0.3,
        lifetime: 30
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 1384,
          om_annual: 26.82,
          om_prod: 0.0176
        }
      }
    },
    {
      name: 'biomass',
      parent: 'supply',
      description: 'Biomass power plant',
      essentials: {
        name: 'Biomass power plant',
        color: '#D800FF',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        energy_eff: 0.25,
        lifetime: 30
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 3885,
          om_annual: 75.16,
          om_prod: 0.005
        }
      }
    },
    {
      name: 'geo',
      parent: 'supply',
      description: 'Geothermal power plant',
      essentials: {
        name: 'Geothermal power plant',
        color: '#873737',
        parent: 'supply',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        resource: 'inf',
        lifetime: 50,
        energy_eff: 0.15
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 5291,
          om_prod: 0.0011,
          om_annual: 153.54
        }
      }
    }
  ],
  supply_plus: [
    {
      name: 'wind',
      parent: 'supply_plus',
      description: 'On-shore wind power',
      essentials: {
        name: 'On-shore wind power',
        color: '#47D154',
        parent: 'supply_plus',
        carrier_out: 'electricity'
      },
      constraints: {
        resource_unit: 'energy_per_cap',
        lifetime: 25
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 1534,
          om_annual: 40.74
        }
      }
    },
    {
      name: 'pv',
      parent: 'supply_plus',
      description: 'Photovoltaic power farm-scale',
      essentials: {
        name: 'Photovoltaic power farm-scale',
        color: '#F9FF2C',
        parent: 'supply_plus',
        carrier_out: 'electricity'
      },
      constraints: {
        resource_unit: 'energy_per_cap',
        lifetime: 30
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 941,
          om_annual: 19.22
        }
      }
    },
    {
      name: 'csp',
      parent: 'supply_plus',
      description: 'CSP Power',
      essentials: {
        name: 'CSP Power',
        color: '#99CB48',
        parent: 'supply_plus',
        carrier_out: 'electricity'
      },
      constraints: {
        resource_unit: 'energy_per_cap',
        lifetime: 30
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 6381,
          om_annual: 123.74
        }
      }
    },
    {
      name: 'run-of-river-hydro',
      parent: 'supply_plus',
      description: 'Hydroelectric run-of-river power',
      essentials: {
        name: 'Hydroelectric run-of-river power',
        color: '#64D7CE',
        parent: 'supply_plus',
        carrier_out: 'electricity'
      },
      constraints: {
        resource_eff: 0.80,
        lifetime: 30
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 4746,
          om_annual: 138.03
        }
      }
    },
    {
      name: 'run-of-river-mini-hydro',
      parent: 'supply_plus',
      description: 'Mini Hydroelectric run-of-river power',
      essentials: {
        name: 'Mini Hydroelectric run-of-river power',
        color: '#00FFC5',
        parent: 'supply_plus',
        carrier_out: 'electricity'
      },
      constraints: {
        resource_eff: 0.7,
        lifetime: 30
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 2274,
          om_annual: 69.24
        }
      }
    }
  ],
  storage: [
    {
      name: 'battery',
      parent: 'storage',
      description: 'Battery energy storage (Ion-Litio)',
      essentials: {
        color: '#177202',
        name: 'Battery energy storage',
        parent: 'storage',
        carrier: 'electricity'
      },
      constraints: {
        energy_eff: 0.9,
        lifetime: 20,
        energy_cap_per_storage_cap_equals: 0.20
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          storage_cap: 1556
        }
      }
    },
    {
      name: 'h2_storage',
      parent: 'storage',
      description: 'Hydrogen storage (Liquefaction + storage)',
      essentials: {
        color: '#177202',
        name: 'Hydrogen storage',
        parent: 'storage',
        carrier: 'hydrogen'
      },
      constraints: {
        energy_eff: 0.40,
        lifetime: 20
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          storage_cap: 4578,
          om_annual: 137
        }
      }
    }
  ],
  conversion: [],
  conversion_plus: [
    {
      name: 'electrolyzer',
      parent: 'conversion_plus',
      description: 'Electrolyzer',
      essentials: {
        name: 'Electrolyzer',
        color: '#FFD700',
        parent: 'conversion_plus',
        carrier_in: 'electricity',
        carrier_out: 'hydrogen'
      },
      constraints: {
        energy_eff: 0.7,
        lifetime: 20
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 1060,
          om_annual: 37
        }
      }
    },
    {
      name: 'fuel_cell',
      parent: 'conversion_plus',
      description: 'Fuel Cell',
      essentials: {
        name: 'Fuel Cell',
        color: '#FF8C00',
        parent: 'conversion_plus',
        carrier_in: 'hydrogen',
        carrier_out: 'electricity'
      },
      constraints: {
        energy_eff: 0.5,
        lifetime: 15
      },
      costs: {
        monetary: {
          interest_rate: 0.10,
          energy_cap: 1600,
          om_annual: 80
        }
      }
    }
  ],
  transmission: [
    {
      name: 'power_lines',
      parent: 'transmission',
      description: 'Transmission Power Plants (Generic HVAC)',
      essentials: {
        name: 'Transmission Power Plants',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 'inf',
        energy_eff: 1.0,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '11_kv',
      parent: 'transmission',
      description: '11 KV transmission line',
      essentials: {
        name: '11 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 8500,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '13_kv',
      parent: 'transmission',
      description: '13 KV transmission line',
      essentials: {
        name: '13 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 7366,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '13-8_kv',
      parent: 'transmission',
      description: '13.8 KV transmission line',
      essentials: {
        name: '13.8 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 10002,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '23_kv',
      parent: 'transmission',
      description: '23 KV transmission line',
      essentials: {
        name: '23 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 37697,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '33_kv',
      parent: 'transmission',
      description: '33 KV transmission line',
      essentials: {
        name: '33 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 13399,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '44_kv',
      parent: 'transmission',
      description: '44 KV transmission line',
      essentials: {
        name: '44 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 16007,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '66_kv',
      parent: 'transmission',
      description: '66 KV transmission line',
      essentials: {
        name: '66 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 35704,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '69_kv',
      parent: 'transmission',
      description: '69 KV transmission line',
      essentials: {
        name: '69 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 56327,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '100_kv',
      parent: 'transmission',
      description: '100 KV transmission line',
      essentials: {
        name: '100 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 117106,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '110_kv',
      parent: 'transmission',
      description: '110 KV transmission line',
      essentials: {
        name: '110 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 133138,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '154_kv',
      parent: 'transmission',
      description: '154 KV transmission line',
      essentials: {
        name: '154 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 143492,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '220_kv',
      parent: 'transmission',
      description: '220 KV transmission line',
      essentials: {
        name: '220 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 323104,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '345_kv',
      parent: 'transmission',
      description: '345 KV transmission line',
      essentials: {
        name: '345 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 699142,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    },
    {
      name: '500_kv',
      parent: 'transmission',
      description: '500 KV transmission line',
      essentials: {
        name: '500 KV',
        color: '#966F9E',
        parent: 'transmission',
        carrier: 'electricity'
      },
      constraints: {
        energy_cap_max: 1702563,
        lifetime: 40
      },
      costs: {
        monetary: {
          interest_rate: 0.1,
          energy_cap_per_distance: 0.91
        }
      }
    }
  ],
  demand: [
    {
      name: 'power_demand',
      parent: 'demand',
      description: 'Electricity power demand',
      essentials: {
        name: 'Power demand',
        color: '#072486',
        parent: 'demand',
        carrier: 'electricity'
      },
      constraints: {
        energy_con: true,
        force_resource: true,
        resource_unit: 'energy'
      },
      costs: {}
    },
    {
      name: 'heat_demand',
      parent: 'demand',
      description: 'Heat energy demand',
      essentials: {
        name: 'Heat demand',
        color: '#DC2626',
        parent: 'demand',
        carrier: 'heat'
      },
      constraints: {
        energy_con: true,
        force_resource: true,
        resource_unit: 'energy'
      },
      costs: {}
    },
    {
      name: 'h2_demand',
      parent: 'demand',
      description: 'Hydrogen demand',
      essentials: {
        name: 'Hydrogen demand',
        color: '#7C3AED',
        parent: 'demand',
        carrier: 'hydrogen'
      },
      constraints: {
        energy_con: true,
        force_resource: true,
        resource_unit: 'energy'
      },
      costs: {}
    },
    {
      name: 'gas_demand',
      parent: 'demand',
      description: 'Natural gas demand',
      essentials: {
        name: 'Gas demand',
        color: '#EA580C',
        parent: 'demand',
        carrier: 'gas'
      },
      constraints: {
        energy_con: true,
        force_resource: true,
        resource_unit: 'energy'
      },
      costs: {}
    },
    {
      name: 'cooling_demand',
      parent: 'demand',
      description: 'Cooling energy demand',
      essentials: {
        name: 'Cooling demand',
        color: '#06B6D4',
        parent: 'demand',
        carrier: 'cooling'
      },
      constraints: {
        energy_con: true,
        force_resource: true,
        resource_unit: 'energy'
      },
      costs: {}
    },
    {
      name: 'water_demand',
      parent: 'demand',
      description: 'Water demand',
      essentials: {
        name: 'Water demand',
        color: '#0EA5E9',
        parent: 'demand',
        carrier: 'water'
      },
      constraints: {
        energy_con: true,
        force_resource: true,
        resource_unit: 'energy'
      },
      costs: {}
    }
  ]
};
