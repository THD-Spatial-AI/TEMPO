# Parameters & Scenarios

**Parameters** control the global settings of the optimization: the time horizon, solver choice, and objective function. **Scenarios** are named sets of parameter overrides that let you run what-if analyses without duplicating the entire model.

---

## Parameters

Navigate to the **Parameters** tab to configure the following:

### Time settings

| Parameter | Description |
|---|---|
| **Start date** | Beginning of the model time horizon (inclusive). Format: `YYYY-MM-DD`. |
| **End date** | End of the model time horizon (inclusive). Format: `YYYY-MM-DD`. |
| **Time resolution** | Step size as a pandas offset string: `1H` (hourly), `30min`, `1D`, etc. |

!!! tip "Reducing model size"
    For exploratory runs use a short time horizon (e.g. one week at hourly resolution). Scale to a full year only when the model structure is validated.

### Solver settings

| Parameter | Default | Description |
|---|---|---|
| **Solver** | `glpk` | LP solver backend. Options: `glpk`, `gurobi`, `cplex`, `cbc`. The selected solver must be installed in the Python environment. |
| **Solver options** | *(none)* | Key-value pairs passed directly to the solver (e.g. `mipgap: 0.01`). |
| **Verbosity** | `True` | When enabled, solver progress is written to the run log. |

### Objective function

| Parameter | Default | Description |
|---|---|---|
| **Objective** | `minize_cost` | Calliope objective function. Leave as default unless you have a custom objective defined in the override block. |

---

## Scenarios

Scenarios apply a named set of parameter overrides on top of the base model at run time. They are the Calliope way of exploring different assumptions without maintaining separate model files.

### Creating a scenario

1. Go to the **Scenarios** tab.
2. Click **Add Scenario**.
3. Give it a name (e.g. `high_carbon_price`).
4. Add one or more overrides — each override is a dot-separated Calliope parameter path and a new value:

```
techs.gas_ccgt.costs.monetary.cost_om_prod = 0.08
techs.solar_pv.costs.monetary.cost_energy_cap = 400
```

5. Click **Save**.

### Running a specific scenario

In the **Run** screen, select the scenario from the **Scenario** dropdown before clicking Start. If no scenario is selected, the base model parameters are used.

---

## Overrides

The **Overrides** tab provides a raw YAML text editor for injecting arbitrary Calliope override blocks. This is intended for advanced users who need to express model features not exposed in the UI forms.

The content of this block is appended verbatim to the exported YAML under the `overrides` key. Invalid YAML will cause the export and the run to fail.
