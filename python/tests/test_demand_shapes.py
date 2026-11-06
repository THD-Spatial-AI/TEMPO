"""Tests for demand_shapes — hemisphere-aware BDEW shapes."""
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

pytest.importorskip("demandlib")
sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_shapes as sh  # noqa: E402

PROFILE_SCRIPT = Path(__file__).parent.parent / "demandlib_profile.py"


def monthly(series):
    return series.groupby(series.index.month).mean()


def test_seasons_cover_year_once():
    days = pd.date_range("2023-01-01", "2023-12-31", freq="D")
    hits = [sum(pd.Timestamp(2023, a, b) <= d <= pd.Timestamp(2023, c, e)
                for a, b, c, e in sh.SOUTH_SEASONS.values()) for d in days]
    assert set(hits) == {1}


def test_northern_matches_existing_one_shot():
    payload = {"start": "2023-01-01", "end": "2023-12-31", "resolution": "60min",
               "sectors": {"h0_dyn": 0.6, "g0": 0.4}, "country": "DE", "family": "classic"}
    out = subprocess.run([sys.executable, str(PROFILE_SCRIPT)], input=json.dumps(payload),
                         capture_output=True, text=True, check=True).stdout
    ref = json.loads(out.strip().splitlines()[-1])["values"]
    mine = sh.normalised_shape("2023-01-01", "2023-12-31", "60min", {"h0_dyn": 0.6, "g0": 0.4}, "DE")
    assert len(mine) == len(ref)
    assert max(abs(a - b) for a, b in zip(mine.round(4), ref)) < 1e-3


# Static h0 is ~4 % higher in summer; only the dynamised profiles peak in winter.
@pytest.mark.parametrize("family,sectors,north_peak,south_peak", [
    ("classic", {"h0_dyn": 1}, (1, 2, 11, 12), (6, 7, 8)),
    ("bdew25", {"h25": 1}, (1, 2, 11, 12), (6, 7, 8)),
    ("classic", {"h0": 1}, (6, 7, 8), (12, 1, 2)),
])
def test_southern_shift_mirrors_the_seasonal_peak(family, sectors, north_peak, south_peak):
    north = monthly(sh.normalised_shape("2023-01-01", "2023-12-31", "60min", sectors, "CL", family))
    south = monthly(sh.normalised_shape("2023-01-01", "2023-12-31", "60min", sectors, "CL", family, southern=True))
    assert north.idxmax() in north_peak
    assert south.idxmax() in south_peak


@pytest.mark.parametrize("southern", [False, True])
def test_full_year_mean_is_one(southern):
    s = sh.normalised_shape("2023-01-01", "2023-12-31", "60min", {"g0": 1}, "CL", southern=southern)
    assert s.mean() == pytest.approx(1.0, abs=1e-3)
    assert len(s) == 8760


def test_day_types_follow_real_calendar_and_country_holidays():
    s = sh.normalised_shape("2024-09-01", "2024-09-30", "60min", {"g0": 1}, "CL", southern=True)
    daily = s.resample("D").sum()
    wednesday, sunday, fiestas = daily["2024-09-11"], daily["2024-09-15"], daily["2024-09-18"]
    assert sunday < 0.8 * wednesday                     # commercial weekend dip kept
    assert fiestas == pytest.approx(sunday, rel=0.05)   # CL holiday 18 Sep behaves like a Sunday


def test_resolution_and_validation():
    assert len(sh.normalised_shape("2023-01-01", "2023-01-01", "15min", {"g0": 1})) == 96
    with pytest.raises(ValueError):
        sh.normalised_shape("2023-01-01", "2023-01-02", "5min", {"g0": 1})
    flat = sh.normalised_shape("2023-01-01", "2023-01-02", "60min", {"flat": 1})
    assert len(flat) == 48 and (flat == 1.0).all()
    with pytest.raises(ValueError):
        sh.normalised_shape("2023-01-01", "2023-01-02", "60min", {"flat": 0, "g0": 0})


@pytest.mark.parametrize("southern", [False, True])
def test_flat_weight_blends_a_constant(southern):
    g0 = sh.normalised_shape("2023-01-01", "2023-12-31", "60min", {"g0": 1}, "CL", southern=southern)
    half = sh.normalised_shape("2023-01-01", "2023-12-31", "60min", {"g0": 50, "flat": 50}, "CL", southern=southern)
    assert half.index.equals(g0.index)
    assert (half - (0.5 + 0.5 * g0)).abs().max() < 1e-6


def test_concurrent_shapes_leave_warning_filters_alone():
    import threading
    import warnings
    sh.normalised_shape("2023-01-01", "2023-01-01", "60min", {"h0_dyn": 1}, "CL")   # imports done
    before = list(warnings.filters)
    errors = []

    def work():
        try:
            sh.normalised_shape("2023-01-01", "2023-01-07", "60min", {"h0_dyn": 1}, "CL", southern=True)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
    threads = [threading.Thread(target=work) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert warnings.filters == before
    assert not any(f[0] == "error" for f in warnings.filters if f not in before)
    with warnings.catch_warnings(record=True):
        warnings.warn("x")


# --- Task 5: shape_substations ---------------------------------------------

def _fake_shape(calls):
    def fn(start, end, resolution, sectors, country, family, southern):
        calls.append((dict(sectors), southern))
        idx = pd.date_range(start, pd.Timestamp(end).normalize() + pd.Timedelta("23:59:59"), freq="60min")
        base = 1.0 + 0.1 * sum(sectors.values()) / 100
        return pd.Series([base] * (len(idx) - 1) + [base + 1.0], index=idx)
    return fn


SUBS = [
    {"id": "a", "avg_mw": 2.0, "mix": {"h0": 60, "g0": 40}},
    {"id": "b", "avg_mw": 5.0, "mix": {"g0": 40, "h0": 60}},   # same mix, different key order
    {"id": "c", "avg_mw": 1.0, "mix": {"g0": 100}},
]


def test_shape_substations_dedupes_mixes_and_scales():
    calls = []
    out = sh.shape_substations(SUBS, "2023-01-01", "2023-01-02", "60min", latitude=-33.4,
                               shape_fn=_fake_shape(calls))
    assert len(calls) == 2 and out["unique_mixes"] == 2
    assert all(c[1] is True for c in calls)
    assert len(out["datetimes"]) == 48 and out["datetimes"][0] == "2023-01-01 00:00:00"
    base_ab = 1.0 + 0.1 * 100 / 100
    assert out["series"]["a"][0] == pytest.approx(base_ab * 2.0, abs=1e-4)
    assert out["series"]["b"][0] == pytest.approx(base_ab * 5.0, abs=1e-4)
    assert out["series"]["a"][-1] == pytest.approx((base_ab + 1.0) * 2.0, abs=1e-4)
    assert out["peak_mw"]["a"] == pytest.approx(max(out["series"]["a"]))
    assert out["peak_mw"]["b"] == pytest.approx((base_ab + 1.0) * 5.0, abs=1e-4)


def test_shape_substations_hemisphere_flags():
    kw = dict(shape_fn=_fake_shape([]))
    north = sh.shape_substations(SUBS, "2023-01-01", "2023-01-01", "60min", latitude=40.0, **kw)
    assert north["southern"] is False and north["tropical"] is False
    arica = sh.shape_substations(SUBS, "2023-01-01", "2023-01-01", "60min", latitude=-18.5, **kw)
    assert arica["southern"] is True and arica["tropical"] is True
    chile = sh.shape_substations(SUBS, "2023-01-01", "2023-01-01", "60min", latitude=-33.4, **kw)
    assert chile["southern"] is True and chile["tropical"] is False


def test_shape_substations_zero_avg_or_no_mix_gives_zero_column():
    calls = []
    subs = [{"id": "z", "avg_mw": 0.0, "mix": {"g0": 100}},
            {"id": "n", "avg_mw": 3.0, "mix": None},
            {"id": "ok", "avg_mw": 1.0, "mix": {"g0": 100}}]
    out = sh.shape_substations(subs, "2023-01-01", "2023-01-01", "60min", shape_fn=_fake_shape(calls))
    assert len(calls) == 1
    for sid in ("z", "n"):
        assert out["series"][sid] == [0.0] * 24 and out["peak_mw"][sid] == 0.0
    assert out["peak_mw"]["ok"] > 0


def test_shape_substations_real_full_year_mean_matches_avg_mw():
    subs = [{"id": "s1", "avg_mw": 12.5, "mix": {"h0": 50, "g0": 50}}]
    out = sh.shape_substations(subs, "2023-01-01", "2023-12-31", "60min", country="CL", latitude=-18.5)
    series = out["series"]["s1"]
    assert len(series) == 8760
    assert sum(series) / len(series) == pytest.approx(12.5, rel=0.005)


def test_shape_substations_datetimes_follow_generated_shape():
    def fn(start, end, resolution, sectors, country, family, southern):
        idx = pd.date_range("2023-01-01 00:30", periods=24, freq="60min")
        return pd.Series(1.0, index=idx)
    subs = [{"id": "z", "avg_mw": 0.0, "mix": {"g0": 100}}, {"id": "ok", "avg_mw": 1.0, "mix": {"g0": 100}}]
    out = sh.shape_substations(subs, "2023-01-01", "2023-01-01", "60min", shape_fn=fn)
    assert out["datetimes"][0] == "2023-01-01 00:30:00"
    assert len(out["series"]["z"]) == len(out["series"]["ok"]) == len(out["datetimes"])


def test_shape_substations_unequal_shape_lengths_fail():
    def fn(start, end, resolution, sectors, country, family, southern):
        n = 24 if "g0" in sectors else 23
        return pd.Series(1.0, index=pd.date_range(start, periods=n, freq="60min"))
    subs = [{"id": "a", "avg_mw": 1.0, "mix": {"g0": 100}}, {"id": "b", "avg_mw": 1.0, "mix": {"h0": 100}}]
    with pytest.raises(AssertionError):
        sh.shape_substations(subs, "2023-01-01", "2023-01-01", "60min", shape_fn=fn)
