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
