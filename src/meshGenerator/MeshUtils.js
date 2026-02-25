/**
 * MeshUtils.js
 * Utility functions for mesh generation and manipulation
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Convert degrees to radians
 * @param {number} deg - Degrees
 * @returns {number} Radians
 */
const toRad = (deg) => {
  return deg * (Math.PI / 180);
};

/**
 * Deduplicate nearby points by merging them into clusters
 * @param {Array} points - Array of point objects with latitude and longitude
 * @param {number} threshold - Distance threshold in kilometers for merging
 * @returns {Array} Array of deduplicated mesh nodes
 */
export const deduplicatePoints = (points, threshold = 0.5) => {
  if (!points || points.length === 0) return [];

  const clusters = [];
  const processed = new Set();

  points.forEach((point, index) => {
    if (processed.has(index)) return;

    // Start new cluster
    const cluster = {
      points: [point],
      indices: [index]
    };

    // Find all nearby points
    points.forEach((otherPoint, otherIndex) => {
      if (otherIndex === index || processed.has(otherIndex)) return;

      const distance = calculateDistance(
        point.latitude,
        point.longitude,
        otherPoint.latitude,
        otherPoint.longitude
      );

      if (distance <= threshold) {
        cluster.points.push(otherPoint);
        cluster.indices.push(otherIndex);
        processed.add(otherIndex);
      }
    });

    processed.add(index);
    clusters.push(cluster);
  });

  // Create mesh nodes from clusters
  return clusters.map((cluster, clusterIndex) => {
    // Calculate centroid
    const latSum = cluster.points.reduce((sum, p) => sum + p.latitude, 0);
    const lonSum = cluster.points.reduce((sum, p) => sum + p.longitude, 0);
    const count = cluster.points.length;

    // Collect unique names
    const names = [...new Set(cluster.points.map(p => p.name).filter(Boolean))];
    const voltages = [...new Set(cluster.points.map(p => p.voltage).filter(Boolean))];

    return {
      id: `mesh_node_${clusterIndex}`,
      latitude: latSum / count,
      longitude: lonSum / count,
      name: names.length > 0 ? names[0] : `MeshNode_${clusterIndex}`,
      alternativeNames: names,
      voltage: voltages.length > 0 ? Math.max(...voltages) : null,
      clusterSize: count,
      originalPoints: cluster.points,
      originalIndices: cluster.indices
    };
  });
};

/**
 * Calculate real distance of a polyline by summing segment distances
 * @param {Array} lineCoords - Array of [lon, lat] coordinates
 * @returns {number} Total distance in kilometers
 */
const calculatePolylineDistance = (lineCoords) => {
  if (!lineCoords || lineCoords.length < 2) return 0;
  
  let totalDistance = 0;
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const [lon1, lat1] = lineCoords[i];
    const [lon2, lat2] = lineCoords[i + 1];
    totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
  }
  return totalDistance;
};

/**
 * Build connectivity graph from power lines and mesh nodes
 * @param {Object} powerLinesGeoJson - GeoJSON FeatureCollection of power lines
 * @param {Array} meshNodes - Array of mesh nodes
 * @param {number} snapThreshold - Distance threshold in km for snapping line endpoints to nodes
 * @returns {Object} Graph with nodes and edges
 */
export const buildConnectivityGraph = (powerLinesGeoJson, meshNodes, snapThreshold = 0.5) => {
  if (!powerLinesGeoJson || !meshNodes || meshNodes.length === 0) {
    return { nodes: meshNodes || [], edges: [] };
  }

  const edges = [];
  let edgeId = 0;

  powerLinesGeoJson.features.forEach((feature, lineIndex) => {
    if (!feature.geometry || !feature.geometry.coordinates) return;

    const coords = feature.geometry.coordinates;
    const props = feature.properties || {};

    const processLineSegment = (lineCoords, segmentId) => {
      if (lineCoords.length < 2) return;

      const startCoord = lineCoords[0];
      const endCoord = lineCoords[lineCoords.length - 1];

      // Find nearest mesh nodes for start and end
      const startNode = findNearestNode(meshNodes, startCoord[1], startCoord[0], snapThreshold);
      const endNode = findNearestNode(meshNodes, endCoord[1], endCoord[0], snapThreshold);

      if (startNode && endNode && startNode.id !== endNode.id) {
        // Calculate straight-line distance between nodes
        const straightDistance = calculateDistance(
          startNode.latitude,
          startNode.longitude,
          endNode.latitude,
          endNode.longitude
        );
        
        // Calculate real distance along the power line (following the actual path)
        const realDistance = calculatePolylineDistance(lineCoords);
        
        // Create edge with both distances
        edges.push({
          id: `edge_${edgeId++}`,
          from: startNode.id,
          to: endNode.id,
          fromNode: startNode,
          toNode: endNode,
          voltage: props.voltage_kv || props.voltage || null,
          lineId: segmentId,
          distance: straightDistance,  // Straight-line distance (for visualization/simple calculations)
          realDistance: realDistance,  // Actual path distance from OSM (for accurate modeling)
          properties: props
        });
      }
    };

    if (feature.geometry.type === 'LineString') {
      processLineSegment(coords, `line_${lineIndex}`);
    } else if (feature.geometry.type === 'MultiLineString') {
      coords.forEach((lineCoords, subIndex) => {
        processLineSegment(lineCoords, `line_${lineIndex}_${subIndex}`);
      });
    }
  });

  // Remove duplicate edges
  const uniqueEdges = deduplicateEdges(edges);

  return {
    nodes: meshNodes,
    edges: uniqueEdges
  };
};

/**
 * Find nearest mesh node to given coordinates
 * @param {Array} nodes - Array of mesh nodes
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} maxDistance - Maximum distance threshold in km
 * @returns {Object|null} Nearest node or null
 */
const findNearestNode = (nodes, lat, lon, maxDistance) => {
  let nearest = null;
  let minDistance = Infinity;

  nodes.forEach(node => {
    const distance = calculateDistance(lat, lon, node.latitude, node.longitude);
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      nearest = node;
    }
  });

  return nearest;
};

/**
 * Remove duplicate edges (same from/to pair)
 * @param {Array} edges - Array of edges
 * @returns {Array} Deduplicated edges
 */
const deduplicateEdges = (edges) => {
  const seen = new Set();
  return edges.filter(edge => {
    const key1 = `${edge.from}_${edge.to}`;
    const key2 = `${edge.to}_${edge.from}`;
    if (seen.has(key1) || seen.has(key2)) {
      return false;
    }
    seen.add(key1);
    return true;
  });
};

/**
 * Calculate mesh statistics
 * @param {Object} graph - Graph with nodes and edges
 * @returns {Object} Statistics object
 */
export const calculateMeshStatistics = (graph) => {
  if (!graph || !graph.nodes || !graph.edges) {
    return {
      nodeCount: 0,
      edgeCount: 0,
      avgConnectivity: 0,
      isolatedNodes: 0,
      maxVoltage: 0,
      minVoltage: 0
    };
  }

  const { nodes, edges } = graph;

  // Calculate connectivity per node
  const connectivity = {};
  nodes.forEach(node => {
    connectivity[node.id] = 0;
  });

  edges.forEach(edge => {
    connectivity[edge.from] = (connectivity[edge.from] || 0) + 1;
    connectivity[edge.to] = (connectivity[edge.to] || 0) + 1;
  });

  const connectivityValues = Object.values(connectivity);
  const avgConnectivity = connectivityValues.length > 0
    ? connectivityValues.reduce((sum, val) => sum + val, 0) / connectivityValues.length
    : 0;

  const isolatedNodes = connectivityValues.filter(val => val === 0).length;

  // Voltage statistics
  const voltages = nodes.map(n => n.voltage).filter(v => v && !isNaN(v));
  const maxVoltage = voltages.length > 0 ? Math.max(...voltages) : 0;
  const minVoltage = voltages.length > 0 ? Math.min(...voltages) : 0;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    avgConnectivity: avgConnectivity.toFixed(2),
    isolatedNodes,
    maxVoltage,
    minVoltage,
    totalDistance: edges.reduce((sum, edge) => sum + (edge.distance || 0), 0).toFixed(2)
  };
};
