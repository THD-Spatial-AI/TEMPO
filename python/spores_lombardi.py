"""
SPORES as implemented by Lombardi et al. (2020), Joule 4, 2185–2207 — a port of
Calliope-Italy's `spores_model_run.py` + `spores_utils.py` onto Calliope 0.6.8's
backend interface (`model.backend.update_param` / `model.backend.rerun`).

It differs from Calliope 0.6.8's native `run.mode: spores` in two ways the paper
depends on:
  * weights are the ratio installed / maximum capacity per loc::tech, accumulated
    across iterations (Eq. 2), not a flat integer score;
  * "minimise" stages explicitly minimise the capacity of one tech or tech group
    (Eq. 4) via a second cost class `excl_score`, weighted against `nos_score`.

The schedule is declarative (a `sporesPlan` emitted by the Scenario Studio):
    {'slack': 0.1, 'scoredTechs': [...], 'weights': {'excl': 10, 'nos': 1},
     'stages': [{'type': 'explore', 'count': 50},
                {'type': 'minimise', 'targets': [['battery'], [...]], 'countEach': 3}]}

Behaviour mirrors the original script, including its quirks:
  * explore: objective {monetary: 0, nos_score: 1}; scores accumulate after every run;
    the stage stops early once a run deploys no scored loc::tech (score all zero).
  * minimise, per target: nos scores reset to the cost-optimal scores; excl_score = 1
    on the target's loc::techs and 0 on every other scored loc::tech; the first run
    is pure exclusion (nos weight 0), later runs add the nos term; scores accumulate
    within the target.
The pure functions below are unit-tested without calliope; `run_lombardi_spores`
drives a built Calliope 0.6.8 model.
"""

import math
import re

SCORE_THRESHOLD = 1e-3  # spores_utils.cap_loc_score_potential: ratios below this count as 0


# ── ids ──────────────────────────────────────────────────────────────────────

def normalise_tech(tech):
    """Scored-tech id as the TEMPO runner writes it: base tech via _safe_id,
    transmission remote (after ':') lowercased like location ids."""
    base, _, remote = str(tech).partition(':')
    base = re.sub(r'_+', '_', re.sub(r'[^A-Za-z0-9_\-]', '_', base.strip())).strip('_')
    return f'{base}:{remote.strip().lower()}' if remote else base


def loc_tech_matches(loc_tech, techs):
    """Does 'loc::tech[:remote]' belong to one of `techs` (normalised ids)?"""
    _, _, tech = str(loc_tech).partition('::')
    return tech in techs


# ── schedule ─────────────────────────────────────────────────────────────────

def expand_schedule(plan):
    """One entry per SPORE (numbered from 1; SPORE 0 is the cost-optimal run)."""
    w = plan.get('weights') or {}
    w_excl, w_nos = w.get('excl', 10), w.get('nos', 1)
    steps, n = [], 0
    for stage in plan.get('stages') or []:
        if stage.get('type') == 'explore':
            for i in range(int(stage.get('count', 0))):
                n += 1
                steps.append({'spore': n, 'stage': 'explore', 'target': None, 'iteration': i + 1,
                              'weights': {'monetary': 0, 'nos_score': w_nos, 'excl_score': 0},
                              'reset_scores': False})
        elif stage.get('type') == 'minimise':
            for target in stage.get('targets') or []:
                for i in range(int(stage.get('countEach', 0))):
                    n += 1
                    steps.append({'spore': n, 'stage': 'minimise', 'target': list(target),
                                  'iteration': i + 1,
                                  'weights': {'monetary': 0, 'nos_score': 0 if i == 0 else w_nos,
                                              'excl_score': w_excl},
                                  'reset_scores': i == 0})
    return steps


# ── scores ───────────────────────────────────────────────────────────────────

def cap_loc_scores(caps, cap_max):
    """Eq. 2 increment: energy_cap / energy_cap_max per loc::tech; below 1e-3,
    NaN, or without a finite max → 0 (as cap_loc_score_potential does)."""
    out = {}
    for lt, cap in caps.items():
        mx = cap_max.get(lt)
        try:
            ratio = float(cap) / float(mx)
        except (TypeError, ValueError, ZeroDivisionError):
            ratio = float('nan')
        out[lt] = 0.0 if (math.isnan(ratio) or ratio < SCORE_THRESHOLD) else ratio
    return out


def add_scores(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


# ── backend parameter updates ─────────────────────────────────────────────────

def nos_score_updates(scores, scored_loc_techs):
    return {('nos_score', lt): float(scores.get(lt, 0.0)) for lt in scored_loc_techs}


def excl_score_updates(target_techs, scored_loc_techs):
    targets = {normalise_tech(t) for t in target_techs}
    return {('excl_score', lt): (1 if loc_tech_matches(lt, targets) else 0) for lt in scored_loc_techs}


def safe_update(backend, param, updates):
    """backend.update_param, falling back to one key at a time and skipping keys the
    backend rejects (the original script wraps every single update in try/except).
    Returns the skipped keys."""
    try:
        backend.update_param(param, updates)
        return []
    except Exception:
        skipped = []
        for k, v in updates.items():
            try:
                backend.update_param(param, {k: v})
            except Exception:
                skipped.append(k)
        return skipped


# ── driver (needs a built Calliope 0.6.8 model) ───────────────────────────────

def _energy_cap(model_or_results):
    ds = model_or_results.results if hasattr(model_or_results, 'results') else model_or_results
    s = ds['energy_cap'].to_series()
    return {str(k): float(v) for k, v in s.items() if v == v}


def run_lombardi_spores(model, plan, slack_group, log, on_spore):
    """Run SPORES 1..N on an already-solved (cost-optimal) Calliope 0.6.8 model.

    `slack_group`: name of the system-wide monetary cost_max group constraint.
    `on_spore(step, results_model, cost_monetary)` is called after each SPORE.
    Returns the list of executed steps (fewer than planned if explore stopped early
    or a run was infeasible)."""
    scored = {normalise_tech(t) for t in plan.get('scoredTechs') or []}
    inputs = model._model_data
    cap_max_da = inputs['energy_cap_max'] if 'energy_cap_max' in inputs else None
    cap_max = ({str(k): float(v) for k, v in cap_max_da.to_series().items()} if cap_max_da is not None else {})
    cost_lts = [str(x) for x in inputs.loc_techs_investment_cost.values]
    # No scored techs given → score every investment loc::tech (as native SPORES does)
    scored_lts = [lt for lt in cost_lts if not scored or loc_tech_matches(lt, scored)]
    log(f'  [SPORES] {len(scored_lts)} scored loc::techs across {len(scored)} techs')

    def scores_of(results_model):
        caps = {lt: c for lt, c in _energy_cap(results_model).items() if lt in scored_lts}
        return cap_loc_scores(caps, cap_max)

    cost0 = float(model.results['cost'].sel(costs='monetary').sum().values)
    slacked = (1 + float(plan['slack'])) * cost0
    log(f'  [SPORES] cost-optimal = {cost0:.6g}; slacked budget (+{plan["slack"]*100:g}%) = {slacked:.6g}')

    backend = model.backend
    backend.update_param('group_cost_max', {('monetary', slack_group): slacked})
    score0 = scores_of(model)
    cumulative = dict(score0)
    safe_update(backend, 'cost_energy_cap', nos_score_updates(cumulative, scored_lts))

    steps = expand_schedule(plan)
    done, prev_stage, explore_exhausted = [], None, False
    for step in steps:
        if step['stage'] == 'explore':
            if explore_exhausted:
                continue
            if prev_stage != 'explore':  # no exclusion target while exploring
                safe_update(backend, 'cost_energy_cap', excl_score_updates([], scored_lts))
        else:
            explore_exhausted = False
            if step['reset_scores']:
                cumulative = dict(score0)
                safe_update(backend, 'cost_energy_cap', nos_score_updates(cumulative, scored_lts))
                safe_update(backend, 'cost_energy_cap', excl_score_updates(step['target'], scored_lts))
        prev_stage = step['stage']
        backend.update_param('objective_cost_class', step['weights'])

        label = 'explore' if step['stage'] == 'explore' else 'minimise ' + '+'.join(step['target'])
        log(f"  [SPORES] {step['spore']}/{len(steps)} {label} (run {step['iteration']})")
        new = backend.rerun()
        tc = str(new.results.attrs.get('termination_condition', ''))
        if tc not in ('optimal', 'feasible'):
            log(f"  [SPORES] SPORE {step['spore']} not optimal ({tc}); stopping")
            break
        cost = float(new.results['cost'].sel(costs='monetary').sum().values)
        inc = scores_of(new)
        cumulative = add_scores(cumulative, inc)
        safe_update(backend, 'cost_energy_cap', nos_score_updates(cumulative, scored_lts))
        on_spore(step, new, cost)
        done.append(step)
        # Original script: stop exploring once a run deploys no scored loc::tech.
        if step['stage'] == 'explore' and not any(v > 0 for v in inc.values()):
            log('  [SPORES] explore stage exhausted (no scored loc::tech deployed)')
            explore_exhausted = True
    return done
