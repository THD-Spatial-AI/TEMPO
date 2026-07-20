// TimeSeriesChart — interactive ECharts chart + drag-to-edit popup.
// Extracted verbatim from TimeSeries.jsx; chart state/refs/handlers passed as props.
import { FiActivity, FiBarChart2 } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';

export default function TimeSeriesChart({
  filteredData,
  chartRef,
  chartType,
  dragStateRef,
  editPopup,
  getChartOption,
  getDateColumn,
  isDragging,
  selectedColumns,
  selectedTimeSeries,
  setChartType,
  setEditPopup,
  setIsDragging,
  updatePointValue,
}) {
  return (
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
  );
}
