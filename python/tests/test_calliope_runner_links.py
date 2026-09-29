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


def test_same_pair_links_merge_techs():
    # Calliope-Italy: one pair carries existing + expandable + gas transmission.
    cfg = build_links_config([
        {'from': 'NORD', 'to': 'CNOR', 'tech': 'inter_zonal', 'capacity': 1.3e6},
        {'from': 'NORD', 'to': 'CNOR', 'tech': 'inter_zonal_new', 'capacity': 5e6},
    ])
    assert set(cfg['nord,cnor']['techs']) == {'inter_zonal', 'inter_zonal_new'}


def test_imported_link_config_preserved_with_capacity_key():
    cfg = build_links_config([
        {'from': 'NORD', 'to': 'CNOR', 'tech': 'inter_zonal', 'capacity': 1.3e6,
         'capacityKey': 'energy_cap_equals',
         'linkConfig': {'constraints': {'energy_cap_equals': 1.3e6}}},
        {'from': 'NORD', 'to': 'CNOR', 'tech': 'inter_zonal_new', 'capacity': 4e6,
         'capacityKey': 'energy_cap_max',
         'linkConfig': {'constraints': {'energy_cap_max': 5e6},
                        'costs': {'monetary': {'energy_cap': 450}}}},
        {'from': 'NORD', 'to': 'CNOR', 'tech': 'gas_inter_zonal_transmission', 'capacity': 0,
         'linkConfig': None},
    ])
    techs = cfg['nord,cnor']['techs']
    assert techs['inter_zonal'] == {'constraints': {'energy_cap_equals': 1.3e6}}
    # UI capacity (e.g. edited by a Studio link op) wins, written to the original key
    assert techs['inter_zonal_new'] == {'constraints': {'energy_cap_max': 4e6},
                                        'costs': {'monetary': {'energy_cap': 450}}}
    assert techs['gas_inter_zonal_transmission'] is None
