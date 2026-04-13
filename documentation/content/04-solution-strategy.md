# Solution Strategy

The key technical decisions that shape the architecture are summarised here together with the rationale behind each choice.

## Multi-process Desktop Architecture

The application is structured as three cooperating processes managed by an Electron host:

1. A **Go HTTP server** that owns all persistent state and orchestrates solver jobs.
2. A **Vite/React renderer** loaded in the Electron BrowserWindow as a local HTML page.
3. A **Python subprocess** that executes the Calliope optimization on demand.

This separation was chosen so that the React frontend remains a pure single-page application with no coupling to Electron APIs. The same frontend bundle can also be served as a conventional web application (development mode with `npm run dev`) without any modification.

## Go for the Backend

The backend was implemented in Go rather than Node.js or Python for two reasons. First, a single compiled binary with no external runtime simplifies packaging and startup. Second, Go's goroutine model makes it straightforward to run multiple solver jobs concurrently while keeping the HTTP server responsive.

## SQLite for Persistence

All model data is stored in a single SQLite file located in the Electron user-data directory. SQLite was selected because it requires no server process, survives application restarts, and is trivially portable (the database is a single file the user can copy or back up).

## React and Vite for the Frontend

The user interface is built with React 19 and bundled by Vite. Tailwind CSS is used for styling to avoid shipping a large CSS framework and to keep component styles co-located with their JSX. Deck.gl and MapLibre GL handle the map rendering layer, chosen because they support both raster tiles and custom GeoJSON layers with acceptable performance for the expected model sizes.

## Python Runner as an HTTP Adapter

Rather than embedding Calliope's Python API calls inside the Go backend, a dedicated Python service (`calliope_service.py`) acts as an HTTP adapter. The service is a FastAPI application that:

1. Accepts a multipart POST request containing the model YAML and run configuration.
2. Delegates to `calliope_runner.py` in a worker thread, which converts parameters and calls the Calliope Python API.
3. Streams tagged log lines (`[CALLIOPE] ...`) as Server-Sent Events while the solver runs.
4. Returns the full result JSON when the job completes.

This keeps the Go-to-Python interface a simple REST contract and allows the solver service to be deployed as a Docker container (`docker-compose.yml`) independently from the Electron host. The service can also be run locally via `uvicorn` during development.

## Technology Library in the Frontend

Predefined technology configurations (renewable, conventional, storage, transmission, hydrogen, demand, CCS) are defined as JavaScript data structures in `src/components/TechnologiesData.js`. The frontend reads these at startup and presents them as a selectable library. They can optionally be enriched at runtime by a local OEO Technology Database API service on port 8005, which supplies up-to-date techno-economic parameters aligned with the Open Energy Ontology. This separation makes it easy to add or update technology definitions without touching the backend or deployment configuration.