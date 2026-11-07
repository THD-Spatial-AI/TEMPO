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


def test_atlas_countries(client, monkeypatch):
    import renewables_atlas
    monkeypatch.setattr(renewables_atlas, "countries", lambda *a, **k: ["Chile", "Germany"])
    assert client.get("/atlas/countries").json() == {"countries": ["Chile", "Germany"]}


def test_atlas_status_and_ensure_job(client, monkeypatch):
    import renewables_atlas
    import renewables_service as mod

    def fake_ensure(layer, country, cache_dir, http_get=None, on_progress=None):
        p = renewables_atlas.layer_path(layer, country, cache_dir)
        p.parent.mkdir(parents=True, exist_ok=True)
        on_progress(50, 100)
        p.write_bytes(b"x")
        on_progress(100, 100)
        return p

    monkeypatch.setattr(renewables_atlas, "ensure", fake_ensure)
    q = "/atlas/status?layer=pvout&country=Chile"
    assert client.get(q).json() == {"ready": False}
    job = client.post("/atlas/ensure", json={"layer": "pvout", "country": "Chile"}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "done", body
    assert body["done"] == body["total"] == 100
    assert client.get(q).json() == {"ready": True}
    assert mod._jobs[job["job_id"]]["message"] is None


def test_atlas_ensure_error_is_reported(client, monkeypatch):
    import renewables_atlas

    def boom(*a, **k):
        raise ValueError("no ISO3 code for 'X'")

    monkeypatch.setattr(renewables_atlas, "ensure", boom)
    job = client.post("/atlas/ensure", json={"layer": "wind100", "country": "Chile"}).json()
    body = wait_job(client, job["job_id"])
    assert body["state"] == "error" and "ISO3" in body["error"]


IMG = "/atlas/image?layer=pvout&country=Chile&west=-75&south=-40&east=-60&north=-25&width=200"


def test_atlas_image_ok_with_bounds_and_cors_expose(client, monkeypatch):
    import renewables_atlas
    monkeypatch.setattr(renewables_atlas, "render", lambda *a, **k: (_fake_png(), (-72.0, -34.0, -68.0, -30.0)))
    r = client.get(IMG, headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert [float(x) for x in r.headers["x-bounds"].split(",")] == [-72.0, -34.0, -68.0, -30.0]
    assert "X-Bounds" in r.headers["access-control-expose-headers"]


def test_atlas_image_errors(client, monkeypatch):
    import renewables_atlas
    assert client.get(IMG).status_code == 409                     # not downloaded
    assert client.get(IMG.replace("layer=pvout", "layer=nope")).status_code == 422

    def outside(*a, **k):
        raise ValueError("bounds outside the raster")

    monkeypatch.setattr(renewables_atlas, "render", outside)
    assert client.get(IMG).status_code == 404


def test_atlas_503_without_rasterio(client, monkeypatch):
    monkeypatch.setitem(sys.modules, "rasterio", None)
    r = client.get(IMG)
    assert r.status_code == 503 and "Renewables" in r.json()["detail"]
    assert client.get("/health").status_code == 200


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


@pytest.fixture(autouse=True)
def _known_countries(request, monkeypatch):
    if request.node.name.startswith("test_atlas") or "country" in request.node.name:
        try:
            import renewables_atlas
        except ImportError:
            return
        monkeypatch.setattr(renewables_atlas, "countries", lambda *a, **k: ["Chile", "Germany"])


def test_atlas_endpoints_reject_unknown_country(client):
    assert client.post("/atlas/ensure", json={"layer": "pvout", "country": "Narnia"}).status_code == 400
    assert client.post("/atlas/ensure", json={"layer": "pvout", "country": "../../etc"}).status_code == 400


def test_atlas_image_and_wind_grid_validate_bounds(client):
    assert client.get(IMG.replace("south=-40", "south=nan")).status_code == 422
    assert client.get(IMG.replace("south=-40", "south=95")).status_code == 422
    assert client.get(IMG.replace("south=-40&", "south=-20&").replace("north=-25", "north=-30")).status_code == 400
    day = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    assert client.get(f"/wind-grid?south=-30&west=-74&north=-37&east=-68&date={day}&n=6").status_code == 400
    assert client.get(f"/wind-grid?south=nan&west=-74&north=-30&east=-68&date={day}&n=6").status_code == 422


def test_atlas_status_and_image_work_offline_for_cached_raster(client, monkeypatch):
    import renewables_atlas
    import renewables_service as mod

    def down(*a, **k):
        raise OSError("network down")

    monkeypatch.setattr(renewables_atlas, "countries", down)
    p = renewables_atlas.layer_path("pvout", "Chile", mod.CACHE_DIR)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x")
    def render(layer, country, cache_dir, **k):
        if not renewables_atlas.layer_path(layer, country, cache_dir).exists():
            raise FileNotFoundError(country)
        return _fake_png(), (-72.0, -34.0, -68.0, -30.0)

    monkeypatch.setattr(renewables_atlas, "render", render)
    assert client.get("/atlas/status?layer=pvout&country=Chile").json() == {"ready": True}
    assert client.get(IMG).status_code == 200
    assert client.get("/atlas/status?layer=pvout&country=Germany").json() == {"ready": False}
    assert client.get(IMG.replace("country=Chile", "country=Germany")).status_code == 409


def test_atlas_dots_only_country_is_400_from_status_and_image(client, monkeypatch):
    import renewables_atlas
    monkeypatch.setattr(renewables_atlas, "countries", lambda *a, **k: [".."])
    assert client.get("/atlas/status?layer=pvout&country=..").status_code == 400
    assert client.get(IMG.replace("country=Chile", "country=..")).status_code == 400


def test_wind_grid_upstream_http_error_is_502(client, monkeypatch):
    import requests
    import renewables_service as mod

    def boom(params, **kw):
        raise requests.HTTPError("414 URI Too Long")

    monkeypatch.setattr(mod.renewables_weather, "request_json", boom)
    day = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    assert client.get(f"/wind-grid?south=-37&west=-74&north=-30&east=-68&date={day}&n=6").status_code == 502
