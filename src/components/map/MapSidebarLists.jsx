// Left-sidebar list panels (locations, links, time-series demand profiles) for
// the Deck.GL map view. Extracted verbatim from MapDeckGL.jsx; the parent owns
// the state and passes it as props, and still gates on !leftSidebarCollapsed.
import { FiActivity, FiArrowRight, FiChevronDown, FiChevronRight, FiEdit2, FiLink, FiMapPin, FiTrash2 } from 'react-icons/fi';
import { formatTechName } from '../../utils/mapVisuals';

export default function MapSidebarLists({
  handleDeleteLocation,
  handleEditLocation,
  handleLocationSelect,
  links,
  linksExpanded,
  locations,
  locationsExpanded,
  selectedLocation,
  setLinks,
  setLinksExpanded,
  setLocations,
  setLocationsExpanded,
  setSelectedLocation,
  setShowTimeseriesSection,
  setTimeseriesFilter,
  setTimeseriesPreview,
  setTimeseriesSortBy,
  setViewState,
  showNotification,
  showTimeseriesSection,
  timeseriesFilter,
  timeseriesPreview,
  timeseriesSortBy,
  viewState,
}) {
  return (
          <div className="flex-1 overflow-y-auto">
            {/* Locations Section */}
            <div className="border-b border-slate-200">
              <div className="flex items-center">
                <button
                  onClick={() => setLocationsExpanded(!locationsExpanded)}
                  className="flex-1 px-4 py-3 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left"
                >
                  <FiMapPin size={14} className="text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Locations</span>
                  <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-1.5">{locations.length}</span>
                  <span className="ml-auto">{locationsExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}</span>
                </button>
                {locations.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete all ${locations.length} locations? This will also remove all links.`)) {
                        setLocations([]);
                        setLinks([]);
                        showNotification('All locations and links deleted', 'success');
                      }
                    }}
                    className="p-2 mr-2 rounded hover:bg-gray-100 text-slate-400 hover:text-gray-600 transition-colors"
                    title="Delete all locations"
                  >
                    <FiTrash2 size={13} />
                  </button>
                )}
              </div>

              {locationsExpanded && (
                <div className="pb-2 space-y-1.5 px-2">
                  {locations.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      No locations yet — use Single, Multiple, or Polyline mode to add
                    </div>
                  ) : (
                    locations.map((loc, idx) => {
                      const techKeys = Object.keys(loc.techs || {});
                      return (
                        <div
                          key={`${loc.name}-${idx}`}
                          onClick={() => { setSelectedLocation(loc); handleLocationSelect(loc); }}
                          className={`rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-sm ${
                            selectedLocation?.name === loc.name
                              ? 'border-gray-700 bg-gray-50'
                              : 'border-slate-200 hover:border-slate-400 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{loc.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {typeof loc.latitude === 'number' ? loc.latitude.toFixed(4) : '—'},&nbsp;
                                {typeof loc.longitude === 'number' ? loc.longitude.toFixed(4) : '—'}
                              </p>
                              {techKeys.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {techKeys.slice(0, 3).map(t => (
                                    <span key={t} className="text-xs bg-gray-100 text-gray-700 rounded px-1 py-0.5 truncate max-w-[80px]">
                                      {formatTechName(t)}
                                    </span>
                                  ))}
                                  {techKeys.length > 3 && (
                                    <span className="text-xs bg-slate-100 text-slate-500 rounded px-1 py-0.5">+{techKeys.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditLocation(loc, idx); }}
                                className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-gray-600 transition-colors"
                                title="Edit location"
                              >
                                <FiEdit2 size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteLocation(idx); }}
                                className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-gray-600 transition-colors"
                                title="Delete location"
                              >
                                <FiTrash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Links Section */}
            <div className="border-b border-slate-200">
              <div className="flex items-center">
                <button
                  onClick={() => setLinksExpanded(!linksExpanded)}
                  className="flex-1 px-4 py-3 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left"
                >
                  <FiLink size={14} className="text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Links</span>
                  <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-1.5">{links.length}</span>
                  <span className="ml-auto">{linksExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}</span>
                </button>
                {links.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete all ${links.length} links?`)) {
                        setLinks([]);
                        showNotification('All links deleted', 'success');
                      }
                    }}
                    className="p-2 mr-2 rounded hover:bg-gray-100 text-slate-400 hover:text-gray-600 transition-colors"
                    title="Delete all links"
                  >
                    <FiTrash2 size={13} />
                  </button>
                )}
              </div>

              {linksExpanded && (
                <div className="pb-2 space-y-1.5 px-2">
                  {links.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      No links yet — use Link or Polyline mode
                    </div>
                  ) : (
                    links.map((link, idx) => (
                      <div
                        key={`${link.from}-${link.to}-${idx}`}
                        className="rounded-lg border border-slate-200 p-2.5 bg-white hover:border-slate-400 transition-all"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-xs font-semibold text-slate-800">
                              <span className="truncate max-w-[60px]">{link.from}</span>
                              <FiArrowRight size={10} className="shrink-0 text-slate-400" />
                              <span className="truncate max-w-[60px]">{link.to}</span>
                            </div>
                            {link.distance != null && (
                              <span className="text-xs text-slate-400 mt-0.5 block">{link.distance} km</span>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete link ${link.from} → ${link.to}?`)) {
                                setLinks(links.filter((_, i) => i !== idx));
                              }
                            }}
                            className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-gray-600 transition-colors shrink-0"
                            title="Delete link"
                          >
                            <FiTrash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Timeseries Section */}
            {(() => {
              const locationsWithDemand = locations.filter(loc => loc.demandProfile);
              return locationsWithDemand.length > 0 ? (
                <div className="border-b border-slate-200">
                  <button
                    onClick={() => setShowTimeseriesSection(!showTimeseriesSection)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FiActivity size={16} className="text-slate-700" />
                      <span className="text-sm font-semibold text-slate-700">Timeseries Data ({locationsWithDemand.length})</span>
                    </div>
                    {showTimeseriesSection ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                  </button>
                  
                  {showTimeseriesSection && (
                    <div className="p-4 bg-slate-50 space-y-3">
                      {/* Statistics Summary */}
                      {locationsWithDemand.length > 0 && (() => {
                        const totalMWh = locationsWithDemand.reduce((sum, loc) => sum + parseFloat(loc.totalDemandMWh || 0), 0);
                        const totalGWh = totalMWh / 1000;
                        const avgMWh = totalMWh / locationsWithDemand.length;
                        return (
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-3 rounded-lg border border-gray-200">
                            <div className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-wide">Demand Statistics</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-white/60 p-2 rounded">
                                <div className="text-slate-600">Total Energy</div>
                                <div className="font-bold text-gray-700">{totalGWh.toFixed(2)} GWh</div>
                              </div>
                              <div className="bg-white/60 p-2 rounded">
                                <div className="text-slate-600">Avg/Substation</div>
                                <div className="font-bold text-gray-700">{avgMWh.toFixed(2)} MWh</div>
                              </div>
                              <div className="bg-white/60 p-2 rounded">
                                <div className="text-slate-600">Substations</div>
                                <div className="font-bold text-gray-700">{locationsWithDemand.length}</div>
                              </div>
                              <div className="bg-white/60 p-2 rounded">
                                <div className="text-slate-600">Time Period</div>
                                <div className="font-bold text-gray-700">{locationsWithDemand[0]?.demandProfile?.hours || 0}h</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Filter Controls */}
                      {locationsWithDemand.length > 0 && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Filter substations..."
                            value={timeseriesFilter}
                            onChange={(e) => setTimeseriesFilter(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                          <select
                            value={timeseriesSortBy}
                            onChange={(e) => setTimeseriesSortBy(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                          >
                            <option value="name">Sort by Name</option>
                            <option value="total">Sort by Total (High to Low)</option>
                            <option value="total-asc">Sort by Total (Low to High)</option>
                            <option value="avg">Sort by Average (High to Low)</option>
                            <option value="max">Sort by Peak Demand</option>
                          </select>
                        </div>
                      )}
                      
                      {/* Demand Profiles List */}
                      {locationsWithDemand.length > 0 && (() => {
                        let filtered = locationsWithDemand.filter(loc => 
                          !timeseriesFilter || loc.name.toLowerCase().includes(timeseriesFilter.toLowerCase())
                        );
                        
                        // Sort
                        switch(timeseriesSortBy) {
                          case 'total':
                            filtered.sort((a, b) => parseFloat(b.totalDemandMWh) - parseFloat(a.totalDemandMWh));
                            break;
                          case 'total-asc':
                            filtered.sort((a, b) => parseFloat(a.totalDemandMWh) - parseFloat(b.totalDemandMWh));
                            break;
                          case 'avg':
                            filtered.sort((a, b) => parseFloat(b.demandProfile.avgMW) - parseFloat(a.demandProfile.avgMW));
                            break;
                          case 'max':
                            filtered.sort((a, b) => parseFloat(b.demandProfile.maxMW) - parseFloat(a.demandProfile.maxMW));
                            break;
                          default:
                            filtered.sort((a, b) => a.name.localeCompare(b.name));
                        }
                        
                        return (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center justify-between">
                              <span>Demand Profiles</span>
                              <span className="text-slate-500 font-normal">{filtered.length} of {locationsWithDemand.length}</span>
                            </div>
                            <div className="max-h-96 overflow-y-auto space-y-1.5">
                              {filtered.map(loc => (
                                <div 
                                  key={loc.name}
                                  onClick={() => {
                                    setSelectedLocation(loc);
                                    setViewState({
                                      ...viewState,
                                      longitude: loc.longitude,
                                      latitude: loc.latitude,
                                      zoom: 10,
                                      transitionDuration: 1000
                                    });
                                  }}
                                  className="p-2.5 bg-white rounded border border-slate-200 hover:border-gray-400 hover:shadow-sm cursor-pointer transition-all"
                                >
                                  <div className="text-xs font-semibold text-slate-800 mb-1">{loc.name}</div>
                                  <div className="grid grid-cols-2 gap-1 text-xs">
                                    <div className="text-slate-600">
                                      <span className="font-medium">Total:</span> {(parseFloat(loc.totalDemandMWh) / 1000).toFixed(2)} GWh
                                    </div>
                                    <div className="text-slate-600">
                                      <span className="font-medium">Avg:</span> {loc.demandProfile.avgMW} MW
                                    </div>
                                    <div className="text-slate-600">
                                      <span className="font-medium">Peak:</span> {loc.demandProfile.maxMW} MW
                                    </div>
                                    <div className="text-slate-600">
                                      <span className="font-medium">Min:</span> {loc.demandProfile.minMW} MW
                                    </div>
                                  </div>
                                  {timeseriesPreview === loc.name && loc.demandProfile.timeseries && (
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                      <div className="h-12 flex items-end gap-0.5">
                                        {loc.demandProfile.timeseries.slice(0, 168).map((val, idx) => {
                                          const height = (val / parseFloat(loc.demandProfile.maxMW)) * 100;
                                          return (
                                            <div
                                              key={idx}
                                              className="flex-1 bg-gray-400 rounded-t"
                                              style={{ height: `${height}%`, minWidth: '1px' }}
                                              title={`Hour ${idx}: ${val.toFixed(0)} MW`}
                                            />
                                          );
                                        })}
                                      </div>
                                      <div className="text-xs text-slate-500 mt-1 text-center">
                                        First 7 days • Click location for full details
                                      </div>
                                    </div>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTimeseriesPreview(timeseriesPreview === loc.name ? null : loc.name);
                                    }}
                                    className="mt-2 w-full text-xs text-gray-600 hover:text-gray-800 font-medium"
                                  >
                                    {timeseriesPreview === loc.name ? '− Hide Preview' : '+ Show Preview'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : null;
            })()}
          </div>
  );
}
