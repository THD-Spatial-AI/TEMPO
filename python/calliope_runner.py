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
    """Convert JS 'inf' / '.inf' strings or sanitized-infinity numbers to Python float.

    The browser's sanitizeInfinity() converts JS Infinity → 1e15 and -Infinity → -1e15
    so that JSON serialisation doesn't turn them into null.  Detect that convention here
    and restore the proper Python float so that later inf-checks work correctly.
    """
    if isinstance(val, str):
        if val.lower() in ('inf', '.inf'):
            return float('inf')
        if val.lower() in ('-inf', '-.inf'):
            return float('-inf')
    # Sanitized-infinity sentinel: JS uses ±1e15; anything >= 1e14 is effectively unlimited.
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if val >= 1e14:
            return float('inf')
        if val <= -1e14:
            return float('-inf')
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
                if k != 'parent' and v is not None:
                    # Skip null/None values — they would appear as 'carrier_in: null' in the
                    # generated YAML which confuses Calliope's strict tech-type validation
                    # (especially for transmission techs where only 'carrier' is expected).
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

    # Tech labels that represent transmission hub / substation nodes in input
    # datasets (e.g. Chilean grid templates).  These are NOT valid Calliope
    # supply/demand techs — they appear in location data purely as topology
    # markers.  In Calliope 0.6 transmission techs belong under `links:`, NOT
    # under `locations.X.techs`, so we must silently skip them here rather
    # than trying to add them to the locations block.
    _HUB_LABELS = {
        'substation', 'transformer', 'bus', 'hub', 'switching_station',
        'transmission_hub', 'node',
    }
    # Accumulate skip counts per label for a single summary log line.
    _skipped_hub: dict[str, int] = {}
    _skipped_unknown: list[tuple[str, str]] = []  # (ref, loc_id) pairs

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
        assigned_from_assignments = (location_tech_assignments.get(raw_id) or
                                     location_tech_assignments.get(loc_id) or [])
        loc_techs_direct = loc.get('techs') or {}
        assigned = assigned_from_assignments if assigned_from_assignments else list(loc_techs_direct.keys())
        use_direct = not assigned_from_assignments  # preserve per-loc overrides only when reading from loc.techs

        if assigned:
            resolved = {}
            for ref in assigned:
                normalized = ref.replace(' ', '_').lower()
                tech_key = tech_id_map.get(ref) or tech_id_map.get(normalized)
                if tech_key:
                    # When reading directly from the imported location's techs dict,
                    # preserve any per-location constraint overrides (e.g. resource: file=
                    # or energy_cap_equals) instead of always setting None.
                    if use_direct:
                        per_loc = loc_techs_direct.get(ref) or loc_techs_direct.get(normalized)
                        resolved[tech_key] = per_loc if isinstance(per_loc, dict) else None
                    else:
                        resolved[tech_key] = None
                elif normalized in _HUB_LABELS:
                    # Hub/substation marker — skip silently, count for summary
                    _skipped_hub[normalized] = _skipped_hub.get(normalized, 0) + 1
                else:
                    _skipped_unknown.append((ref, raw_id))
            if resolved:
                cfg['techs'] = resolved

        locs[loc_id] = cfg

    # Emit concise summary lines instead of per-location noise
    if _skipped_hub:
        summary = ', '.join(f"'{k}' x{v}" for k, v in sorted(_skipped_hub.items()))
        log(f"  Hub/substation labels skipped (topology-only, not Calliope techs): {summary}")
    if _skipped_unknown:
        # Group by ref name to avoid flooding logs
        from collections import Counter
        counts = Counter(ref for ref, _ in _skipped_unknown)
        summary = ', '.join(f"'{k}' x{v}" for k, v in counts.most_common(10))
        if len(counts) > 10:
            summary += f' ... ({len(counts)} distinct refs total)'
        log(f"  Skipped {len(_skipped_unknown)} undefined tech refs: {summary}")

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
# Imported CSV writer (calliope_yaml source)
# ---------------------------------------------------------------------------

def _write_calliope_yaml_csv_files(model_data, config_dir):
    """
    When a model was imported from a Calliope YAML, its timeSeries list carries
    the original CSV data as row-object arrays (e.g. hydro_reservoirs.csv,
    pv_series.csv, wind_series.csv, regional_demand.csv).  Write each of them
    back to *config_dir* so that `file=xxx.csv` references in techs.yaml /
    locations.yaml resolve correctly when Calliope loads the model.
    """
    ts_list = model_data.get('timeSeries') or []
    log(f"  [CSV] Payload timeSeries entries: {len(ts_list)}")
    if not ts_list:
        return

    import pandas as pd

    written = []
    for ts in ts_list:
        data    = ts.get('data') or []
        columns = ts.get('columns') or []
        file_name = ts.get('fileName') or ts.get('file') or ts.get('name')
        if not file_name or not data or not columns:
            continue
        if not file_name.lower().endswith('.csv'):
            file_name = file_name + '.csv'

        # Build DataFrame from row objects
        df = pd.DataFrame(data, columns=[c for c in columns if c])
        date_col = ts.get('dateColumn') or (columns[0] if columns else None)
        if date_col and date_col in df.columns:
            df = df.set_index(date_col)

        out_path = config_dir / file_name
        df.to_csv(out_path)
        written.append(file_name)

    if written:
        log(f"  Written {len(written)} imported CSV file(s) to model_config: {', '.join(written)}")


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
            t_entry = loc_techs.get(tid)
            existing_res = (t_entry or {}).get('constraints', {}).get('resource', '')
            if isinstance(existing_res, str) and existing_res.startswith('file='):
                injected_count += 1  # already has a file= resource — keep it
                continue
            if t_entry is None:
                loc_techs[tid] = {}
            if isinstance(loc_techs.get(tid), dict):
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
                    # Never overwrite an existing per-location file= resource reference —
                    # those are original timeseries from the imported model and must be kept.
                    existing_res = (t_slot or {}).get('constraints', {}).get('resource', '')
                    if isinstance(existing_res, str) and existing_res.startswith('file='):
                        injected_count += 1  # count as handled, don't overwrite
                        continue
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
# Missing file= CSV safety net
# ---------------------------------------------------------------------------

def _ensure_missing_file_csvs(techs, locs, time_start, time_end, config_dir):
    """
    Safety-net step: after all CSV-writing passes, scan techs and locs for any
    remaining 'file=xxx.csv' references that are still absent from config_dir
    and write them from one of two sources::

    1. Local template filesystem — searches ``public/templates/*/timeseries_data/``
       next to this file.  Copies the original CSV (accurate data).
    2. Constant-value placeholder (0.5) — ensures Calliope can at least load and
       run the model.  Results will differ from historical resource profiles.

    This handles the common case where the browser's timeSeries state was lost
    (page reload, model re-selection, backend sync) so the payload arrived empty.
    """
    import pandas as pd

    def _extract_file_refs(obj):
        """Return {filename: set(col_hints)} for all 'file=...' values in obj."""
        refs = {}
        if isinstance(obj, dict):
            for v in obj.values():
                if isinstance(v, str) and v.startswith('file='):
                    rest = v[5:]
                    colon = rest.find(':')
                    fname = rest[:colon].strip() if colon >= 0 else rest.strip()
                    col   = rest[colon + 1:].strip() if colon >= 0 else None
                    if fname:
                        refs.setdefault(fname, set())
                        if col:
                            refs[fname].add(col)
                elif isinstance(v, (dict, list)):
                    for fn, cols in _extract_file_refs(v).items():
                        refs.setdefault(fn, set()).update(cols)
        elif isinstance(obj, list):
            for item in obj:
                for fn, cols in _extract_file_refs(item).items():
                    refs.setdefault(fn, set()).update(cols)
        return refs

    # Files referenced globally in techs → all locations may use them
    global_refs = _extract_file_refs(techs)

    # Files referenced per-location → track which locations + col hints
    loc_col_hints = {}   # fname -> set of explicit column hints
    loc_to_locs   = {}   # fname -> set of location names
    for loc_name, loc_data in locs.items():
        if not isinstance(loc_data, dict):
            continue
        for fname, cols in _extract_file_refs(loc_data.get('techs') or {}).items():
            loc_col_hints.setdefault(fname, set()).update(cols)
            loc_to_locs.setdefault(fname, set()).add(loc_name)

    all_refs = dict(global_refs)
    for fname, cols in loc_col_hints.items():
        all_refs.setdefault(fname, set()).update(cols)

    if not all_refs:
        return

    missing = {f: c for f, c in all_refs.items() if not (config_dir / f).exists()}
    if not missing:
        return

    # ── Strategy 1: copy from local templates directory ──────────────────────
    _here = Path(__file__).parent           # python/
    templates_root = _here.parent / 'public' / 'templates'
    still_missing = {}

    if templates_root.exists():
        for fname in list(missing):
            found = False
            for tmpl_dir in templates_root.iterdir():
                if not tmpl_dir.is_dir():
                    continue
                for sub in ('timeseries_data', 'timeseries', ''):
                    candidate = (tmpl_dir / sub / fname) if sub else (tmpl_dir / fname)
                    if candidate.exists():
                        import shutil as _shutil
                        _shutil.copy2(str(candidate), str(config_dir / fname))
                        log(f"  Copied original CSV from template: {fname}")
                        found = True
                        break
                if found:
                    break
            if not found:
                still_missing[fname] = missing[fname]
    else:
        still_missing = missing

    if not still_missing:
        return

    # ── Strategy 2: constant-value placeholder CSV ───────────────────────────
    try:
        end_inclusive = pd.Timestamp(time_end) + pd.Timedelta(hours=23)
        ts_index = pd.date_range(start=time_start, end=end_inclusive, freq='H')
    except Exception:
        ts_index = pd.date_range(start=time_start, periods=48, freq='H')

    all_loc_names = sorted(locs.keys())
    for fname, col_hints in still_missing.items():
        # Column priority: explicit hints → per-location names → all locations
        if col_hints:
            columns = sorted(col_hints)
        elif fname in loc_to_locs:
            columns = sorted(loc_to_locs[fname])
        else:
            columns = all_loc_names
        if not columns:
            columns = ['value']

        df = pd.DataFrame(0.5, index=ts_index, columns=columns)
        df.index.name = ''
        df.to_csv(config_dir / fname)
        log(f"  [FALLBACK] Placeholder CSV written (constant 0.5) for: {fname}")

    log("  [FALLBACK] Placeholder CSVs use constant values — results are approximate.")


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
    model_config_payload = model_data.get('modelConfig') or {}  # from Run.jsx UI

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

    # Fall back to metadata.subsetTime when no explicit parameters were set.
    # This handles Calliope YAML imports where subsetTime is stored in metadata.
    if time_start == '2005-01-01' and time_end == '2005-01-07':
        _meta_subset = (model_data.get('metadata') or {}).get('subsetTime')
        if (isinstance(_meta_subset, (list, tuple)) and len(_meta_subset) == 2
                and _meta_subset[0] and _meta_subset[1]):
            time_start = str(_meta_subset[0])
            time_end   = str(_meta_subset[1])
            log(f"  Using subset_time from model metadata: {time_start} → {time_end}")

    # Highest priority: modelConfig.startDate / endDate from the Run UI
    if model_config_payload.get('startDate'):
        time_start = str(model_config_payload['startDate'])[:10]
    if model_config_payload.get('endDate'):
        time_end   = str(model_config_payload['endDate'])[:10]
    log(f"  subset_time: {time_start} → {time_end}")

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

    # Step 1: Write any CSV files embedded in the payload from a calliope_yaml import.
    # These are the original timeseries CSVs (hydro_reservoirs.csv, pv_series.csv, …)
    # that are referenced via `file=xxx.csv` in techs.yaml / locations.yaml.
    _write_calliope_yaml_csv_files(model_data, config_dir)

    # Step 2: Use actual per-location demand timeseries from demandProfile
    # (set by the frontend when loading a template with a demand CSV).
    # Returns the set of demand tech IDs already handled so the next step skips them.
    _write_demand_profiles(locations, locs, techs, time_start, time_end, config_dir)

    # Step 3: For every remaining tech with a plain scalar `resource`, auto-generate
    # a flat CSV and inject the reference into each location's tech block.
    _write_scalar_demand_timeseries(techs, locs, loc_tech_assign,
                                    time_start, time_end, config_dir,
                                    technologies=technologies)

    # Step 4: Safety net — copy any still-missing 'file=xxx.csv' CSVs from the
    # local templates directory, or generate constant-value placeholders as a last
    # resort.  This handles YAML-imported models where timeSeries was not in the
    # payload (e.g. after page reload or model re-selection).
    _ensure_missing_file_csvs(techs, locs, time_start, time_end, config_dir)

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

    # Apply modelConfig overrides (from Run UI) — mode, feasibility, cyclic storage
    if model_config_payload.get('mode') in ('plan', 'operate'):
        run_cfg['mode'] = model_config_payload['mode']
    if model_config_payload.get('ensureFeasibility') is not None:
        run_cfg['ensure_feasibility'] = bool(model_config_payload['ensureFeasibility'])
    if model_config_payload.get('cyclicStorage') is not None:
        run_cfg['cyclic_storage'] = bool(model_config_payload['cyclicStorage'])

    # Also honour mode/ensure_feasibility stored in model metadata.runConfig
    # (populated from Calliope YAML import) — only if UI did not explicitly set them.
    _meta_run = (model_data.get('metadata') or {}).get('runConfig') or {}
    if not model_config_payload.get('mode') and _meta_run.get('mode') in ('plan', 'operate'):
        run_cfg['mode'] = _meta_run['mode']
    if model_config_payload.get('ensureFeasibility') is None and _meta_run.get('ensure_feasibility') is not None:
        run_cfg['ensure_feasibility'] = bool(_meta_run['ensure_feasibility'])

    if solver_options:
        run_cfg['solver_options'] = solver_options

    # Merge solver_options from model metadata.runConfig.solver_options (YAML import)
    # — only when no explicit UI solver_options override.
    ui_solver_opts = model_config_payload.get('solverOptions') or {}
    meta_solver_opts = _meta_run.get('solver_options') or {}
    if meta_solver_opts and not ui_solver_opts:
        run_cfg['solver_options'] = {**run_cfg.get('solver_options', {}), **meta_solver_opts}

    # Apply UI solver_options (highest priority), mapping camelCase → solver-specific keys.
    if ui_solver_opts:
        _GUROBI_MAP = {
            'threads': 'Threads', 'method': 'Method', 'mipGap': 'MIPGap',
            'feasibilityTol': 'FeasibilityTol', 'optimalityTol': 'OptimalityTol',
            'barConvTol': 'BarConvTol', 'numericFocus': 'NumericFocus',
            'crossover': 'Crossover', 'barHomogeneous': 'BarHomogeneous',
            'presolve': 'Presolve', 'aggFill': 'AggFill', 'preDual': 'PreDual',
            'rins': 'RINS', 'nodefileStart': 'NodefileStart', 'seed': 'Seed',
        }
        _CBC_MAP    = {'mipGap': 'ratioGap', 'threads': 'threads', 'timeLimit': 'seconds'}
        _HIGHS_MAP  = {'mipGap': 'mip_rel_gap', 'threads': 'threads', 'timeLimit': 'time_limit'}
        _GLPK_MAP   = {'mipGap': 'mipgap'}
        _SOLVER_KEY_MAP = {'gurobi': _GUROBI_MAP, 'cplex': _GUROBI_MAP,
                           'cbc': _CBC_MAP, 'highs': _HIGHS_MAP, 'highs_direct': _HIGHS_MAP,
                           'glpk': _GLPK_MAP}
        key_map = _SOLVER_KEY_MAP.get(solver, _GUROBI_MAP)
        mapped = {}
        for ui_key, ui_val in ui_solver_opts.items():
            mapped_key = key_map.get(ui_key)
            if mapped_key is not None:
                mapped[mapped_key] = ui_val
        if mapped:
            run_cfg['solver_options'] = {**run_cfg.get('solver_options', {}), **mapped}

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

    # Tech metadata map: {tech_name: {parent, carrier_out, display_name}}
    # Priority (highest wins):
    #   Tier 1 — model.inputs.inheritance  (Calliope runtime, authoritative parent chain)
    #   Tier 2 — raw technologies list     (frontend model definition, has carrier_out + display name)
    # The richer dict lets the frontend distinguish substations (conv+electricity)
    # from hydrogen/heat conversion techs without relying on name heuristics.
    try:
        tech_meta = {}

        # Tier 2: technology definitions passed in (carrier_out + display name)
        for tdef in (technologies or []):
            tn = tdef.get('id') or tdef.get('name', '')
            if not tn:
                continue
            ess = tdef.get('essentials') or {}
            parent = ess.get('parent') or tdef.get('parent', '')
            carrier_out = ess.get('carrier_out') or ess.get('carrier', '')
            if isinstance(carrier_out, list):
                carrier_out = carrier_out[0] if carrier_out else ''
            display_name = ess.get('name') or tdef.get('name', tn)
            color = ess.get('color') or tdef.get('color', '')
            tech_meta[tn] = {
                'parent':       str(parent).strip(),
                'carrier_out':  str(carrier_out).strip().lower(),
                'display_name': str(display_name),
                'color':        str(color),
            }

        # Tier 1: override parent from Calliope's inheritance map (most authoritative)
        inputs = getattr(model, 'inputs', None)
        if inputs is not None and 'inheritance' in inputs:
            parents_da = inputs['inheritance']
            for coord_val in parents_da['techs'].values:
                tn = str(coord_val)
                # inheritance string: "supply_plus,supply,tech_groups,tech" — first = direct parent
                inh_val = str(parents_da.sel(techs=coord_val).values)
                parent = inh_val.split(',')[0].strip() if inh_val else 'supply'
                if tn not in tech_meta:
                    tech_meta[tn] = {'parent': parent, 'carrier_out': '', 'display_name': tn}
                else:
                    tech_meta[tn]['parent'] = parent  # Calliope overrides frontend parent

        if tech_meta:
            results['tech_metadata'] = tech_meta
            # Keep backward-compatible flat map for older frontend sessions
            results['tech_parents'] = {k: v['parent'] for k, v in tech_meta.items()}

    except Exception as e:
        log(f"  Could not extract tech_metadata: {e}")

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
                    # Skip link-timesteps that are entirely zero to avoid building millions
                    # of raw_tx entries for inactive links in large sparse models.
                    if np.abs(vals).max() < 1e-6:
                        continue
                    key = f"{to_loc}::{from_loc}"
                    if key not in raw_tx:
                        raw_tx[key] = np.zeros(len(vals))
                    raw_tx[key] += vals

        # Build undirected net flow per pair keyed as "a::b" (a < b lexically).
        # raw_tx["B::A"] = A→B flow (power arriving at B from A).
        # Net A→B = raw_tx["B::A"] - raw_tx["A::B"]
        #
        # CAP: with large models (e.g. 2000+ locations) there can be millions of
        # pairs whose serialisation would produce gigabytes of JSON, hanging the
        # service.  We keep only the MAX_TX_PAIRS pairs with the highest peak flow.
        MAX_TX_PAIRS = 500

        processed_pairs = set()
        pair_stats = {}   # pair_key → (net_array, abs_peak)
        for key in list(raw_tx.keys()):
            to_loc, from_loc = key.split('::', 1)
            a, b = sorted([to_loc, from_loc])
            pair_key = f"{a}::{b}"
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)
            n = len(raw_tx[key])
            a_to_b = raw_tx.get(f"{b}::{a}", np.zeros(n))
            b_to_a = raw_tx.get(f"{a}::{b}", np.zeros(n))
            net = a_to_b - b_to_a
            abs_peak = float(np.abs(net).max()) if n else 0.0
            # Skip pairs with no actual flow
            if abs_peak < 1e-6:
                continue
            pair_stats[pair_key] = (a, b, net, abs_peak)

        total_pairs = len(pair_stats)
        if total_pairs > MAX_TX_PAIRS:
            log(f"  WARNING: {total_pairs} active transmission pairs — keeping top {MAX_TX_PAIRS} by peak flow to avoid oversized response")
            top_keys = sorted(pair_stats, key=lambda k: pair_stats[k][3], reverse=True)[:MAX_TX_PAIRS]
            pair_stats = {k: pair_stats[k] for k in top_keys}

        tx_flow = {}
        for pair_key, (a, b, net, _) in pair_stats.items():
            tx_flow[pair_key] = {
                'from': a,
                'to':   b,
                'timeseries': [round(float(v), 3) for v in net.tolist()],
            }

        if tx_flow:
            results['transmission_flow'] = tx_flow
            log(f"  Extracted transmission flow for {len(tx_flow)} pair(s)"
                + (f" (capped from {total_pairs})" if total_pairs > MAX_TX_PAIRS else ""))
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
