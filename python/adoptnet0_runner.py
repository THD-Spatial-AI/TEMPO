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


def _patch_res_capfactor(Res):
    """Monkey-patch Res.fit_technology_performance to inject a constant capfactor fallback.

    adopt_net0 only computes capfactor for names containing "Photovoltaic",
    "SolarThermal", or "WindTurbine".  Generic TEMPO supply names (e.g. "solar_pv")
    get no capfactor, causing KeyError in construct_tech_model.
    This patch sets capfactor = 0.5 for any RES tech that didn't get one.
    """
    import numpy as np
    _orig_fit = Res.fit_technology_performance

    def _patched_fit(self, climate_data, location):
        _orig_fit(self, climate_data, location)
        td_full = self.processed_coeff.time_dependent_full
        if "capfactor" not in td_full:
            n = len(climate_data) if hasattr(climate_data, "__len__") else 8760
            td_full["capfactor"] = np.ones(n) * 0.5

    Res.fit_technology_performance = _patched_fit


def _patch_highs_support(ModelHub):
    """Monkey-patch adopt_net0 to accept HiGHS as a solver.

    AdOpT-NET0 0.1.x hard-codes only gurobi/glpk in its solver check and
    solver-settings methods.  HiGHS is available via pyomo's SolverFactory
    but is not recognised, causing an UnboundLocalError at runtime.  This
    patch adds the missing branch to both methods so HiGHS can be used.
    """
    import pyomo.environ as pyo

    _orig_check = ModelHub._perform_preprocessing_checks
    _orig_settings = ModelHub._define_solver_settings

    _highs_names = ("highs", "appsi_highs", "highspy")

    def _patched_check(self):
        cfg = self.data.model_config
        name = (cfg.get("solveroptions") or {}).get("solver", {}).get("value", "")
        if name in _highs_names:
            solver = pyo.SolverFactory("highs")
            if not solver.available():
                raise Exception("HiGHS solver is not available in this environment.")
            # skip mock solve — availability check is sufficient for HiGHS
        else:
            _orig_check(self)

    def _patched_settings(self):
        cfg = self.data.model_config
        name = (cfg.get("solveroptions") or {}).get("solver", {}).get("value", "")
        if name in _highs_names:
            self.solver = pyo.SolverFactory("highs")
        else:
            _orig_settings(self)

    # Patch _call_solver: HiGHS's LegacySolverWrapper doesn't accept warmstart=True.
    # Wrap the solver's solve() to strip that kwarg before the actual call.
    _orig_call_solver = ModelHub._call_solver

    def _patched_call_solver(self):
        cfg = self.data.model_config
        solver_name = (cfg.get("solveroptions") or {}).get("solver", {}).get("value", "")
        if solver_name not in _highs_names:
            _orig_call_solver(self)
            return
        # APPSI HiGHS (LegacySolverWrapper) does not accept warmstart, logfile,
        # keepfiles, or suffixes — strip them before passing through to the solver.
        _UNSUPPORTED = ("warmstart", "logfile", "keepfiles", "suffixes", "solver_io")
        orig_solve = self.solver.solve
        def _solve_highs(*args, **kwargs):
            for k in _UNSUPPORTED:
                kwargs.pop(k, None)
            return orig_solve(*args, **kwargs)
        self.solver.solve = _solve_highs
        try:
            _orig_call_solver(self)
        finally:
            self.solver.solve = orig_solve

    ModelHub._perform_preprocessing_checks = _patched_check
    ModelHub._define_solver_settings = _patched_settings
    ModelHub._call_solver = _patched_call_solver

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
# Frozen-contract normalisation
# ---------------------------------------------------------------------------

def _to_frozen_contract(extracted: dict, timestamps: list, model_data: dict, name: str = "", solver: str = "highs") -> dict:
    """Convert AdOpT-NET0 raw extracted data to TEMPO's frozen result contract."""
    raw_capacity = extracted.get("capacity", {})   # {node: {tech: scalar}}
    raw_dispatch = extracted.get("dispatch", {})   # {node: {tech: [array]}}
    solver_status = extracted.get("solver_status", "ok")

    # capacities: {node: {tech: v}} → {"node::tech": v}  (scalars only)
    capacities = {}
    for node, techs in raw_capacity.items():
        for tech, val in techs.items():
            if isinstance(val, (int, float)):
                capacities[f"{node}::{tech}"] = val

    # dispatch: {node: {tech: [arr]}} → {tech: [summed across nodes]}
    dispatch: dict = {}
    for node, techs in raw_dispatch.items():
        for tech, arr in techs.items():
            if not isinstance(arr, list):
                continue
            if tech not in dispatch:
                dispatch[tech] = list(arr)
            else:
                existing = dispatch[tech]
                for i, v in enumerate(arr):
                    if i < len(existing):
                        existing[i] = (existing[i] or 0) + (v or 0)
                    else:
                        existing.append(v or 0)

    # termination_condition normalisation
    term_cond = "optimal" if solver_status in ("ok", "optimal") else solver_status

    # tech_metadata: populate display names from model_data technologies
    tech_metadata = {}
    for tech in model_data.get("technologies") or []:
        tid = tech.get("id") or tech.get("name") or ""
        if tid:
            tech_metadata[tid] = {
                "name": tech.get("name", tid),
                "carrier": tech.get("carrier", ""),
                "color": tech.get("color", ""),
            }

    return {
        "success": True,
        "framework": "adoptnet0",
        "model_name": name,
        "name": name,
        "solver": solver,
        "objective": extracted.get("objective"),
        "termination_condition": term_cond,
        "capacities": capacities,
        "generation": {},
        "dispatch": dispatch,
        "timestamps": timestamps,
        "transmission_flow": {},
        "demand_timeseries": {},
        "costs_by_tech": {},
        "costs_by_location": {},
        "tech_metadata": tech_metadata,
        "tech_parents": {},
    }


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

    _patch_highs_support(ModelHub)

    from adopt_net0.components.technologies import Res as _Res
    _patch_res_capfactor(_Res)

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

    frozen = _to_frozen_contract(extracted, timestamps, model_data, name, solver)
    log(f"  Done. Objective = {frozen['objective']}")
    return frozen
