# SPORES: Spatially Explicit Practically Optimal Results
## Paper Summary and Integration Guide for TEMPO

**Source:** Lombardi, Pickering, Colombo & Pfenninger (2020). *Policy Decision Support for Renewables Deployment through Spatially Explicit Practically Optimal Alternatives*. Joule 4, 2185–2207.

---

## 1. What the Paper Establishes

### The Core Problem with Single Cost-Optimal Solutions

Conventional energy system optimization delivers a single "best" result by minimizing total system cost. This approach has four structural weaknesses that are invisible to the user:

1. **Spatially unbalanced infrastructure** — a cost-optimal result may concentrate wind or solar in one or two regions at politically unfeasible levels (e.g., Sardinia holding 19.5% of Italy's wind capacity while being home to 2.7% of its population).
2. **Overfitting to a single weather year** — the optimizer exploits peculiarities of the reference year; the resulting system may be fragile under different weather conditions.
3. **Low-utilization transmission lines** — expanded lines are selected because they are cheap to build relative to alternative generation, not because they are heavily used. This creates economically unattractive assets.
4. **Implicit reliance on contested technologies** — bioenergy, long-distance transmission, or offshore wind may appear only because the optimizer chose them implicitly, not because policy makers consciously selected them.

### The SPORES Solution

SPORES generates **N spatially diverse, near-optimal solutions** that all satisfy the constraint:

```
system_cost_n  ≤  (1 + s) × cost_optimal
```

where `s` is the user-defined **cost slack** (typically 5%, 10%, or 20%). Within this cost envelope, each successive SPORE minimizes the reuse of location–technology combinations already deployed in previous solutions. This forces geographic diversity across the solution set.

### The Two Analytical Outputs

1. **Must-haves vs. real choices** — technologies that appear in all SPORES (must-haves, e.g., PV in Italy) versus those that can be substituted with alternatives at acceptable extra cost (real choices, e.g., offshore wind vs. onshore wind).
2. **Spatially explicit comparison** — for each SPORE, per-region capacity maps show policymakers exactly where each technology would be sited, making trade-offs legible at the subnational level.

### Key Findings from the Italian Case Study

| Category | Technologies (Italy 2050 case) |
|---|---|
| Must-have | Photovoltaic (PV) |
| Costly to replace | Bioenergy, batteries, international transmission |
| Real choices (can be avoided) | Offshore wind, power-to-gas, inter-zonal transmission |
| Competing strategies | PV + batteries (local) vs. wind + P2G (long-distance) |

- 178 SPORES were generated for each of three cost relaxations (5 %, 10 %, 20 %).
- Results were largely insensitive to technology cost projections, but strongly sensitive to weather year choice.
- Configurations that are robust to adverse weather years overlap with "high overcapacity" SPORES (excess renewable + storage, smaller transmission).

---

## 2. How SPORES Works — The Algorithm

Understanding the algorithm is necessary for the TEMPO integration.

### Step 1 — Find the Global Optimum (Standard Calliope Run)

```
min  cost = Σ_ij [ c_fix,ij · x_cap,ij  +  Σ_t c_var,ij · x_prod,t,ij ]
s.t. A·x ≤ b,   x ≥ 0
```

This is an ordinary Calliope `plan` run. Its result defines `cost_optimal`.

### Step 2 — Assign Weights to Deployed loc::techs

For every location–technology combination `ij` with non-zero installed capacity in the previous SPORE (or the cost-optimal solution), accumulate a weight:

```
w_ij^n  =  w_ij^(n-1)  +  x_cap,ij^(n-1) / x_cap,ij,max
```

`x_cap,ij,max` is the maximum theoretical capacity potential for that loc::tech. This penalizes heavily-utilized locations more strongly, pushing subsequent SPORES toward under-utilized sites.

### Step 3 — Generate a SPORE

Replace the objective function:

```
min  Y = Σ_ij  w_ij · x_cap,ij
s.t. cost_n  ≤  (1 + s) · cost_0
     A·x ≤ b,   x ≥ 0
```

This is an ε-constrained multi-objective problem: spatial diversity is the primary goal; cost is a hard constraint. Solve it, record the result as SPORE n, update weights, repeat.

### Step 4 — Technology-Minimizing SPORES (Optional)

For politically contested technologies, run a variant that directly minimizes deployment of that technology (weighted as `10 · x_cap,ij`) while still summing the exploration weights (`0.1 · Σ w_ij · x_cap,ij`):

```
min  Y2 = 10 · x_cap,ij_target + 0.1 · Σ_ij w_ij · x_cap,ij
```

This answers "what does the system look like if we deliberately minimise bioenergy / offshore wind / batteries?"

---

## 3. Calliope 0.6.8 Native SPORES Support

Calliope 0.6.8 ships built-in SPORES support via the `run.mode` parameter in the model configuration YAML:

```yaml
run:
  mode: spores
  spores_options:
    slack: 0.1           # cost relaxation (10%)
    spores_number: 50    # how many SPORES to generate
    score_cost_class: monetary   # cost class to slack against
    slack_cost_type: systemwide_levelised_cost  # or total_levelised_cost
    save_path: results/spores/   # where to write per-SPORE NetCDFs
```

When `mode: spores` is set, Calliope automatically:
1. Runs a standard cost minimisation to establish `cost_optimal`.
2. Iterates N times, alternating between weight update and SPORE generation.
3. Writes one `.nc` file per SPORE to `save_path`.

TEMPO already sets `run.mode` via `modelConfig.mode` in `Run.jsx` (currently `'plan'` or `'operate'`). Adding `'spores'` is the minimal change needed in the backend.

---

## 4. How to Integrate SPORES into TEMPO

The integration requires changes in four places: the Run component UI, the `calliope_runner.py` backend, the YAML builder, and a new Results tab.

### 4.1 Run Component — UI Changes (`src/components/Run.jsx`)

Add `spores` to the mode selector alongside `plan` and `operate`, plus a collapsible SPORES configuration panel:

```jsx
// Add to modelConfig initial state
sporesOptions: {
  slack: 0.10,          // default 10%
  sporesNumber: 20,     // default 20 (reasonable for interactive use)
  scoreCostClass: 'monetary',
}

// New UI fields (show only when mode === 'spores')
<label>Cost slack (%)</label>
<input type="number" min={1} max={30} step={1}
  value={Math.round(modelConfig.sporesOptions.slack * 100)}
  onChange={e => setModelConfig(prev => ({
    ...prev,
    sporesOptions: { ...prev.sporesOptions, slack: e.target.value / 100 }
  }))} />

<label>Number of SPORES</label>
<input type="number" min={5} max={200} step={5}
  value={modelConfig.sporesOptions.sporesNumber}
  onChange={...} />
```

Surface a warning that SPORES runtime scales linearly with `sporesNumber` and that each SPORE is a full optimization solve.

### 4.2 YAML Builder — `calliope_runner.py`

In the `run_model` function where the `run:` block is assembled, add:

```python
run_block = {
    'mode': model_data.get('mode', 'plan'),
    'solver': model_data.get('solver', 'cbc'),
    ...
}

if run_block['mode'] == 'spores':
    spores_opts = model_data.get('sporesOptions', {})
    run_block['spores_options'] = {
        'slack': spores_opts.get('slack', 0.10),
        'spores_number': spores_opts.get('sporesNumber', 20),
        'score_cost_class': spores_opts.get('scoreCostClass', 'monetary'),
        'save_path': os.path.join(work_dir, 'spores'),
    }
```

### 4.3 Result Collection — `calliope_runner.py`

After `model.run()`, collect per-SPORE NetCDF outputs and extract the summary metrics needed for visualization:

```python
if model_data.get('mode') == 'spores':
    spores_dir = os.path.join(work_dir, 'spores')
    spores_results = []
    for nc_path in sorted(Path(spores_dir).glob('*.nc')):
        spore = calliope.read_netcdf(str(nc_path))
        spores_results.append({
            'spore_id': nc_path.stem,           # e.g. "spore_001"
            'cost': float(spore.results.cost.sum()),
            # Installed capacity per loc::tech (for spatial maps)
            'energy_cap': spore.results.energy_cap.to_series().dropna().to_dict(),
            # Annual production per tech (for bar charts)
            'carrier_prod': spore.results.carrier_prod
                .sum('timesteps').to_series().dropna().to_dict(),
        })
    result['spores'] = spores_results
    result['cost_optimal'] = float(model.results.cost.sum())  # first-pass cost
```

### 4.4 Calliope Service — `calliope_service.py`

SPORES runs take much longer than single-pass runs. The existing SSE streaming and 10-minute TTL are fine, but add per-SPORE progress events so the user sees something during a 20-SPORE run:

```python
# In the Calliope logging handler passed to calliope_runner
# Calliope logs "[SPORES] Generating SPORE n of N" — intercept these
if '[SPORES]' in msg or 'spore' in msg.lower():
    _push({'type': 'spores_progress', 'line': msg})
```

---

## 5. Results Visualization

A dedicated **SPORES Results** view should be added to TEMPO alongside the existing Results panel. It needs three visualization components.

### 5.1 Capacity Utilization Distribution (Box/Violin Plot)

Mirrors Figure 2 of the paper. For each technology, show the distribution of how much of its regional potential is utilized across all SPORES.

**Data needed:** `energy_cap` per loc::tech for every SPORE, divided by the user-defined `energy_cap_max` for that loc::tech.

**Suggested library:** Recharts `ComposedChart` with `ErrorBar` for range bars, or a simple `BoxPlot` via a small helper. Grouped by technology, one box per technology.

**Reading:** Technologies with narrow, high distributions are must-haves. Technologies with wide distributions spread from 0 to 1 are real choices.

### 5.2 Spatial Capacity Map (Per-SPORE)

A Leaflet map — TEMPO already has a full Leaflet setup in the Map view — where each region is colored by installed capacity of a selected technology for the currently selected SPORE.

**Data needed:** `energy_cap` indexed by `(location, tech)`. Map the location name to its polygon from the existing model geometry.

**Controls:**
- SPORE selector (slider or dropdown: SPORE 1 → N)
- Technology selector (dropdown: solar PV, onshore wind, …)

**Color scale:** Sequential, e.g., white → dark blue, where white = 0 % of potential used and dark blue = 100 % used. This directly maps to Figure 4 of the paper.

### 5.3 Technology Correlation Matrix (Heatmap)

Mirrors Figure 3 of the paper. For each pair of loc::tech combinations, compute Spearman correlation of capacity utilization across all SPORES. Render as a color-coded square grid.

**Data needed:** The full `energy_cap` matrix (locations × technologies × SPORES).

**Interpretation:** Strong positive correlation = technologies deployed together; strong negative correlation = competitive substitutes.

**Suggested library:** A simple SVG grid in React using the result data is sufficient; no heavy chart library needed.

### 5.4 "Must-Have / Real Choice" Summary Panel

A table derived from the utilization distributions:

| Technology | Min utilization (%) | Max utilization (%) | Classification |
|---|---|---|---|
| PV | 15 | 85 | Must-have |
| Onshore wind | 0 | 92 | Real choice |
| Bioenergy | 5 | 100 | Costly to replace |

Classification rule:
- **Must-have**: `min_utilization > threshold` (e.g., > 10 %) — never fully excluded.
- **Costly to replace**: excluded only at high cost slack (20 %) but not at 10 %.
- **Real choice**: `min_utilization = 0` at the chosen slack — can be fully excluded.

---

## 6. Implementation Roadmap

### Phase 1 — Backend (no UI changes needed to validate)
1. Add `'spores'` as a valid `mode` in `calliope_runner.py`'s YAML builder.
2. Collect and serialize per-SPORE `energy_cap` and `carrier_prod` into the result JSON.
3. Test end-to-end with a small model (2–3 locations, 5 SPORES, 5 % slack) to confirm the NetCDF outputs are captured.

### Phase 2 — Run UI
4. Add SPORES mode to the mode selector in `Run.jsx`.
5. Add the collapsible SPORES options panel (slack %, number of SPORES).
6. Surface the per-SPORE progress events from SSE in the log panel.

### Phase 3 — Visualization
7. Add a `SporesResults.jsx` component, lazy-loaded like the other result views.
8. Implement the capacity utilization distribution chart (Phase 3a).
9. Implement the spatial map overlay with SPORE selector (Phase 3b).
10. Implement the must-have / real-choice summary table (Phase 3c).
11. Optionally add the correlation heatmap (Phase 3d).

### Phase 4 — Polish
12. Add a "Download all SPORES as CSV" button that flattens the `energy_cap` matrices.
13. Add a "Compare two SPORES" side-by-side map view.

---

## 7. Key Parameters to Expose to Users

| Parameter | Default | Range | What it controls |
|---|---|---|---|
| Cost slack (`s`) | 10 % | 5 %–30 % | Width of the near-optimal space. Higher → more diversity, more expensive alternatives. |
| Number of SPORES | 20 | 5–200 | How many alternatives to generate. Runtime scales linearly. |
| Score cost class | `monetary` | model-specific | Which cost class defines the optimality constraint. |
| Technology to minimize | (none) | any tech | Adds a targeted SPORE that minimises deployment of one contested technology. |

---

## 8. User Communication — How to Explain SPORES

The TEMPO UI should present SPORES with language that avoids jargon. Suggested tooltip text:

> **SPORES mode** generates multiple energy system plans that all achieve your target (e.g., net-zero) at nearly the same cost. Instead of one "best" answer, you get a range of feasible options that deploy technologies in different locations — so you can choose the plan that best fits local political, social, or environmental constraints.
>
> The **cost slack** controls how far from the cheapest solution these alternatives can deviate. A 10 % slack means all alternatives cost at most 10 % more than the single optimal plan.

For the results view, add inline explanations:
- "Technologies appearing in every plan are **must-haves** — the system cannot function without them."
- "Technologies that disappear in some plans are **real choices** — alternative technologies can substitute for them at acceptable cost."

---

## 9. References and Resources

- **Original paper:** Lombardi et al. (2020), Joule. https://doi.org/10.1016/j.joule.2020.08.002
- **Code and data:** https://github.com/FLomb/Calliope-Italy
- **Calliope SPORES docs:** https://calliope.readthedocs.io/en/v0.6.8/user/running.html#spores
- **MGA method (algorithmic basis):** DeCarolis (2011). *Using modeling to generate alternatives (MGA) to expand our thinking on energy futures.* Energy Research & Social Science.
