"""
renewables_service.py — local FastAPI service for weather-based resource profiles.

    GET  /health      → {"status":"ok","engine":"renewables","versions":{…}}
    POST /pv          → {"job_id"}; body PvRequest; 400 on a year without a full archive year;
                        job result = {point_id: {"cf":[8760|8784], "mean_cf", "annual_kwh_per_kwp"}}
    POST /optimise-orientation → {"job_id"}; body OrientRequest (period year|summer|winter|custom, months);
                        job result = {point_id: {"tilt", "azimuth", "gain_pct"}}; 422 on a bad custom period
    GET  /jobs/{id}   → {"state":"running"|"waiting"|"done"|"error","done","total","message","error","result"}

Weather is cached per ERA5 cell under TEMPO_WEATHER_CACHE (Electron sets
<userData>/weather-cache). Weather data: Open-Meteo.com (ERA5, CC BY 4.0).
Run: uvicorn renewables_service:app --host 127.0.0.1 --port 5005
"""
import datetime as dt
import os
import sys
import threading
import uuid
from importlib import metadata
from pathlib import Path
from typing import List, Literal

from fastapi import FastAPI, HTTPException
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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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


def _check_year(year):
    last = dt.date.today().year - 1
    if not FIRST_YEAR <= year <= last:
        raise HTTPException(400, f"weather year must be {FIRST_YEAR}–{last} (a complete archive year)")


def _run_cells(job_id, points, year, per_point):
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
                clat, clon, year, "pv", CACHE_DIR,
                on_wait=lambda: _update(job_id, state="waiting",
                                        message="Open-Meteo rate limit — waiting 60 s"))
            _update(job_id, state="running", message=msg)
            weather = renewables_weather.pv_weather_frame(payload, year)
            for p in pts:
                result[p.id] = per_point(weather, p)
                k += 1
                _update(job_id, message=f"Point {k}/{len(points)}")
            _update(job_id, done=i + 1)
        _update(job_id, state="done", message=None, result=result)
    except Exception as exc:  # reported to the dialog, never raised into uvicorn
        _update(job_id, state="error", error=f"{type(exc).__name__}: {exc}")


def _start_job(points, year, per_point):
    job_id = uuid.uuid4().hex
    with _lock:
        for old in [k for k, v in _jobs.items() if v["state"] in ("done", "error")]:
            if len(_jobs) < MAX_JOBS:
                break
            del _jobs[old]
        _jobs[job_id] = {"state": "running", "done": 0, "total": 0, "message": None,
                         "error": None, "result": None}
    threading.Thread(target=_run_cells, args=(job_id, points, year, per_point), daemon=True).start()
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


@app.get("/jobs/{job_id}")
def job(job_id: str):
    with _lock:
        if job_id not in _jobs:
            raise HTTPException(404, "unknown job")
        return dict(_jobs[job_id])
