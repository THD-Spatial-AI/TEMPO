"""
Unit tests for build_links_config (calliope_runner) — the per-link capacity
round-trip used by the zonal Study-Area builder.

Runs with pytest only; calliope_runner's module-level imports are stdlib, so
importing build_links_config needs no calliope install:
    python -m pytest python/tests/test_calliope_runner_links.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from calliope_runner import build_links_config


def test_capacity_becomes_energy_cap_max():
    links = [{'from': 'A', 'to': 'B', 'distance': 50, 'capacity': 2400, 'tech': 'ac_transmission'}]
    cfg = build_links_config(links)
    entry = cfg['a,b']['techs']['ac_transmission']
    assert entry['distance'] == 50.0
    assert entry['constraints']['energy_cap_max'] == 2400.0


def test_no_capacity_leaves_only_distance():
    cfg = build_links_config([{'from': 'A', 'to': 'B', 'distance': 12, 'tech': 'ac_transmission'}])
    entry = cfg['a,b']['techs']['ac_transmission']
    assert entry == {'distance': 12.0}


def test_zero_capacity_is_ignored():
    cfg = build_links_config([{'from': 'A', 'to': 'B', 'capacity': 0, 'tech': 'ac_transmission'}])
    # No distance, no positive capacity -> empty tech entry (None).
    assert cfg['a,b']['techs']['ac_transmission'] is None


def test_tech_defaults_to_ac_transmission():
    cfg = build_links_config([{'from': 'X', 'to': 'Y', 'capacity': 100}])
    assert 'ac_transmission' in cfg['x,y']['techs']
