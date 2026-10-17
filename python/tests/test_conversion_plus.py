"""
Calliope conversion_plus (multi-carrier conversion) across the engines.

Fixture: scripts/templates/chp_mini.json — a CHP (eff 0.4, heat ratio 0.8, electricity export
revenue) and a heat pump (COP 4, free secondary 'low_t_heat' input). All five engines reproduce
Calliope 0.6.8's optimum on it (objective 601.22 with the CHP, 2609.29 in the heat-pump variant);
these tests pin the translations that make that true. Calliope's equations (backend
conversion_plus.py), ratios defaulting to 1:
    prod_out / r_out = con_in * r_in * eff;  out_k = prod_out * r_out_k / r_out;
    con_in_k = con_in * r_in_k / r_in.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import adoptnet0_translate as at  # noqa: E402
import calliope07_translate as c7  # noqa: E402
import osemosys_translate as ot  # noqa: E402
import pypsa_translate as pt  # noqa: E402

FIXTURE = Path(__file__).parent.parent.parent / 'scripts' / 'templates' / 'chp_mini.json'


@pytest.fixture
def mini():
    return json.loads(FIXTURE.read_text(encoding='utf-8'))


def _tech(model, name):
    return next(t for t in model['technologies'] if t['name'] == name)


# ─── PyPSA: one multi-bus Link ────────────────────────────────────────────────

def test_pypsa_chp_is_a_two_output_link_with_an_export_hub(mini):
    spec, report = pt.translate_model(mini)
    chp = next(l for l in spec['links'] if l['name'] == 'a::chp')
    assert chp['efficiency'] == pytest.approx(0.4)
    assert chp['extra'] == [{'bus': 'a::heat', 'efficiency': pytest.approx(0.4 * 0.8)}]
    # electricity leaves through the export hub so only the CHP's own output can be sold
    assert chp['bus1'] == 'a::electricity@chp'
    assert any(l['name'] == 'a::chp@hub' and l['bus1'] == 'a::electricity' for l in spec['links'])
    sink = next(g for g in spec['generators'] if g['name'] == 'a::chp@export')
    assert sink['marginal_cost'] == pytest.approx(0.10) and sink['p_min_pu'][0] == -1.0
    assert any('multi-bus Link' in r for r in report)


def test_pypsa_heat_pump_draws_its_secondary_input_from_the_ground_heat_bus(mini):
    spec, _ = pt.translate_model(mini)
    gshp = next(l for l in spec['links'] if l['name'] == 'a::gshp')
    assert gshp['efficiency'] == pytest.approx(4.0)                          # COP is not clamped to 1
    assert gshp['extra'] == [{'bus': 'a::low_t_heat', 'efficiency': pytest.approx(-1.0)}]   # draws 1 per unit input


def test_pypsa_carrier_ratios_default_to_one_and_scale_secondary_carriers(mini):
    _tech(mini, 'chp')['constraints']['carrier_ratios'] = {'carrier_out_2': {'heat': 0.5}, 'carrier_in': {'gas': 2.0}}
    spec, _ = pt.translate_model(mini)
    chp = next(l for l in spec['links'] if l['name'] == 'a::chp')
    assert chp['efficiency'] == pytest.approx(0.4 * 2.0)                      # eff * r_in * r_out
    assert chp['extra'][0]['efficiency'] == pytest.approx(0.4 * 2.0 * 0.5)    # eff * r_in * r_out_2


# ─── OSeMOSYS: extra activity ratios ──────────────────────────────────────────

def _read(d, name):
    import csv
    with open(os.path.join(d, name), newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def test_osemosys_secondary_carriers_become_extra_activity_ratios(mini):
    with tempfile.TemporaryDirectory() as d:
        ot.translate_model(mini, d, None, parity=True)
        out = {(r['TECHNOLOGY'], r['FUEL']): float(r['VALUE']) for r in _read(d, 'OutputActivityRatio.csv')}
        inp = {(r['TECHNOLOGY'], r['FUEL']): float(r['VALUE']) for r in _read(d, 'InputActivityRatio.csv')}
    assert out[('A_CHP', 'A_ELECTRICITY')] == 1.0
    assert out[('A_CHP', 'A_HEAT')] == pytest.approx(0.8)
    assert inp[('A_CHP', 'A_GAS')] == pytest.approx(1 / 0.4)
    assert inp[('A_GSHP', 'A_ELECTRICITY')] == pytest.approx(1 / 4.0)          # COP 4, not clamped
    assert inp[('A_GSHP', 'A_LOW_T_HEAT')] == pytest.approx(1 / 4.0)           # secondary input follows


# ─── AdOpT-NET0: CONV3 with fixed ratios ──────────────────────────────────────

def test_adopt_conversion_plus_is_a_conv3_sized_on_the_input(mini):
    chp = at._build_conv3_json(_tech(mini, 'chp'), _tech(mini, 'chp')['constraints'],
                               _tech(mini, 'chp')['costs']['monetary'])
    perf = chp['Performance']
    assert chp['tec_type'] == 'CONV3' and perf['main_input_carrier'] == 'gas'
    assert perf['performance']['out'] == {'electricity': [0, pytest.approx(0.4)], 'heat': [0, pytest.approx(0.32)]}
    assert chp['size_max'] == pytest.approx(0.5 / 0.4)                          # 500 kW output cap -> 1.25 MW of input
    gshp = at._build_conv3_json(_tech(mini, 'gshp'), _tech(mini, 'gshp')['constraints'],
                                _tech(mini, 'gshp')['costs']['monetary'])
    assert gshp['Performance']['input_ratios'] == {'electricity': 1.0, 'low_t_heat': 1.0}
    assert gshp['Performance']['performance']['out'] == {'heat': [0, pytest.approx(4.0)]}


def test_adopt_reports_conv3_capacity_on_the_output_side(mini):
    assert at.conv3_output_per_input(mini) == {('a', 'chp'): pytest.approx(0.4), ('a', 'gshp'): pytest.approx(4.0)}


def test_adopt_conv3_round_trips_through_the_importer(mini):
    tech = _tech(mini, 'chp')
    j = at._build_conv3_json(tech, tech['constraints'], tech['costs']['monetary'])
    back = at._parse_tech_json('chp', j, [])
    assert back['essentials']['parent'] == 'conversion_plus'
    assert back['essentials']['carrier_out_2'] == 'heat'
    assert back['constraints']['energy_eff'] == pytest.approx(0.4)
    assert back['constraints']['carrier_ratios']['carrier_out_2']['heat'] == pytest.approx(0.8)


# ─── Calliope 0.7: base balance + generated fixed-share math ──────────────────

def test_07_chp_energy_balance_and_shares(mini):
    out = c7.translate_tech(_tech(mini, 'chp'), [])
    assert out['carrier_out'] == ['electricity', 'heat'] and 'flow_out_eff' not in out
    # total outflow = 0.4 * (1 + 0.8) per unit gas, so the inflow efficiency is 0.72
    assert out['flow_in_eff'] == {'data': pytest.approx(0.72), 'index': 'gas', 'dims': 'carriers'}
    shares = dict(zip(out['cp_out_share']['index'], out['cp_out_share']['data']))
    assert shares['electricity'] == pytest.approx(1 / 1.8) and shares['heat'] == pytest.approx(0.8 / 1.8)
    assert shares['heat'] / shares['electricity'] == pytest.approx(0.8)
    # om_prod / om_con are charged on the primary carrier only
    assert out['cost_flow_out']['dims'] == ['costs', 'carriers'] and out['cost_flow_out']['index'] == [['monetary', 'electricity']]


def test_07_heat_pump_secondary_input(mini):
    out = c7.translate_tech(_tech(mini, 'gshp'), [])
    assert out['carrier_in'] == ['electricity', 'low_t_heat']
    assert out['flow_in_eff']['data'] == pytest.approx(4.0 - 1.0)               # COP minus the ground-heat share
    shares = dict(zip(out['cp_in_share']['index'], out['cp_in_share']['data']))
    assert shares == {'electricity': pytest.approx(0.5), 'low_t_heat': pytest.approx(0.5)}


def test_07_math_module_is_valid_yaml_with_both_constraints():
    import yaml
    doc = yaml.safe_load(c7.CONVERSION_PLUS_MATH)
    assert set(doc['constraints']) == {'cp_out_fixed_shares', 'cp_in_fixed_shares'}
    assert set(doc['parameters']) == {'cp_out_share', 'cp_in_share'}


def test_07_secondary_tiers_with_no_energy_left_are_dropped_with_a_warning(mini):
    tech = _tech(mini, 'gshp')
    tech['constraints']['energy_eff'] = 0.5      # a = 0.5 - 1 < 0: cannot be expressed
    warnings = []
    out = c7.translate_tech(tech, warnings)
    assert out['carrier_in'] == 'electricity' and any('no energy' in w for w in warnings)


# ─── capability table reflects the new support ───────────────────────────────

def test_capability_table_marks_conversion_plus_supported_on_every_engine():
    import engine_diagnostics as D
    assert all(D.support('conversion_plus', e)[0] == D.FULL for e in D.ENGINES)


# ─── OSeMOSYS: exact balance for by-products, HiGHS route ────────────────────

def test_osemosys_flags_by_product_fuels_for_exact_balance(mini):
    with tempfile.TemporaryDirectory() as d:
        ot.translate_model(mini, d, None, parity=True)
        rows = _read(d, 'TempoStrictBalance.csv')
    assert [(r['FUEL'], r['VALUE']) for r in rows] == [('A_HEAT', '1')]       # the CHP's secondary output only


def test_osemosys_strict_balance_param_is_declared_and_loaded(mini):
    import osemosys_runner as R
    model = (Path(R.__file__).parent / 'osemosys' / 'osemosys.txt').read_text(encoding='utf-8')
    assert 'param TempoStrictBalance' in model and 'TEMPO_StrictBalance' in model
    assert 'TempoStrictBalance' in R._MODEL_DEFAULT_PARAMS


def test_osemosys_highs_route_agrees_with_glpk(mini, monkeypatch):
    """HiGHS solves the LP, GLPK post-processes: the optimum must equal GLPK's own."""
    pytest.importorskip('highspy')
    import osemosys_runner as R
    try:
        R._find_glpsol()
    except Exception:
        pytest.skip('glpsol not available')
    via_highs = R.run_model(json.loads(json.dumps(mini)), tempfile.mkdtemp())
    monkeypatch.setattr(R, '_solve_with_highs', lambda *a, **k: None)
    via_glpk = R.run_model(json.loads(json.dumps(mini)), tempfile.mkdtemp())
    assert via_highs['success'] and via_glpk['success']
    assert via_highs['objective'] == pytest.approx(via_glpk['objective'], rel=1e-6)
    assert via_highs['generation']['a::chp::heat'] == pytest.approx(via_glpk['generation']['a::chp::heat'], rel=1e-5)


# ─── surplus by-products: penalised dump, as Calliope's ensure_feasibility ────

def test_pypsa_ensure_feasibility_adds_a_penalised_dump_at_every_bus(mini):
    spec, _ = pt.translate_model(mini)
    dumps = [g for g in spec['generators'] if g['name'].endswith('::unused_supply')]
    assert {g['bus'] for g in dumps} >= {'a::electricity', 'a::heat', 'a::gas'}
    assert all(g['p_min_pu'][0] == -1.0 and g['p_max_pu'][0] == 0.0 and g['marginal_cost'] == -pt.UNMET_DEMAND_COST
               for g in dumps)
    assert not any('@' in g['bus'] for g in dumps)               # not on export hubs
    mini['modelConfig']['ensureFeasibility'] = False
    spec, _ = pt.translate_model(mini)
    assert not any(g['name'].endswith('::unused_supply') for g in spec['generators'])


def test_osemosys_by_product_fuel_gets_a_penalised_dump_tech(mini):
    with tempfile.TemporaryDirectory() as d:
        ot.translate_model(mini, d, None, parity=True)
        inp = {(r['TECHNOLOGY'], r['FUEL']) for r in _read(d, 'InputActivityRatio.csv')}
        var = {r['TECHNOLOGY']: float(r['VALUE']) for r in _read(d, 'VariableCost.csv') if r['MODE_OF_OPERATION'] == '1'}
    assert ('A_HEAT_DUMP', 'A_HEAT') in inp
    assert var['A_HEAT_DUMP'] > 1e3                                # same bigM-style price as unmet demand
    mini['modelConfig']['ensureFeasibility'] = False
    with tempfile.TemporaryDirectory() as d:
        ot.translate_model(mini, d, None, parity=True)
        assert ('A_HEAT_DUMP', 'A_HEAT') not in {(r['TECHNOLOGY'], r['FUEL']) for r in _read(d, 'InputActivityRatio.csv')}


def test_osemosys_strict_balance_is_written_from_activities_not_free_variables():
    import osemosys_runner as R
    text = (Path(R.__file__).parent / 'osemosys' / 'osemosys.txt').read_text(encoding='utf-8')
    block = text[text.index('s.t. TEMPO_StrictBalance'):]
    block = block[:block.index(';') + 1]
    # Demand[] / Use[] are free variables for a fuel nobody consumes — the bound must not use them
    import re
    assert not re.search(r'(?<![A-Za-z])(Use|Demand)\[', block)
    assert 'InputActivityRatio' in block and 'SpecifiedAnnualDemand' in block


# ─── OSeMOSYS storage limits (storage_cap_max, charge_rate) ──────────────────

def _storage_model():
    return {
        'name': 's', 'timeSeries': [], 'links': [], 'technologies': [
            {'name': 'gen', 'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
             'constraints': {'resource': 'inf', 'energy_cap_max': 100}, 'costs': {'monetary': {}}},
            {'name': 'bat', 'essentials': {'parent': 'storage', 'carrier': 'electricity'},
             'constraints': {'storage_cap_max': 500, 'charge_rate': 0.25, 'energy_eff': 0.9, 'lifetime': 10},
             'costs': {'monetary': {'storage_cap': 100, 'interest_rate': 0.1}}},
            {'name': 'dem', 'essentials': {'parent': 'demand', 'carrier_in': 'electricity'},
             'constraints': {'resource': -10}, 'costs': {'monetary': {}}}],
        'locations': [{'name': 'a', 'techs': {'gen': None, 'bat': None, 'dem': None}}],
        'modelConfig': {'startDate': '2015-01-01', 'endDate': '2015-01-01', 'mode': 'plan'},
    }


def test_osemosys_storage_cap_max_and_charge_rate_become_extension_params():
    with tempfile.TemporaryDirectory() as d:
        _, report = ot.translate_model(_storage_model(), d, None, parity=True)
        cap = _read(d, 'TempoStorageCapMax.csv')
        pw = _read(d, 'TempoPowerPerStorage.csv')
    assert [(r['STORAGE'], float(r['VALUE'])) for r in cap] == [('A_BAT_S', pytest.approx(500 * 3.6e-9))]   # kWh -> PJ
    assert [(r['TECHNOLOGY'], r['STORAGE'], float(r['VALUE'])) for r in pw] == [('A_BAT', 'A_BAT_S', 0.25)]
    assert not any('storage_cap_max' in r and 'not enforced' in r for r in report)


def test_osemosys_model_declares_the_storage_limit_extension():
    import osemosys_runner as R
    text = (Path(R.__file__).parent / 'osemosys' / 'osemosys.txt').read_text(encoding='utf-8')
    assert 'TEMPO_StorageCapMax' in text and 'TEMPO_StoragePower' in text and '277.7778' in text
    assert {'TempoStorageCapMax', 'TempoPowerPerStorage'} <= R._MODEL_DEFAULT_PARAMS
