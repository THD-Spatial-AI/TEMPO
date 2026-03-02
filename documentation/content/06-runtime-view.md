# Runtime View
## Scenario 1 -- Application Startup

When the user launches the packaged desktop application:

1. Electron loads `electron/main.cjs` and creates the main `BrowserWindow`.
2. The main process locates the compiled Go backend binary and spawns it as a child process, passing the user-data SQLite path and port 8082.
3. The main process polls `http://localhost:8082/api/health` until the backend responds, then loads the frontend HTML into the BrowserWindow.
4. The React application initialises, fetches the list of existing models from the backend (`GET /api/models`), and renders the home screen.

## Scenario 2 -- Creating and Saving a Model

1. The user fills in location, link, and technology forms in the React UI.
2. On save, the frontend serialises the entire model state to JSON and sends a `POST /api/models` (new) or `PUT /api/models/:id` (update) request to the backend.
3. The Go backend stores the JSON blob in the SQLite `models` table and returns the assigned model ID.
4. The frontend updates its context state with the returned ID and displays a success notification.

## Scenario 3 -- Running an Optimization

1. The user clicks the Run button on the Run screen.
2. The frontend sends `POST /api/models/:id/run` to the Go backend.
3. The backend writes the model configuration to a temporary JSON file and spawns `calliope_runner.py` as a Python subprocess, passing the paths of the input and output files.
4. The runner converts the JSON to Calliope YAML, invokes the solver, and streams tagged log lines to stdout.
5. The Electron main process captures stdout from the Python subprocess and forwards each line to the renderer via `ipcRenderer` as a `calliope-log` event.
6. The Run screen in the frontend subscribes to these IPC events and appends each line to the live log display.
7. When the runner exits, the backend reads the output JSON file, stores the results, and marks the job as completed.
8. The frontend polls `GET /api/jobs/:id` until the job status changes to finished, then navigates to the Results screen.

## Scenario 4 -- Loading OSM Infrastructure Layers

1. The user opens the OSM Infrastructure panel and selects a geographic region.
2. The frontend sends a `GET /api/osm/:layer` request with bounding-box query parameters to the Go backend.
3. The backend forwards the query to the public Overpass API, parses the response, and returns a GeoJSON feature collection.
4. The MapDeckGL component adds the GeoJSON as a new Deck.gl layer and renders icons for substations, plant markers, and polylines for power lines.

## Scenario 5 -- Exporting a Model

1. The user opens the Export screen and selects the export format (YAML or ZIP).
2. The frontend fetches the full model from `GET /api/models/:id`.
3. The `ExportCalliope.jsx` component calls a utility function that assembles the Calliope YAML structure in memory using the same conversion logic mirrored from the Python runner.
4. For a ZIP export, all YAML files and referenced time series CSVs are collected into a JSZip archive and downloaded via `file-saver`.