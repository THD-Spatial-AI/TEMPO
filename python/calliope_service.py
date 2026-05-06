"""
Calliope Web Service
--------------------
FastAPI HTTP service that exposes Calliope model runs over HTTP with SSE streaming.

Start locally:
    uvicorn python.calliope_service:app --host 0.0.0.0 --port 5000 --reload

Via Docker:
    docker compose up calliope-runner

API
---
GET  /health                      → {"status": "ok"}
POST /run              body: JSON  → {"job_id": "<uuid>"}
GET  /run/{job_id}/stream          → SSE stream of log/done/error events
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

# ---------------------------------------------------------------------------
# Make calliope_runner importable (we live alongside it in python/)
# ---------------------------------------------------------------------------
_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import calliope_runner  # noqa: E402

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Calliope Web Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Event-loop reference — captured at startup so worker threads can push events
# ---------------------------------------------------------------------------

_event_loop: asyncio.AbstractEventLoop | None = None


@app.on_event("startup")
async def _capture_event_loop() -> None:
    global _event_loop
    _event_loop = asyncio.get_event_loop()


# ---------------------------------------------------------------------------
# In-memory job store
# ---------------------------------------------------------------------------

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_JOB_TTL_SECONDS = 600  # prune completed jobs after 10 minutes


def _cleanup_old_jobs() -> None:
    cutoff = time.time() - _JOB_TTL_SECONDS
    with _jobs_lock:
        stale = [
            jid
            for jid, d in _jobs.items()
            if d.get("status") in ("done", "error", "cancelled")
            and (d.get("finished_at") or cutoff) < cutoff
        ]
        for jid in stale:
            del _jobs[jid]


# ---------------------------------------------------------------------------
# Worker thread
# ---------------------------------------------------------------------------

_STATS_INTERVAL_SECONDS = 10  # how often to emit a [STATS] log line


def _stats_monitor_thread(job_id: str, push_fn, stop_event: threading.Event) -> None:
    """
    Runs in its own daemon thread alongside the Calliope worker.
    Every _STATS_INTERVAL_SECONDS it pushes a 'stats' SSE event with RAM/CPU info
    so the frontend can render a live resource panel.
    """
    start = time.time()
    if _HAS_PSUTIL:
        proc = _psutil.Process(os.getpid())
    else:
        proc = None

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
                ram_total_gb = vm.total / (1024 ** 3)
                ram_used_gb  = vm.used  / (1024 ** 3)
                ram_pct      = vm.percent
                push_fn({
                    "type": "stats",
                    "elapsed": elapsed_str,
                    "cpu_pct": round(cpu_pct, 1),
                    "proc_ram_mb": round(mem_mb, 1),
                    "sys_ram_used_gb": round(ram_used_gb, 2),
                    "sys_ram_total_gb": round(ram_total_gb, 2),
                    "sys_ram_pct": round(ram_pct, 1),
                })
            except Exception:
                push_fn({"type": "stats", "elapsed": elapsed_str,
                         "cpu_pct": None, "proc_ram_mb": None,
                         "sys_ram_pct": None})
        else:
            push_fn({"type": "stats", "elapsed": elapsed_str,
                     "cpu_pct": None, "proc_ram_mb": None, "sys_ram_pct": None})


def _run_job_thread(job_id: str, model_data: dict) -> None:
    """Runs in a background thread; pushes SSE events to the async queue."""
    job = _jobs[job_id]
    async_queue: asyncio.Queue = job["queue"]
    work_dir = tempfile.mkdtemp(prefix="calliope_svc_")

    def _push(event: dict) -> None:
        if _event_loop and not _event_loop.is_closed():
            _event_loop.call_soon_threadsafe(async_queue.put_nowait, event)

    def _log_fn(msg: str) -> None:
        # Check if job has been cancelled before forwarding log lines
        with _jobs_lock:
            if _jobs.get(job_id, {}).get("status") == "cancelled":
                return
        _push({"type": "log", "line": msg})

    # Keys whose values can be large timeseries arrays — kept server-side, fetched
    # via GET /run/{job_id}/result so the SSE message stays small.
    _HEAVY_KEYS = ("dispatch", "transmission_flow", "timestamps", "demand_timeseries")

    # Start resource monitor
    _stop_stats = threading.Event()
    _stats_thread = threading.Thread(
        target=_stats_monitor_thread,
        args=(job_id, _push, _stop_stats),
        daemon=True,
        name=f"stats-{job_id[:8]}",
    )
    _stats_thread.start()

    try:
        result = calliope_runner.run_model(model_data, work_dir, log_fn=_log_fn)
        with _jobs_lock:
            job.update(status="done", result=result, finished_at=time.time())
        # Only send lightweight summary in the SSE event to avoid crashing
        # the browser EventSource with a 50-100 MB JSON blob.
        summary = {k: v for k, v in result.items() if k not in _HEAVY_KEYS}
        _push({"type": "done", "result": summary})
    except BaseException as exc:  # catch SystemExit, KeyboardInterrupt etc. too
        import traceback as _tb
        tb = _tb.format_exc()
        err_msg = str(exc) if str(exc) else repr(exc)
        _log_fn(f"ERROR: {err_msg}")
        _push({"type": "error", "error": err_msg, "traceback": tb})
        with _jobs_lock:
            job.update(status="error", finished_at=time.time())
        # Re-raise SystemExit/KeyboardInterrupt so the service can shut down cleanly.
        # Regular exceptions (RuntimeError, ValueError, etc.) are swallowed here.
        if isinstance(exc, (SystemExit, KeyboardInterrupt)):
            raise
    finally:
        _stop_stats.set()
        shutil.rmtree(work_dir, ignore_errors=True)
        _cleanup_old_jobs()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "calliope-web-service"}


@app.post("/run")
async def start_run(model_data: dict) -> dict:
    """
    Start a Calliope optimisation run.
    Returns {"job_id": "<uuid>"} immediately.
    Stream progress via GET /run/{job_id}/stream.
    """
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
        name=f"calliope-{job_id[:8]}",
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/run/{job_id}/stream")
async def stream_run(job_id: str) -> StreamingResponse:
    """
    Server-Sent Events stream for a running Calliope job.

    Each SSE message carries a JSON payload of one of these shapes:
        {"type": "log",   "line": "..."}
        {"type": "done",  "result": {...}}
        {"type": "error", "error": "...", "traceback": "..."}
    """
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async_queue: asyncio.Queue = job["queue"]

    async def event_generator():
        # Immediately confirm connection
        yield ": connected\n\n"
        while True:
            # Use a timeout so we can send SSE keepalive comments periodically.
            # This prevents intermediate proxies and EventSource implementations
            # from closing an idle connection while the solver is crunching numbers.
            try:
                event = await asyncio.wait_for(async_queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                # No event yet — send a keepalive comment and loop
                yield ": keepalive\n\n"
                continue
            yield f"data: {json.dumps(event)}\n\n"
            if event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx buffering
        },
    )


@app.get("/run/{job_id}/result")
async def get_result(job_id: str) -> dict:
    """
    Return the full result dict for a completed job (including heavy timeseries).
    The SSE /stream endpoint sends only a lightweight summary in the 'done' event;
    the frontend fetches this endpoint afterwards to get dispatch, transmission_flow, etc.
    """
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "done" or job.get("result") is None:
        raise HTTPException(status_code=404, detail="Result not yet available")

    return job["result"]


@app.delete("/run/{job_id}")
async def cancel_run(job_id: str) -> dict:
    """
    Mark a job as cancelled. The worker thread will stop forwarding log events.
    Note: Calliope itself cannot be interrupted mid-solve; the thread finishes
    but its results are discarded.
    """
    with _jobs_lock:
        if job_id not in _jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        _jobs[job_id].update(status="cancelled", finished_at=time.time())

    return {"cancelled": job_id}
