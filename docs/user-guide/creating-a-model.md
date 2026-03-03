# Creating a Model

A **model** in Calliope Visualizator is the top-level container for all the components of an energy system: locations, links, technologies, time series, parameters, and scenarios. All data is saved automatically to the local database as you work.

---

## Creating a new model

1. Click **New Model** from the home screen or the model selector in the top navigation.
2. Enter:
    - **Name** (required) — a short identifier used in the sidebar and in the exported YAML filename.
    - **Description** (optional) — a human-readable summary that appears in the model list and in the exported YAML header.
3. Click **Create**. The model is saved immediately and you are taken to the editor.

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
