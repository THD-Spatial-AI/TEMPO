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
│   ├── Settings.jsx        # Application settings screen
│   ├── SetupScreen.jsx     # First-run Python environment setup
│   ├── Sidebar.jsx         # Navigation sidebar
│   ├── Notification.jsx    # Toast notification component
│   ├── ErrorBoundary.jsx   # React error boundary
│   ├── Tutorial.jsx        # In-app tutorial overlay
│   ├── ModelStructureTutorial.jsx  # Model structure guided tour
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
    └── tech_database.py        # Client for the OEO Technology Database API (port 8005)
```

---

## OSM processing — `osm_processing/`

See [OSM Data Processing — Overview](../osm-processing/overview.md) for the full description.
