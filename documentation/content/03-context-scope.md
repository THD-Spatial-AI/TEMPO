# Context & Scope
TEMPO is a standalone desktop application that mediates between three external domains: the user, the Calliope optimization framework, and geographic data sources.

## Business Context

The user interacts with the application exclusively through the graphical interface. The system accepts the following inputs from the user:

- Model configuration (locations, links, technologies, time series, parameters, scenarios)
- Requests to load or save models
- Requests to run the solver on a selected model
- Requests to visualize infrastructure data for a geographic region

The system produces the following outputs visible to the user:

- An interactive map view of the model topology overlaid on real geographic data
- A live log stream from the solver process during optimization
- A structured results view after a successful optimization run
- Calliope-compliant YAML files that the user can export and share

## Technical Context

The application interacts with the following external systems at runtime:

- **Calliope / Python solver process**: The Go backend spawns a Python subprocess running `calliope_runner.py`. All communication between the backend and the subprocess happens through the OS process interface (stdin/stdout) and two temporary JSON files.
- **Overpass API / Nominatim**: The Go backend issues HTTP requests to the public Overpass API endpoint and the Nominatim geocoding service to fetch live OSM data and resolve place names.
- **GeoServer (optional)**: When a local GeoServer instance is running, the frontend can load regional infrastructure tiles from it. This is configured through the application settings screen.
- **Geofabrik download server**: The OSM processing scripts fetch raw PBF files from `download.geofabrik.de` during the offline data preparation phase.
- **Map tile servers**: The MapLibre GL frontend loads background raster tiles from a configured tile provider (default: OpenStreetMap raster tiles).

At startup, the Electron main process launches the compiled Go backend binary as a child process. The frontend communicates with the backend exclusively via HTTP on localhost port 8082. The Electron preload script bridges Electron IPC events (such as Calliope job progress) between the main process and the renderer.