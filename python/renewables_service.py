"""
renewables_service.py — local FastAPI service for weather-based resource profiles.

    GET  /health      → {"status":"ok","engine":"renewables","versions":{…}}
    POST /pv          → {"job_id"}; body PvRequest; 400 on a year without a full archive year
    GET  /jobs/{id}   → {"state":"running"|"waiting"|"done"|"error","done","total","message","error","result"}
                        result = {point_id: {"cf":[8760|8784], "mean_cf", "annual_kwh_per_kwp"}}

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
from pydantic import BaseModel, Field

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


def _run_pv(job_id, req):
    try:
        by_cell = {}
        for p in req.points:
            by_cell.setdefault(renewables_weather.cell_of(p.lat, p.lon), []).append(p)
        _update(job_id, total=len(by_cell))
        result = {}
        for i, ((clat, clon), pts) in enumerate(by_cell.items()):
            _update(job_id, state="running", message=f"Weather {i + 1}/{len(by_cell)}")
            payload = renewables_weather.fetch_cell(
                clat, clon, req.year, "pv", CACHE_DIR,
                on_wait=lambda: _update(job_id, state="waiting",
                                        message="Open-Meteo rate limit — waiting 60 s"))
            _update(job_id, state="running", message=f"Weather {i + 1}/{len(by_cell)}")
            weather = renewables_weather.pv_weather_frame(payload, req.year)
            for p in pts:
                cf = renewables_pv.pv_capacity_factor(
                    weather, p.lat, p.lon, p.tilt, p.azimuth, tracking=req.tracking,
                    losses=req.losses, dc_ac=req.dc_ac, temp_coeff=req.temp_coeff)
                result[p.id] = {"cf": [round(float(v), 4) for v in cf],
                                "mean_cf": round(float(cf.mean()), 4),
                                "annual_kwh_per_kwp": round(float(cf.sum()), 1)}
            _update(job_id, done=i + 1)
        _update(job_id, state="done", message=None, result=result)
    except Exception as exc:  # reported to the dialog, never raised into uvicorn
        _update(job_id, state="error", error=f"{type(exc).__name__}: {exc}")


@app.post("/pv")
def pv(req: PvRequest):
    last = dt.date.today().year - 1
    if not FIRST_YEAR <= req.year <= last:
        raise HTTPException(400, f"weather year must be {FIRST_YEAR}–{last} (a complete archive year)")
    job_id = uuid.uuid4().hex
    with _lock:
        for old in [k for k, v in _jobs.items() if v["state"] in ("done", "error")]:
            if len(_jobs) < MAX_JOBS:
                break
            del _jobs[old]
        _jobs[job_id] = {"state": "running", "done": 0, "total": 0, "message": None,
                         "error": None, "result": None}
    threading.Thread(target=_run_pv, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
def job(job_id: str):
    with _lock:
        if job_id not in _jobs:
            raise HTTPException(404, "unknown job")
        return dict(_jobs[job_id])
