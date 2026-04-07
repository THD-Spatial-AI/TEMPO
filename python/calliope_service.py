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

    try:
        result = calliope_runner.run_model(model_data, work_dir, log_fn=_log_fn)
        _push({"type": "done", "result": result})
        with _jobs_lock:
            job.update(status="done", result=result, finished_at=time.time())
    except Exception as exc:
        import traceback as _tb
        tb = _tb.format_exc()
        _log_fn(f"ERROR: {exc}")
        _push({"type": "error", "error": str(exc), "traceback": tb})
        with _jobs_lock:
            job.update(status="error", finished_at=time.time())
    finally:
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
            event = await async_queue.get()
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
