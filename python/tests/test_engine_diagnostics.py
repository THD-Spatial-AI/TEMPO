"""
Unit tests for engine_diagnostics (pre-run assessment, capability table, failure diagnosis)
and the must-run (energy_cap_min_use) translation in PyPSA. stdlib + pytest only.
"""

import copy
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import engine_diagnostics as D  # noqa: E402
import pypsa_translate as pt  # noqa: E402

REFERENCE_MODEL = Path(__file__).parent.parent.parent / 'scripts' / 'reference_model.json'


@pytest.fixture
def ref():
    return json.loads(REFERENCE_MODEL.read_text(encoding='utf-8'))


def _model(**extra):
    """Minimal two-tech model: one location with a supply and a demand."""
    m = {
        'name': 'mini',
        'locations': [{'name': 'a', 'techs': {'gen': {}, 'dem': {}}}],
        'links': [],
        'technologies': [
            {'name': 'gen', 'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
             'constraints': {'energy_cap_max': 1000, 'resource': 'inf'}, 'costs': {'monetary': {'energy_cap': 1}}},
            {'name': 'dem', 'essentials': {'parent': 'demand', 'carrier_in': 'electricity'},
             'constraints': {'resource': -10}, 'costs': {'monetary': {}}},
        ],
        'timeSeries': [],
        'modelConfig': {'mode': 'plan', 'startDate': '2015-01-01', 'endDate': '2015-01-02'},
    }
    m.update(extra)
    return m


# ─── feature scanning ─────────────────────────────────────────────────────────

def test_scan_detects_features_in_tech_and_location_overrides():
    m = _model()
    m['technologies'][0]['constraints']['energy_cap_min_use'] = 0.3
    m['technologies'][0]['costs']['monetary']['om_prod'] = 'file=price.csv:x'
    m['locations'][0]['techs']['gen'] = {'constraints': {'units_max': 3}}
    m['technologies'].append({'name': 'sink', 'essentials': {'parent': 'demand', 'carrier_in': 'electricity'},
                              'constraints': {'resource': -1e8, 'force_resource': False}, 'costs': {}})
    m['metadata'] = {'runConfig': {'reserve_margin': {'electricity': 0.1}}}
    f = D.scan_features(m)
    assert set(f) >= {'must_run', 'time_varying_cost', 'integer_units', 'optional_sink', 'reserve_margin'}
    assert f['integer_units'] == ['a::gen']


def test_slack_group_constraints_are_not_a_feature():
    m = _model(metadata={'runConfig': {'group_constraints': {
        'slack': {'cost_max': {'monetary': 1e15}},
        'share': {'techs': ['gen'], 'carrier_prod_share_min': {'electricity': 0.5}}}}})
    assert D.scan_features(m)['group_constraints'] == ['share']


def test_conversion_plus_needs_a_secondary_carrier_or_ratios():
    m = _model()
    m['technologies'].append({'name': 'cp', 'essentials': {'parent': 'conversion_plus', 'carrier_in': 'gas',
                                                           'carrier_out': 'electricity'}, 'constraints': {}})
    assert 'conversion_plus' not in D.scan_features(m)
    m['technologies'][-1]['essentials']['carrier_out_2'] = 'heat'
    assert D.scan_features(m)['conversion_plus'] == ['cp']


# ─── capability table / assess ────────────────────────────────────────────────

def test_every_feature_has_a_level_for_every_engine():
    for feat in D.FEATURES:
        for eng in D.ENGINES:
            assert D.support(feat, eng)[0] in (D.FULL, D.PARTIAL, D.NONE)


def test_assess_warns_about_features_an_engine_drops():
    m = _model()
    m['technologies'][0]['constraints']['energy_cap_min_use'] = 0.5
    full = D.assess(m, 'calliope-0.6.8')
    osem = D.assess(m, 'osemosys')
    assert full['fidelity'] == 'full' and not full['warnings']
    assert osem['fidelity'] == 'reduced'
    assert any('gen' in w['message'] and 'part-load' in w['message'] for w in osem['warnings'])
    assert osem['features']['must_run']['level'] == D.NONE


def test_engine_aliases():
    assert D.assess(_model(), 'calliope07')['engine'] == 'calliope-0.7'


def test_blocking_errors():
    assert D.assess({'locations': [], 'technologies': []}, 'pypsa')['errors']
    m = _model(scenario='high')
    assert any(e['code'] == 'scenario_not_resolved' for e in D.assess(m, 'pypsa')['errors'])
    assert not D.assess(m, 'calliope-0.6.8')['errors']          # Calliope applies scenarios natively
    m = _model(); m['modelConfig']['mode'] = 'operate'
    assert any(e['code'] == 'operate_mode' for e in D.assess(m, 'osemosys')['errors'])
    m['modelConfig']['mode'] = 'spores'
    with pytest.raises(D.ModelValidationError) as ei:
        D.raise_if_blocked(m, 'calliope-0.7')
    assert 'SPORES' in str(ei.value) and 'calliope-0.7' in str(ei.value)


def test_missing_timeseries_blocks_demand_but_only_warns_for_supply():
    m = _model()
    m['technologies'][1]['constraints']['resource'] = 'file=demand.csv'
    a = D.assess(m, 'pypsa')
    assert [e['code'] for e in a['errors']] == ['missing_timeseries']
    m = _model()
    m['technologies'][0]['constraints']['resource'] = 'file=wind.csv'
    a = D.assess(m, 'pypsa')
    assert not a['errors'] and any(w['code'] == 'missing_timeseries' for w in a['warnings'])
    m['timeSeries'] = [{'fileName': 'wind.csv'}]
    assert not D.assess(m, 'pypsa')['warnings']


def test_reference_model_runs_everywhere(ref):
    for eng in D.ENGINES:
        assert not D.assess(ref, eng)['errors'], eng


# ─── failure diagnosis ────────────────────────────────────────────────────────

@pytest.mark.parametrize('term,kind', [
    ('infeasible', 'infeasible'), ('Infeasible or unbounded', 'infeasible'), ('unbounded', 'unbounded'),
    ('maxTimeLimit', 'time_limit'), ('weird', 'numerical')])
def test_classify_termination(term, kind):
    assert D.classify_termination(term) == kind


def test_failure_result_shape_and_actionable_text():
    m = _model(); m['modelConfig']['ensureFeasibility'] = False
    r = D.failure_result('pypsa', 'mini', 'highs', 'infeasible', m, ['x'])
    assert r['success'] is False and r['error_code'] == 'infeasible'
    assert 'infeasible' in r['error'] and 'Ensure feasibility' in r['error']      # the UI prints result.error
    assert r['hints'] and r['translation_report'] == ['x']


def test_failure_hints_mention_what_the_translation_dropped():
    m = _model()
    m['technologies'][0]['constraints']['energy_cap_min_use'] = 0.5
    r = D.failure_result('osemosys', 'mini', 'glpk', 'infeasible', m)
    assert 'part-load' in r['error']


def test_explain_exception():
    class NoFeasibleSolutionError(Exception):
        pass
    assert D.explain_exception('adoptnet0', NoFeasibleSolutionError('A feasible solution was not found'))['kind'] == 'infeasible'
    assert D.explain_exception('x', MemoryError())['termination'] == 'memory'
    assert D.explain_exception('x', RuntimeError('glpsol exited with code 143'))['termination'] == 'solver_crash'
    assert D.explain_exception('x', RuntimeError('Problem is infeasible'))['kind'] == 'infeasible'
    assert D.explain_exception('x', KeyError('boom')) is None


# ─── PyPSA must-run translation ───────────────────────────────────────────────

def test_pypsa_maps_energy_cap_min_use_to_p_min_pu():
    m = _model()
    m['technologies'][0]['constraints']['energy_cap_min_use'] = 0.4
    spec, report = pt.translate_model(m)
    gen = next(g for g in spec['generators'] if g['name'].endswith('gen'))
    assert gen['p_min_pu'] and all(abs(v - 0.4) < 1e-9 for v in gen['p_min_pu'])
    assert any('must-run' in r for r in report)


def test_pypsa_must_run_never_exceeds_the_resource_limit():
    m = _model()
    m['technologies'][0]['constraints'].update({'energy_cap_min_use': 0.9, 'resource': 'file=cf.csv:a',
                                                'resource_unit': 'energy_per_cap'})
    m['timeSeries'] = [{'fileName': 'cf.csv', 'columns': ['time', 'a'], 'dateColumn': 'time',
                        'data': [{'time': f'2015-01-01 {h:02d}:00:00', 'a': 0.2} for h in range(24)] * 2}]
    spec, _ = pt.translate_model(m)
    gen = next(g for g in spec['generators'] if g['name'].endswith('gen'))
    assert max(gen['p_min_pu']) <= 0.2 + 1e-9


READINESS_CASES = Path(__file__).parent.parent.parent / 'scripts' / 'readiness_cases.json'


@pytest.mark.parametrize('case', json.loads(READINESS_CASES.read_text(encoding='utf-8'))['cases'],
                         ids=lambda c: c['name'])
def test_shared_readiness_cases(case):
    shared = set(json.loads(READINESS_CASES.read_text(encoding='utf-8'))['shared_codes'])
    got = {i['code'] for i in D.assess(case['model'], 'pypsa')['errors']} & shared
    assert got == set(case['expect'])


def test_demand_without_profile_blocks():
    m = _model()
    m['technologies'][1]['constraints'] = {}
    a = D.assess(m, 'pypsa')
    assert [i['code'] for i in a['errors']] == ['demand_no_profile']
    assert a['errors'][0]['items'] == ['a::dem']


def test_link_to_unknown_location_blocks():
    m = _model()
    m['links'] = [{'from': 'a', 'to': 'ghost', 'tech': 'gen'}]
    assert 'link_unknown_location' in {i['code'] for i in D.assess(m, 'calliope')['errors']}


def test_demand_no_profile_skipped_with_scenario():
    m = _model()
    m['technologies'][1]['constraints'] = {}
    m['scenario'] = 'high'
    assert 'demand_no_profile' not in {i['code'] for i in D.assess(m, 'calliope')['errors']}


def test_link_by_location_id_not_flagged():
    m = _model()
    m['locations'][0]['id'] = 'loc-1'
    m['links'] = [{'from': 'loc-1', 'to': 'a', 'tech': 'gen'}]
    assert 'link_unknown_location' not in {i['code'] for i in D.assess(m, 'calliope')['errors']}
