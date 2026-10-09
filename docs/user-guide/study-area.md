# Study Area

The Study Area tool turns a place name into a model. You search for a country, region,
province or district, TEMPO loads that area's power grid from OpenStreetMap, and a
three-step wizard converts the grid into locations and links.

It works anywhere OpenStreetMap has power data. It does not need the Go backend,
GeoServer or a downloaded PBF extract, but it does need an internet connection.

---

## Where to find it

1. Open **Creation** in the sidebar.
2. Expand the **OSM Infrastructure** panel on the right side of the map.
3. The **Study Area** section is at the top of the panel.

---

## Picking the area

Type a place into the search box, for example `Niederbayern` or `Valparaíso`. Results come
from [Nominatim](https://nominatim.openstreetmap.org), the OpenStreetMap geocoder. Click a
result to add it.

- Each place you add appears as a chip. You can add several places and TEMPO treats them
  as one area. Remove a place with the **×** on its chip, or use **Clear all**.
- Once an area is selected, neighbouring regions are shaded on the map. Hover one and click
  it to add it to the area.

TEMPO then fetches the boundary and queries OpenStreetMap (through the public Overpass API)
for power lines, substations and power plants inside it. The panel shows progress while
this runs and then a count of each:

| Count | What it shows |
|---|---|
| **Lines** | Power lines found in the area |
| **Substations** | Split into transmission and distribution substations |
| **Plants** | Plants with a capacity tag, and how many have no capacity in OSM (⚠) |

!!! note "Public Overpass servers"
    Large areas can take a while, and public Overpass servers are sometimes slow or
    busy. TEMPO tries several mirrors in turn. If loading fails, wait a minute and try
    again, or pick a smaller area.

---

## Building the network

When the grid has loaded, the network builder appears below the counts. It has three
steps. Each step can be included or skipped with the switch next to its title. The map
shows a live preview of the result, but nothing is added to the model until you click
**Import all** on the last step.

### 1. Transmission network

TEMPO joins the OpenStreetMap power lines into a mesh of grid nodes and links. Use the
**Voltage levels** dropdown to choose which voltages to keep, for example only 220 kV and
above. The preview line shows how many nodes and links the mesh will have.

Grid nodes keep their OSM name when there is one. Otherwise they are named
`Grid_node_1`, `Grid_node_2` and so on.

### 2. Substations

Choose which substation **Types** to import. Then choose how to wire them:

| Option | Result |
|---|---|
| **Don't connect (import as-is)** | Substations become locations with no links |
| **Nearest transmission node** | Each substation is linked to the closest grid node from step 1 |

**Max connection distance (km)** skips connections longer than the limit you set. Leave it
empty for no limit.

Each substation gets an `electricity_substation` conversion technology, so it is never an
empty location. Connection links use the `hvac_overhead` link type.

This step can also give every substation an electricity demand estimated from population.
See [Substation Demand](demand-profiles.md).

### 3. Power plants

Choose which plant **Sources** to import (solar, wind, hydro, gas and so on). Then choose
how to wire them: not at all, to the **Nearest substation**, or to the **Nearest
transmission node**. The same **Max connection distance** option applies.

Each plant becomes a location with one technology chosen from its OSM source:

| OSM source | TEMPO technology |
|---|---|
| solar | `solar_pv_utility_scale` |
| wind | `onshore_wind` |
| hydro | `hydroelectric_reservoir` |
| gas | `combined_cycle_gas_turbine_ccgt` |
| coal | `coal_power_plant` |
| nuclear | `nuclear_power_conventional` |
| biomass | `biomass_power_plant` |
| geothermal | `geothermal_power` |
| oil | `internal_combustion_engine` |

The plant's capacity from OSM is set as a fixed capacity (`energy_cap_equals`). Plants with
no capacity tag in OSM get `0` and are flagged, so check them before you run. Plants with a
source not in the table are imported without a technology.

### Importing

Click **Import all** on the last step. TEMPO adds the locations and links to the current
model and shows how many it created. After that they are ordinary locations and links,
which you can edit, move or delete like any others.

---

## Tips

- Start with high voltages only. Including every distribution line in a large region can
  produce thousands of nodes.
- OSM coverage varies a lot between countries. Check the counts and the preview before
  importing, and expect to fix capacities by hand.
- The legacy Geofabrik/PostGIS workflow is still described in
  [Downloading OSM Data](../osm-processing/downloading-data.md), for very large areas or
  offline work.
