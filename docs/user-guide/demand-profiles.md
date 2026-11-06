# Substation Demand

When you build a model with the [Study Area](study-area.md) tool, TEMPO can give each
substation an electricity demand: an annual amount of energy plus an hourly (or finer)
load shape. Substations are where distribution companies take energy from the grid, so
this is where the demand of the area is placed.

There are two ways to do it:

| Mode | What it uses | When to use it |
|---|---|---|
| **Estimate from data** (default) | A global 1 km map of electricity consumption, national demand statistics and OpenStreetMap land use | Anywhere in the world, when the demand service is installed |
| **Population split** | The population of the area × a per-capita figure, split across the substations | When the demand service is not installed, or as a quick rough figure |

Both are starting points for regions where you have no measured load data. Replace them
with real demand series when you have them.

---

## Turning it on

In step 2 of the Study Area network builder (**Substations**), switch on **Add estimated
demand** and pick the mode.

**Calendar** and **Resolution** apply to both modes:

- **Calendar** sets the country whose public holidays are used in the load profiles. It
  starts as the country of your study area.
- **Resolution** is the timestep of the generated series: 60, 30 or 15 minutes. TEMPO also
  sets the model's resolution to match.

---

## Estimate from data

This mode needs the **Demand estimation** component. Tick it in the setup screen on first
launch, or install it later under Settings → Components. It runs a small local service, so nothing about
your model leaves your computer apart from the land-use download from OpenStreetMap.

The first estimate needs the consumption map (about 110 MB, downloaded once). If it is
missing, the panel shows a **Download consumption data** button with progress.

### Options

| Option | What it does |
|---|---|
| **Profile family** | `classic` (BDEW 1999 profiles) or `bdew25` (the 2025 revision) |
| **Use OSM land use** | Fetch residential, commercial, industrial and farmland areas from OpenStreetMap to set each substation's sector mix. Off, or for very large areas, every substation gets the default mix |
| **Area total (GWh/yr)** | Optional. Leave empty to use the calibrated total; enter a figure to force the total and keep only the spatial split |

Click **Estimate**. With land use on, the first run for an area can take up to a
couple of minutes; later runs use a cache.

### How the estimate works

1. **Withdrawal substations.** Only substations tagged in OpenStreetMap as
   `distribution`, `minor_distribution` or `industrial` receive demand, plus untagged
   substations at or below 110 kV. Transmission, traction, converter and generation
   substations get none. If the area has no such substation, all substations are used
   and a warning says so.
2. **Consumption map.** TEMPO reads the 1 km electricity-consumption map of
   Chen & Gao (2022) inside your study area.
3. **Calibration.** The map's country totals don't match national statistics well (for
   example 1.35× in Germany and 0.56× in Chile). So the map only decides *where* demand
   is. The *amount* is the country's national demand for the latest year up to your model
   year (Our World in Data), times the area's share of the country's map total. A study
   area that crosses a border is calibrated country by country.
4. **Service areas.** Each map cell goes to its nearest withdrawal substation. The result
   is one service area per substation (a Voronoi cell, clipped to the study area).
5. **Sector mix.** Within each service area, the consumption on residential, commercial,
   industrial and farmland areas sets the mix of BDEW profiles (for example
   `h0_dyn 55 · g0 30 · g3 15`), rounded to 5 % steps. The part of the consumption that falls
   on no mapped land use gets the default mix. A substation tagged `industrial` gets the
   industrial profile only.
6. **Load shape.** demandlib builds the BDEW profile of each mix for your model dates. In
   the southern hemisphere the seasons are shifted by six months, while weekdays and
   holidays follow the real calendar.

The panel shows the calculation chain: map year, the calibration of each country, the
calibrated total, any override, and the final total.

### Editing before import

The table lists every withdrawal substation with its annual GWh, average MW, peak MW and
sector mix. Click a column header to sort.

- Change a substation's **GWh** to set its demand directly.
- Change the **Total** to rescale every substation in proportion.
- Click a **mix** to edit it. The weights are normalised to 100 %.
- **Reset edits** brings back the estimate.

Peak MW is the highest value of the hourly shape over your model period. It shows "—"
after you edit a mix, until you import.

Changing an option, or the substations selected in the earlier steps, shows a banner
asking you to estimate again. Nothing is recalculated until you click the button.

### Warnings

| Warning | Meaning |
|---|---|
| `NO_SEEDS_FALLBACK` | No distribution or industrial substation was found, so all substations get demand |
| `FAR_FROM_SEED` | More than 10 % of the demand is over 30 km from any withdrawal substation. OpenStreetMap is probably missing substations there |
| `NO_CALIBRATION` | The country has no national figure or no data in the map. Without an **Area total**, the demand is zero |
| `NO_PIXELS` / `AREA_SHARES` | The map shows no consumption in the area, so the total is split by service-area size |
| `DUPLICATE_SEED` | Several substations share one location; only one of them gets demand |
| `LANDUSE_SKIPPED` / `LANDUSE_UNAVAILABLE` | Land use was not used (area too large, or OpenStreetMap did not answer), so every substation gets the default mix |

### Limits

- **Tropics.** BDEW profiles are German and seasonal. Near the equator the seasonal
  swing they produce is not realistic; the panel notes this for tropical areas.
- **Climate.** The shapes don't respond to temperature, so cooling-driven summer peaks are
  not represented.
- **Countries without map data.** 69 countries and territories (for example Cuba,
  Madagascar, Fiji and Taiwan) have no data in the consumption map. Enter an **Area
  total** there, or use Population split.
- **No growth.** The total is for the latest year with statistics. Project future demand in
  [Scenario Studio](scenario-studio.md).
- **OpenStreetMap coverage.** Missing or mistagged substations move demand to their
  neighbours.

### How accurate is it?

We compared the estimate with metered 2024 withdrawals per busbar from Chile's system
operator (Coordinador Eléctrico Nacional, CEN), for eight communes from Arica to Puerto
Montt. The script is `scripts/validate_substation_demand.py`.

**Area totals** were off by −52 % to +359 % against CEN:

| Commune | Estimate (GWh) | CEN (GWh) | Difference |
|---|---:|---:|---:|
| Arica | 739 | 401 | +84 % |
| Iquique | 336 | 693 | −52 % |
| Antofagasta | 3,572 | 7,479 | −52 % |
| Calama | 2,746 | 3,957 | −31 % |
| La Serena | 855 | 187 | +359 % (most of the city's CEN busbars could not be located; with them, about −17 %) |
| Rancagua | 864 | 693 | +25 % |
| Temuco | 977 | 651 | +50 % |
| Puerto Montt | 777 | 953 | −18 % |

**The split between substations** was weaker still. Even after each area's estimate was
scaled to the CEN total, the typical error per substation group was 69 % (median; the
middle half lay between 39 % and 94 %, over 40 groups).

What drives the errors:

- **Mining and other large industry.** The consumption map comes from satellite
  night-lights. Mines are dark at night but draw a lot of power, so mining areas (Antofagasta,
  Calama) come out far too low. Because the national total is fixed, cities come out too high
  (Arica, Temuco).
- **Which substation actually supplies the load.** A city's demand is often metered at a
  few busbars, while OpenStreetMap shows more substations; nearest-substation areas spread
  the demand over all of them.
- **Missing substations** in OpenStreetMap, and busbars with uncertain locations.

So treat the estimate as an order-of-magnitude first guess, and replace it with measured
data wherever you have it. **Area total** and the per-substation GWh fields are there for
that. The estimate did best in Puerto Montt, a city without large industry and with few
substations: −18 % on the total and under 15 % per substation.

---

## Population split

```
annual demand (kWh) = population × per-capita demand (kWh per person per year)
```

The population comes from the OpenStreetMap data of the places you selected. If none of
them reports a population, the panel says so and no demand is created. **Per-capita
demand** defaults to 3,500 kWh per person per year.

The total is split across the substations:

| Split option | How it works |
|---|---|
| **Evenly** | Every substation gets the same share |
| **Weighted by voltage (size proxy)** | Each substation's share is proportional to its voltage in kV. With no voltage tags, TEMPO falls back to an even split |

### Load shape

Pick one BDEW standard load profile from **Load shape (BDEW SLP)**, or tick **Mix** to
blend several:

| Group | Profiles |
|---|---|
| Flat | Constant load, no time variation |
| Residential | Household dynamic (`h0_dyn`), Household (`h0`) |
| Commercial | General (`g0`), offices (`g1`), evening-heavy (`g2`), continuous 24/7 (`g3`), shops (`g4`), bakery (`g5`), weekend-heavy (`g6`) |
| Agriculture | General (`l0`), dairy and livestock (`l1`), other (`l2`) |
| BDEW25 (2025) | Household (`h25`), Commercial (`g25`), Agriculture (`l25`) |

The default mix is household `h0_dyn` 50 %, commercial `g0` 35 %, industry `g3` 10 % and
agriculture `l0` 5 %. Weights are normalised; a weight of 0 drops the sector. A small chart
previews one week of the shape.

Without the Demand estimation component, the shapes come from a built-in synthetic
approximation (labelled *synthetic (approx.)*) instead of demandlib.

---

## What gets created

When you click **Import all**:

- Each substation with demand gets a `power_demand` technology.
- TEMPO writes a time series file called `osm_substation_demand.csv`, with a `datetime`
  column and one column per substation, named after it. Values are in MW and negative,
  following Calliope's demand convention. They are absolute, so no `resource_scale` is
  needed and the file works with every engine. (Population split with **Flat** writes no
  file; each substation gets a constant demand instead.)
- With **Estimate from data**, the service areas are saved with the model as the
  **Demand cells** layer (see below).

If the demand service is not running at import time, the series is built from the
synthetic approximation of each substation's mix, at the same annual energy.

---

## Demand cells layer

After an estimate import, the map in **Creation** and **Map View** can show each
substation's service area, coloured by demand density (GWh/km²) or by total demand
(GWh/yr).

- Turn it on and off under **Overlays** in the map-style menu (top right). The choice is
  remembered and shared by both views.
- The legend switches between **Density** and **Total**. The colour scale tops out at the
  95th percentile, so one very dense cell doesn't wash out the rest.
- Hover a cell to see its substation, annual demand, average MW, density, area and mix.
- If a substation is deleted or loses its demand, its cell is hidden and a banner says the
  cells are out of date. **Remove cells** clears them. To rebuild them, run the estimate
  again.

The cells are drawn only in the WebGL map; the fallback map used when WebGL is unavailable
doesn't show them.

---

## Changing model dates later

The generated series covers the model's start and end dates at the chosen resolution. If
you change them afterwards, open the series in **TimeSeries**. A banner shows whether the
series still matches the model; if not, it turns amber. Click **Regenerate** to rebuild it
with the same settings. An estimate-based series keeps each substation's annual energy and
mix, and its column names.

---

## Data sources and attribution

| Data | Source | Licence |
|---|---|---|
| Electricity-consumption map | Chen, J., Gao, M. et al. (2022), *Global 1 km × 1 km gridded revised real gross domestic product and electricity consumption during 1992–2019*, Scientific Data, [doi:10.1038/s41597-022-01322-5](https://doi.org/10.1038/s41597-022-01322-5); data [doi:10.6084/m9.figshare.17004523](https://doi.org/10.6084/m9.figshare.17004523) | CC BY 4.0 |
| National electricity demand | [Our World in Data energy dataset](https://github.com/owid/energy-data) (`electricity_demand`) | CC BY 4.0 |
| Country outlines for the calibration table | [Natural Earth](https://www.naturalearthdata.com/) admin-0 | Public domain |
| Substations and land use | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | ODbL |
| Load profiles | BDEW standard load profiles via [demandlib](https://github.com/oemof/demandlib) | MIT (demandlib) |
