"""Tests for demand_mix — per-cell BDEW mixes from land-use energy."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_mix as dm  # noqa: E402

GLOBAL = {"h0_dyn": 50, "g0": 35, "g3": 10, "l0": 5}


def test_round_mix_sums_to_100_in_steps():
    m = dm.round_mix({"a": 1, "b": 1, "c": 1})
    assert sum(m.values()) == 100 and all(v % 5 == 0 for v in m.values())
    assert sorted(m.values()) == [30, 35, 35]


def test_round_mix_drops_zeros_and_tiny():
    assert dm.round_mix({"a": 0.99, "b": 0.01, "c": 0}) == {"a": 100}


def test_fully_classified_cell_uses_class_energy():
    mix, cov = dm.cell_mix({"residential": 70, "commercial": 20, "industrial": 10, "farmland": 0}, 100, GLOBAL)
    assert cov == pytest.approx(1.0)
    assert mix == {"h0_dyn": 70, "g0": 20, "g3": 10}


def test_partial_coverage_blends_with_global():
    mix, cov = dm.cell_mix({"residential": 50, "commercial": 0, "industrial": 0, "farmland": 0}, 100, GLOBAL)
    assert cov == pytest.approx(0.5)
    assert mix == dm.round_mix({"h0_dyn": 75, "g0": 17.5, "g3": 5, "l0": 2.5})


def test_no_energy_or_no_landuse_gives_global():
    assert dm.cell_mix({}, 0, GLOBAL) == (dm.round_mix(GLOBAL), 0.0)
    assert dm.cell_mix({"residential": 0}, 100, GLOBAL) == (dm.round_mix(GLOBAL), 0.0)


def test_industrial_substation_override():
    mix, cov = dm.cell_mix({"residential": 80}, 100, GLOBAL, industrial=True)
    assert mix == {"g3": 100} and cov == pytest.approx(0.8)
    assert dm.cell_mix({}, 0, {"h25": 100}, family="bdew25", industrial=True)[0] == {"g25": 100}


def test_bdew25_codes_merge_commercial_and_industrial():
    mix, _ = dm.cell_mix({"residential": 40, "commercial": 30, "industrial": 30}, 100, {"h25": 100}, family="bdew25")
    assert mix == {"h25": 40, "g25": 60}
