"""
A supply tech with a per-capacity resource profile and force_resource=False is an
hourly UPPER BOUND on output (availability), not a forced output — in every
non-Calliope translator (Calliope 0.6.8 does this natively).

    resource: file=profile_nuclear.csv:nuclear, resource_unit: energy_per_cap, force_resource: False

The 4-step profile [1.0, 0.5, 0.0, 1.0] cycles over the 24-hour window.
Translators only — no engine, no solver:
    python -m pytest python/tests/test_profile_availability.py -v
"""
import copy
import csv
import json
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import adoptnet0_translate as adopt  # noqa: E402
import osemosys_timeslices as timeslices  # noqa: E402
import osemosys_translate as osem  # noqa: E402
import pypsa_translate as pypsa_tr  # noqa: E402

PROFILE = [1.0, 0.5, 0.0, 1.0]
N_HOURS = 24
EXPECTED = [PROFILE[h % len(PROFILE)] for h in range(N_HOURS)]

CONSTRAINTS = {
    "resource": "file=profile_nuclear.csv:nuclear",
    "resource_unit": "energy_per_cap",
    "force_resource": False,
    "energy_cap_max": 1000,
}

# Saved-model shape: only csvContent, no parsed `data`.
CSV_CONTENT = "datetime,nuclear\n" + "\n".join(
    f"2005-01-01 {h:02d}:00:00,{v}" for h, v in enumerate(PROFILE)) + "\n"


def _model(on_location=True):
    nuclear = {"name": "nuclear",
               "essentials": {"parent": "supply", "carrier_out": "electricity"},
               "constraints": {"lifetime": 40},
               "costs": {"monetary": {"energy_cap": 5000}}}
    loc_cfg = {"constraints": dict(CONSTRAINTS)}
    if not on_location:
        nuclear["constraints"].update(CONSTRAINTS)
        loc_cfg = None
    return {
        "modelConfig": {"startDate": "2005-01-01", "endDate": "2005-01-01"},
        "technologies": [
            nuclear,
            {"name": "power_demand", "essentials": {"parent": "demand", "carrier_in": "electricity"},
             "constraints": {"resource": -100}},
        ],
        "locations": [{"name": "north", "techs": {"nuclear": loc_cfg, "power_demand": None}}],
        "links": [],
        "timeSeries": [{"name": "profile_nuclear", "fileName": "profile_nuclear.csv",
                        "columns": ["datetime", "nuclear"], "csvContent": CSV_CONTENT}],
    }


both_placements = pytest.mark.parametrize("on_location", [True, False], ids=["location_tech", "global_tech"])


# ── PyPSA: p_max_pu = profile, p_min_pu unset ──────────────────────────────────

@both_placements
def test_pypsa_profile_is_upper_bound(on_location):
    spec, _ = pypsa_tr.translate_model(_model(on_location))
    gen = next(g for g in spec["generators"] if g["name"] == "north::nuclear")
    assert gen["p_max_pu"] == pytest.approx(EXPECTED)
    assert gen["p_min_pu"] is None or all(v == 0 for v in gen["p_min_pu"])
    assert gen["p_nom_extendable"] is True


# ── OSeMOSYS: CapacityFactor = profile, no activity lower bound ────────────────

def _read_csv(csv_dir, name):
    path = Path(csv_dir) / name
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


@both_placements
def test_osemosys_profile_is_upper_bound(on_location):
    # Chronological scheme: one season per day, one slice per hour (s1d1 = hour 0).
    scheme = timeslices.parity_scheme(N_HOURS, chronological=True)
    with tempfile.TemporaryDirectory() as tmp:
        osem.translate_model(_model(on_location), tmp, scheme)
        cf = {r["TIMESLICE"]: float(r["VALUE"]) for r in _read_csv(tmp, "CapacityFactor.csv")
              if r["TECHNOLOGY"] == "NORTH_NUCLEAR"}
        assert [cf[f"s1d{h + 1}"] for h in range(N_HOURS)] == pytest.approx(EXPECTED)

        # CapacityFactor is an upper bound in OSeMOSYS (RateOfActivity <= cap x CF);
        # nothing pins the nuclear activity or capacity from below.
        for name in ("TotalTechnologyAnnualActivityLowerLimit.csv",
                     "TotalTechnologyModelPeriodActivityLowerLimit.csv",
                     "TotalAnnualMinCapacity.csv"):
            rows = [r for r in _read_csv(tmp, name) if r["TECHNOLOGY"] == "NORTH_NUCLEAR"]
            assert all(float(r["VALUE"]) == 0 for r in rows), f"{name}: {rows}"


# ── AdOpT-NET0: capfactor = profile, RES with curtailment allowed ──────────────

@both_placements
def test_adoptnet0_profile_is_upper_bound(on_location):
    md = _model(on_location)
    cf = adopt.compute_capfactors(md, [])
    assert cf[("north", "nuclear")] == pytest.approx(EXPECTED)

    # RES output = capfactor x size - curtailment; curtailment=1 (continuous) makes
    # the capfactor an upper bound rather than a fixed output.
    with tempfile.TemporaryDirectory() as tmp:
        adopt.build_model_dir(copy.deepcopy(md), tmp)
        tj = json.loads((Path(tmp) / "period1" / "node_data" / "north" / "technology_data"
                         / "nuclear.json").read_text(encoding="utf-8"))
    assert tj["tec_type"] == "RES"
    assert tj["Performance"]["curtailment"] == 1
    assert tj["size_min"] == 0
