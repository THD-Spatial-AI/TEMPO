# Scenario Studio

Scenario Studio builds one scenario out of cards laid out by year, then runs every year
(and every variant) as a batch. You don't write override YAML: each card changes the model
in a specific way, and TEMPO applies the changes to a copy of the model before each run.

It works with every engine. Some changes are only partly supported by some engines, and
the studio warns you when that happens.

Open it with **Scenarios** in the sidebar.

---

## The board

The studio is a canvas with two kinds of cards.

- **Year cards** are containers, one per snapshot year you want to solve. A new board starts
  with 2025 and 2030.
- **Config cards** each describe one change to the model, such as "scale demand by 1.2" or
  "CO₂ cap of 50".

Where you put a config card decides when it applies:

| Placement | Applies to |
|---|---|
| Inside a Year card | That year only |
| On the open canvas | Every year (a global card) |

To add cards, click **Add card** in the top-left corner of the board, or right-click the
canvas. To put a config card inside a year, drag it onto the Year card, or use the **+**
button on the Year card. Drag it out again to make it global.

You can also connect Year cards in a chain (2025 → 2030 → 2035). The chain defines which
year comes before which. Click a Year card to open its detail panel, which shows how that
year differs from the one before it.

Each model has its own board. The board is saved automatically on this computer.

---

## Card types

| Card | What it changes |
|---|---|
| **Demand** | Scales every demand technology by a factor (1.0 = unchanged) |
| **Constraint** | Adds a system-wide constraint: a CO₂ cap (0 = net-zero), a minimum renewable share, or a reserve margin |
| **Technology** | Acts on one technology, or a group (all supply, renewable, emitting, non-renewable): disable it, remove it, scale a parameter or set a parameter |
| **Emissions** | Acts on every emitting technology at once: cut their buildable capacity by a percentage, or phase them out |
| **Renewables** | Raises the buildable capacity of every renewable technology by a percentage |
| **Location** | Like Technology, but only at one location |
| **Time series** | Swaps one CSV file for another wherever the model uses it, for example a different weather year |
| **Custom ops** | Lets you write the changes by hand, or import a scenario saved in the older Scenarios view |
| **Sensitivity cases** | Global only. Defines several cases; every year runs once per case |
| **SPORES alternatives** | Global only. Runs SPORES at one or more cost slacks; every slack is a separate run. See [SPORES](spores.md) |
| **Demand growth (trajectory)** | Global only. Grows demand at a yearly rate from a base year |
| **Carbon cap (trajectory)** | Global only. Tightens a CO₂ cap from a start value to an end value across the years |
| **Renewable transition (traj.)** | Global only. Phases out fossil technologies across the years, optionally with a minimum renewable share |

Select a card to edit its settings in the side panel. Technology, Emissions and Renewables
cards show which of the model's technologies they currently match. If a card matches none,
the board marks it and the bottom bar counts it as "hit 0 techs".

!!! note "CO₂ caps need CO₂ costs"
    A CO₂ cap only works if your technologies have emissions defined as a cost class
    (`costs.co2.*`). Without them the cap has nothing to limit.

When several cards change the same parameter in the same year, TEMPO combines them:
scaling factors multiply, and for set values and constraints the last card wins. Conflicts
show up as notes in the bottom bar.

---

## Templates

**Templates** in the top bar fills the board with a ready-made scenario. It replaces the
current board.

| Template | What you get |
|---|---|
| Blank timeline | 2025, 2030 and 2035, no cards |
| Demand growth pathway | 2025 to 2040 in 5-year steps, demand compounding at 1.5 % per year |
| Carbon cap / net-zero | 2025 to 2040, a CO₂ cap falling linearly to zero |
| Renewable transition | 2025 to 2040 with a global renewable-transition card |
| Renewables boost | 2025 to 2040, renewables' buildable capacity rising to twice the base value |
| Lombardi et al. 2020: Italy SPORES | The setup of the Italy SPORES study: 2050, nine sensitivity cases, three cost slacks. Calliope 0.6.8 |

---

## Running

The top bar sets what to run and where:

- **Model**: the model the scenario is applied to.
- **Engine**: Calliope 0.6.8, Calliope 0.7, PyPSA, OSeMOSYS or AdOpT-NET0. The dot next to it
  shows whether that engine's service is running.
- **Local / MEME**: shown when a [remote server](remote-runs.md) is configured and the engine
  can run remotely.
- **Compare**: runs the same scenario on additional models as well.

The bar at the bottom shows how many runs the scenario will start:

```
runs = years × sensitivity cases × SPORES slacks × models
```

Choose **Parallel** to start every run at once, or **Sequential** to run them one at a time
in year order. Click **Run**; TEMPO switches to the Run screen, where each run has its own
log.

!!! note "Every year is a separate solve"
    Each year is optimised on its own, starting from the original model plus that year's
    changes. Sequential mode only changes the order runs start in. Capacity built in one
    year is **not** carried into the next.

---

## Results

When runs finish, a **Results** strip appears at the bottom of the studio. Open it to see
the batch side by side: a table of every run with its objective, capacity, generation,
unmet demand and imports, and a capacity-by-technology chart. If you ran more than one
model, a **Model × Variant matrix** shows one KPI (objective, capacity, renewable share,
LCOE or unmet demand) with cells shaded per column so the best and worst stand out.

Every run is also saved like any other run, so you can open it in **Results** or compare it
there. See [Comparing & Exporting](comparing-exporting.md).
