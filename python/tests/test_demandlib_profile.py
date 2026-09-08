"""
Tests for demandlib_profile.py — the one-shot BDEW load-shape generator.

The generation tests require the optional `demandlib` package and are skipped
when it isn't installed (the feature falls back to the synthetic JS path in that
case). The validation/error-path tests run without it, since input validation
happens before demandlib is imported.
"""
import sys
import json
import subprocess
import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent.parent / "demandlib_profile.py"

_HAS_DEMANDLIB = importlib.util.find_spec("demandlib") is not None
requires_demandlib = pytest.mark.skipif(not _HAS_DEMANDLIB, reason="demandlib not installed")


def _run(payload=None, args=None):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *(args or [])],
        input=(json.dumps(payload) if payload is not None else ""),
        capture_output=True,
        text=True,
    )
    return proc


def _out(proc):
    return json.loads(proc.stdout.strip().splitlines()[-1])


# ---------------------------------------------------------------------------
# Validation / error paths (no demandlib required)
# ---------------------------------------------------------------------------

def test_bad_resolution_errors():
    proc = _run({"start": "2024-01-01", "end": "2024-12-31", "resolution": "5min",
                 "sectors": {"h0": 1}})
    assert proc.returncode != 0
    assert "error" in _out(proc)


def test_end_before_start_errors():
    proc = _run({"start": "2024-06-01", "end": "2024-01-01", "resolution": "60min",
                 "sectors": {"h0": 1}})
    assert proc.returncode != 0
    assert "error" in _out(proc)


def test_only_flat_sector_errors():
    proc = _run({"start": "2024-01-01", "end": "2024-12-31", "resolution": "60min",
                 "sectors": {"flat": 1}})
    assert proc.returncode != 0
    assert "error" in _out(proc)


def test_invalid_json_errors():
    proc = _run(args=[])  # empty stdin
    assert proc.returncode != 0
    assert "error" in _out(proc)


def test_bad_family_errors():
    proc = _run({"start": "2024-01-01", "end": "2024-12-31", "resolution": "60min",
                 "sectors": {"h25": 1}, "family": "nope"})
    assert proc.returncode != 0
    assert "error" in _out(proc)


# ---------------------------------------------------------------------------
# Generation (demandlib required)
# ---------------------------------------------------------------------------

@requires_demandlib
def test_list_profiles():
    proc = _run(args=["--list-profiles", "--year", "2024"])
    assert proc.returncode == 0
    profiles = _out(proc)["profiles"]
    assert "h0" in profiles
    assert "g0" in profiles


@requires_demandlib
def test_full_year_hourly_mean_is_one():
    proc = _run({"start": "2024-01-01", "end": "2024-12-31", "resolution": "60min",
                 "sectors": {"h0": 1}, "country": "DE"})
    assert proc.returncode == 0, proc.stderr
    out = _out(proc)
    vals = out["values"]
    # 2024 is a leap year → 8784 hourly steps.
    assert len(vals) == 8784
    assert len(out["datetimes"]) == len(vals)
    assert out["datetimes"][0] == "2024-01-01 00:00:00"
    assert abs(sum(vals) / len(vals) - 1.0) < 0.02


@requires_demandlib
def test_resolution_changes_the_step_count():
    base = {"start": "2024-03-04", "end": "2024-03-04", "sectors": {"g0": 1}}
    h = _out(_run({**base, "resolution": "60min"}))
    q = _out(_run({**base, "resolution": "15min"}))
    assert len(h["values"]) == 24
    assert len(q["values"]) == 96
    assert q["datetimes"][1] == "2024-03-04 00:15:00"


@requires_demandlib
def test_sector_mix_blends():
    proc = _run({"start": "2024-01-01", "end": "2024-01-07", "resolution": "60min",
                 "sectors": {"h0": 0.5, "g0": 0.5}})
    assert proc.returncode == 0
    out = _out(proc)
    assert out["slp_columns"] == ["g0", "h0"]
    assert all(v >= 0 for v in out["values"])


# ── BDEW25 (2025 revision) family ────────────────────────────────────────────

@requires_demandlib
def test_list_profiles_includes_bdew25():
    proc = _run(args=["--list-profiles", "--year", "2024"])
    profiles = _out(proc)["profiles"]
    assert {"h25", "g25", "l25"}.issubset(set(profiles))


@requires_demandlib
def test_bdew25_full_year_mean_is_one():
    proc = _run({"start": "2024-01-01", "end": "2024-12-31", "resolution": "60min",
                 "sectors": {"h25": 1}, "country": "DE", "family": "bdew25"})
    assert proc.returncode == 0, proc.stderr
    out = _out(proc)
    assert out["family"] == "bdew25"
    assert len(out["values"]) == 8784
    assert abs(sum(out["values"]) / len(out["values"]) - 1.0) < 0.02


@requires_demandlib
def test_bdew25_rejects_classic_sector():
    proc = _run({"start": "2024-01-01", "end": "2024-01-07", "resolution": "60min",
                 "sectors": {"h0": 1}, "family": "bdew25"})
    assert proc.returncode != 0
    assert "error" in _out(proc)
