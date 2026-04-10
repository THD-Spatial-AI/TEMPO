#!/usr/bin/env python3
"""
Calliope Model Runner
---------------------
Accepts a model configuration JSON file, converts it to Calliope YAML format,
runs the optimisation, and writes results to an output JSON file.

Usage:
    python calliope_runner.py <input_json> <output_json>
"""

import sys
import json
import os
import tempfile
import shutil
import traceback
import logging
import threading
from pathlib import Path

# Thread-local storage so each job thread can have its own log callback
_thread_local = threading.local()


# ---------------------------------------------------------------------------
# Bundled solver helper
# ---------------------------------------------------------------------------

def _setup_bundled_solver():
    """
    Prepend the repo's ``solvers/<platform>/`` directory to PATH so that
    Pyomo can find ``cbc`` (or ``glpk``) without any system-wide install.

    Works both in development (relative to this file) and when packaged inside
    an Electron asar.unpacked bundle (CALLIOPE_SOLVER_DIR env var override).
    """
    import platform as _platform

    # Allow electron/main.cjs to pass an explicit path via env var
    override = os.environ.get('CALLIOPE_SOLVER_DIR', '').strip()
    if override:
        solver_dirs = [Path(override)]
    else:
        # Resolve the repo root: this file lives at  <repo>/python/calliope_runner.py
        repo_root = Path(__file__).resolve().parent.parent
        system = _platform.system().lower()   # 'windows', 'linux', 'darwin'
        platform_dir = {
            'windows': 'windows',
            'linux':   'linux',
            'darwin':  'mac',
        }.get(system, system)
        solver_dirs = [
            repo_root / 'solvers' / platform_dir,
            repo_root / 'solvers' / 'windows',   # fallback for Windows-only bundles
        ]

    added = []
    for d in solver_dirs:
        if d.is_dir():
            s = str(d)
            if s not in os.environ.get('PATH', '').split(os.pathsep):
                os.environ['PATH'] = s + os.pathsep + os.environ.get('PATH', '')
                added.append(s)

    if added:
        log(f"  Bundled solver dir added to PATH: {', '.join(added)}")

    # Quick sanity-check: is cbc on PATH now?
    import shutil as _shutil
    if _shutil.which('cbc') or _shutil.which('cbc.exe'):
        log("  CBC solver found on PATH ✓")
    else:
        log("  WARNING: cbc not found on PATH — run scripts/download_cbc.ps1 first")

# ---------------------------------------------------------------------------
# OEO Tech Database integration (optional – graceful fallback if offline)
# ---------------------------------------------------------------------------

try:
    # Allow running from the repo root or from the python/ sub-directory
    _this_dir = Path(__file__).resolve().parent
    if str(_this_dir) not in sys.path:
        sys.path.insert(0, str(_this_dir.parent))  # add repo root
    if str(_this_dir) not in sys.path:
        sys.path.insert(0, str(_this_dir))          # add python/

    from python.services.tech_database import (
        get_technology,
        is_api_available,
        TechDatabaseOfflineError,
        TechNotFoundError,
        configure as configure_tech_db,
    )
    from python.adapters.calliope_adapter import enrich_calliope_tech_dict, to_calliope_tech

    _OEO_INTEGRATION_AVAILABLE = True
except ImportError:
    _OEO_INTEGRATION_AVAILABLE = False

logging.basicConfig(level=logging.WARNING)


def log(msg):
    """Print a tagged log line, or call the per-thread log callback if set."""
    fn = getattr(_thread_local, 'log_fn', None)
    if fn is not None:
        fn(f"[CALLIOPE] {msg}")
    else:
        print(f"[CALLIOPE] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------

def convert_value(val):
    """Convert JS 'inf' / '.inf' strings to Python float."""
    if isinstance(val, str) and val.lower() in ('inf', '.inf'):
        return float('inf')
    return val


def _represent_float(dumper, value):
    """Custom YAML float representer: float('inf') → .inf."""
    import yaml
    if value == float('inf'):
        return dumper.represent_scalar('tag:yaml.org,2002:float', '.inf')
    if value == float('-inf'):
        return dumper.represent_scalar('tag:yaml.org,2002:float', '-.inf')
    return yaml.Dumper.represent_float(dumper, value)


def dump_yaml(data):
    """Dump a dict to a YAML string, preserving .inf correctly."""
    import yaml

    class _Dumper(yaml.Dumper):
        pass

    _Dumper.add_representer(float, _represent_float)
    return yaml.dump(data, Dumper=_Dumper, default_flow_style=False,
                     allow_unicode=True)


# ---------------------------------------------------------------------------
# Model component builders
# ---------------------------------------------------------------------------

def _tech_id(tech):
    """Derive a clean snake_case Calliope tech identifier."""
    return (tech.get('name') or tech.get('id') or 'unknown').replace(' ', '_').lower()


# ---------------------------------------------------------------------------
# Default parameters for each link type (mirrors src/config/linkTypes.js)
# ---------------------------------------------------------------------------

_LINK_TYPE_DEFAULTS = {
    'hvac_overhead':   {'calliopeTech': 'hvac_overhead_lines',       'carrier': 'electricity', 'energy_eff': 0.98, 'lifetime': 40, 'energy_cap_per_distance': 0.91},
    'hvdc_overhead':   {'calliopeTech': 'hvdc_overhead_lines',        'carrier': 'electricity', 'energy_eff': 0.97, 'lifetime': 40, 'energy_cap_per_distance': 1.10},
    'hvac_cable':      {'calliopeTech': 'hvac_underground_cables',    'carrier': 'electricity', 'energy_eff': 0.97, 'lifetime': 40, 'energy_cap_per_distance': 3.00},
    'hvdc_subsea':     {'calliopeTech': 'hvdc_subsea_cables',         'carrier': 'electricity', 'energy_eff': 0.96, 'lifetime': 40, 'energy_cap_per_distance': 4.50},
    'district_heat':   {'calliopeTech': 'district_heating_networks',  'carrier': 'heat',        'energy_eff': 0.90, 'lifetime': 40, 'energy_cap_per_distance': 0.60},
    'district_cooling':{'calliopeTech': 'district_cooling_networks',  'carrier': 'cooling',     'energy_eff': 0.92, 'lifetime': 40, 'energy_cap_per_distance': 0.70},
    'h2_pipeline':     {'calliopeTech': 'hydrogen_pipelines',         'carrier': 'hydrogen',    'energy_eff': 0.98, 'lifetime': 40, 'energy_cap_per_distance': 1.20},
    'h2_truck':        {'calliopeTech': 'hydrogen_truck',             'carrier': 'hydrogen',    'energy_eff': 0.95, 'lifetime': 15, 'energy_cap_per_distance': 0.20},
    'gas_pipeline':    {'calliopeTech': 'natural_gas_pipelines',      'carrier': 'gas',         'energy_eff': 0.99, 'lifetime': 50, 'energy_cap_per_distance': 0.50},
    'biogas_pipeline': {'calliopeTech': 'biogas_pipelines',           'carrier': 'biogas',      'energy_eff': 0.98, 'lifetime': 30, 'energy_cap_per_distance': 0.40},
    'co2_pipeline':    {'calliopeTech': 'co2_pipelines',              'carrier': 'co2',         'energy_eff': 0.99, 'lifetime': 40, 'energy_cap_per_distance': 0.80},
    'biomass_truck':   {'calliopeTech': 'biomass_truck',              'carrier': 'biomass',     'energy_eff': 0.97, 'lifetime': 15, 'energy_cap_per_distance': 0.10},
    'biomass_train':   {'calliopeTech': 'biomass_train',              'carrier': 'biomass',     'energy_eff': 0.98, 'lifetime': 30, 'energy_cap_per_distance': 0.05},
    'oil_pipeline':    {'calliopeTech': 'oil_pipelines',              'carrier': 'oil',         'energy_eff': 0.995,'lifetime': 50, 'energy_cap_per_distance': 0.45},
    'oil_truck':       {'calliopeTech': 'fuel_truck',                 'carrier': 'oil',         'energy_eff': 0.98, 'lifetime': 15, 'energy_cap_per_distance': 0.15},
    'water_pipeline':  {'calliopeTech': 'water_pipelines',            'carrier': 'water',       'energy_eff': 0.99, 'lifetime': 60, 'energy_cap_per_distance': 0.30},
}


# ---------------------------------------------------------------------------
# OEO API enrichment helper
# ---------------------------------------------------------------------------

def _enrich_tech_from_oeo_api(tech: dict, oeo_api_id: str) -> dict:
    """
    Attempt to fetch updated parameters for *tech* from the OEO API and merge
    them into the existing tech dict (in Calliope format).

    Returns the (possibly enriched) tech dict unchanged if:
    - the OEO integration modules are not importable, or
    - the API is offline, or
    - the technology is not found in the API catalog.

    Parameters
    ----------
    tech : dict
        Existing technology dict in the shape the UI sends
        (keys: name, parent, essentials, constraints, costs, …).
    oeo_api_id : str
        The identifier to look up in the OEO API.

    Returns
    -------
    dict  – enriched (or original) tech dict.
    """
    if not _OEO_INTEGRATION_AVAILABLE:
        return tech

    try:
        oeo_tech = get_technology(oeo_api_id)
    except TechDatabaseOfflineError:
        log(f"  [OEO] API offline – using local data for '{oeo_api_id}'")
        return tech
    except TechNotFoundError:
        log(f"  [OEO] '{oeo_api_id}' not in API catalog – keeping local data")
        return tech
    except Exception as exc:
        log(f"  [OEO] Unexpected error for '{oeo_api_id}': {exc}")
        return tech

    # Build a minimal Calliope-style dict from the tech (as the runner expects)
    # so enrich_calliope_tech_dict can merge into it.
    tid = _tech_id(tech)
    existing_block = {
        tid: {
            'essentials': tech.get('essentials', {
                'name': tech.get('name', tid),
                'parent': tech.get('parent', 'supply'),
                'carrier_out': 'electricity',
            }),
            'constraints': tech.get('constraints', {}),
            'costs': tech.get('costs', {}),
        }
    }

    try:
        enriched_block = enrich_calliope_tech_dict(
            existing_block, oeo_tech, overwrite=True
        )
        # Unpack back into the flat tech dict the runner uses
        enriched_def = enriched_block[tid]
        result = dict(tech)
        result['essentials'] = enriched_def.get('essentials', tech.get('essentials', {}))
        result['constraints'] = enriched_def.get('constraints', tech.get('constraints', {}))
        result['costs'] = enriched_def.get('costs', tech.get('costs', {}))
        log(f"  [OEO] Enriched '{tid}' with live data (source: {oeo_tech.source_url or 'API'})")
        return result
    except Exception as exc:
        log(f"  [OEO] Enrichment merge failed for '{tid}': {exc} – keeping local data")
        return tech


def enrich_technologies_from_oeo_api(technologies: list) -> list:
    """
    Attempt to enrich *all* technologies in the list with live OEO API data.

    This function is called automatically in ``run_model()`` when the API is
    reachable.  Each technology is matched to an OEO API identifier using a
    best-effort name-normalisation strategy.

    Parameters
    ----------
    technologies : list[dict]
        The technologies list from the model payload.

    Returns
    -------
    list[dict]  – (possibly partially) enriched technologies.
    """
    if not _OEO_INTEGRATION_AVAILABLE:
        return technologies

    if not is_api_available():
        log("[OEO] Tech Database API unreachable – running with local technology data.")
        return technologies

    log(f"[OEO] Tech Database API is online – enriching {len(technologies)} technologies …")

    enriched = []
    for tech in technologies:
        # Derive the API lookup ID: prefer explicit 'id' field, otherwise normalise name
        api_id = (
            tech.get('id')
            or tech.get('name', '')
        ).replace(' ', '_').lower()

        enriched.append(_enrich_tech_from_oeo_api(tech, api_id))

    return enriched


def build_techs_config(technologies):
    """Convert the app's technology list to a Calliope `techs:` dict."""
    techs = {}
    for tech in technologies:
        tid = _tech_id(tech)
        cfg = {}

        essentials = tech.get('essentials', {})
        if essentials:
            # Keep 'parent' first for readability
            ess = {'parent': essentials.get('parent', tech.get('parent', 'supply'))}
            for k, v in essentials.items():
                if k != 'parent':
                    ess[k] = v
            cfg['essentials'] = ess
        else:
            cfg['essentials'] = {
                'name': tech.get('name', tid),
                'parent': tech.get('parent', 'supply'),
                'carrier_out': 'electricity',
            }

        constraints = tech.get('constraints', {})
        if constraints:
            cfg['constraints'] = {k: convert_value(v) for k, v in constraints.items()}

        costs = tech.get('costs', {})
        if costs:
            cfg['costs'] = {
                cost_class: (
                    {k: convert_value(v) for k, v in cost_vals.items()}
                    if isinstance(cost_vals, dict)
                    else convert_value(cost_vals)
                )
                for cost_class, cost_vals in costs.items()
            }

        techs[tid] = cfg
    return techs


def build_locations_config(locations, location_tech_assignments, technologies):
    """Convert the app's location list + assignments to Calliope `locations:` dict."""
    # Build mapping from any form of tech reference → calliope tech id
    tech_id_map = {}
    for tech in technologies:
        tid = _tech_id(tech)
        tech_id_map[tid] = tid
        tech_id_map[tech.get('id', tid)] = tid
        tech_id_map[tech.get('name', tid)] = tid

    locs = {}
    for loc in locations:
        raw_id = loc.get('id') or loc.get('name') or 'loc'
        loc_id = raw_id.replace(' ', '_')

        cfg = {}
        lat = loc.get('lat') or loc.get('latitude')
        lng = loc.get('lng') or loc.get('lon') or loc.get('longitude')
        if lat is not None and lng is not None:
            cfg['coordinates'] = {'lat': lat, 'lon': lng}

        # Assignments may be keyed by original id or normalised id.
        # Fall back to the location's own techs dict (set when loading templates)
        # so that template models work without needing explicit locationTechAssignments.
        assigned = (location_tech_assignments.get(raw_id) or
                    location_tech_assignments.get(loc_id) or [])
        if not assigned:
            loc_techs_direct = loc.get('techs') or {}
            assigned = list(loc_techs_direct.keys())

        if assigned:
            cfg['techs'] = {
                tech_id_map.get(ref, ref.replace(' ', '_').lower()): None
                for ref in assigned
            }

        locs[loc_id] = cfg
    return locs


def _ensure_link_techs_defined(techs_dict, links):
    """
    For each link that references a tech not yet in *techs_dict*, auto-generate
    a minimal transmission tech entry using _LINK_TYPE_DEFAULTS.
    Modifies *techs_dict* in-place.
    """
    for link in links:
        # Derive the Calliope tech key used by this link
        tech_key = link.get('tech')
        if not tech_key:
            link_type = link.get('linkType')
            if link_type and link_type in _LINK_TYPE_DEFAULTS:
                tech_key = _LINK_TYPE_DEFAULTS[link_type]['calliopeTech']
            else:
                tech_key = 'ac_transmission'
        tech_key = tech_key.replace(' ', '_').lower()

        if tech_key in techs_dict:
            continue  # already defined – nothing to add

        # Try to build from _LINK_TYPE_DEFAULTS
        link_type = link.get('linkType', '')
        defaults = _LINK_TYPE_DEFAULTS.get(link_type, {})
        carrier = link.get('carrier') or defaults.get('carrier', 'electricity')
        energy_eff = defaults.get('energy_eff', 0.95)
        lifetime = defaults.get('lifetime', 25)
        energy_cap_per_distance = defaults.get('energy_cap_per_distance', 1.0)

        log(f"  Auto-defining missing transmission tech '{tech_key}' (carrier: {carrier})")
        techs_dict[tech_key] = {
            'essentials': {
                'name': tech_key.replace('_', ' ').title(),
                'parent': 'transmission',
                'carrier': carrier,
            },
            'constraints': {
                'energy_cap_max': float('inf'),
                'energy_eff': energy_eff,
                'lifetime': lifetime,
            },
            'costs': {
                'monetary': {
                    'interest_rate': 0.05,
                    'energy_cap_per_distance': energy_cap_per_distance,
                }
            },
        }


def build_links_config(links):
    """Convert the app's links list to a Calliope `links:` dict."""
    calliope_links = {}
    for link in links:
        from_loc = (link.get('from') or '').replace(' ', '_')
        to_loc = (link.get('to') or '').replace(' ', '_')
        if not from_loc or not to_loc:
            continue

        # New format: single 'tech' string (Calliope tech key)
        # Fallback: legacy 'techs' list, then default
        tech_field = link.get('tech')
        if not tech_field:
            link_type = link.get('linkType')
            if link_type and link_type in _LINK_TYPE_DEFAULTS:
                tech_field = _LINK_TYPE_DEFAULTS[link_type]['calliopeTech']
            else:
                old_techs = link.get('techs')
                tech_field = (old_techs[0] if old_techs else None) or 'ac_transmission'
        tech_key = tech_field.replace(' ', '_').lower()

        link_entry = {'techs': {tech_key: None}}

        # Include distance inside the tech entry (Calliope 0.6 format):
        # links:
        #   A,B:
        #     techs:
        #       my_transmission_tech:
        #         distance: 500
        distance = link.get('distance')
        if distance is not None:
            try:
                link_entry['techs'][tech_key] = {'distance': float(distance)}
            except (ValueError, TypeError):
                pass

        calliope_links[f"{from_loc},{to_loc}"] = link_entry
    return calliope_links


# ---------------------------------------------------------------------------
# Demand profile writer (uses per-location demandProfile timeseries data)
# ---------------------------------------------------------------------------

def _write_demand_profiles(locations, locs_cfg, techs, time_start, time_end, config_dir):
    """
    When location objects carry a ``demandProfile.timeseries`` array (as set by
    the frontend when loading a template), write an hourly demand CSV and inject
    per-location resource references into ``locs_cfg`` for every demand tech.

    Returns the set of demand tech IDs that were handled so that
    _write_scalar_demand_timeseries can skip them.
    """
    import itertools
    import pandas as pd

    demand_tech_ids = [
        tid for tid, tdef in techs.items()
        if (tdef.get('essentials') or {}).get('parent') == 'demand'
    ]
    if not demand_tech_ids:
        return set()

    # Collect locations that have actual timeseries data
    profiled = []
    for loc in locations:
        dp = loc.get('demandProfile') or {}
        ts = dp.get('timeseries')
        if ts and len(ts) > 0:
            profiled.append((loc.get('name', ''), ts))

    if not profiled:
        return set()

    try:
        end_inclusive = pd.Timestamp(time_end) + pd.Timedelta(hours=23)
        ts_index = pd.date_range(start=time_start, end=end_inclusive, freq='H')
    except Exception:
        ts_index = pd.date_range(start=time_start, periods=48, freq='H')

    if len(ts_index) == 0:
        ts_index = pd.date_range(start=time_start, periods=48, freq='H')

    # Build demand CSV columns (one per location with profile data)
    csv_data = {}
    for loc_name, ts_vals in profiled:
        col = loc_name.replace(' ', '_')
        # Tile the pattern to cover the full model period, negate for Calliope convention
        vals = list(itertools.islice(itertools.cycle(ts_vals), len(ts_index)))
        csv_data[col] = [-v for v in vals]

    if not csv_data:
        return set()

    import pandas as pd
    df = pd.DataFrame(csv_data, index=ts_index)
    csv_name = 'demand_profiles.csv'
    df.to_csv(config_dir / csv_name)

    handled = set()
    for demand_tid in demand_tech_ids:
        # Remove any global scalar resource — it will be set per-location
        techs[demand_tid].setdefault('constraints', {}).pop('resource', None)
        techs[demand_tid]['constraints']['force_resource'] = True
        handled.add(demand_tid)

        for loc_name, _ in profiled:
            col = loc_name.replace(' ', '_')
            loc_key = loc_name.replace(' ', '_')
            if loc_key not in locs_cfg:
                continue
            loc_techs = locs_cfg[loc_key].setdefault('techs', {})
            if demand_tid not in loc_techs:
                loc_techs[demand_tid] = {}
            if isinstance(loc_techs[demand_tid], dict):
                loc_techs[demand_tid].setdefault('constraints', {})['resource'] = (
                    f'file={csv_name}:{col}'
                )
            else:
                loc_techs[demand_tid] = {'constraints': {'resource': f'file={csv_name}:{col}'}}

    log(f"  Written demand profiles CSV: {csv_name} "
        f"({len(ts_index)} hours, {len(csv_data)} location(s))")
    return handled


# ---------------------------------------------------------------------------
# Timeseries helper
# ---------------------------------------------------------------------------

def _write_scalar_demand_timeseries(techs, locs_cfg, loc_tech_assign,
                                    time_start, time_end, config_dir,
                                    technologies=None):
    """
    Calliope 0.6 requires at least one timeseries in the model.

    For every tech that has a plain numeric ``resource`` constraint (not a
    ``file=...`` string and not ±inf), this function:
      1. Generates a flat hourly CSV with a single column named after the tech.
      2. Removes the scalar ``resource`` from the global tech constraints.
      3. Injects ``resource: file=<csv>:<col>`` into each location's per-tech
         override block in *locs_cfg*, following the Calliope 0.6 convention.

    Returns True if at least one timeseries was generated.

    The CSV is written into *config_dir* next to techs.yaml / locations.yaml.
    """
    import pandas as pd

    # Build a reverse mapping: any raw tech reference → Calliope tid.
    # loc_tech_assign may use 'id' or 'name' fields while techs is keyed
    # by the name-derived calliope id – bridge the gap here.
    raw_to_tid = {}
    for tid in techs:
        raw_to_tid[tid] = tid
    if technologies:
        for tech in technologies:
            cid = _tech_id(tech)
            raw_to_tid[tech.get('id', cid)] = cid
            raw_to_tid[tech.get('name', cid)] = cid
            raw_to_tid[(tech.get('name', '') or '').replace(' ', '_').lower()] = cid

    # Calliope subset_time end is day-inclusive, so cover through 23:00 of
    # time_end to ensure the CSV spans the full requested period.
    try:
        end_inclusive = pd.Timestamp(time_end) + pd.Timedelta(hours=23)
        ts_index = pd.date_range(start=time_start, end=end_inclusive, freq='H')
    except Exception:
        ts_index = pd.date_range(start=time_start, periods=48, freq='H')

    if len(ts_index) == 0:
        ts_index = pd.date_range(start=time_start, periods=48, freq='H')

    generated = False

    for tid, tdef in techs.items():
        constraints = tdef.get('constraints') or {}
        resource_val = constraints.get('resource')

        # Only act on scalar numeric resources
        if resource_val is None:
            continue
        if isinstance(resource_val, str) and resource_val.startswith('file='):
            continue
        if isinstance(resource_val, float) and (
                resource_val == float('inf') or resource_val == float('-inf')):
            continue
        if isinstance(resource_val, str) and resource_val.lower() in ('.inf', '-.inf', 'inf'):
            continue

        try:
            scalar = float(resource_val)
        except (TypeError, ValueError):
            continue  # leave as-is

        # Write a single-column CSV;  column name = tech id (simple, unambiguous)
        col_name = tid
        csv_name = f"{tid}_resource.csv"
        df = pd.DataFrame({col_name: [scalar] * len(ts_index)}, index=ts_index)
        df.to_csv(config_dir / csv_name)

        resource_ref = f'file={csv_name}:{col_name}'

        # Remove the scalar resource from the global tech definition –
        # it will be set per-location instead (Calliope 0.6 best practice).
        del constraints['resource']

        # Inject resource override into every location that uses this tech.
        # Match by any raw form (id, name, calliope-normalised id).
        injected_count = 0
        for loc_id, assigned in loc_tech_assign.items():
            loc_key = loc_id.replace(' ', '_')
            if loc_key not in locs_cfg:
                continue
            loc_has_tech = any(
                raw_to_tid.get(ref, ref.replace(' ', '_').lower()) == tid
                for ref in assigned
            )
            if not loc_has_tech:
                continue
            loc_techs = locs_cfg[loc_key].setdefault('techs', {})
            if loc_techs.get(tid) is None:
                loc_techs[tid] = {}
            if isinstance(loc_techs[tid], dict):
                loc_techs[tid].setdefault('constraints', {})['resource'] = resource_ref
            else:
                loc_techs[tid] = {'constraints': {'resource': resource_ref}}
            injected_count += 1

        # Fallback: when locationTechAssignments is empty (template models), scan
        # locs_cfg directly for locations that already list this tech.
        if injected_count == 0:
            for loc_block in locs_cfg.values():
                if tid in (loc_block.get('techs') or {}):
                    t_slot = loc_block['techs'][tid]
                    if t_slot is None:
                        loc_block['techs'][tid] = {'constraints': {'resource': resource_ref}}
                    elif isinstance(t_slot, dict):
                        t_slot.setdefault('constraints', {})['resource'] = resource_ref
                    injected_count += 1

        generated = True
        log(f"  Generated timeseries CSV for '{tid}': {csv_name} "
            f"({len(ts_index)} hours, injected into {injected_count} location(s))")

    # If nothing was generated, create a minimal dummy timeseries so Calliope
    # doesn't complain – attach it to the first demand tech.
    if not generated:
        demand_tech = next(
            (tid for tid, tdef in techs.items()
             if (tdef.get('essentials') or {}).get('parent') == 'demand'),
            next(iter(techs), None)
        )
        if demand_tech:
            col_name = demand_tech
            csv_name = f"{demand_tech}_resource.csv"
            df = pd.DataFrame({col_name: [-100.0] * len(ts_index)}, index=ts_index)
            df.to_csv(config_dir / csv_name)
            resource_ref = f'file={csv_name}:{col_name}'
            # Set at the global tech level as fallback
            techs[demand_tech].setdefault('constraints', {})['resource'] = resource_ref
            generated = True
            log(f"  Generated fallback timeseries CSV: {csv_name}")

    return generated


# ---------------------------------------------------------------------------
# Main run logic  
# ---------------------------------------------------------------------------

def run_model(model_data, work_dir, log_fn=None):
    """
    Build, run, and return results from a Calliope model.

    Parameters
    ----------
    model_data : dict  – model payload from the frontend
    work_dir   : str   – writable temporary directory for YAML/CSV files
    log_fn     : callable | None – optional callback(str) for log lines.
                 When set (e.g. from the web service), log lines are passed
                 to the callback instead of printed to stdout.
    """
    _thread_local.log_fn = log_fn
    try:
        return _run_model_impl(model_data, work_dir)
    finally:
        _thread_local.log_fn = None


def _run_model_impl(model_data, work_dir):
    """Internal implementation – call run_model() instead."""
    import calliope  # noqa – must run inside the calliope conda environment  # type: ignore

    # Inject bundled CBC so Pyomo can find it without a system-wide install
    _setup_bundled_solver()

    model_name = model_data.get('name', 'Model')
    locations = model_data.get('locations', [])
    links = model_data.get('links', [])
    technologies = model_data.get('technologies', [])
    loc_tech_assign = model_data.get('locationTechAssignments', {})
    parameters = model_data.get('parameters') or []
    solver = model_data.get('solver', 'cbc')   # default: CBC (free, open-source, bundled)
    overrides = model_data.get('overrides') or {}
    scenarios = model_data.get('scenarios') or {}

    # ------------------------------------------------------------------
    # Solver availability check — fall back gracefully when the requested
    # binary is not on PATH (e.g. 'highs' in the Docker container which
    # only has coinor-cbc installed).
    # ------------------------------------------------------------------
    import shutil as _shutil
    _SOLVER_BINARIES = {
        'highs':       ['highs'],
        'cbc':         ['cbc', 'cbc.exe'],
        'glpk':        ['glpsol'],
        'gurobi':      ['gurobi_cl'],
        'cplex':       ['cplex'],
        'highs_direct': ['highs'],
    }
    def _solver_available(name):
        for binary in _SOLVER_BINARIES.get(name, [name]):
            if _shutil.which(binary):
                return True
        return False

    if not _solver_available(solver):
        fallbacks = ['cbc', 'glpk']
        original = solver
        solver = next((s for s in fallbacks if _solver_available(s)), 'cbc')
        log(f"  WARNING: solver '{original}' not found on PATH — falling back to '{solver}'")

    log(f"Building model '{model_name}'")
    log(f"  Locations: {len(locations)}  Technologies: {len(technologies)}  Links: {len(links)}")

    # ------------------------------------------------------------------
    # Phase 0: Enrich technology parameters from OEO API (if available)
    # ------------------------------------------------------------------
    technologies = enrich_technologies_from_oeo_api(technologies)

    config_dir = Path(work_dir) / 'model_config'
    config_dir.mkdir(exist_ok=True)

    # ------------------------------------------------------------------
    # Determine time range from parameters list
    # ------------------------------------------------------------------
    time_start = '2005-01-01'
    time_end = '2005-01-07'       # short default so it runs fast
    if isinstance(parameters, list):
        for p in parameters:
            k = p.get('key', '')
            if k == 'subset_time_start':
                time_start = p.get('value', time_start)
            elif k == 'subset_time_end':
                time_end = p.get('value', time_end)

    # ------------------------------------------------------------------
    # Technologies
    # ------------------------------------------------------------------
    techs = build_techs_config(technologies)

    # Auto-define any transmission techs referenced by links but not in technologies list
    _ensure_link_techs_defined(techs, links)

    # Ensure at least one demand tech exists
    has_demand = any(
        (t.get('essentials', {}) or {}).get('parent', t.get('parent', '')) == 'demand'
        for t in technologies
    )
    if not has_demand and techs:
        log("  No demand tech found – adding default electricity demand")
        techs['demand_electricity'] = {
            'essentials': {
                'name': 'Electricity demand',
                'parent': 'demand',
                'carrier': 'electricity',
            },
            'constraints': {'resource': float('-inf'), 'force_resource': True},
        }

    # ------------------------------------------------------------------
    # Locations + links
    # ------------------------------------------------------------------
    locs = build_locations_config(locations, loc_tech_assign, technologies)
    if not locs:
        log("  No locations found – creating a single default region")
        locs = {'region1': {'techs': {tid: None for tid in techs}}}
    else:
        # If demand tech was added automatically, put it in every location
        if not has_demand and 'demand_electricity' in techs:
            for loc in locs.values():
                loc.setdefault('techs', {})['demand_electricity'] = None

        # Ensure template demand techs (power_demand etc.) are assigned to every
        # location that has supply techs.  Templates set demandTypes in a separate
        # CSV column that doesn't reach locationTechAssignments, so we add them
        # here instead of requiring manual wiring.
        demand_tech_ids = [
            tid for tid, tdef in techs.items()
            if (tdef.get('essentials') or {}).get('parent') == 'demand'
        ]
        # Transmission-only hub nodes (e.g. Node_North) must never receive demand.
        transmission_tids = {
            tid for tid, tdef in techs.items()
            if (tdef.get('essentials') or {}).get('parent') == 'transmission'
        }
        demand_already_located = any(
            dtid in (loc_block.get('techs') or {})
            for loc_block in locs.values()
            for dtid in demand_tech_ids
        )
        if demand_tech_ids and not demand_already_located:
            for loc_block in locs.values():
                loc_tech_keys = set(loc_block.get('techs') or {})
                # Skip pure transmission hubs – every tech they have is a transmission tech
                if loc_tech_keys and loc_tech_keys.issubset(transmission_tids):
                    continue
                if loc_tech_keys:
                    for dtid in demand_tech_ids:
                        loc_block['techs'].setdefault(dtid, None)
            log(f"  Assigned demand tech(s) {demand_tech_ids} to supply locations "
                f"(skipping transmission-only hubs)")

    links_cfg = build_links_config(links)

    # ------------------------------------------------------------------
    # Write YAML files
    # ------------------------------------------------------------------

    # Step 1: Use actual per-location demand timeseries from demandProfile
    # (set by the frontend when loading a template with a demand CSV).
    # Returns the set of demand tech IDs already handled so the next step skips them.
    _write_demand_profiles(locations, locs, techs, time_start, time_end, config_dir)

    # Step 2: For every remaining tech with a plain scalar `resource`, auto-generate
    # a flat CSV and inject the reference into each location's tech block.
    _write_scalar_demand_timeseries(techs, locs, loc_tech_assign,
                                    time_start, time_end, config_dir,
                                    technologies=technologies)

    with open(config_dir / 'techs.yaml', 'w') as f:
        f.write(dump_yaml({'techs': techs}))
    log("  Wrote techs.yaml")

    locations_doc = {'locations': locs}
    if links_cfg:
        locations_doc['links'] = links_cfg
    with open(config_dir / 'locations.yaml', 'w') as f:
        f.write(dump_yaml(locations_doc))
    log("  Wrote locations.yaml")

    # Solver-specific options
    solver_options = {}
    if solver in ('highs', 'highs_direct'):
        solver_options = {
            'mip_rel_gap': 1e-3,
            'primal_feasibility_tolerance': 1e-6,
            'dual_feasibility_tolerance': 1e-6,
            'ipm_optimality_tolerance': 1e-6,
        }
    elif solver in ('cbc',):
        solver_options = {'ratioGap': 1e-3}
    elif solver == 'glpk':
        solver_options = {'mipgap': 1e-3}

    run_cfg = {
        'solver': solver,
        'backend': 'pyomo',
        'objective_options': {'cost_class': {'monetary': 1}},
        'ensure_feasibility': True,
        'bigM': 1e6,
        'zero_threshold': 1e-10,
        'mode': 'plan',
    }
    if solver_options:
        run_cfg['solver_options'] = solver_options

    model_yaml = {
        'import': ['model_config/techs.yaml', 'model_config/locations.yaml'],
        'model': {
            'name': model_name,
            'calliope_version': '0.6.8',
            'timeseries_data_path': 'model_config',
            'subset_time': [time_start, time_end],
        },
        'run': run_cfg,
    }
    if overrides:
        model_yaml['overrides'] = overrides
    if scenarios:
        model_yaml['scenarios'] = scenarios

    model_yaml_path = Path(work_dir) / 'model.yaml'
    with open(model_yaml_path, 'w') as f:
        f.write(dump_yaml(model_yaml))
    log("  Wrote model.yaml")

    # ------------------------------------------------------------------
    # Load & run
    # ------------------------------------------------------------------
    log("Loading Calliope model …")
    model = calliope.Model(str(model_yaml_path))
    log(f"Running optimisation with solver={solver} …")
    model.run()
    log("Optimisation finished. Extracting results …")

    # ------------------------------------------------------------------
    # Extract results
    # ------------------------------------------------------------------
    results = {
        'model_name': model_name,
        'solver': solver,
        'success': True,
        'termination_condition': 'optimal',
    }

    ds = getattr(model, 'results', None)
    if ds is None:
        log("WARNING: model.results is None – no results to extract")
        return results

    # Termination condition
    tc = (getattr(ds, 'attrs', {}) or {}).get('termination_condition', 'optimal')
    results['termination_condition'] = str(tc)

    # Total cost (objective)
    if 'cost' in ds:
        try:
            results['objective'] = float(ds['cost'].sum().values)
        except Exception as e:
            log(f"  Could not extract objective: {e}")

    # Technology capacities
    if 'energy_cap' in ds:
        try:
            cap = ds['energy_cap'].to_pandas()
            results['capacities'] = {
                str(k): (float(v) if v == v else 0)   # nan → 0
                for k, v in cap.items()
            }
        except Exception as e:
            log(f"  Could not extract capacities: {e}")

    # Generation totals (sum over timesteps)
    if 'carrier_prod' in ds:
        try:
            gen = ds['carrier_prod'].sum(dim='timesteps').to_pandas()
            results['generation'] = {
                str(k): (float(v) if v == v else 0)
                for k, v in gen.items()
            }
        except Exception as e:
            log(f"  Could not extract generation: {e}")

    # Dispatch timeseries: hourly carrier_prod per tech (summed over locations)
    if 'carrier_prod' in ds:
        try:
            import numpy as np
            prod = ds['carrier_prod']
            lt_dim = next((d for d in prod.dims if 'loc_tech' in d), None)
            if lt_dim:
                timestamps = [str(t) for t in prod['timesteps'].values]
                dispatch_by_tech = {}

                for coord_val in prod[lt_dim].values:
                    parts = str(coord_val).split('::')
                    tech = parts[1] if len(parts) >= 3 else (parts[0] if len(parts) == 1 else parts[1])
                    tech_base = tech.split(':')[0]

                    vals = prod.sel({lt_dim: coord_val}).values.astype(float)
                    vals = np.where(np.isnan(vals), 0.0, vals)

                    if 'demand' in tech_base.lower():
                        continue
                    # Skip transmission techs — they have a ':dest_loc' suffix in tech name
                    if ':' in tech:
                        continue

                    if tech_base not in dispatch_by_tech:
                        dispatch_by_tech[tech_base] = np.zeros(len(timestamps))
                    dispatch_by_tech[tech_base] += vals

                results['dispatch'] = {k: [round(float(v), 3) for v in arr.tolist()]
                                        for k, arr in dispatch_by_tech.items()
                                        if arr.sum() > 0}
                results['timestamps'] = timestamps

        except Exception as e:
            log(f"  Could not extract dispatch timeseries: {e}")

    # Transmission flow timeseries.
    # Replicates exactly what model.plot.flows() does internally (flows.py _production_data):
    #
    #   for location in fa.locs.values:           ← location = DESTINATION (to_loc)
    #     for carrier in fa.carriers.values:
    #       df = fa.sel(carriers=c, locs=location).to_pandas()  ← rows=techs, cols=timesteps
    #       for tech, ts in df.iterrows():
    #         if len(tech.split(':')) > 1:         ← "tx_type:from_location"
    #           transmission_type, from_location = tech.split(':')
    #
    # carrier_prod at (to_loc, "tx_type:from_loc") = power ARRIVING at to_loc FROM from_loc.
    try:
        import numpy as np
        fa = model.get_formatted_array('carrier_prod')
        tx_timestamps = results.get('timestamps') or [str(t) for t in fa.timesteps.values]

        # raw_tx["to_loc::from_loc"] = summed production arriving at to_loc from from_loc (1D)
        raw_tx = {}
        for location in fa.locs.values:
            to_loc = str(location)
            for carrier in fa.carriers.values:
                # df: rows = tech strings, columns = timesteps
                sub = fa.sel(carriers=carrier, locs=location)
                if sub.dims[0] != 'techs':
                    sub = sub.transpose('techs', 'timesteps')
                df = sub.to_pandas()
                for tech_name, ts in df.iterrows():
                    tech = str(tech_name)
                    if len(tech.split(':')) < 2:
                        continue  # not transmission (flows.py: len(tech.split(":")) > 1)
                    from_loc = tech.split(':', 1)[1]
                    if from_loc == to_loc:
                        continue
                    vals = np.where(np.isnan(ts.values), 0.0, ts.values.astype(float))
                    key = f"{to_loc}::{from_loc}"
                    if key not in raw_tx:
                        raw_tx[key] = np.zeros(len(vals))
                    raw_tx[key] += vals

        # Build undirected net flow per pair keyed as "a::b" (a < b lexically).
        # raw_tx["B::A"] = A→B flow (power arriving at B from A).
        # Net A→B = raw_tx["B::A"] - raw_tx["A::B"]
        processed_pairs = set()
        tx_flow = {}
        for key in list(raw_tx.keys()):
            to_loc, from_loc = key.split('::', 1)
            a, b = sorted([to_loc, from_loc])
            pair_key = f"{a}::{b}"
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)
            n = len(raw_tx[key])
            # A→B = power arriving at B from A
            a_to_b = raw_tx.get(f"{b}::{a}", np.zeros(n))
            # B→A = power arriving at A from B
            b_to_a = raw_tx.get(f"{a}::{b}", np.zeros(n))
            net = a_to_b - b_to_a  # positive = net flow in A→B direction
            tx_flow[pair_key] = {
                'from': a,
                'to':   b,
                'timeseries': [round(float(v), 3) for v in net.tolist()],
            }

        if tx_flow:
            results['transmission_flow'] = tx_flow
            log(f"  Extracted transmission flow for {len(tx_flow)} pair(s)")
        else:
            log("  No active transmission flows found in carrier_prod")

        if 'timestamps' not in results:
            results['timestamps'] = tx_timestamps

    except Exception as e:
        import traceback as _tb
        log(f"  Could not extract transmission flow timeseries: {e}")
        log(_tb.format_exc())

    # Demand timeseries from carrier_con (demand techs consume electricity)
    if 'carrier_con' in ds:
        try:
            import numpy as np
            con = ds['carrier_con']
            lt_dim_con = next((d for d in con.dims if 'loc_tech' in d), None)
            if lt_dim_con:
                timestamps = results.get('timestamps') or [str(t) for t in con['timesteps'].values]
                demand_vals = np.zeros(len(timestamps))
                has_demand = False
                for coord_val in con[lt_dim_con].values:
                    parts = str(coord_val).split('::')
                    tech = parts[1] if len(parts) >= 3 else (parts[0] if len(parts) == 1 else parts[1])
                    tech_base = tech.split(':')[0]
                    if 'demand' in tech_base.lower():
                        vals = con.sel({lt_dim_con: coord_val}).values.astype(float)
                        demand_vals += np.abs(np.where(np.isnan(vals), 0.0, vals))
                        has_demand = True
                if has_demand:
                    results['demand_timeseries'] = [round(float(v), 3) for v in demand_vals.tolist()]
                    if 'timestamps' not in results:
                        results['timestamps'] = timestamps
        except Exception as e:
            log(f"  Could not extract demand timeseries: {e}")

    # Cost breakdown by technology
    # Calliope 0.6 uses a MultiIndex dimension 'loc_techs_cost' shaped as
    # (costs, loc_techs_cost).  We sum over locations so what remains is
    # cost-class × technology.
    if 'cost' in ds:
        try:
            cost_da = ds['cost']
            dims = cost_da.dims  # e.g. ('costs', 'loc_techs_cost')
            # Prefer summing over the location-carrying dimension
            loc_dim = next(
                (d for d in dims if 'loc' in d and d != 'costs'),
                None
            )
            if loc_dim:
                # loc_techs_cost values look like "Berlin::solar_pv"
                # Sum all cost classes, then group by technology name
                cost_flat = cost_da.sum(dim='costs')  # drop cost-class dim
                costs_dict = {}
                for coord_val, val in zip(cost_flat[loc_dim].values, cost_flat.values):
                    tech = str(coord_val).split('::')[-1]  # "Berlin::solar_pv" → "solar_pv"
                    v = float(val) if val == val else 0.0
                    costs_dict[tech] = costs_dict.get(tech, 0.0) + v
                results['costs_by_tech'] = {k: v for k, v in costs_dict.items() if v > 0}

                # Also expose a per-location breakdown for the Results UI
                loc_breakdown = {}
                for coord_val, val in zip(cost_flat[loc_dim].values, cost_flat.values):
                    parts = str(coord_val).split('::')
                    if len(parts) >= 2:
                        loc, tech = parts[0], parts[-1]
                        loc_breakdown.setdefault(loc, {})[tech] = float(val) if val == val else 0.0
                results['costs_by_location'] = loc_breakdown
            else:
                # Fallback: legacy 'locs' dim
                cost_by_tech = cost_da.sum(dim=dims[0] if len(dims) > 1 else dims[0]).to_pandas()
                costs_dict = {}
                if hasattr(cost_by_tech, 'items'):
                    for k, v in cost_by_tech.items():
                        costs_dict[str(k)] = float(v) if v == v else 0
                results['costs_by_tech'] = costs_dict
        except Exception as e:
            log(f"  Could not extract cost breakdown: {e}")

    log(f"Objective value: {results.get('objective', 'N/A')}")
    return results


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 3:
        out = {'success': False, 'error': 'Usage: calliope_runner.py <input.json> <output.json>'}
        print(json.dumps(out))
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    try:
        with open(input_file, 'r', encoding='utf-8') as fh:
            model_data = json.load(fh)
    except Exception as e:
        out = {'success': False, 'error': f'Failed to read input file: {e}'}
        with open(output_file, 'w') as fh:
            json.dump(out, fh)
        sys.exit(1)

    work_dir = tempfile.mkdtemp(prefix='calliope_run_')
    log(f"Working directory: {work_dir}")

    try:
        result = run_model(model_data, work_dir)
    except Exception as e:
        result = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc(),
        }
        log(f"ERROR: {e}")
        log(traceback.format_exc())
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    with open(output_file, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, indent=2, default=str)

    log(f"Results written to {output_file}")

    if not result.get('success', True):
        sys.exit(1)


if __name__ == '__main__':
    main()
