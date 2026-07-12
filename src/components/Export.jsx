import React, { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { FiDownload, FiFolder, FiFile, FiCheckCircle, FiAlertCircle, FiPackage, FiZap, FiActivity, FiCpu, FiSettings } from 'react-icons/fi';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { dump } from 'js-yaml';
import { LINK_TYPES } from '../config/linkTypes';
import { internalTo07Yaml } from '../services/calliope07Format';

const EXPORT_FORMATS = [
  {
    id: 'calliope',
    name: 'Calliope',
    description: 'Multi-scale energy system modeling framework',
    icon: FiZap,
    color: 'from-gray-600 to-gray-700',
    supported: true
  },
  {
    id: 'pypsa',
    name: 'PyPSA',
    description: 'Python for Power System Analysis',
    icon: FiActivity,
    color: 'from-gray-500 to-gray-600',
    supported: false
  },
  {
    id: 'osemosys',
    name: 'OSeMOSYS',
    description: 'Open Source Energy Modelling System',
    icon: FiCpu,
    color: 'from-gray-500 to-gray-600',
    supported: false
  },
  {
    id: 'adoptnet',
    name: 'AdoptNET',
    description: 'Adoption Network Energy Transition',
    icon: FiSettings,
    color: 'from-gray-500 to-gray-600',
    supported: false
  },
  {
    id: 'calliope07',
    name: 'Calliope 0.7',
    description: 'Calliope 0.7 schema — single model.yaml + CSV files (experimental)',
    icon: FiZap,
    color: 'from-gray-500 to-gray-600',
    supported: true
  }
];

const Export = () => {
  const { getCurrentModel, technologies, timeSeries, overrides, scenarios } = useData();
  const currentModel = getCurrentModel();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('calliope');

  useEffect(() => {
    if (!currentModel) return;
    const ver = currentModel.metadata?.modelConfig?.calliopeVersion ?? '';
    setSelectedFormat(String(ver).startsWith('0.7') ? 'calliope07' : 'calliope');
  }, [currentModel?.id]);

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

  const exportToCalliope07 = async () => {
    if (!currentModel) {
      setExportStatus({ type: 'error', message: 'No model selected' });
      return;
    }
    setExporting(true);
    setExportStatus({ type: 'info', message: 'Generating Calliope 0.7 model...' });
    try {
      const modelTS = timeSeries.filter(ts => ts.modelId === currentModel.id);
      const modelForExport = {
        name: currentModel.name,
        technologies: technologies || [],
        locations: currentModel.locations || [],
        links: currentModel.links || [],
        metadata: {
          modelConfig: currentModel.metadata?.modelConfig || {},
          runConfig: currentModel.metadata?.runConfig || {},
          subsetTime: null,
        },
      };
      const { modelDoc, csvs, log } = internalTo07Yaml(modelForExport, modelTS);
      log.forEach(l => console.log('[07 export]', l));

      const zip = new JSZip();
      zip.file('model.yaml', dump(modelDoc, { lineWidth: 120 }));
      for (const [fname, content] of Object.entries(csvs)) {
        zip.file(fname, content);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const fileName = `${(currentModel.name || 'model').replace(/\s+/g, '_').toLowerCase()}_calliope07_export.zip`;
      saveAs(content, fileName);
      setExportStatus({ type: 'success', message: `Calliope 0.7 model exported as ${fileName}` });
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus({ type: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  if (!currentModel) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <FiPackage size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700 mb-1">No model selected</p>
          <p className="text-sm text-gray-400">Select a model from the Models section to export it.</p>
        </div>
      </div>
    );
  }

  const modelTs = timeSeries.filter(ts => ts.modelId === currentModel.id);
  const locs = currentModel.locations || [];
  const lnks = currentModel.links || [];
  const techs = technologies || [];
  const modelOverrides = Object.keys(overrides || {});
  const modelScenarios = Object.keys(scenarios || {});
  const supplyTechs = techs.filter(t => t.parent === 'supply' || t.parent === 'supply_plus' || t.techType === 'supply');
  const demandTechs = techs.filter(t => t.parent === 'demand' || t.techType === 'demand');
  const storageTechs = techs.filter(t => t.parent === 'storage' || t.techType === 'storage');
  const transmTechs = techs.filter(t => t.parent === 'transmission' || t.techType === 'transmission');

  const TreeRow = ({ indent = 0, icon: Icon, name, note, isDir, dim }) => (
    <div className={`flex items-center gap-1.5 py-0.5 ${dim ? 'text-gray-400' : 'text-gray-700'}`}
         style={{ paddingLeft: `${indent * 16}px` }}>
      {indent > 0 && <span className="text-gray-300 select-none flex-shrink-0">{'└─'}</span>}
      <Icon size={11} className={`flex-shrink-0 ${isDir ? 'text-amber-400' : 'text-blue-400'}`} />
      <span className="font-mono text-xs">{name}</span>
      {note && <span className="font-sans text-[10px] text-gray-400 ml-1">{note}</span>}
    </div>
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="space-y-5">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <FiDownload size={18} className="text-gray-500" />
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Export Model</h1>
            <p className="text-xs text-slate-500">Export your active model as a framework-ready ZIP archive</p>
          </div>
        </div>

        {/* Active model card */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Active Model</h2>
          <div className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="font-semibold text-slate-800 text-sm">{currentModel.name}</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full font-medium">
                  {currentModel.metadata?.modelConfig?.calliopeVersion
                    ? `Calliope ${currentModel.metadata.modelConfig.calliopeVersion}`
                    : 'Calliope 0.6.8'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {locs.length} locations · {lnks.length} links · {techs.length} techs · {modelTs.length} time series · {modelOverrides.length} overrides · {modelScenarios.length} scenarios
              </p>
            </div>
          </div>
        </div>

        {/* Format selection — lateral grid */}
        <div className="bg-white rounded-xl shadow-lg p-5">
          <h2 className="text-xl font-semibold text-slate-800 mb-3">Export Format</h2>
          <div className="grid grid-cols-5 gap-3">
            {EXPORT_FORMATS.map(fmt => {
              const Icon = fmt.icon;
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  onClick={() => fmt.supported && setSelectedFormat(fmt.id)}
                  disabled={!fmt.supported}
                  className={`relative flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 text-center transition-all ${
                    isSelected
                      ? 'border-gray-700 bg-gray-50'
                      : fmt.supported
                      ? 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                      : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <Icon size={20} className={isSelected ? 'text-gray-700' : 'text-gray-400'} />
                  <div>
                    <p className={`text-xs font-semibold leading-tight ${isSelected ? 'text-gray-800' : 'text-gray-600'}`}>
                      {fmt.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-2">{fmt.description}</p>
                  </div>
                  {!fmt.supported && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                      Soon
                    </span>
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full bg-gray-700 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Structure + Action — side by side */}
        <div className="grid grid-cols-2 gap-5 items-start">

          {/* Output structure — detailed */}
          <div className="bg-white rounded-xl shadow-lg p-5">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">Output Structure</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 leading-5">
              {selectedFormat === 'calliope07' ? (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFile} name="model.yaml" note="config + techs + nodes + data_tables" />
                  <TreeRow indent={1} icon={FiFile} name="demand_profiles.csv" note="positive values (0.7 convention)" />
                  {modelTs.map((ts, i) => (
                    <TreeRow key={i} indent={1} icon={FiFile} name={`${ts.name || `timeseries_${i+1}`}.csv`} dim />
                  ))}
                  {modelTs.length === 0 && (
                    <TreeRow indent={1} icon={FiFile} name="(no additional time series)" dim />
                  )}
                </>
              ) : (
                <>
                  <TreeRow icon={FiFolder} name={`${currentModel.name || 'model'}/`} isDir note="ZIP root" />
                  <TreeRow indent={1} icon={FiFile} name="model.yaml" note="root import manifest" />
                  <TreeRow indent={1} icon={FiFile} name="README.md" />
                  <TreeRow indent={1} icon={FiFolder} name="model_config/" isDir />
                  <TreeRow indent={2} icon={FiFolder} name="locations/" isDir />
                  <TreeRow indent={3} icon={FiFile} name="locations.yaml" note={`${locs.length} location${locs.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={2} icon={FiFolder} name="links/" isDir />
                  <TreeRow indent={3} icon={FiFile} name="transmission_links.yaml" note={`${lnks.length} link${lnks.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={3} icon={FiFile} name="power_links.yaml" />
                  <TreeRow indent={2} icon={FiFolder} name="techs/" isDir />
                  <TreeRow indent={3} icon={FiFile} name="techs_supply.yaml" note={supplyTechs.length > 0 ? `${supplyTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_demand.yaml" note={demandTechs.length > 0 ? `${demandTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_storage.yaml" note={storageTechs.length > 0 ? `${storageTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_transmission.yaml" note={transmTechs.length > 0 ? `${transmTechs.length} techs` : undefined} />
                  <TreeRow indent={3} icon={FiFile} name="techs_conversion.yaml" />
                  <TreeRow indent={1} icon={FiFolder} name="scenarios/" isDir />
                  <TreeRow indent={2} icon={FiFile} name="overrides.yaml" note={`${modelOverrides.length} override${modelOverrides.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={2} icon={FiFile} name="scenarios.yaml" note={`${modelScenarios.length} scenario${modelScenarios.length !== 1 ? 's' : ''}`} />
                  <TreeRow indent={1} icon={FiFolder} name="timeseries_data/" isDir />
                  {modelTs.length > 0
                    ? modelTs.map((ts, i) => (
                        <TreeRow key={i} indent={2} icon={FiFile} name={`${ts.name || `timeseries_${i+1}`}.csv`} dim />
                      ))
                    : <TreeRow indent={2} icon={FiFile} name="(no time series files)" dim />
                  }
                </>
              )}
            </div>
          </div>

          {/* Export action */}
          <div className="bg-white rounded-xl shadow-lg p-5">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">Export</h2>
            <p className="text-xs text-gray-500 mb-4">
              The model will be packaged as a ZIP archive ready to use with{' '}
              <span className="font-medium text-gray-700">
                {EXPORT_FORMATS.find(f => f.id === selectedFormat)?.name || 'Calliope'}
              </span>.
              {selectedFormat === 'calliope07' && ' Uses single flat YAML + CSV layout (0.7 convention).'}
              {selectedFormat === 'calliope' && ' Uses nested folder structure compatible with Calliope 0.6.8.'}
            </p>
            <button
              onClick={() => {
                if (selectedFormat === 'calliope07') { exportToCalliope07(); return; }
                const fmt = EXPORT_FORMATS.find(f => f.id === selectedFormat);
                if (!fmt.supported) {
                  setExportStatus({ type: 'error', message: `${fmt.name} export is not yet supported.` });
                  return;
                }
                exportToCalliope();
              }}
              disabled={exporting}
              className="w-full py-2.5 bg-gray-700 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <FiDownload size={15} />
              {exporting
                ? 'Exporting…'
                : `Export as ${EXPORT_FORMATS.find(f => f.id === selectedFormat)?.name || 'Calliope'} ZIP`}
            </button>

            {exportStatus && (
              <div className={`mt-3 px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm ${
                exportStatus.type === 'success'
                  ? 'bg-gray-50 text-gray-700 border border-gray-200'
                  : exportStatus.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-100'
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}>
                {exportStatus.type === 'success'
                  ? <FiCheckCircle size={14} className="flex-shrink-0" />
                  : <FiAlertCircle size={14} className="flex-shrink-0" />}
                <span>{exportStatus.message}</span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Export;
