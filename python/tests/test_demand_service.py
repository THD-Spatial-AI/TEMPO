"""Tests for demand_service — the local FastAPI demand service (Inc 3, Task 1)."""
import importlib
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("fastapi")
rasterio = pytest.importorskip("rasterio")
pytest.importorskip("shapely")
from fastapi.testclient import TestClient  # noqa: E402
from rasterio.transform import from_origin  # noqa: E402
from shapely.geometry import box, mapping  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))

import demand_data  # noqa: E402
import demand_landuse  # noqa: E402
import demand_large  # noqa: E402
import demand_shapes  # noqa: E402

AREA = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "properties": {"countryCode": "CL"}, "geometry": mapping(box(-71.0, -34.0, -70.0, -33.0))}]}
A = {"id": "a", "name": "A", "lon": -70.75, "lat": -33.5, "substation": "distribution"}
B = {"id": "b", "name": "B", "lon": -70.25, "lat": -33.5, "substation": "distribution"}


def write_ec(path):
    data = np.zeros((100, 100))
    data[:, :50] = 1000.0                  # 5,000 pixels x 1,000 kWh = 5 GWh west of -70.5
    with rasterio.open(path, "w", driver="GTiff", height=100, width=100, count=1, dtype="float32",
                       crs="EPSG:4326", transform=from_origin(-71.0, -33.0, 0.01, 0.01), nodata=-1) as dst:
        dst.write(data.astype("float32"), 1)
    return path


@pytest.fixture
def svc(tmp_path, monkeypatch):
    monkeypatch.setenv("TEMPO_DEMAND_DATA", str(tmp_path))
    import demand_service
    mod = importlib.reload(demand_service)
    # small deterministic tables: CL raster total 10 GWh, national 20 GWh -> factor 2
    monkeypatch.setattr(mod, "_tables", lambda: ({"CL": {2019: 0.020}}, {"CL": 0.010}))
    # no network: the footprint download writes an empty file; the OSM mine query must be stubbed per test

    def fake_mines(cache_dir, src=None, progress=None):
        out = Path(cache_dir) / demand_data.MINE_FOOTPRINTS
        out.write_text("", encoding="utf-8")
        return out

    def no_osm(*a, **kw):
        raise AssertionError("fetch_osm_mine_sites must be stubbed")
    monkeypatch.setattr(demand_data, "ensure_mine_footprints", fake_mines)
    monkeypatch.setattr(demand_large, "fetch_osm_mine_sites", no_osm)
    return mod


@pytest.fixture
def client(svc):
    return TestClient(svc.app)


@pytest.fixture
def ready(svc, tmp_path):
    write_ec(tmp_path / "EC2019.tif")
    return svc


def body(**kw):
    b = {"area": AREA, "substations": [A, B], "modelYear": 2019, "country": "CL", "family": "classic",
         "globalMix": None, "maxKv": None, "overrideGwh": None, "landuse": False, "largeConsumers": False}
    b.update(kw)
    return b


def test_health_not_ready(client, tmp_path):
    r = client.get("/health")
    assert r.status_code == 200
    h = r.json()
    assert h["status"] == "ok" and h["engine"] == "demand"
    assert h["dataReady"] is False and h["dataDir"] == str(tmp_path)
    assert set(h["versions"]) == {"demandlib", "rasterio", "shapely"}


def test_estimate_409_when_not_ready(client):
    r = client.post("/estimate", json=body())
    assert r.status_code == 409 and r.json() == {"detail": "data not ready"}


def test_data_ensure_downloads_in_background(client, tmp_path, monkeypatch):
    def fake_ensure(year, cache_dir, src=None, progress=None):
        assert year == 2019 and Path(cache_dir) == tmp_path
        progress(50, 100)
        progress(100, 100)
        return write_ec(Path(cache_dir) / f"EC{year}.tif")
    monkeypatch.setattr(demand_data, "ensure_ec_raster", fake_ensure)
    assert client.get("/data/status").json()["state"] == "idle"
    r = client.post("/data/ensure")
    assert r.status_code == 200 and r.json()["state"] in ("downloading", "ready")
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        st = client.get("/data/status").json()
        if st["state"] == "ready":
            break
        time.sleep(0.02)
    while time.monotonic() < deadline and st["parts"]["mines"] == "downloading":
        st = client.get("/data/status").json()
        time.sleep(0.02)
    assert st == {"state": "ready", "done": 100, "total": 100, "error": None,
                  "parts": {"raster": "ready", "mines": "ready"}}
    assert client.get("/health").json()["dataReady"] is True


def test_data_ensure_reports_error(client, monkeypatch):
    def boom(year, cache_dir, src=None, progress=None):
        raise IOError("network down")
    monkeypatch.setattr(demand_data, "ensure_ec_raster", boom)
    client.post("/data/ensure")
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        st = client.get("/data/status").json()
        if st["state"] == "error":
            break
        time.sleep(0.02)
    assert st["state"] == "error" and "network down" in st["error"]


def test_estimate_on_synthetic_raster(ready, client):
    r = client.post("/estimate", json=body())
    assert r.status_code == 200
    res = r.json()
    s = {x["id"]: x for x in res["substations"]}
    assert s["a"]["annual_gwh"] == pytest.approx(10.0)    # 5 GWh raw x calibration factor 2
    assert s["b"]["annual_gwh"] == pytest.approx(0.0)
    assert res["chain"]["countries"][0]["factor"] == pytest.approx(2.0)
    assert res["latitude"] == pytest.approx(-33.5)
    assert res["southern"] is True and res["tropical"] is False


def test_estimate_landuse_failure_is_a_warning(ready, client, monkeypatch):
    def fail(*a, **kw):
        raise IOError("overpass down")
    monkeypatch.setattr(demand_landuse, "fetch_landuse", fail)
    r = client.post("/estimate", json=body(landuse=True))
    assert r.status_code == 200
    warn = [w for w in r.json()["warnings"] if w["code"] == "LANDUSE_UNAVAILABLE"]
    assert len(warn) == 1 and "overpass down" in warn[0]["message"]


def test_estimate_landuse_passes_bbox_and_data_dir(ready, client, monkeypatch, tmp_path):
    seen = {}

    def fetch(bbox, cache_dir, **kw):
        seen["bbox"], seen["dir"] = tuple(bbox), Path(cache_dir)
        return {"elements": []}
    monkeypatch.setattr(demand_landuse, "fetch_landuse", fetch)
    r = client.post("/estimate", json=body(landuse=True))
    assert r.status_code == 200
    assert seen["dir"] == tmp_path
    assert seen["bbox"] == pytest.approx((-71.0, -34.0, -70.0, -33.0))
    assert not any(w["code"] == "LANDUSE_UNAVAILABLE" for w in r.json()["warnings"])


def test_estimate_bad_mix_is_400(ready, client):
    r = client.post("/estimate", json=body(family="bdew25", globalMix={"h0_dyn": 100}))
    assert r.status_code == 400 and "bdew25" in r.json()["detail"]


def test_shape_scales_constant_series(client, monkeypatch):
    calls = []

    def const(start, end, resolution, sectors, country=None, family="classic", southern=False):
        calls.append((sectors, southern))
        return pd.Series(1.0, index=pd.date_range(start, periods=24, freq="60min"))
    monkeypatch.setattr(demand_shapes, "normalised_shape", const)
    subs = [{"id": "a", "avg_mw": 2.5, "mix": {"h0_dyn": 60, "g0": 40}},
            {"id": "b", "avg_mw": 1.0, "mix": {"g0": 40, "h0_dyn": 60}},
            {"id": "c", "avg_mw": 0.0, "mix": None}]
    r = client.post("/shape", json={"substations": subs, "start": "2019-01-01", "end": "2019-01-01",
                                    "resolution": "60min", "country": "CL", "family": "classic",
                                    "latitude": -33.5})
    assert r.status_code == 200
    res = r.json()
    assert res["series"]["a"] == [2.5] * 24 and res["series"]["b"] == [1.0] * 24
    assert res["series"]["c"] == [0.0] * 24
    assert res["unique_mixes"] == 1 and res["southern"] is True
    assert calls[0][1] is True


def test_shape_bad_resolution_is_400(client):
    r = client.post("/shape", json={"substations": [], "start": "2019-01-01", "end": "2019-01-01",
                                    "resolution": "7min", "country": None, "family": "classic", "latitude": 0})
    assert r.status_code == 400


def _no_overpass(monkeypatch):
    def boom(*a, **kw):
        raise AssertionError("fetch_landuse must not be called")
    monkeypatch.setattr(demand_landuse, "fetch_landuse", boom)


@pytest.mark.parametrize("geom", [box(-100.0, 0.0, 100.0, 0.1), box(-71.0, -34.0, -60.0, -24.0)],
                         ids=["lon_span_gt_180", "bbox_gt_50_deg2"])
def test_estimate_landuse_skipped_for_huge_area(ready, client, monkeypatch, geom):
    _no_overpass(monkeypatch)
    area = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"countryCode": "CL"}, "geometry": mapping(geom)}]}
    r = client.post("/estimate", json=body(area=area, landuse=True))
    assert r.status_code == 200
    warn = [w for w in r.json()["warnings"] if w["code"] == "LANDUSE_SKIPPED"]
    assert len(warn) == 1 and "too large" in warn[0]["message"]


def test_estimate_substation_missing_lon_is_422(ready, client):
    r = client.post("/estimate", json=body(substations=[{"id": "x", "lat": -33.5}]))
    assert r.status_code == 422


def test_estimate_internal_key_error_is_400(ready, client, monkeypatch):
    import demand_estimate

    def bad(*a, **kw):
        raise KeyError("lon")
    monkeypatch.setattr(demand_estimate, "estimate", bad)
    assert client.post("/estimate", json=body()).status_code == 400


def test_status_stale_ready_is_idle(svc):
    svc._download.update(state="ready")
    assert svc._status()["state"] == "idle"


def test_cors_origins(client):
    h = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    ok = client.options("/estimate", headers={**h, "Origin": "null"})
    assert ok.headers.get("access-control-allow-origin") == "null"
    bad = client.options("/estimate", headers={**h, "Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    assert "access-control-allow-origin" not in client.get("/health", headers={"Origin": "https://evil.example"}).headers


# --- Inc 7: footprint data part + large consumers ---------------------------------------------------
def _wait(client, pred):
    deadline = time.monotonic() + 2.0
    st = client.get("/data/status").json()
    while time.monotonic() < deadline and not pred(st):
        time.sleep(0.02)
        st = client.get("/data/status").json()
    return st


def test_status_parts_idle(client):
    st = client.get("/data/status").json()
    assert st["state"] == "idle" and st["parts"] == {"raster": "idle", "mines": "idle"}


def test_mines_failure_does_not_block_data_ready(ready, client, monkeypatch):
    def boom(cache_dir, src=None, progress=None):
        raise IOError("pangaea down")
    monkeypatch.setattr(demand_data, "ensure_mine_footprints", boom)
    monkeypatch.setattr(demand_data, "ensure_ec_raster", lambda *a, **kw: pytest.fail("raster is cached"))
    r = client.post("/data/ensure").json()
    assert r["state"] == "ready" and r["parts"]["raster"] == "ready"
    st = _wait(client, lambda s: s["parts"]["mines"] != "downloading")
    assert st["state"] == "ready" and st["error"] is None and st["parts"] == {"raster": "ready", "mines": "error"}
    assert client.get("/health").json()["dataReady"] is True


def test_ensure_with_everything_cached_starts_nothing(ready, client, tmp_path, monkeypatch):
    (tmp_path / demand_data.MINE_FOOTPRINTS).write_text("", encoding="utf-8")
    monkeypatch.setattr(demand_data, "ensure_mine_footprints", lambda *a, **kw: pytest.fail("cached"))
    assert client.post("/data/ensure").json()["parts"] == {"raster": "ready", "mines": "ready"}


MINE = box(-70.3, -33.6, -70.2, -33.4)       # east of B's location, in the dark half of the raster


def _osm(sites):
    def osm(bbox, cache_dir, fetch=None, today=None):
        osm.calls.append(tuple(bbox))
        return [dict(s) for s in sites]
    osm.calls = []
    return osm


def test_large_consumers_off_skips_mines(ready, client):
    res = client.post("/estimate", json=body(largeConsumers=False)).json()
    assert res["chain"]["miningGWh"] == 0
    assert not any(w["code"].startswith(("MINES", "NO_MINING")) for w in res["warnings"])


def test_large_consumers_places_osm_mine(ready, client, monkeypatch, tmp_path):
    fetch = _osm([{"geometry": MINE, "name": "Pit", "km2": 200.0}])
    monkeypatch.setattr(demand_large, "fetch_osm_mine_sites", fetch)
    res = client.post("/estimate", json=body(largeConsumers=True)).json()
    assert fetch.calls == [pytest.approx((-71.0, -34.0, -70.0, -33.0))]
    s = {x["id"]: x for x in res["substations"]}
    assert s["b"]["mining_gwh"] > 0 and s["b"]["sites"][0]["name"] == "Pit"
    assert res["chain"]["miningGWh"] == pytest.approx(s["b"]["mining_gwh"])
    assert res["chain"]["miningGWh"] + res["chain"]["litGWh"] == pytest.approx(
        sum(x["annual_gwh"] for x in res["substations"]))
    assert not any(w["code"].startswith("MINES") for w in res["warnings"])


def test_osm_failure_is_mines_unavailable(ready, client, monkeypatch):
    def fail(*a, **kw):
        raise IOError("overpass down")
    monkeypatch.setattr(demand_large, "fetch_osm_mine_sites", fail)
    res = client.post("/estimate", json=body(largeConsumers=True)).json()
    (w,) = [w for w in res["warnings"] if w["code"] == "MINES_UNAVAILABLE"]
    assert "CL" in w["message"] and "overpass down" in w["message"]
    assert res["chain"]["miningGWh"] == 0
    assert res["substations"][0]["annual_gwh"] == pytest.approx(10.0)       # no lit factor without sites
    assert not any(w["code"] == "NO_MINING_SHARE" for w in res["warnings"])


def test_huge_area_is_mines_skipped(ready, client, monkeypatch):
    area = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"countryCode": "CL"}, "geometry": mapping(box(-71.0, -34.0, -60.0, -24.0))}]}
    res = client.post("/estimate", json=body(area=area, largeConsumers=True)).json()   # stub fails if called
    (w,) = [w for w in res["warnings"] if w["code"] == "MINES_SKIPPED"]
    assert "CL" in w["message"] and "too large" in w["message"]
    assert res["chain"]["miningGWh"] == 0


def _two_countries(svc, monkeypatch):
    """CL (osm source) west half, PE (maus source) east half of the raster box."""
    monkeypatch.setattr(svc, "_tables", lambda: ({"CL": {2019: 0.010}, "PE": {2019: 0.010}},
                                                  {"CL": 0.005, "PE": 0.005}))
    share = {"CL": {2019: {"total_twh": 10.0, "mining_twh": 5.0, "nonferrous_twh": 0.0}},
             "PE": {2019: {"total_twh": 10.0, "mining_twh": 5.0, "nonferrous_twh": 0.0}}}
    area_tab = {"CL": {"iso3": "CHL", "source": "osm", "osm_km2": 1000.0, "maus_capped_km2": 0.0},
                "PE": {"iso3": "PER", "source": "maus", "osm_km2": 0.0, "maus_capped_km2": 1000.0}}
    monkeypatch.setattr(svc, "_mine_tables", lambda: (share, area_tab))
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"countryCode": "CL"}, "geometry": mapping(box(-71.0, -34.0, -70.5, -33.0))},
        {"type": "Feature", "properties": {"countryCode": "PE"}, "geometry": mapping(box(-70.5, -34.0, -70.0, -33.0))}]}


def _footprints(path, iso2, geom):
    import json
    feat = {"type": "Feature", "id": 1, "bbox": list(geom.bounds), "properties": {"iso2": iso2, "km2": 100.0},
            "geometry": mapping(geom)}
    path.write_text(json.dumps(feat) + "\n", encoding="utf-8")


def test_hybrid_osm_failure_keeps_maus_country(ready, client, monkeypatch, tmp_path):
    area = _two_countries(ready, monkeypatch)
    _footprints(tmp_path / demand_data.MINE_FOOTPRINTS, "PE", MINE)

    def fail(*a, **kw):
        raise IOError("overpass down")
    monkeypatch.setattr(demand_large, "fetch_osm_mine_sites", fail)
    res = client.post("/estimate", json=body(area=area, country=None, largeConsumers=True)).json()
    codes = [(w["code"], w["message"][:22]) for w in res["warnings"]
             if w["code"] in ("MINES_UNAVAILABLE", "MINES_SKIPPED", "NO_MINING_SHARE")]
    assert codes == [("MINES_UNAVAILABLE", "No mining split for CL")]     # CL's NO_MINING_SHARE is folded in
    rows = {r["country"]: r for r in res["chain"]["countries"]}
    assert rows["CL"]["miningTWh"] == 0 and rows["PE"]["miningTWh"] > 0
    assert res["chain"]["miningGWh"] > 0


def test_maus_country_without_footprints_is_unavailable(ready, client, monkeypatch, tmp_path):
    area = _two_countries(ready, monkeypatch)
    monkeypatch.setattr(demand_large, "fetch_osm_mine_sites", _osm([]))
    res = client.post("/estimate", json=body(area=area, country=None, largeConsumers=True)).json()
    (w,) = [w for w in res["warnings"] if w["code"] == "MINES_UNAVAILABLE"]
    assert "PE" in w["message"] and "not downloaded" in w["message"]
    rows = {r["country"]: r for r in res["chain"]["countries"]}
    assert rows["PE"]["miningTWh"] == 0 and rows["CL"]["miningTWh"] > 0
