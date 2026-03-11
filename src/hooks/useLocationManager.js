import { useState, useCallback } from 'react';

/**
 * Custom hook for managing locations and links in the energy system model
 */
export const useLocationManager = () => {
  const [tempLocations, setTempLocations] = useState([]);
  const [tempLinks, setTempLinks] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [linkStart, setLinkStart] = useState(null);
  
  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }, []);
  
  // Add a new location
  const addLocation = useCallback((location) => {
    setTempLocations(prev => [...prev, location]);
  }, []);
  
  // Remove a location
  const removeLocation = useCallback((id) => {
    setTempLocations(prev => prev.filter(loc => loc.id !== id));
    setTempLinks(prev => prev.filter(link => link.from !== id && link.to !== id));
  }, []);
  
  // Update a location
  const updateLocation = useCallback((id, updates) => {
    setTempLocations(prev => prev.map(loc => 
      loc.id === id ? { ...loc, ...updates } : loc
    ));
  }, []);
  
  // Add a link between two locations
  // options: { linkType?: string, carrier?: string }
  const addLink = useCallback((fromLocation, toLocation, options = {}) => {
    const distance = calculateDistance(
      fromLocation.latitude,
      fromLocation.longitude,
      toLocation.latitude,
      toLocation.longitude
    );
    
    const newLink = {
      id: Date.now(),
      from: fromLocation.id,
      to: toLocation.id,
      fromName: fromLocation.name,
      toName: toLocation.name,
      distance: distance,
      linkType: options.linkType || null,
      carrier: options.carrier || null,
    };
    
    setTempLinks(prev => [...prev, newLink]);
    return newLink;
  }, [calculateDistance]);
  
  // Remove a link
  const removeLink = useCallback((id) => {
    setTempLinks(prev => prev.filter(link => link.id !== id));
  }, []);

  // Update a link's properties
  const updateLink = useCallback((id, updates) => {
    setTempLinks(prev => prev.map(link =>
      link.id === id ? { ...link, ...updates } : link
    ));
  }, []);
  
  // Handle link creation mode
  // options forwarded to addLink: { linkType?, carrier? }
  const handleLocationClickForLink = useCallback((location, options = {}) => {
    if (!linkStart) {
      setLinkStart(location);
      return null;
    } else {
      if (linkStart.id !== location.id) {
        const link = addLink(linkStart, location, options);
        setLinkStart(null);
        return link;
      }
      setLinkStart(null);
      return null;
    }
  }, [linkStart, addLink]);
  
  // Import multiple locations at once
  const importMultipleLocations = useCallback((locations) => {
    setTempLocations(prev => [...prev, ...locations]);
  }, []);

  // Import multiple links at once
  const importMultipleLinks = useCallback((links) => {
    setTempLinks(prev => [...prev, ...links]);
  }, []);

  // Clear all locations and links
  const clearAll = useCallback(() => {
    setTempLocations([]);
    setTempLinks([]);
    setSelectedLocation(null);
    setLinkStart(null);
  }, []);
  
  return {
    // State
    tempLocations,
    tempLinks,
    updateLink,
    selectedLocation,
    linkStart,
    
    // Actions
    addLocation,
    removeLocation,
    updateLocation,
    addLink,
    removeLink,
    removeLink,
    handleLocationClickForLink,
    setSelectedLocation,
    setLinkStart,
    clearAll,
    calculateDistance,
    importMultipleLocations,
    importMultipleLinks
  };
};
