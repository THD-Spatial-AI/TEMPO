import { useState, useCallback } from 'react';

/**
 * Custom hook for loading OSM data from local GeoJSON files
 * These files are extracted from Geofabrik OSM extracts
 */
export const useLocalOSMData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Load region data from local GeoJSON files
   * @param {object} regionInfo - Region information from OsmInfrastructurePanel
   * @returns {object} - Object containing substations, powerPlants, powerLines, communes, districts
   */
  const loadRegionData = useCallback(async (regionInfo) => {
    if (!regionInfo) {
      console.log('No region info provided');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { continent, country, region, subregion, files, regionFiles } = regionInfo;
      
      // Determine which files to use (subregion files if available, otherwise region files)
      const dataFiles = files && Object.keys(files).length > 0 ? files : regionFiles;
      
      if (!dataFiles || Object.keys(dataFiles).length === 0) {
        console.log('No data files available for this region');
        setLoading(false);
        return null;
      }

      // Build base path to GeoJSON files
      let basePath = '/data/osm_extracts';
      if (continent) basePath += `/${continent}`;
      if (country) basePath += `/${country}`;
      if (region) basePath += `/${region}`;
      if (subregion) basePath += `/${subregion}`;

      console.log(`📍 Loading OSM data from: ${basePath}`);
      console.log('Available files:', dataFiles);

      // Load all available files in parallel
      const loadPromises = [];
      const fileTypes = [];

      // Load substations
      if (dataFiles.substations) {
        const url = `${basePath}/${dataFiles.substations}`;
        loadPromises.push(
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error(`Failed to load ${url}`);
              return res.json();
            })
            .catch(error => {
              console.error(`Error loading substations from ${url}:`, error);
              return null;
            })
        );
        fileTypes.push('substations');
      }

      // Load power plants
      if (dataFiles.power_plants) {
        const url = `${basePath}/${dataFiles.power_plants}`;
        loadPromises.push(
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error(`Failed to load ${url}`);
              return res.json();
            })
            .catch(error => {
              console.error(`Error loading power plants from ${url}:`, error);
              return null;
            })
        );
        fileTypes.push('powerPlants');
      }

      // Load power lines
      if (dataFiles.power_lines) {
        const url = `${basePath}/${dataFiles.power_lines}`;
        loadPromises.push(
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error(`Failed to load ${url}`);
              return res.json();
            })
            .catch(error => {
              console.error(`Error loading power lines from ${url}:`, error);
              return null;
            })
        );
        fileTypes.push('powerLines');
      }

      // Load communes
      if (dataFiles.communes) {
        const url = `${basePath}/${dataFiles.communes}`;
        loadPromises.push(
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error(`Failed to load ${url}`);
              return res.json();
            })
            .catch(error => {
              console.error(`Error loading communes from ${url}:`, error);
              return null;
            })
        );
        fileTypes.push('communes');
      }

      // Load districts
      if (dataFiles.districts) {
        const url = `${basePath}/${dataFiles.districts}`;
        loadPromises.push(
          fetch(url)
            .then(res => {
              if (!res.ok) throw new Error(`Failed to load ${url}`);
              return res.json();
            })
            .catch(error => {
              console.error(`Error loading districts from ${url}:`, error);
              return null;
            })
        );
        fileTypes.push('districts');
      }

      // Wait for all files to load
      const results = await Promise.all(loadPromises);

      // Map results to data object
      const data = {};
      results.forEach((result, index) => {
        const fileType = fileTypes[index];
        data[fileType] = result;
        
        if (result) {
          const count = result.features ? result.features.length : 0;
          console.log(`✓ Loaded ${count} ${fileType} from local file`);
        }
      });

      setLoading(false);
      return data;

    } catch (err) {
      console.error('Error loading local OSM data:', err);
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  return {
    loadRegionData,
    loading,
    error
  };
};
