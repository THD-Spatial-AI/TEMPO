# Bundled Solvers

CBC (COIN-OR Branch-and-Cut) is bundled here as a single executable — no license, no token, 100% free and open-source.

## Setup (one-time)

```powershell
pwsh -File scripts\download_cbc.ps1
```

This downloads `cbc.exe` (~15 MB) from the official COIN-OR GitHub releases into `solvers\windows\`.

## Why CBC?

| Solver  | Free | No token | Bundleable | Notes |
|---------|------|----------|------------|-------|
| **CBC** | ✅   | ✅       | ✅         | Recommended — used by this app |
| GLPK    | ✅   | ✅       | ✅         | Slower on large models |
| HiGHS   | ✅   | ✅       | ✅         | Requires Pyomo ≥ 6.4 |
| Gurobi  | ❌   | ❌       | ❌         | Commercial, token-locked |
| CPLEX   | ❌   | ❌       | ❌         | Commercial |

## How it works in the app

`calliope_runner.py` calls `_setup_bundled_solver()` at startup, which prepends the appropriate `solvers/<platform>/` directory to `PATH`. Pyomo then finds `cbc.exe` automatically — no system-wide installation needed.

## File layout

```
solvers/
  windows/
    cbc.exe          ← downloaded by scripts/download_cbc.ps1
  linux/
    cbc              ← downloaded if needed (Linux build)
  mac/
    cbc              ← downloaded if needed (macOS build)
```

The binaries are excluded from git (see `.gitignore`) — run the download script after cloning.
