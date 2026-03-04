import { useMemo } from 'react';

/**
 * Custom hook for filtering OSM infrastructure layers (substations, power plants, power lines)
 */
export const useOSMLayerFilters = (
  osmSubstations,
  osmPowerPlants,
  osmPowerLines,
  substationFilters,
  powerPlantFilters,
  powerLineFilters
) => {
  
  // Filter substations
  const filteredSubstations = useMemo(() => {
    if (!osmSubstations || !osmSubstations.features) return { type: 'FeatureCollection', features: [] };
    
    const filtered = osmSubstations.features.filter(f => {
      const props = f.properties;
      const type = (props.substation || 'other').toLowerCase();
      
      // Check if type is selected
      if (!substationFilters.selectedTypes.includes(type)) return false;
      
      // Check voltage filter (GeoServer stores in Volts; convert to kV for comparison)
      const voltageStr = props.voltage || props.voltage_primary || '';
      if (voltageStr) {
        let voltage = parseFloat(voltageStr.toString().replace(/[^0-9.]/g, ''));
        if (!isNaN(voltage)) {
          if (voltage > 1000) voltage = voltage / 1000; // V → kV
          if (voltage < substationFilters.minVoltage || voltage > substationFilters.maxVoltage) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    return { type: 'FeatureCollection', features: filtered };
  }, [osmSubstations, substationFilters]);
  
  // Filter power plants
  const filteredPowerPlants = useMemo(() => {
    if (!osmPowerPlants || !osmPowerPlants.features) return { type: 'FeatureCollection', features: [] };
    
    const filtered = osmPowerPlants.features.filter(f => {
      const props = f.properties;
      const source = (props.plant_source || props.source || 'other').toLowerCase();
      
      // Check if source type is selected
      if (!powerPlantFilters.selectedSources.includes(source)) return false;
      
      // Check capacity filter
      const capacityStr = props.capacity || props['generator:output:electricity'] || '';
      if (capacityStr && powerPlantFilters.minCapacity > 0) {
        const capacity = parseFloat(capacityStr.toString().replace(/[^0-9.]/g, ''));
        if (!isNaN(capacity)) {
          if (capacity < powerPlantFilters.minCapacity) {
            return false;
          }
        }
      }
      
      return true;
    });
    
    return { type: 'FeatureCollection', features: filtered };
  }, [osmPowerPlants, powerPlantFilters]);
  
  // Filter power lines
  const filteredPowerLines = useMemo(() => {
    if (!osmPowerLines || !osmPowerLines.features) {
      return { type: 'FeatureCollection', features: [] };
    }
    
    const filtered = osmPowerLines.features.filter(f => {
      const props = f.properties;
      const cables = props.cables ? parseInt(props.cables) : 1;
      const type = (props.line || props.cable || 'line').toLowerCase();
      
      // Check voltage filter
      const voltageStr = props.voltage || '';
      if (voltageStr) {
        let voltage = parseFloat(voltageStr.toString().replace(/[^0-9.]/g, ''));
        // Convert from volts to kilovolts if needed
        if (!isNaN(voltage)) {
          if (voltage > 1000) voltage = voltage / 1000;
          if (voltage < powerLineFilters.minVoltage || voltage > powerLineFilters.maxVoltage) {
            return false;
          }
        }
      }
      
      // Check cables filter
      if (powerLineFilters.minCables && cables < powerLineFilters.minCables) return false;
      
      // Check line type
      if (type === 'underground' && powerLineFilters.showUnderground === false) return false;
      if (type === 'overhead' && powerLineFilters.showOverhead === false) return false;
      
      return true;
    });
    
    return { type: 'FeatureCollection', features: filtered };
  }, [osmPowerLines, powerLineFilters]);
  
  return {
    filteredSubstations,
    filteredPowerPlants,
    filteredPowerLines
  };
};
