/**
 * MeshGenerator.js
 * Main mesh generation orchestrator
 */

import { extractLineEndpoints, parseLocationName, extractVoltage } from './LineAnalyzer.js';
import { deduplicatePoints, buildConnectivityGraph, calculateMeshStatistics } from './MeshUtils.js';

/**
 * Generate power mesh from OSM power lines
 * @param {Object} powerLinesGeoJson - GeoJSON FeatureCollection of power lines
 * @param {Object} options - Configuration options
 * @returns {Object} Generated mesh with nodes, edges, and statistics
 */
export const generatePowerMesh = (powerLinesGeoJson, options = {}) => {
  const {
    deduplicationThreshold = 0.5, // km
    snapThreshold = 0.5, // km
    minVoltage = 0,
    maxVoltage = 1000
  } = options;

  import.meta.env.DEV && console.log('🔧 Starting mesh generation...');

  // Step 1: Extract all line endpoints
  import.meta.env.DEV && console.log('📍 Extracting line endpoints...');
  const endpoints = extractLineEndpoints(powerLinesGeoJson);
  import.meta.env.DEV && console.log(`  Found ${endpoints.length} endpoints`);

  if (endpoints.length === 0) {
    import.meta.env.DEV && console.warn('⚠️ No endpoints found');
    return {
      nodes: [],
      edges: [],
      statistics: calculateMeshStatistics({ nodes: [], edges: [] }),
      success: false,
      message: 'No endpoints found in power lines data'
    };
  }

  // Step 2: Parse names and voltages
  import.meta.env.DEV && console.log('📝 Parsing location names and voltages...');
  const enrichedEndpoints = endpoints.map(ep => ({
    ...ep,
    name: parseLocationName(ep),
    voltage: extractVoltage(ep)
  }));

  // Step 3: Filter by voltage if specified
  const filteredEndpoints = enrichedEndpoints.filter(ep => {
    const voltage = ep.voltage || 0;
    return voltage >= minVoltage && voltage <= maxVoltage;
  });
  import.meta.env.DEV && console.log(`  Filtered to ${filteredEndpoints.length} endpoints by voltage range`);

  // Step 4: Deduplicate nearby points
  import.meta.env.DEV && console.log('🔄 Deduplicating nearby points...');
  const meshNodes = deduplicatePoints(filteredEndpoints, deduplicationThreshold);
  import.meta.env.DEV && console.log(`  Created ${meshNodes.length} mesh nodes from ${filteredEndpoints.length} endpoints`);

  // Step 5: Build connectivity graph
  import.meta.env.DEV && console.log('🔗 Building connectivity graph...');
  const graph = buildConnectivityGraph(powerLinesGeoJson, meshNodes, snapThreshold);
  import.meta.env.DEV && console.log(`  Generated ${graph.edges.length} edges connecting nodes`);

  // Step 6: Calculate statistics
  import.meta.env.DEV && console.log('📊 Calculating mesh statistics...');
  const statistics = calculateMeshStatistics(graph);

  import.meta.env.DEV && console.log('✅ Mesh generation complete!');
  import.meta.env.DEV && console.log('Statistics:', statistics);

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    statistics,
    success: true,
    message: `Generated mesh with ${graph.nodes.length} nodes and ${graph.edges.length} edges`,
    metadata: {
      deduplicationThreshold,
      snapThreshold,
      minVoltage,
      maxVoltage,
      originalEndpointCount: endpoints.length
    }
  };
};

/**
 * Convert mesh to Calliope locations format
 * @param {Object} mesh - Generated mesh object
 * @returns {Array} Array of Calliope location objects
 */
export const meshToCalliopeLocations = (mesh) => {
  if (!mesh || !mesh.nodes) return [];

  return mesh.nodes.map((node, index) => ({
    id: Date.now() + index, // Use timestamp-based ID like manual locations
    name: node.name,
    latitude: node.latitude,
    longitude: node.longitude,
    techs: {}, // Empty by default, can be assigned later via edit dialog
    isNode: true, // Mark as node/substation since these come from power infrastructure
    metadata: {
      meshNodeId: node.id,
      voltage: node.voltage,
      clusterSize: node.clusterSize,
      alternativeNames: node.alternativeNames || [],
      importedFromMesh: true
    }
  }));
};

/**
 * Export mesh to JSON format
 * @param {Object} mesh - Generated mesh object
 * @returns {string} JSON string
 */
export const exportMeshToJson = (mesh) => {
  return JSON.stringify(mesh, null, 2);
};

/**
 * Validate mesh topology
 * @param {Object} mesh - Generated mesh object
 * @returns {Object} Validation result with issues
 */
export const validateMesh = (mesh) => {
  const issues = [];
  const warnings = [];

  if (!mesh || !mesh.nodes || !mesh.edges) {
    issues.push('Invalid mesh structure: missing nodes or edges');
    return { valid: false, issues, warnings };
  }

  // Check for isolated nodes
  const connectedNodeIds = new Set();
  mesh.edges.forEach(edge => {
    connectedNodeIds.add(edge.from);
    connectedNodeIds.add(edge.to);
  });

  const isolatedNodes = mesh.nodes.filter(node => !connectedNodeIds.has(node.id));
  if (isolatedNodes.length > 0) {
    warnings.push(`${isolatedNodes.length} isolated nodes found (not connected to any edges)`);
  }

  // Check for duplicate node IDs
  const nodeIds = mesh.nodes.map(n => n.id);
  const duplicateIds = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    issues.push(`Duplicate node IDs found: ${duplicateIds.join(', ')}`);
  }

  // Check for invalid edge references
  const nodeIdSet = new Set(nodeIds);
  mesh.edges.forEach((edge, index) => {
    if (!nodeIdSet.has(edge.from)) {
      issues.push(`Edge ${index}: 'from' node ${edge.from} does not exist`);
    }
    if (!nodeIdSet.has(edge.to)) {
      issues.push(`Edge ${index}: 'to' node ${edge.to} does not exist`);
    }
    if (edge.from === edge.to) {
      warnings.push(`Edge ${index}: self-loop detected (from === to)`);
    }
  });

  // Check for nodes without coordinates
  mesh.nodes.forEach((node, index) => {
    if (!node.latitude || !node.longitude || isNaN(node.latitude) || isNaN(node.longitude)) {
      issues.push(`Node ${index}: invalid or missing coordinates`);
    }
  });

  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
};
