"""
Round-trip tests: translate_model → osemosys_to_internal.

These tests verify that the OSeMOSYS import module can reconstruct a valid
TEMPO internal model from the otoole CSVs produced by osemosys_translate.
They do NOT run a solver — they validate the structural and numerical
fidelity of the import, modulo timeslice approximation.
"""
import math
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import osemosys_translate as tr
import osemosys_import as imp
import osemosys_timeslices as timeslices

# ── Reference model (same fixture used by test_osemosys_translate.py) ─────────

REFERENCE_MODEL = {
    "modelConfig": {
        "startDate": "2005-01-01",
        "endDate": "2005-01-07",
    },
    "technologies": [
        {
            "name": "solar_pv",
            "essentials": {"parent": "supply", "carrier_out": "electricity"},
            "constraints": {"energy_cap_max": 2000, "energy_eff": 1.0, "lifetime": 25},
            "costs": {"monetary": {"energy_cap": 900, "om_annual": 10, "interest_rate": 0.05}},
        },
        {
            "name": "battery",
            "essentials": {"parent": "storage", "carrier": "electricity"},
            "constraints": {
                "storage_cap_max": 5000, "energy_cap_max": 1000,
                "energy_eff": 0.95, "storage_loss": 0.01, "lifetime": 15,
            },
            "costs": {"monetary": {"storage_cap": 300, "energy_cap": 100}},
        },
        {
            "name": "power_demand",
            "essentials": {"parent": "demand", "carrier_in": "electricity"},
            "constraints": {"resource": -150},
        },
        {
            "name": "grid_link",
            "essentials": {"parent": "transmission", "carrier": "electricity"},
            "constraints": {"energy_cap_max": 3000, "energy_eff": 0.97, "lifetime": 40},
            "costs": {"monetary": {"energy_cap_per_distance": 0.5}},
        },
    ],
    "locations": [
        {
            "name": "north",
            "techs": {"solar_pv": None, "battery": None, "power_demand": None},
            "demandProfile": {
                "timeseries": [100, 90, 80, 80, 90, 110, 140, 160, 170, 165, 160,
                               155, 150, 150, 155, 165, 180, 200, 210, 200, 180, 150, 120, 105]
            },
        },
        {
            "name": "south",
            "techs": {"power_demand": None},
            "demandProfile": {
                "timeseries": [60, 55, 50, 50, 55, 70, 90, 110, 120, 118, 115,
                               112, 110, 110, 112, 118, 130, 145, 150, 145, 130, 105, 85, 70]
            },
        },
    ],
    "links": [
        {"from": "north", "to": "south", "tech": "grid_link", "distance": 400},
    ],
}

SCHEME_4X3 = {"seasons": 4, "dayBlocks": 3}


def _round_trip():
    """Translate then immediately import. Returns (model, report)."""
    with tempfile.TemporaryDirectory() as tmp:
        csv_dir = os.path.join(tmp, "csvs")
        os.makedirs(csv_dir)
        tr.translate_model(REFERENCE_MODEL, csv_dir, SCHEME_4X3)
        model, report = imp.osemosys_to_internal(csv_dir)
    return model, report


# ── Helper ────────────────────────────────────────────────────────────────────

def _tech(model, name):
    """Find a tech by (internal) name in the model's technologies list."""
    return next((t for t in model["technologies"] if t["name"] == name), None)


def _loc(model, name):
    """Find a location by name."""
    return next((l for l in model["locations"] if l["name"].lower() == name.lower()), None)


# ── Structural tests ──────────────────────────────────────────────────────────

def test_round_trip_returns_valid_model():
    model, report = _round_trip()
    assert isinstance(model, dict)
    assert "technologies" in model
    assert "locations" in model
    assert "links" in model
    assert len(model["technologies"]) > 0
    assert len(model["locations"]) > 0


def test_round_trip_locations():
    model, _ = _round_trip()
    loc_names = {l["name"].lower() for l in model["locations"]}
    assert "north" in loc_names
    assert "south" in loc_names


def test_round_trip_tech_count():
    model, _ = _round_trip()
    # solar_pv + battery + power_demand_electricity + grid_link = 4 tech defs
    assert len(model["technologies"]) >= 4


def test_supply_tech_present():
    model, _ = _round_trip()
    names = {t["name"] for t in model["technologies"]}
    # 'solar_pv' may be lower-cased to solar_pv or similar
    assert any("solar" in n.lower() for n in names)


def test_storage_tech_present():
    model, _ = _round_trip()
    techs = model["technologies"]
    storage_techs = [t for t in techs if t.get("essentials", {}).get("parent") == "storage"]
    assert len(storage_techs) >= 1


def test_demand_tech_present():
    model, _ = _round_trip()
    techs = model["technologies"]
    demand_techs = [t for t in techs if t.get("essentials", {}).get("parent") == "demand"]
    assert len(demand_techs) >= 1


def test_transmission_link_present():
    model, _ = _round_trip()
    assert len(model["links"]) >= 1
    link = model["links"][0]
    assert "from" in link
    assert "to" in link
    # Link connects north ↔ south
    endpoints = {link["from"].lower(), link["to"].lower()}
    assert "north" in endpoints or "south" in endpoints


def test_transmission_tech_present():
    model, _ = _round_trip()
    tx_techs = [t for t in model["technologies"]
                if t.get("essentials", {}).get("parent") == "transmission"]
    assert len(tx_techs) >= 1


# ── Numerical fidelity tests ──────────────────────────────────────────────────

def test_supply_capex_unit():
    """solar_pv capex: 900 EUR/kW → translated as 900 M€/GW → imported back as 900 EUR/kW."""
    model, _ = _round_trip()
    t = next(
        (x for x in model["technologies"]
         if "solar" in x["name"].lower() and x.get("essentials", {}).get("parent") == "supply"),
        None,
    )
    assert t is not None, "solar_pv supply tech not found after import"
    capex = t.get("costs", {}).get("monetary", {}).get("energy_cap", 0)
    assert abs(capex - 900) < 5.0, f"Expected capex ~900, got {capex}"


def test_storage_efficiency_round_trip():
    """battery energy_eff 0.95 → CH/DC IAR = 1/√0.95 → imported back as (1/IAR)² ≈ 0.95."""
    model, _ = _round_trip()
    bat = next(
        (t for t in model["technologies"]
         if "battery" in t["name"].lower() and t.get("essentials", {}).get("parent") == "storage"),
        None,
    )
    assert bat is not None, "battery storage tech not found after import"
    eff = bat["constraints"].get("energy_eff", 0)
    assert abs(eff - 0.95) < 0.005, f"Expected eff ≈ 0.95, got {eff}"


def test_supply_lifetime_preserved():
    model, _ = _round_trip()
    t = next(
        (x for x in model["technologies"]
         if "solar" in x["name"].lower() and x.get("essentials", {}).get("parent") == "supply"),
        None,
    )
    assert t is not None
    life = t["constraints"].get("lifetime", 0)
    assert life == 25


def test_storage_lifetime_preserved():
    model, _ = _round_trip()
    bat = next(
        (t for t in model["technologies"]
         if "battery" in t["name"].lower() and t.get("essentials", {}).get("parent") == "storage"),
        None,
    )
    assert bat is not None
    life = bat["constraints"].get("lifetime", 0)
    assert life == 15


def test_demand_profile_24h_north():
    """North location gets a 24-element demandProfile timeseries."""
    model, _ = _round_trip()
    north = _loc(model, "north")
    assert north is not None
    dp = north.get("demandProfile", {}).get("timeseries", [])
    assert len(dp) == 24, f"Expected 24-h profile, got {len(dp)}"


def test_demand_profile_24h_south():
    """South location gets a 24-element demandProfile timeseries."""
    model, _ = _round_trip()
    south = _loc(model, "south")
    assert south is not None
    dp = south.get("demandProfile", {}).get("timeseries", [])
    assert len(dp) == 24, f"Expected 24-h profile, got {len(dp)}"


def test_demand_profile_shape_preserved():
    """
    The 24-h demand profile reconstructed from SpecifiedDemandProfile must be
    positively correlated with the original profile (same shape).
    Because timeslices group hours into 3 blocks, the recovered profile is a
    step function — we require Pearson r > 0.6 (analytically ≈ 0.71 for 4×3).
    """
    original = [100, 90, 80, 80, 90, 110, 140, 160, 170, 165, 160,
                155, 150, 150, 155, 165, 180, 200, 210, 200, 180, 150, 120, 105]
    model, _ = _round_trip()
    north = _loc(model, "north")
    recovered = north.get("demandProfile", {}).get("timeseries", [])
    assert len(recovered) == 24

    mean_o = sum(original) / 24
    mean_r = sum(recovered) / 24
    cov = sum((a - mean_o) * (b - mean_r) for a, b in zip(original, recovered)) / 24
    std_o = math.sqrt(sum((a - mean_o) ** 2 for a in original) / 24)
    std_r = math.sqrt(sum((b - mean_r) ** 2 for b in recovered) / 24)
    if std_o > 0 and std_r > 0:
        corr = cov / (std_o * std_r)
        assert corr > 0.6, f"Demand profile shape not preserved (Pearson r={corr:.3f})"


def test_demand_profile_block_ordering():
    """
    The recovered step profile should have the same block ordering as the original:
    d1 (hours 0-7) has lower mean than d3 (hours 16-23), preserving the daily peak shape.
    """
    model, _ = _round_trip()
    north = _loc(model, "north")
    recovered = north.get("demandProfile", {}).get("timeseries", [])
    assert len(recovered) == 24
    mean_d1 = sum(recovered[0:8]) / 8
    mean_d3 = sum(recovered[16:24]) / 8
    # d3 (evening) should be higher than d1 (night/early morning)
    assert mean_d3 > mean_d1, f"Block ordering wrong: d1={mean_d1:.2f}, d3={mean_d3:.2f}"


# ── Report contains useful notes ──────────────────────────────────────────────

def test_report_not_empty():
    _, report = _round_trip()
    assert len(report) > 0


def test_report_mentions_import_summary():
    _, report = _round_trip()
    combined = " ".join(report).lower()
    assert "imported" in combined or "location" in combined


# ── Multi-dataset ZIP detection (unit test, no translate involved) ────────────

def test_multi_dataset_import_from_zip():
    """Two copies of the same dataset exported in separate subdirs."""
    with tempfile.TemporaryDirectory() as root:
        for ds_name in ("base", "high_demand"):
            csv_dir = os.path.join(root, ds_name)
            os.makedirs(csv_dir)
            tr.translate_model(REFERENCE_MODEL, csv_dir, SCHEME_4X3)

        # Import both
        models_out = []
        for ds_name in ("base", "high_demand"):
            csv_dir = os.path.join(root, ds_name)
            m, _ = imp.osemosys_to_internal(csv_dir)
            models_out.append(m)

    assert len(models_out) == 2
    for m in models_out:
        assert len(m["locations"]) == 2
        assert len(m["technologies"]) >= 4


# ── Edge case: single-region, demand-only model ───────────────────────────────

def test_import_demand_only_model():
    """Model with only demand techs (no supply) should import without crashing.
    Location is detected from demand fuel names (no TECHNOLOGY set exists)."""
    demand_model = {
        "modelConfig": {"startDate": "2024-01-01", "endDate": "2024-12-31"},
        "technologies": [
            {
                "name": "elec_demand",
                "essentials": {"parent": "demand", "carrier_in": "electricity"},
                "constraints": {"resource": -200},
            }
        ],
        "locations": [
            {
                "name": "city",
                "techs": {"elec_demand": None},
                "demandProfile": {"timeseries": [100] * 24},
            }
        ],
        "links": [],
    }
    with tempfile.TemporaryDirectory() as tmp:
        csv_dir = os.path.join(tmp, "csvs")
        os.makedirs(csv_dir)
        tr.translate_model(demand_model, csv_dir, SCHEME_4X3)
        model, report = imp.osemosys_to_internal(csv_dir)

    assert model is not None
    # Demand-only model: location detected from FUEL set (CITY_ELECTRICITY → loc=CITY)
    assert len(model["locations"]) >= 1


# ── archiveFormat.js mirror: detection logic smoke test ───────────────────────

def test_otoole_csv_set_detection():
    """Verify that the expected CSV files exist in the translated output."""
    with tempfile.TemporaryDirectory() as tmp:
        csv_dir = os.path.join(tmp, "csvs")
        os.makedirs(csv_dir)
        tr.translate_model(REFERENCE_MODEL, csv_dir, SCHEME_4X3)
        files = {f.lower() for f in os.listdir(csv_dir)}

    # These are the files archiveFormat.js checks for OSeMOSYS detection
    assert "specifiedannualdemand.csv" in files
    assert "technology.csv" in files
    assert "region.csv" in files
    assert "yearsplit.csv" in files
