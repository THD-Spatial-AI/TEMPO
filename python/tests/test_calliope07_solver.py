"""resolve_solver_07: HiGHS via CLI or highspy; CBC only when neither exists."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope07_translate as t  # noqa: E402


def test_highs_kept_with_highspy_and_no_cli():
    assert t.resolve_solver_07('highs', which=lambda n: None, has_highspy=lambda: True) == ('highs', None)


def test_highs_kept_with_cli():
    assert t.resolve_solver_07('highs', which=lambda n: '/usr/bin/highs', has_highspy=lambda: False) == ('highs', None)


def test_cbc_fallback_without_highspy_or_cli():
    solver, note = t.resolve_solver_07('highs', which=lambda n: None, has_highspy=lambda: False)
    assert solver == 'cbc' and 'CBC' in note


def test_cbc_and_glpk_pass_through():
    assert t.resolve_solver_07('cbc', which=lambda n: None, has_highspy=lambda: True) == ('cbc', None)
    assert t.resolve_solver_07('glpk', which=lambda n: None, has_highspy=lambda: True) == ('glpk', None)


def test_commercial_solver_maps_to_highs():
    assert t.resolve_solver_07('gurobi', which=lambda n: None, has_highspy=lambda: True)[0] == 'highs'
