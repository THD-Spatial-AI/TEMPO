# Project Structure

A map of the repository layout and the purpose of each major directory and file.

---

## Top-level layout

```
calliope_visualizator/
├── src/                    # React frontend source
├── backend-go/             # Go REST API server
├── electron/               # Electron main and preload scripts
├── python/                 # Calliope runner script
├── osm_processing/         # OSM data download and extraction scripts
├── techs/                  # Calliope technology YAML templates
├── public/                 # Static assets served by Vite
│   ├── data/               # OSM PBF and GeoJSON data (not committed)
│   └── templates/          # Example CSV model templates
├── docs/                   # MkDocs documentation source
├── documentation/          # LaTeX arc42 architecture documentation
├── scripts/                # Helper PowerShell/Bash scripts
├── package.json            # Node.js config + Electron Builder config
├── vite.config.js          # Vite bundler configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── mkdocs.yml              # MkDocs site configuration
└── .gitlab-ci.yml          # GitLab CI/CD pipeline
```

---

## Frontend — `src/`

```
src/
├── App.jsx                 # Root component and router
├── main.jsx                # Entry point
├── App.css / index.css     # Global styles
├── components/             # All React components
│   ├── Dashboard.jsx       # Home/model list screen
│   ├── Map.jsx             # Map wrapper
│   ├── MapDeckGL.jsx       # Deck.gl map layer
│   ├── MapView.jsx         # Combined map + sidebar layout
│   ├── MapToolbar.jsx      # Map controls toolbar
│   ├── Locations.jsx       # Location management screen
│   ├── Links.jsx           # Link management screen
│   ├── Technologies.jsx    # Technology management screen
│   ├── TimeSeries.jsx      # Time series upload and management
│   ├── Parameters.jsx      # Global model parameters
│   ├── Scenarios.jsx       # Scenario editor
│   ├── Overrides.jsx       # Raw YAML override editor
│   ├── Run.jsx             # Solver submission and live log
│   ├── Results.jsx         # Results visualization
│   ├── Export.jsx          # CSV export utilities
│   ├── ExportCalliope.jsx  # Calliope YAML/ZIP export
│   ├── BulkImport.jsx      # CSV bulk import screen
│   ├── OsmInfrastructurePanel.jsx  # OSM layer controls
│   ├── GeoServerRegionSelector.jsx # GeoServer region picker
│   ├── Settings.jsx        # Application settings screen
│   ├── SetupScreen.jsx     # First-run Python environment setup
│   ├── Sidebar.jsx         # Navigation sidebar
│   ├── Notification.jsx    # Toast notification component
│   ├── ErrorBoundary.jsx   # React error boundary
│   ├── Tutorial.jsx        # In-app tutorial overlay
│   └── ui/                 # Shared low-level UI primitives
├── context/                # React Context providers (model state, notifications)
├── services/               # HTTP client functions for the backend API
├── hooks/                  # Custom React hooks
├── utils/                  # Pure utility functions
└── config/                 # App-wide constants and configuration
```

---

## Backend — `backend-go/`

```
backend-go/
├── main.go                 # Entry point — parses flags, starts server
├── go.mod / go.sum         # Go module files
├── config.yaml             # Optional static configuration
└── internal/
    ├── api/
    │   └── server.go       # Gin router + all HTTP handlers
    ├── models/             # Go structs for model and job data
    ├── storage/            # SQLite wrapper (DB init, CRUD queries)
    ├── calliope/           # Job lifecycle logic, runner invocation
    ├── overpass/           # Overpass API + Nominatim HTTP client
    └── geoserver/          # GeoServer REST API client
```

---

## Electron — `electron/`

```
electron/
├── main.cjs        # Main process: window, backend, Python process management
└── preload.cjs     # Preload script: IPC bridge between main and renderer
```

---

## Python runner — `python/`

```
python/
└── calliope_runner.py  # Converts model JSON → Calliope YAML, runs solver, writes results JSON
```

---

## Technology templates — `techs/`

```
techs/
├── techs_renewable.yaml      # solar_pv, wind_onshore, wind_offshore, run_of_river
├── techs_conventional.yaml   # gas_ccgt, coal, nuclear, diesel_generator
├── techs_storage.yaml        # battery, pumped_hydro, hydrogen_storage
├── techs_h2.yaml             # electrolyser, fuel_cell, hydrogen_pipeline
├── techs_demand.yaml         # demand_electricity, demand_heat, demand_hydrogen
└── techs_transmission.yaml   # ac_line, dc_link, heat_pipe
```

---

## OSM processing — `osm_processing/`

See [OSM Data Processing — Overview](../osm-processing/overview.md) for the full description.
