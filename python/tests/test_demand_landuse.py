"""Tests for demand_landuse — Overpass parsing, caching, pixel coverage."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
import shapely.affinity

pytest.importorskip("rasterio")
from shapely.geometry import box  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_landuse as lu  # noqa: E402

WAY = {"type": "way", "id": 1, "tags": {"landuse": "residential"},
       "geometry": [{"lon": 0, "lat": 0}, {"lon": 1, "lat": 0}, {"lon": 1, "lat": 1}, {"lon": 0, "lat": 1}, {"lon": 0, "lat": 0}]}
RETAIL = dict(WAY, id=2, tags={"landuse": "retail"})
OPEN_WAY = dict(WAY, id=3, geometry=WAY["geometry"][:3])
REL = {"type": "relation", "id": 9, "tags": {"landuse": "industrial", "type": "multipolygon"}, "members": [
    {"type": "way", "role": "outer", "geometry": [{"lon": 2, "lat": 0}, {"lon": 3, "lat": 0}, {"lon": 3, "lat": 1}]},
    {"type": "way", "role": "outer", "geometry": [{"lon": 3, "lat": 1}, {"lon": 2, "lat": 1}, {"lon": 2, "lat": 0}]},
    {"type": "way", "role": "inner", "geometry": [{"lon": 2.4, "lat": 0.4}, {"lon": 2.6, "lat": 0.4}, {"lon": 2.6, "lat": 0.6}, {"lon": 2.4, "lat": 0.4}]}]}


def test_query_uses_south_west_north_east():
    q = lu.overpass_query((-70.4, -18.9, -69.5, -18.0))
    assert "(-18.9,-70.4,-18.0,-69.5)" in q and "out geom" in q and "farmyard" in q


def test_parse_classes_retail_as_commercial_and_relations():
    polys = lu.parse_overpass({"elements": [WAY, RETAIL, OPEN_WAY, REL]})
    assert len(polys["residential"]) == 1 and len(polys["commercial"]) == 1
    assert sum(p.area for p in polys["industrial"]) == pytest.approx(1.0)   # inner ignored
    assert polys["farmland"] == []


def test_fetch_caches_and_falls_back_to_next_mirror(tmp_path):
    calls = []

    def fetch(url, query, timeout):
        calls.append(url)
        if url == lu.OVERPASS_MIRRORS[0]:
            raise IOError("busy")
        return {"elements": [WAY]}

    bbox = (0, 0, 1, 1)
    assert lu.fetch_landuse(bbox, tmp_path, fetch=fetch)["elements"][0]["id"] == 1
    assert calls == list(lu.OVERPASS_MIRRORS[:2])
    assert lu.fetch_landuse(bbox, tmp_path, fetch=lambda *a: pytest.fail("cache miss"))["elements"]


def test_fetch_all_mirrors_fail_raises(tmp_path):
    def fetch(url, query, timeout):
        raise IOError("down")
    with pytest.raises(IOError):
        lu.fetch_landuse((0, 0, 1, 1), tmp_path, fetch=fetch)


def test_mirror_order_matches_go_proxy():
    go = (Path(__file__).parents[2] / "backend-go" / "internal" / "overpass" / "client.go").read_text(encoding="utf-8")
    urls = [u for u in go.split('"') if u.startswith("https://overpass")]
    assert list(lu.OVERPASS_MIRRORS) == urls


@pytest.mark.parametrize("remark", ["runtime error: Query timed out in \"query\" at line 1",
                                    "Query run Out Of Memory", "An ERROR occurred"])
def test_error_remark_falls_through_without_caching(tmp_path, remark):
    calls = []

    def fetch(url, query, timeout):
        calls.append(url)
        if url == lu.OVERPASS_MIRRORS[0]:
            return {"elements": [WAY], "remark": remark}
        raise IOError("down")
    with pytest.raises(IOError):
        lu.fetch_landuse((0, 0, 1, 1), tmp_path, fetch=fetch)
    assert calls == list(lu.OVERPASS_MIRRORS)
    assert not (tmp_path / "landuse").exists() or not any((tmp_path / "landuse").iterdir())


def test_harmless_remark_is_accepted(tmp_path):
    data = lu.fetch_landuse((0, 0, 1, 1), tmp_path, fetch=lambda u, q, t: {"elements": [], "remark": "note"})
    assert data["elements"] == []


def test_per_mirror_timeout_and_overall_deadline(tmp_path):
    now = [0.0]
    timeouts = []

    def fetch(url, query, timeout):
        timeouts.append(timeout)
        now[0] += timeout          # every mirror hangs for its full timeout
        raise TimeoutError("hung")
    with pytest.raises(TimeoutError):
        lu.fetch_landuse((0, 0, 1, 1), tmp_path, fetch=fetch, clock=lambda: now[0])
    assert timeouts == [lu.MIRROR_TIMEOUT_S, lu.MIRROR_TIMEOUT_S, lu.FETCH_DEADLINE_S - 2 * lu.MIRROR_TIMEOUT_S]
    assert now[0] == lu.FETCH_DEADLINE_S


def test_cache_key_is_query_hash_and_write_is_atomic(tmp_path):
    import hashlib
    bbox = (0, 0, 1, 1)
    lu.fetch_landuse(bbox, tmp_path, fetch=lambda u, q, t: {"elements": [WAY]})
    files = list((tmp_path / "landuse").iterdir())
    key = hashlib.sha1(lu.overpass_query(bbox).encode("utf-8")).hexdigest()
    assert [f.name for f in files] == [f"{key}.json"]
    assert json.loads(files[0].read_text(encoding="utf-8"))["elements"][0]["id"] == 1


def test_corrupt_cache_is_a_miss(tmp_path):
    bbox = (0, 0, 1, 1)
    lu.fetch_landuse(bbox, tmp_path, fetch=lambda u, q, t: {"elements": [WAY]})
    (path,) = (tmp_path / "landuse").iterdir()
    path.write_text('{"elements": [', encoding="utf-8")
    data = lu.fetch_landuse(bbox, tmp_path, fetch=lambda u, q, t: {"elements": [RETAIL]})
    assert data["elements"][0]["id"] == 2
    assert json.loads(path.read_text(encoding="utf-8"))["elements"][0]["id"] == 2


def test_null_vertices_outside_bbox_are_skipped():
    p = WAY["geometry"]
    way = dict(WAY, geometry=[p[0], None, p[1], p[2], p[3], p[4]])
    gone = dict(WAY, id=4, geometry=[p[0], None, None, None, p[4]])
    rel = dict(REL, members=[dict(REL["members"][0], geometry=[None] + REL["members"][0]["geometry"]),
                             REL["members"][1],
                             {"type": "way", "role": "outer", "geometry": [None, {"lon": 9, "lat": 9}, None]}])
    polys = lu.parse_overpass({"elements": [way, gone, rel]})
    assert len(polys["residential"]) == 1 and polys["residential"][0].area == pytest.approx(1.0)
    assert sum(p.area for p in polys["industrial"]) == pytest.approx(1.0)


def test_relation_empty_role_is_outer():
    rel = dict(REL, members=[dict(m, role="") for m in REL["members"][:2]])
    polys = lu.parse_overpass({"elements": [rel]})
    assert sum(p.area for p in polys["industrial"]) == pytest.approx(1.0)


def test_pixel_class_fractions():
    px, py = np.array([500.0, 1500.0]), np.array([500.0, 500.0])     # two 1 km pixels side by side
    polys = {"residential": [box(0, 0, 1000, 1000)],                    # covers pixel 0 fully
             "commercial": [box(1000, 0, 1500, 1000)],                  # half of pixel 1
             "industrial": [], "farmland": []}
    f = lu.pixel_class_fractions(px, py, polys, pixel_size=1000.0)
    assert f.shape == (2, 4)
    assert f[0].tolist() == pytest.approx([1.0, 0.0, 0.0, 0.0])
    assert f[1].tolist() == pytest.approx([0.0, 0.5, 0.0, 0.0])


def test_overlapping_classes_capped_at_one():
    polys = {"residential": [box(0, 0, 1000, 1000)], "commercial": [box(0, 0, 1000, 1000)],
             "industrial": [], "farmland": []}
    f = lu.pixel_class_fractions(np.array([500.0]), np.array([500.0]), polys, pixel_size=1000.0)
    assert f.sum() == pytest.approx(1.0)
    assert f[0, 0] == pytest.approx(0.5)


def test_banded_fractions_match_unbanded():
    rng = np.random.default_rng(7)
    size = 100.0
    cols, rows = rng.integers(0, 60, 400), rng.integers(0, 80, 400)
    px, py = cols * size + size / 2, -rows * size + size / 2
    def rand_box():
        x, y = rng.uniform(0, 6000), rng.uniform(-8000, 0)
        return box(x, y, x + rng.uniform(50, 1500), y + rng.uniform(50, 1500))
    polys = {c: [rand_box() for _ in range(6)] for c in lu.LANDUSE_CLASSES}
    far = 5_000 * size                                       # second cluster far away in x
    px = np.r_[px, px + far]
    py = np.r_[py, py]
    polys = {c: ps + [shapely.affinity.translate(p, xoff=far) for p in ps] for c, ps in polys.items()}
    whole = lu.pixel_class_fractions(px, py, polys, pixel_size=size, band=10_000)
    banded = lu.pixel_class_fractions(px, py, polys, pixel_size=size, band=1)
    assert whole.sum() > 0
    assert np.array_equal(whole, banded)
    assert np.array_equal(whole[:400], whole[400:])


def test_far_apart_pixels_rasterised_separately(monkeypatch):
    shapes = []
    real = lu.rasterize
    monkeypatch.setattr(lu, "rasterize", lambda *a, **k: shapes.append(k["out_shape"]) or real(*a, **k))
    px, py = np.array([50.0, 1e7 + 50.0]), np.array([50.0, 50.0])
    polys = {"residential": [box(0, 0, 100, 100), box(1e7, 0, 1e7 + 100, 100)]}
    f = lu.pixel_class_fractions(px, py, polys, pixel_size=100.0)
    assert f[:, 0].tolist() == [1.0, 1.0]
    assert max(c for _, c in shapes) <= 10
