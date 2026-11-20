# Creating a Model

A **model** in TEMPO is the top-level container for all the components of an energy system: locations, links, technologies, time series, parameters, and scenarios. All data is saved automatically to the local database as you work.

---

## Creating a new model

1. Click **New Model** from the home screen or the model selector in the top navigation.
2. Enter:
    - **Name** (required) — a short identifier used in the sidebar and in the exported YAML filename.
    - **Description** (optional) — a human-readable summary that appears in the model list and in the exported YAML header.
3. Click **Create**. The model is saved immediately and you are taken to the editor.

---

## Model checks

TEMPO checks the model for missing or broken pieces before an engine sees it. Each issue has one of three levels:

| Level | What it means | Effect on a run |
|---|---|---|
| **Critical** | The model cannot run: no locations, no technologies, an invalid date range, two locations with the same name, or links to missing locations | Blocks the run |
| **Error** | The engine will probably run, but the results may not reflect your system | Run asks you to confirm with **Run anyway** |
| **Warning** | Worth a look, nothing is wrong yet | Never blocks |

Where you see the checks:

- **Model check** in the sidebar shows a count for the loaded model. Click it to open a drawer with every issue.
- Every item has a **Fix** link. It opens the page for that entity and highlights the row, field or technology. Problems with a place on the map open the Map View, fly to the location and ring it.
- Locations, links and technologies with issues carry a marker in their lists, and the Map View badges locations.
- **Creation** checks the draft as you work. An empty new model shows a short checklist of what to add first. The Save dialog lists open problems and never blocks saving, so you can save and finish later.
- **Ignore** hides a warning for this model. Ignored warnings stay in the list under a separate heading, where you can restore them.
- **Run**: the *Model check* card lists the issues for the selected model, and for each selected scenario with its overrides applied. *Check what <engine> supports* asks the selected engine which features its translation approximates or drops.

Besides the lists below, TEMPO checks lifetimes, capacity bounds, efficiencies, storage, carriers and the model unit. Calliope 0.6.8 refuses capacity costs without a lifetime, and the check says so. A reservoir with no inflow is flagged unless something else, such as weather-driven supply, feeds it.

Errors (these ask for confirmation, except the critical ones above): no locations or technologies, no demand technology assigned to any location and no location demand profile, nothing producing the demanded carrier, a demand with no profile, no `file=` resource and no numeric resource (0 counts; on a scenario or override run this is only a warning), a demand time series that is not in the model, links to missing locations or to themselves, duplicate location names, an invalid date range.

Warnings: technologies listed on a location but not defined (engines skip them; hub labels such as substation are ignored), locations without coordinates or without anything on them, technologies assigned nowhere, links whose transmission technology is missing or undefined (Calliope 0.6 creates a default line; the other engines skip the link), no costs at all, solar/wind/hydro without a resource series, a location whose demand nothing local or linked can serve, a network split into islands, a non-demand time series missing (technologies assigned nowhere are checked too), time series not covering the model period.

A location demand profile counts as demand even if the location lists no demand technology: the engines place every defined demand technology there.

Time-series coverage: a series must reach the end of the last model day. Timestamps are read as UTC, and series whose timestamps are not ISO dates are not checked.

---

## Switching between models

The **model selector** in the top navigation bar shows the currently active model. Click it to open the model list. Clicking a model name switches the entire editor context to that model. All unsaved edits are auto-saved before switching.

---

## Duplicating a model

From the model list, click the **⋯** menu next to any model and choose **Duplicate**. This creates a complete copy, including all locations, links, technologies, and parameters. Useful for creating scenario variants without starting from scratch.

---

## Deleting a model

From the model list, click **⋯** → **Delete**. This action is permanent. The model is removed from the database and cannot be recovered.

---

## Model state and auto-save

The application auto-saves the entire model state to the backend on every change. There is no explicit save button. The status bar at the bottom of the screen shows the last saved timestamp and a spinner while a save is in progress.

---

## What is stored in a model

| Component | Description |
|---|---|
| **Locations** | Geographic nodes with coordinates, names, and regional metadata |
| **Links** | Directed edges connecting two locations for a given energy carrier |
| **Technologies** | Energy conversion, generation, storage, and demand components assigned to locations |
| **Time series** | CSV files uploaded and linked to technology or demand parameters |
| **Parameters** | Global model settings: time horizon, resolution, objective function, solver options |
| **Scenarios** | Named parameter override sets that can be applied on top of the base model |
| **Overrides** | Low-level YAML override blocks injected directly into the exported configuration |
