"""Unit tests for engine_common — pure helpers shared by engine translators."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import engine_common as ec  # noqa: E402

TS = [{"fileName": "solar_cf.csv", "columns": ["datetime", "cf"], "dateColumn": "datetime",
       "data": [{"datetime": f"2005-01-01 {h:02d}:00:00", "cf": 0.5 if 6 <= h < 18 else 0.0}
                for h in range(24)]}]
MD = {"timeSeries": TS}


def test_annuity_matches_calliope():
    assert ec.annuity(0.05, 25) == pytest.approx(0.05 / (1 - 1.05 ** -25))
    assert ec.annuity(0, 20) == pytest.approx(1 / 20)
    assert ec.annuity(0.05, None) == 1.0


def test_finite_handles_inf_strings_and_sentinels():
    assert ec.finite("inf") is None
    assert ec.finite(1e15) is None
    assert ec.finite("3.5") == 3.5


def test_merged_tech_def_location_overrides_win():
    tech = {"constraints": {"energy_cap_max": 100, "lifetime": 25},
            "costs": {"monetary": {"energy_cap": 900}}}
    loc = {"constraints": {"energy_cap_max": 50}, "costs": {"monetary": {"om_prod": 0.01}}}
    cons, costs = ec.merged_tech_def(tech, loc)
    assert cons == {"energy_cap_max": 50, "lifetime": 25}
    assert costs == {"energy_cap": 900, "om_prod": 0.01}


def test_resource_to_cf_energy_per_cap_file_ref_cycles():
    report = []
    cf = ec.resource_to_cf({"resource": "file=solar_cf.csv:cf", "resource_unit": "energy_per_cap"},
                           48, report, "ctx", MD)
    assert len(cf) == 48 and cf[12] == 0.5 and cf[36] == 0.5 and cf[0] == 0.0


def test_resource_to_cf_unset_resource_is_unconstrained():
    assert ec.resource_to_cf({}, 24, [], "ctx", MD) is None
    assert ec.resource_to_cf({"resource": "inf"}, 24, [], "ctx", MD) is None


def test_resource_to_cf_absolute_energy_divides_by_cap_max():
    report = []
    cf = ec.resource_to_cf({"resource": 50, "resource_unit": "energy", "energy_cap_max": 100},
                           3, report, "ctx", MD)
    assert cf == [0.5, 0.5, 0.5]
    assert any("absolute resource" in r for r in report)


def test_resource_to_cf_unitless_small_values_are_cf():
    assert ec.resource_to_cf({"resource": 0.3}, 2, [], "ctx", MD) == [0.3, 0.3]


def test_resource_to_cf_energy_per_cap_above_one_clamps():
    assert ec.resource_to_cf({"resource": 1.5, "resource_unit": "energy_per_cap"},
                             2, [], "ctx", MD) == [1.0, 1.0]


def test_resource_to_cf_energy_unit_small_value_takes_absolute_path():
    assert ec.resource_to_cf({"resource": 0.5, "resource_unit": "energy", "energy_cap_max": 10},
                             2, [], "ctx", MD) == [0.05, 0.05]


def test_resource_to_cf_absolute_without_cap_max_is_dropped():
    report = []
    assert ec.resource_to_cf({"resource": 50}, 2, report, "ctx", MD) is None
    assert any("dropped" in r for r in report)


def test_resource_to_cf_absolute_uses_cap_equals_without_cap_max():
    report = []
    cf = ec.resource_to_cf({"resource": 50, "resource_unit": "energy", "energy_cap_equals": 200},
                           2, report, "ctx", MD)
    assert cf == [0.25, 0.25]
    assert not any("dropped" in r for r in report)


def test_resource_to_cf_absolute_prefers_cap_equals_over_cap_max():
    cf = ec.resource_to_cf({"resource": 50, "resource_unit": "energy",
                            "energy_cap_max": 1000, "energy_cap_equals": 100}, 1, [], "ctx", MD)
    assert cf == [0.5]


def test_merged_link_def_applies_link_config_and_capacity():
    tech = {"constraints": {"energy_cap_max": 3000, "energy_eff": 0.97},
            "costs": {"monetary": {"energy_cap": 1}}}
    link = {"capacity": 400, "capacityKey": "energy_cap_equals",
            "linkConfig": {"constraints": {"energy_eff": 0.9}, "costs": {"monetary": {"energy_cap": 0}}}}
    constr, costs = ec.merged_link_def(tech, link)
    assert constr == {"energy_cap_max": 3000, "energy_eff": 0.9, "energy_cap_equals": 400}
    assert costs == {"energy_cap": 0}
    assert "constraints" not in link["linkConfig"] or link["linkConfig"]["constraints"] == {"energy_eff": 0.9}


def test_merged_link_def_capacity_defaults_to_cap_max_and_ignores_nonpositive():
    tech = {"constraints": {"energy_cap_max": 3000}}
    assert ec.merged_link_def(tech, {"capacity": 250})[0]["energy_cap_max"] == 250
    assert ec.merged_link_def(tech, {"capacity": 0})[0]["energy_cap_max"] == 3000
    assert ec.merged_link_def(tech, {})[0]["energy_cap_max"] == 3000


def test_link_distance_linkconfig_overrides_link():
    assert ec.link_distance({'distance': 400, 'linkConfig': {'distance': 250}}) == 250.0
    assert ec.link_distance({'distance': '400'}) == 400.0
    assert ec.link_distance({}) is None
