"""Tests for demand_growth — national demand and raster country totals (bundled tables)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_growth as dg  # noqa: E402

TABLE = {"CL": {2019: 80.0, 2021: 84.0, 2023: 88.0}}


def test_latest_year_not_after_model_year():
    assert dg.national_demand(TABLE, "cl", 2030) == {"twh": 88.0, "year": 2023, "note": None}
    assert dg.national_demand(TABLE, "CL", 2022) == {"twh": 84.0, "year": 2021, "note": None}
    assert dg.national_demand(TABLE, "CL", 2019)["year"] == 2019


def test_no_year_up_to_model_year_has_note():
    n = dg.national_demand(TABLE, "CL", 2015)
    assert n["twh"] is None and n["year"] is None and n["note"]


def test_unknown_country_has_note():
    n = dg.national_demand(TABLE, "ZZ", 2024)
    assert n["twh"] is None and "ZZ" in n["note"]
    assert dg.national_demand(TABLE, None, 2024)["note"]


def test_bundled_table_loads():
    table = dg.load_national_table(dg.DEFAULT_TABLE)
    assert table["DE"][2019] > 400        # Germany ~ 500+ TWh
    assert table["CL"][2019] > 50
    assert min(min(s) for s in table.values()) >= 1992


def test_raster_totals_parse_comments_and_case(tmp_path):
    path = tmp_path / "totals.csv"
    path.write_text("# Source: test\niso2,raster_year,twh\nde,2019,767.5\nCL,2019,47.4\n", encoding="utf-8")
    assert dg.load_raster_totals(path) == {"DE": 767.5, "CL": 47.4}


def test_bundled_raster_totals_load():
    totals = dg.load_raster_totals()
    assert totals["DE"] == pytest.approx(767.5, rel=0.02)
    assert totals["CL"] == pytest.approx(47.4, rel=0.05)
    assert len(totals) > 150
