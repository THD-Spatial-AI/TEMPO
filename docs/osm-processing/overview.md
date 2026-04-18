# OSM Data Processing — Overview

TEMPO includes a full data pipeline for downloading and importing OSM power infrastructure data into a local GeoServer instance. Once imported, infrastructure layers (substations, power plants, transmission lines) are available on the Creation map for any region you have loaded.

---

## Quickest path — in-app download

Open the **Creation** view, expand the **OSM Infrastructure** right sidebar, and click **Download GIS Data**. Select a continent, country, and optionally a sub-region, then click **Download & Import**. The full pipeline runs automatically and streams live log output.

See [Downloading GIS Data](downloading-data.md) for full details.

---

## When do you need the pipeline?

You only need the OSM processing pipeline if:

- You want infrastructure layers for large geographic areas without relying on the live Overpass API.
- You want a local GeoServer instance for offline or repeated use.
- You are building a reproducible research dataset from OSM snapshots.

For small areas and ad hoc exploration, the application fetches data directly from the live Overpass API — no pipeline or Docker setup needed.

---

## Pipeline stages

```
 In-app UI / CLI
      │
      ▼
 Geofabrik download  ──▶  OSM PBF files
      │                   (public/data/countries/…)
      ▼
 osmium extract      ──▶  Power-filtered PBF
      │
      ▼
 GeoJSON extraction  ──▶  substations.geojson
      │                   power_plants.geojson
      │                   power_lines.geojson
      │                   boundaries.geojson
      ▼
 PostGIS import      ──▶  Spatial database tables
      │
      ▼
 GeoServer publish   ──▶  WMS / WFS / Vector tiles
```

---

## Scripts

| Script | Purpose |
|---|---|
| `add_region_to_geoserver.py` | **Main entry point** — runs the full pipeline for one region. Called by the in-app download UI. |
| `create_folder_structure.py` | Creates the `public/data/countries/` directory tree |
| `create_extract_structure.py` | Creates the `public/data/osm_extracts/` directory tree |
| `download_world_osm.py` | Downloads OSM PBF files from Geofabrik (interactive or CLI) |
| `extract_osm_region.py` | Extracts power features from a PBF file to GeoJSON |
| `upload_to_postgis.py` | Imports GeoJSON files into PostGIS |
| `configure_geoserver.py` | Creates/updates GeoServer layers pointing to PostGIS tables |
| `update_database_for_region.py` | Re-runs extraction and import for a single region |

---

## Installation

The scripts require Python packages from `osm_processing/requirements.txt`. Install them into the `.venv-calliope` environment (the same one used by the in-app pipeline):

```powershell
.\.venv-calliope\Scripts\Activate.ps1
cd osm_processing
pip install -r requirements.txt
```

Required packages: `osmium`, `requests`, `tqdm`, `psycopg2-binary`, `shapely`, `geopandas`, `pyproj`, `pandas`, `geojson`, `numpy`.

---

## Data storage structure

```
public/data/
├── countries/
│   └── Europe/
│       └── Germany/
│           └── Bayern/
│               └── niederbayern-latest.osm.pbf
└── osm_extracts/
    └── Europe/
        └── Germany/
            └── Bayern/
                ├── niederbayern_substations.geojson
                ├── niederbayern_power_plants.geojson
                ├── niederbayern_power_lines.geojson
                └── niederbayern_boundaries.geojson
```

