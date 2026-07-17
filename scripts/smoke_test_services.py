"""
Live service smoke tester — hits the running HTTP services, not subprocess venvs.

Tests the full path: HTTP → FastAPI → runner → result.
Run this AFTER starting TEMPO (or starting services manually) to verify each
service can actually produce results, not just respond to health checks.

Usage:
    python scripts/smoke_test_services.py [options]

By default tests all five services on their default ports. Skip a service by
omitting its --*-port flag or passing --skip <name>.

Options:
    --calliope-port    N   (default 5000)
    --calliope07-port  N   (default 5002)
    --pypsa-port       N   (default 5003)
    --osemosys-port    N   (default 5004)
    --adoptnet0-port   N   (default 5001)
    --skip             NAME [NAME ...]  services to skip entirely
    --payload          PATH  model JSON to send (default: scripts/reference_model.json)
    --timeout          N   seconds to wait for each run (default 300)
    --poll             N   seconds between result polls (default 5)
    --health-only          only check /health, don't run a model

Exit code: 0 if all tested services pass, 1 if any fail.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).parent.parent

CONTRACT_KEYS = {
    'success', 'termination_condition', 'objective',
    'capacities', 'generation', 'dispatch', 'timestamps', 'demand_timeseries',
    'costs_by_tech', 'costs_by_location', 'tech_metadata', 'tech_parents',
}

SERVICES = [
    ('calliope',    5000, 'Calliope 0.6'),
    ('calliope07',  5002, 'Calliope 0.7'),
    ('pypsa',       5003, 'PyPSA'),
    ('osemosys',    5004, 'OSeMOSYS'),
    ('adoptnet0',   5001, 'AdOpT-NET0'),
]


def _get(url, timeout=10):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _post(url, payload, timeout=30):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def check_health(base_url, label):
    try:
        h = _get(f"{base_url}/health")
        status = h.get('status', '?')
        if status == 'ok':
            print(f"  [health] OK  — {h}")
            return True
        else:
            print(f"  [health] UNEXPECTED status={status!r}")
            return False
    except Exception as exc:
        print(f"  [health] UNREACHABLE — {exc}")
        return False


def run_and_validate(base_url, label, payload, timeout_s, poll_s):
    # POST /run
    try:
        resp = _post(f"{base_url}/run", payload)
        job_id = resp.get('job_id')
        if not job_id:
            print(f"  [run] No job_id in response: {resp}")
            return False
        print(f"  [run] job_id={job_id}")
    except Exception as exc:
        print(f"  [run] POST failed — {exc}")
        return False

    # Poll /run/{job_id}/result
    result_url = f"{base_url}/run/{job_id}/result"
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        time.sleep(poll_s)
        try:
            result = _get(result_url, timeout=10)
            # Got a result
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                elapsed = int(time.time() - (deadline - timeout_s))
                print(f"  [poll] still running… ({elapsed}s)", flush=True)
                continue
            print(f"  [poll] HTTP {e.code} — {e}")
            return False
        except Exception as exc:
            print(f"  [poll] error — {exc}")
            return False
    else:
        print(f"  [poll] TIMEOUT after {timeout_s}s")
        return False

    # Validate result
    ok = True
    term = result.get('termination_condition')
    print(f"  [result] termination_condition={term!r}  objective={result.get('objective')}")
    if term != 'optimal':
        print(f"  [result] FAIL — expected 'optimal', got {term!r}")
        ok = False

    missing = CONTRACT_KEYS - set(result.keys())
    if missing:
        print(f"  [result] FAIL — missing contract keys: {sorted(missing)}")
        ok = False
    else:
        print(f"  [result] contract keys: OK ({len(result)} keys total)")

    bad_caps = [k for k in (result.get('capacities') or {}) if '::' not in k]
    if bad_caps:
        print(f"  [result] FAIL — capacities keys without '::': {bad_caps[:3]}")
        ok = False

    n_ts = len(result.get('timestamps') or [])
    print(f"  [result] timestamps={n_ts}")
    for tech, series in (result.get('dispatch') or {}).items():
        if isinstance(series, list) and n_ts and len(series) != n_ts:
            print(f"  [result] FAIL — dispatch[{tech!r}] length {len(series)} != {n_ts}")
            ok = False

    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    for name, default_port, _ in SERVICES:
        ap.add_argument(f'--{name}-port', type=int, default=default_port,
                        dest=f'{name.replace("-", "_")}_port',
                        help=f'Port for {name} service (default {default_port})')
    ap.add_argument('--skip', nargs='+', default=[], metavar='NAME',
                    help='Services to skip (e.g. --skip calliope07 adoptnet0)')
    ap.add_argument('--payload', default=str(REPO / 'scripts' / 'reference_model.json'),
                    help='Model JSON payload (default: scripts/reference_model.json)')
    ap.add_argument('--timeout', type=int, default=300,
                    help='Seconds to wait for each run (default 300)')
    ap.add_argument('--poll', type=int, default=5,
                    help='Seconds between result polls (default 5)')
    ap.add_argument('--health-only', action='store_true',
                    help='Only check /health, skip model run')
    args = ap.parse_args()

    payload_path = Path(args.payload)
    if not payload_path.exists():
        ap.error(f"Payload not found: {payload_path}")
    payload = json.loads(payload_path.read_text(encoding='utf-8'))

    skip = {s.lower() for s in args.skip}

    results = {}
    for name, default_port, label in SERVICES:
        if name in skip:
            print(f"\n=== {label} — SKIPPED ===")
            continue
        port = getattr(args, f'{name.replace("-", "_")}_port')
        base_url = f'http://localhost:{port}'
        print(f"\n=== {label} ({base_url}) ===")

        healthy = check_health(base_url, label)
        if not healthy:
            results[name] = 'UNREACHABLE'
            continue

        if args.health_only:
            results[name] = 'HEALTH-OK'
            continue

        passed = run_and_validate(base_url, label, payload, args.timeout, args.poll)
        results[name] = 'PASS' if passed else 'FAIL'

    # Summary
    print('\n' + '=' * 50)
    print('SMOKE TEST SUMMARY')
    print('=' * 50)
    any_fail = False
    for name, _, label in SERVICES:
        if name in skip:
            continue
        status = results.get(name, '?')
        icon = '✓' if status in ('PASS', 'HEALTH-OK') else '✗'
        print(f"  {icon}  {label:<18} {status}")
        if status not in ('PASS', 'HEALTH-OK'):
            any_fail = True
    print()
    if any_fail:
        sys.exit(1)
    print("All tested services passed.")


if __name__ == '__main__':
    main()
