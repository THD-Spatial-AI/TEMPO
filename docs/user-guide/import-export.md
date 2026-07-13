# Import & Export

TEMPO can import location/link data from CSV files, import full model archives from other frameworks, and export the active model to any supported format.

---

## Bulk import (CSV)

The Bulk Import screen populates a model with many locations and links at once.

### Importing locations

1. Go to **Bulk Import** in the sidebar.
2. Download the `locations_template.csv` file.
3. Fill it in. Required columns:

| Column | Description |
|---|---|
| `name` | Unique location identifier (no spaces) |
| `lat` | Latitude in decimal degrees (WGS84) |
| `lon` | Longitude in decimal degrees (WGS84) |
| `display_name` | *(optional)* Label shown on the map |
| `available_area` | *(optional)* Area in km² |

4. Upload the file, review the preview, then click **Import Locations**.

### Importing links

Same procedure with `links_template.csv`. Required columns:

| Column | Description |
|---|---|
| `from` | Name of the source location (must exist) |
| `to` | Name of the destination location (must exist) |
| `carrier` | Energy carrier (e.g. `electricity`) |
| `distance` | *(optional)* Distance in km |
| `efficiency` | *(optional)* One-way efficiency (0–1) |

---

## Framework archive import (PyPSA / OSeMOSYS / AdOpT-NET0)

TEMPO can import ZIP archives exported from other energy modelling frameworks. The archive format is detected automatically from the file listing — no manual selection required.

**Supported formats:**

| Format | Detection signal |
|---|---|
| PyPSA | `model.nc` or `buses.csv` in the archive |
| OSeMOSYS (otoole) | `SpecifiedAnnualDemand.csv` + `TECHNOLOGY.csv` + `REGION.csv` |
| AdOpT-NET0 | `Topology.json` + `ConfigModel.json` |
| Calliope 0.6 / 0.7 | `model.yaml` → opens the YAML importer |

**How to import:**

1. Navigate to **Models** in the sidebar.
2. Click **Import Archive** and select a ZIP file.
3. TEMPO translates the archive through the engine's Python service (the service must be running — see Settings).
4. A new model is created and selected automatically.
5. A translation report lists any parameters that were approximated or dropped.

**Multi-dataset archives:** if the ZIP contains multiple top-level subdirectories (e.g. `base/`, `scenario_a/`, `scenario_b/`), each directory is imported as a separate model. The notification and report list how many models were created.

!!! note "Engine services must be running"
    The PyPSA, OSeMOSYS, and AdOpT-NET0 import flows route through the corresponding Python service. Install the service from **Settings → \<Engine\> Engine** before importing.

---

## Calliope YAML import

To import a Calliope 0.6.8 or 0.7 model archive:

1. In **Models**, click **Import Archive** and select the ZIP.
2. If the archive contains `model.yaml`, TEMPO opens the YAML importer automatically.
3. The importer reads the YAML tree and creates locations, technologies, and links.

---

## Export formats

Navigate to **Export** in the sidebar. Select a format, then click **Export ZIP**.

### Calliope 0.6.8

Exports the standard nested folder layout:

```
model/
  model.yaml              # root import manifest
  model_config/
    locations/locations.yaml
    links/transmission_links.yaml
    techs/techs_supply.yaml  (+ demand, storage, transmission, conversion)
  scenarios/
    overrides.yaml
    scenarios.yaml
  timeseries_data/        # uploaded CSV files
```

Run with `calliope run model.yaml`.

### Calliope 0.7 (experimental)

Exports the flat single-file layout used by Calliope 0.7:

```
model/
  model.yaml              # config + techs + nodes + data_tables refs
  demand_profiles.csv
  <additional timeseries>.csv
```

### PyPSA

Requires the **PyPSA engine** (Settings → PyPSA Engine).

```
model/
  base/
    model.nc              # pypsa.Network netCDF
    csv/                  # buses, generators, lines, … as CSV
  <scenario_name>/        # one folder per defined scenario (if any)
  report.txt
```

Loadable with `pypsa.Network("base/model.nc")`.

### OSeMOSYS (otoole)

Requires the **OSeMOSYS engine** (Settings → OSeMOSYS Engine).

```
model/
  base/
    REGION.csv
    TECHNOLOGY.csv
    FUEL.csv
    YearSplit.csv
    CapitalCost.csv       # (+ ~17 more parameter CSVs)
    SpecifiedAnnualDemand.csv
    …
  <scenario_name>/        # one folder per defined scenario (if any)
  report.txt
```

Compatible with `otoole convert csv datafile`.

### AdOpT-NET0

Requires the **AdOpT-NET0 engine** (Settings → AdOpT-NET0 Engine).

```
model/
  base/
    Topology.json
    ConfigModel.json
    NodeLocations.csv
    period1/
      network_data/
      node_data/          # one folder per location
  report.txt
```

---

## Scenarios in exports

When the active model has scenarios defined (in the **Scenarios** screen), non-Calliope exports (PyPSA, OSeMOSYS, AdOpT-NET0) include one dataset per scenario alongside the base dataset. Each scenario is pre-resolved on the frontend before being sent to the translation service: override keys such as `model.subset_time`, `techs.<t>.constraints.<param>`, and `locations.<l>.techs.<t>.constraints.<param>` are applied directly to the model.

Calliope exports include scenarios via the `scenarios/` and `overrides/` YAML files — the Calliope runner applies them natively.

---

## Example network templates

Several example models ship with the application as pre-filled CSV files in `public/templates/`:

| File set | Description |
|---|---|
| `locations_template.csv` / `links_template.csv` | Blank starter templates |
| `european_locations.csv` / `european_links.csv` | Major European nodes and interconnections |
| `usa_locations.csv` / `usa_links.csv` | US regional transmission zones |
| `chilean_energy_grid/` | Chilean national grid |
