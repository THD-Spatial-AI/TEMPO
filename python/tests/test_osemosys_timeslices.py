"""
Tests for osemosys_timeslices.py — pure pandas, runnable without any venv.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import osemosys_timeslices as ts


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sum_check(hourly, slices_df, year_split, tol=1e-6):
    """Check energy conservation: sum(mean * n_hours_in_slice) == sum(hourly)."""
    n = len(hourly)
    expected = sum(hourly)
    recovered = sum(v * year_split[k] * n for k, v in slices_df.items())
    assert abs(expected - recovered) < tol * max(abs(expected), 1.0), (
        f"Energy conservation failed: expected={expected:.6f}, recovered={recovered:.6f}"
    )


def _make_daily_cycle(amplitude: float, n_hours: int = 8760) -> list:
    """Simple sinusoidal daily profile repeated over n_hours."""
    return [amplitude * (0.5 + 0.5 * math.sin(2 * math.pi * h / 24)) for h in range(n_hours)]


# ---------------------------------------------------------------------------
# slice_labels
# ---------------------------------------------------------------------------

def test_slice_labels_default():
    labels = ts.slice_labels(ts.default_scheme())
    assert len(labels) == 12
    assert labels[0] == "s1d1"
    assert labels[-1] == "s4d3"


def test_slice_labels_1x1():
    assert ts.slice_labels({"seasons": 1, "dayBlocks": 1}) == ["s1d1"]


def test_slice_labels_2x2():
    labels = ts.slice_labels({"seasons": 2, "dayBlocks": 2})
    assert labels == ["s1d1", "s1d2", "s2d1", "s2d2"]


# ---------------------------------------------------------------------------
# aggregate — basic structure
# ---------------------------------------------------------------------------

def test_aggregate_returns_all_labels():
    hourly = [1.0] * 168  # one week
    slices, ys = ts.aggregate(hourly, {"seasons": 2, "dayBlocks": 2})
    expected_labels = ts.slice_labels({"seasons": 2, "dayBlocks": 2})
    assert set(slices.keys()) == set(expected_labels)
    assert set(ys.keys()) == set(expected_labels)


def test_year_split_sums_to_one():
    hourly = [1.0] * 8760
    _slices, ys = ts.aggregate(hourly, ts.default_scheme())
    assert abs(sum(ys.values()) - 1.0) < 1e-9


def test_year_split_sums_to_one_1week():
    hourly = [1.0] * 168
    _slices, ys = ts.aggregate(hourly, {"seasons": 2, "dayBlocks": 3})
    assert abs(sum(ys.values()) - 1.0) < 1e-9


def test_constant_series_mean_equals_value():
    c = 42.0
    hourly = [c] * 8760
    slices, ys = ts.aggregate(hourly, ts.default_scheme())
    for lbl, mean in slices.items():
        assert abs(mean - c) < 1e-9, f"Slice {lbl} mean {mean} != {c}"


# ---------------------------------------------------------------------------
# aggregate — energy conservation
# ---------------------------------------------------------------------------

def test_energy_conservation_default_scheme():
    hourly = _make_daily_cycle(100.0, 8760)
    slices, ys = ts.aggregate(hourly, ts.default_scheme())
    _sum_check(hourly, slices, ys, tol=1e-4)


def test_energy_conservation_1x1():
    hourly = list(range(24))
    slices, ys = ts.aggregate(hourly, {"seasons": 1, "dayBlocks": 1})
    assert abs(slices["s1d1"] - sum(hourly) / 24) < 1e-9
    assert abs(ys["s1d1"] - 1.0) < 1e-9


def test_energy_conservation_non_divisible_hours():
    # 169 hours — not divisible by 4×3
    hourly = [float(i % 24) for i in range(169)]
    slices, ys = ts.aggregate(hourly, {"seasons": 4, "dayBlocks": 3})
    assert abs(sum(ys.values()) - 1.0) < 1e-9
    _sum_check(hourly, slices, ys, tol=1e-4)


def test_energy_conservation_non_divisible_day_blocks():
    # 5 day-blocks in 24 hours: 24 / 5 = 4.8 → blocks of 5, 5, 5, 5, 4
    hourly = [float(h % 24) for h in range(240)]  # 10 days
    slices, ys = ts.aggregate(hourly, {"seasons": 1, "dayBlocks": 5})
    assert abs(sum(ys.values()) - 1.0) < 1e-9
    _sum_check(hourly, slices, ys, tol=1e-4)


# ---------------------------------------------------------------------------
# broadcast — round-trip
# ---------------------------------------------------------------------------

def test_broadcast_length():
    hourly = _make_daily_cycle(50.0, 8760)
    scheme = ts.default_scheme()
    slices, ys = ts.aggregate(hourly, scheme)
    result = ts.broadcast(slices, ys, scheme, 8760)
    assert len(result) == 8760


def test_broadcast_constant_is_identity():
    c = 7.0
    hourly = [c] * 8760
    scheme = ts.default_scheme()
    slices, ys = ts.aggregate(hourly, scheme)
    result = ts.broadcast(slices, ys, scheme, 8760)
    assert all(abs(v - c) < 1e-9 for v in result)


def test_broadcast_energy_preserved():
    hourly = _make_daily_cycle(100.0, 8760)
    scheme = ts.default_scheme()
    slices, ys = ts.aggregate(hourly, scheme)
    result = ts.broadcast(slices, ys, scheme, 8760)
    # sum of broadcast == sum of hourly to within slice-averaging approximation
    # (exact for constant; approximate for varying profiles)
    assert abs(sum(result) - sum(hourly)) / max(abs(sum(hourly)), 1.0) < 0.25


def test_broadcast_different_n_hours():
    """broadcast at n_hours=168 when aggregated over 8760 — must not crash."""
    hourly = _make_daily_cycle(100.0, 8760)
    scheme = {"seasons": 4, "dayBlocks": 3}
    slices, ys = ts.aggregate(hourly, scheme)
    result = ts.broadcast(slices, ys, scheme, 168)
    assert len(result) == 168


# ---------------------------------------------------------------------------
# year_split_for_n_hours
# ---------------------------------------------------------------------------

def test_year_split_for_n_hours_sums_to_one():
    ys = ts.year_split_for_n_hours(8760, ts.default_scheme())
    assert abs(sum(ys.values()) - 1.0) < 1e-9


def test_year_split_for_n_hours_matches_aggregate():
    n = 168
    scheme = {"seasons": 2, "dayBlocks": 3}
    ys_direct = ts.year_split_for_n_hours(n, scheme)
    _slices, ys_via_agg = ts.aggregate([0.0] * n, scheme)
    for lbl in ys_direct:
        assert abs(ys_direct[lbl] - ys_via_agg[lbl]) < 1e-12


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_single_hour():
    slices, ys = ts.aggregate([99.0], {"seasons": 1, "dayBlocks": 1})
    assert slices["s1d1"] == 99.0
    assert ys["s1d1"] == 1.0


def test_24_hours_1season_3blocks():
    hourly = list(range(24))
    scheme = {"seasons": 1, "dayBlocks": 3}
    slices, ys = ts.aggregate(hourly, scheme)
    assert abs(sum(ys.values()) - 1.0) < 1e-9
    _sum_check(hourly, slices, ys, tol=1e-4)
