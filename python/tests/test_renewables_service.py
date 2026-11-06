"""renewables_service — /health, POST /pv job, GET /jobs/{id} (weather faked)."""
import importlib
import sys
import time
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("pvlib")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent.parent))
from test_renewables_weather import fake_payload  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TEMPO_WEATHER_CACHE", str(tmp_path))
    import renewables_service
    mod = importlib.reload(renewables_service)
    fetched = []

    def fake_fetch(lat, lon, year, kind, cache_dir, on_wait=None):
        fetched.append((lat, lon))
        return fake_payload(year)

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
