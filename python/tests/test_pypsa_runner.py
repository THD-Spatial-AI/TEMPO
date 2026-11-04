"""
pypsa_runner result extraction against a stand-in network (no pypsa install):
contract ids must be the Calliope 0.6.8 ones, the unmet-demand slack must be
reported (and kept out of the objective) like the Calliope runner does.

    python -m pytest python/tests/test_pypsa_runner.py -v
"""
import sys
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

import pypsa_runner  # noqa: E402
import pypsa_translate as tr  # noqa: E402

SNAPS = pd.Index(['2021-01-04 14:00:00', '2021-01-04 15:00:00', '2021-01-04 16:00:00'])
TECHS = [
    {'name': 'hydro-ror', 'essentials': {'parent': 'supply', 'carrier_out': 'electricity'}},
    {'name': '66_kv', 'essentials': {'parent': 'transmission', 'carrier': 'electricity'}},
    {'name': 'total_demand', 'essentials': {'parent': 'demand', 'carrier': 'electricity'}},
]
LOCATIONS = [{'name': '9 North'}, {'name': 'S/E ARICA'}]
N9, SE = tr.safe_id('9 North'), tr.safe_id('S/E ARICA')        # pypsa ids: t9_north, s_e_arica
HY, KV = tr.safe_id('hydro-ror'), tr.safe_id('66_kv')            # hydro_ror, t66_kv


def _network():
    gens = pd.DataFrame([
        {'name': f'{N9}::{HY}', 'bus': f'{N9}::electricity', 'carrier': HY,
         'p_nom_opt': 500.0, 'capital_cost': 1.0, 'marginal_cost': 0.0},
        {'name': f'{SE}::electricity::unmet_demand', 'bus': f'{SE}::electricity', 'carrier': 'unmet_demand',
         'p_nom_opt': 1e7, 'capital_cost': 0.0, 'marginal_cost': tr.UNMET_DEMAND_COST},
        {'name': f'{N9}::electricity::unused_supply', 'bus': f'{N9}::electricity', 'carrier': 'unused_supply',
         'p_nom_opt': 1e7, 'capital_cost': 0.0, 'marginal_cost': -tr.UNMET_DEMAND_COST},
    ]).set_index('name')
    gens_p = pd.DataFrame({f'{N9}::{HY}': [400.0, 500.0, 500.0],
                           f'{SE}::electricity::unmet_demand': [0.0, 119.0, 183.0],
                           f'{N9}::electricity::unused_supply': [0.0, 0.0, 0.0]}, index=SNAPS)
    fwd, rev = f'{N9}::{KV}:{SE}', f'{SE}::{KV}:{N9}'
    links = pd.DataFrame([
        {'name': fwd, 'bus0': f'{N9}::electricity', 'bus1': f'{SE}::electricity',
         'p_nom_opt': 100.0, 'capital_cost': 2.0, 'marginal_cost': 0.0, 'efficiency': 1.0},
        {'name': rev, 'bus0': f'{SE}::electricity', 'bus1': f'{N9}::electricity',
         'p_nom_opt': 100.0, 'capital_cost': 2.0, 'marginal_cost': 0.0, 'efficiency': 1.0},
    ]).set_index('name')
    p0 = pd.DataFrame({fwd: [10.0, 20.0, 30.0], rev: [0.0, 0.0, 0.0]}, index=SNAPS)
    buses = pd.DataFrame({'carrier': ['electricity', 'electricity']},
                         index=[f'{N9}::electricity', f'{SE}::electricity'])
    loads = pd.DataFrame(index=[f'{SE}::total_demand'])
    return SimpleNamespace(
        snapshots=SNAPS, objective=1700.0 + 302 * tr.UNMET_DEMAND_COST,
        generators=gens, generators_t=SimpleNamespace(p=gens_p, marginal_cost=pd.DataFrame(index=SNAPS)),
        buses=buses, stores=pd.DataFrame(columns=['capital_cost', 'e_nom_opt']),
        links=links, links_t=SimpleNamespace(p0=p0, p1=-p0),
        loads=loads, loads_t=SimpleNamespace(p=pd.DataFrame({f'{SE}::total_demand': [410.0, 639.0, 713.0]},
                                                            index=SNAPS)))


def _extract():
    return pypsa_runner._extract_results(_network(), {}, TECHS, 'm', 'highs', 'optimal',
                                         locations=LOCATIONS)


def test_contract_ids_match_calliope06():
    r = _extract()
    assert r['capacities'] == {'9_north::hydro-ror': 500.0,
                               '9_north::66_kv:s_e_arica': 100.0,
                               's_e_arica::66_kv:9_north': 100.0}
    assert set(r['generation']) == {'9_north::hydro-ror::electricity',
                                    's_e_arica::66_kv:9_north::electricity',
                                    '9_north::66_kv:s_e_arica::electricity'}
    assert set(r['dispatch']) == {'hydro-ror'}
    assert set(r['costs_by_tech']) == {'hydro-ror', '66_kv'}
    assert set(r['costs_by_location']) == {'9_north', 's_e_arica'}
    assert {'hydro-ror', '66_kv'} <= set(r['tech_metadata'])
    assert r['tech_parents']['hydro-ror'] == 'supply'


def test_transmission_pair_resorted_on_contract_ids():
    # pypsa ids sort s_e_arica < t9_north; calliope ids sort 9_north < s_e_arica
    tf = _extract()['transmission_flow']
    assert list(tf) == ['9_north::s_e_arica']
    assert tf['9_north::s_e_arica'] == {'from': '9_north', 'to': 's_e_arica',
                                        'timeseries': [10.0, 20.0, 30.0]}


def test_unmet_demand_reported_and_penalty_excluded_from_objective():
    r = _extract()
    assert r['objective'] == 1700.0
    assert r['total_unmet_demand_mwh'] == 302.0
    assert r['unmet_demand_by_location'] == {'s_e_arica': 302.0}
    assert r['unmet_demand_timeseries'] == [0.0, 119.0, 183.0]


def test_unmet_demand_logs_warning():
    lines = []
    pypsa_runner._thread_local.log_fn = lines.append
    try:
        _extract()
    finally:
        pypsa_runner._thread_local.log_fn = None
    assert any('WARNING' in ln and 'unmet demand' in ln and 's_e_arica' in ln for ln in lines)


def test_contract_id_semantics():
    assert tr.contract_id('hydro-ror') == 'hydro-ror'
    assert tr.contract_id('66_kv') == '66_kv'
    assert tr.contract_id('Electricity Substation') == 'Electricity_Substation'
    assert tr.contract_id('N DIESEL-QUANI-ARICA', location=True) == 'n_diesel-quani-arica'
    assert tr.contract_id('S/E ARICA', location=True) == 's_e_arica'
