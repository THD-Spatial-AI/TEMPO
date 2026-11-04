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
A third flag, `StorageTempoBlock` (binary), routes a storage through the block even when it is
neither cyclic nor lossy; TEMPO sets it for every storage in a chronological parity dataset (see
below), so a non-cyclic storage starts at `StorageLevelStart` at the window start, as in Calliope.
All three default to 0, in which case the upstream 2017 equations apply unchanged. Datasets that
set them need this model file — TEMPO's parity exports ship it (with `osemosys.dat`) alongside
the CSVs.

For a storage with any of them set, upstream S5–S15 and SC1–SC4 are skipped and
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

`glpsol` builds the MathProg model (and, solving with GLPK, writes the result CSVs), but its
simplex can take hours on large degenerate models. When `highspy` is installed the runner exports the
model (`--check --wfreemps`), solves it with HiGHS and writes the result CSVs the runner reads
(`TotalCapacityAnnual`, `ProductionByTechnology`, `RateOfActivity`, costs, …) straight from the named
MPS columns — the other osemosys.txt result tables are not produced on this route. `glpsol -r`
post-processing (which re-generates the whole model) is only the fallback. Without `highspy`, or if
HiGHS does not reach an optimum, it solves with GLPK as before.

### Time resolution: chronological and representative schemes

Parity mode annualises the window as one year (`YearSplit` = slice hours / window hours, demand x
8760/window hours) and uses 24 hour-of-day brackets (`DaySplit` = 1/8760 each, so a rate in PJ/yr
times `DaySplit` is that hour's energy in PJ).

* **Chronological** (windows up to `osemosys_timeslices.CHRONOLOGICAL_MAX_HOURS` = 744 h): one
  season per real day, so every window hour is its own timeslice, and `DaysInDayType` = 1. With
  `StorageTempoBlock` = 1 the TEMPO block is then an hourly storage chain through the window:
  each day starts where the previous ended, cyclic storage ties the window end to its start, and
  non-cyclic storage starts at `StorageLevelStart` (0) — Calliope's formulation exactly.
  `YearSplit` ≠ `DaySplit` x `DaysInDayType` here; only the upstream S3/S5–S15 storage chain relies
  on that identity, and it is bypassed for TEMPO-block storages.
* **Representative** (longer windows): one season below four weeks, four otherwise, each repeated
  as `DaysInDayType` identical days. Exact only when daily profiles repeat; day-to-day peaks are
  averaged and non-cyclic storage is approximate (every represented day starts like the first).

`modelConfig.osemosysScheme = {chronological: true|false}` overrides the threshold (a chronological
year is 8760 timeslices — large); `{seasons: N, dayBlocks: 24}` with N = window days also selects
the chronological scheme, other explicit schemes are used as given.
