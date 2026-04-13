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
.\setup_geoserver_docker.ps1 -LoadRegion "Europe/Germany"
```

This script:

1. Pulls and starts a `postgis/postgis` container (port 5432).
2. Pulls and starts a `kartoza/geoserver` container (port 8080).
3. Creates the `osm` database schema in PostGIS.
4. Calls `osm_processing/upload_to_postgis.py` to import the OSM power infrastructure GeoJSON files.
5. Calls `osm_processing/configure_geoserver.py` to publish the PostGIS tables as WFS layers.

The script accepts a `-LoadRegion` parameter specifying which continent/country data to import. Run it once per region. Use `-Reset` to tear down and recreate containers from scratch.

---

## Configuring the application

After the containers are running:

1. Open **Settings** in TEMPO.
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

Open a browser and go to `http://localhost:8080/geoserver/web`. Log in with the default credentials (`admin` / `geoserver`). In the **Layer Preview** section you should see layers named `osm:osm_substations`, `osm:osm_power_plants`, `osm:osm_power_lines`, `osm:osm_communes`, and `osm:osm_districts`.

If any layers are missing, re-run `configure_geoserver.py` from the `osm_processing/` directory.

!!! tip "Backend GeoServer URL"
    The Go backend connects to GeoServer on `http://localhost:8081/geoserver` (configurable in `backend-go/config.yaml`). The browser-accessible web UI uses port 8080. If port 8080 is already in use, the Docker port mapping can be changed in the setup script.

