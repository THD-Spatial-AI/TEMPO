"""
renewables_service.py — local FastAPI service for weather-based resource profiles.

    GET  /health      → {"status":"ok","engine":"renewables","versions":{…}}
    POST /pv          → {"job_id"}; body PvRequest; 400 on a year without a full archive year;
                        job result = {point_id: {"cf":[8760|8784], "mean_cf", "annual_kwh_per_kwp"}}
    POST /optimise-orientation → {"job_id"}; body OrientRequest (period year|summer|winter|custom, months);
                        job result = {point_id: {"tilt", "azimuth", "gain_pct"}}; 422 on a bad custom period
    GET  /jobs/{id}   → {"state":"running"|"waiting"|"done"|"error","done","total","message","error","result"}

    GET  /turbines    → {"turbines":[{"id","label","generic"}]} (generic presets first, then OEDB); 503 without windpowerlib
    POST /wind        → {"job_id"}; body WindRequest (points id/lat/lon, year, turbine, hub_height, loss);
                        job result = {point_id: {"cf":[…], "mean_cf", "mean_speed_hub", "full_load_hours"}}
    POST /best-wind-point → {"job_id"}; body WindRequest + radius_km (5–100); job result =
                        {point_id: {"lat","lon","mean_cf","gain_pct","distance_km","moved"}}

    GET  /atlas/view?layer&south&west&north&east&width → image/png over the requested bounds (lat
                        clipped to ±85°), stitched from the countries in view, read remotely;
                        headers X-Bounds "w,s,e,n", X-Countries / X-Skipped (each name percent-encoded,
                        joined by ","); 204 when no country in view has data, 422/400 bad bounds,
                        503 rasterio/pycountry missing
    GET  /wind-grid?south&west&north&east&date&n → {lats,lons,date,u[24][n][n],v[24][n][n]}; 400 bad date/n, 502 upstream

Weather is cached per ERA5 cell under TEMPO_WEATHER_CACHE (Electron sets
<userData>/weather-cache). Weather data: Open-Meteo.com (ERA5, CC BY 4.0).
Run: uvicorn renewables_service:app --host 127.0.0.1 --port 5005
"""
import datetime as dt
import os
import sys
import threading
import uuid
from urllib.parse import quote
from importlib import metadata
from pathlib import Path
from typing import List, Literal

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

import renewables_pv
import renewables_weather


def _default_cache_dir():
    if sys.platform == "win32" and os.environ.get("APPDATA"):
        return Path(os.environ["APPDATA"]) / "TEMPO" / "weather-cache"
    return Path.home() / ".tempo" / "weather-cache"


CACHE_DIR = Path(os.environ.get("TEMPO_WEATHER_CACHE") or _default_cache_dir())
FIRST_YEAR = 1950
MAX_JOBS = 20

app = FastAPI(title="TEMPO renewables service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-Bounds", "X-Countries", "X-Skipped"])

_jobs = {}
_lock = threading.Lock()


class PvPoint(BaseModel):
    id: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    tilt: float = Field(ge=0, le=90)
    azimuth: float = Field(ge=0, lt=360)


class PvRequest(BaseModel):
    points: List[PvPoint] = Field(min_length=1, max_length=1000)
    year: int
    tracking: Literal["fixed", "single_axis"] = "fixed"
    losses: float = Field(0.10, ge=0, le=0.5)
    dc_ac: float = Field(1.2, ge=0.5, le=2.0)
    temp_coeff: float = Field(-0.004, ge=-0.01, le=0)


def _version(pkg):
    try:
        return metadata.version(pkg)
    except metadata.PackageNotFoundError:
        return None


@app.get("/health")
def health():
    return {"status": "ok", "engine": "renewables",
            "versions": {"pvlib": _version("pvlib"), "pandas": _version("pandas")}}


def _update(job_id, **fields):
    with _lock:
        _jobs[job_id].update(fields)


class OrientRequest(BaseModel):
    points: List[PvPoint] = Field(min_length=1, max_length=1000)
    year: int
    period: Literal["year", "summer", "winter", "custom"] = "year"
    months: List[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def _custom_needs_months(self):
        if self.period == "custom" and (not self.months or any(m not in range(1, 13) for m in self.months)):
            raise ValueError("custom period needs months 1-12")
        return self


class WindPoint(BaseModel):
    id: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class WindRequest(BaseModel):
    points: List[WindPoint] = Field(min_length=1, max_length=1000)
    year: int
    turbine: str = "generic_iec2"
    hub_height: float = Field(100, ge=10, le=250)
    loss: float = Field(0.12, ge=0, le=0.5)


class BestPointRequest(WindRequest):
    radius_km: float = Field(25, ge=5, le=100)


def _wind():
    """renewables_wind, imported lazily; 503 when windpowerlib is missing (W9)."""
    try:
        import windpowerlib  # noqa: F401
        import renewables_wind
    except ImportError:
        raise HTTPException(503, "windpowerlib missing — reinstall the Renewables component")
    return renewables_wind


def _check_year(year):
    last = dt.date.today().year - 1
    if not FIRST_YEAR <= year <= last:
        raise HTTPException(400, f"weather year must be {FIRST_YEAR}–{last} (a complete archive year)")


def _run_cells(job_id, points, year, per_point, kind="pv", frame=renewables_weather.pv_weather_frame):
    """Fetch weather once per ERA5 cell, call per_point(weather, p) → result dict for each point."""
    try:
        by_cell = {}
        for p in points:
            by_cell.setdefault(renewables_weather.cell_of(p.lat, p.lon), []).append(p)
        _update(job_id, total=len(by_cell))
        result = {}
        k = 0
        for i, ((clat, clon), pts) in enumerate(by_cell.items()):
            msg = f"Weather {i + 1}/{len(by_cell)}"
            _update(job_id, state="running", message=msg)
            payload = renewables_weather.fetch_cell(
                clat, clon, year, kind, CACHE_DIR,
                on_wait=lambda: _update(job_id, state="waiting",
                                        message="Open-Meteo rate limit — waiting 60 s"))
            _update(job_id, state="running", message=msg)
            weather = frame(payload, year)
            for p in pts:
                result[p.id] = per_point(weather, p)
                k += 1
                _update(job_id, message=f"Point {k}/{len(points)}")
            _update(job_id, done=i + 1)
        _update(job_id, state="done", message=None, result=result)
    except Exception as exc:  # reported to the dialog, never raised into uvicorn
        _update(job_id, state="error", error=f"{type(exc).__name__}: {exc}")


def _new_job():
    job_id = uuid.uuid4().hex
    with _lock:
        for old in [k for k, v in _jobs.items() if v["state"] in ("done", "error")]:
            if len(_jobs) < MAX_JOBS:
                break
            del _jobs[old]
        _jobs[job_id] = {"state": "running", "done": 0, "total": 0, "message": None,
                         "error": None, "result": None}
    return job_id


def _start_job(points, year, per_point, kind="pv", frame=renewables_weather.pv_weather_frame):
    job_id = _new_job()
    threading.Thread(target=_run_cells, args=(job_id, points, year, per_point, kind, frame), daemon=True).start()
    return {"job_id": job_id}


@app.post("/pv")
def pv(req: PvRequest):
    _check_year(req.year)

    def per_point(weather, p):
        cf = renewables_pv.pv_capacity_factor(
            weather, p.lat, p.lon, p.tilt, p.azimuth, tracking=req.tracking,
            losses=req.losses, dc_ac=req.dc_ac, temp_coeff=req.temp_coeff)
        return {"cf": [round(float(v), 4) for v in cf], "mean_cf": round(float(cf.mean()), 4),
                "annual_kwh_per_kwp": round(float(cf.sum()), 1)}

    return _start_job(req.points, req.year, per_point)


@app.post("/optimise-orientation")
def optimise(req: OrientRequest):
    _check_year(req.year)

    def per_point(weather, p):
        months = renewables_pv.period_months(req.period, p.lat, req.months)
        return renewables_pv.optimise_orientation(weather, p.lat, p.lon, months, p.tilt, p.azimuth)

    return _start_job(req.points, req.year, per_point)


@app.get("/turbines")
def turbines():
    return {"turbines": _wind().list_turbines()}


@app.post("/wind")
def wind(req: WindRequest):
    _check_year(req.year)
    rwind = _wind()

    def per_point(weather, p):
        cf = rwind.wind_capacity_factor(weather, req.turbine, req.hub_height, req.loss)
        v = rwind.hub_speed(weather["v10"].to_numpy(), weather["v100"].to_numpy(), req.hub_height)
        return {"cf": [round(float(x), 4) for x in cf], "mean_cf": round(float(cf.mean()), 4),
                "mean_speed_hub": round(float(v.mean()), 2), "full_load_hours": round(float(cf.sum()), 1)}

    return _start_job(req.points, req.year, per_point, kind="wind", frame=renewables_weather.wind_weather_frame)


def _run_best_points(job_id, req, rwind):
    try:
        n = len(req.points)
        _update(job_id, total=n)
        result = {}
        for k, p in enumerate(req.points, 1):
            cells = rwind.candidate_cells(p.lat, p.lon, req.radius_km)
            cand = []                              # (cell, mean CF); a failing non-own cell is skipped
            for j, (clat, clon) in enumerate(cells, 1):
                msg = f"Point {k}/{n} · cell {j}/{len(cells)}"
                _update(job_id, state="running", message=msg)
                try:
                    payload = renewables_weather.fetch_cell(
                        clat, clon, req.year, "wind", CACHE_DIR,
                        on_wait=lambda: _update(job_id, state="waiting",
                                                message="Open-Meteo rate limit — waiting 60 s"))
                    _update(job_id, state="running", message=msg)
                    weather = renewables_weather.wind_weather_frame(payload, req.year)
                    cf = rwind.wind_capacity_factor(weather, req.turbine, req.hub_height, req.loss)
                except (RuntimeError, ValueError):
                    if j == 1:
                        raise
                    continue
                cand.append(((clat, clon), float(cf.mean())))
            best = 0
            for i in range(1, len(cand)):
                if cand[i][1] > cand[best][1]:       # strictly better, so ties keep the own cell
                    best = i
            if best == 0:
                result[p.id] = {"lat": p.lat, "lon": p.lon, "mean_cf": round(cand[0][1], 4),
                                "gain_pct": 0.0, "distance_km": 0.0, "moved": False}
            else:
                (blat, blon), score = cand[best]
                own_score = cand[0][1]
                result[p.id] = {"lat": blat, "lon": blon, "mean_cf": round(score, 4),
                                "gain_pct": round(100.0 * (score / own_score - 1.0), 1) if own_score > 0 else None,
                                "distance_km": round(rwind.haversine_km(p.lat, p.lon, blat, blon), 1),
                                "moved": True}
            _update(job_id, done=k)
        _update(job_id, state="done", message=None, result=result)
    except Exception as exc:  # reported to the dialog, never raised into uvicorn
        _update(job_id, state="error", error=f"{type(exc).__name__}: {exc}")


@app.post("/best-wind-point")
def best_wind_point(req: BestPointRequest):
    _check_year(req.year)
    rwind = _wind()
    job_id = _new_job()
    threading.Thread(target=_run_best_points, args=(job_id, req, rwind), daemon=True).start()
    return {"job_id": job_id}


def _atlas():
    """renewables_atlas, imported lazily; 503 when rasterio or pycountry is missing (V8)."""
    try:
        import rasterio  # noqa: F401
        import pycountry  # noqa: F401
        import renewables_atlas
    except ImportError:
        raise HTTPException(503, "rasterio/pycountry missing — reinstall the Renewables component")
    return renewables_atlas


def _grid():
    try:
        import renewables_grid
    except ImportError:
        raise HTTPException(503, "renewables_grid unavailable — reinstall the Renewables component")
    return renewables_grid


def _names_header(names):
    """Names percent-encoded one by one, then joined by ',' (one GSA name contains a comma)."""
    return ",".join(quote(n, safe="") for n in names)


@app.get("/atlas/view")
def atlas_view(layer: Literal["pvout", "wind100"],
               south: float = Query(ge=-90, le=90), west: float = Query(ge=-180, le=180),
               north: float = Query(ge=-90, le=90), east: float = Query(ge=-180, le=180),
               width: int = Query(800, ge=16, le=1024)):
    ra = _atlas()
    if south >= north or west >= east:
        raise HTTPException(400, "bounds must satisfy south < north and west < east")
    png, (w, s, e, n), used, skipped = ra.render_view(layer, south=south, west=west, north=north,
                                                       east=east, width=width)
    headers = {"X-Bounds": f"{w},{s},{e},{n}", "X-Countries": _names_header(used),
               "X-Skipped": _names_header(skipped)}
    if png is None:
        return Response(status_code=204, headers=headers)
    return Response(content=png, media_type="image/png", headers={**headers, "Cache-Control": "max-age=3600"})


@app.get("/wind-grid")
def wind_grid(south: float = Query(ge=-90, le=90), west: float = Query(ge=-180, le=180),
              north: float = Query(ge=-90, le=90), east: float = Query(ge=-180, le=180),
              date: str = "", n: int = 16):
    import requests
    rg = _grid()
    day = date or (dt.date.today() - dt.timedelta(days=7)).isoformat()
    try:
        return rg.wind_grid(south, west, north, east, day, n, CACHE_DIR)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))
    except requests.RequestException as exc:
        raise HTTPException(502, f"Open-Meteo unavailable: {exc}")


@app.get("/jobs/{job_id}")
def job(job_id: str):
    with _lock:
        if job_id not in _jobs:
            raise HTTPException(404, "unknown job")
        return dict(_jobs[job_id])
