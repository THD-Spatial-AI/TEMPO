import React, { useState } from 'react';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle, FiX, FiDownload, FiMapPin, FiLink, FiZap, FiDatabase } from 'react-icons/fi';
import Papa from 'papaparse';
import { ENTITY_TYPES, TRANSMISSION_TYPES, VALIDATION_RULES, ENTITY_TO_TECH_MAPPING } from '../config/domainModel';
import { useData } from '../context/DataContext';

const BulkImport = ({ onClose, onComplete }) => {
  const { createModel, showNotification } = useData();
  const [step, setStep] = useState(1);
  const [modelName, setModelName] = useState('');
  const [files, setFiles] = useState({
    locations: null,
    transmissionLines: null,
    techParameters: null,
    costParameters: null,
    timeSeries: []
  });
  
  const [parsedData, setParsedData] = useState({
    locations: [],
    transmissionLines: [],
    techParameters: [],
    costParameters: [],
    timeSeries: {}
  });
  
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = (fileType, file) => {
    if (fileType === 'timeSeries') {
      setFiles(prev => ({
        ...prev,
        timeSeries: [...prev.timeSeries, file]
      }));
    } else {
      setFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
    }
  };

  const removeTimeSeriesFile = (index) => {
    setFiles(prev => ({
      ...prev,
      timeSeries: prev.timeSeries.filter((_, i) => i !== index)
    }));
  };

  const validateLocationData = (row, index) => {
    const rowErrors = [];
    const rowWarnings = [];
    
    // Check required fields
    if (!row.name || row.name.trim() === '') {
      rowErrors.push(`Row ${index + 2}: Missing required field 'name'`);
    }
    
    if (!row.type || !ENTITY_TYPES[row.type]) {
      rowErrors.push(`Row ${index + 2}: Invalid or missing entity type '${row.type}'`);
    }
    
    if (!row.latitude || isNaN(parseFloat(row.latitude))) {
      rowErrors.push(`Row ${index + 2}: Invalid latitude '${row.latitude}'`);
    } else {
      const lat = parseFloat(row.latitude);
      if (lat < -90 || lat > 90) {
        rowErrors.push(`Row ${index + 2}: Latitude out of range (${lat})`);
      }
    }
    
    if (!row.longitude || isNaN(parseFloat(row.longitude))) {
      rowErrors.push(`Row ${index + 2}: Invalid longitude '${row.longitude}'`);
    } else {
      const lon = parseFloat(row.longitude);
      if (lon < -180 || lon > 180) {
        rowErrors.push(`Row ${index + 2}: Longitude out of range (${lon})`);
      }
    }
    
    // Validate entity-specific fields
    const entityType = ENTITY_TYPES[row.type];
    if (entityType) {
      entityType.requiredFields.forEach(field => {
        if (!row[field] || row[field].trim() === '') {
          if (field !== 'name' && field !== 'latitude' && field !== 'longitude' && field !== 'type') {
            rowWarnings.push(`Row ${index + 2}: Missing recommended field '${field}' for ${entityType.name}`);
          }
        }
      });
    }
    
    return { errors: rowErrors, warnings: rowWarnings };
  };

  const validateTransmissionLine = (row, index, locationNames) => {
    const rowErrors = [];
    
    if (!row.from || row.from.trim() === '') {
      rowErrors.push(`Row ${index + 2}: Missing 'from' location`);
    } else if (!locationNames.has(row.from)) {
      rowErrors.push(`Row ${index + 2}: 'from' location '${row.from}' not found in locations file`);
    }
    
    if (!row.to || row.to.trim() === '') {
      rowErrors.push(`Row ${index + 2}: Missing 'to' location`);
    } else if (!locationNames.has(row.to)) {
      rowErrors.push(`Row ${index + 2}: 'to' location '${row.to}' not found in locations file`);
    }
    
    if (!row.type || !TRANSMISSION_TYPES[row.type]) {
      rowErrors.push(`Row ${index + 2}: Invalid transmission type '${row.type}'`);
    }
    
    if (!row.capacity_mw || isNaN(parseFloat(row.capacity_mw))) {
      rowErrors.push(`Row ${index + 2}: Invalid capacity_mw '${row.capacity_mw}'`);
    }
    
    return rowErrors;
  };

  const parseFiles = async () => {
    setIsProcessing(true);
    setErrors([]);
    setWarnings([]);
    
    const allErrors = [];
    const allWarnings = [];
    const parsed = {
      locations: [],
      transmissionLines: [],
      techParameters: [],
      costParameters: [],
      timeSeries: {}
    };

    try {
      // Parse locations file
      if (files.locations) {
        await new Promise((resolve, reject) => {
          Papa.parse(files.locations, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              parsed.locations = results.data;
              
              // Validate each location
              results.data.forEach((row, index) => {
                const validation = validateLocationData(row, index);
                allErrors.push(...validation.errors);
                allWarnings.push(...validation.warnings);
              });
              
              resolve();
            },
            error: (error) => reject(error)
          });
        });
      } else {
        allErrors.push('Locations file is required');
      }

      // Parse transmission lines
      if (files.transmissionLines) {
        const locationNames = new Set(parsed.locations.map(loc => loc.name));
        
        await new Promise((resolve, reject) => {
          Papa.parse(files.transmissionLines, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              parsed.transmissionLines = results.data;
              
              // Validate each transmission line
              results.data.forEach((row, index) => {
                const validation = validateTransmissionLine(row, index, locationNames);
                allErrors.push(...validation);
              });
              
              resolve();
            },
            error: (error) => reject(error)
          });
        });
      }

      // Parse technology parameters
      if (files.techParameters) {
        await new Promise((resolve, reject) => {
          Papa.parse(files.techParameters, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              parsed.techParameters = results.data;
              resolve();
            },
            error: (error) => reject(error)
          });
        });
      }

      // Parse cost parameters
      if (files.costParameters) {
        await new Promise((resolve, reject) => {
          Papa.parse(files.costParameters, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              parsed.costParameters = results.data;
              resolve();
            },
            error: (error) => reject(error)
          });
        });
      }

      // Parse time series files
      for (const tsFile of files.timeSeries) {
        await new Promise((resolve, reject) => {
          Papa.parse(tsFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              parsed.timeSeries[tsFile.name] = results.data;
              resolve();
            },
            error: (error) => reject(error)
          });
        });
      }

      setParsedData(parsed);
      setErrors(allErrors);
      setWarnings(allWarnings);
      
      if (allErrors.length === 0) {
        setStep(3); // Move to preview
      } else {
        setStep(2); // Stay on validation
      }
      
    } catch (error) {
      allErrors.push(`Error parsing files: ${error.message}`);
      setErrors(allErrors);
    } finally {
      setIsProcessing(false);
    }
  };

  const buildModelFromData = () => {
    // Transform parsed data into Calliope model structure
    const locations = [];
    const links = [];
    const technologies = [];
    const timeSeries = [];

    // Build locations with technologies
    parsedData.locations.forEach(loc => {
      const location = {
        name: loc.name,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        entityType: loc.type,
        metadata: {
          subtype: loc.subtype || '',
          operator: loc.operator || '',
          commissioning_year: loc.commissioning_year || '',
          capacity_mw: loc.capacity_mw ? parseFloat(loc.capacity_mw) : undefined,
          voltage_level: loc.voltage_level ? parseFloat(loc.voltage_level) : undefined
        },
        techs: {}
      };

      // Add technologies based on entity type and subtype
      const entityType = ENTITY_TYPES[loc.type];
      if (entityType && entityType.allowsTechnologies && loc.subtype) {
        const recommendedTechs = ENTITY_TO_TECH_MAPPING[loc.type]?.[loc.subtype] || [];
        recommendedTechs.forEach(techName => {
          location.techs[techName] = {
            essentials: {},
            constraints: {},
            costs: {}
          };
        });
      }

      locations.push(location);
    });

    // Build links
    parsedData.transmissionLines.forEach(line => {
      const link = {
        from: line.from,
        to: line.to,
        type: line.type,
        distance: line.length_km ? parseFloat(line.length_km) : undefined,
        techs: {
          [line.type]: {
            constraints: {
              energy_cap_max: parseFloat(line.capacity_mw)
            }
          }
        },
        metadata: {
          voltage_kv: line.voltage_kv ? parseFloat(line.voltage_kv) : undefined,
          efficiency: line.efficiency ? parseFloat(line.efficiency) : undefined,
          num_circuits: line.num_circuits ? parseInt(line.num_circuits) : undefined
        }
      };
      links.push(link);
    });

    // Apply technology parameters
    parsedData.techParameters.forEach(param => {
      const location = locations.find(l => l.name === param.location);
      if (location && location.techs[param.technology]) {
        const value = param.constraint_value === 'true' ? true :
                     param.constraint_value === 'false' ? false :
                     isNaN(parseFloat(param.constraint_value)) ? param.constraint_value : parseFloat(param.constraint_value);
        
        location.techs[param.technology].constraints[param.constraint_name] = value;
      }
    });

    // Apply cost parameters
    parsedData.costParameters.forEach(cost => {
      const location = locations.find(l => l.name === cost.location);
      if (location && location.techs[cost.technology]) {
        if (!location.techs[cost.technology].costs.monetary) {
          location.techs[cost.technology].costs.monetary = {};
        }
        location.techs[cost.technology].costs.monetary[cost.cost_type] = parseFloat(cost.value);
      }
    });

    // Process time series
    Object.entries(parsedData.timeSeries).forEach(([filename, data]) => {
      timeSeries.push({
        name: filename,
        data: data,
        uploadedAt: new Date().toISOString()
      });
    });

    return { locations, links, technologies, timeSeries };
  };

  const handleCreateModel = () => {
    try {
      const modelData = buildModelFromData();
      
      createModel(
        modelName || 'Imported Model',
        modelData.locations,
        modelData.links,
        [],
        modelData.technologies,
        {
          description: 'Model created via bulk import',
          importedAt: new Date().toISOString(),
          fileCount: Object.values(files).flat().length
        }
      );

      showNotification('Model created successfully!', 'success');
      
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      showNotification(`Error creating model: ${error.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Bulk Import Model</h2>
              <p className="text-sm text-slate-600 mt-1">
                Step {step} of 3: {step === 1 ? 'Upload Files' : step === 2 ? 'Validate Data' : 'Preview & Create'}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <FiX size={24} />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-slate-100">
          <div 
            className="h-full bg-gray-600 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Model Name *
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="Enter model name..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Locations File */}
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                      <FiMapPin className="text-gray-600" size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Locations *</h3>
                    <p className="text-xs text-slate-600 text-center mb-3">
                      CSV file with all geographic locations
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect('locations', e.target.files[0])}
                        className="hidden"
                      />
                      <span className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 inline-block">
                        Select File
                      </span>
                    </label>
                    {files.locations && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                        <FiCheckCircle />
                        {files.locations.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Transmission Lines File */}
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center mb-3">
                      <FiLink className="text-gray-900" size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Transmission Lines</h3>
                    <p className="text-xs text-slate-600 text-center mb-3">
                      CSV file with connections between locations
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect('transmissionLines', e.target.files[0])}
                        className="hidden"
                      />
                      <span className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 inline-block">
                        Select File
                      </span>
                    </label>
                    {files.transmissionLines && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                        <FiCheckCircle />
                        {files.transmissionLines.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tech Parameters File */}
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                      <FiZap className="text-gray-600" size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Tech Parameters</h3>
                    <p className="text-xs text-slate-600 text-center mb-3">
                      CSV file with technology constraints
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect('techParameters', e.target.files[0])}
                        className="hidden"
                      />
                      <span className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 inline-block">
                        Select File
                      </span>
                    </label>
                    {files.techParameters && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                        <FiCheckCircle />
                        {files.techParameters.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cost Parameters File */}
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-gray-400 transition-colors">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center mb-3">
                      <FiDatabase className="text-gray-900" size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Cost Parameters</h3>
                    <p className="text-xs text-slate-600 text-center mb-3">
                      CSV file with economic parameters
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect('costParameters', e.target.files[0])}
                        className="hidden"
                      />
                      <span className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 inline-block">
                        Select File
                      </span>
                    </label>
                    {files.costParameters && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                        <FiCheckCircle />
                        {files.costParameters.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Time Series Files */}
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6">
                <h3 className="font-semibold text-slate-800 mb-3">Time Series Data (Optional)</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Upload multiple CSV files with hourly data (demand, solar, wind, prices, etc.)
                </p>
                <label className="cursor-pointer inline-block">
                  <input
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={(e) => {
                      Array.from(e.target.files).forEach(file => {
                        handleFileSelect('timeSeries', file);
                      });
                    }}
                    className="hidden"
                  />
                  <span className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 inline-block">
                    Add Time Series Files
                  </span>
                </label>
                
                {files.timeSeries.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {files.timeSeries.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <FiFile className="text-slate-600" />
                          {file.name}
                        </div>
                        <button
                          onClick={() => removeTimeSeriesFile(index)}
                          className="text-gray-600 hover:text-gray-700"
                        >
                          <FiX size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Validation Results</h3>
                {isProcessing && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent" />
                    <span className="text-sm">Processing...</span>
                  </div>
                )}
              </div>

              {errors.length > 0 && (
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-900 font-semibold mb-3">
                    <FiAlertCircle />
                    {errors.length} Error{errors.length !== 1 ? 's' : ''} Found
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {errors.map((error, index) => (
                      <div key={index} className="text-sm text-gray-700">
                        • {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-800 font-semibold mb-3">
                    <FiAlertCircle />
                    {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {warnings.map((warning, index) => (
                      <div key={index} className="text-sm text-gray-700">
                        • {warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errors.length === 0 && !isProcessing && (
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-900">
                    <FiCheckCircle />
                    <span className="font-semibold">All validation checks passed!</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800">Model Preview</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-600">{parsedData.locations.length}</div>
                  <div className="text-sm text-gray-800">Locations</div>
                </div>
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900">{parsedData.transmissionLines.length}</div>
                  <div className="text-sm text-gray-700">Transmission Lines</div>
                </div>
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900">{Object.keys(parsedData.timeSeries).length}</div>
                  <div className="text-sm text-gray-700">Time Series Files</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h4 className="font-semibold text-slate-800 mb-3">Sample Locations</h4>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">Name</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">Type</th>
                        <th className="text-left py-2 px-3 font-semibold text-slate-700">Coordinates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.locations.slice(0, 10).map((loc, index) => (
                        <tr key={index} className="border-b border-slate-100">
                          <td className="py-2 px-3 text-slate-800">{loc.name}</td>
                          <td className="py-2 px-3 text-slate-600">{loc.type}</td>
                          <td className="py-2 px-3 text-slate-600">
                            {parseFloat(loc.latitude).toFixed(4)}, {parseFloat(loc.longitude).toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.locations.length > 10 && (
                    <div className="text-center py-2 text-sm text-slate-500">
                      ... and {parsedData.locations.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Back
              </button>
            )}
            
            {step === 1 && (
              <button
                onClick={parseFiles}
                disabled={!files.locations || !modelName}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Validate Files
              </button>
            )}
            
            {step === 2 && errors.length === 0 && (
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Continue to Preview
              </button>
            )}
            
            {step === 3 && (
              <button
                onClick={handleCreateModel}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
              >
                <FiCheckCircle />
                Create Model
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkImport;
