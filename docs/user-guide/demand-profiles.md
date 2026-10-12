# Substation Demand

When you build a model with the [Study Area](study-area.md) tool, TEMPO can estimate an
electricity demand for each substation. It starts from the population of the area, splits
the total across the substations, and gives each one an hourly (or finer) load shape.

This is a starting point for regions where you have no measured load data. Replace it with
real demand series when you have them.

---

## Turning it on

In step 2 of the Study Area network builder (**Substations**), switch on **Add estimated
demand**.

The estimate needs a population figure. TEMPO takes it from the OpenStreetMap data of the
places you selected and adds the figures up if you selected several. If none of them
reports a population, the panel says so and no demand is created.

---

## How the total is calculated

```
annual demand (kWh) = population × per-capita demand (kWh per person per year)
```

**Per-capita demand** defaults to 3,500 kWh per person per year. Change it to fit your
region; national statistics are a good source.

TEMPO converts the annual total into an average power in MW and splits it across the
substations:

| Split option | How it works |
|---|---|
| **Evenly** | Every substation gets the same share |
| **Weighted by voltage (size proxy)** | Each substation's share is proportional to its voltage in kV. If no substation has a voltage tag, TEMPO falls back to an even split |

---

## Load shape

The load shape decides how demand moves through the day, week and year. You can pick one
standard load profile or mix several.

### One profile

Pick a profile from the **Load shape (BDEW SLP)** list. These are the German BDEW standard
load profiles:

| Group | Profiles |
|---|---|
| Flat | Constant load, no time variation |
| Residential | Household dynamic (`h0_dyn`), Household (`h0`) |
| Commercial | General (`g0`), offices (`g1`), evening-heavy (`g2`), continuous 24/7 (`g3`), shops (`g4`), bakery (`g5`), weekend-heavy (`g6`) |
| Agriculture | General (`l0`), dairy and livestock (`l1`), other (`l2`) |
| BDEW25 (2025) | Household (`h25`), Commercial (`g25`), Agriculture (`l25`) |

### Sector mix

Tick **Mix** to blend four sectors by weight instead:

| Sector | Profile | Default weight |
|---|---|---|
| Household | `h0_dyn` | 50 % |
| Commercial | `g0` | 35 % |
| Industry (24/7) | `g3` | 10 % |
| Agriculture | `l0` | 5 % |

Weights are normalised, so they don't have to add up to 100. A weight of 0 drops the sector.

### Calendar and resolution

- **Calendar** sets which country's public holidays demandlib takes into account when it
  builds the BDEW profiles. The default is `DE` because the BDEW curves are German. The
  built-in approximation (see below) ignores this setting.
- **Resolution** is the timestep of the generated series: 60, 30 or 15 minutes. TEMPO also
  sets the model's resolution to match.

A small chart under these settings previews one week of the shape (Monday to Sunday).

---

## demandlib or the built-in approximation

The real BDEW curves come from [demandlib](https://github.com/oemof/demandlib), which TEMPO
runs in its own Python environment. It is optional.

- **With demandlib installed**, TEMPO generates the actual BDEW profiles. The preview is
  labelled *BDEW (demandlib)*.
- **Without it**, TEMPO uses a built-in synthetic approximation of each profile, with daily,
  weekly and seasonal patterns. The preview is labelled *synthetic (approx.)* and the panel
  shows an **Install demand profiles** button.

You can install demandlib from that button, or tick it as an optional component in the
setup screen on first launch.

---

## What gets created

When you click **Import all**:

- Each substation gets a `power_demand` technology.
- With a load shape other than Flat, TEMPO writes a time series file called
  `osm_substation_demand.csv`. It has a `datetime` column and one column per substation,
  named after the substation. Values are in MW and negative, following Calliope's demand
  convention. They are absolute values, so no `resource_scale` is needed and the same file
  works with every engine.
- With **Flat**, no file is written. Each substation gets a constant demand instead.

The file appears in the **TimeSeries** view like any other series, where you can look at it
and edit it.

---

## Changing model dates later

The generated series covers the model's start and end dates at the chosen resolution. If
you change the dates or the resolution afterwards, open the series in **TimeSeries**. A
banner shows whether the series still matches the model. If it doesn't, the banner turns
amber and tells you how many rows the series has against how many the model expects.
Click **Regenerate from demandlib** to rebuild it with the same settings. If demandlib is
not installed, the button uses the built-in approximation instead.
