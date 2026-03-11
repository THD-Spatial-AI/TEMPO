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
from pathlib import Path

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
    """Print a tagged log line – captured line-by-line by Electron."""
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
        lat = loc.get('lat')
        lng = loc.get('lng') or loc.get('lon')
        if lat is not None and lng is not None:
            cfg['coordinates'] = {'lat': lat, 'lon': lng}

        # Assignments may be keyed by original id or normalised id
        assigned = (location_tech_assignments.get(raw_id) or
                    location_tech_assignments.get(loc_id) or [])

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

        # Include distance at the link level (Calliope 0.6 format)
        distance = link.get('distance')
        if distance is not None:
            try:
                link_entry['distance'] = float(distance)
            except (ValueError, TypeError):
                pass

        calliope_links[f"{from_loc},{to_loc}"] = link_entry
    return calliope_links


# ---------------------------------------------------------------------------
# Main run logic
# ---------------------------------------------------------------------------

def run_model(model_data, work_dir):
    """Build, run, and return results from a Calliope model."""
    import calliope  # noqa – must run inside the calliope conda environment  # type: ignore

    model_name = model_data.get('name', 'Model')
    locations = model_data.get('locations', [])
    links = model_data.get('links', [])
    technologies = model_data.get('technologies', [])
    loc_tech_assign = model_data.get('locationTechAssignments', {})
    parameters = model_data.get('parameters') or []
    solver = model_data.get('solver', 'highs')   # default: HiGHS (free, open-source, fast)
    overrides = model_data.get('overrides') or {}
    scenarios = model_data.get('scenarios') or {}

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

    links_cfg = build_links_config(links)

    # ------------------------------------------------------------------
    # Write YAML files
    # ------------------------------------------------------------------
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
            'calliope_version': '0.6.10',
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

    # Cost breakdown by technology
    if 'cost' in ds:
        try:
            cost_by_tech = ds['cost'].sum(dim='locs').to_pandas()
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
