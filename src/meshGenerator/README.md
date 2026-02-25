# Power Mesh Generator Module

## Overview

The Power Mesh Generator is a sophisticated module that analyzes OpenStreetMap (OSM) power transmission line data to create an editable network mesh. It extracts endpoints from power lines, identifies connections, and generates a graph-based representation of the power transmission network.

## Features

✅ **Line Endpoint Extraction** - Automatically extracts start/end points from OSM power line GeoJSON
✅ **Location Name Parsing** - Intelligently parses location names from line properties
✅ **Point Deduplication** - Merges nearby points into single mesh nodes using configurable distance threshold
✅ **Connectivity Graph** - Builds network topology showing how nodes are connected
✅ **Voltage-Based Visualization** - Color-codes nodes and edges by voltage level
✅ **Interactive Editing** - Click nodes to edit properties, view connections, remove edges
✅ **Mesh Statistics** - Real-time stats on node count, connectivity, isolated nodes
✅ **Validation** - Checks mesh integrity, identifies issues and warnings
✅ **Export/Import** - Export mesh as JSON, import as Calliope locations

## Module Structure

```
src/meshGenerator/
├── MeshGenerator.js     # Main orchestrator - coordinates mesh generation
├── MeshUtils.js         # Utility functions - distance, deduplication, graph building
├── LineAnalyzer.js      # Line processing - endpoint extraction, property parsing
└── README.md            # This file
```

## API Reference

### MeshGenerator.js

#### `generatePowerMesh(powerLinesGeoJson, options)`
Main function to generate mesh from OSM power lines.

**Parameters:**
- `powerLinesGeoJson` (Object): GeoJSON FeatureCollection of power transmission lines
- `options` (Object): Configuration options
  - `deduplicationThreshold` (number): Distance in km for merging nearby points (default: 0.5)
  - `snapThreshold` (number): Distance in km for snapping line endpoints to nodes (default: 0.5)
  - `minVoltage` (number): Minimum voltage filter in kV (default: 0)
  - `maxVoltage` (number): Maximum voltage filter in kV (default: 1000)

**Returns:** Object with:
- `nodes` (Array): Mesh nodes with lat/lon, voltage, cluster info
- `edges` (Array): Connections between nodes with distance, voltage
- `statistics` (Object): Mesh statistics (node count, connectivity, etc.)
- `success` (boolean): Whether generation succeeded
- `message` (string): Status message

**Example:**
```javascript
import { generatePowerMesh } from './meshGenerator/MeshGenerator.js';

const result = generatePowerMesh(osmPowerLines, {
  deduplicationThreshold: 0.5,
  snapThreshold: 0.5,
  minVoltage: 110,
  maxVoltage: 500
});

if (result.success) {
  console.log(`Generated ${result.nodes.length} nodes`);
  console.log(`Generated ${result.edges.length} edges`);
  console.log('Statistics:', result.statistics);
}
```

#### `meshToCalliopeLocations(mesh)`
Converts mesh nodes to Calliope location format.

**Parameters:**
- `mesh` (Object): Generated mesh object from `generatePowerMesh()`

**Returns:** Array of location objects compatible with Calliope

#### `exportMeshToJson(mesh)`
Exports mesh to JSON string.

**Parameters:**
- `mesh` (Object): Generated mesh object

**Returns:** String containing formatted JSON

#### `validateMesh(mesh)`
Validates mesh topology and identifies issues.

**Parameters:**
- `mesh` (Object): Generated mesh object

**Returns:** Object with:
- `valid` (boolean): Whether mesh is valid
- `issues` (Array): Critical problems that must be fixed
- `warnings` (Array): Non-critical issues to be aware of

### MeshUtils.js

#### `calculateDistance(lat1, lon1, lat2, lon2)`
Calculates distance between two geographic points using Haversine formula.

**Parameters:**
- `lat1`, `lon1` (number): Latitude and longitude of first point
- `lat2`, `lon2` (number): Latitude and longitude of second point

**Returns:** Distance in kilometers

#### `deduplicatePoints(points, threshold)`
Merges nearby points into clusters to create mesh nodes.

**Parameters:**
- `points` (Array): Array of point objects with `latitude` and `longitude`
- `threshold` (number): Distance threshold in km for merging (default: 0.5)

**Returns:** Array of deduplicated mesh nodes with cluster information

#### `buildConnectivityGraph(powerLinesGeoJson, meshNodes, snapThreshold)`
Builds connectivity graph by snapping line endpoints to mesh nodes.

**Parameters:**
- `powerLinesGeoJson` (Object): GeoJSON of power lines
- `meshNodes` (Array): Deduplicated mesh nodes
- `snapThreshold` (number): Distance threshold in km for snapping (default: 0.5)

**Returns:** Object with `nodes` and `edges` arrays

#### `calculateMeshStatistics(graph)`
Calculates comprehensive statistics for the mesh.

**Parameters:**
- `graph` (Object): Graph with `nodes` and `edges` arrays

**Returns:** Object with:
- `nodeCount` (number): Total number of nodes
- `edgeCount` (number): Total number of edges
- `avgConnectivity` (number): Average connections per node
- `isolatedNodes` (number): Nodes with no connections
- `maxVoltage` (number): Highest voltage in network
- `minVoltage` (number): Lowest voltage in network
- `totalDistance` (number): Sum of all edge distances

### LineAnalyzer.js

#### `extractLineEndpoints(powerLinesGeoJson)`
Extracts all endpoints from power line features.

**Parameters:**
- `powerLinesGeoJson` (Object): GeoJSON FeatureCollection

**Returns:** Array of endpoint objects with:
- `id` (string): Unique endpoint ID
- `longitude`, `latitude` (number): Coordinates
- `type` (string): 'start' or 'end'
- `lineId` (string): Reference to source line
- `lineProps` (Object): Properties from source line
- `voltage` (number): Voltage in kV
- `fromName`, `toName` (string): Location names if available

#### `parseLocationName(endpoint)`
Parses location name from endpoint properties.

**Parameters:**
- `endpoint` (Object): Endpoint object

**Returns:** String containing parsed location name

#### `extractVoltage(endpoint)`
Extracts voltage information from endpoint.

**Parameters:**
- `endpoint` (Object): Endpoint object

**Returns:** Number (voltage in kV) or null if not available

## Usage in Creation.jsx

### Generating a Mesh

1. Load OSM power lines data through the OSM Infrastructure Panel
2. Click the "Generate Mesh Network" button in the infrastructure panel
3. The mesh will be generated and visualized on the map with:
   - **Nodes**: Colored circles sized by zoom level and cluster size
   - **Edges**: Lines connecting nodes, colored by voltage

### Mesh Visualization

**Node Colors (by voltage):**
- 🟣 Purple: ≥380 kV (Extra High Voltage)
- 🟠 Orange: 220-380 kV (High Voltage)
- 🟡 Gold: 110-220 kV (Medium Voltage)
- 🔵 Blue: <110 kV (Lower Voltage)

**Edge Colors:** Same as node colors based on voltage

### Interacting with the Mesh

**Click on a node** to:
- View detailed information (name, voltage, cluster size, coordinates)
- See all connected edges
- Edit node name
- Remove connections

**Mesh Control Panel** provides:
- Show/Hide toggle for mesh visibility
- Statistics display (nodes, connections, avg links, isolated)
- Import as Locations button - converts mesh to Calliope locations
- Export JSON button - saves mesh for later use
- Clear Mesh button - removes generated mesh

### Importing Mesh as Locations

1. Generate a mesh
2. Click "Import as Locations" in the mesh control panel
3. All mesh nodes become temporary locations
4. All mesh edges become links between locations
5. You can now:
   - Assign technologies to mesh nodes
   - Adjust location names
   - Add/remove links
   - Save as a Calliope model

## Configuration Options

### Deduplication Threshold
Controls how aggressively nearby points are merged.
- **Lower values** (0.1-0.3 km): More nodes, finer detail, but more clutter
- **Medium values** (0.4-0.7 km): Balanced approach (recommended)
- **Higher values** (0.8-2.0 km): Fewer nodes, simplified network, may lose detail

### Snap Threshold
Controls how far line endpoints can be from nodes to create connections.
- **Lower values** (0.1-0.3 km): Stricter matching, fewer false connections
- **Medium values** (0.4-0.7 km): Balanced approach (recommended)
- **Higher values** (0.8-2.0 km): More permissive, may create incorrect connections

### Voltage Filtering
Filter which power lines are included in mesh generation:
- Use `minVoltage` and `maxVoltage` to focus on specific voltage levels
- Example: `minVoltage: 220, maxVoltage: 1000` for high-voltage transmission only

## Algorithm Details

### 1. Endpoint Extraction
- Parses GeoJSON geometry (LineString, MultiLineString)
- Extracts first and last coordinate from each line
- Preserves all line properties (voltage, name, etc.)

### 2. Point Deduplication
- Uses clustering algorithm with distance threshold
- Calculates centroid of each cluster
- Merges location names from all clustered points
- Tracks cluster size for visualization

### 3. Graph Building
- For each power line, finds nearest mesh nodes to its endpoints
- Creates edges only if both endpoints snap to nodes
- Removes duplicate edges (same node pair)
- Calculates edge distances using Haversine formula

### 4. Statistics Calculation
- Counts nodes and edges
- Calculates average connectivity (edges per node)
- Identifies isolated nodes (no connections)
- Finds voltage range

### 5. Validation
- Checks for duplicate node IDs
- Verifies all edges reference valid nodes
- Identifies self-loops (edge from node to itself)
- Reports isolated nodes as warnings

## Performance Considerations

- **Large datasets**: The module handles thousands of power lines efficiently
- **Deduplication**: O(n²) complexity - may be slow for >10,000 endpoints
- **Visualization**: Uses meter-based radius scaling for smooth zoom performance
- **Memory**: Keeps full mesh in memory - may need optimization for huge networks

## Future Enhancements

Potential improvements for future versions:
- [ ] Spatial indexing (R-tree) for faster deduplication
- [ ] Advanced clustering algorithms (DBSCAN, hierarchical)
- [ ] Technology type inference from power plant proximity
- [ ] Load flow analysis integration
- [ ] Mesh simplification algorithms (reduce node count while preserving topology)
- [ ] Multi-voltage level visualization layers
- [ ] Mesh comparison tool (diff between versions)
- [ ] Export to standard graph formats (GraphML, GML, Gephi)

## Troubleshooting

### "No endpoints found"
- Ensure power lines data is loaded through OSM Infrastructure Panel
- Check that power lines layer is visible and has features
- Verify voltage filters aren't excluding all lines

### "Too many isolated nodes"
- Increase snap threshold to connect more nodes
- Check if power lines actually form a connected network
- Some regions may have disconnected sub-grids

### "Mesh generation is slow"
- Reduce voltage range to process fewer lines
- Increase deduplication threshold to reduce node count
- Consider using region/subregion filtering in OSM panel

### "Nodes appear as black dots"
- This was fixed by using meter-based radius units
- Ensure `radiusUnits: 'meters'` is set in ScatterplotLayer
- Check console for any DeckGL rendering errors

## License

This module is part of the Calliope Edition Tool and follows the same license.

## Credits

Developed as part of the power mesh generation system for Calliope energy system modeling.

Uses:
- **DeckGL** for high-performance WebGL visualization
- **Haversine formula** for geographic distance calculations
- **OSM data** for real-world power infrastructure
