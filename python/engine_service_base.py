"""
Engine service base
--------------------
Shared FastAPI scaffolding for the optional engine services (PyPSA, OSeMOSYS,
AdOpT-NET0). Every one of them exposes the same run lifecycle over HTTP with SSE
streaming:

    GET    /health                → {"status": "ok", "engine": ..., ...}
    POST   /run        body: JSON → {"job_id": "<uuid>"}
    GET    /run/{id}/stream       → SSE stream of log/stats/done/error events
    GET    /run/{id}/result       → full result dict (heavy timeseries included)
    DELETE /run/{id}              → {"cancelled": "<uuid>"}

`create_engine_app()` builds that shared surface from a per-engine `run_model`
callable; each service adds only its engine-specific routes (e.g. /export,
/import) to the returned app.

Depends only on fastapi + starlette + stdlib (psutil optional) so it works in
every isolated engine venv. The Calliope 0.6.8/0.7 service keeps its own copy —
its failed-workdir preservation and heavy-key set differ (see calliope_service.py).

The SSE event protocol emitted here is the contract consumed by the JS clients
(src/services/engineClient.js). Change it in one place only.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import threading
import time
import uuid
from typing import Any, Callable, Dict, Optional, Sequence

try:
    import psutil as _psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse

_JOB_TTL_SECONDS = 600
_STATS_INTERVAL_SECONDS = 10

# Large result keys fetched separately via GET /run/{job_id}/result rather than
# inlined in the SSE 'done' event (keeps the EventSource message small).
DEFAULT_HEAVY_KEYS = ("dispatch", "capacity", "timestamps", "transmission_flow", "demand_timeseries")


def create_engine_app(
    *,
    engine: str,
    title: str,
    run_model: Callable[..., dict],
    heavy_keys: Sequence[str] = DEFAULT_HEAVY_KEYS,
    health_extra: Optional[Callable[[], dict]] = None,
    workdir_prefix: Optional[str] = None,
    thread_prefix: Optional[str] = None,
    result_500_on_error: bool = False,
) -> FastAPI:
    """
    Build a FastAPI app with the shared engine run lifecycle.

    engine               short id used in /health ("pypsa") and defaults
    title                FastAPI title ("PyPSA Web Service")
    run_model            callable(model_data, work_dir, log_fn=...) -> result dict
    heavy_keys           result keys omitted from the SSE 'done' summary
    health_extra         optional () -> dict merged into the /health payload
    workdir_prefix       tempdir prefix (default f"{engine}_svc_")
    thread_prefix        worker thread name prefix (default engine)
    result_500_on_error  if True, GET /result returns 500 (not 404) after a
                         failed run and surfaces the stored error message
    """
    workdir_prefix = workdir_prefix or f"{engine}_svc_"
    thread_prefix = thread_prefix or engine

    app = FastAPI(title=title, version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Event loop captured at startup so worker threads can push SSE events.
    state: Dict[str, Any] = {"loop": None}
    jobs: Dict[str, Dict[str, Any]] = {}
    jobs_lock = threading.Lock()

    @app.on_event("startup")
    async def _capture_event_loop() -> None:
        state["loop"] = asyncio.get_event_loop()

    def _cleanup_old_jobs() -> None:
        cutoff = time.time() - _JOB_TTL_SECONDS
        with jobs_lock:
            stale = [
                jid for jid, d in jobs.items()
                if d.get("status") in ("done", "error", "cancelled")
                and (d.get("finished_at") or cutoff) < cutoff
            ]
            for jid in stale:
                del jobs[jid]

    def _stats_monitor_thread(job_id: str, push_fn, stop_event: threading.Event) -> None:
        start = time.time()
        proc = _psutil.Process(os.getpid()) if _HAS_PSUTIL else None

        while not stop_event.wait(timeout=_STATS_INTERVAL_SECONDS):
            with jobs_lock:
                status = jobs.get(job_id, {}).get("status", "done")
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
        job = jobs[job_id]
        async_queue: asyncio.Queue = job["queue"]
        work_dir = tempfile.mkdtemp(prefix=workdir_prefix)

        def _push(event: dict) -> None:
            loop = state["loop"]
            if loop and not loop.is_closed():
                loop.call_soon_threadsafe(async_queue.put_nowait, event)

        def _log_fn(msg: str) -> None:
            with jobs_lock:
                if jobs.get(job_id, {}).get("status") == "cancelled":
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
            result = run_model(model_data, work_dir, log_fn=_log_fn)
            with jobs_lock:
                job.update(status="done", result=result, finished_at=time.time())
            summary = {k: v for k, v in result.items() if k not in heavy_keys}
            _push({"type": "done", "result": summary})
        except BaseException as exc:
            import traceback as _tb
            tb = _tb.format_exc()
            err_msg = str(exc) if str(exc) else repr(exc)
            _log_fn(f"ERROR: {err_msg}")
            _push({"type": "error", "error": err_msg, "traceback": tb})
            with jobs_lock:
                job.update(status="error", error=err_msg, finished_at=time.time())
            if isinstance(exc, (SystemExit, KeyboardInterrupt)):
                raise
        finally:
            _stop_stats.set()
            shutil.rmtree(work_dir, ignore_errors=True)
            _cleanup_old_jobs()

    @app.get("/health")
    def health() -> dict:
        payload = {"status": "ok", "service": f"{engine}-web-service", "engine": engine}
        if health_extra:
            payload.update(health_extra())
        return payload

    @app.post("/run")
    async def start_run(model_data: dict) -> dict:
        if not model_data:
            raise HTTPException(status_code=400, detail="Empty model payload")

        job_id = str(uuid.uuid4())
        async_queue: asyncio.Queue = asyncio.Queue()

        with jobs_lock:
            jobs[job_id] = {
                "status": "running",
                "queue": async_queue,
                "result": None,
                "finished_at": None,
            }

        thread = threading.Thread(
            target=_run_job_thread,
            args=(job_id, model_data),
            daemon=True,
            name=f"{thread_prefix}-{job_id[:8]}",
        )
        thread.start()
        return {"job_id": job_id}

    @app.get("/run/{job_id}/stream")
    async def stream_run(job_id: str) -> StreamingResponse:
        with jobs_lock:
            job = jobs.get(job_id)

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
        with jobs_lock:
            job = jobs.get(job_id)

        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if result_500_on_error and job.get("status") == "error":
            raise HTTPException(status_code=500, detail=job.get("error", "Runner failed"))
        if job.get("status") != "done" or job.get("result") is None:
            raise HTTPException(status_code=404, detail="Result not yet available")

        return job["result"]

    @app.delete("/run/{job_id}")
    async def cancel_run(job_id: str) -> dict:
        with jobs_lock:
            if job_id not in jobs:
                raise HTTPException(status_code=404, detail="Job not found")
            jobs[job_id].update(status="cancelled", finished_at=time.time())

        return {"cancelled": job_id}

    return app
