# Map Interface

The map is the central hub of TEMPO. It shows your model topology overlaid on a geographic base map and lets you interact with locations and links directly.

---

## Map layout

| Area | Description |
|---|---|
| **Base map** | OpenStreetMap raster tiles (configurable in Settings) |
| **Location markers** | Circular icons representing model nodes |
| **Link lines** | Straight lines connecting location markers |
| **Infrastructure layers** | Optional OSM power infrastructure overlays |
| **Left sidebar** | Model editor: locations, links, technologies, parameters |
| **Right sidebar** | OSM Infrastructure Panel (region selection, data download, layer filters, mesh generator) |

---

## Navigating the map

| Action | Result |
|---|---|
| Click and drag | Pan the map |
| Scroll wheel | Zoom in / out |
| Double-click | Zoom to point |
| `Ctrl` + scroll | Rotate / tilt (3D) |
| Click a marker | Open location edit dialog |
| Click a link line | Open link edit dialog |
| Hover a marker | Show tooltip with name and coordinates |

---

## Right sidebar — OSM Infrastructure Panel

The right sidebar is always visible in the Creation view. Click the collapse arrow (chevron) to minimise it to icon-only mode.

The panel contains four sections from top to bottom:

### Select Region
A step-by-step region selector (Continent → Country → Region → Sub-region). Each selection zooms the map and loads the corresponding infrastructure data. Use **Clear All** to reset.

### Download GIS Data
Expand this section to download a new country or region directly into your local GeoServer. Requires Docker containers to be running. Streams live log output from the Python pipeline. See [Downloading GIS Data](../osm-processing/downloading-data.md).

### Infrastructure Layers
Toggle visibility and apply filters for each layer:

- **Power Lines** — voltage range slider (kV)
- **Power Plants** — energy source checkboxes, minimum capacity (MW)
- **Substations** — substation type checkboxes, voltage range slider
- **Region Boundaries** — on/off toggle

### Power Mesh Generator
Generates a simplified network graph from the visible power line layer. Click **Generate Mesh Network** to build nodes at line intersections, then optionally import the result as model Locations & Links or export it as JSON.

---

## Adding locations from the map

Click anywhere on the base map (not on an existing marker) to open the **Add Location** dialog with the latitude/longitude pre-filled from the click position.

---

## Location marker colours

Location markers are colour-coded:

| Colour | Meaning |
|---|---|
| Blue | Location with only demand technologies |
| Yellow | Location with solar PV |
| Green | Location with wind |
| Orange | Location with storage or conventional generation |
| Mixed gradient | Location with multiple technology types |

---

## Deck.gl 3D layers

When 3D mode is enabled, OSM infrastructure features are rendered with height extrusion:

- **Substations**: extruded by voltage level — higher voltage = taller column.
- **Power plants**: extruded by installed capacity.
- **Power lines**: rendered as 3D arcs, colour-coded by voltage class.

3D mode requires a reasonably capable GPU. On integrated graphics it is recommended only for small geographic areas.

