"""renewables_pv.optimise_orientation — clear-sky physics (no network)."""
import sys
import time
from pathlib import Path

import pytest

pvlib = pytest.importorskip("pvlib")
pd = pytest.importorskip("pandas")
sys.path.insert(0, str(Path(__file__).parent.parent))

import renewables_pv as rpv  # noqa: E402
from test_renewables_pv import clear_sky  # noqa: E402

SANTIAGO = (-33.45, -70.66)
PARIS = (48.85, 2.35)


def test_period_months_is_hemisphere_aware():
    assert rpv.period_months("year", 10) == list(range(1, 13))
    assert rpv.period_months("summer", 10) == [6, 7, 8]
    assert rpv.period_months("summer", -10) == [12, 1, 2]
    assert rpv.period_months("winter", -10) == [6, 7, 8]
    assert rpv.period_months("custom", 0, [3, 4]) == [3, 4]
    with pytest.raises(ValueError):
        rpv.period_months("custom", 0, [])
    with pytest.raises(ValueError):
        rpv.period_months("custom", 0, [13])


def test_annual_optimum_faces_equator_south():
    r = rpv.optimise_orientation(clear_sky(*SANTIAGO), *SANTIAGO, rpv.period_months("year", SANTIAGO[0]), 0, 0)
    assert r["azimuth"] <= 10 or r["azimuth"] >= 350        # ≈ north
    assert 25 <= r["tilt"] <= 40                             # clear sky favours beam → a bit above ~30
    assert r["gain_pct"] > 0                                  # better than flat


def test_annual_optimum_faces_equator_north():
    r = rpv.optimise_orientation(clear_sky(*PARIS), *PARIS, rpv.period_months("year", PARIS[0]), 0, 180)
    assert 170 <= r["azimuth"] <= 190
    assert 30 <= r["tilt"] <= 50


def test_winter_is_steeper_than_summer():
    w = clear_sky(*SANTIAGO)
    win = rpv.optimise_orientation(w, *SANTIAGO, rpv.period_months("winter", SANTIAGO[0]), 28, 0)
    summ = rpv.optimise_orientation(w, *SANTIAGO, rpv.period_months("summer", SANTIAGO[0]), 28, 0)
    assert win["tilt"] > summ["tilt"] + 15


def test_optimum_beats_its_neighbours():
    w = clear_sky(*SANTIAGO)
    months = list(range(1, 13))
    r = rpv.optimise_orientation(w, *SANTIAGO, months, 0, 0)
    best = rpv.poa_energy(w, *SANTIAGO, r["tilt"], r["azimuth"], months)
    for dt, da in ((3, 0), (-3, 0), (0, 6), (0, -6)):
        assert best >= rpv.poa_energy(w, *SANTIAGO, max(0, r["tilt"] + dt), (r["azimuth"] + da) % 360, months)


def _reference_poa_sum(weather, lat, lon, tilt, azimuth, months):
    """The original get_total_irradiance-based objective, kept as the numerical reference."""
    from pvlib import iam, irradiance
    from pvlib.location import Location
    sp = Location(lat, lon).get_solarposition(weather.index)
    zen, az = sp["apparent_zenith"], sp["azimuth"]
    poa = irradiance.get_total_irradiance(tilt, azimuth, zen, az, weather["dni"], weather["ghi"], weather["dhi"],
                                          dni_extra=irradiance.get_extra_radiation(weather.index), model="haydavies")
    beam = poa["poa_direct"] * iam.physical(irradiance.aoi(tilt, azimuth, zen, az))
    return float((beam + poa["poa_diffuse"]).fillna(0.0).clip(lower=0)[weather.index.month.isin(months)].sum())


@pytest.mark.parametrize("tilt,azimuth", [(0, 0), (28, 0), (34, 10), (60, 300), (85, 180)])
def test_fast_objective_matches_reference(tilt, azimuth):
    w = clear_sky(*SANTIAGO)
    months = [12, 1, 2, 6]
    fast = rpv.poa_energy(w, *SANTIAGO, tilt, azimuth, months)
    ref = _reference_poa_sum(w, *SANTIAGO, tilt, azimuth, months)
    assert fast == pytest.approx(ref, rel=1e-6)


def test_high_latitude_winter_tilt_exceeds_old_cap():
    oslo = (59.9, 10.75)
    r = rpv.optimise_orientation(clear_sky(*oslo), *oslo, rpv.period_months("winter", oslo[0]), 40, 180)
    assert r["tilt"] > 65


def test_submitted_orientation_kept_when_not_beaten():
    w = clear_sky(*SANTIAGO)
    months = list(range(1, 13))
    r = rpv.optimise_orientation(w, *SANTIAGO, months, 0, 0)
    again = rpv.optimise_orientation(w, *SANTIAGO, months, r["tilt"], r["azimuth"])
    assert again == {"tilt": r["tilt"], "azimuth": r["azimuth"], "gain_pct": 0.0}
    odd = rpv.optimise_orientation(w, *SANTIAGO, months, r["tilt"], (r["azimuth"] + 360) % 360 + 360)
    assert 0 <= odd["azimuth"] < 360


def test_optimise_time_per_point():
    w = clear_sky(*SANTIAGO)
    t0 = time.perf_counter()
    rpv.optimise_orientation(w, *SANTIAGO, list(range(1, 13)), 28, 0)
    dt = time.perf_counter() - t0
    assert dt < 2.0
