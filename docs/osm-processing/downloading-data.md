# Downloading GIS Data

TEMPO provides two ways to download and import OSM power infrastructure data into your local GeoServer instance. The recommended approach is the built-in in-app download panel — no terminal required.

---

## Prerequisites

Before downloading data, the GeoServer and PostGIS Docker containers must be running. Run the setup script once if you haven't already:

```powershell
cd scripts
.\setup_geoserver_docker.ps1
```

Then start the containers whenever you work with TEMPO:

```powershell
docker start calliope-postgis calliope-geoserver
```

See [GeoServer Setup](../map/geoserver.md) for the full stack setup.

---

## Method 1 — In-app Download (recommended)

The **Download GIS Data** panel is built into the right sidebar of the Creation map view. It runs the full pipeline (download → extract → PostGIS import → GeoServer publish) in one click and streams the log output live.

### Opening the panel

1. Open any model and navigate to **Creation** from the sidebar.
2. On the right side of the screen, the **OSM Infrastructure** panel is visible. If it is collapsed, click the expand arrow.
3. Click **Download GIS Data** to expand that section.

### Selecting a region

1. **Continent** — select from Europe, Asia, Africa, North America, South America, Central America, or Australia-Oceania.
2. **Country** — the list is populated from the [Geofabrik region database](https://download.geofabrik.de/). All Geofabrik-indexed countries are available.
3. **Region** *(optional)* — for countries with sub-regional extracts (Germany, France, Spain, USA, etc.) you can limit the download to a single state or administrative region. Leave blank to import the whole country.

### Running the download

Click **Download & Import**. The log terminal below the button streams the pipeline output in real time:

```
Python: ...\.venv-calliope\Scripts\python.exe
Script: ...\osm_processing\add_region_to_geoserver.py
Args: Europe Spain Asturias
[Downloader] Fetching https://download.geofabrik.de/europe/spain/asturias-latest.osm.pbf
[Extract]    Processing power features...
[PostGIS]    Uploading substations.geojson → osm_substations
[GeoServer]  Publishing layer osm:osm_substations
Import complete
```

When the log shows **Import complete** or the green "Download complete" message, the region is live. The **Region Selection** stepper at the top of the panel (and the rest of the map) will immediately reflect the newly loaded data.

### Cancelling

Click **Cancel** to abort the pipeline mid-run. Files already written to disk are kept; you can re-run to resume from where the download left off.

---

## Method 2 — Command-line (advanced)

Use the CLI if you need to automate batch downloads, integrate into a CI pipeline, or run on a headless server.

### One-command import

```bash
cd osm_processing
python add_region_to_geoserver.py <Continent> <Country> [Region] [Subregion]
```

**Examples:**

```bash
# Federal state
python add_region_to_geoserver.py Europe Germany Bayern

# Administrative district (fourth-level)
python add_region_to_geoserver.py Europe Germany Bayern Niederbayern

# Country level
python add_region_to_geoserver.py Europe Spain

# Another continent
python add_region_to_geoserver.py South_America Chile Metropolitana
```

### Step-by-step pipeline

For manual control over each stage:

```bash
# 1. Create the directory tree (first time only)
python create_folder_structure.py
python create_extract_structure.py

# 2. Download PBF from Geofabrik
python download_world_osm.py

# 3. Extract power features to GeoJSON
python extract_osm_region.py Europe Germany Bayern

# 4. Upload GeoJSON to PostGIS
python upload_to_postgis.py Europe Germany Bayern

# 5. Publish PostGIS tables as GeoServer layers
python configure_geoserver.py
```

### Python environment

The CLI scripts must run inside the `.venv-calliope` environment:

```powershell
.\.venv-calliope\Scripts\Activate.ps1
cd osm_processing
pip install -r requirements.txt
```

---

## Available regions

The full region index is in `osm_processing/geofabrik_regions_database.json`. Countries with sub-regional extracts:

| Country | Sub-regions |
|---|---|
| Germany | 16 federal states (Bayern, Berlin, NRW…) |
| France | Historical regions (Alsace, Bretagne, Île-de-France…) |
| Spain | Autonomous communities (Asturias, Cataluña, Madrid…) |
| United Kingdom | England, Scotland, Wales |
| United States | 50 states + DC + territories |
| Canada | 13 provinces and territories |
| Brazil | 5 macro-regions |
| China | 33 provinces / municipalities |
| Russia | 9 federal districts |

All other countries are available at country level only.

---

## Disk space reference

| Region | Approximate PBF size |
|---|---|
| Small district (e.g. Niederbayern) | ~80 MB |
| German federal state (e.g. Bayern) | ~600 MB |
| Full country (e.g. Spain) | ~2 GB |
| Full country (e.g. Germany) | ~4 GB |
| Full planet | ~75 GB |

!!! warning "Planet file"
    Do not attempt a full planet download unless you need global coverage. Use continent or country extracts instead.
