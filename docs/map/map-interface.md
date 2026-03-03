# Map Interface

The map is the central hub of Calliope Visualizator. It shows your model topology overlaid on a geographic base map and lets you interact with locations and links directly.

---

## Map layout

| Area | Description |
|---|---|
| **Base map** | OpenStreetMap raster tiles (configurable in Settings) |
| **Location markers** | Circular icons representing model nodes |
| **Link lines** | Straight lines connecting location markers |
| **Infrastructure layers** | Optional OSM power infrastructure overlays |
| **Toolbar** | Top-right panel with layer toggles and zoom controls |

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

## Toolbar controls

The map toolbar (top-right) contains:

- **Fit to model** — zooms and pans to show all locations in the current model.
- **Layer toggles** — show or hide: location markers, link lines, OSM substations, OSM power plants, OSM power lines, administrative boundaries.
- **Basemap switcher** — toggle between OpenStreetMap and satellite imagery.
- **3D toggle** — enables Deck.gl 3D rendering mode for the infrastructure layers.

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
