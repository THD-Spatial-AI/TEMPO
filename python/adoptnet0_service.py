"""
AdOpT-NET0 Web Service
----------------------
FastAPI HTTP service that exposes AdOpT-NET0 model runs over HTTP with SSE streaming.

The run lifecycle (/health, /run, /run/{id}/stream, /run/{id}/result, DELETE)
comes from engine_service_base.create_engine_app(); only the AdOpT-NET0-specific
/export and /import routes live here. This service opts into result_500_on_error
so GET /result surfaces a failed run's error message with HTTP 500.

Start locally:
    uvicorn python.adoptnet0_service:app --host 0.0.0.0 --port 5001 --reload

API
---
GET  /health                      → {"status": "ok"}
POST /run              body: JSON  → {"job_id": "<uuid>"}
GET  /run/{job_id}/stream          → SSE stream of log/done/error events
GET  /run/{job_id}/result          → Full result dict
DELETE /run/{job_id}               → {"cancelled": "<uuid>"}
POST /export           body: JSON  → {"zip": "<base64>", "report": [...]}
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path

from fastapi import Request

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import engine_service_base as base  # noqa: E402
import adoptnet0_runner  # noqa: E402
import adoptnet0_translate as translate  # noqa: E402

app = base.create_engine_app(
    engine="adoptnet0",
    title="AdOpT-NET0 Web Service",
    run_model=adoptnet0_runner.run_model,
    result_500_on_error=True,
)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def _export_datasets_to_zip(datasets: list) -> dict:
    buf = io.BytesIO()
    report_all: list = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ds in datasets:
            ds_name = ds.get("name", "base")
            model = ds.get("model") or {}
            with tempfile.TemporaryDirectory() as tmp:
                try:
                    _carriers, rpt = translate.build_model_dir(model, tmp)
                except Exception as exc:
                    report_all.append(f"[{ds_name}] build_model_dir failed: {exc}")
                    continue
                report_all.extend(f"[{ds_name}] {r}" for r in rpt)
                for fpath in Path(tmp).rglob("*"):
                    if fpath.is_file():
                        arc = f"{ds_name}/{fpath.relative_to(tmp).as_posix()}"
                        zf.write(str(fpath), arc)
        if report_all:
            zf.writestr("report.txt", "\n".join(report_all) + "\n")
    buf.seek(0)
    return {
        "zip": base64.b64encode(buf.read()).decode(),
        "report": report_all,
    }


@app.post("/export")
async def export_model(payload: dict) -> dict:
    datasets = payload.get("datasets") or [{"name": "base", "model": payload.get("model") or {}}]
    return await asyncio.to_thread(_export_datasets_to_zip, datasets)


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

def _import_zip_to_model(data: bytes) -> dict:
    buf = io.BytesIO(data)
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(buf) as zf:
            zf.extractall(tmp)
        tmp_path = Path(tmp)
        topo_files = list(tmp_path.rglob("Topology.json"))
        if not topo_files:
            raise ValueError("No Topology.json found in archive")
        # Prefer root-level Topology (not inside period1/)
        root_topos = [f for f in topo_files if "period" not in f.parent.name.lower()]
        case_dir = (root_topos[0] if root_topos else topo_files[0]).parent
        model, report = translate.adoptnet0_to_internal(str(case_dir))
        return {"model": model, "report": report}


@app.post("/import")
async def import_model(request: Request) -> dict:
    data = await request.body()
    return await asyncio.to_thread(_import_zip_to_model, data)
