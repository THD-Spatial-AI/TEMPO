"""
PyPSA Web Service
-----------------
FastAPI HTTP service that exposes PyPSA model runs over HTTP with SSE streaming,
plus model export/import in PyPSA's native formats.

Start locally:
    uvicorn python.pypsa_service:app --host 0.0.0.0 --port 5003 --reload

API
---
GET  /health                      → {"status": "ok", "engine": "pypsa", ...}
POST /run              body: JSON  → {"job_id": "<uuid>"}
GET  /run/{job_id}/stream          → SSE stream of log/done/error events
GET  /run/{job_id}/result          → Full result dict
DELETE /run/{job_id}               → {"cancelled": "<uuid>"}
POST /export           body: JSON  → ZIP archive (model.nc + CSV folder + report)
POST /import           body: ZIP   → {"model": {...}, "report": [...]}
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import uuid
from typing import Any, Dict

try:
    import psutil as _psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import StreamingResponse

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import pypsa_runner  # noqa: E402

app = FastAPI(title="PyPSA Web Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

_event_loop: asyncio.AbstractEventLoop | None = None


@app.on_event("startup")
async def _capture_event_loop() -> None:
    global _event_loop
    _event_loop = asyncio.get_event_loop()


_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_JOB_TTL_SECONDS = 600

_STATS_INTERVAL_SECONDS = 10

# Large result keys fetched separately via GET /run/{job_id}/result
_HEAVY_KEYS = ("dispatch", "capacity", "timestamps", "transmission_flow", "demand_timeseries")

_pypsa_version: str | None = None


def _get_pypsa_version() -> str | None:
    """Lazy import so the service boots (and reports health) even if pypsa is broken."""
    global _pypsa_version
    if _pypsa_version is None:
        try:
            import pypsa
            _pypsa_version = pypsa.__version__
        except Exception:
            _pypsa_version = ""
    return _pypsa_version or None


def _cleanup_old_jobs() -> None:
    cutoff = time.time() - _JOB_TTL_SECONDS
    with _jobs_lock:
        stale = [
            jid for jid, d in _jobs.items()
            if d.get("status") in ("done", "error", "cancelled")
            and (d.get("finished_at") or cutoff) < cutoff
        ]
        for jid in stale:
            del _jobs[jid]


def _stats_monitor_thread(job_id: str, push_fn, stop_event: threading.Event) -> None:
    start = time.time()
    proc = _psutil.Process(os.getpid()) if _HAS_PSUTIL else None

    while not stop_event.wait(timeout=_STATS_INTERVAL_SECONDS):
        with _jobs_lock:
            status = _jobs.get(job_id, {}).get("status", "done")
        if status != "running":
            break

        elapsed = int(time.time() - start)
        minutes, secs = divmod(elapsed, 60)
        elapsed_str = f"{minutes}m {secs:02d}s" if minutes else f"{secs}s"

        if proc and _HAS_PSUTIL:
            try:
                mem_mb = proc.memory_info().rss / (1024 * 1024)
                cpu_pct = _psutil.cpu_percent(interval=None)
                vm = _psutil.virtual_memory()
                push_fn({
                    "type": "stats",
                    "elapsed": elapsed_str,
                    "cpu_pct": round(cpu_pct, 1),
                    "proc_ram_mb": round(mem_mb, 1),
                    "sys_ram_used_gb": round(vm.used / (1024 ** 3), 2),
                    "sys_ram_total_gb": round(vm.total / (1024 ** 3), 2),
                    "sys_ram_pct": round(vm.percent, 1),
                })
            except Exception:
                push_fn({"type": "stats", "elapsed": elapsed_str,
                         "cpu_pct": None, "proc_ram_mb": None, "sys_ram_pct": None})
        else:
            push_fn({"type": "stats", "elapsed": elapsed_str,
                     "cpu_pct": None, "proc_ram_mb": None, "sys_ram_pct": None})


def _run_job_thread(job_id: str, model_data: dict) -> None:
    job = _jobs[job_id]
    async_queue: asyncio.Queue = job["queue"]
    work_dir = tempfile.mkdtemp(prefix="pypsa_svc_")

    def _push(event: dict) -> None:
        if _event_loop and not _event_loop.is_closed():
            _event_loop.call_soon_threadsafe(async_queue.put_nowait, event)

    def _log_fn(msg: str) -> None:
        with _jobs_lock:
            if _jobs.get(job_id, {}).get("status") == "cancelled":
                return
        _push({"type": "log", "line": msg})

    _stop_stats = threading.Event()
    _stats_thread = threading.Thread(
        target=_stats_monitor_thread,
        args=(job_id, _push, _stop_stats),
        daemon=True,
        name=f"stats-{job_id[:8]}",
    )
    _stats_thread.start()

    try:
        result = pypsa_runner.run_model(model_data, work_dir, log_fn=_log_fn)
        with _jobs_lock:
            job.update(status="done", result=result, finished_at=time.time())
        summary = {k: v for k, v in result.items() if k not in _HEAVY_KEYS}
        _push({"type": "done", "result": summary})
    except BaseException as exc:
        import traceback as _tb
        tb = _tb.format_exc()
        err_msg = str(exc) if str(exc) else repr(exc)
        _log_fn(f"ERROR: {err_msg}")
        _push({"type": "error", "error": err_msg, "traceback": tb})
        with _jobs_lock:
            job.update(status="error", finished_at=time.time())
        if isinstance(exc, (SystemExit, KeyboardInterrupt)):
            raise
    finally:
        _stop_stats.set()
        shutil.rmtree(work_dir, ignore_errors=True)
        _cleanup_old_jobs()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "pypsa-web-service",
        "engine": "pypsa",
        "pypsa_version": _get_pypsa_version(),
    }


@app.post("/run")
async def start_run(model_data: dict) -> dict:
    if not model_data:
        raise HTTPException(status_code=400, detail="Empty model payload")

    job_id = str(uuid.uuid4())
    async_queue: asyncio.Queue = asyncio.Queue()

    with _jobs_lock:
        _jobs[job_id] = {
            "status": "running",
            "queue": async_queue,
            "result": None,
            "finished_at": None,
        }

    thread = threading.Thread(
        target=_run_job_thread,
        args=(job_id, model_data),
        daemon=True,
        name=f"pypsa-{job_id[:8]}",
    )
    thread.start()
    return {"job_id": job_id}


@app.get("/run/{job_id}/stream")
async def stream_run(job_id: str) -> StreamingResponse:
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async_queue: asyncio.Queue = job["queue"]

    async def event_generator():
        yield ": connected\n\n"
        while True:
            try:
                event = await asyncio.wait_for(async_queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            yield f"data: {json.dumps(event)}\n\n"
            if event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/run/{job_id}/result")
async def get_result(job_id: str) -> dict:
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "done" or job.get("result") is None:
        raise HTTPException(status_code=404, detail="Result not yet available")

    return job["result"]


@app.delete("/run/{job_id}")
async def cancel_run(job_id: str) -> dict:
    with _jobs_lock:
        if job_id not in _jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        _jobs[job_id].update(status="cancelled", finished_at=time.time())

    return {"cancelled": job_id}


def _export_datasets_to_zip(datasets: list) -> tuple[bytes, list]:
    """Translate datasets and package them as a ZIP (model.nc + CSV folder per
    dataset, shared report.txt). Returns (zip_bytes, report_lines)."""
    import io
    import re
    import zipfile

    import pypsa_translate as translate

    report_all: list = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ds in datasets:
            raw_name = str(ds.get("name") or "base")
            name = re.sub(r"[^A-Za-z0-9_\-]", "_", raw_name) or "base"
            model = ds.get("model")
            if not model:
                report_all.append(f"{raw_name}: empty dataset skipped")
                continue

            spec, report = translate.translate_model(model)
            prefix = f"{name}: " if len(datasets) > 1 else ""
            report_all.extend(prefix + r for r in report)
            network = translate.build_network(spec)

            with tempfile.TemporaryDirectory(prefix="pypsa_export_") as td:
                nc_path = os.path.join(td, "model.nc")
                network.export_to_netcdf(nc_path)
                zf.write(nc_path, f"{name}/model.nc")

                csv_dir = os.path.join(td, "csv")
                network.export_to_csv_folder(csv_dir)
                for root, _dirs, files in os.walk(csv_dir):
                    for fn in files:
                        full = os.path.join(root, fn)
                        rel = os.path.relpath(full, csv_dir).replace(os.sep, "/")
                        zf.write(full, f"{name}/csv/{rel}")

        zf.writestr("report.txt", "\n".join(report_all) if report_all else "No translation notes.")
    return buf.getvalue(), report_all


@app.post("/export")
def export_model(payload: dict) -> dict:
    import base64
    import traceback

    datasets = payload.get("datasets")
    if not datasets and payload.get("model"):
        datasets = [{"name": "base", "model": payload["model"]}]
    if not datasets:
        raise HTTPException(status_code=400, detail="No datasets in export payload")

    try:
        zip_bytes, report = _export_datasets_to_zip(datasets)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"PyPSA export failed: {exc}\n{traceback.format_exc(limit=3)}",
        )

    return {"zip": base64.b64encode(zip_bytes).decode("ascii"), "report": report}


def _import_zip_to_model(data: bytes) -> dict:
    """Unzip a PyPSA archive (netCDF preferred, CSV folder fallback) and
    translate it to TEMPO's internal model format."""
    import io
    import zipfile

    import pypsa_translate as translate

    with tempfile.TemporaryDirectory(prefix="pypsa_import_") as td:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                zf.extractall(td)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive")

        nc_path = None
        csv_dir = None
        for root, _dirs, files in os.walk(td):
            for fn in files:
                if fn.lower().endswith(".nc") and nc_path is None:
                    nc_path = os.path.join(root, fn)
                if fn.lower() == "buses.csv" and csv_dir is None:
                    csv_dir = root

        if nc_path is None and csv_dir is None:
            raise HTTPException(
                status_code=400,
                detail="No PyPSA network found in archive (expected a .nc file or a CSV folder with buses.csv)",
            )

        import pypsa
        network = pypsa.Network(nc_path if nc_path is not None else csv_dir)
        model, report = translate.network_to_internal(network)
        return {"model": model, "report": report}


@app.post("/import")
async def import_model(request: Request) -> dict:
    import traceback

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    try:
        return await asyncio.to_thread(_import_zip_to_model, data)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"PyPSA import failed: {exc}\n{traceback.format_exc(limit=3)}",
        )
