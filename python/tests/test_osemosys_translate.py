"""
Tests for osemosys_translate.py.
Validates CSV structure and correctness without requiring otoole or any solver.
"""
import csv
import json
import math
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import osemosys_translate as tr

# ── Reference model fixture ────────────────────────────────────────────────

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


def _read_csv(csv_dir, name):
    """Return list of row dicts from a CSV file in csv_dir."""
    path = os.path.join(csv_dir, name)
    assert os.path.exists(path), f"Expected CSV not found: {name}"
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _values(rows, col="VALUE"):
    return [r[col] for r in rows]


# ─── Structure: all expected CSVs exist ───────────────────────────────────────

EXPECTED_CSVS = [
    "REGION.csv", "TECHNOLOGY.csv", "FUEL.csv", "YEAR.csv", "TIMESLICE.csv",
    "MODE_OF_OPERATION.csv", "EMISSION.csv", "STORAGE.csv",
    "CapitalCost.csv", "FixedCost.csv", "VariableCost.csv",
    "OperationalLife.csv", "TotalAnnualMaxCapacity.csv",
    "InputActivityRatio.csv", "OutputActivityRatio.csv",
    "CapacityToActivityUnit.csv", "AvailabilityFactor.csv", "ResidualCapacity.csv",
    "CapacityFactor.csv", "SpecifiedAnnualDemand.csv",
    "SpecifiedDemandProfile.csv", "YearSplit.csv",
]


def test_all_expected_csvs_written():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        for name in EXPECTED_CSVS:
            assert os.path.exists(os.path.join(tmp, name)), f"Missing: {name}"


def test_returns_csv_dir_and_report():
    with tempfile.TemporaryDirectory() as tmp:
        result_dir, report = tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        assert result_dir == tmp
        assert isinstance(report, list)
        assert len(report) >= 1


# ─── Sets ─────────────────────────────────────────────────────────────────────

def test_region_set():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "REGION.csv")
        assert [r["VALUE"] for r in rows] == ["REGION1"]


def test_year_set_matches_start_date():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "YEAR.csv")
        assert rows[0]["VALUE"] == "2005"


def test_timeslice_count_matches_scheme():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "TIMESLICE.csv")
        assert len(rows) == 4 * 3  # 12 slices


def test_mode_of_operation_is_one():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "MODE_OF_OPERATION.csv")
        assert [r["VALUE"] for r in rows] == ["1"]


def test_storage_set_empty():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "STORAGE.csv")
        assert rows == []


# ─── Technology set ───────────────────────────────────────────────────────────

def test_technology_set_contains_supply():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        techs = {r["VALUE"] for r in _read_csv(tmp, "TECHNOLOGY.csv")}
        assert "NORTH_SOLAR_PV" in techs


def test_technology_set_contains_storage_charge_discharge():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        techs = {r["VALUE"] for r in _read_csv(tmp, "TECHNOLOGY.csv")}
        assert "NORTH_BATTERY_CH" in techs
        assert "NORTH_BATTERY_DC" in techs


def test_technology_set_contains_bidirectional_tx():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        techs = {r["VALUE"] for r in _read_csv(tmp, "TECHNOLOGY.csv")}
        assert "NORTH_SOUTH_GRID_LINK" in techs
        assert "SOUTH_NORTH_GRID_LINK" in techs


def test_demand_not_in_technology_set():
    """Demand is encoded as SpecifiedAnnualDemand, not a TECHNOLOGY."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        techs = {r["VALUE"] for r in _read_csv(tmp, "TECHNOLOGY.csv")}
        assert not any("DEMAND" in t for t in techs)


# ─── Fuel set ─────────────────────────────────────────────────────────────────

def test_fuel_set_contains_loc_carrier_pairs():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        fuels = {r["VALUE"] for r in _read_csv(tmp, "FUEL.csv")}
        assert "NORTH_ELECTRICITY" in fuels
        assert "SOUTH_ELECTRICITY" in fuels


def test_fuel_set_contains_storage_virtual_fuel():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        fuels = {r["VALUE"] for r in _read_csv(tmp, "FUEL.csv")}
        assert "NORTH_BATTERY_STORED" in fuels


# ─── CapitalCost ──────────────────────────────────────────────────────────────

def test_capital_cost_supply_unit_conversion():
    """solar_pv energy_cap=900 EUR/kW → 900 M€/GW."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _read_csv(tmp, "CapitalCost.csv")}
        assert abs(rows["NORTH_SOLAR_PV"] - 900.0) < 1e-3


def test_capital_cost_tx_split_between_directions():
    """grid_link capex = 0.5 EUR/kW/km × 400 km = 200 EUR/kW → 200 M€/GW total.
    Split evenly between fwd and rev: each gets 100 M€/GW."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _read_csv(tmp, "CapitalCost.csv")}
        assert abs(rows["NORTH_SOUTH_GRID_LINK"] - 100.0) < 1e-3
        assert abs(rows["SOUTH_NORTH_GRID_LINK"] - 100.0) < 1e-3


# ─── YearSplit ────────────────────────────────────────────────────────────────

def test_year_split_sums_to_one():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "YearSplit.csv")
        total = sum(float(r["VALUE"]) for r in rows)
        assert abs(total - 1.0) < 1e-9


def test_year_split_row_count_matches_timeslices():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "YearSplit.csv")
        assert len(rows) == 12


# ─── SpecifiedAnnualDemand ────────────────────────────────────────────────────

def test_specified_annual_demand_has_both_locations():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["FUEL"]: float(r["VALUE"]) for r in _read_csv(tmp, "SpecifiedAnnualDemand.csv")}
        assert "NORTH_ELECTRICITY" in rows
        assert "SOUTH_ELECTRICITY" in rows


def test_specified_annual_demand_unit_conversion():
    """north demand: mean≈144.375 kW × 168 h = 24255 kWh × 3.6e-9 = 8.7318e-5 PJ."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["FUEL"]: float(r["VALUE"]) for r in _read_csv(tmp, "SpecifiedAnnualDemand.csv")}
        north_demand_kw = [100, 90, 80, 80, 90, 110, 140, 160, 170, 165, 160,
                           155, 150, 150, 155, 165, 180, 200, 210, 200, 180, 150, 120, 105]
        import itertools
        tiled = list(itertools.islice(itertools.cycle(north_demand_kw), 168))
        expected_pj = sum(tiled) * 3.6e-9
        assert abs(rows["NORTH_ELECTRICITY"] - expected_pj) / expected_pj < 1e-6


# ─── SpecifiedDemandProfile ───────────────────────────────────────────────────

def test_demand_profile_sums_to_one_per_fuel():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "SpecifiedDemandProfile.csv")
        # Fuels without demand carry an explicit all-zero profile (GLPK needs a value for every fuel)
        with_demand = {r["FUEL"] for r in _read_csv(tmp, "SpecifiedAnnualDemand.csv") if float(r["VALUE"]) != 0}
        by_fuel: dict = {}
        for r in rows:
            by_fuel.setdefault(r["FUEL"], 0.0)
            by_fuel[r["FUEL"]] += float(r["VALUE"])
        for fuel, total in by_fuel.items():
            expected = 1.0 if fuel in with_demand else 0.0
            assert abs(total - expected) < 1e-6, f"SpecifiedDemandProfile sum for {fuel} = {total}"


def test_demand_profile_has_12_rows_per_fuel():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "SpecifiedDemandProfile.csv")
        by_fuel: dict = {}
        for r in rows:
            by_fuel.setdefault(r["FUEL"], 0)
            by_fuel[r["FUEL"]] += 1
        for fuel, count in by_fuel.items():
            assert count == 12, f"{fuel} has {count} profile rows (expected 12)"


# ─── InputActivityRatio / OutputActivityRatio ──────────────────────────────────

def test_tx_input_activity_ratio():
    """grid_link eff=0.97 → IAR = 1/0.97 ≈ 1.030928."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["TECHNOLOGY"]: float(r["VALUE"])
                for r in _read_csv(tmp, "InputActivityRatio.csv")}
        expected = 1.0 / 0.97
        assert abs(rows["NORTH_SOUTH_GRID_LINK"] - expected) < 1e-4


def test_storage_charge_input_fuel():
    """Battery charge tech draws from NORTH_ELECTRICITY."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "InputActivityRatio.csv")
        ch = [r for r in rows if r["TECHNOLOGY"] == "NORTH_BATTERY_CH"]
        assert len(ch) == 1
        assert ch[0]["FUEL"] == "NORTH_ELECTRICITY"


def test_storage_discharge_output_fuel():
    """Battery discharge tech feeds NORTH_ELECTRICITY."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "OutputActivityRatio.csv")
        dc = [r for r in rows if r["TECHNOLOGY"] == "NORTH_BATTERY_DC" and r["FUEL"] == "NORTH_ELECTRICITY"]
        assert len(dc) == 1


def test_storage_round_trip_efficiency():
    """battery energy_eff=0.95: loss captured via IAR on both ch and dc techs.
    CH IAR[electricity] = DC IAR[stored] = 1/√0.95 ≈ 1.0260. OAR values are 1.0."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        iar_rows = {r["TECHNOLOGY"]: float(r["VALUE"])
                    for r in _read_csv(tmp, "InputActivityRatio.csv")}
        oar_rows = {r["TECHNOLOGY"]: float(r["VALUE"])
                    for r in _read_csv(tmp, "OutputActivityRatio.csv")
                    if r["FUEL"] == "NORTH_ELECTRICITY"}
        expected_iar = 1.0 / math.sqrt(0.95)
        assert abs(iar_rows.get("NORTH_BATTERY_CH", -1) - expected_iar) < 1e-4
        assert abs(iar_rows.get("NORTH_BATTERY_DC", -1) - expected_iar) < 1e-4
        assert oar_rows.get("NORTH_BATTERY_DC") == 1.0


def test_supply_output_activity_ratio_is_one():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["TECHNOLOGY"]: float(r["VALUE"])
                for r in _read_csv(tmp, "OutputActivityRatio.csv")}
        assert rows.get("NORTH_SOLAR_PV") == 1.0


# ─── CapacityToActivityUnit ───────────────────────────────────────────────────

def test_capacity_to_activity_unit_value():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "CapacityToActivityUnit.csv")
        for r in rows:
            assert abs(float(r["VALUE"]) - 31.536) < 1e-6


# ─── CapacityFactor ───────────────────────────────────────────────────────────

def test_capacity_factor_all_ones():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = _read_csv(tmp, "CapacityFactor.csv")
        for r in rows:
            assert float(r["VALUE"]) == 1.0


def test_capacity_factor_row_count():
    """Each non-demand tech × 12 slices × 1 year."""
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        n_techs = len(_read_csv(tmp, "TECHNOLOGY.csv"))
        cf_rows = _read_csv(tmp, "CapacityFactor.csv")
        # Each tech should have exactly 12 rows
        by_tech: dict = {}
        for r in cf_rows:
            by_tech.setdefault(r["TECHNOLOGY"], 0)
            by_tech[r["TECHNOLOGY"]] += 1
        for tech, count in by_tech.items():
            assert count == 12, f"{tech} has {count} CF rows"


# ─── OperationalLife ─────────────────────────────────────────────────────────

def test_operational_life_solar():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["TECHNOLOGY"]: int(r["VALUE"]) for r in _read_csv(tmp, "OperationalLife.csv")}
        assert rows["NORTH_SOLAR_PV"] == 25


def test_operational_life_battery():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, SCHEME_4X3)
        rows = {r["TECHNOLOGY"]: int(r["VALUE"]) for r in _read_csv(tmp, "OperationalLife.csv")}
        assert rows["NORTH_BATTERY_CH"] == 15
        assert rows["NORTH_BATTERY_DC"] == 15


# ─── Edge cases ───────────────────────────────────────────────────────────────

def test_minimal_model_no_links_no_storage():
    """Model with just supply + demand, no links or storage."""
    model = {
        "modelConfig": {"startDate": "2024-01-01", "endDate": "2024-01-01"},
        "technologies": [
            {"name": "wind", "essentials": {"parent": "supply", "carrier_out": "electricity"},
             "constraints": {"energy_cap_max": 100, "lifetime": 20},
             "costs": {"monetary": {"energy_cap": 1200}}},
            {"name": "load", "essentials": {"parent": "demand", "carrier_in": "electricity"},
             "constraints": {"resource": -50}},
        ],
        "locations": [{"name": "A", "techs": {"wind": None, "load": None}}],
        "links": [],
    }
    with tempfile.TemporaryDirectory() as tmp:
        csv_dir, report = tr.translate_model(model, tmp)
        techs = {r["VALUE"] for r in _read_csv(tmp, "TECHNOLOGY.csv")}
        assert "A_WIND" in techs
        assert "A_LOAD" not in techs  # demand is not a technology
        rows = _read_csv(tmp, "SpecifiedAnnualDemand.csv")
        assert len(rows) == 1
        assert rows[0]["FUEL"] == "A_ELECTRICITY"


def test_unknown_tech_ref_reported():
    """Tech reference that doesn't exist in technologies list goes to report."""
    model = {
        "modelConfig": {"startDate": "2024-01-01", "endDate": "2024-01-01"},
        "technologies": [],
        "locations": [{"name": "X", "techs": {"ghost": None}}],
        "links": [],
    }
    with tempfile.TemporaryDirectory() as tmp:
        _csv_dir, report = tr.translate_model(model, tmp)
        assert any("ghost" in r.lower() for r in report)


def test_1x1_scheme_produces_one_timeslice():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(REFERENCE_MODEL, tmp, {"seasons": 1, "dayBlocks": 1})
        rows = _read_csv(tmp, "TIMESLICE.csv")
        assert len(rows) == 1
        assert rows[0]["VALUE"] == "s1d1"
        ys_rows = _read_csv(tmp, "YearSplit.csv")
        assert abs(float(ys_rows[0]["VALUE"]) - 1.0) < 1e-9


# ─── OSM study-area demand: file=name:col resource on inline loc techs ─────────

def _osm_demand_model():
    """A location whose demand is a `file=` timeseries on the inline power_demand
    tech (as written by the OSM study-area importer), with a global demand tech
    that only carries the parent."""
    data = [{"datetime": f"2005-01-01 {h:02d}:00:00", "dem_1": -(10 + h)} for h in range(24)]
    return {
        "modelConfig": {"startDate": "2005-01-01", "endDate": "2005-01-01"},
        "technologies": [
            {"name": "solar_pv", "essentials": {"parent": "supply", "carrier_out": "electricity"},
             "constraints": {"energy_cap_max": 2000, "energy_eff": 1.0, "lifetime": 25},
             "costs": {"monetary": {"energy_cap": 900}}},
            {"id": "power_demand", "name": "power_demand",
             "essentials": {"parent": "demand", "carrier": "electricity"}},  # no constraints
        ],
        "locations": [{
            "name": "arica",
            "techs": {
                "solar_pv": None,
                "power_demand": {"constraints": {"resource": "file=osm_substation_demand.csv:dem_1", "force_resource": True}},
            },
        }],
        "timeSeries": [{
            "name": "osm_substation_demand", "fileName": "osm_substation_demand.csv",
            "columns": ["datetime", "dem_1"], "dataColumns": ["dem_1"], "data": data,
        }],
    }


def test_osm_file_ref_demand_produces_annual_demand():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(_osm_demand_model(), tmp, SCHEME_4X3)
        rows = {r["FUEL"]: float(r["VALUE"]) for r in _read_csv(tmp, "SpecifiedAnnualDemand.csv")}
        assert "ARICA_ELECTRICITY" in rows
        # 24 h of |−(10+h)| kW = sum(10..33) = 516 kWh × 3.6e-9 PJ.
        assert abs(rows["ARICA_ELECTRICITY"] - 516 * 3.6e-9) / (516 * 3.6e-9) < 1e-6


def test_osm_file_ref_demand_profile_sums_to_one():
    with tempfile.TemporaryDirectory() as tmp:
        tr.translate_model(_osm_demand_model(), tmp, SCHEME_4X3)
        rows = [r for r in _read_csv(tmp, "SpecifiedDemandProfile.csv") if r["FUEL"] == "ARICA_ELECTRICITY"]
        assert abs(sum(float(r["VALUE"]) for r in rows) - 1.0) < 1e-6


# ── Parity mode (runner only) ──────────────────────────────────────────────

REF = Path(__file__).parent.parent.parent / "scripts" / "reference_model.json"
RICH = Path(__file__).parent.parent.parent / "scripts" / "reference_model_rich.json"


def _rows(d, name):
    with open(Path(d) / name, encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _parity(md):
    import osemosys_timeslices as tsl
    d = tempfile.mkdtemp()
    tr.translate_model(md, d, tsl.parity_scheme(168), parity=True)
    return d


def test_parity_demand_is_annualised():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = _parity(md)
    north = next(r for r in _rows(d, "SpecifiedAnnualDemand.csv") if r["FUEL"] == "NORTH_ELECTRICITY")
    window_kwh = sum([100, 90, 80, 80, 90, 110, 140, 160, 170, 165, 160, 155, 150, 150, 155,
                      165, 180, 200, 210, 200, 180, 150, 120, 105]) * 7
    assert float(north["VALUE"]) == pytest.approx(window_kwh * 3.6e-9 * 8760 / 168, rel=1e-6)


def test_parity_capex_annualised_life_one():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = _parity(md)
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    life = {r["TECHNOLOGY"]: int(r["VALUE"]) for r in _rows(d, "OperationalLife.csv")}
    crf = 0.05 / (1 - 1.05 ** -25)
    assert cc["NORTH_SOLAR_PV"] == pytest.approx(900 * crf, rel=1e-6)
    assert life["NORTH_SOLAR_PV"] == 1


def test_legacy_mode_unchanged():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = tempfile.mkdtemp()
    tr.translate_model(md, d)
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    assert cc["NORTH_SOLAR_PV"] == pytest.approx(900)


def test_parity_cf_and_location_override():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    cf = {(r["TECHNOLOGY"], r["TIMESLICE"]): float(r["VALUE"]) for r in _rows(d, "CapacityFactor.csv")}
    assert cf[("NORTH_SOLAR_PV", "s1d13")] == pytest.approx(0.72)   # hour 12 → bracket 13
    assert cf[("NORTH_SOLAR_PV", "s1d1")] == pytest.approx(0.0)
    assert cf[("SOUTH_GAS_SUPPLY", "s1d1")] == pytest.approx(1.0)
    cap = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "TotalAnnualMaxCapacity.csv")}
    assert cap["NORTH_SOLAR_PV"] == pytest.approx(1500 / 1e6)        # location override
    assert cap["EAST_SOLAR_PV"] == pytest.approx(3000 / 1e6)


def test_parity_transmission_single_two_mode_tech():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = _parity(md)
    techs = [r["VALUE"] for r in _rows(d, "TECHNOLOGY.csv")]
    assert "TX_NORTH_SOUTH_GRID_LINK" in techs
    assert not any(t.startswith("NORTH_SOUTH_") or t.startswith("SOUTH_NORTH_") for t in techs)
    modes = [r["VALUE"] for r in _rows(d, "MODE_OF_OPERATION.csv")]
    assert modes == ["1", "2"]
    inp = {(r["FUEL"], r["MODE_OF_OPERATION"]): float(r["VALUE"])
           for r in _rows(d, "InputActivityRatio.csv") if r["TECHNOLOGY"] == "TX_NORTH_SOUTH_GRID_LINK"}
    out = {(r["FUEL"], r["MODE_OF_OPERATION"]): float(r["VALUE"])
           for r in _rows(d, "OutputActivityRatio.csv") if r["TECHNOLOGY"] == "TX_NORTH_SOUTH_GRID_LINK"}
    assert inp == {("NORTH_ELECTRICITY", "1"): 1.0, ("SOUTH_ELECTRICITY", "2"): 1.0}
    assert out == {("SOUTH_ELECTRICITY", "1"): 0.97, ("NORTH_ELECTRICITY", "2"): 0.97}
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    assert cc["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(0.5 * 400 * (0.05 / (1 - 1.05 ** -40)), rel=1e-6)


def test_parity_storage_and_time_structure():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    assert [r["VALUE"] for r in _rows(d, "STORAGE.csv")] == ["NORTH_BATTERY_S"]
    techs = [r["VALUE"] for r in _rows(d, "TECHNOLOGY.csv")]
    assert "NORTH_BATTERY" in techs and "NORTH_BATTERY_CH" not in techs
    to_s = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "TechnologyToStorage.csv")}
    from_s = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "TechnologyFromStorage.csv")}
    assert to_s == {("NORTH_BATTERY", "1"): pytest.approx(0.95)}
    assert from_s == {("NORTH_BATTERY", "2"): pytest.approx(1 / 0.95)}
    ccs = float(_rows(d, "CapitalCostStorage.csv")[0]["VALUE"])
    assert ccs == pytest.approx(150 * (0.05 / (1 - 1.05 ** -15)) * 277.778, rel=1e-5)
    assert [r["VALUE"] for r in _rows(d, "SEASON.csv")] == ["1"]
    assert len(_rows(d, "DAILYTIMEBRACKET.csv")) == 24
    ds = _rows(d, "DaySplit.csv")
    assert float(ds[0]["VALUE"]) == pytest.approx(1 / 8760)
    assert float(_rows(d, "DaysInDayType.csv")[0]["VALUE"]) == pytest.approx(365.0)
    lh = {(r["TIMESLICE"], r["DAILYTIMEBRACKET"]) for r in _rows(d, "Conversionlh.csv") if r["VALUE"] == "1"}
    assert ("s1d13", "13") in lh
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    crf = 0.05 / (1 - 1.05 ** -15)
    assert cc["NORTH_BATTERY"] == pytest.approx(80 * crf, rel=1e-6)
    fx = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "FixedCost.csv")}
    assert fx["NORTH_BATTERY"] == pytest.approx(2)


def test_parity_datafile_has_time_structure_and_storage():
    import osemosys_runner as R
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    dat = Path(R._write_datafile(d, str(Path(d) / "results"), discount_rate=1e-9)).read_text(encoding="utf-8")
    assert "set SEASON := 1 ;" in dat
    assert "set DAILYTIMEBRACKET := 1 2 3" in dat
    assert "set STORAGE := NORTH_BATTERY_S ;" in dat
    assert "set MODE_OF_OPERATION := 1 2 ;" in dat
    for p in ("Conversionlh", "DaySplit", "DaysInDayType", "TechnologyToStorage",
              "TechnologyFromStorage", "CapitalCostStorage", "StorageLevelStart",
              "OperationalLifeStorage", "DiscountRateStorage"):
        assert f"param {p} default 0 :=" in dat, p
    assert "[REGION1] 1e-09" in dat


def test_parity_tiny_variable_cost_replaces_zeros():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    vc = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "VariableCost.csv")}
    assert vc[("NORTH_SOLAR_PV", "1")] == pytest.approx(1e-4)
    assert vc[("TX_NORTH_SOUTH_HVAC", "1")] == pytest.approx(1e-4)
    assert vc[("TX_NORTH_SOUTH_HVAC", "2")] == pytest.approx(1e-4)
    assert vc[("NORTH_BATTERY", "1")] == pytest.approx(1e-4)
    assert vc[("SOUTH_GAS_SUPPLY", "1")] == pytest.approx(0.03 * 277.778, rel=1e-6)
    assert min(vc.values()) > 0


def test_parity_unused_mode_two_has_tiny_cost():
    # MODE_OF_OPERATION is {1, 2} in parity; a single-mode tech's mode 2 has no
    # ratios, so at zero cost it is free phantom activity in spare capacity.
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    vc = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "VariableCost.csv")}
    techs = [r["VALUE"] for r in _rows(d, "TECHNOLOGY.csv")]
    for t in techs:
        assert vc.get((t, "2"), 0) > 0, t
    assert vc[("SOUTH_CCGT", "2")] == pytest.approx(1e-4)


def test_legacy_variable_cost_keeps_zeros():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = tempfile.mkdtemp()
    tr.translate_model(md, d)
    vc = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "VariableCost.csv")}
    assert vc[("NORTH_SOLAR_PV", "1")] == 0.0


def test_datafile_results_path_is_short():
    import osemosys_runner as R
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = Path(tempfile.mkdtemp()) / ("x" * 60) / ("y" * 60) / "csvs"
    _parity_dir = str(d)
    import osemosys_timeslices as tsl
    tr.translate_model(md, _parity_dir, tsl.parity_scheme(168), parity=True)
    dat = Path(R._write_datafile(_parity_dir, str(d.parent / "results"), discount_rate=1e-9)).read_text(encoding="utf-8")
    line = next(l for l in dat.splitlines() if l.startswith("param ResultsPath"))
    assert line == 'param ResultsPath := "../results" ;'


# ── Runner (solver mocked) ──────────────────────────────────────────────────

def _mock_runner(monkeypatch, parses):
    """Mock glpsol; returns (R, solves, kept) — one entry per translate call and
    the results_dir handed to _build_contract."""
    import osemosys_runner as R
    solves, kept = [], {}
    real_tr = R.translate.translate_model

    def spy_tr(md, csv_dir, scheme=None, parity=False):
        solves.append(csv_dir)
        kept.setdefault("schemes", []).append(dict(scheme))
        return real_tr(md, csv_dir, scheme, parity=parity)

    seq = iter(parses)
    monkeypatch.setattr(R.translate, "translate_model", spy_tr)
    monkeypatch.setattr(R, "_find_glpsol", lambda: "glpsol")
    monkeypatch.setattr(R, "_run_glpsol", lambda *a, **k: None)
    monkeypatch.setattr(R, "_solve_with_highs", lambda *a, **k: None)   # these tests exercise the GLPK path
    monkeypatch.setattr(R, "_parse_glpsol_output", lambda path: next(seq))

    def fake_contract(results_dir, *a, **kw):
        kept["results_dir"] = results_dir
        return {"termination_condition": "optimal", "objective": a[-1] if a else None}

    monkeypatch.setattr(R, "_build_contract", fake_contract)
    return R, solves, kept


def test_runner_single_solve_with_storage(monkeypatch):
    # Storage is cyclic in the patched model: one solve, no storage-day start passes.
    md = json.loads(RICH.read_text(encoding="utf-8"))
    R, solves, kept = _mock_runner(monkeypatch, [("optimal", 3.0)])
    res = R.run_model(md, tempfile.mkdtemp())
    assert len(solves) == 1
    assert res["termination_condition"] == "optimal"
    lh = {r["TIMESLICE"]: r["DAILYTIMEBRACKET"] for r in _rows(solves[0], "Conversionlh.csv") if r["VALUE"] == "1"}
    assert lh["s1d1"] == "1" and lh["s1d24"] == "24"


def test_runner_non_optimal_returns_failure(monkeypatch):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    R, solves, kept = _mock_runner(monkeypatch, [("infeasible", None)])
    res = R.run_model(md, tempfile.mkdtemp())
    assert res["success"] is False and res["termination_condition"] == "infeasible"
    assert "results_dir" not in kept


def test_runner_user_scheme_uses_whole_days(monkeypatch):
    md = json.loads(RICH.read_text(encoding="utf-8"))
    md["modelConfig"]["osemosysScheme"] = {"seasons": 1, "dayBlocks": 3}
    R, solves, kept = _mock_runner(monkeypatch, [("optimal", 3.0)])
    R.run_model(md, tempfile.mkdtemp())
    assert kept["schemes"][0] == {"seasons": 1, "dayBlocks": 3, "wholeDays": True}


def test_parity_summary_wording():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = tempfile.mkdtemp()
    import osemosys_timeslices as tsl
    _, report = tr.translate_model(md, d, tsl.parity_scheme(168), parity=True)
    assert not any("capacity on sending side" in line for line in report)
    assert any("one capacity shared by both directions" in line for line in report)


# ─── energy_cap_equals / energy_cap_min (Calliope 0.6 fixed / floor capacity) ──

def _with_fixed_caps(md):
    north = next(l for l in md["locations"] if l["name"] == "north")
    north["techs"]["solar_pv"] = {"constraints": {"energy_cap_equals": 349.5}}
    north["techs"]["battery"] = {"constraints": {"energy_cap_min": 15.0}}
    link = next(t for t in md["technologies"] if t["name"] == "grid_link")
    link["constraints"]["energy_cap_equals"] = 500
    return md


def _caps(d, name):
    return {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, name)}


def test_parity_energy_cap_equals_and_min():
    d = _parity(_with_fixed_caps(json.loads(REF.read_text(encoding="utf-8"))))
    mn, mx = _caps(d, "TotalAnnualMinCapacity.csv"), _caps(d, "TotalAnnualMaxCapacity.csv")
    assert mn["NORTH_SOLAR_PV"] == pytest.approx(349.5 / 1e6)
    assert mx["NORTH_SOLAR_PV"] == pytest.approx(349.5 / 1e6)
    assert mn["NORTH_BATTERY"] == pytest.approx(15.0 / 1e6)
    assert mx["NORTH_BATTERY"] == pytest.approx(1000 / 1e6)
    assert mn["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(500 / 1e6)
    assert mx["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(500 / 1e6)


def test_legacy_energy_cap_equals_and_min():
    d = tempfile.mkdtemp()
    tr.translate_model(_with_fixed_caps(json.loads(REF.read_text(encoding="utf-8"))), d)
    mn, mx = _caps(d, "TotalAnnualMinCapacity.csv"), _caps(d, "TotalAnnualMaxCapacity.csv")
    assert mn["NORTH_SOLAR_PV"] == mx["NORTH_SOLAR_PV"] == pytest.approx(349.5 / 1e6)
    assert mn["NORTH_BATTERY_CH"] == mn["NORTH_BATTERY_DC"] == pytest.approx(15.0 / 1e6)
    assert mn["NORTH_SOUTH_GRID_LINK"] == mx["SOUTH_NORTH_GRID_LINK"] == pytest.approx(500 / 1e6)


def test_no_min_capacity_rows_without_min():
    d = _parity(json.loads(REF.read_text(encoding="utf-8")))
    assert _rows(d, "TotalAnnualMinCapacity.csv") == []


def test_datafile_reads_min_capacity_once():
    import osemosys_runner as R
    d = _parity(_with_fixed_caps(json.loads(REF.read_text(encoding="utf-8"))))
    dat = Path(R._write_datafile(d, str(Path(d) / "results"), discount_rate=1e-9)).read_text(encoding="utf-8")
    assert dat.count("param TotalAnnualMinCapacity ") == 1
    assert "[REGION1,NORTH_SOLAR_PV,2005] 0.000349" in dat
    d2 = _parity(json.loads(REF.read_text(encoding="utf-8")))
    dat2 = Path(R._write_datafile(d2, str(Path(d2) / "results"), discount_rate=1e-9)).read_text(encoding="utf-8")
    assert "param TotalAnnualMinCapacity default 0 := ;" in dat2


def test_runner_disables_presolve_only_with_min_capacity(monkeypatch):
    # GLPK 4.65's LP presolver returns "optimal" solutions that violate
    # TotalAnnualMinCapacity at kW-in-GW magnitudes (seen on the rich myopic step 2).
    R, _, _ = _mock_runner(monkeypatch, [("optimal", 3.0)] * 2)
    calls = []
    monkeypatch.setattr(R, "_run_glpsol", lambda *a, **k: calls.append(k.get("presolve", True)))
    R.run_model(json.loads(REF.read_text(encoding="utf-8")), tempfile.mkdtemp())
    R.run_model(_with_fixed_caps(json.loads(REF.read_text(encoding="utf-8"))), tempfile.mkdtemp())
    assert calls[0] is True and calls[-1] is False


def test_run_glpsol_nopresol_flag(monkeypatch):
    import osemosys_runner as R
    cmds = []

    class _P:
        def __init__(self, cmd, **kw):
            cmds.append(cmd)
            self.stdout, self.returncode = [], 0

        def wait(self):
            return 0

    monkeypatch.setattr(R.subprocess, "Popen", _P)
    R._run_glpsol("glpsol", "m.txt", "d.dat", "o.txt", lambda s: None)
    R._run_glpsol("glpsol", "m.txt", "d.dat", "o.txt", lambda s: None, presolve=False)
    assert "--nopresol" not in cmds[0] and "--nopresol" in cmds[1]


def _per_link(md):
    md["links"][0].update({"capacity": 400, "capacityKey": "energy_cap_equals",
                           "linkConfig": {"constraints": {"energy_eff": 0.9}}})
    return md


def test_parity_per_link_capacity():
    d = _parity(_per_link(json.loads(REF.read_text(encoding="utf-8"))))
    assert _caps(d, "TotalAnnualMinCapacity.csv")["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(400 / 1e6)
    assert _caps(d, "TotalAnnualMaxCapacity.csv")["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(400 / 1e6)
    out = {r["MODE_OF_OPERATION"]: float(r["VALUE"]) for r in _rows(d, "OutputActivityRatio.csv")
           if r["TECHNOLOGY"] == "TX_NORTH_SOUTH_GRID_LINK"}
    assert out == {"1": pytest.approx(0.9), "2": pytest.approx(0.9)}


def test_legacy_per_link_capacity():
    d = tempfile.mkdtemp()
    tr.translate_model(_per_link(json.loads(REF.read_text(encoding="utf-8"))), d)
    mn, mx = _caps(d, "TotalAnnualMinCapacity.csv"), _caps(d, "TotalAnnualMaxCapacity.csv")
    for t in ("NORTH_SOUTH_GRID_LINK", "SOUTH_NORTH_GRID_LINK"):
        assert mn[t] == mx[t] == pytest.approx(400 / 1e6)


def test_parity_storage_cap_min_equals_reported():
    md = json.loads(REF.read_text(encoding="utf-8"))
    north = next(l for l in md["locations"] if l["name"] == "north")
    north["techs"]["battery"] = {"constraints": {"storage_cap_min": 10, "storage_cap_equals": 20}}
    import osemosys_timeslices as tsl
    _, report = tr.translate_model(md, tempfile.mkdtemp(), tsl.parity_scheme(168), parity=True)
    assert any("storage_cap_min" in r and "not enforced" in r for r in report)
    assert any("storage_cap_equals" in r and "upper bound only" in r for r in report)


def test_parity_linkconfig_distance():
    md = json.loads(REF.read_text(encoding="utf-8"))
    md['links'][0]['linkConfig'] = {'distance': 200}
    d = _parity(md)
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    assert cc["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(0.5 * 200 * (0.05 / (1 - 1.05 ** -40)), rel=1e-6)


def test_parity_storage_cyclic_and_loss_params():
    md = json.loads(REF.read_text(encoding="utf-8"))          # battery storage_loss 0.01
    d = _parity(md)
    cyc = {r["STORAGE"]: int(float(r["VALUE"])) for r in _rows(d, "StorageCyclicYear.csv")}
    loss = {r["STORAGE"]: float(r["VALUE"]) for r in _rows(d, "StorageLossRate.csv")}
    assert cyc == {"NORTH_BATTERY_S": 1}
    assert loss == {"NORTH_BATTERY_S": pytest.approx(0.01)}
    import osemosys_runner as R
    dat = Path(R._write_datafile(d, str(Path(d) / "results"), discount_rate=1e-9)).read_text(encoding="utf-8")
    assert "param StorageCyclicYear :=" in dat        # default lives in the model file
    assert "param StorageLossRate :=" in dat
    # Tempo storage levels are ~1e-6 PJ in parity: scale them to O(1) for GLPK.
    assert [float(r["VALUE"]) for r in _rows(d, "TempoLevelScale.csv")] == [1e6]
    assert "param TempoLevelScale := 1000000.0 ;" in dat


@pytest.mark.parametrize("flag,expected", [(None, 1), (True, 1), (False, 0)])
def test_parity_cyclic_storage_follows_model_config(flag, expected):
    md = json.loads(REF.read_text(encoding="utf-8"))
    if flag is not None:
        md["modelConfig"]["cyclicStorage"] = flag
    d = _parity(md)
    cyc = {r["STORAGE"]: int(float(r["VALUE"])) for r in _rows(d, "StorageCyclicYear.csv")}
    assert cyc == {"NORTH_BATTERY_S": expected}


def test_parity_non_cyclic_storage_initial_reported():
    import osemosys_timeslices as tsl
    md = json.loads(REF.read_text(encoding="utf-8"))
    md["modelConfig"]["cyclicStorage"] = False
    next(t for t in md["technologies"] if t["name"] == "battery")["constraints"]["storage_initial"] = 0.5
    _, report = tr.translate_model(md, tempfile.mkdtemp(), tsl.parity_scheme(168), parity=True)
    assert any("storage_initial" in r for r in report)


def test_parity_non_cyclic_storage_reported_approximate():
    import osemosys_timeslices as tsl
    md = json.loads(REF.read_text(encoding="utf-8"))
    md["modelConfig"]["cyclicStorage"] = False
    _, report = tr.translate_model(md, tempfile.mkdtemp(), tsl.parity_scheme(168), parity=True)
    assert any("non-cyclic" in r and "approximate" in r for r in report)
    md["modelConfig"]["cyclicStorage"] = True
    _, report = tr.translate_model(md, tempfile.mkdtemp(), tsl.parity_scheme(168), parity=True)
    assert not any("approximate" in r for r in report)


def test_parity_tiny_cost_report_mentions_mode_two():
    import osemosys_timeslices as tsl
    md = json.loads(RICH.read_text(encoding="utf-8"))
    _, report = tr.translate_model(md, tempfile.mkdtemp(), tsl.parity_scheme(168), parity=True)
    line = next(r for r in report if "zero VariableCost" in r)
    assert "mode 2" in line


# ─── Myopic `_existing` shadows: fixed zero-capex capacity → ResidualCapacity ──

def _with_shadow(md, name, loc_idx, cap):
    base = next(t for t in md["technologies"] if t["name"] == name)
    shadow = json.loads(json.dumps(base))
    shadow["name"] = f"{name}_existing"
    for k in ("energy_cap", "storage_cap"):
        if k in shadow.get("costs", {}).get("monetary", {}):
            shadow["costs"]["monetary"][k] = 0
    shadow["constraints"].pop("energy_cap_max", None)
    md["technologies"].append(shadow)
    md["locations"][loc_idx]["techs"][f"{name}_existing"] = {"constraints": {"energy_cap_equals": cap}}
    return md


def test_zero_capex_equals_becomes_residual_capacity():
    d = _parity(_with_shadow(json.loads(REF.read_text(encoding="utf-8")), "solar_pv", 0, 349.485))
    resid = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "ResidualCapacity.csv")}
    assert resid["NORTH_SOLAR_PV_EXISTING"] == pytest.approx(349.485 / 1e6)
    assert "NORTH_SOLAR_PV_EXISTING" not in {r["TECHNOLOGY"] for r in _rows(d, "TotalAnnualMinCapacity.csv")}
    inv = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "TotalAnnualMaxCapacityInvestment.csv")}
    assert inv["NORTH_SOLAR_PV_EXISTING"] == 0.0
    assert inv["NORTH_SOLAR_PV"] == pytest.approx(2000 / 1e6)          # others unchanged
    mx = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "TotalAnnualMaxCapacity.csv")}
    assert mx["NORTH_SOLAR_PV_EXISTING"] == pytest.approx(349.485 / 1e6)


def test_zero_capex_storage_shadow_becomes_residual_capacity():
    d = _parity(_with_shadow(json.loads(REF.read_text(encoding="utf-8")), "battery", 0, 15.155))
    resid = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "ResidualCapacity.csv")}
    assert resid["NORTH_BATTERY_EXISTING"] == pytest.approx(15.155 / 1e6)
    assert _rows(d, "TotalAnnualMinCapacity.csv") == []
    inv = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "TotalAnnualMaxCapacityInvestment.csv")}
    assert inv["NORTH_BATTERY_EXISTING"] == 0.0


def test_equals_with_capex_keeps_min_capacity():
    d = _parity(_with_fixed_caps(json.loads(REF.read_text(encoding="utf-8"))))
    mins = {r["TECHNOLOGY"] for r in _rows(d, "TotalAnnualMinCapacity.csv")}
    assert "NORTH_SOLAR_PV" in mins            # energy_cap_equals with capex = a real minimum


def test_runner_keeps_presolve_with_existing_shadow(monkeypatch):
    R, _, _ = _mock_runner(monkeypatch, [("optimal", 3.0)])
    calls = []
    monkeypatch.setattr(R, "_run_glpsol", lambda *a, **k: calls.append(k.get("presolve", True)))
    md = _with_shadow(json.loads(REF.read_text(encoding="utf-8")), "solar_pv", 0, 349.485)
    R.run_model(md, tempfile.mkdtemp())
    assert calls == [True]
