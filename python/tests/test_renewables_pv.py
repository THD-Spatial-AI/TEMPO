"""renewables_pv — pvlib capacity factor per kWp DC (clear-sky weather, no network)."""
import sys
from pathlib import Path

import numpy as np
import pytest

pvlib = pytest.importorskip("pvlib")
pd = pytest.importorskip("pandas")
sys.path.insert(0, str(Path(__file__).parent.parent))

import renewables_pv as rpv  # noqa: E402

SANTIAGO = (-33.45, -70.66)


def clear_sky(lat, lon, year=2023):
    idx = pd.date_range(f"{year}-01-01T00:30", periods=8760, freq="h", tz="UTC")
    cs = pvlib.location.Location(lat, lon).get_clearsky(idx)
    return pd.DataFrame({"ghi": cs["ghi"], "dni": cs["dni"], "dhi": cs["dhi"],
                         "temp_air": 20.0, "wind_speed": 2.0}, index=idx)


def test_cf_shape_and_bounds():
    cf = rpv.pv_capacity_factor(clear_sky(*SANTIAGO), *SANTIAGO, tilt=28, azimuth=0)
    assert cf.shape == (8760,)
    assert np.all(cf >= 0) and np.all(cf <= 0.96 / 1.2 + 1e-9)
    assert 0.18 < cf.mean() < 0.35          # clear-sky upper envelope for central Chile


def test_night_is_zero_and_noon_is_peak():
    # dc_ac 0.5: no inverter clipping, so the clear-sky peak is not a flat plateau (argmax = first tie).
    cf = rpv.pv_capacity_factor(clear_sky(*SANTIAGO), *SANTIAGO, tilt=28, azimuth=0, dc_ac=0.5)
    day = cf[:24]                             # hour i = interval [i, i+1) UTC on 1 Jan
    # Solar noon at -70.66° ≈ 16:43 UTC → interval 16 or 17 is the peak; 04 UTC is night.
    assert int(np.argmax(day)) == 16
    assert day[4] == 0


def test_equator_facing_beats_pole_facing_in_south():
    w = clear_sky(*SANTIAGO)
    north = rpv.pv_capacity_factor(w, *SANTIAGO, tilt=30, azimuth=0).mean()
    south = rpv.pv_capacity_factor(w, *SANTIAGO, tilt=30, azimuth=180).mean()
    assert north > south * 1.1


def test_tracking_beats_fixed():
    w = clear_sky(*SANTIAGO)
    fixed = rpv.pv_capacity_factor(w, *SANTIAGO, tilt=28, azimuth=0).mean()
    tracked = rpv.pv_capacity_factor(w, *SANTIAGO, tilt=28, azimuth=0, tracking="single_axis").mean()
    assert tracked > fixed


def test_losses_scale_output():
    w = clear_sky(*SANTIAGO)
    # dc_ac 0.5 → inverter twice the array, never clips → output ~linear in losses
    # (rel 2 % absorbs the PVWatts part-load efficiency curve).
    a = rpv.pv_capacity_factor(w, *SANTIAGO, tilt=28, azimuth=0, losses=0.0, dc_ac=0.5).mean()
    b = rpv.pv_capacity_factor(w, *SANTIAGO, tilt=28, azimuth=0, losses=0.2, dc_ac=0.5).mean()
    assert b == pytest.approx(a * 0.8, rel=0.02)
