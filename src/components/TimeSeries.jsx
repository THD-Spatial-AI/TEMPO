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
import SaveBar from './ui/SaveBar';

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
  const [viewMode, setViewMode] = useState('weeks2');
  const [viewMonth, setViewMonth] = useState(0);
  const [viewSeason, setViewSeason] = useState('DJF');
  const [viewCustomStart, setViewCustomStart] = useState('');
  const [viewCustomEnd, setViewCustomEnd] = useState('');
  const [viewResolution, setViewResolution] = useState('hourly');
  const [colSearch, setColSearch] = useState('');

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

  // Fallback CSV files per templateId when model.timeSeries is empty (e.g. after reload)
  const TEMPLATE_CSV_FILES = {
    'german':   ['german_demand_2024.csv'],
    'european': ['european_demand_2024.csv'],
    'chilean':  ['total_demand_2024.csv', 'resource_pv_2024.csv', 'resource_wind_2024.csv'],
    'chile':    ['total_demand_2024.csv', 'resource_pv_2024.csv', 'resource_wind_2024.csv'],
    'usa':      [],
  };

  // Load CSV files from template when model loads
  useEffect(() => {
    const loadTemplateTimeSeriesFiles = async () => {
      if (!currentModel) {
        return;
      }

      // Check if we already have properly formatted CSV data for this model
      const hasProperCSVData = timeSeries.some(ts => 
        ts.modelId === currentModel.id && 
        (ts.source === 'template' || ts.source === 'calliope_yaml') && 
        ts.columns && 
        ts.columns.length > 1 && // date + at least one data column
        typeof ts.data?.[0] === 'object' // Proper row objects
      );
      
      if (hasProperCSVData) {
        console.log('CSV data already loaded for this model');
        return; // Already loaded
      }

      // If this model was imported from a Calliope YAML, don't attempt a network re-fetch
      // (the data lives in the timeSeries state and may just be temporarily stale due to
      //  the async backend ID swap — DataContext will sync the modelIds shortly)
      if (currentModel.metadata?.source === 'calliope_yaml') {
        return;
      }

      setLoading(true);
      
      try {
        // Get templateId first so we can use it for the fallback file list
        let templateId = currentModel.metadata?.templateId;
        // Infer from model name if not stored
        if (!templateId) {
          const nameLower = (currentModel.name || '').toLowerCase();
          if (nameLower.includes('german')) templateId = 'german';
          else if (nameLower.includes('chilean') || nameLower.includes('chile')) templateId = 'chilean';
          else if (nameLower.includes('european') || nameLower.includes('europe')) templateId = 'european';
          else if (nameLower.includes('usa') || nameLower.includes('american')) templateId = 'usa';
        }

        // Get unique CSV files from the model's timeseries; fall back to known template file list
        let uniqueFiles = [...new Set((currentModel.timeSeries || []).map(ts => ts.file).filter(Boolean))];
        if (uniqueFiles.length === 0 && templateId && TEMPLATE_CSV_FILES[templateId]) {
          uniqueFiles = TEMPLATE_CSV_FILES[templateId];
        }
        
        console.log('Unique CSV files to load:', uniqueFiles);
        
        if (uniqueFiles.length === 0) {
          console.log('No CSV files found in model timeSeries');
          setLoading(false);
          return;
        }
        
        const loadedTimeSeries = [];
        
        for (const fileName of uniqueFiles) {
          try {
            // Map template IDs to actual folder names
            const templateFolderMap = {
              'european': 'european_network',
              'chilean': 'chilean_energy_grid',
              'chile':   'chilean_energy_grid',
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

  // Filtered + downsampled rows for chart rendering
  const { filteredData, filteredIndices } = useMemo(() => {
    if (!selectedTimeSeries?.data) return { filteredData: [], filteredIndices: [] };
    const data = selectedTimeSeries.data;
    const dateCol = selectedTimeSeries.dateColumn || selectedTimeSeries.columns?.[0];
    const SEASON_MONTHS = { DJF: [11, 0, 1], MAM: [2, 3, 4], JJA: [5, 6, 7], SON: [8, 9, 10] };

    // Step 1: row filtering by date range
    let indices = data.map((_, i) => i);
    if (viewMode === 'weeks2') {
      indices = indices.slice(0, Math.min(14 * 24, data.length));
    } else if (viewMode === 'month' && dateCol) {
      indices = indices.filter(i => { const d = new Date(data[i][dateCol]); return !isNaN(d) && d.getMonth() === viewMonth; });
    } else if (viewMode === 'seasonal' && dateCol) {
      const months = SEASON_MONTHS[viewSeason] || [];
      indices = indices.filter(i => { const d = new Date(data[i][dateCol]); return !isNaN(d) && months.includes(d.getMonth()); });
    } else if (viewMode === 'custom' && viewCustomStart && viewCustomEnd && dateCol) {
      const start = new Date(viewCustomStart), end = new Date(viewCustomEnd);
      indices = indices.filter(i => { const d = new Date(data[i][dateCol]); return !isNaN(d) && d >= start && d <= end; });
    }

    let rows = indices.map(i => data[i]);
    const dataCols = selectedTimeSeries.dataColumns || selectedTimeSeries.columns?.slice(1) || [];

    // Step 2: resolution downsampling (daily / weekly average)
    if ((viewResolution === 'daily' || viewResolution === 'weekly') && rows.length > 0 && dateCol) {
      const groups = new Map();
      rows.forEach((row, fi) => {
        const d = new Date(row[dateCol]);
        if (isNaN(d)) return;
        let key;
        if (viewResolution === 'daily') {
          key = d.toISOString().slice(0, 10);
        } else {
          const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
          key = ws.toISOString().slice(0, 10);
        }
        if (!groups.has(key)) groups.set(key, { sum: {}, count: 0, fi });
        const g = groups.get(key); g.count++;
        dataCols.forEach(col => { g.sum[col] = (g.sum[col] || 0) + (parseFloat(row[col]) || 0); });
      });
      rows = Array.from(groups.entries()).map(([key, g]) => {
        const out = { [dateCol]: key };
        dataCols.forEach(col => { out[col] = g.sum[col] / g.count; });
        return out;
      });
      indices = Array.from(groups.values()).map(g => indices[g.fi]);
    }

    return { filteredData: rows, filteredIndices: indices };
  }, [selectedTimeSeries, viewMode, viewMonth, viewSeason, viewCustomStart, viewCustomEnd, viewResolution]);

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
    const originalIndex = filteredIndices[dataIndex] ?? dataIndex;
    const newData = [...selectedTimeSeries.data];
    newData[originalIndex][seriesName] = parseFloat(newValue) || 0;
    
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
    const chartData = filteredData.length > 0 ? filteredData : (selectedTimeSeries?.data || []);
    if (!chartData.length) return {};

    const dateCol = getDateColumn(selectedTimeSeries);
    if (!dateCol || !chartData[0]?.[dateCol]) return {};

    const xAxisData = chartData.map(row => row[dateCol]);

    const series = selectedColumns.map(col => {
      // Calliope stores demand as negative; flip to positive for display
      const colVals = chartData.map(row => row[col]).filter(v => v !== undefined && v !== null && v !== '');
      const allNeg = colVals.length > 0 && colVals.every(v => parseFloat(v) <= 0);
      const seriesData = chartData.map((row) => {
        const ts = new Date(row[dateCol]).getTime();
        let val = row[col];
        if (val !== undefined && val !== null) val = parseFloat(val) || 0;
        else val = 0;
        if (allNeg) val = -val;
        return [isNaN(ts) ? 0 : ts, val];
      });
      
      return {
        name: col + (allNeg ? ' (↑abs)' : ''),
        type: chartType,
        data: seriesData,
        smooth: chartType === 'line',
        showSymbol: true,
        symbolSize: chartData.length > 500 ? 4 : chartData.length > 100 ? 6 : 8,
        itemStyle: { cursor: 'move' },
        lineStyle: chartType === 'line' ? { width: 1.5 } : undefined,
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
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (paramsArr) => {
          const p = Array.isArray(paramsArr) ? paramsArr[0] : paramsArr;
          const rowDate = xAxisData[p.dataIndex] ?? '';
          const lines = (Array.isArray(paramsArr) ? paramsArr : [paramsArr])
            .map(q => `${q.marker}${q.seriesName}: <b>${typeof q.value[1] === 'number' ? q.value[1].toFixed(2) : q.value[1]}</b>`)
            .join('<br/>');
          return `<span style="font-size:10px;color:#64748b">${rowDate}</span><br/>${lines}`;
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
        type: 'time',
        boundaryGap: chartType === 'bar' ? ['5%', '5%'] : false,
        axisLabel: {
          fontSize: 10,
          color: '#64748b',
          hideOverlap: true,
          formatter: {
            year: '{yyyy}',
            month: '{MMM} {yyyy}',
            day: '{d} {MMM}',
            hour: '{HH}:00\n{d}/{M}',
            minute: '{HH}:{mm}',
            second: '{HH}:{mm}:{ss}',
          }
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
      },
      yAxis: {
        type: 'value',
        name: 'Value',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: { formatter: '{value}', fontSize: 10, color: '#64748b' },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
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
      <SaveBar label="Time Series" />
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
                          const chartData = filteredData.length > 0 ? filteredData : selectedTimeSeries.data;
                          const xAxisData = chartData.map(row => row[dateCol]);
                          
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

                {/* Filter + Columns + Stats Sidebar */}
                <div className="w-56 shrink-0 border-l border-slate-200 overflow-y-auto bg-white flex flex-col">
                  <div className="p-3 space-y-4">

                    {/* Range */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Range</p>
                      <div className="flex flex-col gap-1">
                        {[['weeks2','First 2 wks'],['month','Month'],['seasonal','Season'],['custom','Custom']].map(([id, lbl]) => (
                          <button key={id} onClick={() => setViewMode(id)}
                            className="px-2 py-1 rounded text-[11px] font-medium border transition-all text-left w-full"
                            style={viewMode === id ? { background: '#6366f1', color: 'white', borderColor: '#6366f1' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                      {viewMode === 'month' && (
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                            <button key={i} onClick={() => setViewMonth(i)}
                              className="px-1 py-0.5 rounded text-[10px] font-medium border transition-all text-center"
                              style={viewMonth === i ? { background: '#6366f1', color: 'white', borderColor: '#6366f1' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                      {viewMode === 'seasonal' && (
                        <div className="mt-2 flex flex-col gap-1">
                          {[['DJF','Winter'],['MAM','Spring'],['JJA','Summer'],['SON','Autumn']].map(([id, lbl]) => (
                            <button key={id} onClick={() => setViewSeason(id)}
                              className="px-2 py-1 rounded text-[11px] font-medium border transition-all"
                              style={viewSeason === id ? { background: '#6366f1', color: 'white', borderColor: '#6366f1' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                              {lbl} <span className="opacity-60 text-[9px]">({id})</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {viewMode === 'custom' && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">From</label>
                            <input type="date" value={viewCustomStart} onChange={e => setViewCustomStart(e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] bg-white" />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">To</label>
                            <input type="date" value={viewCustomEnd} onChange={e => setViewCustomEnd(e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] bg-white" />
                          </div>
                          {viewCustomStart && viewCustomEnd && (
                            <span className="text-[10px] text-slate-400 text-center">
                              {Math.max(0, Math.round((new Date(viewCustomEnd) - new Date(viewCustomStart)) / 86400000))} days
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resolution */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Resolution</p>
                      <div className="flex flex-col gap-1">
                        {[['hourly','Hourly'],['daily','Daily avg'],['weekly','Weekly avg']].map(([id, lbl]) => (
                          <button key={id} onClick={() => setViewResolution(id)}
                            className="px-2 py-1 rounded text-[11px] font-medium border transition-all text-left w-full"
                            style={viewResolution === id ? { background: '#6366f1', color: 'white', borderColor: '#6366f1' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Columns */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                        Columns <span className="font-normal text-slate-300">({selectedColumns.length}/{getDataColumns(selectedTimeSeries).length})</span>
                      </p>
                      <div className="flex gap-2 mb-1.5">
                        <button onClick={() => setSelectedColumns(getDataColumns(selectedTimeSeries))} className="text-[10px] text-indigo-500 hover:underline">All</button>
                        <button onClick={() => setSelectedColumns([])} className="text-[10px] text-slate-400 hover:underline">None</button>
                      </div>
                      <input type="text" placeholder="Search columns…" value={colSearch} onChange={e => setColSearch(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] bg-white mb-1" />
                      <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-0.5">
                        {getDataColumns(selectedTimeSeries)
                          .filter(c => !colSearch || c.toLowerCase().includes(colSearch.toLowerCase()))
                          .map(col => (
                            <button key={col} title={col} onClick={() => toggleColumn(col)}
                              className="px-2 py-1.5 rounded text-[11px] border transition-all text-left leading-snug whitespace-normal break-all"
                              style={selectedColumns.includes(col)
                                ? { background: '#ede9fe', borderColor: '#8b5cf6', color: '#5b21b6' }
                                : { background: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }}>
                              {col}
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Stats (collapsible) */}
                    <div>
                      <button className="flex items-center justify-between w-full mb-1" onClick={() => setShowStats(!showStats)}>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Statistics</p>
                        {showStats ? <FiChevronUp size={10} className="text-slate-400" /> : <FiChevronDown size={10} className="text-slate-400" />}
                      </button>
                      {showStats && selectedTimeSeries.statistics && (
                        <div className="space-y-2">
                          {Object.entries(selectedTimeSeries.statistics)
                            .filter(([col]) => selectedColumns.includes(col))
                            .map(([col, stats]) => {
                              const colData = selectedTimeSeries.data.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
                              if (!colData.length) return null;
                              const max = Math.max(...colData), min = Math.min(...colData), range = max - min || 1;
                              const pts = colData.map((v, i) => `${((i / Math.max(colData.length - 1, 1)) * 100).toFixed(1)},${(100 - ((v - min) / range) * 80).toFixed(1)}`).join(' ');
                              return (
                                <div key={col} className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-[10px] font-semibold text-slate-700 mb-1 truncate" title={col}>{col}</div>
                                  <svg className="w-full h-6 mb-1" viewBox="0 0 100 100" preserveAspectRatio="none">
                                    <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                  </svg>
                                  <div className="grid grid-cols-2 gap-x-1 text-[10px]">
                                    <span className="text-slate-400">Min</span><span className="font-semibold text-slate-700 text-right">{stats.min.toFixed(1)}</span>
                                    <span className="text-slate-400">Max</span><span className="font-semibold text-slate-700 text-right">{stats.max.toFixed(1)}</span>
                                    <span className="text-slate-400">Avg</span><span className="font-semibold text-slate-700 text-right">{stats.mean.toFixed(1)}</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                  </div>
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
