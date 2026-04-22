import React, { useState } from 'react';
import { useData } from '../context/DataContext';
import { FiDownload, FiFolder, FiFile, FiCheckCircle, FiAlertCircle, FiPackage, FiZap, FiActivity, FiCpu, FiSettings } from 'react-icons/fi';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { LINK_TYPES } from '../config/linkTypes';

const EXPORT_FORMATS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-blue-500 to-blue-600',
    supported: true
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis',
    icon: FiActivity,
    color: 'from-green-500 to-green-600',
    supported: false
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System',
    icon: FiCpu,
    color: 'from-purple-500 to-purple-600',
    supported: false
  },
  {
    id: 'adoptnet',
    name: 'AdoptNET',
    description: 'Adoption Network Energy Transition',
    icon: FiSettings,
    color: 'from-orange-500 to-orange-600',
    supported: false
  }
];

const Export = () => {
  const { getCurrentModel, technologies, timeSeries, overrides, scenarios } = useData();
  const currentModel = getCurrentModel();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('calliope');

  const generateModelYaml = (model) => {
    // Get date range from timeseries data or use current year
    let startDate, endDate;
    const modelTS = timeSeries.filter(ts => ts.modelId === model.id);
    
    if (modelTS.length > 0 && modelTS[0].data && modelTS[0].data.length > 0) {
      const firstRow = modelTS[0].data[0];
      const lastRow = modelTS[0].data[modelTS[0].data.length - 1];
      const dateCol = modelTS[0].columns[0]; // Usually first column is datetime
      
      if (firstRow[dateCol]) startDate = firstRow[dateCol];
      if (lastRow[dateCol]) endDate = lastRow[dateCol];
    }
    
    if (!startDate || !endDate) {
      const year = new Date().getFullYear();
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }
    
    // Extract model configuration from template metadata or use defaults
    const config = model.templateMetadata?.config || {};
    const calliopeVersion = config.calliope_version || '0.6.8';
    const mode = config.mode || 'plan';
    const ensureFeasibility = config.ensure_feasibility !== false;
    const bigM = config.bigM || 1e6;
    const zeroThreshold = config.zero_threshold || 1e-10;
    
    return `import:  
    # Links
    - 'model_config/links/transmission_links.yaml'
    - 'model_config/links/power_links.yaml'    
    
    # Locations
    - 'model_config/locations/locations.yaml'

    # Technologies
    - 'model_config/techs/techs_supply.yaml'
    - 'model_config/techs/techs_demand.yaml'
    - 'model_config/techs/techs_storage.yaml'
    - 'model_config/techs/techs_transmission.yaml'
    - 'model_config/techs/techs_conversion.yaml'

    # Scenarios and Overrides
    - 'scenarios/overrides.yaml'
    - 'scenarios/scenarios.yaml'   
    
# Model configuration: all settings that affect the built model
model:
    name: ${model.name || 'Energy System Model'}

    # What version of Calliope this model is intended for
    calliope_version: ${calliopeVersion}

    # Time series data path
    timeseries_data_path: 'timeseries_data'

    subset_time: ['${startDate}', '${endDate}']
    
    ensure_feasibility: ${ensureFeasibility}

    bigM: ${bigM}

    zero_threshold: ${zeroThreshold}

    mode: ${mode}
        
    objective_options:
        cost_class: {'monetary': 1}
`;
  };

  const generateLocationsYaml = (locations) => {
    let yaml = 'locations:\n';
    
    locations.forEach(loc => {
      yaml += `    ${loc.name}:\n`;
      yaml += `        coordinates:\n`;
      yaml += `            lat: ${loc.latitude || loc.coordinates?.lat || 0}\n`;
      yaml += `            lon: ${loc.longitude || loc.coordinates?.lon || 0}\n`;
      
      if (loc.techs && Object.keys(loc.techs).length > 0) {
        yaml += `        techs:\n`;
        Object.entries(loc.techs).forEach(([techName, techData]) => {
          yaml += `            ${techName}:\n`;
          
          if (techData && techData.constraints && Object.keys(techData.constraints).length > 0) {
            yaml += `                constraints:\n`;
            Object.entries(techData.constraints).forEach(([key, value]) => {
              yaml += `                    ${key}: ${value}\n`;
            });
          }
        });
      }
    });
    
    return yaml;
  };

  const generateLinksYaml = (links) => {
    if (!links || links.length === 0) return 'links: {}\n';
    let yaml = 'links:\n';
    links.forEach(link => {
      const from = (link.from || '').replace(/\s+/g, '_');
      const to   = (link.to   || '').replace(/\s+/g, '_');
      if (!from || !to) return;

      // Derive Calliope tech key: prefer stored 'tech' field, then map linkType → calliopeTech
      const lt = link.linkType ? LINK_TYPES[link.linkType] : null;
      const techKey = link.tech || lt?.calliopeTech || link.linkType || 'ac_transmission';
      const capMax  = link.capacity || link.energy_cap_max || 1000;

      yaml += `    ${from},${to}:\n`;
      yaml += `        techs:\n`;
      yaml += `            ${techKey}:\n`;
      yaml += `                constraints:\n`;
      yaml += `                    energy_cap_max: ${capMax}\n`;
      if (link.distance) {
        // distance is a link-level property in Calliope 0.6.x
        yaml += `        distance: ${link.distance}\n`;
      }
    });
    return yaml;
  };

  const generateTechsYaml = (techsList, parentType) => {
    const filteredTechs = techsList.filter(t => {
      const techParent = t.parent || t.essentials?.parent || 'supply';
      if (parentType === 'supply') return techParent === 'supply' || techParent === 'supply_plus';
      return techParent === parentType;
    });
    if (filteredTechs.length === 0) return 'techs: {}\n';

    // Helper: format a single YAML value (handles inf, arrays, strings, numbers)
    const fmtVal = (v) => {
      if (v === Infinity || v === 'inf' || v === '.inf') return '.inf';
      if (v === -Infinity || v === '-inf' || v === '-.inf') return '-.inf';
      if (Array.isArray(v)) return '[' + v.map(i => typeof i === 'string' ? `'${i}'` : i).join(', ') + ']';
      if (typeof v === 'string') return `'${v}'`;
      return v;
    };

    let yaml = 'techs:\n';
    filteredTechs.forEach(tech => {
      const id = (tech.name || tech.id || 'unknown').replace(/\s+/g, '_').toLowerCase();
      yaml += `    ${id}:\n`;

      if (tech.essentials) {
        yaml += `        essentials:\n`;
        Object.entries(tech.essentials).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            yaml += `            ${key}: ${fmtVal(value)}\n`;
          }
        });
      }

      if (tech.constraints && Object.keys(tech.constraints).length > 0) {
        yaml += `        constraints:\n`;
        Object.entries(tech.constraints).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            yaml += `            ${key}: ${fmtVal(value)}\n`;
          }
        });
      }

      if (tech.costs?.monetary && Object.keys(tech.costs.monetary).length > 0) {
        yaml += `        costs:\n            monetary:\n`;
        Object.entries(tech.costs.monetary).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            yaml += `                ${key}: ${fmtVal(value)}\n`;
          }
        });
      }
    });
    return yaml;
  };

  const generateOverridesYaml = (modelOverrides) => {
    let yaml = 'overrides:\n';
    
    // Get date range from model timeseries
    let startDate = '2024-01-01';
    let endDate = '2024-12-31';
    
    const modelTS = timeSeries.filter(ts => ts.modelId === currentModel.id);
    if (modelTS.length > 0 && modelTS[0].data && modelTS[0].data.length > 0) {
      const firstRow = modelTS[0].data[0];
      const lastRow = modelTS[0].data[modelTS[0].data.length - 1];
      const dateCol = modelTS[0].columns[0];
      
      if (firstRow[dateCol]) startDate = firstRow[dateCol].split(' ')[0];
      if (lastRow[dateCol]) endDate = lastRow[dateCol].split(' ')[0];
    }
    
    // Calculate 1-day and 3-day subsets
    const startDateObj = new Date(startDate);
    const oneDayEnd = new Date(startDateObj);
    oneDayEnd.setDate(oneDayEnd.getDate() + 1);
    const threeDayEnd = new Date(startDateObj);
    threeDayEnd.setDate(threeDayEnd.getDate() + 3);
    
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    // Add standard time subset overrides
    yaml += `    1_day:\n`;
    yaml += `        model.subset_time: ['${startDate}', '${formatDate(oneDayEnd)}']\n\n`;
    
    yaml += `    3_days:\n`;
    yaml += `        model.subset_time: ['${startDate}', '${formatDate(threeDayEnd)}']\n\n`;
    
    yaml += `    full_year:\n`;
    yaml += `        model.subset_time: ['${startDate}', '${endDate}']\n\n`;
    
    // Add time resolution overrides
    yaml += `    1H_resolution:\n`;
    yaml += `        model.time:\n`;
    yaml += `            function: resample\n`;
    yaml += `            function_options:\n`;
    yaml += `                resolution: '1H'\n\n`;
    
    yaml += `    3H_resolution:\n`;
    yaml += `        model.time:\n`;
    yaml += `            function: resample\n`;
    yaml += `            function_options:\n`;
    yaml += `                resolution: '3H'\n\n`;
    
    yaml += `    6H_resolution:\n`;
    yaml += `        model.time:\n`;
    yaml += `            function: resample\n`;
    yaml += `            function_options:\n`;
    yaml += `                resolution: '6H'\n\n`;
    
    // Add solver configuration
    const solverConfig = currentModel.templateMetadata?.solver || {};
    const solver = solverConfig.solver || 'gurobi';
    const cyclicStorage = solverConfig.cyclic_storage !== false;
    
    yaml += `    run_solver:\n`;
    yaml += `        run:\n`;
    yaml += `            ensure_feasibility: true\n`;
    yaml += `            cyclic_storage: ${cyclicStorage}\n`;
    yaml += `            solver: ${solver}\n`;
    
    // Add solver-specific options if present
    if (solverConfig.solver_options) {
      yaml += `            solver_options:\n`;
      Object.entries(solverConfig.solver_options).forEach(([key, value]) => {
        yaml += `                ${key}: ${value}\n`;
      });
    }
    yaml += '\n';
    
    // Add custom overrides from the model
    if (modelOverrides && Object.keys(modelOverrides).length > 0) {
      Object.entries(modelOverrides).forEach(([key, value]) => {
        yaml += `    ${key}:\n`;
        if (typeof value === 'object' && value !== null) {
          const formatYamlValue = (obj, indent = 8) => {
            let result = '';
            Object.entries(obj).forEach(([k, v]) => {
              const spaces = ' '.repeat(indent);
              if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                result += `${spaces}${k}:\n`;
                result += formatYamlValue(v, indent + 4);
              } else if (Array.isArray(v)) {
                result += `${spaces}${k}: [${v.map(item => typeof item === 'string' ? `'${item}'` : item).join(', ')}]\n`;
              } else {
                result += `${spaces}${k}: ${typeof v === 'string' ? `'${v}'` : v}\n`;
              }
            });
            return result;
          };
          yaml += formatYamlValue(value);
        } else {
          yaml += `        value: ${value}\n`;
        }
      });
    }
    
    return yaml;
  };

  const generateScenariosYaml = (modelScenarios) => {
    let yaml = 'scenarios:\n';
    
    const hasCustomScenarios = modelScenarios && Object.keys(modelScenarios).length > 0;
    
    if (hasCustomScenarios) {
      // Use custom scenarios from the model
      Object.entries(modelScenarios).forEach(([name, overrideList]) => {
        if (Array.isArray(overrideList)) {
          yaml += `    ${name}: [${overrideList.map(o => `"${o}"`).join(', ')}]\n`;
        } else if (typeof overrideList === 'string') {
          yaml += `    ${name}: ["${overrideList}"]\n`;
        }
      });
    } else {
      // Provide default scenarios
      yaml += `    Quick: ["run_solver", "1_day", "3H_resolution"]\n`;
      yaml += `    Debug: ["1_day", "6H_resolution"]\n`;
      yaml += `    Standard: ["run_solver", "3_days", "3H_resolution"]\n`;
      yaml += `    FullYear: ["run_solver", "full_year", "6H_resolution"]\n`;
    }
    
    return yaml;
  };

  const formatTimeseriesCSV = (data, columns) => {
    let csv = columns.join(',') + '\n';
    data.forEach(row => {
      const values = columns.map(col => row[col] || 0);
      csv += values.join(',') + '\n';
    });
    return csv;
  };

  const exportToCalliope = async () => {
    if (!currentModel) {
      setExportStatus({ type: 'error', message: 'No model selected' });
      return;
    }

    setExporting(true);
    setExportStatus({ type: 'info', message: 'Generating Calliope model...' });

    try {
      const zip = new JSZip();

      // 1. Generate model.yaml
      const modelYaml = generateModelYaml(currentModel);
      zip.file('model.yaml', modelYaml);

      // 2. Generate locations
      const locationsFolder = zip.folder('model_config').folder('locations');
      const locationsYaml = generateLocationsYaml(currentModel.locations || []);
      locationsFolder.file('locations.yaml', locationsYaml);

      // 3. Generate links — all in transmission_links.yaml
      const linksFolder = zip.folder('model_config').folder('links');
      linksFolder.file('transmission_links.yaml', generateLinksYaml(currentModel.links || []));
      linksFolder.file('power_links.yaml', 'links: {}\n'); // reserved for future use

      // 4. Generate technologies
      // Auto-collect transmission tech definitions from links (if not already in technologies list)
      const allTechs = [...(technologies || [])];
      const techNames = new Set(allTechs.map(t => (t.name || t.id || '').replace(/\s+/g, '_').toLowerCase()));
      (currentModel.links || []).forEach(link => {
        const lt = link.linkType ? LINK_TYPES[link.linkType] : null;
        const techId = link.tech || lt?.calliopeTech || link.linkType;
        if (!techId || techNames.has(techId)) return;
        techNames.add(techId);
        allTechs.push({
          name: techId,
          parent: 'transmission',
          essentials: { name: lt?.label || techId, parent: 'transmission', carrier: link.carrier || lt?.carrier || 'electricity' },
          constraints: {
            energy_cap_max: 'inf',
            energy_eff: lt?.defaults?.energy_eff ?? 0.98,
            lifetime: lt?.defaults?.lifetime ?? 40,
          },
          costs: {
            monetary: {
              interest_rate: 0.05,
              ...(lt?.defaults?.energy_cap_per_distance != null
                ? { energy_cap_per_distance: lt.defaults.energy_cap_per_distance }
                : {}),
            },
          },
        });
      });

      const techsFolder = zip.folder('model_config').folder('techs');
      const techsByParent = { supply: [], demand: [], storage: [], transmission: [], conversion: [], conversion_plus: [] };
      allTechs.forEach(tech => {
        const p = tech.parent || tech.essentials?.parent || 'supply';
        const key = p === 'supply_plus' ? 'supply' : (techsByParent[p] ? p : 'supply');
        techsByParent[key].push(tech);
      });
      techsFolder.file('techs_supply.yaml', generateTechsYaml(techsByParent['supply'], 'supply'));
      techsFolder.file('techs_demand.yaml', generateTechsYaml(techsByParent['demand'], 'demand'));
      techsFolder.file('techs_storage.yaml', generateTechsYaml(techsByParent['storage'], 'storage'));
      techsFolder.file('techs_transmission.yaml', generateTechsYaml(techsByParent['transmission'], 'transmission'));
      techsFolder.file('techs_conversion.yaml',
        generateTechsYaml([...techsByParent['conversion'], ...techsByParent['conversion_plus']], 'conversion'));

      // 5. Generate scenarios
      const scenariosFolder = zip.folder('scenarios');
      scenariosFolder.file('overrides.yaml', generateOverridesYaml(overrides));
      scenariosFolder.file('scenarios.yaml', generateScenariosYaml(scenarios));

      // 6. Add timeseries data
      const timeseriesFolder = zip.folder('timeseries_data');
      
      if (timeSeries && timeSeries.length > 0) {
        const modelTimeSeries = timeSeries.filter(ts => ts.modelId === currentModel.id);
        
        modelTimeSeries.forEach(ts => {
          if (ts.data && ts.columns && ts.fileName) {
            const csv = formatTimeseriesCSV(ts.data, ts.columns);
            timeseriesFolder.file(ts.fileName, csv);
          }
        });
      }

      // 7. Add README
      const readme = `# ${currentModel.name || 'Energy System Model'}

Generated by TEMPO on ${new Date().toISOString()}

## Structure
- model.yaml: Main model configuration
- model_config/: Model components
  - locations/: Geographic locations with technologies
  - links/: Transmission connections
  - techs/: Technology definitions
- scenarios/: Scenarios and overrides
- timeseries_data/: CSV files for demand and resource profiles

## Usage
\`\`\`bash
calliope run model.yaml --scenario=Main
\`\`\`

## Model Details
- Locations: ${(currentModel.locations || []).length}
- Links: ${(currentModel.links || []).length}
- Technologies: ${(technologies || []).length}
- Timeseries: ${timeSeries.filter(ts => ts.modelId === currentModel.id).length}
`;
      zip.file('README.md', readme);

      // Generate and download
      const content = await zip.generateAsync({ type: 'blob' });
      const fileName = `${(currentModel.name || 'model').replace(/\s+/g, '_').toLowerCase()}_calliope_export.zip`;
      saveAs(content, fileName);

      setExportStatus({ type: 'success', message: `Model exported successfully as ${fileName}` });
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus({ type: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  if (!currentModel) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-8 text-center">
            <FiAlertCircle className="mx-auto text-4xl text-slate-400 mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No Model Selected</h2>
            <p className="text-slate-600">Please select or create a model to export to Calliope format.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-electric-600 to-electric-900 rounded-2xl p-8 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <FiPackage className="text-3xl" />
            <h1 className="text-3xl font-bold">Export Model</h1>
          </div>
          <p className="text-electric-50">
            Export your energy system model in various modeling framework formats with proper folder structure and configuration files.
          </p>
        </div>

        {/* Format Selection */}
        <div className="card-refined p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiSettings className="text-electric-500" />
            Select Export Format
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EXPORT_FORMATS.map(format => {
              const Icon = format.icon;
              const isSelected = selectedFormat === format.id;
              
              return (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  disabled={!format.supported}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                    isSelected
                      ? `border-transparent bg-gradient-to-r ${format.color} text-white shadow-lg`
                      : format.supported
                      ? 'border-slate-200 hover:border-slate-300 bg-white hover:shadow-md'
                      : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon size={24} className={isSelected ? 'text-white' : 'text-slate-400'} />
                    <div className="flex-1">
                      <div className="font-semibold mb-1">{format.name}</div>
                      <div className={`text-xs ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                        {format.description}
                      </div>
                    </div>
                  </div>
                  
                  {!format.supported && (
                    <div className="absolute top-2 right-2 bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded">
                      Coming Soon
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Info */}
        <div className="card-refined p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Model Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-slate-500">Model Name</span>
              <p className="font-mono font-semibold text-slate-900">{currentModel.name}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Created</span>
              <p className="font-medium text-slate-700">{new Date(currentModel.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Locations</span>
              <p className="font-semibold text-slate-900">{(currentModel.locations || []).length}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Transmission Links</span>
              <p className="font-semibold text-slate-900">{(currentModel.links || []).length}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Technologies</span>
              <p className="font-semibold text-slate-900">{(technologies || []).length}</p>
            </div>
            <div>
              <span className="text-sm text-slate-500">Timeseries Files</span>
              <p className="font-semibold text-slate-900">{timeSeries.filter(ts => ts.modelId === currentModel.id).length}</p>
            </div>
          </div>
        </div>

        {/* Export Structure Preview */}
        <div className="card-refined p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FiFolder className="text-electric-500" />
            Export Structure
          </h2>
          <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm">
            <div className="space-y-1 text-slate-700">
              <div className="flex items-center gap-2"><FiFile className="text-slate-400" /> model.yaml</div>
              <div className="flex items-center gap-2"><FiFile className="text-slate-400" /> README.md</div>
              <div className="ml-4">
                <div className="flex items-center gap-2"><FiFolder className="text-amber-500" /> model_config/</div>
                <div className="ml-4">
                  <div className="flex items-center gap-2"><FiFolder className="text-amber-500" /> locations/</div>
                  <div className="ml-4"><FiFile className="text-slate-400" /> locations.yaml</div>
                  <div className="flex items-center gap-2"><FiFolder className="text-amber-500" /> links/</div>
                  <div className="ml-4">
                    <div><FiFile className="text-slate-400" /> transmission_links.yaml</div>
                    <div><FiFile className="text-slate-400" /> power_links.yaml</div>
                  </div>
                  <div className="flex items-center gap-2"><FiFolder className="text-amber-500" /> techs/</div>
                  <div className="ml-4">
                    <div><FiFile className="text-slate-400" /> techs_supply.yaml</div>
                    <div><FiFile className="text-slate-400" /> techs_demand.yaml</div>
                    <div><FiFile className="text-slate-400" /> techs_storage.yaml</div>
                    <div><FiFile className="text-slate-400" /> techs_transmission.yaml</div>
                  </div>
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center gap-2"><FiFolder className="text-amber-500" /> scenarios/</div>
                <div className="ml-4">
                  <div><FiFile className="text-slate-400" /> overrides.yaml</div>
                  <div><FiFile className="text-slate-400" /> scenarios.yaml</div>
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center gap-2"><FiFolder className="text-amber-500" /> timeseries_data/</div>
                <div className="ml-4 text-slate-500">
                  {timeSeries.filter(ts => ts.modelId === currentModel.id).length} CSV files
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Export Button */}
        <div className="card-refined p-6">
          <button
            onClick={() => {
              const format = EXPORT_FORMATS.find(f => f.id === selectedFormat);
              if (!format.supported) {
                setExportStatus({ type: 'error', message: `${format.name} export is not yet supported. Coming soon!` });
                return;
              }
              exportToCalliope();
            }}
            disabled={exporting}
            className={`w-full btn-primary flex items-center justify-center gap-3 py-4 text-lg ${
              exporting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <FiDownload size={24} />
            {exporting ? 'Exporting...' : `Export Model to ${EXPORT_FORMATS.find(f => f.id === selectedFormat)?.name || 'Calliope'} Format`}
          </button>

          {exportStatus && (
            <div className={`mt-4 p-4 rounded-lg flex items-center gap-3 animate-slideUp ${
              exportStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
              exportStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {exportStatus.type === 'success' ? <FiCheckCircle size={20} /> : <FiAlertCircle size={20} />}
              <span className="font-medium">{exportStatus.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Export;
