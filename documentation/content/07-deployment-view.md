# Deployment View

## Desktop Deployment (Primary)

The standard distribution is a Windows NSIS installer produced by `electron-builder`. After installation the user has a single application directory containing:

- The Electron host executable and its V8 snapshot resources.
- The compiled React frontend bundle inside the Electron ASAR archive.
- The compiled Go backend binary (`backend-go/backend.exe`) in an `asar.unpacked` directory so it can be executed by the OS.
- The Python runner script (`python/calliope_runner.py`) also in `asar.unpacked`.

At runtime the process topology is:

- **Electron main process** (1 instance) -- manages the window and child processes.
- **Electron renderer process** (1 instance) -- the React frontend running in a Chromium BrowserWindow.
- **Go backend process** (1 instance) -- HTTP server on `localhost:8082`.
- **Calliope runner service** (1 instance) -- FastAPI HTTP service on `localhost:5000`, started separately via `python/calliope_service.py` or Docker.

All network communication between Electron and the Go backend is confined to the loopback interface. No ports are exposed externally.

The SQLite database file is stored in the system user-data directory (`%APPDATA%/TEMPO/calliope.db` on Windows), which persists across application updates.

## Development Deployment

During development, the frontend and backend run independently:

- `npm run dev` starts the Vite development server on `http://localhost:5173`.
- The Go backend is compiled and started manually with `go run .` or a pre-built binary.
- `npm run dev:electron` uses `concurrently` and `wait-on` to start both the Vite server and Electron together.
- The Calliope runner service is started separately: either with `uvicorn python.calliope_service:app --port 5000` or via `docker compose up calliope-runner`.

## Calliope Runner Service (Docker)

The `docker-compose.yml` defines a `calliope-runner` container that runs the FastAPI optimization service:

- **Image**: built from `Dockerfile` at the project root.
- **Port**: `5000:5000` (host:container).
- **Healthcheck**: polls `http://localhost:5000/health` every 10 seconds.
- **Configuration**: the `OEO_API_URL` environment variable can point the container at a running OEO Technology Database API instance.

The Go backend's `config.yaml` must set `calliope.url: "http://localhost:5000"` (the default) to reach this service.

## GeoServer / PostGIS Deployment (Optional)

For institutions that want to serve pre-processed OSM infrastructure layers from a local server, an optional Docker-based stack provides PostGIS and GeoServer. The setup script `scripts/setup_geoserver_docker.ps1` automates the import of OSM PBF files into PostGIS and the configuration of GeoServer layers. GeoServer is exposed on host port **8080**; the Go backend connects to it on `localhost:8081` (configurable in `config.yaml`). The frontend connects to this stack through the GeoServer URL defined in the application settings.
