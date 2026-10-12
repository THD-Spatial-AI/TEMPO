# Cross-Engine Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo rule:** never run `git commit`. Every "Checkpoint" step means: stop, show the diff summary and test output, and let Ricardo review/commit.

**Goal:** The same TEMPO model produces the same results (objective, per-tech capacity, per-tech energy, total demand) on Calliope 0.6.8, Calliope 0.7, PyPSA, OSeMOSYS and AdOpT-NET0, enforced by `scripts/verify_engines.py`.

**Architecture:** First harden the verifier and add a richer reference model so every bug below is caught by a failing check. Then fix each engine's translator/runner so its formulation matches Calliope 0.6.8 semantics (the baseline): investment annualised with Calliope's depreciation formula and scaled by `n_hours/8760`, variable costs per kWh, capacity measured where Calliope measures it, transmission charged once per link pair. OSeMOSYS gets a "parity mode" (annualised single year, hour-of-day timeslices, real `STORAGE`, two-mode transmission/storage) used by the runner; its export path is left unchanged.

**Tech Stack:** Python 3.10+ (pytest), PyPSA 0.35 + linopy + HiGHS, OSeMOSYS 2017 MathProg + GLPK, AdOpT-NET0 0.1.10 (Pyomo + HiGHS), Calliope 0.6.8 / 0.7.0.dev7.

---

## Audit baseline (2026-10-12, `scripts/reference_model.json`)

| Engine | Objective | solar_pv | battery | Status |
|---|---|---|---|---|
| Calliope 0.6.8 | 541.41 | 349.485 | 15.155 | baseline |
| Calliope 0.7 | crash (`highs` binary missing); 541.41 with CBC | 349.485 | 15.155 | Phase 1 |
| PyPSA | 524.28 | 349.485 | 15.155 | Phase 2 (tx half-cost, om_prod ignored) |
| OSeMOSYS | 0.0004 | 6.01 | — | Phase 4 |
| AdOpT-NET0 | None (empty) | — | — | Phase 3 |

Root causes (each maps to a task):

| # | Defect | Task |
|---|---|---|
| A1 | 0.7 runner calls a `highs` CLI that is never shipped on Windows | 5 |
| P1 | PyPSA reads `om_var` (never written) instead of `om_prod` | 6 |
| P2 | PyPSA link pair: only used direction gets capacity → half tx capex | 7 |
| P3 | PyPSA storage: power cost on discharge input side (÷eff), `om_annual` on kWh store, no `e_cyclic` | 8 |
| D1 | AdOpT: techs placed at every node when `locationTechAssignments` is empty | 9 |
| D2 | AdOpT: costs ×1000 (€/MW) but quantities not ÷1000; sub-annual window gets full-year capex | 10 |
| D3 | AdOpT: network free (γ=0), `loss` is per-km so 0.02×400 km = 800 % loss | 11 |
| D4 | AdOpT: storage capex = energy_cap on MWh, `sqrt(eff)` per direction (Calliope applies `eff` each way) | 12 |
| D5 | AdOpT: generic RES gets constant 0.5 capacity factor | 13 |
| D6 | AdOpT: HDF5 extractor uses `Design/Summary/Operation`, files use lowercase | 14 |
| O1 | OSeMOSYS: window demand written as annual demand; objective in M€; full capex | 16 |
| O2 | OSeMOSYS: per-location overrides ignored; CF always 1.0 | 17 |
| O3 | OSeMOSYS: transmission pair half-cost each, capacity on output side | 18 |
| O4 | OSeMOSYS: storage virtual fuel balances per timeslice → storage can never shift energy | 19 |
| V1 | Verifier: AdOpT contract-only, demand counted as capacity, no energy check, weak reference model | 2, 3 |

## Locked decisions

1. **Baseline = Calliope 0.6.8.** Every other engine is compared against it (0.7 when 0.6 absent).
2. **Time scaling convention** (all engines): investment cost = `capex × CRF(interest_rate, lifetime) × n_hours/8760`; `om_annual` also × `n_hours/8760`; `om_prod`/`om_con` per kWh, unscaled. CRF is Calliope's `r/(1-(1+r)^-L)` (or `1/L` at r=0) — `engine_common.annuity()`.
3. **Capacity measurement points** (match Calliope 0.6): supply/conversion/storage → output side; transmission → sending (input) side; both link ends report the same capacity.
4. **Storage efficiency:** Calliope 0.6 applies `energy_eff` on charge *and* discharge (round trip = eff²). All engines do the same.
5. **OSeMOSYS parity mode** (runner only): single year representing the window annualised; `OperationalLife = 1`, `CapitalCost = capex × CRF`, `DiscountRate = 1e-9` (makes CRF/PvAnnuity/discount factors ≡ 1 and salvage 0); timeslices = `S` seasons × 24 hour-of-day brackets (`S = 1` if window < 28 days else 4); storage via OSeMOSYS `STORAGE`; transmission and storage as one tech with two modes. Export (`osemosys_service /export`) keeps the legacy representation — follow-up, out of scope.
6. **AdOpT units:** files carry true MW / MWh / €/MW; translator converts kW→MW, runner converts back. Sub-annual capex scaled by `n_hours/8760` in the run path only (AdOpT's own `fraction_of_year_modelled` is 1 when the topology *is* the window).
7. **Final tolerances** (Task 21): 0.6↔0.7 obj 0.5 % / cap 1 %; PyPSA 0.5 % / 1 %; OSeMOSYS 2 % / 5 %; AdOpT 2 % / 5 %. Per-payload overrides via a `_verify` block in the payload JSON.

## File map

| File | Change |
|---|---|
| `python/engine_common.py` | **Create.** Shared pure helpers: `finite`, `convert_value`, `annuity`, `is_file_ref`, `resolve_file_series`, `merged_tech_def`, `resource_to_cf`, `HOURS_PER_YEAR` |
| `python/tests/test_engine_common.py` | **Create.** |
| `scripts/make_reference_rich.py` | **Create.** Generates `scripts/reference_model_rich.json` (3-node ring, CF profile, conversion, om_prod, om_annual on storage) |
| `scripts/reference_model_rich.json` | **Create** (generated). |
| `scripts/verify_engines.py` | Demand excluded from capacity, objective sanity, energy-by-tech check, all engines vs baseline, AdOpT/OSeMOSYS tolerances, multi-payload, `--auto`, `_verify` overrides |
| `python/calliope07_translate.py` | `resolve_solver_07()` |
| `python/calliope07_runner.py` | Use it; solver dir on PATH first |
| `python/tests/test_calliope07_solver.py` | **Create.** |
| `python/pypsa_translate.py` | Import helpers from `engine_common`; `om_prod`; `link_ties`; storage costing; `e_cyclic` |
| `python/pypsa_runner.py` | `extra_functionality` applying `link_ties` |
| `python/tests/test_pypsa_translate.py` | Update tx test; new om_prod/storage/tie tests |
| `python/adoptnet0_translate.py` | Placement, units, capex scaling, per-link networks, storage capex model 4, `compute_capfactors()`; import ×1000 on sizes |
| `python/adoptnet0_runner.py` | Capfactor patch, HDF5 extraction rewrite, full contract |
| `python/tests/test_adoptnet0_translate.py`, `test_adoptnet0_runner.py` | Update + new tests |
| `python/osemosys_timeslices.py` | `parity_scheme()`, `bracket_hours()` |
| `python/osemosys_translate.py` | `parity` flag: annualisation, merged defs, CF, 2-mode TX & storage, STORAGE + time-structure CSVs |
| `python/osemosys_runner.py` | Parity mode, datafile writer for new sets/params, contract scaling |
| `python/tests/test_osemosys_translate.py`, `test_osemosys_timeslices.py` | New tests |
| `CLAUDE.md` | Tolerances + parity conventions |

Run all Python unit tests (no venv needed for pure tests):
```powershell
python -m pytest python/tests -v
```
Engine venv shortcuts used below (PowerShell):
```powershell
$V = "$env:APPDATA\TEMPO"
$PY06 = "$V\calliope-venv\Scripts\python.exe"; $PY07 = "$V\calliope07-venv\Scripts\python.exe"
$PYPSA = "$V\pypsa-venv\Scripts\python.exe"; $PYOSE = "$V\osemosys-venv\Scripts\python.exe"; $PYAD = "$V\adoptnet0-venv\Scripts\python.exe"
```

---

# Phase 0 — Make the verifier catch everything

### Task 1: Shared engine helpers (`engine_common.py`)

Moves PyPSA's pure helpers into a shared module so OSeMOSYS and AdOpT read resources, costs and per-location overrides identically.

**Files:**
- Create: `python/engine_common.py`
- Create: `python/tests/test_engine_common.py`
- Modify: `python/pypsa_translate.py` (lines 44–46 constants, 68–123 helpers, 166–199 helpers, line 287 call site)

- [ ] **Step 1: Write the failing tests**

`python/tests/test_engine_common.py`:
```python
"""Unit tests for engine_common — pure helpers shared by engine translators."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import engine_common as ec  # noqa: E402

TS = [{"fileName": "solar_cf.csv", "columns": ["datetime", "cf"], "dateColumn": "datetime",
       "data": [{"datetime": f"2005-01-01 {h:02d}:00:00", "cf": 0.5 if 6 <= h < 18 else 0.0}
                for h in range(24)]}]
MD = {"timeSeries": TS}


def test_annuity_matches_calliope():
    assert ec.annuity(0.05, 25) == pytest.approx(0.05 / (1 - 1.05 ** -25))
    assert ec.annuity(0, 20) == pytest.approx(1 / 20)
    assert ec.annuity(0.05, None) == 1.0


def test_finite_handles_inf_strings_and_sentinels():
    assert ec.finite("inf") is None
    assert ec.finite(1e15) is None
    assert ec.finite("3.5") == 3.5


def test_merged_tech_def_location_overrides_win():
    tech = {"constraints": {"energy_cap_max": 100, "lifetime": 25},
            "costs": {"monetary": {"energy_cap": 900}}}
    loc = {"constraints": {"energy_cap_max": 50}, "costs": {"monetary": {"om_prod": 0.01}}}
    cons, costs = ec.merged_tech_def(tech, loc)
    assert cons == {"energy_cap_max": 50, "lifetime": 25}
    assert costs == {"energy_cap": 900, "om_prod": 0.01}


def test_resource_to_cf_energy_per_cap_file_ref_cycles():
    report = []
    cf = ec.resource_to_cf({"resource": "file=solar_cf.csv:cf", "resource_unit": "energy_per_cap"},
                           48, report, "ctx", MD)
    assert len(cf) == 48 and cf[12] == 0.5 and cf[36] == 0.5 and cf[0] == 0.0


def test_resource_to_cf_unset_resource_is_unconstrained():
    assert ec.resource_to_cf({}, 24, [], "ctx", MD) is None
    assert ec.resource_to_cf({"resource": "inf"}, 24, [], "ctx", MD) is None


def test_resource_to_cf_absolute_energy_divides_by_cap_max():
    report = []
    cf = ec.resource_to_cf({"resource": 50, "resource_unit": "energy", "energy_cap_max": 100},
                           3, report, "ctx", MD)
    assert cf == [0.5, 0.5, 0.5]
    assert any("absolute resource" in r for r in report)


def test_resource_to_cf_unitless_small_values_are_cf():
    assert ec.resource_to_cf({"resource": 0.3}, 2, [], "ctx", MD) == [0.3, 0.3]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest python/tests/test_engine_common.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'engine_common'`

- [ ] **Step 3: Create `python/engine_common.py`**

```python
"""
engine_common.py
----------------
Pure, dependency-free helpers shared by the non-Calliope engine translators
(pypsa_translate, osemosys_translate, adoptnet0_translate) so every engine
reads costs, resources and per-location overrides with the same
Calliope 0.6 semantics.
"""

from __future__ import annotations

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


def resource_to_cf(constraints, n, report, ctx, model_data):
    """Supply resource → per-unit availability list of length n, or None (unconstrained).

    Calliope 0.6 semantics: resource_unit 'energy_per_cap' → values are capacity
    factors; 'energy' → absolute kW, approximated as resource / energy_cap_max;
    unset → values ≤ 1 are treated as capacity factors, larger as absolute."""
    resource = constraints.get('resource')
    unit = str(constraints.get('resource_unit') or '').lower()
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
    series = [abs(v) for v in series]

    peak = max(series) if series else 0.0
    as_cf = unit == 'energy_per_cap' or (unit != 'energy' and peak <= 1.001)
    if as_cf:
        return [max(0.0, min(1.0, v)) for v in series]
    if cap_max:
        report.append(f"{ctx}: absolute resource series approximated as CF = resource / energy_cap_max ({cap_max})")
        return [max(0.0, min(1.0, v / cap_max)) for v in series]
    report.append(f"{ctx}: absolute resource series with unbounded energy_cap_max cannot be mapped — dropped")
    return None
```

- [ ] **Step 4: Point `pypsa_translate.py` at the shared helpers**

Delete from `pypsa_translate.py`: `HOURS_PER_YEAR`/`_INF_SENTINEL` constants (keep `UNMET_DEMAND_COST`), `convert_value`, `_finite`, `_annuity`, `_is_file_ref`, `_resolve_file_series`, `_merged_tech_def`, `_resource_to_p_max_pu`. Keep `safe_id` and `_snapshots`. Add after the `engine_overlay` import:

```python
from engine_common import (  # noqa: F401  (convert_value re-exported for callers)
    HOURS_PER_YEAR,
    annuity as _annuity,
    convert_value,
    finite as _finite,
    is_file_ref as _is_file_ref,
    merged_tech_def as _merged_tech_def,
    resolve_file_series as _resolve_file_series,
    resource_to_cf,
)
```

Replace the supply call site (currently line 287):
```python
                p_max_pu = _resource_to_p_max_pu(
                    constraints.get('resource'), cap_max, n, report, ctx, model_data)
```
with:
```python
                p_max_pu = resource_to_cf(constraints, n, report, ctx, model_data)
```

Check nothing else imported the removed names: `grep -rn "_resource_to_p_max_pu\|pypsa_translate import\|t\._finite\|t\._annuity" python scripts`. Fix any hit to use the new names (tests may reference `t._annuity` — it still exists as an alias).

- [ ] **Step 5: Run tests**

Run: `python -m pytest python/tests/test_engine_common.py python/tests/test_pypsa_translate.py -v`
Expected: all PASS (PyPSA tests unchanged in behaviour — the reference model has no `resource_unit`).

- [ ] **Step 6: Checkpoint** — Ricardo reviews/commits `refactor(engines): shared engine_common helpers`.

---

### Task 2: Rich reference model

`reference_model.json` cannot catch P1, O2, D5 (no profile, no `om_prod`, no conversion, one link). This adds a second model. Daily profiles repeat exactly so OSeMOSYS hour-of-day timeslices can match Calliope exactly; `storage_loss` is 0 because OSeMOSYS 2017 has no self-discharge.

**Files:**
- Create: `scripts/make_reference_rich.py`
- Create (generated): `scripts/reference_model_rich.json`

- [ ] **Step 1: Write the generator**

`scripts/make_reference_rich.py`:
```python
"""
Generate scripts/reference_model_rich.json — the strict cross-engine parity model.

3-node ring (north/south/east), one week hourly. Exercises: per-location resource
override with a capacity-factor file (resource_unit energy_per_cap), a two-carrier
conversion chain (gas_supply → ccgt) with om_prod fuel costs, storage with
om_annual, three links of different length. Daily demand / CF shapes repeat
exactly every 24 h (keeps OSeMOSYS hour-of-day timeslices exact) and
storage_loss is 0 (OSeMOSYS 2017 has no self-discharge).

    python scripts/make_reference_rich.py
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

OUT = Path(__file__).parent / 'reference_model_rich.json'
CF_DAY = [0, 0, 0, 0, 0, 0.02, 0.10, 0.25, 0.42, 0.57, 0.67, 0.72,
          0.72, 0.67, 0.57, 0.42, 0.25, 0.10, 0.02, 0, 0, 0, 0, 0]
HOURS = 168
t0 = datetime(2005, 1, 1)
cf_rows = [{'datetime': (t0 + timedelta(hours=h)).strftime('%Y-%m-%d %H:%M:%S'),
            'cf': CF_DAY[h % 24]} for h in range(HOURS)]

solar_override = {'constraints': {'resource': 'file=solar_cf.csv:cf',
                                  'resource_unit': 'energy_per_cap'}}

model = {
    '_comment': 'Strict cross-engine parity model. Generated by scripts/make_reference_rich.py — do not hand-edit.',
    'name': 'Rich Parity Reference',
    'solver': 'highs',
    'modelConfig': {'mode': 'plan', 'startDate': '2005-01-01', 'endDate': '2005-01-07',
                    'ensureFeasibility': True},
    'technologies': [
        {'name': 'solar_pv',
         'essentials': {'parent': 'supply', 'carrier_out': 'electricity', 'name': 'Solar PV'},
         'constraints': {'energy_cap_max': 3000, 'energy_eff': 1.0, 'lifetime': 25},
         'costs': {'monetary': {'energy_cap': 600, 'om_annual': 10, 'interest_rate': 0.05}}},
        {'name': 'battery',
         'essentials': {'parent': 'storage', 'carrier': 'electricity', 'name': 'Battery'},
         'constraints': {'energy_cap_max': 1000, 'storage_cap_max': 6000, 'energy_eff': 0.95,
                         'storage_loss': 0, 'lifetime': 15},
         'costs': {'monetary': {'storage_cap': 150, 'energy_cap': 80, 'om_annual': 2,
                                'interest_rate': 0.05}}},
        {'name': 'gas_supply',
         'essentials': {'parent': 'supply', 'carrier_out': 'gas', 'name': 'Gas supply'},
         'constraints': {'energy_cap_max': 10000, 'lifetime': 25},
         'costs': {'monetary': {'energy_cap': 1, 'om_prod': 0.03, 'interest_rate': 0.05}}},
        {'name': 'ccgt',
         'essentials': {'parent': 'conversion', 'carrier_in': 'gas', 'carrier_out': 'electricity',
                        'name': 'CCGT'},
         'constraints': {'energy_cap_max': 700, 'energy_eff': 0.55, 'lifetime': 30},
         'costs': {'monetary': {'energy_cap': 800, 'om_annual': 15, 'om_prod': 0.004,
                                'interest_rate': 0.05}}},
        {'name': 'power_demand',
         'essentials': {'parent': 'demand', 'carrier_in': 'electricity', 'name': 'Power demand'},
         'constraints': {'resource': -150, 'force_resource': True}},
        {'name': 'hvac',
         'essentials': {'parent': 'transmission', 'carrier': 'electricity', 'name': 'HVAC line'},
         'constraints': {'energy_cap_max': 3000, 'energy_eff': 0.98, 'lifetime': 40},
         'costs': {'monetary': {'energy_cap': 20, 'energy_cap_per_distance': 0.8,
                                'interest_rate': 0.05}}},
    ],
    'locations': [
        {'name': 'north', 'latitude': 52.0, 'longitude': 10.0,
         'techs': {'solar_pv': {**solar_override,
                                'constraints': {**solar_override['constraints'], 'energy_cap_max': 1500}},
                   'battery': None, 'power_demand': None},
         'demandProfile': {'timeseries': [100, 90, 80, 80, 90, 110, 140, 160, 170, 165, 160, 155,
                                          150, 150, 155, 165, 180, 200, 210, 200, 180, 150, 120, 105]}},
        {'name': 'south', 'latitude': 48.0, 'longitude': 11.0,
         'techs': {'gas_supply': None, 'ccgt': None, 'power_demand': None},
         'demandProfile': {'timeseries': [60, 55, 50, 50, 55, 70, 90, 110, 120, 118, 115, 112,
                                          110, 110, 112, 118, 130, 145, 150, 145, 130, 105, 85, 70]}},
        {'name': 'east', 'latitude': 50.0, 'longitude': 14.0,
         'techs': {'solar_pv': solar_override, 'power_demand': None},
         'demandProfile': {'timeseries': [40, 38, 35, 35, 38, 45, 60, 75, 80, 78, 76, 74,
                                          72, 72, 74, 78, 85, 95, 100, 95, 85, 70, 55, 45]}},
    ],
    'links': [
        {'from': 'north', 'to': 'south', 'tech': 'hvac', 'distance': 400},
        {'from': 'south', 'to': 'east', 'tech': 'hvac', 'distance': 350},
        {'from': 'east', 'to': 'north', 'tech': 'hvac', 'distance': 380},
    ],
    'locationTechAssignments': {},
    'timeSeries': [{'name': 'solar_cf', 'fileName': 'solar_cf.csv',
                    'columns': ['datetime', 'cf'], 'dateColumn': 'datetime', 'data': cf_rows}],
}

OUT.write_text(json.dumps(model, indent=1), encoding='utf-8')
print(f'wrote {OUT} ({HOURS} h, {len(model["locations"])} nodes, {len(model["links"])} links)')
```

- [ ] **Step 2: Generate and sanity-run it on the baseline engine**

```powershell
python scripts/make_reference_rich.py
& $PY06 scripts/verify_engines.py --python06 $PY06 --payload scripts/reference_model_rich.json
```
Expected: `wrote ...reference_model_rich.json (168 h, 3 nodes, 3 links)` then `[calliope-0.6.8] OK` and `CROSS-ENGINE VERIFICATION PASSED [calliope-0.6.8]`.

If 0.6.8 fails to resolve `file=solar_cf.csv:cf` (look for `[CSV]` lines in the log), stop and report — do not change the model shape; the 0.6 runner's CSV path is what the UI uses.

- [ ] **Step 3: Record the baseline numbers**

Run `& $PY06 scripts/run_engine_driver.py calliope_runner scripts/reference_model_rich.json $env:TEMP\rich06.json` and note the objective and `capacities` in the PR description. Sanity expectations: `ccgt` > 0 at south, `solar_pv` > 0 at north and east, `battery` > 0, all three links carry flow.

- [ ] **Step 4: Checkpoint** — `test(verify): rich cross-engine reference model`.

---

### Task 3: Verifier upgrades

**Files:**
- Modify: `scripts/verify_engines.py`

- [ ] **Step 1: Objective sanity in `check_contract`**

Append to the body of `check_contract` (after the `transmission_flow` loop):
```python
    obj = r.get('objective')
    if not isinstance(obj, (int, float)) or obj <= 0:
        failures.append(f"[{tag}] objective missing or non-positive: {obj!r}")
    if not r.get('capacities'):
        failures.append(f"[{tag}] capacities empty — result extraction failed")
```

- [ ] **Step 2: Energy-by-tech aggregation + demand exclusion**

Add below `_cap_by_tech`:
```python
def _gen_by_tech(result, comparable_techs):
    """Total produced energy per tech (summed over locations and carriers).
    Keys look like 'loc::tech::carrier' (transmission 'loc::tech:remote::carrier' is skipped)."""
    agg = {}
    for key, val in (result.get('generation') or {}).items():
        parts = key.split('::')
        if len(parts) < 2:
            continue
        tech = parts[1]
        if ':' in tech or tech not in comparable_techs:
            continue
        agg[tech] = agg.get(tech, 0.0) + (val or 0.0)
    return agg
```

In `compare_pair`, after the per-tech capacity loop, add:
```python
    # Per-tech produced energy (catches dispatch/cost-ordering differences)
    ga, gb = _gen_by_tech(r_a, non_tx_techs), _gen_by_tech(r_b, non_tx_techs)
    for tech in sorted(set(ga) | set(gb)):
        va, vb = ga.get(tech, 0.0), gb.get(tech, 0.0)
        if max(abs(va), abs(vb)) < 1e-3:
            continue
        d = pct_diff(va, vb)
        print(f"energy {tech}:  {tag_a}={va:.1f}  {tag_b}={vb:.1f}  diff={d:.3f}%")
        if d > cap_tol:
            failures.append(
                f"[{tag_a} vs {tag_b}] energy '{tech}' differs by {d:.3f}% (> {cap_tol}%)")
```

In `main()`, change the `non_tx_techs` computation to also exclude demand:
```python
    non_tx_techs = {name for name, parent in tech_parents.items()
                    if parent not in ('transmission', 'demand')}
```

- [ ] **Step 3: AdOpT tolerance flags + `--auto` + multi-payload**

Replace the `--payload` argument and add new ones in `main()`:
```python
    ap.add_argument('--payload', action='append', default=None,
                    help='Payload JSON (repeatable). Default: reference_model.json and '
                         'reference_model_rich.json')
    ap.add_argument('--adoptnet0-obj-tol', type=float, default=2.0, dest='adoptnet0_obj_tol',
                    help='AdOpT-NET0 vs Calliope objective tolerance %% (default 2.0)')
    ap.add_argument('--adoptnet0-cap-tol', type=float, default=5.0, dest='adoptnet0_cap_tol',
                    help='AdOpT-NET0 vs Calliope per-tech capacity tolerance %% (default 5.0)')
    ap.add_argument('--auto', action='store_true',
                    help='Use every engine venv found under %%APPDATA%%/TEMPO (Windows) '
                         'or ~/.config/TEMPO (Linux)')
```

Add after `args = ap.parse_args()`:
```python
    if args.auto:
        root = Path(os.environ.get('APPDATA') or Path.home() / '.config') / 'TEMPO'
        exe = 'Scripts/python.exe' if os.name == 'nt' else 'bin/python'
        for dest, venv in (('python06', 'calliope-venv'), ('python07', 'calliope07-venv'),
                           ('python_pypsa', 'pypsa-venv'), ('python_osemosys', 'osemosys-venv'),
                           ('python_adoptnet0', 'adoptnet0-venv')):
            p = root / venv / exe
            if getattr(args, dest) is None and p.exists():
                setattr(args, dest, str(p))
    payload_paths = args.payload or [str(REPO / 'scripts' / 'reference_model.json'),
                                     str(REPO / 'scripts' / 'reference_model_rich.json')]
```

- [ ] **Step 4: Replace the run/compare section of `main()` with a per-payload loop**

Replace everything in `main()` from `payload = json.loads(...)` down to (not including) the `# ── Summary` block with:
```python
    failures = []
    all_results = {}
    for payload_path in payload_paths:
        payload = json.loads(Path(payload_path).read_text(encoding='utf-8'))
        name = Path(payload_path).name
        print(f"\n################ PAYLOAD {name} ################")

        # Per-payload tolerance overrides: {"_verify": {"osemosys_cap_tol": 10, ...}}
        tol = {k: getattr(args, k) for k in (
            'obj_tol', 'cap_tol', 'pypsa_obj_tol', 'pypsa_cap_tol', 'osemosys_obj_tol',
            'osemosys_cap_tol', 'adoptnet0_obj_tol', 'adoptnet0_cap_tol')}
        tol.update(payload.get('_verify') or {})

        tech_parents = {
            t['name']: (t.get('essentials') or {}).get('parent', t.get('parent', ''))
            for t in payload.get('technologies', [])
        }
        non_tx_techs = {n for n, p in tech_parents.items() if p not in ('transmission', 'demand')}

        results = {}
        for tag, (py_exe, module) in engines_to_run.items():
            try:
                results[tag] = run_engine(py_exe, module, payload_path, args.solver_dir)
            except SystemExit as exc:
                failures.append(f"[{name}] {exc}")
        all_results[name] = results

        print("\n=== CONTRACT CHECKS ===")
        for tag, r in results.items():
            n_before = len(failures)
            check_contract(f'{name}:{tag}', r, failures)
            print(f"[{tag}] " + ('OK' if len(failures) == n_before else f'{len(failures) - n_before} issue(s)'))

        print("\n=== COMPARISONS ===")
        baseline = next((t for t in ('calliope-0.6.8', 'calliope-0.7') if t in results), None)
        pair_tol = {
            'calliope-0.7': (tol['obj_tol'], tol['cap_tol']),
            'pypsa': (tol['pypsa_obj_tol'], tol['pypsa_cap_tol']),
            'osemosys': (tol['osemosys_obj_tol'], tol['osemosys_cap_tol']),
            'adoptnet0': (tol['adoptnet0_obj_tol'], tol['adoptnet0_cap_tol']),
        }
        if baseline is None:
            print("  (no Calliope baseline — pairwise checks skipped)")
        for tag in results:
            if tag == baseline:
                continue
            o_tol, c_tol = pair_tol[tag]
            compare_pair(f'{name}:{baseline}', results[baseline], f'{name}:{tag}', results[tag],
                         o_tol, c_tol, non_tx_techs, failures)

        if len(results) > 1:
            print("\n--- Contract key-set consistency ---")
            key_sets = {tag: set(r.keys()) for tag, r in results.items()}
            for key in sorted(set().union(*key_sets.values())):
                absent = sorted(t for t, ks in key_sets.items() if key not in ks)
                if absent:
                    print(f"  '{key}': absent in {absent}")
                    if key in CONTRACT_KEYS:
                        failures.append(f"[{name}] contract key '{key}' missing from {absent}")

    if args.check_myopic:
        print("\n=== MYOPIC RESIDUAL PATHWAY CHECKS ===")
        payload = json.loads(Path(payload_paths[0]).read_text(encoding='utf-8'))
        for tag, (py_exe, module) in engines_to_run.items():
            check_myopic(tag, py_exe, module, payload, args.solver_dir,
                         args.myopic_obj_tol, args.myopic_cap_tol, failures)
```
And change the success line to:
```python
    print(f"CROSS-ENGINE VERIFICATION PASSED  [{', '.join(sorted(engines_to_run))}] "
          f"on {', '.join(Path(p).name for p in payload_paths)}")
```
Remove the now-dead old comparison blocks and the old AdOpT "pairwise comparison skipped" print. Update the module docstring: AdOpT is now compared (delete the "AdOpT-NET0 note: contract checks only" paragraph), add `--auto`, `--adoptnet0-obj-tol/--adoptnet0-cap-tol`, repeatable `--payload`, and the energy-by-tech check.

- [ ] **Step 5: Run the verifier and confirm it now fails loudly for the known defects**

```powershell
python scripts/verify_engines.py --auto 2>&1 | Select-String "FAIL|PASSED"
```
Expected `FAIL:` lines including at least: `calliope07_runner FAILED`, `pypsa] objective differs`, `pypsa] energy 'ccgt'` or `objective` on the rich model, `osemosys] objective differs`, `adoptnet0] objective missing or non-positive`, `adoptnet0] capacities empty`. No `capacity 'power_demand' on one engine only` (demand is now excluded). Save the full output to `$env:TEMP\verify_baseline.txt` and attach the FAIL list to the checkpoint.

- [ ] **Step 6: Checkpoint** — `test(verify): compare all engines vs Calliope baseline, energy check, --auto`.

---

# Phase 1 — Calliope 0.7 solver

### Task 4: Fall back to CBC when no HiGHS binary exists

The UI always sends `solver: 'highs'`; the 0.7 runner's LP-file patch shells out to a `highs` executable that TEMPO never installs (only `cbc.exe`). The Run view already labels 0.7 as "CBC", so CBC is the intended solver.

**Files:**
- Modify: `python/calliope07_translate.py` (imports at top; add function after `normalize_solver_07`, ~line 545)
- Modify: `python/calliope07_runner.py:832-846`
- Create: `python/tests/test_calliope07_solver.py`

- [ ] **Step 1: Write the failing test**

`python/tests/test_calliope07_solver.py`:
```python
"""resolve_solver_07: HiGHS needs a CLI binary on the 0.7 engine; fall back to CBC."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import calliope07_translate as t  # noqa: E402


def test_highs_falls_back_to_cbc_without_binary():
    solver, note = t.resolve_solver_07('highs', which=lambda name: None)
    assert solver == 'cbc'
    assert 'CBC' in note


def test_highs_kept_when_binary_present():
    solver, note = t.resolve_solver_07('highs', which=lambda name: '/usr/bin/highs')
    assert (solver, note) == ('highs', None)


def test_cbc_and_glpk_pass_through():
    assert t.resolve_solver_07('cbc', which=lambda n: None) == ('cbc', None)
    assert t.resolve_solver_07('glpk', which=lambda n: None) == ('glpk', None)


def test_commercial_solver_maps_through_highs_then_cbc():
    assert t.resolve_solver_07('gurobi', which=lambda n: None)[0] == 'cbc'
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest python/tests/test_calliope07_solver.py -v`
Expected: FAIL — `AttributeError: module 'calliope07_translate' has no attribute 'resolve_solver_07'`

- [ ] **Step 3: Implement**

In `python/calliope07_translate.py` add `import shutil` to the imports, and after `normalize_solver_07`:
```python
def resolve_solver_07(requested: str, which=None) -> tuple[str, str | None]:
    """Normalised solver plus an optional log note.

    'highs' on the 0.7 engine is solved through an LP file and the `highs`
    command-line binary (see calliope07_runner._install_highs_lp_patch). TEMPO
    only bundles CBC, so without that binary on PATH fall back to CBC."""
    which = which or shutil.which
    solver = normalize_solver_07(requested)
    if solver == 'highs' and not which('highs'):
        return 'cbc', "HiGHS command-line binary not found — using bundled CBC for Calliope 0.7"
    return solver, None
```

In `python/calliope07_runner.py` replace lines 832–846 (from `requested_solver = ...` through the CBC `raise RuntimeError(...)` block) with:
```python
    requested_solver = model_data.get('solver') or 'highs'
    solver_dir = os.environ.get('CALLIOPE_SOLVER_DIR')
    if solver_dir and os.path.isdir(solver_dir):
        os.environ['PATH'] = solver_dir + os.pathsep + os.environ.get('PATH', '')
    solver, solver_note = translate.resolve_solver_07(requested_solver)
    if solver_note:
        log(f"  {solver_note}")
    elif solver != requested_solver:
        log(f"  Solver '{requested_solver}' mapped to '{solver}' for Calliope 0.7")
    if solver == 'cbc':
        import shutil as _shutil
        if not (_shutil.which('cbc') or _shutil.which('cbc.exe')):
            raise RuntimeError(
                "The CBC solver binary is not available. Reinstall the "
                "Calliope 0.7 engine from TEMPO Settings (it downloads CBC), "
                "or run this model on the 0.6.8 engine."
            )
```

- [ ] **Step 4: Run unit tests + engine check**

```powershell
python -m pytest python/tests/test_calliope07_solver.py python/tests/test_calliope07_translate.py -v
python scripts/verify_engines.py --python06 $PY06 --python07 $PY07
```
Expected: unit tests PASS; verifier prints `Solver 'highs'`… `using bundled CBC`, objective diff `0.000%` on `reference_model.json`, and the rich model within 0.5 % / 1 %; ends `CROSS-ENGINE VERIFICATION PASSED [calliope-0.6.8, calliope-0.7]`.

- [ ] **Step 5: Checkpoint** — `fix(calliope07): fall back to CBC when no HiGHS binary`.

---

# Phase 2 — PyPSA

### Task 5: Read `om_prod` (variable O&M)

**Files:**
- Modify: `python/pypsa_translate.py` (the two `costs.get('om_var')` reads; reverse translation `costs['om_var'] = marg`)
- Test: `python/tests/test_pypsa_translate.py`

- [ ] **Step 1: Write the failing test** (append to `test_pypsa_translate.py`)

```python
def test_om_prod_becomes_marginal_cost(ref_model):
    m = ref_model
    solar = next(t for t in m['technologies'] if t['name'] == 'solar_pv')
    solar['costs']['monetary']['om_prod'] = 0.05
    link = next(t for t in m['technologies'] if t['name'] == 'grid_link')
    link['costs']['monetary']['om_prod'] = 0.002
    spec, _ = t.translate_model(m)
    gen = next(g for g in spec['generators'] if g['name'] == 'north::solar_pv')
    assert gen['marginal_cost'] == pytest.approx(0.05)
    fwd = next(l for l in spec['links'] if l['name'] == 'north::grid_link:south')
    assert fwd['marginal_cost'] == pytest.approx(0.002 * 0.97)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest python/tests/test_pypsa_translate.py::test_om_prod_becomes_marginal_cost -v`
Expected: FAIL — `assert 0.0 == 0.05 ± ...`

- [ ] **Step 3: Implement**

In `translate_model`, both lines
```python
            om_var = _finite(costs.get('om_var')) or 0.0
```
(per-location tech loop and transmission loop; the second has 8-space indent) become:
```python
            om_var = _finite(costs.get('om_prod')) or 0.0  # calliope 0.6 variable O&M
```
In the reverse translation (`network_to_internal`, currently `costs['om_var'] = marg`) write `costs['om_prod'] = marg`. Run `grep -n "om_var" python/pypsa_translate.py` — the only remaining hits must be the local variable name.

- [ ] **Step 4: Run tests**

Run: `python -m pytest python/tests/test_pypsa_translate.py -v`
Expected: all PASS (fix any import/roundtrip test that asserted `om_var` to assert `om_prod`).

- [ ] **Step 5: Checkpoint** — `fix(pypsa): map calliope om_prod to marginal_cost`.

---

### Task 6: Charge transmission once per link pair (`link_ties`)

Keep two directed Links (lossy bidirectional flow) but force equal `p_nom` with a linopy constraint, so both directions are built, both report the Calliope capacity, and the pair costs `pair_cost` in total.

**Files:**
- Modify: `python/pypsa_translate.py` (spec init ~line 221; transmission loop ~line 417)
- Modify: `python/pypsa_runner.py:303`
- Test: `python/tests/test_pypsa_translate.py:238-251`

- [ ] **Step 1: Update/write the failing tests**

Replace `test_transmission_two_directed_links_half_cost` with:
```python
def test_transmission_two_directed_links_tied(ref_spec):
    spec, report = ref_spec
    fwd = next(l for l in spec['links'] if l['name'] == 'north::grid_link:south')
    rev = next(l for l in spec['links'] if l['name'] == 'south::grid_link:north')
    assert fwd['bus0'] == 'north::electricity' and fwd['bus1'] == 'south::electricity'
    assert rev['bus0'] == 'south::electricity' and rev['bus1'] == 'north::electricity'
    assert fwd['efficiency'] == 0.97
    assert fwd['p_nom_max'] == 3000
    annuity = 0.05 / (1 - 1.05 ** -40)
    pair_cost = (0.5 * 400) * annuity * (168 / 8760)
    assert fwd['capital_cost'] == pytest.approx(pair_cost / 2)
    assert rev['capital_cost'] == pytest.approx(pair_cost / 2)
    assert {'a': fwd['name'], 'b': rev['name'], 'ratio': 1.0} in spec['link_ties']
    assert any('equal capacity' in r for r in report)


@needs_pypsa
def test_link_ties_build_equal_capacities(ref_model):
    import pypsa_runner
    spec, _ = t.translate_model(ref_model)
    n = t.build_network(spec)
    n.optimize(solver_name='highs', extra_functionality=pypsa_runner._tie_links(spec))
    p = n.links.p_nom_opt
    assert p['north::grid_link:south'] == pytest.approx(p['south::grid_link:north'], rel=1e-6)
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_pypsa_translate.py -k "tied" -v`
Expected: FAIL — `KeyError: 'link_ties'`

- [ ] **Step 3: Implement translator side**

In the `spec = {...}` initialiser add after `'links': [],`:
```python
        'link_ties': [],    # {a, b, ratio}: p_nom[a] == ratio * p_nom[b] (runner adds the constraint)
```
In the transmission loop, after the `for bus0, bus1, x0, x1 in ...` loop and before `report.append(...)`:
```python
        spec['link_ties'].append({'a': f"{a}::{tid}:{b}", 'b': f"{b}::{tid}:{a}", 'ratio': 1.0})
```
and change the report line to:
```python
        report.append(f"link {a}↔{b} ({tid}): two directed Links tied to equal capacity, half pair cost each")
```
Update the module docstring bullet `transmission = two directed Links, each carrying half the pair cost` → `transmission = two directed Links tied to equal p_nom, each carrying half the pair cost`.

- [ ] **Step 4: Implement runner side**

In `python/pypsa_runner.py` add above `run_model`:
```python
def _tie_links(spec):
    """extra_functionality enforcing p_nom[a] == ratio * p_nom[b] for spec['link_ties']."""
    ties = spec.get('link_ties') or []

    def _apply(n, snapshots):
        if not ties:
            return
        p_nom = n.model['Link-p_nom']
        dim = p_nom.dims[0]
        ext = set(p_nom.coords[dim].values)
        for i, tie in enumerate(ties):
            if tie['a'] in ext and tie['b'] in ext:
                n.model.add_constraints(
                    p_nom.sel({dim: tie['a']}) - tie['ratio'] * p_nom.sel({dim: tie['b']}) == 0,
                    name=f"tempo_link_tie_{i}")

    return _apply
```
and change line 303:
```python
        res = n.optimize(solver_name=solver, extra_functionality=_tie_links(spec))
```

- [ ] **Step 5: Run tests (pure + inside the PyPSA venv)**

```powershell
python -m pytest python/tests/test_pypsa_translate.py -v
& $PYPSA -m pytest python/tests/test_pypsa_translate.py -v
```
Expected: all PASS in both.

- [ ] **Step 6: Checkpoint** — `fix(pypsa): tie directed link pairs so transmission is charged once`.

---

### Task 7: Storage power costing, `om_annual`, cyclic storage

Calliope storage `energy_cap` bounds both charge (bus side) and discharge output; `om_annual` is per kW of `energy_cap`; Calliope 0.6.8 defaults `cyclic_storage: true`.

**Files:**
- Modify: `python/pypsa_translate.py` storage branch (~lines 326–357) and `build_network` stores loop
- Test: `python/tests/test_pypsa_translate.py:214` (`test_storage_store_plus_links`)

- [ ] **Step 1: Write the failing test** (append)

```python
def test_storage_power_cost_on_output_side_and_tied(ref_model):
    batt = next(x for x in ref_model['technologies'] if x['name'] == 'battery')
    batt['costs']['monetary']['om_annual'] = 2
    spec, _ = t.translate_model(ref_model)
    annuity = 0.05 / (1 - 1.05 ** -15)
    yf = 168 / 8760
    store = next(s for s in spec['stores'] if s['name'] == 'north::battery')
    dis = next(l for l in spec['links'] if l['name'] == 'north::battery::discharge')
    ch = next(l for l in spec['links'] if l['name'] == 'north::battery::charge')
    assert store['capital_cost'] == pytest.approx(300 * annuity * yf)          # kWh only
    assert dis['capital_cost'] == pytest.approx((100 * annuity + 2) * yf * 0.95)  # per store-side kW
    assert dis['p_nom_max'] == pytest.approx(1000 / 0.95)
    assert ch['capital_cost'] == 0.0 and ch['p_nom_max'] == 1000
    assert {'a': ch['name'], 'b': dis['name'], 'ratio': 0.95} in spec['link_ties']
    assert store['e_cyclic'] is True
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_pypsa_translate.py::test_storage_power_cost_on_output_side_and_tied -v`
Expected: FAIL on `store['capital_cost']` (currently includes om_annual) or `e_cyclic` KeyError.

- [ ] **Step 3: Implement**

Replace the `spec['stores'].append({...})` and the two `spec['links'].append(...)` calls in the storage branch with:
```python
                spec['stores'].append({
                    'name': comp_name, 'bus': store_bus,
                    'e_nom_max': e_nom_max,
                    'standing_loss': standing_loss,
                    'capital_cost': cap_storage * annuity * year_frac,
                    'e_cyclic': bool(model_config.get('cyclicStorage', True)),
                })
                if ep_pypsa:
                    spec['stores'][-1]['_engine_params'] = ep_pypsa
                # calliope energy_cap bounds charge (bus side, = charge p0) and discharge
                # output (= discharge p0 * eff). Cost lives on the discharge link per p0
                # unit (hence * eff); the charge link is tied to it.
                spec['links'].append({
                    'name': f"{comp_name}::charge", 'bus0': bus, 'bus1': store_bus,
                    'efficiency': eff, 'p_nom_max': cap_max,
                    'capital_cost': 0.0, 'marginal_cost': 0.0,
                })
                spec['links'].append({
                    'name': f"{comp_name}::discharge", 'bus0': store_bus, 'bus1': bus,
                    'efficiency': eff,
                    'p_nom_max': (cap_max / eff) if (cap_max is not None and eff) else cap_max,
                    'capital_cost': (cap_energy * annuity + om_annual) * year_frac * eff,
                    'marginal_cost': om_var * eff,
                })
                spec['link_ties'].append({'a': f"{comp_name}::charge",
                                          'b': f"{comp_name}::discharge", 'ratio': eff})
                report.append(f"{ctx}: storage mapped to Store + charge/discharge Links (tied to one energy_cap)")
```
In `build_network`'s stores loop add, next to `e_nom_max`:
```python
        if store.get('e_cyclic') is not None:
            kwargs['e_cyclic'] = store['e_cyclic']
```
Update the module docstring bullet `storage = Store + charge/discharge Links (charge capacity uncosted)` → `storage = Store + charge/discharge Links tied to one energy_cap (cost on discharge, output side)`. Update `test_storage_store_plus_links` expectations to the new costs if it asserts them.

`pypsa_runner` needs no change: it already reports `discharge p_nom_opt × efficiency` as capacity and adds the discharge link's capital cost.

- [ ] **Step 4: Run tests + engine comparison**

```powershell
python -m pytest python/tests/test_pypsa_translate.py -v
& $PYPSA -m pytest python/tests/test_pypsa_translate.py -v
python scripts/verify_engines.py --python06 $PY06 --python-pypsa $PYPSA --pypsa-obj-tol 0.5 --pypsa-cap-tol 1
```
Expected: PASS on both payloads. On `reference_model.json` PyPSA objective ≈ 541.41 (was 524.28).

If the rich model's `battery` or `ccgt` energy differs >1 %, inspect whether simultaneous charge/discharge or cyclic boundary differs before loosening anything; report numbers at the checkpoint.

- [ ] **Step 5: Checkpoint** — `fix(pypsa): storage power cost on output side, om_annual per kW, cyclic storage`.

---

# Phase 3 — AdOpT-NET0

All translator tasks are tested by writing the case directory and reading files back (no venv). Task 14 is the first that produces engine numbers.

### Task 8: Place techs from `loc.techs` when no assignments exist

**Files:**
- Modify: `python/adoptnet0_translate.py` `_write_node_data` (~line 653)
- Test: `python/tests/test_adoptnet0_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
import json  # noqa: E402  (keep with other imports at top of file)

REF = Path(__file__).parent.parent.parent / "scripts" / "reference_model.json"


def _node_techs(model_dir, node):
    p = Path(model_dir) / "period1" / "node_data" / node / "Technologies.json"
    return json.loads(p.read_text(encoding="utf-8"))["new"]


def test_techs_placed_only_where_location_lists_them():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert sorted(_node_techs(tmp, "north")) == ["battery", "solar_pv"]
    assert _node_techs(tmp, "south") == []
```
(Move `import json` to the top import block.)

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py::test_techs_placed_only_where_location_lists_them -v`
Expected: FAIL — south has `['solar_pv', 'battery']`.

- [ ] **Step 3: Implement**

Replace:
```python
        if not assigned_refs and not location_tech_assignments:
            assigned_refs = [t.get("id") or t.get("name", "") for t in technologies]
```
with:
```python
        if not assigned_refs and not location_tech_assignments:
            # Direct loc.techs mode (same source of truth as the Calliope/PyPSA runners)
            assigned_refs = list((loc.get("techs") or {}).keys())
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py -v`
Expected: all PASS.

- [ ] **Step 5: Checkpoint** — `fix(adoptnet0): place techs per location`.

---

### Task 9: True MW units and sub-annual capex scaling

Quantities kW→MW (÷1000), costs €/kW→€/MW (×1000, unchanged), per-location overrides merged, investment scaled by `n_hours/8760` in the run path.

**Files:**
- Modify: `python/adoptnet0_translate.py` (`_economics`, `_build_*_json`, `_constraints`, `_write_node_data`, `build_model_dir`, `_parse_tech_json`)
- Modify: `python/adoptnet0_runner.py:309` (`build_model_dir` call)
- Test: `python/tests/test_adoptnet0_translate.py`

- [ ] **Step 1: Write the failing tests** (append; and update the two existing demand tests)

```python
def _tech_json(model_dir, node, tid):
    p = Path(model_dir) / "period1" / "node_data" / node / "technology_data" / f"{tid}.json"
    return json.loads(p.read_text(encoding="utf-8"))


def test_units_are_true_mw_and_capex_scaled_for_window():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp, capex_scale=168 / 8760)
    solar = _tech_json(tmp, "north", "solar_pv")
    assert solar["size_max"] == pytest.approx(2.0)                      # 2000 kW → 2 MW
    assert solar["Economics"]["unit_CAPEX"] == pytest.approx(900_000 * 168 / 8760, rel=1e-4)
    assert solar["Economics"]["OPEX_fixed"] == pytest.approx(10 / 900)   # fraction of capex, unscaled
    rows = _read_carrier_csv(tmp)
    assert float(rows[1].split(";")[1]) == pytest.approx(0.100)         # 100 kW → 0.1 MW


def test_export_path_keeps_unscaled_capex():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert _tech_json(tmp, "north", "solar_pv")["Economics"]["unit_CAPEX"] == pytest.approx(900_000)


def test_location_override_reaches_tech_json():
    md = json.loads(REF.read_text(encoding="utf-8"))
    md["locations"][0]["techs"]["solar_pv"] = {"constraints": {"energy_cap_max": 500}}
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp)
    assert _tech_json(tmp, "north", "solar_pv")["size_max"] == pytest.approx(0.5)
```
Add `import pytest` to the test imports. In `test_osm_file_ref_demand_reaches_carrier_csv` change the asserts to `float(demands[0]) == pytest.approx(0.010)` and `float(demands[-1]) in (pytest.approx(0.033), pytest.approx(0.010))` → write as `round(float(demands[-1]), 6) in (0.033, 0.01)`. In `test_scalar_resource_demand_also_works` assert `float(d) == pytest.approx(0.042)`.

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py -v`
Expected: FAIL — `build_model_dir() got an unexpected keyword argument 'capex_scale'`, size_max 2000, demand 100.

- [ ] **Step 3: Implement**

At the top of `adoptnet0_translate.py`:
```python
from engine_common import merged_tech_def

_KW_PER_MW = 1_000.0
```

`_economics(tech)` → `_economics(costs, constr, capex_scale=1.0)`:
```python
def _economics(costs: dict, constr: dict, capex_scale: float = 1.0) -> dict:
    """AdOpT-NET0 Economics block. €/kW → €/MW (×1000); investment scaled by
    capex_scale (n_hours/8760 in the run path — AdOpT's own fraction_of_year
    is 1 when the topology is the modelled window)."""
    unit_capex = _to_float(costs.get("energy_cap"), 0.0) * _KW_PER_MW
    opex_var = _to_float(costs.get("om_prod"), 0.0) * _KW_PER_MW
    opex_fixed = (_to_float(costs.get("om_annual"), 0.0) * _KW_PER_MW / unit_capex) if unit_capex > 0 else 0.0
    return {
        "CAPEX_model": 1,
        "unit_CAPEX": round(unit_capex * capex_scale, 6),
        "fix_CAPEX": 0,
        "OPEX_variable": round(opex_var, 6),
        "OPEX_fixed": round(min(opex_fixed, 1.0), 6),
        "discount_rate": _to_float(costs.get("interest_rate"), 0.05),
        "lifetime": max(1, int(_to_float(constr.get("lifetime"), 25))),
        "decommission_cost": 0,
    }
```
Note: `om_annual` with zero `energy_cap` cannot be expressed as a capex fraction in AdOpT; add to the report in `_write_node_data`: `if costs.get("om_annual") and not costs.get("energy_cap"): report.append(f"{loc_name}/{tid}: om_annual without energy_cap not representable in AdOpT — dropped")`. (Thread `report` into `_write_node_data` as a new last parameter `report: list | None = None`; `build_model_dir` passes its `report`.)

Change every builder signature from `(tech)` to `(tech, constr, costs, capex_scale)` and inside use the merged `constr`/`costs` instead of `_constraints(tech)`/`_costs(tech)`. Sizes become MW:
```python
        "size_max": _cap_max(constr.get("energy_cap_max")) / _KW_PER_MW,
```
(`_cap_max` default stays 1_000_000 → 1000 MW when unbounded; for STOR use `storage_cap_max` → MWh.) `_build_tech_json(tech)` → `_build_tech_json(tech, constr, costs, capex_scale)` dispatching to `_PARENT_BUILDER[parent](tech, constr, costs, capex_scale)`.

In `_write_node_data` (add parameter `capex_scale: float = 1.0` before `report`), before `tech_json = _build_tech_json(...)` resolve `_loc_cfg` (move the existing `_loc_techs`/`_loc_cfg` lines up) and:
```python
            constr, costs = merged_tech_def(tech, _loc_cfg)
            tech_json = _build_tech_json(tech, constr, costs, capex_scale)
```
Demand to MW — change the carrier CSV line:
```python
                dem = str(round(demand_vals[j] / _KW_PER_MW, 9)) if has_demand else ""
```

`build_model_dir(model_data, model_dir)` → `build_model_dir(model_data, model_dir, capex_scale: float = 1.0)`; pass `capex_scale` and `report` to `_write_node_data` (and to `_write_networks` in Task 10). Docstring: document `capex_scale`.

Import side (`_parse_tech_json`): sizes back to kW:
```python
    size_max = _to_float(tdata.get("size_max"), 1_000.0) * _KW_PER_MW
```
and remove the "Runner writes kW (TEMPO internal) as MW" comment at the demand import (the ×1000 there is now correct; comment → `# carrier CSV is MW → kW`).

In `adoptnet0_runner.run_model` replace the translate call:
```python
    n_hours = len(translate.generate_timestamps(start_date, end_date))
    carriers, tr_report = translate.build_model_dir(model_data, model_dir,
                                                    capex_scale=n_hours / 8760.0)
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py python/tests/test_adoptnet0_runner.py -v`
Expected: all PASS. `grep -n "_costs(tech)\|_constraints(tech)\|_economics(tech)" python/adoptnet0_translate.py` → no builder still uses the unmerged helpers (the helpers may remain if `_parse_*` uses them; delete them if now unused).

- [ ] **Step 5: Checkpoint** — `fix(adoptnet0): true MW units, merged location overrides, window-scaled capex`.

---

### Task 10: One network per link with real costs and losses

AdOpT's `loss` is per km (`loss = flow·μ·distance`) and costs are `γ2·S + γ4·S·distance` per arc, counted once for bidirectional networks. One network per link gives exact μ and distance.

**Files:**
- Modify: `python/adoptnet0_translate.py` `_write_networks` (~lines 487–564)
- Test: `python/tests/test_adoptnet0_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
def test_one_network_per_link_with_costs_and_per_km_loss():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp, capex_scale=168 / 8760)
    netw = json.loads((Path(tmp) / "period1" / "Networks.json").read_text(encoding="utf-8"))
    assert netw["new"] == ["grid_link__north__south"]
    data = json.loads((Path(tmp) / "period1" / "network_data" / "grid_link__north__south.json")
                      .read_text(encoding="utf-8"))
    eco, perf = data["Economics"], data["Performance"]
    assert eco["gamma2"] == pytest.approx(0.0)
    assert eco["gamma4"] == pytest.approx(0.5 * 1000 * 168 / 8760)   # €/kW/km → €/MW/km, scaled
    assert eco["discount_rate"] == 0.05 and eco["lifetime"] == 40
    assert perf["loss"] == pytest.approx((1 - 0.97) / 400)            # per km
    assert perf["bidirectional_network"] == 1
    assert data["size_max"] == pytest.approx(3.0)                     # 3000 kW → 3 MW
    conn = (Path(tmp) / "period1" / "network_topology" / "new" / "grid_link__north__south"
            / "connection.csv").read_text(encoding="utf-8").splitlines()
    assert conn[1] == "north;0;1" and conn[2] == "south;1;0"
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py::test_one_network_per_link_with_costs_and_per_km_loss -v`
Expected: FAIL — network named `electricity_network`.

- [ ] **Step 3: Implement**

Replace `_write_networks` and delete `_LINK_LOSS_BY_TYPE`:
```python
def network_name(tid: str, a: str, b: str) -> str:
    """AdOpT network id for one TEMPO link (one network per link → exact distance/loss)."""
    return f"{_safe_id(tid)}__{_safe_id(a)}__{_safe_id(b)}"


def _write_networks(period_dir: str, locations: list, links: list, technologies: list,
                    capex_scale: float = 1.0, report: list | None = None) -> None:
    report = report if report is not None else []
    network_data_dir = os.path.join(period_dir, "network_data")
    os.makedirs(network_data_dir, exist_ok=True)
    node_names = [_safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
                  for i, loc in enumerate(locations)]
    by_ref = {t.get("name"): t for t in technologies}
    by_ref.update({t.get("id"): t for t in technologies if t.get("id")})

    network_names: list = []
    for lnk in links:
        a, b = _safe_id(lnk.get("from") or ""), _safe_id(lnk.get("to") or "")
        tech = by_ref.get(lnk.get("tech"))
        if tech is None or a not in node_names or b not in node_names:
            report.append(f"link {a}→{b}: tech '{lnk.get('tech')}' or node not found — skipped")
            continue
        constr, costs = merged_tech_def(tech, None)
        carrier = _get_carrier_out(tech) or "electricity"
        km = _to_float(lnk.get("distance"), 0.0)
        eff = _to_float(constr.get("energy_eff"), 1.0)
        if km <= 0:
            km = 1.0
            report.append(f"link {a}↔{b}: no distance — 1 km used (loss and per-distance cost apply to 1 km)")
        net_name = network_name(tech.get("name") or tech.get("id"), a, b)
        network_names.append(net_name)

        _write_json(os.path.join(network_data_dir, f"{net_name}.json"), {
            "network_type": carrier,
            "size_is_int": 0,
            "decommission": "impossible",
            "size_min": 0,
            "size_max": _cap_max(constr.get("energy_cap_max")) / _KW_PER_MW,
            "Economics": {
                "gamma1": 0,
                "gamma2": round(_to_float(costs.get("energy_cap"), 0.0) * _KW_PER_MW * capex_scale, 6),
                "gamma3": 0,
                "gamma4": round(_to_float(costs.get("energy_cap_per_distance"), 0.0) * _KW_PER_MW * capex_scale, 6),
                "OPEX_variable": round(_to_float(costs.get("om_prod"), 0.0) * _KW_PER_MW, 6),
                "OPEX_fixed": 0,
                "discount_rate": _to_float(costs.get("interest_rate"), 0.05),
                "lifetime": max(1, int(_to_float(constr.get("lifetime"), 40))),
                "decommission_cost": 0,
            },
            "Performance": {
                "carrier": carrier,
                "bidirectional_network": 1,
                "loss": round((1.0 - eff) / km, 12),
                "min_transport": 0,
                "loss2emissions": 0,
                "emissionfactor": 0,
                "energyconsumption": [],
            },
        })

        topo_dir = os.path.join(period_dir, "network_topology", "new", net_name)
        os.makedirs(topo_dir, exist_ok=True)
        conn = {n: {n2: 0 for n2 in node_names} for n in node_names}
        dist = {n: {n2: 0 for n2 in node_names} for n in node_names}
        conn[a][b] = conn[b][a] = 1
        dist[a][b] = dist[b][a] = km
        for fname, matrix in (("connection.csv", conn), ("distance.csv", dist)):
            with open(os.path.join(topo_dir, fname), "w", encoding="utf-8") as fh:
                fh.write(";" + ";".join(node_names) + "\n")
                for n in node_names:
                    fh.write(n + ";" + ";".join(str(matrix[n][n2]) for n2 in node_names) + "\n")
        if costs.get("om_annual"):
            report.append(f"link {a}↔{b}: om_annual on transmission not mapped in AdOpT — dropped")

    _write_json(os.path.join(period_dir, "Networks.json"), {"existing": [], "new": network_names})
```
Before replacing, read the tail of the old `_write_networks` (after the matrices) and keep any other file it writes (e.g. `Networks.json` shape) — the new function must write the same set of files. Update the `build_model_dir` call:
```python
    _write_networks(period_dir, locations, links, technologies, capex_scale, report)
```
OPEX_variable semantics: AdOpT network variable OPEX is `CAPEX_arc × opex_variable` per the docstring — if Step 4's engine run shows that, set `"OPEX_variable": 0` and report `om_prod on transmission not mapped` instead (reference models have no transmission om_prod).

- [ ] **Step 4: Run tests**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py -v`
Expected: all PASS.

- [ ] **Step 5: Checkpoint** — `fix(adoptnet0): one costed network per link, per-km loss from energy_eff`.

---

### Task 11: Storage capex (model 4) and Calliope efficiency

**Files:**
- Modify: `python/adoptnet0_translate.py` `_build_stor_json`
- Test: `python/tests/test_adoptnet0_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
def test_storage_capex_model4_and_eff_each_way():
    md = json.loads(REF.read_text(encoding="utf-8"))
    tmp = tempfile.mkdtemp()
    tr.build_model_dir(md, tmp, capex_scale=168 / 8760)
    b = _tech_json(tmp, "north", "battery")
    s = 168 / 8760
    assert b["Economics"]["CAPEX_model"] == 4
    assert b["Economics"]["unit_CAPEX"] == pytest.approx(300_000 * s)          # €/MWh
    assert b["Flexibility"]["power_energy_ratio"] == "flexratio"
    assert b["Flexibility"]["capex_discharging_power"] == pytest.approx(100_000 * s)
    assert b["Flexibility"]["capex_charging_power"] == 0
    perf = b["Performance"]["performance"]
    assert perf["eta_in"] == pytest.approx(0.95) and perf["eta_out"] == pytest.approx(0.95)
    assert perf["lambda"] == pytest.approx(0.01)
    assert b["size_max"] == pytest.approx(5.0)                                   # 5000 kWh → 5 MWh
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py::test_storage_capex_model4_and_eff_each_way -v`
Expected: FAIL — `CAPEX_model == 1`.

- [ ] **Step 3: Implement** — replace `_build_stor_json`:
```python
def _build_stor_json(tech: dict, constr: dict, costs: dict, capex_scale: float = 1.0) -> dict:
    carrier = _get_carrier_out(tech)
    eff = max(0.01, min(1.0, _to_float(constr.get("energy_eff"), 1.0)))  # calliope: applied each way
    econ = _economics(costs, constr, capex_scale)
    econ["CAPEX_model"] = 4
    econ["unit_CAPEX"] = round(_to_float(costs.get("storage_cap"), 0.0) * _KW_PER_MW * capex_scale, 6)
    power_capex = _to_float(costs.get("energy_cap"), 0.0) * _KW_PER_MW * capex_scale
    econ["OPEX_fixed"] = 0  # storage om_annual: see note below
    # Ratio cap: discharge/charge MW per MWh — large enough not to bind before energy_cap_max.
    e_max = _cap_max(constr.get("storage_cap_max")) / _KW_PER_MW
    p_max = _cap_max(constr.get("energy_cap_max")) / _KW_PER_MW
    rate = max(1.0, p_max / e_max) if e_max > 0 else 1.0
    return {
        "tec_type": "STOR",
        "size_min": 0,
        "size_max": e_max,
        "size_is_int": 0,
        "decommission": "impossible",
        "Economics": econ,
        "Performance": {
            "input_carrier": [carrier],
            "main_input_carrier": carrier,
            "output_carrier": [carrier],
            "emission_factor": 0,
            "allow_only_one_direction": 1,
            "performance": {
                "eta_in": round(eff, 6),
                "eta_out": round(eff, 6),
                "lambda": _to_float(constr.get("storage_loss"), 0.0),
                "theta": 0.0,
            },
        },
        "Flexibility": {
            "power_energy_ratio": "flexratio",
            "charge_rate": rate,
            "discharge_rate": rate,
            "capex_charging_power": 0,
            "capex_discharging_power": round(power_capex, 6),
        },
        "Units": {"size": "MWh", "input_carrier": {carrier: "MW"}, "output_carrier": {carrier: "MW"}},
    }
```
Storage `om_annual` has no exact AdOpT equivalent under CAPEX model 4 (`OPEX_fixed` is a fraction of total capex, not per MW of power). In `_write_node_data`, when a storage tech has `om_annual`, append to the report `f"{loc_name}/{tid}: storage om_annual not mapped in AdOpT — dropped"` (the rich model's 2 €/kW/yr is < 0.5 % of its objective, inside tolerance). Likewise, when `energy_cap_max` is finite, report `f"{loc_name}/{tid}: storage energy_cap_max enforced only via the charge/discharge-to-energy ratio"`.

Also update `_parse_tech_json`'s STOR branch to read `eta_in`/`eta_out` from `Performance.performance` (round trip `eta_in*eta_out` → Calliope `energy_eff = sqrt(rt)` is wrong now; set `energy_eff = eta_out`), `storage_cap = unit_CAPEX / 1000`, `energy_cap = Flexibility.capex_discharging_power / 1000`.

- [ ] **Step 4: Run tests**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py -v`
Expected: all PASS.

- [ ] **Step 5: Checkpoint** — `fix(adoptnet0): storage capex model 4 and calliope efficiency`.

---

### Task 12: Real capacity factors for RES techs

**Files:**
- Modify: `python/adoptnet0_translate.py` (add `compute_capfactors`)
- Modify: `python/adoptnet0_runner.py:21-39` (`_patch_res_capfactor`) and `run_model`
- Test: `python/tests/test_adoptnet0_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
RICH = Path(__file__).parent.parent.parent / "scripts" / "reference_model_rich.json"


def test_compute_capfactors_from_location_override():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    cf = tr.compute_capfactors(md, [])
    assert set(cf) == {("north", "solar_pv"), ("east", "solar_pv")}
    assert len(cf[("north", "solar_pv")]) == 168
    assert cf[("north", "solar_pv")][12] == pytest.approx(0.72)
    assert ("south", "gas_supply") not in cf          # no resource → unconstrained (CF 1)
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_adoptnet0_translate.py::test_compute_capfactors_from_location_override -v`
Expected: FAIL — `AttributeError: ... no attribute 'compute_capfactors'`

- [ ] **Step 3: Implement**

In `adoptnet0_translate.py` (import `resource_to_cf` alongside `merged_tech_def`):
```python
def compute_capfactors(model_data: dict, report: list) -> dict:
    """{(node, tech): hourly CF list} for supply techs with a resource.
    Supply techs without one are unconstrained (CF 1.0, Calliope semantics)."""
    cfg = model_data.get("modelConfig") or {}
    n = len(_generate_timestamps((cfg.get("startDate") or "2024-01-01")[:10],
                                 (cfg.get("endDate") or "2024-12-31")[:10]))
    techs = {t.get("name"): t for t in model_data.get("technologies") or []}
    out = {}
    for i, loc in enumerate(model_data.get("locations") or []):
        node = _safe_id(loc.get("name") or loc.get("id", f"node_{i}"))
        for ref, loc_cfg in (loc.get("techs") or {}).items():
            tech = techs.get(ref)
            if tech is None or _get_parent(tech) not in ("supply", "supply_plus"):
                continue
            constr, _ = merged_tech_def(tech, loc_cfg)
            cf = resource_to_cf(constr, n, report, f"{node}/{ref}", model_data)
            if cf is not None:
                out[(node, _safe_id(tech.get("name") or ref))] = cf
    return out
```

In `adoptnet0_runner.py` replace `_patch_res_capfactor`:
```python
_CAPFACTORS: dict = {}  # (node, tech) -> hourly CF; filled by run_model before read_data


def _patch_res_capfactor(Res):
    """adopt_net0 only computes capfactor for names containing "Photovoltaic",
    "SolarThermal" or "WindTurbine". For every other RES tech inject the TEMPO
    resource profile (compute_capfactors), or CF 1.0 when the tech has no
    resource (Calliope: unconstrained supply)."""
    import numpy as np
    if getattr(Res.fit_technology_performance, "_tempo_patched", False):
        return
    _orig_fit = Res.fit_technology_performance

    def _patched_fit(self, climate_data, location):
        _orig_fit(self, climate_data, location)
        td_full = self.processed_coeff.time_dependent_full
        if "capfactor" not in td_full:
            n = len(climate_data)
            series = _CAPFACTORS.get((getattr(location, "name", None), self.name))
            td_full["capfactor"] = np.array(series[:n], dtype=float) if series else np.ones(n)

    _patched_fit._tempo_patched = True
    Res.fit_technology_performance = _patched_fit
```
In `run_model`, right after the translate call:
```python
    _CAPFACTORS.clear()
    _CAPFACTORS.update(translate.compute_capfactors(model_data, tr_report))
```
(and log the report lines after this so CF notes appear).

- [ ] **Step 4: Run tests + a venv smoke check of the key lookup**

```powershell
python -m pytest python/tests/test_adoptnet0_translate.py -v
& $PYAD -c "import sys; sys.path.insert(0,'python'); import adoptnet0_runner as R; from adopt_net0.components.technologies import Res; R._patch_res_capfactor(Res); print('patched', Res.fit_technology_performance._tempo_patched)"
```
Expected: tests PASS; prints `patched True`.

- [ ] **Step 5: Checkpoint** — `fix(adoptnet0): RES capacity factor from TEMPO resource (CF 1 when none)`.

---

### Task 13: HDF5 extraction and full frozen contract

**Files:**
- Modify: `python/adoptnet0_runner.py` (`_extract_results`, `_to_frozen_contract`, `run_model`)
- Test: `python/tests/test_adoptnet0_runner.py`

- [ ] **Step 1: Write the failing tests** (append; they build a tiny HDF5 file — skipped where h5py is missing)

```python
import pytest

h5py = pytest.importorskip("h5py")
import numpy as np  # noqa: E402

from adoptnet0_runner import _extract_results  # noqa: E402


def _make_h5(path):
    with h5py.File(path, "w") as f:
        f["summary/total_cost"] = [1234.5]
        f["summary/solver_status"] = [b"optimal"]
        g = "design/nodes/period1/north/solar_pv/"
        f[g + "size"] = [0.35]
        f[g + "capex_tot"] = [400.0]
        f[g + "opex_fixed_tot"] = [50.0]
        f[g + "opex_variable"] = [10.0]
        f["operation/technology_operation/period1/north/solar_pv/electricity_output"] = [0.1, 0.2]
        n = "design/networks/period1/grid_link__north__south/northsouth/"
        f[n + "size"] = 0.15
        f[n + "capex"] = 30.0
        f[n + "fromNode"] = b"north"
        f[n + "toNode"] = b"south"
        n2 = "design/networks/period1/grid_link__north__south/southnorth/"
        f[n2 + "size"] = 0.15
        f[n2 + "capex"] = 30.0
        f[n2 + "fromNode"] = b"south"
        f[n2 + "toNode"] = b"north"
        o = "operation/networks/period1/grid_link__north__south/"
        f[o + "northsouth/flow"] = [0.1, 0.0]
        f[o + "northsouth/losses"] = [0.003, 0.0]
        f[o + "southnorth/flow"] = [0.0, 0.05]
        f[o + "southnorth/losses"] = [0.0, 0.0015]
        f["operation/energy_balance/period1/north/electricity/demand"] = [0.1, 0.1]
        f["operation/energy_balance/period1/south/electricity/demand"] = [0.05, 0.05]


def test_extract_lowercase_hdf5(tmp_path):
    _make_h5(tmp_path / "optimization_results.h5")
    ex = _extract_results(str(tmp_path))
    assert ex["objective"] == 1234.5
    assert ex["solver_status"] == "optimal"
    assert ex["capacity"]["north"]["solar_pv"] == pytest.approx(0.35)
    assert ex["tech_costs"]["north"]["solar_pv"] == pytest.approx(460.0)
    assert ex["dispatch"]["north"]["solar_pv"]["electricity"] == [0.1, 0.2]
    assert ex["arcs"]["grid_link__north__south"][("north", "south")]["size"] == pytest.approx(0.15)
    assert ex["network_costs"]["grid_link__north__south"] == pytest.approx(30.0)  # counted once
    assert ex["demand"]["electricity"] == [pytest.approx(0.15), pytest.approx(0.15)]


def test_frozen_contract_converts_mw_to_kw(tmp_path):
    _make_h5(tmp_path / "optimization_results.h5")
    ex = _extract_results(str(tmp_path))
    model = {"technologies": [
        {"name": "solar_pv", "essentials": {"parent": "supply", "carrier_out": "electricity"}},
        {"name": "grid_link", "essentials": {"parent": "transmission", "carrier": "electricity"}},
    ], "links": [{"from": "north", "to": "south", "tech": "grid_link"}]}
    c = _to_frozen_contract(ex, ["t0", "t1"], model, "m", "highs")
    assert c["capacities"]["north::solar_pv"] == pytest.approx(350.0)
    assert c["capacities"]["north::grid_link:south"] == pytest.approx(150.0)
    assert c["capacities"]["south::grid_link:north"] == pytest.approx(150.0)
    assert c["generation"]["north::solar_pv::electricity"] == pytest.approx(300.0)
    assert c["dispatch"]["solar_pv"] == [pytest.approx(100.0), pytest.approx(200.0)]
    assert c["costs_by_tech"] == {"solar_pv": pytest.approx(460.0), "grid_link": pytest.approx(30.0)}
    tf = c["transmission_flow"]["north::south"]
    assert tf["from"] == "north" and tf["to"] == "south"
    assert tf["timeseries"] == [pytest.approx(97.0), pytest.approx(-48.5)]  # delivered, signed
    assert c["demand_timeseries"] == [pytest.approx(150.0), pytest.approx(150.0)]
    assert c["tech_parents"] == {"solar_pv": "supply", "grid_link": "transmission"}
    assert c["termination_condition"] == "optimal"
```
`pytest.importorskip` at module level would skip the whole file outside the venv — so put these two tests in a new file `python/tests/test_adoptnet0_h5.py` (with the same `sys.path` header as `test_adoptnet0_runner.py` and `from adoptnet0_runner import _extract_results, _to_frozen_contract`). Update the existing `EXTRACTED` fixture tests in this file to the new extracted shape (`dispatch[node][tech][carrier]`, `tech_costs`, `arcs`, `network_costs`, `demand`) — the expected contract keys stay the same set.

- [ ] **Step 2: Run to verify failure**

Run: `& $PYAD -m pytest python/tests/test_adoptnet0_runner.py -v`
Expected: FAIL — objective None / KeyError `tech_costs`.

- [ ] **Step 3: Implement `_extract_results`**

```python
def _extract_results(results_dir: str) -> dict:
    """Read AdOpT-NET0's optimization_results.h5 (lowercase groups) into model units (MW, €)."""
    h5_files = glob.glob(os.path.join(results_dir, "**", "*.h5"), recursive=True)
    if not h5_files:
        log("No HDF5 result file found — capacity/dispatch unavailable")
        return {}
    h5_path = sorted(h5_files)[-1]
    log(f"  Reading HDF5 results: {os.path.basename(h5_path)}")
    import h5py
    import numpy as np

    def _scalar(ds):
        v = np.array(ds).ravel()[0]
        return v.decode() if isinstance(v, bytes) else float(v)

    out = {"objective": None, "solver_status": "unknown", "capacity": {}, "tech_costs": {},
           "dispatch": {}, "arcs": {}, "network_costs": {}, "demand": {}}
    with h5py.File(h5_path, "r") as f:
        if "summary/total_cost" in f:
            out["objective"] = _scalar(f["summary/total_cost"])
        if "summary/solver_status" in f:
            out["solver_status"] = _scalar(f["summary/solver_status"])

        nodes = f.get("design/nodes/period1") or {}
        for node in nodes:
            for tech in nodes[node]:
                g = nodes[node][tech]
                if "size" in g:
                    out["capacity"].setdefault(node, {})[tech] = _scalar(g["size"])
                cost = sum(_scalar(g[k]) for k in ("capex_tot", "opex_fixed_tot", "opex_variable") if k in g)
                out["tech_costs"].setdefault(node, {})[tech] = cost

        ops = f.get("operation/technology_operation/period1") or {}
        for node in ops:
            for tech in ops[node]:
                for key in ops[node][tech]:
                    if key.endswith("_output"):
                        carrier = key[: -len("_output")]
                        out["dispatch"].setdefault(node, {}).setdefault(tech, {})[carrier] = \
                            np.array(ops[node][tech][key]).ravel().tolist()

        nets = f.get("design/networks/period1") or {}
        flows = f.get("operation/networks/period1") or {}
        for net in nets:
            seen_pairs = set()
            for arc in nets[net]:
                g = nets[net][arc]
                a, b = _scalar(g["fromNode"]), _scalar(g["toNode"])
                rec = {"size": _scalar(g["size"]) if "size" in g else 0.0}
                if net in flows and arc in flows[net]:
                    fl = np.array(flows[net][arc]["flow"]).ravel()
                    ls = np.array(flows[net][arc]["losses"]).ravel() if "losses" in flows[net][arc] else 0 * fl
                    rec["delivered"] = (fl - ls).tolist()
                out["arcs"].setdefault(net, {})[(a, b)] = rec
                pair = tuple(sorted((a, b)))
                if pair not in seen_pairs:  # bidirectional: capex counted once per pair
                    seen_pairs.add(pair)
                    out["network_costs"][net] = out["network_costs"].get(net, 0.0) + sum(
                        _scalar(g[k]) for k in ("capex", "opex_fixed", "opex_variable") if k in g)

        bal = f.get("operation/energy_balance/period1") or {}
        for node in bal:
            for carrier in bal[node]:
                if "demand" in bal[node][carrier]:
                    d = np.array(bal[node][carrier]["demand"]).ravel()
                    prev = out["demand"].get(carrier)
                    out["demand"][carrier] = (d if prev is None else np.array(prev) + d).tolist()
    return out
```

- [ ] **Step 4: Implement `_to_frozen_contract`**

```python
_KW_PER_MW = 1_000.0


def _to_frozen_contract(extracted: dict, timestamps: list, model_data: dict, name: str = "",
                        solver: str = "highs") -> dict:
    """AdOpT-NET0 extracted results (MW, €) → TEMPO frozen contract (kW, kWh, €)."""
    techs = {t.get("name"): t for t in model_data.get("technologies") or []}
    parents = {n: translate._get_parent(t) for n, t in techs.items()}
    link_tech = {translate.network_name(l.get("tech"), l.get("from"), l.get("to")): l.get("tech")
                 for l in model_data.get("links") or []}

    capacities, generation, dispatch = {}, {}, {}
    costs_by_tech, costs_by_location = {}, {}
    for node, tmap in (extracted.get("capacity") or {}).items():
        for tech, mw in tmap.items():
            capacities[f"{node}::{tech}"] = mw * _KW_PER_MW
    for node, tmap in (extracted.get("tech_costs") or {}).items():
        for tech, eur in tmap.items():
            costs_by_tech[tech] = costs_by_tech.get(tech, 0.0) + eur
            costs_by_location.setdefault(node, {})[tech] = eur
    for node, tmap in (extracted.get("dispatch") or {}).items():
        for tech, cmap in tmap.items():
            for carrier, series in cmap.items():
                kw = [(v or 0.0) * _KW_PER_MW for v in series]
                generation[f"{node}::{tech}::{carrier}"] = sum(kw)
                prev = dispatch.get(tech)
                dispatch[tech] = kw if prev is None else [p + q for p, q in zip(prev, kw)]

    transmission_flow = {}
    for net, arcs in (extracted.get("arcs") or {}).items():
        tid = link_tech.get(net, net.split("__")[0])
        for (a, b), rec in arcs.items():
            capacities[f"{a}::{tid}:{b}"] = rec.get("size", 0.0) * _KW_PER_MW
        for (a, b) in {tuple(sorted(p)) for p in arcs}:
            fwd = (arcs.get((a, b)) or {}).get("delivered") or []
            rev = (arcs.get((b, a)) or {}).get("delivered") or []
            n = max(len(fwd), len(rev))
            net_flow = [((fwd[i] if i < len(fwd) else 0.0) - (rev[i] if i < len(rev) else 0.0)) * _KW_PER_MW
                        for i in range(n)]
            transmission_flow[f"{a}::{b}"] = {"from": a, "to": b, "timeseries": net_flow}
        costs_by_tech[tid] = costs_by_tech.get(tid, 0.0) + (extracted.get("network_costs") or {}).get(net, 0.0)

    demand = [0.0] * len(timestamps)
    for series in (extracted.get("demand") or {}).values():
        for i, v in enumerate(series[: len(demand)]):
            demand[i] += (v or 0.0) * _KW_PER_MW

    status = str(extracted.get("solver_status") or "unknown")
    return {
        "success": status in ("ok", "optimal"),
        "framework": "adoptnet0",
        "model_name": name,
        "name": name,
        "solver": solver,
        "objective": extracted.get("objective"),
        "termination_condition": "optimal" if status in ("ok", "optimal") else status,
        "capacities": capacities,
        "generation": generation,
        "dispatch": dispatch,
        "timestamps": timestamps,
        "transmission_flow": transmission_flow,
        "demand_timeseries": demand,
        "costs_by_tech": costs_by_tech,
        "costs_by_location": costs_by_location,
        "tech_metadata": {n: {"name": (t.get("essentials") or {}).get("name", n),
                              "carrier": translate._get_carrier_out(t),
                              "color": (t.get("essentials") or {}).get("color", "")}
                          for n, t in techs.items()},
        "tech_parents": parents,
    }
```
`network_name` lives in `adoptnet0_translate` (Task 10). In `run_model`, attach `frozen["translation_report"] = tr_report` before returning.

- [ ] **Step 5: Run unit tests**

```powershell
python -m pytest python/tests/test_adoptnet0_runner.py python/tests/test_adoptnet0_translate.py -v
& $PYAD -m pytest python/tests/test_adoptnet0_runner.py -v
```
Expected: all PASS (h5py tests run only in the venv).

- [ ] **Step 6: Engine comparison**

```powershell
python scripts/verify_engines.py --python06 $PY06 --python-adoptnet0 $PYAD
```
Expected: PASS within 2 % / 5 % on both payloads. Also confirm in the AdOpT log: `summary/violation_cost` ≈ 0 (no unmet demand) and non-zero flow on every link of the rich model. `sum(costs_by_tech)` should equal `objective − violation_cost` within 0.1 %.

If objective is off by a constant factor, check AdOpT's annualisation of `unit_CAPEX` against `engine_common.annuity` (both use `r/(1-(1+r)^-L)`), then the `OPEX_variable` network semantics noted in Task 10. If storage capacity is off, check `flexratio` rate caps. Report residual gaps with numbers at the checkpoint instead of widening tolerances.

- [ ] **Step 7: Checkpoint** — `fix(adoptnet0): read lowercase HDF5, full frozen contract in kW`.

---

# Phase 4 — OSeMOSYS parity mode

### Task 14: Hour-of-day parity timeslice scheme

**Files:**
- Modify: `python/osemosys_timeslices.py`
- Test: `python/tests/test_osemosys_timeslices.py`

- [ ] **Step 1: Write the failing tests** (append)

```python
def test_parity_scheme_short_window_single_season():
    assert ts.parity_scheme(168) == {"seasons": 1, "dayBlocks": 24}
    assert ts.parity_scheme(8760) == {"seasons": 4, "dayBlocks": 24}


def test_bracket_hours_sum_to_24():
    assert ts.bracket_hours({"seasons": 1, "dayBlocks": 24}) == [1] * 24
    assert ts.bracket_hours({"seasons": 4, "dayBlocks": 3}) == [8, 8, 8]
    assert sum(ts.bracket_hours({"seasons": 1, "dayBlocks": 5})) == 24


def test_parity_year_split_uniform_for_whole_days():
    ys = ts.year_split_for_n_hours(168, ts.parity_scheme(168))
    assert all(abs(v - 1 / 24) < 1e-12 for v in ys.values())
```
(Use the module alias already imported in that test file — check its import line, e.g. `import osemosys_timeslices as ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_osemosys_timeslices.py -v`
Expected: FAIL — no attribute `parity_scheme`.

- [ ] **Step 3: Implement** (append to `osemosys_timeslices.py`)

```python
def parity_scheme(n_hours: int) -> dict:
    """Hour-of-day scheme used by the runner's parity mode: 24 daily brackets so
    OSeMOSYS STORAGE can cycle within the day; one season for windows shorter
    than four weeks, four otherwise."""
    return {"seasons": 1 if n_hours < 28 * 24 else 4, "dayBlocks": 24}


def bracket_hours(scheme: dict) -> list:
    """Hours in each daily time bracket (same split rule as _assign_slices)."""
    day_blocks = int(scheme.get("dayBlocks", 3))
    base, rem = divmod(24, day_blocks)
    return [base + (1 if d <= rem else 0) for d in range(1, day_blocks + 1)]
```

- [ ] **Step 4: Run tests** — `python -m pytest python/tests/test_osemosys_timeslices.py -v` → PASS.

- [ ] **Step 5: Checkpoint** — `feat(osemosys): parity timeslice scheme helpers`.

---

### Task 15: Parity-mode annualisation (demand, capex, discounting)

**Files:**
- Modify: `python/osemosys_translate.py` (`translate_model` signature; supply/conversion capex; demand total)
- Test: `python/tests/test_osemosys_translate.py`

- [ ] **Step 1: Write the failing tests** (append)

```python
import csv as _csvmod  # noqa: E402 (move to top imports)

REF = Path(__file__).parent.parent.parent / "scripts" / "reference_model.json"


def _rows(d, name):
    with open(Path(d) / name, encoding="utf-8") as fh:
        return list(_csvmod.DictReader(fh))


def _parity(md):
    import osemosys_timeslices as tsl
    d = tempfile.mkdtemp()
    osemosys_translate.translate_model(md, d, tsl.parity_scheme(168), parity=True)
    return d


def test_parity_demand_is_annualised():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = _parity(md)
    north = next(r for r in _rows(d, "SpecifiedAnnualDemand.csv") if r["FUEL"] == "NORTH_ELECTRICITY")
    window_kwh = sum([100, 90, 80, 80, 90, 110, 140, 160, 170, 165, 160, 155, 150, 150, 155,
                      165, 180, 200, 210, 200, 180, 150, 120, 105]) * 7
    assert float(north["VALUE"]) == pytest.approx(window_kwh * 3.6e-9 * 8760 / 168, rel=1e-6)


def test_parity_capex_annualised_life_one():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = _parity(md)
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    life = {r["TECHNOLOGY"]: int(r["VALUE"]) for r in _rows(d, "OperationalLife.csv")}
    crf = 0.05 / (1 - 1.05 ** -25)
    assert cc["NORTH_SOLAR_PV"] == pytest.approx(900 * crf, rel=1e-6)
    assert life["NORTH_SOLAR_PV"] == 1


def test_legacy_mode_unchanged():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = tempfile.mkdtemp()
    osemosys_translate.translate_model(md, d)
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    assert cc["NORTH_SOLAR_PV"] == pytest.approx(900)
```
(Check the test file's existing imports — reuse its `osemosys_translate` alias, `json`, `tempfile`, `Path`, `pytest`; add what is missing at the top.)

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest python/tests/test_osemosys_translate.py -v`
Expected: FAIL — `translate_model() got an unexpected keyword argument 'parity'`.

- [ ] **Step 3: Implement**

Signature and docstring:
```python
def translate_model(model_data: dict, csv_dir: str, scheme: dict | None = None,
                    parity: bool = False) -> tuple:
    """...
    parity     : bool   Runner mode for cross-engine parity: the window is
                 annualised (demand × 8760/n_hours), capital cost is
                 pre-annualised with Calliope's CRF and OperationalLife = 1,
                 transmission/storage use two-mode techs and OSeMOSYS STORAGE.
                 The runner must pair it with DiscountRate ≈ 0 and scale
                 results back by n_hours/8760. Export keeps parity=False.
    """
```
Add near the top of the body (after `n_hours` is computed):
```python
    from engine_common import annuity as _crf, merged_tech_def as _merged, resource_to_cf as _res_cf
    annualise = 8760.0 / n_hours if parity else 1.0
```
Supply and conversion capex/life — after `capex = ...` and `life = ...` add:
```python
            if parity:
                capex = capex * _crf(costs.get("interest_rate"), constr.get("lifetime"))
                life = 1
```
(`interest_rate` default in Calliope is 0 when absent → `_crf` returns `1/L` — matches Calliope.)

Demand — change:
```python
            total_pj = total_kwh * _KWH_TO_PJ
```
to:
```python
            total_pj = total_kwh * _KWH_TO_PJ * annualise
```
(The profile fractions are shares, unchanged.)

- [ ] **Step 4: Run tests** — `python -m pytest python/tests/test_osemosys_translate.py python/tests/test_osemosys_import.py -v` → PASS.

- [ ] **Step 5: Checkpoint** — `feat(osemosys): parity-mode annualisation`.

---

### Task 16: Per-location overrides and capacity factors

**Files:**
- Modify: `python/osemosys_translate.py` (location × tech loop)
- Test: `python/tests/test_osemosys_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
RICH = Path(__file__).parent.parent.parent / "scripts" / "reference_model_rich.json"


def test_parity_cf_and_location_override():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    cf = {(r["TECHNOLOGY"], r["TIMESLICE"]): float(r["VALUE"]) for r in _rows(d, "CapacityFactor.csv")}
    assert cf[("NORTH_SOLAR_PV", "s1d13")] == pytest.approx(0.72)   # hour 12 → bracket 13
    assert cf[("NORTH_SOLAR_PV", "s1d1")] == pytest.approx(0.0)
    assert cf[("SOUTH_GAS_SUPPLY", "s1d1")] == pytest.approx(1.0)
    cap = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "TotalAnnualMaxCapacity.csv")}
    assert cap["NORTH_SOLAR_PV"] == pytest.approx(1500 / 1e6)        # location override
    assert cap["EAST_SOLAR_PV"] == pytest.approx(3000 / 1e6)
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (CF 1.0 everywhere, cap 0.003 at north).

- [ ] **Step 3: Implement**

In the location × tech loop replace:
```python
            constr = tech.get("constraints") or {}
            costs = (tech.get("costs") or {}).get("monetary") or {}
```
with:
```python
            constr, costs = _merged(tech, loc_techs.get(tech_ref))
```
(applies in both modes — per-location overrides were silently ignored before; `_merged` must be imported at function top regardless of `parity`, so move the `from engine_common import ...` line out of any `if`.)

In the supply branch replace the `for lbl in labels: cap_factor.append(... 1.0 ...)` loop and the `resource profile not aggregated` report with:
```python
                cf_series = _res_cf(constr, n_hours, report, f"{loc_name}/{tid}", model_data)
                cf_slices = timeslices.aggregate(cf_series, scheme)[0] if cf_series else None
                for lbl in labels:
                    v = cf_slices[lbl] if cf_slices else 1.0
                    cap_factor.append({"REGION": REGION, "TECHNOLOGY": tech_id, "TIMESLICE": lbl,
                                       "YEAR": year, "VALUE": round(v, 9)})
```

- [ ] **Step 4: Run tests** — `python -m pytest python/tests/test_osemosys_translate.py python/tests/test_osemosys_import.py -v` → PASS.

- [ ] **Step 5: Checkpoint** — `fix(osemosys): per-location overrides and resource capacity factors`.

---

### Task 17: Two-mode transmission (parity mode)

One tech per link: mode 1 = A→B, mode 2 = B→A; activity = sending-side flow (Input 1, Output eff); one capacity costed with the full pair cost.

**Files:**
- Modify: `python/osemosys_translate.py` transmission block (~lines 393–447) and `MODE_OF_OPERATION.csv` write
- Test: `python/tests/test_osemosys_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
def test_parity_transmission_single_two_mode_tech():
    md = json.loads(REF.read_text(encoding="utf-8"))
    d = _parity(md)
    techs = [r["VALUE"] for r in _rows(d, "TECHNOLOGY.csv")]
    assert "TX_NORTH_SOUTH_GRID_LINK" in techs
    assert not any(t.startswith("NORTH_SOUTH_") or t.startswith("SOUTH_NORTH_") for t in techs)
    modes = [r["VALUE"] for r in _rows(d, "MODE_OF_OPERATION.csv")]
    assert modes == ["1", "2"]
    inp = {(r["FUEL"], r["MODE_OF_OPERATION"]): float(r["VALUE"])
           for r in _rows(d, "InputActivityRatio.csv") if r["TECHNOLOGY"] == "TX_NORTH_SOUTH_GRID_LINK"}
    out = {(r["FUEL"], r["MODE_OF_OPERATION"]): float(r["VALUE"])
           for r in _rows(d, "OutputActivityRatio.csv") if r["TECHNOLOGY"] == "TX_NORTH_SOUTH_GRID_LINK"}
    assert inp == {("NORTH_ELECTRICITY", "1"): 1.0, ("SOUTH_ELECTRICITY", "2"): 1.0}
    assert out == {("SOUTH_ELECTRICITY", "1"): 0.97, ("NORTH_ELECTRICITY", "2"): 0.97}
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    assert cc["TX_NORTH_SOUTH_GRID_LINK"] == pytest.approx(0.5 * 400 * (0.05 / (1 - 1.05 ** -40)), rel=1e-6)
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (`TX_...` missing).

- [ ] **Step 3: Implement**

At the start of the transmission loop body, after `fuel_from`/`fuel_to` are computed, branch:
```python
        if parity:
            tech_id = f"TX_{from_s}_{to_s}_{tid_s}"
            capex_pair = capex_tx * _crf((costs or {}).get("interest_rate") if tech else 0,
                                         (constr or {}).get("lifetime") if tech else life_tx)
            osem_techs.append(tech_id)
            cap_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(capex_pair, 9)})
            fix_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
            op_life.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": 1})
            cap_max.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(cap_max_gw_tx, 9)})
            for mode, fin, fout in ((1, fuel_from, fuel_to), (2, fuel_to, fuel_from)):
                var_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "MODE_OF_OPERATION": mode,
                                 "YEAR": year, "VALUE": 0.0})
                inp_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": fin,
                                "MODE_OF_OPERATION": mode, "YEAR": year, "VALUE": 1.0})
                out_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": fout,
                                "MODE_OF_OPERATION": mode, "YEAR": year, "VALUE": round(eff_tx, 9)})
            cap2act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": CAPACITY_TO_ACTIVITY})
            avail.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 1.0})
            resid_cap.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
            for lbl in labels:
                cap_factor.append({"REGION": REGION, "TECHNOLOGY": tech_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})
            continue
```
In the `if tech:` block keep `constr`/`costs` assigned (they already are); in the `else` defaults add `constr = costs = {}`. Replace the `MODE_OF_OPERATION.csv` write with:
```python
    _write_csv(_p("MODE_OF_OPERATION.csv"), ["VALUE"],
               [{"VALUE": m} for m in ((1, 2) if parity else (1,))])
```
Report line in parity mode: `"Transmission as one two-mode tech per link (capacity on sending side)."` — make the final summary report string conditional on `parity`.

- [ ] **Step 4: Run tests** → PASS (both new and legacy tests).

- [ ] **Step 5: Checkpoint** — `feat(osemosys): two-mode transmission in parity mode`.

---

### Task 18: OSeMOSYS `STORAGE` + time structure (parity mode)

Storage = one tech `{LOC}_{TID}` with mode 1 (charge from bus: Input 1, `TechnologyToStorage = eff`) and mode 2 (discharge to bus: Output 1, `TechnologyFromStorage = 1/eff`); energy capacity cost `CapitalCostStorage` (M€/PJ, annualised, `OperationalLifeStorage = 1`). Time structure: SEASON = 1..S, DAYTYPE = {1}, DAILYTIMEBRACKET = 1..dayBlocks; `DaySplit[lh] = hours(lh)/8760`; `DaysInDayType[ls,1] = 365 × season_share`.

**Files:**
- Modify: `python/osemosys_translate.py` storage branch + new CSV writes
- Test: `python/tests/test_osemosys_translate.py`

- [ ] **Step 1: Write the failing test** (append)

```python
def test_parity_storage_and_time_structure():
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    assert [r["VALUE"] for r in _rows(d, "STORAGE.csv")] == ["NORTH_BATTERY_S"]
    techs = [r["VALUE"] for r in _rows(d, "TECHNOLOGY.csv")]
    assert "NORTH_BATTERY" in techs and "NORTH_BATTERY_CH" not in techs
    to_s = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "TechnologyToStorage.csv")}
    from_s = {(r["TECHNOLOGY"], r["MODE_OF_OPERATION"]): float(r["VALUE"]) for r in _rows(d, "TechnologyFromStorage.csv")}
    assert to_s == {("NORTH_BATTERY", "1"): pytest.approx(0.95)}
    assert from_s == {("NORTH_BATTERY", "2"): pytest.approx(1 / 0.95)}
    ccs = float(_rows(d, "CapitalCostStorage.csv")[0]["VALUE"])
    assert ccs == pytest.approx(150 * (0.05 / (1 - 1.05 ** -15)) * 277.778, rel=1e-5)
    assert [r["VALUE"] for r in _rows(d, "SEASON.csv")] == ["1"]
    assert len(_rows(d, "DAILYTIMEBRACKET.csv")) == 24
    ds = _rows(d, "DaySplit.csv")
    assert float(ds[0]["VALUE"]) == pytest.approx(1 / 8760)
    assert float(_rows(d, "DaysInDayType.csv")[0]["VALUE"]) == pytest.approx(365.0)
    lh = {(r["TIMESLICE"], r["DAILYTIMEBRACKET"]) for r in _rows(d, "Conversionlh.csv") if r["VALUE"] == "1"}
    assert ("s1d13", "13") in lh
    cc = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "CapitalCost.csv")}
    crf = 0.05 / (1 - 1.05 ** -15)
    assert cc["NORTH_BATTERY"] == pytest.approx(80 * crf, rel=1e-6)
    fx = {r["TECHNOLOGY"]: float(r["VALUE"]) for r in _rows(d, "FixedCost.csv")}
    assert fx["NORTH_BATTERY"] == pytest.approx(2)
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (`STORAGE.csv` empty).

- [ ] **Step 3: Implement**

New accumulators next to the others:
```python
    storages: list[str] = []
    tech_to_storage: list[dict] = []
    tech_from_storage: list[dict] = []
    storage_params: dict = {k: [] for k in (
        "StorageLevelStart", "StorageMaxChargeRate", "StorageMaxDischargeRate",
        "OperationalLifeStorage", "DiscountRateStorage", "CapitalCostStorage",
        "MinStorageCharge", "ResidualStorageCapacity")}
```
At the top of the `elif p == "storage":` branch insert:
```python
                if parity:
                    ess = tech.get("essentials") or {}
                    fuel = f"{loc_s}_{_sid((ess.get('carrier') or 'electricity').lower())}"
                    tech_id, stor_id = f"{loc_s}_{tid_s}", f"{loc_s}_{tid_s}_S"
                    eff_s = min(1.0, max(0.01, _float(constr.get("energy_eff"), 1.0)))
                    crf = _crf(costs.get("interest_rate"), constr.get("lifetime"))
                    osem_techs.append(tech_id)
                    storages.append(stor_id)
                    cap_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year,
                                     "VALUE": round(_float(costs.get("energy_cap")) * crf, 9)})
                    fix_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(opex_f, 9)})
                    op_life.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": 1})
                    cap_max.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": round(cap_max_gw, 9)})
                    var_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 0.0})
                    var_cost.append({"REGION": REGION, "TECHNOLOGY": tech_id, "MODE_OF_OPERATION": 2, "YEAR": year, "VALUE": round(opex_v, 9)})
                    inp_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": fuel, "MODE_OF_OPERATION": 1, "YEAR": year, "VALUE": 1.0})
                    out_act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "FUEL": fuel, "MODE_OF_OPERATION": 2, "YEAR": year, "VALUE": 1.0})
                    cap2act.append({"REGION": REGION, "TECHNOLOGY": tech_id, "VALUE": CAPACITY_TO_ACTIVITY})
                    avail.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 1.0})
                    resid_cap.append({"REGION": REGION, "TECHNOLOGY": tech_id, "YEAR": year, "VALUE": 0.0})
                    for lbl in labels:
                        cap_factor.append({"REGION": REGION, "TECHNOLOGY": tech_id, "TIMESLICE": lbl, "YEAR": year, "VALUE": 1.0})
                    tech_to_storage.append({"REGION": REGION, "TECHNOLOGY": tech_id, "STORAGE": stor_id,
                                            "MODE_OF_OPERATION": 1, "VALUE": round(eff_s, 9)})
                    tech_from_storage.append({"REGION": REGION, "TECHNOLOGY": tech_id, "STORAGE": stor_id,
                                              "MODE_OF_OPERATION": 2, "VALUE": round(1.0 / eff_s, 9)})
                    for k, v in (("StorageLevelStart", 0.0), ("StorageMaxChargeRate", _LARGE_CAP_GW * CAPACITY_TO_ACTIVITY),
                                 ("StorageMaxDischargeRate", _LARGE_CAP_GW * CAPACITY_TO_ACTIVITY),
                                 ("OperationalLifeStorage", 1), ("DiscountRateStorage", 1e-9)):
                        storage_params[k].append({"REGION": REGION, "STORAGE": stor_id, "VALUE": v})
                    storage_params["CapitalCostStorage"].append(
                        {"REGION": REGION, "STORAGE": stor_id, "YEAR": year,
                         "VALUE": round(_float(costs.get("storage_cap")) * crf * _EUR_KWH_TO_M_EUR_PJ, 9)})
                    storage_params["MinStorageCharge"].append({"REGION": REGION, "STORAGE": stor_id, "YEAR": year, "VALUE": 0.0})
                    storage_params["ResidualStorageCapacity"].append({"REGION": REGION, "STORAGE": stor_id, "YEAR": year, "VALUE": 0.0})
                    if _float(constr.get("storage_loss")) > 0:
                        report.append(f"{loc_name}/{tid}: storage_loss has no OSeMOSYS 2017 equivalent — omitted.")
                    if constr.get("storage_cap_max") is not None:
                        report.append(f"{loc_name}/{tid}: storage_cap_max not enforced (OSeMOSYS 2017 has no storage capacity limit).")
                    continue
```
(The existing CH/DC code below stays for legacy mode. `continue` skips it.)

Time-structure and storage CSV writes — after the existing parameter writes, add:
```python
    if parity:
        seasons = int(scheme.get("seasons", 1))
        bh = timeslices.bracket_hours(scheme)
        _write_csv(_p("SEASON.csv"), ["VALUE"], [{"VALUE": s} for s in range(1, seasons + 1)])
        _write_csv(_p("DAYTYPE.csv"), ["VALUE"], [{"VALUE": 1}])
        _write_csv(_p("DAILYTIMEBRACKET.csv"), ["VALUE"], [{"VALUE": d} for d in range(1, len(bh) + 1)])
        conv_ls, conv_ld, conv_lh = [], [], []
        for lbl in labels:
            s_idx, d_idx = (int(x) for x in lbl[1:].split("d"))
            for s in range(1, seasons + 1):
                conv_ls.append({"TIMESLICE": lbl, "SEASON": s, "VALUE": int(s == s_idx)})
            conv_ld.append({"TIMESLICE": lbl, "DAYTYPE": 1, "VALUE": 1})
            for d in range(1, len(bh) + 1):
                conv_lh.append({"TIMESLICE": lbl, "DAILYTIMEBRACKET": d, "VALUE": int(d == d_idx)})
        _write_csv(_p("Conversionls.csv"), ["TIMESLICE", "SEASON", "VALUE"], conv_ls)
        _write_csv(_p("Conversionld.csv"), ["TIMESLICE", "DAYTYPE", "VALUE"], conv_ld)
        _write_csv(_p("Conversionlh.csv"), ["TIMESLICE", "DAILYTIMEBRACKET", "VALUE"], conv_lh)
        _write_csv(_p("DaySplit.csv"), ["DAILYTIMEBRACKET", "YEAR", "VALUE"],
                   [{"DAILYTIMEBRACKET": d, "YEAR": year, "VALUE": round(h / 8760.0, 12)}
                    for d, h in enumerate(bh, start=1)])
        season_share = {s: sum(year_split[f"s{s}d{d}"] for d in range(1, len(bh) + 1))
                        for s in range(1, seasons + 1)}
        _write_csv(_p("DaysInDayType.csv"), ["SEASON", "DAYTYPE", "YEAR", "VALUE"],
                   [{"SEASON": s, "DAYTYPE": 1, "YEAR": year, "VALUE": round(365.0 * season_share[s], 9)}
                    for s in range(1, seasons + 1)])
        _write_csv(_p("STORAGE.csv"), ["VALUE"], [{"VALUE": s} for s in storages])
        _write_csv(_p("TechnologyToStorage.csv"),
                   ["REGION", "TECHNOLOGY", "STORAGE", "MODE_OF_OPERATION", "VALUE"], tech_to_storage)
        _write_csv(_p("TechnologyFromStorage.csv"),
                   ["REGION", "TECHNOLOGY", "STORAGE", "MODE_OF_OPERATION", "VALUE"], tech_from_storage)
        for k, rows in storage_params.items():
            cols = ["REGION", "STORAGE", "YEAR", "VALUE"] if rows and "YEAR" in rows[0] else ["REGION", "STORAGE", "VALUE"]
            _write_csv(_p(f"{k}.csv"), cols, rows)
```
and remove the unconditional `_write_csv(_p("STORAGE.csv"), ["VALUE"], [])` line, replacing it with `if not parity: _write_csv(_p("STORAGE.csv"), ["VALUE"], [])`. The CSV for timeslice `year_split` is the existing `year_split` variable.

- [ ] **Step 4: Run tests** — `python -m pytest python/tests/test_osemosys_translate.py python/tests/test_osemosys_import.py python/tests/test_osemosys_timeslices.py -v` → PASS.

- [ ] **Step 5: Checkpoint** — `feat(osemosys): STORAGE and daily time structure in parity mode`.

---

### Task 19: Runner parity mode — datafile and contract scaling

**Files:**
- Modify: `python/osemosys_runner.py` (`_write_datafile`, `_reverse_tech_map`, `_build_contract`, `run_model`)
- Test: `python/tests/test_osemosys_translate.py` (datafile test, pure)

- [ ] **Step 1: Write the failing test** (append)

```python
def test_parity_datafile_has_time_structure_and_storage():
    import osemosys_runner as R
    md = json.loads(RICH.read_text(encoding="utf-8"))
    d = _parity(md)
    dat = Path(R._write_datafile(d, str(Path(d) / "results"), discount_rate=1e-9)).read_text(encoding="utf-8")
    assert "set SEASON := 1 ;" in dat
    assert "set DAILYTIMEBRACKET := 1 2 3" in dat
    assert "set STORAGE := NORTH_BATTERY_S ;" in dat
    assert "set MODE_OF_OPERATION := 1 2 ;" in dat
    for p in ("Conversionlh", "DaySplit", "DaysInDayType", "TechnologyToStorage",
              "TechnologyFromStorage", "CapitalCostStorage", "StorageLevelStart",
              "OperationalLifeStorage", "DiscountRateStorage"):
        assert f"param {p} default 0 :=" in dat, p
    assert "[REGION1] 1e-09" in dat
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (`set SEASON :=  ;`).

- [ ] **Step 3: Implement `_write_datafile` changes**

Replace the `for extra in ("SEASON", "DAYTYPE", "DAILYTIMEBRACKET"): lines.append(f"set {extra} :=  ;")` loop with:
```python
    for extra in ("SEASON", "DAYTYPE", "DAILYTIMEBRACKET"):
        rows = _read(f"{extra}.csv") if os.path.exists(os.path.join(csv_dir, f"{extra}.csv")) else []
        lines.append(f"set {extra} := {' '.join(r['VALUE'] for r in rows)} ;")
```
Append to `param_defs`:
```python
        # Time structure + storage (written only in parity mode; skipped when absent)
        ("Conversionls.csv",              "Conversionls",              ["TIMESLICE", "SEASON"]),
        ("Conversionld.csv",              "Conversionld",              ["TIMESLICE", "DAYTYPE"]),
        ("Conversionlh.csv",              "Conversionlh",              ["TIMESLICE", "DAILYTIMEBRACKET"]),
        ("DaySplit.csv",                  "DaySplit",                  ["DAILYTIMEBRACKET", "YEAR"]),
        ("DaysInDayType.csv",             "DaysInDayType",             ["SEASON", "DAYTYPE", "YEAR"]),
        ("TechnologyToStorage.csv",       "TechnologyToStorage",       ["REGION", "TECHNOLOGY", "STORAGE", "MODE_OF_OPERATION"]),
        ("TechnologyFromStorage.csv",     "TechnologyFromStorage",     ["REGION", "TECHNOLOGY", "STORAGE", "MODE_OF_OPERATION"]),
        ("StorageLevelStart.csv",         "StorageLevelStart",         ["REGION", "STORAGE"]),
        ("StorageMaxChargeRate.csv",      "StorageMaxChargeRate",      ["REGION", "STORAGE"]),
        ("StorageMaxDischargeRate.csv",   "StorageMaxDischargeRate",   ["REGION", "STORAGE"]),
        ("OperationalLifeStorage.csv",    "OperationalLifeStorage",    ["REGION", "STORAGE"]),
        ("DiscountRateStorage.csv",       "DiscountRateStorage",       ["REGION", "STORAGE"]),
        ("CapitalCostStorage.csv",        "CapitalCostStorage",        ["REGION", "STORAGE", "YEAR"]),
        ("MinStorageCharge.csv",          "MinStorageCharge",          ["REGION", "STORAGE", "YEAR"]),
        ("ResidualStorageCapacity.csv",   "ResidualStorageCapacity",   ["REGION", "STORAGE", "YEAR"]),
```
and make the reader tolerate missing files — in the loop, replace `rows = _read(fname)` with:
```python
        path = os.path.join(csv_dir, fname)
        rows = _read(fname) if os.path.exists(path) else []
```
`TechnologyToStorage`/`TechnologyFromStorage` have no default in the model for unlisted (t, s, m) combos — `default 0` in the data block covers them (already emitted by the generic writer).

- [ ] **Step 4: Implement parity in `run_model`, `_reverse_tech_map`, `_build_contract`**

`run_model`: after computing `n_hours`:
```python
    scheme_raw = model_config.get("osemosysScheme")
    scheme = ({"seasons": int(scheme_raw.get("seasons", 4)), "dayBlocks": int(scheme_raw.get("dayBlocks", 3))}
              if scheme_raw else timeslices.parity_scheme(n_hours))
    discount_rate = 1e-9   # parity mode: CRF/PvAnnuity/discount factors ≡ 1, salvage 0
```
(replacing the old `scheme_raw ...`/`scheme = {...}`/`discount_rate = 0.05` lines), call `translate.translate_model(model_data, csv_dir, scheme, parity=True)` and `_build_contract(..., parity=True)`.

`_reverse_tech_map(model_data, parity=False)`: when `parity`, storage maps `f"{loc_s}_{tid_s}"` → `(loc_name, tid, "storage")` and each link maps `f"TX_{from_s}_{to_s}_{tid_s}"` → `(from_name, tid, "transmission")`, recording the pair: also return/keep `tx_pairs[tech_id] = (from_name, to_name, from_fuel, to_fuel)` — implement as a second dict attribute: return `reverse` as before but add entries `reverse[tech_id] = (from_name, tid, "transmission", to_name)` (4-tuple only for transmission; adjust unpacking with `loc_name, tid, p = rec[:3]`).

`_build_contract(..., parity: bool = False)` changes, with `wf = n_hours / 8760.0 if parity else 1.0` and `slice_hours_base = 8760.0 if parity else n_hours`:
1. Capacities: include `"storage"` like supply; for `"transmission"` write both `f"{from}::{tid}:{to}"` and `f"{to}::{tid}:{from}"` = `cap_gw * 1e6` (Calliope reports both ends).
2. Generation: `generation[key] += val_pj / _KWH_TO_PJ * wf`. For parity storage and transmission use `ProductionByTechnology.csv` rows grouped by FUEL instead of `TotalTechnologyAnnualActivity` (activity mixes both modes): storage → production on its bus fuel; transmission → production on `to_fuel` is delivered at `to` (key `f"{to}::{tid}:{from}::{carrier}"`), on `from_fuel` delivered at `from`.
3. Dispatch / transmission slice means: replace `n_in_slice = year_split.get(lbl, ...) * n_hours` with `n_in_slice = year_split.get(lbl, 1.0 / len(labels)) * slice_hours_base`. Transmission flow in parity: `net = delivered(to) − delivered(from)` per slice, broadcast, key `"::".join(sorted([from, to]))`, from/to set to the sorted order with sign flipped if needed.
4. Costs: `_add_cost_row(_r(...), scale=1e6 * wf)` for all three cost files, and add storage capex: for each row of `NewStorageCapacity.csv`, cost = `VALUE × CapitalCostStorage[stor] × 1e6 × wf` (read `CapitalCostStorage.csv` from `csv_dir` — pass `csv_dir` into `_build_contract`), attributed to the storage's `(loc, tid)` by stripping `_S`.
5. Objective: `objective = objective * 1e6 * wf` when parity (glpsol objective is M€ for the annualised year).

- [ ] **Step 5: Run unit tests**

Run: `python -m pytest python/tests/test_osemosys_translate.py python/tests/test_osemosys_import.py python/tests/test_osemosys_timeslices.py -v`
Expected: PASS.

- [ ] **Step 6: Engine comparison**

```powershell
python scripts/verify_engines.py --python06 $PY06 --python-osemosys $PYOSE --osemosys-obj-tol 2 --osemosys-cap-tol 5
```
Expected on `reference_model_rich.json`: PASS (exact-structure model). On `reference_model.json` the battery has `storage_loss: 0.01` (unmapped) — if battery capacity/energy is outside 5 % there, add `"_verify": {"osemosys_cap_tol": <observed + margin>}` to `scripts/reference_model.json` **with a `_comment` explaining storage_loss**, and report the observed number at the checkpoint. Any other mismatch is a bug — debug with `superpowers:systematic-debugging` (compare `generation` per tech first, then `costs_by_tech`).

- [ ] **Step 7: Checkpoint** — `feat(osemosys): runner parity mode (annualised year, storage, scaled results)`.

---

# Phase 5 — Lock it in

### Task 20: Tighten default tolerances and run the full matrix

**Files:**
- Modify: `scripts/verify_engines.py` (defaults + docstring)

- [ ] **Step 1: Change defaults**

`--pypsa-obj-tol` 2.0 → 0.5, `--pypsa-cap-tol` 5.0 → 1.0, `--osemosys-obj-tol` 30.0 → 2.0, `--osemosys-cap-tol` 15.0 → 5.0 (AdOpT already 2.0/5.0). Update the help strings and the docstring tolerance table; replace the "OSeMOSYS note … tolerances are wider" paragraph with: "OSeMOSYS runs in parity mode (annualised single year, hour-of-day timeslices, OSeMOSYS STORAGE). Exact only when daily profiles repeat; storage_loss is unmapped."

- [ ] **Step 2: Full matrix**

```powershell
python -m pytest python/tests -v
npm test
python scripts/verify_engines.py --auto
python scripts/verify_engines.py --auto --check-myopic --payload scripts/reference_model.json
```
Expected: all pytest/vitest PASS; `CROSS-ENGINE VERIFICATION PASSED [adoptnet0, calliope-0.6.8, calliope-0.7, osemosys, pypsa] on reference_model.json, reference_model_rich.json`; myopic PASS for every engine (if a myopic check fails on an engine fixed above, it is a real regression in residual handling — report, don't loosen).

- [ ] **Step 3: Checkpoint** — `test(verify): tighten cross-engine tolerances`.

---

### Task 21: Document the parity conventions

**Files:**
- Modify: `CLAUDE.md` (Developer Scripts block; Calliope Dual-Engine section untouched except the 0.7 solver line)

- [ ] **Step 1: Update CLAUDE.md**

1. In "Calliope Dual-Engine Architecture" change the **Solver** bullet to: "0.7 engine uses CBC; `solver: highs` falls back to CBC unless a `highs` CLI binary is on PATH (`resolve_solver_07()` in `calliope07_translate.py`)."
2. In the `verify_engines.py` block: replace the per-engine flag list with `python scripts/verify_engines.py --auto` as the primary command (explicit `--python*` flags still work), list the new defaults (0.5/1, 0.5/1, 2/5, 2/5), the repeatable `--payload` (defaults to both reference models), the `_verify` per-payload override block, and "AdOpT-NET0 is now compared numerically".
3. Add under Developer Scripts:
```markdown
**Cross-engine parity conventions** (all runners match Calliope 0.6.8):
- investment = capex × CRF(interest_rate, lifetime) × n_hours/8760; om_annual × n_hours/8760; om_prod per kWh
- capacity: supply/conversion/storage on output side, transmission on sending side, both link ends reported
- storage energy_eff applied on charge and discharge (round trip eff²)
- shared helpers in `python/engine_common.py` (resource → CF, per-location merge, annuity) — use them in any new engine translator
- OSeMOSYS runner uses `translate_model(..., parity=True)`; `/export` still writes the legacy representation
- `scripts/reference_model_rich.json` is generated by `scripts/make_reference_rich.py` — regenerate, don't hand-edit
```
4. Add `python/engine_common.py` and `scripts/make_reference_rich.py` rows to the Key Files table.

- [ ] **Step 2: Checkpoint** — `docs: cross-engine parity conventions`.

---

## Out of scope (follow-ups)

- OSeMOSYS `/export` + `osemosys_import` in parity representation (STORAGE, two-mode techs).
- `storage_loss` in OSeMOSYS (needs a modified model file).
- AdOpT storage `om_annual` and storage power cap (`energy_cap_max`) exact mapping.
- `supply_plus` / `conversion_plus` multi-carrier parity (all three non-Calliope engines approximate).
- UI: show each run's `translation_report` approximations in Results.
