# OSM Infrastructure Layers

The map can display real power infrastructure data from OpenStreetMap — substations, power plants, and high-voltage transmission lines — to help you ground your model in physical reality.

---

## How the data is loaded

Infrastructure features are fetched in two ways depending on your setup:

1. **Live via Overpass API** (default, no setup needed): the Go backend queries the public [Overpass API](https://overpass-api.de/) on demand when you navigate to a region or select a geographic area. Data reflects the current state of OpenStreetMap.

2. **From a local GeoServer instance** (optional): pre-processed vector tile layers served from PostGIS. This is faster and works offline. See [GeoServer Setup](geoserver.md).

---

## Loading infrastructure for a region

1. Open the **OSM Infrastructure Panel** from the toolbar or sidebar.
2. In the **Region Selector**, search for a country, state, or city by name. The application uses the Nominatim geocoding service to resolve the name to a bounding box.
3. Select the layers to load: substations, power plants, power lines, administrative boundaries.
4. Click **Load**. Progress is shown while the backend fetches data from Overpass.

!!! note "Large areas"
    Querying very large areas (e.g. entire countries) can take 30–60 seconds on the public Overpass API and may return very large GeoJSON payloads. For country-scale analysis, use the local GeoServer approach.

---

## Available layers

### Substations
Power substations extracted from OSM `power=substation` nodes and areas. Each substation is shown as a marker colour-coded by voltage:

| Colour | Voltage |
|---|---|
| Red | ≥ 220 kV |
| Orange | 110–219 kV |
| Yellow | < 110 kV |

### Power plants
Shown as markers with the plant type encoded in the icon. OSM `power=plant` relations and nodes.

### Power lines
High-voltage transmission lines from OSM `power=line` ways. Colour-coded by voltage class (230 kV, 380 kV, 500 kV, etc.).

### Administrative boundaries
Country, state, and district boundaries provided as polygon overlays for spatial reference.

---

## Using infrastructure data to place model nodes

The infrastructure overlay is a reference layer — it does not automatically create model locations. Use it to:

- Identify where large substations or power plants are located and place your model nodes accordingly.
- Verify that transmission links in your model roughly correspond to real lines.
- Estimate available land area for renewable generation.

Right-click a substation or power plant marker to create a model **Location** at that coordinate.
