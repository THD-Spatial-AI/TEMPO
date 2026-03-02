# Risks & Technical Debt
## Risk 1: Calliope API Compatibility

**Description**: The Python runner is written against the Calliope 0.7 API. Upstream breaking changes to the Calliope Python API would require updates to `calliope_runner.py` and potentially to the YAML export logic in the frontend.

**Likelihood**: Medium -- the Calliope project is under active development.

**Impact**: High -- the optimization feature would be non-functional until the runner is updated.

**Mitigation**: Pin the Calliope version in the conda environment setup scripts. Maintain an automated smoke test that runs a minimal model end-to-end.

## Risk 2: Conda Environment Detection

**Description**: The Electron main process searches a fixed list of candidate paths to locate the conda executable. On non-standard installations the search may fail, leaving the user unable to run models.

**Likelihood**: Medium.

**Impact**: Medium -- the rest of the application remains functional; only the solver is unavailable.

**Mitigation**: The SetupScreen component allows the user to manually specify the Python executable path. This path is persisted in electron-store.

## Risk 3: Large OSM Data Sets

**Description**: For large geographic regions (e.g. entire countries), the PBF extraction and PostGIS import steps can take hours and require tens of gigabytes of disk space.

**Likelihood**: High if users try to load continental-scale data.

**Impact**: Low for correctness, but may degrade user experience and fill disk space unexpectedly.

**Mitigation**: Document recommended region sizes. The OSM extraction scripts print progress output and can be interrupted and resumed.

## Technical Debt 1: Duplicated YAML Conversion Logic

The logic for converting the frontend model JSON to Calliope YAML exists in two places: `calliope_runner.py` (authoritative, used for running) and the frontend export components (`ExportCalliope.jsx`). These can drift out of sync. The preferred resolution is to move the conversion entirely into the Python runner and have the frontend export endpoint call the backend, which in turn invokes the runner in a dry-run mode.

## Technical Debt 2: No Automated Tests

There are currently no unit or integration tests for either the Go backend or the React frontend. The risk of regressions during refactoring is therefore high. Priority areas for test coverage are the storage layer, the YAML conversion in the runner, and the model save/load round-trip.

## Technical Debt 3: Electron Version Pinning

The project is pinned to Electron 40.x. Security and Chromium updates in newer Electron versions should be adopted regularly but require regression testing of the Electron IPC channels.