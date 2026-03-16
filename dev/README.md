# Calliope Dev Runner

Quick local development workflow for `calliope_runner.py` — **no Electron, no Go server needed**.

## Prerequisites

Python 3.9+ (the one you already have). No conda required.

---

## One-time setup

```bash
# From the repo root:
python setup_calliope_venv.py
```

This creates `.venv-calliope/` with calliope 0.6.8 + all deps + the HiGHS solver.  
Takes ~2–5 min on first run (downloading packages). Re-running is instant.

> **Already have the `calliope` conda env?**  Skip setup entirely — `run_calliope_dev.py` auto-detects it.

---

## Run a model

```bash
# Quickest — uses the sample model, prints JSON results:
python run_calliope_dev.py dev/sample_model.json

# With a readable summary:
python run_calliope_dev.py dev/sample_model.json --summary

# Save results to a file:
python run_calliope_dev.py dev/sample_model.json -o dev/results.json --summary

# Force a specific solver:
python run_calliope_dev.py dev/sample_model.json --solver highs
python run_calliope_dev.py dev/sample_model.json --solver glpk
```

The runner auto-detects:
1. Active venv (`VIRTUAL_ENV` env var)
2. `.venv-calliope/` in repo root
3. `calliope` conda environment
4. Current Python (fallback)

---

## Iterate quickly

The standard dev loop:

```bash
# 1. Edit calliope_runner.py (or services/adapters)
# 2. Run immediately:
python run_calliope_dev.py dev/sample_model.json --summary
# 3. See results in ~10–30 s
```

No rebuild, no restart, no Electron window needed.

---

## Use your own model JSON

Export a model from the UI (or write one from scratch) and pass it as the input:

```bash
python run_calliope_dev.py path/to/my_model.json --summary
```

The JSON format is the same payload the backend Go server sends to `calliope_runner.py`.  
See [dev/sample_model.json](sample_model.json) for the full schema.

---

## Solvers

The `calliope` conda env **does not** include a solver binary by default on this setup. You need at least one:

| Solver | Status | How to get it |
|--------|--------|--------------|
| `gurobi` | **Available** (already installed at `C:\gurobi1003`) | Already installed |
| `cbc`  | Needs install | `conda install -c conda-forge coin-or-cbc` in the calliope env |
| `glpk` | Needs install | `conda install -c conda-forge glpk` in the calliope env |
| `highs` | **Preferred for new venv** | Included via `pip install highspy` |
| `cplex` | Available if licensed | Commercial |

**Quick solver fix** — install CBC into the existing calliope env (one command):
```bash
conda install -n calliope -c conda-forge coin-or-cbc
```

Then set `"solver": "cbc"` in `dev/sample_model.json`.

---

## Files

| File | Purpose |
|------|---------|
| `setup_calliope_venv.py` | One-shot venv creator |
| `run_calliope_dev.py` | Dev runner (replaces Electron + Go) |
| `python/requirements.txt` | All Python deps for calliope |
| `dev/sample_model.json` | Minimal self-contained test model |
| `dev/results.json` | Output (created after a run with `-o`) |
