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
