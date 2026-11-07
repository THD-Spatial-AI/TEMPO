"""Tests for demand_estimate — per-substation annual demand from the EC raster."""
import sys
from pathlib import Path

import numpy as np
import pytest

rasterio = pytest.importorskip("rasterio")
pytest.importorskip("shapely")
from rasterio.transform import from_origin  # noqa: E402
from shapely.geometry import MultiPolygon, box, mapping  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_estimate as de  # noqa: E402

AREA = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "properties": {}, "geometry": mapping(box(-71.0, -34.0, -70.0, -33.0))}]}
A = {"id": "a", "name": "A", "lon": -70.75, "lat": -33.5, "substation": "distribution"}
B = {"id": "b", "name": "B", "lon": -70.25, "lat": -33.5, "substation": "distribution"}
T = {"id": "t", "name": "T", "lon": -70.5, "lat": -33.5, "substation": "transmission"}


def ec_tif(tmp_path, left_only=True):
    data = np.zeros((100, 100)) if left_only else np.full((100, 100), 1000.0)
    if left_only:
        data[:, :50] = 1000.0                  # 5,000 pixels × 1,000 kWh = 5 GWh west of -70.5
    path = tmp_path / "ec.tif"
    with rasterio.open(path, "w", driver="GTiff", height=100, width=100, count=1, dtype="float32",
                       crs="EPSG:4326", transform=from_origin(-71.0, -33.0, 0.01, 0.01), nodata=-1) as dst:
        dst.write(data.astype("float32"), 1)
    return path


def run(tmp_path, subs, left_only=True, **kw):
    opts = dict(model_year=2019, country="CL", national_table={}, raster_totals={})
    opts.update(kw)
    area = opts.pop("area", AREA)
    return de.estimate(area, subs, ec_path=ec_tif(tmp_path, left_only), **opts)


def by_id(result):
    return {s["id"]: s for s in result["substations"]}


def test_energy_goes_to_the_cell_it_lies_in(tmp_path):
    res = run(tmp_path, [A, B])
    s = by_id(res)
    assert res["chain"]["countries"][0]["rasterAreaTWh"] == pytest.approx(0.005)
    assert s["a"]["annual_gwh"] == pytest.approx(5.0)
    assert s["b"]["annual_gwh"] == pytest.approx(0.0)
    assert s["a"]["avg_mw"] == pytest.approx(5.0 * 1000 / 8760, rel=1e-6)


def test_transmission_substation_gets_no_demand(tmp_path):
    s = by_id(run(tmp_path, [A, B, T]))
    assert s["t"]["seed"] is False and s["t"]["annual_gwh"] == 0.0
    assert s["a"]["annual_gwh"] == pytest.approx(5.0)


def test_override_rescales_keeping_shares(tmp_path):
    res = run(tmp_path, [A, B], override_gwh=20.0)
    assert by_id(res)["a"]["annual_gwh"] == pytest.approx(20.0)
    assert res["chain"]["totalGWh"] == pytest.approx(20.0)


def test_calibrated_to_national_demand(tmp_path):
    # country raster total 10 GWh, national 20 GWh (latest year <= model year) -> area energy doubles
    res = run(tmp_path, [A, B], model_year=2024, raster_totals={"CL": 0.010},
              national_table={"CL": {2019: 0.016, 2023: 0.020, 2030: 0.050}})
    c = res["chain"]
    assert c["rasterYear"] == 2019
    assert c["countries"] == [pytest.approx({
        "country": "CL", "rasterAreaTWh": 0.005, "rasterCountryTWh": 0.010, "nationalTWh": 0.020,
        "nationalYear": 2023, "factor": 2.0, "areaTWh": 0.010,
        "miningTWh": 0.0, "litFactor": 1.0, "mineKm2Country": 0.0, "mineKm2Area": 0.0,   # Inc 7, off
        "miningGWhArea": 0.0, "mineSource": None})]
    assert c["calibratedGWh"] == pytest.approx(10.0) and c["totalGWh"] == pytest.approx(10.0)
    assert by_id(res)["a"]["annual_gwh"] == pytest.approx(10.0)
    assert not any(w["code"] == "NO_CALIBRATION" for w in res["warnings"])


TWO = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "properties": {"countryCode": "CL"}, "geometry": mapping(box(-71.0, -34.0, -70.5, -33.0))},
    {"type": "Feature", "properties": {"countryCode": "ar"}, "geometry": mapping(box(-70.5, -34.0, -70.0, -33.0))}]}


def test_two_countries_calibrated_separately(tmp_path):
    # uniform raster: 5 GWh in each half; CL x2, AR x3
    res = run(tmp_path, [A, B], left_only=False, area=TWO, country=None,
              raster_totals={"CL": 1.0, "AR": 1.0}, national_table={"CL": {2019: 2.0}, "AR": {2019: 3.0}})
    rows = {c["country"]: c for c in res["chain"]["countries"]}
    assert set(rows) == {"CL", "AR"}
    assert rows["CL"]["areaTWh"] == pytest.approx(0.010) and rows["AR"]["areaTWh"] == pytest.approx(0.015)
    assert res["totalGWh"] == pytest.approx(25.0)
    s = by_id(res)
    assert s["a"]["annual_gwh"] == pytest.approx(10.0) and s["b"]["annual_gwh"] == pytest.approx(15.0)
    assert s["a"]["share"] == pytest.approx(0.4)


def test_missing_country_uses_raw_raster(tmp_path):
    res = run(tmp_path, [A, B], raster_totals={"AR": 1.0}, national_table={"CL": {2019: 2.0}})
    warn = [w for w in res["warnings"] if w["code"] == "NO_CALIBRATION"]
    assert len(warn) == 1 and "CL" in warn[0]["message"]
    assert res["chain"]["countries"][0]["factor"] == 1.0
    assert res["totalGWh"] == pytest.approx(5.0)


def test_feature_without_country_code_or_argument(tmp_path):
    res = run(tmp_path, [A, B], country=None, raster_totals={"CL": 1.0}, national_table={"CL": {2019: 2.0}})
    assert res["chain"]["countries"][0]["country"] == "?"
    assert any(w["code"] == "NO_CALIBRATION" for w in res["warnings"])
    assert res["totalGWh"] == pytest.approx(5.0)


def test_override_rescales_calibrated_shares(tmp_path):
    res = run(tmp_path, [A, B], left_only=False, area=TWO, country=None, override_gwh=50.0,
              raster_totals={"CL": 1.0, "AR": 1.0}, national_table={"CL": {2019: 2.0}, "AR": {2019: 3.0}})
    assert res["chain"]["calibratedGWh"] == pytest.approx(25.0) and res["chain"]["totalGWh"] == pytest.approx(50.0)
    s = by_id(res)
    assert s["a"]["annual_gwh"] == pytest.approx(20.0) and s["b"]["annual_gwh"] == pytest.approx(30.0)


def test_fallback_when_only_transmission(tmp_path):
    res = run(tmp_path, [dict(A, substation="transmission"), dict(B, substation="transmission")])
    assert any(w["code"] == "NO_SEEDS_FALLBACK" for w in res["warnings"])
    assert by_id(res)["a"]["annual_gwh"] == pytest.approx(5.0)


def test_conservation_and_shares_follow_cell_area(tmp_path):
    subs = [A, B, {"id": "c", "name": "C", "lon": -70.4, "lat": -33.2, "substation": ""}]
    res = run(tmp_path, subs, left_only=False)
    total = sum(s["annual_gwh"] for s in res["substations"])
    assert total == pytest.approx(res["totalGWh"], rel=1e-6)
    area = sum(s["area_km2"] for s in res["substations"])
    for s in res["substations"]:
        assert s["share"] == pytest.approx(s["area_km2"] / area, abs=0.03)   # uniform raster


def test_cells_feature_collection(tmp_path):
    res = run(tmp_path, [A, B, T])
    feats = res["cells"]["features"]
    assert [f["properties"]["locationId"] for f in feats] == ["a", "b"]
    assert all(f["geometry"]["type"] in ("Polygon", "MultiPolygon") for f in feats)
    a = feats[0]["properties"]
    assert a["densityGWhKm2"] == pytest.approx(a["annualGWh"] / a["areaKm2"], rel=1e-3)


def test_far_from_seed_warning(tmp_path):
    lone = {"id": "z", "name": "Z", "lon": -70.01, "lat": -33.01, "substation": "distribution"}
    res = run(tmp_path, [lone], left_only=False)
    assert any(w["code"] == "FAR_FROM_SEED" for w in res["warnings"])


def test_area_without_pixels_warns(tmp_path):
    far_area = {"type": "Feature", "properties": {}, "geometry": mapping(box(10, 10, 11, 11))}
    res = de.estimate(far_area, [A], ec_path=ec_tif(tmp_path), model_year=2019,
                      country="CL", national_table={}, raster_totals={})
    assert res["totalGWh"] == 0.0
    assert any(w["code"] == "NO_PIXELS" for w in res["warnings"])


def test_override_without_pixels_follows_cell_area(tmp_path):
    far_area = {"type": "Feature", "properties": {}, "geometry": mapping(box(10, 10, 11, 11))}
    subs = [dict(A, lon=10.25, lat=10.5), dict(B, lon=10.75, lat=10.5)]
    res = de.estimate(far_area, subs, ec_path=ec_tif(tmp_path), model_year=2019,
                      country="CL", national_table={}, raster_totals={}, override_gwh=50.0)
    assert sum(s["annual_gwh"] for s in res["substations"]) == pytest.approx(50.0)
    assert by_id(res)["a"]["annual_gwh"] == pytest.approx(25.0, rel=1e-3)
    assert any(w["code"] == "AREA_SHARES" for w in res["warnings"])


def test_centre_of_area_across_antimeridian():
    lon, lat = de.area_centre(MultiPolygon([box(179.0, -1.0, 180.0, 1.0), box(-180.0, -1.0, -179.0, 1.0)]))
    assert abs(abs(lon) - 180.0) < 1e-6 and lat == pytest.approx(0.0, abs=1e-9)
    assert de.area_centre(box(-71, -34, -70, -33)) == pytest.approx((-70.5, -33.5))


def test_estimate_across_antimeridian(tmp_path):
    path = tmp_path / "world.tif"
    with rasterio.open(path, "w", driver="GTiff", height=360, width=720, count=1, dtype="float32",
                       crs="EPSG:4326", transform=from_origin(-180.0, 90.0, 0.5, 0.5), nodata=-1) as dst:
        dst.write(np.full((360, 720), 1e6, "float32"), 1)       # 1 GWh per pixel
    area = {"type": "Feature", "properties": {},
            "geometry": mapping(MultiPolygon([box(179.0, -1.0, 180.0, 1.0), box(-180.0, -1.0, -179.0, 1.0)]))}
    east = {"id": "e", "name": "E", "lon": 179.5, "lat": 0.0, "substation": "distribution"}
    west = {"id": "w", "name": "W", "lon": -179.5, "lat": 0.0, "substation": "distribution"}
    res = de.estimate(area, [east, west], ec_path=path, model_year=2019,
                      country="FJ", national_table={}, raster_totals={})
    s = by_id(res)
    assert res["chain"]["calibratedGWh"] == pytest.approx(16.0)
    assert s["e"]["annual_gwh"] == pytest.approx(8.0) and s["w"]["annual_gwh"] == pytest.approx(8.0)
    # cells drawn in a plane centred near 180°, not on the far side of the globe
    assert s["e"]["area_km2"] == pytest.approx(s["w"]["area_km2"], rel=1e-3)
    assert 0.9 * 111.32 * 221.1 < s["e"]["area_km2"] < 1.1 * 111.32 * 221.1


def test_invalid_area_is_repaired():
    bowtie = {"type": "Polygon", "coordinates": [[(0, 0), (2, 2), (2, 0), (0, 2), (0, 0)]]}
    geom = de.area_geometry(bowtie)
    assert geom.is_valid and geom.area == pytest.approx(2.0)


def test_duplicate_seed_location_warns(tmp_path):
    res = run(tmp_path, [A, dict(A, id="a2"), B])
    assert any(w["code"] == "DUPLICATE_SEED" for w in res["warnings"])
    assert not any(w["code"] == "DUPLICATE_SEED" for w in run(tmp_path, [A, B])["warnings"])


# --- Inc 2 Task 4: land-use mix per cell ---------------------------------------------------------
import demand_mix as dm  # noqa: E402

GLOBAL = {"h0_dyn": 50, "g0": 35, "g3": 10, "l0": 5}
WEST, EAST = box(-71.0, -34.0, -70.5, -33.0), box(-70.5, -34.0, -70.0, -33.0)
LANDUSE = {"residential": [WEST], "commercial": [EAST], "industrial": [], "farmland": []}


def test_landuse_mix_follows_class_energy(tmp_path):
    s = by_id(run(tmp_path, [A, B], landuse=LANDUSE))
    assert s["a"]["mix"] == {"h0_dyn": 100} and s["a"]["landuseCoverage"] == 1.0
    assert s["b"]["mix"] == dm.round_mix(GLOBAL) and s["b"]["landuseCoverage"] == 0.0


def test_landuse_industrial_substation_is_g3(tmp_path):
    s = by_id(run(tmp_path, [dict(A, substation="industrial"), B], landuse=LANDUSE))
    assert s["a"]["mix"] == {"g3": 100} and s["a"]["landuseCoverage"] == 1.0


def test_landuse_partial_coverage_blends_with_global(tmp_path):
    # residential covers the western quarter = half of A's energy -> 50 % h0_dyn + 50 % global
    quarter = {"residential": [box(-71.0, -34.0, -70.75, -33.0)]}
    s = by_id(run(tmp_path, [A, B], landuse=quarter))
    assert s["a"]["landuseCoverage"] == 0.5
    assert s["a"]["mix"] == dm.round_mix({"h0_dyn": 0.5 + 0.25, "g0": 0.175, "g3": 0.05, "l0": 0.025})


def test_no_landuse_uses_global_mix(tmp_path):
    res = run(tmp_path, [A, B, T])
    s = by_id(res)
    for k in ("a", "b"):
        assert s[k]["mix"] == dm.round_mix(GLOBAL) and s[k]["landuseCoverage"] == 0.0
    assert s["t"]["mix"] is None and s["t"]["landuseCoverage"] == 0.0
    assert not any("LANDUSE" in w["code"] for w in res["warnings"])
    s = by_id(run(tmp_path, [A, B], family="bdew25", global_mix={"h25": 100}))
    assert s["a"]["mix"] == {"h25": 100} and s["b"]["mix"] == {"h25": 100}


def test_landuse_bdew25_family(tmp_path):
    s = by_id(run(tmp_path, [A, B], landuse=LANDUSE, family="bdew25", global_mix={"h25": 100}))
    assert s["a"]["mix"] == {"h25": 100} and s["b"]["mix"] == {"h25": 100}


def test_cell_features_carry_mix(tmp_path):
    feats = run(tmp_path, [A, B], landuse=LANDUSE)["cells"]["features"]
    p = {f["properties"]["locationId"]: f["properties"] for f in feats}
    assert p["a"]["mix"] == {"h0_dyn": 100} and p["a"]["landuseCoverage"] == 1.0
    assert p["b"]["mix"] == dm.round_mix(GLOBAL) and p["b"]["landuseCoverage"] == 0.0


def test_landuse_in_projected_raster(tmp_path):
    # Mollweide raster: pixel centres and class polygons are projected into the raster CRS
    from pyproj import Transformer
    fwd = Transformer.from_crs("EPSG:4326", "ESRI:54009", always_xy=True)
    x0, y0 = fwd.transform(-71.0, -33.0)
    x1, y1 = fwd.transform(-70.0, -34.0)
    size = 1000.0
    ncols, nrows = int((x1 - x0) // size) + 2, int((y0 - y1) // size) + 2
    data = np.full((nrows, ncols), 1000.0, "float32")
    path = tmp_path / "moll.tif"
    with rasterio.open(path, "w", driver="GTiff", height=nrows, width=ncols, count=1, dtype="float32",
                       crs="ESRI:54009", transform=from_origin(x0 - size, y0 + size, size, size), nodata=-1) as dst:
        dst.write(data, 1)
    res = de.estimate(AREA, [A, B], ec_path=path, model_year=2019, country="CL", national_table={},
                      raster_totals={}, landuse={"residential": [box(-72.0, -35.0, -70.5, -32.0)],
                                                 "commercial": [box(-70.5, -35.0, -69.0, -32.0)]})
    s = by_id(res)
    assert s["a"]["mix"] == {"h0_dyn": 100} and s["b"]["mix"] == {"g0": 100}
    assert s["a"]["landuseCoverage"] >= 0.99 and s["b"]["landuseCoverage"] >= 0.99


def test_default_global_mix_follows_family(tmp_path):
    s = by_id(run(tmp_path, [A, B], family="bdew25"))
    assert s["a"]["mix"] == {"h25": 55, "g25": 40, "l25": 5}
    s = by_id(run(tmp_path, [A, B]))
    assert s["a"]["mix"] == GLOBAL


@pytest.mark.parametrize("family,mix", [("bdew25", {"h0_dyn": 100}), ("classic", {"h25": 50, "g0": 50}),
                                        ("classic", {"nope": 100})])
def test_global_mix_from_other_family_rejected(tmp_path, family, mix):
    with pytest.raises(ValueError):
        run(tmp_path, [A, B], family=family, global_mix=mix)


def test_flat_allowed_in_either_family(tmp_path):
    s = by_id(run(tmp_path, [A, B], family="bdew25", global_mix={"flat": 50, "h25": 50}))
    assert s["a"]["mix"] == {"flat": 50, "h25": 50}
    s = by_id(run(tmp_path, [A, B], global_mix={"flat": 100}))
    assert s["a"]["mix"] == {"flat": 100}


# --- Inc 7 Task 2: large consumers (mines) -------------------------------------------------------
import json  # noqa: E402

import demand_large as dlg  # noqa: E402

CAL = dict(raster_totals={"CL": 1.0}, national_table={"CL": {2019: 2.0}})       # factor 2: 20 GWh area
SHARE = {"CL": {2019: {"total_twh": 2.0, "mining_twh": 0.5, "nonferrous_twh": 0.0}}}   # 25 %: 500 GWh
MINE_AREA = {"CL": {"iso3": "CHL", "source": "osm", "osm_km2": 1000.0, "maus_capped_km2": 0.0}}
PIT_A = box(-70.80, -33.55, -70.70, -33.45)     # around A: 10 x 10 pixel centres inside
PIT_T = box(-70.52, -33.52, -70.48, -33.48)     # around the transmission substation T


def mines(tmp_path, subs, sites, **kw):
    opts = dict(left_only=False, large_consumers=True, mining_share=SHARE, mine_area=MINE_AREA, **CAL)
    opts.update(kw)
    return run(tmp_path, subs, mine_sites=sites, **opts)


def site(geom, name="pit", iso2="CL"):
    return {"geometry": geom, "iso2": iso2, "name": name}


def test_mines_lit_factor_pixel_removal_and_site_energy(tmp_path):
    res = mines(tmp_path, [A, B], [site(PIT_A, "Pit A")])
    (row,) = res["chain"]["countries"]
    assert row["rasterAreaTWh"] == pytest.approx(0.0099)        # 100 pixels inside the pit removed
    assert row["factor"] == 2.0 and row["litFactor"] == pytest.approx(0.75)
    assert row["miningTWh"] == pytest.approx(0.5) and row["mineKm2Country"] == 1000.0
    assert row["mineSource"] == "osm"
    a = by_id(res)["a"]
    (s,) = a["sites"]
    assert s["name"] == "Pit A" and 90 < s["km2"] < 115
    assert s["gwh"] == pytest.approx(500.0 * s["km2"] / 1000.0, rel=1e-4)
    assert row["mineKm2Area"] == pytest.approx(s["km2"], rel=1e-4)
    assert row["miningGWhArea"] == pytest.approx(s["gwh"], rel=1e-6)
    assert a["mining_gwh"] == pytest.approx(s["gwh"], rel=1e-6)
    c = res["chain"]
    assert c["litGWh"] == pytest.approx(9.9 * 2 * 0.75)
    assert c["miningGWh"] == pytest.approx(s["gwh"], rel=1e-6)
    assert c["litGWh"] + c["miningGWh"] == pytest.approx(c["totalGWh"])
    assert sum(r["annual_gwh"] for r in res["substations"]) == pytest.approx(res["totalGWh"], rel=1e-6)
    assert by_id(res)["b"]["mining_gwh"] == 0.0 and by_id(res)["b"]["sites"] == []


def test_mines_override_rescales_everything(tmp_path):
    base = mines(tmp_path, [A, B], [site(PIT_A)])
    res = mines(tmp_path, [A, B], [site(PIT_A)], override_gwh=100.0)
    k = 100.0 / base["totalGWh"]
    c = res["chain"]
    assert c["totalGWh"] == pytest.approx(100.0) and c["calibratedGWh"] == pytest.approx(base["totalGWh"])
    assert c["litGWh"] + c["miningGWh"] == pytest.approx(100.0)
    assert c["miningGWh"] == pytest.approx(base["chain"]["miningGWh"] * k)
    a, a0 = by_id(res)["a"], by_id(base)["a"]
    assert a["mining_gwh"] == pytest.approx(a0["mining_gwh"] * k, rel=1e-6)
    assert a["sites"][0]["gwh"] == pytest.approx(a0["sites"][0]["gwh"] * k, rel=1e-6)
    assert sum(r["annual_gwh"] for r in res["substations"]) == pytest.approx(100.0)


def test_mine_only_transmission_substation_becomes_seed(tmp_path):
    res = mines(tmp_path, [A, B, T], [site(PIT_T, "Pit T")])
    t = by_id(res)["t"]
    assert t["seed"] is True and t["mining_gwh"] > 0
    assert t["annual_gwh"] == pytest.approx(t["mining_gwh"])
    assert t["mix"] == {"g3": 100}
    assert t["share"] == pytest.approx(t["annual_gwh"] / res["totalGWh"])
    feats = [f for f in res["cells"]["features"] if f["properties"]["locationId"] == "t"]
    assert [f["properties"]["kind"] for f in feats] == ["mine"]
    p = feats[0]["properties"]
    assert p["annualGWh"] == pytest.approx(t["mining_gwh"])
    assert p["areaKm2"] == pytest.approx(t["sites"][0]["km2"], rel=1e-3)
    assert feats[0]["geometry"]["type"] in ("Polygon", "MultiPolygon")
    others = {f["properties"]["kind"] for f in res["cells"]["features"] if f["properties"]["locationId"] != "t"}
    assert others == {"lit"}


def test_mine_and_lit_substation_has_two_features_and_industrial_mix(tmp_path):
    res = mines(tmp_path, [A, B], [site(PIT_A)])
    a = by_id(res)["a"]
    lit = a["annual_gwh"] - a["mining_gwh"]
    mix = {k: v / 100.0 * lit for k, v in GLOBAL.items()}
    mix["g3"] += a["mining_gwh"]
    assert a["mix"] == dm.round_mix(mix) and a["mix"]["g3"] > 80
    feats = {f["properties"]["kind"]: f["properties"] for f in res["cells"]["features"]
             if f["properties"]["locationId"] == "a"}
    assert set(feats) == {"lit", "mine"}
    assert feats["lit"]["annualGWh"] == pytest.approx(lit, rel=1e-5)
    assert feats["mine"]["annualGWh"] == pytest.approx(a["mining_gwh"], rel=1e-5)
    for p in feats.values():
        assert p["densityGWhKm2"] == pytest.approx(p["annualGWh"] / p["areaKm2"], rel=1e-3)
    bd = by_id(mines(tmp_path, [A, B], [site(PIT_A)], family="bdew25", global_mix={"h25": 100}))["a"]
    assert set(bd["mix"]) == {"h25", "g25"} and bd["mix"]["g25"] > 80


def test_mine_site_split_at_the_border(tmp_path):
    share = dict(SHARE, AR={2019: {"total_twh": 3.0, "mining_twh": 0.3, "nonferrous_twh": 0.0}})   # 10 %
    area_tab = dict(MINE_AREA, AR={"iso3": "ARG", "source": "osm", "osm_km2": 500.0, "maus_capped_km2": 0.0})
    pit = box(-70.60, -33.55, -70.40, -33.45)          # half in CL (west of -70.5), half in AR
    res = mines(tmp_path, [A, B], [site(pit, "Border pit", iso2="CL")], area=TWO, country=None,
                mining_share=share, mine_area=area_tab, raster_totals={"CL": 1.0, "AR": 1.0},
                national_table={"CL": {2019: 2.0}, "AR": {2019: 3.0}})
    rows = {c["country"]: c for c in res["chain"]["countries"]}
    assert rows["AR"]["litFactor"] == pytest.approx(0.9) and rows["AR"]["miningTWh"] == pytest.approx(0.3)
    assert rows["CL"]["mineKm2Area"] == pytest.approx(rows["AR"]["mineKm2Area"], rel=1e-3)
    assert rows["CL"]["miningGWhArea"] == pytest.approx(500.0 * rows["CL"]["mineKm2Area"] / 1000.0, rel=1e-4)
    assert rows["AR"]["miningGWhArea"] == pytest.approx(300.0 * rows["AR"]["mineKm2Area"] / 500.0, rel=1e-4)
    s = by_id(res)
    assert s["a"]["mining_gwh"] == pytest.approx(rows["CL"]["miningGWhArea"], rel=1e-6)
    assert s["b"]["mining_gwh"] == pytest.approx(rows["AR"]["miningGWhArea"], rel=1e-6)
    assert [x["name"] for x in s["a"]["sites"]] == ["Border pit"] == [x["name"] for x in s["b"]["sites"]]


def test_maus_source_caps_the_site_key(tmp_path):
    maus = {"CL": {"iso3": "CHL", "source": "maus", "osm_km2": 0.0, "maus_capped_km2": 400.0}}
    res = mines(tmp_path, [A, B], [site(PIT_A)], mine_area=maus)       # ~103 km2 site counts as 50
    row = res["chain"]["countries"][0]
    assert row["mineSource"] == "maus" and row["mineKm2Country"] == 400.0
    assert row["mineKm2Area"] == pytest.approx(50.0)
    assert by_id(res)["a"]["mining_gwh"] == pytest.approx(500.0 * 50.0 / 400.0)


def test_site_outside_the_area_is_ignored_and_clipped(tmp_path):
    half_out = box(-71.10, -33.55, -70.90, -33.45)   # half west of the area
    res = mines(tmp_path, [A, B], [site(half_out), site(box(-69.0, -33.0, -68.9, -32.9), "outside")])
    (s,) = by_id(res)["a"]["sites"]
    assert 95 < s["km2"] < 110       # the half inside (~103 of ~206 km2)


def test_no_mining_share_keeps_old_behaviour(tmp_path):
    for kw in ({"mining_share": {}}, {"mine_area": {}}):
        res = mines(tmp_path, [A, B], [site(PIT_A)], **kw)
        assert [w["code"] for w in res["warnings"]].count("NO_MINING_SHARE") == 1
        row = res["chain"]["countries"][0]
        assert row["rasterAreaTWh"] == pytest.approx(0.010) and row["litFactor"] == 1.0
        assert row["miningGWhArea"] == 0.0
        assert res["totalGWh"] == pytest.approx(20.0) and res["chain"]["miningGWh"] == 0.0


def test_nonferrous_share_through_estimate(tmp_path):
    share = {"CL": {2019: {"total_twh": 2.0, "mining_twh": 0.0, "nonferrous_twh": 0.4}}}
    assert dlg.mining_share(share, "CL", 2019)["rule"] == "nonferrous"
    row = mines(tmp_path, [A, B], [site(PIT_A)], mining_share=share)["chain"]["countries"][0]
    assert row["litFactor"] == pytest.approx(0.8) and row["miningTWh"] == pytest.approx(0.4)


def test_far_mine_warning_through_estimate(tmp_path):
    lone = {"id": "z", "name": "Z", "lon": -70.01, "lat": -33.01, "substation": "distribution"}
    res = mines(tmp_path, [lone], [site(box(-70.99, -33.99, -70.95, -33.95), "Far pit")])
    assert any(w["code"] == "MINE_FAR_FROM_SUBSTATION" and "Far pit" in w["message"] for w in res["warnings"])
    assert by_id(res)["z"]["mining_gwh"] > 0


def test_large_consumers_without_sites_is_off(tmp_path):
    res = mines(tmp_path, [A, B], None)
    assert res["chain"]["countries"][0]["litFactor"] == 1.0 and res["totalGWh"] == pytest.approx(20.0)


def _strip_inc7(res):
    """The result without the Inc 7 keys, after checking they hold their neutral values."""
    res = json.loads(json.dumps(res))
    for r in res["substations"]:
        assert r.pop("mining_gwh") == 0.0 and r.pop("sites") == []
    for f in res["cells"]["features"]:
        assert f["properties"].pop("kind") == "lit"
    c = res["chain"]
    assert c.pop("miningGWh") == 0.0 and c.pop("litGWh") == pytest.approx(c["totalGWh"])
    for row in c["countries"]:
        assert {k: row.pop(k) for k in ("miningTWh", "litFactor", "mineKm2Country", "mineKm2Area",
                                        "miningGWhArea", "mineSource")} == {
            "miningTWh": 0.0, "litFactor": 1.0, "mineKm2Country": 0.0, "mineKm2Area": 0.0,
            "miningGWhArea": 0.0, "mineSource": None}
    return res


def test_large_consumers_off_equals_pre_inc7_output(tmp_path):
    # golden file written by the pre-Inc-7 estimate() on these same fixtures
    golden = json.loads((Path(__file__).parent / "data" / "demand_estimate_pre_inc7.json").read_text())
    cases = {
        "two_countries_landuse": run(tmp_path, [A, B, T], left_only=False, area=TWO, country=None, landuse=LANDUSE,
                                     raster_totals={"CL": 1.0, "AR": 1.0},
                                     national_table={"CL": {2019: 2.0}, "AR": {2019: 3.0}},
                                     large_consumers=False, mine_sites=[site(PIT_A)], mining_share=SHARE,
                                     mine_area=MINE_AREA),
        "left_override": run(tmp_path, [A, B, T], override_gwh=20.0),
    }
    for name, res in cases.items():
        assert _strip_inc7(res) == golden[name], name
