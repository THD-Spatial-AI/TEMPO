"""
OSeMOSYS Web Service
--------------------
FastAPI HTTP service that exposes OSeMOSYS model runs (otoole + GLPK) over HTTP
with SSE streaming, plus model export/import in the otoole CSV format.

Start locally:
    uvicorn python.osemosys_service:app --host 0.0.0.0 --port 5004 --reload

API
---
GET  /health                      → {"status": "ok", "engine": "osemosys", ...}
POST /run              body: JSON  → {"job_id": "<uuid>"}
GET  /run/{job_id}/stream          → SSE stream of log/done/error events
GET  /run/{job_id}/result          → Full result dict
DELETE /run/{job_id}               → {"cancelled": "<uuid>"}
POST /export           body: JSON  → ZIP archive (otoole CSVs + datafile + report)
POST /import           body: ZIP   → {"model": {...}, "report": [...]}
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict

try:
    import psutil as _psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import osemosys_runner  # noqa: E402
import osemosys_translate as translate  # noqa: E402
import osemosys_import as ose_import  # noqa: E402

app = FastAPI(title="OSeMOSYS Web Service", version="1.0.0")

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

_otoole_version: str | None = None


def _get_otoole_version() -> str | None:
    """Lazy import so the service boots (and reports health) even if otoole is broken."""
    global _otoole_version
    if _otoole_version is None:
        try:
            from importlib.metadata import version
            _otoole_version = version("otoole")
        except Exception:
            _otoole_version = ""
    return _otoole_version or None


def _find_glpsol() -> str | None:
    return shutil.which("glpsol")


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
    work_dir = tempfile.mkdtemp(prefix="osemosys_svc_")

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
        result = osemosys_runner.run_model(model_data, work_dir, log_fn=_log_fn)
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
        "service": "osemosys-web-service",
        "engine": "osemosys",
        "otoole_version": _get_otoole_version(),
        "glpsol_path": _find_glpsol(),
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
        name=f"osemosys-{job_id[:8]}",
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


@app.post("/export")
async def export_model(payload: dict) -> dict:
    datasets = payload.get("datasets") or [{"name": "base", "model": payload.get("model") or {}}]
    options = payload.get("options") or {}
    scheme = options.get("scheme") or {"seasons": 4, "dayBlocks": 3}
    return await asyncio.to_thread(_export_datasets_to_zip, datasets, scheme)


def _export_datasets_to_zip(datasets: list, scheme: dict) -> dict:
    buf = io.BytesIO()
    report_all: list = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ds in datasets:
            ds_name = ds.get("name", "base")
            model = ds.get("model") or {}
            with tempfile.TemporaryDirectory() as tmp:
                csv_dir = os.path.join(tmp, "csvs")
                os.makedirs(csv_dir)
                try:
                    _out_dir, rpt = translate.translate_model(model, csv_dir, scheme)
                except Exception as exc:
                    report_all.append(f"[{ds_name}] translate failed: {exc}")
                    continue
                report_all.extend(f"[{ds_name}] {r}" for r in rpt)
                for fpath in Path(csv_dir).rglob("*"):
                    if fpath.is_file():
                        arc = f"{ds_name}/{fpath.relative_to(csv_dir).as_posix()}"
                        zf.write(str(fpath), arc)
        if report_all:
            zf.writestr("report.txt", "\n".join(report_all) + "\n")
    buf.seek(0)
    return {"zip": base64.b64encode(buf.read()).decode(), "report": report_all}


@app.post("/import")
async def import_model(request: Request) -> dict:
    """
    Accept a ZIP body (raw bytes, Content-Type: application/zip) containing
    one or more otoole CSV dataset directories and return the imported model(s).

    Single-dataset ZIP (all CSVs at root or in one folder):
        → {"model": {...}, "report": [...]}

    Multi-dataset ZIP (multiple top-level folders, one per dataset):
        → {"model": {...}, "extraModels": [...], "report": [...]}
    """
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty ZIP body")

    return await asyncio.to_thread(_import_from_zip_bytes, raw)


def _import_from_zip_bytes(raw: bytes) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            zf.extractall(tmp)

        # Detect dataset layout: if root contains CSV files directly, single dataset.
        # Otherwise each top-level subdirectory is a dataset.
        root_csvs = [
            f for f in os.listdir(tmp)
            if f.lower().endswith(".csv") and os.path.isfile(os.path.join(tmp, f))
        ]
        if root_csvs:
            # All CSVs at root — single dataset
            dataset_dirs = [("base", tmp)]
        else:
            dirs = sorted(
                d for d in os.listdir(tmp)
                if os.path.isdir(os.path.join(tmp, d)) and not d.startswith(".")
            )
            if not dirs:
                raise HTTPException(status_code=400, detail="ZIP contains no CSV files or subdirectories")
            dataset_dirs = [(d, os.path.join(tmp, d)) for d in dirs]

        models: list[dict] = []
        all_reports: list[str] = []
        for name, csv_dir in dataset_dirs:
            try:
                model, rpt = ose_import.osemosys_to_internal(csv_dir)
                if model:
                    model["name"] = model.get("name") or name
                    models.append(model)
                all_reports.extend(f"[{name}] {r}" for r in rpt)
            except Exception as exc:
                all_reports.append(f"[{name}] import failed: {exc}")

        if not models:
            raise HTTPException(status_code=422, detail="No models could be imported. " + "; ".join(all_reports))

        result: dict = {"model": models[0], "report": all_reports}
        if len(models) > 1:
            result["extraModels"] = models[1:]
        return result
