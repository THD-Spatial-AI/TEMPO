# Changelog

All notable changes to TEMPO are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-24

TEMPO v2 turns the single-engine modelling tool into a multi-engine energy
optimization platform — run one model on four local solvers or push it to a
remote server, with a rebuilt results dashboard and a far more forgiving import
pipeline.

### Added

- **PyPSA and OSeMOSYS engines** — both adapters are now fully supported, joining
  Calliope 0.6.8 / 0.7 and AdOpT-NET0. Engine and solver are selected per run and
  all four return the same frozen result contract, so every dashboard works
  unchanged across engines.
- **MEME remote execution** — send one canonical model to a remote MEME
  (Multi Energy Model Execution) server and have it translated and solved on
  PyPSA, Calliope 0.7, or AdOpT-NET0 without a local Python venv. Presents the
  same run/results surface as local engines via log polling.
- **Rebuilt results dashboard** — new tabbed analysis: Overview, Dispatch, Flow,
  Costs, Shadow prices, Analysis, Logs, and SPORES, plus transmission flow drawn
  on the results map and KPI cards.
- **Enhanced Calliope YAML importer** — imports 0.6.x / 0.7 models from a ZIP,
  folder, or loose YAML + CSV with recursive `import:` resolution and detailed
  warnings for missing timeseries.
- **CSV import wizard** — a guided, multi-step flow to build a full model
  (locations, links, technologies, scenarios, resource profiles) from spreadsheets.
- **Run and scenario management** — Active Jobs and Completed Runs panels, batch
  runs across selected scenarios and override groups, and a dedicated SPORES
  configuration panel (near-optimal alternatives, Calliope 0.6.8).
- **Shadow-price extraction and UI** (Calliope 0.7) plus custom math input.
- **TimeSeries editor** improvements — filterable data-table view, `data_table`
  source type, and storage initial-state configuration.
- **App settings** — default landing view and auto-save toggle; per-engine install
  panels in Settings.

### Changed

- Shared `engine_service_base.py` for the Python FastAPI runners.
- Makefile now orchestrates the combined npm + Go build.
- Landing page updated to v2 (engine lineup, "What's New in v2" section, download
  links).

### Under the hood

- Expanded test coverage: MEME format/client, YAML import, run service, and
  results-format modules.

## [1.0.0] - 2026-07-13

Initial public release.

- Electron desktop app for building, configuring, and running Calliope 0.6.8
  energy system models through a GIS-first GUI.
- Calliope 0.7 dual-engine support and AdOpT-NET0 integration.
- OpenStreetMap ingestion pipeline (Geofabrik + PostGIS + GeoServer) and
  interactive map-based model authoring.
- Timeseries editor, override/scenario engine, and SPORES mode.
- H₂ and CCS plant simulation services.

[2.0.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/v2.0.0
[1.0.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/release
