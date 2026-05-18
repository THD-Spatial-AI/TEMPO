# TEMPO Codebase Reference

A comprehensive description of every layer, module, service, component, hook, and library in the TEMPO repository.  
Use this document as a single source of truth when onboarding, debugging, or extending the application.

---

## Table of Contents

1. [System overview](#1-system-overview)
2. [Port map](#2-port-map)
3. [Electron wrapper](#3-electron-wrapper)
4. [React frontend](#4-react-frontend)
   - 4.1 [App shell & routing](#41-app-shell--routing)
   - 4.2 [Global state — DataContext](#42-global-state--datacontext)
   - 4.3 [Components — core UI](#43-components--core-ui)
   - 4.4 [Components — model editing](#44-components--model-editing)
   - 4.5 [Components — map](#45-components--map)
   - 4.6 [Components — OSM & GeoServer](#46-components--osm--geoserver)
   - 4.7 [Components — Hydrogen plant](#47-components--hydrogen-plant)
   - 4.8 [Components — CCS chain](#48-components--ccs-chain)
   - 4.9 [Components — UI primitives](#49-components--ui-primitives)
   - 4.10 [Services](#410-services)
   - 4.11 [Hooks](#411-hooks)
5. [Go backend](#5-go-backend)
   - 5.1 [Entry point](#51-entry-point)
   - 5.2 [API routes](#52-api-routes)
   - 5.3 [internal/api](#53-internalapi)
   - 5.4 [internal/models](#54-internalmodels)
   - 5.5 [internal/storage](#55-internalstorage)
   - 5.6 [internal/calliope](#56-internalcalliope)
   - 5.7 [internal/geoserver](#57-internalgeoserver)
   - 5.8 [internal/overpass](#58-internaloverpass)
6. [Python Calliope service](#6-python-calliope-service)
   - 6.1 [calliope_service.py](#61-calliope_servicepy)
   - 6.2 [calliope_runner.py](#62-calliope_runnerpy)
   - 6.3 [adapters/](#63-adapters)
   - 6.4 [services/tech_database.py](#64-servicestech_databasepy)
7. [External simulation services](#7-external-simulation-services)
   - 7.1 [Hydrogen plant service](#71-hydrogen-plant-service)
   - 7.2 [CCS simulation service](#72-ccs-simulation-service)
   - 7.3 [OEO Technology Database API](#73-oeo-technology-database-api)
8. [GeoServer & PostGIS pipeline](#8-geoserver--postgis-pipeline)
9. [OSM processing pipeline](#9-osm-processing-pipeline)
10. [Technology library](#10-technology-library)
11. [Frontend libraries](#11-frontend-libraries)
12. [Build & packaging](#12-build--packaging)
13. [Configuration files](#13-configuration-files)
14. [Data flow diagrams](#14-data-flow-diagrams)

---

## 1. System overview

TEMPO is a multi-process desktop application:

```
 ┌─────────────────────────────────────────────────────────────┐
 │  ELECTRON  (electron/main.cjs)                              │
 │  ┌──────────────────────┐   ┌───────────────────────────┐  │
 │  │  React/Vite renderer │   │  Go REST backend          │  │
 │  │  localhost:5173 (dev)│──▶│  localhost:8082           │  │
 │  │  file:// (packaged)  │   │  SQLite: calliope.db      │  │
 │  └──────────────────────┘   └─────────┬────────┬────────┘  │
 │                                       │        │            │
 │                             ┌─────────▼──┐  ┌──▼────────┐  │
 │                             │ Calliope   │  │ GeoServer │  │
 │                             │ FastAPI    │  │ PostGIS   │  │
 │                             │ port 5000  │  │ port 8081 │  │
 │                             └────────────┘  └───────────┘  │
 └─────────────────────────────────────────────────────────────┘
          optional external services (H₂, CCS, OEO)
```

The three primary processes are:

| Process | Language | Port | Role |
|---|---|---|---|
| React renderer | TypeScript/JSX | 5173 (dev) / `file://` (prod) | UI |
| Go backend | Go | 8082 | REST API, SQLite persistence, job orchestration |
| Calliope runner | Python | 5000 | Optimization engine (FastAPI + Calliope) |

---

## 2. Port map

| Port | Service | Notes |
|---|---|---|
| 5173 | Vite dev server | Dev only |
| 8082 | Go REST backend | Primary API |
| 5000 | Calliope runner (FastAPI) | Docker or local uvicorn |
| 8080 | GeoServer (user-facing) | Docker container |
| 8081 | GeoServer (backend config) | Configured in `config.yaml` |
| 8765 | Hydrogen plant sim service | Optional, external VM/Docker |
| 8766 | CCS simulation service | Optional, external VM/Docker |
| 8000 | OEO Technology Database API | Optional, proxied via `/tech/*` |

---

## 3. Electron wrapper

**Files:** `electron/main.cjs`, `electron/preload.cjs`

### `electron/main.cjs`

The Electron main process responsible for:

- **Window lifecycle** — creates the `BrowserWindow`, sets `webPreferences.preload`, handles fullscreen and tray.
- **Backend spawning** — finds and launches `backend.exe` (or `backend-linux`) with a dynamically selected port; writes a `.backend.pid` file for cleanup.
- **Calliope service** — optionally spawns a local `uvicorn calliope_service` process on port 5000 if the Docker-based runner is not detected.
- **Docker services** — manages Docker containers defined in `docker-compose.yml` (calliope-runner, etc.).
- **IPC handlers** — exposes APIs to the renderer via the context bridge:
  - `getBackendURL()` — returns the actual `http://localhost:<port>` the backend is on.
  - `getCalliopeServiceURL()` — returns the calliope runner URL.
  - File dialogs (`openFileDialog`, `saveFileDialog`).
  - App info (`getVersion`, `getPlatform`).
- **Port detection** — probes ports 8082+ at startup; avoids conflicts with other running applications.
- **Auto-update** — hooks for electron-builder's auto-update mechanism.

### `electron/preload.cjs`

Context bridge script that creates `window.electronAPI`. All renderer code accesses Electron/Node capabilities **only** through this API, keeping the renderer process isolated.

---

## 4. React frontend

**Entry point:** `src/main.jsx` → `src/App.jsx`

Built with **React 19** and **Vite**. All views except `Dashboard` are lazy-loaded (`React.lazy`) to optimise initial paint time.

### 4.1 App shell & routing

**`src/App.jsx`**

- Wraps the entire app in `<DataProvider>`.
- Maintains `selected` state (the currently visible view).
- Implements navigation guards: if the current view is in `EDITING_VIEWS` and `isDirty === true`, a save-before-navigate dialog is shown.
- Global `Ctrl+S` shortcut calls `saveNow()` when a model is loaded and an editing view is active.
- Views: `Dashboard`, `Tutorial`, `Models`, `MapView`, `Creation`, `Locations`, `Links`, `Overrides`, `Scenarios`, `Parameters`, `Technologies`, `TimeSeries`, `Settings`, `Export`, `Run`, `Results`, `SetupScreen`, `HydrogenPlantDashboard`.

**`src/components/Sidebar.jsx`**

Navigation rail on the left. Renders icon buttons for each view. Displays model name and unsaved-changes indicator.

### 4.2 Global state — DataContext

**`src/context/DataContext.jsx`**

A single React Context that holds all mutable model state. Consumed via `useData()`.

| State field | Type | Purpose |
|---|---|---|
| `models` | `Model[]` | All saved models loaded from backend |
| `currentModelId` | `string\|null` | ID of the model being edited |
| `locations` | `Location[]` | Nodes in the current model |
| `links` | `Link[]` | Edges (transmission links) |
| `technologies` | `Technology[]` | Technology instances assigned to locations |
| `timeSeries` | `TimeSeries[]` | Time series data references |
| `overrides` | `object` | Raw YAML override snippets |
| `scenarios` | `Scenario[]` | Named scenario variants |
| `parameters` | `object` | Global Calliope parameters |
| `isDirty` | `boolean` | Unsaved changes flag |

Key behaviours:
- **Auto-save debounce** — a 1.5 s debounce triggers `saveNow()` on every state change when a model is loaded, persisting to the Go backend.
- **LocalStorage fallback** — when the backend is unreachable, models are persisted to `localStorage` (key: `calliopeModels`).
- **Large-field stripping** — `demandProfile`, `resourcePV`, `resourceWind` arrays are removed before persistence (they can reach 88 MB for large models).
- **Notifications** — exposes `showNotification(message, type)` which renders a toast via `<Notification>`.

### 4.3 Components — core UI

| Component | Purpose |
|---|---|
| `Dashboard.jsx` | Home screen. Shows model list with create/open/delete actions. |
| `Models.jsx` | Full model browser with search, sort, duplicate, and delete. |
| `ModelSelector.jsx` | Compact dropdown for switching the active model from any view. |
| `CalliopeModels.jsx` | Manages importing pre-built Calliope YAML examples (Cambridge, etc.). |
| `SetupScreen.jsx` | First-run wizard: tests backend connectivity, GeoServer availability. |
| `Tutorial.jsx` | Interactive step-by-step tutorial for new users. |
| `ModelStructureTutorial.jsx` | Explains the Calliope data model (locations, links, techs, carriers). |
| `Settings.jsx` | App-wide settings: backend URL, GeoServer URL, solver, theme. |
| `Notification.jsx` | Animated toast notification (success / error / info). Uses Framer Motion. |
| `ErrorBoundary.jsx` | React error boundary wrapping the entire app. |
| `PrivacyDialog.jsx` | GDPR/privacy notice shown on first run. |

### 4.4 Components — model editing

| Component | Purpose |
|---|---|
| `Locations.jsx` | Table of all locations in the model. Add, edit, remove. |
| `LocationEditDialog.jsx` | Modal dialog for editing a single location (name, lat/lon, techologies, constraints). |
| `Links.jsx` | Table of transmission links. Edit carrier, capacity, cost. |
| `Technologies.jsx` | Technology assignment to locations. Browse the built-in library or OEO API. |
| `Parameters.jsx` | Global Calliope model parameters (solver, resolution, cost weighting). |
| `Scenarios.jsx` | Scenario editor — define named parameter overrides. |
| `Overrides.jsx` | Advanced: free-form YAML override editor for expert users. |
| `TimeSeries.jsx` | Upload and manage CSV time series (demand profiles, renewable capacity factors). |
| `GlobalDataPanel.jsx` | Browse pre-bundled global time series datasets (EU demand, solar irradiance, etc.). |
| `BulkImport.jsx` | Import multiple locations or links from a single CSV file. |
| `CSVUploader.jsx` | Reusable drag-and-drop CSV upload widget used by BulkImport and TimeSeries. |
| `Export.jsx` | Export the current model as Calliope-ready YAML files or a ZIP archive. Uses `calliope_adapter.py` logic mirrored in JS. |

### 4.5 Components — map

| Component | Purpose |
|---|---|
| `MapView.jsx` | Layout wrapper combining the map with side panels. |
| `Creation.jsx` | Main model-building canvas (~4 800 lines). Integrates the MapDeckGL map with location/link creation, drag-to-move, polyline drawing, technology assignment, and the Run button. Also opens the live solver log drawer. |
| `MapDeckGL.jsx` | Deck.gl + MapLibre GL composite map. Renders: `ScatterplotLayer` (locations), `ArcLayer` + `LineLayer` (links), `GeoJsonLayer` (OSM features). Supports 3D extruded buildings and terrain. |
| `Map.jsx` | Simpler MapLibre-only fallback map used in non-creation screens. |
| `MapToolbar.jsx` | Floating toolbar over the map: layer toggles, draw mode, zoom controls. |

### 4.6 Components — OSM & GeoServer

| Component | Purpose |
|---|---|
| `OsmInfrastructurePanel.jsx` | Toggle visibility of each OSM layer (substations, power plants, lines, communes, districts). Displays feature counts. |
| `GeoServerRegionSelector.jsx` | Dropdown to pick a loaded GeoServer region and trigger data fetch. |
| `RegionSelectionStepper.jsx` | Multi-step wizard for downloading and loading a new OSM region (continent → country → sub-region). |
| `OSMDownloader.jsx` | Triggers `POST /api/osm/download` and tracks download progress. |

### 4.7 Components — Hydrogen plant

TEMPO includes a detailed **H₂ plant design module** as a separate dashboard tab.

| Component | Purpose |
|---|---|
| `HydrogenPlantDashboard.jsx` | Top-level H₂ plant view. Hosts the flow diagram and panel tabs. |
| `H2ElectrolyzerPanel.jsx` | Configure electrolyser (PEM/Alkaline), stack size, efficiency curves, operating schedule. |
| `H2GeneratorPanel.jsx` | Configure the electricity source (grid, PV, wind). |
| `H2NodeModal.jsx` | Detail overlay for a single node on the H₂ flow diagram. |
| `H2PlantFlowDiagram.jsx` | Sankey-style flow diagram of the H₂ plant sub-system. |
| `H2EnergyCharts.jsx` | ECharts visualisations of H₂ simulation results (production, efficiency, cost). |

The H₂ module calls the external **Hydrogen Plant Simulation Service** (port 8765) via `hydrogenService.js`. When unreachable, it falls back to the client-side physics model in `h2Physics.js`.

### 4.8 Components — CCS chain

TEMPO includes a detailed **CCS (Carbon Capture and Storage) chain design module**.

| Component | Purpose |
|---|---|
| `CCSSourcePanel.jsx` | Configure the CO₂ point source (flue gas composition, flow rate). |
| `CCSAbsorberPanel.jsx` | Configure the absorption column (solvent type, L/G ratio, packing height). |
| `CCSStripperPanel.jsx` | Configure the stripper / regenerator (reboiler duty, solvent circulation). |
| `CCSCompressorPanel.jsx` | Configure CO₂ compression stages, intercooling, outlet pressure. |
| `CCSStoragePanel.jsx` | Configure geological storage or utilisation (injection rate, reservoir). |
| `CCSFlowDiagram.jsx` | Process flow diagram of the full CCS chain (SVG-based, interactive). |
| `CCSEnergyCharts.jsx` | Recharts visualisations: energy penalty, capture efficiency, cost curves. |
| `CCSConfigPanel.jsx` | Top-level CCS configuration aggregator. |

The CCS module calls the external **CCS Simulation Service** (port 8766) via `ccsService.js`. When unreachable, it falls back to client-side first-principles simulation in `ccsPhysics.js`.

### 4.9 Components — UI primitives

Located in `src/components/ui/`:

| Component | Purpose |
|---|---|
| `Button.jsx` | Standard button with variant props (primary / secondary / ghost). |
| `Card.jsx` | Container card with optional header and action area. |
| `Modal.jsx` | Accessible modal dialog built on Framer Motion. |
| `Badge.jsx` | Status badge chip (success / warning / error / neutral). |
| `SaveBar.jsx` | Sticky bottom bar shown when `isDirty`. Offers Save and Discard actions. |

### 4.10 Services

Located in `src/services/`:

| File | Purpose |
|---|---|
| `api.js` | Primary Go backend client. Resolves the backend URL via `window.electronAPI.getBackendURL()` (Electron) or Vite proxy `/api` (dev). Exports the `api` object with methods for every endpoint. |
| `calliopeClient.js` | Direct client for the Calliope runner service (port 5000). Used by `Run.jsx` to submit jobs and read SSE log streams. Resolves the service URL from `window.electronAPI.getCalliopeServiceURL()` or env var. |
| `techDatabaseApi.js` | Client for the OEO Technology Database API (proxied at `/tech`). Provides `getTechnologies()`, `getTechnologyById()`, `getTechnologiesByCategory()`, `getCalliopeTechs()`. Falls back gracefully when the API is offline. |
| `hydrogenService.js` | Client for the H₂ plant simulation service (port 8765). Implements WebSocket-first with HTTP polling fallback. Proxied at `/h2-proxy` in Vite dev mode. |
| `ccsService.js` | Client for the CCS simulation service (port 8766). Same WS-first + HTTP polling pattern. Proxied at `/ccs-proxy` in Vite dev mode. |
| `h2Physics.js` | Client-side physics fallback for H₂ simulations. First-principles electrolyser, storage and fuel cell models. |
| `ccsPhysics.js` | Client-side physics fallback for CCS simulations. Simplified absorption column, compression and storage injection models (~85–90% accuracy vs Simulink). |
| `h2TechModels.js` | H₂ technology parameter definitions (CAPEX, OPEX, efficiency curves). |
| `ccsTechModels.js` | CCS technology parameter definitions. |
| `h2SimPayload.js` | Factory functions that build H₂ simulation JSON payloads from panel state. |
| `ccsSimPayload.js` | Factory functions that build CCS simulation JSON payloads from panel state. |
| `h2SourceProfiles.js` | Renewable resource profiles for H₂ plant electricity sources. |

### 4.11 Hooks

Located in `src/hooks/`:

| Hook | Purpose |
|---|---|
| `useLocationManager.js` | Manages `tempLocations` and `tempLinks` state in `Creation.jsx`. Computes distances (Haversine formula), handles add/update/remove operations. |
| `useTechnologyManager.js` | Technology assignment logic: attach/detach technologies from locations, validate carrier compatibility. |
| `useMapInteractions.js` | Handles MapLibre click events: location creation on map click, polyline drawing mode. |
| `usePolylineMode.js` | Link-drawing state machine — tracks the start location and draws a preview line while the user selects the end point. |
| `useGeoServerData.js` | Fetches OSM layer data via `api.getOSMLayer()`. Handles parallel layer fetches, loading and error state. Accepts optional `bbox` and `regionPath` filters. |
| `useLocalOSMData.js` | Loads OSM GeoJSON from the local `public/data/` directory (offline mode, no GeoServer). |
| `useLoadedRegions.js` | Fetches the list of regions already loaded into GeoServer via `GET /api/osm/regions`. |
| `useOSMLayerFilters.js` | Manages the boolean visibility flags for each OSM layer (substations, power plants, lines, communes, districts). Persists to localStorage. |

---

## 5. Go backend

**Location:** `backend-go/`  
**Binary:** `backend.exe` (Windows) / `backend-linux` (Linux)  
**Port:** 8082  
**Database:** SQLite via `modernc.org/sqlite` (pure Go, no CGO)

### 5.1 Entry point

**`backend-go/main.go`**

- Accepts `--port` and `--db` CLI flags.
- Initialises the SQLite database via `storage.InitDB()`.
- Creates the Gin server via `api.NewServer()`.
- Writes a `.backend.pid` file so Electron can send a clean-shutdown signal.
- Starts the HTTP server (blocking).

### 5.2 API routes

All routes are registered in `server.setupRoutes()`:

```
POST   /api/models                    create model
GET    /api/models                    list models
GET    /api/models/:id                get model
PUT    /api/models/:id                update model
DELETE /api/models/:id                delete model + jobs

POST   /api/models/:id/run            submit to Calliope runner
GET    /api/jobs/:id                  job status
GET    /api/jobs/:id/results          job results

POST   /api/completed-runs            save completed run to history
GET    /api/completed-runs            list completed runs
DELETE /api/completed-runs/:id        delete from history

GET    /api/osm/layers                list available layers
GET    /api/osm/regions               list loaded GeoServer regions
GET    /api/osm/regions-db            regions database (Geofabrik metadata)
POST   /api/osm/download              trigger OSM region download
GET    /api/osm/:layer                fetch OSM layer as GeoJSON
GET    /api/geocode                   geocode place name → lat/lon (Nominatim)

GET    /api/health                    health check

GET    /tech/health                   proxy OEO Tech DB health check
ANY    /tech/api/v1/*                 proxy to OEO Tech DB API (port 8000)
```

### 5.3 internal/api

**`server.go`** — `Server` struct, Gin setup, CORS middleware, route registration, proxy handlers.

CORS policy:
- Electron renderer (`Origin: "null"` or empty) is always allowed.
- `http://localhost:5173`, `http://localhost:5174`, `http://127.0.0.1:5173/4` are allowed for Vite dev mode.
- All other origins are refused with 403 Forbidden.

Request body cap: 4 MB (`maxModelBodyBytes`) to prevent DoS via oversized payloads.

Input validation: OSM region/country/continent path components are validated against `^[A-Za-z0-9\-_ ]{1,80}$` (no shell injection).

### 5.4 internal/models

**`models.go`** — Go structs that define the domain model:

| Struct | Fields |
|---|---|
| `Location` | `id`, `name`, `lat`, `lon`, `technologies[]`, `constraints{}` |
| `Link` | `id`, `source`, `target`, `distance`, `technology`, `constraints{}` |
| `Technology` | `name`, `type`, `carrier`, `carrier_in[]`, `carrier_out[]`, `constraints{}` |
| `ModelConfig` | Root: `name`, `description`, `locations[]`, `links[]`, `technologies[]`, `timeSeries[]`, `parameters{}` |
| `Job` | `id` (UUID), `model_id`, `status`, `progress`, `result` (JSON), `error`, timestamps |
| `CompletedRun` | Persisted job history entry |

### 5.5 internal/storage

**`database.go`** — SQLite CRUD operations.

Tables:

```sql
CREATE TABLE models (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  config     TEXT NOT NULL,   -- JSON-serialised ModelConfig
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE jobs (
  id         TEXT PRIMARY KEY,  -- UUID
  model_id   INTEGER REFERENCES models(id),
  status     TEXT,              -- pending | running | completed | failed
  progress   INTEGER,
  result     TEXT,              -- JSON results
  error      TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE completed_runs (
  id         TEXT PRIMARY KEY,
  model_id   INTEGER,
  model_name TEXT,
  result     TEXT,
  created_at TIMESTAMP
);
```

### 5.6 internal/calliope

**`client.go`** — HTTP client for the Calliope runner service.

Key methods:

| Method | HTTP call | Description |
|---|---|---|
| `RunModel(config)` | `POST /run` | Serialises ModelConfig to JSON and submits the job. Returns `job_id`. |
| `StreamJobLogs(jobId, logCh)` | `GET /run/{id}/stream` | Opens an SSE connection; pushes log lines into `logCh`. Signals done/error events. |
| `CancelJob(jobId)` | `DELETE /run/{id}` | Cancels a running job. |
| `GenerateModelYAML(config)` | (local) | Converts `ModelConfig` structs to Calliope-compatible YAML. Computes distances, expands technology constraints. |

### 5.7 internal/geoserver

**`client.go`** — WFS 2.0.0 client for GeoServer PostGIS.

- Builds `GetFeature` requests with CQL filter for region and/or bounding box.
- Returns GeoJSON `FeatureCollection`.
- Response is cached in-memory for 5 minutes to reduce GeoServer load.
- Layer names: `osm:osm_substations`, `osm:osm_power_plants`, `osm:osm_power_lines`, `osm:osm_communes`, `osm:osm_districts`.
- Falls back: if GeoServer is unreachable the server automatically delegates to `overpass.Client`.

### 5.8 internal/overpass

**`client.go`** — Public Overpass API and Nominatim client.

- `QueryRegion(bbox, layerType)` — constructs and executes OverpassQL queries for power infrastructure features.
- `Geocode(query)` — calls Nominatim (`nominatim.openstreetmap.org`) to resolve place names.
- Used as automatic fallback when GeoServer is not available.

---

## 6. Python Calliope service

**Location:** `python/`  
**Port:** 5000  
**Deploy:** `uvicorn python.calliope_service:app --host 0.0.0.0 --port 5000` or `docker compose up calliope-runner`

### 6.1 calliope_service.py

FastAPI application. Acts as the HTTP wrapper around the runner.

**API:**

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Returns `{"status": "ok"}`. Health check for Docker and Electron. |
| `/run` | POST | Accepts JSON model config. Creates a job, starts a worker thread. Returns `{"job_id": "<uuid>"}`. |
| `/run/{job_id}/stream` | GET | Server-Sent Events stream. Emits `log`, `done`, and `error` events. |
| `/run/{job_id}` | DELETE | Cancels the job (sends SIGTERM to the Calliope subprocess if running). |

**Job lifecycle:**
1. `POST /run` → creates `Job` with `status=pending`, starts worker thread.
2. Worker calls `calliope_runner.run_model(config, log_callback)`.
3. Log lines are pushed to an `asyncio.Queue` and emitted via SSE.
4. On completion, `done` SSE event carries the full result JSON.
5. On failure, `error` SSE event carries the exception message.

**CORS:** `allow_origins=["*"]` — intentional, as the service is localhost-only.

### 6.2 calliope_runner.py

Core Python script that converts the model JSON config to Calliope YAML and executes the solver.

**Key functions:**

| Function | Description |
|---|---|
| `run_model(config, log_callback)` | Main entry point. Calls `build_*_config()` functions, writes temp YAML files, invokes Calliope, reads results. |
| `build_techs_config(technologies)` | Converts technology list to `techs:` YAML block. |
| `build_locations_config(locations)` | Converts location list to `locations:` YAML block with technology assignments. |
| `build_links_config(links)` | Converts link list to `links:` YAML block. |
| `build_timeseries_config(timeSeries)` | Generates `data_sources:` block from uploaded CSV references. |
| `_setup_bundled_solver()` | Prepends `solvers/<platform>/` to PATH so Pyomo finds `cbc`/`glpk` without system install. |

The runner writes temporary YAML files to a `tempfile.mkdtemp()` directory, runs `calliope.Model(model_yaml).run()`, and serialises the `xarray.Dataset` results to a JSON-serialisable dict.

### 6.3 adapters/

| File | Purpose |
|---|---|
| `calliope_adapter.py` | Translates `OEOTechnology` instances (from the OEO Tech DB API) into the nested dict structure expected by `calliope_runner.py`. Full field-mapping table from OEO fields to Calliope YAML paths documented in the module docstring. |
| `pypsa_adapter.py` | **Experimental.** Translates TEMPO model config to PyPSA network format. Not wired to the runner yet. |
| `osemosys_adapter.py` | **Experimental.** Translates TEMPO model config to OSeMOSYS data format. Not wired to the runner yet. |

### 6.4 services/tech_database.py

OEO Technology Database API client.

- `OEOTechnology` dataclass — mirrors the API response schema.
- `TechDatabaseClient` — HTTP client with caching. Methods: `get_technologies()`, `get_technology(id)`, `get_technologies_by_category(cat)`, `get_calliope_techs()`.
- Used by `calliope_adapter.py` to fetch live techno-economic parameters when the OEO API is reachable.

---

## 7. External simulation services

These are optional services not included in the main repository. They are invoked by the frontend via Vite proxies (`/h2-proxy`, `/ccs-proxy`) in dev mode, or directly by URL in production.

### 7.1 Hydrogen plant service

**Port:** 8765  
**Env var:** `VITE_H2_SERVICE_URL`  
**Frontend client:** `src/services/hydrogenService.js`  
**Physics fallback:** `src/services/h2Physics.js`

Exposes a FastAPI (OpenModelica Bridge) for detailed H₂ plant simulation. Supports:
- WebSocket streaming for real-time progress.
- HTTP fallback polling.
- `POST /simulate` — submit parameters.
- `GET /jobs/{id}` — poll status.
- `GET /` (WebSocket) — real-time telemetry.

When the service is unreachable, `h2Physics.js` provides an approximate simulation using first-principles electrolyser, compressor, and storage models.

### 7.2 CCS simulation service

**Port:** 8766  
**Env var:** `VITE_CCS_SERVICE_URL`  
**Frontend client:** `src/services/ccsService.js`  
**Physics fallback:** `src/services/ccsPhysics.js`

Same pattern as the H₂ service but models the CCS chain: flue-gas source → absorption column → stripper/regenerator → multi-stage compressor → geological storage. Physics models include:
- Amine chemical absorption (MEA/MDEA/Piperazine).
- Thermal desorption (reboiler duty).
- Multi-stage isentropic compression.
- Injection well pressure model.

### 7.3 OEO Technology Database API

**Port:** 8000  
**Env var:** `VITE_TECH_API_URL`  
**Frontend proxy:** `GET/ANY /tech/*` → backend proxy → `http://localhost:8000`  
**Frontend client:** `src/services/techDatabaseApi.js`  
**Python client:** `python/services/tech_database.py`

A separate Python REST service aligned with the **Open Energy Ontology (OEO)**. Provides up-to-date techno-economic parameters for:
- Generator technologies (CAPEX, OPEX, lifetime, efficiency).
- Storage technologies (energy/power CAPEX, round-trip efficiency).
- Transmission technologies (cost per km, losses).

The Go backend proxies `/tech/*` to this service so the React renderer never needs a direct connection (avoids CORS / firewall issues).

---

## 8. GeoServer & PostGIS pipeline

**Docker containers:**
- `postgis/postgis` → host port **5432** (`calliope-postgis`)
- `kartoza/geoserver` → host port **8080** (`calliope-geoserver`)

**Setup:**
```powershell
.\scripts\setup_geoserver_docker.ps1 -LoadRegion "Europe/Germany/Bayern"
```

**Layers published:**

| Layer name | Geometry | Description |
|---|---|---|
| `osm:osm_substations` | Point | Electrical substations |
| `osm:osm_power_plants` | Point | Power generation facilities |
| `osm:osm_power_lines` | LineString | HV/EHV transmission lines |
| `osm:osm_communes` | Polygon | Municipality boundaries |
| `osm:osm_districts` | Polygon | District/Landkreis boundaries |

The Go backend queries GeoServer at `http://localhost:8081/geoserver` (configured in `backend-go/config.yaml`). Responses are cached in-process for 5 minutes.

---

## 9. OSM processing pipeline

**Location:** `osm_processing/`  
**Data source:** Geofabrik (~daily updated PBF extracts)

| Script | Description |
|---|---|
| `create_folder_structure.py` | Creates the local data directory tree. |
| `create_extract_structure.py` | Creates the Osmium `extract.geojson` for sub-region clipping. |
| `download_world_osm.py` | Interactive menu: download continent/country/region PBF files. |
| `download_country.py` | Download a single country or continent. |
| `download_country_detailed.py` | Download detailed sub-regions. |
| `extract_osm_region.py` | Applies Osmium extract + osmfilter to produce power-infrastructure GeoJSON files. |
| `upload_to_postgis.py` | Loads GeoJSON files into PostGIS with region tagging. |
| `configure_geoserver.py` | Uses GeoServer REST API to publish PostGIS tables as WFS layers. |
| `update_database_for_region.py` | Re-run upload+configure for an updated region. |
| `add_region_to_geoserver.py` | All-in-one pipeline: download → extract → upload → configure. |
| `geofabrik_regions_database.json` | JSON database of all Geofabrik region paths, codes, and download URLs. |

---

## 10. Technology library

**Definition file:** `src/components/TechnologiesData.js`

The built-in technology library is a JavaScript object exported as `TECH_TEMPLATES`. It contains ~40 technology definitions organised by category:

| Category | Example technologies |
|---|---|
| Renewable | `solar_pv`, `wind_onshore`, `wind_offshore`, `hydro_run_of_river`, `hydro_reservoir` |
| Conventional | `ccgt`, `ocgt`, `coal`, `nuclear`, `biomass`, `oil` |
| Electrochemical storage | `battery_li_ion`, `battery_flow_vanadium` |
| Mechanical/thermal storage | `pumped_hydro`, `compressed_air`, `thermal_storage` |
| Hydrogen | `electrolyser_pem`, `electrolyser_alkaline`, `fuel_cell_sofc`, `h2_storage`, `h2_pipeline` |
| CCS | `ccs_absorption`, `ccs_dac`, `ccs_storage_geological` |
| Demand | `demand_electricity`, `demand_heat`, `demand_h2` |
| Transmission | `ac_line`, `dc_cable`, `gas_pipeline` |

Each entry includes: `id`, `name`, `type` (Calliope parent), `carrier_in`, `carrier_out`, `default_constraints`, `color`, `icon`, `description`.

The library can be enriched at runtime by the OEO Technology Database API via `techDatabaseApi.js`.

---

## 11. Frontend libraries

### Core

| Package | Version | Purpose |
|---|---|---|
| `react` | 19.x | UI framework |
| `react-dom` | 19.x | DOM renderer |
| `vite` | 7.x | Dev server + bundler |
| `@vitejs/plugin-react` | 5.x | Fast Refresh, JSX transform |

### UI & Styling

| Package | Purpose |
|---|---|
| `@mui/material` | Material Design component kit (dialogs, tables, autocomplete, sliders) |
| `@mui/icons-material` | 2000+ MUI icons |
| `@emotion/react` + `@emotion/styled` | CSS-in-JS engine for MUI |
| `tailwindcss` | Utility-first CSS framework used for layout and spacing |
| `framer-motion` | Animation library (page transitions, modal springs, stagger animations) |
| `react-icons` | Multi-source icon library (FontAwesome, Heroicons, Bootstrap, etc.) |
| `lucide-react` | Crisp icon set matching TEMPO's design language |

### Map

| Package | Purpose |
|---|---|
| `maplibre-gl` | Open-source vector tile renderer (WebGL). Renders base map, custom styles, raster tiles. |
| `react-map-gl` | React wrapper for MapLibre GL. Manages map state and event binding. |
| `deck.gl` + `@deck.gl/layers` | GPU-accelerated large-dataset overlay: `ScatterplotLayer`, `ArcLayer`, `LineLayer`, `GeoJsonLayer`, `TripsLayer`. |

### Charts & Visualisation

| Package | Purpose |
|---|---|
| `echarts` + `echarts-for-react` | Rich interactive charts (bar, line, scatter, heatmap, Sankey) used in Results and H₂ views. |
| `apexcharts` + `react-apexcharts` | Responsive time-series and donut charts used in CCS views. |
| `recharts` | Composable chart library used in some result panels. |

### Data & Utilities

| Package | Purpose |
|---|---|
| `papaparse` | Fast CSV parser for BulkImport and TimeSeries upload. |
| `file-saver` | Browser-side file download for Export. |
| `jszip` | In-memory ZIP creation for multi-file model export. |
| `flatpickr` | Lightweight date/time picker for scenario date ranges. |
| `clsx` + `tailwind-merge` | Conditional CSS class helpers. |
| `react-spring` | Spring-physics animations for map overlays. |

### Electron-specific

| Package | Purpose |
|---|---|
| `electron` | Chromium + Node.js desktop runtime. |
| `electron-builder` | Packaging and NSIS installer generation. |
| `electron-store` | Simple key-value persistent settings backed by a JSON file. |
| `concurrently` + `wait-on` | Dev-mode script: starts Vite and Electron in parallel, waits for the dev server before launching Electron. |

---

## 12. Build & packaging

### Development

```bash
npm install          # install all deps
npm run dev          # Vite dev server → http://localhost:5173

# In a second terminal:
cd backend-go && go run .            # Go backend → :8082

# In a third terminal (optional):
uvicorn python.calliope_service:app --host 0.0.0.0 --port 5000
# or:
docker compose up calliope-runner
```

### Desktop (Electron dev)

```bash
npm run dev:electron   # concurrently: Vite + Electron (waits for :5173)
```

### Production build

```bash
npm run dist           # Windows → release/TEMPO-Setup-x.x.x.exe
npm run dist:linux     # Linux   → release/TEMPO-x.x.x.AppImage
npm run dist:all       # both
```

`predist` runs automatically: `npm run build` (Vite bundle → `dist/`) then `npm run build:go` (Go binary).

The `electron-builder` config in `package.json` bundles:
- `dist/` (Vite build)
- `electron/main.cjs`, `electron/preload.cjs`
- `backend-go/backend.exe` (or `backend-linux`)
- `python/` directory (calliope_service + runner + adapters)
- `solvers/` directory (bundled CBC or HiGHS solver binary)
- `public/templates/` (example CSV templates)

### Go backend build

```bash
npm run build:go          # Windows (backend.exe)
npm run build:go:linux    # Linux cross-compile (backend-linux)
```

---

## 13. Configuration files

| File | Purpose |
|---|---|
| `backend-go/config.yaml` | Go backend: GeoServer URL/credentials, Calliope service URL, server port. |
| `vite.config.js` | Vite: dev proxy rules for `/api`, `/tech`, `/h2-proxy`, `/ccs-proxy`; Rollup chunk splitting; base path. |
| `tailwind.config.js` | Tailwind: content paths, custom colour palette, font settings. |
| `eslint.config.js` | ESLint flat-config: React Hooks plugin, React Refresh plugin. |
| `docker-compose.yml` | Docker: `calliope-runner` service definition (ports, volumes, healthcheck). |
| `Dockerfile` | Container image for the Calliope runner (Python + Calliope + CBC solver). |
| `package.json` | NPM deps, scripts, and `electron-builder` packaging config. |
| `package.electron.json` | Separate package.json used when building the Electron-only dist (strips devDeps). |
| `mkdocs.yml` | MkDocs: site name, nav structure, Material theme config. |
| `.env` (not committed) | `VITE_H2_SERVICE_URL`, `VITE_CCS_SERVICE_URL`, `VITE_TECH_API_URL`, `VITE_CALLIOPE_SERVICE_URL`. |

---

## 14. Data flow diagrams

### Model save flow

```
User edits (Locations / Links / etc.)
  → DataContext state update
    → 1.5s debounce fires saveNow()
      → api.updateModel(id, modelData)   [PUT /api/models/:id]
        → Go backend serialises JSON
          → SQLite UPDATE models
```

### Optimization run flow

```
User clicks "Run"
  → Run.jsx calls calliopeClient.runCalliopeModel(modelData, callbacks)
    → POST /run  →  calliope_service.py
      → worker thread: calliope_runner.run_model()
        → Calliope solver (CBC/HiGHS)
  → GET /run/{id}/stream  (SSE)
    → [CALLIOPE] log lines streamed to Run.jsx log drawer
    → "done" event: result JSON
      → api.saveCompletedRun(result)    [POST /api/completed-runs]
        → Results.jsx rendered
```

### OSM data fetch flow

```
User opens MapView / toggles a layer
  → useGeoServerData.loadRegionData(region, filters, bbox)
    → api.getOSMLayer(layer, bbox, region)     [GET /api/osm/:layer]
      → Go: geoserver.Client.GetOSMLayer()
          if GeoServer reachable → WFS GetFeature (PostGIS)
          else → overpass.Client.QueryRegion()
      → GeoJSON FeatureCollection returned
        → MapDeckGL.jsx renders GeoJsonLayer
```

### H₂ / CCS simulation flow

```
User configures H₂ plant / CCS chain
  → HydrogenPlantDashboard / CCS panels collect params
    → hydrogenService.runSimulation(params, callbacks)
         attempts WebSocket   → ws://localhost:8765
         fallback after 3s    → HTTP polling /jobs/{id}
      OR ccsService.runSimulation(params, callbacks)
         same pattern         → localhost:8766
      OR client-side physics (h2Physics / ccsPhysics) if service unreachable
    → Results stream into H2EnergyCharts / CCSEnergyCharts
```
