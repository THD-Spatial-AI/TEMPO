"""
Calliope 0.7 runner — executes TEMPO models on the Calliope 0.7 engine.

Runs inside the isolated calliope07-venv (see requirements.calliope07.txt);
selected by calliope_service.py via TEMPO_RUNNER_MODULE=calliope07_runner.

Public contract mirrors calliope_runner.run_model(model_data, work_dir,
log_fn) and returns the SAME result JSON shape (the frontend Results view and
map layers depend on it):

    model_name, solver, success, termination_condition, objective,
    capacities {node::tech}, generation {node::tech::carrier},
    dispatch {tech: [hourly]}, timestamps, transmission_flow
    {a::b: {from, to, timeseries}}, demand_timeseries,
    costs_by_tech, costs_by_location, tech_metadata, tech_parents

Unlike calliope_runner.py this module contains NO compatibility monkey-
patches: the 0.7 stack (pandas >=2.1, pyomo >=6.8) is used as-is.
"""

from __future__ import annotations

import logging
import os
import threading
import traceback
from pathlib import Path

import calliope07_translate as translate

ENGINE_NAME = "calliope-0.7"

_thread_local = threading.local()

# Mirrors _LINK_TYPE_DEFAULTS in calliope_runner.py (src/config/linkTypes.js)
_LINK_TYPE_DEFAULTS = {
    'hvac_overhead': {'calliopeTech': 'hvac_overhead_lines',    'carrier': 'electricity', 'energy_eff': 0.98, 'lifetime': 40, 'energy_cap_per_distance': 0.91},
    'hvdc_overhead': {'calliopeTech': 'hvdc_overhead_lines',    'carrier': 'electricity', 'energy_eff': 0.97, 'lifetime': 40, 'energy_cap_per_distance': 1.10},
    'hvac_cable':    {'calliopeTech': 'hvac_underground_cables', 'carrier': 'electricity', 'energy_eff': 0.97, 'lifetime': 40, 'energy_cap_per_distance': 3.00},
    'hvdc_cable':    {'calliopeTech': 'hvdc_underground_cables', 'carrier': 'electricity', 'energy_eff': 0.96, 'lifetime': 40, 'energy_cap_per_distance': 3.30},
    'h2_pipeline':   {'calliopeTech': 'hydrogen_pipelines',      'carrier': 'hydrogen',    'energy_eff': 0.98, 'lifetime': 40, 'energy_cap_per_distance': 0.30},
}

# UI camelCase solver option keys → solver-native keys
_SOLVER_OPTION_MAP = {
    'cbc':    {'mipGap': 'ratioGap', 'threads': 'threads', 'timeLimit': 'seconds'},
    'glpk':   {'mipGap': 'mipgap'},
    'gurobi': {'mipGap': 'MIPGap', 'threads': 'Threads', 'method': 'Method',
               'feasibilityTol': 'FeasibilityTol', 'optimalityTol': 'OptimalityTol'},
    'cplex':  {'mipGap': 'epgap', 'threads': 'threads', 'timeLimit': 'timelimit'},
}
_SOLVER_OPTION_DEFAULTS = {
    'cbc':  {'ratioGap': 1e-3},
    'glpk': {'mipgap': 1e-3},
}


def log(msg):
    fn = getattr(_thread_local, 'log_fn', None)
    if fn is not None:
        fn(f"[CALLIOPE-0.7] {msg}")
    else:
        print(f"[CALLIOPE-0.7] {msg}", flush=True)


class _LogFnHandler(logging.Handler):
    """Forwards calliope's stdlib log records to the job's log callback."""

    def emit(self, record):
        try:
            log(record.getMessage())
        except Exception:
            pass


def _dump_yaml(doc, path):
    from ruamel.yaml import YAML
    yaml = YAML(typ='safe', pure=True)
    yaml.default_flow_style = False
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(doc, f)


# ---------------------------------------------------------------------------
# Demand data table
# ---------------------------------------------------------------------------

def _build_demand_data_tables(locations, nodes, techs_07, time_start, time_end,
                              config_dir, warnings, covered_pairs=frozenset()):
    """Write demand CSVs + 0.7 ``data_tables:`` blocks.

    Calliope 0.7 derives the timesteps dimension from data tables, so every
    model needs at least one — demand always provides it (mirroring the 0.6
    runner, which generates a demand CSV for the same reason).

    Per demand tech: one CSV column per node the tech is assigned to, values
    POSITIVE (0.7 convention). Column values come from the location's
    demandProfile.timeseries (tiled over the full period) or, failing that,
    the tech's translated scalar sink value, or a flat 100 kW fallback.
    """
    import itertools
    import pandas as pd

    demand_tids = [tid for tid, tdef in techs_07.items()
                   if tdef.get('base_tech') == 'demand']
    if not demand_tids:
        return {}

    end_inclusive = pd.Timestamp(str(time_end)[:10]) + pd.Timedelta(hours=23)
    ts_index = pd.date_range(start=str(time_start)[:10], end=end_inclusive, freq='h')
    if len(ts_index) == 0:
        ts_index = pd.date_range(start=str(time_start)[:10], periods=48, freq='h')

    # Per-node profile values (positive), tiled to the full period
    profile_by_node = {}
    for loc in locations or []:
        ts = ((loc.get('demandProfile') or {}).get('timeseries')) or []
        if ts:
            node_id = translate.safe_id(loc.get('name') or loc.get('id') or '').lower()
            vals = list(itertools.islice(itertools.cycle(ts), len(ts_index)))
            profile_by_node[node_id] = [abs(v) for v in vals]

    data_tables = {}
    for tid in demand_tids:
        tdef = techs_07[tid]
        # A static sink param would clash with the data table — consume it
        scalar = None
        for key in ('sink_use_equals', 'sink_use_max'):
            if key in tdef and isinstance(tdef[key], (int, float)):
                scalar = abs(tdef.pop(key))
        if '__resource_file__' in tdef:
            continue  # handled by the file-reference data-table path

        target_nodes = [nid for nid, ncfg in nodes.items()
                        if tid in (ncfg.get('techs') or {})
                        and (tid, nid) not in covered_pairs]
        if not target_nodes:
            continue

        csv_cols = {}
        for nid in target_nodes:
            if nid in profile_by_node:
                csv_cols[nid] = profile_by_node[nid]
            else:
                csv_cols[nid] = [scalar if scalar is not None else 100.0] * len(ts_index)
            # A per-node static sink override would clash with the table too
            ncfg_tech = nodes[nid]['techs'].get(tid)
            if isinstance(ncfg_tech, dict):
                ncfg_tech.pop('sink_use_equals', None)
                ncfg_tech.pop('sink_use_max', None)

        csv_name = f'demand_{tid}.csv'
        df = pd.DataFrame(csv_cols, index=ts_index)
        df.index.name = 'timesteps'
        df.to_csv(config_dir / csv_name)

        data_tables[f'demand_{tid}'] = {
            'data': f'model_config/{csv_name}',
            'rows': 'timesteps',
            'columns': 'nodes',
            'add_dims': {
                'parameters': 'sink_use_equals',
                'techs': tid,
            },
        }
        log(f"  Demand data table '{tid}': {len(ts_index)} hours × {len(csv_cols)} node(s)")
    return data_tables


def _write_payload_csvs(model_data, config_dir):
    """Write CSVs embedded in the payload's timeSeries list (Calliope YAML
    imports) to config_dir. Column headers are normalised exactly like the
    0.6 runner (_write_calliope_yaml_csv_files) so file=csv:col references
    resolve identically on both engines."""
    import csv as _csv_mod

    written = set()
    for ts in model_data.get('timeSeries') or []:
        data = ts.get('data') or []
        columns = ts.get('columns') or []
        file_name = ts.get('fileName') or ts.get('file') or ts.get('name')
        if not file_name or not data or not columns:
            continue
        if not file_name.lower().endswith('.csv'):
            file_name = file_name + '.csv'

        date_col = ts.get('dateColumn') or (columns[0] if columns else None)
        data_cols = [c for c in columns if c and c != date_col]
        norm_header = (([date_col] if date_col else [])
                       + [translate.safe_id(c).lower() for c in data_cols])

        with open(str(config_dir / file_name), 'w', newline='', encoding='utf-8') as fh:
            writer = _csv_mod.writer(fh)
            writer.writerow(norm_header)
            for row in data:
                if isinstance(row, dict):
                    writer.writerow(([row.get(date_col, '')] if date_col else [])
                                    + [row.get(c, '') for c in data_cols])
                else:
                    writer.writerow(list(row))
        written.add(file_name)
    if written:
        log(f"  Written {len(written)} imported CSV file(s): {', '.join(sorted(written))}")
    return written


def _build_user_data_tables(model_data, config_dir):
    """Build data_tables blocks from timeSeries entries with type='data_table'.

    Each such entry must have a dataTableConfig with 'rows' (required) and
    optionally 'columns' and 'add_dims'.  The CSV is written to config_dir
    with its original column names (no date-column normalisation)."""
    import csv as _csv_mod

    user_tables = {}
    for ts in model_data.get('timeSeries') or []:
        if ts.get('type') != 'data_table':
            continue
        data = ts.get('data') or []
        columns = ts.get('columns') or []
        file_name = ts.get('fileName') or ts.get('name')
        cfg = ts.get('dataTableConfig') or {}
        rows_dim = cfg.get('rows') or ''
        if not rows_dim or not file_name or not data or not columns:
            continue
        if not file_name.lower().endswith('.csv'):
            file_name = file_name + '.csv'

        with open(str(config_dir / file_name), 'w', newline='', encoding='utf-8') as fh:
            writer = _csv_mod.writer(fh)
            writer.writerow(columns)
            for row in data:
                if isinstance(row, dict):
                    writer.writerow([row.get(c, '') for c in columns])
                else:
                    writer.writerow(list(row))

        table_name = file_name.replace('.csv', '')
        table_block = {
            'data': f'model_config/{file_name}',
            'rows': rows_dim,
        }
        if cfg.get('columns'):
            table_block['columns'] = cfg['columns']
        add_dims = {k: v for k, v in (cfg.get('add_dims') or {}).items() if k and v}
        if add_dims:
            table_block['add_dims'] = add_dims

        user_tables[table_name] = table_block
        log(f"  User data table '{table_name}': rows={rows_dim}")

    return user_tables


def _build_file_ref_data_tables(techs_07, nodes, config_dir, warnings):
    """Convert 0.6 'file=xxx.csv[:col]' resource references into 0.7 data
    tables. Per (tech, param) a derived CSV is written whose columns ARE the
    node ids, so a single simple data table covers all reference styles
    (shared column, per-node column, column-per-location convention).

    Values for sink_* parameters are made positive (0.6 demand CSVs are
    negative; 0.7 expects positive demand)."""
    import pandas as pd

    # Collect refs per (tech, param): node → (fname, col|None)
    grouped = {}

    def _parse(ref):
        rest = ref[len('file='):]
        if ':' in rest:
            fname, col = rest.split(':', 1)
            return fname, translate.safe_id(col).lower()
        return rest, None

    for tid, tdef in techs_07.items():
        marker = tdef.pop('__resource_file__', None)
        if not marker:
            continue
        fname, col = _parse(marker['ref'])
        target_nodes = [nid for nid, ncfg in nodes.items()
                        if tid in (ncfg.get('techs') or {})]
        for nid in target_nodes:
            # skip nodes that carry their own per-node override for this tech
            ncfg_tech = nodes[nid]['techs'].get(tid)
            if isinstance(ncfg_tech, dict) and '__resource_file__' in ncfg_tech:
                continue
            grouped.setdefault((tid, marker['param']), {})[nid] = (fname, col)

    for nid, ncfg in nodes.items():
        for tid, tcfg in (ncfg.get('techs') or {}).items():
            if not isinstance(tcfg, dict):
                continue
            marker = tcfg.pop('__resource_file__', None)
            if marker:
                fname, col = _parse(marker['ref'])
                grouped.setdefault((tid, marker['param']), {})[nid] = (fname, col)
            if not tcfg:
                ncfg['techs'][tid] = None

    data_tables = {}
    csv_cache = {}
    for (tid, param), node_refs in grouped.items():
        cols = {}
        for nid, (fname, col) in node_refs.items():
            if fname not in csv_cache:
                src = config_dir / fname
                if not src.exists():
                    raise RuntimeError(
                        f"Timeseries file '{fname}' referenced by '{tid}' is not in "
                        "the run payload. Re-import the model archive (with its CSV "
                        "files), or run it on the Calliope 0.6.8 engine."
                    )
                csv_cache[fname] = pd.read_csv(src, index_col=0)
            df = csv_cache[fname]
            use_col = col or nid  # column-per-location convention when no col given
            if use_col not in df.columns:
                warnings.append(
                    f"{nid}.{tid}: column '{use_col}' not found in {fname} — skipped")
                continue
            series = pd.to_numeric(df[use_col], errors='coerce').fillna(0.0)
            cols[nid] = series.abs() if param.startswith('sink') else series

        if not cols:
            continue
        out = pd.DataFrame(cols)
        out.index.name = 'timesteps'
        csv_name = f'dt_{translate.safe_id(param)}_{tid}.csv'
        out.to_csv(config_dir / csv_name)
        data_tables[f'dt_{tid}_{translate.safe_id(param)}'] = {
            'data': f'model_config/{csv_name}',
            'rows': 'timesteps',
            'columns': 'nodes',
            'add_dims': {'parameters': param, 'techs': tid},
        }
        log(f"  Data table for {tid}.{param}: {len(cols)} node column(s)")

    covered = {(tid, nid) for (tid, _), node_refs in grouped.items() for nid in node_refs}
    return data_tables, covered


# ---------------------------------------------------------------------------
# HiGHS LP-file solver patch
# ---------------------------------------------------------------------------

def _install_highs_lp_patch():
    """Patch PyomoBackendModel._solve to use HiGHS via LP file roundtrip.

    pyomo 6.8.2 + calliope 0.7 kernel models: both the ASL-NL interface
    (highs binary doesn't support -AMPL) and APPSI (parameter_dict.mutable
    AttributeError on kernel models) are broken for HiGHS.  The LP writer
    works fine with kernel models, and HiGHS binary reads LP files natively.
    """
    import os, shutil, subprocess, tempfile
    from calliope.backend.pyomo_backend_model import PyomoBackendModel
    from pyomo.opt import SolverResults, SolverStatus, TerminationCondition
    from pyomo.opt.results.solution import SolutionStatus

    if getattr(PyomoBackendModel._solve, '_tempo_highs_lp_patch', False):
        return

    _orig = PyomoBackendModel._solve

    def _patched_solve(self, solve_config, warmstart=False):
        import xarray as xr
        import pyomo.environ as pe

        if solve_config.solver != 'highs':
            return _orig(self, solve_config, warmstart=warmstart)

        highs_exe = shutil.which('highs') or 'highs'
        instance = self._instance

        with tempfile.TemporaryDirectory() as tmpdir:
            lp_path = os.path.join(tmpdir, 'model.lp')
            sol_path = os.path.join(tmpdir, 'model.sol')

            # LP writer works with kernel models and returns the symbol map.
            symbol_map = instance.write(lp_path, format='lp',
                                        symbolic_solver_labels=False)
            log(f"[HiGHS] LP written ({os.path.getsize(lp_path)//1024} KB)")

            cmd = [highs_exe, '--model_file', lp_path, '--solution_file', sol_path]
            if solve_config.solver_options:
                for k, v in solve_config.solver_options.items():
                    cmd += [f'--{k}', str(v)]

            proc = subprocess.run(cmd, capture_output=True, text=True)
            for line in proc.stdout.splitlines():
                log(f"[HiGHS] {line}")
            if proc.stderr:
                for line in proc.stderr.splitlines():
                    log(f"[HiGHS stderr] {line}")

            # Build pyomo SolverResults that load_solution expects
            pyomo_results = SolverResults()
            s = pyomo_results.solver.add()
            soln = pyomo_results.solution.add()
            soln.symbol_map = symbol_map
            soln.default_variable_value = 0.0

            tc = TerminationCondition.unknown

            if not os.path.exists(sol_path):
                log("[HiGHS] ERROR: solver produced no solution file")
                tc = TerminationCondition.error
            else:
                sol_text = open(sol_path).read()
                MAJOR = {'# Primal solution values', '# Dual solution values',
                         '# Basis'}
                in_primal = False
                in_dual = False
                in_cols = False
                in_rows = False
                dual_rows = {}

                for line in sol_text.splitlines():
                    ls = line.strip()

                    if ls in MAJOR:
                        in_primal = (ls == '# Primal solution values')
                        in_dual = (ls == '# Dual solution values')
                        in_cols = False
                        in_rows = False
                        continue
                    if ls.startswith('# Columns'):
                        in_cols = True; in_rows = False; continue
                    if ls.startswith('# Rows'):
                        in_rows = True; in_cols = False; continue
                    if ls.startswith('#'):
                        in_cols = False; in_rows = False; continue

                    if ls == 'Optimal':
                        tc = TerminationCondition.optimal
                    elif ls == 'Infeasible':
                        tc = TerminationCondition.infeasible

                    if in_primal and in_cols and ls and ls not in ('Feasible',
                                                                    'Infeasible'):
                        parts = ls.split()
                        if len(parts) == 2:
                            try:
                                soln.variable[parts[0]] = {'Value': float(parts[1])}
                            except ValueError:
                                pass

                    if in_primal and ls.startswith('Objective'):
                        parts = ls.split()
                        if len(parts) == 2:
                            try:
                                soln.objective['__default_objective__'] = {
                                    'Value': float(parts[1])}
                            except ValueError:
                                pass

                    if in_dual and in_rows and ls:
                        parts = ls.split()
                        if len(parts) == 2:
                            try:
                                dual_rows[parts[0]] = float(parts[1])
                            except ValueError:
                                pass

                _thread_local.highs_symbol_map = symbol_map
                _thread_local.highs_dual_rows = dual_rows

            is_ok = tc == TerminationCondition.optimal
            s.termination_condition = tc
            s.status = SolverStatus.ok if is_ok else SolverStatus.warning
            soln.status = (SolutionStatus.optimal if is_ok
                           else SolutionStatus.infeasible)
            log(f"[HiGHS] termination_condition={tc}")

            # Mirror calliope's _solve return contract: xr.Dataset, not SolverResults.
            # load_solution sets variable values on the kernel model; load_results
            # extracts them into the xarray Dataset calliope's model.solve() expects.
            if is_ok:
                instance.load_solution(pyomo_results.solution[0])
                xr_results = self.load_results()
            else:
                from calliope.backend.backend_model import BackendWarning
                from calliope.exceptions import warn as model_warn
                model_warn("Model solution was non-optimal.", _class=BackendWarning)
                xr_results = xr.Dataset()

            xr_results.attrs["termination_condition"] = str(tc)
            return xr_results

    _patched_solve._tempo_highs_lp_patch = True
    PyomoBackendModel._solve = _patched_solve
    log("HiGHS LP-file patch applied to PyomoBackendModel._solve")


# ---------------------------------------------------------------------------
# Shadow price extraction (duals of system_balance constraints)
# ---------------------------------------------------------------------------

def _extract_shadow_prices(model, timestamps):
    """Return {carrier:node: [shadow_price_per_timestep]} or {} on failure.

    Calliope 0.7 uses pyomo kernel block models which lack component_map.
    Instead we call verbose_strings() to populate calliope_coords on each
    ObjConstraint, then reverse-lookup via bySymbol to pair LP dual values
    with (node, carrier, timestep) coordinates.  Non-fatal on any failure."""
    sym_map = getattr(_thread_local, 'highs_symbol_map', None)
    dual_rows = getattr(_thread_local, 'highs_dual_rows', None)
    if not sym_map or dual_rows is None:
        return {}

    try:
        import pandas as pd
        n_ts = len(timestamps or [])
        if n_ts == 0:
            return {}

        # verbose_strings() sets obj.calliope_coords = (coord_per_dim, ...)
        # under a _datetime_as_string context that formats timestamps as
        # '%Y-%m-%d %H:%M' strings.  Build ts_index in the same format.
        model.backend.verbose_strings()
        try:
            ts_index = {pd.Timestamp(ts).strftime('%Y-%m-%d %H:%M'): i
                        for i, ts in enumerate(timestamps)}
        except Exception:
            ts_index = {str(ts): i for i, ts in enumerate(timestamps)}

        by_symbol = getattr(sym_map, 'bySymbol', {})
        prices = {}
        for lp_sym, dual in dual_rows.items():
            obj = by_symbol.get(lp_sym)
            if obj is None:
                continue
            obj_name = getattr(obj, 'name', None) or ''
            if 'system_balance' not in obj_name:
                continue
            coords = getattr(obj, 'calliope_coords', None)
            if coords is None or len(coords) < 3:
                continue
            # system_balance DataArray dims = ('nodes', 'carriers', 'timesteps')
            node, carrier, ts_raw = str(coords[0]), str(coords[1]), str(coords[2])
            key = f"{carrier}:{node}"
            if key not in prices:
                prices[key] = [None] * n_ts
            ts_i = ts_index.get(ts_raw)
            if ts_i is not None:
                prices[key][ts_i] = round(dual, 6)

        prices = {k: v for k, v in prices.items() if any(x is not None for x in v)}
        if prices:
            log(f"  Shadow prices extracted for {len(prices)} carrier:node pair(s)")
        return prices
    except Exception as e:
        log(f"  Shadow price extraction failed (non-fatal): {e}")
        return {}


# ---------------------------------------------------------------------------
# Result extraction — must reproduce the 0.6 runner's result JSON contract
# ---------------------------------------------------------------------------

def _extract_results(model, techs_07, technologies, model_name, solver):
    import numpy as np

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

    tc = (getattr(ds, 'attrs', {}) or {}).get('termination_condition', 'optimal')
    results['termination_condition'] = str(tc)

    # Tech metadata: parent comes from the translated base_tech (0.7 has no
    # inheritance chains); carrier/name/color from the input definitions.
    tech_meta = {}
    for tdef in (technologies or []):
        tn = tdef.get('id') or tdef.get('name', '')
        if not tn:
            continue
        ess = tdef.get('essentials') or {}
        parent = ess.get('parent') or tdef.get('parent', '')
        carrier_out = ess.get('carrier_out') or ess.get('carrier', '')
        if isinstance(carrier_out, list):
            carrier_out = carrier_out[0] if carrier_out else ''
        tech_meta[tn] = {
            'parent':       str(parent).strip(),
            'carrier_out':  str(carrier_out).strip().lower(),
            'display_name': str(ess.get('name') or tdef.get('name', tn)),
            'color':        str(ess.get('color') or tdef.get('color', '')),
        }
    for tid, tdef in techs_07.items():
        if tid not in tech_meta:
            tech_meta[tid] = {
                'parent':       tdef.get('base_tech', ''),
                'carrier_out':  str(tdef.get('carrier_out', '')).lower(),
                'display_name': tdef.get('name', tid),
                'color':        tdef.get('color', ''),
            }
    if tech_meta:
        results['tech_metadata'] = tech_meta
        results['tech_parents'] = {k: v['parent'] for k, v in tech_meta.items()}

    transmission_tids = {tid for tid, tdef in techs_07.items()
                         if tdef.get('base_tech') == 'transmission'}
    demand_tids = {tid for tid, tdef in techs_07.items()
                   if tdef.get('base_tech') == 'demand'}

    def _clean(v):
        v = float(v)
        return v if v == v else 0.0  # nan → 0

    # Objective (total monetary cost)
    if 'cost' in ds:
        try:
            results['objective'] = float(np.nansum(ds['cost'].values))
        except Exception as e:
            log(f"  Could not extract objective: {e}")

    # Capacities {node::tech} from flow_cap (max over carriers to match the
    # 0.6 per-loc::tech granularity)
    if 'flow_cap' in ds:
        try:
            cap = ds['flow_cap']
            if 'carriers' in cap.dims:
                cap = cap.max(dim='carriers')
            ser = cap.to_series().dropna()
            results['capacities'] = {
                f"{idx[ser.index.names.index('nodes')]}::{idx[ser.index.names.index('techs')]}":
                    _clean(v)
                for idx, v in ser.items()
            }
        except Exception as e:
            log(f"  Could not extract capacities: {e}")

    # Generation {node::tech::carrier} = flow_out summed over timesteps
    if 'flow_out' in ds:
        try:
            gen = ds['flow_out'].sum(dim='timesteps', min_count=1).to_series().dropna()
            names = list(gen.index.names)
            i_n, i_t, i_c = names.index('nodes'), names.index('techs'), names.index('carriers')
            results['generation'] = {
                f"{idx[i_n]}::{idx[i_t]}::{idx[i_c]}": _clean(v)
                for idx, v in gen.items()
            }
        except Exception as e:
            log(f"  Could not extract generation: {e}")

    # Dispatch {tech: [hourly]} — flow_out summed over nodes/carriers,
    # skipping demand and transmission techs (0.6 behaviour)
    if 'flow_out' in ds:
        try:
            timestamps = [str(t) for t in ds['timesteps'].values]
            dispatch = {}
            flow = ds['flow_out']
            for tid in [str(x) for x in flow['techs'].values]:
                if tid in transmission_tids or tid in demand_tids or 'demand' in tid.lower():
                    continue
                arr = flow.sel(techs=tid)
                sum_dims = [d for d in arr.dims if d != 'timesteps']
                vals = arr.sum(dim=sum_dims).values.astype(float)
                vals = np.where(np.isnan(vals), 0.0, vals)
                if vals.sum() > 0:
                    dispatch[tid] = [round(float(v), 3) for v in vals.tolist()]
            results['dispatch'] = dispatch
            results['timestamps'] = timestamps
        except Exception as e:
            log(f"  Could not extract dispatch timeseries: {e}")

    # Transmission flow {a::b: {from, to, timeseries}} — net flow per node
    # pair, derived from flow_out at each link tech's endpoints (0.7 keeps
    # link_from/link_to on the tech instead of the 0.6 'tech:remote' naming).
    if 'flow_out' in ds and transmission_tids:
        try:
            MAX_TX_PAIRS = 500
            flow = ds['flow_out']
            flow_techs = {str(x) for x in flow['techs'].values}
            pair_net = {}
            for tid in sorted(transmission_tids & flow_techs):
                tdef = techs_07[tid]
                n_from, n_to = tdef.get('link_from'), tdef.get('link_to')
                if not n_from or not n_to:
                    continue
                arr = flow.sel(techs=tid)
                sum_dims = [d for d in arr.dims if d not in ('timesteps', 'nodes')]
                if sum_dims:
                    arr = arr.sum(dim=sum_dims)
                nodes_present = {str(x) for x in arr['nodes'].values}

                def _at(node):
                    if node not in nodes_present:
                        return None
                    v = arr.sel(nodes=node).values.astype(float)
                    return np.where(np.isnan(v), 0.0, v)

                delivered_to = _at(n_to)      # power arriving at link_to (from → to)
                delivered_from = _at(n_from)  # power arriving at link_from (to → from)
                if delivered_to is None and delivered_from is None:
                    continue
                n = len(delivered_to if delivered_to is not None else delivered_from)
                a, b = sorted([n_from, n_to])
                # net flow in a→b direction
                to_b = delivered_to if b == n_to else delivered_from
                to_a = delivered_from if b == n_to else delivered_to
                net = (to_b if to_b is not None else np.zeros(n)) \
                    - (to_a if to_a is not None else np.zeros(n))
                key = f"{a}::{b}"
                pair_net[key] = pair_net.get(key, np.zeros(n)) + net

            pair_stats = {k: (v, float(np.abs(v).max()) if len(v) else 0.0)
                          for k, v in pair_net.items()}
            pair_stats = {k: s for k, s in pair_stats.items() if s[1] >= 1e-6}
            if len(pair_stats) > MAX_TX_PAIRS:
                log(f"  WARNING: {len(pair_stats)} active transmission pairs — keeping top {MAX_TX_PAIRS} by peak flow")
                top = sorted(pair_stats, key=lambda k: pair_stats[k][1], reverse=True)[:MAX_TX_PAIRS]
                pair_stats = {k: pair_stats[k] for k in top}

            tx_flow = {}
            for key, (net, _) in pair_stats.items():
                a, b = key.split('::', 1)
                tx_flow[key] = {'from': a, 'to': b,
                                'timeseries': [round(float(v), 3) for v in net.tolist()]}
            if tx_flow:
                results['transmission_flow'] = tx_flow
                log(f"  Extracted transmission flow for {len(tx_flow)} pair(s)")
        except Exception as e:
            log(f"  Could not extract transmission flow timeseries: {e}")
            log(traceback.format_exc())

    # Demand timeseries — flow_in at demand techs, summed (absolute values)
    if 'flow_in' in ds and demand_tids:
        try:
            con = ds['flow_in']
            con_techs = {str(x) for x in con['techs'].values}
            present = sorted(demand_tids & con_techs)
            if present:
                arr = con.sel(techs=present)
                sum_dims = [d for d in arr.dims if d != 'timesteps']
                vals = np.abs(arr).sum(dim=sum_dims).values.astype(float)
                vals = np.where(np.isnan(vals), 0.0, vals)
                results['demand_timeseries'] = [round(float(v), 3) for v in vals.tolist()]
                if 'timestamps' not in results:
                    results['timestamps'] = [str(t) for t in con['timesteps'].values]
        except Exception as e:
            log(f"  Could not extract demand timeseries: {e}")

    # Cost breakdowns
    if 'cost' in ds:
        try:
            cost = ds['cost']
            if 'costs' in cost.dims:
                cost = cost.sum(dim='costs', min_count=1)
            ser = cost.to_series().dropna()
            names = list(ser.index.names)
            i_n, i_t = names.index('nodes'), names.index('techs')
            costs_by_tech = {}
            costs_by_location = {}
            for idx, v in ser.items():
                node, tech = str(idx[i_n]), str(idx[i_t])
                v = _clean(v)
                costs_by_tech[tech] = costs_by_tech.get(tech, 0.0) + v
                costs_by_location.setdefault(node, {})[tech] = \
                    costs_by_location.get(node, {}).get(tech, 0.0) + v
            results['costs_by_tech'] = {k: v for k, v in costs_by_tech.items() if v > 0}
            results['costs_by_location'] = costs_by_location
        except Exception as e:
            log(f"  Could not extract cost breakdown: {e}")

    shadow = _extract_shadow_prices(model, results.get('timestamps') or [])
    if shadow:
        results['shadow_prices'] = shadow

    log(f"Objective value: {results.get('objective', 'N/A')}")
    return results


# ---------------------------------------------------------------------------
# Main entry point (same contract as calliope_runner.run_model)
# ---------------------------------------------------------------------------

def run_model(model_data: dict, work_dir: str, log_fn=None) -> dict:
    _thread_local.log_fn = log_fn

    model_name = model_data.get('name', 'Model')
    locations = model_data.get('locations', [])
    links = model_data.get('links', [])
    technologies = model_data.get('technologies', [])
    loc_tech_assign = model_data.get('locationTechAssignments', {})
    overrides = model_data.get('overrides') or {}
    scenarios = model_data.get('scenarios') or {}
    scenario_to_run = model_data.get('scenario')
    override_to_run = model_data.get('override')
    model_config_payload = model_data.get('modelConfig') or {}
    meta = model_data.get('metadata') or {}
    meta_run = meta.get('runConfig') or {}

    mode = model_config_payload.get('mode') or meta_run.get('mode') or 'plan'
    if mode == 'spores':
        raise RuntimeError(
            "SPORES is not supported on the Calliope 0.7 (experimental) engine yet. "
            "Run this model on the Calliope 0.6.8 engine."
        )

    requested_solver = model_data.get('solver') or 'highs'
    solver = translate.normalize_solver_07(requested_solver)
    if solver != requested_solver:
        log(f"  Solver '{requested_solver}' mapped to '{solver}' for Calliope 0.7")
    if solver == 'cbc':
        import shutil as _shutil
        solver_dir = os.environ.get('CALLIOPE_SOLVER_DIR')
        if solver_dir and os.path.isdir(solver_dir):
            os.environ['PATH'] = solver_dir + os.pathsep + os.environ.get('PATH', '')
        if not (_shutil.which('cbc') or _shutil.which('cbc.exe')):
            raise RuntimeError(
                "The CBC solver binary is not available. Reinstall the "
                "Calliope 0.7 engine from TEMPO Settings (it downloads CBC), "
                "or run this model on the 0.6.8 engine."
            )

    # Time range: metadata.subsetTime, then Run-UI start/end (same priority
    # order as the 0.6 runner)
    time_start, time_end = '2005-01-01', '2005-01-07'
    _meta_subset = meta.get('subsetTime')
    if (isinstance(_meta_subset, (list, tuple)) and len(_meta_subset) == 2
            and _meta_subset[0] and _meta_subset[1]):
        time_start, time_end = str(_meta_subset[0]), str(_meta_subset[1])
    if model_config_payload.get('startDate'):
        time_start = str(model_config_payload['startDate'])[:10]
    if model_config_payload.get('endDate'):
        time_end = str(model_config_payload['endDate'])[:10]

    log(f"Building model '{model_name}' for the Calliope 0.7 engine")
    log(f"  Locations: {len(locations)}  Technologies: {len(technologies)}  Links: {len(links)}")
    log(f"  mode={mode}  solver={solver}  subset: {time_start} → {time_end}")

    # ── Translate to 0.7 structures ──────────────────────────────────────
    warnings: list[str] = []
    techs_07 = translate.build_techs_07(technologies, warnings)
    nodes = translate.build_nodes_07(locations, loc_tech_assign, technologies, warnings)
    link_techs = translate.build_transmission_techs_07(
        links, techs_07, _LINK_TYPE_DEFAULTS, warnings)

    # Standalone transmission tech definitions must not stay in techs: without
    # link_from/link_to they fail 0.7 validation — the per-link copies carry
    # their parameters instead.
    for tid in [t for t, d in techs_07.items()
                if d.get('base_tech') == 'transmission' and 'link_from' not in d]:
        del techs_07[tid]
    techs_07.update(link_techs)

    # Default demand tech when none exists (0.6 runner parity)
    has_demand = any(d.get('base_tech') == 'demand' for d in techs_07.values())
    if not has_demand and techs_07:
        log("  No demand tech found – adding default electricity demand")
        techs_07['demand_electricity'] = {
            'base_tech': 'demand', 'name': 'Electricity demand',
            'carrier_in': 'electricity',
        }

    if not nodes:
        log("  No locations found – creating a single default region")
        nodes = {'region1': {'techs': {tid: None for tid in techs_07
                                       if 'link_from' not in techs_07[tid]}}}

    # Assign demand techs to every non-hub node that has techs (0.6 parity)
    demand_tids = [t for t, d in techs_07.items() if d.get('base_tech') == 'demand']
    link_tids = set(link_techs)
    demand_already_located = any(
        dt in (ncfg.get('techs') or {}) for ncfg in nodes.values() for dt in demand_tids)
    if demand_tids and not demand_already_located:
        for ncfg in nodes.values():
            keys = set(ncfg.get('techs') or {})
            if keys and not keys.issubset(link_tids):
                for dt in demand_tids:
                    ncfg['techs'].setdefault(dt, None)

    # Link techs must not appear under nodes.techs in 0.7 (attachment is via
    # link_from/link_to)
    for ncfg in nodes.values():
        for lt in list((ncfg.get('techs') or {}).keys()):
            if lt in link_tids or (techs_07.get(lt, {}).get('base_tech') == 'transmission'):
                ncfg['techs'].pop(lt, None)

    config_dir = Path(work_dir) / 'model_config'
    config_dir.mkdir(exist_ok=True)

    _write_payload_csvs(model_data, config_dir)
    file_tables, covered_pairs = _build_file_ref_data_tables(
        techs_07, nodes, config_dir, warnings)
    demand_tables = _build_demand_data_tables(
        locations, nodes, techs_07, time_start, time_end, config_dir, warnings,
        covered_pairs)
    user_tables = _build_user_data_tables(model_data, config_dir)
    data_tables = {**file_tables, **demand_tables, **user_tables}

    for w in warnings:
        log(f"  [translate] {w}")

    # ── Solver options ───────────────────────────────────────────────────
    opt_map = _SOLVER_OPTION_MAP.get(solver, {})
    solver_options = dict(_SOLVER_OPTION_DEFAULTS.get(solver, {}))
    for ui_key, ui_val in (model_config_payload.get('solverOptions') or {}).items():
        mapped = opt_map.get(ui_key)
        if mapped is not None:
            solver_options[mapped] = ui_val

    config = translate.build_config_07(
        model_name, mode, time_start, time_end, solver, solver_options,
        ensure_feasibility=(model_config_payload.get('ensureFeasibility')
                            if model_config_payload.get('ensureFeasibility') is not None
                            else True),
    )

    model_doc = {
        'config': config,
        'techs': techs_07,
        'nodes': nodes,
    }
    if data_tables:
        model_doc['data_tables'] = data_tables
    if model_config_payload.get('cyclicStorage') is not None:
        log("[translate] model.cyclicStorage dropped — not supported in Calliope 0.7 (ignored)")

    # Top-level parameter definitions (0.7 `parameters` / imported
    # `data_definitions`, e.g. cost_interest_rate, objective_cost_weights).
    # calliope 0.7.0.dev7's model-definition schema forbids a top-level
    # `parameters:` block (extra_forbidden), so we cannot inject them there —
    # the engine falls back to its built-in defaults. Captured in metadata for
    # provenance; logged here so the drop is visible.
    model_parameters = (meta.get('modelParameters')
                        or model_config_payload.get('modelParameters') or {})
    if isinstance(model_parameters, dict) and model_parameters:
        log(f"  {len(model_parameters)} top-level parameter definition(s) not applied "
            f"(unsupported by Calliope 0.7.0.dev7 schema): {', '.join(sorted(model_parameters))}")

    if overrides:
        # Imported native-0.7 models carry overrides already in 0.7 vocabulary
        # (nodes.*, active, direct 0.7 params). Apply them verbatim; only
        # TEMPO-authored (0.6-vocabulary) overrides need translation.
        overrides_format = str(meta.get('overridesFormat')
                               or model_config_payload.get('overridesFormat') or '')
        if overrides_format.startswith('0.7'):
            model_doc['overrides'] = {
                name: ov for name, ov in overrides.items() if isinstance(ov, dict)
            }
            log(f"  Applied {len(model_doc['overrides'])} override(s) verbatim (native 0.7 vocabulary)")
        else:
            parent_by_tid = {}
            for tech in technologies or []:
                tid = translate.tech_id(tech)
                ess = tech.get('essentials') or {}
                parent_by_tid[tid] = ess.get('parent') or tech.get('parent') or 'supply'
            ov_warnings: list[str] = []
            model_doc['overrides'] = {
                name: translate.translate_override_07(ov, parent_by_tid, ov_warnings, name)
                for name, ov in overrides.items() if isinstance(ov, dict)
            }
            for w in ov_warnings:
                log(f"  [translate] {w}")
    if scenarios:
        model_doc['scenarios'] = scenarios  # lists of override names — no renames needed

    # Named math modules imported from a native 0.7 model (config.init.math_paths
    # + extra_math). Preserved so conditionally-activated math (e.g. baseline
    # calibration switched on by a scenario override) only applies where enabled.
    math_modules = meta.get('mathModules') or model_config_payload.get('mathModules') or []
    if isinstance(math_modules, list) and math_modules:
        init_cfg = model_doc['config']['init']
        math_paths = init_cfg.setdefault('math_paths', {})
        extra_math = init_cfg.setdefault('extra_math', [])
        for mod in math_modules:
            if not isinstance(mod, dict) or not (mod.get('text') or '').strip():
                continue
            name = translate.safe_id(mod.get('name') or 'custom_math')
            fname = f'math_{name}.yaml'
            (config_dir / fname).write_text(mod['text'], encoding='utf-8')
            math_paths[name] = f'model_config/{fname}'
            if mod.get('unconditional'):
                if name not in extra_math:
                    extra_math.append(name)
            log(f"  Math module '{name}' registered "
                f"({'applied to all techs' if mod.get('unconditional') else 'conditional'})")
        if not extra_math:
            init_cfg.pop('extra_math')   # keep the doc clean when all are conditional

    custom_math_yaml = model_data.get('customMath') or ''
    if custom_math_yaml.strip():
        custom_math_path = config_dir / 'custom_math.yaml'
        custom_math_path.write_text(custom_math_yaml, encoding='utf-8')
        model_doc['config']['init'].setdefault('add_math', [])
        model_doc['config']['init']['add_math'].append('model_config/custom_math.yaml')
        log("  Custom math YAML injected (model_config/custom_math.yaml)")

    model_yaml_path = Path(work_dir) / 'model.yaml'
    _dump_yaml(model_doc, model_yaml_path)
    log(f"  Wrote model.yaml  [config.init.mode={config['init']['mode']!r}]")

    # ── Load, build, solve ───────────────────────────────────────────────
    import calliope

    # pyomo 6.8.2 + calliope 0.7 kernel model solver wiring:
    #
    # calliope's _solve does: SolverFactory(solver, solver_io=None).solve(kernel_block)
    #
    # For solver='highs':
    #   SolverFactory('highs', solver_io=None) → ASL solver, calls `highs -AMPL model.nl`
    #   The apt-get highs binary does NOT support the AMPL NL interface (-AMPL flag).
    #
    # For solver='appsi_highs':
    #   SolverFactory creates an APPSI LegacySolver wrapping Highs.
    #   APPSI's add_block() iterates parameters calling .mutable, but calliope 0.7's
    #   pyomo.kernel parameter_dict objects have no .mutable attribute → AttributeError.
    #
    # Fix: patch PyomoBackendModel._solve so that when solver='highs', we write
    # an LP file (pyomo LP writer works with kernel models), call the highs binary
    # directly on it (highs --model_file model.lp --solution_file model.sol),
    # parse the solution, and return a proper pyomo SolverResults object.
    # This bypasses both the ASL-NL and APPSI incompatibilities.
    _install_highs_lp_patch()

    handler = _LogFnHandler()
    handler.setLevel(logging.INFO)
    calliope_logger = logging.getLogger('calliope')
    prev_level = calliope_logger.level
    calliope_logger.setLevel(logging.INFO)
    calliope_logger.addHandler(handler)

    try:
        log(f"Loading Calliope {calliope.__version__} model …")
        active = scenario_to_run or override_to_run
        model = calliope.read_yaml(str(model_yaml_path),
                                   **({'scenario': active} if active else {}))
        log("Building optimisation problem …")
        model.build()
        log(f"Solving with {solver} …")
        model.solve()
    except Exception:
        log(f"[TRACEBACK]\n{traceback.format_exc()}")
        raise
    finally:
        calliope_logger.removeHandler(handler)
        calliope_logger.setLevel(prev_level)

    log("Optimisation finished. Extracting results …")
    return _extract_results(model, techs_07, technologies, model_name, solver)
