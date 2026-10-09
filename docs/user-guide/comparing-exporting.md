# Comparing & Exporting Results

Once you have more than one run, you can compare them side by side in the Results screen,
then export maps, charts and data for a report or paper.

---

## Comparing runs

In **Results**, switch the toggle at the top from **Single Run** to **Compare Scenarios**.

Pick the runs you want from the run list. The filter box narrows the list by name.
Every completed run is listed, whatever engine produced it, so you can compare a PyPSA run
with a Calliope run.

The comparison has several views:

| View | What it shows |
|---|---|
| **Summary** | A table of KPIs, one column per run, with the best value in each row highlighted |
| **Maps** | Maps of each run next to each other, coloured by demand, unmet demand or the share of demand met |
| **Capacity** | Installed capacity by technology for each run |
| **Generation** | Generation by technology for each run |
| **Costs** | Cost breakdown for each run |
| **Parallel** | Parallel coordinates, one line per run. Drag along an axis to filter runs |
| **Scatter** | Any two KPIs plotted against each other, one dot per run |

With many runs selected, the Parallel and Scatter views stay readable after the table has
become too wide.

The KPIs available in Summary, Parallel and Scatter include:

| KPI | Unit |
|---|---|
| System cost | € |
| LCOE | €/MWh |
| Cost per MW | €/MW |
| Total capacity | MW |
| Total generation | MWh |
| Renewable share of generation | % |
| Renewable share of capacity | % |
| Average capacity factor | % |
| Unmet demand | MWh |
| Net imports | MWh |

Costs are shown with a € sign, but the actual unit is whatever currency your model's cost
data uses.

### Batches from Scenario Studio

Runs started together in [Scenario Studio](scenario-studio.md) also have their own
comparison, in the **Results** strip at the bottom of the studio. If the batch covered more
than one model, it includes a model-by-variant matrix with shaded cells.

---

## Exporting results

Open **Export** in the sidebar and switch the toggle at the top to **Results**.

1. Under **Select Run**, choose the run to export.
2. Click the items you want to include. Click again to leave them out. The panel shows how
   many are selected.
3. Click the download button. TEMPO saves everything as one ZIP file named after the run.

### What you can export

**Data files** (CSV):

| Item | File |
|---|---|
| Summary KPIs | `summary_kpis.csv` |
| Capacities | `capacities.csv` |
| Generation | `generation.csv` |
| Costs by technology | `costs_by_tech.csv` |
| Costs by location | `costs_by_location.csv` |
| Demand by location | `demand_by_location.csv` |
| Unmet demand by location | `unmet_demand.csv` |
| Imports / exports | `imports_exports.csv` |
| Dispatch time series | `dispatch.csv` |

**Raw**: the full result as returned by the engine, in `full_result.json`.

**Charts** (PNG): installed capacity by technology, capacity by location and technology,
generation mix, energy flow (Sankey), capacity factor, system cost by technology, cost by
location and technology, cost per MWh by technology, and dispatch.

**Maps** (SVG): capacity, generation, technology mix, transmission, demand, unmet demand,
and demand met (%). You can preview each map in the panel before exporting it. SVG files
open in Inkscape or Illustrator, so you can restyle them for publication.

By default the data files and the raw JSON are selected. Charts and maps have to be ticked.

---

## Exporting the model

The **Model** side of the same toggle exports the model itself, not its results, for
example as a Calliope ZIP. See [Import & Export](import-export.md).
