// NEW FILE: src/hooks/useGeoServerData.js
// Custom hook to fetch OSM data from GeoServer via backend API

import { useState, useCallback } from 'react';
import { api } from '../services/api';

export const useGeoServerData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Load OSM infrastructure data for a region and/or bounding box.
   *
   * @param {string|null} regionPath - Region path prefix, e.g. "Europe/Germany" or
   *   "South_America/Chile". Pass null / empty string to load ALL regions in the DB.
   * @param {object}      filters    - Layer visibility flags
   *   { showSubstations, showPowerPlants, showPowerLines, showCommunes, showDistricts }
   * @param {object|null} bbox       - Optional spatial filter {minLon, minLat, maxLon, maxLat}
   */
  const loadRegionData = useCallback(async (regionPath = null, filters = {}, bbox = null) => {
    setLoading(true);
    setError(null);

    const region = regionPath || null; // normalise empty string → null

    try {
      const layers = {
        substations: null,
        powerPlants: null,
        powerLines: null,
        communes: null,
        districts: null
      };

      // Fetch only enabled layers in parallel
      const requests = [];
      const layerKeys = [];

      // Accept both naming conventions: showSubstations (old) and substations (new)
      if (filters.substations !== false && filters.showSubstations !== false) {
        requests.push(api.getOSMLayer('osm_substations', bbox, region));
        layerKeys.push('substations');
      }
      if (filters.powerPlants !== false && filters.showPowerPlants !== false) {
        requests.push(api.getOSMLayer('osm_power_plants', bbox, region));
        layerKeys.push('powerPlants');
      }
      if (filters.powerLines !== false && filters.showPowerLines !== false) {
        requests.push(api.getOSMLayer('osm_power_lines', bbox, region));
        layerKeys.push('powerLines');
      }
      if (filters.communes !== false && filters.showCommunes !== false) {
        requests.push(api.getOSMLayer('osm_communes', bbox, region));
        layerKeys.push('communes');
      }
      if (filters.districts !== false && filters.showDistricts !== false) {
        requests.push(api.getOSMLayer('osm_districts', bbox, region));
        layerKeys.push('districts');
      }

      const results = await Promise.all(requests);

      results.forEach((data, i) => {
        layers[layerKeys[i]] = data;
      });

      setLoading(false);
      return layers;

    } catch (err) {
      console.error('Error loading GeoServer data:', err);
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  /**
   * Load a single layer.
   * @param {string}      layerName  - e.g. "osm_substations"
   * @param {object|null} bbox       - Optional {minLon, minLat, maxLon, maxLat}
   * @param {string|null} regionPath - Optional region filter, e.g. "Europe/Germany"
   */
  const loadLayer = useCallback(async (layerName, bbox = null, regionPath = null) => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getOSMLayer(layerName, bbox, regionPath);
      setLoading(false);
      return data;
    } catch (err) {
      console.error(`Error loading ${layerName}:`, err);
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  /**
   * Calculate bounding box from viewport
   */
  const getBboxFromViewport = useCallback((viewport) => {
    if (!viewport) return null;

    const { latitude, longitude, zoom } = viewport;
    
    // Approximate bbox calculation based on zoom
    // At zoom 10, roughly 0.1 degrees per unit
    const factor = 1 / Math.pow(2, zoom - 10);
    const delta = 0.5 * factor;

    return {
      minLon: longitude - delta,
      minLat: latitude - delta,
      maxLon: longitude + delta,
      maxLat: latitude + delta
    };
  }, []);

  return {
    loadRegionData,
    loadLayer,
    getBboxFromViewport,
    loading,
    error
  };
};
