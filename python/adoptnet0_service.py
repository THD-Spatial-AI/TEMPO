"""
AdOpT-NET0 Web Service
----------------------
FastAPI HTTP service that exposes AdOpT-NET0 model runs over HTTP with SSE streaming.

Start locally:
    uvicorn python.adoptnet0_service:app --host 0.0.0.0 --port 5001 --reload

API
---
GET  /health                      → {"status": "ok"}
POST /run              body: JSON  → {"job_id": "<uuid>"}
GET  /run/{job_id}/stream          → SSE stream of log/done/error events
GET  /run/{job_id}/result          → Full result dict
DELETE /run/{job_id}               → {"cancelled": "<uuid>"}
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
from starlette.responses import StreamingResponse

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import adoptnet0_runner  # noqa: E402

app = FastAPI(title="AdOpT-NET0 Web Service", version="1.0.0")

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
    work_dir = tempfile.mkdtemp(prefix="adoptnet0_svc_")

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
        result = adoptnet0_runner.run_model(model_data, work_dir, log_fn=_log_fn)
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
    return {"status": "ok", "service": "adoptnet0-web-service"}


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
        name=f"adoptnet0-{job_id[:8]}",
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
