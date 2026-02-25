import { useState, useCallback, useMemo } from 'react';
import { TECH_TEMPLATES } from '../components/TechnologiesData';

/**
 * Custom hook for managing technologies in locations
 * Handles adding, removing, and configuring technologies
 */
export const useTechnologyManager = () => {
  const [dialogTechs, setDialogTechs] = useState([]);
  const [editingConstraints, setEditingConstraints] = useState({});
  const [editingEssentials, setEditingEssentials] = useState({});
  const [editingCosts, setEditingCosts] = useState({});
  
  // Create a flat techMap from TECH_TEMPLATES for easy lookup
  const techMap = useMemo(() => {
    const map = {};
    Object.values(TECH_TEMPLATES).forEach(categoryArray => {
      if (Array.isArray(categoryArray)) {
        categoryArray.forEach(tech => {
          map[tech.name] = {
            ...tech,
            defaultEssentials: tech.essentials || {},
            defaultConstraints: tech.constraints || {},
            defaultCosts: tech.costs?.monetary || {}
          };
        });
      }
    });
    return map;
  }, []);
  
  // Add technology to location
  const addTechToLocation = useCallback((location, techName, updateLocation) => {
    if (location && !location.techs[techName]) {
      const techTemplate = techMap[techName];
      const updatedLocation = {
        ...location,
        techs: {
          ...location.techs,
          [techName]: {
            essentials: { ...techTemplate.defaultEssentials },
            constraints: { ...techTemplate.defaultConstraints },
            costs: { monetary: { ...techTemplate.defaultCosts } }
          }
        }
      };
      
      if (updateLocation) {
        updateLocation(updatedLocation.id, { techs: updatedLocation.techs });
      }
      
      return updatedLocation;
    }
    return location;
  }, []);
  
  // Add technology to dialog (for new location creation)
  const addTechToDialog = useCallback((techName) => {
    if (!dialogTechs.includes(techName)) {
      setDialogTechs(prev => [...prev, techName]);
      
      const techTemplate = techMap[techName];
      setEditingConstraints(prev => ({
        ...prev,
        [techName]: { ...techTemplate.defaultConstraints }
      }));
      setEditingEssentials(prev => ({
        ...prev,
        [techName]: { ...techTemplate.defaultEssentials }
      }));
      setEditingCosts(prev => ({
        ...prev,
        [techName]: { ...techTemplate.defaultCosts }
      }));
    }
  }, [dialogTechs]);
  
  // Remove technology from dialog
  const removeTechFromDialog = useCallback((techName) => {
    setDialogTechs(prev => prev.filter(t => t !== techName));
    setEditingConstraints(prev => {
      const newConstraints = { ...prev };
      delete newConstraints[techName];
      return newConstraints;
    });
    setEditingEssentials(prev => {
      const newEssentials = { ...prev };
      delete newEssentials[techName];
      return newEssentials;
    });
    setEditingCosts(prev => {
      const newCosts = { ...prev };
      delete newCosts[techName];
      return newCosts;
    });
  }, []);
  
  // Update constraint for a technology
  const updateConstraint = useCallback((techName, constraintKey, value) => {
    setEditingConstraints(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [constraintKey]: value
      }
    }));
  }, []);
  
  // Update essential for a technology
  const updateEssential = useCallback((techName, essentialKey, value) => {
    setEditingEssentials(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [essentialKey]: value
      }
    }));
  }, []);
  
  // Update cost for a technology
  const updateCost = useCallback((techName, costKey, value) => {
    setEditingCosts(prev => ({
      ...prev,
      [techName]: {
        ...(prev[techName] || {}),
        [costKey]: value
      }
    }));
  }, []);
  
  // Reset all tech data
  const resetTechData = useCallback(() => {
    setDialogTechs([]);
    setEditingConstraints({});
    setEditingEssentials({});
    setEditingCosts({});
  }, []);
  
  // Load existing tech data from location
  const loadTechDataFromLocation = useCallback((location) => {
    if (location && location.techs) {
      setDialogTechs(Object.keys(location.techs));
      
      const constraints = {};
      const essentials = {};
      const costs = {};
      
      Object.entries(location.techs).forEach(([techName, techData]) => {
        if (techData.constraints) constraints[techName] = techData.constraints;
        if (techData.essentials) essentials[techName] = techData.essentials;
        if (techData.costs?.monetary) costs[techName] = techData.costs.monetary;
      });
      
      setEditingConstraints(constraints);
      setEditingEssentials(essentials);
      setEditingCosts(costs);
    }
  }, []);
  
  return {
    dialogTechs,
    editingConstraints,
    editingEssentials,
    editingCosts,
    addTechToLocation,
    addTechToDialog,
    removeTechFromDialog,
    updateConstraint,
    updateEssential,
    updateCost,
    resetTechData,
    loadTechDataFromLocation
  };
};
