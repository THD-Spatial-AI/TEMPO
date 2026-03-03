# Technology Templates

Calliope Visualizator ships with pre-configured technology YAML templates in the `techs/` directory. These templates define default parameter values that accelerate model creation without requiring users to research typical values from scratch.

---

## Renewable technologies (`techs_renewable.yaml`)

### `solar_pv`
Utility-scale solar photovoltaic. Uses an area-based resource model.

| Parameter | Default | Unit |
|---|---|---|
| `energy_eff` | 0.85 | — |
| `resource_area_max` | unlimited | km² |
| `cost_energy_cap` | 600 | €/kW |
| `cost_om_annual` | 12 | €/kW/year |
| `lifetime` | 25 | years |

### `wind_onshore`
Onshore wind turbines. Resource driven by a capacity factor time series.

| Parameter | Default | Unit |
|---|---|---|
| `cost_energy_cap` | 1100 | €/kW |
| `cost_om_annual` | 33 | €/kW/year |
| `lifetime` | 25 | years |

### `wind_offshore`
Offshore wind. Higher capital cost, typically better capacity factors.

| Parameter | Default | Unit |
|---|---|---|
| `cost_energy_cap` | 2800 | €/kW |
| `lifetime` | 25 | years |

### `run_of_river`
Run-of-river hydropower. Treated as a must-run resource with a capacity factor series.

---

## Conventional technologies (`techs_conventional.yaml`)

### `gas_ccgt`
Combined-cycle gas turbine. Dispatchable supply.

| Parameter | Default | Unit |
|---|---|---|
| `energy_eff` | 0.55 | — |
| `cost_energy_cap` | 800 | €/kW |
| `cost_om_prod` | 0.003 | €/kWh |

### `coal`
Coal power plant. High emission factor, low variable cost.

### `nuclear`
Nuclear base load. Very high capital cost, low variable cost, must-run option.

### `diesel_generator`
Small diesel generator for off-grid or island systems.

---

## Storage technologies (`techs_storage.yaml`)

### `battery`
Lithium-ion utility-scale battery.

| Parameter | Default | Unit |
|---|---|---|
| `storage_cap_max` | unlimited | kWh |
| `charge_rate` | 0.25 | — |
| `energy_eff` | 0.92 | round-trip |
| `cost_storage_cap` | 150 | €/kWh |

### `pumped_hydro`
Pumped-hydro energy storage. Very low cost per kWh for large installations.

### `hydrogen_storage`
Pressurized hydrogen storage vessel.

---

## Hydrogen technologies (`techs_h2.yaml`)

### `electrolyser`
PEM electrolyser converting electricity to hydrogen.

| Parameter | Default | Unit |
|---|---|---|
| `energy_eff` | 0.70 | — |
| `cost_energy_cap` | 1200 | €/kW |

### `fuel_cell`
PEM fuel cell converting hydrogen back to electricity.

### `hydrogen_pipeline`
Transmission link for hydrogen gas.

---

## Demand technologies (`techs_demand.yaml`)

### `demand_electricity`
Electricity demand sink. Typically driven by a time series.

### `demand_heat`
Heat demand sink.

### `demand_hydrogen`
Hydrogen demand sink.

---

## Transmission technologies (`techs_transmission.yaml`)

### `ac_line`
AC high-voltage overhead transmission line.

| Parameter | Default | Unit |
|---|---|---|
| `energy_eff` | 0.98 | per unit distance |
| `cost_energy_cap` | 800 | €/kW |

### `dc_link`
HVDC submarine or overhead cable. Lower losses over long distances.

### `heat_pipe`
District heating pipeline.

---

## Customising templates

The template YAML files can be edited directly. Changes take effect the next time the application loads the template library (requires restart). Adding a new file to `techs/` with the same structure as an existing one automatically makes the new templates available in the technology picker.
