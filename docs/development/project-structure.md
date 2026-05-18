# Project Structure

A map of the repository layout and the purpose of each major directory and file.

---

## Top-level layout

```
calliope_visualizator/
├── src/                    # React frontend source
├── backend-go/             # Go REST API server
├── electron/               # Electron main and preload scripts
├── python/                 # Calliope runner, FastAPI service, and framework adapters
├── osm_processing/         # OSM data download and extraction scripts
├── public/                 # Static assets served by Vite
│   ├── data/               # OSM PBF and GeoJSON data (not committed)
│   └── templates/          # Example CSV model templates
├── docs/                   # MkDocs documentation source
├── documentation/          # LaTeX arc42 architecture documentation
├── scripts/                # Helper PowerShell/Bash scripts
├── docker-compose.yml      # Docker service for calliope-runner (port 5000)
├── Dockerfile              # Container image for the Calliope runner service
├── package.json            # Node.js config + Electron Builder config
├── vite.config.js          # Vite bundler configuration
├── tailwind.config.js      # Tailwind CSS configuration
└── mkdocs.yml              # MkDocs site configuration
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
│   ├── Models.jsx              # Model list and creation
│   ├── ModelSelector.jsx       # Model switcher dropdown
│   ├── CalliopeModels.jsx      # Calliope-specific model management
│   ├── Map.jsx             # Map wrapper
│   ├── MapDeckGL.jsx       # Deck.gl map layer
│   ├── MapView.jsx         # Combined map + sidebar layout
│   ├── MapToolbar.jsx      # Map controls toolbar
│   ├── Creation.jsx        # Main model-creation canvas / map interaction
│   ├── Locations.jsx       # Location management screen
│   ├── LocationEditDialog.jsx  # Location edit modal
│   ├── Links.jsx           # Link management screen
│   ├── Technologies.jsx    # Technology management screen
│   ├── TechnologiesData.js # Static technology definitions and image map
│   ├── Configuration.jsx   # Model configuration panel
│   ├── TimeSeries.jsx      # Time series upload and management
│   ├── Parameters.jsx      # Global model parameters
│   ├── Scenarios.jsx       # Scenario editor
│   ├── Overrides.jsx       # Raw YAML override editor
│   ├── Run.jsx             # Solver submission and live log
│   ├── Results.jsx         # Results visualization
│   ├── Export.jsx          # YAML / ZIP export
│   ├── BulkImport.jsx      # CSV bulk import screen
│   ├── CSVUploader.jsx     # Reusable CSV upload widget
│   ├── GlobalDataPanel.jsx # Global dataset browser
│   ├── OsmInfrastructurePanel.jsx  # OSM layer controls
│   ├── GeoServerRegionSelector.jsx # GeoServer region picker
│   ├── RegionSelectionStepper.jsx  # Multi-step region selection wizard
│   ├── HydrogenPlantDashboard.jsx  # H₂ plant modelling dashboard
│   ├── H2ElectrolyzerPanel.jsx     # Electrolyser configuration panel
│   ├── H2GeneratorPanel.jsx        # H₂ generator panel
│   ├── H2NodeModal.jsx             # H₂ node detail modal
│   ├── H2PlantFlowDiagram.jsx      # H₂ plant Sankey / flow diagram
│   ├── H2EnergyCharts.jsx          # H₂ energy result charts
│   ├── CCSSourcePanel.jsx          # CCS CO₂ source panel
│   ├── CCSAbsorberPanel.jsx        # CCS absorber column panel
│   ├── CCSCompressorPanel.jsx      # CCS compressor panel
│   ├── CCSStripperPanel.jsx        # CCS stripper / regenerator panel
│   ├── CCSStoragePanel.jsx         # CCS CO₂ storage panel
│   ├── CCSFlowDiagram.jsx          # CCS process flow diagram
│   ├── CCSEnergyCharts.jsx         # CCS energy result charts
│   ├── CCSConfigPanel.jsx          # CCS top-level configuration aggregator
│   ├── OSMDownloader.jsx           # Triggers OSM region download and tracks progress
│   ├── Settings.jsx        # Application settings screen
│   ├── SetupScreen.jsx     # First-run Python environment setup
│   ├── Sidebar.jsx         # Navigation sidebar
│   ├── Notification.jsx    # Toast notification component
│   ├── ErrorBoundary.jsx   # React error boundary
│   ├── Tutorial.jsx        # In-app tutorial overlay
│   ├── ModelStructureTutorial.jsx  # Model structure guided tour
│   └── ui/                 # Shared low-level UI primitives
│       ├── Badge.jsx        # Status badge chip (success / warning / error / neutral)
│       ├── Button.jsx       # Standard button with variant props
│       ├── Card.jsx         # Container card with optional header and action area
│       ├── Modal.jsx        # Accessible modal dialog (Framer Motion)
│       └── SaveBar.jsx      # Sticky bottom bar shown when unsaved changes exist
├── context/
│   └── DataContext.jsx     # Global model state, localStorage fallback, auto-save debounce
├── services/               # HTTP clients for all backend and external services
│   ├── api.js              # Go backend client (models, jobs, OSM, geocode)
│   ├── calliopeClient.js   # Direct Calliope runner client (SSE streaming)
│   ├── techDatabaseApi.js  # OEO Technology Database API client
│   ├── hydrogenService.js  # H₂ plant simulation service client (port 8765) + WS fallback
│   ├── ccsService.js       # CCS simulation service client (port 8766) + WS fallback
│   ├── h2Physics.js        # Client-side H₂ physics fallback (offline approximate simulation)
│   ├── ccsPhysics.js       # Client-side CCS physics fallback (offline approximate simulation)
│   ├── h2TechModels.js     # H₂ technology parameter definitions
│   ├── ccsTechModels.js    # CCS technology parameter definitions
│   ├── h2SimPayload.js     # H₂ simulation JSON payload factory functions
│   ├── ccsSimPayload.js    # CCS simulation JSON payload factory functions
│   └── h2SourceProfiles.js # Renewable resource profiles for H₂ electricity sources
├── hooks/                  # Custom React hooks
│   ├── useLocationManager.js   # Location/link CRUD + Haversine distance calculation
│   ├── useTechnologyManager.js # Technology assignment to locations
│   ├── useMapInteractions.js   # Map click events, pin/polyline mode
│   ├── usePolylineMode.js      # Link-drawing state machine
│   ├── useGeoServerData.js     # Parallel OSM layer fetching via GeoServer api
│   ├── useLocalOSMData.js      # OSM GeoJSON fetch from public/data/ (offline mode)
│   ├── useLoadedRegions.js     # Fetch regions loaded in GeoServer/PostGIS
│   └── useOSMLayerFilters.js   # Layer visibility state (persisted to localStorage)
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

## Python — `python/`

```
python/
├── calliope_runner.py          # Converts model JSON → Calliope YAML, runs solver, writes results JSON
├── calliope_service.py         # FastAPI HTTP wrapper around calliope_runner (port 5000)
├── requirements.txt            # Dependencies for calliope_runner.py
├── requirements.service.txt    # Additional dependencies for calliope_service.py
├── adapters/
│   ├── calliope_adapter.py     # Model-JSON → Calliope YAML conversion logic
│   ├── pypsa_adapter.py        # (experimental) PyPSA export adapter
│   └── osemosys_adapter.py     # (experimental) OSeMOSYS export adapter
└── services/
    └── tech_database.py        # Client for the OEO Technology Database API (port 8000)
```

---

## OSM processing — `osm_processing/`

See [OSM Data Processing — Overview](../osm-processing/overview.md) for the full description.
