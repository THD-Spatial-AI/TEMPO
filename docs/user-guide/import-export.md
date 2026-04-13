# Import & Export

TEMPO can import location and link data from CSV files and export the full model as Calliope-ready YAML files.

---

## Bulk import (CSV)

The Bulk Import screen allows you to populate a model with many locations and links at once.

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

4. Upload the file.
5. Review the preview table.
6. Click **Import Locations** to commit.

### Importing links

Same procedure. Download `links_template.csv`. Required columns:

| Column | Description |
|---|---|
| `from` | Name of the source location (must exist) |
| `to` | Name of the destination location (must exist) |
| `carrier` | Energy carrier (e.g. `electricity`) |
| `distance` | *(optional)* Distance in km |
| `efficiency` | *(optional)* One-way efficiency (0–1) |

!!! warning "Location names"
    Location names in the links CSV must exactly match names already in the model (or being imported in the same batch). Mismatches will cause an import error.

---

## Export to YAML

Navigate to **Export** in the sidebar.

### Single YAML export

Click **Export YAML** to download `model.yaml` — a single Calliope-compliant YAML file that captures the full model configuration. This file can be run with:

```bash
calliope run model.yaml
```

### ZIP export

Click **Export ZIP** to download a ZIP archive containing:

| File | Description |
|---|---|
| `model.yaml` | Main Calliope configuration |
| `timeseries/` | All uploaded CSV time series files |

The ZIP is structured so that `calliope run model.yaml` works immediately after extracting the archive.

---

## Example network templates

Several example models are distributed with the application as pre-filled CSV files in `public/templates/`:

| File set | Description |
|---|---|
| `locations_template.csv` / `links_template.csv` / `parameters_template.csv` | Blank starter templates with correct column headers |
| `european_locations.csv` / `european_links.csv` / `european_parameters.csv` | Major European nodes and HVDC/AC interconnections |
| `european_network/` | Complete European network model folder |
| `usa_locations.csv` / `usa_links.csv` / `usa_parameters.csv` | US regional transmission zones |
| `german_energy_system/` | Multi-sector German system model |
| `chilean_energy_grid/` | Chilean national grid |

Load any of these via Bulk Import to get a pre-populated model skeleton.
