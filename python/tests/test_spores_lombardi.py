"""
Unit tests for spores_lombardi — the Lombardi et al. (2020) SPORES algorithm
(port of Calliope-Italy's spores_model_run.py / spores_utils.py). Pure functions;
no calliope install needed:
    python -m pytest python/tests/test_spores_lombardi.py -v
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from spores_lombardi import (
    expand_schedule, cap_loc_scores, add_scores, nos_score_updates,
    excl_score_updates, normalise_tech, loc_tech_matches,
)

TECHS_NEW = ['electrolysis', 'ccgt_syngas', 'methanation_dac', 'biogas_new', 'wind_new', 'wind_offshore',
             'pv_farm_new', 'pv_rooftop_new', 'phs_new', 'battery'] + \
            [f'inter_zonal_new:{r}' for r in ['FR', 'AT', 'CH', 'SI', 'GR', 'NORD', 'CNOR', 'CSUD', 'SUD', 'SARD', 'SICI']]
TECHS_EXCL = [t for t in TECHS_NEW if t not in ('electrolysis', 'ccgt_syngas', 'methanation_dac')]
EU = [f'inter_zonal_new:{r}' for r in ['FR', 'AT', 'CH', 'SI', 'GR']]
P2G = ['electrolysis', 'methanation_dac', 'ccgt_syngas']


def plan(explore, ppts, ppt_count):
    return {
        'algorithm': 'lombardi2020', 'slack': 0.1, 'scoredTechs': TECHS_NEW,
        'weights': {'excl': 10, 'nos': 1},
        'stages': [
            {'type': 'explore', 'count': explore},
            {'type': 'minimise', 'targets': [[t] for t in TECHS_EXCL], 'countEach': 3},
            {'type': 'minimise', 'targets': [EU, P2G], 'countEach': 3},
            {'type': 'minimise', 'targets': ppts, 'countEach': ppt_count},
        ],
    }


# ── schedule ────────────────────────────────────────────────────────────────

def test_script_defaults_give_121_spores():
    steps = expand_schedule(plan(10, [['biogas_new'], ['wind_offshore'], ['battery']], 17))
    assert len(steps) == 121
    assert [s['spore'] for s in steps] == list(range(1, 122))


def test_paper_config_gives_178_spores():
    steps = expand_schedule(plan(50, [['biogas_new'], ['wind_offshore'], ['battery'], P2G], 17))
    assert len(steps) == 178


def test_explore_steps_use_nos_only():
    steps = expand_schedule(plan(2, [], 0))
    assert steps[0] == {'spore': 1, 'stage': 'explore', 'target': None, 'iteration': 1,
                        'weights': {'monetary': 0, 'nos_score': 1, 'excl_score': 0}, 'reset_scores': False}


def test_minimise_first_run_is_pure_exclusion_then_nos_joins():
    steps = [s for s in expand_schedule(plan(0, [], 0)) if s['stage'] == 'minimise']
    first, second, third, next_target = steps[0], steps[1], steps[2], steps[3]
    assert first['target'] == ['biogas_new'] and first['reset_scores'] is True
    assert first['weights'] == {'monetary': 0, 'nos_score': 0, 'excl_score': 10}
    assert second['weights'] == {'monetary': 0, 'nos_score': 1, 'excl_score': 10}
    assert second['reset_scores'] is False and third['iteration'] == 3
    assert next_target['target'] == ['wind_new'] and next_target['reset_scores'] is True


# ── scores (Eq. 2: installed / maximum capacity) ─────────────────────────────

def test_scores_ratio_with_thresholds():
    caps = {'r1::wind_new': 50.0, 'r2::wind_new': 0.0005, 'r3::battery': 10.0, 'r4::pv_farm_new': 5.0}
    cap_max = {'r1::wind_new': 100.0, 'r2::wind_new': 1.0, 'r3::battery': math.inf}  # r4 has no max
    s = cap_loc_scores(caps, cap_max)
    assert s == {'r1::wind_new': 0.5, 'r2::wind_new': 0.0, 'r3::battery': 0.0, 'r4::pv_farm_new': 0.0}


def test_add_scores_accumulates():
    assert add_scores({'a': 0.5, 'b': 0.1}, {'a': 0.25}) == {'a': 0.75, 'b': 0.1}


# ── backend parameter updates ─────────────────────────────────────────────────

def test_tech_matching_handles_transmission_suffix_and_case():
    assert normalise_tech('inter_zonal_new:FR') == 'inter_zonal_new:fr'
    assert normalise_tech('oil_&_other') == 'oil_other'
    assert loc_tech_matches('r1::inter_zonal_new:fr', ['inter_zonal_new:fr'])
    assert not loc_tech_matches('fr::inter_zonal_new:r1', ['inter_zonal_new:fr'])
    assert loc_tech_matches('r1::wind_new', ['wind_new'])
    assert not loc_tech_matches('r1::wind_new_x', ['wind_new'])


def test_nos_updates_only_for_scored_loc_techs():
    scored = ['r1::wind_new', 'r2::wind_new']
    u = nos_score_updates({'r1::wind_new': 0.5}, scored)
    assert u == {('nos_score', 'r1::wind_new'): 0.5, ('nos_score', 'r2::wind_new'): 0.0}


def test_excl_updates_mark_targets_and_clear_other_scored():
    scored = ['r1::wind_new', 'r1::battery', 'fr::inter_zonal_new:r1', 'r1::inter_zonal_new:fr']
    u = excl_score_updates(['battery', 'inter_zonal_new:fr'], scored)
    assert u == {('excl_score', 'r1::wind_new'): 0, ('excl_score', 'r1::battery'): 1,
                 ('excl_score', 'fr::inter_zonal_new:r1'): 0, ('excl_score', 'r1::inter_zonal_new:fr'): 1}


def test_safe_update_falls_back_per_key():
    from spores_lombardi import safe_update

    class Backend:
        def __init__(self):
            self.applied = {}

        def update_param(self, name, d):
            for k in d:
                if k[1] == 'bad::key':
                    raise KeyError(k)
            self.applied.update(d)

    b = Backend()
    skipped = safe_update(b, 'cost_energy_cap', {('nos_score', 'r1::pv'): 1.0, ('nos_score', 'bad::key'): 2.0})
    assert b.applied == {('nos_score', 'r1::pv'): 1.0}
    assert skipped == [('nos_score', 'bad::key')]
