"""resolve_solver_07: HiGHS needs a CLI binary on the 0.7 engine; fall back to CBC."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope07_translate as t  # noqa: E402


def test_highs_falls_back_to_cbc_without_binary():
    solver, note = t.resolve_solver_07('highs', which=lambda name: None)
    assert solver == 'cbc'
    assert 'CBC' in note


def test_highs_kept_when_binary_present():
    solver, note = t.resolve_solver_07('highs', which=lambda name: '/usr/bin/highs')
    assert (solver, note) == ('highs', None)


def test_cbc_and_glpk_pass_through():
    assert t.resolve_solver_07('cbc', which=lambda n: None) == ('cbc', None)
    assert t.resolve_solver_07('glpk', which=lambda n: None) == ('glpk', None)


def test_commercial_solver_maps_through_highs_then_cbc():
    assert t.resolve_solver_07('gurobi', which=lambda n: None)[0] == 'cbc'
