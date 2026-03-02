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
from pathlib import Path


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


def build_links_config(links):
    """Convert the app's links list to a Calliope `links:` dict."""
    calliope_links = {}
    for link in links:
        from_loc = (link.get('from') or '').replace(' ', '_')
        to_loc = (link.get('to') or '').replace(' ', '_')
        if not from_loc or not to_loc:
            continue

        link_techs = link.get('techs') or ['ac_transmission']
        calliope_links[f"{from_loc},{to_loc}"] = {
            'techs': {t.replace(' ', '_').lower(): None for t in link_techs}
        }
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
    solver = model_data.get('solver', 'glpk')
    overrides = model_data.get('overrides') or {}
    scenarios = model_data.get('scenarios') or {}

    log(f"Building model '{model_name}'")
    log(f"  Locations: {len(locations)}  Technologies: {len(technologies)}  Links: {len(links)}")

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

    run_cfg = {
        'solver': solver,
        'backend': 'pyomo',
        'objective_options': {'cost_class': {'monetary': 1}},
        'ensure_feasibility': True,
        'bigM': 1e6,
        'zero_threshold': 1e-10,
        'mode': 'plan',
    }

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
