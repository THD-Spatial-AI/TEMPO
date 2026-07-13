#!/usr/bin/env python3
"""
AdOpT-NET0 Model Runner
-----------------------
Translates TEMPO's internal model format into the AdOpT-NET0 hierarchical directory
structure, executes the optimisation via ModelHub, and extracts results into a dict
that is compatible with TEMPO's Results dashboard.

Entry point:
    run_model(model_data: dict, work_dir: str, log_fn: callable | None) -> dict
"""

import glob
import logging
import os
import threading

import adoptnet0_translate as translate

logging.basicConfig(level=logging.WARNING)

_thread_local = threading.local()


def log(msg: str) -> None:
    fn = getattr(_thread_local, "log_fn", None)
    if fn is not None:
        fn(f"[ADOPTNET0] {msg}")
    else:
        print(f"[ADOPTNET0] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Result extraction from HDF5
# ---------------------------------------------------------------------------

def _extract_results(results_dir: str) -> dict:
    h5_files = (
        glob.glob(os.path.join(results_dir, "**", "*.h5"), recursive=True)
        or glob.glob(os.path.join(results_dir, "*.h5"))
    )
    if not h5_files:
        log("No HDF5 result file found — capacity/dispatch unavailable")
        return {}

    h5_path = sorted(h5_files)[-1]
    log(f"  Reading HDF5 results: {os.path.basename(h5_path)}")

    result: dict = {"objective": None, "solver_status": "ok", "capacity": {}, "dispatch": {}}

    try:
        import h5py
        import numpy as np
    except ImportError:
        log("  h5py not available — skipping detailed result extraction")
        return result

    try:
        with h5py.File(h5_path, "r") as f:
            for candidate in (
                "Summary/costs_total",
                "Summary/Total Cost",
                "Summary/objective",
                "Summary/total_cost",
            ):
                if candidate in f:
                    try:
                        result["objective"] = float(np.array(f[candidate]).ravel()[0])
                        break
                    except Exception:
                        pass

            if result["objective"] is None and "Summary" in f:
                for key in f["Summary"]:
                    if "cost" in key.lower() or "objective" in key.lower():
                        try:
                            result["objective"] = float(np.array(f[f"Summary/{key}"]).ravel()[0])
                            break
                        except Exception:
                            pass

            design_path = "Design/nodes/period1"
            if design_path in f:
                for node in f[design_path]:
                    result["capacity"][node] = {}
                    node_grp = f[f"{design_path}/{node}"]
                    for tech in node_grp:
                        try:
                            arr = np.array(node_grp[tech]).ravel()
                            result["capacity"][node][tech] = float(arr[0]) if arr.size == 1 else arr.tolist()
                        except Exception:
                            pass

            op_path = "Operation/technology_operation/period1"
            if op_path in f:
                for node in f[op_path]:
                    result["dispatch"][node] = {}
                    node_grp = f[f"{op_path}/{node}"]
                    for tech in node_grp:
                        grp = node_grp[tech]
                        for key in ("output", "Output", "out", "technology_output"):
                            if key in grp:
                                try:
                                    result["dispatch"][node][tech] = np.array(grp[key]).ravel().tolist()
                                except Exception:
                                    pass
                                break
    except Exception as exc:
        log(f"  Warning: HDF5 read failed: {exc}")

    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_model(model_data: dict, work_dir: str, log_fn=None) -> dict:
    """
    Translate TEMPO model format → AdOpT-NET0 directory structure, run the
    optimisation, and return a result dict compatible with TEMPO's Results view.
    """
    _thread_local.log_fn = log_fn

    name = model_data.get("name", "TEMPO Model")
    model_config = model_data.get("modelConfig") or {}
    start_date = (model_config.get("startDate") or "2024-01-01")[:10]
    end_date = (model_config.get("endDate") or "2024-12-31")[:10]
    solver = model_data.get("solver") or model_config.get("solver") or "highs"

    locations = model_data.get("locations") or []
    technologies = model_data.get("technologies") or []
    links = model_data.get("links") or []

    if not locations:
        raise ValueError("Model has no locations — add at least one location before running.")

    log(f'Starting AdOpT-NET0 run: "{name}"')
    log(f"  {len(locations)} location(s), {len(technologies)} tech(s), {len(links)} link(s)")
    log(f"  Period: {start_date} → {end_date}, solver: {solver}")

    model_dir = os.path.join(work_dir, "model_data")

    log("  Translating model to AdOpT-NET0 format…")
    carriers, tr_report = translate.build_model_dir(model_data, model_dir)
    for line in tr_report:
        log(f"  [translate] {line}")
    log(f"  Carriers: {carriers}")

    # ── Run AdOpT-NET0 ───────────────────────────────────────────────────────
    try:
        from adopt_net0 import ModelHub
    except ImportError as exc:
        raise RuntimeError(
            f"adopt_net0 package not found: {exc}\n"
            "Run the TEMPO setup wizard to install the AdOpT-NET0 environment."
        ) from exc

    results_dir = os.path.join(model_dir, "results")
    os.makedirs(results_dir, exist_ok=True)

    log("  Constructing ModelHub…")
    hub = ModelHub()

    log("  Reading data…")
    hub.read_data(data_path=model_dir)

    log("  Constructing optimisation model…")
    hub.construct_model()
    hub.construct_balances()

    log(f"  Solving ({solver})…")
    hub.solve()

    log("  Writing HDF5 results…")
    try:
        hub.write_results()
    except Exception as exc:
        log(f"  Warning: write_results raised: {exc}")

    log("  Extracting results from HDF5…")
    extracted = _extract_results(results_dir)

    timestamps = []
    try:
        ts_index = translate.generate_timestamps(start_date, end_date)
        timestamps = [str(ts) for ts in ts_index]
    except Exception:
        pass

    result = {
        "success": True,
        "framework": "adoptnet0",
        "name": name,
        "objective": extracted.get("objective"),
        "solver_status": extracted.get("solver_status", "ok"),
        "capacity": extracted.get("capacity", {}),
        "dispatch": extracted.get("dispatch", {}),
        "timestamps": timestamps,
        "transmission_flow": {},
        "demand_timeseries": {},
    }

    log(f"  Done. Objective = {result['objective']}")
    return result
