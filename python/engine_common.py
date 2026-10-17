"""
engine_common.py
----------------
Pure, dependency-free helpers shared by the non-Calliope engine translators
(pypsa_translate, osemosys_translate, adoptnet0_translate) so every engine
reads costs, resources and per-location overrides with the same
Calliope 0.6 semantics.
"""

from __future__ import annotations

import copy
import math
import re
from itertools import cycle, islice

HOURS_PER_YEAR = 8760.0
_INF_SENTINEL = 1e14


def convert_value(val):
    """JS 'inf' strings / sanitised-infinity sentinels → Python float."""
    if isinstance(val, str):
        low = val.lower()
        if low in ('inf', '.inf'):
            return float('inf')
        if low in ('-inf', '-.inf'):
            return float('-inf')
        try:
            val = float(val)
        except (TypeError, ValueError):
            return val
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if val >= _INF_SENTINEL:
            return float('inf')
        if val <= -_INF_SENTINEL:
            return float('-inf')
    return val


def finite(val):
    """Float value, or None for missing / non-numeric / infinite / NaN."""
    v = convert_value(val)
    if isinstance(v, (int, float)) and not isinstance(v, bool) \
            and not math.isinf(v) and not math.isnan(v):
        return float(v)
    return None


def annuity(rate, lifetime):
    """Calliope 0.6 depreciation rate: i/(1-(1+i)^-n), or 1/n at zero interest."""
    life = finite(lifetime)
    if not life or life <= 0:
        return 1.0
    r = finite(rate)
    if r and r > 0:
        return r / (1.0 - (1.0 + r) ** -life)
    return 1.0 / life


# Intentionally mirrors pypsa_translate.safe_id normalisation (minus the digit prefix / 'unknown' fallback); applied to both sides of the comparison.
def _col_id(name) -> str:
    s = re.sub(r'[^A-Za-z0-9_]', '_', str(name).strip().replace('::', '__').replace(':', '_'))
    return re.sub(r'_+', '_', s).strip('_').lower()


def is_file_ref(val):
    return isinstance(val, str) and val.startswith('file=')


def resource_scale(constraints):
    """Calliope `resource_scale`: multiplier applied to a tech's resource (e.g. 1000 for MW→kW)."""
    v = finite((constraints or {}).get('resource_scale'))
    return v if v is not None else 1.0


def qualify_file_ref(ref, loc, model_data):
    """Calliope convention: 'file=x.csv' with no column means the column named after the
    location. Returns the ref with ':<column>' appended when the file has a column matching
    `loc`; otherwise the ref unchanged."""
    if not is_file_ref(ref) or ':' in ref[len('file='):] or not loc:
        return ref
    fname = ref[len('file='):].strip().lower()
    stem = fname[:-4] if fname.endswith('.csv') else fname
    for ts in model_data.get('timeSeries') or []:
        names = {str(ts.get(k) or '').lower() for k in ('fileName', 'file', 'name')}
        names |= {c[:-4] for c in list(names) if c.endswith('.csv')}
        if fname not in names and stem not in names:
            continue
        columns = ts.get('columns') or []
        date_col = ts.get('dateColumn') or (columns[0] if columns else None)
        for c in columns:
            if c and c != date_col and _col_id(c) == _col_id(loc):
                return f"{ref}:{c}"
        break
    return ref


def resolve_file_series(ref, model_data, n, report, ctx):
    """Resolve 'file=name.csv:column' against the payload's inline timeSeries.
    Returns a list of length n (cycled/truncated), or None."""
    body = ref[len('file='):]
    fname, _, col = body.partition(':')
    fname_l = fname.strip().lower()
    stem = fname_l[:-4] if fname_l.endswith('.csv') else fname_l

    for ts in model_data.get('timeSeries') or []:
        candidates = {str(ts.get(k) or '').lower() for k in ('fileName', 'file', 'name')}
        candidates |= {c[:-4] for c in list(candidates) if c.endswith('.csv')}
        if fname_l not in candidates and stem not in candidates:
            continue
        columns = ts.get('columns') or []
        data = ts.get('data') or []
        date_col = ts.get('dateColumn') or (columns[0] if columns else None)
        data_cols = [c for c in columns if c and c != date_col]
        target = None
        if col:
            for c in data_cols:
                if c == col or _col_id(c) == _col_id(col):
                    target = c
                    break
        elif len(data_cols) == 1:
            target = data_cols[0]
        if target is None:
            report.append(f"{ctx}: column '{col}' not found in time series '{fname}' — reference dropped")
            return None
        vals = []
        for row in data:
            v = row.get(target) if isinstance(row, dict) else None
            if v is None and not isinstance(row, dict):
                try:
                    v = row[columns.index(target)]
                except Exception:
                    v = None
            v = finite(v)
            vals.append(v if v is not None else 0.0)
        if not vals:
            report.append(f"{ctx}: time series '{fname}' is empty — reference dropped")
            return None
        return list(islice(cycle(vals), n))

    report.append(f"{ctx}: time series file '{fname}' not found in payload — reference dropped")
    return None


def merged_tech_def(tech, loc_cfg):
    """Tech-level constraints/costs with per-location overrides shallow-merged in."""
    constraints = dict(tech.get('constraints') or {})
    costs = dict((tech.get('costs') or {}).get('monetary') or {})
    if isinstance(loc_cfg, dict):
        constraints.update(loc_cfg.get('constraints') or {})
        costs.update((loc_cfg.get('costs') or {}).get('monetary') or {})
    # Calliope `energy_cap_scale` multiplies the energy_cap bounds (e.g. 1000 for MW→kW);
    # applied once here so every engine sees bounds in kW. Infinite bounds are left alone.
    scale = finite(constraints.pop('energy_cap_scale', None))
    if scale not in (None, 1.0):
        for key in ('energy_cap_max', 'energy_cap_min', 'energy_cap_equals'):
            v = finite(constraints.get(key))
            if v is not None:
                constraints[key] = v * scale
    return constraints, costs


def link_distance(link):
    """Link length in km: link.linkConfig.distance overrides link.distance
    (calliope_runner.build_links_config semantics). None when absent."""
    link = link or {}
    cfg = link.get('linkConfig') or {}
    if cfg.get('distance') is not None:
        return finite(cfg.get('distance'))
    return finite(link.get('distance'))


def merged_link_def(tech, link):
    """Transmission tech constraints/costs with this link's overrides merged in,
    mirroring calliope_runner.build_links_config: link.linkConfig is the per-link
    tech entry, and link.capacity (> 0) sets constraints[link.capacityKey]
    (default energy_cap_max; imported existing lines use energy_cap_equals)."""
    entry = copy.deepcopy((link or {}).get('linkConfig') or {})
    cap = finite((link or {}).get('capacity'))
    if cap is not None and cap > 0:
        entry.setdefault('constraints', {})[link.get('capacityKey') or 'energy_cap_max'] = cap
    return merged_tech_def(tech, entry)


def supply_efficiency(constraints, parent='supply'):
    """Product of the efficiencies Calliope applies between a supply tech's resource and its
    carrier output: energy_eff for every supply tech, and for supply_plus also resource_eff and
    parasitic_eff (calliope backend energy_balance.py)."""
    eff = finite(constraints.get('energy_eff'))
    eff = 1.0 if eff is None else eff
    if parent == 'supply_plus':
        for key in ('resource_eff', 'parasitic_eff'):
            v = finite(constraints.get(key))
            eff *= 1.0 if v is None else v
    return eff


def resource_to_cf(constraints, n, report, ctx, model_data, loc=None, parent='supply'):
    """Supply resource → per-unit availability list of length n, or None (unconstrained).

    Calliope 0.6.8 semantics (its default resource_unit is 'energy'):
      * 'energy_per_cap' → resource is a per-unit capacity factor (× energy_cap);
      * 'energy' (also when unset) → resource is an ABSOLUTE kW limit on production, so the
        per-unit availability is resource / capacity. The capacity used is energy_cap_equals /
        energy_cap_max; `lp_normalised` makes that bound finite (the series peak) when the model
        leaves it unbounded.
    Resource scale and the resource→carrier efficiencies are applied to the series."""
    resource = qualify_file_ref(constraints.get('resource'), loc, model_data)
    unit = str(constraints.get('resource_unit') or '').lower()
    cap_max = finite(constraints.get('energy_cap_equals'))
    if cap_max is None:
        cap_max = finite(constraints.get('energy_cap_max'))
    if is_file_ref(resource):
        series = resolve_file_series(resource, model_data, n, report, ctx)
        if series is None:
            return None
    else:
        r = finite(resource)
        if r is None:  # inf / unset → unconstrained
            return None
        series = [abs(r)] * n

    factor = resource_scale(constraints) * supply_efficiency(constraints, parent)
    if factor != 1.0:
        series = [v * factor for v in series]
    if unit == 'energy_per_cap':
        return [max(0.0, min(1.0, v)) for v in series]
    cap = cap_max or (max(series) if series else 0.0)
    if not cap:
        return [0.0] * n
    report.append(f"{ctx}: absolute resource series mapped to availability = resource / capacity ({cap:g} kW)")
    return [max(0.0, min(1.0, v / cap)) for v in series]


# ─── Calliope → plain-LP normalisation ────────────────────────────────────────

def _window_hours(model_data):
    """Hours in the modelled window (modelConfig start/end, inclusive days); 8760 when unset."""
    from datetime import date
    cfg = model_data.get('modelConfig') or {}
    try:
        d0 = date.fromisoformat(str(cfg.get('startDate'))[:10])
        d1 = date.fromisoformat(str(cfg.get('endDate'))[:10])
        return max(24, ((d1 - d0).days + 1) * 24)
    except (TypeError, ValueError):
        return 8760


def lp_normalised(model_data):
    """Return `model_data` with Calliope-specific supply semantics rewritten as the plain
    capacity bounds / costs every LP engine already understands (idempotent; the input is not
    modified and big structures such as timeSeries are shared, not copied).

    For supply / supply_plus techs, per location:
      * resource_area_per_energy_cap x costs.resource_area is added to costs.energy_cap, and
        resource_area_max / per_cap bounds energy_cap_max (the area a kW of capacity occupies);
      * an ABSOLUTE resource (Calliope's default resource_unit) caps energy_cap_max at its peak
        output, and a forced absolute resource (force_resource) pins capacity to that peak —
        production is then exactly the resource profile.
    Notes about what was rewritten are returned in model['_lp_notes']."""
    if model_data.get('_lp_normalised'):
        return model_data
    out = dict(model_data)
    out['_lp_normalised'] = True
    notes = []
    techs = {}
    for t in model_data.get('technologies') or []:
        for k in (t.get('name'), t.get('id')):
            if k:
                techs[str(k)] = t
    n = _window_hours(model_data)
    new_locations = []
    for loc in model_data.get('locations') or []:
        loc_techs = loc.get('techs') or {}
        lname = loc.get('name') or loc.get('id') or ''
        new_techs = dict(loc_techs)
        for ref, cfg in loc_techs.items():
            tech = techs.get(str(ref))
            parent = str((tech or {}).get('essentials', {}).get('parent') or (tech or {}).get('parent') or '')
            if tech is None or parent not in ('supply', 'supply_plus'):
                continue
            constr, costs = merged_tech_def(tech, cfg)
            over_c, over_k = {}, {}

            # ── area: cost and bound per kW of capacity ──
            per_cap = finite(constr.get('resource_area_per_energy_cap'))
            area_cost = finite(costs.get('resource_area'))
            if per_cap and area_cost:
                over_k['energy_cap'] = (finite(costs.get('energy_cap')) or 0.0) + per_cap * area_cost
                notes.append(f"{lname}::{ref}: area cost folded into capex "
                             f"(+{per_cap * area_cost:g} per kW = {per_cap:g} m2/kW x {area_cost:g}/m2)")
            area_max = finite(constr.get('resource_area_equals'))
            if area_max is None:
                area_max = finite(constr.get('resource_area_max'))
            cap_hi = finite(constr.get('energy_cap_equals'))
            if cap_hi is None:
                cap_hi = finite(constr.get('energy_cap_max'))
            if per_cap and area_max is not None:
                bound = area_max / per_cap
                if cap_hi is None or bound < cap_hi:
                    cap_hi = bound
                    over_c['energy_cap_max'] = bound
                    notes.append(f"{lname}::{ref}: capacity bounded by area ({area_max:g} m2 / {per_cap:g} m2/kW)")

            # ── absolute resource: capacity can never usefully exceed the resource peak ──
            unit = str(constr.get('resource_unit') or '').lower()
            if unit in ('', 'energy') and constr.get('resource') is not None \
                    and finite(constr.get('energy_cap_equals')) is None:
                ref_res = qualify_file_ref(constr.get('resource'), lname, model_data)
                if is_file_ref(ref_res):
                    series = resolve_file_series(ref_res, model_data, n, [], f"{lname}::{ref}")
                else:
                    r = finite(ref_res)
                    series = None if r is None else [abs(r)] * n
                if series:
                    peak = max(series) * resource_scale(constr) * supply_efficiency(constr, parent)
                    forced = constr.get('force_resource') in (True, 'true', 1)
                    if forced:
                        # production must equal the profile: capacity is pinned to its peak
                        over_c['energy_cap_min'] = peak
                        over_c['energy_cap_max'] = peak
                        notes.append(f"{lname}::{ref}: forced absolute resource -> capacity fixed at its peak {peak:g} kW")
                    elif cap_hi is None or cap_hi > peak:
                        over_c['energy_cap_max'] = peak
                        notes.append(f"{lname}::{ref}: absolute resource -> capacity bounded by its peak {peak:g} kW")

            if over_c or over_k:
                new_cfg = dict(cfg) if isinstance(cfg, dict) else {}
                if over_c:
                    new_cfg['constraints'] = {**(new_cfg.get('constraints') or {}), **over_c, 'energy_cap_scale': 1}
                if over_k:
                    mon = {**((new_cfg.get('costs') or {}).get('monetary') or {}), **over_k}
                    new_cfg['costs'] = {**(new_cfg.get('costs') or {}), 'monetary': mon}
                new_techs[ref] = new_cfg
        new_locations.append({**loc, 'techs': new_techs})
    out['locations'] = new_locations
    out['_lp_notes'] = notes
    return out
