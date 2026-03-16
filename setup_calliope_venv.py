#!/usr/bin/env python3
"""
setup_calliope_venv.py  –  One-shot local venv setup for Calliope development
==============================================================================
Creates a Python virtual environment at  .venv-calliope/  in the repo root and
installs all dependencies from  python/requirements.txt.

No conda, no admin rights, no external tools – just Python 3.9+.

Usage
-----
    python setup_calliope_venv.py          # create / update venv
    python setup_calliope_venv.py --check  # verify existing venv
"""

import subprocess
import sys
import os
import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
VENV_DIR = REPO_ROOT / ".venv-calliope"
REQUIREMENTS = REPO_ROOT / "python" / "requirements.txt"

WIN = sys.platform == "win32"
PYTHON_IN_VENV = VENV_DIR / ("Scripts" if WIN else "bin") / ("python.exe" if WIN else "python")
PIP_IN_VENV    = VENV_DIR / ("Scripts" if WIN else "bin") / ("pip.exe" if WIN else "pip")


def _run(cmd, **kwargs):
    print(f"  > {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        sys.exit(result.returncode)
    return result


def create_venv():
    if VENV_DIR.exists():
        print(f"[setup] venv already exists at {VENV_DIR}")
    else:
        print(f"[setup] Creating venv at {VENV_DIR} ...")
        _run([sys.executable, "-m", "venv", str(VENV_DIR)])

    print("[setup] Upgrading pip / wheel / setuptools ...")
    _run([str(PYTHON_IN_VENV), "-m", "pip", "install", "-q", "--upgrade",
          "pip", "wheel", "setuptools"])

    print(f"[setup] Installing dependencies from {REQUIREMENTS} ...")
    _run([str(PYTHON_IN_VENV), "-m", "pip", "install", "-q", "-r", str(REQUIREMENTS)])

    print()
    _run([str(PYTHON_IN_VENV), "-c",
          "import calliope; print('[setup] calliope', calliope.__version__, 'installed OK')"])

    print()
    print("=" * 60)
    print("  Setup complete!")
    print()
    if WIN:
        print("  Activate with:")
        print(f"    .venv-calliope\\Scripts\\activate")
    else:
        print("  Activate with:")
        print(f"    source .venv-calliope/bin/activate")
    print()
    print("  Then run a test with:")
    print("    python run_calliope_dev.py dev/sample_model.json")
    print("=" * 60)


def check_venv():
    if not PYTHON_IN_VENV.exists():
        print(f"[check] ERROR: venv not found at {VENV_DIR}")
        print("  Run:  python setup_calliope_venv.py")
        sys.exit(1)
    result = subprocess.run(
        [str(PYTHON_IN_VENV), "-c",
         "import calliope; print('calliope', calliope.__version__, '- OK')"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print(f"[check] {result.stdout.strip()}")
    else:
        print(f"[check] FAILED: {result.stderr.strip()}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Only verify existing venv")
    args = parser.parse_args()

    if args.check:
        check_venv()
    else:
        create_venv()
