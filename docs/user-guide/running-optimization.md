# Running Optimization

Once a model is configured with locations, technologies, and parameters, you can submit it to the Calliope solver directly from the application.

---

## Pre-run checklist

Before starting a run, verify:

- [ ] At least one location is defined.
- [ ] At least one technology is assigned to a location.
- [ ] The time horizon (Start date / End date) is set in Parameters.
- [ ] Time series files cover the full time horizon if any technology references a time series.
- [ ] The correct Python environment is selected in Settings (the one that has Calliope installed).

---

## Starting a run

1. Navigate to the **Run** screen in the sidebar.
2. (Optional) Select a **Scenario** from the dropdown to apply scenario overrides.
3. Click **Start optimization**.

The application:

1. Sends the model to the Go backend via `POST /api/models/:id/run`.
2. The backend writes a temporary model JSON to disk and spawns the Python runner.
3. The Python runner converts the model to Calliope YAML and calls the Calliope solver.
4. Log output streams back to the Run screen in real time.

---

## Understanding the run log

The log window captures all output from the Calliope solver process. Key messages to look for:

| Message | Meaning |
|---|---|
| `[CALLIOPE] Building model...` | Model YAML is being assembled |
| `[CALLIOPE] Running optimization...` | Solver is active |
| `[CALLIOPE] Model solved successfully` | Solver found a feasible optimum |
| `[CALLIOPE] ERROR: ...` | An error occurred — see the message for details |
| `Solver status: infeasible` | The model constraints have no feasible solution |
| `Solver status: unbounded` | The objective function is unbounded — check cost parameters |

---

## While the solver is running

- You can navigate to other parts of the application while the solver runs. The run log continues to update in the background.
- Click **Stop** to terminate the solver process. Partial results are not saved.

---

## After a successful run

When the run completes, the **View Results** button becomes active. Click it to go directly to the [Results](results.md) screen.

Each run is saved as a job in the backend. You can view previous job outputs by selecting a job from the run history list at the bottom of the Run screen.

---

## Troubleshooting

**The solver is not found**

Check that:
- The correct conda environment is selected in Settings.
- Calliope is installed: `conda activate <env> && python -c "import calliope"`.

**Import error in the log**

A broken Calliope installation often shows as a Python `ImportError`. Reinstall Calliope in the selected environment.

**Infeasible model**

Common causes:
- Demand is not covered — ensure at least one supply technology is assigned to each location with demand.
- Capacity bounds conflict — a `min` capacity greater than `max`.
- Time series values are all zero or negative where positive values are expected.

**Out of memory**

Large models (many locations × many time steps) can exhaust RAM. Reduce the time horizon, increase the time resolution (e.g. from `1H` to `2H`), or use a more efficient solver such as Gurobi.
