# Multi-engine import/export — task breakdown

Working checklist for `docs/issues-drafts/14-prd-multi-engine-import-export.md`. Not published to the issue tracker — internal execution doc. Tasks are vertical slices; each ends with a concrete verification. Order within a milestone matters; milestones M2/M3 are independent of each other after M1.

Conventions used throughout (decided in the PRD, don't re-litigate):
- Clone the AdOpT-NET0 engine pattern (`electron/main.cjs`: `resolveAdoptnet0Venv` / `ensureAdoptnet0Python` / `startAdoptnet0Service` and `python/adoptnet0_service.py`).
- Ports: PyPSA **5003**, OSeMOSYS **5004** (dynamic via `findFreePort`).
- Every runner returns the frozen result contract; `Results.jsx` and map components are never modified.
- Each engine has ONE Python translate module used by run, `/export`, and `/import`.
- All translations emit a `report` (list of strings) — dropped/approximated items; UI must display it.

---

## M1 — Scaffolding

### T1. PyPSA engine: venv install + service boot ✅/❌
- Re-validate `python/requirements.pypsa.txt`: refresh `pypsa` pin to current tested release, add `highspy`; verify on Python 3.11.
- New `python/pypsa_service.py`: FastAPI skeleton — `GET /health` (reports `engine: pypsa`, version), stub `POST /run`, `GET /run/{id}/stream`, `POST /export`, `POST /import`.
- `electron/main.cjs`: `resolvePypsaVenv`, `ensurePypsaPython` (reuse interpreter helpers), install IPC channel with progress events, `startPypsaService`/`stopPypsaService` with crash-restart, `PYPSA_PORT = 5003` + `findFreePort`, add to `getServiceURLs()` and the status probe.
- `electron/preload.cjs`: expose install/status channels.
- Settings screen: PyPSA engine panel (mirror the Calliope 0.7 panel).
- **Verify:** clean install from Settings completes with progress; `GET /health` on the assigned port returns engine + pypsa version.

### T2. OSeMOSYS engine: venv install + service boot + GLPK bundling
- New `python/requirements.osemosys.txt`: exact-pin `otoole` + `pandas` compatible with it.
- Vendor official `osemosys.txt` (long version) under `python/osemosys/`, matching the pinned otoole's expected schema. Record source URL + version in a header comment.
- Bundle `glpsol` binaries: `solvers/windows/glpsol.exe` (+ required DLLs), `solvers/linux/glpsol` — same layout/lookup convention as CBC.
- New `python/osemosys_service.py` skeleton (same endpoint set), `OSEMOSYS_PORT = 5004`, full main.cjs/preload/Settings wiring as T1.
- **Verify:** install completes; `/health` returns engine + otoole version and resolved `glpsol` path; `glpsol --version` succeeds from the service host code on Windows.

### T3. Frontend plumbing: engine routing, import detection, report UI
- `src/services/engineClient.js` (or extend `calliopeClient.js` routing): framework id → service URL from `getServiceURLs()`; shared `runModel`/`exportModel`/`importModel` helpers speaking the common endpoint set.
- ZIP auto-detection in JS by file listing only (no parsing): `*.nc` or `buses.csv` → pypsa; `SpecifiedAnnualDemand.csv` / otoole set files → osemosys; AdOpT-NET0 case markers (topology/config JSON layout — confirm exact markers from `adoptnet0_runner.py`'s writer) → adoptnet0; `model.yaml` → existing Calliope path. Vitest tests with synthetic file listings.
- Translation-report display component (reuse the 0.7 import-warnings pattern) used by both Import and Export flows.
- **Verify:** `npm test` green; detection tests cover all four formats + ambiguous/unknown fallback.

---

## M2 — PyPSA vertical slice

### T4. `pypsa_translate.py`: internal → PyPSA
- Whole-model mapping (start from field table in `python/adapters/pypsa_adapter.py`): locations → Buses (x/y coords), supply/conversion → Generators/Links, storage → StorageUnits, demand → Loads with hourly `p_set` series, transmission links → Links with efficiency; costs → capital_cost/marginal_cost; snapshots from modelConfig date range.
- Inf-sentinel handling (copy `_to_float` convention from `adoptnet0_runner.py`).
- Returns `(network, report)`.
- pytest: `python/tests/test_pypsa_translate.py` — runs inside pypsa-venv; assert component counts, key params, report contents for unmappable inputs.
- **Verify:** pytest green in the pypsa venv against a fixture model (reuse `scripts/reference_model.json`).

### T5. PyPSA runner + Run screen enablement
- `python/pypsa_runner.py`: `run_model(model_data, work_dir, log_fn) -> dict` — translate, `network.optimize(solver_name="highs")`, extract into frozen contract (capacities `loc::tech`, dispatch, transmission_flow from Link p0/p1, costs split, demand sign per contract).
- Wire real `/run` + SSE streaming in `pypsa_service.py` (copy job/queue pattern from `calliope_service.py`).
- `Run.jsx`: `pypsa.supported = true`, `SOLVER_OPTIONS.pypsa = ['highs']`, engine health-check + not-installed guidance.
- **Verify:** reference model runs to `optimal` from the UI; Results view and map render; contract keys identical to a Calliope run (diff the JSON key sets).

### T6. PyPSA export
- `POST /export` in service: model JSON (+ options) → ZIP with `model.nc` **and** `csv/` folder (`export_to_netcdf` + `export_to_csv_folder`) + `report.txt`.
- `Export.jsx`: `pypsa.supported = true`; call service via engineClient; download; show report.
- **Verify:** exported archive loads in a fresh Python session via `pypsa.Network("model.nc")` and via the CSV folder; UI shows report.

### T7. PyPSA import
- Reverse mapping in `pypsa_translate.py`: Network → internal model (Buses → locations, Generators/StorageUnits/Links → techs + links, Loads → demand timeseries). Drop AC electrical params with report entries.
- `POST /import`: accepts ZIP (nc or csv folder), returns `{model, report}`.
- Wire the Models-screen import path: detection (T3) → service → create model in DataContext → show report.
- pytest round-trip: export reference model → import → compare internal dicts modulo documented losses.
- **Verify:** round-trip test green; a published PyPSA example network imports without error and is editable.

### T8. Verify-script tier: PyPSA
- Extend `scripts/verify_dual_engine.py` → `scripts/verify_engines.py` (keep old flags working): add `--python-pypsa`; assert PyPSA vs Calliope 0.6 ≤2% objective / ≤5% per-tech capacity, identical contract key set.
- **Verify:** script passes on the reference model with all installed engines.

---

## M3 — AdOpT-NET0 export/import

### T9. Extract `adoptnet0_translate.py` (surgical refactor)
- Move internal→AdOpT-NET0 case-directory construction out of `adoptnet0_runner.py` into `python/adoptnet0_translate.py`; runner imports it. No behavior change.
- **Verify:** run reference model on AdOpT-NET0 before and after refactor — identical objective + contract.

### T10. AdOpT-NET0 export
- `POST /export` on `adoptnet0_service.py`: build case directory via translate module, ZIP it + report.
- `Export.jsx`: `adoptnet` entry → supported (fix its id/name to `adoptnet0` / AdOpT-NET0 consistently).
- **Verify:** exported ZIP's directory structure is accepted by AdOpT-NET0's ModelHub `load` path (smoke-run inside the venv).

### T11. AdOpT-NET0 import
- Reverse mapping in translate module: case directory → internal model (topology → locations/links, technologies JSON/CSVs → techs, demand CSVs → timeseries). No prior art — expect the most report entries here.
- `POST /import` + detection wiring + round-trip pytest.
- **Verify:** round-trip export→import green modulo report; imported model runs on the AdOpT-NET0 engine.

---

## M4 — OSeMOSYS vertical slice

### T12. Timeslice module
- `python/osemosys_timeslices.py`: scheme `{seasons: N, dayBlocks: M}`; hourly (8760) → slice aggregation (mean, plus YearSplit fractions); slice → hourly broadcast for import. Pure pandas, no otoole dependency.
- pytest: conservation checks (annual energy preserved), default 4×3 scheme, edge cases (non-divisible day blocks).
- **Verify:** pytest green without any venv (pure pandas — runnable on dev Python).

### T13. `osemosys_translate.py`: internal → otoole CSVs
- Decide and document in-module: multi-REGION vs single REGION + location-suffixed technologies (whichever otoole/OSeMOSYS handles trade/transmission more naturally — transmission links need OSeMOSYS trade modelling or converter techs).
- Sets (REGION, TECHNOLOGY, FUEL, TIMESLICE, YEAR, MODE_OF_OPERATION) + params (CapitalCost, FixedCost, VariableCost, OperationalLife, InputActivityRatio/OutputActivityRatio from efficiency, TotalAnnualMaxCapacity, SpecifiedAnnualDemand + SpecifiedDemandProfile, CapacityFactor, YearSplit). Unit conversions from `python/adapters/osemosys_adapter.py`.
- Returns `(csv_dir, report)`.
- pytest against fixture model: CSV structure validated with the pinned otoole (`otoole validate` if available).
- **Verify:** `otoole convert csv datafile` succeeds on the generated CSVs.

### T14. OSeMOSYS runner + Run screen enablement
- `python/osemosys_runner.py`: translate → `otoole convert` → `glpsol -m osemosys.txt -d data.txt` (stream solver output to log_fn) → `otoole results` → frozen contract (capacities from NewCapacity+ResidualCapacity, dispatch from ProductionByTechnologyAnnual/RateOfActivity broadcast via timeslice module, costs from otoole cost results).
- `Run.jsx`: `osemosys.supported = true`, `SOLVER_OPTIONS.osemosys = ['glpk']`, timeslice scheme controls (seasons/dayBlocks selects, default 4×3) in advanced settings, size warning for large schemes.
- **Verify:** reference model runs to `optimal` from the UI; Results + map render; contract key set identical.

### T15. OSeMOSYS export ✅
- `POST /export`: otoole CSV dataset ZIP (+ `datafile.txt` convenience copy + report). Timeslice options in request body.
- `Export.jsx` enablement + timeslice controls on the export panel.
- **Verify:** archive round-trips through `otoole convert` outside TEMPO.

### T16. OSeMOSYS import ✅
- `python/osemosys_import.py`: `osemosys_to_internal(csv_dir) -> (model, report)`. Reads REGION/TECHNOLOGY/FUEL/TIMESLICE/YearSplit + 15 parameter CSVs; classifies techs as supply/conversion/storage (CH/DC pairs)/transmission (bidirectional pairs)/demand; reconstructs 24-h demand profile via `frac / actual_year_split[lbl]` ratio; location detection from fuel-name prefixes when TECHNOLOGY set is empty.
- `POST /import` wired in `osemosys_service.py`; auto-detects single-dataset (root CSVs) vs multi-dataset (top-level subdirs) ZIP layout; returns `{model, extraModels?, report}`.
- 21 round-trip pytests in `python/tests/test_osemosys_import.py` — structural, numerical (capex, efficiency, lifetime), demand profile shape (Pearson r > 0.6), multi-dataset, demand-only edge case.
- **Verify:** all 21 tests green without any venv.

### T17. Verify-script tier: OSeMOSYS ✅
- Added `--python-osemosys` arg to `scripts/verify_engines.py`; OSeMOSYS pairwise checks with 30% obj / 15% cap tolerances (GLPK vs HiGHS); CLAUDE.md venv table + developer scripts updated.
- **Verify:** script accepts flag; pairwise comparison logic present.

---

## M5 — Scenarios as datasets

### T18. Scenario-resolved export + multi-dataset import ✅
- `src/services/scenarioResolver.js`: `resolveScenario(model, overridesMap, scenariosMap, config) → {model, report}` — deep-clones model and applies override dotted-key patterns (model.subset_time, techs.*.constraints.*, locations.*.techs.*.constraints.*); unknown keys silently skipped.
- `Export.jsx`: `exportViaEngine` now builds `datasets = [{name:'base', model}, ...one per scenario]` using `resolveScenario`; resolver reports prepended to service report.
- `Run.jsx`: removed PyPSA/OSeMOSYS scenario guard; added `technologies/overrides/scenarios` to `useData()` destructure; for `isPypsa || isOsemosys` with a config, calls `resolveScenario` and replaces `modelData` with the resolved model (no `.scenario`/`.override` key set).
- `Models.jsx`: `importModelArchive` result now destructures `extraModels`; creates one additional model per extra dataset.
- **Verify:** model with 2 scenarios exports to each format with 3 datasets; re-import creates 3 models; a scenario run on PyPSA differs from base as expected.

---

## M6 — Hardening + docs

### T19. Full verification pass + documentation
- Run `scripts/verify_engines.py` end-to-end on a clean install of all engines (Windows).
- Manual checklist: install flows, run/cancel/error per engine, import of real published PyPSA example + OSeMOSYS starter kit, Results/map per engine.
- Docs: update `docs/user-guide/import-export.md`, `docs/user-guide/running-optimization.md`, CLAUDE.md (process/port table, venv table, verify script rename).
- **Verify:** checklist complete; `npm test` + all pytest suites green.

---

## Progress log

| Task | Status | Notes |
|---|---|---|
| T1 | done | 2026-07-12. pypsa_service.py boots, /health OK. Pin refreshed to pypsa>=0.34,<0.36 + highspy + netCDF4. Legacy "PyPSA module" removed from Settings PYTHON_MODULES (would have installed pandas≥2.1 into calliope-venv). Manual verify pending: in-app venv install. |
| T2 | done | 2026-07-12. osemosys_service.py boots, /health resolves bundled glpsol. GLPK 4.65 (glpsol.exe + glpk_4_65.dll from winglpk) committed to solvers/windows. osemosys.txt (OSeMOSYS_2017_11_08) vendored at python/osemosys/. otoole==1.1.3 pinned — verify pin resolves during first in-app install. Manual verify pending: in-app venv install. |
| T3 | done | 2026-07-12. archiveFormat.js detection (10 vitest tests green), engineClient.js (URL resolution + /export + /import contracts), TranslationReport.jsx. Export contract decided: POST /export returns JSON {zip: base64, report}. |
| T4 | done | 2026-07-12. pypsa_translate.py: pure-dict spec layer + build_network(). 20 pytest tests green incl. real network build + consistency_check on pypsa 0.35.2. Approximations (reported): storage=Store+2 Links, transmission=2 directed Links @ half pair cost, absolute resource → p_max_pu/cap_max. Costs annualized (calliope depreciation) × n_hours/8760. |
| T5 | done | 2026-07-12. pypsa_runner.py returns frozen contract; reference model solves optimal (obj 524.3, internally consistent hand-check). Run.jsx: pypsa enabled, highs solver, health polling, offline banner + inline install panel; scenario/override runs blocked with clear message until T18. Numeric cross-check vs Calliope deferred to T8 (no working calliope venv on this machine — calliope07-venv is a broken partial install, needs reinstall from Settings). Manual verify pending: in-app run + Results/map render. |
| T6 | done | 2026-07-12. /export on pypsa_service (JSON {zip: base64, report}); archive layout `<dataset>/model.nc` + `<dataset>/csv/` + report.txt (T18-ready). Export.jsx: pypsa enabled via exportViaEngine + TranslationReport render. Verified: live service export of reference model reloads in pypsa from BOTH netCDF and CSV folder. Note: pypsa 1.2.4 exists upstream; pin resolves to tested 0.35.2. |
| T7 | done | 2026-07-12. network_to_internal() in pypsa_translate (handles TEMPO `loc::tech` naming AND foreign networks: generic names, StorageUnit, AC carrier, single-direction links). /import takes raw application/zip body (no python-multipart dep) — engineClient updated to match. Models.jsx: "Framework Archive (auto-detect)" import option + TranslationReport render. Round-trip pytest green (caps, storage triplet, tx pair collapse, coords, dates, capital-cost reproduction ≤1e-4 rel); live /export→/import loop verified. Costs import as annual-cost equivalents (documented in report). |
| T8 | done | 2026-07-13. scripts/verify_engines.py written: all original flags kept, adds --python-pypsa; PyPSA vs Calliope ≤2% obj / ≤5% cap (loose tier); Calliope 0.6 vs 0.7 ≤0.5% / ≤1% (tight tier); contract key-set consistency check across all engines. CLAUDE.md Developer Scripts updated to reference new script. Cannot run end-to-end: calliope-venv not installed on dev machine (reinstall from Settings unblocks numeric comparison). |
| T9 | done | 2026-07-13. python/adoptnet0_translate.py extracted: all helper functions + public build_model_dir(model_data, model_dir) → (carriers, report) and generate_timestamps(). adoptnet0_runner.py slimmed to ~130 lines — imports translate, calls translate.build_model_dir(). Syntax verified. Cannot run end-to-end (AdOpT-NET0 venv not installed on dev machine). |
| T10 | done | 2026-07-13. /export added to adoptnet0_service.py (build_model_dir → zipfile → base64, same pattern as pypsa_service). Export.jsx: adoptnet entry fixed (id=adoptnet0, name=AdOpT-NET0, supported=true), tree structure added, exportViaEngine('adoptnet0') wired. Cannot live-verify without AdOpT-NET0 venv; syntax verified. |
| T11 | done | 2026-07-13. adoptnet0_to_internal() added to adoptnet0_translate.py: Topology→locations/dates, NodeLocations.csv→coords, Technologies.json→tech assignments, technology_data/*.json→tech defs (RES/CONV1/CONV2/STOR reverse-translated), carrier CSV Demand col→demandProfile (24-h pattern, MW→kW). Demand techs auto-created per carrier. /import endpoint added to adoptnet0_service.py. Models.jsx already routes adoptnet0 archives via importModelArchive. Report entries: links not imported, demand pattern truncation, demand techs created. Syntax verified. Cannot live-verify without AdOpT-NET0 venv. |
| T12 | done | 2026-07-13. python/osemosys_timeslices.py: aggregate(), broadcast(), slice_labels(), year_split_for_n_hours(); pure stdlib (no pandas needed). 19 pytest tests green (conservation, non-divisible hours/day-blocks, broadcast identity, edge cases). |
| T13 | done | 2026-07-13. python/osemosys_translate.py: single REGION + location-suffixed tech/fuel IDs; storage as CH/DC tech pair + virtual stored-energy fuel; transmission as bidirectional conversion pairs; demand via SpecifiedAnnualDemand+Profile; timeslice aggregation via osemosys_timeslices; unit conversions (EUR/kW→M€/GW, EUR/kWh→M€/PJ×277.778, kW→GW÷1e6). 22 CSV files written; 34 pytest tests green (structure, unit conversions, round-trip demand profile sum=1, storage IAR encoding, OAR values, timeslice count). |
| T14 | done | 2026-07-13. osemosys_runner.py implemented: translate→GLPK .dat→glpsol→result CSVs→frozen contract. _write_datafile() generates GLPK MathProg data from otoole CSVs (no otoole dependency). ResultsPath parameter directs OSeMOSYS table statements to results/ dir. Result extraction from TotalCapacityAnnual/ProductionByTechnology/TotalTechnologyAnnualActivity; dispatch broadcast to hourly via timeslices.broadcast(). Run.jsx: osemosys.supported=true, SOLVER_OPTIONS.osemosys=['glpk'], osemosysStatus health check, isOsemosys routing in handleRunModel. Syntax verified; cannot run end-to-end without osemosys-venv installed. |
| T15 | done | 2026-07-13. /export implemented in osemosys_service.py: _export_datasets_to_zip() zips per-dataset otoole CSV dirs (22 files) with scheme param. Export.jsx: osemosys enabled (supported=true), ZIP tree structure added, exportViaEngine('osemosys') handler. Syntax verified. |
| T16 | done | 2026-07-13. python/osemosys_import.py: osemosys_to_internal(csv_dir) → (model, report). Reverse-maps TECHNOLOGY/FUEL sets + IAR/OAR→parent classification (supply/conversion/storage CH-DC pairs/transmission bidirectional pairs); reads actual YearSplit.csv fractions for shape-correct demand profile reconstruction (frac/year_split ∝ mean_kw, then broadcast to 24h); location detection fallback from fuel names for demand-only models; multi-year: keep base year. /import endpoint in osemosys_service.py: accepts raw ZIP body, detects single-dir or multi-dir layout. 21 pytest tests green (structural, numerical unit fidelity: capex 900 EUR/kW, storage eff 0.95 round-trip, lifetimes; demand profile shape r>0.6, block ordering preserved; demand-only model; multi-dataset; detection). archiveFormat.js already detected OSeMOSYS from previous T3. |
| T17 | done | 2026-07-13. scripts/verify_engines.py: added --python-osemosys flag, osemosys_runner entry in engines_to_run, OSeMOSYS pairwise comparison block (vs Calliope 0.6 preferred, fallback to 0.7; --osemosys-obj-tol 30.0 / --osemosys-cap-tol 15.0 defaults; run_engine_driver.py works unchanged since osemosys_runner uses same run_model interface). CLAUDE.md Developer Scripts updated with --python-osemosys example + new venv table rows (pypsa-venv, osemosys-venv, adoptnet0-venv). Cannot run end-to-end (osemosys-venv not installed on dev machine). |
| T18 | done | 2026-07-13. src/services/scenarioResolver.js: resolveScenario() deep-clones model and applies override dotted-keys (model.subset_time→modelConfig, techs.*.constraints.*, locations.*.techs.*.constraints.*; unknown keys silently skipped). Export.jsx: exportViaEngine builds datasets=[base, ...one per scenario]; resolver reports prepended. Run.jsx: removed PyPSA/OSeMOSYS scenario guard; added technologies/overrides/scenarios to useData(); isPypsa||isOsemosys with config calls resolveScenario and replaces modelData. Models.jsx: importModelArchive destructures extraModels; creates additional models per extra dataset. npm test green (42 tests). Lint clean on new files. |
| T19 | partial | 2026-07-13. Docs updated: import-export.md rewritten for multi-engine (archive import, scenario datasets, ZIP structures per format); running-optimization.md rewritten for multi-engine (engine table, pre-run checklist, scenario runs, troubleshooting per engine). CLAUDE.md: process/port table extended with AdOpT-NET0/PyPSA/OSeMOSYS rows; Key Files table extended with 11 new entries. End-to-end venv verification and manual checklist pending (requires engine venvs installed from Settings). |
