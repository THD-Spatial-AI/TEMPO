# Configuration

Most of the application configuration lives in the **Settings** screen, accessible from the sidebar at any time.

---

## Backend connection

The Go backend starts automatically when you launch the desktop application and listens on `localhost:8082`. This port is not configurable in the desktop build. In development mode you can pass `--port` to the backend binary.

The Settings screen shows a live indicator of the backend connection status. If the backend fails to start (e.g. port already in use), the application shows an error on the setup screen.

---

## Python environment

The Settings screen exposes the Python / conda configuration:

| Setting | Description |
|---|---|
| **Conda executable** | Full path to `conda.exe`. Auto-detected on startup. |
| **Environment** | The conda environment to activate when spawning the Calliope runner. |
| **Python executable** | Resolved automatically from the selected environment. |

Changes take effect immediately for the next solver run. No restart is needed.

---

## GeoServer (optional)

If you have a local GeoServer instance serving pre-processed OSM vector layers, configure its URL here:

| Setting | Default | Description |
|---|---|---|
| **GeoServer URL** | *(empty)* | Base URL, e.g. `http://localhost:8080/geoserver`. |
| **Workspace** | `osm` | GeoServer workspace that contains the OSM layers. |

Leave these empty if you are not using GeoServer. The application falls back to the live Overpass API for OSM infrastructure data.

See [GeoServer Setup](../map/geoserver.md) for instructions on how to set up the local stack.

---

## Map tile provider

The map background uses OpenStreetMap raster tiles by default. The tile URL template can be changed in Settings if you have access to a different tile provider or want to use a local tile server:

```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

---

## Application data location

All application data is stored in the Electron user-data directory:

| File/Folder | Path (Windows) |
|---|---|
| Model database | `%AppData%\Calliope Visualizator\calliope.db` |
| Settings | `%AppData%\Calliope Visualizator\config.json` |
| Installed Miniconda (if used) | `%AppData%\Calliope Visualizator\miniconda3\` |

---

## Resetting the configuration

To reset to defaults, delete `config.json` from the user-data directory and restart the application. The model database is not affected.
