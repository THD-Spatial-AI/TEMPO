# H₂ Power-Plant Digital Twin — MATLAB Bridge API Contract

**Schema version:** `2.0`  
**Date:** 2026-03-19  
**Client:** Calliope Visualizator (`src/services/h2SimPayload.js`)  
**Server:** FastAPI bridge + MATLAB/Simulink simulation engine  

---

## 1. Endpoint

```
POST /api/hydrogen/simulate
Content-Type: application/json
```

Accepts the JSON body described in §2.  
Returns either:
- `202 Accepted` → `{ "job_id": "<uuid>", "status": "queued", "message": "..." }` (async, see §4)
- `200 OK` → full result inline (sync fallback, same shape as §3)

---

## 2. Request Body — Schema v2.0

> **Breaking change from v1.**  
> The old flat `{ electrolyzer, storage, fuel_cell, simulation }` shape is replaced by
> the structured body below. The `schema_version` field identifies which contract is in use.

```json
{
  "schema_version": "2.0",

  "simulation": {
    "t_end_s": 3600,
    "dt_s": 60
  },

  "source": {
    "tech_type": "solar",
    "name": "Solar PV (Utility)",
    "capacity_kw": 10000,
    "efficiency_pct": null,
    "profile": [
      { "time_s": 0,   "power_kw": 0    },
      { "time_s": 60,  "power_kw": 120  },
      { "time_s": 120, "power_kw": 340  }
    ]
  },

  "electrolyzer": {
    "tech_type": "pem",
    "name": "PEM Electrolyzer",
    "capacity_kw": 1000,
    "nominal_efficiency_pct_hhv": 70,
    "min_load_pct": 5,
    "max_load_pct": 100,
    "operating_temperature_c": 80,
    "water_flow_rate_lpm": 90,
    "h2_hhv_kwh_per_kg": 39.4
  },

  "compressor": {
    "tech_type": "reciprocating",
    "name": "Reciprocating (350 bar)",
    "isentropic_efficiency_frac": 0.78,
    "inlet_pressure_bar": 30,
    "target_pressure_bar": 350
  },

  "storage": {
    "tech_type": "compressed_h2",
    "name": "Compressed H₂ Tank (350 bar)",
    "max_pressure_bar": 350,
    "min_pressure_bar": 20,
    "initial_soc_pct": 20,
    "round_trip_efficiency_pct": 99
  },

  "fuel_cell": {
    "tech_type": "pem",
    "name": "PEM Fuel Cell",
    "rated_power_kw": 1000,
    "nominal_efficiency_pct": 58,
    "min_load_pct": 10,
    "h2_flow_rate_nm3h": 40,
    "operating_pressure_bar": 2.5,
    "cooling_capacity_kw": 35
  }
}
```

### 2.1 Field Reference

#### `simulation`

| Field | Type | Unit | Description |
|---|---|---|---|
| `t_end_s` | number | s | Total simulation horizon |
| `dt_s` | number | s | Integration / output time-step |

#### `source`

| Field | Type | Unit | Description |
|---|---|---|---|
| `tech_type` | string | — | One of `solar`, `wind`, `nuclear`, `hydro`, `gas`, `coal`, `biomass`, `geothermal`, `generic` |
| `name` | string\|null | — | Human-readable label |
| `capacity_kw` | number\|null | kW | Rated electrical capacity |
| `efficiency_pct` | number\|null | % | Generator efficiency — `null` for renewable sources |
| `profile` | `[{time_s, power_kw}]` | kW | **Time-series AC power fed to the ELZ bus.** Length = `floor(t_end_s / dt_s) + 1`. MATLAB should use this array directly as the generator input signal — do **not** re-synthesise the profile from `tech_type`. |

> The profile is always attached. If the user has uploaded a measured CSV it is used as-is; otherwise the client synthesises a technology-specific shape. In all cases the profile is the authoritative power waveform for the simulation.

#### `electrolyzer`

| Field | Type | Unit | Description |
|---|---|---|---|
| `tech_type` | string | — | `pem`, `alkaline`, `soec`, `aem` |
| `capacity_kw` | number | kW | Rated AC input at maximum load |
| `nominal_efficiency_pct_hhv` | number | % | System efficiency at rated point, **HHV basis** (H₂ HHV = `h2_hhv_kwh_per_kg` × kg produced) |
| `min_load_pct` | number | % | Minimum stable partial load |
| `max_load_pct` | number | % | Maximum load (usually 100) |
| `operating_temperature_c` | number | °C | Stack operating temperature |
| `water_flow_rate_lpm` | number | L/min | DI water feed rate |
| `h2_hhv_kwh_per_kg` | 39.4 (constant) | kWh/kg | HHV reference — identifies the efficiency basis |

**MATLAB ELZ model guidance:**  
- Clip input power to `[min_load_pct/100 × capacity_kw, capacity_kw]`; output 0 H₂ below minimum load.  
- H₂ production rate [kg/h] = `(P_elz_kw × efficiency_hhv) / h2_hhv_kwh_per_kg`  
- For partial-load the efficiency curve is tech-type-dependent (PEM is relatively flat; alkaline drops sharply below ~40%).

#### `compressor`

| Field | Type | Unit | Description |
|---|---|---|---|
| `tech_type` | string | — | `reciprocating`, `ionic`, `linear` |
| `isentropic_efficiency_frac` | number | 0–1 | Isentropic efficiency |
| `inlet_pressure_bar` | number | bar | Compressor suction pressure (= ELZ outlet, typically 20–35 bar) |
| `target_pressure_bar` | number | bar | Storage fill pressure target |

**MATLAB compressor model guidance:**  
- Multi-stage adiabatic compression with inter-cooling is assumed.  
- Compressor power [kW] = `(ṁ_h2 × R_specific × T_in / η_isen) × (n/(n-1)) × [(p_out/p_in)^((n-1)/n) - 1]`  
- Compressor runs whenever the ELZ is producing and `storage.pressure_bar < target_pressure_bar`.

#### `storage`

| Field | Type | Unit | Description |
|---|---|---|---|
| `tech_type` | string | — | `compressed_h2`, `liquid_h2`, `metal_hydride`, `cavern` |
| `max_pressure_bar` | number | bar | Maximum allowable vessel pressure |
| `min_pressure_bar` | number | bar | Minimum usable pressure (process termination threshold) |
| `initial_soc_pct` | number | % | Initial state-of-charge at t = 0 |
| `round_trip_efficiency_pct` | number | % | Overall storage round-trip efficiency (accounts for boil-off / auxiliary losses) |

**MATLAB storage model guidance:**  
- Ideal gas model is sufficient for compressed H₂: `p = n_h2 × R × T / V`  
- SOC defined as `(m_h2_current − m_h2_min) / (m_h2_max − m_h2_min) × 100`  
- `m_h2_min` corresponds to `min_pressure_bar`; `m_h2_max` to `max_pressure_bar`.  
- Storage arrests filling when `p ≥ max_pressure_bar` and arrests discharge when `p ≤ min_pressure_bar`.

#### `fuel_cell`

| Field | Type | Unit | Description |
|---|---|---|---|
| `tech_type` | string | — | `pem`, `sofc`, `mcfc`, `pafc`, `alkaline` |
| `rated_power_kw` | number\|null | kW | Rated AC output at full load |
| `nominal_efficiency_pct` | number | % | DC electrical efficiency, **LHV basis**, at rated point |
| `min_load_pct` | number | % | Minimum stable load |
| `h2_flow_rate_nm3h` | number | Nm³/h | H₂ feed flow rate at rated power |
| `operating_pressure_bar` | number | bar | Cathode / anode operating pressure |
| `cooling_capacity_kw` | number | kW | Thermal management / cooling system capacity |

**MATLAB FC model guidance:**  
- Polarisation curve (V–I) determines terminal voltage vs current density.  
- `P_out = V_cell × I × N_cells × η_inverter`  
- H₂ consumption [Nm³/h] = `P_out / (η_fc × H2_LHV_kWh_per_Nm3)`; LHV of H₂ = 3.00 kWh/Nm³.  
- FC is only active when `storage.pressure_bar > min_pressure_bar` and a load demand exists.

---

## 3. Response Body — Expected MATLAB Output

MATLAB should return JSON with the following nested structure. All time-series arrays must be the same length as the `time_s` axis.

```json
{
  "time_s": [0, 60, 120, 180, "..."],

  "electrolyzer": {
    "power_in_kw":         [0.0, 340.0, 820.0, "..."],
    "h2_production_nm3h":  [0.0, 2.4,   5.8,   "..."],
    "h2_production_kg_h":  [0.0, 0.22,  0.52,  "..."],
    "efficiency_pct":      [0.0, 68.5,  70.1,  "..."],
    "stack_temperature_c": [25,  52.3,  74.1,  "..."]
  },

  "compressor": {
    "power_consumed_kw":  [0.0, 1.2, 2.9, "..."],
    "outlet_pressure_bar":[0.0, 32,  35,  "..."]
  },

  "storage": {
    "pressure_bar": [72.0, 72.8, 74.1, "..."],
    "soc_pct":      [20.2, 20.5, 21.0, "..."],
    "h2_mass_kg":   [5.1,  5.3,  5.6,  "..."]
  },

  "fuel_cell": {
    "power_output_kw":      [100.0, 100.0, 100.0, "..."],
    "h2_consumed_nm3h":     [5.6,   5.6,   5.6,   "..."],
    "terminal_voltage_v":   [48.2,  48.1,  47.9,  "..."],
    "current_density_acm2": [0.62,  0.63,  0.64,  "..."],
    "efficiency_pct":       [57.8,  57.5,  57.1,  "..."]
  },

  "kpi": {
    "total_h2_produced_kg":          142.5,
    "total_h2_consumed_kg":          38.2,
    "total_energy_consumed_kwh":     5210.0,
    "overall_system_efficiency_pct": 32.4,
    "specific_energy_kwh_kg":        36.6,
    "peak_h2_production_kg_h":       0.89,
    "avg_electrolyzer_load_pct":     61.3,
    "capacity_factor_pct":           61.3
  }
}
```

### 3.1 Response Field Reference

#### `time_s` (array)
Simulation time axis in seconds. Length = `floor(t_end_s / dt_s) + 1`.

#### `electrolyzer` (per-step arrays)

| Field | Unit | Description |
|---|---|---|
| `power_in_kw` | kW | Actual AC power consumed this step |
| `h2_production_nm3h` | Nm³/h | Volumetric H₂ production rate, referenced to 0 °C / 1 atm |
| `h2_production_kg_h` | kg/h | Mass production rate |
| `efficiency_pct` | % | Instantaneous efficiency (HHV basis) |
| `stack_temperature_c` | °C | Stack temperature (optional — omit if not modelled) |

#### `compressor` (per-step arrays)

| Field | Unit | Description |
|---|---|---|
| `power_consumed_kw` | kW | Electrical power consumed |
| `outlet_pressure_bar` | bar | Delivered pressure to storage |

#### `storage` (per-step arrays)

| Field | Unit | Description |
|---|---|---|
| `pressure_bar` | bar | Instantaneous vessel pressure |
| `soc_pct` | % | State-of-charge `[0, 100]` |
| `h2_mass_kg` | kg | Total hydrogen mass in vessel |

#### `fuel_cell` (per-step arrays)

| Field | Unit | Description |
|---|---|---|
| `power_output_kw` | kW | Net AC electrical output |
| `h2_consumed_nm3h` | Nm³/h | Hydrogen consumed this step |
| `terminal_voltage_v` | V | Stack terminal voltage |
| `current_density_acm2` | A/cm² | Current density at MEA |
| `efficiency_pct` | % | Instantaneous efficiency (LHV basis) |

#### `kpi` (scalar aggregates)

| Field | Unit | Description |
|---|---|---|
| `total_h2_produced_kg` | kg | Integral of `electrolyzer.h2_production_kg_h` over simulation |
| `total_h2_consumed_kg` | kg | Integral of `fuel_cell.h2_consumed_nm3h` × 0.0899 kg/Nm³ |
| `total_energy_consumed_kwh` | kWh | Total ELZ + compressor energy consumed |
| `overall_system_efficiency_pct` | % | `(FC energy out) / (ELZ energy in) × 100` |
| `specific_energy_kwh_kg` | kWh/kg | `total_energy_consumed_kwh / total_h2_produced_kg` |
| `peak_h2_production_kg_h` | kg/h | Maximum instantaneous production rate |
| `avg_electrolyzer_load_pct` | % | Mean of `(power_in_kw / capacity_kw) × 100` (non-zero steps) |
| `capacity_factor_pct` | % | Fraction of steps where ELZ was active |

---

## 4. Async Job Endpoints (unchanged from v1)

```
GET  /api/health
GET  /api/hydrogen/status/{job_id}
GET  /api/hydrogen/result/{job_id}
```

> **Health endpoint path:** The canonical path is `/api/health`.  
> The client also probes `/api/hydrogen/health` and `/health` as fallbacks, so any
> of these three will work. Return **HTTP 200** with the JSON body below — do **not**
> return 500 when the engine is initialising; use `engine_ready: false` instead.

`/api/health` response (HTTP 200 always, even when MATLAB is not yet ready):
```json
{
  "engine_ready": true,
  "engine_error": null,
  "active_jobs": 0
}
```

When the MATLAB engine is still starting up, return:
```json
{
  "engine_ready": false,
  "engine_error": "MATLAB engine initialising…",
  "active_jobs": 0
}
```

Job status object:
```json
{
  "job_id": "abc-123",
  "status": "running",
  "progress_pct": 42.0,
  "error": null,
  "result": null
}
```
When `status == "done"`, `result` contains the full response body from §3.

WebSocket (optional fallback):
```
WS /api/hydrogen/ws/{job_id}
```
Server pushes `{ "type": "progress", "progress_pct": 60.0 }` then the final result as `{ "type": "result", "result": { ... } }`.

---

## 5. Enumerated Values

### `source.tech_type`
| Value | MATLAB generator block |
|---|---|
| `solar` | Gaussian daily irradiance profile (peak ≈ 12:30) |
| `wind` | Weibull-shaped stochastic profile |
| `nuclear` | Near-constant baseload (≈ 90 % CF, slow ramp) |
| `hydro` | Dual-peak (morning dispatch / evening dispatch) |
| `gas` | Dispatchable — follow demand signal |
| `coal` | Slow-ramping baseload |
| `biomass` | Slow-ramping baseload |
| `geothermal` | Near-constant (≈ 90 % CF) |
| `generic` | Flat at `capacity_kw` |

> The `source.profile` array **always overrides** any tech-type-based generation model. The `tech_type` field is provided as metadata for the MATLAB workspace (logging, block labelling) only.

### `electrolyzer.tech_type`
| Value | Efficiency curve notes |
|---|---|
| `pem` | Relatively flat 40–100 % load; fast dynamics |
| `alkaline` | Drops sharply below ~40 % load; slow dynamics |
| `soec` | High temperature; only stable above ~30 % load |
| `aem` | Similar to PEM; emerging — use PEM curve as fallback |

### `compressor.tech_type`
| Value |
|---|
| `reciprocating` |
| `ionic` |
| `linear` |

### `storage.tech_type`
| Value |
|---|
| `compressed_h2` |
| `liquid_h2` |
| `metal_hydride` |
| `cavern` |

### `fuel_cell.tech_type`
| Value | Efficiency notes |
|---|---|
| `pem` | ~50–60 % LHV; standard polarisation curve |
| `sofc` | ~55–65 % LHV; high temperature |
| `mcfc` | ~50–60 % LHV; molten carbonate |
| `pafc` | ~40–50 % LHV; phosphoric acid |
| `alkaline` | ~50–60 % LHV; legacy tech |

---

## 6. Value Chain — Signal Flow

```
source.profile [power_kw]
      │
      ▼  (clipped to ELZ capacity & min load)
┌─────────────┐   power_in_kw       ┌────────────┐   h2_production_kg_h
│ electrolyzer│ ─────────────────▶  │ compressor │ ──────────────────▶
└─────────────┘                     └────────────┘
                                          │ outlet_pressure_bar
                                          ▼
                                    ┌─────────────┐
                                    │   storage   │ ◀─── initial_soc_pct
                                    └─────────────┘
                                          │ pressure_bar
                                          ▼
                                    ┌─────────────┐   power_output_kw
                                    │  fuel_cell  │ ─────────────────▶  grid / load
                                    └─────────────┘
```

---

## 7. Backward Compatibility

The client (`normalizeSimResult` in `h2SimPayload.js`) can consume **either** the nested v2 response (§3) or the old flat v1 response. MATLAB may return both at the same time:

```json
{
  "electrolyzer": { "power_in_kw": [...], "..." },
  "electrolyzer_power_kw": [...],
  "h2_production_nm3h": [...],
  "tank_pressure_bar": [...],
  "fc_terminal_voltage_v": [...],
  "fc_current_density_acm2": [...],
  "fc_power_output_kw": [...]
}
```
If only the nested form is returned, the client normalises automatically. The flat aliases will be removed in a future version once migration is complete.

---

## 8. Example — Minimal Request (PEM + Solar, 1 h sim)

```json
{
  "schema_version": "2.0",
  "simulation": { "t_end_s": 3600, "dt_s": 60 },
  "source": {
    "tech_type": "solar",
    "name": "100 kW Rooftop PV",
    "capacity_kw": 100,
    "efficiency_pct": null,
    "profile": [
      { "time_s": 0,    "power_kw": 0   },
      { "time_s": 600,  "power_kw": 12  },
      { "time_s": 1200, "power_kw": 38  },
      { "time_s": 1800, "power_kw": 71  },
      { "time_s": 2400, "power_kw": 88  },
      { "time_s": 3000, "power_kw": 94  },
      { "time_s": 3600, "power_kw": 91  }
    ]
  },
  "electrolyzer": {
    "tech_type": "pem",
    "name": null,
    "capacity_kw": 80,
    "nominal_efficiency_pct_hhv": 70,
    "min_load_pct": 5,
    "max_load_pct": 100,
    "operating_temperature_c": 80,
    "water_flow_rate_lpm": 7.2,
    "h2_hhv_kwh_per_kg": 39.4
  },
  "compressor": {
    "tech_type": "reciprocating",
    "name": null,
    "isentropic_efficiency_frac": 0.78,
    "inlet_pressure_bar": 30,
    "target_pressure_bar": 350
  },
  "storage": {
    "tech_type": "compressed_h2",
    "name": null,
    "max_pressure_bar": 350,
    "min_pressure_bar": 20,
    "initial_soc_pct": 20,
    "round_trip_efficiency_pct": 99
  },
  "fuel_cell": {
    "tech_type": "pem",
    "name": null,
    "rated_power_kw": 50,
    "nominal_efficiency_pct": 58,
    "min_load_pct": 10,
    "h2_flow_rate_nm3h": 4.0,
    "operating_pressure_bar": 2.5,
    "cooling_capacity_kw": 4.0
  }
}
```

---

## 9. Python Pydantic Models (FastAPI bridge)

Drop these models into the bridge to get automatic request validation:

```python
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class SimulationParams(BaseModel):
    t_end_s: float = Field(..., gt=0, description="Simulation horizon [s]")
    dt_s: float    = Field(..., gt=0, description="Time-step [s]")


class ProfilePoint(BaseModel):
    time_s: float
    power_kw: float


class SourceParams(BaseModel):
    tech_type: Literal["solar","wind","nuclear","hydro","gas","coal","biomass","geothermal","generic"]
    name: Optional[str] = None
    capacity_kw: Optional[float] = Field(None, ge=0)
    efficiency_pct: Optional[float] = Field(None, ge=0, le=100)
    profile: list[ProfilePoint]


class ElectrolyzerParams(BaseModel):
    tech_type: Literal["pem","alkaline","soec","aem"]
    name: Optional[str] = None
    capacity_kw: float              = Field(..., gt=0)
    nominal_efficiency_pct_hhv: float = Field(..., gt=0, le=100)
    min_load_pct: float             = Field(..., ge=0, le=100)
    max_load_pct: float             = Field(100, ge=0, le=100)
    operating_temperature_c: float  = Field(..., ge=0)
    water_flow_rate_lpm: float      = Field(..., ge=0)
    h2_hhv_kwh_per_kg: float        = Field(39.4)


class CompressorParams(BaseModel):
    tech_type: Literal["reciprocating","ionic","linear"]
    name: Optional[str] = None
    isentropic_efficiency_frac: float = Field(..., gt=0, le=1)
    inlet_pressure_bar: float         = Field(..., gt=0)
    target_pressure_bar: float        = Field(..., gt=0)


class StorageParams(BaseModel):
    tech_type: Literal["compressed_h2","liquid_h2","metal_hydride","cavern"]
    name: Optional[str] = None
    max_pressure_bar: float           = Field(..., gt=0)
    min_pressure_bar: float           = Field(..., ge=0)
    initial_soc_pct: float            = Field(..., ge=0, le=100)
    round_trip_efficiency_pct: float  = Field(..., gt=0, le=100)


class FuelCellParams(BaseModel):
    tech_type: Literal["pem","sofc","mcfc","pafc","alkaline"]
    name: Optional[str] = None
    rated_power_kw: Optional[float]   = Field(None, ge=0)
    nominal_efficiency_pct: float     = Field(..., gt=0, le=100)
    min_load_pct: float               = Field(..., ge=0, le=100)
    h2_flow_rate_nm3h: float          = Field(..., ge=0)
    operating_pressure_bar: float     = Field(..., ge=0)
    cooling_capacity_kw: float        = Field(..., ge=0)


class SimulationRequest(BaseModel):
    schema_version: Literal["2.0"]
    simulation: SimulationParams
    source: SourceParams
    electrolyzer: ElectrolyzerParams
    compressor: CompressorParams
    storage: StorageParams
    fuel_cell: FuelCellParams
```

---

## 10. MATLAB Workspace Variable Mapping

When the FastAPI bridge passes the decoded request to MATLAB (via `eng.workspace` or a `.mat` file), use the following naming:

```matlab
% simulation
t_end  = params.simulation.t_end_s;        % [s]
dt     = params.simulation.dt_s;           % [s]
t      = (0 : dt : t_end)';               % time vector

% source profile  ──  use directly, do NOT regenerate from tech_type
P_source = [params.source.profile.power_kw]';  % [kW], length = numel(t)

% electrolyzer
ELZ.P_rated   = params.electrolyzer.capacity_kw;               % [kW]
ELZ.eta_hhv   = params.electrolyzer.nominal_efficiency_pct_hhv / 100;
ELZ.P_min     = params.electrolyzer.min_load_pct / 100 * ELZ.P_rated;
ELZ.T_op      = params.electrolyzer.operating_temperature_c;   % [°C]
ELZ.q_water   = params.electrolyzer.water_flow_rate_lpm;       % [L/min]
ELZ.HHV       = params.electrolyzer.h2_hhv_kwh_per_kg;        % [kWh/kg]

% compressor
CMP.eta_isen  = params.compressor.isentropic_efficiency_frac;
CMP.p_in      = params.compressor.inlet_pressure_bar;          % [bar]
CMP.p_target  = params.compressor.target_pressure_bar;         % [bar]

% storage
STG.p_max     = params.storage.max_pressure_bar;               % [bar]
STG.p_min     = params.storage.min_pressure_bar;               % [bar]
STG.soc0      = params.storage.initial_soc_pct / 100;
STG.eta_rt    = params.storage.round_trip_efficiency_pct / 100;

% fuel cell
FC.P_rated    = params.fuel_cell.rated_power_kw;               % [kW]
FC.eta_lhv    = params.fuel_cell.nominal_efficiency_pct / 100;
FC.P_min      = params.fuel_cell.min_load_pct / 100 * FC.P_rated;
FC.q_h2       = params.fuel_cell.h2_flow_rate_nm3h;            % [Nm³/h]
FC.p_op       = params.fuel_cell.operating_pressure_bar;       % [bar]
FC.Q_cool     = params.fuel_cell.cooling_capacity_kw;          % [kW]
```
