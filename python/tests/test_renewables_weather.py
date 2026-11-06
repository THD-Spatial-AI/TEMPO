"""renewables_weather — Open-Meteo ERA5 fetch, alignment and cache (no network)."""
import gzip
import json
import sys
import threading
import types
from pathlib import Path

import pytest

pd = pytest.importorskip("pandas")
sys.path.insert(0, str(Path(__file__).parent.parent))

import renewables_weather as rw  # noqa: E402


def fake_payload(year, n_extra_front=1):
    """Hourly labels YYYY-01-01T00:00 … (YYYY+1)-01-01T23:00, like Open-Meteo returns."""
    t = pd.date_range(f"{year}-01-01T00:00", f"{year + 1}-01-01T23:00", freq="h")
    n = len(t)
    return {"hourly": {
        "time": [x.strftime("%Y-%m-%dT%H:%M") for x in t],
        "shortwave_radiation": [float(i) for i in range(n)],
        "direct_normal_irradiance": [0.0] * n,
        "diffuse_radiation": [0.0] * n,
        "temperature_2m": [20.0] * n,
        "wind_speed_10m": [None] + [2.0] * (n - 1),
    }}


class Resp:
    def __init__(self, status, body=None):
        self.status_code = status
        self._body = body

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_cell_of_snaps_to_quarter_degree():
    assert rw.cell_of(-33.44, -70.66) == (-33.5, -70.75)
    assert rw.cell_of(10.12, 20.13) == (10.0, 20.25)


def test_archive_params_request_one_extra_day_in_utc():
    p = rw.archive_params(-33.5, -70.75, 2023, rw.PV_VARS)
    assert p["start_date"] == "2023-01-01" and p["end_date"] == "2024-01-01"
    assert p["timezone"] == "GMT" and p["models"] == "era5"
    assert p["hourly"].split(",") == rw.PV_VARS


@pytest.mark.parametrize("year,n", [(2023, 8760), (2024, 8784)])
def test_pv_frame_keeps_preceding_hour_rows_and_midpoints(year, n):
    df = rw.pv_weather_frame(fake_payload(year), year)
    assert len(df) == n
    # Row labelled YYYY-01-01T01:00 (mean of 00:00–01:00) comes first, stamped at its midpoint.
    assert df.index[0] == pd.Timestamp(f"{year}-01-01T00:30", tz="UTC")
    assert df["ghi"].iloc[0] == 1.0
    assert df.index[-1] == pd.Timestamp(f"{year}-12-31T23:30", tz="UTC")
    assert list(df.columns) == ["ghi", "dni", "dhi", "temp_air", "wind_speed"]
    assert not df.isna().any().any()


def test_pv_frame_rejects_short_year():
    payload = fake_payload(2023)
    payload["hourly"] = {k: v[:100] for k, v in payload["hourly"].items()}
    with pytest.raises(ValueError, match="8760"):
        rw.pv_weather_frame(payload, 2023)


def test_fetch_cell_caches_on_disk(tmp_path):
    calls = []

    def http_get(url, params, timeout):
        calls.append(params)
        return Resp(200, fake_payload(2023))

    a = rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path, http_get=http_get, sleep=lambda s: None)
    b = rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path, http_get=http_get, sleep=lambda s: None)
    assert a == b and len(calls) == 1
    cached = list(tmp_path.glob("*.json.gz"))
    assert len(cached) == 1
    assert json.loads(gzip.decompress(cached[0].read_bytes())) == a


def test_fetch_cell_backs_off_on_429(tmp_path):
    seq = [Resp(429), Resp(429), Resp(200, fake_payload(2023))]
    waits, slept = [], []
    rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path,
                  http_get=lambda *a, **k: seq.pop(0), sleep=slept.append, on_wait=lambda: waits.append(1))
    assert len(waits) == 2 and slept.count(rw.RATE_LIMIT_WAIT_S) == 2


def test_fetch_cell_gives_up_after_retries(tmp_path):
    with pytest.raises(RuntimeError, match="rate limit"):
        rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path,
                      http_get=lambda *a, **k: Resp(429), sleep=lambda s: None)


def test_throttle_is_thread_safe(tmp_path, monkeypatch):
    sleeps = []
    monkeypatch.setattr(rw, "time", types.SimpleNamespace(monotonic=lambda: 100.0))
    monkeypatch.setattr(rw, "_last_request", [-1000.0])
    errors = []

    def go(lat):
        try:
            rw.fetch_cell(lat, -70.75, 2023, "pv", tmp_path,
                          http_get=lambda *a, **k: Resp(200, fake_payload(2023)), sleep=sleeps.append)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=go, args=(la,)) for la in (-33.5, -34.5)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors
    assert len(sleeps) == 1 and sleeps[0] == pytest.approx(rw.MIN_INTERVAL_S)


def test_corrupt_cache_is_refetched(tmp_path):
    (tmp_path / "pv_-33.50_-70.75_2023.json.gz").write_bytes(b"not gzip")
    calls = []

    def http_get(url, params, timeout):
        calls.append(1)
        return Resp(200, fake_payload(2023))

    rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path, http_get=http_get, sleep=lambda s: None)
    assert len(calls) == 1
    assert not list(tmp_path.glob("*.tmp"))
    rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path, http_get=http_get, sleep=lambda s: None)
    assert len(calls) == 1


def test_pv_frame_rejects_missing_radiation():
    payload = fake_payload(2023)
    for i in range(100, 160):
        payload["hourly"]["shortwave_radiation"][i] = None
    with pytest.raises(ValueError, match="incomplete"):
        rw.pv_weather_frame(payload, 2023)


def test_pv_frame_interpolates_short_gaps_and_zero_fills_rest():
    payload = fake_payload(2023)
    for i in (100, 101):
        payload["hourly"]["shortwave_radiation"][i] = None
    df = rw.pv_weather_frame(payload, 2023)
    assert df["ghi"].iloc[99] == pytest.approx(100.0)   # first kept row is label 01:00 = index 1
    assert not df.isna().any().any()


def test_no_sleep_after_final_429(tmp_path):
    slept = []
    with pytest.raises(RuntimeError, match="rate limit"):
        rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path,
                      http_get=lambda *a, **k: Resp(429), sleep=slept.append)
    assert slept.count(rw.RATE_LIMIT_WAIT_S) == rw.MAX_RETRIES


def test_error_reason_is_surfaced(tmp_path):
    with pytest.raises(RuntimeError, match="Open-Meteo: Daily API request limit exceeded"):
        rw.fetch_cell(-33.5, -70.75, 2023, "pv", tmp_path, sleep=lambda s: None,
                      http_get=lambda *a, **k: Resp(400, {"error": True, "reason": "Daily API request limit exceeded"}))


def test_negative_zero_cache_key(tmp_path):
    rw.fetch_cell(-0.0, 0.0, 2023, "pv", tmp_path, sleep=lambda s: None,
                  http_get=lambda *a, **k: Resp(200, fake_payload(2023)))
    assert (tmp_path / "pv_0.00_0.00_2023.json.gz").exists()


def test_long_temperature_gap_is_not_zero_filled():
    payload = fake_payload(2023)
    for i in range(200, 210):
        payload["hourly"]["temperature_2m"][i] = None
    df = rw.pv_weather_frame(payload, 2023)
    assert (df["temp_air"] == 20.0).all()
