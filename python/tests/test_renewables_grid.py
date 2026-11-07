"""renewables_grid — u/v wind grid for the particle layer (no network)."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
import renewables_grid as rg  # noqa: E402


def fake_multi(lats, lons, speed=10.0, direction=270.0):
    """Open-Meteo multi-location response: a list, one object per coordinate, same order."""
    return [{"latitude": la, "longitude": lo, "hourly": {
        "time": [f"2025-01-01T{h:02d}:00" for h in range(24)],
        "wind_speed_100m": [speed] * 24, "wind_direction_100m": [direction] * 24}}
        for la, lo in zip(lats, lons)]


def test_grid_axes_cover_bounds():
    lats, lons = rg.grid_axes(-40, -75, -30, -65, 5)
    assert lats[0] == pytest.approx(-40) and lats[-1] == pytest.approx(-30) and len(lats) == 5
    assert lons[0] == pytest.approx(-75) and lons[-1] == pytest.approx(-65)


def test_westerly_wind_is_positive_u():
    u, v = rg.uv(np.array([10.0]), np.array([270.0]))     # from the west -> blows east
    assert u[0] == pytest.approx(10.0) and v[0] == pytest.approx(0.0, abs=1e-9)
    u, v = rg.uv(np.array([10.0]), np.array([0.0]))       # from the north -> blows south
    assert v[0] == pytest.approx(-10.0)


def test_wind_grid_one_request_and_shape(tmp_path):
    calls = []

    def request_json(params, **kw):
        calls.append(params)
        lats = [float(x) for x in params["latitude"].split(",")]
        lons = [float(x) for x in params["longitude"].split(",")]
        return fake_multi(lats, lons)

    g = rg.wind_grid(-40, -75, -30, -65, "2025-01-01", 6, tmp_path, request_json=request_json)
    assert len(calls) == 1 and len(calls[0]["latitude"].split(",")) == 36
    assert len(g["lats"]) == 6 and len(g["lons"]) == 6
    assert np.array(g["u"]).shape == (24, 6, 6)
    assert g["u"][0][0][0] == pytest.approx(10.0)
    rg.wind_grid(-40, -75, -30, -65, "2025-01-01", 6, tmp_path, request_json=request_json)
    assert len(calls) == 1                                  # cached


def test_wind_grid_rejects_bad_n_and_future_date(tmp_path):
    with pytest.raises(ValueError):
        rg.wind_grid(-40, -75, -30, -65, "2025-01-01", 40, tmp_path, request_json=lambda p, **k: [])
    with pytest.raises(ValueError, match="date"):
        rg.wind_grid(-40, -75, -30, -65, "2999-01-01", 6, tmp_path, request_json=lambda p, **k: [])


def _capture(calls):
    def request_json(params, **kw):
        calls.append(params)
        lats = [float(x) for x in params["latitude"].split(",")]
        return fake_multi(lats, lats)
    return request_json


def test_wind_grid_validates_bounds(tmp_path):
    rj = _capture([])
    bad = [(float("nan"), -75, -30, -65), (-40, -75, float("inf"), -65), (-30, -75, -40, -65),
           (-40, -65, -30, -75), (-95, -75, -30, -65), (-40, -75, -30, 181), (-40, -75, -40, -65)]
    for south, west, north, east in bad:
        with pytest.raises(ValueError):
            rg.wind_grid(south, west, north, east, "2025-01-01", 6, tmp_path, request_json=rj)


def test_wind_grid_coordinates_use_two_decimals_and_rounded_bounds_key(tmp_path):
    calls = []
    rj = _capture(calls)
    rg.wind_grid(-40.001, -75.0, -30.0, -65.0, "2025-01-01", 6, tmp_path, request_json=rj)
    assert all(len(c.split(".")[1]) == 2 for c in calls[0]["latitude"].split(","))
    assert calls[0]["latitude"].split(",")[0] == "-40.00"          # axes built from the rounded bounds
    rg.wind_grid(-40.002, -75.0, -30.0, -65.0, "2025-01-01", 6, tmp_path, request_json=rj)
    assert len(calls) == 1                                           # same rounded key -> cached


def test_max_grid_request_url_fits_open_meteo_limit(tmp_path):
    requests = pytest.importorskip("requests")
    calls = []
    rg.wind_grid(-37, -74, -30, -68, "2025-01-01", rg.N_MAX, tmp_path, request_json=_capture(calls))
    url = requests.Request("GET", "https://archive-api.open-meteo.com/v1/archive", params=calls[0]).prepare().url
    assert rg.N_MAX == 20 and len(url) <= 8192       # n=24 got HTTP 414 from Open-Meteo


def test_far_west_max_grid_url_is_under_8000(tmp_path):
    requests = pytest.importorskip("requests")
    import renewables_weather
    calls = []
    rg.wind_grid(-89.5, -179.5, -10.5, -100.5, "2025-01-01", rg.N_MAX, tmp_path, request_json=_capture(calls))
    url = requests.Request("GET", renewables_weather.ARCHIVE_URL, params=calls[0]).prepare().url
    assert len(url) < 8000


def test_cache_temp_name_includes_thread_id(tmp_path, monkeypatch):
    import os
    import threading
    seen = []
    real = os.replace
    monkeypatch.setattr(os, "replace", lambda a, b: (seen.append(Path(a).name), real(a, b)))
    rg.wind_grid(-40, -75, -30, -65, "2025-01-01", 6, tmp_path, request_json=_capture([]))
    assert f".{os.getpid()}.{threading.get_ident()}." in seen[0]
