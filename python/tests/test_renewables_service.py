"""renewables_service — /health, POST /pv job, GET /jobs/{id} (weather faked)."""
import datetime as dt
import importlib
import sys
import time
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("pvlib")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))
from test_renewables_weather import fake_payload, fake_wind_payload  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TEMPO_WEATHER_CACHE", str(tmp_path))
    import renewables_service
    mod = importlib.reload(renewables_service)
    fetched = []

    def fake_fetch(lat, lon, year, kind, cache_dir, on_wait=None):
        fetched.append((lat, lon))
        return fake_wind_payload(year) if kind == "wind" else fake_payload(year)

    monkeypatch.setattr(mod.renewables_weather, "fetch_cell", fake_fetch)
    c = TestClient(mod.app)
    c.fetched = fetched
    return c


def wait_job(client, job_id):
    for _ in range(200):
        body = client.get(f"/jobs/{job_id}").json()
        if body["state"] in ("done", "error"):
            return body
        time.sleep(0.05)
    raise AssertionError("job did not finish")


POINT = {"id": "santiago", "lat": -33.45, "lon": -70.66, "tilt": 28, "azimuth": 0}


def test_health_reports_engine_identity(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["engine"] == "renewables"


def test_pv_job_returns_cf_per_point_and_dedupes_cells(client):
    near = {**POINT, "id": "near", "lat": -33.40}          # same 0.25° cell as santiago
    far = {**POINT, "id": "far", "lat": -20.2, "lon": -70.1}
    job = client.post("/pv", json={"points": [POINT, near, far], "year": 2023}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "done", body
    assert set(body["result"]) == {"santiago", "near", "far"}
    r = body["result"]["santiago"]
    assert len(r["cf"]) == 8760
    assert r["mean_cf"] == pytest.approx(sum(r["cf"]) / 8760, abs=1e-3)
    assert r["annual_kwh_per_kwp"] == pytest.approx(sum(r["cf"]), rel=1e-3)
    assert len(client.fetched) == 2
    assert body["done"] == body["total"] == 2


def test_pv_rejects_future_year(client):
    assert client.post("/pv", json={"points": [POINT], "year": 2999}).status_code == 400


def test_pv_rejects_bad_tilt(client):
    assert client.post("/pv", json={"points": [{**POINT, "tilt": 120}], "year": 2023}).status_code == 422


def test_unknown_job_404(client):
    assert client.get("/jobs/nope").status_code == 404


def test_fetch_error_marks_job_failed(client, monkeypatch):
    import renewables_service as mod

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(mod.renewables_weather, "fetch_cell", boom)
    job = client.post("/pv", json={"points": [POINT], "year": 2023}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "error" and "network down" in body["error"]


def test_old_finished_jobs_are_evicted(client):
    import renewables_service as mod
    mod._jobs.clear()
    for i in range(mod.MAX_JOBS):
        mod._jobs[f"old{i}"] = {"state": "done", "done": 0, "total": 0, "message": None,
                                "error": None, "result": None}
    job = client.post("/pv", json={"points": [POINT], "year": 2023}).json()
    assert len(mod._jobs) <= mod.MAX_JOBS
    assert "old0" not in mod._jobs and job["job_id"] in mod._jobs
    wait_job(client, job["job_id"])


def test_optimise_job_returns_orientation_per_point(client):
    north = {**POINT, "id": "north", "lat": 48.85, "lon": 2.35, "azimuth": 180}
    job = client.post("/optimise-orientation", json={"points": [POINT, north], "year": 2023, "period": "year"}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "done", body
    for pid in ("santiago", "north"):
        r = body["result"][pid]
        assert set(r) == {"tilt", "azimuth", "gain_pct"}
        assert 0 <= r["tilt"] <= 90 and 0 <= r["azimuth"] < 360


def test_optimise_rejects_bad_custom_months(client):
    for months in ([], [13], [0]):
        r = client.post("/optimise-orientation",
                        json={"points": [POINT], "year": 2023, "period": "custom", "months": months})
        assert r.status_code == 422, months


def test_optimise_rejects_unknown_period(client):
    r = client.post("/optimise-orientation", json={"points": [POINT], "year": 2023, "period": "spring"})
    assert r.status_code == 422


def test_run_cells_reports_point_progress(client):
    import renewables_service as mod
    from renewables_service import PvPoint
    seen = []
    mod._jobs["j"] = {"state": "running", "done": 0, "total": 0, "message": None, "error": None, "result": None}

    def per_point(weather, p):
        seen.append(mod._jobs["j"]["message"])
        return {}

    pts = [PvPoint(**POINT), PvPoint(**{**POINT, "id": "b", "lat": -33.40})]
    mod._run_cells("j", pts, 2023, per_point)
    assert mod._jobs["j"]["state"] == "done"
    assert seen == ["Weather 1/1", "Point 1/2"]
    assert mod._jobs["j"]["message"] is None


WPOINT = {"id": "patagonia", "lat": -45.3, "lon": -72.1}


def test_turbines_lists_generic_first(client):
    ts = client.get("/turbines").json()["turbines"]
    assert ts[0]["id"] == "generic_iec1" and ts[0]["generic"] is True


def test_wind_job_returns_cf(client):
    job = client.post("/wind", json={"points": [WPOINT], "year": 2023, "turbine": "generic_iec2",
                                     "hub_height": 100, "loss": 0.12}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "done", body
    r = body["result"]["patagonia"]
    assert len(r["cf"]) == 8760 and 0 < r["mean_cf"] < 1
    assert r["mean_speed_hub"] > 0 and r["full_load_hours"] == pytest.approx(sum(r["cf"]), rel=1e-3)


def test_wind_rejects_unknown_turbine(client):
    job = client.post("/wind", json={"points": [WPOINT], "year": 2023, "turbine": "nope"}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "error" and "unknown turbine" in body["error"]


def test_best_point_returns_site_per_point(client):
    job = client.post("/best-wind-point", json={"points": [WPOINT], "year": 2023, "turbine": "generic_iec2",
                                                "hub_height": 100, "loss": 0.12, "radius_km": 25}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "done", body
    r = body["result"]["patagonia"]
    assert set(r) == {"lat", "lon", "mean_cf", "gain_pct", "distance_km", "moved"}
    # fake weather is identical everywhere -> own cell wins -> no move, location coordinates kept
    assert r["moved"] is False and (r["lat"], r["lon"]) == (-45.3, -72.1) and r["gain_pct"] == 0.0


def test_best_point_moves_to_a_strictly_better_cell(client, monkeypatch):
    import renewables_service as mod
    own = mod.renewables_weather.cell_of(WPOINT["lat"], WPOINT["lon"])
    base_fetch = mod.renewables_weather.fetch_cell

    def windy_elsewhere(lat, lon, year, kind, cache_dir, on_wait=None):
        return fake_wind_payload(year, v10=6.0, v100=8.0 if (lat, lon) == own else 10.0)

    monkeypatch.setattr(mod.renewables_weather, "fetch_cell", windy_elsewhere)
    job = client.post("/best-wind-point", json={"points": [WPOINT], "year": 2023, "radius_km": 25}).json()
    r = wait_job(client, job["job_id"])["result"]["patagonia"]
    assert r["moved"] is True and (r["lat"], r["lon"]) != own and r["gain_pct"] > 0 and 0 < r["distance_km"] <= 25
    assert base_fetch is not None


def test_best_point_radius_bounds(client):
    r = client.post("/best-wind-point", json={"points": [WPOINT], "year": 2023, "radius_km": 500})
    assert r.status_code == 422


def _post_best(client, **extra):
    job = client.post("/best-wind-point", json={"points": [WPOINT], "year": 2023, "radius_km": 25, **extra}).json()
    return wait_job(client, job["job_id"])


def test_best_point_gain_is_none_when_own_cell_scores_zero(client, monkeypatch):
    import renewables_service as mod
    own = mod.renewables_weather.cell_of(WPOINT["lat"], WPOINT["lon"])

    def becalmed_own(lat, lon, year, kind, cache_dir, on_wait=None):
        calm = (lat, lon) == own
        return fake_wind_payload(year, v10=0.0 if calm else 6.0, v100=0.0 if calm else 10.0)

    monkeypatch.setattr(mod.renewables_weather, "fetch_cell", becalmed_own)
    r = _post_best(client)["result"]["patagonia"]
    assert r["moved"] is True and r["gain_pct"] is None and r["mean_cf"] > 0


def test_best_point_skips_failing_non_own_cell(client, monkeypatch):
    import renewables_service as mod
    own = mod.renewables_weather.cell_of(WPOINT["lat"], WPOINT["lon"])
    import renewables_wind
    cells = renewables_wind.candidate_cells(WPOINT["lat"], WPOINT["lon"], 25)
    assert cells[0] == own and len(cells) >= 3
    broken = cells[1]

    def flaky(lat, lon, year, kind, cache_dir, on_wait=None):
        if (lat, lon) == broken:
            raise RuntimeError("Open-Meteo: boom")
        return fake_wind_payload(year, v100=8.0 if (lat, lon) == own else 10.0)

    monkeypatch.setattr(mod.renewables_weather, "fetch_cell", flaky)
    body = _post_best(client)
    assert body["state"] == "done", body
    r = body["result"]["patagonia"]
    assert r["moved"] is True and (r["lat"], r["lon"]) != broken


def test_best_point_fails_when_own_cell_fails(client, monkeypatch):
    import renewables_service as mod
    own = mod.renewables_weather.cell_of(WPOINT["lat"], WPOINT["lon"])

    def own_broken(lat, lon, year, kind, cache_dir, on_wait=None):
        if (lat, lon) == own:
            raise RuntimeError("Open-Meteo: boom")
        return fake_wind_payload(year)

    monkeypatch.setattr(mod.renewables_weather, "fetch_cell", own_broken)
    body = _post_best(client)
    assert body["state"] == "error" and "boom" in body["error"]


def test_wind_endpoints_503_without_windpowerlib(client, monkeypatch):
    monkeypatch.setitem(sys.modules, "windpowerlib", None)
    r = client.get("/turbines")
    assert r.status_code == 503 and "windpowerlib" in r.json()["detail"]
    assert client.get("/health").status_code == 200


def _fake_png():
    return b"\x89PNG\r\n\x1a\n" + b"0" * 16


VIEW = "/atlas/view?layer=pvout&south=-36&west=-74&north=-30&east=-64&width=200"


def test_atlas_view_ok_with_headers_and_cors_expose(client, monkeypatch):
    import renewables_atlas
    seen = {}

    def render_view(layer, **kw):
        seen.update(kw, layer=layer)
        return _fake_png(), (-74.0, -36.0, -64.0, -30.0), ["Chile", "Argentina"], ["Peru"]

    monkeypatch.setattr(renewables_atlas, "render_view", render_view)
    r = client.get(VIEW, headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert seen == {"layer": "pvout", "south": -36, "west": -74, "north": -30, "east": -64, "width": 200}
    assert [float(x) for x in r.headers["x-bounds"].split(",")] == [-74.0, -36.0, -64.0, -30.0]
    assert r.headers["x-countries"] == "Chile,Argentina" and r.headers["x-skipped"] == "Peru"
    exposed = r.headers["access-control-expose-headers"]
    assert all(h in exposed for h in ("X-Bounds", "X-Countries", "X-Skipped"))


def test_atlas_view_names_are_percent_encoded_and_round_trip(client, monkeypatch):
    from urllib.parse import unquote
    import renewables_atlas
    names = ["Saint Helena, Ascension and Tristan da Cunha", "Cote d Ivoire"]
    monkeypatch.setattr(renewables_atlas, "render_view",
                        lambda *a, **k: (_fake_png(), (-74.0, -36.0, -64.0, -30.0), names, ["New Caledonia (FR)"]))
    r = client.get(VIEW)
    assert [unquote(x) for x in r.headers["x-countries"].split(",")] == names
    assert [unquote(x) for x in r.headers["x-skipped"].split(",")] == ["New Caledonia (FR)"]


def test_atlas_view_204_without_data(client, monkeypatch):
    import renewables_atlas
    monkeypatch.setattr(renewables_atlas, "render_view",
                        lambda *a, **k: (None, (-140.0, -50.0, -130.0, -45.0), [], ["Narnia"]))
    r = client.get(VIEW)
    assert r.status_code == 204 and r.content == b"" and r.headers["x-skipped"] == "Narnia"
    assert r.headers["x-countries"] == ""


def test_atlas_view_stitches_local_rasters(client, monkeypatch, tmp_path):
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin
    import renewables_atlas
    paths = {}
    for code, value, west in (("CHL", 1200.0, -74.0), ("ARG", 2000.0, -69.0)):
        path = tmp_path / f"{code}.tif"
        with rasterio.open(path, "w", driver="GTiff", height=60, width=50, count=1, dtype="float32",
                           crs="EPSG:4326", transform=from_origin(west, -30.0, 0.1, 0.1), nodata=-9999.0) as dst:
            dst.write(np.full((60, 50), value, dtype="float32"), 1)
        paths[code] = str(path)
    monkeypatch.setattr(renewables_atlas, "dataset_path", lambda layer, code: paths[code])
    monkeypatch.setattr(renewables_atlas, "country_name", {"CHL": "Chile", "ARG": "Argentina"}.get)
    monkeypatch.setattr(renewables_atlas, "countries_in_view", lambda *a, **k: ["ARG", "CHL"])
    try:
        r = client.get(VIEW)
        assert r.status_code == 200 and r.headers["x-countries"] == "Argentina,Chile"
        with rasterio.io.MemoryFile(r.content) as mem, mem.open() as img:
            assert (img.width, img.height) == (200, 120)
    finally:
        for ds in renewables_atlas._handles.values():
            ds.close()
        renewables_atlas._handles.clear()


def test_atlas_view_validates_bounds_and_layer(client):
    assert client.get(VIEW.replace("layer=pvout", "layer=ghi")).status_code == 422
    assert client.get(VIEW.replace("south=-36", "south=nan")).status_code == 422
    assert client.get(VIEW.replace("south=-36", "south=95")).status_code == 422
    assert client.get(VIEW.replace("south=-36", "south=-20")).status_code == 400
    assert client.get(VIEW.replace("west=-74", "west=-60")).status_code == 400


def test_download_endpoints_are_gone(client):
    assert client.get("/atlas/countries").status_code == 404
    assert client.get("/atlas/status?layer=pvout&country=Chile").status_code == 404
    assert client.post("/atlas/ensure", json={"layer": "pvout", "country": "Chile"}).status_code == 404
    assert client.get("/atlas/image?layer=pvout&country=Chile&west=-75&south=-40&east=-60&north=-25").status_code == 404


def test_atlas_503_without_rasterio(client, monkeypatch):
    monkeypatch.setitem(sys.modules, "rasterio", None)
    r = client.get(VIEW)
    assert r.status_code == 503 and "Renewables" in r.json()["detail"]
    assert client.get("/health").status_code == 200


def test_wind_grid_validates_bounds(client):
    day = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    assert client.get(f"/wind-grid?south=-30&west=-74&north=-37&east=-68&date={day}&n=6").status_code == 400
    assert client.get(f"/wind-grid?south=nan&west=-74&north=-30&east=-68&date={day}&n=6").status_code == 422


def test_wind_grid_endpoint(client, monkeypatch):
    import renewables_grid
    import renewables_service as mod

    def fake_request_json(params, **kw):
        lats = [float(x) for x in params["latitude"].split(",")]
        return [{"hourly": {"wind_speed_100m": [10.0] * 24, "wind_direction_100m": [270.0] * 24}} for _ in lats]

    monkeypatch.setattr(mod.renewables_weather, "request_json", fake_request_json)
    day = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    q = f"/wind-grid?south=-37&west=-74&north=-30&east=-68&date={day}&n=6"
    body = client.get(q).json()
    assert len(body["u"]) == 24 and len(body["u"][0]) == 6 and len(body["u"][0][0]) == 6
    assert client.get(q.replace(day, "2999-01-01")).status_code == 400
    assert renewables_grid.N_MIN == 6


def test_wind_grid_upstream_http_error_is_502(client, monkeypatch):
    import requests
    import renewables_service as mod

    def boom(params, **kw):
        raise requests.HTTPError("414 URI Too Long")

    monkeypatch.setattr(mod.renewables_weather, "request_json", boom)
    day = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    assert client.get(f"/wind-grid?south=-37&west=-74&north=-30&east=-68&date={day}&n=6").status_code == 502
