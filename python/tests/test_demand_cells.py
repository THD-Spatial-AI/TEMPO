"""Tests for demand_cells — projection, nearest seed, Voronoi cells, features."""
import sys
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("shapely")
pytest.importorskip("pyproj")
from shapely.geometry import Point, box  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_cells as dc  # noqa: E402

AREA = box(-1000.0, -1000.0, 1000.0, 1000.0)   # projected metres


def test_nearest_seed_and_distance():
    idx, dist = dc.nearest_seed([-10, 10, 300], [0, 0, 0], sx=[-100, 100], sy=[0, 0])
    assert idx.tolist() == [0, 1, 1]
    assert dist.tolist() == pytest.approx([90, 90, 200])


def test_nearest_seed_matches_brute_force():
    rng = np.random.default_rng(0)
    px, py = rng.uniform(-1000, 1000, 5000), rng.uniform(-1000, 1000, 5000)
    sx, sy = rng.uniform(-1000, 1000, 300), rng.uniform(-1000, 1000, 300)
    d2 = (px[:, None] - sx[None, :]) ** 2 + (py[:, None] - sy[None, :]) ** 2
    idx, dist = dc.nearest_seed(px, py, sx, sy)
    assert (idx == d2.argmin(axis=1)).all()
    assert dist == pytest.approx(np.sqrt(d2.min(axis=1)))


def test_nearest_seed_ties_go_to_lowest_index():
    # point 0 equidistant from seeds 1 and 2; seeds 0 and 3 share a location
    idx, _ = dc.nearest_seed([0.0, 50.0], [0.0, 0.0], sx=[50.0, 10.0, -10.0, 50.0], sy=[1.0, 0.0, 0.0, 1.0])
    assert idx.tolist() == [1, 0]


def test_cells_partition_area_and_contain_their_seed():
    sx, sy = [-500.0, 500.0, 0.0], [-500.0, -500.0, 600.0]
    cells = dc.voronoi_cells(sx, sy, AREA)
    assert len(cells) == 3
    assert sum(c.area for c in cells) == pytest.approx(AREA.area, rel=1e-9)
    for x, y, c in zip(sx, sy, cells):
        assert c.covers(Point(x, y))


def test_many_cells_each_hold_their_own_seed():
    rng = np.random.default_rng(3)
    sx, sy = rng.uniform(-990, 990, 400), rng.uniform(-990, 990, 400)
    cells = dc.voronoi_cells(sx, sy, AREA)
    assert sum(c.area for c in cells) == pytest.approx(AREA.area, rel=1e-9)
    idx, _ = dc.nearest_seed([c.representative_point().x for c in cells],
                             [c.representative_point().y for c in cells], sx, sy)
    assert idx.tolist() == list(range(400))


def test_single_seed_gets_whole_area():
    assert dc.voronoi_cells([0.0], [0.0], AREA)[0].equals(AREA)


def test_duplicate_seed_gets_empty_cell():
    cells = dc.voronoi_cells([0.0, 0.0, 500.0], [0.0, 0.0, 0.0], AREA)
    assert not cells[0].is_empty and cells[1].is_empty and not cells[2].is_empty


def test_cell_feature_round_trip_wgs84():
    fwd, inv = dc.local_projection(-70.5, -33.5)
    x, y = fwd.transform(-70.5, -33.5)
    cell = box(x - 5000, y - 5000, x + 5000, y + 5000)
    feat = dc.cell_feature(cell, inv, {"locationId": "a"})
    ring = feat["geometry"]["coordinates"][0]
    lons = [p[0] for p in ring]
    assert feat["properties"] == {"locationId": "a"}
    assert min(lons) == pytest.approx(-70.5539, abs=1e-3) and max(lons) == pytest.approx(-70.4461, abs=1e-3)
    assert all(len(str(v).split(".")[-1]) <= 5 for p in ring for v in p)


def test_empty_cell_feature_has_null_geometry():
    _, inv = dc.local_projection(0, 0)
    assert dc.cell_feature(box(0, 0, 0, 0).buffer(0), inv, {})["geometry"] is None
