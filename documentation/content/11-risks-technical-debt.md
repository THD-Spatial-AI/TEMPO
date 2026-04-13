# Risks & Technical Debt
## Risk 1: Calliope API Compatibility

**Description**: The Python runner is written against the Calliope 0.7 API. Upstream breaking changes to the Calliope Python API would require updates to `calliope_runner.py` and potentially to the YAML export logic in the frontend.

**Likelihood**: Medium -- the Calliope project is under active development.

**Impact**: High -- the optimization feature would be non-functional until the runner is updated.

**Mitigation**: Pin the Calliope version in the conda environment setup scripts. Maintain an automated smoke test that runs a minimal model end-to-end.

## Risk 2: Calliope Runner Service Availability

**Description**: The Go backend requires the Calliope runner service (`calliope_service.py`) to be running on `localhost:5000` to execute solver jobs. If the service is not started (or Docker is not running), job submissions fail.

**Likelihood**: Medium — the service must be started manually or via Docker Compose before submitting a run.

**Impact**: Medium — the rest of the application (model editing, map, OSM data) remains fully functional; only the solver is unavailable.

**Mitigation**: Surface a clear status indicator in the Run screen showing whether the service is reachable. The `docker-compose.yml` includes a healthcheck. In the desktop distribution, document that the service must be started as a prerequisite.

## Risk 3: Large OSM Data Sets

**Description**: For large geographic regions (e.g. entire countries), the PBF extraction and PostGIS import steps can take hours and require tens of gigabytes of disk space.

**Likelihood**: High if users try to load continental-scale data.

**Impact**: Low for correctness, but may degrade user experience and fill disk space unexpectedly.

**Mitigation**: Document recommended region sizes. The OSM extraction scripts print progress output and can be interrupted and resumed.

## Technical Debt 1: Duplicated YAML Conversion Logic

The logic for converting the frontend model JSON to Calliope YAML exists in two places: `python/adapters/calliope_adapter.py` (authoritative, used for running) and the frontend export component (`src/components/Export.jsx`). These can drift out of sync. The preferred resolution is to remove the frontend conversion entirely and have the export endpoint call the backend, which in turn invokes the runner service in a dry-run mode.

## Technical Debt 2: No Automated Tests

There are currently no unit or integration tests for either the Go backend or the React frontend. The risk of regressions during refactoring is therefore high. Priority areas for test coverage are the storage layer, the YAML conversion in the runner, and the model save/load round-trip.

## Technical Debt 3: Electron Version Pinning

The project is pinned to Electron 40.x. Security and Chromium updates in newer Electron versions should be adopted regularly but require regression testing of the Electron IPC channels.