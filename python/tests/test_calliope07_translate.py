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


def test_link_capacity_becomes_flow_cap_max():
    warnings = []
    out = t.build_transmission_techs_07(
        [{'from': 'A', 'to': 'B', 'distance': 50, 'capacity': 2400, 'tech': 'ac_transmission'}],
        {}, {}, warnings,
    )
    entry = out['ac_transmission_a_b']
    assert entry['link_from'] == 'a' and entry['link_to'] == 'b'
    assert entry['distance'] == 50.0
    assert entry['flow_cap_max'] == 2400.0


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
    t.translate_constraints({'energy_ramping_cost': 1}, 'supply', warnings, 'x')
    assert any('energy_ramping_cost' in w for w in warnings)


def test_resource_unit_energy_per_cap_becomes_source_unit_per_cap():
    warnings = []
    out = t.translate_constraints({'resource_unit': 'energy_per_cap'}, 'supply', warnings)
    assert out == {'source_unit': 'per_cap'}
    assert warnings == []


def test_resource_unit_energy_becomes_source_unit_absolute():
    out = t.translate_constraints({'resource_unit': 'energy'}, 'supply_plus', [])
    assert out == {'source_unit': 'absolute'}


def test_resource_unit_energy_per_area_becomes_per_area():
    out = t.translate_constraints({'resource_unit': 'energy_per_area'}, 'supply', [])
    assert out == {'source_unit': 'per_area'}


def test_demand_resource_unit_becomes_sink_unit():
    out = t.translate_constraints({'resource_unit': 'energy_per_cap'}, 'demand', [])
    assert out == {'sink_unit': 'per_cap'}


def test_storage_energy_eff_applies_to_charge_and_discharge():
    # 0.6 storage applies energy_eff on both carrier_con and carrier_prod
    out = t.translate_constraints({'energy_eff': 0.95}, 'storage', [])
    assert out == {'flow_out_eff': 0.95, 'flow_in_eff': 0.95}


def test_storage_explicit_flow_in_eff_wins_over_energy_eff():
    out = t.translate_constraints({'flow_in_eff': 0.9, 'energy_eff': 0.95}, 'storage', [])
    assert out == {'flow_out_eff': 0.95, 'flow_in_eff': 0.9}


def test_non_storage_energy_eff_is_outflow_only():
    assert t.translate_constraints({'energy_eff': 0.55}, 'conversion', []) == {'flow_out_eff': 0.55}
    assert t.translate_constraints({'energy_eff': 0.9}, 'supply_plus', []) == {'flow_out_eff': 0.9}


def test_unknown_resource_unit_value_warns_and_drops():
    warnings = []
    out = t.translate_constraints({'resource_unit': 'bogus'}, 'supply', warnings, 'pv')
    assert out == {}
    assert any('resource_unit' in w and 'bogus' in w for w in warnings)


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


def test_raw07_cost_class_emitted_verbatim():
    """Carrier/multi-indexed 0.7 costs preserved on import (__raw07__) must be
    re-emitted unchanged, not dropped or re-wrapped."""
    warnings = []
    raw = {'cost_flow_cap': {'data': 1000, 'index': [['monetary', 'heat']],
                             'dims': ['costs', 'carriers']}}
    out = t.translate_costs({'__raw07__': raw}, warnings, 'heat_pump')
    assert out == raw
    assert warnings == []


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


def test_nodes_mixed_coords_dropped_for_calliope07():
    # Calliope 0.7 rejects a mix of coordinate / no-coordinate nodes
    # ("Must define node latitude and longitude for _all_ nodes or _no_ nodes").
    # When some nodes lack lat/lon, coordinates must be dropped for *all* nodes.
    warnings = []
    nodes = t.build_nodes_07(
        [{'name': 'A', 'latitude': 52.5, 'longitude': 13.4},
         {'name': 'B'}],  # no coordinates
        {}, [], warnings)
    assert 'latitude' not in nodes['a'] and 'longitude' not in nodes['a']
    assert 'latitude' not in nodes['b'] and 'longitude' not in nodes['b']
    assert any('coordinates dropped' in w for w in warnings)


def test_nodes_all_coords_emitted_when_every_node_has_them():
    warnings = []
    nodes = t.build_nodes_07(
        [{'name': 'A', 'latitude': 1.0, 'longitude': 2.0},
         {'name': 'B', 'lat': 3.0, 'lng': 4.0}],
        {}, [], warnings)
    assert nodes['a']['latitude'] == 1.0 and nodes['a']['longitude'] == 2.0
    assert nodes['b']['latitude'] == 3.0 and nodes['b']['longitude'] == 4.0
    assert warnings == []


def test_nodes_zero_coordinate_is_valid():
    # A node at the equator / prime meridian (0.0) must not be treated as missing.
    warnings = []
    nodes = t.build_nodes_07(
        [{'name': 'A', 'latitude': 0.0, 'longitude': 0.0}],
        {}, [], warnings)
    assert nodes['a']['latitude'] == 0.0 and nodes['a']['longitude'] == 0.0
    assert not any('coordinates dropped' in w for w in warnings)


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


def test_override_comma_separated_locations_expand_to_each_node():
    # Calliope 0.6 shorthand: one override key naming several locations applies
    # to each. Must expand to separate 0.7 nodes (that already exist in the base
    # with coordinates), not a single phantom "arica_putre_camarones" node.
    out = t.translate_override_07(
        {'locations': {'Arica, Putre, Camarones': {'techs': {'battery': None}}}},
        {'battery': 'storage'}, [], 'short_term_storage')
    assert set(out['nodes']) == {'arica', 'putre', 'camarones'}
    assert 'arica_putre_camarones' not in out['nodes']
    for nid in ('arica', 'putre', 'camarones'):
        assert 'battery' in out['nodes'][nid]['techs']


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


# ---------------------------------------------------------------------------
# Conversion techs: capacity/cost params indexed on the output carrier
# (0.7 flow_cap is per carrier; 0.6 energy_cap is the output side only)
# ---------------------------------------------------------------------------

_CCGT = {'name': 'ccgt',
         'essentials': {'parent': 'conversion', 'carrier_in': 'gas', 'carrier_out': 'electricity'},
         'constraints': {'energy_cap_max': 700, 'energy_eff': 0.55},
         'costs': {'monetary': {'energy_cap': 800, 'om_annual': 15, 'om_prod': 0.004}}}


def test_conversion_capacity_and_costs_indexed_on_carrier_out():
    out = t.translate_tech(_CCGT, [])
    assert out['flow_cap_max'] == {'data': 700, 'index': 'electricity', 'dims': 'carriers'}
    assert out['flow_out_eff'] == 0.55
    assert out['cost_flow_cap'] == {'data': 800, 'index': [['monetary', 'electricity']],
                                    'dims': ['costs', 'carriers']}
    assert out['cost_om_annual'] == {'data': 15, 'index': [['monetary', 'electricity']],
                                     'dims': ['costs', 'carriers']}
    assert out['cost_flow_out'] == {'data': 0.004, 'index': 'monetary', 'dims': 'costs'}


def test_conversion_equals_and_per_unit_indexed():
    out = t.translate_constraints({'energy_cap_equals': 85, 'energy_cap_per_unit': 5},
                                  'conversion', [], carrier='electricity')
    idx = lambda v: {'data': v, 'index': 'electricity', 'dims': 'carriers'}
    assert out == {'flow_cap_min': idx(85), 'flow_cap_max': idx(85), 'flow_cap_per_unit': idx(5)}


def test_conversion_plus_uses_primary_carrier_out_else_first():
    ess = {'parent': 'conversion_plus', 'carrier_in': 'gas',
           'carrier_out': ['electricity', 'heat'], 'primary_carrier_out': 'heat'}
    assert t.output_carrier({'essentials': ess}) == 'heat'
    ess2 = {k: v for k, v in ess.items() if k != 'primary_carrier_out'}
    assert t.output_carrier({'essentials': ess2}) == 'electricity'
    out = t.translate_tech({'name': 'chp', 'essentials': ess,
                            'constraints': {'energy_cap_max': 10}}, [])
    assert out['flow_cap_max'] == {'data': 10, 'index': 'heat', 'dims': 'carriers'}


def test_conversion_without_resolvable_carrier_warns_unindexed():
    warnings = []
    out = t.translate_constraints({'energy_cap_max': 10}, 'conversion', warnings, 'cx')
    assert out == {'flow_cap_max': 10}
    assert any('cx' in w and 'carrier' in w for w in warnings)


def test_non_conversion_params_stay_unindexed():
    out = t.translate_tech({'name': 'pv', 'essentials': {'parent': 'supply', 'carrier_out': 'electricity'},
                            'constraints': {'energy_cap_max': 5},
                            'costs': {'monetary': {'energy_cap': 600}}}, [])
    assert out['flow_cap_max'] == 5
    assert out['cost_flow_cap'] == {'data': 600, 'index': 'monetary', 'dims': 'costs'}


def test_node_override_on_conversion_indexed():
    nodes = t.build_nodes_07(
        [{'name': 'S', 'techs': {'ccgt': {'constraints': {'energy_cap_max': 300}}}}],
        {}, [_CCGT], [])
    assert nodes['s']['techs']['ccgt'] == {
        'flow_cap_max': {'data': 300, 'index': 'electricity', 'dims': 'carriers'}}


def test_scenario_override_on_conversion_indexed():
    out = t.translate_override_07(
        {'techs.ccgt.constraints.energy_cap_max': 900,
         'techs.ccgt.costs.monetary.energy_cap': 700,
         'locations': {'S': {'techs': {'ccgt': {'constraints': {'energy_cap_max': 50}}}}}},
        {'ccgt': 'conversion'}, [], 'x', carrier_by_tid={'ccgt': 'electricity'})
    assert out['techs']['ccgt']['flow_cap_max'] == {
        'data': 900, 'index': 'electricity', 'dims': 'carriers'}
    assert out['techs']['ccgt']['cost_flow_cap']['index'] == [['monetary', 'electricity']]
    assert out['nodes']['s']['techs']['ccgt']['flow_cap_max']['index'] == 'electricity'


def test_conversion_systemwide_caps_indexed():
    out = t.translate_constraints({'energy_cap_max_systemwide': 100, 'energy_cap_min_systemwide': 10},
                                  'conversion', [], carrier='electricity')
    assert out == {
        'flow_cap_max_systemwide': {'data': 100, 'index': 'electricity', 'dims': 'carriers'},
        'flow_cap_min_systemwide': {'data': 10, 'index': 'electricity', 'dims': 'carriers'}}


def test_already_carrier_indexed_values_left_untouched():
    pre = {'data': 5, 'index': 'heat', 'dims': 'carriers'}
    out = t.translate_constraints({'energy_cap_max': pre}, 'conversion', [], carrier='electricity')
    assert out == {'flow_cap_max': pre}
    raw = {'data': 9, 'index': [['monetary', 'heat']], 'dims': ['costs', 'carriers']}
    out = t.translate_costs({'__raw07__': {'cost_flow_cap': raw}}, [], 'x', 'conversion', 'electricity')
    assert out == {'cost_flow_cap': raw}


def test_cost_with_non_string_index_not_reindexed():
    multi = {'data': [1, 2], 'index': ['monetary', 'co2'], 'dims': 'costs'}
    out = t.translate_costs({'__raw07__': {'cost_om_annual': multi}}, [], 'x', 'conversion', 'electricity')
    assert out == {'cost_om_annual': multi}
