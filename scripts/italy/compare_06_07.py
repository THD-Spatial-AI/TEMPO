"""
Gate B — Calliope 0.6.8 (TEMPO runner, result JSON) vs Calliope 0.7 (MEME-emitted
model, results netCDF) on the same Calliope-Italy window: objective and installed
capacity per technology.

Run in the Calliope 0.7 venv (reads the 0.7 netCDF):
    <calliope07-venv>/python scripts/italy/compare_06_07.py --r06 r06.json --r07 r07.nc
        [--techs-from payload.json] [--obj-tol 0.5] [--cap-tol 1.0]
"""

import argparse
import json
import sys
from collections import defaultdict


def base_tech(name, known):
    """0.7 link techs are '<tech>_<FROM>_<TO>'; map back to the base tech id."""
    if name in known:
        return name
    for t in sorted(known, key=len, reverse=True):
        if name.startswith(t + '_'):
            return t
    return name


def caps_06(r):
    out, tx = defaultdict(float), set()
    for key, v in (r.get('capacities') or {}).items():
        loc, _, tech = key.partition('::')
        if ':' in tech:  # transmission 'tech:remote' — counted at both ends
            tech = tech.split(':')[0]
            tx.add(tech)
        out[tech] += float(v)
    for t in tx:
        out[t] /= 2
    return out


def caps_07(nc, known, in_carrier, effs):
    import calliope
    m = calliope.read_netcdf(nc)
    fc = m.results['flow_cap'].to_series().dropna()
    base = m.inputs['base_tech'].to_series() if 'base_tech' in m.inputs else {}
    out = defaultdict(float)
    for (node, tech, carrier), v in fc.items():
        bt = base.get(tech) if hasattr(base, 'get') else None
        if bt == 'conversion':
            # MEME conversion capacity is input-referenced (the output flow_cap is
            # a free variable): compare input flow_cap × efficiency with 0.6's
            # output-referenced energy_cap.
            bt_name = base_tech(tech, known)
            if carrier != in_carrier.get(bt_name, carrier):
                continue
            v = float(v) * effs.get(bt_name, 1.0)
        out[base_tech(tech, known)] += float(v)
    # transmission flow_cap is reported at both ends
    tx = {base_tech(t, known) for t, bt in base.items() if bt == 'transmission'}
    for t in tx:
        out[t] /= 2
    obj = float(m.results['cost'].sel(costs='monetary').sum()) if 'costs' in m.results['cost'].dims \
        else float(m.results['cost'].sum())
    return out, obj, str(m.results.attrs.get('termination_condition'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--r06', required=True)
    ap.add_argument('--r07', required=True)
    ap.add_argument('--techs-from', help='TEMPO payload JSON (tech names, conversion input carrier + efficiency)')
    ap.add_argument('--obj-tol', type=float, default=0.5)
    ap.add_argument('--cap-tol', type=float, default=1.0)
    ap.add_argument('--min-cap', type=float, default=1e3, help='ignore techs below this in both (model units)')
    a = ap.parse_args()

    r06 = json.load(open(a.r06, encoding='utf-8'))
    known, in_carrier, effs, demand = set(), {}, {}, set()
    if a.techs_from:
        for t in json.load(open(a.techs_from, encoding='utf-8'))['technologies']:
            known.add(t['name'])
            if (t.get('essentials') or {}).get('parent', t.get('parent')) == 'demand':
                demand.add(t['name'])  # sinks: their "capacity" is not a design decision
            ess = t.get('essentials') or {}
            in_carrier[t['name']] = ess.get('carrier_in') or ess.get('carrier')
            effs[t['name']] = float((t.get('constraints') or {}).get('energy_eff', 1))
    c06 = caps_06(r06)
    known |= set(c06)
    c07, obj07, tc07 = caps_07(a.r07, known, in_carrier, effs)
    obj06 = float(r06['objective'])

    fails = []
    d_obj = (obj07 - obj06) / abs(obj06) * 100
    print(f"objective  0.6.8={obj06:.6g}  0.7={obj07:.6g}  diff={d_obj:+.3f}%  (0.7 termination: {tc07})")
    if abs(d_obj) > a.obj_tol:
        fails.append(f'objective differs by {d_obj:+.3f}% (> {a.obj_tol}%)')
    print(f"{'tech':28s} {'0.6.8':>14s} {'0.7':>14s} {'diff %':>8s}")
    for t in sorted(set(c06) | set(c07)):
        v6, v7 = c06.get(t, 0.0), c07.get(t, 0.0)
        if max(v6, v7) < a.min_cap or t in demand:
            continue
        d = (v7 - v6) / max(abs(v6), 1e-9) * 100 if v6 else float('inf')
        flag = '' if abs(d) <= a.cap_tol else '  <--'
        print(f"{t:28s} {v6:14.6g} {v7:14.6g} {d:+8.2f}{flag}")
        if flag:
            fails.append(f'{t}: {d:+.2f}%')
    print('\nGATE B', 'PASS' if not fails else 'FAIL: ' + '; '.join(fails))
    sys.exit(0 if not fails else 1)


if __name__ == '__main__':
    main()
