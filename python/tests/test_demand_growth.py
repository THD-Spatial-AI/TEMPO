"""Tests for demand_growth — national growth factor from the bundled OWID table."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_growth as dg  # noqa: E402

TABLE = {"CL": {2019: 80.0, 2021: 84.0, 2023: 88.0}}


def test_scales_to_latest_year_not_beyond_model_year():
    g = dg.growth_factor(TABLE, "cl", 2019, 2030)
    assert g["factor"] == pytest.approx(1.1)
    assert g["to_year"] == 2023 and g["note"] is None


def test_stops_at_model_year():
    g = dg.growth_factor(TABLE, "CL", 2019, 2022)
    assert g["factor"] == pytest.approx(84.0 / 80.0)
    assert g["to_year"] == 2021


def test_model_year_not_after_raster_year():
    assert dg.growth_factor(TABLE, "CL", 2019, 2019)["factor"] == 1.0
    assert dg.growth_factor(TABLE, "CL", 2015, 2015)["factor"] == 1.0


def test_unknown_country_is_neutral_with_note():
    g = dg.growth_factor(TABLE, "ZZ", 2019, 2024)
    assert g["factor"] == 1.0 and g["note"]


def test_bundled_table_loads():
    table = dg.load_national_table(dg.DEFAULT_TABLE)
    assert table["DE"][2019] > 400        # Germany ~ 500+ TWh
    assert table["CL"][2019] > 50
    assert min(min(s) for s in table.values()) >= 1992
