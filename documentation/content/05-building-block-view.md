# Building Block View
## Level 1 -- System Overview

The system is divided into four top-level subsystems that together form the application:

- **Electron Host** manages the application lifecycle, spawns child processes, handles OS-level events (window management, file dialogs), and bridges IPC messages between the Go backend and the React renderer.
- **React Frontend** provides the complete user interface. It is a standard single-page application that communicates with the Go backend via a local HTTP API.
- **Go Backend** is a REST API server responsible for persistence, job management, and integration with external geographic data sources.
- **Python Runner** is a standalone script invoked as a subprocess by the Go backend. It converts the model JSON to Calliope YAML and runs the solver.

## Level 2 -- React Frontend

The frontend is organized around the following component groups:

- **Model Management** (`Models.jsx`, `ModelSelector.jsx`, `CalliopeModels.jsx`): creation, listing, selection, and deletion of models persisted in the backend.
- **Map View** (`Map.jsx`, `MapDeckGL.jsx`, `MapView.jsx`, `MapToolbar.jsx`): interactive map built on MapLibre GL and Deck.gl showing model locations, transmission links, and OSM infrastructure layers.
- **Data Entry** (`Locations.jsx`, `Links.jsx`, `Technologies.jsx`, `Parameters.jsx`, `TimeSeries.jsx`, `Scenarios.jsx`, `Overrides.jsx`, `Configuration.jsx`): form-based screens for editing every section of a Calliope model.
- **Import / Export** (`BulkImport.jsx`, `Export.jsx`, `CSVUploader.jsx`): CSV bulk import for locations and links, and export to YAML or ZIP.
- **Solver Integration** (`Run.jsx`, `Results.jsx`): job submission, live log streaming, and results visualisation.
- **OSM Tools** (`OsmInfrastructurePanel.jsx`, `GeoServerRegionSelector.jsx`, `RegionSelectionStepper.jsx`): region selection and display of real power infrastructure data on the map.
- **Shared UI** (`Dashboard.jsx`, `Sidebar.jsx`, `Notification.jsx`, `ErrorBoundary.jsx`, `Tutorial.jsx`, `ModelStructureTutorial.jsx`, `SetupScreen.jsx`): navigation chrome, notifications, and onboarding screens.

Global application state is managed through React Context providers located in `src/context/`.

## Level 2 -- Go Backend

The backend is structured into the following internal packages:

- **api** (`internal/api/server.go`): Gin HTTP router and all route handlers. Handles CORS, request parsing, and response serialization.
- **storage** (`internal/storage/`): SQLite wrapper. Manages model records and job state.
- **models** (`internal/models/`): Go data structures shared between the API and storage layers.
- **calliope** (`internal/calliope/`): Logic for preparing solver input files and parsing result files in the context of the job lifecycle.
- **overpass** (`internal/overpass/`): HTTP client for the Overpass API that retrieves power infrastructure features (substations, power plants, lines) as GeoJSON.
- **geoserver** (`internal/geoserver/`): Optional integration for publishing and querying vector layers from a GeoServer instance.

## Level 2 -- Python Runner

`python/calliope_service.py` is a FastAPI HTTP service (port 5000) that exposes the optimization engine over REST. On receiving a POST request with a model YAML and run configuration, it delegates to `calliope_runner.py`, which:

1. Parses the model YAML and validates parameters.
2. Writes a temporary Calliope YAML structure to a working directory.
3. Calls the Calliope Python API to run the optimization.
4. Serializes the optimization results to a JSON response.
5. Emits tagged log lines (`[CALLIOPE] ...`) as Server-Sent Events, which the Go backend forwards to the Electron renderer.

The `python/adapters/calliope_adapter.py` module contains the conversion logic from the application's model JSON to Calliope YAML. Alternative adapters for PyPSA and OSeMOSYS exist in the same package (experimental).