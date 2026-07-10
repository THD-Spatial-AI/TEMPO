"""
Cross-engine verification: run the reference model on Calliope 0.6.8 and 0.7
and compare results.

The two engines live in incompatible venvs, so each run happens in a
subprocess using that venv's interpreter (via run_engine_driver.py).

Usage (from the repo root):
    python scripts/verify_dual_engine.py \
        --python06 <path-to-0.6.8-venv-python> \
        --python07 <path-to-0.7-venv-python> \
        [--payload scripts/reference_model.json] \
        [--solver-dir solvers/windows]

Checks:
  * both runs terminate 'optimal'
  * objective within 0.5%
  * per-tech installed capacity within 1% (non-transmission techs;
    transmission tech naming intentionally differs between engines)
  * identical result-contract key formats (loc::tech capacities,
    a::b transmission pairs with from/to/timeseries)
  * dispatch / demand series lengths match
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
    os.close(fd)  # Windows: keep no handle open or unlink below fails
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
    denom = max(abs(a), abs(b), 1e-12)
    return abs(a - b) / denom * 100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--python06', required=True)
    ap.add_argument('--python07', required=True)
    ap.add_argument('--payload', default=str(REPO / 'scripts' / 'reference_model.json'))
    ap.add_argument('--solver-dir', default=str(REPO / 'solvers' / 'windows'))
    ap.add_argument('--obj-tol', type=float, default=0.5, help='objective tolerance %%')
    ap.add_argument('--cap-tol', type=float, default=1.0, help='capacity tolerance %%')
    args = ap.parse_args()

    payload = json.loads(Path(args.payload).read_text(encoding='utf-8'))
    tech_parents = {
        t['name']: (t.get('essentials') or {}).get('parent', t.get('parent', ''))
        for t in payload.get('technologies', [])
    }
    non_tx_techs = {name for name, parent in tech_parents.items()
                    if parent not in ('transmission',)}

    r06 = run_engine(args.python06, 'calliope_runner', args.payload, args.solver_dir)
    r07 = run_engine(args.python07, 'calliope07_runner', args.payload, args.solver_dir)

    failures = []
    print("\n=== COMPARISON ===")

    for tag, r in (('0.6.8', r06), ('0.7', r07)):
        missing = [k for k in CONTRACT_KEYS if k not in r]
        if missing:
            failures.append(f"[{tag}] missing contract keys: {missing}")
        if r.get('termination_condition') != 'optimal':
            failures.append(f"[{tag}] termination: {r.get('termination_condition')}")

    obj06, obj07 = r06.get('objective'), r07.get('objective')
    if obj06 and obj07:
        d = pct_diff(obj06, obj07)
        print(f"objective: 0.6.8={obj06:.4f}  0.7={obj07:.4f}  diff={d:.3f}%")
        if d > args.obj_tol:
            failures.append(f"objective differs by {d:.3f}% (> {args.obj_tol}%)")

    # Aggregate capacity per non-transmission tech (transmission tech naming
    # differs by design: 0.6 'tech:remote' vs 0.7 'tech_from_to')
    def cap_by_tech(result):
        agg = {}
        for key, val in (result.get('capacities') or {}).items():
            if '::' not in key:
                continue
            tech = key.split('::', 1)[1].split(':')[0]
            base = next((t for t in non_tx_techs
                         if tech == t or tech.startswith(t + '_')), None)
            if tech in non_tx_techs:
                agg[tech] = agg.get(tech, 0.0) + (val or 0.0)
            elif base:
                agg[base] = agg.get(base, 0.0) + (val or 0.0)
        return agg

    c06, c07 = cap_by_tech(r06), cap_by_tech(r07)
    for tech in sorted(set(c06) | set(c07)):
        a, b = c06.get(tech), c07.get(tech)
        if a is None or b is None:
            failures.append(f"capacity for '{tech}' present on one engine only "
                            f"(0.6.8={a}, 0.7={b})")
            continue
        d = pct_diff(a, b)
        print(f"capacity {tech}: 0.6.8={a:.3f}  0.7={b:.3f}  diff={d:.3f}%")
        if d > args.cap_tol:
            failures.append(f"capacity '{tech}' differs by {d:.3f}% (> {args.cap_tol}%)")

    # Key formats
    for tag, r in (('0.6.8', r06), ('0.7', r07)):
        bad = [k for k in (r.get('capacities') or {}) if '::' not in k]
        if bad:
            failures.append(f"[{tag}] capacities keys without '::': {bad[:5]}")
        for k, v in (r.get('transmission_flow') or {}).items():
            if '::' not in k or set(v.keys()) != {'from', 'to', 'timeseries'}:
                failures.append(f"[{tag}] malformed transmission_flow entry: {k}")

    # Series lengths
    n06, n07 = len(r06.get('timestamps') or []), len(r07.get('timestamps') or [])
    print(f"timesteps: 0.6.8={n06}  0.7={n07}")
    if n06 != n07:
        failures.append(f"timestep count differs: {n06} vs {n07}")
    for tag, r, n in (('0.6.8', r06, n06), ('0.7', r07, n07)):
        for tech, series in (r.get('dispatch') or {}).items():
            if len(series) != n:
                failures.append(f"[{tag}] dispatch '{tech}' length {len(series)} != {n}")
        dts = r.get('demand_timeseries') or []
        if dts and len(dts) != n:
            failures.append(f"[{tag}] demand_timeseries length {len(dts)} != {n}")

    d_sum06 = sum(r06.get('demand_timeseries') or [])
    d_sum07 = sum(r07.get('demand_timeseries') or [])
    if d_sum06 and d_sum07:
        d = pct_diff(d_sum06, d_sum07)
        print(f"total demand: 0.6.8={d_sum06:.1f}  0.7={d_sum07:.1f}  diff={d:.3f}%")
        if d > args.cap_tol:
            failures.append(f"total demand differs by {d:.3f}%")

    print()
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        sys.exit(1)
    print("CROSS-ENGINE VERIFICATION PASSED")


if __name__ == '__main__':
    main()
