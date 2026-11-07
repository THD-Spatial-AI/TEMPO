"""renewables_wind — curves, shear, density, CF, candidate cells (no network)."""
import sys
from pathlib import Path

import numpy as np
import pytest

pd = pytest.importorskip("pandas")
sys.path.insert(0, str(Path(__file__).parent.parent))

import renewables_wind as rwind  # noqa: E402


def weather(v10, v100, t2m=15.0, sp=1013.25, n=8760):
    idx = pd.date_range("2023-01-01T00:30", periods=n, freq="h", tz="UTC")
    return pd.DataFrame({"v10": v10, "v100": v100, "t2m": t2m, "sp": sp}, index=idx)


def test_generic_curve_shape():
    v, p = rwind.power_curve("generic_iec2")
    assert p[v < 3.0].max() == 0 and p[(v >= 11.5) & (v <= 25)].min() == pytest.approx(1.0)
    assert p[v > 25].max() == 0
    assert np.all(np.diff(p[(v >= 3) & (v <= 11.5)]) >= 0)


def test_hub_speed_power_law():
    v = rwind.hub_speed(np.array([6.0]), np.array([8.0]), 150.0)
    alpha = np.log(8 / 6) / np.log(10)
    assert v[0] == pytest.approx(8 * 1.5 ** alpha)
    assert rwind.hub_speed(np.array([0.1]), np.array([8.0]), 150.0)[0] == pytest.approx(8 * 1.5 ** (1 / 7))
    assert rwind.hub_speed(np.array([8.0]), np.array([1.0]), 150.0)[0] == pytest.approx(1.0)   # alpha clipped at 0


def test_air_density_standard():
    assert rwind.air_density(np.array([15.0]), np.array([1013.25]))[0] == pytest.approx(1.225, abs=1e-3)


def test_cf_constant_speed_matches_curve_and_loss():
    cf = rwind.wind_capacity_factor(weather(8.0, 8.0), "generic_iec2", hub_height=100, loss=0.12)
    expected = (8 ** 3 - 27) / (11.5 ** 3 - 27) * 0.88
    assert cf.shape == (8760,) and cf.mean() == pytest.approx(expected, rel=1e-3)


def test_windier_site_and_denser_air_give_more():
    calm = rwind.wind_capacity_factor(weather(5.0, 6.5), "generic_iec2", 100).mean()
    windy = rwind.wind_capacity_factor(weather(8.0, 10.0), "generic_iec2", 100).mean()
    thin = rwind.wind_capacity_factor(weather(8.0, 10.0, sp=800.0), "generic_iec2", 100).mean()
    assert windy > calm and thin < windy


def test_storm_cut_out_is_zero():
    assert rwind.wind_capacity_factor(weather(30.0, 30.0), "generic_iec2", 100).max() == 0


def test_list_turbines_generic_first_and_oedb_loads():
    pytest.importorskip("windpowerlib")
    ts = rwind.list_turbines()
    assert [t["id"] for t in ts[:4]] == ["generic_iec1", "generic_iec2", "generic_iec3", "generic_offshore"]
    oedb = [t for t in ts if t["id"].startswith("oedb:")]
    assert len(oedb) > 20
    v, p = rwind.power_curve(oedb[0]["id"])
    assert p.max() == pytest.approx(1.0, abs=0.05) and p.min() >= 0


def test_every_oedb_curve_is_normalised():
    pytest.importorskip("windpowerlib")
    for t in rwind.list_turbines():
        if t["id"].startswith("oedb:"):
            _, p = rwind.power_curve(t["id"])
            assert 0.9 <= p.max() <= 1.1, t["id"]


def test_unknown_turbine_raises():
    with pytest.raises(ValueError, match="unknown turbine"):
        rwind.power_curve("nope")


def test_candidate_cells_include_own_and_respect_radius():
    cells = rwind.candidate_cells(-45.3, -72.1, 25)
    assert (-45.25, -72.0) in cells or (-45.25, -72.25) in cells     # own cell
    assert all(rwind.haversine_km(-45.3, -72.1, la, lo) <= 25 + 1e-9 or (la, lo) == rwind.own_cell(-45.3, -72.1)
               for la, lo in cells)
    assert 1 <= len(cells) <= 60
    big = rwind.candidate_cells(-45.3, -72.1, 100)
    assert len(cells) < len(big) <= 60 and big[0] == rwind.own_cell(-45.3, -72.1)


def test_candidate_cells_wrap_at_antimeridian():
    cells = rwind.candidate_cells(-20, 179.9, 100)
    assert len(cells) == len(set(cells))
    assert all(-180 <= lo < 180 for _, lo in cells)
    assert any(lo > 179 for _, lo in cells) and any(lo < -179 for _, lo in cells)
