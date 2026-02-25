import { useCallback } from 'react';

/**
 * Custom hook for handling map click interactions
 * Handles creating new locations, selecting locations, and creating links
 */
export const useMapInteractions = (mode, addLocation, handleLocationClickForLink, tempLocations) => {
  
  // Handle map click for adding new locations or selecting
  const handleMapClick = useCallback((info, event, callbacks = {}) => {
    const { onLocationCreate, onObjectSelect } = callbacks;
    
    // If clicking on an existing object, let the layer handle it
    if (info.object) {
      if (onObjectSelect) {
        onObjectSelect(info.object);
      }
      return;
    }
    
    // Only allow left-click (button 0) to create locations
    if (event?.srcEvent?.button !== 0) {
      return; // Ignore right-click and middle-click
    }
    
    // Only create points when explicitly in single or multiple mode
    if (mode !== 'single' && mode !== 'multiple') {
      return;
    }
    
    const { coordinate } = info;
    if (coordinate) {
      const newLocation = {
        id: Date.now(),
        latitude: coordinate[1],
        longitude: coordinate[0],
        name: `Location ${(tempLocations?.length || 0) + 1}`,
        techs: {},
        isNode: false
      };
      
      if (onLocationCreate) {
        onLocationCreate(newLocation);
      } else {
        addLocation(newLocation);
      }
    }
  }, [mode, addLocation, tempLocations]);
  
  // Handle location click for link creation
  const handleLocationClick = useCallback((location, callbacks = {}) => {
    const { onLinkCreated, onLocationSelected } = callbacks;
    
    if (mode === 'link') {
      const link = handleLocationClickForLink(location);
      if (link && onLinkCreated) {
        onLinkCreated(link);
      }
    } else {
      if (onLocationSelected) {
        onLocationSelected(location);
      }
    }
  }, [mode, handleLocationClickForLink]);
  
  return {
    handleMapClick,
    handleLocationClick
  };
};
