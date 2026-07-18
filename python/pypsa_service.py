"""
PyPSA Web Service
-----------------
FastAPI HTTP service that exposes PyPSA model runs over HTTP with SSE streaming,
plus model export/import in PyPSA's native formats.

The run lifecycle (/health, /run, /run/{id}/stream, /run/{id}/result, DELETE)
comes from engine_service_base.create_engine_app(); only the PyPSA-specific
/export and /import routes live here.

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
import os
import sys
import tempfile
from typing import Optional

from fastapi import HTTPException
from starlette.requests import Request

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import engine_service_base as base  # noqa: E402
import pypsa_runner  # noqa: E402

_pypsa_version: Optional[str] = None


def _get_pypsa_version() -> Optional[str]:
    """Lazy import so the service boots (and reports health) even if pypsa is broken."""
    global _pypsa_version
    if _pypsa_version is None:
        try:
            import pypsa
            _pypsa_version = pypsa.__version__
        except Exception:
            _pypsa_version = ""
    return _pypsa_version or None


app = base.create_engine_app(
    engine="pypsa",
    title="PyPSA Web Service",
    run_model=pypsa_runner.run_model,
    health_extra=lambda: {"pypsa_version": _get_pypsa_version()},
)


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
