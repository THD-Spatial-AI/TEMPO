"""OSeMOSYS export ZIP: parity representation by default, legacy on request."""
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import osemosys_runner as R  # noqa: E402

ROOT = Path(__file__).parent.parent.parent
REF = ROOT / "scripts" / "reference_model_rich.json"

try:
    GLPSOL = R._find_glpsol()
except Exception:
    GLPSOL = None
needs_glpsol = pytest.mark.skipif(GLPSOL is None, reason="glpsol not available")


def _zip(datasets, scheme=None, legacy=False):
    out = R.export_datasets_to_zip(datasets, scheme, legacy=legacy)
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(out["zip"])))


def test_parity_export_is_self_contained():
    md = json.loads(REF.read_text(encoding="utf-8"))
    names = set(_zip([{"name": "base", "model": md}]).namelist())
    for f in ("base/STORAGE.csv", "base/StorageCyclicYear.csv", "base/StorageLossRate.csv",
              "base/TempoLevelScale.csv", "base/DiscountRate.csv", "base/DepreciationMethod.csv",
              "base/osemosys.txt", "base/osemosys.dat", "base/tempo_model.json",
              "base/README.txt", "base/results/.keep"):
        assert f in names, f


def test_parity_export_datafile_is_relocatable():
    md = json.loads(REF.read_text(encoding="utf-8"))
    dat = _zip([{"name": "base", "model": md}]).read("base/osemosys.dat").decode()
    assert 'param ResultsPath := "results" ;' in dat
    assert "param TempoLevelScale := " in dat


def test_parity_export_ships_patched_model_and_original():
    md = json.loads(REF.read_text(encoding="utf-8"))
    z = _zip([{"name": "base", "model": md}])
    assert "TEMPO storage extension" in z.read("base/osemosys.txt").decode()
    assert json.loads(z.read("base/tempo_model.json")) == md


def test_legacy_export_option_keeps_old_layout():
    md = json.loads(REF.read_text(encoding="utf-8"))
    z = _zip([{"name": "base", "model": md}], scheme={"seasons": 4, "dayBlocks": 3}, legacy=True)
    names = set(z.namelist())
    assert "base/osemosys.txt" not in names
    assert "base/tempo_model.json" not in names
    assert z.read("base/STORAGE.csv").decode().strip() == "VALUE"


@needs_glpsol
def test_exported_dataset_solves_standalone_to_runner_objective():
    md = json.loads(REF.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        res = R.run_model(md, os.path.join(tmp, "run"), log_fn=lambda line: None)
        raw_runner = res["objective"] / (1e6 * 168 / 8760)       # € window → M€ annualised
        _zip([{"name": "base", "model": md}]).extractall(os.path.join(tmp, "x"))
        ds = os.path.join(tmp, "x", "base")
        env = dict(os.environ, PATH=os.path.dirname(GLPSOL) + os.pathsep + os.environ.get("PATH", ""))
        subprocess.run([GLPSOL, "--math", "osemosys.txt", "--data", "osemosys.dat", "-o", "out.txt"],
                       cwd=ds, env=env, capture_output=True, check=True)
        term, raw = R._parse_glpsol_output(os.path.join(ds, "out.txt"))
        assert term == "optimal"
        assert raw == pytest.approx(raw_runner, rel=1e-6)   # GLPK standalone vs the runner (HiGHS when installed)
        assert os.path.exists(os.path.join(ds, "results", "TotalCapacityAnnual.csv"))


def test_parity_readme_explains_tempo_model_json():
    md = json.loads(REF.read_text(encoding="utf-8"))
    readme = _zip([{"name": "base", "model": md}]).read("base/README.txt").decode()
    assert "Delete tempo_model.json to import edited CSVs" in readme
