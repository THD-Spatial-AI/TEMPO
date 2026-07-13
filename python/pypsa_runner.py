#!/usr/bin/env python3
"""
PyPSA Model Runner
------------------
Translates TEMPO's internal model format into a pypsa.Network (via
pypsa_translate), solves it with HiGHS (linopy backend), and extracts results
into the frozen TEMPO result contract:

    model_name, solver, success, termination_condition, objective,
    capacities {loc::tech}, generation {loc::tech::carrier},
    dispatch {tech: [hourly]}, timestamps, transmission_flow
    {a::b: {from, to, timeseries}}, demand_timeseries,
    costs_by_tech, costs_by_location, tech_metadata, tech_parents

Entry point:
    run_model(model_data: dict, work_dir: str, log_fn: callable | None) -> dict
"""

from __future__ import annotations

import logging
import threading

import pypsa_translate as translate

_thread_local = threading.local()


def log(msg: str) -> None:
    fn = getattr(_thread_local, "log_fn", None)
    if fn is not None:
        fn(f"[PYPSA] {msg}")
    else:
        print(f"[PYPSA] {msg}", flush=True)


class _LogFnHandler(logging.Handler):
    """Forwards pypsa/linopy log records to the job's log callback."""

    def emit(self, record):
        try:
            log(record.getMessage())
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Result extraction
# ---------------------------------------------------------------------------

def _tech_metadata(technologies):
    tech_meta = {}
    for tdef in technologies or []:
        tn = tdef.get('id') or tdef.get('name', '')
        if not tn:
            continue
        ess = tdef.get('essentials') or {}
        parent = ess.get('parent') or tdef.get('parent', '')
        carrier_out = ess.get('carrier_out') or ess.get('carrier', '')
        if isinstance(carrier_out, list):
            carrier_out = carrier_out[0] if carrier_out else ''
        meta = {
            'parent':       str(parent).strip(),
            'carrier_out':  str(carrier_out).strip().lower(),
            'display_name': str(ess.get('name') or tdef.get('name', tn)),
            'color':        str(ess.get('color') or tdef.get('color', '')),
        }
        tech_meta[tn] = meta
        sid = translate.safe_id(tn)
        if sid not in tech_meta:
            tech_meta[sid] = meta
    return tech_meta


def _split_component_name(name):
    """'loc::tech' or 'loc::tech:remote' → (loc, tech). None for other shapes."""
    parts = str(name).split('::')
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


def _extract_results(n, spec, technologies, model_name, solver, termination):
    results = {
        'model_name': model_name,
        'solver': solver,
        'success': termination == 'optimal',
        'termination_condition': termination,
    }

    tech_meta = _tech_metadata(technologies)
    if tech_meta:
        results['tech_metadata'] = tech_meta
        results['tech_parents'] = {k: v['parent'] for k, v in tech_meta.items()}

    parent_by_tid = {}
    for tdef in technologies or []:
        tn = tdef.get('id') or tdef.get('name', '')
        if tn:
            parent_by_tid[translate.safe_id(tn)] = \
                str((tdef.get('essentials') or {}).get('parent') or '').lower()

    def _bus_carrier(bus):
        try:
            return str(n.buses.loc[bus, 'carrier'])
        except Exception:
            return 'electricity'

    def _r3(vals):
        return [round(float(v), 3) for v in vals]

    timestamps = [str(t) for t in n.snapshots]
    results['timestamps'] = timestamps

    try:
        results['objective'] = float(n.objective)
    except Exception as e:
        log(f"  Could not extract objective: {e}")

    capacities = {}
    generation = {}
    dispatch = {}
    costs_by_tech = {}
    costs_by_location = {}

    def _add_cost(loc, tid, value):
        v = float(value)
        if v != v:  # nan
            return
        costs_by_tech[tid] = costs_by_tech.get(tid, 0.0) + v
        costs_by_location.setdefault(loc, {})
        costs_by_location[loc][tid] = costs_by_location[loc].get(tid, 0.0) + v

    def _add_dispatch(tid, series):
        vals = series.fillna(0.0).astype(float)
        prev = dispatch.get(tid)
        dispatch[tid] = (vals if prev is None else prev + vals)

    # ── Generators (supply + unmet slack) ────────────────────────────────────
    for name in n.generators.index:
        split = _split_component_name(name)
        if split is None:
            continue
        loc, tid = split
        row = n.generators.loc[name]
        p = n.generators_t.p[name] if name in n.generators_t.p.columns else None
        if tid == 'unmet_demand':
            if p is not None and float(p.abs().max()) > 1e-6:
                log(f"  WARNING: unmet demand at {loc}: peak {float(p.max()):.1f} kW")
            continue
        p_nom = float(row.get('p_nom_opt', row.get('p_nom', 0.0)))
        capacities[f"{loc}::{tid}"] = p_nom
        cost = float(row.get('capital_cost', 0.0)) * p_nom
        if p is not None:
            generation[f"{loc}::{tid}::{_bus_carrier(row['bus'])}"] = \
                round(float(p.fillna(0.0).sum()), 3)
            _add_dispatch(tid, p)
            cost += float(row.get('marginal_cost', 0.0)) * float(p.fillna(0.0).sum())
        _add_cost(loc, tid, cost)

    # ── Stores + their charge/discharge links (storage techs) ───────────────
    storage_link_names = set()
    for name in n.stores.index:
        split = _split_component_name(name)
        if split is None:
            continue
        loc, tid = split
        row = n.stores.loc[name]
        cost = float(row.get('capital_cost', 0.0)) * float(row.get('e_nom_opt', 0.0))

        discharge_name = f"{name}::discharge"
        charge_name = f"{name}::charge"
        storage_link_names.update((discharge_name, charge_name))
        if discharge_name in n.links.index:
            lrow = n.links.loc[discharge_name]
            p_nom = float(lrow.get('p_nom_opt', 0.0))
            # discharge link p_nom is store-side input; energy_cap is output side
            capacities[f"{loc}::{tid}"] = p_nom * float(lrow.get('efficiency', 1.0))
            cost += float(lrow.get('capital_cost', 0.0)) * p_nom
            if discharge_name in n.links_t.p1.columns:
                out = -n.links_t.p1[discharge_name]  # p1 < 0 = injection into main bus
                generation[f"{loc}::{tid}::{_bus_carrier(lrow['bus1'])}"] = \
                    round(float(out.fillna(0.0).sum()), 3)
                _add_dispatch(tid, out)
                cost += float(lrow.get('marginal_cost', 0.0)) * \
                    float(n.links_t.p0[discharge_name].fillna(0.0).sum())
        _add_cost(loc, tid, cost)

    # ── Remaining links: transmission (loc::tech:remote) + conversion ───────
    tx_delivered = {}  # (from, to, tid) -> delivered series at 'to'
    for name in n.links.index:
        if name in storage_link_names:
            continue
        split = _split_component_name(name)
        if split is None:
            continue
        loc, tid_full = split
        row = n.links.loc[name]
        p_nom = float(row.get('p_nom_opt', row.get('p_nom', 0.0)))
        cost = float(row.get('capital_cost', 0.0)) * p_nom
        if name in n.links_t.p0.columns:
            cost += float(row.get('marginal_cost', 0.0)) * \
                float(n.links_t.p0[name].fillna(0.0).sum())

        if ':' in tid_full:  # transmission 'tech:remote'
            tid, remote = tid_full.split(':', 1)
            capacities[f"{loc}::{tid_full}"] = p_nom
            _add_cost(loc, tid, cost)
            if name in n.links_t.p1.columns:
                delivered = (-n.links_t.p1[name]).fillna(0.0)
                tx_delivered[(loc, remote, tid)] = delivered
                generation[f"{remote}::{tid}:{loc}::{_bus_carrier(row['bus1'])}"] = \
                    round(float(delivered.sum()), 3)
        else:  # conversion
            tid = tid_full
            eff = float(row.get('efficiency', 1.0))
            capacities[f"{loc}::{tid}"] = p_nom * eff  # output-side cap
            _add_cost(loc, tid, cost)
            if name in n.links_t.p1.columns:
                out = (-n.links_t.p1[name]).fillna(0.0)
                generation[f"{loc}::{tid}::{_bus_carrier(row['bus1'])}"] = \
                    round(float(out.sum()), 3)
                _add_dispatch(tid, out)

    # ── Transmission flow: net per sorted node pair ──────────────────────────
    tx_flow = {}
    pairs = {tuple(sorted((a, b))) for (a, b, _t) in tx_delivered}
    for a, b in sorted(pairs):
        net = None
        for (src, dst, _tid), series in tx_delivered.items():
            if {src, dst} != {a, b}:
                continue
            signed = series if dst == b else -series
            net = signed if net is None else net + signed
        if net is not None and float(net.abs().max()) >= 1e-6:
            tx_flow[f"{a}::{b}"] = {'from': a, 'to': b, 'timeseries': _r3(net)}
    if tx_flow:
        results['transmission_flow'] = tx_flow

    # ── Demand timeseries: total load served ─────────────────────────────────
    if len(n.loads.index) > 0:
        p = n.loads_t.p if not n.loads_t.p.empty else n.loads_t.p_set
        results['demand_timeseries'] = _r3(p.abs().sum(axis=1))

    results['capacities'] = {k: (0.0 if (v != v or v == 0) else v) for k, v in capacities.items()}
    results['generation'] = generation
    results['dispatch'] = {
        tid: _r3(series) for tid, series in dispatch.items()
        if parent_by_tid.get(tid, '') not in ('demand', 'transmission')
        and float(series.sum()) > 0
    }
    results['costs_by_tech'] = {k: v for k, v in costs_by_tech.items() if v > 0}
    results['costs_by_location'] = costs_by_location

    log(f"Objective value: {results.get('objective', 'N/A')}")
    return results


# ---------------------------------------------------------------------------
# Main entry point (same contract as calliope_runner.run_model)
# ---------------------------------------------------------------------------

def run_model(model_data: dict, work_dir: str, log_fn=None) -> dict:
    _thread_local.log_fn = log_fn

    model_name = model_data.get('name', 'Model')
    model_config = model_data.get('modelConfig') or {}

    mode = model_config.get('mode') or 'plan'
    if mode != 'plan':
        raise RuntimeError(
            f"Mode '{mode}' is not supported on the PyPSA engine — only 'plan' "
            "(capacity expansion). Run this model on the Calliope 0.6.8 engine."
        )
    if model_data.get('scenario') or model_data.get('override'):
        raise RuntimeError(
            "Scenario/override runs are not applied on the PyPSA engine yet. "
            "Run the base model, or use the Calliope engine for scenario runs."
        )

    requested_solver = model_data.get('solver') or 'highs'
    if requested_solver != 'highs':
        log(f"  Solver '{requested_solver}' mapped to 'highs' (PyPSA engine uses HiGHS via linopy)")
    solver = 'highs'

    log(f"Translating '{model_name}' to PyPSA…")
    spec, report = translate.translate_model(model_data)
    for line in report:
        log(f"  [translate] {line}")
    log(f"  {len(spec['buses'])} buses, {len(spec['generators'])} generators, "
        f"{len(spec['loads'])} loads, {len(spec['stores'])} stores, "
        f"{len(spec['links'])} links, {len(spec['snapshots'])} snapshots")

    n = translate.build_network(spec)

    handler = _LogFnHandler()
    loggers = [logging.getLogger(name) for name in ('pypsa', 'linopy')]
    for lg in loggers:
        lg.addHandler(handler)
    try:
        log(f"Solving with {solver}…")
        status, condition = 'ok', 'optimal'
        res = n.optimize(solver_name=solver)
        if isinstance(res, tuple) and len(res) == 2:
            status, condition = str(res[0]), str(res[1])
    finally:
        for lg in loggers:
            lg.removeHandler(handler)

    termination = 'optimal' if (status == 'ok' and condition in ('optimal', 'ok')) \
        else (condition or status or 'unknown')
    log(f"Solver finished: status={status}, condition={condition}")

    if termination != 'optimal':
        return {
            'model_name': model_name,
            'solver': solver,
            'success': False,
            'termination_condition': termination,
        }

    results = _extract_results(
        n, spec, model_data.get('technologies') or [],
        model_name, solver, termination)
    results['translation_report'] = report
    return results
