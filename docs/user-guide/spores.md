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
| **Fig 1: Technology Mix & System Cost per Solution** | Installed capacity by technology for each solution, next to its cost |
| **Fig 2: Technology Deployment Variability** | How much each technology's capacity changes across solutions |
| **Fig 3: Pairwise Technology Trade-off** | Capacity of one technology against another, one dot per solution. A falling trend means they substitute for each other, a rising trend means they are built together |
| **Fig 4: Near-Optimal Space** | Parallel coordinates across all solutions |
| **Fig 5: Geographic Capacity Distribution per Solution** | Map of where capacity is built in a chosen solution |
| **Technology Deployment Correlation** | Which technologies tend to appear together (dark) or replace each other (light) |
| **Technology Classification** | Each technology labelled as a must-have (in every solution), preferred (in at least 70 % of solutions) or a real choice (missing from at least one) |

The classification is often the most useful output for policy questions. A must-have is
needed whatever else happens; a real choice can be avoided at an acceptable extra cost.
