"""TEMPO storage extension in the vendored osemosys.txt (cyclic year + hourly loss).
Integration tests: need glpsol (bundled on Windows in solvers/windows)."""
import json
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import osemosys_runner as R  # noqa: E402

ROOT = Path(__file__).parent.parent.parent
MODEL = ROOT / "python" / "osemosys" / "osemosys.txt"

try:
    GLPSOL = R._find_glpsol()
except Exception:
    GLPSOL = None
needs_glpsol = pytest.mark.skipif(GLPSOL is None, reason="glpsol not available")


def test_model_declares_tempo_params():
    text = MODEL.read_text(encoding="utf-8")
    assert "param StorageCyclicYear{r in REGION, s in STORAGE}, binary, default 0;" in text
    assert "param StorageLossRate{r in REGION, s in STORAGE}, >= 0, < 1, default 0;" in text
    assert "param TempoLevelScale, > 0, default 1;" in text
    assert "TempoStorage[r,s] = 0" in text            # upstream S/SC gated
    # last-instance equations only exist for day types that occur at least once
    for name in ("TS4_LastDayStart", "TS5_LastDayNext", "TS10_LowerLast", "TS11_UpperLast",
                 "TS12_LowerDayTypeEnd", "TS13_UpperDayTypeEnd"):
        decl = text[text.index(f"s.t. {name}"):].split("}:", 1)[0]
        assert "DaysInDayType[ls,ld,y] >= 1" in decl, name


def _run(payload_name):
    md = json.loads((ROOT / "scripts" / payload_name).read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        return R.run_model(md, tmp, log_fn=lambda line: None)


@needs_glpsol
def test_cyclic_storage_single_solve_matches_calliope_rich():
    res = _run("reference_model_rich.json")
    assert res["termination_condition"] == "optimal"
    assert res["objective"] == pytest.approx(2740.9219, rel=2e-4)
    assert res["capacities"]["north::battery"] == pytest.approx(504.351, rel=1e-3)


@needs_glpsol
def test_lossy_storage_matches_calliope_reference_model():
    res = _run("reference_model.json")                 # battery storage_loss 0.01/h
    assert res["objective"] == pytest.approx(541.4126, rel=2e-4)
    assert res["capacities"]["north::battery"] == pytest.approx(15.155, rel=1e-3)


@needs_glpsol
def test_lossy_storage_matches_calliope_rich_lossy():
    res = _run("reference_model_rich_lossy.json")      # battery storage_loss 0.01/h
    assert res["objective"] == pytest.approx(2796.1663, rel=2e-4)
    assert res["capacities"]["north::battery"] == pytest.approx(304.366, rel=1e-3)
    assert res["capacities"]["south::ccgt"] == pytest.approx(182.174, rel=1e-3)
