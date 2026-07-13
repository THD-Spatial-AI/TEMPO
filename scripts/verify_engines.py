"""
Multi-engine verification: run the reference model on any combination of
Calliope 0.6.8, Calliope 0.7, PyPSA, and OSeMOSYS engines, then compare results.

Supersedes verify_dual_engine.py — all original flags still work.

Usage (from repo root):
    python scripts/verify_engines.py \\
        [--python06       <calliope-venv/Scripts/python.exe>]   \\
        [--python07       <calliope07-venv/Scripts/python.exe>] \\
        [--python-pypsa   <pypsa-venv/Scripts/python.exe>]      \\
        [--python-osemosys <osemosys-venv/Scripts/python.exe>]  \\
        [--payload scripts/reference_model.json]                \\
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

OSeMOSYS note: dispatch is broadcast from timeslices (not hourly resolution), so
timestep counts match Calliope only when both use the same date range. Tolerances
are wider because the GLPK/OSeMOSYS formulation differs from HiGHS/Calliope.
"""

import argparse
import json
import os
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

    if not engines_to_run:
        ap.error('Provide at least one of --python06, --python07, --python-pypsa, --python-osemosys')

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

    # Single-engine: no pairwise check possible, only contract was checked above
    if len(results) == 1:
        print(f"  (only one engine provided — pairwise checks skipped)")

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
