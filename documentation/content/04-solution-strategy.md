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

## Python Runner as a Thin Adapter

Rather than embedding Calliope's Python API calls inside the Go backend through a bridging mechanism, a dedicated Python script (`calliope_runner.py`) acts as an adapter. The script accepts a JSON model definition on disk, converts it to the YAML structure expected by Calliope, runs the optimization, and writes a JSON result file. This keeps the interface between Go and Python minimal and easy to test in isolation.

## Technology Templates as Static YAML

Predefined technology configurations (renewable, conventional, storage, transmission, hydrogen, demand) are stored as static YAML template files in the `techs/` directory. The frontend reads these at startup and presents them as a selectable library. This makes it easy to add or update technology definitions without touching application code.