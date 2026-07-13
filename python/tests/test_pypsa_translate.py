"""
Unit tests for the internal -> PyPSA translation layer (pypsa_translate).

The spec-building layer runs on any Python >= 3.10 with pytest only — no
pypsa, no solver:
    python -m pytest python/tests/test_pypsa_translate.py -v

Tests marked with @needs_pypsa additionally build a real pypsa.Network and
are skipped automatically when pypsa is not importable (run them inside the
pypsa venv).
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import pypsa_translate as t  # noqa: E402

try:
    import pypsa  # noqa: F401
    HAS_PYPSA = True
except ImportError:
    HAS_PYPSA = False

needs_pypsa = pytest.mark.skipif(not HAS_PYPSA, reason="pypsa not installed")

REFERENCE_MODEL = Path(__file__).parent.parent.parent / 'scripts' / 'reference_model.json'


@pytest.fixture
def ref_model():
    return json.loads(REFERENCE_MODEL.read_text(encoding='utf-8'))


@pytest.fixture
def ref_spec(ref_model):
    return t.translate_model(ref_model)


# ---------------------------------------------------------------------------
# Snapshots
# ---------------------------------------------------------------------------

def test_snapshots_end_date_inclusive(ref_spec):
    spec, _ = ref_spec
    # 2005-01-01 .. 2005-01-07 inclusive = 7 days hourly
    assert len(spec['snapshots']) == 7 * 24
    assert spec['snapshots'][0] == '2005-01-01 00:00:00'
    assert spec['snapshots'][-1] == '2005-01-07 23:00:00'


# ---------------------------------------------------------------------------
# Buses and naming
# ---------------------------------------------------------------------------

def test_buses_per_location_carrier(ref_spec):
    spec, _ = ref_spec
    names = {b['name'] for b in spec['buses']}
    assert 'north::electricity' in names
    assert 'south::electricity' in names
    assert 'north::battery_store' in names  # storage aux bus
    assert 'south::battery_store' not in names  # battery only at north


def test_bus_coordinates(ref_spec):
    spec, _ = ref_spec
    north = next(b for b in spec['buses'] if b['name'] == 'north::electricity')
    assert north['x'] == 10.0 and north['y'] == 52.0


def test_safe_id():
    assert t.safe_id('My Tech-1') == 'my_tech_1'
    assert t.safe_id('9pv') == 't9pv'
    assert t.safe_id('a::b') == 'a_b'  # '_+' runs collapse, like the 0.7 safe_id


# ---------------------------------------------------------------------------
# Supply
# ---------------------------------------------------------------------------

def test_supply_generator(ref_spec):
    spec, _ = ref_spec
    gen = next(g for g in spec['generators'] if g['name'] == 'north::solar_pv')
    assert gen['bus'] == 'north::electricity'
    assert gen['p_nom_max'] == 2000
    assert gen['efficiency'] == 1.0
    # capital cost = (900 * annuity(5%, 25y) + 10 om_annual) * 168/8760
    annuity = 0.05 / (1 - 1.05 ** -25)
    expected = (900 * annuity + 10) * (168 / 8760)
    assert gen['capital_cost'] == pytest.approx(expected)
    assert gen['p_max_pu'] is None  # no resource → unconstrained


def test_supply_absolute_resource_scaled_by_cap():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'pv',
            'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
            'constraints': {'energy_cap_max': 200, 'resource': 100},
        }],
        'locations': [{'name': 'a', 'techs': {'pv': None}}],
    }
    spec, report = t.translate_model(model)
    gen = spec['generators'][0]
    assert gen['p_max_pu'] == [0.5] * 24
    assert any('approximated' in r for r in report)


def test_supply_capacity_factor_resource_passthrough():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'pv',
            'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
            'constraints': {'energy_cap_max': 200, 'resource': 0.4, 'force_resource': True},
        }],
        'locations': [{'name': 'a', 'techs': {'pv': None}}],
    }
    spec, report = t.translate_model(model)
    gen = spec['generators'][0]
    assert gen['p_max_pu'] == [0.4] * 24
    assert gen['p_min_pu'] == [0.4] * 24  # force_resource


def test_supply_file_resource_resolved_from_inline_timeseries():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'timeSeries': [{
            'fileName': 'solar.csv',
            'columns': ['time', 'cf'],
            'data': [{'time': 'x', 'cf': 0.1}, {'time': 'x', 'cf': 0.9}],
        }],
        'technologies': [{
            'name': 'pv',
            'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
            'constraints': {'resource': 'file=solar.csv:cf'},
        }],
        'locations': [{'name': 'a', 'techs': {'pv': None}}],
    }
    spec, report = t.translate_model(model)
    gen = spec['generators'][0]
    assert len(gen['p_max_pu']) == 24
    assert gen['p_max_pu'][:4] == [0.1, 0.9, 0.1, 0.9]  # cycled
    assert not any('dropped' in r for r in report)


def test_missing_file_resource_reported():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'pv',
            'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
            'constraints': {'resource': 'file=nope.csv:cf'},
        }],
        'locations': [{'name': 'a', 'techs': {'pv': None}}],
    }
    spec, report = t.translate_model(model)
    assert spec['generators'][0]['p_max_pu'] is None
    assert any('not found' in r for r in report)


# ---------------------------------------------------------------------------
# Demand
# ---------------------------------------------------------------------------

def test_demand_profile_cycled_and_positive(ref_spec, ref_model):
    spec, _ = ref_spec
    load = next(l for l in spec['loads'] if l['name'] == 'north::power_demand')
    profile = ref_model['locations'][0]['demandProfile']['timeseries']
    assert len(load['p_set']) == 168
    assert load['p_set'][:24] == [abs(v) for v in profile]
    assert load['p_set'][24:48] == load['p_set'][:24]  # cycled
    assert min(load['p_set']) > 0


def test_demand_scalar_fallback():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'dem',
            'essentials': {'parent': 'demand', 'carrier_in': 'electricity'},
            'constraints': {'resource': -150, 'force_resource': True},
        }],
        'locations': [{'name': 'a', 'techs': {'dem': None}}],
    }
    spec, _ = t.translate_model(model)
    assert spec['loads'][0]['p_set'] == [150.0] * 24


def test_demand_placeholder_reported():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'dem',
            'essentials': {'parent': 'demand', 'carrier_in': 'electricity'},
            'constraints': {},
        }],
        'locations': [{'name': 'a', 'techs': {'dem': None}}],
    }
    spec, report = t.translate_model(model)
    assert spec['loads'][0]['p_set'] == [100.0] * 24
    assert any('placeholder' in r for r in report)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def test_storage_store_plus_links(ref_spec):
    spec, report = ref_spec
    store = next(s for s in spec['stores'] if s['name'] == 'north::battery')
    assert store['bus'] == 'north::battery_store'
    assert store['e_nom_max'] == 5000
    assert store['standing_loss'] == 0.01
    annuity = 0.05 / (1 - 1.05 ** -15)
    assert store['capital_cost'] == pytest.approx(300 * annuity * (168 / 8760))

    charge = next(l for l in spec['links'] if l['name'] == 'north::battery::charge')
    discharge = next(l for l in spec['links'] if l['name'] == 'north::battery::discharge')
    assert charge['bus0'] == 'north::electricity' and charge['bus1'] == 'north::battery_store'
    assert discharge['bus0'] == 'north::battery_store' and discharge['bus1'] == 'north::electricity'
    assert charge['efficiency'] == 0.95 and discharge['efficiency'] == 0.95
    assert charge['p_nom_max'] == 1000 and discharge['p_nom_max'] == 1000
    assert charge['capital_cost'] == 0.0
    assert discharge['capital_cost'] == pytest.approx(100 * annuity * (168 / 8760))
    assert any('Store + charge/discharge' in r for r in report)


# ---------------------------------------------------------------------------
# Transmission
# ---------------------------------------------------------------------------

def test_transmission_two_directed_links_half_cost(ref_spec):
    spec, report = ref_spec
    fwd = next(l for l in spec['links'] if l['name'] == 'north::grid_link:south')
    rev = next(l for l in spec['links'] if l['name'] == 'south::grid_link:north')
    assert fwd['bus0'] == 'north::electricity' and fwd['bus1'] == 'south::electricity'
    assert rev['bus0'] == 'south::electricity' and rev['bus1'] == 'north::electricity'
    assert fwd['efficiency'] == 0.97
    assert fwd['p_nom_max'] == 3000
    annuity = 0.05 / (1 - 1.05 ** -40)
    pair_cost = (0.5 * 400) * annuity * (168 / 8760)
    assert fwd['capital_cost'] == pytest.approx(pair_cost / 2)
    assert rev['capital_cost'] == pytest.approx(pair_cost / 2)
    assert any('two directed Links' in r for r in report)


# ---------------------------------------------------------------------------
# ensure_feasibility slack
# ---------------------------------------------------------------------------

def test_unmet_demand_slack_added(ref_spec):
    spec, _ = ref_spec
    slacks = [g for g in spec['generators'] if g['carrier'] == 'unmet_demand']
    assert {s['bus'] for s in slacks} == {'north::electricity', 'south::electricity'}
    assert all(not s['p_nom_extendable'] for s in slacks)
    assert all(s['marginal_cost'] == t.UNMET_DEMAND_COST for s in slacks)


def test_no_slack_without_ensure_feasibility():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'dem',
            'essentials': {'parent': 'demand', 'carrier_in': 'electricity'},
            'constraints': {'resource': -1},
        }],
        'locations': [{'name': 'a', 'techs': {'dem': None}}],
    }
    spec, _ = t.translate_model(model)
    assert not any(g['carrier'] == 'unmet_demand' for g in spec['generators'])


# ---------------------------------------------------------------------------
# Unknowns are reported, not fatal
# ---------------------------------------------------------------------------

def test_unknown_parent_reported():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{'name': 'weird', 'essentials': {'parent': 'quantum'}}],
        'locations': [{'name': 'a', 'techs': {'weird': None}}],
    }
    spec, report = t.translate_model(model)
    assert spec['generators'] == [] and spec['links'] == []
    assert any("unknown parent 'quantum'" in r for r in report)


def test_undefined_tech_reported():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [],
        'locations': [{'name': 'a', 'techs': {'ghost': None}}],
    }
    _, report = t.translate_model(model)
    assert any("'ghost' not defined" in r for r in report)


# ---------------------------------------------------------------------------
# Per-location overrides
# ---------------------------------------------------------------------------

def test_location_constraint_override():
    model = {
        'modelConfig': {'startDate': '2024-01-01', 'endDate': '2024-01-01'},
        'technologies': [{
            'name': 'pv',
            'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
            'constraints': {'energy_cap_max': 2000},
        }],
        'locations': [
            {'name': 'a', 'techs': {'pv': {'constraints': {'energy_cap_max': 50}}}},
            {'name': 'b', 'techs': {'pv': None}},
        ],
    }
    spec, _ = t.translate_model(model)
    caps = {g['name']: g['p_nom_max'] for g in spec['generators']}
    assert caps['a::pv'] == 50
    assert caps['b::pv'] == 2000


# ---------------------------------------------------------------------------
# Real network construction (pypsa venv only)
# ---------------------------------------------------------------------------

@needs_pypsa
def test_roundtrip_reference_model(ref_model):
    """export → import → the internal model is equivalent modulo documented losses."""
    spec1, _ = t.translate_model(ref_model)
    n = t.build_network(spec1)
    model2, report = t.network_to_internal(n)

    techs = {td['name']: td for td in model2['technologies']}

    # supply tech survives with caps and efficiency
    solar = techs['solar_pv']
    assert solar['essentials']['parent'] == 'supply'
    assert solar['essentials']['carrier_out'] == 'electricity'
    assert solar['constraints']['energy_cap_max'] == 2000

    # storage tech reassembled from Store + links
    battery = techs['battery']
    assert battery['essentials']['parent'] == 'storage'
    assert battery['constraints']['storage_cap_max'] == 5000
    assert battery['constraints']['energy_cap_max'] == 1000
    assert battery['constraints']['energy_eff'] == 0.95
    assert battery['constraints']['storage_loss'] == 0.01

    # demand tech + per-location profile
    assert techs['power_demand']['essentials']['parent'] == 'demand'
    locs = {l['name']: l for l in model2['locations']}
    assert set(locs) == {'north', 'south'}
    north_profile = locs['north']['demandProfile']['timeseries']
    assert len(north_profile) == 168
    expected = ref_model['locations'][0]['demandProfile']['timeseries']
    assert north_profile[:24] == pytest.approx(expected)

    # transmission link pair collapsed back to one bidirectional link
    assert model2['links'] == [{'from': 'north', 'to': 'south', 'tech': 'grid_link'}]
    assert techs['grid_link']['essentials']['parent'] == 'transmission'
    assert techs['grid_link']['constraints']['energy_cap_max'] == 3000
    assert techs['grid_link']['constraints']['energy_eff'] == 0.97

    # coordinates survive
    assert locs['north']['latitude'] == 52.0 and locs['north']['longitude'] == 10.0

    # ensure_feasibility slack recognised, not imported as a tech
    assert model2['modelConfig']['ensureFeasibility'] is True
    assert 'unmet_demand' not in techs

    # date range survives
    assert model2['modelConfig']['startDate'] == '2005-01-01'
    assert model2['modelConfig']['endDate'] == '2005-01-07'

    # cost round-trip: re-exporting the imported model reproduces capital costs
    spec2, _ = t.translate_model(model2)
    cap1 = {g['name']: g['capital_cost'] for g in spec1['generators'] if g['carrier'] != 'unmet_demand'}
    cap2 = {g['name']: g['capital_cost'] for g in spec2['generators'] if g['carrier'] != 'unmet_demand'}
    for name, v in cap1.items():
        assert cap2[name] == pytest.approx(v, rel=1e-4), name

    # loss documented
    assert any('annual-cost equivalents' in r for r in report)


@needs_pypsa
def test_import_foreign_network():
    """A hand-built network with generic names and a StorageUnit imports best-effort."""
    import pandas as pd
    import pypsa

    n = pypsa.Network()
    n.set_snapshots(pd.date_range('2024-01-01', periods=48, freq='h'))
    n.add('Bus', 'DE', carrier='AC', x=10.0, y=51.0)
    n.add('Bus', 'FR', carrier='AC', x=2.0, y=47.0)
    n.add('Generator', 'de_wind', bus='DE', carrier='wind',
          p_nom_extendable=True, p_nom_max=500, capital_cost=100,
          p_max_pu=pd.Series([0.3, 0.7] * 24, index=n.snapshots))
    n.add('Load', 'de_load', bus='DE', p_set=pd.Series(80.0, index=n.snapshots))
    n.add('StorageUnit', 'fr_hydro', bus='FR', carrier='hydro',
          p_nom=200, max_hours=6, efficiency_store=0.9, efficiency_dispatch=0.9)
    n.add('Link', 'interconnect', bus0='DE', bus1='FR',
          p_nom_extendable=True, p_nom_max=1000, efficiency=0.95)

    model, report = t.network_to_internal(n)
    techs = {td['name']: td for td in model['technologies']}

    assert techs['wind']['essentials']['parent'] == 'supply'
    assert techs['wind']['essentials']['carrier_out'] == 'electricity'  # AC → electricity
    assert techs['wind']['constraints']['energy_cap_max'] == 500
    assert techs['wind']['constraints']['resource'].startswith('file=')  # varying series
    assert len(model['timeSeries']) == 1

    assert techs['hydro']['essentials']['parent'] == 'storage'
    assert techs['hydro']['constraints']['storage_cap_max'] == 200 * 6

    assert model['links'] == [{'from': 'de', 'to': 'fr', 'tech': 'transmission_link'}]
    assert any('single directed link' in r for r in report)

    locs = {l['name']: l for l in model['locations']}
    assert locs['de']['demandProfile']['timeseries'] == [80.0] * 48


@needs_pypsa
def test_build_network_reference_model(ref_spec):
    spec, _ = ref_spec
    n = t.build_network(spec)
    assert len(n.snapshots) == 168
    assert 'north::solar_pv' in n.generators.index
    assert 'north::power_demand' in n.loads.index
    assert 'north::battery' in n.stores.index
    assert 'north::grid_link:south' in n.links.index
    assert n.generators.loc['north::solar_pv', 'p_nom_max'] == 2000
    assert bool(n.generators.loc['north::solar_pv', 'p_nom_extendable'])
    # consistency check must not raise
    n.consistency_check()
