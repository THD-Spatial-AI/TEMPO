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


def test_min_capacity_round_trip():
    import copy
    md = copy.deepcopy(REFERENCE_MODEL)
    north = next(l for l in md["locations"] if l["name"] == "north")
    north["techs"]["solar_pv"] = {"constraints": {"energy_cap_equals": 349.5}}
    north["techs"]["battery"] = {"constraints": {"energy_cap_min": 15.0}}
    next(t for t in md["technologies"] if t["name"] == "grid_link")["constraints"]["energy_cap_min"] = 500
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(md, tmp, SCHEME_4X3)
        model, _ = imp.osemosys_to_internal(tmp)
    solar = _tech(model, "solar_pv")["constraints"]
    assert solar["energy_cap_equals"] == 349.5
    assert "energy_cap_max" not in solar and "energy_cap_min" not in solar
    batt = _tech(model, "battery")["constraints"]
    assert batt["energy_cap_min"] == 15.0 and batt["energy_cap_max"] == 1000
    tx = next(t for t in model["technologies"] if t["essentials"]["parent"] == "transmission")
    assert tx["constraints"]["energy_cap_min"] == 500 and tx["constraints"]["energy_cap_max"] == 3000


# ── Parity datasets (TEMPO's own export) ──────────────────────────────────────

import json  # noqa: E402

import pytest  # noqa: E402

ROOT = Path(__file__).parent.parent.parent
RICH = ROOT / "scripts" / "reference_model_rich.json"


def _parity_dir(md, tmp_path):
    tr.translate_model(md, str(tmp_path), timeslices.parity_scheme(168), parity=True)
    return str(tmp_path)


def test_import_prefers_tempo_model_json(tmp_path):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    (tmp_path / "tempo_model.json").write_text(json.dumps(md), encoding="utf-8")
    (tmp_path / "REGION.csv").write_text("VALUE\nREGION1\n")
    model, report = imp.osemosys_to_internal(str(tmp_path))
    assert model == md
    assert any("tempo_model.json" in r for r in report)


def test_import_parity_csvs_without_tempo_json(tmp_path):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    model, report = imp.osemosys_to_internal(_parity_dir(md, tmp_path))
    techs = {t["name"]: t for t in model["technologies"]}
    bat = techs["battery"]
    assert bat["essentials"]["parent"] == "storage"
    assert bat["constraints"]["energy_eff"] == pytest.approx(0.95)
    assert bat["constraints"]["storage_loss"] == pytest.approx(0.0)
    crf15 = 0.05 / (1 - 1.05 ** -15)
    assert bat["costs"]["monetary"]["storage_cap"] == pytest.approx(150 * crf15, rel=1e-5)
    assert bat["costs"]["monetary"]["energy_cap"] == pytest.approx(80 * crf15, rel=1e-6)
    # annualised capex imported with lifetime 1 / interest 0 → same annual cost
    solar = techs["solar_pv"]
    assert solar["constraints"]["lifetime"] == 1
    assert solar["costs"]["monetary"]["interest_rate"] == 0
    assert solar["costs"]["monetary"]["energy_cap"] == pytest.approx(600 * 0.05 / (1 - 1.05 ** -25), rel=1e-6)
    assert "om_prod" not in solar["costs"]["monetary"]          # parity ε cost dropped
    assert techs["ccgt"]["costs"]["monetary"]["om_prod"] == pytest.approx(0.004, rel=1e-4)
    assert techs["ccgt"]["constraints"]["energy_eff"] == pytest.approx(0.55, rel=1e-5)
    assert model["modelConfig"]["cyclicStorage"] is True
    assert any("annualised" in r for r in report)


def test_import_parity_links_are_two_mode(tmp_path):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    model, _ = imp.osemosys_to_internal(_parity_dir(md, tmp_path))
    links = {(l["from"], l["to"]): l for l in model["links"]}
    assert set(links) == {("North", "South"), ("South", "East"), ("East", "North")}
    ns = links[("North", "South")]
    assert ns["tech"] == "hvac"
    crf40 = 0.05 / (1 - 1.05 ** -40)
    assert ns["linkConfig"]["costs"]["monetary"]["energy_cap"] == pytest.approx((20 + 0.8 * 400) * crf40, rel=1e-6)
    assert ns["linkConfig"]["constraints"]["energy_eff"] == pytest.approx(0.98)
    assert ns["linkConfig"]["constraints"]["energy_cap_max"] == pytest.approx(3000)


def test_import_parity_demand_and_cf_absolute(tmp_path):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    model, _ = imp.osemosys_to_internal(_parity_dir(md, tmp_path))
    locs = {l["name"]: l for l in model["locations"]}
    orig = {l["name"]: l for l in md["locations"]}
    assert locs["North"]["demandProfile"]["timeseries"] == pytest.approx(
        orig["north"]["demandProfile"]["timeseries"], rel=1e-6)
    north_solar = locs["North"]["techs"]["solar_pv"]
    assert north_solar["constraints"]["energy_cap_max"] == pytest.approx(1500)
    assert north_solar["constraints"]["resource_unit"] == "energy_per_cap"
    ref = north_solar["constraints"]["resource"]
    ts = next(t for t in model["timeSeries"] if f"file={t['fileName']}:cf" == ref)
    cf_orig = [r["cf"] for r in md["timeSeries"][0]["data"][:24]]
    assert [r["cf"] for r in ts["data"][:24]] == pytest.approx(cf_orig, abs=1e-6)
    assert len(ts["data"]) == 8760


def test_import_parity_lossy_non_cyclic(tmp_path):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    md["modelConfig"]["cyclicStorage"] = False
    next(t for t in md["technologies"] if t["name"] == "battery")["constraints"]["storage_loss"] = 0.01
    model, _ = imp.osemosys_to_internal(_parity_dir(md, tmp_path))
    bat = next(t for t in model["technologies"] if t["name"] == "battery")
    assert bat["constraints"]["storage_loss"] == pytest.approx(0.01)
    assert model["modelConfig"]["cyclicStorage"] is False


def test_import_parity_cap_sentinel_is_shared(tmp_path, monkeypatch):
    # 950 GW is below translate's 999 GW "unbounded" stand-in → a real bound
    md = json.loads(RICH.read_text(encoding="utf-8"))
    next(t for t in md["technologies"] if t["name"] == "gas_supply")["constraints"]["energy_cap_max"] = 950e6
    model, _ = imp.osemosys_to_internal(_parity_dir(md, tmp_path))
    south = next(l for l in model["locations"] if l["name"] == "South")
    assert south["techs"]["gas_supply"]["constraints"]["energy_cap_max"] == pytest.approx(950e6)


def test_import_parity_existing_shadow_round_trips_as_equals(tmp_path):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    solar = next(t for t in md["technologies"] if t["name"] == "solar_pv")
    shadow = json.loads(json.dumps(solar))
    shadow["name"] = "solar_pv_existing"
    shadow["costs"]["monetary"]["energy_cap"] = 0
    shadow["constraints"].pop("energy_cap_max", None)
    md["technologies"].append(shadow)
    md["locations"][0]["techs"]["solar_pv_existing"] = {"constraints": {"energy_cap_equals": 349.485}}
    model, _ = imp.osemosys_to_internal(_parity_dir(md, tmp_path))
    north = next(l for l in model["locations"] if l["name"] == "North")
    cons = north["techs"]["solar_pv_existing"]["constraints"]
    assert cons["energy_cap_equals"] == pytest.approx(349.485)
    assert "energy_cap_max" not in cons
    sh = next(t for t in model["technologies"] if t["name"] == "solar_pv_existing")
    assert not sh["costs"]["monetary"].get("energy_cap")
