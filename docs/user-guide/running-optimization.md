# Running Optimization

Once a model is configured with locations, technologies, and parameters, you can submit it to any supported solver engine directly from the Run screen.

---

## Supported engines

| Engine | Solver | Port | Notes |
|---|---|---|---|
| Calliope 0.6.8 | HiGHS | 5000 (dynamic) | Default; full scenario/override support |
| Calliope 0.7 (experimental) | CBC | 5002 (dynamic) | Opt-in per model; incompatible deps — separate venv |
| PyPSA | HiGHS | 5003 (dynamic) | Install from Settings → PyPSA Engine |
| OSeMOSYS (otoole + GLPK) | GLPK | 5004 (dynamic) | Install from Settings → OSeMOSYS Engine |
| AdOpT-NET0 | HiGHS / Gurobi | 5001 (dynamic) | Install from Settings → AdOpT-NET0 Engine |

All non-Calliope engines must be installed before use. Ports are chosen dynamically at startup via `findFreePort`.

---

## Pre-run checklist

- [ ] At least one location is defined.
- [ ] At least one technology is assigned to a location.
- [ ] The time horizon (Start date / End date) is set on the Run screen (or in the model parameters).
- [ ] Time series files cover the full time horizon if any technology references a time series.
- [ ] The target engine service is running (shown by a green indicator on the Run screen; install from Settings if absent).

---

## Starting a run

1. Navigate to the **Run** screen in the sidebar.
2. Select a **Modeling Framework** (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0).
3. *(Optional)* Select one or more **Scenarios** or **Overrides** from the dropdown.
4. Set the date range and any advanced solver options.
5. Click **Run**.

For **Calliope** runs, scenario and override names are passed to the runner and applied natively from the model's YAML overrides.

For **PyPSA and OSeMOSYS** runs with a scenario selected, the override is resolved on the frontend before sending — the runner receives a fully concrete model with the override already applied.

---

## Understanding the run log

The log window streams output from the solver process in real time. Key messages:

| Message | Meaning |
|---|---|
| `Building model…` | Model is being translated for the engine |
| `Running optimization…` / `glpsol` output | Solver is active |
| `termination_condition: optimal` | Solver found a feasible optimum |
| `termination_condition: infeasible` | No feasible solution exists |
| `ERROR:` | A translation or solver error — read the message |

Resource usage (CPU %, RAM) is shown alongside the log at 10-second intervals when `psutil` is available in the engine venv.

---

## Cancelling a run

Click **Stop** on the running job card. The solver process is terminated; partial results are not saved.

---

## After a successful run

Click **View Results** to open the Results screen for the completed job. Each run is saved to the backend; previous job outputs are accessible from the run history list.

---

## Scenarios and batch runs

Select multiple scenarios or overrides from the dropdown to launch them as parallel jobs in a single click. Each job gets its own log panel. For non-Calliope engines, each scenario is pre-resolved into a concrete model before submission.

!!! note "SPORES mode"
    SPORES (Spatially Explicit Practically Optimal Results) is supported on **Calliope 0.6.8 only**. The Run screen disables SPORES mode when the Calliope 0.7 engine is selected.

---

## Troubleshooting

**Engine service is not running / not installed**

Go to **Settings → \<Engine\> Engine** and click **Install**. Installation downloads the Python venv and required solver binaries to `%APPDATA%/TEMPO/<engine>-venv`.

**Solver status: infeasible**

Common causes:
- Demand is not covered — ensure at least one supply technology is assigned to each location with demand.
- Capacity bounds conflict — a `min` capacity greater than `max`.
- Time series values are all zero where positive values are expected.

**Solver status: unbounded**

No cost is defined for a technology that has unconstrained capacity. Add a capital or operating cost, or add an explicit capacity bound.

**Out of memory**

Large models (many locations × many time steps) can exhaust RAM. Options:
- Reduce the time horizon via Start/End date.
- Use the `3H` or `6H` time resolution override for a quick test run.
- For OSeMOSYS, reduce the timeslice scheme (seasons × dayBlocks) in Advanced Settings.
- Switch to a more memory-efficient solver (HiGHS generally outperforms GLPK on large LPs).

**PyPSA or OSeMOSYS run differs from Calliope**

Formulation differences are expected. Cross-engine objective differences up to ~2–5% (PyPSA) or ~30% (OSeMOSYS/GLPK) are normal due to solver and model-structure differences. Use `scripts/verify_engines.py` to run a reference model on multiple engines and compare within defined tolerances.
