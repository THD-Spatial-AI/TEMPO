"""
demand_service.py — local FastAPI service for the substation demand estimate (Inc 3).

    GET  /health       → {"status":"ok","engine":"demand","dataReady","dataDir","versions"}
    POST /data/ensure  → starts the EC2019 raster then the mine-footprint download in a background thread;
                         body as /data/status
    GET  /data/status  → {"state":"ready"|"idle"|"downloading"|"error","done","total","error",
                          "parts":{"raster":state,"mines":state}}; state/done/total/error describe the raster
                         (the only part an estimate needs; without footprints Maus-source countries get no split)
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
import demand_large
import demand_shapes

RASTER_YEAR = demand_estimate.RASTER_YEAR
LANDUSE_MAX_DEG2 = 50  # larger study areas skip the OSM land-use query


def _default_data_dir():
    if sys.platform == "win32" and os.environ.get("APPDATA"):
        return Path(os.environ["APPDATA"]) / "TEMPO" / "demand-data"
    return Path.home() / ".tempo" / "demand-data"


DATA_DIR = Path(os.environ.get("TEMPO_DEMAND_DATA") or _default_data_dir())
EC_PATH = DATA_DIR / f"EC{RASTER_YEAR}.tif"
MINES_PATH = DATA_DIR / demand_data.MINE_FOOTPRINTS

_lock = threading.Lock()
_download = {"state": "idle", "done": 0, "total": 0, "error": None}
_mines = {"state": "idle", "error": None}
_table_cache = {}


def _tables():
    """(national_table, raster_totals), loaded once."""
    if not _table_cache:
        _table_cache["t"] = (demand_growth.load_national_table(), demand_growth.load_raster_totals())
    return _table_cache["t"]


def _mine_tables():
    """(mining_share, mine_area), loaded once."""
    if "m" not in _table_cache:
        _table_cache["m"] = (demand_large.load_mining_share(), demand_large.load_mine_area())
    return _table_cache["m"]


def _data_ready():
    return EC_PATH.exists()


def _part_state(state, ready):
    if ready:
        return "ready"
    return "idle" if state == "ready" else state  # file deleted since the download finished


def _status():
    with _lock:
        st, mines = dict(_download), _mines["state"]
    st["state"] = _part_state(st["state"], _data_ready())
    st["parts"] = {"raster": st["state"], "mines": _part_state(mines, MINES_PATH.exists())}
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
    if not _data_ready():
        try:
            demand_data.ensure_ec_raster(RASTER_YEAR, DATA_DIR, progress=_progress)
            with _lock:
                _download.update(state="ready", error=None)
        except Exception as exc:  # noqa: BLE001 - reported through /data/status
            with _lock:
                _download.update(state="error", error=str(exc))
                _mines.update(state="idle")
            return
    try:
        demand_data.ensure_mine_footprints(DATA_DIR)
        with _lock:
            _mines.update(state="ready", error=None)
    except Exception as exc:  # noqa: BLE001 - optional part: parts.mines = "error", estimates still run
        print(f"mine footprint download failed: {exc}", file=sys.stderr)
        with _lock:
            _mines.update(state="error", error=str(exc))


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
    largeConsumers: bool = True


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
    raster, mines = _data_ready(), MINES_PATH.exists()
    if not (raster and mines):
        with _lock:
            start = _download["state"] != "downloading" and _mines["state"] != "downloading"
            if start:
                if not raster:
                    _download.update(state="downloading", done=0, total=0, error=None)
                if not mines:
                    _mines.update(state="downloading", error=None)
        if start:
            threading.Thread(target=_run_download, name="demand-data-download", daemon=True).start()
    return _status()


def _mine_inputs(req, too_large, warnings):
    """(estimate() kwargs for the mining split, countries left without one) (Inc 7). A country whose
    sites cannot be obtained gets a MINES_UNAVAILABLE / MINES_SKIPPED warning and no split; mine_sites
    is None when no country is left."""
    if not req.largeConsumers:
        return {}, set()
    share, mine_area = _mine_tables()
    areas = demand_estimate.country_areas(req.area, req.country)
    codes = [c for c in areas if c in mine_area and demand_large.country_mine_km2(mine_area[c])
             and demand_large.mining_share(share, c, req.modelYear) is not None]
    sites, missing = demand_large.study_area_sites(areas, codes, mine_area, cache_dir=DATA_DIR,
                                                   footprints_path=MINES_PATH, query_osm=not too_large)
    for code, (wcode, reason) in sorted(missing.items()):
        warnings.append({"code": wcode, "message": f"No mining split for {code}: {reason}; "
                                                    "its demand follows the raster only."})
    if codes and len(missing) == len(codes):
        return {"large_consumers": True, "mine_sites": None}, set(missing)
    return {"large_consumers": True, "mine_sites": sites, "mining_share": share,
            "mine_area": {c: r for c, r in mine_area.items() if c not in missing}}, set(missing)


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
        mine_kw, missing = _mine_inputs(req, too_large, warnings)
        result = demand_estimate.estimate(
            req.area, [x.model_dump() for x in req.substations], ec_path=EC_PATH, model_year=req.modelYear, country=req.country,
            national_table=national_table, raster_totals=raster_totals, override_gwh=req.overrideGwh,
            landuse=landuse, global_mix=req.globalMix, family=req.family, **mine_kw, **kw)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    result["warnings"] = [w for w in result["warnings"]    # a dropped mine-area row: our warning explains it
                          if not (w["code"] == "NO_MINING_SHARE" and any(f" {c} (" in w["message"] for c in missing))]
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
