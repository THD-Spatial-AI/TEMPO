# Technology Templates

TEMPO ships with a built-in technology library that covers the most common generation, storage, conversion, and demand technologies. The library is defined in `src/components/TechnologiesData.js` and can optionally be enriched at runtime by a local [OEO Technology Database API](#oeo-technology-database-api).

---

## Library structure

Technologies are grouped into the following categories:

### Renewable generation

| ID | Description |
|---|---|
| `solar_pv_utility_scale` | Utility-scale solar PV |
| `solar_pv_distributed` | Distributed rooftop PV |
| `concentrated_solar_power_csp` | Concentrating solar power with thermal storage |
| `onshore_wind` | Onshore wind turbines |
| `offshore_wind_fixed_bottom` | Fixed-bottom offshore wind |
| `offshore_wind_floating` | Floating offshore wind |
| `hydroelectric_run_of_river` | Run-of-river hydropower |
| `hydroelectric_reservoir` | Reservoir hydropower with dispatchable output |

### Conventional generation

| ID | Description |
|---|---|
| `combined_cycle_gas_turbine_ccgt` | Combined-cycle gas turbine |
| `open_cycle_gas_turbine_ocgt` | Open-cycle (peaking) gas turbine |
| `internal_combustion_engine` | Diesel / gas internal combustion engine |
| `coal_power_plant` | Pulverised coal boiler |
| `nuclear_power_conventional` | Large nuclear reactor |
| `small_modular_reactors_smr` | Small modular reactor |
| `geothermal_power` | Geothermal binary / flash plant |
| `biomass_power_plant` | Solid biomass combustion |
| `biogas_power_plant` | Anaerobic digestion + gas engine |
| `waste_to_energy` | Municipal solid waste incinerator |
| `marine_energy` | Tidal / wave energy converter |

### Electrochemical storage

| ID | Description |
|---|---|
| `lithium_ion_bess` | Li-ion utility-scale battery |
| `redox_flow_batteries` | Vanadium redox flow battery |
| `sodium_sulfur_batteries` | Na-S high-temperature battery |
| `lead_acid_batteries` | Lead-acid battery bank |

### Mechanical and thermal storage

| ID | Description |
|---|---|
| `pumped_hydro_storage` | Pumped-hydro energy storage |
| `compressed_air_energy_storage_caes` | CAES above-ground or cavern |
| `liquid_air_energy_storage_laes` | Liquid-air energy storage |
| `flywheels` | Flywheel kinetic storage |
| `sensible_thermal_storage` | Hot-water / molten-salt tank |
| `latent_thermal_storage` | Phase-change material storage |

### Hydrogen supply chain

| ID | Description |
|---|---|
| `pem_electrolyzer` | Proton-exchange membrane electrolyser |
| `alkaline_electrolyzer` | Alkaline water electrolysis |
| `solid_oxide_electrolyzer_soec` | High-temperature SOEC |
| `pem_fuel_cell` | PEM H₂ fuel cell (electricity output) |
| `solid_oxide_fuel_cell_sofc` | SOFC (electricity + heat) |
| `hydrogen_pipeline` | H₂ pipeline transmission |
| `compressed_hydrogen_storage` | Above-ground pressure vessel |
| `liquid_hydrogen_storage` | Cryogenic hydrogen tank |
| `underground_hydrogen_storage` | Salt cavern / aquifer storage |
| `hydrogen_to_methane` | Power-to-methane (methanation) |
| `hydrogen_to_liquid_fuels` | Fischer-Tropsch / methanol synthesis |
| `hydrogen_steam_reforming_smr` | Natural gas SMR with CCS option |

### Carbon capture and storage (CCS)

| ID | Description |
|---|---|
| `post_combustion_ccs` | Amine scrubbing on a power plant flue |
| `direct_air_capture_dac` | Ambient-air CO₂ capture |
| `co2_pipeline` | CO₂ transport pipeline |
| `co2_geological_storage` | Geological injection and storage |

### Demand

| ID | Description |
|---|---|
| `electricity_demand` | Electricity demand sink (time series driven) |
| `heat_demand` | Heat demand sink |
| `hydrogen_demand` | H₂ demand sink |
| `cooling_demand` | Cooling demand sink |

---

## Default parameter values

Each technology entry in `TechnologiesData.js` carries a set of default Calliope parameter values (capital cost, efficiency, lifetime, etc.). These values are pre-filled when you add a technology from the library in the Technologies screen.

If the [OEO Technology Database API](#oeo-technology-database-api) is available at startup, the application merges the API's parameter values on top of the built-in defaults, giving you up-to-date techno-economic data from the Open Energy Ontology ecosystem.

---

## OEO Technology Database API

An optional local REST service (default port **8005**) can supply technology parameters from a curated database aligned with the Open Energy Ontology (OEO). The Go backend proxies requests to this service via the `/tech/api/v1/*` endpoints.

| Endpoint | Description |
|---|---|
| `GET /api/technologies` | List all technologies (id, name, oeo_class, type) |
| `GET /api/technologies/{id}` | Full parameter set for a technology |
| `POST /api/technologies/batch` | Fetch multiple technologies by ID |
| `GET /api/technologies/types/{type}` | Filter by type (`supply`, `storage`, etc.) |

The Python client for this API lives in `python/services/tech_database.py`. If the service is offline, TEMPO falls back silently to the built-in defaults.

!!! info "Running the tech database"
    The OEO Technology Database is a separate project. Refer to its own documentation for installation and startup instructions. Set the `OEO_API_URL` environment variable (default: `http://127.0.0.1:8005`) to point TEMPO to a non-local instance.

---

## Adding or overriding technologies

To add a custom technology or override a default value:

1. Use **Add Technology → Custom** in the Technologies screen — this creates a one-off entry for the current model.
2. For a persistent addition, edit `src/components/TechnologiesData.js` and add an entry following the existing structure. The change is picked up after a frontend rebuild (`npm run build` or restarting `npm run dev`).

