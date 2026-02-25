import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FiUpload, 
  FiTrash2, 
  FiBarChart2, 
  FiDownload, 
  FiClock,
  FiTrendingUp,
  FiActivity,
  FiDatabase,
  FiFileText,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import Papa from 'papaparse';
import { useData } from '../context/DataContext';

const TimeSeries = () => {
  const { timeSeries, setTimeSeries, getCurrentModel } = useData();
  const currentModel = getCurrentModel();
  const chartRef = useRef(null);
  
  const [selectedTimeSeries, setSelectedTimeSeries] = useState(null);
  const [chartType, setChartType] = useState('line'); // 'line', 'bar', 'scatter'
  const [showStats, setShowStats] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editPopup, setEditPopup] = useState(null); // {x, y, value, seriesName, dataIndex, dateLabel}
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef(null); // {seriesName, dataIndex, startY, startValue}

  // Handle global mouse up to stop dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      dragStateRef.current = null;
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        try {
          const instance = chartRef.current.getEchartsInstance();
          if (instance) {
            instance.dispose();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  // Simple notification function
  const showNotification = (message, type = 'info') => {
    alert(message);
  };

  // Load CSV files from template when model loads
  useEffect(() => {
    const loadTemplateTimeSeriesFiles = async () => {
      if (!currentModel || !currentModel.timeSeries || currentModel.timeSeries.length === 0) {
        return;
      }

      // Check if we already have properly formatted CSV data for this model
      const hasProperCSVData = timeSeries.some(ts => 
        ts.modelId === currentModel.id && 
        ts.source === 'template' && 
        ts.columns && 
        ts.columns.length > 2 && // More than just date + one column
        typeof ts.data?.[0] === 'object' // Proper row objects
      );
      
      if (hasProperCSVData) {
        console.log('CSV data already loaded for this model');
        return; // Already loaded
      }

      setLoading(true);
      
      try {
        // Get unique CSV files from the model's timeseries
        const uniqueFiles = [...new Set(currentModel.timeSeries.map(ts => ts.file).filter(Boolean))];
        
        console.log('Unique CSV files to load:', uniqueFiles);
        
        if (uniqueFiles.length === 0) {
          console.log('No CSV files found in model timeSeries');
          setLoading(false);
          return;
        }
        
        const loadedTimeSeries = [];
        
        for (const fileName of uniqueFiles) {
          try {
            // Get templateId and map to folder name
            let templateId = currentModel.metadata?.templateId;
            
            // Map template IDs to actual folder names
            const templateFolderMap = {
              'european': 'european_network',
              'chilean': 'chilean_energy_grid',
              'german': 'german_energy_system',
              'usa': 'usa_energy_system'
            };
            
            // Get the actual folder name
            const templateFolder = templateFolderMap[templateId] || templateId || 'european_network';
            
            console.log('Template ID:', templateId, '-> Folder:', templateFolder, 'for file:', fileName);
            
            // Clean up fileName - extract just the CSV filename
            let cleanFileName = fileName;
            if (fileName.includes('timeseries_data/')) {
              cleanFileName = fileName.split('timeseries_data/').pop();
            } else if (fileName.includes('/')) {
              cleanFileName = fileName.split('/').pop();
            }
            
            const filePath = `/templates/${templateFolder}/timeseries_data/${cleanFileName}`;
            
            console.log('Loading CSV file:', filePath);
            
            const response = await fetch(filePath);
            
            if (!response.ok) {
              console.warn(`Could not load ${cleanFileName} from ${filePath}`, response.status);
              continue;
            }
            
            const csvText = await response.text();
            
            // Check if we got HTML instead of CSV (error page)
            if (csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
              console.error(`Got HTML instead of CSV for ${cleanFileName}. File not found at ${filePath}`);
              continue;
            }
            
            console.log(`Loaded ${cleanFileName}, size: ${csvText.length} bytes`);
            
            // Parse CSV with PapaParse
            Papa.parse(csvText, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: (results) => {
                const columns = results.meta.fields || [];
                const data = results.data;
                
                console.log('CSV Parsed:', fileName);
                console.log('Columns:', columns);
                console.log('First Row:', data[0]);
                console.log('Row Count:', data.length);

                // Calculate statistics
                const statistics = {};
                columns.forEach(col => {
                  const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
                  if (values.length > 0) {
                    statistics[col] = {
                      min: Math.min(...values),
                      max: Math.max(...values),
                      mean: values.reduce((a, b) => a + b, 0) / values.length,
                      sum: values.reduce((a, b) => a + b, 0)
                    };
                  }
                });

                const timeseriesObj = {
                  id: `${currentModel.id}_${cleanFileName}_${Date.now()}`,
                  name: cleanFileName.replace('.csv', ''),
                  fileName: cleanFileName,
                  uploadedAt: new Date().toISOString(),
                  data: data,
                  columns: columns,
                  dateColumn: columns[0], // First column is date
                  dataColumns: columns.slice(1), // Rest are data columns
                  rowCount: data.length,
                  statistics: statistics,
                  modelId: currentModel.id,
                  modelName: currentModel.name,
                  source: 'template'
                };
                
                console.log('Created TimeSeries Object:', timeseriesObj);

                loadedTimeSeries.push(timeseriesObj);
              }
            });
          } catch (error) {
            console.warn(`Error loading ${fileName}:`, error);
          }
        }
        
        // Wait for all async Papa.parse calls to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Add loaded timeseries to state
        if (loadedTimeSeries.length > 0) {
          console.log(`Adding ${loadedTimeSeries.length} CSV files to timeSeries state`);
          setTimeSeries(prev => {
            // Remove old template CSV files for this model and add new ones
            const filtered = prev.filter(ts => 
              !(ts.modelId === currentModel.id && ts.source === 'template' && ts.columns?.length > 2)
            );
            return [...filtered, ...loadedTimeSeries];
          });
        } else {
          console.warn('No timeseries files were successfully loaded');
        }
      } catch (error) {
        console.error('Error loading template timeseries:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTemplateTimeSeriesFiles();
  }, [currentModel?.id]);

  // Get all timeseries for current model
  const modelTimeSeries = useMemo(() => {
    if (!currentModel) {
      return timeSeries;
    }
    
    // Filter timeseries for current model
    // Only show full CSV files (with multiple columns), not individual column data
    return timeSeries.filter(ts => 
      ts.modelId === currentModel.id && 
      ts.columns && 
      ts.columns.length > 1 && // Must have more than just date column
      ts.data && 
      Array.isArray(ts.data) && 
      ts.data.length > 0 &&
      typeof ts.data[0] === 'object' // Data should be array of objects
    );
  }, [timeSeries, currentModel]);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const columns = results.meta.fields || [];
        const data = results.data;

        // Calculate statistics
        const statistics = {};
        columns.forEach(col => {
          const values = data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
          if (values.length > 0) {
            statistics[col] = {
              min: Math.min(...values),
              max: Math.max(...values),
              mean: values.reduce((a, b) => a + b, 0) / values.length,
              sum: values.reduce((a, b) => a + b, 0)
            };
          }
        });

        const newTimeSeries = {
          id: Date.now().toString(),
          name: file.name.replace('.csv', ''),
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          data: data,
          columns: columns,
          dateColumn: columns[0], // First column is always the date/time
          dataColumns: columns.slice(1), // Remaining columns are location data
          rowCount: data.length,
          statistics: statistics,
          modelId: currentModel?.id || null,
          modelName: currentModel?.name || 'No Model',
          source: 'uploaded' // Mark as manually uploaded
        };

        setTimeSeries([...timeSeries, newTimeSeries]);
        setSelectedTimeSeries(newTimeSeries);
        // Auto-select first 2-3 data columns (not including date column)
        setSelectedColumns(columns.slice(1, Math.min(4, columns.length)));
        event.target.value = null;
      },
      error: (error) => {
        alert(`Error parsing CSV: ${error.message}`);
      }
    });
  };

  // Delete timeseries
  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this time series?')) {
      setTimeSeries(timeSeries.filter(ts => ts.id !== id));
      if (selectedTimeSeries?.id === id) {
        setSelectedTimeSeries(null);
        setSelectedColumns([]);
      }
    }
  };

  // Download timeseries as CSV
  const handleDownload = (ts) => {
    const csv = Papa.unparse(ts.data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ts.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Toggle column selection for graphing
  const toggleColumn = (column) => {
    if (selectedColumns.includes(column)) {
      setSelectedColumns(selectedColumns.filter(c => c !== column));
    } else {
      setSelectedColumns([...selectedColumns, column]);
    }
  };

  // Update point value by dragging or manual input
  const updatePointValue = (seriesName, dataIndex, newValue) => {
    const newData = [...selectedTimeSeries.data];
    newData[dataIndex][seriesName] = parseFloat(newValue) || 0;
    
    // Recalculate statistics
    const columns = selectedTimeSeries.columns;
    const statistics = {};
    columns.forEach(col => {
      const values = newData.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
      if (values.length > 0) {
        statistics[col] = {
          min: Math.min(...values),
          max: Math.max(...values),
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          sum: values.reduce((a, b) => a + b, 0)
        };
      }
    });

    // Update the timeseries
    const updatedTimeSeries = {
      ...selectedTimeSeries,
      data: newData,
      statistics: statistics,
      modified: true,
      lastModified: new Date().toISOString()
    };

    // Update in global state
    setTimeSeries(prev => prev.map(ts => 
      ts.id === selectedTimeSeries.id ? updatedTimeSeries : ts
    ));

    setSelectedTimeSeries(updatedTimeSeries);
  };

  // Export modified data as CSV
  const exportModifiedData = () => {
    const csv = Papa.unparse(selectedTimeSeries.data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedTimeSeries.fileName;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('CSV exported successfully!', 'success');
  };

  // Get date/time column (always the first column)
  const getDateColumn = (ts) => {
    if (!ts || !ts.columns || ts.columns.length === 0) return null;
    // First column is always the date/time column
    return ts.dateColumn || ts.columns[0];
  };

  // Get data columns (all columns except the first one)
  const getDataColumns = (ts) => {
    if (!ts || !ts.columns || ts.columns.length <= 1) return [];
    // Return all columns except the first one (date column)
    return ts.dataColumns || ts.columns.slice(1);
  };

  // Get ECharts option
  const getChartOption = () => {
    if (!selectedTimeSeries || selectedColumns.length === 0) return {};
    if (!selectedTimeSeries.data || selectedTimeSeries.data.length === 0) return {};

    const dateCol = getDateColumn(selectedTimeSeries);
    
    // Validate date column exists
    if (!dateCol || !selectedTimeSeries.data[0][dateCol]) {
      console.error('Invalid date column:', dateCol, selectedTimeSeries.data[0]);
      return {};
    }
    
    const xAxisData = selectedTimeSeries.data.map(row => row[dateCol]);

    const series = selectedColumns.map(col => {
      const seriesData = selectedTimeSeries.data.map((row, idx) => {
        const val = row[col];
        return [idx, val !== undefined && val !== null ? val : 0];
      });
      
      return {
        name: col,
        type: chartType,
        data: seriesData,
        smooth: chartType === 'line',
        showSymbol: true,
        symbolSize: 10,
        itemStyle: {
          cursor: 'move'
        },
        lineStyle: chartType === 'line' ? { width: 2 } : undefined,
      };
    });

    return {
      title: {
        text: selectedTimeSeries.name,
        left: 'center',
        textStyle: {
          fontSize: 18,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        axisPointer: {
          type: 'cross'
        },
        formatter: (params) => {
          return `${params.seriesName}<br/>${xAxisData[params.dataIndex]}: ${params.value[1]}<br/><i>Drag to move, Double-click to edit</i>`;
        }
      },
      legend: {
        data: selectedColumns,
        top: 40,
        left: 'center'
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '10%',
        top: 100,
        containLabel: true
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },
          restore: {},
          saveAsImage: {}
        }
      },
      xAxis: {
        type: 'category',
        boundaryGap: chartType === 'bar',
        data: xAxisData,
        name: dateCol,
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          rotate: 45,
          formatter: (value) => {
            // Show fewer labels for large datasets
            if (xAxisData.length > 100) {
              return value;
            }
            return value;
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Value',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          formatter: '{value}'
        }
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        },
        {
          start: 0,
          end: 100
        }
      ],
      series: series
    };
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">
            Time Series
            <span className="text-xs text-slate-500 ml-2 font-normal">
              {currentModel ? currentModel.name : 'No model'} • {modelTimeSeries.length} files
            </span>
          </h1>
          
          {/* Upload Button */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg font-medium hover:bg-gray-800 transition-all cursor-pointer">
            <FiUpload size={14} />
            Upload
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Uploaded Time Series Section - Above Graph (Compact) */}
        <div className="bg-white border-b border-slate-200 px-4 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
              <FiDatabase size={12} />
              Files:
            </span>

            {modelTimeSeries.length === 0 ? (
              <div className="text-slate-400 text-xs flex items-center gap-2">
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    <span>Loading...</span>
                  </>
                ) : (
                  <span>No time series data available</span>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-2 overflow-x-auto">
                {modelTimeSeries.map(ts => (
                  <div
                    key={ts.id}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium flex items-center gap-2 cursor-pointer ${
                      selectedTimeSeries?.id === ts.id
                        ? 'border-gray-900 bg-gray-900 text-white shadow-md'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-gray-400 hover:shadow-sm'
                    }`}
                    onClick={() => {
                      setSelectedTimeSeries(ts);
                      const dataColumns = getDataColumns(ts);
                      const columnsToSelect = dataColumns.slice(0, Math.min(5, dataColumns.length));
                      setSelectedColumns(columnsToSelect);
                    }}
                    title={`${ts.fileName} - ${ts.rowCount} rows, ${ts.columns?.length} columns`}
                  >
                    <span className="truncate max-w-[150px]">{ts.name}</span>
                    {ts.source === 'template' && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-700 rounded">T</span>
                    )}
                    {ts.modified && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-yellow-100 text-yellow-800 rounded">M</span>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(ts);
                        }}
                        className="p-0.5 hover:text-blue-400"
                        title="Download"
                      >
                        <FiDownload size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(ts.id);
                        }}
                        className="p-0.5 hover:text-red-400"
                        title="Delete"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content - Chart, Data Info and Stats */}
        <div className="flex-1 overflow-hidden">
          {!selectedTimeSeries ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-slate-400">
                <FiBarChart2 className="mx-auto mb-4 text-6xl" />
                <p className="text-lg font-medium">Select a time series to visualize</p>
                <p className="text-sm mt-2">Choose from the list on the left or upload a new CSV file</p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Data Info - Above Graph */}
              <div className="bg-white border-b border-slate-200 px-4 py-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <FiFileText size={12} />
                    <span className="font-semibold text-slate-800">{selectedTimeSeries.name}</span>
                    {selectedTimeSeries.modified && (
                      <span className="px-1.5 py-0.5 text-[9px] bg-yellow-100 text-yellow-800 rounded">Modified</span>
                    )}
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-600">{getDateColumn(selectedTimeSeries)}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-600">{selectedTimeSeries.rowCount} rows</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-600">{getDataColumns(selectedTimeSeries).length} columns</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={exportModifiedData}
                      className="px-2 py-1 text-[11px] bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                    >
                      <FiDownload size={10} />
                      Export
                    </button>
                  </div>
                </div>
                <div className="border-t border-slate-100 mt-1.5 pt-1.5">
                  <div className="flex flex-wrap gap-1">
                    {getDataColumns(selectedTimeSeries).map(col => (
                      <label
                        key={col}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-all text-[11px]"
                        style={{
                          backgroundColor: selectedColumns.includes(col) ? '#111827' : '#e2e8f0',
                          color: selectedColumns.includes(col) ? 'white' : '#475569'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(col)}
                          onChange={() => toggleColumn(col)}
                          className="w-2.5 h-2.5 rounded"
                        />
                        <span className="font-medium">{col}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart and Stats Side by Side */}
              <div className="flex-1 flex overflow-hidden">
                {/* Chart Section - Left Side */}
                <div className="flex-1 overflow-hidden p-2 pr-0">
                  <div className="bg-white rounded-lg shadow p-2 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <FiBarChart2 size={12} />
                        Chart
                      </h3>
                      
                      <div className="flex gap-1">
                        <button
                          onClick={() => setChartType('line')}
                          className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${
                            chartType === 'line'
                              ? 'bg-gray-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Line
                        </button>
                        <button
                          onClick={() => setChartType('bar')}
                          className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${
                            chartType === 'bar'
                              ? 'bg-gray-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Bar
                        </button>
                        <button
                          onClick={() => setChartType('scatter')}
                          className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${
                            chartType === 'scatter'
                              ? 'bg-gray-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Scatter
                        </button>
                      </div>
                    </div>

                    {selectedColumns.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <FiActivity className="mx-auto mb-2 text-3xl" />
                        <p className="text-xs">Select at least one column to display</p>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 relative">
                        {selectedTimeSeries?.data?.length > 0 && (() => {
                          const dateCol = getDateColumn(selectedTimeSeries);
                          const xAxisData = selectedTimeSeries.data.map(row => row[dateCol]);
                          
                          return (
                            <ReactECharts
                              ref={chartRef}
                              key={`${selectedTimeSeries.id}-${selectedColumns.join('-')}`}
                              option={getChartOption()}
                              style={{ height: '100%', width: '100%' }}
                              opts={{ renderer: 'canvas' }}
                              notMerge={true}
                              lazyUpdate={false}
                              onEvents={{
                                'mousedown': (params) => {
                                  // Only start dragging if clicking directly on a data point
                                  if (params.componentType === 'series' && 
                                      params.event?.event?.button === 0 &&
                                      params.seriesName && 
                                      params.dataIndex !== undefined) {
                                    
                                    dragStateRef.current = {
                                      seriesName: params.seriesName,
                                      dataIndex: params.dataIndex,
                                      startY: params.event.event.clientY,
                                      startValue: params.value[1]
                                    };
                                    setIsDragging(true);
                                  }
                                },
                                'mouseup': () => {
                                  setIsDragging(false);
                                  dragStateRef.current = null;
                                },
                                'globalout': () => {
                                  // Stop dragging if mouse leaves chart
                                  setIsDragging(false);
                                  dragStateRef.current = null;
                                },
                                'dblclick': (params) => {
                                  if (params.componentType === 'series' && chartRef.current) {
                                    const dateLabel = xAxisData[params.dataIndex];
                                    const currentValue = params.value[1];
                                    
                                    // Get chart instance and position
                                    const echartsInstance = chartRef.current.getEchartsInstance();
                                    const chartDom = echartsInstance.getDom();
                                    const rect = chartDom.getBoundingClientRect();
                                    
                                    // Use event page coordinates relative to chart
                                    const x = params.event.offsetX || (params.event.event.pageX - rect.left);
                                    const y = params.event.offsetY || (params.event.event.pageY - rect.top);
                                    
                                    setEditPopup({
                                      x: x,
                                      y: y - 80, // Position above the point
                                      value: currentValue,
                                      seriesName: params.seriesName,
                                      dataIndex: params.dataIndex,
                                      dateLabel: dateLabel
                                    });
                                  }
                                },
                                'mousemove': (params) => {
                                  // Only drag if we have an active drag state AND mouse button is still pressed
                                  if (isDragging && 
                                      dragStateRef.current && 
                                      params.event?.event?.buttons === 1) {
                                    
                                    const currentY = params.event.event.clientY;
                                    const deltaY = dragStateRef.current.startY - currentY; // Positive = moved up
                                    
                                    // Get chart dimensions to calculate value range
                                    const echartsInstance = chartRef.current?.getEchartsInstance();
                                    if (!echartsInstance) return;
                                    
                                    const option = echartsInstance.getOption();
                                    const yAxis = option.yAxis[0];
                                    const gridHeight = echartsInstance.getHeight() - 180; // Approximate grid height
                                    
                                    // Calculate value change based on pixel movement and y-axis range
                                    const yMin = yAxis.min !== undefined ? yAxis.min : Math.min(...selectedTimeSeries.data.map(row => {
                                      let min = Infinity;
                                      selectedColumns.forEach(col => {
                                        const val = parseFloat(row[col]);
                                        if (!isNaN(val) && val < min) min = val;
                                      });
                                      return min;
                                    }));
                                    
                                    const yMax = yAxis.max !== undefined ? yAxis.max : Math.max(...selectedTimeSeries.data.map(row => {
                                      let max = -Infinity;
                                      selectedColumns.forEach(col => {
                                        const val = parseFloat(row[col]);
                                        if (!isNaN(val) && val > max) max = val;
                                      });
                                      return max;
                                    }));
                                    
                                    const valueRange = yMax - yMin;
                                    const pixelToValue = valueRange / gridHeight;
                                    const valueChange = deltaY * pixelToValue;
                                    
                                    const newValue = dragStateRef.current.startValue + valueChange;
                                    
                                    if (!isNaN(newValue) && newValue >= 0) {
                                      updatePointValue(dragStateRef.current.seriesName, dragStateRef.current.dataIndex, newValue);
                                    }
                                  } else if (params.event?.event?.buttons === 0) {
                                    // Mouse button released - stop dragging
                                    setIsDragging(false);
                                    dragStateRef.current = null;
                                  }
                                }
                              }}
                            />
                          );
                        })()}
                        
                        {/* Custom Edit Popup */}
                        {editPopup && (
                          <div
                            className="absolute bg-white border-2 border-gray-900 rounded-lg shadow-xl p-3 z-50"
                            style={{
                              left: `${editPopup.x}px`,
                              top: `${editPopup.y}px`,
                              transform: 'translateX(-50%)',
                              minWidth: '180px'
                            }}
                          >
                            <div className="text-xs font-semibold text-gray-800 mb-2">
                              {editPopup.seriesName}
                            </div>
                            <div className="text-[10px] text-gray-600 mb-2">
                              {editPopup.dateLabel}
                            </div>
                            <input
                              type="number"
                              autoFocus
                              defaultValue={editPopup.value.toFixed(2)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newValue = parseFloat(e.target.value);
                                  if (!isNaN(newValue)) {
                                    updatePointValue(editPopup.seriesName, editPopup.dataIndex, newValue);
                                  }
                                  setEditPopup(null);
                                } else if (e.key === 'Escape') {
                                  setEditPopup(null);
                                }
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                              step="0.01"
                            />
                            <div className="flex gap-1.5 mt-2">
                              <button
                                onClick={() => {
                                  const input = document.querySelector('input[type=\"number\"]');
                                  const newValue = parseFloat(input.value);
                                  if (!isNaN(newValue)) {
                                    updatePointValue(editPopup.seriesName, editPopup.dataIndex, newValue);
                                  }
                                  setEditPopup(null);
                                }}
                                className="flex-1 px-2 py-1 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors font-medium"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => setEditPopup(null)}
                                className="flex-1 px-2 py-1 text-[10px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Statistics Section - Right Side */}
                <div className="w-48 border-l border-slate-200 overflow-y-auto p-2 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <FiTrendingUp size={11} />
                      Stats
                    </h3>
                    <button
                      onClick={() => setShowStats(!showStats)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {showStats ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
                    </button>
                  </div>

                  {showStats && selectedTimeSeries.statistics && (
                    <div className="space-y-2">
                      {Object.entries(selectedTimeSeries.statistics).map(([col, stats]) => {
                        const colData = selectedTimeSeries.data.map(row => {
                          const val = parseFloat(row[col]);
                          return isNaN(val) ? 0 : val;
                        }).filter(v => v !== null && v !== undefined);
                        
                        if (colData.length === 0) return null;
                        
                        const max = Math.max(...colData);
                        const min = Math.min(...colData);
                        const range = max - min || 1;
                        
                        const sparklinePoints = colData.map((val, idx) => {
                          const x = (idx / Math.max(colData.length - 1, 1)) * 100;
                          const y = 100 - (((val - min) / range) * 80);
                          return `${x.toFixed(2)},${y.toFixed(2)}`;
                        }).join(' ');
                        
                        return (
                          <div
                            key={col}
                            className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm"
                          >
                            <div className="text-xs font-semibold text-slate-700 mb-2 truncate" title={col}>
                              {col}
                            </div>
                            
                            {/* Mini sparkline chart */}
                            <svg className="w-full h-8 mb-2" viewBox="0 0 100 100" preserveAspectRatio="none">
                              <polyline
                                points={sparklinePoints}
                                fill="none"
                                stroke="#1f2937"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                              />
                            </svg>
                            
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Min:</span>
                                <span className="font-semibold text-slate-800">{stats.min.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Max:</span>
                                <span className="font-semibold text-slate-800">{stats.max.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Avg:</span>
                                <span className="font-semibold text-slate-800">{stats.mean.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimeSeries;
