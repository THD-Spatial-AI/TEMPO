# Crosscutting Concepts
## Error Handling and User Feedback

All API calls from the frontend are wrapped in try/catch blocks. On failure the application dispatches an error action to the global notification context, which renders a dismissible error banner. Long-running operations (model save, job polling) provide loading indicators. The `ErrorBoundary.jsx` component catches unexpected React render errors and presents a recovery screen instead of a blank page.

## Logging

The Go backend logs to stdout, which Electron captures and writes to the application log file via Electron's built-in logger. The Python runner prefixes every log line with `[CALLIOPE]` so the Electron main process can filter and forward solver-specific messages to the renderer as IPC events. This tagging convention is the main integration contract between the runner and the host.

## CORS

The Go backend applies a permissive CORS policy (allow all origins) for all routes. This is intentional because the only client is the Electron renderer, which loads from a `file://` origin in production. A restrictive policy would block all requests without providing any security benefit in this deployment model.

## Data Validation

Model data is validated at two points: in the frontend form components (required fields, numeric ranges) using React-controlled inputs, and in the Python runner before the Calliope API is called. The runner prints a structured error message tagged `[CALLIOPE]` if validation fails, which the frontend displays in the run log.

## CSV Handling

CSV files are parsed both in the frontend (PapaParse library, for preview and upload) and in the Python runner (pandas, for constructing Calliope time series data frames). The expected format is a header row in the first line, a datetime index in the first column, and numeric values in subsequent columns.

## Configuration Management

User preferences (backend port, GeoServer URL, Conda environment name) are stored using `electron-store`, which writes a JSON file in the user-data directory. Settings are read by the Settings screen and injected into the Electron main process where needed to launch child processes with the correct parameters.

## Packaging and Code Splitting

Vite is configured to produce a single minified bundle for the renderer. No code splitting is applied because the application is distributed as a desktop installer and load time is not a concern. The Go binary is linked statically so it has no shared-library dependencies on the target machine.