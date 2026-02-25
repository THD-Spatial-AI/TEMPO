/**
 * LineAnalyzer.js
 * Analyzes OSM power line GeoJSON data to extract endpoints and properties
 */

/**
 * Extract all endpoints from power line features
 * @param {Object} powerLinesGeoJson - GeoJSON FeatureCollection of power lines
 * @returns {Array} Array of endpoint objects with coordinates and metadata
 */
export const extractLineEndpoints = (powerLinesGeoJson) => {
  if (!powerLinesGeoJson || !powerLinesGeoJson.features) {
    return [];
  }

  const endpoints = [];
  let endpointId = 0;

  powerLinesGeoJson.features.forEach((feature, lineIndex) => {
    if (!feature.geometry || !feature.geometry.coordinates) {
      return;
    }

    const coords = feature.geometry.coordinates;
    const props = feature.properties || {};

    // Handle LineString geometry
    if (feature.geometry.type === 'LineString') {
      if (coords.length < 2) return;

      // Start point
      endpoints.push({
        id: `ep_${endpointId++}`,
        longitude: coords[0][0],
        latitude: coords[0][1],
        type: 'start',
        lineId: `line_${lineIndex}`,
        lineProps: props,
        voltage: props.voltage_kv || props.voltage || null,
        fromName: props.from || props.name || null,
        toName: props.to || null
      });

      // End point
      endpoints.push({
        id: `ep_${endpointId++}`,
        longitude: coords[coords.length - 1][0],
        latitude: coords[coords.length - 1][1],
        type: 'end',
        lineId: `line_${lineIndex}`,
        lineProps: props,
        voltage: props.voltage_kv || props.voltage || null,
        fromName: props.from || props.name || null,
        toName: props.to || null
      });
    }
    // Handle MultiLineString geometry
    else if (feature.geometry.type === 'MultiLineString') {
      coords.forEach((lineCoords, subIndex) => {
        if (lineCoords.length < 2) return;

        // Start point
        endpoints.push({
          id: `ep_${endpointId++}`,
          longitude: lineCoords[0][0],
          latitude: lineCoords[0][1],
          type: 'start',
          lineId: `line_${lineIndex}_${subIndex}`,
          lineProps: props,
          voltage: props.voltage_kv || props.voltage || null,
          fromName: props.from || props.name || null,
          toName: props.to || null
        });

        // End point
        endpoints.push({
          id: `ep_${endpointId++}`,
          longitude: lineCoords[lineCoords.length - 1][0],
          latitude: lineCoords[lineCoords.length - 1][1],
          type: 'end',
          lineId: `line_${lineIndex}_${subIndex}`,
          lineProps: props,
          voltage: props.voltage_kv || props.voltage || null,
          fromName: props.from || props.name || null,
          toName: props.to || null
        });
      });
    }
  });

  return endpoints;
};

/**
 * Parse location name from endpoint
 * @param {Object} endpoint - Endpoint object
 * @returns {string} Parsed location name
 */
export const parseLocationName = (endpoint) => {
  if (!endpoint) return 'Unknown';

  // Try to get name from properties
  if (endpoint.type === 'start' && endpoint.fromName) {
    return endpoint.fromName;
  }
  if (endpoint.type === 'end' && endpoint.toName) {
    return endpoint.toName;
  }

  // Try from lineProps
  const props = endpoint.lineProps || {};
  if (props.name) return props.name;
  if (props.ref) return props.ref;

  // Fallback: generate name from coordinates
  return `Node_${endpoint.latitude.toFixed(3)}_${endpoint.longitude.toFixed(3)}`;
};

/**
 * Extract voltage information from endpoint
 * @param {Object} endpoint - Endpoint object
 * @returns {number|null} Voltage in kV or null
 */
export const extractVoltage = (endpoint) => {
  if (!endpoint) return null;

  let voltage = null;

  // Direct voltage
  if (endpoint.voltage && !isNaN(endpoint.voltage)) {
    voltage = parseFloat(endpoint.voltage);
  }

  // From line properties
  if (!voltage) {
    const props = endpoint.lineProps || {};
    if (props.voltage_kv && !isNaN(props.voltage_kv)) {
      voltage = parseFloat(props.voltage_kv);
    } else if (props.voltage) {
      // Try to parse raw voltage string
      const voltageStr = String(props.voltage).replace(/[^0-9.]/g, '');
      const parsed = parseFloat(voltageStr);
      if (!isNaN(parsed)) {
        voltage = parsed;
      }
    }
  }

  // Convert volts to kilovolts if needed (110000 → 110)
  if (voltage && voltage > 1000) {
    voltage = voltage / 1000;
  }

  return voltage;
};
