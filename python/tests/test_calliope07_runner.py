"""
Unit tests for calliope07_runner helpers that don't need calliope/solvers.

    python -m pytest python/tests/ -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope07_runner as r  # noqa: E402


def test_detects_07_overrides_by_nodes_block():
    ovs = {'activate_parking': {'nodes': {'parking': {'techs': {'pv_parking': {'active': True}}}}}}
    assert r._looks_like_07_overrides(ovs) is True


def test_detects_07_overrides_by_config_block():
    ovs = {'rename': {'config': {'init': {'name': 'Scenario 1'}}}}
    assert r._looks_like_07_overrides(ovs) is True


def test_detects_07_overrides_by_flat_tech_params():
    ovs = {'bump': {'techs': {'pv': {'flow_cap_max': 500}}}}   # no 0.6 wrapper
    assert r._looks_like_07_overrides(ovs) is True


def test_does_not_flag_06_authored_overrides():
    # TEMPO's Overrides UI produces 0.6 vocabulary: locations + nested wrappers.
    ovs = {
        'o1': {
            'locations': {'A': {'techs': {'pv': {'constraints': {'energy_cap_max': 500}}}}},
            'techs': {'wind': {'constraints': {'energy_cap_max': 100}}},
            'run': {'solver': 'cbc'},
        },
    }
    assert r._looks_like_07_overrides(ovs) is False


def test_empty_or_malformed():
    assert r._looks_like_07_overrides({}) is False
    assert r._looks_like_07_overrides(None) is False
    assert r._looks_like_07_overrides({'x': 'not-a-dict'}) is False


def test_capacities_use_output_carrier_for_conversion():
    xr = __import__('pytest').importorskip('xarray')
    import numpy as np
    cap = xr.DataArray(
        np.array([[[154.5, 85.0]], [[np.nan, 300.0]]]),
        dims=('techs', 'nodes', 'carriers'),
        coords={'techs': ['ccgt', 'pv'], 'nodes': ['south'], 'carriers': ['gas', 'electricity']})
    caps = r._capacities_from_flow_cap(cap, {'ccgt': 'electricity'})
    assert caps == {'south::ccgt': 85.0, 'south::pv': 300.0}


# --- Calliope 0.6.8 contract ids + unmet demand ----------------------------------

def _ds07():
    xr = __import__('pytest').importorskip('xarray')
    import numpy as np
    nan = np.nan
    nodes, techs = ['t9_north', 's_e_arica'], ['hydro_ror', 't66_kv_t9_north_s_e_arica', 'total_demand']
    ts = ['2021-01-04 14:00', '2021-01-04 15:00', '2021-01-04 16:00']
    cap = np.array([[500.0, 100.0, nan], [nan, 100.0, 50.0]])[:, :, None]
    out = np.full((2, 3, 1, 3), nan)
    out[0, 0, 0] = [400.0, 500.0, 500.0]   # hydro at 9 North
    out[1, 1, 0] = [10.0, 20.0, 30.0]      # link delivers at S/E ARICA (from 9 North)
    out[0, 1, 0] = [0.0, 0.0, 0.0]
    inn = np.full((2, 3, 1, 3), nan)
    inn[1, 2, 0] = [410.0, 639.0, 713.0]
    cost = np.array([[5.0, 1.0, nan], [nan, 1.0, nan]])
    unmet = np.zeros((2, 1, 3))
    unmet[1, 0] = [0.0, 119.0, 183.0]
    unmet[0, 0] = [0.0, -4.0, 0.0]         # unused supply folded in: not unmet
    return xr.Dataset({
        'flow_cap': (('nodes', 'techs', 'carriers'), cap),
        'flow_out': (('nodes', 'techs', 'carriers', 'timesteps'), out),
        'flow_in': (('nodes', 'techs', 'carriers', 'timesteps'), inn),
        'cost': (('nodes', 'techs'), cost),
        'unmet_demand': (('nodes', 'carriers', 'timesteps'), unmet),
    }, coords={'nodes': nodes, 'techs': techs, 'carriers': ['electricity'], 'timesteps': ts})


TECHS07 = {
    'hydro_ror': {'base_tech': 'supply', 'carrier_out': 'electricity'},
    't66_kv_t9_north_s_e_arica': {'base_tech': 'transmission', 'link_from': 't9_north', 'link_to': 's_e_arica'},
    'total_demand': {'base_tech': 'demand'},
}
TECHS = [
    {'name': 'hydro-ror', 'essentials': {'parent': 'supply', 'carrier_out': 'electricity'}},
    {'name': '66_kv', 'essentials': {'parent': 'transmission', 'carrier': 'electricity'}},
    {'name': 'total_demand', 'essentials': {'parent': 'demand', 'carrier': 'electricity'}},
]
LOCS = [{'name': '9 North'}, {'name': 'S/E ARICA'}]


def _extract07():
    from types import SimpleNamespace
    return r._extract_results(SimpleNamespace(results=_ds07()), TECHS07, TECHS, 'm', 'cbc', locations=LOCS)


def test_contract_ids_match_calliope06():
    res = _extract07()
    assert res['capacities'] == {'9_north::hydro-ror': 500.0, '9_north::66_kv:s_e_arica': 100.0,
                                 's_e_arica::66_kv:9_north': 100.0, 's_e_arica::total_demand': 50.0}
    assert set(res['generation']) == {'9_north::hydro-ror::electricity', '9_north::66_kv:s_e_arica::electricity',
                                      's_e_arica::66_kv:9_north::electricity'}
    assert set(res['dispatch']) == {'hydro-ror'}
    assert set(res['costs_by_tech']) == {'hydro-ror', '66_kv'}
    assert set(res['costs_by_location']) == {'9_north', 's_e_arica'}
    assert res['tech_parents']['hydro-ror'] == 'supply'


def test_transmission_pair_resorted_on_contract_ids():
    tf = _extract07()['transmission_flow']
    assert tf == {'9_north::s_e_arica': {'from': '9_north', 'to': 's_e_arica', 'timeseries': [10.0, 20.0, 30.0]}}


def test_unmet_demand_reported_like_calliope06():
    res = _extract07()
    assert res['objective'] == 7.0
    assert res['total_unmet_demand_mwh'] == 302.0
    assert res['unmet_demand_by_location'] == {'s_e_arica': 302.0}
    assert res['unmet_demand_timeseries'] == [0.0, 119.0, 183.0]
