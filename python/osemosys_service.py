"""
OSeMOSYS Web Service
--------------------
FastAPI HTTP service that exposes OSeMOSYS model runs (otoole + GLPK) over HTTP
with SSE streaming, plus model export/import in the otoole CSV format.

The run lifecycle (/health, /run, /run/{id}/stream, /run/{id}/result, DELETE)
comes from engine_service_base.create_engine_app(); only the OSeMOSYS-specific
/export and /import routes live here.

Start locally:
    uvicorn python.osemosys_service:app --host 0.0.0.0 --port 5004 --reload

API
---
GET  /health                      → {"status": "ok", "engine": "osemosys", ...}
POST /run              body: JSON  → {"job_id": "<uuid>"}
GET  /run/{job_id}/stream          → SSE stream of log/done/error events
GET  /run/{job_id}/result          → Full result dict
DELETE /run/{job_id}               → {"cancelled": "<uuid>"}
POST /export           body: JSON  → ZIP archive (parity: CSVs + model file + datafile; options.legacy)
POST /import           body: ZIP   → {"model": {...}, "report": [...]}
"""

from __future__ import annotations

import asyncio
import io
import os
import shutil
import sys
import tempfile
import zipfile
from typing import Optional

from fastapi import HTTPException, Request

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import engine_service_base as base  # noqa: E402
import osemosys_runner  # noqa: E402
import osemosys_import as ose_import  # noqa: E402

_otoole_version: Optional[str] = None


def _get_otoole_version() -> Optional[str]:
    """Lazy import so the service boots (and reports health) even if otoole is broken."""
    global _otoole_version
    if _otoole_version is None:
        try:
            from importlib.metadata import version
            _otoole_version = version("otoole")
        except Exception:
            _otoole_version = ""
    return _otoole_version or None


def _find_glpsol() -> Optional[str]:
    return shutil.which("glpsol")


app = base.create_engine_app(
    engine="osemosys",
    title="OSeMOSYS Web Service",
    run_model=osemosys_runner.run_model,
    health_extra=lambda: {
        "otoole_version": _get_otoole_version(),
        "glpsol_path": _find_glpsol(),
    },
)


@app.post("/export")
async def export_model(payload: dict) -> dict:
    """Parity dataset by default (what TEMPO solves, self-contained); options.legacy
    = true gives the old CH/DC representation (default scheme 4×3)."""
    datasets = payload.get("datasets") or [{"name": "base", "model": payload.get("model") or {}}]
    options = payload.get("options") or {}
    return await asyncio.to_thread(osemosys_runner.export_datasets_to_zip, datasets,
                                   options.get("scheme"), bool(options.get("legacy")))


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
