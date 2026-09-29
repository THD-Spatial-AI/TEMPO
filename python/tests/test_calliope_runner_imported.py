"""
Unit tests for imported_model_run_extras (calliope_runner) — carries the model-level
constraints of an imported Calliope 0.6 YAML (group_constraints, reserve_margin,
objective cost classes) into the generated run, with ids normalised the way the
runner writes techs (_safe_id) and locations (_safe_id().lower()).

    python -m pytest python/tests/test_calliope_runner_imported.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from calliope_runner import imported_model_run_extras


ITALY_META = {
    'group_constraints': {
        'systemwide_max_slacked_cost': {'cost_max': {'monetary': 1e15}},
        'vres_min_prod_share': {
            'techs': ['wind', 'oil_&_other'],
            'locs': ['NORD', 'R1'],
            'supply_share_min': {'electricity': 1},
        },
    },
    'reserve_margin': {'electricity': 0.1},
    'objective_cost_class': {'monetary': 1, 'co2': 0, 'nos_score': 0, 'excl_score': 0},
}


def test_group_constraints_ids_normalised():
    gc = imported_model_run_extras(ITALY_META)['group_constraints']
    assert gc['vres_min_prod_share'] == {
        'techs': ['wind', 'oil_other'],
        'locs': ['nord', 'r1'],
        'carrier_prod_share_min': {'electricity': 1},
    }
    assert gc['systemwide_max_slacked_cost'] == {'cost_max': {'monetary': 1e15}}


def test_reserve_margin_and_cost_class_pass_through():
    extras = imported_model_run_extras(ITALY_META)
    assert extras['reserve_margin'] == {'electricity': 0.1}
    assert extras['objective_cost_class'] == {'monetary': 1, 'co2': 0, 'nos_score': 0, 'excl_score': 0}


def test_empty_meta_gives_no_extras():
    assert imported_model_run_extras({}) == {}
    assert imported_model_run_extras(None) == {}


def test_input_not_mutated():
    imported_model_run_extras(ITALY_META)
    assert ITALY_META['group_constraints']['vres_min_prod_share']['techs'] == ['wind', 'oil_&_other']


def test_legacy_supply_share_renamed():
    # Calliope <0.6.5 `supply_share_*` is `carrier_prod_share_*` in 0.6.8, which
    # otherwise silently ignores the constraint ("Unrecognised group constraint").
    gc = imported_model_run_extras(ITALY_META)['group_constraints']['vres_min_prod_share']
    assert 'supply_share_min' not in gc
    assert gc['carrier_prod_share_min'] == {'electricity': 1}
