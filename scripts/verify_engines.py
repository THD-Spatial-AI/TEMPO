"""
Multi-engine verification: run the reference model on any combination of
Calliope 0.6.8, Calliope 0.7, PyPSA, and OSeMOSYS engines, then compare results.

Supersedes verify_dual_engine.py — all original flags still work.

Usage (from repo root):
    python scripts/verify_engines.py \\
        [--python06         <calliope-venv/Scripts/python.exe>]   \\
        [--python07         <calliope07-venv/Scripts/python.exe>] \\
        [--python-pypsa     <pypsa-venv/Scripts/python.exe>]      \\
        [--python-osemosys  <osemosys-venv/Scripts/python.exe>]   \\
        [--python-adoptnet0 <adoptnet0-venv/Scripts/python.exe>]  \\
        [--payload scripts/reference_model.json]                  \\
        [--solver-dir solvers/windows]

At least one --python* flag is required. Any combination of engines can be
provided; all applicable pairwise comparisons run automatically.

Tolerances:
  --obj-tol          (default 0.5%)  Calliope 0.6 vs 0.7 objective
  --cap-tol          (default 1.0%)  Calliope 0.6 vs 0.7 per-tech capacity
  --pypsa-obj-tol    (default 2.0%)  PyPSA vs Calliope objective
  --pypsa-cap-tol    (default 5.0%)  PyPSA vs Calliope per-tech capacity
  --osemosys-obj-tol (default 30.0%) OSeMOSYS vs Calliope objective
  --osemosys-cap-tol (default 15.0%) OSeMOSYS vs Calliope per-tech capacity

AdOpT-NET0 note: contract checks only (no pairwise comparison) — its multi-period
investment formulation produces objectives on a different scale than Calliope/PyPSA.

Checks (per engine):
  * terminates 'optimal'
  * all frozen contract keys present
  * capacities keys use 'loc::tech' format
  * transmission_flow entries have {from, to, timeseries}

Cross-engine checks:
  * objective within tolerance
  * per-tech installed capacity (aggregated, non-transmission) within tolerance
  * total demand within capacity tolerance
  * dispatch / demand series lengths match snapshot count
  * all CONTRACT_KEYS present on every engine (key-set consistency)

Myopic residual check (opt-in, --check-myopic):
  Runs a 2-step Scenario Studio myopic pathway per engine — solve, then fix the
  solved capacity forward as free `<tech>_existing` residual (vintageResidual) —
  and asserts: step-2 stays optimal, residual objective does not exceed greenfield
  (prior capacity is sunk/free, not re-charged CAPEX), and residual capacity is
  monotonic (carried capacity survives). Note: the reference model runs in direct
  loc.techs mode; the assignment-mode override-preservation path needs a real
  assignment-mode model to exercise.

OSeMOSYS note: dispatch is broadcast from timeslices (not hourly resolution), so
timestep counts match Calliope only when both use the same date range. Tolerances
are wider because the GLPK/OSeMOSYS formulation differs from HiGHS/Calliope.
"""

import argparse
import copy
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).parent.parent

CONTRACT_KEYS = [
    'model_name', 'solver', 'success', 'termination_condition', 'objective',
    'capacities', 'generation', 'dispatch', 'timestamps', 'demand_timeseries',
    'costs_by_tech', 'costs_by_location', 'tech_metadata', 'tech_parents',
]


def run_engine(python_exe, runner_module, payload_path, solver_dir):
    fd, out_name = tempfile.mkstemp(suffix='.json')
    os.close(fd)  # Windows: close before the subprocess writes it
    out_file = Path(out_name)
    env = dict(os.environ)
    if solver_dir:
        env['CALLIOPE_SOLVER_DIR'] = str(Path(solver_dir).resolve())
        env['PATH'] = str(Path(solver_dir).resolve()) + os.pathsep + env.get('PATH', '')
    print(f"\n=== {runner_module} ({python_exe}) ===")
    proc = subprocess.run(
        [python_exe, str(REPO / 'scripts' / 'run_engine_driver.py'),
         runner_module, str(payload_path), str(out_file)],
        env=env, cwd=str(REPO), capture_output=True, text=True, timeout=1800)
    tail = '\n'.join((proc.stdout + proc.stderr).splitlines()[-25:])
    print(tail)
    if proc.returncode != 0:
        raise SystemExit(f"{runner_module} FAILED (exit {proc.returncode})")
    result = json.loads(out_file.read_text(encoding='utf-8'))
    out_file.unlink(missing_ok=True)
    return result


def pct_diff(a, b):
    if a == b:
        return 0.0
    return abs(a - b) / max(abs(a), abs(b), 1e-12) * 100


def check_contract(tag, r, failures):
    """Validate contract keys, termination, and key formats."""
    missing = [k for k in CONTRACT_KEYS if k not in r]
    if missing:
        failures.append(f"[{tag}] missing contract keys: {missing}")
    if r.get('termination_condition') != 'optimal':
        failures.append(f"[{tag}] termination: {r.get('termination_condition')!r}")
    bad_caps = [k for k in (r.get('capacities') or {}) if '::' not in k]
    if bad_caps:
        failures.append(f"[{tag}] capacities keys without '::': {bad_caps[:5]}")
    for k, v in (r.get('transmission_flow') or {}).items():
        if '::' not in k or set(v.keys()) != {'from', 'to', 'timeseries'}:
            failures.append(f"[{tag}] malformed transmission_flow entry: {k}")


def _cap_by_tech(result, non_tx_techs):
    """Aggregate installed capacity per non-transmission tech across all locations."""
    agg = {}
    for key, val in (result.get('capacities') or {}).items():
        if '::' not in key:
            continue
        tech_full = key.split('::', 1)[1].split(':')[0]
        if tech_full in non_tx_techs:
            agg[tech_full] = agg.get(tech_full, 0.0) + (val or 0.0)
        else:
            base = next((t for t in non_tx_techs if tech_full.startswith(t + '_')), None)
            if base:
                agg[base] = agg.get(base, 0.0) + (val or 0.0)
    return agg


def compare_pair(tag_a, r_a, tag_b, r_b, obj_tol, cap_tol, non_tx_techs, failures):
    """Run all pairwise checks between two engine results."""
    print(f"\n--- {tag_a} vs {tag_b}  (obj_tol={obj_tol}%  cap_tol={cap_tol}%) ---")

    # Objective
    obj_a, obj_b = r_a.get('objective'), r_b.get('objective')
    if obj_a is not None and obj_b is not None:
        d = pct_diff(obj_a, obj_b)
        print(f"objective:  {tag_a}={obj_a:.4f}  {tag_b}={obj_b:.4f}  diff={d:.3f}%")
        if d > obj_tol:
            failures.append(
                f"[{tag_a} vs {tag_b}] objective differs by {d:.3f}% (> {obj_tol}%)")

    # Per-tech capacity
    ca, cb = _cap_by_tech(r_a, non_tx_techs), _cap_by_tech(r_b, non_tx_techs)
    for tech in sorted(set(ca) | set(cb)):
        va, vb = ca.get(tech), cb.get(tech)
        if va is None or vb is None:
            failures.append(
                f"[{tag_a} vs {tag_b}] capacity '{tech}' on one engine only "
                f"({tag_a}={va}, {tag_b}={vb})")
            continue
        d = pct_diff(va, vb)
        print(f"capacity {tech}:  {tag_a}={va:.3f}  {tag_b}={vb:.3f}  diff={d:.3f}%")
        if d > cap_tol:
            failures.append(
                f"[{tag_a} vs {tag_b}] capacity '{tech}' differs by {d:.3f}% (> {cap_tol}%)")

    # Series lengths
    n_a = len(r_a.get('timestamps') or [])
    n_b = len(r_b.get('timestamps') or [])
    print(f"timesteps:  {tag_a}={n_a}  {tag_b}={n_b}")
    if n_a != n_b:
        failures.append(f"[{tag_a} vs {tag_b}] timestep count differs: {n_a} vs {n_b}")
    for tag, r, n in ((tag_a, r_a, n_a), (tag_b, r_b, n_b)):
        for tech, series in (r.get('dispatch') or {}).items():
            if len(series) != n:
                failures.append(
                    f"[{tag}] dispatch '{tech}' length {len(series)} != {n}")
        dts = r.get('demand_timeseries') or []
        if dts and len(dts) != n:
            failures.append(f"[{tag}] demand_timeseries length {len(dts)} != {n}")

    # Total demand
    d_a = sum(r_a.get('demand_timeseries') or [])
    d_b = sum(r_b.get('demand_timeseries') or [])
    if d_a and d_b:
        d = pct_diff(d_a, d_b)
        print(f"total demand:  {tag_a}={d_a:.1f}  {tag_b}={d_b:.1f}  diff={d:.3f}%")
        if d > cap_tol:
            failures.append(
                f"[{tag_a} vs {tag_b}] total demand differs by {d:.3f}%")


# ─── Myopic residual check (mirrors src/services/scenarioStudio transform + pathway) ──
#
# The Scenario Studio myopic pathway carries a solved year's capacity forward as
# fixed, capex-free "residual" capacity (transform op `vintageResidual`). The JS
# side is unit-tested; this reproduces the transform in Python so the engine-level
# behaviour can be verified end-to-end: does each runner honour a `<tech>_existing`
# shadow (fixed cap, zero capex, resource inherited) and produce a defensible
# residual objective?

CARRY_FORWARD_PARENTS = {'supply', 'supply_plus', 'conversion', 'conversion_plus', 'storage'}
INVESTMENT_COST_KEYS = ['energy_cap', 'storage_cap', 'resource_cap', 'resource_area', 'purchase']
VINTAGE_SUFFIX = '_existing'


def _norm_id(s):
    return re.sub(r'[^a-zA-Z0-9]', '_', str(s or '')).lower()


def _parent_of(t):
    return (t.get('essentials') or {}).get('parent', t.get('parent', ''))


def carry_forward_techs(model):
    return [t['name'] for t in model.get('technologies', []) if _parent_of(t) in CARRY_FORWARD_PARENTS]


def accumulate_existing_caps(capacities, suffix=VINTAGE_SUFFIX):
    """Collapse a result's capacities onto base techs, folding `_existing` back in."""
    out = {}
    for key, cap in (capacities or {}).items():
        if not (cap and cap > 0) or '::' not in key:
            continue
        loc, tech = key.rsplit('::', 1)
        tech = tech.split(':')[0]
        if tech.endswith(suffix):
            tech = tech[:-len(suffix)]
        k = f'{loc}::{tech}'
        out[k] = out.get(k, 0.0) + cap
    return out


def _zero_capex(costs):
    if not isinstance(costs, dict):
        return
    for cost_vals in costs.values():
        if isinstance(cost_vals, dict):
            for k in INVESTMENT_COST_KEYS:
                if k in cost_vals:
                    cost_vals[k] = 0


def _loc_matches(loc, token):
    return any(v is not None and (str(v) == token or _norm_id(v) == token)
               for v in (loc.get('id'), loc.get('name')))


def apply_vintage_residual(model, existing_caps, tech_match, suffix=VINTAGE_SUFFIX):
    """Return a deep copy of *model* with residual capacity fixed per the JS op."""
    m = copy.deepcopy(model)
    techs = m.setdefault('technologies', [])
    locs = m.setdefault('locations', [])
    lta = m.get('locationTechAssignments')
    for name in set(tech_match):
        loc_caps = []
        for key, cap in existing_caps.items():
            if not (cap and cap > 0) or '::' not in key:
                continue
            loc_tok, tech_tok = key.rsplit('::', 1)
            if tech_tok.split(':')[0] != name:
                continue
            loc_caps.append((loc_tok, cap))
        if not loc_caps:
            continue
        shadow = f'{name}{suffix}'
        if not any(t.get('name') == shadow for t in techs):
            base = next((t for t in techs if t.get('name') == name), None)
            clone = copy.deepcopy(base) if base else {'name': name}
            clone['name'] = shadow
            cons = clone.get('constraints')
            if isinstance(cons, dict):
                for k in ('energy_cap_max', 'energy_cap_min', 'energy_cap_equals'):
                    cons.pop(k, None)
            _zero_capex(clone.get('costs'))
            clone['_vintaged'] = True
            techs.append(clone)
        for loc_tok, cap in loc_caps:
            loc = next((l for l in locs if _loc_matches(l, loc_tok)), None)
            if not loc:
                continue
            loc.setdefault('techs', {})
            inherited = copy.deepcopy(loc['techs'].get(name)) if loc['techs'].get(name) else {}
            sh = loc['techs'].get(shadow) or inherited
            sh.setdefault('constraints', {})
            sh['constraints'].pop('energy_cap_max', None)
            sh['constraints'].pop('energy_cap_min', None)
            sh['constraints']['energy_cap_equals'] = cap
            _zero_capex(sh.get('costs'))
            loc['techs'][shadow] = sh
            if isinstance(lta, dict):
                for k in (loc.get('id'), loc.get('name')):
                    if k is not None and isinstance(lta.get(k), list) and name in lta[k] and shadow not in lta[k]:
                        lta[k] = lta[k] + [shadow]
    return m


def _write_payload(d):
    fd, name = tempfile.mkstemp(suffix='.json')
    os.close(fd)
    Path(name).write_text(json.dumps(d), encoding='utf-8')
    return Path(name)


def check_myopic(tag, py_exe, module, base_payload, solver_dir, obj_tol, cap_tol, failures):
    """Run a 2-step myopic pathway on one engine and assert residual semantics."""
    print(f"\n=== MYOPIC RESIDUAL CHECK: {tag} ===")
    p1 = _write_payload(base_payload)
    try:
        r1 = run_engine(py_exe, module, p1, solver_dir)
    finally:
        p1.unlink(missing_ok=True)
    if r1.get('termination_condition') != 'optimal':
        failures.append(f"[{tag} myopic] step-1 not optimal ({r1.get('termination_condition')!r})")
        return

    tech_match = set(carry_forward_techs(base_payload))
    existing = {k: v for k, v in accumulate_existing_caps(r1.get('capacities')).items()
                if k.rsplit('::', 1)[1].split(':')[0] in tech_match}
    if not existing:
        print(f"  [{tag}] step-1 built no carry-forward capacity — nothing to vintage; skipping.")
        return

    step2 = apply_vintage_residual(base_payload, existing, tech_match)
    p2 = _write_payload(step2)
    try:
        r2 = run_engine(py_exe, module, p2, solver_dir)
    finally:
        p2.unlink(missing_ok=True)

    check_contract(f'{tag} myopic-step2', r2, failures)
    if r2.get('termination_condition') != 'optimal':
        failures.append(f"[{tag} myopic] step-2 not optimal ({r2.get('termination_condition')!r})")
        return

    # 1) Residual is not more expensive than greenfield — prior capacity is free (sunk).
    o1, o2 = r1.get('objective'), r2.get('objective')
    if o1 is not None and o2 is not None:
        print(f"  objective:  greenfield={o1:.4f}  residual={o2:.4f}")
        if o2 > o1 * (1 + obj_tol / 100):
            failures.append(
                f"[{tag} myopic] residual objective {o2:.4f} exceeds greenfield {o1:.4f} "
                f"(> {obj_tol}%) — existing capacity should be free, not re-charged CAPEX")

    # 2) Monotonic residual — step-2 total (base + _existing) >= the carried capacity.
    agg2 = accumulate_existing_caps(r2.get('capacities'))
    for key, fixed in sorted(existing.items()):
        got = agg2.get(key, 0.0)
        d = pct_diff(got, fixed)
        print(f"  residual {key}:  carried={fixed:.3f}  step2_total={got:.3f}  diff={d:.3f}%")
        if got < fixed * (1 - cap_tol / 100):
            failures.append(
                f"[{tag} myopic] {key} step-2 total {got:.3f} < carried residual {fixed:.3f} "
                f"(not monotonic — carried capacity was dropped)")

    # 3) Informational: the _existing shadow should carry only opex (capex sunk).
    costs_by_tech = r2.get('costs_by_tech') or {}
    for name in sorted(tech_match):
        shadow = f'{name}{VINTAGE_SUFFIX}'
        if shadow in costs_by_tech:
            print(f"  cost[{shadow}]={costs_by_tech[shadow]:.4f}  (opex only — CAPEX sunk)")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--python06', default=None,
                    help='Calliope 0.6.8 venv Python executable')
    ap.add_argument('--python07', default=None,
                    help='Calliope 0.7 venv Python executable')
    ap.add_argument('--python-pypsa', default=None, dest='python_pypsa',
                    help='PyPSA venv Python executable')
    ap.add_argument('--python-osemosys', default=None, dest='python_osemosys',
                    help='OSeMOSYS venv Python executable')
    ap.add_argument('--python-adoptnet0', default=None, dest='python_adoptnet0',
                    help='AdOpT-NET0 venv Python executable')
    ap.add_argument('--payload',
                    default=str(REPO / 'scripts' / 'reference_model.json'))
    ap.add_argument('--solver-dir',
                    default=str(REPO / 'solvers' / 'windows'))
    ap.add_argument('--obj-tol', type=float, default=0.5,
                    help='Calliope 0.6 vs 0.7 objective tolerance %% (default 0.5)')
    ap.add_argument('--cap-tol', type=float, default=1.0,
                    help='Calliope 0.6 vs 0.7 capacity tolerance %% (default 1.0)')
    ap.add_argument('--pypsa-obj-tol', type=float, default=2.0,
                    dest='pypsa_obj_tol',
                    help='PyPSA vs Calliope objective tolerance %% (default 2.0)')
    ap.add_argument('--pypsa-cap-tol', type=float, default=5.0,
                    dest='pypsa_cap_tol',
                    help='PyPSA vs Calliope per-tech capacity tolerance %% (default 5.0)')
    ap.add_argument('--osemosys-obj-tol', type=float, default=30.0,
                    dest='osemosys_obj_tol',
                    help='OSeMOSYS vs Calliope objective tolerance %% (default 30.0)')
    ap.add_argument('--osemosys-cap-tol', type=float, default=15.0,
                    dest='osemosys_cap_tol',
                    help='OSeMOSYS vs Calliope per-tech capacity tolerance %% (default 15.0)')
    ap.add_argument('--check-myopic', action='store_true', dest='check_myopic',
                    help='Also run a 2-step myopic residual pathway per engine and assert '
                         'residual (sunk) capacity semantics (Scenario Studio). Doubles runtime.')
    ap.add_argument('--myopic-obj-tol', type=float, default=2.0, dest='myopic_obj_tol',
                    help='Myopic: max %% the residual objective may exceed greenfield (default 2.0)')
    ap.add_argument('--myopic-cap-tol', type=float, default=2.0, dest='myopic_cap_tol',
                    help='Myopic: tolerance %% on the monotonic residual-capacity check (default 2.0)')
    args = ap.parse_args()

    engines_to_run = {}
    if args.python06:
        engines_to_run['calliope-0.6.8'] = (args.python06, 'calliope_runner')
    if args.python07:
        engines_to_run['calliope-0.7'] = (args.python07, 'calliope07_runner')
    if args.python_pypsa:
        engines_to_run['pypsa'] = (args.python_pypsa, 'pypsa_runner')
    if args.python_osemosys:
        engines_to_run['osemosys'] = (args.python_osemosys, 'osemosys_runner')
    if args.python_adoptnet0:
        engines_to_run['adoptnet0'] = (args.python_adoptnet0, 'adoptnet0_runner')

    if not engines_to_run:
        ap.error('Provide at least one of --python06, --python07, --python-pypsa, '
                 '--python-osemosys, --python-adoptnet0')

    payload = json.loads(Path(args.payload).read_text(encoding='utf-8'))
    tech_parents = {
        t['name']: (t.get('essentials') or {}).get('parent', t.get('parent', ''))
        for t in payload.get('technologies', [])
    }
    non_tx_techs = {name for name, parent in tech_parents.items()
                    if parent != 'transmission'}

    # ── Run all engines ───────────────────────────────────────────────────────
    results = {}
    for tag, (py_exe, module) in engines_to_run.items():
        results[tag] = run_engine(py_exe, module, args.payload, args.solver_dir)

    failures = []

    # ── Per-engine contract checks ────────────────────────────────────────────
    print("\n=== CONTRACT CHECKS ===")
    for tag, r in results.items():
        n_before = len(failures)
        check_contract(tag, r, failures)
        status = 'OK' if len(failures) == n_before else f'{len(failures) - n_before} issue(s)'
        print(f"[{tag}] {status}")

    # ── Pairwise comparisons ──────────────────────────────────────────────────
    print("\n=== COMPARISONS ===")

    # Calliope 0.6 vs 0.7 (tight tolerances — same formulation)
    if 'calliope-0.6.8' in results and 'calliope-0.7' in results:
        compare_pair(
            'calliope-0.6.8', results['calliope-0.6.8'],
            'calliope-0.7', results['calliope-0.7'],
            args.obj_tol, args.cap_tol, non_tx_techs, failures)

    # PyPSA vs Calliope 0.6 (preferred baseline — loose tolerances for different solver/formulation)
    if 'pypsa' in results and 'calliope-0.6.8' in results:
        compare_pair(
            'calliope-0.6.8', results['calliope-0.6.8'],
            'pypsa', results['pypsa'],
            args.pypsa_obj_tol, args.pypsa_cap_tol, non_tx_techs, failures)

    # PyPSA vs Calliope 0.7 (only when 0.6 is absent)
    elif 'pypsa' in results and 'calliope-0.7' in results:
        compare_pair(
            'calliope-0.7', results['calliope-0.7'],
            'pypsa', results['pypsa'],
            args.pypsa_obj_tol, args.pypsa_cap_tol, non_tx_techs, failures)

    # OSeMOSYS vs Calliope 0.6 (wide tolerances — different solver/formulation)
    if 'osemosys' in results and 'calliope-0.6.8' in results:
        compare_pair(
            'calliope-0.6.8', results['calliope-0.6.8'],
            'osemosys', results['osemosys'],
            args.osemosys_obj_tol, args.osemosys_cap_tol, non_tx_techs, failures)

    # OSeMOSYS vs Calliope 0.7 (only when 0.6 is absent)
    elif 'osemosys' in results and 'calliope-0.7' in results:
        compare_pair(
            'calliope-0.7', results['calliope-0.7'],
            'osemosys', results['osemosys'],
            args.osemosys_obj_tol, args.osemosys_cap_tol, non_tx_techs, failures)

    # AdOpT-NET0: contract-only, no pairwise comparison (different formulation/scale)
    if 'adoptnet0' in results:
        print("  [adoptnet0] pairwise comparison skipped — multi-period formulation "
              "produces objectives on a different scale than Calliope/PyPSA")

    # Single-engine: no pairwise check possible, only contract was checked above
    comparable = set(results) - {'adoptnet0'}
    if len(comparable) <= 1 and 'adoptnet0' not in results:
        print(f"  (only one engine provided — pairwise checks skipped)")

    # ── Myopic residual pathway checks (opt-in) ───────────────────────────────
    if args.check_myopic:
        print("\n=== MYOPIC RESIDUAL PATHWAY CHECKS ===")
        for tag, (py_exe, module) in engines_to_run.items():
            check_myopic(tag, py_exe, module, payload, args.solver_dir,
                         args.myopic_obj_tol, args.myopic_cap_tol, failures)

    # ── Cross-engine contract key-set consistency ─────────────────────────────
    if len(results) > 1:
        print("\n--- Contract key-set consistency ---")
        key_sets = {tag: set(r.keys()) for tag, r in results.items()}
        all_keys = set().union(*key_sets.values())
        inconsistent = False
        for key in sorted(all_keys):
            absent = {tag for tag, ks in key_sets.items() if key not in ks}
            if absent:
                inconsistent = True
                print(f"  '{key}': absent in {sorted(absent)}")
                if key in CONTRACT_KEYS:
                    failures.append(
                        f"contract key '{key}' missing from {sorted(absent)}")
        if not inconsistent:
            print("  All keys consistent across engines.")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        sys.exit(1)
    engines_run = ', '.join(sorted(results))
    print(f"CROSS-ENGINE VERIFICATION PASSED  [{engines_run}]")


if __name__ == '__main__':
    main()
