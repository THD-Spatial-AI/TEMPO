# SPORES

A normal optimisation gives you one answer: the cheapest system. Usually there are many
other systems that cost only a little more but look very different, for example with wind
in other regions or less transmission. SPORES (Spatially explicit Practically Optimal
REsultS) finds a set of these alternatives.

The method comes from Lombardi, Pickering, Colombo and Pfenninger (2020), *Policy Decision
Support for Renewables Deployment through Spatially Explicit Practically Optimal
Alternatives*, Joule 4, 2185–2207.

---

## How it works

1. TEMPO solves the model normally to find the cheapest cost.
2. It then solves the model again N more times. Each time, total cost may be at most
   *slack* percent above the cheapest cost, and the solver is pushed away from the
   locations and technologies used in earlier solutions.

The result is N + 1 solutions with similar cost and different layouts. Every solution is a
full solver run, so SPORES takes roughly N + 1 times as long as a normal run.

---

## Which engines

| Engine | SPORES |
|---|---|
| Calliope 0.6.8 | Yes, on your computer |
| Calliope 0.7 | Only on a [remote MEME server](remote-runs.md) |
| PyPSA, OSeMOSYS, AdOpT-NET0 | No |

---

## Running SPORES

1. Open **Run** and choose the Calliope engine.
2. Set **Mode** to the **SPORES** option.
3. Set the two options in the SPORES panel:

| Option | Range | Default | Meaning |
|---|---|---|---|
| **Cost Slack (%)** | 1 to 30 | 10 | How much more the alternatives may cost than the cheapest plan. Higher values give more variety but stray further from the optimum |
| **Number of SPORES** | 5 to 100 | 20 | How many alternatives to generate. 5 to 10 is enough for testing; 20 to 50 gives a better picture. The original study used 178 |

4. Click **Run**.

To run SPORES at several cost slacks, or across sensitivity cases, use a **SPORES
alternatives** card in [Scenario Studio](scenario-studio.md). Each slack becomes a separate
run.

---

## Reading the results

A SPORES run adds a **SPORES** tab to the Results screen:

| Section | What it shows |
|---|---|
| **Cost Summary** | Total cost of every solution and how far above the cheapest it is |
| **Technology Mix & System Cost per Solution** | Installed capacity by technology for each solution, next to its cost |
| **Technology Deployment Variability** | How much each technology's capacity changes across solutions |
| **Pairwise Technology Trade-off** | Capacity of one technology against another, one dot per solution. A falling trend means they substitute for each other, a rising trend means they are built together |
| **Near-Optimal Space** | Parallel coordinates across all solutions |
| **Geographic Capacity Distribution per Solution** | Map of where capacity is built in a chosen solution |
| **Technology Deployment Correlation** | Which technologies tend to appear together (dark) or replace each other (light) |
| **Technology Classification** | Utilisation of each technology's expansion potential, labelled must-have (never fully avoided) or real choice (fully avoided in at least one solution) |

Runs made from the Lombardi 2020 preset replace the first four charts and the correlation
matrix with the paper's figures (below). The classification is often the most useful output
for policy questions. A must-have is needed whatever else happens; a real choice can be avoided
at an acceptable extra cost. With several cost relaxations in one batch, the ensemble view adds
a third class, **costly to replace**: avoidable only at the higher relaxations.

### Paper figures, for any model

Every SPORES result shows the paper's figures (below). The **Cost Summary** at the top is one bar per
SPORE (cost above the optimum, coloured by stage); **Show all solutions** opens the full table.

For the Calliope-Italy model the figures use the paper's hand-made configuration. For any other
model TEMPO derives it from the result:

- **Technology groups by type**: wind, PV, hydro, bioenergy, geothermal, thermal, storage, hydrogen, power-to-gas, transmission, other. The type comes from the technology's parent and output carrier in the result, then its name.
- **Expandable technologies** are those with an expansion potential (`energy_cap_max`) that is not a fixed fleet (equal to the built capacity everywhere) and not a modelling "unlimited" (more than 100 000 × anything built). They form the utilisation groups (Fig 2, 5, 6, Table 2). The other technologies appear as fixed capacity in Fig 1C.
- **Without potentials** (native Calliope SPORES), utilisation is a group's capacity divided by its largest value in any SPORE. Captions say so.
- **Locations** take the place of the paper's bidding zones and regions. Coordinates and names come from the model's locations. Without coordinates the maps are left out. Fig 3 shows six locations at a time and lets you pick others.
- **Minimisation families** (Fig 2 highlight, Fig 5 colours, Table 2 columns) are the distinct minimise targets in the run.
- Figures and tables that need something a model doesn't have are left out. Table 1 / S1 need wind and lines with a capacity factor; Fig 4's hydrogen column needs hydrogen or methane production.
- **More views** (non-Italy models) brings back the per-technology charts: capacity mix, variability, pairwise trade-off, parallel coordinates, correlation per location.

### Paper figures (Lombardi et al. 2020 runs)

Runs made from the Lombardi 2020 preset (and imported Italy contracts) show the paper's
figures, computed from the result. Each has PNG (3× resolution), SVG and CSV export of the
plotted data; its caption states the definitions.

| Where | Figures |
|---|---|
| SPORES tab, one ensemble | Figure 1 (cost optimum against potentials), Figure 3 / S1 (correlation matrix), Figure 4 (three configurations), Figure 5 / S2 (minimising problematic technologies), the paper panel (Table 1 row and per-SPORE metrics CSV) |
| SPORES ensembles (same tab, and the Scenario Studio results sheet) | Figure 2 (one panel per relaxation), Tables 1, S1 and 2 across relaxations, Figure 6 / S3 / S7 / S8 (one panel per case of the batch) |

At 10 % relaxation a figure carries the paper's main number (Figure 3); at 5 % and 20 % the
supplement's (Figure S1). Generic SPORES results keep the charts in the table above.

How the quantities are defined (where the paper doesn't say, the choice is TEMPO's):

- **Utilisation** (Figs 2, 5, 6, Table 2): new capacity / expansion potential, nationally. Potentials come from the model's limits (`energy_cap_max`), with these system-wide values: bioenergy 4 GW (the model's system-wide cap), gas turbines 44 GW (today's fleet, Supplement Table S3), **battery 100 GW**. The model allows 50 GW of battery per zone (300 GW), but the paper's Fig 1D draws about 100 GW and its Fig 2 cost-optimal diamond sits at about 0.18 (17 GW installed); 100 GW reproduces both and the paper's Table 2.
- **Gas turbines** stand for the power-to-gas chain. The result contract sizes conversion technologies on their output (electricity for turbines, hydrogen for electrolysis, methane for methanation). At 10 % the Table 2 turbine range reads 0–63.3 % where the VM's analysis (electricity-side capacity) gave 0–55.5 %.
- **Wind share** (Table 1, Fig 5B) is the largest region's share of national wind capacity, onshore + offshore, existing + new. **PV share** (Fig 5A) and **methanation share** (Fig 5C) likewise, per region.
- **Line capacity factor** uses the dominant flow direction of each inter-zonal line; the minimum over lines is reported (Table 1, Fig 5D).
- **Subset** (Tables 1, 2, S1): SPORES whose wind share is at least 20 % below the cost optimum and whose every inter-zonal line has a capacity factor of at least 30 %.
- **Overcapacity** (Table 1): renewable and storage discharge capacity, including synthetic-methane gas turbines, above the cost optimum.
- **Fig 2**: violins are Gaussian kernel densities with Scott's bandwidth (as seaborn), width scaled per group; the strip jitter is seeded and has no meaning. The cyan diamond is the SPORE of the bioenergy-minimisation family with the lowest bioenergy utilisation.
- **Fig 3**: Spearman ρ (average ranks for ties) of each group's capacity per bidding zone across all SPORES. PV = rooftop + farm; storage = pumped hydro + battery; transmission = new capacity of the lines with an end in the zone. A series that never changes has no ρ and stays blank.
- **Fig 5 families**: the SPORES minimising bioenergy, offshore wind, batteries or the P2G chain; the 3-run and 17-run families of a target count together.
- **Fig 6**: pooled utilisation, x international + inter-zonal transmission, y onshore + offshore wind + PV, colour battery + pumped hydro (or the P2G chain). Only the cases present in the batch are drawn.
- **Maps** (Figs 1, 4): the nodes of the published model on a muted basemap, without region shapes. Fig 4 fills a circle per zone by curtailed energy and draws net annual flows per line.
- **Objective weights**: the preset uses `nos = 0.1`, as the paper's Eq. 4. The original script uses 1.

**Import result** (Results, next to the run selector) loads a result contract JSON, as written by MEME's `calliope_extract_contract.py`, as a completed run. SPORES contracts without a plan get the Lombardi 2020 plan and join one imported batch, so imports of several relaxations appear together in the ensemble comparison. Without a unit stamp, results are read as MW, or kW when the plan is the Lombardi preset.
