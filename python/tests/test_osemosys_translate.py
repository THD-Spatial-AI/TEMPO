"""
Tests for osemosys_translate.py.
Validates CSV structure and correctness without requiring otoole or any solver.
"""
import csv
import math
import os
import sys
import tempfile
from pathlib import Path

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
        by_fuel: dict = {}
        for r in rows:
            by_fuel.setdefault(r["FUEL"], 0.0)
            by_fuel[r["FUEL"]] += float(r["VALUE"])
        for fuel, total in by_fuel.items():
            assert abs(total - 1.0) < 1e-6, f"SpecifiedDemandProfile sum for {fuel} = {total}"


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
