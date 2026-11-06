"""
demand_service.py — local FastAPI service for the substation demand estimate (Inc 3).

    GET  /health       → {"status":"ok","engine":"demand","dataReady","dataDir","versions"}
    POST /data/ensure  → starts the EC2019 raster download in a background thread; body as /data/status
    GET  /data/status  → {"state":"ready"|"idle"|"downloading"|"error","done","total","error"}
    POST /estimate     → demand_estimate.estimate() result + {"latitude","southern","tropical"};
                         409 until the data is ready, 400 on ValueError
    POST /shape        → demand_shapes.shape_substations() result; 400 on ValueError

Thin by design: request parsing + calls into the demand_* modules. Data dir from
TEMPO_DEMAND_DATA (Electron sets <userData>/demand-data).
Run: uvicorn demand_service:app --host 127.0.0.1 --port 5006
"""
import os
import sys
import threading
from importlib import metadata
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

import demand_data
import demand_estimate
import demand_growth
import demand_landuse
import demand_shapes

RASTER_YEAR = demand_estimate.RASTER_YEAR
LANDUSE_MAX_DEG2 = 50  # larger study areas skip the OSM land-use query


def _default_data_dir():
    if sys.platform == "win32" and os.environ.get("APPDATA"):
        return Path(os.environ["APPDATA"]) / "TEMPO" / "demand-data"
    return Path.home() / ".tempo" / "demand-data"


DATA_DIR = Path(os.environ.get("TEMPO_DEMAND_DATA") or _default_data_dir())
EC_PATH = DATA_DIR / f"EC{RASTER_YEAR}.tif"

_lock = threading.Lock()
_download = {"state": "idle", "done": 0, "total": 0, "error": None}
_table_cache = {}


def _tables():
    """(national_table, raster_totals), loaded once."""
    if not _table_cache:
        _table_cache["t"] = (demand_growth.load_national_table(), demand_growth.load_raster_totals())
    return _table_cache["t"]


def _data_ready():
    return EC_PATH.exists()


def _status():
    with _lock:
        st = dict(_download)
    if _data_ready():
        st["state"] = "ready"
    elif st["state"] == "ready":
        st["state"] = "idle"  # raster deleted since the download finished
    return st


def _version(pkg):
    try:
        return metadata.version(pkg)
    except metadata.PackageNotFoundError:
        return None


def _progress(done, total):
    with _lock:
        _download.update(done=int(done), total=int(total))


def _run_download():
    try:
        demand_data.ensure_ec_raster(RASTER_YEAR, DATA_DIR, progress=_progress)
        with _lock:
            _download.update(state="ready", error=None)
    except Exception as exc:  # noqa: BLE001 - reported through /data/status
        with _lock:
            _download.update(state="error", error=str(exc))


class Substation(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    lon: float
    lat: float
    name: Optional[str] = None
    substation: Optional[str] = None
    voltage_kv: Union[float, str, None] = None


class EstimateRequest(BaseModel):
    area: Dict[str, Any]
    substations: List[Substation]
    modelYear: int
    country: Optional[str] = None
    family: Literal["classic", "bdew25"] = "classic"
    globalMix: Optional[Dict[str, float]] = None
    maxKv: Optional[float] = None
    overrideGwh: Optional[float] = None
    landuse: bool = False


class ShapeRequest(BaseModel):
    substations: List[Dict[str, Any]]
    start: str
    end: str
    resolution: str
    country: Optional[str] = None
    family: Literal["classic", "bdew25"] = "classic"
    latitude: float = 0.0


app = FastAPI(title="TEMPO Demand Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost:5173", "http://localhost:5174",
                   "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "demand", "dataReady": _data_ready(), "dataDir": str(DATA_DIR),
            "versions": {p: _version(p) for p in ("demandlib", "rasterio", "shapely")}}


@app.get("/data/status")
def data_status():
    return _status()


@app.post("/data/ensure")
def data_ensure():
    if not _data_ready():
        with _lock:
            start = _download["state"] != "downloading"
            if start:
                _download.update(state="downloading", done=0, total=0, error=None)
        if start:
            threading.Thread(target=_run_download, name="demand-ec-download", daemon=True).start()
    return _status()


@app.post("/estimate")
def estimate(req: EstimateRequest):
    if not _data_ready():
        raise HTTPException(status_code=409, detail="data not ready")
    national_table, raster_totals = _tables()
    try:
        area = demand_estimate.area_geometry(req.area)
        warnings, landuse = [], None
        minx, miny, maxx, maxy = area.bounds
        too_large = maxx - minx > 180 or (maxx - minx) * (maxy - miny) > LANDUSE_MAX_DEG2
        if req.landuse and too_large:
            warnings.append({"code": "LANDUSE_SKIPPED",
                             "message": "Study area too large for an OSM land-use query; the global mix is used."})
        elif req.landuse:
            try:
                landuse = demand_landuse.parse_overpass(demand_landuse.fetch_landuse(area.bounds, DATA_DIR))
            except Exception as exc:  # noqa: BLE001 - the estimate never fails on Overpass (S4)
                warnings.append({"code": "LANDUSE_UNAVAILABLE",
                                 "message": f"Land use could not be fetched; the global mix is used everywhere ({exc})."})
        kw = {} if req.maxKv is None else {"max_kv": req.maxKv}
        result = demand_estimate.estimate(
            req.area, [x.model_dump() for x in req.substations], ec_path=EC_PATH, model_year=req.modelYear, country=req.country,
            national_table=national_table, raster_totals=raster_totals, override_gwh=req.overrideGwh,
            landuse=landuse, global_mix=req.globalMix, family=req.family, **kw)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    result["warnings"].extend(warnings)
    _, lat = demand_estimate.area_centre(area)
    result.update(latitude=lat, southern=bool(lat < 0), tropical=bool(abs(lat) < 23.5))
    return result


@app.post("/shape")
def shape(req: ShapeRequest):
    try:
        return demand_shapes.shape_substations(req.substations, req.start, req.end, req.resolution,
                                               country=req.country, family=req.family, latitude=req.latitude)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
