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


def resource_to_cf(constraints, n, report, ctx, model_data):
    """Supply resource → per-unit availability list of length n, or None (unconstrained).

    Calliope 0.6 semantics: resource_unit 'energy_per_cap' → values are capacity
    factors; 'energy' → absolute kW, approximated as resource / energy_cap_max
    (energy_cap_equals takes precedence — exact, as equals fixes capacity);
    unset → values ≤ 1 are treated as capacity factors, larger as absolute."""
    resource = constraints.get('resource')
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

    peak = max(series) if series else 0.0
    as_cf = unit == 'energy_per_cap' or (unit != 'energy' and peak <= 1.001)
    if as_cf:
        return [max(0.0, min(1.0, v)) for v in series]
    if cap_max:
        report.append(f"{ctx}: absolute resource series approximated as CF = resource / energy_cap_max ({cap_max})")
        return [max(0.0, min(1.0, v / cap_max)) for v in series]
    report.append(f"{ctx}: absolute resource series with unbounded energy_cap_max cannot be mapped — dropped")
    return None
