"""Tests for demand_seeds — which substations are withdrawal points."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_seeds as ds  # noqa: E402


@pytest.mark.parametrize("tag,kv,expected", [
    ("distribution", 220, True),        # explicit tag wins over voltage
    ("minor_distribution", None, True),
    ("industrial", 66, True),
    ("transmission", 13.2, False),      # explicit exclusion wins over voltage
    ("traction", None, False),
    ("converter", None, False),
    ("generation", 23, False),
    ("substation", 66, True),           # untagged (Creation.jsx default label) ≤ 110 kV
    ("substation", 220, False),         # untagged > 110 kV → transmission
    ("", None, True),                   # untagged, no voltage → seed
    ("other", "110", True),             # string voltage, boundary inclusive
    ("other", "bad", True),             # unparseable voltage treated as missing
    ("", "220;66", False),              # OSM multi-voltage: the highest decides
    ("", "66;13.2", True),
    ("", "bad;220", False),             # unparseable parts ignored
    ("", ";", True),
])
def test_is_seed(tag, kv, expected):
    assert ds.is_seed({"substation": tag, "voltage_kv": kv}) is expected


def test_max_kv_setting():
    sub = {"substation": "", "voltage_kv": 132}
    assert ds.is_seed(sub, max_kv=110) is False
    assert ds.is_seed(sub, max_kv=154) is True


def test_select_seeds_filters():
    subs = [{"id": "a", "substation": "distribution"}, {"id": "b", "substation": "transmission"}]
    seeds, fallback = ds.select_seeds(subs)
    assert [s["id"] for s in seeds] == ["a"]
    assert fallback is False


def test_select_seeds_falls_back_to_all():
    subs = [{"id": "a", "substation": "transmission"}, {"id": "b", "substation": "transmission"}]
    seeds, fallback = ds.select_seeds(subs)
    assert [s["id"] for s in seeds] == ["a", "b"]
    assert fallback is True
