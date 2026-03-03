# Quick Start

This guide walks you through building and running a small two-node energy system model from scratch. It takes about 15 minutes.

---

## What you will build

A simple model with two nodes — **City** and **Wind Farm** — connected by a transmission link. The wind farm feeds electricity to the city through a solar PV plant and a battery.

---

## Step 1 — Create a model

1. Click **New Model** on the home screen.
2. Enter a name, e.g. `My First Model`, and an optional description.
3. Click **Create**. The application switches to the model editor.

---

## Step 2 — Add locations

Navigate to the **Locations** tab in the sidebar.

1. Click **Add Location** and fill in:
    - **Name**: `City`
    - **Latitude**: `48.83`
    - **Longitude**: `12.95`
2. Add a second location:
    - **Name**: `Wind Farm`
    - **Latitude**: `49.10`
    - **Longitude**: `12.60`
3. Both nodes appear as markers on the map.

---

## Step 3 — Connect them with a link

Navigate to the **Links** tab.

1. Click **Add Link**.
2. Select `City` as the **From** node and `Wind Farm` as the **To** node.
3. Set **Carrier** to `electricity`.
4. Leave the loss factor at the default (`0.0`).
5. Click **Save**.

A line appears between the two markers on the map.

---

## Step 4 — Add technologies

Navigate to the **Technologies** tab.

1. Click **Add Technology** → select **From template**.
2. Choose `solar_pv` from the renewable templates and assign it to location `City`.
3. Add another: choose `battery` from the storage templates, assign to `City`.
4. Add `wind_onshore` from renewables, assign to `Wind Farm`.
5. Add `demand_electricity` from demand templates, assign to `City`. Set the `demand` parameter to a small value (e.g. `5.0` in your model units).

---

## Step 5 — Set the time horizon

Navigate to **Parameters**.

1. Set **Start date** to `2023-01-01`.
2. Set **End date** to `2023-01-07` (one week is enough for a quick test).
3. Set **Time resolution** to `1H`.

---

## Step 6 — Run the model

1. Click **Run** in the sidebar.
2. Click the **Start optimization** button.
3. The live log window streams output from the Calliope solver. A typical run for this model takes a few seconds.
4. When the log shows `Model solved successfully`, click **View Results**.

---

## Step 7 — Inspect results

The Results screen shows:

- **Capacity** — installed capacity per technology and location.
- **Generation** — hourly generation time series in charts.
- **Costs** — total system costs.

---

## Next steps

- [Managing Locations](../user-guide/locations.md) — coordinates, regions, and bulk import
- [Technologies](../user-guide/technologies.md) — full template library and custom configuration
- [Import & Export](../user-guide/import-export.md) — download the model as YAML or ZIP
