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
         "globalMix": None, "maxKv": None, "overrideGwh": None, "landuse": False}
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
    assert st == {"state": "ready", "done": 100, "total": 100, "error": None}
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
