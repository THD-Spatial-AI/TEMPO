"""
Calliope 0.6 → 0.7 translation layer.

Pure functions converting TEMPO's internal model JSON (which uses Calliope
0.6-flavoured vocabulary: essentials/constraints/costs, locations, links)
into Calliope 0.7 model-definition structures (flat techs, nodes,
transmission techs with link_from/link_to, config.init/build/solve).

No calliope import — unit-testable on any Python. All name renames come from
calliope07_mapping.json (shared with the JS import/export path); only
structural transforms live here as code.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

_MAPPING = json.loads(
    (Path(__file__).parent / "calliope07_mapping.json").read_text(encoding="utf-8")
)

TECH_PARAMS = _MAPPING["tech_params"]
EQUALS_PARAMS = _MAPPING["equals_params"]
RESOURCE_PARAMS = _MAPPING["resource_params"]
COST_PARAMS = _MAPPING["cost_params"]
BASE_TECH = _MAPPING["base_tech"]
RESULT_VARS = _MAPPING["result_vars"]
DROPPED_PARAMS = set(_MAPPING["dropped_params"])
MODE_MAP = _MAPPING["mode_map"]

# 0.6 pseudo-techs that mark grid topology, not real Calliope technologies
# (mirrors _HUB_LABELS in calliope_runner.py)
HUB_LABELS = {
    'substation', 'transformer', 'bus', 'hub', 'switching_station',
    'transmission_hub', 'node',
}


def safe_id(name) -> str:
    """Sanitise a name into a valid Calliope 0.7 identifier.

    Calliope 0.7 enforces ^[^_^\\d][\\w]*$ (no leading digit/underscore, no
    hyphens).  Unlike the 0.6 safe_id, hyphens are converted to underscores
    and digit-leading names receive a 't' prefix.
    """
    s = str(name).strip()
    s = s.replace('::', '__').replace(':', '_')
    s = re.sub(r'[^A-Za-z0-9_]', '_', s)    # hyphens and other non-word chars → _
    s = re.sub(r'_+', '_', s).strip('_')
    if s and s[0].isdigit():
        s = 't' + s                           # no leading digit in Calliope 0.7
    return s or 'unknown'


def tech_id(tech: dict) -> str:
    return safe_id(tech.get('name') or tech.get('id') or 'unknown')


def convert_value(val):
    """JS 'inf' strings / sanitized-infinity sentinels → Python float
    (same convention as calliope_runner.convert_value)."""
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
        if val >= 1e14:
            return float('inf')
        if val <= -1e14:
            return float('-inf')
    return val


def _wrap_cost(value):
    """0.7 cost parameters are indexed over the 'costs' dimension."""
    return {'data': value, 'index': 'monetary', 'dims': 'costs'}


def _is_file_ref(val) -> bool:
    return isinstance(val, str) and val.startswith('file=')


def translate_constraints(constraints: dict, parent: str, warnings: list,
                          tech_name: str = '') -> dict:
    """Apply the rename/expansion tables to a 0.6 constraints dict.

    Returns flat 0.7 params. `file=` resource references are passed through
    under the special key '__resource_file__' for the caller to turn into a
    data table; scalar resources become source_*/sink_* params directly.
    """
    out = {}
    constraints = dict(constraints or {})

    # 'resource' + 'force_resource' are consumed together
    force = bool(constraints.pop('force_resource', False))
    if 'resource' in constraints:
        resource = convert_value(constraints.pop('resource'))
        role = 'demand' if parent in ('demand', 'unmet_demand') else 'supply'
        param = RESOURCE_PARAMS[role]['forced' if (force or role == 'demand') else 'max']
        if _is_file_ref(resource):
            out['__resource_file__'] = {'ref': resource, 'param': param}
        elif isinstance(resource, (int, float)):
            if resource in (float('inf'), float('-inf')):
                # inf resource = unconstrained source; 0.7 default for
                # source_use_max is already inf → omit entirely
                pass
            else:
                # 0.6 demand is negative; 0.7 sink values are positive
                out[param] = abs(resource) if role == 'demand' else resource
        else:
            warnings.append(f"{tech_name}: unsupported resource value {resource!r} dropped")

    for key, raw in constraints.items():
        val = convert_value(raw)
        if key in EQUALS_PARAMS:
            for target in EQUALS_PARAMS[key]:
                out[target] = val
        elif key in TECH_PARAMS:
            out[TECH_PARAMS[key]] = val
        elif key in DROPPED_PARAMS:
            warnings.append(f"{tech_name}: parameter '{key}' has no Calliope 0.7 equivalent — dropped")
        else:
            warnings.append(f"{tech_name}: unknown 0.6 parameter '{key}' — dropped")
    return out


def translate_costs(costs: dict, warnings: list, tech_name: str = '') -> dict:
    """0.6 costs.monetary.X → 0.7 cost_X indexed over the costs dimension.
    Non-monetary cost classes (e.g. spores_score, emissions) are not
    translated — SPORES is gated on the 0.7 engine."""
    out = {}
    for cost_class, cost_vals in (costs or {}).items():
        if cost_class != 'monetary':
            warnings.append(
                f"{tech_name}: cost class '{cost_class}' not supported on the 0.7 engine — dropped")
            continue
        if not isinstance(cost_vals, dict):
            continue
        for key, raw in cost_vals.items():
            val = convert_value(raw)
            if key in COST_PARAMS:
                out[COST_PARAMS[key]] = _wrap_cost(val)
            elif key in DROPPED_PARAMS:
                warnings.append(f"{tech_name}: cost '{key}' has no Calliope 0.7 equivalent — dropped")
            else:
                warnings.append(f"{tech_name}: unknown 0.6 cost parameter '{key}' — dropped")
    return out


def translate_tech(tech: dict, warnings: list) -> dict | None:
    """One 0.6-style tech dict → flat 0.7 tech definition.

    Returns None when the tech has no 0.7 equivalent (e.g. unmet_demand —
    covered by config.build.ensure_feasibility).
    """
    tid = tech_id(tech)
    ess = tech.get('essentials') or {}
    parent = ess.get('parent') or tech.get('parent') or 'supply'

    base_map = BASE_TECH.get(parent)
    if base_map is None:
        if parent in BASE_TECH:  # explicit null → intentionally unsupported
            warnings.append(f"{tid}: tech class '{parent}' is built into Calliope 0.7 — skipped")
        else:
            warnings.append(f"{tid}: unknown tech class '{parent}' — skipped")
        return None

    out = {'base_tech': base_map['base_tech']}
    if ess.get('name') or tech.get('name'):
        out['name'] = ess.get('name') or tech.get('name')
    if ess.get('color') or tech.get('color'):
        out['color'] = ess.get('color') or tech.get('color')
    out.update(base_map.get('extra') or {})
    if parent == 'conversion_plus':
        warnings.append(
            f"{tid}: 'conversion_plus' mapped to plain conversion — carrier tiers/ratios are dropped")

    # Carriers: 0.7 requires explicit carrier_in / carrier_out per class
    carrier = ess.get('carrier')
    carrier_in = ess.get('carrier_in') or carrier
    carrier_out = ess.get('carrier_out') or carrier
    base = out['base_tech']
    if base in ('storage', 'transmission'):
        out['carrier_in'] = carrier_in or carrier_out or 'electricity'
        out['carrier_out'] = carrier_out or carrier_in or 'electricity'
    elif base == 'demand':
        out['carrier_in'] = carrier_in or 'electricity'
    elif base == 'conversion':
        out['carrier_in'] = carrier_in or 'electricity'
        out['carrier_out'] = carrier_out or 'electricity'
    else:  # supply
        out['carrier_out'] = carrier_out or 'electricity'

    out.update(translate_constraints(tech.get('constraints'), parent, warnings, tid))
    out.update(translate_costs(tech.get('costs'), warnings, tid))
    return out


def build_techs_07(technologies: list, warnings: list) -> dict:
    techs = {}
    for tech in technologies or []:
        translated = translate_tech(tech, warnings)
        if translated is not None:
            techs[tech_id(tech)] = translated
    return techs


def _extract_coords(loc: dict):
    """Return (lat, lng) as floats if the location defines both, else None.

    Handles 0.6's varied key names and treats 0.0 as a valid coordinate —
    a plain ``loc.get('lat') or loc.get('latitude')`` would wrongly discard a
    node on the equator or prime meridian."""
    lat = loc.get('lat')
    if lat is None:
        lat = loc.get('latitude')
    lng = loc.get('lng')
    if lng is None:
        lng = loc.get('lon')
    if lng is None:
        lng = loc.get('longitude')
    if lat is None or lng is None or lat == '' or lng == '':
        return None
    try:
        return (float(lat), float(lng))
    except (TypeError, ValueError):
        return None


def build_nodes_07(locations: list, location_tech_assignments: dict,
                   technologies: list, warnings: list) -> dict:
    """0.6 locations → 0.7 nodes (latitude/longitude, techs with translated
    per-node overrides). Mirrors build_locations_config() semantics: same id
    normalisation, hub-label skipping, assignment fallbacks."""
    tech_ref_map = {}
    parent_by_tid = {}
    for tech in technologies or []:
        tid = tech_id(tech)
        tech_ref_map[tid] = tid
        tech_ref_map[tech.get('id', tid)] = tid
        tech_ref_map[tech.get('name', tid)] = tid
        ess = tech.get('essentials') or {}
        parent_by_tid[tid] = ess.get('parent') or tech.get('parent') or 'supply'

    # Calliope 0.7 requires node coordinates to be all-or-nothing: every node
    # must define latitude+longitude, or none may. Emitting them for only some
    # nodes raises "Must define node latitude and longitude for _all_ nodes or
    # _no_ nodes." Decide up front and drop coordinates entirely on any gap
    # (link distances come from each link's explicit `distance`, not coords).
    coords_by_key = {}
    for loc in locations or []:
        raw_id = loc.get('id') or loc.get('name') or 'loc'
        coords_by_key[safe_id(raw_id).lower()] = _extract_coords(loc)
    emit_coords = bool(coords_by_key) and all(c is not None for c in coords_by_key.values())
    if not emit_coords and any(c is not None for c in coords_by_key.values()):
        missing = sorted(k for k, c in coords_by_key.items() if c is None)
        warnings.append(
            f"node coordinates dropped: {len(missing)} of {len(coords_by_key)} node(s) "
            f"lack latitude/longitude and Calliope 0.7 requires all-or-nothing "
            f"(missing: {', '.join(missing[:5])}{'…' if len(missing) > 5 else ''})"
        )

    nodes = {}
    for loc in locations or []:
        raw_id = loc.get('id') or loc.get('name') or 'loc'
        loc_id = safe_id(raw_id).lower()  # match 0.6 runner's lowercase keys

        cfg = {}
        if emit_coords:
            lat, lng = coords_by_key[loc_id]
            cfg['latitude'] = lat
            cfg['longitude'] = lng

        assigned_from_assignments = ((location_tech_assignments or {}).get(raw_id)
                                     or (location_tech_assignments or {}).get(loc_id) or [])
        loc_techs_direct = loc.get('techs') or {}
        assigned = assigned_from_assignments if assigned_from_assignments else list(loc_techs_direct.keys())
        use_direct = not assigned_from_assignments

        resolved = {}
        for ref in assigned:
            normalized = str(ref).replace(' ', '_').lower()
            tkey = tech_ref_map.get(ref) or tech_ref_map.get(normalized)
            if tkey:
                per_loc = None
                if use_direct:
                    per_loc = loc_techs_direct.get(ref) or loc_techs_direct.get(normalized)
                if isinstance(per_loc, dict):
                    parent = parent_by_tid.get(tkey, 'supply')
                    per_constraints = per_loc.get('constraints') if 'constraints' in per_loc else per_loc
                    resolved[tkey] = translate_constraints(
                        per_constraints, parent, warnings, f"{loc_id}.{tkey}") or None
                else:
                    resolved[tkey] = None
            elif normalized in HUB_LABELS:
                continue  # topology marker, not a tech
            else:
                warnings.append(f"{loc_id}: undefined tech reference '{ref}' skipped")
        cfg['techs'] = resolved   # always present; Calliope 0.7 requires techs: {} even on pure-junction nodes

        nodes[loc_id] = cfg
    return nodes


def build_transmission_techs_07(links: list, techs_07: dict,
                                link_type_defaults: dict, warnings: list) -> dict:
    """0.6 links → per-link 0.7 transmission techs with link_from/link_to.

    0.7 has no top-level links section: each link becomes its own tech
    entry (named '<base_tech_key>_<from>_<to>') inheriting the translated
    parameters of its transmission tech definition, plus distance.
    """
    out = {}
    for link in links or []:
        from_loc = safe_id(link.get('from') or '').lower()
        to_loc = safe_id(link.get('to') or '').lower()
        if not from_loc or not to_loc:
            continue

        tech_field = link.get('tech')
        if not tech_field:
            link_type = link.get('linkType')
            if link_type and link_type in (link_type_defaults or {}):
                tech_field = link_type_defaults[link_type]['calliopeTech']
            else:
                old_techs = link.get('techs')
                tech_field = (old_techs[0] if old_techs else None) or 'ac_transmission'
        tech_key = safe_id(tech_field).lower()   # safe_id ensures no hyphens or leading digits

        base_def = techs_07.get(tech_key)
        if base_def is None:
            # Minimal auto-definition, mirroring _ensure_link_techs_defined()
            defaults = (link_type_defaults or {}).get(link.get('linkType', ''), {})
            carrier = link.get('carrier') or defaults.get('carrier', 'electricity')
            base_def = {
                'base_tech': 'transmission',
                'name': tech_key.replace('_', ' ').title(),
                'carrier_in': carrier,
                'carrier_out': carrier,
                'flow_out_eff': defaults.get('energy_eff', 0.95),
                'lifetime': defaults.get('lifetime', 25),
                'cost_interest_rate': _wrap_cost(0.05),
                'cost_flow_cap_per_distance': _wrap_cost(defaults.get('energy_cap_per_distance', 1.0)),
            }
            techs_07[tech_key] = base_def
            warnings.append(f"link {from_loc}->{to_loc}: auto-defined transmission tech '{tech_key}'")

        link_tech_id = f"{tech_key}_{from_loc}_{to_loc}"
        entry = dict(base_def)
        entry['link_from'] = from_loc
        entry['link_to'] = to_loc
        distance = link.get('distance')
        if distance is not None:
            try:
                entry['distance'] = float(distance)
            except (TypeError, ValueError):
                pass
        out[link_tech_id] = entry
    return out


def _expand_dots(d: dict) -> dict:
    """Expand Calliope dot-notation keys ('techs.x.constraints.y': v) into
    nested dicts — overrides commonly use this shorthand."""
    out = {}
    for key, val in (d or {}).items():
        parts = str(key).split('.')
        cursor = out
        for part in parts[:-1]:
            nxt = cursor.get(part)
            if not isinstance(nxt, dict):
                nxt = {}
                cursor[part] = nxt
            cursor = nxt
        leaf = val
        if isinstance(val, dict):
            leaf = _expand_dots(val)
            if isinstance(cursor.get(parts[-1]), dict):
                cursor[parts[-1]].update(leaf)
                continue
        cursor[parts[-1]] = leaf
    return out


def translate_override_07(override: dict, parent_by_tid: dict, warnings: list,
                          override_name: str = '') -> dict:
    """Translate one 0.6-format override document into 0.7 vocabulary.

    Handles the common override shapes: techs.* (essentials/constraints/
    costs), locations.* (per-node tech params), model/run config keys.
    Anything without a 0.7 equivalent is dropped with a warning.
    """
    src = _expand_dots(override)
    out: dict = {}
    label = f"override '{override_name}'" if override_name else 'override'

    for tid, tdef in (src.get('techs') or {}).items():
        if not isinstance(tdef, dict):
            continue
        parent = parent_by_tid.get(tid, 'supply')
        tgt: dict = {}
        ess = tdef.get('essentials') or {}
        for k, v in ess.items():
            if k in ('name', 'color'):
                tgt[k] = v
            elif k in ('carrier', 'carrier_in', 'carrier_out'):
                tgt['carrier_in' if k == 'carrier_in' else 'carrier_out'] = v
            elif k == 'parent':
                warnings.append(f"{label}: changing tech class of '{tid}' is not supported on 0.7 — dropped")
            else:
                warnings.append(f"{label}: essentials.{k} on '{tid}' dropped")
        tgt.update(translate_constraints(tdef.get('constraints'), parent, warnings, f"{label}:{tid}"))
        tgt.update(translate_costs(tdef.get('costs'), warnings, f"{label}:{tid}"))
        for k in tdef:
            if k not in ('essentials', 'constraints', 'costs'):
                warnings.append(f"{label}: techs.{tid}.{k} dropped")
        if tgt:
            out.setdefault('techs', {})[tid] = tgt

    for lid, ldef in (src.get('locations') or {}).items():
        if not isinstance(ldef, dict):
            continue
        # Calliope 0.6 allows a comma-separated list of location names as a
        # single override key ("Arica, Putre, Camarones") meaning "apply to
        # each of these locations". 0.7 has no such shorthand, so expand it
        # into one entry per node — otherwise a phantom combined node
        # ("arica_putre_camarones") is created without coordinates, which
        # breaks 0.7's all-or-nothing latitude/longitude rule.
        node_ids = [safe_id(part).lower() for part in str(lid).split(',') if part.strip()]
        if not node_ids:
            continue
        node_tgt: dict = {}
        ctx_id = ','.join(node_ids)
        for tid, tdef in (ldef.get('techs') or {}).items():
            parent = parent_by_tid.get(tid, 'supply')
            per = tdef.get('constraints') if isinstance(tdef, dict) and 'constraints' in tdef else tdef
            translated = translate_constraints(per if isinstance(per, dict) else {},
                                               parent, warnings, f"{label}:{ctx_id}.{tid}")
            node_tgt.setdefault('techs', {})[tid] = translated or None
        if 'exists' in ldef:
            node_tgt['active'] = bool(ldef['exists'])
        if node_tgt:
            for nid in node_ids:
                dst = out.setdefault('nodes', {}).setdefault(nid, {})
                for k, v in node_tgt.items():
                    if k == 'techs':
                        dst.setdefault('techs', {}).update(v)
                    else:
                        dst[k] = v

    run_cfg = src.get('run') or {}
    model_cfg = src.get('model') or {}
    if run_cfg.get('solver'):
        out.setdefault('config', {}).setdefault('solve', {})['solver'] = \
            normalize_solver_07(run_cfg['solver'])
    if run_cfg.get('mode'):
        out.setdefault('config', {}).setdefault('init', {})['mode'] = \
            MODE_MAP.get(run_cfg['mode'], 'base')
    if run_cfg.get('ensure_feasibility') is not None:
        out.setdefault('config', {}).setdefault('build', {})['ensure_feasibility'] = \
            bool(run_cfg['ensure_feasibility'])
    if model_cfg.get('subset_time'):
        st = model_cfg['subset_time']
        if isinstance(st, (list, tuple)) and len(st) == 2:
            out.setdefault('config', {}).setdefault('init', {})['subset'] = {
                'timesteps': [f'{str(st[0])[:10]} 00:00:00', f'{str(st[1])[:10]} 23:00:00']}

    for k in src:
        if k not in ('techs', 'locations', 'run', 'model'):
            warnings.append(f"{label}: top-level '{k}' has no 0.7 equivalent — dropped")
    return out


def build_config_07(model_name: str, mode: str, time_start: str, time_end: str,
                    solver: str, solver_options: dict | None,
                    ensure_feasibility: bool = True) -> dict:
    """TEMPO run settings → 0.7 config.init/build/solve."""
    return {
        'init': {
            'name': model_name,
            'mode': MODE_MAP.get(mode, 'base'),
            'subset': {
                'timesteps': [
                    f'{str(time_start)[:10]} 00:00:00',
                    f'{str(time_end)[:10]} 23:00:00',
                ],
            },
        },
        'build': {
            'backend': 'gurobi' if solver == 'gurobi_direct' else 'pyomo',
            'ensure_feasibility': bool(ensure_feasibility),
        },
        'solve': {
            'solver': normalize_solver_07(solver),
            **({'solver_options': solver_options} if solver_options else {}),
        },
    }


def normalize_solver_07(solver: str) -> str:
    """Map any solver name to one available in the TEMPO 0.7 Docker service.

    The 0.7 service ships HiGHS (apt) and CBC (coinor-cbc). Commercial
    solvers (gurobi, cplex) and APPSI variants are mapped to 'highs'.
    Calliope model overrides often carry a solver from the original 0.6
    run (e.g. run.solver: gurobi); normalising here prevents calliope
    0.7 from receiving an unavailable solver name.
    Empty/None defaults to 'highs'."""
    if solver in ('cbc', 'glpk'):
        return solver
    # Everything else → highs: covers 'highs', 'appsi_highs', 'highs_direct',
    # 'gurobi', 'gurobi_direct', 'cplex', '', None, …
    return 'highs'
