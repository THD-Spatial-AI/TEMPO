# GeoServer Setup

GeoServer is an optional component that provides pre-processed OSM vector tile layers served from a local PostGIS database. It is recommended for country-scale or repeated analysis where the public Overpass API is too slow.

---

## Prerequisites

- **Docker Desktop** installed and running.
- At least **20 GB** of free disk space for a full country's OSM data.
- The OSM data processing scripts from `osm_processing/` — see [Downloading OSM Data](../osm-processing/downloading-data.md).

---

## Setup with Docker

The project includes a PowerShell setup script that pulls the required Docker containers and configures them automatically.

```powershell
cd scripts
.\import_osm_docker.ps1 -Region Europe/Germany
```

This script:

1. Pulls and starts a `postgis/postgis` container.
2. Pulls and starts a `kartoza/geoserver` container.
3. Creates the `osm` database and schema in PostGIS.
4. Calls `osm_processing/upload_to_postgis.py` to import the OSM power infrastructure GeoJSON files.
5. Calls `osm_processing/configure_geoserver.py` to publish the PostGIS tables as WFS/WMS layers.

The script accepts a `-Region` parameter specifying which continent/country data to import. Run it once per region.

---

## Configuring the application

After the containers are running:

1. Open **Settings** in Calliope Visualizator.
2. Set **GeoServer URL** to `http://localhost:8080/geoserver`.
3. Set **Workspace** to `osm` (the default workspace created by the setup script).
4. Close Settings. The next time you open the OSM Infrastructure Panel, the application will use GeoServer instead of the Overpass API.

---

## Starting and stopping the containers

```powershell
# Start
docker start calliope-postgis calliope-geoserver

# Stop
docker stop calliope-geoserver calliope-postgis
```

Add these to your startup sequence or create a scheduled task if you want the services to start automatically with Windows.

---

## Verifying the setup

Open a browser and go to `http://localhost:8080/geoserver/web`. Log in with the default credentials (`admin` / `geoserver`). In the **Layer Preview** section you should see layers named `osm:substations`, `osm:power_plants`, `osm:power_lines`, and `osm:boundaries`.

If any layers are missing, re-run `configure_geoserver.py` with the `--force` flag.
