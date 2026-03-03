# Results

After a successful optimization run, the Results screen provides an overview of the solution.

---

## Navigating to results

- From the Run screen, click **View Results** once the solver completes.
- From the sidebar, click **Results** to load the most recent successful run for the active model.

---

## Capacity panel

Shows the installed capacity (in kW or kWh for storage) for each technology at each location.

- **Bar chart view**: compare installed capacities across technologies and locations.
- **Table view**: switch to a sortable table for precise values.
- Results include both `energy_cap` (power capacity) and, for storage technologies, `storage_cap` (energy capacity).

---

## Generation panel

Shows the hourly energy flow time series for each technology and location.

- Select a location from the dropdown to see the generation mix for that node.
- Use the time range selector to zoom into a specific period.
- The stacked area chart shows supply technologies stacked positively and storage charging as a negative contribution.

---

## Costs panel

Shows the total system cost breakdown:

| Component | Description |
|---|---|
| **Capital cost** | Annualised investment cost across all installed capacities |
| **Fixed O&M** | Annual operation and maintenance cost |
| **Variable O&M** | Cost proportional to energy generated |
| **Total** | Sum of all cost components |

Costs are shown in the currency units defined in the Calliope model (typically monetary units per unit of capacity or energy, as specified in the technology's `costs.monetary` block).

---

## Raw results

Click **Download raw results (JSON)** to save the full optimization result as returned by the Calliope Python API. This file contains all decision variable values and is useful for post-processing outside the application.

---

## Limitations

- The Results screen currently shows results for the most recently completed run. A run history is accessible in the Run screen.
- Plotting is limited to the variables listed above. For detailed analysis (e.g. shadow prices, curtailment), use the raw JSON results or load the exported model in a Jupyter notebook with Calliope's Python API.
