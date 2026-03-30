# TEMPO

## Tool for Energy Model Planning and Optimization

A desktop + web application for building, running, and visualizing energy system models. Combines an interactive map interface with a Go backend, a Python Calliope runner, and OSM infrastructure data pipelines.

## 🚀 Quick Start for New Computer

**Setting up TEMPO on a fresh machine?** Follow the complete step-by-step guide:

👉 **[SETUP_NEW_COMPUTER.md](SETUP_NEW_COMPUTER.md)** 👈

This guide covers everything from installing prerequisites to running your first optimization with GeoServer enabled.

---

## What does it do?

- **Model Builder**: Create and configure Calliope energy system models (locations, links, technologies, time series, parameters, scenarios)
- **Interactive Map**: Visualize locations and transmission links on a MapLibre GL / Deck.gl map with real OSM power infrastructure layers (substations, power plants, power lines)
- **Technology Library**: Pre-configured YAML templates for conventional, renewable, storage, H2, demand, and transmission technologies
- **Calliope Runner**: Run optimization directly from the UI — the app spawns a Python process and streams the results back
- **GeoServer Integration**: Optionally serve vector tile layers via GeoServer for regional OSM data
- **Bulk Import / Export**: Import locations and links from CSV, export full models as Calliope-ready YAML or ZIP
- **Results Viewer**: Inspect optimization outputs after a run
- **Multi-model management**: Keep several models and scenarios side by side

## Architecture

```
┌─────────────┐    HTTP     ┌──────────────┐    SQLite
│  React/Vite │ ──────────▶ │  Go backend  │ ──────────▶ calliope.db
│  (frontend) │             │  (port 8082) │
└─────────────┘             └──────────────┘
       │                           │
  Electron                  spawns Python
  (desktop)                 calliope_runner.py
```

- **Frontend**: React 19 + Vite, Tailwind CSS, MapLibre GL, Deck.gl, ECharts/Recharts/ApexCharts, MUI
- **Backend**: Go REST API + SQLite (via `backend-go/`)
- **Desktop**: Electron wrapper with NSIS installer
- **Calliope runner**: Python script (`python/calliope_runner.py`) that converts the model JSON to Calliope YAML and runs the solver
- **OSM processing**: Python scripts (`osm_processing/`) to download and extract power infrastructure from OpenStreetMap

## Getting Started

### Prerequisites

- Node.js ≥ 16
- Go ≥ 1.21 (for the backend)
- Python ≥ 3.9 with Calliope installed (for running models)

```bash
node --version
go version
python --version
```

### Frontend (web mode)

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. The Go backend must also be running for data persistence.

### Backend

```bash
cd backend-go
go build -o backend.exe .
./backend.exe --port 8082 --db ./calliope.db
```

### Desktop (Electron)

```bash
# Dev mode – starts both Vite and Electron
npm run dev:electron

# Or run against an already-built frontend
npm run electron
```

### Build installer (Windows)

```bash
npm run build          # builds the frontend into dist/
npm run build:electron # packages everything with electron-builder
```

The installer ends up in `C:\temp\calliope-release\` by default (configurable in `package.json`).

## 🗺️ GeoServer Setup (Optional)

GeoServer provides **fast, cached access** to pre-processed OSM power infrastructure data via PostGIS. When unavailable, the application automatically falls back to the public Overpass API—meaning **GeoServer is completely optional** but recommended for production use.

### Quick Setup (Docker - Recommended)

**Prerequisites:**
- Docker Desktop installed and running
- Python ≥ 3.9 (for data loading scripts)

**One-command setup:**

```powershell
# Setup GeoServer + PostGIS containers (no data)
.\scripts\setup_geoserver_docker.ps1

# Or setup with a specific region loaded
.\scripts\setup_geoserver_docker.ps1 -LoadRegion "Europe/Germany/Bayern"

# Reset and recreate containers from scratch
.\scripts\setup_geoserver_docker.ps1 -Reset
```

This script will:
1. ✓ Create and start PostGIS container (port 5432)
2. ✓ Create and start GeoServer container (port 8080)
3. ✓ Configure database tables and indexes
4. ✓ Set up GeoServer workspace and layers
5. ✓ Optionally load OSM data for your region

**After setup:**
- 🌐 GeoServer Web UI: http://localhost:8080/geoserver/web/
- 🔐 Login: `admin` / `geoserver`
- 🗄️ PostGIS: `localhost:5432/gis` (user: `postgres`, password: `geoserver123`)

### Managing Containers

```powershell
# Start containers (after restart)
docker start calliope-postgis calliope-geoserver

# Stop containers
docker stop calliope-geoserver calliope-postgis

# View logs
docker logs calliope-geoserver

# Check status
docker ps
```

### Configure TEMPO to use GeoServer

1. Open TEMPO application
2. Go to **Settings**
3. Set **GeoServer URL**: `http://localhost:8080/geoserver`
4. Set **Workspace**: `osm`
5. Save settings

The application will now prioritize GeoServer data over Overpass API.

### 📦 Available Layers

Once configured, GeoServer serves these layers:

- **`osm:osm_substations`** - Electrical substations (points)
- **`osm:osm_power_plants`** - Generation facilities (points)
- **`osm:osm_power_lines`** - Transmission lines (linestrings)
- **`osm:osm_communes`** - Administrative boundaries (polygons)
- **`osm:osm_districts`** - Regional districts (polygons)

All layers support:
- ✓ Spatial filtering by bounding box
- ✓ Multi-region support (load multiple countries)
- ✓ Fast 5-minute backend cache
- ✓ GeoJSON output format

## 📊 OSM Data Processing

Scripts in `osm_processing/` download and extract power infrastructure from Geofabrik:

### Initial Setup

```bash
cd osm_processing
pip install -r requirements.txt

python create_folder_structure.py   # set up data directories
python create_extract_structure.py
```

### Download OSM Data

```bash
# Interactive menu
python download_world_osm.py
```

This provides options to download:
- Entire world
- By continent
- By country
- Custom selection

### Extract Power Infrastructure

```bash
# Extract a region into GeoJSON
python extract_osm_region.py Europe Germany Bayern
python extract_osm_region.py Europe Spain Andalucia
python extract_osm_region.py South_America Chile
```

Extracted files (substations, power plants, lines, boundaries) land in `public/data/osm_extracts/`.

### Load into GeoServer (One Command)

If you have GeoServer running via Docker, use the **all-in-one pipeline**:

```bash
# This downloads, extracts, and uploads to PostGIS in one step
python osm_processing/add_region_to_geoserver.py Europe Germany Bayern

# Add multiple regions (data is additive, not replaced)
python osm_processing/add_region_to_geoserver.py Europe Spain
python osm_processing/add_region_to_geoserver.py South_America Chile
```

The PostGIS database supports **multiple regions simultaneously**. Each region is tagged with its path, allowing you to query specific regions or all loaded data.

### Manual Steps (Advanced)

If you need fine control:

```bash
# 1. Upload GeoJSON to PostGIS
python osm_processing/upload_to_postgis.py

# 2. Configure GeoServer layers
python osm_processing/configure_geoserver.py
```

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run electron` | Run Electron against `dist/` |
| `npm run dev:electron` | Vite + Electron in parallel |
| `npm run build:electron` | Full desktop build + installer |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── components/        # All React UI components
├── context/           # Global state (models, settings, notifications)
├── services/          # API client calls to the Go backend
├── hooks/             # Custom React hooks
├── utils/             # Helper functions
└── config/            # App-wide constants

backend-go/
├── main.go
└── internal/
    ├── api/           # HTTP handlers
    ├── models/        # Data models
    ├── storage/       # SQLite queries
    ├── calliope/      # Calliope-specific logic
    ├── geoserver/     # GeoServer integration
    └── overpass/      # Overpass API queries

python/
└── calliope_runner.py # Converts model JSON → YAML, runs Calliope

osm_processing/        # Download + extract OSM power data
techs/                 # Calliope technology YAML templates
electron/              # Electron main + preload scripts
scripts/               # Setup and import helper scripts
```

## Technology Templates

Pre-built templates in `techs/`:

- `techs_conventional.yaml` – gas, coal, nuclear, etc.
- `techs_renewable.yaml` – solar PV, wind onshore/offshore
- `techs_storage.yaml` – batteries, pumped hydro
- `techs_h2.yaml` – hydrogen technologies
- `techs_demand.yaml` – demand nodes
- `techs_transmission.yaml` – AC/DC transmission links

## Notes

- CSV time series files should have a datetime index in the first column
- Model configurations follow the Calliope 0.7 framework specification
- The Go backend stores all model data in a local SQLite file

## Questions?

Open an issue on GitLab or check the `documentation/` folder for the architecture docs.
