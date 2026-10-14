# Changelog

All notable changes to TEMPO are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2026-10-14

TEMPO 4 is a redesign and a wider reach. The whole app has a new look that matches
the website, you can build a regional model from nothing but a place name, and all
five engines now agree on the same models. Scenario Studio moves to a year-by-year
board, and What's new now shows the release notes right inside the app.

### Added

- **Study area from a place name** — search for a city, province or country and
  TEMPO finds the boundary, pulls substations and lines from OpenStreetMap and
  builds a zonal model. A network-builder wizard, voltage filtering and substation
  classification let you shape the result before it is imported.
- **Synthetic demand for substations** — regional demand is spread over the
  substations (evenly or weighted by voltage), and each one gets an hourly load
  shape. Shapes come from a built-in generator or, optionally, from `demandlib`
  (BDEW standard load profiles, including the BDEW25 sectors), with a preview
  before you apply them.
- **Scenario Studio year board** — scenarios are laid out year by year, with
  config cards nested inside year cards. Cards cover emissions caps and renewable
  targets, and boards are saved per model. A sequential-run toggle runs the years
  one after another. The scenario transformations also gain link-capacity and
  vintage-residual operations.
- **SPORES reproduction of Lombardi et al. (2020)** — a paper panel and a
  comparison script to check TEMPO's SPORES results against the published study.
  SPORES support is extended to the Calliope 0.7 engine and to MEME.
- **Calliope YAML import and MEME conversion** — richer import of existing
  Calliope models, and conversion of a TEMPO model to the MEME format.
- **What's new in the app** — release notes are read from the GitHub releases of
  the project, with a version picker for older releases.
- **Ollama gateway** — an optional service with API-key authentication and rate
  limiting, for sharing one local model with a team.
- **Interoperability page** on the website, with a table of what carries over
  between engines.

### Changed

- **New interface** — the app now follows the website's design (Inter, square
  corners, black and white, Material Symbols). The dashboard, tutorial, sidebar,
  map editor, data pages, Run, Export, Settings, Scenario Studio, Tech Library,
  Models and Results views, and the map legend were all redesigned.
- **Engines agree on the same model** — PyPSA, OSeMOSYS, AdOpT-NET0 and both
  Calliope versions now use the same cost, capacity and storage conventions
  (shared helpers in `engine_common.py`), and `scripts/verify_engines.py` checks
  them against each other. The OSeMOSYS export is a self-contained parity dataset
  that imports back without loss. AdOpT-NET0 now runs as a pure LP.
- **HiGHS** is the solver shown in the Run view.
- The map basemap was switched to avoid API limits, and `maplibre-gl` is now 6.x.
- The Go backend's Overpass client caches power-grid queries for 10 minutes.
- Dependencies were updated, including Go modules, `react-map-gl` and the
  `shell-quote` override.

### Fixed

- The Model Advisor report and chat are kept when you switch tabs in Results.
- API keys are trimmed before they are saved, so a pasted trailing space no
  longer breaks a provider.
- Duplicate `removeLink` export in the location manager hook.
- Result maps no longer fail to load with `maplibre-gl` 6, which changed how the
  module is exported.
- Stray text in the sidebar, and development setup on Linux.

## [3.1.0] - 2026-08-27

TEMPO 3.1 introduces **Model Advisor** — an in-app assistant that turns a run's
results into a plain-language report and answers follow-up questions, helping
modellers interpret outcomes and decide what to change next. It runs on an LLM
provider of your choice (a cloud service or a local model on your own hardware);
no key or model is bundled, and model data is sent off-device only when you use
the feature.

### Added

- **Model Advisor** — a new tab in the Results view that auto-generates a
  structured report (what the solver decided, the key trade-offs, and
  recommendations) and provides a chat to ask questions about the selected run.
  Every statement is grounded in the run's frozen result contract, and the
  assistant also critiques the model's input assumptions (costs, potentials,
  efficiencies), not just the outcome.
- **Bring-your-own-key, multi-provider support** — Anthropic (Claude),
  Google (Gemini), OpenAI, any OpenAI-compatible endpoint, **Groq** (free tier),
  and **Ollama** for a local model. Provider, model, and key are configured in
  Settings → Model Advisor.
- **Local / private inference (Ollama)** — needs no API key and keeps model data
  on your own hardware; point it at localhost or another machine on your network,
  with a built-in connection test and troubleshooting hints.
- **Context controls** — a live token estimate plus "Data sent" caps to
  downsample the dispatch series, limit to the top-N capacity/cost keys, and
  include or exclude the model-input digest, so large models fit within a
  provider's context window.

### Security & Privacy

- API keys are stored **encrypted at rest** in the Electron main process
  (`safeStorage`); the renderer only ever sees a provider id and a `hasKey` flag.
  All provider calls run in the main process (no keys in the DOM, no CORS). Model
  data leaves the device only when the feature is used — and never when a local
  (Ollama) provider is selected.

### Fixed

- Reports to "thinking" models (Gemini 2.5 / 3 Flash) no longer return an empty
  response or time out on large contexts: the output-token budget reserves
  headroom for server-side reasoning and the response timeouts were raised.
- Transient provider errors (HTTP 429 / 500 / 502 / 503 / 504) are now retried
  automatically with exponential backoff.
- A base URL configured for one provider can no longer leak into another —
  fixed-endpoint providers ignore a stale base URL.

## [3.0.0] - 2026-08-25

TEMPO v3 builds a scenario-analysis and reporting layer on top of the v2
multi-engine core: design policy scenarios from reusable recipes, compare many
runs side by side, and export publication-ready maps, charts, and data.

### Added

- **Scenario Studio** — a policy-recipe library that replaces hand-built
  overrides for common studies. Ships demand growth, renewable transition,
  carbon cap, and cost sensitivity recipes (each with tests), configured through
  a guided UI and applied across engines.
- **Multi-model comparison** — a multi-model matrix view with selectable KPIs and
  a heatmap, plus a BatchComparison panel for visualising results across many
  jobs at once.
- **New results metrics** — unmet-demand and imports metrics extracted into the
  frozen contract and surfaced as KPIs, including demand metrics broken down by
  location.
- **Choropleth maps** — RegionChoropleth visualisation of demand metrics with
  bundled commune GeoJSON for regional (e.g. Chile) models.
- **Export overhaul** — a dedicated results export panel with live map previews;
  SVG generation for node/transmission maps and capacity, generation, and
  technology-mix maps; choropleth SVG export; and resultCharts / resultExports
  utilities for downloadable charts and data (JSON / CSV).
- **Custom operations editor** with per-engine capability warnings.
- **Tech Library panel** — enhanced technology management backed by the public
  tech database API.
- **Engine-neutral technology parameters** — a new parameter-ontology editor in
  the Creation view lets you set common technology values (capacity, efficiency,
  lifetime, CAPEX…) once and have them translated automatically to each engine.
  A single source of truth (`parameterOntology.json`) is shared by the JS UI and
  the Python translators (PyPSA / OSeMOSYS / AdOpT-NET0), with an opt-in
  Engine-specific panel for raw fields unique to one framework.
- **Shared running-jobs management** across the Run and Scenario Studio views.

### Changed

- **Simplified Creation sidebar** — location placement is now a single
  "Add Location" action (the separate Single/Multiple modes were removed).

- **MEME remote execution** — added a MEME server proxy and engine-specific
  handling (e.g. `allow_unmet_demand`) in the canonical model conversion, with
  improved contract fetching and time handling.
- **Calliope 0.7 importer** — root detection and user selection when a ZIP
  contains multiple models, plus translation/import fixes.
- Native Python virtual-environment setup and installation commands.
- Backend PID handling and production/development API URL resolution.
- Go toolchain updated to 1.26.6 with refreshed module dependencies.

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

[4.0.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/v4.0.0
[3.1.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/v3.1.0
[3.0.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/v3.0.0
[2.0.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/v2.0.0
[1.0.0]: https://github.com/THD-Spatial-AI/TEMPO/releases/tag/release
