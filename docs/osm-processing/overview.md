# OSM Data Processing — Overview

The `osm_processing/` directory contains a set of Python scripts that form an offline data pipeline for downloading and extracting power infrastructure data from OpenStreetMap. The output is a collection of GeoJSON files that can be loaded into PostGIS and served via GeoServer, or used directly by the application as static files.

---

## When do you need this?

You only need the OSM processing pipeline if:

- You want to load infrastructure layers for large geographic areas (countries, continents) without relying on the live Overpass API.
- You want to set up a local GeoServer instance for offline or repeated use.
- You are building a dataset for research purposes and need reproducible snapshots of the OSM power network.

For small areas and ad hoc exploration, the application fetches data directly from Overpass — no local pipeline needed.

---

## Pipeline stages

```
Geofabrik download   →   OSM PBF files
        ↓
  osmium extract     →   Power-filtered PBF
        ↓
 GeoJSON extraction  →   substations.geojson
                         power_plants.geojson
                         power_lines.geojson
                         boundaries.geojson
        ↓
  PostGIS import     →   Spatial database tables
        ↓
  GeoServer publish  →   WMS / WFS / Vector tiles
```

---

## Scripts

| Script | Purpose |
|---|---|
| `create_folder_structure.py` | Creates the `public/data/countries/` directory tree |
| `create_extract_structure.py` | Mirrors the folder tree under `public/data/osm_extracts/` |
| `download_world_osm.py` | Interactive menu to download OSM PBF files from Geofabrik |
| `extract_osm_region.py` | Extracts power features from a PBF file to GeoJSON |
| `upload_to_postgis.py` | Imports GeoJSON files into a PostGIS database |
| `configure_geoserver.py` | Creates GeoServer layers pointing to PostGIS tables |
| `update_database_for_region.py` | Re-runs extraction and import for a single region |
| `add_region_to_geoserver.py` | Adds a new region to an existing GeoServer instance |

---

## Installation

```bash
cd osm_processing
pip install -r requirements.txt
```

Required packages: `osmium`, `requests`, `tqdm`, `psycopg2-binary`, `geoalchemy2`, `sqlalchemy`.

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
