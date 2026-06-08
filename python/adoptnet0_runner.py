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
import itertools
import json
import logging
import math
import os
import re
import sys
import threading
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

_thread_local = threading.local()


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    fn = getattr(_thread_local, "log_fn", None)
    if fn is not None:
        fn(f"[ADOPTNET0] {msg}")
    else:
        print(f"[ADOPTNET0] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------

_INF_SENTINEL = 1e14  # values >= this are treated as JS-serialised infinity


def _to_float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        v = float(val)
        if v >= _INF_SENTINEL or v == float("inf"):
            return 1_000_000.0  # cap at 1 GW — AdOpT-NET0 dislikes true infinity
        if v <= -_INF_SENTINEL or v == float("-inf"):
            return 0.0
        return v
    except (TypeError, ValueError):
        return default


def _cap_max(val, default: float = 1_000_000.0) -> float:
    """Return a finite capacity ceiling, defaulting to 1 GW."""
    v = _to_float(val, default)
    return v if v > 0 else default


# ---------------------------------------------------------------------------
# ID sanitiser
# ---------------------------------------------------------------------------

def _safe_id(name: str) -> str:
    s = str(name).strip()
    s = re.sub(r"[^A-Za-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "unknown"


# ---------------------------------------------------------------------------
# Carrier extraction
# ---------------------------------------------------------------------------

def _collect_carriers_from_essentials(essentials: dict) -> list[str]:
    out = []
    for key in ("carrier_out", "carrier_in", "carrier"):
        val = essentials.get(key)
        if isinstance(val, str) and val.strip():
            out.append(val.strip().lower())
        elif isinstance(val, dict):
            out.extend(k.lower() for k in val)
        elif isinstance(val, list):
            out.extend(str(c).lower() for c in val if c)
    return out


def _extract_carriers(technologies: list) -> list[str]:
    carriers: set[str] = set()
    for tech in technologies:
        parent = _get_parent(tech).lower()
        if parent == "transmission":
            continue
        essentials = tech.get("essentials") or {}
        carriers.update(_collect_carriers_from_essentials(essentials))
    return sorted(carriers) or ["electricity"]


# ---------------------------------------------------------------------------
# Tech parent helpers
# ---------------------------------------------------------------------------

def _get_parent(tech: dict) -> str:
    essentials = tech.get("essentials") or {}
    return (tech.get("parent") or essentials.get("parent") or "supply").lower()


def _get_carrier_out(tech: dict) -> str:
    essentials = tech.get("essentials") or {}
    for key in ("carrier_out", "carrier"):
        val = essentials.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().lower()
        if isinstance(val, dict):
            first = next(iter(val), None)
            if first:
                return first.lower()
        if isinstance(val, list) and val:
            return str(val[0]).lower()
    return "electricity"


def _get_carrier_in(tech: dict) -> str:
    essentials = tech.get("essentials") or {}
    for key in ("carrier_in", "carrier"):
        val = essentials.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().lower()
        if isinstance(val, dict):
            first = next(iter(val), None)
            if first:
                return first.lower()
        if isinstance(val, list) and val:
            return str(val[0]).lower()
    return "electricity"


def _get_carriers_out(tech: dict) -> list[str]:
    essentials = tech.get("essentials") or {}
    val = essentials.get("carrier_out") or essentials.get("carrier")
    if isinstance(val, str) and val.strip():
        return [val.strip().lower()]
    if isinstance(val, dict):
        return [k.lower() for k in val]
    if isinstance(val, list):
        return [str(c).lower() for c in val if c]
    return ["electricity"]


def _get_carriers_in(tech: dict) -> list[str]:
    essentials = tech.get("essentials") or {}
    val = essentials.get("carrier_in") or essentials.get("carrier")
    if isinstance(val, str) and val.strip():
        return [val.strip().lower()]
    if isinstance(val, dict):
        return [k.lower() for k in val]
    if isinstance(val, list):
        return [str(c).lower() for c in val if c]
    return ["electricity"]


# ---------------------------------------------------------------------------
# Cost / constraint extraction
# ---------------------------------------------------------------------------

def _costs(tech: dict) -> dict:
    monetary = (tech.get("costs") or {}).get("monetary") or {}
    return {
        "energy_cap": _to_float(monetary.get("energy_cap") or monetary.get("capex"), 0.0),
        "om_annual": _to_float(monetary.get("om_annual") or monetary.get("opex_fixed"), 0.0),
        "om_prod": _to_float(monetary.get("om_prod") or monetary.get("opex_variable"), 0.0),
        "interest_rate": _to_float(monetary.get("interest_rate"), 0.07),
    }


def _constraints(tech: dict) -> dict:
    c = tech.get("constraints") or {}
    return {
        "energy_cap_max": _cap_max(c.get("energy_cap_max")),
        "energy_cap_min": _to_float(c.get("energy_cap_min"), 0.0),
        "energy_eff": max(0.01, min(1.0, _to_float(c.get("energy_eff"), 1.0))),
        "lifetime": max(1, int(_to_float(c.get("lifetime"), 25.0))),
        "storage_cap_max": _cap_max(c.get("storage_cap_max")),
        "storage_loss": _to_float(c.get("storage_loss"), 0.0),
    }


def _economics(tech: dict) -> dict:
    """Build AdOpT-NET0 Economics block from a TEMPO tech dict.

    Unit note: Calliope costs are conventionally in EUR/kW; AdOpT-NET0 uses EUR/MW.
    We multiply energy_cap and om_annual by 1 000 to convert.
    """
    c = _costs(tech)
    unit_capex = c["energy_cap"] * 1_000  # EUR/kW → EUR/MW
    opex_var = c["om_prod"] * 1_000       # EUR/kWh → EUR/MWh
    opex_fixed = (c["om_annual"] * 1_000 / unit_capex) if unit_capex > 0 else 0.0

    return {
        "CAPEX_model": 1,
        "unit_CAPEX": round(unit_capex, 4),
        "fix_CAPEX": 0,
        "OPEX_variable": round(opex_var, 6),
        "OPEX_fixed": round(min(opex_fixed, 1.0), 6),
        "discount_rate": c["interest_rate"],
        "lifetime": _constraints(tech)["lifetime"],
        "decommission_cost": 0,
    }


# ---------------------------------------------------------------------------
# Technology JSON builders
# ---------------------------------------------------------------------------

def _build_res_json(tech: dict) -> dict:
    constr = _constraints(tech)
    carrier = _get_carrier_out(tech)
    return {
        "tec_type": "RES",
        "size_min": 0,
        "size_max": constr["energy_cap_max"],
        "size_is_int": 0,
        "decommission": "impossible",
        "Economics": _economics(tech),
        "Performance": {
            "output_carrier": [carrier],
            "curtailment": 1,
            "emission_factor": 0,
        },
        "Units": {"size": "MW", "output_carrier": {carrier: "MW"}},
    }


def _build_conv1_json(tech: dict) -> dict:
    constr = _constraints(tech)
    cout = _get_carrier_out(tech)
    cin = _get_carrier_in(tech)
    eff = constr["energy_eff"]
    return {
        "tec_type": "CONV1",
        "size_min": 0,
        "size_max": constr["energy_cap_max"],
        "size_is_int": 0,
        "size_based_on": "output",
        "decommission": "impossible",
        "Economics": _economics(tech),
        "Performance": {
            "performance_function_type": 1,
            "input_carrier": [cin],
            "main_input_carrier": cin,
            "output_carrier": [cout],
            "emission_factor": 0,
            "min_part_load": 0,
            "ramping_rate": -1,
            "ramping_time": -1,
            "min_uptime": -1,
            "min_downtime": -1,
            "performance": {"in": [0, 1], "out": [0, eff]},
        },
        "Units": {
            "size": "MW",
            "input_carrier": {cin: "MW"},
            "output_carrier": {cout: "MW"},
        },
    }


def _build_conv2_json(tech: dict) -> dict:
    constr = _constraints(tech)
    couts = _get_carriers_out(tech)
    cins = _get_carriers_in(tech)
    eff = constr["energy_eff"]
    main_in = cins[0] if cins else "electricity"
    per_out = round(eff / max(len(couts), 1), 4)
    return {
        "tec_type": "CONV2",
        "size_min": 0,
        "size_max": constr["energy_cap_max"],
        "size_is_int": 0,
        "size_based_on": "output",
        "decommission": "impossible",
        "Economics": _economics(tech),
        "Performance": {
            "performance_function_type": 1,
            "input_carrier": cins,
            "main_input_carrier": main_in,
            "output_carrier": couts,
            "emission_factor": 0,
            "min_part_load": 0,
            "performance": {
                "in": [0, 1],
                "out": {c: [0, per_out] for c in couts},
            },
        },
        "Units": {
            "size": "MW",
            "input_carrier": {c: "MW" for c in cins},
            "output_carrier": {c: "MW" for c in couts},
        },
    }


def _build_stor_json(tech: dict) -> dict:
    constr = _constraints(tech)
    carrier = _get_carrier_out(tech)
    # Split round-trip efficiency symmetrically
    one_way = round(math.sqrt(max(0.01, constr["energy_eff"])), 4)
    return {
        "tec_type": "STOR",
        "size_min": 0,
        "size_max": constr["storage_cap_max"],
        "size_is_int": 0,
        "decommission": "impossible",
        "Economics": _economics(tech),
        "Performance": {
            "carrier_in": carrier,
            "carrier_out": carrier,
            "charging_efficiency": one_way,
            "discharging_efficiency": one_way,
            "self_discharge": constr["storage_loss"],
            "min_fill_level": 0.0,
            "initial_fill_level": 0.0,
        },
        "Units": {
            "size": "MWh",
            "input_carrier": {carrier: "MW"},
            "output_carrier": {carrier: "MW"},
        },
    }


_PARENT_BUILDER = {
    "supply": _build_res_json,
    "supply_plus": _build_res_json,
    "conversion": _build_conv1_json,
    "conversion_plus": _build_conv2_json,
    "storage": _build_stor_json,
}


def _build_tech_json(tech: dict) -> dict | None:
    parent = _get_parent(tech)
    builder = _PARENT_BUILDER.get(parent)
    return builder(tech) if builder else None


# ---------------------------------------------------------------------------
# Timestamp generation
# ---------------------------------------------------------------------------

def _generate_timestamps(start_date: str, end_date: str):
    """Return a pandas DatetimeIndex covering start_date … end_date at hourly resolution."""
    import pandas as pd
    try:
        start = pd.Timestamp(start_date)
        end = pd.Timestamp(end_date) + pd.Timedelta(hours=23)
        return pd.date_range(start=start, end=end, freq="h")
    except Exception:
        return pd.date_range(start=start_date, periods=24, freq="h")


def _fmt_ts(ts) -> str:
    """Format a Timestamp as AdOpT-NET0 expects: D-M-YYYY HH:MM (no leading zeros)."""
    return f"{ts.day}-{ts.month}-{ts.year} {ts.hour:02d}:{ts.minute:02d}"


# ---------------------------------------------------------------------------
# File writers
# ---------------------------------------------------------------------------

def _write_json(path: str, obj: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)


def _write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def _write_topology(model_dir: str, locations: list, carriers: list,
                    start_date: str, end_date: str) -> None:
    node_names = [_safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
                  for i, loc in enumerate(locations)]
    _write_json(os.path.join(model_dir, "Topology.json"), {
        "nodes": node_names,
        "carriers": carriers,
        "investment_periods": ["period1"],
        "start_date": f"{start_date} 00:00",
        "end_date": f"{end_date} 23:00",
        "resolution": "1h",
        "investment_period_length": 1,
    })


def _write_config(model_dir: str, solver: str, model_config: dict) -> None:
    solver_name = str(solver).lower()
    if solver_name in ("highs", "appsi_highs", "highspy"):
        solver_name = "highs"
    elif solver_name == "gurobi":
        solver_name = "gurobi"
    else:
        solver_name = "highs"

    sol_opts = model_config.get("solverOptions") or {}
    threads = int(_to_float(sol_opts.get("threads", 0)))
    timelim = round(_to_float(sol_opts.get("timeLimit", 3600)) / 3600, 2)  # s → h
    mipgap = _to_float(sol_opts.get("mipGap", 0.001), 0.001)

    results_path = str(Path(model_dir) / "results")
    _write_json(os.path.join(model_dir, "ConfigModel.json"), {
        "optimization": {
            "objective": {"value": "costs"},
            "emission_limit": {"value": 1e6},
            "monte_carlo": {"N": 0, "type": "normal_dis", "sd": 0.2, "on_what": []},
            "pareto_points": {"value": 1},
            "timestaging": {"value": 0},
            "typicaldays": {"N": 0, "method": 2, "technologies_with_full_res": ["RES", "STOR"]},
            "multiyear": {"value": 0},
        },
        "solveroptions": {
            "solver": {"value": solver_name},
            "mipgap": {"value": mipgap},
            "timelim": {"value": timelim},
            "threads": {"value": threads},
            "mipfocus": {"value": 0},
            "presolve": {"value": -1},
            "intfeastol": {"value": 1e-5},
            "feastol": {"value": 1e-6},
        },
        "reporting": {
            "write_results": {"value": 1},
            "save_path": {"value": results_path},
            "case_name": {"value": "tempo_run"},
        },
        "energybalance": {
            "violation": {"value": 1000},
            "copperplate": {"value": 0},
        },
        "economic": {
            "global_discountrate": {"value": -1},
            "global_simple_capex_model": {"value": 0},
        },
        "scaling": {
            "scaling_on": {"value": 0},
            "scaling_factors": {
                "energy_vars": {"value": 0.001},
                "cost_vars": {"value": 0.001},
                "objective": {"value": 1},
            },
        },
    })


def _write_node_locations(model_dir: str, locations: list) -> None:
    lines = [";lon;lat;alt"]
    for i, loc in enumerate(locations):
        name = _safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
        lon = _to_float(loc.get("lng"), 0.0)
        lat = _to_float(loc.get("lat"), 0.0)
        lines.append(f"{name};{lon:.6f};{lat:.6f};0")
    _write_text(os.path.join(model_dir, "NodeLocations.csv"), "\n".join(lines) + "\n")


def _write_period_topology(period_dir: str, locations: list, carriers: list,
                           start_date: str, end_date: str) -> None:
    node_names = [_safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
                  for i, loc in enumerate(locations)]
    _write_json(os.path.join(period_dir, "Topology.json"), {
        "nodes": node_names,
        "carriers": carriers,
        "investment_periods": ["period1"],
        "start_date": f"{start_date} 00:00",
        "end_date": f"{end_date} 23:00",
        "resolution": "1h",
        "investment_period_length": 1,
    })


# Approximate loss fraction by link type (mirrors calliope_runner._LINK_TYPE_DEFAULTS)
_LINK_LOSS_BY_TYPE: dict[str, float] = {
    "hvac_overhead": 0.02, "hvdc_overhead": 0.03, "hvac_cable": 0.03,
    "hvdc_subsea": 0.04, "district_heat": 0.10, "district_cooling": 0.08,
    "h2_pipeline": 0.02, "h2_truck": 0.05, "gas_pipeline": 0.01,
    "biogas_pipeline": 0.02, "co2_pipeline": 0.01, "biomass_truck": 0.03,
    "biomass_train": 0.02, "oil_pipeline": 0.005, "oil_truck": 0.02,
    "water_pipeline": 0.01,
}


def _write_networks(period_dir: str, locations: list, links: list, carriers: list) -> None:
    network_data_dir = os.path.join(period_dir, "network_data")
    os.makedirs(network_data_dir, exist_ok=True)

    carrier_links: dict[str, list] = {}
    for link in links:
        c = (link.get("carrier") or "electricity").lower()
        carrier_links.setdefault(c, []).append(link)

    network_names: list[str] = []
    for carrier in carriers:
        # Only create a network if there are explicit links or multiple nodes for this carrier
        if carrier not in carrier_links and len(locations) < 2:
            continue

        net_name = f"{carrier}_network"
        network_names.append(net_name)

        link_list = carrier_links.get(carrier, [])
        if link_list:
            avg_loss = sum(
                _LINK_LOSS_BY_TYPE.get(lnk.get("linkType", ""), 0.02) for lnk in link_list
            ) / len(link_list)
        else:
            avg_loss = 0.02

        _write_json(os.path.join(network_data_dir, f"{net_name}.json"), {
            "network_type": carrier,
            "size_is_int": 0,
            "decommission": "impossible",
            "size_min": 0,
            "size_max": 10_000,
            "Economics": {
                "gamma1": 0, "gamma2": 0, "gamma3": 0, "gamma4": 0,
                "OPEX_variable": 0, "OPEX_fixed": 0,
                "discount_rate": 0.07, "lifetime": 40, "decommission_cost": 0,
            },
            "Performance": {
                "carrier": carrier,
                "bidirectional_network": 1,
                "loss": round(avg_loss, 4),
                "min_transport": 0,
                "loss2emissions": 0,
                "emissionfactor": 0,
                "energyconsumption": [],
            },
        })

    _write_json(os.path.join(period_dir, "Networks.json"), {
        "existing": [],
        "new": network_names,
    })


def _resolve_timeseries_values(ts_ref, time_series: list, column=None) -> list:
    """Look up time-series values given a reference (string ID or filename)."""
    if not ts_ref or not time_series:
        return []

    for ts in time_series:
        fname = str(ts.get("fileName") or ts.get("file") or "")
        ts_id = str(ts.get("id") or ts.get("modelId") or "")
        ref_str = str(ts_ref)

        if ref_str not in (fname, ts_id, fname.replace(".csv", ""), ts_id):
            continue

        data = ts.get("data") or []
        if not data:
            return []

        columns = ts.get("columns") or []

        if column and columns:
            col_lower = str(column).lower()
            idx = next(
                (i for i, c in enumerate(columns) if str(c).lower() == col_lower),
                None,
            )
            if idx is not None:
                return [_to_float(row[idx] if len(row) > idx else 0) for row in data]

        # No column → use second column (first data column after the date column)
        if data and len(data[0]) > 1:
            return [_to_float(row[1]) for row in data]
        return [_to_float(row[0] if row else 0) for row in data]

    return []


def _write_node_data(period_dir: str, locations: list, technologies: list,
                     location_tech_assignments: dict, time_series: list,
                     carriers: list, start_date: str, end_date: str) -> None:
    node_data_dir = os.path.join(period_dir, "node_data")
    os.makedirs(node_data_dir, exist_ok=True)

    timestamps = _generate_timestamps(start_date, end_date)
    n_hours = len(timestamps)

    # Build fast lookup maps for technologies
    tech_by_id = {t.get("id", ""): t for t in technologies}
    tech_by_name = {t.get("name", ""): t for t in technologies}

    def _find_tech(ref: str) -> dict | None:
        return tech_by_id.get(ref) or tech_by_name.get(ref)

    for i, loc in enumerate(locations):
        loc_id = str(loc.get("id") or f"node_{i}")
        loc_name = _safe_id(loc.get("name") or loc_id)

        node_dir = os.path.join(node_data_dir, loc_name)
        tech_data_dir = os.path.join(node_dir, "technology_data")
        carrier_data_dir = os.path.join(node_dir, "carrier_data")
        os.makedirs(tech_data_dir, exist_ok=True)
        os.makedirs(carrier_data_dir, exist_ok=True)

        # Resolve assigned technology references for this location
        assigned_refs: list = (
            location_tech_assignments.get(loc_id)
            or location_tech_assignments.get(loc_name)
            or location_tech_assignments.get(loc.get("name", ""))
            or []
        )
        if not assigned_refs and not location_tech_assignments:
            # No assignment map at all — use all non-demand/transmission techs
            assigned_refs = [t.get("id") or t.get("name", "") for t in technologies]

        node_techs_new: list[str] = []

        for ref in assigned_refs:
            if isinstance(ref, dict):
                ref_key = str(ref.get("id") or ref.get("name") or ref.get("techId") or "")
            else:
                ref_key = str(ref)

            tech = _find_tech(ref_key)
            if tech is None:
                continue

            parent = _get_parent(tech)
            if parent in ("demand", "transmission"):
                continue

            tech_json = _build_tech_json(tech)
            if tech_json is None:
                continue

            tid = _safe_id(tech.get("name") or tech.get("id") or f"tech_{i}")
            _write_json(os.path.join(tech_data_dir, f"{tid}.json"), tech_json)
            node_techs_new.append(tid)

        _write_json(os.path.join(node_dir, "Technologies.json"), {
            "existing": {},
            "new": node_techs_new,
        })

        # ── Demand profile ───────────────────────────────────────────────────
        dp = loc.get("demandProfile") or {}
        demand_ts_data = dp.get("timeseries")
        if isinstance(demand_ts_data, list):
            # Direct array of values
            demand_vals = [_to_float(v) for v in demand_ts_data]
        elif isinstance(demand_ts_data, str):
            # Reference to a timeseries by ID/filename
            col = dp.get("column")
            demand_vals = _resolve_timeseries_values(demand_ts_data, time_series, col)
        else:
            demand_vals = []

        # Tile or truncate to match the model horizon
        def _tile(vals: list, n: int) -> list:
            if not vals:
                return [0.0] * n
            return list(itertools.islice(itertools.cycle(vals), n))

        demand_vals = _tile(demand_vals, n_hours)
        has_demand = any(v != 0 for v in demand_vals)

        # ── Carrier CSVs ─────────────────────────────────────────────────────
        header = ";Demand;Import limit;Export limit;Import price;Export price;Import emission factor;Export emission factor;Generic production"
        for carrier in carriers:
            lines = [header]
            for j, ts in enumerate(timestamps):
                ts_str = _fmt_ts(ts)
                # Attach demand to every carrier column (user can refine per carrier later)
                dem = str(demand_vals[j]) if has_demand else ""
                lines.append(f"{ts_str};{dem};;;;;;;")
            _write_text(os.path.join(carrier_data_dir, f"{carrier}.csv"), "\n".join(lines) + "\n")

        # ── EnergybalanceOptions.json ─────────────────────────────────────────
        _write_json(
            os.path.join(carrier_data_dir, "EnergybalanceOptions.json"),
            {c: {"curtailment_possible": 0} for c in carriers},
        )

        # ── ClimateData.csv (empty placeholder) ───────────────────────────────
        climate_lines = [";ghi;dni;dhi;temp_air;rh;ws10"]
        for ts in timestamps:
            climate_lines.append(f"{_fmt_ts(ts)};;;;;; ")
        _write_text(os.path.join(node_dir, "ClimateData.csv"), "\n".join(climate_lines) + "\n")

        # ── CarbonCost.csv (zero-cost placeholder) ────────────────────────────
        carbon_lines = [";price;subsidy"]
        for ts in timestamps:
            carbon_lines.append(f"{_fmt_ts(ts)};;")
        _write_text(os.path.join(node_dir, "CarbonCost.csv"), "\n".join(carbon_lines) + "\n")


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
            # ── Total cost ──────────────────────────────────────────────────
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

            # ── Installed capacities ────────────────────────────────────────
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

            # ── Dispatch time series ────────────────────────────────────────
            op_path = "Operation/technology_operation/period1"
            if op_path in f:
                for node in f[op_path]:
                    result["dispatch"][node] = {}
                    node_grp = f[f"{op_path}/{node}"]
                    for tech in node_grp:
                        grp = node_grp[tech]
                        # Try common output dataset names
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
    time_series = model_data.get("timeSeries") or []
    loc_tech_assign = model_data.get("locationTechAssignments") or {}

    if not locations:
        raise ValueError("Model has no locations — add at least one location before running.")

    log(f'Starting AdOpT-NET0 run: "{name}"')
    log(f"  {len(locations)} location(s), {len(technologies)} tech(s), {len(links)} link(s)")
    log(f"  Period: {start_date} → {end_date}, solver: {solver}")

    model_dir = os.path.join(work_dir, "model_data")
    os.makedirs(model_dir, exist_ok=True)

    carriers = _extract_carriers(technologies)
    log(f"  Carriers: {carriers}")

    log("  Writing Topology…")
    _write_topology(model_dir, locations, carriers, start_date, end_date)

    log("  Writing ConfigModel…")
    _write_config(model_dir, solver, model_config)

    log("  Writing NodeLocations…")
    _write_node_locations(model_dir, locations)

    period_dir = os.path.join(model_dir, "period1")
    os.makedirs(period_dir, exist_ok=True)

    log("  Writing period topology…")
    _write_period_topology(period_dir, locations, carriers, start_date, end_date)

    log("  Writing networks…")
    _write_networks(period_dir, locations, links, carriers)

    log("  Writing node data (technologies + carrier time series)…")
    _write_node_data(period_dir, locations, technologies, loc_tech_assign,
                     time_series, carriers, start_date, end_date)

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

    # ── Extract and return results ───────────────────────────────────────────
    log("  Extracting results from HDF5…")
    extracted = _extract_results(results_dir)

    timestamps = []
    try:
        ts_index = _generate_timestamps(start_date, end_date)
        timestamps = [str(ts) for ts in ts_index]
    except Exception:
        pass

    result = {
        "success": True,
        "framework": "adoptnet0",
        "name": name,
        "objective": extracted.get("objective"),
        "solver_status": extracted.get("solver_status", "ok"),
        # AdOpT-NET0–specific fields
        "capacity": extracted.get("capacity", {}),
        # Calliope-compatible fields for UI
        "dispatch": extracted.get("dispatch", {}),
        "timestamps": timestamps,
        "transmission_flow": {},
        "demand_timeseries": {},
    }

    log(f"  Done. Objective = {result['objective']}")
    return result
