import { useState, useCallback } from 'react';

/**
 * Custom hook for managing polyline mode
 * Creates connected locations automatically with links
 */
export const usePolylineMode = (locationManager, showNotification) => {
  const [lastCreatedLocation, setLastCreatedLocation] = useState(null);
  
  /**
   * Handle map click in polyline mode
   * Creates a new location and automatically links it to the previous one
   */
  const handlePolylineClick = useCallback((coordinate) => {
    const newLocationWithId = {
      id: Date.now(),
      latitude: coordinate[1],
      longitude: coordinate[0],
      name: `Point ${(locationManager.tempLocations?.length || 0) + 1}`,
      techs: {},
      isNode: false
    };
    
    // Add the location immediately
    locationManager.addLocation(newLocationWithId);
    showNotification(`Point created: ${newLocationWithId.name}`, 'success');
    
    // If there's a previous location, create a link between them
    if (lastCreatedLocation) {
      // Use the locationManager's addLink which expects two location objects
      locationManager.addLink(lastCreatedLocation, newLocationWithId);
      showNotification(`Link created: ${lastCreatedLocation.name} → ${newLocationWithId.name}`, 'info');
    }
    
    // Remember this location for the next click
    setLastCreatedLocation(newLocationWithId);
  }, [locationManager, lastCreatedLocation, showNotification]);
  
  /**
   * Reset polyline mode
   */
  const resetPolyline = useCallback(() => {
    setLastCreatedLocation(null);
  }, []);
  
  return {
    lastCreatedLocation,
    handlePolylineClick,
    resetPolyline
  };
};
