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
import engine_diagnostics as diag


def _patch_res_capfactor(Res):
    """adopt_net0 only computes capfactor for names containing "Photovoltaic",
    "SolarThermal" or "WindTurbine". For every other RES tech inject the TEMPO
    resource profile (compute_capfactors), or CF 1.0 when the tech has no
    resource (Calliope: unconstrained supply). The profiles live on the per-job
    thread (`_thread_local.capfactors`, set by run_model) — the service runs jobs
    on threads and read_data calls this fit on the job's own thread."""
    import numpy as np
    if getattr(Res.fit_technology_performance, "_tempo_patched", False):
        return
    _orig_fit = Res.fit_technology_performance

    def _patched_fit(self, climate_data, location):
        _orig_fit(self, climate_data, location)
        td_full = self.processed_coeff.time_dependent_full
        if "capfactor" not in td_full:
            n = len(climate_data)
            capfactors = getattr(_thread_local, "capfactors", None) or {}
            series = capfactors.get((getattr(location, "name", None), self.name))
            td_full["capfactor"] = np.array(series[:n], dtype=float) if series else np.ones(n)

    _patched_fit._tempo_patched = True
    Res.fit_technology_performance = _patched_fit

    # adopt_net0 0.1.x Res._calculate_bounds hard-codes the "electricity"
    # carrier, so a non-electric supply (e.g. gas) raises KeyError in
    # init_output_bounds. Re-key the output bound to the tech's own carriers.
    _orig_bounds = Res._calculate_bounds

    def _patched_bounds(self):
        _orig_bounds(self)
        out = self.bounds["output"]
        carriers = list(self.component_options.output_carrier)
        if "electricity" in out and "electricity" not in carriers:
            bound = out.pop("electricity")
            for car in carriers:
                out[car] = bound

    Res._calculate_bounds = _patched_bounds


def _tie_storage_power(model, power_caps: dict, power_mins: dict | None = None) -> int:
    """Calliope storage has one energy_cap bounding both charge and discharge.
    AdOpT (flexratio) sizes charge and discharge capacity separately and the
    translator puts all power capex on discharge, so tie charge == discharge and
    apply energy_cap_max / energy_cap_min ({(node, tech): MW}) to it. Returns blocks tied."""
    import pyomo.environ as pyo
    n = 0
    for p in model.set_periods:
        for node in model.periods[p].node_blocks:
            b_node = model.periods[p].node_blocks[node]
            for tec in b_node.tech_blocks_active:
                b = b_node.tech_blocks_active[tec]
                if b.find_component("var_capacity_charge") is None:
                    continue
                b.const_tempo_charge_eq_discharge = pyo.Constraint(
                    expr=b.var_capacity_charge == b.var_capacity_discharge)
                p_max = power_caps.get((node, tec))
                if p_max is not None:
                    b.const_tempo_power_max = pyo.Constraint(expr=b.var_capacity_discharge <= p_max)
                p_min = (power_mins or {}).get((node, tec))
                if p_min is not None:
                    b.const_tempo_power_min = pyo.Constraint(expr=b.var_capacity_discharge >= p_min)
                n += 1
    return n


def _patch_highs_support(ModelHub):
    """Monkey-patch adopt_net0 to accept HiGHS as a solver.

    AdOpT-NET0 0.1.x hard-codes only gurobi/glpk in its solver check and
    solver-settings methods.  HiGHS is available via pyomo's SolverFactory
    but is not recognised, causing an UnboundLocalError at runtime.  This
    patch adds the missing branch to both methods so HiGHS can be used.
    """
    import pyomo.environ as pyo

    if getattr(ModelHub._call_solver, "_tempo_patched", False):
        return
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
            # Interior point + crossover: far faster than HiGHS's default simplex on these large
            # network LPs (hours -> minutes), and crossover still returns a vertex solution.
            try:
                self.solver.config.solver_options.update({"solver": "ipm", "run_crossover": "on"})
            except Exception as exc:  # option plumbing differs between pyomo versions
                log(f"  Could not select HiGHS interior point ({exc}) — using its default")
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
    _patched_call_solver._tempo_patched = True
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
    """Read AdOpT-NET0's optimization_results.h5 (lowercase groups) into model units (MW, MWh, €)."""
    h5_files = glob.glob(os.path.join(results_dir, "**", "*.h5"), recursive=True)
    if not h5_files:
        log("No HDF5 result file found — capacity/dispatch unavailable")
        return {}
    h5_path = sorted(h5_files)[-1]
    log(f"  Reading HDF5 results: {os.path.basename(h5_path)}")
    import h5py
    import numpy as np

    def _scalar(ds):
        v = np.array(ds).ravel()[0]
        return v.decode() if isinstance(v, bytes) else float(v)

    out = {"objective": None, "violation_cost": None, "solver_status": "unknown",
           "capacity": {}, "storage_capacity": {}, "tech_costs": {}, "dispatch": {},
           "arcs": {}, "network_costs": {}, "demand": {}, "notes": []}
    with h5py.File(h5_path, "r") as f:
        for key, name in (("objective", "total_cost"), ("violation_cost", "violation_cost"),
                          ("solver_status", "solver_status")):
            if f"summary/{name}" in f:
                out[key] = _scalar(f[f"summary/{name}"])

        nodes = f.get("design/nodes/period1") or {}
        for node in nodes:
            for tech in nodes[node]:
                g = nodes[node][tech]
                if "capacity_discharge" in g:  # storage: size is MWh, power is the discharge capacity
                    out["capacity"].setdefault(node, {})[tech] = _scalar(g["capacity_discharge"])
                    out["storage_capacity"].setdefault(node, {})[tech] = _scalar(g["size"])
                elif "size" in g:
                    out["capacity"].setdefault(node, {})[tech] = _scalar(g["size"])
                # opex_variable is already the sum over all timesteps
                cost = sum(_scalar(g[k]) for k in ("capex_tot", "opex_fixed_tot", "opex_variable") if k in g)
                out["tech_costs"].setdefault(node, {})[tech] = cost

        ops = f.get("operation/technology_operation/period1") or {}
        for node in ops:
            for tech in ops[node]:
                for key in ops[node][tech]:
                    if key.endswith("_output"):
                        carrier = key[: -len("_output")]
                        out["dispatch"].setdefault(node, {}).setdefault(tech, {})[carrier] = \
                            np.array(ops[node][tech][key]).ravel().tolist()
                # Storage outside flexratio (engine overlay) writes only size (MWh): it is
                # not a power capacity, so report it as storage capacity only.
                if "storage_level" in ops[node][tech] and \
                        tech not in out["storage_capacity"].get(node, {}):
                    mwh = out["capacity"].get(node, {}).pop(tech, None)
                    if mwh is not None:
                        out["storage_capacity"].setdefault(node, {})[tech] = mwh
                        out["notes"].append(f"{node}/{tech}: storage not in flexratio mode — power "
                                            "capacity not available; only storage (MWh) capacity reported")

        nets = f.get("design/networks/period1") or {}
        flows = f.get("operation/networks/period1") or {}
        for net in nets:
            seen_pairs = set()
            cost = 0.0
            for arc in nets[net]:
                g = nets[net][arc]
                a, b = _scalar(g["fromNode"]), _scalar(g["toNode"])
                rec = {"size": _scalar(g["size"]) if "size" in g else 0.0}
                if net in flows and arc in flows[net]:
                    fl = np.array(flows[net][arc]["flow"]).ravel()
                    ls = np.array(flows[net][arc]["losses"]).ravel() if "losses" in flows[net][arc] else 0 * fl
                    rec["delivered"] = (fl - ls).tolist()
                out["arcs"].setdefault(net, {})[(a, b)] = rec
                # AdOpT objective: capex + fixed opex once per bidirectional pair,
                # variable opex (flow-based) on every arc.
                pair = tuple(sorted((a, b)))
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    cost += sum(_scalar(g[k]) for k in ("capex", "opex_fixed") if k in g)
                if "opex_variable" in g:
                    cost += _scalar(g["opex_variable"])
            out["network_costs"][net] = cost

        bal = f.get("operation/energy_balance/period1") or {}
        for node in bal:
            for carrier in bal[node]:
                if "demand" in bal[node][carrier]:
                    d = np.array(bal[node][carrier]["demand"], dtype=float).ravel()
                    prev = out["demand"].get(carrier)
                    out["demand"][carrier] = (d if prev is None else np.array(prev) + d).tolist()
    return out


# ---------------------------------------------------------------------------
# Frozen-contract normalisation
# ---------------------------------------------------------------------------

_KW_PER_MW = 1_000.0


def _to_frozen_contract(extracted: dict, timestamps: list, model_data: dict, name: str = "",
                        solver: str = "highs") -> dict:
    """AdOpT-NET0 extracted results (MW, MWh, €) → TEMPO frozen contract (kW, kWh, €)."""
    techs = {t.get("name"): t for t in model_data.get("technologies") or []}
    parents = {n: translate._get_parent(t) for n, t in techs.items()}
    link_tech = translate.network_names(model_data.get("links") or [], model_data.get("technologies") or [])

    capacities, storage_capacities, generation, dispatch = {}, {}, {}, {}
    costs_by_tech, costs_by_location = {}, {}
    out_per_in = translate.conv3_output_per_input(model_data)
    for node, tmap in (extracted.get("capacity") or {}).items():
        for tech, mw in tmap.items():
            capacities[f"{node}::{tech}"] = mw * _KW_PER_MW * out_per_in.get((node, tech), 1.0)
    for node, tmap in (extracted.get("storage_capacity") or {}).items():
        for tech, mwh in tmap.items():
            storage_capacities[f"{node}::{tech}"] = mwh * _KW_PER_MW
    for node, tmap in (extracted.get("tech_costs") or {}).items():
        for tech, eur in tmap.items():
            costs_by_tech[tech] = costs_by_tech.get(tech, 0.0) + eur
            costs_by_location.setdefault(node, {})[tech] = eur
    for node, tmap in (extracted.get("dispatch") or {}).items():
        for tech, cmap in tmap.items():
            for carrier, series in cmap.items():
                kw = [(v or 0.0) * _KW_PER_MW for v in series]
                generation[f"{node}::{tech}::{carrier}"] = sum(kw)
                prev = dispatch.get(tech)
                dispatch[tech] = kw if prev is None else [p + q for p, q in zip(prev, kw)]

    # Several networks can join one node pair (duplicate links, or different techs):
    # capacities sum per (pair, tech) and the net signed flow sums per pair.
    transmission_flow = {}
    for net, arcs in (extracted.get("arcs") or {}).items():
        tid = link_tech.get(net, net.split("__")[0])
        for (a, b), rec in arcs.items():
            key = f"{a}::{tid}:{b}"
            capacities[key] = capacities.get(key, 0.0) + rec.get("size", 0.0) * _KW_PER_MW
        for (a, b) in sorted({tuple(sorted(p)) for p in arcs}):
            fwd = (arcs.get((a, b)) or {}).get("delivered") or []
            rev = (arcs.get((b, a)) or {}).get("delivered") or []
            n = max(len(fwd), len(rev))
            net_flow = [((fwd[i] if i < len(fwd) else 0.0) - (rev[i] if i < len(rev) else 0.0)) * _KW_PER_MW
                        for i in range(n)]
            prev = transmission_flow.get(f"{a}::{b}")
            if prev is not None:
                net_flow = [x + y for x, y in zip(prev["timeseries"], net_flow)]
            transmission_flow[f"{a}::{b}"] = {"from": a, "to": b, "timeseries": net_flow}
        costs_by_tech[tid] = costs_by_tech.get(tid, 0.0) + (extracted.get("network_costs") or {}).get(net, 0.0)

    demand = [0.0] * len(timestamps)
    for series in (extracted.get("demand") or {}).values():
        for i, v in enumerate(series[: len(demand)]):
            demand[i] += (v or 0.0) * _KW_PER_MW

    status = str(extracted.get("solver_status") or "unknown")
    return {
        "success": status in ("ok", "optimal"),
        "framework": "adoptnet0",
        "model_name": name,
        "name": name,
        "solver": solver,
        "objective": extracted.get("objective"),
        "termination_condition": "optimal" if status in ("ok", "optimal") else status,
        "capacities": capacities,
        "storage_capacities": storage_capacities,
        "generation": generation,
        "dispatch": dispatch,
        "timestamps": timestamps,
        "transmission_flow": transmission_flow,
        "demand_timeseries": demand,
        "costs_by_tech": costs_by_tech,
        "costs_by_location": costs_by_location,
        "tech_metadata": {n: {"name": (t.get("essentials") or {}).get("name", n),
                              "carrier": translate._get_carrier_out(t),
                              "color": (t.get("essentials") or {}).get("color", "")}
                          for n, t in techs.items()},
        "tech_parents": parents,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def _release_arc_flow_lower_bounds(model) -> None:
    """AdOpT bounds each arc's flow to [size_min, size_max] × rated capacity. A fixed
    (existing) line is written with size_min = size_max = its capacity, which would force
    the flow to equal full capacity in both directions (infeasible with the bidirectional
    cut). Flows (and losses) must only be bounded by the size, so drop their lower bound to 0."""
    import pyomo.environ as pyo
    for v in model.component_data_objects(pyo.Var, descend_into=True):
        if (v.lb and v.lb > 0
                and v.parent_component().local_name in ("var_flow", "var_losses")
                and v.parent_block().parent_component().local_name == "arc_block"):
            v.setlb(0)


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

    assessment = diag.raise_if_blocked(model_data, "adoptnet0")
    for line in diag.assessment_lines(assessment):
        log(f"  {line}")

    log(f'Starting AdOpT-NET0 run: "{name}"')
    log(f"  {len(locations)} location(s), {len(technologies)} tech(s), {len(links)} link(s)")
    log(f"  Period: {start_date} → {end_date}, solver: {solver}")

    model_dir = os.path.join(work_dir, "model_data")

    log("  Translating model to AdOpT-NET0 format…")
    n_hours = len(translate.generate_timestamps(start_date, end_date))
    carriers, tr_report = translate.build_model_dir(model_data, model_dir,
                                                    capex_scale=n_hours / 8760.0)
    _thread_local.capfactors = translate.compute_capfactors(model_data, tr_report)
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
    # Importing adopt_net0 sets the *root* logger to DEBUG, which makes Pyomo print every
    # constructed component (tens of millions of lines on a network model) and slows the run.
    logging.getLogger().setLevel(logging.WARNING)
    logging.getLogger("adopt_net0").setLevel(logging.INFO)  # keep AdOpT's own progress lines
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
    _tie_storage_power(hub.model[hub.info_solving_algorithms["aggregation_model"]],
                       translate.storage_power_caps(model_data),
                       translate.storage_power_mins(model_data))

    _release_arc_flow_lower_bounds(hub.model[hub.info_solving_algorithms["aggregation_model"]])

    log(f"  Solving ({solver})…")
    try:
        hub.solve()
    except Exception as exc:
        info = diag.explain_exception("adoptnet0", exc, model_data)
        if info is None:
            raise
        return diag.failure_result("adoptnet0", name, solver, info["termination"], model_data,
                                   tr_report + diag.assessment_lines(assessment), info["detail"], info["kind"])

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
    frozen["translation_report"] = tr_report + (extracted.get("notes") or []) + diag.assessment_lines(assessment)
    frozen["limitations"] = list(assessment["warnings"])
    unmet = extracted.get("violation_cost")
    if unmet and unmet > 1e-6 and model_config.get("ensureFeasibility") is False:
        return diag.failure_result(
            "adoptnet0", name, solver, "infeasible", model_data, frozen["translation_report"],
            "Demand cannot be met with the available supply, storage and transmission "
            f"(unmet-demand penalty {unmet:,.0f}).")
    if unmet and unmet > 1e-6:
        frozen["limitations"].append({
            "code": "unmet_demand", "severity": "warning",
            "message": f"Demand could not be fully met: {unmet:,.0f} of unmet-demand penalty is in the objective. "
                       "Check supply capacity, resource availability and transmission limits."})
    frozen["fidelity"] = assessment["fidelity"]
    log(f"  Done. Objective = {frozen['objective']}")
    return frozen
