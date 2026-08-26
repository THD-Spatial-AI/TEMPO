#!/usr/bin/env python3
"""
pypsa_translate.py
------------------
Translates TEMPO's internal model format into a PyPSA network.

Two layers:

  translate_model(model_data) -> (spec, report)
      Pure-dict translation — no pypsa import, testable anywhere.
      `spec` holds plain records for every PyPSA component to create.

  build_network(spec) -> pypsa.Network
      Thin layer that instantiates the network (requires pypsa).

Used by pypsa_runner.py (run), and by pypsa_service.py /export and /import.

Conventions (mirroring the Calliope runners so results are comparable):
  - hourly snapshots from modelConfig.startDate to endDate INCLUSIVE
  - demand per location: demandProfile.timeseries cycled over the period
    (abs values), else the demand tech's scalar |resource|, else flat 100.0
  - ids sanitised with safe_id().lower(); component names are "loc::tech"
    so result extraction matches the frozen contract keys directly
  - investment costs annualised with calliope's depreciation formula and
    scaled by n_hours/8760 (calliope 0.6 weights investment by the modelled
    fraction of the year)

Deliberate approximations (always noted in the report):
  - storage = Store + charge/discharge Links (charge capacity uncosted)
  - transmission = two directed Links, each carrying half the pair cost
  - absolute (non-per-unit) supply resource series approximated as
    p_max_pu = resource / energy_cap_max
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timedelta
from itertools import cycle, islice

from engine_overlay import engine_overlay, coerce_overlay

HOURS_PER_YEAR = 8760.0
_INF_SENTINEL = 1e14
UNMET_DEMAND_COST = 1e6  # mirrors calliope's ensure_feasibility bigM slack


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_id(name) -> str:
    """Same sanitisation semantics as the Calliope runners, lowercased."""
    s = str(name).strip()
    s = s.replace('::', '__').replace(':', '_')
    s = re.sub(r'[^A-Za-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    if s and s[0].isdigit():
        s = 't' + s
    return (s or 'unknown').lower()


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


def _finite(val):
    v = convert_value(val)
    if isinstance(v, (int, float)) and not isinstance(v, bool) \
            and not math.isinf(v) and not math.isnan(v):
        return float(v)
    return None


def _annuity(rate, lifetime):
    """Calliope 0.6 depreciation rate: i/(1-(1+i)^-n), or 1/n at zero interest."""
    life = _finite(lifetime)
    if not life or life <= 0:
        return 1.0
    r = _finite(rate)
    if r and r > 0:
        return r / (1.0 - (1.0 + r) ** -life)
    return 1.0 / life


def _snapshots(model_config):
    """Hourly ISO timestamps, endDate inclusive (matches the Calliope runners)."""
    start = str(model_config.get('startDate') or '2024-01-01')[:10]
    end = str(model_config.get('endDate') or start)[:10]
    t0 = datetime.strptime(start, '%Y-%m-%d')
    t1 = datetime.strptime(end, '%Y-%m-%d') + timedelta(hours=23)
    if t1 < t0:
        t1 = t0 + timedelta(hours=47)
    n = int((t1 - t0).total_seconds() // 3600) + 1
    return [(t0 + timedelta(hours=h)).strftime('%Y-%m-%d %H:%M:%S') for h in range(n)]


def _is_file_ref(val):
    return isinstance(val, str) and val.startswith('file=')


def _resolve_file_series(ref, model_data, n, report, ctx):
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
                if c == col or safe_id(c) == safe_id(col):
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
            v = _finite(v)
            vals.append(v if v is not None else 0.0)
        if not vals:
            report.append(f"{ctx}: time series '{fname}' is empty — reference dropped")
            return None
        return list(islice(cycle(vals), n))

    report.append(f"{ctx}: time series file '{fname}' not found in payload — reference dropped")
    return None


def _merged_tech_def(tech, loc_cfg):
    """Tech-level constraints/costs with per-location overrides shallow-merged in."""
    constraints = dict(tech.get('constraints') or {})
    costs = dict((tech.get('costs') or {}).get('monetary') or {})
    if isinstance(loc_cfg, dict):
        constraints.update(loc_cfg.get('constraints') or {})
        costs.update((loc_cfg.get('costs') or {}).get('monetary') or {})
    return constraints, costs


def _resource_to_p_max_pu(resource, cap_max, n, report, ctx, model_data):
    """Map a supply tech's resource to a per-unit availability series/scalar.

    Values ≤ 1 are treated as capacity factors; larger values are absolute
    energy and approximated by dividing through energy_cap_max."""
    series = None
    if _is_file_ref(resource):
        series = _resolve_file_series(resource, model_data, n, report, ctx)
        if series is None:
            return None
    else:
        r = _finite(resource)
        if r is None:  # inf / unset → unconstrained
            return None
        series = [abs(r)] * n

    peak = max(series) if series else 0.0
    if peak <= 1.001:
        return [max(0.0, min(1.0, v)) for v in series]
    if cap_max:
        report.append(f"{ctx}: absolute resource series approximated as p_max_pu = resource / energy_cap_max ({cap_max})")
        return [max(0.0, min(1.0, v / cap_max)) for v in series]
    report.append(f"{ctx}: absolute resource series with unbounded energy_cap_max cannot be mapped — dropped")
    return None


# ---------------------------------------------------------------------------
# Core translation
# ---------------------------------------------------------------------------

def translate_model(model_data: dict) -> tuple[dict, list]:
    """Translate a TEMPO run payload into a PyPSA component spec.

    Returns (spec, report). spec keys: snapshots, buses, carriers, generators,
    loads, stores, links, meta. All component records are plain dicts.
    """
    report: list[str] = []
    model_config = model_data.get('modelConfig') or {}
    snapshots = _snapshots(model_config)
    n = len(snapshots)
    year_frac = n / HOURS_PER_YEAR

    techs = {t.get('name'): t for t in (model_data.get('technologies') or []) if t.get('name')}
    locations = model_data.get('locations') or []

    spec = {
        'snapshots': snapshots,
        'buses': [],        # {name, carrier, x, y}
        'carriers': set(),
        'generators': [],   # {name, bus, carrier, p_nom_max, efficiency, capital_cost, marginal_cost, p_max_pu, p_min_pu}
        'loads': [],        # {name, bus, p_set}
        'stores': [],       # {name, bus, e_nom_max, standing_loss, capital_cost}
        'links': [],        # {name, bus0, bus1, efficiency, p_nom_max, capital_cost, marginal_cost}
        'meta': {
            'name': model_data.get('name') or 'tempo_model',
            'solver': model_data.get('solver') or model_config.get('solver') or 'highs',
            'n_hours': n,
        },
    }

    buses = {}  # name -> record

    def ensure_bus(loc_id, carrier, x=None, y=None):
        name = f"{loc_id}::{carrier}"
        if name not in buses:
            buses[name] = {'name': name, 'carrier': carrier, 'x': x, 'y': y}
            spec['carriers'].add(carrier)
        elif x is not None and buses[name].get('x') is None:
            buses[name]['x'] = x
            buses[name]['y'] = y
        return name

    loc_coords = {}
    loc_ids = {}
    for loc in locations:
        raw = loc.get('name') or loc.get('id') or ''
        lid = safe_id(raw)
        loc_ids[raw] = lid
        loc_coords[lid] = (_finite(loc.get('longitude')), _finite(loc.get('latitude')))

    # ── per-location tech instances ─────────────────────────────────────────
    for loc in locations:
        lid = loc_ids[loc.get('name') or loc.get('id') or '']
        x, y = loc_coords[lid]
        loc_techs = loc.get('techs') or {}

        for tname, loc_cfg in loc_techs.items():
            tech = techs.get(tname)
            if tech is None:
                report.append(f"{lid}: technology '{tname}' not defined — skipped")
                continue

            tid = safe_id(tname)
            ess = tech.get('essentials') or {}
            parent = str(ess.get('parent') or '').lower()
            constraints, costs = _merged_tech_def(tech, loc_cfg)
            comp_name = f"{lid}::{tid}"
            ctx = comp_name
            # Engine-specific overrides for this tech (applied to its primary
            # component and forwarded to PyPSA in build_network()).
            ep_pypsa = coerce_overlay(engine_overlay(tech, loc_cfg, 'pypsa'))

            cap_max = _finite(constraints.get('energy_cap_max'))
            eff = _finite(constraints.get('energy_eff')) or 1.0
            annuity = _annuity(costs.get('interest_rate'), constraints.get('lifetime'))
            om_var = _finite(costs.get('om_var')) or 0.0
            om_con = _finite(costs.get('om_con')) or 0.0

            if parent in ('supply', 'supply_plus'):
                carrier = ess.get('carrier_out') or ess.get('carrier') or 'electricity'
                bus = ensure_bus(lid, carrier, x, y)
                capex = _finite(costs.get('energy_cap')) or 0.0
                om_annual = _finite(costs.get('om_annual')) or 0.0
                p_max_pu = _resource_to_p_max_pu(
                    constraints.get('resource'), cap_max, n, report, ctx, model_data)
                gen = {
                    'name': comp_name, 'bus': bus, 'carrier': tid,
                    'p_nom_extendable': True,
                    'p_nom_max': cap_max,
                    'efficiency': eff,
                    'capital_cost': (capex * annuity + om_annual) * year_frac,
                    'marginal_cost': om_var + (om_con / eff if eff else 0.0),
                    'p_max_pu': p_max_pu,
                    'p_min_pu': None,
                }
                if constraints.get('force_resource') and p_max_pu is not None:
                    gen['p_min_pu'] = list(p_max_pu)
                    report.append(f"{ctx}: force_resource mapped to p_min_pu = p_max_pu")
                if parent == 'supply_plus':
                    report.append(f"{ctx}: supply_plus treated as supply (resource storage/area not mapped)")
                if ep_pypsa:
                    gen['_engine_params'] = ep_pypsa
                spec['generators'].append(gen)

            elif parent == 'demand':
                carrier = ess.get('carrier_in') or ess.get('carrier') or 'electricity'
                bus = ensure_bus(lid, carrier, x, y)
                profile = ((loc.get('demandProfile') or {}).get('timeseries')) or []
                resource = constraints.get('resource')
                if profile:
                    p_set = [abs(_finite(v) or 0.0) for v in islice(cycle(profile), n)]
                elif _is_file_ref(resource):
                    series = _resolve_file_series(resource, model_data, n, report, ctx)
                    p_set = [abs(v) for v in series] if series else [100.0] * n
                else:
                    r = _finite(resource)
                    if r is not None:
                        p_set = [abs(r)] * n
                    else:
                        p_set = [100.0] * n
                        report.append(f"{ctx}: no demand profile or scalar — flat 100 kW placeholder (0.6 runner convention)")
                spec['loads'].append({'name': comp_name, 'bus': bus, 'p_set': p_set})

            elif parent == 'storage':
                carrier = ess.get('carrier') or ess.get('carrier_out') or 'electricity'
                bus = ensure_bus(lid, carrier, x, y)
                store_bus = ensure_bus(lid, f"{tid}_store")
                e_nom_max = _finite(constraints.get('storage_cap_max'))
                standing_loss = _finite(constraints.get('storage_loss')) or 0.0
                cap_storage = _finite(costs.get('storage_cap')) or 0.0
                cap_energy = _finite(costs.get('energy_cap')) or 0.0
                om_annual = _finite(costs.get('om_annual')) or 0.0
                spec['stores'].append({
                    'name': comp_name, 'bus': store_bus,
                    'e_nom_max': e_nom_max,
                    'standing_loss': standing_loss,
                    'capital_cost': (cap_storage * annuity + om_annual) * year_frac,
                })
                if ep_pypsa:
                    spec['stores'][-1]['_engine_params'] = ep_pypsa
                spec['links'].append({
                    'name': f"{comp_name}::charge", 'bus0': bus, 'bus1': store_bus,
                    'efficiency': eff, 'p_nom_max': cap_max,
                    'capital_cost': 0.0, 'marginal_cost': 0.0,
                })
                spec['links'].append({
                    'name': f"{comp_name}::discharge", 'bus0': store_bus, 'bus1': bus,
                    'efficiency': eff, 'p_nom_max': cap_max,
                    'capital_cost': cap_energy * annuity * year_frac,
                    'marginal_cost': om_var * eff,
                })
                report.append(f"{ctx}: storage mapped to Store + charge/discharge Links (charge capacity uncosted)")

            elif parent in ('conversion', 'conversion_plus'):
                cin = ess.get('carrier_in') or 'electricity'
                cout = ess.get('carrier_out') or 'electricity'
                if isinstance(cout, dict) or isinstance(cin, dict):
                    report.append(f"{ctx}: multi-carrier conversion_plus not supported — skipped")
                    continue
                bus0 = ensure_bus(lid, cin, x, y)
                bus1 = ensure_bus(lid, cout, x, y)
                capex = _finite(costs.get('energy_cap')) or 0.0
                om_annual = _finite(costs.get('om_annual')) or 0.0
                # calliope energy_cap is per unit OUTPUT; pypsa Link p_nom is
                # per unit input (p0) — rescale caps and costs by efficiency
                spec['links'].append({
                    'name': comp_name, 'bus0': bus0, 'bus1': bus1,
                    'efficiency': eff,
                    'p_nom_max': (cap_max / eff) if (cap_max is not None and eff) else cap_max,
                    'capital_cost': (capex * annuity + om_annual) * year_frac * eff,
                    'marginal_cost': (om_var * eff) + om_con,
                })
                if ep_pypsa:
                    spec['links'][-1]['_engine_params'] = ep_pypsa
                if parent == 'conversion_plus':
                    report.append(f"{ctx}: conversion_plus treated as single-carrier conversion")

            elif parent == 'transmission':
                continue  # instantiated from links[] below

            else:
                report.append(f"{ctx}: unknown parent '{parent}' — skipped")

    # ── transmission links ──────────────────────────────────────────────────
    for link in model_data.get('links') or []:
        tname = link.get('tech')
        tech = techs.get(tname)
        a_raw, b_raw = link.get('from'), link.get('to')
        if tech is None or a_raw is None or b_raw is None:
            report.append(f"link {a_raw}→{b_raw}: technology '{tname}' not defined — skipped")
            continue
        a, b = safe_id(a_raw), safe_id(b_raw)
        tid = safe_id(tname)
        ess = tech.get('essentials') or {}
        carrier = ess.get('carrier') or ess.get('carrier_out') or 'electricity'
        constraints, costs = _merged_tech_def(tech, None)
        ep_pypsa = coerce_overlay(engine_overlay(tech, None, 'pypsa'))

        cap_max = _finite(constraints.get('energy_cap_max'))
        eff = _finite(constraints.get('energy_eff')) or 1.0
        annuity = _annuity(costs.get('interest_rate'), constraints.get('lifetime'))
        distance = _finite(link.get('distance')) or 0.0
        capex = (_finite(costs.get('energy_cap')) or 0.0) \
            + (_finite(costs.get('energy_cap_per_distance')) or 0.0) * distance
        om_annual = _finite(costs.get('om_annual')) or 0.0
        om_var = _finite(costs.get('om_var')) or 0.0
        pair_cost = (capex * annuity + om_annual) * (n / HOURS_PER_YEAR)

        bus_a = ensure_bus(a, carrier, *loc_coords.get(a, (None, None)))
        bus_b = ensure_bus(b, carrier, *loc_coords.get(b, (None, None)))

        for bus0, bus1, x0, x1 in ((bus_a, bus_b, a, b), (bus_b, bus_a, b, a)):
            spec['links'].append({
                'name': f"{x0}::{tid}:{x1}", 'bus0': bus0, 'bus1': bus1,
                'efficiency': eff,
                'p_nom_max': cap_max,
                'capital_cost': pair_cost / 2.0,
                'marginal_cost': om_var * eff,
            })
            if ep_pypsa:
                spec['links'][-1]['_engine_params'] = ep_pypsa
        report.append(f"link {a}↔{b} ({tid}): mapped to two directed Links, half pair cost each")

    # ── ensure_feasibility slack (mirrors calliope's unmet-demand bigM) ─────
    if model_config.get('ensureFeasibility'):
        load_buses = {ld['bus'] for ld in spec['loads']}
        for bus in sorted(load_buses):
            spec['generators'].append({
                'name': f"{bus}::unmet_demand", 'bus': bus, 'carrier': 'unmet_demand',
                'p_nom_extendable': False,
                'p_nom': 1e7, 'p_nom_max': None,
                'efficiency': 1.0, 'capital_cost': 0.0,
                'marginal_cost': UNMET_DEMAND_COST,
                'p_max_pu': None, 'p_min_pu': None,
            })
        spec['carriers'].add('unmet_demand')
        if load_buses:
            report.append(f"ensureFeasibility: unmet-demand slack generator added at {len(load_buses)} demand bus(es)")

    spec['buses'] = list(buses.values())
    spec['carriers'] = sorted(spec['carriers'])
    return spec, report


# ---------------------------------------------------------------------------
# PyPSA network construction (requires pypsa)
# ---------------------------------------------------------------------------

def build_network(spec: dict):
    """Instantiate a pypsa.Network from a translate_model() spec."""
    import pandas as pd
    import pypsa

    n = pypsa.Network(name=spec['meta']['name'])
    n.set_snapshots(pd.to_datetime(spec['snapshots']))

    for carrier in spec['carriers']:
        n.add('Carrier', carrier)

    for bus in spec['buses']:
        kwargs = {'carrier': bus['carrier']}
        if bus.get('x') is not None:
            kwargs['x'] = bus['x']
        if bus.get('y') is not None:
            kwargs['y'] = bus['y']
        n.add('Bus', bus['name'], **kwargs)

    for gen in spec['generators']:
        kwargs = {
            'bus': gen['bus'],
            'carrier': gen['carrier'],
            'efficiency': gen['efficiency'],
            'capital_cost': gen['capital_cost'],
            'marginal_cost': gen['marginal_cost'],
        }
        if gen.get('p_nom_extendable', True):
            kwargs['p_nom_extendable'] = True
            if gen.get('p_nom_max') is not None:
                kwargs['p_nom_max'] = gen['p_nom_max']
        else:
            kwargs['p_nom'] = gen.get('p_nom', 0.0)
        if gen.get('p_max_pu') is not None:
            kwargs['p_max_pu'] = pd.Series(gen['p_max_pu'], index=n.snapshots)
        if gen.get('p_min_pu') is not None:
            kwargs['p_min_pu'] = pd.Series(gen['p_min_pu'], index=n.snapshots)
        kwargs.update(gen.get('_engine_params') or {})  # engine-specific overrides
        n.add('Generator', gen['name'], **kwargs)

    for load in spec['loads']:
        n.add('Load', load['name'], bus=load['bus'],
              p_set=pd.Series(load['p_set'], index=n.snapshots))

    for store in spec['stores']:
        kwargs = {
            'bus': store['bus'],
            'e_nom_extendable': True,
            'standing_loss': store['standing_loss'],
            'capital_cost': store['capital_cost'],
            'e_cyclic': True,
        }
        if store.get('e_nom_max') is not None:
            kwargs['e_nom_max'] = store['e_nom_max']
        kwargs.update(store.get('_engine_params') or {})  # engine-specific overrides
        n.add('Store', store['name'], **kwargs)

    for link in spec['links']:
        kwargs = {
            'bus0': link['bus0'],
            'bus1': link['bus1'],
            'efficiency': link['efficiency'],
            'p_nom_extendable': True,
            'capital_cost': link['capital_cost'],
            'marginal_cost': link['marginal_cost'],
        }
        if link.get('p_nom_max') is not None:
            kwargs['p_nom_max'] = link['p_nom_max']
        kwargs.update(link.get('_engine_params') or {})  # engine-specific overrides
        n.add('Link', link['name'], **kwargs)

    return n


# ---------------------------------------------------------------------------
# Reverse translation: pypsa.Network → internal model (requires pypsa/pandas)
# ---------------------------------------------------------------------------

def network_to_internal(n) -> tuple[dict, list]:
    """Translate a pypsa.Network into TEMPO's internal model format.

    Handles both TEMPO-exported networks ('loc::tech' component names, aux
    '<tech>_store' buses) and foreign networks (arbitrary names; the bus name
    becomes the location, the component carrier becomes the technology).

    Costs cannot be de-annualised without lifetime information, so imported
    capital costs become 'annual-cost equivalents' (energy_cap with no
    lifetime → annuity 1.0), which round-trip exactly through translate_model.

    Returns (model, report).
    """
    import math as _math

    report: list = []
    n_hours = len(n.snapshots)
    year_frac = (n_hours / HOURS_PER_YEAR) or 1.0

    if n_hours >= 2:
        step_h = (n.snapshots[1] - n.snapshots[0]).total_seconds() / 3600.0
        if abs(step_h - 1.0) > 1e-6:
            report.append(f"non-hourly snapshots ({step_h:g} h steps) treated as hourly")

    model = {
        'name': getattr(n, 'name', '') or 'Imported PyPSA model',
        'modelConfig': {},
        'technologies': [],
        'locations': [],
        'links': [],
        'timeSeries': [],
    }
    if n_hours > 0:
        model['modelConfig']['startDate'] = str(n.snapshots[0])[:10]
        model['modelConfig']['endDate'] = str(n.snapshots[-1])[:10]

    def _fin(v):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return None
        if _math.isnan(v) or _math.isinf(v):
            return None
        return v

    # ── locations from buses (skip TEMPO aux storage buses) ─────────────────
    locations = {}

    def _loc_of_bus(bus_name):
        base = str(bus_name).split('::')[0] if '::' in str(bus_name) else str(bus_name)
        return safe_id(base)

    def _ensure_loc(bus_name):
        lid = _loc_of_bus(bus_name)
        if lid not in locations:
            loc = {'name': lid, 'techs': {}}
            try:
                row = n.buses.loc[bus_name]
                x, y = _fin(row.get('x')), _fin(row.get('y'))
                if x is not None:
                    loc['longitude'] = x
                if y is not None:
                    loc['latitude'] = y
            except Exception:
                pass
            locations[lid] = loc
        return locations[lid]

    def _bus_carrier(bus_name):
        try:
            c = str(n.buses.loc[bus_name, 'carrier'] or '')
        except Exception:
            c = ''
        if not c or c == 'AC':
            c = 'electricity'
        if '::' in str(bus_name) and str(bus_name).split('::', 1)[1].endswith('_store'):
            return None  # TEMPO aux storage bus, not a real carrier
        return c

    for bus_name in n.buses.index:
        if _bus_carrier(bus_name) is None:
            continue
        _ensure_loc(bus_name)

    # ── technology registry with per-location overrides ─────────────────────
    techs = {}

    def _register(tid, tech_def, lid, loc_override=None):
        """Add tech definition (first wins); diff later instances into
        per-location overrides."""
        if tid not in techs:
            techs[tid] = tech_def
            locations[lid]['techs'][tid] = loc_override
            return
        base = techs[tid]
        diff_constraints = {}
        for k, v in (tech_def.get('constraints') or {}).items():
            if (base.get('constraints') or {}).get(k) != v:
                diff_constraints[k] = v
        diff_costs = {}
        for k, v in ((tech_def.get('costs') or {}).get('monetary') or {}).items():
            if ((base.get('costs') or {}).get('monetary') or {}).get(k) != v:
                diff_costs[k] = v
        override = dict(loc_override or {})
        if diff_constraints:
            override['constraints'] = {**diff_constraints, **(override.get('constraints') or {})}
        if diff_costs:
            override['costs'] = {'monetary': diff_costs}
        locations[lid]['techs'][tid] = override or None

    def _split_or_fallback(name, carrier, bus_name):
        parts = str(name).split('::')
        if len(parts) == 2:
            return parts[0], parts[1]
        tid = safe_id(carrier) if carrier and str(carrier).strip() else safe_id(name)
        return _loc_of_bus(bus_name), tid

    def _series_or_scalar(tid, lid, series):
        """Constant series → scalar; varying series → timeSeries entry + file ref."""
        vals = [round(float(v), 6) for v in series]
        if not vals:
            return None
        if max(vals) - min(vals) < 1e-9:
            return vals[0]
        fname = f"pypsa_{lid}_{tid}.csv"
        model['timeSeries'].append({
            'name': fname[:-4],
            'fileName': fname,
            'columns': ['time', 'value'],
            'data': [{'time': str(ts), 'value': v} for ts, v in zip(n.snapshots, vals)],
        })
        return f"file={fname}:value"

    ensure_feasibility = False

    # ── Generators → supply techs ────────────────────────────────────────────
    for name in n.generators.index:
        row = n.generators.loc[name]
        carrier = str(row.get('carrier') or '')
        if carrier == 'unmet_demand' or str(name).endswith('::unmet_demand'):
            ensure_feasibility = True
            continue
        bus = row['bus']
        lid, tid = _split_or_fallback(name, carrier, bus)
        _ensure_loc(bus)

        constraints = {}
        p_nom_max = _fin(row.get('p_nom_max'))
        if p_nom_max is not None:
            constraints['energy_cap_max'] = p_nom_max
        if not bool(row.get('p_nom_extendable', True)):
            p_nom = _fin(row.get('p_nom')) or 0.0
            constraints['energy_cap_equals'] = p_nom
        eff = _fin(row.get('efficiency'))
        if eff is not None and eff != 1.0:
            constraints['energy_eff'] = eff

        if name in n.generators_t.p_max_pu.columns:
            ref = _series_or_scalar(tid, lid, n.generators_t.p_max_pu[name])
            if ref is not None:
                constraints['resource'] = ref
        else:
            static_pu = _fin(row.get('p_max_pu'))
            if static_pu is not None and static_pu != 1.0:
                constraints['resource'] = static_pu

        costs = {}
        cap = _fin(row.get('capital_cost'))
        if cap:
            costs['energy_cap'] = round(cap / year_frac, 6)
        marg = _fin(row.get('marginal_cost'))
        if marg:
            costs['om_var'] = marg

        tech_def = {
            'name': tid,
            'essentials': {'parent': 'supply', 'carrier_out': _bus_carrier(bus) or 'electricity', 'name': tid},
            'constraints': constraints,
        }
        if costs:
            tech_def['costs'] = {'monetary': costs}
        _register(tid, tech_def, lid)

    # ── Loads → demand techs + demandProfile ─────────────────────────────────
    for name in n.loads.index:
        row = n.loads.loc[name]
        bus = row['bus']
        carrier = _bus_carrier(bus) or 'electricity'
        lid, tid = _split_or_fallback(name, f"demand_{carrier}", bus)
        loc = _ensure_loc(bus)

        if name in n.loads_t.p_set.columns:
            profile = [round(abs(float(v)), 6) for v in n.loads_t.p_set[name]]
        else:
            static = _fin(row.get('p_set')) or 0.0
            profile = [abs(static)] * n_hours
        loc['demandProfile'] = {'timeseries': profile}

        tech_def = {
            'name': tid,
            'essentials': {'parent': 'demand', 'carrier_in': carrier, 'name': tid},
            'constraints': {'force_resource': True},
        }
        _register(tid, tech_def, lid)

    # ── Stores (+ TEMPO charge/discharge links) → storage techs ─────────────
    consumed_links = set()
    for name in n.stores.index:
        row = n.stores.loc[name]
        parts = str(name).split('::')
        lid = safe_id(parts[0]) if len(parts) == 2 else _loc_of_bus(row['bus'])
        tid = parts[1] if len(parts) == 2 else safe_id(row.get('carrier') or name)

        constraints = {}
        e_nom_max = _fin(row.get('e_nom_max'))
        if e_nom_max is not None:
            constraints['storage_cap_max'] = e_nom_max
        loss = _fin(row.get('standing_loss'))
        if loss:
            constraints['storage_loss'] = loss

        costs = {}
        cap_store = _fin(row.get('capital_cost'))
        if cap_store:
            costs['storage_cap'] = round(cap_store / year_frac, 6)

        carrier = 'electricity'
        discharge = f"{name}::discharge"
        charge = f"{name}::charge"
        if discharge in n.links.index:
            consumed_links.update((discharge, charge))
            lrow = n.links.loc[discharge]
            carrier = _bus_carrier(lrow['bus1']) or 'electricity'
            p_max = _fin(lrow.get('p_nom_max'))
            if p_max is not None:
                constraints['energy_cap_max'] = p_max
            eff = _fin(lrow.get('efficiency'))
            if eff is not None and eff != 1.0:
                constraints['energy_eff'] = eff
            cap_energy = _fin(lrow.get('capital_cost'))
            if cap_energy:
                costs['energy_cap'] = round(cap_energy / year_frac, 6)
        else:
            report.append(f"{name}: Store without TEMPO charge/discharge links — power capacity unknown")

        if lid not in locations:
            locations[lid] = {'name': lid, 'techs': {}}
        tech_def = {
            'name': tid,
            'essentials': {'parent': 'storage', 'carrier': carrier, 'name': tid},
            'constraints': constraints,
        }
        if costs:
            tech_def['costs'] = {'monetary': costs}
        _register(tid, tech_def, lid)

    # ── StorageUnits (foreign networks) → storage techs ──────────────────────
    for name in getattr(n, 'storage_units', __import__('pandas').DataFrame()).index:
        row = n.storage_units.loc[name]
        bus = row['bus']
        lid, tid = _split_or_fallback(name, row.get('carrier') or name, bus)
        _ensure_loc(bus)
        p_nom_max = _fin(row.get('p_nom_max')) or _fin(row.get('p_nom'))
        max_hours = _fin(row.get('max_hours')) or 0.0
        constraints = {}
        if p_nom_max is not None:
            constraints['energy_cap_max'] = p_nom_max
            if max_hours:
                constraints['storage_cap_max'] = p_nom_max * max_hours
        eff_s = _fin(row.get('efficiency_store')) or 1.0
        eff_d = _fin(row.get('efficiency_dispatch')) or 1.0
        rt = eff_s * eff_d
        if rt != 1.0:
            constraints['energy_eff'] = round(rt ** 0.5, 6)
        costs = {}
        cap = _fin(row.get('capital_cost'))
        if cap:
            costs['energy_cap'] = round(cap / year_frac, 6)
        tech_def = {
            'name': tid,
            'essentials': {'parent': 'storage', 'carrier': _bus_carrier(bus) or 'electricity', 'name': tid},
            'constraints': constraints,
        }
        if costs:
            tech_def['costs'] = {'monetary': costs}
        _register(tid, tech_def, lid)
        report.append(f"{name}: StorageUnit approximated (energy_eff = sqrt of round-trip, energy/power coupled by max_hours)")

    # ── Links → transmission pairs / conversion techs ────────────────────────
    tx_pairs = {}
    for name in n.links.index:
        if name in consumed_links:
            continue
        row = n.links.loc[name]
        bus0, bus1 = row['bus0'], row['bus1']
        c0, c1 = _bus_carrier(bus0), _bus_carrier(bus1)
        if c0 is None or c1 is None:
            report.append(f"{name}: link touches an unrecognised storage bus — skipped")
            continue
        l0, l1 = _loc_of_bus(bus0), _loc_of_bus(bus1)
        _ensure_loc(bus0)
        _ensure_loc(bus1)

        split = _split_component_name_local(name)
        if c0 == c1 and l0 != l1:
            # transmission: pair up directed links by (sorted endpoints, tech)
            carrier_attr = str(row.get('carrier') or '').strip()
            tid = split[1].split(':', 1)[0] if split and ':' in split[1] else \
                (safe_id(carrier_attr) if carrier_attr else 'transmission_link')
            key = (tuple(sorted((l0, l1))), tid)
            entry = tx_pairs.setdefault(key, {
                'capital': 0.0, 'eff': _fin(row.get('efficiency')) or 1.0,
                'p_nom_max': _fin(row.get('p_nom_max')), 'directions': 0,
            })
            entry['capital'] += _fin(row.get('capital_cost')) or 0.0
            entry['directions'] += 1
        else:
            # conversion
            lid = l0
            tid = split[1] if split else (safe_id(row.get('carrier') or '') or safe_id(name))
            eff = _fin(row.get('efficiency')) or 1.0
            constraints = {}
            p_nom_max = _fin(row.get('p_nom_max'))
            if p_nom_max is not None:
                constraints['energy_cap_max'] = round(p_nom_max * eff, 6)
            if eff != 1.0:
                constraints['energy_eff'] = eff
            costs = {}
            cap = _fin(row.get('capital_cost'))
            if cap:
                costs['energy_cap'] = round(cap / (year_frac * eff), 6)
            tech_def = {
                'name': tid,
                'essentials': {'parent': 'conversion', 'carrier_in': c0, 'carrier_out': c1, 'name': tid},
                'constraints': constraints,
            }
            if costs:
                tech_def['costs'] = {'monetary': costs}
            _register(tid, tech_def, lid)

    for (pair, tid), entry in sorted(tx_pairs.items()):
        a, b = pair
        constraints = {}
        if entry['p_nom_max'] is not None:
            constraints['energy_cap_max'] = entry['p_nom_max']
        if entry['eff'] != 1.0:
            constraints['energy_eff'] = entry['eff']
        costs = {}
        if entry['capital']:
            costs['energy_cap'] = round(entry['capital'] / year_frac, 6)
        if tid not in techs:
            tech_def = {
                'name': tid,
                'essentials': {'parent': 'transmission', 'carrier': 'electricity', 'name': tid},
                'constraints': constraints,
            }
            if costs:
                tech_def['costs'] = {'monetary': costs}
            techs[tid] = tech_def
        model['links'].append({'from': a, 'to': b, 'tech': tid})
        if entry['directions'] == 1:
            report.append(f"link {a}↔{b} ({tid}): single directed link imported as bidirectional")
        if entry['capital']:
            report.append(f"link {a}↔{b} ({tid}): capital cost imported as total energy_cap cost (distance unknown)")

    if ensure_feasibility:
        model['modelConfig']['ensureFeasibility'] = True

    report.append("imported capital costs are annual-cost equivalents (lifetime/interest not recoverable from PyPSA)")

    model['technologies'] = list(techs.values())
    model['locations'] = list(locations.values())
    return model, report


def _split_component_name_local(name):
    parts = str(name).split('::')
    if len(parts) == 2:
        return parts[0], parts[1]
    return None
