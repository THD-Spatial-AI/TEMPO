import React, { useState, useRef } from 'react';
import { FiFolder, FiTrash2, FiEdit2, FiCheck, FiX, FiPlus, FiDownload, FiUpload, FiMap, FiZap, FiInfo, FiEye, FiChevronDown, FiChevronRight, FiCpu, FiDatabase, FiActivity, FiLayers, FiUploadCloud, FiPackage, FiSearch } from './ui/icons';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { useData } from '../context/DataContext';
import CSVUploader from './CSVUploader';
import { fetchTemplate } from '../utils/templateFetch';
import CalliopeYAMLImporter from './CalliopeYAMLImporter';
import CSVImportWizard from './CSVImportWizard';
import TranslationReport from './TranslationReport';
import { detectArchiveFormat } from '../services/archiveFormat';
import { importModelArchive } from '../services/engineClient';
import { useCsvImportWizard } from '../hooks/useCsvImportWizard';
import Select from './ui/Select';
import { confirmAction } from './ui/confirm';

const Models = () => {
  const { models, setModels, currentModelId, loadModel, deleteModel, renameModel, createModel, setTimeSeries, setOverrides, setScenarios, showNotification } = useData();
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [showYAMLImporter, setShowYAMLImporter] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editingModelId, setEditingModelId] = useState(null);
  const [editModalName, setEditModalName] = useState('');
  const [editModalDesc, setEditModalDesc] = useState('');
  const [renamingTsId, setRenamingTsId] = useState(null);
  const [renamingTsName, setRenamingTsName] = useState('');
  const [showCSVWizard, setShowCSVWizard] = useState(false);
  const [archiveImporting, setArchiveImporting] = useState(false);
  const [importReport, setImportReport] = useState([]);
  const archiveInputRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Import a framework archive (PyPSA / OSeMOSYS / AdOpT-NET0): detect the
  // format from the ZIP file listing, then let that engine's Python service
  // parse and translate it into a TEMPO model.
  const handleArchiveFile = async (file) => {
    if (!file) return;
    setArchiveImporting(true);
    setImportReport([]);
    try {
      const zip = await JSZip.loadAsync(file);
      const format = detectArchiveFormat(Object.keys(zip.files));

      if (format === 'calliope') {
        setShowCreatePanel(false);
        setShowYAMLImporter(true);
        showNotification('This is a Calliope archive — use the YAML importer that just opened.', 'info');
        return;
      }
      if (format === 'unknown') {
        showNotification('Could not detect the archive format (expected PyPSA, OSeMOSYS, AdOpT-NET0, or Calliope).', 'error');
        return;
      }

      const { model, report, extraModels } = await importModelArchive(format, file);
      const name = model.name || file.name.replace(/\.zip$/i, '');
      createModel(
        name,
        model.locations || [],
        model.links || [],
        [],
        model.technologies || [],
        model.timeSeries || [],
        {
          source: `${format}_import`,
          modelConfig: model.modelConfig || {},
          description: `Imported from ${format} archive: ${file.name}`,
        },
      );
      for (const extra of extraModels || []) {
        const extraName = extra.name || `${name} (extra)`;
        createModel(
          extraName,
          extra.locations || [],
          extra.links || [],
          [],
          extra.technologies || [],
          extra.timeSeries || [],
          {
            source: `${format}_import`,
            modelConfig: extra.modelConfig || {},
            description: `Imported from ${format} archive: ${file.name}`,
          },
        );
      }
      setImportReport(report || []);
      const total = 1 + (extraModels?.length || 0);
      showNotification(
        total > 1 ? `${total} models imported from ${format} archive!` : `${name} imported from ${format} archive!`,
        'success'
      );
      setShowCreatePanel(false);
    } catch (err) {
      console.error('Archive import error:', err);
      showNotification(`Import failed: ${err.message}`, 'error');
    } finally {
      setArchiveImporting(false);
      if (archiveInputRef.current) archiveInputRef.current.value = '';
    }
  };
  const csvWizard = useCsvImportWizard({ createModel, setOverrides, setScenarios, showNotification, setShowCSVWizard });
  const [expandedLocation, setExpandedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);

  const currentModel = models.find((m) => m.id === currentModelId);

  const MODEL_TYPES = [
    {
      id: 'calliope',
      name: 'Calliope',
      shortDesc: 'Multi-carrier LP energy system model',
      longDesc: 'Supports Calliope 0.6.8 and 0.7. Import via YAML archive or CSV wizard.',
      icon: <FiZap size={18} />,
      color: 'blue',
      enabled: true,
    },
    {
      id: 'adoptnet0',
      name: 'AdOpT-NET0',
      shortDesc: 'Net-zero transition pathway optimization',
      longDesc: 'Capacity expansion model focused on net-zero energy system transitions.',
      icon: <FiActivity size={18} />,
      color: 'gray',
      enabled: false,
    },
    {
      id: 'osemosys',
      name: 'OSeMOSYS',
      shortDesc: 'Open Source energy Modelling SYStem',
      longDesc: 'Long-run energy planning model widely used for policy analysis.',
      icon: <FiDatabase size={18} />,
      color: 'gray',
      enabled: false,
    },
    {
      id: 'pypsa',
      name: 'PyPSA',
      shortDesc: 'Python for Power System Analysis',
      longDesc: 'Network-constrained power flow and capacity expansion model.',
      icon: <FiCpu size={18} />,
      color: 'gray',
      enabled: false,
    },
  ];

  const getModelTypeBadgeLabel = (model) => {
    const type = model.modelType || 'calliope';
    if (type === 'calliope') {
      const ver = model.metadata?.modelConfig?.calliopeVersion;
      return ver ? `Calliope ${ver}` : 'Calliope';
    }
    const found = MODEL_TYPES.find(mt => mt.id === type);
    return found ? found.name : type;
  };

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

  const handleDelete = async (modelId) => {
    if (await confirmAction({ title: 'Delete this model?', message: 'Its locations, links, technologies and time series will be permanently removed.', details: models.find(m => m.id === modelId)?.name })) {
      deleteModel(modelId);
    }
  };

  const openEditModal = (model) => {
    setEditingModelId(model.id);
    setEditModalName(model.name);
    setEditModalDesc(model.metadata?.description || '');
    setRenamingTsId(null);
  };

  const saveEditName = () => {
    if (editModalName.trim()) {
      renameModel(editingModelId, editModalName.trim());
      showNotification('Name updated', 'success');
    }
  };

  const saveEditDesc = () => {
    setModels(prev => prev.map(m =>
      m.id === editingModelId
        ? { ...m, metadata: { ...m.metadata, description: editModalDesc }, updatedAt: new Date().toISOString() }
        : m
    ));
    showNotification('Description updated', 'success');
  };

  const deleteTs = (modelId, tsId) => {
    setModels(prev => prev.map(m =>
      m.id === modelId
        ? { ...m, timeSeries: (m.timeSeries || []).filter(ts => ts.id !== tsId), updatedAt: new Date().toISOString() }
        : m
    ));
    if (currentModelId === modelId) {
      setTimeSeries(prev => prev.filter(ts => ts.id !== tsId));
    }
    showNotification('Time series removed', 'success');
  };

  const saveTsRename = (modelId) => {
    if (!renamingTsName.trim()) return;
    setModels(prev => prev.map(m =>
      m.id === modelId
        ? { ...m, timeSeries: (m.timeSeries || []).map(ts => ts.id === renamingTsId ? { ...ts, name: renamingTsName.trim() } : ts), updatedAt: new Date().toISOString() }
        : m
    ));
    if (currentModelId === modelId) {
      setTimeSeries(prev => prev.map(ts => ts.id === renamingTsId ? { ...ts, name: renamingTsName.trim() } : ts));
    }
    setRenamingTsId(null);
    showNotification('Time series renamed', 'success');
  };

  const handleAddTsFile = (e) => {
    Array.from(e.target.files).forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          const columns = results.meta.fields || [];
          const newTs = {
            id: `ts_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: file.name.replace(/\.csv$/i, ''),
            fileName: file.name,
            uploadedAt: new Date().toISOString(),
            data: results.data,
            columns,
            rowCount: results.data.length,
            type: 'other',
            modelId: editingModelId,
          };
          setModels(prev => prev.map(m =>
            m.id === editingModelId
              ? { ...m, timeSeries: [...(m.timeSeries || []), newTs], updatedAt: new Date().toISOString() }
              : m
          ));
          if (currentModelId === editingModelId) {
            setTimeSeries(prev => [...prev, newTs]);
          }
          showNotification(`Added ${file.name}`, 'success');
        },
        error: (err) => showNotification(`Error reading ${file.name}: ${err.message}`, 'error'),
      });
    });
    e.target.value = '';
  };

  const downloadTemplateFile = async (filename, displayName) => {
    try {
      const response = await fetchTemplate(filename);
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


  const loadTemplateModel = async (template) => {
    try {
      const locationsResponse = await fetchTemplate(template.locationsFile);
      const linksResponse = await fetchTemplate(template.linksFile);

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
          const demandResponse = await fetchTemplate(template.demandFile);
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
            const resourceResponse = await fetchTemplate(resourceFile.file);
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
          const techResponse = await fetchTemplate(template.technologiesFile);
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
          const scenariosResponse = await fetchTemplate(template.scenariosFile);
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
          const modelDataResponse = await fetchTemplate(template.modelDataFile);
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
          },
          // Preserve CSV metadata columns (small strings, survive persistence)
          demand_types: (loc.demand_types || loc.demand_type || '').toString().trim(),
          resource_files: (loc.resource_files || loc.resource_file || '').toString().trim(),
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

  const filteredModels = models.filter(m => {
    const matchesSearch = !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || (m.modelType || m.metadata?.modelType || 'calliope') === filterType;
    return matchesSearch && matchesType;
  });
  const allSelected = filteredModels.length > 0 && filteredModels.every(m => selectedIds.has(m.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); filteredModels.forEach(m => next.delete(m.id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); filteredModels.forEach(m => next.add(m.id)); return next; });
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (!(await confirmAction({ title: `Delete ${count} model${count > 1 ? 's' : ''}?`, message: 'The selected models and all their data will be permanently removed.' }))) return;
    selectedIds.forEach(id => deleteModel(id));
    setSelectedIds(new Set());
    showNotification(`Deleted ${count} model${count > 1 ? 's' : ''}`, 'success');
  };

  const handleBulkExport = () => {
    const toExport = models.filter(m => selectedIds.has(m.id));
    toExport.forEach(model => {
      const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    showNotification(`Exported ${toExport.length} model${toExport.length > 1 ? 's' : ''}`, 'success');
    setSelectedIds(new Set());
  };

  return (
    <div className="flex-1 p-8 bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Models</h1>
        <p className="mt-1 text-sm text-slate-500">Import, manage and switch between your energy system models.</p>
      </div>

      {/* Calliope YAML Importer panel */}
      {showYAMLImporter && (
        <div className="mb-6">
          <CalliopeYAMLImporter
            onClose={() => setShowYAMLImporter(false)}
            onImport={(name, locations, links, parameters, technologies, timeSeries, metadata, overrides, scenarios) => {
              createModel(name, locations, links, parameters, technologies, timeSeries, { ...metadata, modelType: 'calliope' }, overrides, scenarios);
              showNotification(`Calliope model "${name}" imported successfully!`, 'success');
              setShowYAMLImporter(false);
            }}
          />
        </div>
      )}

      {/* Create New Model — model type cards */}
      <div className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Import a model</h2>
          <p className="mt-0.5 text-sm text-slate-500">Choose the format of your model files.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MODEL_TYPES.map((mt) => (
            <button
              key={mt.id}
              disabled={!mt.enabled}
              onClick={() => mt.enabled && setShowCreatePanel(true)}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all  flex items-center gap-3 ${
                mt.enabled
                  ? 'bg-white border-black/15 hover:border-black/15 hover: cursor-pointer'
                  : 'bg-gray-50 border-black/15 cursor-not-allowed opacity-60'
              }`}
            >
              <div className={`w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0 ${mt.enabled ? 'text-gray-600' : 'text-gray-400'}`}>
                {mt.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800 text-sm truncate">{mt.name}</div>
                <div className="text-[11px] text-slate-500 leading-snug truncate">{mt.shortDesc}</div>
              </div>
              {mt.enabled ? (
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black text-white text-[11px] font-semibold whitespace-nowrap ">
                  <FiPlus size={12} />
                  Import
                </span>
              ) : (
                <span className="flex-shrink-0 px-2 py-0.5 bg-gray-200 text-gray-600 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Calliope import method chooser modal */}
      {showCreatePanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/15">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Import Calliope Model</h3>
                <p className="text-sm text-slate-500 mt-0.5">Choose how to bring your model into TEMPO</p>
              </div>
              <button
                onClick={() => setShowCreatePanel(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FiX size={24} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <button
                onClick={() => { setShowCreatePanel(false); setShowYAMLImporter(true); }}
                className="flex flex-col items-start p-5 border-2 border-black/15 rounded-xl hover:border-black/15 hover:bg-gray-50 transition-all text-left group"
              >
                <div className="p-2 bg-gray-100 rounded-lg mb-3 group-hover:bg-gray-200 transition-colors">
                  <FiPackage size={22} className="text-gray-700" />
                </div>
                <div className="font-bold text-slate-800 mb-1">YAML Archive</div>
                <div className="text-xs text-slate-500">Import a Calliope 0.6.8 or 0.7 YAML model bundle</div>
              </button>
              <button
                onClick={() => { setShowCreatePanel(false); setShowCSVWizard(true); }}
                className="flex flex-col items-start p-5 border-2 border-black/15 rounded-xl hover:border-black/15 hover:bg-gray-50 transition-all text-left group"
              >
                <div className="p-2 bg-gray-100 rounded-lg mb-3 group-hover:bg-gray-200 transition-colors">
                  <FiUpload size={22} className="text-gray-700" />
                </div>
                <div className="font-bold text-slate-800 mb-1">CSV Wizard</div>
                <div className="text-xs text-slate-500">Build a model from locations, links and timeseries CSV files</div>
              </button>
              <button
                onClick={() => archiveInputRef.current?.click()}
                disabled={archiveImporting}
                className="flex flex-col items-start p-5 border-2 border-black/15 rounded-xl hover:border-black/15 hover:bg-gray-50 transition-all text-left group disabled:opacity-50 col-span-2"
              >
                <div className="p-2 bg-gray-100 rounded-lg mb-3 group-hover:bg-gray-200 transition-colors">
                  <FiUploadCloud size={22} className="text-gray-700" />
                </div>
                <div className="font-bold text-slate-800 mb-1">
                  {archiveImporting ? 'Importing…' : 'Framework Archive (auto-detect)'}
                </div>
                <div className="text-xs text-slate-500">
                  Import a PyPSA (netCDF/CSV), OSeMOSYS, or AdOpT-NET0 archive — TEMPO detects the
                  format and translates it. Requires the matching engine to be installed (Settings).
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for framework-archive imports */}
      <input
        ref={archiveInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => handleArchiveFile(e.target.files?.[0])}
      />

      {/* Translation report from the last framework-archive import */}
      {importReport.length > 0 && (
        <div className="mb-6">
          <TranslationReport report={importReport} title="Import translation report" />
        </div>
      )}

      {/* Your Models Section */}
      <div className="mb-8 rounded-2xl border border-black/15 bg-white p-6 ">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              Your Models
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {filteredModels.length !== models.length ? `${filteredModels.length} of ${models.length}` : models.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500">Models saved on this device.</p>
          </div>
        </div>

        {models.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <FiSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search models"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-lg border border-black/15 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-black/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="w-52">
              <Select
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: 'all', label: 'All types', description: `${models.length} model${models.length === 1 ? '' : 's'}` },
                  ...[['calliope', 'Calliope'], ['pypsa', 'PyPSA'], ['osemosys', 'OSeMOSYS'], ['adoptnet0', 'AdOpT-NET0']].map(([value, label]) => {
                    const n = models.filter(m => (m.modelType || m.metadata?.modelType || 'calliope') === value).length;
                    return { value, label, description: `${n} model${n === 1 ? '' : 's'}` };
                  }),
                ]}
              />
            </div>
          </div>
        )}

        {someSelected && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm text-white shadow-lg shadow-slate-900/20">
            <span className="flex-1 font-medium">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkExport}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <FiDownload size={13} />
              Export
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1 bg-red-500/70 hover:bg-red-500 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <FiTrash2 size={13} />
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Clear selection"
            >
              <FiX size={15} />
            </button>
          </div>
        )}

        {models.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-black/15 px-6 py-12 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500"><FiFolder size={20} /></div>
            <p className="text-sm font-semibold text-slate-800">No models yet</p>
            <p className="mb-5 mt-1 text-sm text-slate-500">Pick a model type above, or load a template below.</p>
            <button
              onClick={() => setShowCreatePanel(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white  transition-colors hover:bg-black/80"
            >
              <FiPlus size={16} />
              Create Your First Model
            </button>
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-black/15 px-6 py-10 text-center">
            <FiSearch size={18} className="mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">No matches</p>
            <p className="mt-1 text-sm text-slate-500">No models match your search or type filter.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-black/15">
            <label className="flex cursor-pointer items-center gap-3 border-b border-black/15 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 cursor-pointer rounded border-black/15 accent-slate-900"
              />
              Select all ({filteredModels.length})
            </label>
            <div className="divide-y divide-black/10">
            {filteredModels.map((model) => {
              const active = currentModelId === model.id;
              const selected = selectedIds.has(model.id);
              const stats = [
                [model.locations?.length || 0, 'locations'],
                [model.links?.length || 0, 'links'],
                [model.technologies?.length || 0, 'techs'],
                ...((model.timeSeries?.length || 0) > 0 ? [[model.timeSeries.length, 'time series']] : []),
                ...(Object.keys(model.scenarios || {}).length > 0 ? [[Object.keys(model.scenarios).length, 'scenarios']] : []),
              ];
              return (
              <div
                key={model.id}
                className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
                  selected ? 'bg-slate-100' : active ? 'bg-emerald-50/40' : 'hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(model.id)}
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-black/15 accent-slate-900"
                />
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-black text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <FiPackage size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{model.name}</span>
                    {active && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    )}
                    {model.metadata?.template && (
                      <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Template</span>
                    )}
                    <span className="rounded-md border border-black/15 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {getModelTypeBadgeLabel(model)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {stats.map(([n, label]) => (
                      <span key={label} className="rounded-md bg-slate-100 px-1.5 py-0.5">
                        <span className="font-semibold tabular-nums text-slate-800">{n}</span> {label}
                      </span>
                    ))}
                    <span className="ml-1 text-[11px] text-slate-400">Updated {new Date(model.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!active && (
                    <button
                      onClick={() => loadModel(model.id)}
                      className="h-9 rounded-lg bg-black px-4 text-sm font-semibold text-white transition-colors hover:bg-black/80"
                    >
                      Load
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(model)}
                    aria-label="Edit model"
                    title="Edit model"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-black/15 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <FiEdit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(model.id)}
                    aria-label="Delete model"
                    title="Delete model"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-black/15 bg-white text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <FiTrash2 size={18} />
                  </button>
                </div>
              </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Edit Model Modal */}
      {editingModelId && (() => {
        const em = models.find(m => m.id === editingModelId);
        if (!em) return null;
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-black/15">
                <h3 className="text-lg font-bold text-slate-800">Edit Model</h3>
                <button onClick={() => setEditingModelId(null)} className="text-gray-400 hover:text-gray-600">
                  <FiX size={22} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name</label>
                  <div className="flex gap-2">
                    <input
                      value={editModalName}
                      onChange={(e) => setEditModalName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
                      className="flex-1 px-3 py-2 border border-black/15 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                    <button onClick={saveEditName} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-black/80">
                      Save
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={editModalDesc}
                      onChange={(e) => setEditModalDesc(e.target.value)}
                      rows={2}
                      className="flex-1 px-3 py-2 border border-black/15 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                    />
                    <button onClick={saveEditDesc} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-black/80">
                      Save
                    </button>
                  </div>
                </div>

                {/* Time Series Files */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Time Series Files
                      <span className="ml-2 text-xs font-normal text-slate-400">({em.timeSeries?.length || 0})</span>
                    </label>
                    <label className="cursor-pointer px-3 py-1.5 bg-black text-white rounded-lg text-xs font-medium hover:bg-black/80 inline-flex items-center gap-1">
                      <FiPlus size={12} />
                      Add CSV
                      <input type="file" accept=".csv" multiple className="hidden" onChange={handleAddTsFile} />
                    </label>
                  </div>

                  {(em.timeSeries?.length || 0) === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-black/15 rounded-lg">
                      No time series files — click Add CSV to upload one
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {em.timeSeries.map((ts) => (
                        <div key={ts.id} className="flex items-center gap-2 px-3 py-2 border border-black/15 rounded-lg bg-gray-50">
                          {renamingTsId === ts.id ? (
                            <>
                              <input
                                value={renamingTsName}
                                onChange={(e) => setRenamingTsName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveTsRename(editingModelId)}
                                className="flex-1 px-2 py-1 border border-gray-400 rounded text-sm focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => saveTsRename(editingModelId)} className="p-1 text-gray-600 hover:text-gray-700">
                                <FiCheck size={15} />
                              </button>
                              <button onClick={() => setRenamingTsId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <FiX size={15} />
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">{ts.name || ts.fileName}</div>
                                <div className="text-[10px] text-slate-500">{ts.fileName} · {ts.rowCount || 0} rows</div>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                                ts.type === 'demand' ? 'bg-gray-100 text-gray-700' :
                                ts.type?.startsWith('resource') ? 'bg-gray-100 text-gray-700' :
                                'bg-gray-200 text-gray-600'
                              }`}>{ts.type || 'other'}</span>
                              <button
                                onClick={() => { setRenamingTsId(ts.id); setRenamingTsName(ts.name || ts.fileName || ''); }}
                                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded"
                                title="Rename"
                              >
                                <FiEdit2 size={13} />
                              </button>
                              <button
                                onClick={() => deleteTs(editingModelId, ts.id)}
                                className="p-1 text-slate-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Delete"
                              >
                                <FiTrash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-3 border-t flex justify-end">
                <button
                  onClick={() => setEditingModelId(null)}
                  className="px-5 py-2 border border-black/15 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Template Models Section */}
      <div className="mb-8 rounded-2xl border border-black/15 bg-white p-6 ">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            Template Models
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{TEMPLATE_MODELS.length}</span>
          </h2>
          <p className="text-xs text-slate-500">Ready-made example systems to explore or start from.</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_MODELS.map((template) => (
            <div key={template.id} className="flex flex-col overflow-hidden rounded-xl border border-black/15 bg-white  transition-all hover:border-black/15 hover:">

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-2xl ring-1 ring-slate-200">{template.country.split(' ')[0]}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{template.name}</div>
                    <div className="text-xs text-slate-500">{template.country.split(' ').slice(1).join(' ')}</div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500" title={template.description}>{template.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-500">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5"><span className="font-semibold tabular-nums text-slate-800">{template.locations.toLocaleString()}</span> locations</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5"><span className="font-semibold tabular-nums text-slate-800">{template.links.toLocaleString()}</span> links</span>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5"><span className="font-semibold tabular-nums text-slate-800">{template.technologies.length}</span> techs</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {template.technologies.slice(0, 4).map((tech, i) => (
                    <span key={i} className="rounded-full border border-black/15 px-2 py-0.5 text-[10px] text-slate-600">{tech}</span>
                  ))}
                  {template.technologies.length > 4 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">+{template.technologies.length - 4}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-black/10 px-4 py-2.5">
                <button
                  onClick={() => setViewingTemplate(viewingTemplate === template.id ? null : template.id)}
                  aria-expanded={viewingTemplate === template.id}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {viewingTemplate === template.id ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                  Files
                </button>
                <button
                  onClick={() => loadTemplateModel(template)}
                  className="ml-auto h-8 rounded-lg bg-black px-4 text-xs font-semibold text-white  transition-colors hover:bg-black/80"
                >
                  Load template
                </button>
              </div>

              {/* Expanded: files + tech tags */}
              {viewingTemplate === template.id && (
                <div className="space-y-3 border-t border-black/10 bg-slate-50/60 px-4 py-3">

                  {/* File list */}
                  <div className="space-y-1.5">
                    {[
                      { icon: FiMap,         label: 'Locations',         file: template.locationsFile,   required: true  },
                      { icon: FiZap,         label: 'Links',             file: template.linksFile,        required: true  },
                      { icon: FiActivity,    label: 'Demand timeseries', file: template.demandFile,       required: false },
                      ...(template.resourceFiles || []).map(rf => ({
                        icon: FiUploadCloud, label: rf.name,             file: rf.file,                   required: false,
                      })),
                      { icon: FiCpu,         label: 'Technologies',      file: template.technologiesFile, required: false },
                      { icon: FiLayers,      label: 'Scenarios',         file: template.scenariosFile,    required: false },
                      { icon: FiDatabase,    label: 'Statistics',        file: template.statisticsFile,   required: false },
                      ...(template.modelDataFile ? [{ icon: FiDatabase,  label: 'Model Config',          file: template.modelDataFile, required: false }] : []),
                    ].filter(f => f.file).map(({ icon: Icon, label, file, required }, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Icon size={12} className="text-gray-400 flex-shrink-0" />
                        <span className={`flex-1 truncate ${required ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {label}
                        </span>
                        {required && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">required</span>
                        )}
                        <button
                          onClick={() => downloadTemplateFile(file, label)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                          title={`Download ${label}`}
                        >
                          <FiDownload size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Download all */}
                  <button
                    onClick={() => downloadAllTemplateFiles(template)}
                    className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-black/15 bg-white text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <FiDownload size={11} />
                    Download all (
                    {[template.locationsFile, template.linksFile, template.demandFile,
                      ...(template.resourceFiles || []).map(r => r.file),
                      template.technologiesFile, template.scenariosFile,
                      template.statisticsFile, template.modelDataFile,
                    ].filter(Boolean).length} files)
                  </button>

                </div>
              )}

            </div>
          ))}
        </div>
      </div>

      {/* CSV Import Wizard Modal */}
      {showCSVWizard && (
        <CSVImportWizard
          wizardData={csvWizard.wizardData}
          setWizardData={csvWizard.setWizardData}
          onComplete={csvWizard.completeWizard}
          onClose={() => setShowCSVWizard(false)}
          downloadTemplate={csvWizard.downloadTemplate}
          handleLocationsFileUpload={csvWizard.handleLocationsFileUpload}
          handleLinksFileUpload={csvWizard.handleLinksFileUpload}
          handleDemandFileUpload={csvWizard.handleDemandFileUpload}
          handleTechnologiesFileUpload={csvWizard.handleTechnologiesFileUpload}
          handleScenariosFileUpload={csvWizard.handleScenariosFileUpload}
          handleConfigFileUpload={csvWizard.handleConfigFileUpload}
          handleResourceFileUpload={csvWizard.handleResourceFileUpload}
          removeResourceFile={csvWizard.removeResourceFile}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default Models;
