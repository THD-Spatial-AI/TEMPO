#!/usr/bin/env python3
"""
run_calliope_dev.py  –  Quick local Calliope runner for development
====================================================================
Runs ``python/calliope_runner.py`` directly without needing Electron or the
Go backend server.  Auto-detects the right Python interpreter in this order:

  1. The active virtual environment  (VIRTUAL_ENV env var)
  2. .venv-calliope/  in the repo root  (created by setup_calliope_venv.py)
  3. The ``calliope`` conda environment  (looks for conda on PATH + common paths)
  4. Current Python  (sys.executable – assumes calliope is already installed)

Usage
-----
    # Basic — run a model JSON file, print results to stdout:
    python run_calliope_dev.py dev/sample_model.json

    # Write results to a specific file:
    python run_calliope_dev.py dev/sample_model.json -o dev/results.json

    # Pretty-print results summary after run:
    python run_calliope_dev.py dev/sample_model.json --summary

    # Skip automatic solver detection and force HiGHS:
    python run_calliope_dev.py dev/sample_model.json --solver highs

    # Pass any extra calliope_runner.py arguments after --:
    python run_calliope_dev.py dev/sample_model.json -- --verbose
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent
RUNNER    = REPO_ROOT / "python" / "calliope_runner.py"
VENV_DIR  = REPO_ROOT / ".venv-calliope"
WIN       = sys.platform == "win32"

# ---------------------------------------------------------------------------
# Python interpreter detection
# ---------------------------------------------------------------------------

def _venv_python(venv: Path) -> Optional[Path]:
    p = venv / ("Scripts" if WIN else "bin") / ("python.exe" if WIN else "python")
    return p if p.exists() else None


def _conda_python(env_name: str = "calliope") -> Optional[Path]:
    """Find Python inside a named conda environment."""
    import shutil

    conda_exe = shutil.which("conda")
    if not conda_exe:
        # Try common paths
        candidates = [
            Path.home() / "anaconda3" / "Scripts" / "conda.exe",
            Path.home() / "miniconda3" / "Scripts" / "conda.exe",
            Path.home() / "Anaconda3" / "Scripts" / "conda.exe",
            Path("/opt/conda/bin/conda"),
            Path("/usr/local/anaconda3/bin/conda"),
        ]
        for c in candidates:
            if c.exists():
                conda_exe = str(c)
                break

    if not conda_exe:
        return None

    try:
        result = subprocess.run(
            [conda_exe, "run", "-n", env_name, "python", "-c",
             "import sys; print(sys.executable)"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            p = Path(result.stdout.strip())
            return p if p.exists() else None
    except Exception:
        pass
    return None


def find_python() -> Tuple[Path, str]:
    """Return (python_path, source_description)."""

    # 1. Active venv
    venv_env = os.environ.get("VIRTUAL_ENV")
    if venv_env:
        p = _venv_python(Path(venv_env))
        if p:
            return p, f"active venv ({venv_env})"

    # 2. Repo local venv
    p = _venv_python(VENV_DIR)
    if p:
        return p, f"repo venv ({VENV_DIR.name})"

    # 3. Conda calliope env
    p = _conda_python("calliope")
    if p:
        return p, "conda env 'calliope'"

    # 4. Fallback – current interpreter (may or may not have calliope)
    return Path(sys.executable), "current Python (fallback)"


# ---------------------------------------------------------------------------
# Result pretty-printing
# ---------------------------------------------------------------------------

def print_summary(results: dict):
    print()
    print("=" * 60)
    print("  RESULTS SUMMARY")
    print("=" * 60)
    ok = results.get("success", True)
    print(f"  Status  : {'SUCCESS' if ok else 'FAILED'}")
    if not ok:
        print(f"  Error   : {results.get('error', 'unknown')}")
        tb = results.get("traceback")
        if tb:
            print()
            print(tb)
        return

    obj = results.get("objective")
    if obj is not None:
        print(f"  Objective : {obj:,.4f}")

    meta = results.get("metadata", {})
    if meta:
        print(f"  Solver    : {meta.get('solver', 'N/A')}")
        print(f"  Termination: {meta.get('termination_condition', 'N/A')}")
        print(f"  Wall time  : {meta.get('wall_time', 'N/A')} s")

    capacities = results.get("capacities", {})
    if capacities:
        print()
        print("  Optimal capacities (MW or MWh):")
        for loc_tech, val in list(capacities.items())[:20]:
            print(f"    {loc_tech:<45} {val:>12.2f}")
        if len(capacities) > 20:
            print(f"    … and {len(capacities) - 20} more")

    costs = results.get("costs", {})
    if costs:
        print()
        print("  Total annualised costs:")
        for cost_class, val in costs.items():
            print(f"    {cost_class:<20} {val:>15.2f}")

    print("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Run calliope_runner.py locally without Electron or the Go server."
    )
    parser.add_argument("input_json", help="Path to model JSON file")
    parser.add_argument("-o", "--output", default=None,
                        help="Output JSON file (default: temp file, result printed to stdout)")
    parser.add_argument("--summary", action="store_true",
                        help="Pretty-print a results summary after running")
    parser.add_argument("--solver", default=None,
                        help="Override solver (highs, glpk, cbc, gurobi …). "
                             "Default: auto-detect from gurobi > cbc > glpk > highs")
    parser.add_argument("--no-detect", action="store_true",
                        help="Skip Python auto-detection; use current interpreter")
    args = parser.parse_args()

    input_path = Path(args.input_json).resolve()
    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    # Optionally inject solver override into the model JSON
    use_temp_input = False
    if args.solver:
        with open(input_path, "r", encoding="utf-8") as f:
            model_data = json.load(f)
        if "run" not in model_data:
            model_data["run"] = {}
        model_data["run"]["solver"] = args.solver
        tmp_in = tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w")
        json.dump(model_data, tmp_in)
        tmp_in.close()
        input_path = Path(tmp_in.name)
        use_temp_input = True

    # Output file
    use_temp_output = args.output is None
    if use_temp_output:
        tmp_out = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        tmp_out.close()
        output_path = Path(tmp_out.name)
    else:
        output_path = Path(args.output).resolve()

    # Find Python
    if args.no_detect:
        python_exe = Path(sys.executable)
        source = "current Python (--no-detect)"
    else:
        python_exe, source = find_python()

    print(f"[dev] Python  : {python_exe}  ({source})")
    print(f"[dev] Input   : {input_path}")
    print(f"[dev] Output  : {output_path}")
    print(f"[dev] Runner  : {RUNNER}")
    print()

    # Build command – add repo root to PYTHONPATH so python/services/... imports work
    env = os.environ.copy()
    pypath = str(REPO_ROOT)
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{pypath}{os.pathsep}{existing}" if existing else pypath

    cmd = [str(python_exe), str(RUNNER), str(input_path), str(output_path)]
    result = subprocess.run(cmd, env=env)

    # Cleanup temp input
    if use_temp_input:
        os.unlink(input_path)

    if use_temp_output:
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"ERROR reading output: {e}", file=sys.stderr)
            sys.exit(1)
        finally:
            os.unlink(output_path)

        if args.summary:
            print_summary(data)
        else:
            print(json.dumps(data, indent=2, default=str))
    else:
        if args.summary:
            try:
                with open(output_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                print_summary(data)
            except Exception as e:
                print(f"Could not parse output for summary: {e}", file=sys.stderr)

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
