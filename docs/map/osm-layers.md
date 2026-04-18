# OSM Infrastructure Layers

The map can display real power infrastructure data from OpenStreetMap — substations, power plants, and high-voltage transmission lines — to help you ground your model in physical reality.

---

## How the data is loaded

Infrastructure features are fetched in two ways depending on your setup:

1. **Live via Overpass API** (default, no setup needed): the Go backend queries the public [Overpass API](https://overpass-api.de/) on demand when you navigate to a region. Data reflects the current state of OpenStreetMap.

2. **From a local GeoServer instance** (recommended): pre-processed vector tile layers served from PostGIS. Faster, works offline, and scales to country-level or larger areas. See [GeoServer Setup](geoserver.md).

---

## The OSM Infrastructure Panel

All OSM-related controls live in the **right sidebar** of the Creation view. The panel has three sections:

### 1. Select Region (stepper)

A cascading stepper that narrows the geographic focus:

- **Step 1 — Continent** — e.g. Europe
- **Step 2 — Country** — e.g. Spain
- **Step 3 — Region** — e.g. Asturias *(if available in your loaded data)*
- **Step 4 — Sub-region** — e.g. Oviedo *(if available)*

Selecting each level zooms the map and loads the corresponding infrastructure layers from GeoServer or Overpass. Use **Clear All** to reset the selection.

### 2. Download GIS Data

A collapsible section for downloading new regions directly from within the app. Click the header to expand it.

1. Select **Continent → Country → Region** (region is optional — leave blank for whole country).
2. Click **Download & Import**.
3. The log terminal streams pipeline output. When it finishes, the new region is immediately available in the stepper above.

See [Downloading GIS Data](../osm-processing/downloading-data.md) for prerequisites and advanced options.

### 3. Infrastructure Layers

Toggle and filter the layers shown on the map:

- **Power Lines** — filter by voltage range (kV).
- **Power Plants** — filter by energy source (solar, wind, hydro…) and minimum capacity (MW).
- **Substations** — filter by substation type and voltage range.
- **Region Boundaries** — administrative boundary polygons for the selected region.

### 4. Power Mesh Generator

Generates a simplified network graph from the loaded power line layer. Use **Generate Mesh Network** to create nodes at line junctions and endpoints. The mesh can be:

- Imported as model **Locations & Links** with one click.
- Exported as JSON.
- Toggled on/off or cleared.

---

## Available layers

### Substations
Power substations from OSM `power=substation`. Colour-coded by voltage:

| Colour | Voltage |
|---|---|
| Red | ≥ 220 kV |
| Orange | 110–219 kV |
| Yellow | < 110 kV |

### Power plants
Markers with type-encoded icons. From OSM `power=plant`.

### Power lines
High-voltage transmission lines from OSM `power=line`. Colour-coded by voltage class.

### Administrative boundaries
Country, state, and district boundaries as polygon overlays.

---

## Using infrastructure data to place model nodes

The infrastructure overlay is a reference layer — it does not automatically create model locations. Use it to:

- Find where major substations or power plants are located and place your model nodes there.
- Verify that transmission links in your model match real lines.
- Estimate available land area for renewables.

Use the **Power Mesh Generator** to automatically extract a network topology from the power line layer and import it as model locations and links.

