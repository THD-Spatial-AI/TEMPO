"""Tests for demand_large — mine-site selection rules."""
import sys
from pathlib import Path

import pytest
import shapely

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_large as dl  # noqa: E402


@pytest.mark.parametrize("tags,expected", [
    ({"industrial": "mine"}, True),
    ({"industrial": "mine", "disused:industrial": "mine"}, False),
    ({"industrial": "mine", "abandoned:landuse": "quarry"}, False),
    ({"industrial": "mine", "construction": "yes"}, False),
    ({"industrial": "mine", "proposed:industrial": "mine"}, False),
    ({"industrial": "mine", "end_date": "2020"}, False),
    ({"industrial": "mine", "end_date": "2030-06"}, True),
    ({"industrial": "mine", "end_date": "unknown"}, True),
])
def test_is_active(tags, expected):
    assert dl.is_active(tags, today="2026-11-07") is expected


@pytest.mark.parametrize("tags,km2,expected", [
    ({"resource": "copper"}, 1.0, True),
    ({"resource": "copper"}, 0.9, False),
    ({"resource": "gravel"}, 50, False),
    ({"resource": "peat"}, 50, False),
    ({"resource": "sand;gravel"}, 50, False),     # every value low-load
    ({"resource": "sand;gold"}, 2, True),         # one non-low-load value is enough
    ({}, 4.9, False),                             # untagged needs >= 5 km2
    ({}, 5.0, True),
])
def test_is_large_quarry(tags, km2, expected):
    assert dl.is_large_quarry(tags, km2) is expected


def test_subtract_tailings_only_inside():
    site = shapely.box(0, 0, 10, 10)
    inside = shapely.box(1, 1, 3, 3)
    straddling = shapely.box(9, 4, 12, 6)    # representative point outside the site
    out = dl.subtract_tailings(site, [inside, straddling])
    assert out.area == pytest.approx(100 - 4)
    assert dl.subtract_tailings(site, []) is site


# --- Task 2: mining share, mine-area table, site allocation ---------------------------------------
import numpy as np  # noqa: E402

SHARE_CSV = """# comment line
iso2,year,total_twh,industry_twh,heavy_twh,h,mining_twh,nonferrous_twh,iron_steel_twh,chemical_twh,nonmetallic_twh,paper_twh
CL,2020,80.0,,,,24.0,0.0,,,,
CL,2023,84.0,,,,30.0,0.0,,,,
PE,2023,50.0,,,,0.0,10.0,,,,
ZM,2024,10.0,,,,,4.0,,,,
AU,2023,200.0,,,,20.0,30.0,,,,
XX,2023,10.0,,,,0.0,0.0,,,,
YY,2023,10.0,,,,,,,,,
"""


@pytest.fixture
def share_table(tmp_path):
    p = tmp_path / "share.csv"
    p.write_text(SHARE_CSV, encoding="utf-8")
    return dl.load_mining_share(p)


def test_mining_share_latest_year_at_or_before_model_year(share_table):
    assert dl.mining_share(share_table, "CL", 2024) == pytest.approx(
        {"year": 2023, "mining_twh": 30.0, "share": 30.0 / 84.0, "rule": "mining"})
    assert dl.mining_share(share_table, "cl", 2021)["year"] == 2020
    assert dl.mining_share(share_table, "CL", 2000)["year"] == 2023      # none before: latest


def test_mining_share_nonferrous_rule(share_table):
    pe = dl.mining_share(share_table, "PE", 2024)
    assert pe["rule"] == "nonferrous" and pe["mining_twh"] == 10.0 and pe["share"] == pytest.approx(0.2)
    assert dl.mining_share(share_table, "ZM", 2024)["share"] == pytest.approx(0.4)   # blank mining = 0
    au = dl.mining_share(share_table, "AU", 2024)                         # mining > 0: non-ferrous ignored
    assert au["rule"] == "mining" and au["share"] == pytest.approx(0.1)


def test_mining_share_missing(share_table):
    assert dl.mining_share(share_table, "XX", 2024) is None
    assert dl.mining_share(share_table, "YY", 2024) is None
    assert dl.mining_share(share_table, "DE", 2024) is None


def test_bundled_tables_load():
    share = dl.load_mining_share()
    assert dl.mining_share(share, "CL", 2024)["share"] == pytest.approx(30.307 / 84.351)
    area = dl.load_mine_area()
    assert area["CL"] == {"iso3": "CHL", "source": "osm", "osm_km2": 2546.943, "maus_capped_km2": 1839.283}
    assert dl.country_mine_km2(area["CL"]) == 2546.943
    assert dl.country_mine_km2(dict(area["CL"], source="maus")) == 1839.283


def _site(x0, y0, x1, y1, iso2="CL", name="m", key=None):
    g = shapely.box(x0, y0, x1, y1)
    return {"geometry": g, "iso2": iso2, "name": name, "km2_key": g.area / 1e6 if key is None else key}


def test_allocate_proportional_to_area():
    sites = [_site(0, 0, 1000, 10_000, name="s1"), _site(5000, 0, 8000, 10_000, name="s2")]   # 10 and 30 km2
    res = dl.allocate_mines(sites, (np.array([500.0, 6500.0]), np.array([5000.0, 5000.0])),
                            {"CL": 100.0}, {"CL": 100.0})
    assert res["gwh"] == pytest.approx([10.0, 30.0])
    assert [(a["site"], a["sub"]) for a in res["assignments"]] == [(0, 0), (1, 1)]
    assert res["assignments"][1]["gwh"] == pytest.approx(30.0)
    assert res["warnings"] == []


def test_allocate_substation_inside_site_wins():
    site = _site(0, 0, 10_000, 10_000)              # representative point near (5000, 5000)
    # sub 0 is just outside and nearer to the centre; sub 1 lies inside the site, further away
    res = dl.allocate_mines([site], (np.array([5000.0, 9000.0]), np.array([-100.0, 9000.0])),
                            {"CL": 1.0}, {"CL": 100.0})
    assert res["assignments"][0]["sub"] == 1 and res["gwh"] == pytest.approx([0.0, 1.0])


def test_allocate_far_site_warns_and_still_assigns():
    site = _site(0, 0, 1000, 1000, name="Lonely pit")
    res = dl.allocate_mines([site], (np.array([50_500.0]), np.array([500.0])), {"CL": 1.0}, {"CL": 1.0},
                            far_km=30.0)
    assert res["gwh"] == pytest.approx([1.0])
    (w,) = res["warnings"]
    assert w["code"] == "MINE_FAR_FROM_SUBSTATION" and "Lonely pit" in w["message"] and "50" in w["message"]


def test_allocate_tie_goes_to_lower_index():
    site = _site(-1000, -1000, 1000, 1000)
    pt = site["geometry"].representative_point()
    d = 20_000.0
    res = dl.allocate_mines([site], (np.array([pt.x + d, pt.x - d]), np.array([pt.y, pt.y])),
                            {"CL": 1.0}, {"CL": 4.0})
    assert res["assignments"][0]["sub"] == 0


def test_allocate_uses_key_area_and_country_denominator():
    sites = [_site(0, 0, 1000, 1000, iso2="CL", key=2.0), _site(0, 0, 1000, 1000, iso2="AR", key=2.0)]
    res = dl.allocate_mines(sites, (np.array([500.0]), np.array([500.0])),
                            {"CL": 10.0, "AR": 30.0}, {"CL": 10.0, "AR": 60.0})
    assert [a["gwh"] for a in res["assignments"]] == pytest.approx([2.0, 1.0])


# --- Task 3: study-area mine sites ------------------------------------------------------------------
import json  # noqa: E402

import demand_landuse as dlu  # noqa: E402


def _ring(x0, y0, x1, y1):
    return [{"lon": x, "lat": y} for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0))]


def _way(i, tags, x0, y0, x1, y1):
    return {"type": "way", "id": i, "tags": tags, "geometry": _ring(x0, y0, x1, y1)}


# 0.1 deg ~ 11 km near the equator: every box below is far above the quarry thresholds unless tiny
REPLY = {"elements": [
    _way(1, {"industrial": "mine", "name": "Big Pit"}, 0.0, 0.0, 0.1, 0.1),
    _way(2, {"man_made": "tailings_pond"}, 0.01, 0.01, 0.03, 0.03),                 # inside mine 1
    _way(3, {"landuse": "quarry", "resource": "copper"}, 0.04, 0.04, 0.06, 0.06),   # inside mine 1: skipped
    _way(4, {"landuse": "quarry", "resource": "copper", "name": "Q"}, 0.5, 0.5, 0.52, 0.52),   # ~4.9 km2
    _way(5, {"landuse": "quarry", "resource": "gravel"}, 0.6, 0.6, 0.7, 0.7),       # low-load
    _way(6, {"landuse": "quarry"}, 0.8, 0.8, 0.81, 0.81),                            # untagged, ~1.2 km2
    _way(7, {"industrial": "mine", "disused:industrial": "mine"}, 0.2, 0.2, 0.3, 0.3),
    {"type": "relation", "id": 8, "tags": {"industrial": "mine", "type": "multipolygon"}, "members": [
        {"type": "way", "role": "outer", "geometry": _ring(1.0, 1.0, 1.1, 1.1)},
        {"type": "way", "role": "inner", "geometry": _ring(1.02, 1.02, 1.08, 1.08)}]},
    {"type": "way", "id": 9, "tags": {"industrial": "mine"}, "geometry": _ring(2, 2, 3, 3)[:3]},   # open way
]}


def test_mine_query_covers_three_selectors_with_bbox():
    q = dl.mine_query((-70.4, -18.9, -69.5, -18.0))
    b = "(-18.9,-70.4,-18.0,-69.5)"
    assert q.count(b) == 3 and q.endswith("out geom;")
    assert f'wr["industrial"="mine"]{b}' in q and f'wr["man_made"="tailings_pond"]{b}' in q
    assert '["landuse"="quarry"]["resource"!~"^(aggregate|clay|gravel|limestone|peat|sand|stone)$"]' \
           '(if:length()>3500)' + b in q


def test_parse_mine_sites_rules():
    sites = dl.parse_mine_sites(REPLY, today="2026-11-07")
    by_name = {s["name"]: s for s in sites}
    assert set(by_name) == {"Big Pit", "Q", None}
    big = by_name["Big Pit"]
    assert big["geometry"].area == pytest.approx(0.01 - 0.0004)          # tailings cut out
    assert big["km2"] == pytest.approx(dl.geodesic_km2(big["geometry"]))
    rel = by_name[None]
    assert rel["geometry"].area == pytest.approx(0.01 - 0.0036)           # inner ring removed


def test_fetch_osm_mine_sites_uses_shared_overpass_cache(tmp_path):
    calls = []

    def fetch(url, query, timeout):
        calls.append((url, query))
        if url == dlu.OVERPASS_MIRRORS[0]:
            raise IOError("busy")
        return REPLY
    bbox = (0.0, 0.0, 1.0, 1.0)
    sites = dl.fetch_osm_mine_sites(bbox, tmp_path, fetch=fetch, today="2026-11-07")
    assert len(sites) == 3 and [u for u, _ in calls] == list(dlu.OVERPASS_MIRRORS[:2])
    assert calls[0][1] == dl.mine_query(bbox)
    (cached,) = (tmp_path / "mines").iterdir()
    assert json.loads(cached.read_text(encoding="utf-8"))["elements"][0]["id"] == 1
    again = dl.fetch_osm_mine_sites(bbox, tmp_path, fetch=lambda *a: pytest.fail("cache miss"), today="2026-11-07")
    assert len(again) == 3


def test_fetch_osm_mine_sites_error_remark_raises(tmp_path):
    with pytest.raises(IOError):
        dl.fetch_osm_mine_sites((0, 0, 1, 1), tmp_path,
                                fetch=lambda u, q, t: {"elements": [], "remark": "runtime error: timed out"})


def _write_footprints(path, feats):
    with open(path, "w", encoding="utf-8") as fh:
        for i, (iso2, g) in enumerate(feats):
            fh.write(json.dumps({"type": "Feature", "id": i, "bbox": list(g.bounds),
                                 "properties": {"iso2": iso2, "km2": 1.5},
                                 "geometry": json.loads(shapely.to_geojson(g))}, separators=(",", ":")) + "\n")
    return path


def test_load_maus_sites_filters_by_area(tmp_path):
    fp = _write_footprints(tmp_path / "fp.geojsonl", [
        ("CL", shapely.box(0.1, 0.1, 0.2, 0.2)),           # inside
        ("PE", shapely.box(0.9, 0.9, 1.5, 1.5)),           # crosses the edge
        ("CL", shapely.box(5, 5, 6, 6)),                   # bbox far away
        ("CL", shapely.box(1.05, -0.5, 1.2, -0.1)),        # bbox overlaps area bbox, geometry does not
    ])
    area = shapely.Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]).union(shapely.box(1.0, 0.0, 1.3, 0.05))
    sites = dl.load_maus_sites(fp, area)
    assert [s["iso2"] for s in sites] == ["CL", "PE"]
    assert sites[0]["geometry"].equals(shapely.box(0.1, 0.1, 0.2, 0.2))
    assert sites[0]["name"] is None and sites[0]["km2"] == 1.5


AREA_TAB = {"CL": {"iso3": "CHL", "source": "osm", "osm_km2": 10.0, "maus_capped_km2": 5.0},
            "AR": {"iso3": "ARG", "source": "osm", "osm_km2": 10.0, "maus_capped_km2": 5.0},
            "PE": {"iso3": "PER", "source": "maus", "osm_km2": 1.0, "maus_capped_km2": 50.0}}
AREAS = {"CL": shapely.box(0, 0, 1, 1), "AR": shapely.box(1, 0, 2, 1), "PE": shapely.box(0, -1, 2, 0)}


def test_study_area_sites_hybrid(tmp_path, monkeypatch):
    seen = {}

    def osm(bbox, cache_dir, fetch=None, today=None):
        seen["bbox"] = tuple(bbox)
        return [{"geometry": shapely.box(0.8, 0.4, 1.1, 0.6), "name": "border", "km2": 1.0},   # mostly CL
                {"geometry": shapely.box(1.5, 0.5, 1.6, 0.6), "name": "ar", "km2": 1.0},
                {"geometry": shapely.box(0.5, -0.5, 0.6, -0.4), "name": "in PE", "km2": 1.0}]   # PE is maus
    monkeypatch.setattr(dl, "fetch_osm_mine_sites", osm)
    fp = _write_footprints(tmp_path / "fp.geojsonl", [("PE", shapely.box(0.2, -0.5, 0.3, -0.4)),
                                                      ("CL", shapely.box(0.2, 0.2, 0.3, 0.3))])   # CL is osm
    sites, missing = dl.study_area_sites(AREAS, ["CL", "AR", "PE"], AREA_TAB, cache_dir=tmp_path, footprints_path=fp)
    assert missing == {}
    assert seen["bbox"] == (0, 0, 2, 1)
    assert [(s["name"], s["iso2"]) for s in sites] == [("border", "CL"), ("ar", "AR"), (None, "PE")]


def test_study_area_sites_missing(tmp_path, monkeypatch):
    def fail(*a, **kw):
        raise IOError("down")
    monkeypatch.setattr(dl, "fetch_osm_mine_sites", fail)
    sites, missing = dl.study_area_sites(AREAS, ["CL", "PE"], AREA_TAB, cache_dir=tmp_path,
                                         footprints_path=tmp_path / "absent.geojsonl")
    assert sites == []
    assert missing["CL"][0] == "MINES_UNAVAILABLE" and "down" in missing["CL"][1]
    assert missing["PE"] == ("MINES_UNAVAILABLE", "mine footprints are not downloaded")
    monkeypatch.setattr(dl, "fetch_osm_mine_sites", lambda *a, **kw: pytest.fail("skipped"))
    _, missing = dl.study_area_sites(AREAS, ["CL"], AREA_TAB, cache_dir=tmp_path, footprints_path=None,
                                     query_osm=False)
    assert missing == {"CL": ("MINES_SKIPPED", "study area too large for an OSM mine query")}
    assert dl.study_area_sites(AREAS, [], AREA_TAB, cache_dir=tmp_path, footprints_path=None) == ([], {})


# --- L5 revision: high-voltage withdrawal point near the mine -------------------------------------
PIT = (0, 0, 10_000, 10_000)


def _pick(xs, ys, volts, **kw):
    res = dl.allocate_mines([_site(*PIT)], (np.array(xs, float), np.array(ys, float)), {"CL": 1.0}, {"CL": 100.0},
                            voltages=volts, **kw)
    return res["assignments"][0]["sub"], res["warnings"]


def test_hv_substation_near_site_beats_inside_mv_one():
    # sub 0: 69 kV inside the pit; sub 1: 220 kV 12 km outside the polygon edge
    assert _pick([5000, 22_000], [5000, 5000], [69, 220]) == (1, [])


def test_highest_voltage_wins_then_nearest_to_polygon():
    assert _pick([12_000, 20_000, 5000], [5000, 5000, 5000], [110, 220, 66])[0] == 1
    # equal voltage: nearer to the polygon (not to the representative point), then lower index
    # sub 0 at the corner: 0.7 km from the polygon, 7.8 km from its centre; sub 1: 2 km / 7 km
    assert _pick([10_500, 5000], [10_500, -2000], ["220", "220"])[0] == 0
    assert _pick([11_000, 11_000], [5000, 5000], [220, 220])[0] == 0


def test_hv_beyond_hv_km_is_not_a_candidate():
    # 220 kV 20 km away is outside hv_km=15: old rule, the inside 66 kV substation wins
    assert _pick([5000, 30_000], [5000, 5000], [66, 220])[0] == 0


def test_no_hv_falls_back_to_old_rule():
    assert _pick([5000, 9000], [-100, 9000], [33, 66])[0] == 1                 # inside wins
    sub, warnings = _pick([50_500], [5000], [66])
    assert sub == 0 and warnings[0]["code"] == "MINE_FAR_FROM_SUBSTATION"
    assert _pick([5000, 9000], [-100, 9000], None)[0] == 1                     # no voltages at all


@pytest.mark.parametrize("value,kv", [("220;66", 220.0), ("220000", 220.0), (110000, 110.0), ("bad", None),
                                      (None, None), (69, 69.0)])
def test_substation_kv_strings_and_volts(value, kv):
    assert dl.substation_kv(value) == kv


def test_voltages_in_volts_and_strings_pick_hv():
    assert _pick([5000, 22_000], [5000, 5000], ["69000", "220000;110000"])[0] == 1
