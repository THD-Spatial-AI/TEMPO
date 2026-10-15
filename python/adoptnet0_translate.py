"""
AdOpT-NET0 translation: TEMPO internal model → case directory structure.

Shared by adoptnet0_runner.py (run) and adoptnet0_service.py (/export, /import).

Public interface:
    build_model_dir(model_data, model_dir, capex_scale=1.0) -> (carriers, report)
    compute_capfactors(model_data, report) -> {(node, tech): [cf, ...]}
    generate_timestamps(start_date, end_date) -> pd.DatetimeIndex
"""

import csv as _csv
import itertools
import json
import os
import re
from pathlib import Path

from engine_common import annuity, finite, link_distance, merged_link_def, merged_tech_def, qualify_file_ref, resource_scale, resource_to_cf, runconfig_notes
from engine_overlay import engine_overlay, coerce_overlay

_KW_PER_MW = 1_000.0
_UNMET_IMPORT_LIMIT_MW = 1_000_000.0   # ensure_feasibility slack: effectively unlimited import ...
_UNMET_PRICE_EUR_MWH = 100_000.0       # ... at a prohibitive price (100 €/kWh)

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


# Unbounded (inf / unset) capacity → 1e6 MW. AdOpT needs a finite size_max; this is
# far above any regional system (Chile regions are GW-scale) so it never binds, and the
# model stays an LP (no big-M: the *_precise disjunctions are switched off below).
_UNBOUNDED_KW = 1e9


def _cap_max(val) -> float:
    v = finite(val)
    return _UNBOUNDED_KW if v is None or v < 0 else v


def _size_bounds(constr: dict, prefix: str = "energy_cap") -> tuple:
    """(size_min, size_max) in MW/MWh per calliope 0.6: <prefix>_equals fixes both."""
    eq = finite(constr.get(f"{prefix}_equals"))
    if eq is not None and eq >= 0:
        return eq / _KW_PER_MW, eq / _KW_PER_MW
    mn = finite(constr.get(f"{prefix}_min"))
    return (mn / _KW_PER_MW if mn and mn > 0 else 0), _cap_max(constr.get(f"{prefix}_max")) / _KW_PER_MW


def _report_unbounded(constr: dict, keys: tuple, ctx: str, report: list) -> None:
    for k in keys:
        v = finite(constr.get(k))
        if finite(constr.get(k.replace("_max", "_equals"))) is not None:
            continue  # fixed capacity — no sentinel used
        if v is None or v < 0:
            report.append(f"{ctx}: unbounded {k} → {_UNBOUNDED_KW / _KW_PER_MW:.0e} MW sentinel")


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

def _economics(costs: dict, constr: dict, capex_scale: float = 1.0) -> dict:
    """AdOpT-NET0 Economics block. €/kW → €/MW (×1000); investment scaled by
    capex_scale (n_hours/8760 in the run path — AdOpT's own fraction_of_year
    is 1 when the topology is the modelled window)."""
    unit_capex = _to_float(costs.get("energy_cap", costs.get("capex")), 0.0) * _KW_PER_MW
    opex_var = _to_float(costs.get("om_prod", costs.get("opex_variable")), 0.0) * _KW_PER_MW
    om_annual = _to_float(costs.get("om_annual", costs.get("opex_fixed")), 0.0)
    opex_fixed = (om_annual * _KW_PER_MW / unit_capex) if unit_capex > 0 else 0.0
    rate = _to_float(costs.get("interest_rate"), 0.0)
    life = max(1, int(_to_float(constr.get("lifetime"), 25)))
    if om_annual * _KW_PER_MW > unit_capex:
        # OPEX_fixed is a fraction of capex (≤ 1): when om_annual exceeds capex (incl.
        # zero capex) fold om_annual / CRF into capex instead (AdOpT annualises capex
        # with the same CRF — exactly equivalent).
        unit_capex += om_annual / annuity(rate, life) * _KW_PER_MW
        opex_fixed = 0.0
    return {
        "CAPEX_model": 1,
        "unit_CAPEX": round(unit_capex * capex_scale, 6),
        "fix_CAPEX": 0,
        "OPEX_variable": round(opex_var, 6),
        "OPEX_fixed": round(min(opex_fixed, 1.0), 12),
        "discount_rate": rate,
        "lifetime": life,
        "decommission_cost": 0,
    }


def _eff(constr: dict) -> float:
    return max(0.01, min(1.0, _to_float(constr.get("energy_eff"), 1.0)))


def _economics_per_input(costs: dict, constr: dict, capex_scale: float, out_per_in: float) -> dict:
    """AdOpT charges CONV/STOR OPEX_variable on the main *input*; Calliope om_prod is
    per unit of *output*. Rescale by output-per-input so the cost per output matches."""
    econ = _economics(costs, constr, capex_scale)
    # om_con (fuel cost) is per unit of input consumed — already the unit AdOpT charges on
    econ["OPEX_variable"] = round(econ["OPEX_variable"] * out_per_in
                                  + _to_float(costs.get("om_con"), 0.0) * _KW_PER_MW, 6)
    return econ


# ---------------------------------------------------------------------------
# Technology JSON builders
# ---------------------------------------------------------------------------

def _build_res_json(tech: dict, constr: dict, costs: dict, capex_scale: float = 1.0) -> dict:
    carrier = _get_carrier_out(tech)
    return {
        "tec_type": "RES",
        "size_min": _size_bounds(constr)[0],
        "size_max": _size_bounds(constr)[1],
        "size_is_int": 0,
        "decommission": "impossible",
        # Calliope supply om_con is per unit of resource consumed = output / energy_eff
        "Economics": {**_economics(costs, constr, capex_scale),
                      "OPEX_variable": round(_economics(costs, constr, capex_scale)["OPEX_variable"]
                                             + _to_float(costs.get("om_con"), 0.0) / _eff(constr) * _KW_PER_MW, 6)},
        "Performance": {
            "output_carrier": [carrier],
            "curtailment": 1,
            "emission_factor": 0,
        },
        "Units": {"size": "MW", "output_carrier": {carrier: "MW"}},
    }


def _build_conv1_json(tech: dict, constr: dict, costs: dict, capex_scale: float = 1.0) -> dict:
    cout = _get_carrier_out(tech)
    cin = _get_carrier_in(tech)
    eff = _eff(constr)
    return {
        "tec_type": "CONV1",
        "size_min": _size_bounds(constr)[0],
        "size_max": _size_bounds(constr)[1],
        "size_is_int": 0,
        "size_based_on": "output",
        "decommission": "impossible",
        "Economics": _economics_per_input(costs, constr, capex_scale, eff),
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


def _build_conv2_json(tech: dict, constr: dict, costs: dict, capex_scale: float = 1.0) -> dict:
    couts = _get_carriers_out(tech)
    cins = _get_carriers_in(tech)
    eff = _eff(constr)
    main_in = cins[0] if cins else "electricity"
    per_out = round(eff / max(len(couts), 1), 4)
    return {
        "tec_type": "CONV2",
        "size_min": _size_bounds(constr)[0],
        "size_max": _size_bounds(constr)[1],
        "size_is_int": 0,
        "size_based_on": "output",
        "decommission": "impossible",
        "Economics": _economics_per_input(costs, constr, capex_scale, per_out),
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


_STOR_RATE = 1e4  # MW per MWh (0.36 s duration) — never binds


def _build_stor_json(tech: dict, constr: dict, costs: dict, capex_scale: float = 1.0) -> dict:
    carrier = _get_carrier_out(tech)
    eff = max(0.01, min(1.0, _to_float(constr.get("energy_eff"), 1.0)))  # calliope: applied each way
    # om_prod is per discharged kWh in Calliope; per charged MWh here → ×eff² (approximate)
    econ = _economics_per_input(costs, constr, capex_scale, eff * eff)
    econ["CAPEX_model"] = 4
    econ["unit_CAPEX"] = round(_to_float(costs.get("storage_cap"), 0.0) * _KW_PER_MW * capex_scale, 6)
    # om_annual (per kW/yr) folded into the power capex: AdOpT annualises capex with the
    # same CRF (annuity), so om_annual / CRF is an exactly equivalent investment cost.
    om_annual = _to_float(costs.get("om_annual"), 0.0)
    power_capex = (_to_float(costs.get("energy_cap"), 0.0)
                   + om_annual / annuity(econ["discount_rate"], econ["lifetime"])) * _KW_PER_MW * capex_scale
    econ["OPEX_fixed"] = 0
    e_min, e_max = _size_bounds(constr, "storage_cap")
    return {
        "tec_type": "STOR",
        "size_min": e_min,
        "size_max": e_max,
        "size_is_int": 0,
        "decommission": "impossible",
        "Economics": econ,
        "Performance": {
            "input_carrier": [carrier],
            "main_input_carrier": carrier,
            "output_carrier": [carrier],
            "emission_factor": 0,
            # Calliope 0.6 is an LP and lets storage charge/discharge in the same step:
            # no one-direction cut and no big-M disjunction.
            "allow_only_one_direction": 0,
            "performance": {
                "eta_in": round(eff, 6),
                "eta_out": round(eff, 6),
                "lambda": _to_float(constr.get("storage_loss"), 0.0),
                "theta": 0.0,
            },
        },
        "Flexibility": {
            "power_energy_ratio": "flexratio",
            # Calliope has no C-rate: power ≤ rate × size is a loose relaxation. The runner
            # ties charge == discharge capacity and applies energy_cap_max (_tie_storage_power).
            "charge_rate": _STOR_RATE,
            "discharge_rate": _STOR_RATE,
            "capex_charging_power": 0,
            "capex_discharging_power": round(power_capex, 6),
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


def _build_tech_json(tech: dict, constr: dict, costs: dict, capex_scale: float = 1.0):
    parent = _get_parent(tech)
    builder = _PARENT_BUILDER.get(parent)
    return builder(tech, constr, costs, capex_scale) if builder else None


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


def network_name(tid: str, a: str, b: str) -> str:
    """AdOpT network id for one TEMPO link (one network per link → exact distance/loss)."""
    return f"{_safe_id(tid)}__{_safe_id(a)}__{_safe_id(b)}"


def _resolve_links(links: list, technologies: list) -> list:
    """[(link, tech | None, net_name | None)]. Duplicate links (same tech + node pair,
    either direction) get a __2, __3… suffix so every link is its own network."""
    by_ref = {t.get("name"): t for t in technologies}
    by_ref.update({t.get("id"): t for t in technologies if t.get("id")})
    out, seen = [], {}
    for lnk in links:
        tech = by_ref.get(lnk.get("tech"))
        if tech is None:
            out.append((lnk, None, None))
            continue
        tid = tech.get("name") or tech.get("id")
        a, b = lnk.get("from") or "", lnk.get("to") or ""
        key = (_safe_id(tid), frozenset((_safe_id(a), _safe_id(b))))
        seen[key] = seen.get(key, 0) + 1
        name = network_name(tid, a, b) + (f"__{seen[key]}" if seen[key] > 1 else "")
        out.append((lnk, tech, name))
    return out


def network_names(links: list, technologies: list) -> dict:
    """{AdOpT network id: TEMPO transmission tech name} for every resolvable link."""
    return {name: tech.get("name") or tech.get("id")
            for _, tech, name in _resolve_links(links, technologies) if tech is not None}


def _write_networks(period_dir: str, locations: list, links: list, technologies: list,
                    capex_scale: float = 1.0, report: list | None = None) -> None:
    report = report if report is not None else []
    network_data_dir = os.path.join(period_dir, "network_data")
    os.makedirs(network_data_dir, exist_ok=True)

    node_names = [_safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
                  for i, loc in enumerate(locations)]

    net_names: list = []
    for lnk, tech, net_name in _resolve_links(links, technologies):
        a, b = _safe_id(lnk.get("from") or ""), _safe_id(lnk.get("to") or "")
        if tech is None or a not in node_names or b not in node_names:
            report.append(f"link {a}→{b}: tech '{lnk.get('tech')}' or node not found — skipped")
            continue
        constr, costs = merged_link_def(tech, lnk)
        carrier = _get_carrier_out(tech) or "electricity"
        km = link_distance(lnk) or 0.0
        eff = _to_float(constr.get("energy_eff"), 1.0)
        if km <= 0:
            km = 1.0
            report.append(f"link {a}↔{b}: no distance — 1 km used (loss and per-distance cost apply to 1 km)")
        net_names.append(net_name)
        _report_unbounded(constr, ("energy_cap_max",), f"link {net_name}", report)
        rate = _to_float(costs.get("interest_rate"), 0.0)
        life = max(1, int(_to_float(constr.get("lifetime"), 40)))
        # Calliope halves transmission capex per link end (one full cost per link) but
        # charges om_annual on *both* ends; AdOpT counts gamma2 once per pair, and
        # om_annual / CRF is an exactly equivalent investment cost (same annuity).
        om_annual_capex = 2 * _to_float(costs.get("om_annual"), 0.0) / annuity(rate, life)

        _write_json(os.path.join(network_data_dir, f"{net_name}.json"), {
            # AdOpT only knows 'electricity' | 'fluid' | 'simple' (not carrier names); any
            # non-electric carrier (heat, gas, ...) is a lossy bidirectional 'simple' network
            "network_type": "electricity" if carrier == "electricity" else "simple",
            "size_is_int": 0,
            "decommission": "impossible",
            "size_min": _size_bounds(constr)[0],
            "size_max": _size_bounds(constr)[1],
            "Economics": {
                "gamma1": 0,
                "gamma2": round((_to_float(costs.get("energy_cap"), 0.0) + om_annual_capex)
                                * _KW_PER_MW * capex_scale, 6),
                "gamma3": 0,
                "gamma4": round(_to_float(costs.get("energy_cap_per_distance"), 0.0) * _KW_PER_MW * capex_scale, 6),
                # Calliope om_prod is per delivered kWh; AdOpT charges sent flow → ×eff
                "OPEX_variable": round(_to_float(costs.get("om_prod"), 0.0) * eff * _KW_PER_MW, 6),
                "OPEX_fixed": 0,
                "discount_rate": rate,
                "lifetime": life,
                "decommission_cost": 0,
            },
            "Performance": {
                "carrier": carrier,
                "bidirectional_network": 1,
                "bidirectional_network_precise": 0,  # LP like Calliope: cut only, no big-M
                "loss": round((1.0 - eff) / km, 12),
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
        conn = {n: {n2: 0 for n2 in node_names} for n in node_names}
        dist = {n: {n2: 0 for n2 in node_names} for n in node_names}
        conn[a][b] = conn[b][a] = 1
        dist[a][b] = dist[b][a] = km
        for fname, matrix in (("connection.csv", conn), ("distance.csv", dist)):
            with open(os.path.join(topo_dir, fname), "w", encoding="utf-8") as fh:
                fh.write(";" + ";".join(node_names) + "\n")
                for n in node_names:
                    fh.write(n + ";" + ";".join(str(matrix[n][n2]) for n2 in node_names) + "\n")

    _write_json(os.path.join(period_dir, "Networks.json"), {
        "existing": [],
        "new": net_names,
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


def _resolve_demand_ref(ref, time_series: list) -> list:
    """
    Resolve a `file=<name.csv>:<column>` demand ref (as written by the OSM
    study-area importer) → magnitudes (abs). Handles row-object data
    (`[{datetime, dem_1, ...}]`) and positional rows. Returns [] when not a
    file ref or not found.
    """
    if not (isinstance(ref, str) and ref.startswith("file=")):
        return []
    fname, _, col = ref[len("file="):].partition(":")
    fbase = fname.replace(".csv", "")
    for ts in time_series:
        tsf = str(ts.get("fileName") or ts.get("file") or ts.get("name") or "")
        if fname not in (tsf, tsf.replace(".csv", "")) and fbase not in (tsf, tsf.replace(".csv", "")):
            continue
        data = ts.get("data") or []
        if not data:
            return []
        if isinstance(data[0], dict):
            return [abs(_to_float(row.get(col))) for row in data]
        columns = ts.get("columns") or []
        idx = columns.index(col) if col in columns else (1 if len(data[0]) > 1 else 0)
        return [abs(_to_float(row[idx])) for row in data]
    return []


def _placed_techs(loc: dict, i: int, technologies: list, location_tech_assignments: dict) -> list:
    """[(ref_key, tech, loc_cfg)] placed at this location — the single source of truth
    for node technologies, capacity factors and storage power caps.
    locationTechAssignments (ids, names or dict refs) wins; without any assignments
    the location's own `techs` are used. Techs resolve by id or name."""
    loc_id = str(loc.get("id") or f"node_{i}")
    loc_name = _safe_id(loc.get("name") or loc_id)
    tech_by_id = {t.get("id", ""): t for t in technologies}
    tech_by_name = {t.get("name", ""): t for t in technologies}
    lta = location_tech_assignments or {}
    refs = lta.get(loc_id) or lta.get(loc_name) or lta.get(loc.get("name", "")) or []
    if not refs and not lta:
        # Direct loc.techs mode (same source of truth as the Calliope/PyPSA runners)
        refs = list((loc.get("techs") or {}).keys())
    loc_techs = loc.get("techs") or {}
    out = []
    for ref in refs:
        if isinstance(ref, dict):
            ref_key = str(ref.get("id") or ref.get("name") or ref.get("techId") or "")
        else:
            ref_key = str(ref)
        tech = tech_by_id.get(ref_key) or tech_by_name.get(ref_key)
        if tech is None:
            continue
        loc_cfg = (loc_techs.get(ref_key) or loc_techs.get(tech.get("name"))
                   or loc_techs.get(tech.get("id")))
        out.append((ref_key, tech, loc_cfg))
    return out


def _write_node_data(period_dir: str, locations: list, technologies: list,
                     location_tech_assignments: dict, time_series: list,
                     carriers: list, start_date: str, end_date: str,
                     capex_scale: float = 1.0, report: list | None = None,
                     ensure_feasibility: bool = True) -> None:
    report = report if report is not None else []
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

        node_techs_new: list = []

        for ref_key, tech, _loc_cfg in _placed_techs(loc, i, technologies, location_tech_assignments):
            parent = _get_parent(tech)
            if parent in ("demand", "transmission"):
                continue

            constr, costs = merged_tech_def(tech, _loc_cfg)
            tech_json = _build_tech_json(tech, constr, costs, capex_scale)
            if tech_json is None:
                continue
            # Engine-specific (AdOpT-NET0) overrides on top of the translation.
            _ep = coerce_overlay(engine_overlay(tech, _loc_cfg, "adoptnet0"))
            if _ep:
                tech_json.update(_ep)

            tid = _safe_id(tech.get("name") or tech.get("id") or f"tech_{i}")
            _report_unbounded(constr, ("storage_cap_max",) if parent == "storage" else ("energy_cap_max",),
                              f"{loc_name}/{tid}", report)
            if parent == "storage":
                if costs.get("om_prod"):
                    report.append(f"{loc_name}/{tid}: storage om_prod charged on input ×eff² (approximation)")
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

        # Fall back to demand-parent techs on the node (OSM study-area importer
        # attaches a `power_demand` tech whose resource is a `file=name:col`
        # series or a scalar). The resource lives on the per-location inline tech
        # config (merged over the tech-level one); the parent is resolved from the
        # global tech. Series are summed per carrier and written to that carrier only.
        demand_by_carrier: dict = {}
        sinks_by_carrier: dict = {}   # carrier → [(limit series kW, om_con €/kWh)] for force_resource=false demands
        if demand_vals:
            demand_by_carrier[str(dp.get("carrier") or "electricity").lower()] = demand_vals
        else:
            # Placed techs (assignment mode too) plus inline loc.techs demand configs.
            _cands = [(t, cfg) for _, t, cfg in _placed_techs(loc, i, technologies, location_tech_assignments)]
            _seen = {id(t) for t, _ in _cands}
            for _ref, _cfg in (loc.get("techs") or {}).items():
                _g = _find_tech(_ref)
                if _g is None or id(_g) not in _seen:
                    _cands.append((_g, _cfg))
            for _global, _loc_tech in _cands:
                _loc_tech = _loc_tech or {}
                _is_demand = (_global is not None and _get_parent(_global) == "demand") or _get_parent(_loc_tech) == "demand"
                if not _is_demand:
                    continue
                _cons, _costs = merged_tech_def(_global or {}, _loc_tech)
                _res = qualify_file_ref(_cons.get("resource"), loc_name, {"timeSeries": time_series})
                _series = [v * resource_scale(_cons) for v in _resolve_demand_ref(_res, time_series)]
                if not _series:
                    _scalar = abs(_to_float(_res, 0.0)) * resource_scale(_cons)
                    _series = [_scalar] * n_hours if _scalar > 0 else []
                if _series and _cons.get("force_resource") is False:
                    # Optional sink (export / curtailment / market): consumes up to its resource
                    # at a price — AdOpT export limit/price, or free disposal when unpriced.
                    _car = _get_carrier_in(_global if _global is not None else _loc_tech)
                    sinks_by_carrier.setdefault(_car, []).append(
                        ([abs(v) for v in _series], _to_float(_costs.get("om_con"), 0.0)))
                    continue
                if _series:
                    _car = _get_carrier_in(_global if _global is not None else _loc_tech)
                    _prev = demand_by_carrier.get(_car)
                    demand_by_carrier[_car] = ([a + b for a, b in zip(_prev, _series)]
                                               if _prev else list(_series))

        def _tile(vals: list, n: int) -> list:
            if not vals:
                return [0.0] * n
            return list(itertools.islice(itertools.cycle(vals), n))

        for _car in demand_by_carrier:
            if _car not in carriers:
                report.append(f"{loc_name}: demand carrier '{_car}' not among model carriers — demand dropped")

        header = ";Demand;Import limit;Export limit;Import price;Export price;Import emission factor;Export emission factor;Generic production"
        for carrier in carriers:
            # Demand only on its own carrier (not every carrier at the node)
            demand_vals = _tile(demand_by_carrier.get(carrier) or [], n_hours)
            has_demand = any(v != 0 for v in demand_vals)
            priced = [(_tile(sv, n_hours), c) for sv, c in sinks_by_carrier.get(carrier, []) if c != 0]
            slack = ensure_feasibility and has_demand
            lines = [header]
            for j, ts in enumerate(timestamps):
                ts_str = _fmt_ts(ts)
                dem = str(round(demand_vals[j] / _KW_PER_MW, 9)) if has_demand else ""
                lim_kw = sum(sv[j] for sv, _ in priced)
                exp_lim = str(round(lim_kw / _KW_PER_MW, 9)) if priced else ""
                # revenue per MWh = -om_con (€/kWh) × 1000; several priced sinks → limit-weighted mean
                exp_price = (str(round(-sum(sv[j] * c for sv, c in priced) / lim_kw * _KW_PER_MW, 6))
                             if priced and lim_kw > 0 else "")
                # ensure_feasibility: demanded carriers can always be imported at a prohibitive price
                imp_lim, imp_price = (str(_UNMET_IMPORT_LIMIT_MW), str(_UNMET_PRICE_EUR_MWH)) if slack else ("", "")
                lines.append(f"{ts_str};{dem};{imp_lim};{exp_lim};{imp_price};{exp_price};;;")
            _write_text(os.path.join(carrier_data_dir, f"{carrier}.csv"), "\n".join(lines) + "\n")

        _write_json(
            os.path.join(carrier_data_dir, "EnergybalanceOptions.json"),
            {c: {"curtailment_possible": 1 if any(cost == 0 for _, cost in sinks_by_carrier.get(c, [])) else 0}
             for c in carriers},
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

def build_model_dir(model_data: dict, model_dir: str, capex_scale: float = 1.0) -> tuple:
    """
    Write the AdOpT-NET0 case directory from a TEMPO model dict.

    capex_scale multiplies investment costs (unit_CAPEX / network gammas).
    The run path passes n_hours/8760 so a sub-annual window carries only its
    share of the annualised capex; export keeps the default 1.0.

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
    _write_networks(period_dir, locations, links, technologies, capex_scale, report)
    _write_node_data(period_dir, locations, technologies, loc_tech_assign,
                     time_series, carriers, start_date, end_date, capex_scale, report,
                     ensure_feasibility=model_config.get("ensureFeasibility", True))

    report += runconfig_notes(model_data)
    return carriers, report


def generate_timestamps(start_date: str, end_date: str):
    """Return hourly pd.DatetimeIndex for start_date..end_date (inclusive)."""
    return _generate_timestamps(start_date, end_date)


def compute_capfactors(model_data: dict, report: list) -> dict:
    """{(node, tech): hourly CF list} for supply techs with a resource.
    Supply techs without one are unconstrained (CF 1.0, Calliope semantics)."""
    cfg = model_data.get("modelConfig") or {}
    n = len(_generate_timestamps((cfg.get("startDate") or "2024-01-01")[:10],
                                 (cfg.get("endDate") or "2024-12-31")[:10]))
    techs = model_data.get("technologies") or []
    lta = model_data.get("locationTechAssignments") or {}
    out = {}
    for i, loc in enumerate(model_data.get("locations") or []):
        node = _safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
        for ref, tech, loc_cfg in _placed_techs(loc, i, techs, lta):
            if _get_parent(tech) not in ("supply", "supply_plus"):
                continue
            constr, _ = merged_tech_def(tech, loc_cfg)
            cf = resource_to_cf(constr, n, report, f"{node}/{ref}", model_data, loc=node)
            if cf is not None:
                out[(node, _safe_id(tech.get("name") or tech.get("id") or ref))] = cf
    return out


def storage_power_caps(model_data: dict) -> dict:
    """Finite storage energy_cap_max (or _equals) in MW per placed storage tech: {(node, tech): MW}.
    The runner enforces it on AdOpT's discharge capacity (AdOpT STOR sizes only energy)."""
    return _storage_power_bound(model_data, "energy_cap_max")


def storage_power_mins(model_data: dict) -> dict:
    """Positive storage energy_cap_min (or _equals) in MW per placed storage tech."""
    return _storage_power_bound(model_data, "energy_cap_min")


def _storage_power_bound(model_data: dict, key: str) -> dict:
    techs = model_data.get("technologies") or []
    lta = model_data.get("locationTechAssignments") or {}
    out = {}
    for i, loc in enumerate(model_data.get("locations") or []):
        node = _safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
        for ref, tech, loc_cfg in _placed_techs(loc, i, techs, lta):
            if _get_parent(tech) != "storage":
                continue
            constr = merged_tech_def(tech, loc_cfg)[0]
            v = finite(constr.get("energy_cap_equals"))
            if v is None:
                v = finite(constr.get(key))
            if v is not None and (key == "energy_cap_max" or v > 0):
                out[(node, _safe_id(tech.get("name") or tech.get("id") or ref))] = v / _KW_PER_MW
    return out


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
    interest_rate = _to_float(econ.get("discount_rate"), 0.0)  # Calliope 0.6 default
    lifetime = max(1, int(_to_float(econ.get("lifetime"), 25.0)))
    size_max = _to_float(tdata.get("size_max"), 1_000.0) * _KW_PER_MW

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
        if eff > 0:  # export charges om_prod per input (×eff) — back to per output
            costs["monetary"]["om_prod"] = round(om_prod / eff, 6)
        return {
            "name": tid,
            "essentials": {"parent": "conversion", "carrier_out": cout, "carrier_in": cin, "name": tid},
            "constraints": {"energy_cap_max": size_max, "energy_eff": eff, "lifetime": lifetime},
            "costs": costs,
        }

    if tec_type == "CONV2":
        couts = perf.get("output_carrier") or ["electricity"]
        cins = perf.get("input_carrier") or ["electricity"]
        outs = (perf.get("performance") or {}).get("out") or {}
        first = next(iter(outs.values()), None) if isinstance(outs, dict) else None
        per_out = _to_float(first[-1] if isinstance(first, list) and first else 1.0, 1.0)
        if per_out > 0:  # export charges om_prod per input (×per-output efficiency)
            costs["monetary"]["om_prod"] = round(om_prod / per_out, 6)
        return {
            "name": tid,
            "essentials": {"parent": "conversion_plus", "carrier_out": couts, "carrier_in": cins, "name": tid},
            "constraints": {"energy_cap_max": size_max, "lifetime": lifetime},
            "costs": costs,
        }

    if tec_type == "STOR":
        carrier = (perf.get("output_carrier") or [perf.get("carrier_out", "electricity")])[0]
        stor_perf = perf.get("performance") or {}
        flex = tdata.get("Flexibility") or {}
        # Calliope energy_eff is applied each way, same as AdOpT eta_in/eta_out.
        eff = _to_float(stor_perf.get("eta_out"), 1.0)
        storage_loss = _to_float(stor_perf.get("lambda"), 0.0)
        report.append(f"Technology '{tid}': storage om_annual (if any) was folded into the power "
                      "capex on export — imported as part of energy_cap.")
        stor_costs = {"monetary": {
            "storage_cap": round(unit_capex / 1_000, 4),
            "energy_cap": round(_to_float(flex.get("capex_discharging_power"), 0.0) / 1_000, 4),
            "interest_rate": interest_rate,
        }}
        return {
            "name": tid,
            "essentials": {"parent": "storage", "carrier": carrier, "name": tid},
            "constraints": {
                "storage_cap_max": size_max,
                "energy_cap_max": size_max,
                "energy_eff": eff,
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

            for carrier in carriers:
                carrier_csv = node_dir / "carrier_data" / f"{carrier}.csv"
                if carrier_csv.exists():
                    vals_mw = _parse_demand_csv(carrier_csv)
                    if any(v != 0 for v in vals_mw):
                        # carrier CSV is MW → kW
                        demand_by_node.setdefault(node_name, {})[carrier] = \
                            [round(v * 1_000, 3) for v in vals_mw[:24]]

    # Create demand technologies only for carriers that actually carry demand
    demand_techs_by_carrier: dict = {}
    for carrier in carriers:
        series = [d[carrier] for d in demand_by_node.values() if carrier in d]
        if not series:
            continue
        tid = "power_demand" if carrier == "electricity" else f"{carrier}_demand"
        if tid not in tech_defs:
            peak = max(max(s) for s in series)
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
        for carrier in demand_by_node.get(node_name, {}):
            techs[demand_techs_by_carrier[carrier]] = None

        loc: dict = {
            "name": node_name,
            "latitude": node_coords.get(node_name, {}).get("latitude", 0.0),
            "longitude": node_coords.get(node_name, {}).get("longitude", 0.0),
            "techs": techs,
        }
        if node_name in demand_by_node:
            node_dem = demand_by_node[node_name]
            dcar = primary_carrier if primary_carrier in node_dem else next(iter(node_dem))
            loc["demandProfile"] = {"timeseries": node_dem[dcar], "carrier": dcar}
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
