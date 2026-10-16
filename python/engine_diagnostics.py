"""
Engine diagnostics
------------------
Shared, dependency-free (stdlib only) helpers that every engine runner uses to

  1. ASSESS a model before running it: structural errors (nothing to run, unsupported
     mode, missing timeseries) and the Calliope features the target engine cannot carry
     over, so a translation never silently changes the problem it solves;
  2. DIAGNOSE a failed run: turn solver terminations / exceptions into one actionable
     message with hints, in the same result shape every engine returns.

The capability table below is the single source of truth for what each engine translates.
Keep it in step with the translators: when an engine learns a feature, change its level here
(`tests/test_engine_diagnostics.py` pins the table against the translators' reports).

Levels: FULL (translated faithfully), PARTIAL (approximated / subset), NONE (ignored).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

FULL, PARTIAL, NONE = "full", "partial", "none"

ENGINES = ("calliope-0.6.8", "calliope-0.7", "pypsa", "osemosys", "adoptnet0")

# Service / runner ids → capability-table ids
ENGINE_ALIASES = {
    "calliope": "calliope-0.6.8", "calliope06": "calliope-0.6.8", "0.6": "calliope-0.6.8",
    "calliope07": "calliope-0.7", "0.7": "calliope-0.7",
    "pypsa": "pypsa", "osemosys": "osemosys", "adoptnet0": "adoptnet0",
}

# feature id → (label, impact). impact 'high' features change the optimum when ignored.
FEATURES: Dict[str, tuple] = {
    "must_run": ("Minimum part-load (energy_cap_min_use): plant forced to produce a share of its capacity at all times", "high"),
    "conversion_plus": ("Multi-carrier conversion_plus (secondary outputs/inputs, carrier_ratios)", "high"),
    "integer_units": ("Integer / unit-commitment variables (units_*, purchase cost)", "high"),
    "reserve_margin": ("Reserve margin (run.reserve_margin)", "high"),
    "group_constraints": ("Group constraints (run.group_constraints)", "high"),
    "ramping": ("Ramping limits (energy_ramping)", "low"),
    "resource_area": ("Resource-area limits (resource_area_*)", "high"),
    "time_varying_cost": ("Time-varying costs read from a timeseries file (file=...)", "high"),
    "export_revenue": ("Export revenue on a technology (costs.export / export_carrier)", "high"),
    "optional_sink": ("Optional demand sinks (force_resource: false — exports, curtailment, markets)", "high"),
    "operate_mode": ("Operate (dispatch-only) mode", "high"),
    "spores_mode": ("SPORES near-optimal alternatives", "high"),
}

_N = NONE
_SUPPORT: Dict[str, Dict[str, tuple]] = {
    "must_run": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (PARTIAL, "applied to supply techs only (p_min_pu); conversion/storage minimum load is ignored"),
        "osemosys": (_N, "no per-timeslice minimum activity in this translation — the plant may be dispatched at zero"),
        "adoptnet0": (_N, "pure-LP translation has no minimum part-load"),
    },
    "conversion_plus": {
        "calliope-0.6.8": (FULL, ""),
        "calliope-0.7": (_N, "mapped to a single-output conversion: secondary carriers and carrier_ratios are dropped"),
        "pypsa": (_N, "mapped to a single-output conversion: secondary carriers and carrier_ratios are dropped"),
        "osemosys": (_N, "mapped to a single-output conversion: secondary carriers and carrier_ratios are dropped"),
        "adoptnet0": (_N, "mapped to a single-output conversion: secondary carriers and carrier_ratios are dropped"),
    },
    "integer_units": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (_N, "LP only — unit counts and purchase costs are relaxed/ignored"),
        "osemosys": (_N, "LP only — unit counts and purchase costs are relaxed/ignored"),
        "adoptnet0": (_N, "run as a pure LP — unit counts and purchase costs are relaxed/ignored"),
    },
    "reserve_margin": {
        "calliope-0.6.8": (FULL, ""),
        "calliope-0.7": (_N, "not translated"), "pypsa": (_N, "not translated"),
        "osemosys": (_N, "not translated"), "adoptnet0": (_N, "not translated"),
    },
    "group_constraints": {
        "calliope-0.6.8": (PARTIAL, "legacy supply_share_* keys are not enforced by Calliope 0.6.8 itself; carrier_prod_share_* / cost_* are"),
        "calliope-0.7": (_N, "not translated"), "pypsa": (_N, "not translated"),
        "osemosys": (_N, "not translated"), "adoptnet0": (_N, "not translated"),
    },
    "ramping": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (_N, "ramp limits ignored"), "osemosys": (_N, "ramp limits ignored"),
        "adoptnet0": (_N, "ramp limits ignored"),
    },
    "resource_area": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (_N, "area limits ignored — capacity is not bounded by available area"),
        "osemosys": (_N, "area limits ignored — capacity is not bounded by available area"),
        "adoptnet0": (_N, "area limits ignored — capacity is not bounded by available area"),
    },
    "time_varying_cost": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (_N, "only scalar costs are translated; a file= cost is treated as 0"),
        "osemosys": (_N, "only scalar costs are translated; a file= cost is treated as 0"),
        "adoptnet0": (_N, "only scalar costs are translated; a file= cost is treated as 0"),
    },
    "export_revenue": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (_N, "technology export revenue is ignored"),
        "osemosys": (_N, "technology export revenue is ignored"),
        "adoptnet0": (_N, "technology export revenue is ignored"),
    },
    "optional_sink": {e: (FULL, "") for e in ENGINES},
    "operate_mode": {
        "calliope-0.6.8": (FULL, ""), "calliope-0.7": (FULL, ""),
        "pypsa": (_N, "capacity expansion ('plan') only"),
        "osemosys": (_N, "capacity expansion ('plan') only"),
        "adoptnet0": (_N, "capacity expansion ('plan') only"),
    },
    "spores_mode": {
        "calliope-0.6.8": (FULL, ""),
        "calliope-0.7": (_N, "SPORES is only available on Calliope 0.6.8"),
        "pypsa": (_N, "SPORES is only available on Calliope 0.6.8"),
        "osemosys": (_N, "SPORES is only available on Calliope 0.6.8"),
        "adoptnet0": (_N, "SPORES is only available on Calliope 0.6.8"),
    },
}


def canonical_engine(engine: str) -> str:
    return ENGINE_ALIASES.get(str(engine), str(engine))


def support(feature: str, engine: str) -> tuple:
    """(level, note) of an engine for a feature."""
    return _SUPPORT[feature][canonical_engine(engine)]


def capability_table() -> Dict[str, Dict[str, dict]]:
    """JSON-friendly {engine: {feature: {level, note, label}}} (for UIs / docs)."""
    return {
        e: {f: {"level": support(f, e)[0], "note": support(f, e)[1], "label": FEATURES[f][0]}
            for f in FEATURES}
        for e in ENGINES
    }


# ─── model scanning ─────────────────────────────────────────────────────────────

def _parent(tech: dict) -> str:
    return str((tech.get("essentials") or {}).get("parent") or tech.get("parent") or "supply")


def _tech_index(model_data: dict) -> Dict[str, dict]:
    idx = {}
    for t in model_data.get("technologies") or []:
        for k in (t.get("name"), t.get("id")):
            if k:
                idx[str(k)] = t
    return idx


def _is_file_ref(v: Any) -> bool:
    return isinstance(v, str) and v.startswith("file=")


def _iter_tech_defs(model_data: dict):
    """Yield (label, tech, constraints, costs) for every tech definition and every
    location-level override (the override merged over the global tech)."""
    techs = _tech_index(model_data)
    seen = set()
    for t in model_data.get("technologies") or []:
        name = str(t.get("name") or t.get("id") or "?")
        seen.add(name)
        yield name, t, dict(t.get("constraints") or {}), dict((t.get("costs") or {}).get("monetary") or {})
    for loc in model_data.get("locations") or []:
        lname = str(loc.get("name") or loc.get("id") or "?")
        for ref, cfg in (loc.get("techs") or {}).items():
            if not isinstance(cfg, dict):
                continue
            base = techs.get(str(ref))
            if base is None:
                continue
            constr = {**(base.get("constraints") or {}), **(cfg.get("constraints") or {})}
            costs = {**((base.get("costs") or {}).get("monetary") or {}),
                     **((cfg.get("costs") or {}).get("monetary") or {})}
            if cfg.get("constraints") or cfg.get("costs"):
                yield f"{lname}::{ref}", base, constr, costs


def _num(v) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float("inf") else None


def scan_features(model_data: dict) -> Dict[str, List[str]]:
    """{feature: [where, ...]} for every Calliope feature the model uses."""
    found: Dict[str, List[str]] = {}

    def add(feature, where):
        lst = found.setdefault(feature, [])
        if where not in lst:
            lst.append(where)

    for label, tech, constr, costs in _iter_tech_defs(model_data):
        ess = tech.get("essentials") or {}
        parent = _parent(tech)
        if _num(constr.get("energy_cap_min_use")):
            add("must_run", label)
        if parent == "conversion_plus" or any(
                ess.get(k) for k in ("carrier_out_2", "carrier_out_3", "carrier_in_2", "carrier_in_3")):
            if ess.get("carrier_out_2") or ess.get("carrier_out_3") or ess.get("carrier_in_2") \
                    or ess.get("carrier_in_3") or constr.get("carrier_ratios"):
                add("conversion_plus", label)
        if any(constr.get(k) not in (None, 0, False) for k in ("units_max", "units_equals", "units_min")) \
                or costs.get("purchase") not in (None, 0, False):
            add("integer_units", label)
        if constr.get("energy_ramping") not in (None, False):
            add("ramping", label)
        if any(constr.get(k) is not None for k in
               ("resource_area_max", "resource_area_equals", "resource_area_min", "resource_area_per_energy_cap")):
            add("resource_area", label)
        if any(_is_file_ref(v) for v in costs.values()):
            add("time_varying_cost", label)
        if costs.get("export") not in (None, 0) or constr.get("export_carrier"):
            add("export_revenue", label)
        if parent == "demand" and constr.get("force_resource") is False:
            add("optional_sink", label)

    run = (model_data.get("metadata") or {}).get("runConfig") or {}
    for name, spec in (run.get("group_constraints") or {}).items():
        body = {k: v for k, v in (spec or {}).items() if k not in ("techs", "locs", "exists")}
        slack = body and all(
            k in ("cost_max", "cost_min") and all((_num(x) or 1e30) >= 1e12 or x in (None,)
                                                  for x in (v or {}).values())
            for k, v in body.items())
        if body and not slack:
            add("group_constraints", name)
    if run.get("reserve_margin"):
        add("reserve_margin", ",".join(map(str, (run["reserve_margin"] or {}).keys())) or "reserve_margin")

    mode = (model_data.get("modelConfig") or {}).get("mode") or (run.get("mode")) or "plan"
    if mode == "operate":
        add("operate_mode", "modelConfig.mode")
    if mode == "spores":
        add("spores_mode", "modelConfig.mode")
    return found


def _timeseries_names(model_data: dict) -> Dict[str, dict]:
    out = {}
    for ts in model_data.get("timeSeries") or []:
        for k in ("fileName", "file", "name"):
            v = ts.get(k)
            if v:
                v = str(v).lower()
                out[v] = ts
                if v.endswith(".csv"):
                    out[v[:-4]] = ts
    return out


def _missing_timeseries(model_data: dict):
    """[(where, ref, is_demand)] for file= references with no matching timeSeries entry."""
    have = _timeseries_names(model_data)
    missing, seen = [], set()
    for label, tech, constr, costs in _iter_tech_defs(model_data):
        for key, val in list(constr.items()) + list(costs.items()):
            if not _is_file_ref(val):
                continue
            fname = val[len("file="):].split(":")[0].strip().lower()
            if fname in have or fname.removesuffix(".csv") in have:
                continue
            if (label, fname) not in seen:
                seen.add((label, fname))
                missing.append((label, val, _parent(tech) == "demand"))
    return missing


def _demand_without_profile(model_data: dict) -> List[str]:
    """loc::tech for demand techs with no demandProfile, no file= resource and no finite scalar.
    Translators would substitute a placeholder or drop the demand for these."""
    techs = _tech_index(model_data)
    out = []
    for loc in model_data.get("locations") or []:
        if (loc.get("demandProfile") or {}).get("timeseries"):
            continue
        lname = str(loc.get("name") or loc.get("id") or "?")
        for ref, cfg in (loc.get("techs") or {}).items():
            base = techs.get(str(ref))
            if base is None or _parent(base) != "demand":
                continue
            res = {**(base.get("constraints") or {}), **((cfg or {}).get("constraints") or {})}.get("resource")
            if _is_file_ref(res) or _num(res) is not None:
                continue
            out.append(f"{lname}::{ref}")
    return out


def _links_to_unknown_locations(model_data: dict) -> List[str]:
    names = {str(v) for l in model_data.get("locations") or [] for v in (l.get("name"), l.get("id")) if v}
    return [f"{l.get('from')} -> {l.get('to')}" for l in model_data.get("links") or []
            if str(l.get("from")) not in names or str(l.get("to")) not in names]


# ─── issues ─────────────────────────────────────────────────────────────────────

def _issue(code: str, message: str, items: Optional[List[str]] = None, severity: str = "warning") -> dict:
    d = {"code": code, "severity": severity, "message": message}
    if items:
        d["items"] = items[:8]
        d["count"] = len(items)
    return d


class ModelValidationError(Exception):
    """Raised before a run when the model cannot be run on the chosen engine.
    `issues` holds the blocking issues; str() is a readable multi-line message."""

    def __init__(self, engine: str, issues: List[dict]):
        self.engine = engine
        self.issues = issues
        lines = [f"This model cannot be run on the {engine} engine:"]
        for i in issues:
            lines.append(f"  • {i['message']}")
        super().__init__("\n".join(lines))


def assess(model_data: dict, engine: str) -> dict:
    """Pre-run assessment of `model_data` for `engine`.

    Returns {engine, ok, errors[], warnings[], features{}, fidelity}. `errors` block the run;
    `warnings` describe what the translation will not carry over (so results can be read
    with the right caveats). fidelity: 'full' when nothing is lost, else 'reduced'."""
    eng = canonical_engine(engine)
    errors: List[dict] = []
    warnings: List[dict] = []

    if not (model_data.get("locations") or []):
        errors.append(_issue("no_locations", "The model has no locations — add at least one location.", severity="error"))
    if not (model_data.get("technologies") or []):
        errors.append(_issue("no_technologies", "The model has no technologies — define at least a supply and a demand technology.", severity="error"))
    elif not any(_parent(t) == "demand" for t in model_data.get("technologies") or []):
        warnings.append(_issue("no_demand", "No demand technology is defined, so there is nothing to supply — results will be trivial."))

    if model_data.get("scenario") or model_data.get("override"):
        if eng in ("pypsa", "osemosys", "adoptnet0"):
            errors.append(_issue(
                "scenario_not_resolved",
                "Scenario/override runs must be resolved to a concrete model before running on this engine "
                "(use the Run page, which applies them, or run the base model).", severity="error"))

    for where, ref, is_demand in _missing_timeseries(model_data):
        msg = (f"{where} refers to {ref} but no such timeseries is in the model — "
               + ("its demand would be replaced by a placeholder, so results would be meaningless. "
                  if is_demand else "a placeholder is used instead. ")
               + "Re-import the model with its CSV files.")
        (errors if is_demand else warnings).append(
            _issue("missing_timeseries", msg, severity="error" if is_demand else "warning"))

    no_profile = [] if (model_data.get("scenario") or model_data.get("override")) else _demand_without_profile(model_data)
    if no_profile:
        errors.append(_issue(
            "demand_no_profile",
            "These demand technologies have no demand profile or resource value; engines would "
            "substitute a placeholder or drop the demand, so results would not reflect the system.", no_profile, severity="error"))
    bad_links = _links_to_unknown_locations(model_data)
    if bad_links:
        errors.append(_issue("link_unknown_location", "These links connect to a location that does not exist.",
                             bad_links, severity="error"))

    features = scan_features(model_data)
    summary: Dict[str, dict] = {}
    lost = False
    for feat, where in features.items():
        level, note = support(feat, eng)
        summary[feat] = {"label": FEATURES[feat][0], "level": level, "count": len(where),
                         "examples": where[:5], "note": note}
        if feat in ("operate_mode", "spores_mode") and level == NONE:
            errors.append(_issue(feat, f"{FEATURES[feat][0]} is not available on {eng}: {note}.", severity="error"))
            continue
        if level != FULL:
            lost = True
            ex = ", ".join(where[:4]) + (f" (+{len(where) - 4} more)" if len(where) > 4 else "")
            warnings.append(_issue(
                f"unsupported_{feat}",
                f"{FEATURES[feat][0]}: {ex} — {note or 'not translated'}"
                f"{' (changes the optimum)' if FEATURES[feat][1] == 'high' else ''}.",
                where))

    return {"engine": eng, "ok": not errors, "errors": errors, "warnings": warnings,
            "features": summary, "fidelity": "reduced" if lost else "full"}


def raise_if_blocked(model_data: dict, engine: str) -> dict:
    """assess() and raise ModelValidationError on blocking issues; return the assessment."""
    a = assess(model_data, engine)
    if a["errors"]:
        raise ModelValidationError(a["engine"], a["errors"])
    return a


def assessment_lines(a: dict) -> List[str]:
    """Assessment warnings as plain report lines (for logs / translation_report)."""
    return [f"[limitation] {w['message']}" for w in a.get("warnings", [])]


# ─── failure diagnosis ──────────────────────────────────────────────────────────

_HINTS = {
    "infeasible": [
        "Check that supply capacity can meet peak demand (energy_cap_max / energy_cap_equals, resource availability).",
        "Fixed capacities (energy_cap_equals) and minimum bounds (energy_cap_min, energy_cap_min_use) can conflict with maximum bounds or demand.",
        "Enable 'Ensure feasibility' to add an unmet-demand slack, then look at where it is used.",
    ],
    "unbounded": [
        "A technology with negative cost/revenue and no capacity bound can be exploited without limit — add an energy_cap_max.",
        "Export/market sinks with negative costs need a finite resource or capacity.",
    ],
    "time_limit": [
        "The solver hit its time limit — shorten the time window, aggregate time steps, or raise the limit in Run → solver options.",
    ],
    "numerical": [
        "Numerical trouble: mix of very large and very small numbers (e.g. 'inf' stand-ins, kW-vs-MW scales).",
        "Try a shorter window, remove artificial huge bounds, or use a different solver.",
    ],
}

_TERM_ALIASES = {
    "infeasible": "infeasible", "infeasibleorunbounded": "infeasible", "noprimalfeasible": "infeasible",
    "unbounded": "unbounded", "dualinfeasible": "unbounded",
    "maxtimelimit": "time_limit", "timelimit": "time_limit", "maxiterations": "time_limit",
    "other": "numerical", "numerical": "numerical", "unknown": "numerical", "undefined": "numerical",
}


def classify_termination(termination: str) -> str:
    # accept pyomo-style 'TerminationCondition.infeasible' as well as plain words
    key = "".join(ch for ch in str(termination or "").split(".")[-1].lower() if ch.isalpha())
    return _TERM_ALIASES.get(key, "numerical")


def _engine_hints(engine: str, kind: str, model_data: Optional[dict]) -> List[str]:
    hints = list(_HINTS.get(kind, []))
    eng = canonical_engine(engine)
    if eng == "osemosys" and kind in ("infeasible", "numerical"):
        hints.append("GLPK can misreport status at these magnitudes; the OSeMOSYS runner re-solves without presolve when a minimum capacity is violated.")
    if model_data is not None:
        if (model_data.get("modelConfig") or {}).get("ensureFeasibility") is False and kind == "infeasible":
            hints = ["'Ensure feasibility' is OFF — turn it on to see which demand cannot be met."] +                 [h for h in hints if not h.startswith("Enable 'Ensure feasibility'")]
        a = assess(model_data, eng)
        hi = [f for f, v in a["features"].items() if v["level"] != FULL and FEATURES[f][1] == "high"]
        if hi:
            hints.append("This translation does not carry over: " + "; ".join(
                FEATURES[f][0].split(" (")[0] for f in hi) + " — results may differ from Calliope.")
    return hints


def failure_result(engine: str, model_name: str, solver: str, termination: str,
                   model_data: Optional[dict] = None, report: Optional[List[str]] = None,
                   detail: Optional[str] = None, kind: Optional[str] = None) -> dict:
    """Uniform failed-run result: success False + a readable `error` (the UI prints it as
    'Model run failed: …'), `error_code`, `hints` and the translation report."""
    kind = kind or classify_termination(termination)
    headline = {
        "infeasible": "The model is infeasible — no solution satisfies all constraints.",
        "unbounded": "The model is unbounded — the objective can improve without limit.",
        "time_limit": "The solver stopped at its time limit before finding an optimal solution.",
        "numerical": f"The solver did not reach an optimal solution (status: {termination}).",
        "error": "The run failed.",
    }.get(kind, f"The solver did not reach an optimal solution (status: {termination}).")
    hints = _engine_hints(engine, kind, model_data)
    text = headline + (f"\n{detail}" if detail else "") + "".join(f"\n  • {h}" for h in hints)
    out = {
        "model_name": model_name, "solver": solver, "success": False,
        "termination_condition": termination, "error_code": kind,
        "error": text, "hints": hints,
        "translation_report": list(report or []),
    }
    if model_data is not None:
        a = assess(model_data, engine)
        out["limitations"] = a["warnings"]
    return out


def explain_exception(engine: str, exc: BaseException, model_data: Optional[dict] = None) -> Optional[dict]:
    """Map known exceptions to a failure_result-style dict {kind, detail}; None if unknown
    (caller re-raises)."""
    msg = str(exc)
    name = type(exc).__name__
    low = msg.lower()
    if name == "NoFeasibleSolutionError" or "feasible solution was not found" in low:
        return {"kind": "infeasible", "termination": "infeasible", "detail": ""}
    if "infeasible" in low and "unbounded" not in low:
        return {"kind": "infeasible", "termination": "infeasible", "detail": ""}
    if "unbounded" in low:
        return {"kind": "unbounded", "termination": "unbounded", "detail": ""}
    if isinstance(exc, MemoryError) or "out of memory" in low or "cannot allocate" in low:
        return {"kind": "error", "termination": "memory",
                "detail": "Ran out of memory building or solving the model — shorten the time window or reduce the number of locations/technologies."}
    if "glpsol exited with code" in low:
        return {"kind": "error", "termination": "solver_crash", "detail": msg}
    if isinstance(exc, FileNotFoundError) and ("glpsol" in low or "cbc" in low or "highs" in low):
        return {"kind": "error", "termination": "solver_missing",
                "detail": f"Solver executable not found ({msg}). Reinstall it from Settings → Engines."}
    return None
