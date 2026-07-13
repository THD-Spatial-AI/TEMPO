#!/usr/bin/env python3
"""
OSeMOSYS Model Runner
---------------------
Workflow:
  1. osemosys_translate → otoole-compatible CSVs
  2. _write_datafile()  → GNU MathProg .dat file (no otoole dependency)
  3. glpsol -m osemosys.txt -d data.dat -o log.txt
  4. _build_contract()  → frozen TEMPO result contract

The .dat file includes  param ResultsPath  pointing at a results/ subdirectory;
the OSeMOSYS model's table statements write CSVs there automatically.

Entry point:
    run_model(model_data: dict, work_dir: str, log_fn: callable | None) -> dict
"""

from __future__ import annotations

import csv
import math
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

_this_dir = os.path.dirname(os.path.abspath(__file__))
if _this_dir not in sys.path:
    sys.path.insert(0, _this_dir)

import osemosys_translate as translate
import osemosys_timeslices as timeslices

_OSEMOSYS_TXT = os.path.join(_this_dir, "osemosys", "osemosys.txt")
_SOLVERS_DIR = os.path.join(os.path.dirname(_this_dir), "solvers")

_thread_local = threading.local()


def log(msg: str) -> None:
    fn = getattr(_thread_local, "log_fn", None)
    if fn is not None:
        fn(f"[OSeMOSYS] {msg}")
    else:
        print(f"[OSeMOSYS] {msg}", flush=True)


# ─── glpsol path ─────────────────────────────────────────────────────────────

def _find_glpsol() -> str:
    """Return glpsol binary path, checking PATH then bundled solvers dir."""
    found = shutil.which("glpsol")
    if found:
        return found
    import platform
    sub = "windows" if platform.system() == "Windows" else "linux"
    binary = "glpsol.exe" if platform.system() == "Windows" else "glpsol"
    bundled = os.path.join(_SOLVERS_DIR, sub, binary)
    if os.path.isfile(bundled):
        return bundled
    raise FileNotFoundError(
        f"glpsol not found on PATH or in {_SOLVERS_DIR}. "
        "Install GLPK or ensure the bundled binary is present."
    )


# ─── GLPK datafile writer ─────────────────────────────────────────────────────

def _read_csv(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_datafile(csv_dir: str, results_dir: str, discount_rate: float = 0.05) -> str:
    """Convert otoole CSV directory to a GLPK MathProg .dat file.

    Returns the path to the written datafile.
    """
    dat_path = os.path.join(csv_dir, "osemosys.dat")

    def _read(name: str) -> list[dict]:
        return _read_csv(os.path.join(csv_dir, name))

    lines: list[str] = ["data;", ""]

    # ResultsPath — forward slashes required on all platforms
    rp = results_dir.replace("\\", "/")
    lines.append(f'param ResultsPath := "{rp}" ;')
    lines.append("")

    # ── Sets ─────────────────────────────────────────────────────────────────
    set_files = {
        "REGION": "REGION.csv",
        "TECHNOLOGY": "TECHNOLOGY.csv",
        "FUEL": "FUEL.csv",
        "YEAR": "YEAR.csv",
        "TIMESLICE": "TIMESLICE.csv",
        "MODE_OF_OPERATION": "MODE_OF_OPERATION.csv",
        "EMISSION": "EMISSION.csv",
        "STORAGE": "STORAGE.csv",
    }
    for set_name, fname in set_files.items():
        rows = _read(fname)
        vals = " ".join(r["VALUE"] for r in rows)
        lines.append(f"set {set_name} := {vals} ;")
    # Additional sets required by OSeMOSYS 2017 (empty — not used in single-period model)
    for extra in ("SEASON", "DAYTYPE", "DAILYTIMEBRACKET"):
        lines.append(f"set {extra} :=  ;")
    lines.append("")

    # ── Required scalar params ────────────────────────────────────────────────
    regions = [r["VALUE"] for r in _read("REGION.csv")]
    years = [r["VALUE"] for r in _read("YEAR.csv")]

    # DiscountRate[r] — required, no default in model
    lines.append("param DiscountRate :=")
    for r in regions:
        lines.append(f"  [{r}] {discount_rate}")
    lines.append(";")
    lines.append("")

    # DepreciationMethod[r] — 1 = sinking-fund
    lines.append("param DepreciationMethod :=")
    for r in regions:
        lines.append(f"  [{r}] 1")
    lines.append(";")
    lines.append("")

    # ── Multi-dim parameters from CSV files ───────────────────────────────────
    # Mapping: csv_file → (glpk_param_name, index_cols, value_col)
    param_defs = [
        # Performance
        ("CapacityFactor.csv",            "CapacityFactor",            ["REGION", "TECHNOLOGY", "TIMESLICE", "YEAR"]),
        ("AvailabilityFactor.csv",         "AvailabilityFactor",        ["REGION", "TECHNOLOGY", "YEAR"]),
        ("CapacityToActivityUnit.csv",     "CapacityToActivityUnit",    ["REGION", "TECHNOLOGY"]),
        ("ResidualCapacity.csv",           "ResidualCapacity",          ["REGION", "TECHNOLOGY", "YEAR"]),
        ("OperationalLife.csv",            "OperationalLife",           ["REGION", "TECHNOLOGY"]),
        ("InputActivityRatio.csv",         "InputActivityRatio",        ["REGION", "TECHNOLOGY", "FUEL", "MODE_OF_OPERATION", "YEAR"]),
        ("OutputActivityRatio.csv",        "OutputActivityRatio",       ["REGION", "TECHNOLOGY", "FUEL", "MODE_OF_OPERATION", "YEAR"]),
        # Costs
        ("CapitalCost.csv",                "CapitalCost",               ["REGION", "TECHNOLOGY", "YEAR"]),
        ("FixedCost.csv",                  "FixedCost",                 ["REGION", "TECHNOLOGY", "YEAR"]),
        ("VariableCost.csv",               "VariableCost",              ["REGION", "TECHNOLOGY", "MODE_OF_OPERATION", "YEAR"]),
        # Capacity constraints
        ("TotalAnnualMaxCapacity.csv",     "TotalAnnualMaxCapacity",    ["REGION", "TECHNOLOGY", "YEAR"]),
        # Demand
        ("SpecifiedAnnualDemand.csv",      "SpecifiedAnnualDemand",     ["REGION", "FUEL", "YEAR"]),
        ("SpecifiedDemandProfile.csv",     "SpecifiedDemandProfile",    ["REGION", "FUEL", "TIMESLICE", "YEAR"]),
        ("YearSplit.csv",                  "YearSplit",                 ["TIMESLICE", "YEAR"]),
    ]

    for fname, param_name, idx_cols in param_defs:
        rows = _read(fname)
        if not rows:
            continue
        lines.append(f"param {param_name} default 0 :=")
        for row in rows:
            idx = ",".join(row[c] for c in idx_cols)
            val = row.get("VALUE", "0")
            lines.append(f"  [{idx}] {val}")
        lines.append(";")
        lines.append("")

    lines.append("end;")

    with open(dat_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return dat_path


# ─── Run glpsol ──────────────────────────────────────────────────────────────

def _run_glpsol(glpsol: str, osemosys_txt: str, dat_path: str,
                output_path: str, log_fn) -> None:
    """Run glpsol; stream stdout/stderr to log_fn line by line."""
    cmd = [glpsol, "--math", osemosys_txt, "--data", dat_path, "-o", output_path]
    # Ensure glpsol DLL (Windows) is found beside the binary
    env = os.environ.copy()
    glpsol_dir = os.path.dirname(glpsol)
    path_var = env.get("PATH", "")
    if glpsol_dir and glpsol_dir not in path_var:
        env["PATH"] = glpsol_dir + os.pathsep + path_var

    log(f"Running: {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", env=env,
    )
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            log_fn(f"[glpsol] {line}")
    proc.wait()
    if proc.returncode not in (0, 5):  # 5 = GLPK "problem has no primal solution"
        raise RuntimeError(f"glpsol exited with code {proc.returncode}")


def _parse_glpsol_output(output_path: str) -> tuple[str, float | None]:
    """Return (termination_condition, objective_value) from the glpsol text output."""
    if not os.path.exists(output_path):
        return "unknown", None
    termination = "unknown"
    objective = None
    with open(output_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            lc = line.strip().lower()
            if "status:" in lc:
                if "optimal" in lc:
                    termination = "optimal"
                elif "infeasible" in lc:
                    termination = "infeasible"
                elif "unbounded" in lc:
                    termination = "unbounded"
            if "objective:" in lc:
                m = re.search(r"=\s*([\d.eE+\-]+)", line)
                if m:
                    try:
                        objective = float(m.group(1))
                    except ValueError:
                        pass
    return termination, objective


# ─── Result extraction ────────────────────────────────────────────────────────

def _reverse_tech_map(model_data: dict) -> dict:
    """Build {osem_tech_id: (loc_name, tid, parent)} from model_data."""
    technologies = model_data.get("technologies") or []
    locations = model_data.get("locations") or []
    links = model_data.get("links") or []

    by_name = {t.get("name", ""): t for t in technologies}
    by_id = {str(t.get("id", "")): t for t in technologies}

    def _find(ref):
        return by_name.get(str(ref)) or by_id.get(str(ref))

    reverse: dict = {}

    for loc in locations:
        loc_name = loc.get("name") or loc.get("id", "loc")
        loc_s = translate._sid(loc_name)
        for tech_ref in (loc.get("techs") or {}):
            tech = _find(tech_ref)
            if tech is None:
                continue
            tid = tech.get("name") or tech.get("id") or tech_ref
            tid_s = translate._sid(tid)
            p = translate._parent(tech)
            if p in ("supply", "supply_plus", "conversion", "conversion_plus"):
                reverse[f"{loc_s}_{tid_s}"] = (loc_name, tid, p)
            elif p == "storage":
                reverse[f"{loc_s}_{tid_s}_CH"] = (loc_name, tid, "storage_charge")
                reverse[f"{loc_s}_{tid_s}_DC"] = (loc_name, tid, "storage_discharge")

    for lnk in links:
        from_name = lnk.get("from", "")
        to_name = lnk.get("to", "")
        tech = _find(lnk.get("tech") or "")
        tid = (tech.get("name") or tech.get("id") or "TX") if tech else "TX"
        from_s = translate._sid(from_name)
        to_s = translate._sid(to_name)
        tid_s = translate._sid(tid)
        reverse[f"{from_s}_{to_s}_{tid_s}"] = (from_name, tid, "transmission_fwd")
        reverse[f"{to_s}_{from_s}_{tid_s}"] = (to_name, tid, "transmission_rev")

    return reverse


def _build_contract(results_dir: str, model_data: dict, model_name: str,
                    year: int, scheme: dict, n_hours: int,
                    termination: str, objective: float | None) -> dict:
    """Read OSeMOSYS result CSVs and build the frozen TEMPO contract."""
    _KWH_TO_PJ = 3.6e-9

    def _r(name: str) -> list[dict]:
        return _read_csv(os.path.join(results_dir, name))

    reverse = _reverse_tech_map(model_data)

    # ── capacities ────────────────────────────────────────────────────────────
    capacities: dict = {}
    for row in _r("TotalCapacityAnnual.csv"):
        tech = row.get("TECHNOLOGY", "")
        cap_gw = float(row.get("VALUE", 0))
        if cap_gw <= 0:
            continue
        if tech in reverse:
            loc_name, tid, p = reverse[tech]
            key = f"{loc_name}::{tid}"
            if p in ("storage_charge",):
                key = f"{loc_name}::{tid}"  # combine under base tid
            elif p.startswith("transmission"):
                continue  # tx capacity excluded from capacities dict
            if key not in capacities or cap_gw > capacities[key]:
                capacities[key] = cap_gw * 1e6  # GW → kW

    # ── Production per timeslice → dispatch timeseries ────────────────────────
    labels = timeslices.slice_labels(scheme)
    year_split = timeslices.year_split_for_n_hours(n_hours, scheme)

    # Aggregate ProductionByTechnology [r, l, t, f, y] → {tech: {slice: PJ}}
    prod_by_slice: dict = {}
    for row in _r("ProductionByTechnology.csv"):
        tech = row.get("TECHNOLOGY", "")
        lbl = row.get("TIMESLICE", "")
        val_pj = float(row.get("VALUE", 0))
        if val_pj <= 0:
            continue
        prod_by_slice.setdefault(tech, {})
        prod_by_slice[tech][lbl] = prod_by_slice[tech].get(lbl, 0.0) + val_pj

    # ── Generation totals ─────────────────────────────────────────────────────
    generation: dict = {}
    for row in _r("TotalTechnologyAnnualActivity.csv"):
        tech = row.get("TECHNOLOGY", "")
        val_pj = float(row.get("VALUE", 0))
        if val_pj <= 0:
            continue
        if tech in reverse:
            loc_name, tid, p = reverse[tech]
            if p.startswith("transmission"):
                continue
            ess_map = {t.get("name"): t for t in (model_data.get("technologies") or [])}
            eff_tech = ess_map.get(tid) or {}
            carrier = translate._carrier_out(eff_tech)
            key = f"{loc_name}::{tid}::{carrier}"
            generation[key] = generation.get(key, 0.0) + val_pj / _KWH_TO_PJ  # PJ → kWh

    # ── Dispatch (hourly) ─────────────────────────────────────────────────────
    dispatch: dict = {}
    for tech, slices_prod in prod_by_slice.items():
        if tech not in reverse:
            continue
        loc_name, tid, p = reverse[tech]
        if p.startswith("transmission") or p == "demand":
            continue
        # Convert PJ per timeslice → mean kW per timeslice
        slices_mean: dict = {}
        for lbl in labels:
            pj = slices_prod.get(lbl, 0.0)
            n_in_slice = year_split.get(lbl, 1.0 / len(labels)) * n_hours
            slices_mean[lbl] = (pj / _KWH_TO_PJ / n_in_slice) if n_in_slice > 0 else 0.0
        hourly = timeslices.broadcast(slices_mean, year_split, scheme, n_hours)
        if max(hourly) > 1e-6:
            dispatch[tid] = [round(v, 3) for v in hourly]

    # ── Transmission flow ─────────────────────────────────────────────────────
    # TX techs are conversion pairs; ProductionByTechnology gives delivered at destination
    tx_fwd: dict = {}  # (from, to, tid) → {slice: kW}
    for tech, slices_prod in prod_by_slice.items():
        if tech not in reverse:
            continue
        loc_name, tid, p = reverse[tech]
        if p != "transmission_fwd":
            continue
        # tech = {from}_{to}_{tid} → find 'to' location from the link
        for lnk in (model_data.get("links") or []):
            from_n = lnk.get("from", "")
            to_n = lnk.get("to", "")
            lt = _find_link_tech(lnk, model_data)
            lt_tid = (lt.get("name") or lt.get("id") or "TX") if lt else "TX"
            if (translate._sid(from_n) + "_" + translate._sid(to_n) + "_" + translate._sid(lt_tid)) == tech:
                slices_mean_tx: dict = {}
                for lbl in labels:
                    pj = slices_prod.get(lbl, 0.0)
                    n_in_slice = year_split.get(lbl, 1.0 / len(labels)) * n_hours
                    slices_mean_tx[lbl] = (pj / _KWH_TO_PJ / n_in_slice) if n_in_slice > 0 else 0.0
                hourly_tx = timeslices.broadcast(slices_mean_tx, year_split, scheme, n_hours)
                tx_fwd[(from_n, to_n, lt_tid)] = [round(v, 3) for v in hourly_tx]
                break

    transmission_flow: dict = {}
    for (from_n, to_n, tid), hourly_vals in tx_fwd.items():
        key = "::".join(sorted([from_n, to_n]))
        if key not in transmission_flow:
            transmission_flow[key] = {"from": from_n, "to": to_n, "timeseries": hourly_vals}

    # ── Demand timeseries (from input profile, tiled) ─────────────────────────
    demand_total: list[float] = [0.0] * n_hours
    for loc in (model_data.get("locations") or []):
        loc_tech_refs = loc.get("techs") or {}
        dp_ts = (loc.get("demandProfile") or {}).get("timeseries")
        for tech_ref in loc_tech_refs:
            techs_map = {t.get("name"): t for t in (model_data.get("technologies") or [])}
            tech = techs_map.get(str(tech_ref))
            if tech is None or translate._parent(tech) != "demand":
                continue
            if isinstance(dp_ts, list):
                vals = [float(v) for v in dp_ts]
            else:
                resource = abs(float((tech.get("constraints") or {}).get("resource") or 0))
                vals = [resource] * 24 if resource > 0 else []
            if not vals:
                continue
            import itertools
            full = list(itertools.islice(itertools.cycle(vals), n_hours))
            for i, v in enumerate(full):
                demand_total[i] += v

    # ── Cost breakdowns ───────────────────────────────────────────────────────
    costs_by_tech: dict = {}
    costs_by_location: dict = {}

    def _add_cost_row(rows, scale=1.0):
        for row in rows:
            tech = row.get("TECHNOLOGY", "")
            val = float(row.get("VALUE", 0)) * scale
            if val <= 0 or tech not in reverse:
                continue
            loc_name, tid, p = reverse[tech]
            costs_by_tech[tid] = costs_by_tech.get(tid, 0.0) + val
            costs_by_location.setdefault(loc_name, {})
            costs_by_location[loc_name][tid] = costs_by_location[loc_name].get(tid, 0.0) + val

    _add_cost_row(_r("CapitalInvestment.csv"))
    _add_cost_row(_r("AnnualFixedOperatingCost.csv"))
    _add_cost_row(_r("AnnualVariableOperatingCost.csv"))

    # ── Tech metadata ─────────────────────────────────────────────────────────
    tech_meta: dict = {}
    tech_parents: dict = {}
    for tdef in (model_data.get("technologies") or []):
        tn = tdef.get("name") or tdef.get("id", "")
        if not tn:
            continue
        ess = tdef.get("essentials") or {}
        p = str(ess.get("parent") or tdef.get("parent") or "")
        cout = translate._carrier_out(tdef)
        tech_meta[tn] = {
            "parent": p, "carrier_out": cout,
            "display_name": str(ess.get("name") or tn),
            "color": str(ess.get("color") or ""),
        }
        tech_parents[tn] = p

    # ── Build timestamps ──────────────────────────────────────────────────────
    model_config = model_data.get("modelConfig") or {}
    start_date = (model_config.get("startDate") or "2024-01-01")[:10]
    try:
        from datetime import datetime, timedelta
        t0 = datetime.fromisoformat(start_date)
        timestamps = [(t0 + timedelta(hours=i)).strftime("%Y-%m-%d %H:%M:%S") for i in range(n_hours)]
    except Exception:
        timestamps = [str(i) for i in range(n_hours)]

    # ── Objective ─────────────────────────────────────────────────────────────
    if objective is None:
        # Fall back to sum of TotalDiscountedCost.csv
        total_cost = sum(float(r.get("VALUE", 0)) for r in _r("TotalDiscountedCost.csv"))
        objective = total_cost if total_cost > 0 else None

    contract = {
        "model_name": model_name,
        "solver": "glpk",
        "success": termination == "optimal",
        "termination_condition": termination,
        "capacities": capacities,
        "generation": generation,
        "dispatch": dispatch,
        "timestamps": timestamps,
        "demand_timeseries": [round(v, 3) for v in demand_total],
        "costs_by_tech": {k: round(v, 3) for k, v in costs_by_tech.items() if v > 0},
        "costs_by_location": costs_by_location,
        "tech_metadata": tech_meta,
        "tech_parents": tech_parents,
    }
    if transmission_flow:
        contract["transmission_flow"] = transmission_flow
    if objective is not None:
        contract["objective"] = objective
    return contract


def _find_link_tech(lnk: dict, model_data: dict):
    ref = lnk.get("tech") or ""
    techs = {t.get("name"): t for t in (model_data.get("technologies") or [])}
    return techs.get(str(ref))


# ─── Main entry point ─────────────────────────────────────────────────────────

def run_model(model_data: dict, work_dir: str, log_fn=None) -> dict:
    _thread_local.log_fn = log_fn

    model_name = model_data.get("name", "Model")
    model_config = model_data.get("modelConfig") or {}

    mode = model_config.get("mode") or "plan"
    if mode != "plan":
        raise RuntimeError(
            f"Mode '{mode}' is not supported on the OSeMOSYS engine — only 'plan' "
            "(capacity expansion)."
        )

    # ── Determine time horizon ────────────────────────────────────────────────
    start_date = (model_config.get("startDate") or "2024-01-01")[:10]
    end_date = (model_config.get("endDate") or "2024-12-31")[:10]
    year = int(start_date[:4])
    try:
        from datetime import date
        d0 = date.fromisoformat(start_date)
        d1 = date.fromisoformat(end_date)
        n_hours = (d1 - d0).days * 24 + 24
    except Exception:
        n_hours = 8760

    scheme_raw = (model_data.get("modelConfig") or {}).get("osemosysScheme") or {}
    scheme = {
        "seasons": int(scheme_raw.get("seasons", 4)),
        "dayBlocks": int(scheme_raw.get("dayBlocks", 3)),
    }

    discount_rate = 0.05

    # ── Paths ─────────────────────────────────────────────────────────────────
    csv_dir = os.path.join(work_dir, "csvs")
    results_dir = os.path.join(work_dir, "results")
    os.makedirs(csv_dir, exist_ok=True)
    os.makedirs(results_dir, exist_ok=True)

    # ── Step 1: Translate ─────────────────────────────────────────────────────
    log(f"Translating '{model_name}' to OSeMOSYS CSVs…")
    _csv_dir, report = translate.translate_model(model_data, csv_dir, scheme)
    for line in report:
        log(f"  [translate] {line}")

    # ── Step 2: Write GLPK datafile ───────────────────────────────────────────
    log("Writing GLPK datafile…")
    dat_path = _write_datafile(csv_dir, results_dir, discount_rate)
    log(f"  Datafile: {dat_path}")

    # ── Step 3: Solve ─────────────────────────────────────────────────────────
    glpsol = _find_glpsol()
    log(f"Solving with glpsol: {glpsol}")
    output_path = os.path.join(work_dir, "glpsol_output.txt")
    _run_glpsol(glpsol, _OSEMOSYS_TXT, dat_path, output_path, log_fn or log)

    # ── Step 4: Parse termination status ─────────────────────────────────────
    termination, objective = _parse_glpsol_output(output_path)
    log(f"Solver finished: {termination}"
        + (f", objective={objective:.4f}" if objective is not None else ""))

    if termination != "optimal":
        return {
            "model_name": model_name,
            "solver": "glpk",
            "success": False,
            "termination_condition": termination,
            "translation_report": report,
        }

    # ── Step 5: Extract results ───────────────────────────────────────────────
    log("Extracting results…")
    result = _build_contract(
        results_dir, model_data, model_name, year, scheme, n_hours,
        termination, objective)
    result["translation_report"] = report
    log(f"Done. Capacities: {len(result.get('capacities', {}))}, "
        f"dispatch techs: {len(result.get('dispatch', {}))}")
    return result
