// Filter / resolution / columns / stats sidebar for the TimeSeries chart view.
// Extracted verbatim from TimeSeries.jsx; all view state passed as props.
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

export default function TimeSeriesFilterSidebar({
  colSearch,
  getDataColumns,
  selectedColumns,
  selectedTimeSeries,
  setColSearch,
  setSelectedColumns,
  setShowStats,
  setViewCustomEnd,
  setViewCustomStart,
  setViewMode,
  setViewMonth,
  setViewResolution,
  setViewSeason,
  showStats,
  toggleColumn,
  viewCustomEnd,
  viewCustomStart,
  viewMode,
  viewMonth,
  viewResolution,
  viewSeason,
}) {
  return (
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
                        <button onClick={() => setSelectedColumns(getDataColumns(selectedTimeSeries))} className="text-[10px] text-gray-500 hover:underline">All</button>
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
  );
}
