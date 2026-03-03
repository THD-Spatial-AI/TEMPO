# Technologies

Technologies are the core components of a Calliope energy system. They represent generation, conversion, storage, demand, and transmission assets assigned to specific locations.

---

## Technology types

Calliope defines the following base technology types, all of which are supported in Calliope Visualizator:

| Type | Description |
|---|---|
| `supply` | Produces an energy carrier from a resource (e.g. solar PV, wind turbine, gas plant) |
| `supply_plus` | Supply with additional storage capability (e.g. concentrating solar with thermal storage) |
| `demand` | Consumes an energy carrier (e.g. electricity demand, heat demand) |
| `storage` | Stores and retrieves an energy carrier (e.g. battery, pumped hydro) |
| `transmission` | Moves energy between locations (e.g. power line, pipeline) |
| `conversion` | Converts one carrier to another (e.g. heat pump, electrolyser) |
| `conversion_plus` | Multi-carrier conversion (e.g. combined heat and power plant) |

---

## Adding a technology from a template

1. Navigate to the **Technologies** tab.
2. Click **Add Technology** → **From template**.
3. Browse the template library, organized by category:
    - **Renewable**: `solar_pv`, `wind_onshore`, `wind_offshore`, `run_of_river`
    - **Conventional**: `gas_ccgt`, `coal`, `nuclear`, `diesel_generator`
    - **Storage**: `battery`, `pumped_hydro`, `hydrogen_storage`
    - **Hydrogen**: `electrolyser`, `fuel_cell`, `hydrogen_pipeline`
    - **Demand**: `demand_electricity`, `demand_heat`, `demand_hydrogen`
    - **Transmission**: `ac_line`, `dc_link`, `heat_pipe`
4. Select a template. The parameter form is pre-filled with typical default values.
5. Assign the technology to one or more **locations**.
6. Review and adjust parameters (see below), then click **Save**.

---

## Adding a custom technology

Click **Add Technology** → **Custom** to start from a blank form. You must specify at minimum:

- **Name** — unique identifier (no spaces).
- **Type** — one of the Calliope base types.
- **Carrier in / Carrier out** — energy carriers consumed and produced.
- **Assigned locations**.

---

## Key parameters

The parameters shown depend on the technology type. Common ones:

| Parameter | Unit | Description |
|---|---|---|
| `energy_cap_max` | kW | Maximum installable capacity |
| `energy_cap_min` | kW | Minimum installable capacity (if > 0, forces installation) |
| `energy_eff` | — | Conversion or transmission efficiency (0–1) |
| `resource` | — | Resource availability (can reference a time series) |
| `resource_area_max` | km² | Maximum area available for resource-constrained technologies |
| `cost_energy_cap` | currency/kW | Capital cost per unit of capacity |
| `cost_om_annual` | currency/kW/year | Annual fixed O&M cost |
| `cost_om_prod` | currency/kWh | Variable O&M cost per unit of generation |
| `storage_cap_max` | kWh | Maximum storage capacity (storage types only) |
| `charge_rate` | — | Storage charge/discharge rate relative to energy capacity |

---

## Linking time series to a parameter

Parameters marked with a wave icon (`~`) can be driven by a time series instead of a fixed scalar. Click the icon to open the time series selector and pick an uploaded CSV column. See [Time Series](time-series.md) for upload instructions.

---

## Technology colours on the map

Each technology type is assigned a colour. Location markers on the map mix the colours of all technologies assigned to that location, giving a quick visual summary of the generation mix.

---

## Deleting a technology

Click **⋯** → **Delete** next to the technology in the list. This removes the technology from the model and from all location assignments.
