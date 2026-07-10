"""
Unit tests for the 0.6 -> 0.7 translation layer (calliope07_translate).

Runs on any Python >= 3.9 with pytest only — no calliope, no solver:
    python -m pytest python/tests/ -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope07_translate as t  # noqa: E402


# ---------------------------------------------------------------------------
# Constraint renames
# ---------------------------------------------------------------------------

def test_basic_renames():
    warnings = []
    out = t.translate_constraints(
        {'energy_cap_max': 500, 'energy_eff': 0.9, 'lifetime': 25},
        'supply', warnings)
    assert out == {'flow_cap_max': 500, 'flow_out_eff': 0.9, 'lifetime': 25}
    assert warnings == []


def test_equals_expansion():
    warnings = []
    out = t.translate_constraints({'energy_cap_equals': 1400}, 'supply', warnings)
    assert out == {'flow_cap_min': 1400, 'flow_cap_max': 1400}
    out = t.translate_constraints({'storage_cap_equals': 10}, 'storage', warnings)
    assert out == {'storage_cap_min': 10, 'storage_cap_max': 10}
    assert warnings == []


def test_inf_string_conversion():
    out = t.translate_constraints({'energy_cap_max': '.inf'}, 'supply', [])
    assert out['flow_cap_max'] == float('inf')
    # JS sanitized-infinity sentinel
    out = t.translate_constraints({'energy_cap_max': 1e15}, 'supply', [])
    assert out['flow_cap_max'] == float('inf')


def test_unknown_param_warns_not_silently_dropped():
    warnings = []
    out = t.translate_constraints({'not_a_real_param': 1}, 'supply', warnings, 'mytech')
    assert out == {}
    assert len(warnings) == 1
    assert 'not_a_real_param' in warnings[0]
    assert 'mytech' in warnings[0]


def test_dropped_param_warns():
    warnings = []
    t.translate_constraints({'resource_unit': 'energy'}, 'supply', warnings, 'x')
    assert any('resource_unit' in w for w in warnings)


# ---------------------------------------------------------------------------
# Resource handling (context-dependent, demand sign flip)
# ---------------------------------------------------------------------------

def test_demand_resource_becomes_positive_sink_use_equals():
    warnings = []
    out = t.translate_constraints(
        {'resource': -120.5, 'force_resource': True}, 'demand', warnings)
    assert out == {'sink_use_equals': 120.5}
    assert warnings == []


def test_demand_resource_without_force_is_still_forced():
    # 0.6 demand semantics: demand is a fixed sink; TEMPO always treats it as equals
    out = t.translate_constraints({'resource': -50}, 'demand', [])
    assert out == {'sink_use_equals': 50}


def test_supply_scalar_resource():
    out = t.translate_constraints({'resource': 100}, 'supply', [])
    assert out == {'source_use_max': 100}
    out = t.translate_constraints({'resource': 100, 'force_resource': True}, 'supply', [])
    assert out == {'source_use_equals': 100}


def test_infinite_supply_resource_omitted():
    # inf resource = unconstrained (the 0.7 default) — no param emitted
    out = t.translate_constraints({'resource': float('inf')}, 'supply', [])
    assert out == {}


def test_file_resource_passed_through_for_data_table():
    out = t.translate_constraints(
        {'resource': 'file=demand.csv:region1', 'force_resource': True}, 'demand', [])
    assert out == {'__resource_file__': {'ref': 'file=demand.csv:region1',
                                         'param': 'sink_use_equals'}}


# ---------------------------------------------------------------------------
# Costs
# ---------------------------------------------------------------------------

def test_cost_wrapping():
    warnings = []
    out = t.translate_costs(
        {'monetary': {'energy_cap': 1000, 'interest_rate': 0.05, 'om_prod': 0.01}},
        warnings)
    assert out == {
        'cost_flow_cap':      {'data': 1000, 'index': 'monetary', 'dims': 'costs'},
        'cost_interest_rate': {'data': 0.05, 'index': 'monetary', 'dims': 'costs'},
        'cost_flow_out':      {'data': 0.01, 'index': 'monetary', 'dims': 'costs'},
    }
    assert warnings == []


def test_non_monetary_cost_class_warns():
    warnings = []
    out = t.translate_costs({'spores_score': {'energy_cap': 0}}, warnings, 'x')
    assert out == {}
    assert any('spores_score' in w for w in warnings)


# ---------------------------------------------------------------------------
# Tech translation (base_tech, carriers, supply_plus)
# ---------------------------------------------------------------------------

def test_supply_tech():
    out = t.translate_tech({
        'name': 'Solar PV',
        'essentials': {'parent': 'supply', 'carrier_out': 'electricity', 'color': '#fc0'},
        'constraints': {'energy_cap_max': 500},
        'costs': {'monetary': {'energy_cap': 900}},
    }, [])
    assert out['base_tech'] == 'supply'
    assert out['carrier_out'] == 'electricity'
    assert 'carrier_in' not in out
    assert out['flow_cap_max'] == 500
    assert out['cost_flow_cap'] == {'data': 900, 'index': 'monetary', 'dims': 'costs'}
    assert out['color'] == '#fc0'


def test_supply_plus_becomes_supply_with_storage():
    out = t.translate_tech({
        'name': 'csp',
        'essentials': {'parent': 'supply_plus', 'carrier_out': 'electricity'},
    }, [])
    assert out['base_tech'] == 'supply'
    assert out['include_storage'] is True


def test_storage_gets_both_carriers():
    out = t.translate_tech({
        'name': 'battery',
        'essentials': {'parent': 'storage', 'carrier': 'electricity'},
    }, [])
    assert out['base_tech'] == 'storage'
    assert out['carrier_in'] == 'electricity'
    assert out['carrier_out'] == 'electricity'


def test_demand_tech_gets_carrier_in_only():
    out = t.translate_tech({
        'name': 'power_demand',
        'essentials': {'parent': 'demand', 'carrier': 'electricity'},
    }, [])
    assert out['base_tech'] == 'demand'
    assert out['carrier_in'] == 'electricity'
    assert 'carrier_out' not in out


def test_unmet_demand_skipped():
    warnings = []
    out = t.translate_tech({'name': 'unmet', 'essentials': {'parent': 'unmet_demand'}}, warnings)
    assert out is None
    assert len(warnings) == 1


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

def test_nodes_lat_lon_and_tech_assignment():
    warnings = []
    techs = [{'name': 'Solar PV', 'essentials': {'parent': 'supply'}}]
    nodes = t.build_nodes_07(
        [{'name': 'Berlin', 'latitude': 52.5, 'longitude': 13.4,
          'techs': {'Solar PV': None}}],
        {}, techs, warnings)
    assert nodes == {'berlin': {'latitude': 52.5, 'longitude': 13.4,
                                'techs': {'Solar_PV': None}}}
    assert warnings == []


def test_node_per_loc_override_translated():
    nodes = t.build_nodes_07(
        [{'name': 'Z2', 'lat': 1, 'lng': 2,
          'techs': {'imports': {'constraints': {'energy_cap_equals': 1400}}}}],
        {}, [{'name': 'imports', 'essentials': {'parent': 'supply'}}], [])
    assert nodes['z2']['techs']['imports'] == {'flow_cap_min': 1400, 'flow_cap_max': 1400}


def test_hub_labels_skipped_silently():
    warnings = []
    nodes = t.build_nodes_07(
        [{'name': 'HubNode', 'lat': 0, 'lng': 0, 'techs': {'substation': None}}],
        {}, [], warnings)
    # Hub label excluded from resolved techs; node still gets techs: {} (required by Calliope 0.7)
    assert nodes['hubnode']['techs'] == {}
    assert warnings == []


# ---------------------------------------------------------------------------
# Links → transmission techs
# ---------------------------------------------------------------------------

def test_link_becomes_transmission_tech():
    warnings = []
    techs_07 = {'hvac': {'base_tech': 'transmission', 'carrier_in': 'electricity',
                         'carrier_out': 'electricity', 'flow_out_eff': 0.98}}
    out = t.build_transmission_techs_07(
        [{'from': 'A', 'to': 'B', 'tech': 'hvac', 'distance': 250}],
        techs_07, {}, warnings)
    assert list(out.keys()) == ['hvac_a_b']
    entry = out['hvac_a_b']
    assert entry['link_from'] == 'a'
    assert entry['link_to'] == 'b'
    assert entry['distance'] == 250.0
    assert entry['base_tech'] == 'transmission'
    assert entry['flow_out_eff'] == 0.98
    assert warnings == []


def test_link_with_undefined_tech_autodefines():
    warnings = []
    techs_07 = {}
    out = t.build_transmission_techs_07(
        [{'from': 'A', 'to': 'B'}], techs_07, {}, warnings)
    assert 'ac_transmission' in techs_07
    assert techs_07['ac_transmission']['base_tech'] == 'transmission'
    assert 'ac_transmission_a_b' in out
    assert any('auto-defined' in w for w in warnings)


def test_link_tech_digit_leading_name_gets_prefix():
    # '110_kv' starts with a digit → safe_id adds 't' prefix
    # Calliope 0.7 pattern ^[^_^\d][\w]*$ forbids leading digits
    warnings = []
    techs_07 = {}
    out = t.build_transmission_techs_07(
        [{'from': 'north', 'to': 'south', 'tech': '110_kv'}],
        techs_07, {}, warnings)
    assert 't110_kv_north_south' in out
    assert 't110_kv' in techs_07


def test_link_tech_hyphen_in_name_becomes_underscore():
    warnings = []
    techs_07 = {}
    out = t.build_transmission_techs_07(
        [{'from': 'A', 'to': 'B', 'tech': '13-8_kv'}],
        techs_07, {}, warnings)
    # hyphens → underscores, leading digit → 't' prefix
    assert 't13_8_kv_a_b' in out


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def test_config_structure():
    cfg = t.build_config_07('My Model', 'plan', '2005-01-01', '2005-01-07',
                            'highs', {'mip_rel_gap': 1e-3}, True)
    assert cfg['init']['name'] == 'My Model'
    assert cfg['init']['mode'] == 'base'          # 0.6 'plan' → 0.7 'base'
    assert cfg['init']['subset']['timesteps'] == [
        '2005-01-01 00:00:00', '2005-01-07 23:00:00']
    assert cfg['build'] == {'backend': 'pyomo', 'ensure_feasibility': True}
    assert cfg['solve']['solver'] == 'highs'  # highspy; runner shim handles solver_io=None
    assert cfg['solve']['solver_options'] == {'mip_rel_gap': 1e-3}


# ---------------------------------------------------------------------------
# safe_id — Calliope 0.7 strict naming rules
# ---------------------------------------------------------------------------

def test_safe_id_hyphens_become_underscores():
    # Calliope 0.7 pattern ^[^_^\d][\w]*$ — \w does not include hyphens
    assert t.safe_id('hydro-ror') == 'hydro_ror'
    assert t.safe_id('mini-hydro-ror') == 'mini_hydro_ror'
    assert t.safe_id('reservoir-hydraulics') == 'reservoir_hydraulics'
    assert t.safe_id('n_diesel-quani-arica') == 'n_diesel_quani_arica'
    assert t.safe_id('13-8_kv_line') == 't13_8_kv_line'


def test_safe_id_digit_leading_gets_prefix():
    assert t.safe_id('110_kv_line') == 't110_kv_line'
    assert t.safe_id('66_kv_a_b') == 't66_kv_a_b'
    assert t.safe_id('220_kv_node') == 't220_kv_node'


# ---------------------------------------------------------------------------
# build_nodes_07 — pure-junction nodes must still emit techs: {}
# ---------------------------------------------------------------------------

def test_node_without_techs_gets_empty_techs_dict():
    # Calliope 0.7 Pydantic schema: nodes[*].techs is required (not optional)
    nodes = t.build_nodes_07(
        [{'name': 'junction_a', 'latitude': -18.0, 'longitude': -70.0}],
        {}, [], [])
    assert 'techs' in nodes['junction_a']
    assert nodes['junction_a']['techs'] == {}


def test_solver_normalization():
    # HiGHS variants → 'highs'
    assert t.normalize_solver_07('highs') == 'highs'
    assert t.normalize_solver_07('appsi_highs') == 'highs'
    assert t.normalize_solver_07('highs_direct') == 'highs'
    # CBC and GLPK pass through
    assert t.normalize_solver_07('cbc') == 'cbc'
    assert t.normalize_solver_07('glpk') == 'glpk'
    # Commercial / unavailable solvers → 'highs' (TEMPO 0.7 service has no gurobi/cplex)
    assert t.normalize_solver_07('gurobi') == 'highs'
    assert t.normalize_solver_07('gurobi_direct') == 'highs'
    assert t.normalize_solver_07('cplex') == 'highs'
    # Empty / None → 'highs'
    assert t.normalize_solver_07('') == 'highs'
    assert t.normalize_solver_07(None) == 'highs'


# ---------------------------------------------------------------------------
# Overrides
# ---------------------------------------------------------------------------

def test_override_dot_notation_and_renames():
    warnings = []
    out = t.translate_override_07(
        {'techs.solar.constraints.energy_cap_max': 900,
         'techs.solar.costs.monetary.energy_cap': 750},
        {'solar': 'supply'}, warnings, 'cheap_solar')
    assert out['techs']['solar']['flow_cap_max'] == 900
    assert out['techs']['solar']['cost_flow_cap'] == {
        'data': 750, 'index': 'monetary', 'dims': 'costs'}
    assert warnings == []


def test_override_locations_become_nodes():
    out = t.translate_override_07(
        {'locations': {'Berlin': {'techs': {'wind': {'constraints': {'energy_cap_equals': 500}}}}}},
        {'wind': 'supply'}, [], 'x')
    assert out['nodes']['berlin']['techs']['wind'] == {
        'flow_cap_min': 500, 'flow_cap_max': 500}


def test_override_run_and_model_config():
    out = t.translate_override_07(
        {'run': {'solver': 'highs', 'ensure_feasibility': False},
         'model': {'subset_time': ['2005-02-01', '2005-02-07']}},
        {}, [], 'x')
    assert out['config']['solve']['solver'] == 'highs'
    assert out['config']['build']['ensure_feasibility'] is False
    assert out['config']['init']['subset']['timesteps'] == [
        '2005-02-01 00:00:00', '2005-02-07 23:00:00']


def test_override_unsupported_keys_warn():
    warnings = []
    out = t.translate_override_07(
        {'group_constraints': {'x': {}}}, {}, warnings, 'g')
    assert out == {}
    assert any('group_constraints' in w for w in warnings)


# ---------------------------------------------------------------------------
# Mapping-table hygiene
# ---------------------------------------------------------------------------

def test_mapping_tables_are_disjoint():
    """A 0.6 key must have exactly one translation rule."""
    keys = set(t.TECH_PARAMS) & set(t.EQUALS_PARAMS)
    assert not keys, f"keys in both tech_params and equals_params: {keys}"
    keys = (set(t.TECH_PARAMS) | set(t.EQUALS_PARAMS)) & t.DROPPED_PARAMS
    assert not keys, f"keys both translated and dropped: {keys}"


def test_safe_id_matches_06_runner_semantics():
    assert t.safe_id('Solar PV') == 'Solar_PV'
    assert t.safe_id('a::b') == 'a_b'
    assert t.safe_id('x:y') == 'x_y'
    assert t.safe_id('  weird//name  ') == 'weird_name'
