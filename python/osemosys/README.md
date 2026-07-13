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
