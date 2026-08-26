"""Verify the engineParams overlay reaches each engine's translate output.

These translators are pure functions over model_data (they import pypsa/pandas
only inside build_network), so the overlay can be verified without the PyPSA or
OSeMOSYS venvs installed.
"""
import csv
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PYDIR = os.path.dirname(HERE)
sys.path.insert(0, PYDIR)
REF = os.path.join(PYDIR, "..", "scripts", "reference_model.json")

import pypsa_translate           # noqa: E402
import osemosys_translate        # noqa: E402
import adoptnet0_translate       # noqa: E402
from engine_overlay import engine_overlay, coerce_overlay  # noqa: E402


def _model_with_overlay():
    with open(REF) as f:
        m = json.load(f)
    ep = {
        "pypsa": {"p_min_pu": 0.1, "committable": "true"},
        "osemosys": {"OperationalLife": 7, "CapitalCost": 999.0},
        "adoptnet0": {"min_part_load": 0.3},
    }
    for loc in m["locations"]:
        techs = loc.setdefault("techs", {})
        if "solar_pv" in techs:
            cfg = techs.get("solar_pv") or {}
            cfg["engineParams"] = ep
            techs["solar_pv"] = cfg
    return m


def test_overlay_helper():
    assert engine_overlay({"engineParams": {"pypsa": {"a": 1}}}, None, "pypsa") == {"a": 1}
    # loc_cfg overrides the global tech
    merged = engine_overlay(
        {"engineParams": {"pypsa": {"a": 1}}},
        {"engineParams": {"pypsa": {"a": 2, "b": 3}}},
        "pypsa",
    )
    assert merged == {"a": 2, "b": 3}
    assert engine_overlay(None, None, "pypsa") == {}
    coerced = coerce_overlay({"x": "true", "y": "false", "z": 5})
    assert coerced["x"] is True and coerced["y"] is False and coerced["z"] == 5


def test_pypsa_overlay():
    spec, _ = pypsa_translate.translate_model(_model_with_overlay())
    gens = [g for g in spec["generators"] if "solar_pv" in g["name"]]
    assert gens, "solar_pv generator not found"
    assert gens[0].get("_engine_params") == {"p_min_pu": 0.1, "committable": True}


def test_osemosys_overlay():
    with tempfile.TemporaryDirectory() as d:
        osemosys_translate.translate_model(_model_with_overlay(), d)
        ol = list(csv.DictReader(open(os.path.join(d, "OperationalLife.csv"))))
        sv = [r for r in ol if "solar" in r["TECHNOLOGY"].lower()]
        assert sv and all(float(r["VALUE"]) == 7 for r in sv)
        cc = list(csv.DictReader(open(os.path.join(d, "CapitalCost.csv"))))
        scc = [r for r in cc if "solar" in r["TECHNOLOGY"].lower()]
        assert scc and all(float(r["VALUE"]) == 999.0 for r in scc)


def test_adoptnet0_overlay():
    with tempfile.TemporaryDirectory() as d:
        adoptnet0_translate.build_model_dir(_model_with_overlay(), d)
        solar = []
        for root, _dirs, files in os.walk(d):
            for fn in files:
                if "solar" in fn.lower() and fn.endswith(".json"):
                    solar.append(json.load(open(os.path.join(root, fn))))
        assert solar, "solar_pv tech json not written"
        assert any(j.get("min_part_load") == 0.3 for j in solar)
