import React, { useState } from 'react';
import { FiFolder, FiTrash2, FiEdit2, FiCheck, FiX, FiPlus, FiDownload, FiUpload, FiMap, FiZap, FiInfo, FiEye, FiChevronDown, FiChevronRight, FiCpu, FiDatabase, FiActivity, FiLayers, FiUploadCloud } from 'react-icons/fi';
import Papa from 'papaparse';
import { useData } from '../context/DataContext';
import CSVUploader from './CSVUploader';

const Models = () => {
  const { models, currentModelId, loadModel, deleteModel, renameModel, createModel, technologies, setOverrides, setScenarios, showNotification, getCurrentModel } = useData();
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [uploadingFilesForModel, setUploadingFilesForModel] = useState(null);
  const [updateFiles, setUpdateFiles] = useState({
    locations: null,
    links: null,
    demand: null,
    config: null
  });
  const [showCSVWizard, setShowCSVWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
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
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);

  const currentModel = models.find((m) => m.id === currentModelId);

  // Template definitions with detailed metadata
  const TEMPLATE_MODELS = [
    {
      id: 'german',
      name: 'German Energy System',
      country: '🇩🇪 Germany',
      description: 'Comprehensive model of German energy infrastructure with 10 major cities and 2 transmission nodes. Features Energiewende transition with high renewable penetration.',
      locations: 12,
      sites: 10,
      nodes: 2,
      links: 12,
      technologies: ['Solar PV', 'Wind Onshore', 'Wind Offshore', 'Gas CCGT', 'Coal', 'Biomass', 'Battery Storage', 'AC Transmission', 'HVDC Transmission'],
      locationsFile: 'german_energy_system/locations.csv',
      linksFile: 'german_energy_system/links.csv',
      demandFile: 'german_energy_system/timeseries_data/german_demand_2024.csv',
      technologiesFile: 'german_energy_system/technologies.json',
      scenariosFile: 'german_energy_system/scenarios.json',
      statisticsFile: 'german_energy_system/statistics.json',
      color: 'blue',
      features: ['Energiewende Modeling', 'High Renewable Mix', 'Coal Phase-out', 'Demand Profiles', 'Storage Integration', 'Grid Expansion Planning']
    },
    {
      id: 'european',
      name: 'European Network',
      country: '🇪🇺 Europe',
      description: 'Pan-European energy network with 12 major cities and 3 transmission hubs. Includes complete technology mix, demand data, and cross-border transmission infrastructure.',
      locations: 15,
      sites: 12,
      nodes: 3,
      links: 18,
      technologies: ['Solar PV', 'Wind Onshore', 'Wind Offshore', 'Nuclear', 'Hydro', 'Gas CCGT', 'Coal', 'Biomass', 'Battery Storage', 'AC Transmission', 'HVDC Transmission'],
      locationsFile: 'european_network/locations.csv',
      linksFile: 'european_network/links.csv',
      demandFile: 'european_network/timeseries_data/european_demand_2024.csv',
      technologiesFile: 'european_network/technologies.json',
      scenariosFile: 'european_network/scenarios.json',
      statisticsFile: 'european_network/statistics.json',
      color: 'green',
      features: ['Multi-Country System', 'Complete Technology Mix', 'Cross-Border Transmission', 'Demand Profiles', 'Pre-configured Scenarios', 'Multiple Voltage Levels']
    },
    {
      id: 'chile',
      name: 'Chilean Energy Grid',
      country: '🇨🇱 Chile',
      description: 'Complete Chilean energy system with 2,241 locations (substations and power plants) and 2,319 transmission links. Includes demand data, solar PV and wind resource timeseries for 2024. Multi-voltage transmission network (11-500kV) with technologies, scenarios, and statistics.',
      locations: 2241,
      sites: 1081,
      substations: 1048,
      nodes: 112,
      links: 2319,
      technologies: ['Solar PV', 'Wind', 'Hydro (Reservoir & Run-of-River)', 'Geothermal', 'CSP', 'Biogas', 'Biomass', 'Coal', 'Gas', 'Oil', 'Diesel', 'Battery Storage', 'H2 Storage', 'Electrolyzer', 'Fuel Cell', 'Transmission (11-500kV)'],
      locationsFile: 'chilean_energy_grid/locations.csv',
      linksFile: 'chilean_energy_grid/links.csv',
      demandFile: 'chilean_energy_grid/timeseries_data/total_demand_2024.csv',
      resourceFiles: [
        { name: 'Solar PV 2024', file: 'chilean_energy_grid/timeseries_data/resource_pv_2024.csv', type: 'pv' },
        { name: 'Wind 2024', file: 'chilean_energy_grid/timeseries_data/resource_wind_2024.csv', type: 'wind' }
      ],
      technologiesFile: 'chilean_energy_grid/technologies.json',
      scenariosFile: 'chilean_energy_grid/scenarios.json',
      statisticsFile: 'chilean_energy_grid/statistics.json',
      color: 'purple',
      features: ['Complete Technology Suite', 'Real Demand & Resource Data 2024', 'Multi-Voltage Transmission', 'Pre-configured Scenarios', 'Detailed Statistics', 'Real Grid Topology']
    }
  ];

  const handleRename = (modelId) => {
    if (editName.trim()) {
      renameModel(modelId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleDelete = (modelId) => {
    if (window.confirm('Are you sure you want to delete this model?')) {
      deleteModel(modelId);
    }
  };

  const downloadTemplateFile = async (filename, displayName) => {
    try {
      const response = await fetch(`/templates/${filename}`);
      if (!response.ok) {
        showNotification(`File ${filename} not found in templates folder`, 'error');
        return;
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      showNotification(`Downloaded ${displayName}`, 'success');
    } catch (error) {
      showNotification(`Error downloading ${displayName}: ${error.message}`, 'error');
    }
  };

  const downloadAllTemplateFiles = async (template) => {
    const files = [
      { file: template.locationsFile, name: 'Locations File' },
      { file: template.linksFile, name: 'Links File' }
    ];
    
    if (template.demandFile) {
      files.push({ file: template.demandFile, name: 'Demand Timeseries' });
    }

    if (template.resourceFiles) {
      template.resourceFiles.forEach(rf => {
        files.push({ file: rf.file, name: rf.name });
      });
    }

    if (template.technologiesFile) {
      files.push({ file: template.technologiesFile, name: 'Technologies' });
    }

    if (template.scenariosFile) {
      files.push({ file: template.scenariosFile, name: 'Scenarios' });
    }

    if (template.statisticsFile) {
      files.push({ file: template.statisticsFile, name: 'Statistics' });
    }
    
    if (template.modelDataFile) {
      files.push({ file: template.modelDataFile, name: 'Model Configuration' });
    }

    let successCount = 0;
    for (const { file, name } of files) {
      try {
        await downloadTemplateFile(file, name);
        successCount++;
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.warn(`Failed to download ${name}:`, error);
      }
    }

    showNotification(`Downloaded ${successCount} of ${files.length} template files`, 'success');
  };

  const startEdit = (model) => {
    setEditingId(model.id);
    setEditName(model.name);
  };

  const handleFileUpdate = (modelId, fileType, file) => {
    setUpdateFiles(prev => ({ ...prev, [fileType]: file }));
  };

  const processModelUpdate = async (modelId) => {
    const model = models.find(m => m.id === modelId);
    if (!model) return;

    try {
      let updatedLocations = model.locations;
      let updatedLinks = model.links;
      let updatedTechnologies = model.technologies;
      let updatedOverrides = {};
      let updatedScenarios = {};

      // Process locations file if uploaded
      if (updateFiles.locations) {
        const locData = await new Promise((resolve) => {
          Papa.parse(updateFiles.locations, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => resolve(results.data)
          });
        });

        updatedLocations = locData.map((loc, idx) => {
          const lat = parseFloat(loc.lat || loc.latitude);
          const lon = parseFloat(loc.lon || loc.longitude);
          
          const location = {
            name: loc.name || `Location_${idx}`,
            latitude: lat,
            longitude: lon,
            lat: lat,
            lon: lon,
            type: loc.type || 'site',
            techs: {}
          };

          if (loc.techs) {
            const techName = loc.techs.toString().trim();
            if (techName && techName !== '0') {
              location.techs[techName] = { constraints: {} };
              if (loc.energy_cap_max) {
                location.techs[techName].constraints.energy_cap_max = parseFloat(loc.energy_cap_max);
              }
            }
          }

          return location;
        });
      }

      // Process links file if uploaded
      if (updateFiles.links) {
        const linkData = await new Promise((resolve) => {
          Papa.parse(updateFiles.links, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => resolve(results.data)
          });
        });

        updatedLinks = linkData.map(link => ({
          from: link.from || link.From,
          to: link.to || link.To,
          distance: parseFloat(link.distance || link.distance_km || 0),
          capacity: parseFloat(link.capacity || 0),
          tech: link.tech || 'ac_transmission'
        }));
      }

      // Process config file if uploaded
      if (updateFiles.config) {
        const configText = await updateFiles.config.text();
        const config = JSON.parse(configText);
        
        if (config.technologies) {
          updatedTechnologies = config.technologies.map(tech => ({
            name: tech.id || tech.name,
            parent: tech.parent || 'supply',
            description: tech.name || tech.description || '',
            essentials: {
              name: tech.name || tech.id,
              color: tech.color || '#5A5A5A',
              parent: tech.parent || 'supply',
              carrier_out: tech.carrier_out || 'electricity',
              carrier_in: tech.carrier_in,
              carrier: tech.carrier
            },
            constraints: tech.constraints || {},
            costs: tech.costs || { monetary: {} }
          }));
        }
        
        updatedOverrides = config.overrides || {};
        updatedScenarios = config.scenarios || {};
      }

      // Update the model in the models array
      const updatedModel = {
        ...model,
        locations: updatedLocations,
        links: updatedLinks,
        technologies: updatedTechnologies,
        overrides: updatedOverrides,
        scenarios: updatedScenarios,
        updatedAt: new Date().toISOString()
      };

      // Update through DataContext
      const updatedModels = models.map(m => m.id === modelId ? updatedModel : m);
      showNotification(`Model "${model.name}" updated successfully!`, 'success');
      
      // Reset upload state
      setUploadingFilesForModel(null);
      setUpdateFiles({ locations: null, links: null, demand: null, config: null });

      // If this is the active model, reload it
      if (currentModelId === modelId) {
        loadModel(modelId);
      }
    } catch (error) {
      console.error('Error updating model:', error);
      showNotification(`Error updating model: ${error.message}`, 'error');
    }
  };

  const loadTemplateModel = async (template) => {
    try {
      const locationsResponse = await fetch(`/templates/${template.locationsFile}`);
      const linksResponse = await fetch(`/templates/${template.linksFile}`);

      if (!locationsResponse.ok || !linksResponse.ok) {
        throw new Error('Template files not found');
      }

      const locationsText = await locationsResponse.text();
      const linksText = await linksResponse.text();

      const locationsData = Papa.parse(locationsText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
      const linksData = Papa.parse(linksText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;

      // Load demand timeseries data if available
      let demandData = {};
      let demandTotals = {};
      if (template.demandFile) {
        try {
          const demandResponse = await fetch(`/templates/${template.demandFile}`);
          if (demandResponse.ok) {
            const demandText = await demandResponse.text();
            const parsedDemand = Papa.parse(demandText, { header: true, skipEmptyLines: true, dynamicTyping: true });
            
            // Calculate total consumption (sum of all hourly values) for each substation
            // Values are in kW, sum of hourly kW values = kWh (energy over time)
            const headers = parsedDemand.meta.fields.filter(f => f !== 'date');
            headers.forEach(substationName => {
              const timeseriesValues = [];
              const totalKWh = parsedDemand.data.reduce((sum, row) => {
                const value = Math.abs(row[substationName] || 0); // Use absolute value in kW (demand is negative in files)
                timeseriesValues.push(value);
                return sum + value; // Sum of hourly kW = total kWh
              }, 0);
              
              const totalMWh = totalKWh / 1000; // Convert kWh to MWh
              const totalGWh = totalKWh / 1000000; // Convert kWh to GWh
              const avgKW = totalKWh / parsedDemand.data.length; // Average power in kW
              const maxKW = Math.max(...timeseriesValues);
              const minKW = Math.min(...timeseriesValues);
              
              demandTotals[substationName] = totalMWh.toFixed(2);
              demandData[substationName] = {
                file: template.demandFile,
                column: substationName,
                totalMWh: totalMWh.toFixed(2),
                totalGWh: totalGWh.toFixed(2),
                avgMW: (avgKW / 1000).toFixed(2),
                maxMW: (maxKW / 1000).toFixed(2),
                minMW: (minKW / 1000).toFixed(2),
                hours: parsedDemand.data.length,
                timeseries: timeseriesValues,
                dates: parsedDemand.data.map(row => row.date)
              };
            });
          }
        } catch (error) {
          console.warn('Could not load demand timeseries:', error);
        }
      }

      // Load resource timeseries files (PV, Wind) if available
      let resourceData = {};
      if (template.resourceFiles && template.resourceFiles.length > 0) {
        for (const resourceFile of template.resourceFiles) {
          try {
            const resourceResponse = await fetch(`/templates/${resourceFile.file}`);
            if (resourceResponse.ok) {
              const resourceText = await resourceResponse.text();
              const parsedResource = Papa.parse(resourceText, { header: true, skipEmptyLines: true, dynamicTyping: true });
              
              const headers = parsedResource.meta.fields.filter(f => f !== 'date' && f !== 'Date');
              headers.forEach(locationName => {
                const timeseriesValues = [];
                const totalCapacityFactor = parsedResource.data.reduce((sum, row) => {
                  const value = parseFloat(row[locationName]) || 0;
                  timeseriesValues.push(value);
                  return sum + value;
                }, 0);
                
                const avgCapacityFactor = totalCapacityFactor / parsedResource.data.length;
                const maxCF = Math.max(...timeseriesValues);
                const minCF = Math.min(...timeseriesValues);
                
                const key = `${locationName}_${resourceFile.type}`;
                resourceData[key] = {
                  file: resourceFile.file,
                  column: locationName,
                  resourceType: resourceFile.type,
                  resourceName: resourceFile.name,
                  avgCapacityFactor: avgCapacityFactor.toFixed(4),
                  maxCF: maxCF.toFixed(4),
                  minCF: minCF.toFixed(4),
                  hours: parsedResource.data.length,
                  timeseries: timeseriesValues,
                  dates: parsedResource.data.map(row => row.date || row.Date)
                };
              });
            }
          } catch (error) {
            console.warn(`Could not load resource file ${resourceFile.name}:`, error);
          }
        }
      }

      // Load complete model data if available (for Chile model)
      let technologies = [];
      let modelOverrides = {};
      let modelScenarios = {};
      
      // Try loading technologies from separate file first
      if (template.technologiesFile) {
        try {
          const techResponse = await fetch(`/templates/${template.technologiesFile}`);
          if (techResponse.ok) {
            const techData = await techResponse.json();
            
            // Transform technologies to match Technologies component format
            if (techData && typeof techData === 'object') {
              technologies = Object.entries(techData).map(([id, tech]) => ({
                name: id,
                parent: tech.essentials?.parent || 'supply',
                description: tech.essentials?.name || id,
                essentials: {
                  name: tech.essentials?.name || id,
                  color: tech.essentials?.color || '#5A5A5A',
                  parent: tech.essentials?.parent || 'supply',
                  carrier_out: tech.essentials?.carrier_out || tech.essentials?.carrier || 'electricity',
                  carrier_in: tech.essentials?.carrier_in,
                  carrier: tech.essentials?.carrier
                },
                constraints: tech.constraints || {},
                costs: tech.costs || { monetary: {} }
              }));
              console.log(`Loaded ${technologies.length} technologies from ${template.technologiesFile}`);
            }
          }
        } catch (error) {
          console.warn('Could not load technologies file:', error);
        }
      }

      // Try loading scenarios from separate file
      if (template.scenariosFile) {
        try {
          const scenariosResponse = await fetch(`/templates/${template.scenariosFile}`);
          if (scenariosResponse.ok) {
            const scenariosData = await scenariosResponse.json();
            // Handle both {scenarios: {...}} and direct {...} format
            if (scenariosData.scenarios) {
              modelScenarios = scenariosData.scenarios;
              modelOverrides = scenariosData.overrides || {};
            } else {
              modelScenarios = scenariosData;
            }
            console.log(`Loaded scenarios from ${template.scenariosFile}:`, Object.keys(modelScenarios));
          }
        } catch (error) {
          console.warn('Could not load scenarios file:', error);
        }
      }

      // Fall back to modelDataFile if technologies/scenarios weren't loaded separately
      if (template.modelDataFile && technologies.length === 0) {
        try {
          const modelDataResponse = await fetch(`/templates/${template.modelDataFile}`);
          if (modelDataResponse.ok) {
            const modelData = await modelDataResponse.json();
            
            // Transform technologies to match Technologies component format
            if (modelData.technologies && Array.isArray(modelData.technologies)) {
              technologies = modelData.technologies.map(tech => ({
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
              console.log(`Transformed ${technologies.length} technologies from template`);
            }
            
            if (!modelScenarios || Object.keys(modelScenarios).length === 0) {
              modelOverrides = modelData.overrides || {};
              modelScenarios = modelData.scenarios || {};
            }
          }
        } catch (error) {
          console.warn('Could not load complete model data, using basic template');
        }
      }

      // Transform locations to include techs object from available_techs
      const transformedLocations = locationsData.map(loc => {
        // Support both 'lat'/'lon' and 'latitude'/'longitude' column names
        const lat = loc.lat || loc.latitude;
        const lon = loc.lon || loc.longitude;
        
        const location = {
          name: loc.name,
          latitude: lat,
          longitude: lon,
          type: loc.type,
          coordinates: {
            lat: lat,
            lon: lon
          }
        };

        // Add demand timeseries data if this location has demand profile
        if (demandData[loc.name]) {
          location.demandProfile = demandData[loc.name];
          location.totalDemandMWh = parseFloat(demandTotals[loc.name]);
          location.hasDemand = true; // Explicit flag for map coloring
        }

        // Add resource data if this location has resource profiles
        if (resourceData[`${loc.name}_pv`]) {
          location.resourcePV = resourceData[`${loc.name}_pv`];
        }
        if (resourceData[`${loc.name}_wind`]) {
          location.resourceWind = resourceData[`${loc.name}_wind`];
        }

        // Parse techs from CSV into techs object structure
        if (loc.techs && loc.techs.trim()) {
          location.techs = {};
          const techList = loc.techs.split(',').map(t => t.trim());
          techList.forEach(techName => {
            location.techs[techName] = {
              constraints: {}
            };

            // Use energy_cap_max from CSV if available
            if (loc.energy_cap_max && loc.energy_cap_max > 0) {
              location.techs[techName].constraints.energy_cap_max = loc.energy_cap_max;
            }

            // Add default constraints based on tech type
            if (techName.includes('solar')) {
              location.techs[techName].constraints.energy_cap_max = 1000;
              location.techs[techName].constraints.resource = 'file=solar_' + loc.name.toLowerCase() + '.csv';
            } else if (techName.includes('wind')) {
              location.techs[techName].constraints.energy_cap_max = 500;
              location.techs[techName].constraints.resource = 'file=wind_' + loc.name.toLowerCase() + '.csv';
            } else if (techName.includes('battery') || techName.includes('storage')) {
              location.techs[techName].constraints.energy_cap_max = 200;
              location.techs[techName].constraints.storage_cap_max = 400;
            } else if (techName.includes('gas') || techName.includes('ccgt')) {
              location.techs[techName].constraints.energy_cap_max = 800;
              location.techs[techName].constraints.energy_eff = 0.55;
            } else if (techName.includes('coal')) {
              location.techs[techName].constraints.energy_cap_max = 600;
              location.techs[techName].constraints.energy_eff = 0.40;
            } else if (techName.includes('biomass')) {
              location.techs[techName].constraints.energy_cap_max = 300;
              location.techs[techName].constraints.energy_eff = 0.35;
            }
          });
        } else {
          location.techs = {};
        }

        return location;
      });

      // Convert demand data to timeseries format for the model
      const timeseriesData = [];
      Object.entries(demandData).forEach(([locationName, data]) => {
        timeseriesData.push({
          id: `demand_${locationName}_${Date.now()}`,
          name: `Demand - ${locationName}`,
          type: 'demand',
          location: locationName,
          technology: 'demand_power',
          parameter: 'resource',
          file: data.file,
          column: data.column,
          data: data.timeseries,
          dates: data.dates,
          columns: ['date', data.column],
          rowCount: data.timeseries.length,
          statistics: {
            [data.column]: {
              min: parseFloat(data.minMW),
              max: parseFloat(data.maxMW),
              mean: parseFloat(data.avgMW),
              sum: parseFloat(data.totalMWh)
            }
          },
          createdAt: new Date().toISOString()
        });
      });

      // Add resource timeseries
      Object.entries(resourceData).forEach(([key, data]) => {
        timeseriesData.push({
          id: `resource_${data.resourceType}_${data.column}_${Date.now()}`,
          name: `${data.resourceName} - ${data.column}`,
          type: `resource_${data.resourceType}`,
          location: data.column,
          technology: data.resourceType,
          parameter: 'resource',
          file: data.file,
          column: data.column,
          data: data.timeseries,
          dates: data.dates,
          columns: ['date', data.column],
          rowCount: data.timeseries.length,
          statistics: {
            [data.column]: {
              min: parseFloat(data.minCF),
              max: parseFloat(data.maxCF),
              mean: parseFloat(data.avgCapacityFactor),
              sum: (parseFloat(data.avgCapacityFactor) * data.hours).toFixed(2)
            }
          },
          createdAt: new Date().toISOString()
        });
      });

      const modelId = createModel(
        template.name,
        transformedLocations,
        linksData,
        [],
        technologies,
        timeseriesData,
        {
          description: template.description,
          country: template.country,
          template: true,
          templateId: template.id
        },
        modelOverrides,
        modelScenarios
      );

      // Set overrides and scenarios to current state
      if (Object.keys(modelOverrides).length > 0 || Object.keys(modelScenarios).length > 0) {
        setOverrides(modelOverrides);
        setScenarios(modelScenarios);
        console.log('Loaded overrides and scenarios:', {
          overrides: Object.keys(modelOverrides),
          scenarios: Object.keys(modelScenarios)
        });
      }

      showNotification(`Template "${template.name}" loaded successfully!`, 'success');
    } catch (error) {
      console.error('Error loading template:', error);
      showNotification('Error loading template model. Make sure template files exist in /public/templates/', 'error');
    }
  };

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

  const assignTechnologyToLocation = (locationName, techName) => {
    setWizardData(prev => {
      const updatedConfig = { ...prev.parsedConfig };
      if (!updatedConfig.locations[locationName].techs) {
        updatedConfig.locations[locationName].techs = {};
      }
      
      if (updatedConfig.locations[locationName].techs[techName]) {
        delete updatedConfig.locations[locationName].techs[techName];
      } else {
        updatedConfig.locations[locationName].techs[techName] = {
          constraints: {}
        };
      }
      
      return { ...prev, parsedConfig: updatedConfig };
    });
  };

  const updateLocationCoordinates = (locationName, lat, lon) => {
    setWizardData(prev => {
      const updatedConfig = { ...prev.parsedConfig };
      if (!updatedConfig.locations[locationName].coordinates) {
        updatedConfig.locations[locationName].coordinates = {};
      }
      updatedConfig.locations[locationName].coordinates.lat = parseFloat(lat);
      updatedConfig.locations[locationName].coordinates.lon = parseFloat(lon);
      return { ...prev, parsedConfig: updatedConfig };
    });
  };

  const updateTechConstraint = (locationName, techName, constraintKey, constraintValue) => {
    setWizardData(prev => {
      const updatedConfig = { ...prev.parsedConfig };
      if (!updatedConfig.locations[locationName].techs[techName].constraints) {
        updatedConfig.locations[locationName].techs[techName].constraints = {};
      }
      
      // Parse numeric values
      let value = constraintValue;
      if (!isNaN(constraintValue) && constraintValue !== '') {
        value = parseFloat(constraintValue);
      }
      
      updatedConfig.locations[locationName].techs[techName].constraints[constraintKey] = value;
      return { ...prev, parsedConfig: updatedConfig };
    });
  };

  const removeTechConstraint = (locationName, techName, constraintKey) => {
    setWizardData(prev => {
      const updatedConfig = { ...prev.parsedConfig };
      delete updatedConfig.locations[locationName].techs[techName].constraints[constraintKey];
      return { ...prev, parsedConfig: updatedConfig };
    });
  };

  const removeTechnologyFromLocation = (locationName, techName) => {
    setWizardData(prev => {
      const updatedConfig = { ...prev.parsedConfig };
      delete updatedConfig.locations[locationName].techs[techName];
      return { ...prev, parsedConfig: updatedConfig };
    });
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
    setWizardStep(1);
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

  return (
    <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Energy System Models</h1>
            <p className="text-slate-600">Create, manage and configure your own models</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCSVWizard(true)}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all shadow-md flex items-center gap-2 font-semibold"
            >
              <FiUpload size={18} />
              CSV Import Wizard
            </button>
          </div>
        </div>
      </div>

      {/* CSV Templates Info Banner */}
      <div className="mb-6 bg-gradient-to-r from-gray-500 to-gray-700 text-white rounded-xl p-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white bg-opacity-20 rounded-lg">
            <FiInfo size={28} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2">Creating Your Own Model?</h3>
            <p className="text-gray-50 mb-4">
              Start by downloading our CSV templates! They guide you through the required format for locations and connections. 
              Click the <strong>CSV Import Wizard</strong> button above to download templates and create your custom energy system model.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-white bg-opacity-20 px-3 py-1.5 rounded-lg">
                <FiMap size={16} />
                <span className="text-sm">Define sites & nodes</span>
              </div>
              <div className="flex items-center gap-2 bg-white bg-opacity-20 px-3 py-1.5 rounded-lg">
                <FiZap size={16} />
                <span className="text-sm">Connect locations</span>
              </div>
              <div className="flex items-center gap-2 bg-white bg-opacity-20 px-3 py-1.5 rounded-lg">
                <FiCpu size={16} />
                <span className="text-sm">Assign technologies</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Template Models Section with Detailed View */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-slate-800">Template Models</h2>
          <span className="text-sm text-slate-500">{TEMPLATE_MODELS.length} templates available</span>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {TEMPLATE_MODELS.map((template) => (
            <div key={template.id} className={`bg-white rounded-xl shadow-lg border-l-4 border-${template.color}-500 overflow-hidden hover:shadow-xl transition-shadow`}>
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-2xl mb-2">{template.country.split(' ')[0]}</div>
                    <h3 className="font-bold text-slate-800 text-lg">{template.name}</h3>
                  </div>
                  <button
                    onClick={() => setViewingTemplate(viewingTemplate === template.id ? null : template.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View details"
                  >
                    <FiInfo size={20} className="text-slate-600" />
                  </button>
                </div>

                <p className="text-sm text-slate-600 mb-4 min-h-[40px]">
                  {template.description}
                </p>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-2 mb-4 pb-4 border-b border-gray-200">
                  <div className="flex items-center gap-2 text-sm">
                    <FiMap className="text-gray-600" />
                    <span className="text-slate-700">{template.sites} sites + {template.nodes} nodes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FiZap className="text-gray-600" />
                    <span className="text-slate-700">{template.links} connections</span>
                  </div>
                </div>

                {/* Expanded Details */}
                {viewingTemplate === template.id && (
                  <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-4 animate-fadeIn">
                    {/* Required Files Section */}
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800 mb-3 flex items-center gap-2">
                        <FiUpload className="text-gray-600" size={16} />
                        Required Files to Create This Model:
                      </h4>
                      <div className="space-y-2">
                        {/* Locations File */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 hover:border-gray-300 transition-colors">
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">
                              <FiMap className="text-gray-600" size={14} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-medium text-xs text-slate-800">1. Locations File (Required)</div>
                                <button
                                  onClick={() => downloadTemplateFile(template.locationsFile, 'Locations File')}
                                  className="flex items-center gap-1 px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition-colors"
                                  title="Download template file"
                                >
                                  <FiDownload size={12} />
                                  Download
                                </button>
                              </div>
                              <code className="text-xs bg-slate-100 px-2 py-1 rounded text-gray-700 font-mono">
                                {template.locationsFile}
                              </code>
                              <div className="text-xs text-slate-600 mt-2">
                                <strong>Columns:</strong> name, lat, lon, type, techs, energy_cap_max
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {template.sites} sites + {template.nodes} nodes = {template.locations} total locations
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Links File */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 hover:border-gray-300 transition-colors">
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">
                              <FiZap className="text-gray-600" size={14} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-medium text-xs text-slate-800">2. Links/Transmission File (Required)</div>
                                <button
                                  onClick={() => downloadTemplateFile(template.linksFile, 'Links File')}
                                  className="flex items-center gap-1 px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition-colors"
                                  title="Download template file"
                                >
                                  <FiDownload size={12} />
                                  Download
                                </button>
                              </div>
                              <code className="text-xs bg-slate-100 px-2 py-1 rounded text-gray-700 font-mono">
                                {template.linksFile}
                              </code>
                              <div className="text-xs text-slate-600 mt-2">
                                <strong>Columns:</strong> from, to, distance, techs, energy_cap_max
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {template.links} transmission connections
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Demand File (if exists) */}
                        {template.demandFile && (
                          <div className="bg-gray-50 p-3 rounded-lg border-2 border-gray-300 hover:border-gray-400 transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5">
                                <FiActivity className="text-gray-700" size={14} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-medium text-xs text-gray-900 flex items-center gap-2">
                                    3. Demand Timeseries File (Critical for Chile Model)
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded-full text-[10px] font-bold">IMPORTANT</span>
                                  </div>
                                  <button
                                    onClick={() => downloadTemplateFile(template.demandFile, 'Demand Timeseries')}
                                    className="flex items-center gap-1 px-2 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-800 transition-colors"
                                    title="Download template file"
                                  >
                                    <FiDownload size={12} />
                                    Download
                                  </button>
                                </div>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 font-mono">
                                  {template.demandFile}
                                </code>
                                <div className="text-xs text-gray-900 mt-2">
                                  <strong>Columns:</strong> date, [substation names as column headers]
                                </div>
                                <div className="text-xs text-gray-800 mt-2 p-2 bg-gray-100 rounded">
                                  <strong>⚠️ Each column name must match a substation name from locations file</strong>
                                </div>
                                <div className="text-xs text-gray-700 mt-2">
                                  • Expected: {template.substations} substation columns (one per S/E station)
                                  <br />
                                  • Format: Hourly demand values in MW
                                  <br />
                                  • Typical rows: 8,760 hours (1 year)
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Model Data File (if exists) */}
                        {template.modelDataFile && (
                          <div className="bg-white p-3 rounded-lg border border-slate-200 hover:border-gray-300 transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5">
                                <FiDatabase className="text-gray-600" size={14} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-medium text-xs text-slate-800">4. Model Configuration (Optional)</div>
                                  <button
                                    onClick={() => downloadTemplateFile(template.modelDataFile, 'Model Configuration')}
                                    className="flex items-center gap-1 px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 transition-colors"
                                    title="Download template file"
                                  >
                                    <FiDownload size={12} />
                                    Download
                                  </button>
                                </div>
                                <code className="text-xs bg-slate-100 px-2 py-1 rounded text-gray-700 font-mono">
                                  {template.modelDataFile}
                                </code>
                                <div className="text-xs text-slate-600 mt-2">
                                  Contains: technologies definitions, overrides, scenarios
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Resource Files (if exist) */}
                        {template.resourceFiles && template.resourceFiles.length > 0 && (
                          <div className="space-y-2">
                            {template.resourceFiles.map((resourceFile, idx) => (
                              <div key={idx} className="bg-green-50 p-3 rounded-lg border-2 border-green-300 hover:border-green-400 transition-colors">
                                <div className="flex items-start gap-2">
                                  <div className="mt-0.5">
                                    <FiActivity className="text-green-700" size={14} />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="font-medium text-xs text-green-900 flex items-center gap-2">
                                        {idx + 4}. {resourceFile.name} Timeseries
                                        <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded-full text-[10px] font-bold">RESOURCE</span>
                                      </div>
                                      <button
                                        onClick={() => downloadTemplateFile(resourceFile.file, resourceFile.name)}
                                        className="flex items-center gap-1 px-2 py-1 bg-green-700 text-white rounded text-xs hover:bg-green-800 transition-colors"
                                        title="Download resource file"
                                      >
                                        <FiDownload size={12} />
                                        Download
                                      </button>
                                    </div>
                                    <code className="text-xs bg-green-100 px-2 py-1 rounded text-green-800 font-mono">
                                      {resourceFile.file}
                                    </code>
                                    <div className="text-xs text-green-900 mt-2">
                                      <strong>Columns:</strong> date, [location names as column headers]
                                    </div>
                                    <div className="text-xs text-green-700 mt-2">
                                      • Format: Hourly capacity factors (0.0 to 1.0)
                                      <br />
                                      • Typical rows: 8,760 hours (1 year)
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Additional JSON Files (technologies, scenarios, statistics) */}
                        {(template.technologiesFile || template.scenariosFile || template.statisticsFile) && (
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="font-medium text-xs text-blue-900 mb-2">Additional Configuration Files:</div>
                            <div className="space-y-2">
                              {template.technologiesFile && (
                                <div className="flex items-center justify-between">
                                  <code className="text-xs bg-blue-100 px-2 py-1 rounded text-blue-800 font-mono">
                                    {template.technologiesFile}
                                  </code>
                                  <button
                                    onClick={() => downloadTemplateFile(template.technologiesFile, 'Technologies')}
                                    className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                                  >
                                    <FiDownload size={12} />
                                  </button>
                                </div>
                              )}
                              {template.scenariosFile && (
                                <div className="flex items-center justify-between">
                                  <code className="text-xs bg-blue-100 px-2 py-1 rounded text-blue-800 font-mono">
                                    {template.scenariosFile}
                                  </code>
                                  <button
                                    onClick={() => downloadTemplateFile(template.scenariosFile, 'Scenarios')}
                                    className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                                  >
                                    <FiDownload size={12} />
                                  </button>
                                </div>
                              )}
                              {template.statisticsFile && (
                                <div className="flex items-center justify-between">
                                  <code className="text-xs bg-blue-100 px-2 py-1 rounded text-blue-800 font-mono">
                                    {template.statisticsFile}
                                  </code>
                                  <button
                                    onClick={() => downloadTemplateFile(template.statisticsFile, 'Statistics')}
                                    className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                                  >
                                    <FiDownload size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Download All Files Button */}
                    <div className="flex justify-center">
                      <button
                        onClick={() => downloadAllTemplateFiles(template)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-lg hover:from-gray-900 hover:to-gray-900 transition-all shadow-md hover:shadow-lg text-sm font-medium"
                        title="Download all template files at once"
                      >
                        <FiDownload size={16} />
                        Download All Template Files (
                        {2 + 
                         (template.demandFile ? 1 : 0) + 
                         (template.resourceFiles?.length || 0) + 
                         (template.technologiesFile ? 1 : 0) +
                         (template.scenariosFile ? 1 : 0) +
                         (template.statisticsFile ? 1 : 0) +
                         (template.modelDataFile ? 1 : 0)} files)
                      </button>
                    </div>

                    {/* Upload Instructions */}
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="font-semibold text-xs text-gray-900 mb-2">📋 How to Use Template Files:</div>
                      <ol className="text-xs text-gray-800 space-y-1 ml-4 list-decimal">
                        <li>Download the template files above to see the exact format required</li>
                        <li>Modify the files with your own data (keep the same column structure)</li>
                        <li>Place all CSV files in the <code className="bg-gray-100 px-1 py-0.5 rounded">/public/templates/</code> folder</li>
                        <li>Make sure file names match exactly as shown above</li>
                        <li>For demand file: column headers must match location names from step 1</li>
                        <li>Click "Load Template" button to import your modified model</li>
                      </ol>
                    </div>

                    {/* Technologies List */}
                    <div>
                      <h4 className="font-semibold text-sm text-slate-700 mb-2">Available Technologies:</h4>
                      <div className="flex flex-wrap gap-1">
                        {template.technologies.map((tech, idx) => (
                          <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Features (if exists) */}
                    {template.features && (
                      <div>
                        <h4 className="font-semibold text-sm text-slate-700 mb-2">Model Features:</h4>
                        <ul className="text-xs text-slate-600 space-y-1 ml-4">
                          {template.features.map((feature, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <FiCheck className="text-gray-600" size={12} />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => loadTemplateModel(template)}
                  className={`w-full px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-white-700 transition-colors text-sm font-semibold shadow-md`}
                >
                  Load Template
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saved Models Section */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">Your Models</h2>
          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
            {models.length} {models.length === 1 ? 'model' : 'models'}
          </span>
        </div>

        {models.length === 0 ? (
          <div className="text-center py-16">
            <FiFolder className="mx-auto text-7xl text-slate-300 mb-4" />
            <p className="text-slate-500 text-lg mb-2">No models yet</p>
            <p className="text-sm text-slate-400 mb-6">Load a template or use the CSV Import Wizard to get started</p>
            <button
              onClick={() => setShowCSVWizard(true)}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors inline-flex items-center gap-2 font-semibold"
            >
              <FiPlus size={20} />
              Create Your First Model
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {models.map((model) => (
              <div
                key={model.id}
                className={`p-5 rounded-xl border-2 transition-all ${
                  currentModelId === model.id
                    ? 'border-gray-500 bg-gray-50 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                {editingId === model.id ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      autoFocus
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') handleRename(model.id);
                      }}
                    />
                    <button
                      onClick={() => handleRename(model.id)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Save"
                    >
                      <FiCheck size={22} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditName('');
                      }}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                      title="Cancel"
                    >
                      <FiX size={22} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="font-bold text-slate-800 text-xl">{model.name}</h3>
                        {currentModelId === model.id && (
                          <span className="px-3 py-1 bg-gray-600 text-white text-xs rounded-full font-semibold">
                            ACTIVE
                          </span>
                        )}
                        {model.metadata?.template && (
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-semibold">
                            TEMPLATE
                          </span>
                        )}
                      </div>

                      {model.metadata?.description && (
                        <p className="text-sm text-slate-600 mb-3">{model.metadata.description}</p>
                      )}

                      {/* Enhanced Statistics */}
                      <div className="grid grid-cols-4 gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <FiMap className="text-gray-600" size={18} />
                          <div>
                            <div className="text-xs text-slate-500">Locations</div>
                            <div className="font-semibold text-slate-800">{model.locations?.length || 0}</div>
                            <div className="text-xs text-slate-400">
                              {model.locations?.filter(loc => loc.type === 'site').length || 0} sites, 
                              {' '}{model.locations?.filter(loc => loc.type === 'node').length || 0} nodes
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <FiZap className="text-gray-600" size={18} />
                          <div>
                            <div className="text-xs text-slate-500">Links</div>
                            <div className="font-semibold text-slate-800">{model.links?.length || 0}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <FiCpu className="text-gray-600" size={18} />
                          <div>
                            <div className="text-xs text-slate-500">Technologies</div>
                            <div className="font-semibold text-slate-800">{model.technologies?.length || 0}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <FiDatabase className="text-gray-600" size={18} />
                          <div>
                            <div className="text-xs text-slate-500">Parameters</div>
                            <div className="font-semibold text-slate-800">{model.parameters?.length || 0}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span>📅 Created: {new Date(model.createdAt).toLocaleDateString()}</span>
                        <span>🔄 Updated: {new Date(model.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {currentModelId !== model.id && (
                        <button
                          onClick={() => loadModel(model.id)}
                          className="px-6 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-semibold shadow-md"
                        >
                          Load
                        </button>
                      )}
                      <button
                        onClick={() => setUploadingFilesForModel(model.id)}
                        className="p-2.5 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        title="Update Files"
                      >
                        <FiUpload size={20} />
                      </button>
                      <button
                        onClick={() => startEdit(model)}
                        className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Rename"
                      >
                        <FiEdit2 size={20} />
                      </button>
                      <button
                        onClick={() => handleDelete(model.id)}
                        className="p-2.5 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <FiTrash2 size={20} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Upload Dialog */}
      {uploadingFilesForModel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">Update Model Files</h3>
                <p className="text-gray-100 text-sm mt-1">
                  {models.find(m => m.id === uploadingFilesForModel)?.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setUploadingFilesForModel(null);
                  setUpdateFiles({ locations: null, links: null, demand: null, config: null });
                }}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <FiX size={28} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-slate-600 mb-4">
                Upload new files to update this model. You can upload any combination of files.
                Only the uploaded files will be updated.
              </p>

              {/* Locations File */}
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-gray-400 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer">
                  <FiMap className="text-gray-600 text-2xl" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">Locations File (CSV)</div>
                    <div className="text-sm text-slate-500">Update location data, coordinates, technologies</div>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpdate(uploadingFilesForModel, 'locations', e.target.files[0])}
                    className="hidden"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                    {updateFiles.locations ? '✓ Selected' : 'Choose File'}
                  </span>
                </label>
                {updateFiles.locations && (
                  <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                    ✓ {updateFiles.locations.name}
                  </div>
                )}
              </div>

              {/* Links File */}
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-gray-400 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer">
                  <FiZap className="text-gray-600 text-2xl" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">Links File (CSV)</div>
                    <div className="text-sm text-slate-500">Update transmission connections</div>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpdate(uploadingFilesForModel, 'links', e.target.files[0])}
                    className="hidden"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                    {updateFiles.links ? '✓ Selected' : 'Choose File'}
                  </span>
                </label>
                {updateFiles.links && (
                  <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                    ✓ {updateFiles.links.name}
                  </div>
                )}
              </div>

              {/* Demand File */}
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-gray-400 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer">
                  <FiActivity className="text-gray-600 text-2xl" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">Demand File (CSV)</div>
                    <div className="text-sm text-slate-500">Update demand timeseries</div>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpdate(uploadingFilesForModel, 'demand', e.target.files[0])}
                    className="hidden"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                    {updateFiles.demand ? '✓ Selected' : 'Choose File'}
                  </span>
                </label>
                {updateFiles.demand && (
                  <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                    ✓ {updateFiles.demand.name}
                  </div>
                )}
              </div>

              {/* Config File */}
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-gray-400 transition-colors">
                <label className="flex items-center gap-3 cursor-pointer">
                  <FiDatabase className="text-gray-600 text-2xl" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">Configuration File (JSON)</div>
                    <div className="text-sm text-slate-500">Update technologies, overrides, scenarios</div>
                  </div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => handleFileUpdate(uploadingFilesForModel, 'config', e.target.files[0])}
                    className="hidden"
                  />
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                    {updateFiles.config ? '✓ Selected' : 'Choose File'}
                  </span>
                </label>
                {updateFiles.config && (
                  <div className="mt-2 text-xs text-gray-600 flex items-center gap-1">
                    ✓ {updateFiles.config.name}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => processModelUpdate(uploadingFilesForModel)}
                  disabled={!updateFiles.locations && !updateFiles.links && !updateFiles.demand && !updateFiles.config}
                  className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Update Model
                </button>
                <button
                  onClick={() => {
                    setUploadingFilesForModel(null);
                    setUpdateFiles({ locations: null, links: null, demand: null, config: null });
                  }}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Wizard Modal */}
      {showCSVWizard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r bg-gray-700 text-white px-5 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Model Import Wizard</h3>
                <p className="text-gray-100 text-xs mt-0.5">Step {wizardStep} of 2</p>
              </div>
              <button
                onClick={() => {
                  setShowCSVWizard(false);
                  setWizardStep(1);
                }}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <FiX size={24} />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="bg-gray-200 h-1.5">
              <div 
                className="bg-gray-600 h-full transition-all duration-300"
                style={{ width: `${(wizardStep / 2) * 100}%` }}
              />
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Step 1: Upload Files - Chile Model Structure */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  {/* Header with Instructions */}
                  <div className="bg-gradient-to-r from-blue-50 to-gray-50 border border-gray-300 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <FiInfo className="text-blue-600 text-xl mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-gray-800 mb-1">Upload Your Model Files</h4>
                        <p className="text-sm text-gray-700 mb-2">
                          Required: <strong>Locations</strong> and <strong>Links</strong> CSV files. Optional: Technologies, Scenarios, and Resource timeseries.
                        </p>
                        <p className="text-xs text-gray-600">
                          💡 Download the Chile template from below to see the exact format.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Model Name */}
                  <div className="bg-white rounded-lg border border-gray-300 p-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Model Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={wizardData.modelName}
                      onChange={(e) => setWizardData(prev => ({ ...prev, modelName: e.target.value }))}
                      placeholder="e.g., My Regional Energy System"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-gray-500 focus:border-transparent text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div className="bg-white rounded-lg border border-gray-300 p-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description (Optional)</label>
                    <textarea
                      value={wizardData.description}
                      onChange={(e) => setWizardData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-gray-500 focus:border-transparent text-sm"
                    />
                  </div>

                  {/* Compact File Upload Grid */}
                  <div className="grid md:grid-cols-2 gap-3">
                    {/* 1. Locations File */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      wizardData.locationsData 
                        ? 'bg-green-50 border-green-400' 
                        : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <FiMap className="text-gray-600 text-lg flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-gray-800 text-sm">Locations <span className="text-red-500 text-xs">*</span></h5>
                            {wizardData.locationsData && (
                              <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-semibold">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2">CSV with power plants & substations</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files[0]) handleLocationsFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-xs text-gray-600 
                              file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 
                              file:text-xs file:font-semibold file:bg-gray-600 file:text-white 
                              hover:file:bg-gray-700 file:cursor-pointer cursor-pointer"
                          />
                          {wizardData.locationsData && (
                            <p className="text-xs text-green-700 mt-1.5 font-medium">
                              ✓ {wizardData.locationsData.length} locations
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2. Links File */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      wizardData.linksData 
                        ? 'bg-green-50 border-green-400' 
                        : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <FiZap className="text-gray-600 text-lg flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-gray-800 text-sm">Links <span className="text-red-500 text-xs">*</span></h5>
                            {wizardData.linksData && (
                              <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-semibold">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2">CSV with transmission connections</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files[0]) handleLinksFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-xs text-gray-600 
                              file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 
                              file:text-xs file:font-semibold file:bg-gray-600 file:text-white 
                              hover:file:bg-gray-700 file:cursor-pointer cursor-pointer"
                          />
                          {wizardData.linksData && (
                            <p className="text-xs text-green-700 mt-1.5 font-medium">
                              ✓ {wizardData.linksData.length} links
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 3. Technologies File */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      wizardData.technologiesData 
                        ? 'bg-blue-50 border-blue-400' 
                        : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <FiCpu className="text-blue-600 text-lg flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-gray-800 text-sm">Technologies</h5>
                            {wizardData.technologiesData && (
                              <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-semibold">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2">JSON with tech definitions</p>
                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              if (e.target.files[0]) handleTechnologiesFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-xs text-gray-600 
                              file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 
                              file:text-xs file:font-semibold file:bg-blue-600 file:text-white 
                              hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                          />
                          {wizardData.technologiesData && (
                            <p className="text-xs text-blue-700 mt-1.5 font-medium">
                              ✓ {Object.keys(wizardData.technologiesData).length} techs
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4. Scenarios File */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      wizardData.scenariosData 
                        ? 'bg-purple-50 border-purple-400' 
                        : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <FiLayers className="text-purple-600 text-lg flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-gray-800 text-sm">Scenarios</h5>
                            {wizardData.scenariosData && (
                              <span className="px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-semibold">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2">JSON with scenarios & overrides</p>
                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              if (e.target.files[0]) handleScenariosFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-xs text-gray-600 
                              file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 
                              file:text-xs file:font-semibold file:bg-purple-600 file:text-white 
                              hover:file:bg-purple-700 file:cursor-pointer cursor-pointer"
                          />
                          {wizardData.scenariosData && (
                            <p className="text-xs text-purple-700 mt-1.5 font-medium">✓ Loaded</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 5. Demand Timeseries */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      wizardData.demandData 
                        ? 'bg-orange-50 border-orange-400' 
                        : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <FiActivity className="text-orange-600 text-lg flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-gray-800 text-sm">Demand Data</h5>
                            {wizardData.demandData && (
                              <span className="px-2 py-0.5 bg-orange-600 text-white rounded-full text-xs font-semibold">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2">CSV with demand timeseries</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files[0]) handleDemandFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-xs text-gray-600 
                              file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 
                              file:text-xs file:font-semibold file:bg-orange-600 file:text-white 
                              hover:file:bg-orange-700 file:cursor-pointer cursor-pointer"
                          />
                          {wizardData.demandData && (
                            <p className="text-xs text-orange-700 mt-1.5 font-medium">
                              ✓ {wizardData.demandData.length} rows
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 6. Config File */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      wizardData.parsedConfig 
                        ? 'bg-gray-50 border-gray-400' 
                        : 'border-dashed border-gray-300 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <FiDatabase className="text-gray-600 text-lg flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="font-bold text-gray-800 text-sm">Configuration</h5>
                            {wizardData.parsedConfig && (
                              <span className="px-2 py-0.5 bg-gray-600 text-white rounded-full text-xs font-semibold">✓</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mb-2">JSON with legacy config</p>
                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              if (e.target.files[0]) handleConfigFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-xs text-gray-600 
                              file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 
                              file:text-xs file:font-semibold file:bg-gray-600 file:text-white 
                              hover:file:bg-gray-700 file:cursor-pointer cursor-pointer"
                          />
                          {wizardData.parsedConfig && (
                            <p className="text-xs text-gray-700 mt-1.5 font-medium">✓ Loaded</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resource Timeseries Section */}
                  <div className="bg-white border-2 border-gray-300 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FiUploadCloud className="text-green-600 text-lg" />
                      <h5 className="font-bold text-gray-800 text-sm">Resource Timeseries Files</h5>
                      {wizardData.resourceFiles.length > 0 && (
                        <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-semibold">
                          {wizardData.resourceFiles.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mb-3">Upload CSV files with solar/wind resource data (first column must be "date")</p>
                    
                    {/* File Upload Buttons */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <label className="cursor-pointer px-3 py-1.5 bg-yellow-500 text-white rounded text-xs font-semibold hover:bg-yellow-600 flex items-center gap-1">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleResourceFileUpload(e.target.files[0], 'pv');
                              e.target.value = ''; // Reset input
                            }
                          }}
                        />
                        + Solar (PV)
                      </label>
                      
                      <label className="cursor-pointer px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-semibold hover:bg-blue-600 flex items-center gap-1">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleResourceFileUpload(e.target.files[0], 'wind');
                              e.target.value = ''; // Reset input
                            }
                          }}
                        />
                        + Wind
                      </label>
                      
                      <label className="cursor-pointer px-3 py-1.5 bg-gray-500 text-white rounded text-xs font-semibold hover:bg-gray-600 flex items-center gap-1">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleResourceFileUpload(e.target.files[0], 'other');
                              e.target.value = ''; // Reset input
                            }
                          }}
                        />
                        + Other
                      </label>
                    </div>

                    {/* List of uploaded files */}
                    {wizardData.resourceFiles.length > 0 && (
                      <div className="space-y-1.5">
                        {wizardData.resourceFiles.map((rf, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded text-xs">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`px-1.5 py-0.5 rounded font-semibold ${
                                rf.type === 'pv' ? 'bg-yellow-100 text-yellow-800' :
                                rf.type === 'wind' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {rf.type.toUpperCase()}
                              </span>
                              <span className="font-medium text-gray-800 truncate">{rf.name}</span>
                              <span className="text-gray-500">({rf.data.length} rows)</span>
                            </div>
                            <button
                              onClick={() => removeResourceFile(rf.name)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                            >
                              <FiX size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Header with Instructions */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gray-600 rounded-lg">
                        <FiInfo className="text-white text-2xl" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-gray-800 mb-2">Upload Your Model Files</h4>
                        <p className="text-gray-700 mb-3">
                          Follow the same structure as the <strong>Chile Model Template</strong>. 
                          You need at minimum: <strong>Locations file</strong> and <strong>Links file</strong>.
                        </p>
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <p className="text-sm text-gray-900 font-medium mb-2">💡 Need examples?</p>
                          <p className="text-sm text-gray-800">
                            Download the Chile template files from the Templates section below to see the exact format required.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Model Name */}
                  <div className="bg-white rounded-lg border-2 border-slate-200 p-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Model Name <span className="text-gray-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={wizardData.modelName}
                      onChange={(e) => setWizardData(prev => ({ ...prev, modelName: e.target.value }))}
                      placeholder="e.g., My Regional Energy System"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent text-lg"
                    />
                    <p className="text-xs text-gray-500 mt-2">Give your model a descriptive name</p>
                  </div>

                  {/* Description */}
                  <div className="bg-white rounded-lg border-2 border-slate-200 p-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Description (Optional)</label>
                    <textarea
                      value={wizardData.description}
                      onChange={(e) => setWizardData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of your energy system..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />
                  </div>

                  {/* File Upload Sections */}
                  <div className="space-y-4">
                    {/* 1. Locations File - Required */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.locationsData 
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-gray-600 rounded-lg">
                          <FiMap className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              1. Locations File <span className="text-gray-500">*</span>
                            </h5>
                            {wizardData.locationsData && (
                              <span className="px-3 py-1 bg-gray-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> Loaded
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            CSV file defining all your locations (power plants, substations, nodes)
                          </p>

                          {/* Required Columns Info */}
                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-2">Required Columns:</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">name</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">lat / latitude</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">lon / longitude</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">type (site/node/substation)</code>
                            </div>
                            <p className="text-xs text-gray-600 mt-2 font-semibold">
                              Chile format columns:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">techs (technology name)</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">energy_cap_max (capacity)</code>
                            </div>
                          </div>

                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files[0]) handleLocationsFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-sm text-gray-600 
                              file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 
                              file:text-sm file:font-semibold file:bg-gray-600 file:text-white 
                              hover:file:bg-gray-700 file:cursor-pointer cursor-pointer"
                          />

                          {wizardData.locationsData && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <FiCheck className="text-gray-600" size={18} />
                                <span className="text-sm font-semibold text-gray-800">
                                  {wizardData.locationsFile?.name}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                ✓ {wizardData.locationsData.length} locations loaded
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2. Links File - Required */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.linksData 
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-gray-600 rounded-lg">
                          <FiZap className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              2. Transmission Links File <span className="text-gray-500">*</span>
                            </h5>
                            {wizardData.linksData && (
                              <span className="px-3 py-1 bg-gray-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> Loaded
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            CSV file defining transmission connections between locations
                          </p>

                          {/* Required Columns Info */}
                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-2">Required Columns:</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">from / source</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">to / target</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">distance / distance_km</code>
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-800">tech (transmission type)</code>
                            </div>
                            <p className="text-xs text-gray-600 mt-2">
                              Optional: <code className="bg-gray-100 px-1">capacity</code> or <code className="bg-gray-100 px-1">energy_cap_max</code>
                            </p>
                          </div>

                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files[0]) handleLinksFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-sm text-gray-600 
                              file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 
                              file:text-sm file:font-semibold file:bg-gray-600 file:text-white 
                              hover:file:bg-gray-700 file:cursor-pointer cursor-pointer"
                          />

                          {wizardData.linksData && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <FiCheck className="text-gray-600" size={18} />
                                <span className="text-sm font-semibold text-gray-800">
                                  {wizardData.linksFile?.name}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                ✓ {wizardData.linksData.length} transmission links loaded
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 3. Demand File - Optional */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.demandData 
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-gray-700 rounded-lg">
                          <FiActivity className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              3. Demand Timeseries File <span className="text-gray-500 text-sm font-normal">(Optional)</span>
                            </h5>
                            {wizardData.demandData && (
                              <span className="px-3 py-1 bg-gray-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> Loaded
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            CSV file with hourly demand data for substations (like Chile model)
                          </p>

                          {/* Required Columns Info */}
                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-2">Required Format:</p>
                            <div className="text-xs space-y-1">
                              <p>• First column: <code className="bg-gray-100 px-1 rounded">date</code> or <code className="bg-gray-100 px-1 rounded">timestep</code></p>
                              <p>• Remaining columns: <strong>Location names from your locations file</strong></p>
                              <p>• Values: Hourly demand in MW</p>
                            </div>
                            <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded">
                              <p className="text-xs text-gray-800">
                                ⚠️ <strong>Critical:</strong> Column headers must exactly match location names from Step 1
                              </p>
                            </div>
                          </div>

                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files[0]) handleDemandFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-sm text-gray-600 
                              file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 
                              file:text-sm file:font-semibold file:bg-gray-700 file:text-white 
                              hover:file:bg-gray-800 file:cursor-pointer cursor-pointer"
                          />

                          {wizardData.demandData && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <FiCheck className="text-gray-600" size={18} />
                                <span className="text-sm font-semibold text-gray-800">
                                  {wizardData.demandFile?.name}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                ✓ {wizardData.demandData.length} timesteps × {Object.keys(wizardData.demandData[0] || {}).length - 1} locations
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 4. Config File - Optional */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.parsedConfig 
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-gray-600 rounded-lg">
                          <FiDatabase className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              4. Model Configuration <span className="text-gray-500 text-sm font-normal">(Optional)</span>
                            </h5>
                            {wizardData.parsedConfig && (
                              <span className="px-3 py-1 bg-gray-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> Loaded
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            JSON file with technology definitions, overrides, and scenarios
                          </p>

                          {/* Info Box */}
                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-1">Contains:</p>
                            <div className="text-xs space-y-1 text-gray-700">
                              <p>• Technology groups (solar, wind, etc.)</p>
                              <p>• Global constraints and defaults</p>
                              <p>• Scenario configurations</p>
                              <p>• Override settings</p>
                            </div>
                          </div>

                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              if (e.target.files[0]) handleConfigFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-sm text-gray-600 
                              file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 
                              file:text-sm file:font-semibold file:bg-gray-600 file:text-white 
                              hover:file:bg-gray-700 file:cursor-pointer cursor-pointer"
                          />

                          {wizardData.parsedConfig && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <FiCheck className="text-gray-600" size={18} />
                                <span className="text-sm font-semibold text-gray-800">
                                  {wizardData.configFile?.name}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                ✓ Configuration loaded successfully
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 5. Technologies File - Optional */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.technologiesData 
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-600 rounded-lg">
                          <FiCpu className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              5. Technologies <span className="text-gray-500 text-sm font-normal">(Optional)</span>
                            </h5>
                            {wizardData.technologiesData && (
                              <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> Loaded
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            JSON file with technology definitions (techs: pv, wind, hydro, etc.)
                          </p>

                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-1">Example structure:</p>
                            <pre className="text-xs text-gray-700 bg-gray-50 p-2 rounded overflow-x-auto">
{`{
  "pv": {
    "name": "Solar PV",
    "color": "rgb(255,193,7)",
    "essentials": {...}
  }
}`}</pre>
                          </div>

                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              if (e.target.files[0]) handleTechnologiesFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-sm text-gray-600 
                              file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 
                              file:text-sm file:font-semibold file:bg-blue-600 file:text-white 
                              hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                          />

                          {wizardData.technologiesData && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <FiCheck className="text-blue-600" size={18} />
                                <span className="text-sm font-semibold text-gray-800">
                                  {wizardData.technologiesFile?.name}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                ✓ {Object.keys(wizardData.technologiesData).length} technologies defined
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 6. Scenarios File - Optional */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.scenariosData 
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-purple-600 rounded-lg">
                          <FiLayers className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              6. Scenarios <span className="text-gray-500 text-sm font-normal">(Optional)</span>
                            </h5>
                            {wizardData.scenariosData && (
                              <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> Loaded
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            JSON file with scenario definitions and overrides
                          </p>

                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-1">Contains:</p>
                            <div className="text-xs space-y-1 text-gray-700">
                              <p>• Scenario configurations</p>
                              <p>• Location-specific overrides</p>
                              <p>• Technology parameter adjustments</p>
                            </div>
                          </div>

                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              if (e.target.files[0]) handleScenariosFileUpload(e.target.files[0]);
                            }}
                            className="block w-full text-sm text-gray-600 
                              file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 
                              file:text-sm file:font-semibold file:bg-purple-600 file:text-white 
                              hover:file:bg-purple-700 file:cursor-pointer cursor-pointer"
                          />

                          {wizardData.scenariosData && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <FiCheck className="text-purple-600" size={18} />
                                <span className="text-sm font-semibold text-gray-800">
                                  {wizardData.scenariosFile?.name}
                                </span>
                              </div>
                              <p className="text-xs text-gray-700">
                                ✓ Scenarios loaded successfully
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 7. Resource Timeseries Files - Optional but Recommended */}
                    <div className={`border-3 rounded-xl p-6 transition-all ${
                      wizardData.resourceFiles.length > 0
                        ? 'bg-gray-50 border-gray-400 shadow-md' 
                        : 'border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-green-600 rounded-lg">
                          <FiUploadCloud className="text-white text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-bold text-gray-800 text-lg">
                              7. Resource Timeseries <span className="text-gray-500 text-sm font-normal">(Optional)</span>
                            </h5>
                            {wizardData.resourceFiles.length > 0 && (
                              <span className="px-3 py-1 bg-green-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                                <FiCheck size={16} /> {wizardData.resourceFiles.length} Files
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-700 mb-3">
                            CSV files with hourly resource data (solar, wind) or additional demand data
                          </p>

                          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-gray-900 mb-2">File types:</p>
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <input
                                  type="file"
                                  accept=".csv"
                                  id="resource-pv-upload"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files[0]) handleResourceFileUpload(e.target.files[0], 'pv');
                                  }}
                                />
                                <label 
                                  htmlFor="resource-pv-upload"
                                  className="cursor-pointer px-3 py-1 bg-yellow-500 text-white rounded text-xs font-semibold hover:bg-yellow-600"
                                >
                                  + Solar (PV/CSP)
                                </label>
                                
                                <input
                                  type="file"
                                  accept=".csv"
                                  id="resource-wind-upload"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files[0]) handleResourceFileUpload(e.target.files[0], 'wind');
                                  }}
                                />
                                <label 
                                  htmlFor="resource-wind-upload"
                                  className="cursor-pointer px-3 py-1 bg-blue-500 text-white rounded text-xs font-semibold hover:bg-blue-600"
                                >
                                  + Wind
                                </label>
                                
                                <input
                                  type="file"
                                  accept=".csv"
                                  id="resource-other-upload"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files[0]) handleResourceFileUpload(e.target.files[0], 'other');
                                  }}
                                />
                                <label 
                                  htmlFor="resource-other-upload"
                                  className="cursor-pointer px-3 py-1 bg-gray-500 text-white rounded text-xs font-semibold hover:bg-gray-600"
                                >
                                  + Other Resource
                                </label>
                              </div>
                            </div>
                            <p className="text-xs text-gray-600 mt-2">
                              📋 First column must be "date", remaining columns are location names
                            </p>
                          </div>

                          {/* List of uploaded resource files */}
                          {wizardData.resourceFiles.length > 0 && (
                            <div className="space-y-2 mt-3">
                              {wizardData.resourceFiles.map((rf, idx) => (
                                <div key={idx} className="p-3 bg-white border border-gray-300 rounded-lg flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                      rf.type === 'pv' ? 'bg-yellow-100 text-yellow-800' :
                                      rf.type === 'wind' ? 'bg-blue-100 text-blue-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {rf.type.toUpperCase()}
                                    </span>
                                    <div className="flex-1">
                                      <p className="text-sm font-semibold text-gray-800">{rf.name}</p>
                                      <p className="text-xs text-gray-600">
                                        {rf.data.length} rows × {rf.columns.length} columns
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => removeResourceFile(rf.name)}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                  >
                                    <FiX size={18} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className={`rounded-xl p-5 border-2 ${
                    wizardData.locationsData && wizardData.linksData
                      ? 'bg-gray-50 border-gray-400'
                      : 'bg-gray-50 border-gray-300'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">
                        {wizardData.locationsData && wizardData.linksData ? '✅' : '⚠️'}
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-gray-800 mb-2">Upload Status</h5>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {/* Required files */}
                          <div className="flex items-center gap-2">
                            {wizardData.modelName ? 
                              <span className="text-green-600">✓</span> : 
                              <span className="text-red-500">✗</span>
                            }
                            <span>Model name</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {wizardData.locationsData ? 
                              <span className="text-green-600">✓ {wizardData.locationsData.length} locations</span> : 
                              <span className="text-red-500">✗ Locations required</span>
                            }
                          </div>
                          <div className="flex items-center gap-2">
                            {wizardData.linksData ? 
                              <span className="text-green-600">✓ {wizardData.linksData.length} links</span> : 
                              <span className="text-red-500">✗ Links required</span>
                            }
                          </div>
                          
                          {/* Optional files */}
                          <div className="flex items-center gap-2">
                            {wizardData.technologiesData ? 
                              <span className="text-blue-600">✓ {Object.keys(wizardData.technologiesData).length} technologies</span> : 
                              <span className="text-gray-400">○ Technologies</span>
                            }
                          </div>
                          <div className="flex items-center gap-2">
                            {wizardData.scenariosData ? 
                              <span className="text-purple-600">✓ Scenarios</span> : 
                              <span className="text-gray-400">○ Scenarios</span>
                            }
                          </div>
                          <div className="flex items-center gap-2">
                            {wizardData.demandData ? 
                              <span className="text-gray-600">✓ Demand data</span> : 
                              <span className="text-gray-400">○ Demand data</span>
                            }
                          </div>
                          <div className="flex items-center gap-2">
                            {wizardData.resourceFiles.length > 0 ? 
                              <span className="text-green-600">✓ {wizardData.resourceFiles.length} resource files</span> : 
                              <span className="text-gray-400">○ Resource timeseries</span>
                            }
                          </div>
                          <div className="flex items-center gap-2">
                            {wizardData.parsedConfig ? 
                              <span className="text-gray-600">✓ Config</span> : 
                              <span className="text-gray-400">○ Configuration</span>
                            }
                          </div>
                        </div>
                        {wizardData.locationsData && wizardData.linksData && wizardData.modelName && (
                          <div className="mt-3 p-3 bg-green-50 rounded-lg border-2 border-green-500">
                            <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                              <FiCheck className="text-green-600" size={18} />
                              Ready to create! Click "Next" to review and finalize your model.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Review and Create */}
              {wizardStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xl font-bold text-gray-800 mb-2">Review Your Model</h4>
                    <p className="text-sm text-gray-600">
                      Review the uploaded data below before creating your model
                    </p>
                  </div>

                  {/* Model Summary */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6">
                    <h5 className="font-bold text-gray-800 mb-4 text-lg">Model Overview</h5>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <FiMap className="text-gray-600 text-xl" />
                          </div>
                          <span className="font-semibold text-gray-800">Locations</span>
                        </div>
                        <div className="text-3xl font-bold text-gray-600">
                          {wizardData.locationsData?.length || 0}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Sites, substations, and nodes
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <FiZap className="text-gray-600 text-xl" />
                          </div>
                          <span className="font-semibold text-gray-800">Links</span>
                        </div>
                        <div className="text-3xl font-bold text-gray-600">
                          {wizardData.linksData?.length || 0}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Transmission connections
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <FiActivity className="text-gray-600 text-xl" />
                          </div>
                          <span className="font-semibold text-gray-800">Demand Data</span>
                        </div>
                        <div className="text-3xl font-bold text-gray-600">
                          {wizardData.demandData ? '✓' : '—'}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {wizardData.demandData ? `${wizardData.demandData.length} timesteps` : 'Not included'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Locations Preview */}
                  {wizardData.locationsData && (
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="font-bold text-gray-800 flex items-center gap-2">
                          <FiMap className="text-gray-600" />
                          Locations Preview
                        </h5>
                        <span className="text-sm text-gray-500">
                          {wizardData.locationsData.length} total
                        </span>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left p-2 font-semibold text-gray-700">Name</th>
                              <th className="text-left p-2 font-semibold text-gray-700">Type</th>
                              <th className="text-left p-2 font-semibold text-gray-700">Coordinates</th>
                              <th className="text-left p-2 font-semibold text-gray-700">Tech</th>
                              <th className="text-left p-2 font-semibold text-gray-700">Capacity (MW)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wizardData.locationsData.slice(0, 10).map((loc, idx) => (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="p-2 font-mono text-xs">{loc.name || loc.Name || loc.location_name || `Location ${idx + 1}`}</td>
                                <td className="p-2">
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                                    (loc.type || loc.Type) === 'node' ? 'bg-gray-100 text-gray-700' : 
                                    (loc.type || loc.Type) === 'substation' ? 'bg-gray-100 text-gray-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {loc.type || loc.Type || 'site'}
                                  </span>
                                </td>
                                <td className="p-2 text-xs text-gray-600">
                                  {(loc.lat || loc.latitude)?.toFixed(2)}, {(loc.lon || loc.longitude)?.toFixed(2)}
                                </td>
                                <td className="p-2">
                                  {loc.techs ? (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                      {loc.techs}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="p-2 text-xs text-gray-600">
                                  {loc.energy_cap_max ? parseFloat(loc.energy_cap_max).toLocaleString() : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {wizardData.locationsData.length > 10 && (
                          <div className="text-center py-3 text-sm text-gray-500 bg-gray-50">
                            ... and {wizardData.locationsData.length - 10} more locations
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Links Preview */}
                  {wizardData.linksData && (
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="font-bold text-gray-800 flex items-center gap-2">
                          <FiZap className="text-gray-600" />
                          Transmission Links Preview
                        </h5>
                        <span className="text-sm text-gray-500">
                          {wizardData.linksData.length} total
                        </span>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left p-2 font-semibold text-gray-700">From</th>
                              <th className="text-left p-2 font-semibold text-gray-700">To</th>
                              <th className="text-left p-2 font-semibold text-gray-700">Distance</th>
                              <th className="text-left p-2 font-semibold text-gray-700">Capacity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wizardData.linksData.slice(0, 10).map((link, idx) => (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="p-2 font-mono text-xs">{link.from || link.From || link.source}</td>
                                <td className="p-2 font-mono text-xs">{link.to || link.To || link.target}</td>
                                <td className="p-2 text-xs text-gray-600">
                                  {(link.distance || link.Distance || 0).toFixed(1)} km
                                </td>
                                <td className="p-2 text-xs text-gray-600">
                                  {(link.capacity || link.Capacity || link.energy_cap_max || 0).toFixed(0)} MW
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {wizardData.linksData.length > 10 && (
                          <div className="text-center py-3 text-sm text-gray-500 bg-gray-50">
                            ... and {wizardData.linksData.length - 10} more links
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Demand Data Preview */}
                  {wizardData.demandData && wizardData.demandData.length > 0 && (
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="font-bold text-gray-800 flex items-center gap-2">
                          <FiActivity className="text-gray-600" />
                          Demand Timeseries Preview
                        </h5>
                        <span className="text-sm text-gray-500">
                          {wizardData.demandData.length} timesteps × {Object.keys(wizardData.demandData[0] || {}).length - 1} locations
                        </span>
                      </div>
                      
                      {/* Columns List */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                        <p className="text-sm font-semibold text-gray-900 mb-2">
                          Columns found: {Object.keys(wizardData.demandData[0] || {}).length}
                        </p>
                        <div className="max-h-32 overflow-y-auto">
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(wizardData.demandData[0] || {}).map((col, idx) => (
                              <span key={idx} className={`px-2 py-1 rounded text-xs font-mono border ${
                                idx === 0 ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-white text-gray-700 border-gray-300'
                              }`}>
                                {idx === 0 && '🕐 '}{col}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Sample Data Table */}
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="max-h-48 overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                {Object.keys(wizardData.demandData[0] || {}).slice(0, 6).map((col, idx) => (
                                  <th key={idx} className="text-left p-2 font-semibold text-gray-900 border-b border-gray-200">
                                    {col}
                                  </th>
                                ))}
                                {Object.keys(wizardData.demandData[0] || {}).length > 6 && (
                                  <th className="text-left p-2 font-semibold text-gray-900 border-b border-gray-200">...</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {wizardData.demandData.slice(0, 5).map((row, idx) => (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                  {Object.keys(wizardData.demandData[0] || {}).slice(0, 6).map((col, colIdx) => (
                                    <td key={colIdx} className="p-2 text-gray-700">
                                      {colIdx === 0 ? row[col] : (typeof row[col] === 'number' ? row[col].toFixed(2) : row[col])}
                                    </td>
                                  ))}
                                  {Object.keys(wizardData.demandData[0] || {}).length > 6 && (
                                    <td className="p-2 text-gray-500">...</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {wizardData.demandData.length > 5 && (
                          <div className="text-center py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-200">
                            ... and {wizardData.demandData.length - 5} more timesteps
                          </div>
                        )}
                      </div>

                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-800">
                          ✓ Data will be linked to matching location names automatically
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Configuration Preview */}
                  {wizardData.parsedConfig && (
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="font-bold text-gray-800 flex items-center gap-2">
                          <FiDatabase className="text-gray-600" />
                          Additional Configuration
                        </h5>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {wizardData.parsedConfig.tech_groups && (
                            <div>
                              <span className="text-gray-900 font-semibold">Technology Groups:</span>
                              <span className="ml-2 text-gray-700">
                                {Object.keys(wizardData.parsedConfig.tech_groups).length}
                              </span>
                            </div>
                          )}
                          {wizardData.parsedConfig.overrides && (
                            <div>
                              <span className="text-gray-900 font-semibold">Overrides:</span>
                              <span className="ml-2 text-gray-700">Yes</span>
                            </div>
                          )}
                          {wizardData.parsedConfig.scenarios && (
                            <div>
                              <span className="text-gray-900 font-semibold">Scenarios:</span>
                              <span className="ml-2 text-gray-700">
                                {Object.keys(wizardData.parsedConfig.scenarios).length}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ready to Create */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-400 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="text-4xl">✅</div>
                      <div className="flex-1">
                        <h5 className="font-bold text-gray-900 text-lg mb-2">Ready to Create Model</h5>
                        <p className="text-sm text-gray-800 mb-3">
                          Your model "<strong>{wizardData.modelName}</strong>" is ready to be created with the data shown above.
                        </p>
                        <div className="bg-white rounded-lg p-3 border border-gray-300">
                          <ul className="text-sm text-gray-700 space-y-1">
                            <li>✓ {wizardData.locationsData?.length || 0} locations will be imported</li>
                            <li>✓ {wizardData.linksData?.length || 0} transmission links will be created</li>
                            {wizardData.demandData && (
                              <li>✓ Demand data will be linked to locations</li>
                            )}
                            {wizardData.parsedConfig && (
                              <li>✓ Additional configuration will be applied</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Edit and Review Configuration */}
              {wizardStep === 3 && (
                <div className="space-y-6">
                  {/* Template Download Section */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6 mb-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="p-3 bg-gray-600 rounded-lg">
                        <FiDownload className="text-white text-2xl" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-gray-800 mb-2">Download Templates</h4>
                        <p className="text-gray-700 mb-4">
                          Download the JSON configuration template and CSV time-series templates. 
                          The JSON file defines your model structure (locations, links, technologies), 
                          while CSV files contain time-varying data (demand profiles, resource availability).
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      {/* JSON Config Template */}
                      <div className="bg-white rounded-lg border-2 border-gray-300 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FiDatabase className="text-gray-600 text-xl" />
                          <h5 className="font-semibold text-gray-800">Model Configuration (JSON)</h5>
                        </div>
                        
                        <div className="mb-4 text-sm text-gray-700 space-y-2">
                          <p className="font-medium">Contains:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                            <li><strong>Locations</strong>: Sites and nodes with coordinates</li>
                            <li><strong>Technologies</strong>: Tech assignments per location</li>
                            <li><strong>Links</strong>: Transmission connections</li>
                            <li><strong>Constraints</strong>: Capacities, efficiencies, etc.</li>
                            <li><strong>References</strong>: Links to CSV time-series files</li>
                          </ul>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-3 text-xs">
                          <p className="text-gray-800">
                            <strong>Example:</strong> References like <code className="bg-white px-1">file=demand_berlin.csv</code> link to time-series data
                          </p>
                        </div>

                        <button
                          onClick={() => downloadTemplate('config')}
                          className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium"
                        >
                          <FiDownload size={16} />
                          Download JSON Template
                        </button>
                      </div>

                      {/* Time Series Templates */}
                      <div className="bg-white rounded-lg border-2 border-gray-300 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FiActivity className="text-gray-600 text-xl" />
                          <h5 className="font-semibold text-gray-800">Time-Series Data (CSV)</h5>
                        </div>
                        
                        <div className="mb-4 text-sm text-gray-700 space-y-2">
                          <p className="font-medium">Available templates:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                            <li><strong>Demand</strong>: Hourly electricity demand</li>
                            <li><strong>Solar</strong>: Solar resource availability (0-1)</li>
                            <li><strong>Wind</strong>: Wind resource availability (0-1)</li>
                          </ul>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-3 text-xs">
                          <p className="text-gray-800">
                            Each CSV has <code className="bg-white px-1">timestep</code> and <code className="bg-white px-1">value</code> columns
                          </p>
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={() => downloadTemplate('demand')}
                            className="w-full px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                          >
                            <FiDownload size={14} />
                            Demand CSV
                          </button>
                          <button
                            onClick={() => downloadTemplate('solar')}
                            className="w-full px-3 py-1.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                          >
                            <FiDownload size={14} />
                            Solar Resource CSV
                          </button>
                          <button
                            onClick={() => downloadTemplate('wind')}
                            className="w-full px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                          >
                            <FiDownload size={14} />
                            Wind Resource CSV
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Instructions */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h5 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <span className="text-gray-600">📋</span>
                        Quick Start Guide
                      </h5>
                      <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                        <li>Download the <strong>JSON configuration template</strong></li>
                        <li>Edit it with your locations, links, and technology assignments</li>
                        <li>Download relevant <strong>CSV templates</strong> for time-series data (demand, solar, wind)</li>
                        <li>Fill the CSV files with your hourly/time-step data</li>
                        <li>Reference CSV files in your JSON config (e.g., <code className="bg-gray-100 px-1">file=demand_berlin.csv</code>)</li>
                        <li>Upload both JSON and CSV files in Step 2</li>
                      </ol>
                      
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                        <p className="text-xs text-gray-800">
                          💡 <strong>Tip:</strong> You can create multiple demand/resource CSV files for different locations. 
                          Just reference them correctly in your JSON configuration.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Model Information Form */}
                  <div>
                    <h4 className="text-xl font-semibold text-gray-800 mb-4">Model Information</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Model Name <span className="text-gray-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={wizardData.modelName}
                          onChange={(e) => setWizardData(prev => ({ ...prev, modelName: e.target.value }))}
                          placeholder="e.g., My Energy System Model"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                        <textarea
                          value={wizardData.description}
                          onChange={(e) => setWizardData(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Brief description of your energy system model..."
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
              <button
                onClick={() => {
                  if (wizardStep > 1) setWizardStep(wizardStep - 1);
                }}
                disabled={wizardStep === 1}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>

              <div className="flex items-center gap-3">
                {wizardStep < 2 ? (
                  <button
                    onClick={() => {
                      if (!wizardData.modelName.trim()) {
                        showNotification('Please enter a model name', 'error');
                        return;
                      }
                      if (!wizardData.locationsData) {
                        showNotification('Please upload a locations file', 'error');
                        return;
                      }
                      if (!wizardData.linksData) {
                        showNotification('Please upload a links file', 'error');
                        return;
                      }
                      setWizardStep(wizardStep + 1);
                    }}
                    className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all shadow-md font-medium"
                  >
                    Next: Review →
                  </button>
                ) : (
                  <button
                    onClick={completeWizard}
                    className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all shadow-md font-medium flex items-center gap-2"
                  >
                    <FiCheck size={18} />
                    Create Model
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Models;
