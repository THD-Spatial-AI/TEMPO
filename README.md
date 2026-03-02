# Calliope Visualizator

A desktop + web application for building, running, and visualizing energy system models. Combines an interactive map interface with a Go backend, a Python Calliope runner, and OSM infrastructure data pipelines.

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

## OSM Data Processing

Scripts in `osm_processing/` download and extract power infrastructure from Geofabrik:

```bash
cd osm_processing
pip install -r requirements.txt

python create_folder_structure.py   # set up data directories
python create_extract_structure.py
python download_world_osm.py        # interactive downloader (world / continent / country)

# Extract a region into GeoJSON
python extract_osm_region.py Europe Germany Bayern
python extract_osm_region.py Europe Spain Andalucia
```

Extracted files (substations, power plants, lines, boundaries) land in `public/data/osm_extracts/`.

To load data into PostGIS and GeoServer, see `upload_to_postgis.py`, `configure_geoserver.py`, and `scripts/import_osm_docker.ps1`.

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
