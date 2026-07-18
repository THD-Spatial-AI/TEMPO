"""
AdOpT-NET0 translation: TEMPO internal model → case directory structure.

Shared by adoptnet0_runner.py (run) and adoptnet0_service.py (/export, /import).

Public interface:
    build_model_dir(model_data, model_dir) -> (carriers, report)
    generate_timestamps(start_date, end_date) -> pd.DatetimeIndex
"""

import csv as _csv
import itertools
import json
import math
import os
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------

_INF_SENTINEL = 1e14


def _to_float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        v = float(val)
        if v >= _INF_SENTINEL or v == float("inf"):
            return 1_000_000.0
        if v <= -_INF_SENTINEL or v == float("-inf"):
            return 0.0
        return v
    except (TypeError, ValueError):
        return default


def _cap_max(val, default: float = 1_000_000.0) -> float:
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

def _collect_carriers_from_essentials(essentials: dict) -> list:
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


def _extract_carriers(technologies: list) -> list:
    carriers: set = set()
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


def _get_carriers_out(tech: dict) -> list:
    essentials = tech.get("essentials") or {}
    val = essentials.get("carrier_out") or essentials.get("carrier")
    if isinstance(val, str) and val.strip():
        return [val.strip().lower()]
    if isinstance(val, dict):
        return [k.lower() for k in val]
    if isinstance(val, list):
        return [str(c).lower() for c in val if c]
    return ["electricity"]


def _get_carriers_in(tech: dict) -> list:
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
    """Build AdOpT-NET0 Economics block. Converts EUR/kW → EUR/MW (×1000)."""
    c = _costs(tech)
    unit_capex = c["energy_cap"] * 1_000
    opex_var = c["om_prod"] * 1_000
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
    one_way = round(math.sqrt(max(0.01, constr["energy_eff"])), 4)
    return {
        "tec_type": "STOR",
        "size_min": 0,
        "size_max": constr["storage_cap_max"],
        "size_is_int": 0,
        "decommission": "impossible",
        "Economics": _economics(tech),
        "Performance": {
            "input_carrier": [carrier],
            "main_input_carrier": carrier,
            "output_carrier": [carrier],
            "emission_factor": 0,
            "allow_only_one_direction": 1,
            "performance": {
                "eta_in": one_way,
                "eta_out": one_way,
                "lambda": constr["storage_loss"],
                "theta": 0.0,
            },
        },
        "Flexibility": {
            "power_energy_ratio": "fixedratio",
            "charge_rate": 1.0,
            "discharge_rate": 1.0,
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


def _build_tech_json(tech: dict):
    parent = _get_parent(tech)
    builder = _PARENT_BUILDER.get(parent)
    return builder(tech) if builder else None


# ---------------------------------------------------------------------------
# Timestamp generation
# ---------------------------------------------------------------------------

def _generate_timestamps(start_date: str, end_date: str):
    """Return a pandas DatetimeIndex covering start_date…end_date at hourly resolution."""
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
    if solver_name == "gurobi":
        solver_name = "gurobi"
    elif solver_name in ("glpk",):
        solver_name = "glpk"
    else:
        solver_name = "highs"

    sol_opts = model_config.get("solverOptions") or {}
    threads = int(_to_float(sol_opts.get("threads", 0)))
    timelim = round(_to_float(sol_opts.get("timeLimit", 3600)) / 3600, 2)
    mipgap = _to_float(sol_opts.get("mipGap", 0.001), 0.001)

    results_path = str(Path(model_dir) / "results")
    _write_json(os.path.join(model_dir, "ConfigModel.json"), {
        "optimization": {
            "objective": {"value": "costs"},
            "emission_limit": {"value": 1e6},
            "monte_carlo": {"N": {"value": 0}, "type": "normal_dis", "sd": 0.2, "on_what": []},
            "pareto_points": {"value": 1},
            "timestaging": {"value": 0},
            "typicaldays": {"N": {"value": 0}, "method": {"value": 2}, "technologies_with_full_res": {"value": ["RES", "STOR"]}},
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
            "save_summary_path": {"value": results_path},
            "case_name": {"value": "tempo_run"},
            "write_solution_diagnostics": {"value": 0},
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
        "performance": {
            "dynamics": {"value": 0},
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


_LINK_LOSS_BY_TYPE: dict = {
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

    node_names = [_safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
                  for i, loc in enumerate(locations)]

    carrier_links: dict = {}
    for link in links:
        c = (link.get("carrier") or "electricity").lower()
        carrier_links.setdefault(c, []).append(link)

    network_names: list = []
    for carrier in carriers:
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

        # network_topology/new/{net_name}/connection.csv and distance.csv
        # AdOpT-NET0 requires node×node adjacency and distance matrices (semicolon-separated)
        topo_dir = os.path.join(period_dir, "network_topology", "new", net_name)
        os.makedirs(topo_dir, exist_ok=True)

        conn: dict = {n: {n2: 0 for n2 in node_names} for n in node_names}
        dist: dict = {n: {n2: 0 for n2 in node_names} for n in node_names}
        for lnk in link_list:
            fn = _safe_id(lnk.get("from") or "")
            tn = _safe_id(lnk.get("to") or "")
            km = float(lnk.get("distance") or 0) or 100.0
            if fn in conn and tn in conn:
                conn[fn][tn] = conn[tn][fn] = 1
                dist[fn][tn] = dist[tn][fn] = km

        def _write_matrix(path: str, matrix: dict) -> None:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(";" + ";".join(node_names) + "\n")
                for n in node_names:
                    fh.write(n + ";" + ";".join(str(matrix[n][n2]) for n2 in node_names) + "\n")

        _write_matrix(os.path.join(topo_dir, "connection.csv"), conn)
        _write_matrix(os.path.join(topo_dir, "distance.csv"), dist)

    _write_json(os.path.join(period_dir, "Networks.json"), {
        "existing": [],
        "new": network_names,
    })


def _resolve_timeseries_values(ts_ref, time_series: list, column=None) -> list:
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

    tech_by_id = {t.get("id", ""): t for t in technologies}
    tech_by_name = {t.get("name", ""): t for t in technologies}

    def _find_tech(ref: str):
        return tech_by_id.get(ref) or tech_by_name.get(ref)

    for i, loc in enumerate(locations):
        loc_id = str(loc.get("id") or f"node_{i}")
        loc_name = _safe_id(loc.get("name") or loc_id)

        node_dir = os.path.join(node_data_dir, loc_name)
        tech_data_dir = os.path.join(node_dir, "technology_data")
        carrier_data_dir = os.path.join(node_dir, "carrier_data")
        os.makedirs(tech_data_dir, exist_ok=True)
        os.makedirs(carrier_data_dir, exist_ok=True)

        assigned_refs: list = (
            location_tech_assignments.get(loc_id)
            or location_tech_assignments.get(loc_name)
            or location_tech_assignments.get(loc.get("name", ""))
            or []
        )
        if not assigned_refs and not location_tech_assignments:
            assigned_refs = [t.get("id") or t.get("name", "") for t in technologies]

        node_techs_new: list = []

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

        dp = loc.get("demandProfile") or {}
        demand_ts_data = dp.get("timeseries")
        if isinstance(demand_ts_data, list):
            demand_vals = [_to_float(v) for v in demand_ts_data]
        elif isinstance(demand_ts_data, str):
            col = dp.get("column")
            demand_vals = _resolve_timeseries_values(demand_ts_data, time_series, col)
        else:
            demand_vals = []

        def _tile(vals: list, n: int) -> list:
            if not vals:
                return [0.0] * n
            return list(itertools.islice(itertools.cycle(vals), n))

        demand_vals = _tile(demand_vals, n_hours)
        has_demand = any(v != 0 for v in demand_vals)

        header = ";Demand;Import limit;Export limit;Import price;Export price;Import emission factor;Export emission factor;Generic production"
        for carrier in carriers:
            lines = [header]
            for j, ts in enumerate(timestamps):
                ts_str = _fmt_ts(ts)
                dem = str(demand_vals[j]) if has_demand else ""
                lines.append(f"{ts_str};{dem};;;;;;;")
            _write_text(os.path.join(carrier_data_dir, f"{carrier}.csv"), "\n".join(lines) + "\n")

        _write_json(
            os.path.join(carrier_data_dir, "EnergybalanceOptions.json"),
            {c: {"curtailment_possible": 0} for c in carriers},
        )

        climate_lines = [";ghi;dni;dhi;temp_air;rh;ws10"]
        for ts in timestamps:
            climate_lines.append(f"{_fmt_ts(ts)};;;;;;")
        _write_text(os.path.join(node_dir, "ClimateData.csv"), "\n".join(climate_lines) + "\n")

        carbon_lines = [";price;subsidy"]
        for ts in timestamps:
            carbon_lines.append(f"{_fmt_ts(ts)};;")
        _write_text(os.path.join(node_dir, "CarbonCost.csv"), "\n".join(carbon_lines) + "\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_model_dir(model_data: dict, model_dir: str) -> tuple:
    """
    Write the AdOpT-NET0 case directory from a TEMPO model dict.

    Returns (carriers, report) where:
      carriers — list of carrier strings written to Topology
      report   — list of strings describing approximations/dropped items
    """
    report: list = []

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

    os.makedirs(model_dir, exist_ok=True)

    carriers = _extract_carriers(technologies)
    if not carriers:
        carriers = ["electricity"]
        report.append("No carriers detected from technologies; defaulting to electricity.")

    for tech in technologies:
        parent = _get_parent(tech)
        if parent not in (*_PARENT_BUILDER, "demand", "transmission"):
            tid = tech.get("name") or tech.get("id", "?")
            report.append(f"Technology '{tid}' has unknown parent '{parent}' — skipped.")

    _write_topology(model_dir, locations, carriers, start_date, end_date)
    _write_config(model_dir, solver, model_config)
    _write_node_locations(model_dir, locations)

    period_dir = os.path.join(model_dir, "period1")
    os.makedirs(period_dir, exist_ok=True)

    _write_period_topology(period_dir, locations, carriers, start_date, end_date)
    _write_networks(period_dir, locations, links, carriers)
    _write_node_data(period_dir, locations, technologies, loc_tech_assign,
                     time_series, carriers, start_date, end_date)

    return carriers, report


def generate_timestamps(start_date: str, end_date: str):
    """Return hourly pd.DatetimeIndex for start_date..end_date (inclusive)."""
    return _generate_timestamps(start_date, end_date)


# ---------------------------------------------------------------------------
# Import (AdOpT-NET0 → TEMPO internal)
# ---------------------------------------------------------------------------

def _parse_demand_csv(csv_path) -> list:
    """Parse carrier CSV; return Demand column as list of floats (MW)."""
    vals = []
    with open(csv_path, encoding="utf-8") as f:
        reader = _csv.reader(f, delimiter=";")
        header = None
        demand_col = 1
        for row in reader:
            if header is None:
                header = row
                try:
                    demand_col = [h.strip() for h in header].index("Demand")
                except ValueError:
                    pass
                continue
            if len(row) > demand_col and row[demand_col].strip():
                vals.append(_to_float(row[demand_col].strip(), 0.0))
            else:
                vals.append(0.0)
    return vals


def _parse_tech_json(tid: str, tdata: dict, report: list) -> dict:
    """Reverse-translate an AdOpT-NET0 technology JSON → TEMPO internal tech dict."""
    tec_type = tdata.get("tec_type", "RES")
    econ = tdata.get("Economics") or {}
    perf = tdata.get("Performance") or {}

    unit_capex = _to_float(econ.get("unit_CAPEX"), 0.0)
    energy_cap = unit_capex / 1_000         # EUR/MW → EUR/kW
    opex_fixed = _to_float(econ.get("OPEX_fixed"), 0.0)
    om_annual = round(opex_fixed * unit_capex / 1_000, 6) if unit_capex > 0 else 0.0
    om_prod = _to_float(econ.get("OPEX_variable"), 0.0) / 1_000  # EUR/MWh → EUR/kWh
    interest_rate = _to_float(econ.get("discount_rate"), 0.07)
    lifetime = max(1, int(_to_float(econ.get("lifetime"), 25.0)))
    size_max = _to_float(tdata.get("size_max"), 1_000_000.0)

    costs = {"monetary": {
        "energy_cap": round(energy_cap, 4),
        "om_annual": round(om_annual, 6),
        "om_prod": round(om_prod, 6),
        "interest_rate": interest_rate,
    }}

    if tec_type == "RES":
        carrier_out = (perf.get("output_carrier") or ["electricity"])[0]
        return {
            "name": tid,
            "essentials": {"parent": "supply", "carrier_out": carrier_out, "name": tid},
            "constraints": {"energy_cap_max": size_max, "lifetime": lifetime},
            "costs": costs,
        }

    if tec_type == "CONV1":
        cout = (perf.get("output_carrier") or ["electricity"])[0]
        cin = (perf.get("input_carrier") or ["electricity"])[0]
        perf_data = perf.get("performance") or {}
        out_vals = perf_data.get("out", [0, 1])
        eff = _to_float(out_vals[-1] if isinstance(out_vals, list) else 1.0, 1.0)
        return {
            "name": tid,
            "essentials": {"parent": "conversion", "carrier_out": cout, "carrier_in": cin, "name": tid},
            "constraints": {"energy_cap_max": size_max, "energy_eff": eff, "lifetime": lifetime},
            "costs": costs,
        }

    if tec_type == "CONV2":
        couts = perf.get("output_carrier") or ["electricity"]
        cins = perf.get("input_carrier") or ["electricity"]
        return {
            "name": tid,
            "essentials": {"parent": "conversion_plus", "carrier_out": couts, "carrier_in": cins, "name": tid},
            "constraints": {"energy_cap_max": size_max, "lifetime": lifetime},
            "costs": costs,
        }

    if tec_type == "STOR":
        carrier = perf.get("carrier_out", "electricity")
        charge_eff = _to_float(perf.get("charging_efficiency"), 1.0)
        discharge_eff = _to_float(perf.get("discharging_efficiency"), 1.0)
        rt_eff = round(charge_eff * discharge_eff, 4)
        storage_loss = _to_float(perf.get("self_discharge"), 0.0)
        stor_costs = {"monetary": {
            "storage_cap": round(energy_cap, 4),
            "interest_rate": interest_rate,
        }}
        return {
            "name": tid,
            "essentials": {"parent": "storage", "carrier": carrier, "name": tid},
            "constraints": {
                "storage_cap_max": size_max,
                "energy_cap_max": size_max,
                "energy_eff": rt_eff,
                "storage_loss": storage_loss,
                "lifetime": lifetime,
            },
            "costs": stor_costs,
        }

    report.append(f"Technology '{tid}' has unknown tec_type '{tec_type}' — imported as supply.")
    return {
        "name": tid,
        "essentials": {"parent": "supply", "carrier_out": "electricity", "name": tid},
        "constraints": {"energy_cap_max": size_max, "lifetime": lifetime},
        "costs": costs,
    }


def adoptnet0_to_internal(model_dir: str) -> tuple:
    """
    Parse an AdOpT-NET0 case directory → TEMPO internal model dict.
    Returns (model, report).
    """
    model_dir_path = Path(model_dir)
    report: list = []

    # Topology
    topo_path = model_dir_path / "Topology.json"
    if not topo_path.exists():
        raise ValueError(f"Topology.json not found in {model_dir}")
    topo = json.loads(topo_path.read_text(encoding="utf-8"))
    nodes = topo.get("nodes") or []
    carriers = topo.get("carriers") or ["electricity"]
    start_date = topo.get("start_date", "")[:10]
    end_date = topo.get("end_date", "")[:10]

    # Solver from ConfigModel
    solver = "highs"
    config_path = model_dir_path / "ConfigModel.json"
    if config_path.exists():
        config = json.loads(config_path.read_text(encoding="utf-8"))
        solver = ((config.get("solveroptions") or {}).get("solver") or {}).get("value", "highs")

    # Node coordinates
    node_coords: dict = {}
    loc_csv = model_dir_path / "NodeLocations.csv"
    if loc_csv.exists():
        for line in loc_csv.read_text(encoding="utf-8").strip().splitlines()[1:]:
            parts = line.split(";")
            if len(parts) >= 3:
                node_coords[parts[0].strip()] = {
                    "longitude": _to_float(parts[1].strip(), 0.0),
                    "latitude": _to_float(parts[2].strip(), 0.0),
                }

    # Per-node data
    period_dir = model_dir_path / "period1"
    node_data_dir = period_dir / "node_data"
    primary_carrier = carriers[0] if carriers else "electricity"

    tech_defs: dict = {}
    loc_tech_map: dict = {}
    demand_by_node: dict = {}

    if node_data_dir.exists():
        for node_name in nodes:
            node_dir = node_data_dir / node_name
            if not node_dir.exists():
                continue

            tech_json_path = node_dir / "Technologies.json"
            tids: list = []
            if tech_json_path.exists():
                tj = json.loads(tech_json_path.read_text(encoding="utf-8"))
                new = tj.get("new", [])
                tids = list(new.keys() if isinstance(new, dict) else new)
            loc_tech_map[node_name] = tids

            tech_data_dir = node_dir / "technology_data"
            for tid in tids:
                if tid not in tech_defs:
                    tpath = tech_data_dir / f"{tid}.json"
                    if tpath.exists():
                        tdata = json.loads(tpath.read_text(encoding="utf-8"))
                        tech_defs[tid] = _parse_tech_json(tid, tdata, report)
                    else:
                        report.append(f"technology_data/{tid}.json not found — tech '{tid}' skipped.")

            carrier_csv = node_dir / "carrier_data" / f"{primary_carrier}.csv"
            if carrier_csv.exists():
                vals_mw = _parse_demand_csv(carrier_csv)
                if any(v != 0 for v in vals_mw):
                    # Runner writes kW (TEMPO internal) as MW; convert back to kW
                    demand_by_node[node_name] = [round(v * 1_000, 3) for v in vals_mw[:24]]

    # Create demand technologies for carriers with demand
    demand_techs_by_carrier: dict = {}
    nodes_with_demand = [n for n in nodes if n in demand_by_node]
    if nodes_with_demand:
        for carrier in carriers:
            tid = "power_demand" if carrier == "electricity" else f"{carrier}_demand"
            if tid not in tech_defs:
                peak = max((max(demand_by_node.get(n, [0.0])) for n in nodes_with_demand), default=0.0)
                tech_defs[tid] = {
                    "name": tid,
                    "essentials": {"parent": "demand", "carrier_in": carrier, "name": tid},
                    "constraints": {"resource": -round(peak, 2), "force_resource": True},
                }
            demand_techs_by_carrier[carrier] = tid

    # Build locations
    locations = []
    for node_name in nodes:
        techs = {tid: None for tid in loc_tech_map.get(node_name, [])}
        if node_name in demand_by_node:
            for dtid in demand_techs_by_carrier.values():
                techs[dtid] = None

        loc: dict = {
            "name": node_name,
            "latitude": node_coords.get(node_name, {}).get("latitude", 0.0),
            "longitude": node_coords.get(node_name, {}).get("longitude", 0.0),
            "techs": techs,
        }
        if node_name in demand_by_node:
            loc["demandProfile"] = {"timeseries": demand_by_node[node_name]}
        locations.append(loc)

    model = {
        "name": "AdOpT-NET0 Import",
        "technologies": list(tech_defs.values()),
        "locations": locations,
        "links": [],
        "modelConfig": {
            "startDate": start_date,
            "endDate": end_date,
            "mode": "plan",
        },
        "solver": solver,
        "timeSeries": [],
        "locationTechAssignments": loc_tech_map,
    }

    report.append(
        "Links not imported — AdOpT-NET0 networks define carrier-level connectivity, "
        "not explicit node pairs. Add links via the Links panel."
    )
    report.append(
        "Demand profiles stored as 24-hour daily patterns (first 24 hours of the simulation "
        "period, kW). Demand values converted from MW."
    )
    if demand_techs_by_carrier:
        report.append(
            f"Demand technologies created: {', '.join(demand_techs_by_carrier.values())}. "
            "resource constraint set to peak hourly demand."
        )

    return model, report
