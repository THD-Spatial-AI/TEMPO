"""
3-hourly resampling on every local engine, and the Calliope 0.7 reserve margin.

The engine tests skip when the engine is not importable, so run this file once per venv:

    <calliope-venv>/python   -m pytest python/tests/test_time_resolution.py -v
    <calliope07-venv>/python -m pytest python/tests/test_time_resolution.py -v
    <pypsa-venv>/python      -m pytest python/tests/test_time_resolution.py -v
"""

import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

import calliope07_translate as t07  # noqa: E402

RES_3H = {'model': {'time': {'function': 'resample', 'function_options': {'resolution': '3H'}}}}


def _has(mod):
    return importlib.util.find_spec(mod) is not None


def _calliope_major():
    if not _has('calliope'):
        return None
    from importlib.metadata import version
    return version('calliope')[:3]


def _model_2015(**model_config):
    """The small reference model (2 nodes, PV + battery + link) over all of 2015."""
    m = json.loads((ROOT.parent / 'scripts' / 'reference_model.json').read_text(encoding='utf-8'))
    m.pop('_comment', None)
    m['modelConfig'] = {**m['modelConfig'], 'startDate': '2015-01-01', 'endDate': '2015-12-31',
                        **model_config}
    m['solver'] = 'highs'
    return m


def _run(runner, model_data, tmp_path):
    lines = []
    res = runner.run_model(copy.deepcopy(model_data), str(tmp_path), log_fn=lines.append)
    return res, lines


def _assert_3h(res, lines):
    assert res.get('termination_condition') == 'optimal', res.get('termination_condition')
    ts = res['timestamps']
    assert len(ts) == 2920
    first, second = (str(x).replace('T', ' ') for x in ts[:2])
    assert first.startswith('2015-01-01 00:00') and second.startswith('2015-01-01 03:00')
    assert sum('Time resolution: resample to 3' in l and '(2920 timesteps)' in l for l in lines) == 1, \
        [l for l in lines if 'Time resolution' in l]


# ── Pure translation (any Python) ────────────────────────────────────────────

def test_override_time_resample_maps_to_07_config():
    out = t07.translate_override_07(RES_3H, {}, [], 'res_3H')
    assert out['config']['init']['resample'] == {'timesteps': '3h'}


def test_other_time_function_is_dropped_with_warning():
    warnings = []
    out = t07.translate_override_07({'model': {'time': {'function': 'apply_clustering'}}}, {}, warnings)
    assert 'config' not in out
    assert any('apply_clustering' in w for w in warnings)


def test_build_config_07_resample():
    cfg = t07.build_config_07('m', 'plan', '2015-01-01', '2015-12-31', 'highs', None,
                              time_resolution='3H')
    assert cfg['init']['resample'] == {'timesteps': '3h'}
    assert 'resample' not in t07.build_config_07('m', 'plan', '2015-01-01', '2015-12-31',
                                                 'highs', None)['init']


# ── Engines (skip when not installed in this venv) ───────────────────────────

@pytest.mark.skipif(_calliope_major() != '0.6', reason='Calliope 0.6.8 not installed')
def test_calliope06_res_3h_override(tmp_path):
    import calliope_runner
    m = _model_2015()
    m['overrides'] = {'res_3H': RES_3H}
    m['override'] = 'res_3H'
    _assert_3h(*_run(calliope_runner, m, tmp_path))


@pytest.mark.skipif(_calliope_major() != '0.6', reason='Calliope 0.6.8 not installed')
def test_calliope06_time_resolution_config(tmp_path):
    import calliope_runner
    _assert_3h(*_run(calliope_runner, _model_2015(timeResolution='3H'), tmp_path))


@pytest.mark.skipif(_calliope_major() != '0.7', reason='Calliope 0.7 not installed')
def test_calliope07_res_3h_override(tmp_path):
    import calliope07_runner
    m = _model_2015()
    m['overrides'] = {'res_3H': RES_3H}
    m['override'] = 'res_3H'
    _assert_3h(*_run(calliope07_runner, m, tmp_path))


@pytest.mark.skipif(_calliope_major() != '0.7', reason='Calliope 0.7 not installed')
def test_calliope07_exists_override_with_res_3h(tmp_path):
    # Calliope-Italy shape: an exists-only tech override next to res_3H must be translated
    # (not passed verbatim, which fails 0.7 validation on definition.model)
    import calliope07_runner
    m = _model_2015()
    m['overrides'] = {'no_old_techs': {'techs': {'battery': {'exists': False}}}, 'res_3H': RES_3H}
    m['scenarios'] = {'italy_like': ['no_old_techs', 'res_3H']}
    m['scenario'] = 'italy_like'
    res, lines = _run(calliope07_runner, m, tmp_path)
    _assert_3h(res, lines)
    assert not any('verbatim' in l for l in lines)
    assert not any(k.endswith('::battery') and v > 1e-6 for k, v in res['capacities'].items())


@pytest.mark.skipif(_calliope_major() != '0.7', reason='Calliope 0.7 not installed')
def test_calliope07_reserve_margin_builds_and_binds(tmp_path):
    import calliope07_runner
    m = _model_2015(timeResolution='3H')
    m['metadata'] = {'runConfig': {'reserve_margin': {'electricity': 1.0}}}
    res, lines = _run(calliope07_runner, m, tmp_path)
    _assert_3h(res, lines)
    assert any("Reserve margin 1 on 'electricity'" in l for l in lines), lines
    # PV is the only supply tech: its capacity must cover (1 + 1.0) × peak demand power.
    # demand_timeseries is energy per 3 h step.
    pv = sum(v for k, v in res['capacities'].items() if k.endswith('::solar_pv'))
    peak_power = max(res['demand_timeseries']) / 3
    assert pv >= 2 * peak_power * (1 - 1e-6), (pv, peak_power)


@pytest.mark.skipif(_calliope_major() != '0.7', reason='Calliope 0.7 not installed')
def test_calliope07_reserve_margin_from_override(tmp_path):
    import calliope07_runner
    m = _model_2015(timeResolution='3H')
    m['overrides'] = {'rm': {'model': {'reserve_margin': {'electricity': 1.0}}}}
    m['scenarios'] = {'rm_scen': ['rm']}
    m['scenario'] = 'rm_scen'
    res, lines = _run(calliope07_runner, m, tmp_path)
    assert any("Reserve margin 1 on 'electricity'" in l for l in lines), lines


@pytest.mark.skipif(not _has('pypsa'), reason='PyPSA not installed')
def test_pypsa_time_resolution(tmp_path):
    import pypsa_runner
    hourly, _ = _run(pypsa_runner, _model_2015(), tmp_path)
    res, lines = _run(pypsa_runner, _model_2015(timeResolution='3H'), tmp_path)
    _assert_3h(res, lines)
    # energy per 3 h step: the year's demand matches the hourly run
    assert sum(res['demand_timeseries']) == pytest.approx(sum(hourly['demand_timeseries']), rel=1e-6)
    assert res['objective'] == pytest.approx(hourly['objective'], rel=0.05)
