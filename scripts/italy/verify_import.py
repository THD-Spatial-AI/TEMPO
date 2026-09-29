"""
Gate A — does TEMPO build the same Calliope-Italy model as the original YAML?

Builds (no solve) the original model with scenario `2050_eff,no_old_techs` and
the model TEMPO's runner generates from a payload produced by build_payload.mjs,
then diffs every preprocessed input array in model._model_data.

Run inside the Calliope 0.6.8 venv:
    node scripts/italy/build_payload.mjs --out payload.json
    <calliope-venv>/python scripts/italy/verify_import.py --payload payload.json
        [--original public/templates/Italian_model/model.yaml] [--rtol 1e-6]

Exit code 0 = identical inputs (within rtol), 1 = differences listed.
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import xarray as xr

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'python'))

# Settings that legitimately differ (paths, names, solver, TEMPO defaults) — reported, not failed.
# Arrays whose differences are inert, with the reason:
#   colors         — dummy_tech has no colour in the YAML; Calliope picks a random one.
IGNORED_VARS = {'colors'}
# An inf bound is dropped at build time; TEMPO writes 1e15 so SPORES can tighten it later.
BIG = 1e15

IGNORED_ATTRS = {'model.name', 'model.timeseries_data_path', 'model.calliope_version',
                 'run.solver', 'run.solver_options', 'run.backend', 'run.operation'}


class _Built(Exception):
    pass


def build_tempo(payload_path):
    import calliope
    captured = {}
    orig_run = calliope.Model.run

    def _stop(self, *a, **k):
        captured['model'] = self
        raise _Built()
    calliope.Model.run = _stop
    try:
        import calliope_runner
        payload = json.loads(Path(payload_path).read_text(encoding='utf-8'))
        work = tempfile.mkdtemp(prefix='tempo_italy_')
        try:
            calliope_runner.run_model(payload, work, log_fn=lambda _l: None)
        except _Built:
            pass
    finally:
        calliope.Model.run = orig_run
    if 'model' not in captured:
        raise SystemExit('TEMPO runner did not reach model.run() — see runner log')
    return captured['model']


def build_original(yaml_path):
    import calliope
    # Same 0.6.4 → 0.6.8 rename TEMPO applies (supply_share_min is otherwise ignored).
    cfg = calliope.AttrDict.from_yaml(str(yaml_path))
    for gc in cfg.get('group_constraints', {}).values():
        for suffix in ('min', 'max', 'equals'):
            if f'supply_share_{suffix}' in gc:
                gc[f'carrier_prod_share_{suffix}'] = gc.pop(f'supply_share_{suffix}')
    cfg.model.timeseries_data_path = str(Path(yaml_path).parent / cfg.model.timeseries_data_path)
    return calliope.Model(cfg, scenario='2050_eff,no_old_techs')


def _lower_coords(da):
    for c in da.coords:
        if da[c].dtype.kind in 'OU':
            da = da.assign_coords({c: [str(v).lower() for v in da[c].values]})
    return da


def _flatten(d, prefix=''):
    out = {}
    for k, v in (d or {}).items():
        key = f'{prefix}{k}'
        if isinstance(v, dict):
            out.update(_flatten(v, key + '.'))
        else:
            out[key] = v
    return out


def compare(ref, tempo, rtol):
    rd, td = ref._model_data, tempo._model_data
    problems, notes = [], []

    for name in sorted(rd.data_vars):
        if rd[name].attrs.get('is_result') or name in IGNORED_VARS:
            continue
        if name not in td:
            problems.append(f'MISSING in TEMPO: {name}')
            continue
        a, b = _lower_coords(rd[name]), _lower_coords(td[name])
        if a.dims != b.dims:
            problems.append(f'{name}: dims differ {a.dims} vs {b.dims}')
            continue
        a, b = xr.align(a, b, join='outer')
        av, bv = a.values, b.values
        if av.dtype.kind in 'fiub' and bv.dtype.kind in 'fiub':
            av, bv = av.astype(float), bv.astype(float)
            av = np.where(np.isinf(av) & (av > 0), BIG, av)
            bv = np.where(np.isinf(bv) & (bv > 0), BIG, bv)
            both_nan = np.isnan(av) & np.isnan(bv)
            bad = ~both_nan & ~np.isclose(av, bv, rtol=rtol, atol=1e-9, equal_nan=True)
        else:
            # lookup arrays hold loc ids (TEMPO lowercases them) in comma lists of arbitrary order
            norm = lambda x: sorted(str(x).lower().split(','))
            bad = np.array([norm(x) != norm(y) for x, y in zip(av.ravel(), bv.ravel())]).reshape(av.shape)
        n_bad = int(np.count_nonzero(bad))
        if n_bad:
            idx = np.argwhere(bad)[:3]
            ex = []
            for i in idx:
                sel = {d: a[d].values[j] for d, j in zip(a.dims, i)}
                ex.append(f"{sel} ref={av[tuple(i)]!r} tempo={bv[tuple(i)]!r}")
            problems.append(f'{name}: {n_bad}/{bad.size} values differ; e.g. ' + ' | '.join(ex))

    extra = sorted(set(td.data_vars) - set(rd.data_vars))
    if extra:
        notes.append(f'Extra arrays in TEMPO (check they are inert): {extra}')

    ra = _flatten(json.loads(json.dumps(ref._model_run.get('model', {}))), 'model.')
    ra.update(_flatten(json.loads(json.dumps(ref._model_run.get('run', {}))), 'run.'))
    ta = _flatten(json.loads(json.dumps(tempo._model_run.get('model', {}))), 'model.')
    ta.update(_flatten(json.loads(json.dumps(tempo._model_run.get('run', {}))), 'run.'))
    for k in sorted(set(ra) | set(ta)):
        if any(k == p or k.startswith(p + '.') for p in IGNORED_ATTRS):
            continue
        rv, tv = ra.get(k), ta.get(k)
        if k == 'model.subset_time':  # '2015-01-01' vs '2015-01-01 00:00:00'
            rv, tv = [str(x)[:10] for x in rv or []], [str(x)[:10] for x in tv or []]
        if str(rv) != str(tv):
            (notes if k.startswith('run.') else problems).append(
                f'config {k}: ref={ra.get(k)!r} tempo={ta.get(k)!r}')
    return problems, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--payload', required=True)
    ap.add_argument('--original', default=str(REPO / 'public/templates/Italian_model/model.yaml'))
    ap.add_argument('--rtol', type=float, default=1e-6)
    args = ap.parse_args()

    ref = build_original(args.original)
    tempo = build_tempo(args.payload)
    problems, notes = compare(ref, tempo, args.rtol)
    for n in notes:
        print('NOTE ', n)
    for p in problems:
        print('DIFF ', p)
    print(f'\n{len(problems)} input difference(s)')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
