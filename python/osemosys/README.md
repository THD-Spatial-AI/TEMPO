# Vendored OSeMOSYS model file

`osemosys.txt` is the official OSeMOSYS GNU MathProg formulation (long version),
model version `OSeMOSYS_2017_11_08`.

- Source: https://raw.githubusercontent.com/OSeMOSYS/OSeMOSYS_GNU_MathProg/master/src/osemosys.txt
- Retrieved: 2026-07-12
- License: Apache 2.0 (see header in the file)

It is solved with the bundled GLPK `glpsol` binary (`solvers/windows/glpsol.exe`,
GLPK 4.65 from winglpk; on Linux install `glpk-utils`). Input datafiles are
produced from otoole-format CSVs by the `otoole` package pinned in
`requirements.osemosys.txt` — the CSV schema, this model file, and the otoole
version must stay compatible as a trio.

## TEMPO extension (not upstream)

TEMPO patches this file with an opt-in storage block (search "TEMPO storage extension"):
`StorageCyclicYear` (year-start level free and equal to year-end, Calliope's cyclic storage)
and `StorageLossRate` (fraction of stored energy lost per hour, Calliope `storage_loss`).
Both default to 0, in which case the upstream 2017 equations apply unchanged. Datasets that
set them need this model file — TEMPO's parity exports ship it (with `osemosys.dat`) alongside
the CSVs.

For a storage with either parameter set, upstream S5–S15 and SC1–SC4 are skipped and
constraints TS1–TS13 apply instead: the level is tracked per daily bracket with hourly
retention `(1 − loss)^hours`, carried exactly (geometric series) across the
`DaysInDayType` identical days, and bounded on the first and last instance of each day type.
The block assumes each (season, day type) is `DaysInDayType` consecutive identical days,
day types run in order within a season, seasons run once each in order through the year, and
years are consecutive (a non-cyclic year starts from the previous year's end level).
Last-instance constraints apply only to day types with `DaysInDayType >= 1`.
`TempoLevelScale` (scalar, default 1) is numerical only: the extension's level variables hold
level × scale. TEMPO's parity runs set 1e6 because their storage levels are ~1e-6 PJ, small
enough for GLPK's absolute tolerances to distort the solution.

### Further TEMPO extensions (all opt-in; unset = upstream behaviour)

* `TempoStrictBalance[r,f,y]` / `TEMPO_StrictBalance` — a flagged fuel balances exactly: production
  may not exceed specified demand plus the activities that consume it. Calliope balances every
  carrier exactly, so a by-product of a multi-output technology (a CHP's heat) cannot be dumped for
  free as upstream's `Production >= Demand + Use` allows. TEMPO flags those by-product fuels and adds
  a penalised `<FUEL>_DUMP` technology (the same price as unmet demand) when Ensure feasibility is on,
  mirroring Calliope's `unused_supply`. The constraint is written from the data and activities, not
  from `Use[]`/`Demand[]`, which are free variables for a fuel nobody consumes.
* `TempoStorageCapMax[r,s,y]` (PJ) and `TempoPowerPerStorage[r,t,s]` (1/h) — Calliope's
  `storage_cap_max` and `charge_rate` / `energy_cap_per_storage_cap_max`; `TEMPO_StorageCapMax` bounds
  the storage energy capacity and `TEMPO_StoragePower` bounds the technology's power by
  `rate x 277.7778 GWh/PJ x energy capacity`.

### Solving

`glpsol` builds the MathProg model and post-processes the solution into the result CSVs, but its
simplex can take hours on large degenerate models. When `highspy` is installed the runner exports the
model (`--check --wfreemps`), solves it with HiGHS, writes the answer in GLPK's plain-text solution
format and lets `glpsol -r` post-process it. Without `highspy`, or if HiGHS does not reach an optimum,
it solves with GLPK as before.

### Known limitation: time resolution

Parity mode folds the window into one typical day of hour-of-day slices, so day-to-day peaks are
averaged and capacities can be under-sized. `modelConfig.osemosysScheme = {seasons: N, dayBlocks: 24}`
gives one season per day (exact for an N-day window, at N x the model size); engine_diagnostics warns
about it. On the UK week, 7 seasons moved the objective from -6.5% to -2.2% of Calliope's.
