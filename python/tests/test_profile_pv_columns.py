"""
PV profiles are one CSV column per location (D4) with force_resource=True:
each location's generator must get ITS column, and PyPSA must pin output
(p_min_pu = p_max_pu). Translators only:
    python -m pytest python/tests/test_profile_pv_columns.py -v
"""
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import adoptnet0_translate as adopt  # noqa: E402
import osemosys_timeslices as timeslices  # noqa: E402
import osemosys_translate as osem  # noqa: E402
import pypsa_translate as pypsa_tr  # noqa: E402
from test_profile_availability import _read_csv  # noqa: E402

N_HOURS = 24
NORTH = [0.0, 0.2, 0.6, 0.4]
SOUTH = [0.0, 0.1, 0.3, 0.2]
exp = lambda p: [p[h % len(p)] for h in range(N_HOURS)]  # noqa: E731

CSV = "datetime,north,south\n" + "\n".join(
    f"2005-01-01 {h:02d}:00:00,{a},{b}" for h, (a, b) in enumerate(zip(NORTH, SOUTH))) + "\n"


def _loc(name):
    return {"name": name, "techs": {
        "pv": {"constraints": {"resource": f"file=profile_pv.csv:{name}", "resource_unit": "energy_per_cap",
                               "force_resource": True, "energy_cap_max": 1000}},
        "power_demand": None}}


def _model():
    return {
        "modelConfig": {"startDate": "2005-01-01", "endDate": "2005-01-01"},
        "technologies": [
            {"name": "pv", "essentials": {"parent": "supply", "carrier_out": "electricity"},
             "constraints": {"lifetime": 25}, "costs": {"monetary": {"energy_cap": 600}}},
            {"name": "power_demand", "essentials": {"parent": "demand", "carrier_in": "electricity"},
             "constraints": {"resource": -100}},
        ],
        "locations": [_loc("north"), _loc("south")],
        "links": [],
        "timeSeries": [{"name": "profile_pv", "fileName": "profile_pv.csv",
                        "columns": ["datetime", "north", "south"], "csvContent": CSV}],
    }


def test_pypsa_each_location_gets_its_column_and_is_forced():
    spec, _ = pypsa_tr.translate_model(_model())
    gens = {g["name"]: g for g in spec["generators"]}
    for loc, prof in (("north", NORTH), ("south", SOUTH)):
        g = gens[f"{loc}::pv"]
        assert g["p_max_pu"] == pytest.approx(exp(prof))
        assert g["p_min_pu"] == pytest.approx(exp(prof))


def test_osemosys_each_location_gets_its_column():
    scheme = timeslices.parity_scheme(N_HOURS, chronological=True)
    with tempfile.TemporaryDirectory() as tmp:
        osem.translate_model(_model(), tmp, scheme)
        rows = _read_csv(tmp, "CapacityFactor.csv")
    for loc, prof in (("NORTH", NORTH), ("SOUTH", SOUTH)):
        cf = {r["TIMESLICE"]: float(r["VALUE"]) for r in rows if r["TECHNOLOGY"] == f"{loc}_PV"}
        assert [cf[f"s1d{h + 1}"] for h in range(N_HOURS)] == pytest.approx(exp(prof))


def test_adoptnet0_each_location_gets_its_column():
    cf = adopt.compute_capfactors(_model(), [])
    assert cf[("north", "pv")] == pytest.approx(exp(NORTH))
    assert cf[("south", "pv")] == pytest.approx(exp(SOUTH))
