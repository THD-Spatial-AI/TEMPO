// CSV import wizard: owns the multi-step wizardData and every file-parsing +
// model-building handler (completeWizard) for creating a model from CSV/GIS
// uploads. Extracted from Models.jsx so the ~600 lines of import logic live in
// one testable unit; the <CSVImportWizard> modal consumes what this returns.
import { useState } from 'react';
import Papa from 'papaparse';

export function useCsvImportWizard({ createModel, setOverrides, setScenarios, showNotification, setShowCSVWizard }) {
  const [wizardData, setWizardData] = useState({
    modelName: '',
    description: '',
    locationsFile: null,
    locationsData: null,
    linksFile: null,
    linksData: null,
    demandFile: null,
    demandData: null,
    configFile: null,
    parsedConfig: null,
    // New Chile model structure
    technologiesFile: null,
    technologiesData: null,
    scenariosFile: null,
    scenariosData: null,
    resourceFiles: [], // Array of {name, file, data, type: 'pv'|'wind'|'demand'}
  });
  // CSV Wizard Functions
  const handleLocationsFileUpload = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        console.log('Locations CSV parsed:', {
          rows: results.data.length,
          columns: Object.keys(results.data[0] || {}),
          sample: results.data[0]
        });
        
        // Validate first row has required columns
        const firstRow = results.data[0];
        if (firstRow) {
          const hasLat = firstRow.lat !== undefined || firstRow.latitude !== undefined || firstRow.Latitude !== undefined;
          const hasLon = firstRow.lon !== undefined || firstRow.longitude !== undefined || firstRow.Longitude !== undefined;
          
          if (!hasLat || !hasLon) {
            showNotification('Warning: Locations file missing lat/lon columns. Found columns: ' + Object.keys(firstRow).join(', '), 'error');
            console.error('Missing coordinates in CSV. Columns found:', Object.keys(firstRow));
          }
        }
        
        setWizardData(prev => ({
          ...prev,
          locationsFile: file,
          locationsData: results.data
        }));
        showNotification(`Locations file loaded: ${results.data.length} rows`, 'success');
      },
      error: (error) => {
        showNotification(`Error parsing locations file: ${error.message}`, 'error');
      }
    });
  };

  const handleLinksFileUpload = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        setWizardData(prev => ({
          ...prev,
          linksFile: file,
          linksData: results.data
        }));
        showNotification(`Links file loaded: ${results.data.length} rows`, 'success');
      },
      error: (error) => {
        showNotification(`Error parsing links file: ${error.message}`, 'error');
      }
    });
  };

  const handleDemandFileUpload = (file) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        setWizardData(prev => ({
          ...prev,
          demandFile: file,
          demandData: results.data
        }));
        showNotification(`Demand file loaded: ${results.data.length} rows`, 'success');
      },
      error: (error) => {
        showNotification(`Error parsing demand file: ${error.message}`, 'error');
      }
    });
  };

  const handleConfigFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target.result);
        setWizardData(prev => ({ 
          ...prev, 
          configFile: file, 
          parsedConfig: config 
        }));
        showNotification('Configuration file loaded successfully', 'success');
      } catch (error) {
        showNotification(`Error parsing JSON file: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  // New handlers for Chile model structure
  const handleTechnologiesFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const technologies = JSON.parse(e.target.result);
        setWizardData(prev => ({ 
          ...prev, 
          technologiesFile: file, 
          technologiesData: technologies 
        }));
        showNotification(`Technologies loaded: ${Object.keys(technologies).length} technologies`, 'success');
      } catch (error) {
        showNotification(`Error parsing technologies JSON: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleScenariosFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const scenarios = JSON.parse(e.target.result);
        setWizardData(prev => ({ 
          ...prev, 
          scenariosFile: file, 
          scenariosData: scenarios 
        }));
        showNotification('Scenarios loaded successfully', 'success');
      } catch (error) {
        showNotification(`Error parsing scenarios JSON: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleResourceFileUpload = (file, resourceType) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        setWizardData(prev => {
          const newResourceFiles = [...prev.resourceFiles];
          // Check if file already exists and replace it
          const existingIndex = newResourceFiles.findIndex(rf => rf.name === file.name);
          const resourceFileData = {
            name: file.name,
            file: file,
            data: results.data,
            type: resourceType,
            columns: Object.keys(results.data[0] || {})
          };
          
          if (existingIndex >= 0) {
            newResourceFiles[existingIndex] = resourceFileData;
          } else {
            newResourceFiles.push(resourceFileData);
          }
          
          return {
            ...prev,
            resourceFiles: newResourceFiles
          };
        });
        showNotification(`Resource file loaded: ${file.name} (${results.data.length} rows, ${Object.keys(results.data[0] || {}).length} columns)`, 'success');
      },
      error: (error) => {
        showNotification(`Error parsing resource file: ${error.message}`, 'error');
      }
    });
  };

  const removeResourceFile = (fileName) => {
    setWizardData(prev => ({
      ...prev,
      resourceFiles: prev.resourceFiles.filter(rf => rf.name !== fileName)
    }));
    showNotification(`Removed ${fileName}`, 'info');
  };
  const completeWizard = () => {
    if (!wizardData.modelName.trim()) {
      showNotification('Please enter a model name', 'error');
      return;
    }

    if (!wizardData.locationsData || wizardData.locationsData.length === 0) {
      showNotification('Please upload a locations file', 'error');
      return;
    }

    if (!wizardData.linksData || wizardData.linksData.length === 0) {
      showNotification('Please upload a links file', 'error');
      return;
    }

    // Process locations and links similar to template loading
    const locationsData = wizardData.locationsData;
    const linksData = wizardData.linksData;

    console.log('Processing locations data:', locationsData.slice(0, 3)); // Debug

    // Parse locations
    let locations = locationsData.map((loc, idx) => {
      // Extract coordinates with fallbacks
      const lat = parseFloat(loc.lat || loc.latitude || loc.Latitude || loc.LAT);
      const lon = parseFloat(loc.lon || loc.longitude || loc.Longitude || loc.LON);

      // Validate coordinates
      if (isNaN(lat) || isNaN(lon)) {
        console.error(`Invalid coordinates for location ${idx}:`, loc);
        showNotification(`Location "${loc.name}" has invalid coordinates. Row ${idx + 2} in CSV.`, 'error');
        return null; // Skip invalid locations
      }

      const location = {
        name: loc.name || loc.Name || loc.location_name || `Location_${idx}`,
        latitude: lat,  // Map component expects 'latitude'
        longitude: lon, // Map component expects 'longitude'
        lat: lat,       // Keep for backward compatibility
        lon: lon,       // Keep for backward compatibility
        type: loc.type || loc.Type || 'site',
        demand_types: (loc.demand_types || loc.demand_type || '').toString().trim(),
        resource_files: (loc.resource_files || loc.resource_file || '').toString().trim(),
        techs: {}
      };

      // Chile format: single 'techs' column with tech name
      if (loc.techs) {
        const techName = loc.techs.toString().trim();
        if (techName && techName !== '0' && techName !== '') {
          location.techs[techName] = {
            constraints: {}
          };
          
          // Add capacity if available
          if (loc.energy_cap_max && parseFloat(loc.energy_cap_max) > 0) {
            location.techs[techName].constraints.energy_cap_max = parseFloat(loc.energy_cap_max);
          }
        }
      }

      // Alternative format: tech_[name] columns
      Object.keys(loc).forEach(key => {
        if (key.startsWith('tech_') || key.startsWith('Tech_')) {
          const techName = key.replace(/^tech_/i, '');
          if (loc[key]) {
            location.techs[techName] = {
              constraints: {}
            };
            
            // Check for capacity column
            const capKey = `${techName}_capacity` || `${techName}_cap`;
            if (loc[capKey]) {
              location.techs[techName].constraints.energy_cap_max = parseFloat(loc[capKey]);
            }
          }
        }
      });

      if (idx < 3) {
        console.log('Parsed location:', location.name, 'coords:', [lat, lon], 'techs:', Object.keys(location.techs));
      }

      return location;
    }).filter(loc => loc !== null); // Remove invalid locations

    console.log(`Successfully parsed ${locations.length} locations`);
    
    // Final validation - ensure no NaN coordinates
    const invalidLocs = locations.filter(loc => isNaN(loc.lat) || isNaN(loc.lon));
    if (invalidLocs.length > 0) {
      console.error('Found locations with invalid coordinates:', invalidLocs);
      showNotification(`Error: ${invalidLocs.length} locations have invalid coordinates. Check console for details.`, 'error');
      return;
    }

    console.log('Processing links data:', linksData.slice(0, 3)); // Debug

    // Parse links
    const links = linksData.map(link => ({
      from: link.from || link.From || link.source || link.Source,
      to: link.to || link.To || link.target || link.Target,
      distance: parseFloat(link.distance || link.distance_km || link.Distance || 0),
      capacity: parseFloat(link.capacity || link.Capacity || link.energy_cap_max || 0),
      tech: link.tech || link.Tech || 'ac_transmission'
    }));

    // Process demand data if provided and link to locations
    let timeSeriesData = [];
    const demandByLocation = {};
    
    if (wizardData.demandData && wizardData.demandData.length > 0) {
      // First timestep has columns: date, [substation names...]
      const firstRow = wizardData.demandData[0];
      const substationColumns = Object.keys(firstRow).filter(col => 
        col !== 'date' && col !== 'Date' && col !== 'DATE' && col !== 'timestamp'
      );
      
      console.log('Processing demand data for substations:', substationColumns);
      
      // Calculate totals for each substation
      substationColumns.forEach(substationName => {
        const values = wizardData.demandData
          .map(row => Math.abs(parseFloat(row[substationName]) || 0)) // Use absolute value (demand is negative in files)
          .filter(v => !isNaN(v));
        
        if (values.length > 0) {
          // Values are in kW, sum of hourly kW = total kWh
          const totalKWh = values.reduce((sum, v) => sum + v, 0);
          const totalMWh = totalKWh / 1000; // Convert kWh to MWh
          const totalGWh = totalKWh / 1000000; // Convert kWh to GWh
          const avgKW = totalKWh / values.length; // Average power in kW
          const maxKW = Math.max(...values);
          const minKW = Math.min(...values);
          
          demandByLocation[substationName] = {
            totalMWh: totalMWh.toFixed(2),
            totalGWh: totalGWh.toFixed(2),
            avgMW: (avgKW / 1000).toFixed(2),
            maxMW: (maxKW / 1000).toFixed(2),
            minMW: (minKW / 1000).toFixed(2),
            hours: values.length,
            file: wizardData.demandFile?.name || 'demand_data.csv',
            column: substationName,
            timeseries: values
          };
          
          console.log(`Demand for ${substationName}: ${totalMWh.toFixed(2)} MWh (${totalGWh.toFixed(2)} GWh)`);
        }
      });
      
      // Create a single timeseries entry for the demand file with all columns
      const demandStatistics = {};
      substationColumns.forEach(col => {
        if (demandByLocation[col]) {
          const values = wizardData.demandData
            .map(row => Math.abs(parseFloat(row[col]) || 0))
            .filter(v => !isNaN(v));
          demandStatistics[col] = {
            min: Math.min(...values),
            max: Math.max(...values),
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            sum: values.reduce((a, b) => a + b, 0)
          };
        }
      });
      
      timeSeriesData.push({
        id: `demand_${Date.now()}`,
        name: wizardData.demandFile?.name.replace('.csv', '') || 'demand_data',
        fileName: wizardData.demandFile?.name || 'demand_data.csv',
        uploadedAt: new Date().toISOString(),
        data: wizardData.demandData,
        columns: ['date', ...substationColumns],
        rowCount: wizardData.demandData.length,
        statistics: demandStatistics,
        modelId: null,  // Will be set after model creation
        modelName: wizardData.modelName,
        type: 'demand'
      });
    }

    // Extract technologies, overrides, and scenarios from config file
    let technologiesData = [];
    let overridesData = {};
    let scenariosData = {};

    // Process technologies.json file (Chile model format)
    if (wizardData.technologiesData) {
      technologiesData = Object.entries(wizardData.technologiesData).map(([techId, techData]) => ({
        name: techId,
        parent: techData.essentials?.parent || 'supply',
        description: techData.name || techId,
        essentials: {
          name: techData.name || techId,
          color: techData.color || techData.essentials?.color || '#5A5A5A',
          parent: techData.essentials?.parent || 'supply',
          carrier_out: techData.essentials?.carrier_out || techData.essentials?.carrier || 'electricity',
          carrier_in: techData.essentials?.carrier_in,
          carrier: techData.essentials?.carrier
        },
        constraints: techData.constraints || {},
        costs: techData.costs || { monetary: {} }
      }));
      
      console.log(`Loaded ${technologiesData.length} technologies from technologies.json`);
    }

    // Process scenarios.json file (Chile model format)
    if (wizardData.scenariosData) {
      overridesData = wizardData.scenariosData.overrides || {};
      scenariosData = wizardData.scenariosData.scenarios || wizardData.scenariosData;
      
      console.log('Loaded scenarios and overrides from scenarios.json:', {
        overrides: Object.keys(overridesData).length,
        scenarios: Object.keys(scenariosData).length
      });
    }

    // Process legacy config file format if provided
    if (wizardData.parsedConfig) {
      // Transform technologies to match Technologies component format
      if (wizardData.parsedConfig.technologies && Array.isArray(wizardData.parsedConfig.technologies)) {
        technologiesData = wizardData.parsedConfig.technologies.map(tech => ({
          name: tech.id || tech.name,
          parent: tech.parent || 'supply',
          description: tech.name || tech.description || '',
          essentials: {
            name: tech.name || tech.id,
            color: tech.color || '#5A5A5A',
            parent: tech.parent || 'supply',
            carrier_out: tech.carrier_out || tech.carrier || 'electricity',
            carrier_in: tech.carrier_in,
            carrier: tech.carrier
          },
          constraints: tech.constraints || {},
          costs: tech.costs || { monetary: {} }
        }));
      }
      
      overridesData = wizardData.parsedConfig.overrides || overridesData;
      scenariosData = wizardData.parsedConfig.scenarios || scenariosData;
      
      console.log('Extracted from config file:', {
        technologies: technologiesData.length,
        overrides: Object.keys(overridesData).length,
        scenarios: Object.keys(scenariosData).length
      });
    }

    // Process resource files (Chile model format: resource_pv.csv, resource_wind.csv, etc.)
    const resourceDataByLocation = {};
    wizardData.resourceFiles.forEach(resourceFile => {
      if (resourceFile.data && resourceFile.data.length > 0) {
        const firstRow = resourceFile.data[0];
        const locationColumns = Object.keys(firstRow).filter(col => 
          col !== 'date' && col !== 'Date' && col !== 'DATE' && col !== 'timestamp'
        );
        
        console.log(`Processing resource file ${resourceFile.name} (${resourceFile.type}):`, locationColumns.length, 'locations');
        
        // Calculate statistics for each location column
        const resourceStatistics = {};
        locationColumns.forEach(locationName => {
          if (!resourceDataByLocation[locationName]) {
            resourceDataByLocation[locationName] = {};
          }
          
          const values = resourceFile.data
            .map(row => parseFloat(row[locationName]) || 0)
            .filter(v => !isNaN(v));
          
          if (values.length > 0) {
            const avgCapacityFactor = values.reduce((sum, v) => sum + v, 0) / values.length;
            const maxCapacityFactor = Math.max(...values);
            const minCapacityFactor = Math.min(...values);
            
            resourceDataByLocation[locationName][resourceFile.type] = {
              fileName: resourceFile.name,
              avgCapacityFactor: avgCapacityFactor.toFixed(3),
              maxCapacityFactor: maxCapacityFactor.toFixed(3),
              minCapacityFactor: minCapacityFactor.toFixed(3),
              hours: values.length,
              type: resourceFile.type,
              timeseries: values
            };
            
            // Add statistics for TimeSeries component
            resourceStatistics[locationName] = {
              min: minCapacityFactor,
              max: maxCapacityFactor,
              mean: avgCapacityFactor,
              sum: values.reduce((a, b) => a + b, 0)
            };
          }
        });
        
        // Add to timeseries with proper structure for TimeSeries.jsx component
        timeSeriesData.push({
          id: `resource_${resourceFile.type}_${Date.now()}_${Math.random()}`,
          name: resourceFile.name.replace('.csv', ''),
          fileName: resourceFile.name,
          uploadedAt: new Date().toISOString(),
          data: resourceFile.data,
          columns: ['date', ...locationColumns],
          rowCount: resourceFile.data.length,
          statistics: resourceStatistics,
          modelId: null,  // Will be set after model creation
          modelName: wizardData.modelName,
          type: `resource_${resourceFile.type}`
        });
      }
    });

    // Add resource data and demand profile data to locations
    locations = locations.map(loc => {
      const updatedLoc = { ...loc };
      
      // Add demand profile if exists
      if (demandByLocation[loc.name]) {
        updatedLoc.demandProfile = demandByLocation[loc.name];
        updatedLoc.totalDemandMWh = demandByLocation[loc.name].totalMWh;
      }
      
      // Add resource data if exists (PV, wind, etc.)
      if (resourceDataByLocation[loc.name]) {
        updatedLoc.resourceData = resourceDataByLocation[loc.name];
        
        // Add summary info to location
        Object.entries(resourceDataByLocation[loc.name]).forEach(([resourceType, resourceInfo]) => {
          updatedLoc[`${resourceType}CapacityFactor`] = resourceInfo.avgCapacityFactor;
        });
      }
      
      return updatedLoc;
    });
    
    const locationsWithDemand = locations.filter(loc => loc.demandProfile).length;
    const locationsWithResources = locations.filter(loc => loc.resourceData).length;
    console.log('Creating model with:', {
      locations: locations.length,
      locationsWithDemand: locationsWithDemand,
      links: links.length,
      timeSeries: timeSeriesData.length,
      technologies: technologiesData.length,
      overrides: Object.keys(overridesData).length,
      scenarios: Object.keys(scenariosData).length
    });

    // Create the model with correct parameter order:
    // createModel(name, locationsData, linksData, parametersData, technologiesData, timeSeriesData, templateMetadata, overridesData, scenariosData)
    createModel(
      wizardData.modelName,
      locations,
      links,
      [], // parametersData
      technologiesData, // technologiesData from config
      timeSeriesData, // timeSeriesData
      {
        description: wizardData.description,
        template: false,
        config: wizardData.parsedConfig
      },
      overridesData, // overrides from config
      scenariosData // scenarios from config
    );

    // Set current state for overrides and scenarios
    if (Object.keys(overridesData).length > 0 || Object.keys(scenariosData).length > 0) {
      setOverrides(overridesData);
      setScenarios(scenariosData);
    }

    // Reset wizard
    setShowCSVWizard(false);
    setWizardData({
      modelName: '',
      description: '',
      locationsFile: null,
      locationsData: null,
      linksFile: null,
      linksData: null,
      demandFile: null,
      demandData: null,
      configFile: null,
      parsedConfig: null
    });

    showNotification('Model created successfully!', 'success');
  };

  // Download JSON and CSV templates
  const downloadTemplate = (type) => {
    let content = '';
    let filename = '';
    let mimeType = 'application/json';

    if (type === 'config') {
      const configTemplate = {
        locations: {
          "Berlin": {
            coordinates: { lat: 52.52, lon: 13.405 },
            techs: {
              demand_power: {
                constraints: {
                  resource: "file=demand_berlin.csv"
                }
              },
              solar_pv: {
                constraints: {
                  resource: "file=solar_berlin.csv",
                  energy_cap_max: 1000
                }
              }
            }
          },
          "Munich": {
            coordinates: { lat: 48.1351, lon: 11.582 },
            techs: {
              demand_power: {
                constraints: {
                  resource: "file=demand_munich.csv"
                }
              },
              gas_ccgt: {
                constraints: {
                  energy_cap_max: 500
                }
              }
            }
          }
        },
        links: {
          "Berlin,Munich": {
            techs: {
              ac_transmission: {
                constraints: {
                  energy_cap_max: 2000
                },
                distance: 505
              }
            }
          }
        },
        tech_groups: {
          demand_power: {
            essentials: {
              name: "Power demand",
              carrier: "electricity",
              parent: "demand"
            }
          },
          solar_pv: {
            essentials: {
              name: "Solar PV",
              carrier_out: "electricity",
              parent: "supply"
            },
            constraints: {
              resource: "inf",
              energy_eff: 0.2
            }
          }
        }
      };
      content = JSON.stringify(configTemplate, null, 2);
      filename = 'model_config_template.json';
    } else if (type === 'demand') {
      content = `timestep,demand\n2024-01-01 00:00:00,450\n2024-01-01 01:00:00,420\n2024-01-01 02:00:00,380\n2024-01-01 03:00:00,360\n2024-01-01 04:00:00,350`;
      filename = 'demand_template.csv';
      mimeType = 'text/csv';
    } else if (type === 'solar') {
      content = `timestep,resource\n2024-01-01 00:00:00,0\n2024-01-01 01:00:00,0\n2024-01-01 06:00:00,0.2\n2024-01-01 12:00:00,0.8\n2024-01-01 18:00:00,0.1`;
      filename = 'solar_resource_template.csv';
      mimeType = 'text/csv';
    } else if (type === 'wind') {
      content = `timestep,resource\n2024-01-01 00:00:00,0.6\n2024-01-01 01:00:00,0.7\n2024-01-01 02:00:00,0.5\n2024-01-01 03:00:00,0.8\n2024-01-01 04:00:00,0.9`;
      filename = 'wind_resource_template.csv';
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    wizardData, setWizardData, completeWizard, downloadTemplate, handleLocationsFileUpload, handleLinksFileUpload, handleDemandFileUpload, handleConfigFileUpload, handleTechnologiesFileUpload, handleScenariosFileUpload, handleResourceFileUpload, removeResourceFile,
  };
}
