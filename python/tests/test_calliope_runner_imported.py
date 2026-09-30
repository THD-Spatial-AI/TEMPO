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
    assert 'vres_min_prod_share' not in gc  # legacy share only → dropped (see below)
    gc = imported_model_run_extras({'group_constraints': {'g': {
        'techs': ['wind', 'oil_&_other'], 'locs': ['NORD', 'R1'], 'energy_cap_min': 5}}})['group_constraints']
    assert gc['g'] == {'techs': ['wind', 'oil_other'], 'locs': ['nord', 'r1'], 'energy_cap_min': 5}


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


def test_legacy_supply_share_dropped_not_renamed():
    # Calliope <0.6.5 `supply_share_*` shares are over supply techs only; 0.6.8's
    # `carrier_prod_share_*` also counts conversion output, so a renamed 100%
    # renewable share would forbid e.g. synthetic-gas turbines (Calliope-Italy's
    # P2G chain). 0.6.8 has no supply-only equivalent: drop it (as 0.6.8 itself
    # ignores the old key) instead of changing its meaning.
    gc = imported_model_run_extras(ITALY_META)['group_constraints']
    assert 'vres_min_prod_share' not in gc  # nothing left in the group
    assert gc['systemwide_max_slacked_cost'] == {'cost_max': {'monetary': 1e15}}
