"""
renewables_weather.py — hourly ERA5 weather from the Open-Meteo archive API.

One request per ERA5 cell (0.25°) and year, cached gzip-JSON on disk, so points
sharing a cell share a download and a re-run only fetches what is missing.
Radiation in Open-Meteo is the mean of the PRECEDING hour: the row labelled
01:00 covers 00:00–01:00 (R5 in the Increment 2 plan).
Weather data: Open-Meteo.com (ERA5, CC BY 4.0).
"""
import calendar
import gzip
import json
import os
import threading
import time
import zlib
from pathlib import Path

import pandas as pd

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
PV_VARS = ["shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation",
           "temperature_2m", "wind_speed_10m"]
WIND_VARS = ["wind_speed_10m", "wind_speed_100m", "temperature_2m", "surface_pressure"]
VARS = {"pv": PV_VARS, "wind": WIND_VARS}
MIN_INTERVAL_S = 2.6      # one year ≈ 26 weighted calls; keeps < 600 calls/min
RATE_LIMIT_WAIT_S = 60
MAX_RETRIES = 5

_last_request = [0.0]
_throttle_lock = threading.Lock()
MAX_MISSING_RADIATION_H = 24


def cell_of(lat, lon):
    """ERA5 cell centre (0.25° grid) a point falls in."""
    return (round(lat * 4) / 4, round(lon * 4) / 4)


def archive_params(lat, lon, year, variables):
    return {
        "latitude": lat, "longitude": lon,
        "start_date": f"{year}-01-01", "end_date": f"{year + 1}-01-01",
        "hourly": ",".join(variables), "timezone": "GMT", "models": "era5",
        "wind_speed_unit": "ms",
    }


def _hours(year):
    return 8784 if calendar.isleap(year) else 8760


def pv_weather_frame(payload, year):
    """Open-Meteo payload → pvlib weather (ghi, dni, dhi, temp_air, wind_speed),
    one row per hour of `year`, indexed at interval midpoints (UTC)."""
    h = payload["hourly"]
    df = pd.DataFrame({
        "ghi": h["shortwave_radiation"], "dni": h["direct_normal_irradiance"],
        "dhi": h["diffuse_radiation"], "temp_air": h["temperature_2m"],
        "wind_speed": h["wind_speed_10m"],
    }, index=pd.to_datetime(h["time"], utc=True), dtype=float)
    df = df.loc[pd.Timestamp(f"{year}-01-01T01:00", tz="UTC"):pd.Timestamp(f"{year + 1}-01-01T00:00", tz="UTC")]
    n = _hours(year)
    if len(df) != n:
        raise ValueError(f"weather for {year} has {len(df)} hours, expected {n} (8760/8784)")
    missing = int(df[["ghi", "dni", "dhi"]].isna().sum().max())
    if missing > MAX_MISSING_RADIATION_H:
        raise ValueError(f"weather for {year} is incomplete ({missing} hours missing) — pick an earlier year")
    df.index = df.index - pd.Timedelta(minutes=30)
    df = df.interpolate(limit=3, limit_direction="both")
    df[["temp_air", "wind_speed"]] = df[["temp_air", "wind_speed"]].ffill().bfill()
    return df.fillna(0.0)


def wind_weather_frame(payload, year):
    """Open-Meteo payload → hourly interval means (v10, v100 m/s; t2m °C; sp hPa),
    one row per hour of `year` at interval midpoints (UTC). Wind is instantaneous
    at the label, so interval i = mean of labels i and i+1 (W3)."""
    h = payload["hourly"]
    df = pd.DataFrame({
        "v10": h["wind_speed_10m"], "v100": h["wind_speed_100m"],
        "t2m": h["temperature_2m"], "sp": h["surface_pressure"],
    }, index=pd.to_datetime(h["time"], utc=True), dtype=float)
    df = df.loc[pd.Timestamp(f"{year}-01-01T00:00", tz="UTC"):pd.Timestamp(f"{year + 1}-01-01T00:00", tz="UTC")]
    n = _hours(year)
    if len(df) != n + 1:
        raise ValueError(f"weather for {year} has {len(df) - 1} hours, expected {n} (8760/8784)")
    missing = int(df[["v10", "v100"]].isna().sum().max())
    if missing > MAX_MISSING_RADIATION_H:
        raise ValueError(f"weather for {year} is incomplete ({missing} hours missing) — pick an earlier year")
    df = df.interpolate(limit=3, limit_direction="both").ffill().bfill()
    mid = (df.iloc[:-1].to_numpy() + df.iloc[1:].to_numpy()) / 2.0
    return pd.DataFrame(mid, columns=df.columns, index=df.index[:-1] + pd.Timedelta(minutes=30))


def request_json(params, http_get=None, sleep=time.sleep, on_wait=None):
    """GET the Open-Meteo archive API with the shared throttle, 429 back-off and error reasons."""
    if http_get is None:
        import requests
        http_get = requests.get
    for attempt in range(MAX_RETRIES + 1):
        with _throttle_lock:
            wait = MIN_INTERVAL_S - (time.monotonic() - _last_request[0])
            if wait > 0:
                sleep(wait)
            _last_request[0] = time.monotonic()
        resp = http_get(ARCHIVE_URL, params=params, timeout=60)
        if resp.status_code == 429:
            if attempt == MAX_RETRIES:
                break
            if on_wait:
                on_wait()
            sleep(RATE_LIMIT_WAIT_S)
            continue
        if resp.status_code >= 400:
            try:
                reason = (resp.json() or {}).get("reason")
            except Exception:
                reason = None
            if reason:
                raise RuntimeError(f"Open-Meteo: {reason}")
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("Open-Meteo rate limit: still refused after retries, try again later")


def fetch_cell(lat, lon, year, kind, cache_dir, http_get=None, sleep=time.sleep, on_wait=None):
    """Raw Open-Meteo payload for one cell and year (from cache when present)."""
    cache = Path(cache_dir) / f"{kind}_{lat + 0.0:.2f}_{lon + 0.0:.2f}_{year}.json.gz"
    if cache.exists():
        try:
            return json.loads(gzip.decompress(cache.read_bytes()))
        except (OSError, EOFError, ValueError, zlib.error):
            cache.unlink(missing_ok=True)   # corrupt or truncated: refetch
    payload = request_json(archive_params(lat, lon, year, VARS[kind]), http_get=http_get, sleep=sleep,
                           on_wait=on_wait)
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_name(f"{cache.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(gzip.compress(json.dumps(payload).encode("utf-8")))
    os.replace(tmp, cache)
    return payload
