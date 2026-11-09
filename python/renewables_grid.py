"""
renewables_grid.py — one day of hourly 100 m wind (V5) or shortwave radiation (GHI) on an
n×n grid, for the animated wind-flow and sunshine layers. One multi-location Open-Meteo archive request per
(bounds, date, n); cached gzip-JSON. Weather data: Open-Meteo.com (ERA5), CC BY 4.0.

Bounds order everywhere in Python: (south, west, north, east).
"""
import datetime as dt
import gzip
import json
import math
import os
import threading
import zlib
from pathlib import Path

import numpy as np

import renewables_weather

N_MIN, N_MAX = 6, 20
LAG_DAYS = 5


def grid_axes(south, west, north, east, n):
    return list(np.linspace(south, north, n)), list(np.linspace(west, east, n))


def uv(speed, direction_deg):
    """Meteorological direction (where the wind comes FROM) -> u east, v north components."""
    d = np.radians(direction_deg)
    return -speed * np.sin(d), -speed * np.cos(d)


def _hourly(d, name):
    return np.array([np.nan if x is None else x for x in d["hourly"][name][:24]], dtype=float)


def _cached_grid(prefix, south, west, north, east, date, n, cache_dir, hourly, build, request_json):
    """Validate, then serve/refresh the gzip-JSON cache of one multi-location archive request.
    `build(data, lats, lons, day, n)` turns the per-point responses into the output dict."""
    if not N_MIN <= n <= N_MAX:
        raise ValueError(f"n must be {N_MIN}–{N_MAX}")
    if not all(math.isfinite(x) for x in (south, west, north, east)):
        raise ValueError("bounds must be finite numbers")
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("bounds must satisfy -90 <= south < north <= 90 and -180 <= west < east <= 180")
    day = dt.date.fromisoformat(date)
    if day > dt.date.today() - dt.timedelta(days=LAG_DAYS):
        raise ValueError(f"date must be at least {LAG_DAYS} days ago (ERA5 lag)")
    south, west, north, east = (round(x, 2) for x in (south, west, north, east))
    if not (south < north and west < east):
        raise ValueError("bounds too small (resolution is 0.01 degrees)")
    key = f"{prefix}_{south:.2f}_{west:.2f}_{north:.2f}_{east:.2f}_{day.isoformat()}_{n}.json.gz"
    cache = Path(cache_dir) / key
    if cache.exists():
        try:
            return json.loads(gzip.decompress(cache.read_bytes()))
        except (OSError, EOFError, ValueError, zlib.error):
            cache.unlink(missing_ok=True)
    lats, lons = grid_axes(south, west, north, east, n)
    pts = [(la, lo) for la in lats for lo in lons]                 # row-major: lat, then lon
    params = {
        "latitude": ",".join(f"{la:.2f}" for la, _ in pts),
        "longitude": ",".join(f"{lo:.2f}" for _, lo in pts),
        "start_date": day.isoformat(), "end_date": day.isoformat(),
        "hourly": hourly,
        "timezone": "GMT", "models": "era5", "wind_speed_unit": "ms",
    }
    data = (request_json or renewables_weather.request_json)(params)
    if isinstance(data, dict):
        data = [data]
    if len(data) != len(pts):
        raise RuntimeError(f"Open-Meteo returned {len(data)} locations, expected {len(pts)}")
    out = build(data, lats, lons, day, n)
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_name(f"{cache.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(gzip.compress(json.dumps(out).encode("utf-8")))
    os.replace(tmp, cache)
    return out


def _by_hour(a, n):
    """(n*n points, 24) row-major -> [24][n][n] rounded to 2 decimals."""
    return np.round(a.reshape((n, n, 24)).transpose(2, 0, 1), 2).tolist()


def _header(lats, lons, day):
    return {"lats": [float(x) for x in lats], "lons": [float(x) for x in lons], "date": day.isoformat()}


def wind_grid(south, west, north, east, date, n, cache_dir, request_json=None):
    """{lats, lons, date, u[24][n][n], v[24][n][n]}; bounds are (south, west, north, east)."""
    def build(data, lats, lons, day, n):
        s = np.array([_hourly(d, "wind_speed_100m") for d in data])
        a = np.array([_hourly(d, "wind_direction_100m") for d in data])
        u, v = uv(np.nan_to_num(s), np.nan_to_num(a))
        return {**_header(lats, lons, day), "u": _by_hour(u, n), "v": _by_hour(v, n)}

    return _cached_grid("grid", south, west, north, east, date, n, cache_dir,
                        "wind_speed_100m,wind_direction_100m", build, request_json)


def solar_grid(south, west, north, east, date, n, cache_dir, request_json=None):
    """{lats, lons, date, ghi[24][n][n]} in W/m2 (preceding-hour mean, UTC hours); same rules as wind_grid."""
    def build(data, lats, lons, day, n):
        g = np.array([_hourly(d, "shortwave_radiation") for d in data])
        return {**_header(lats, lons, day), "ghi": _by_hour(np.clip(np.nan_to_num(g), 0, None), n)}

    return _cached_grid("solar", south, west, north, east, date, n, cache_dir,
                        "shortwave_radiation", build, request_json)
