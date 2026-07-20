// Left sidebar (mode selection, locations list, links section, link-type
// picker) for the Creation map view. Extracted verbatim from Creation.jsx;
// all state/handlers are passed as props.
import { FiActivity, FiArrowRight, FiChevronDown, FiChevronLeft, FiChevronRight, FiCpu, FiEdit2, FiLink, FiMapPin, FiSave, FiTrash2 } from 'react-icons/fi';
import { LINK_TYPES, LINK_TYPES_BY_GROUP, getLinkTypeColor } from '../../config/linkTypes';
import { getCarrierColor } from '../../config/carriers';
import { formatTechName } from '../../utils/nameUtils';

export default function CreationSidebar({
  clearAll,
  currentLinkType,
  leftSidebarCollapsed,
  linksExpanded,
  locationManager,
  locationsExpanded,
  mode,
  polylineMode,
  setCurrentLinkType,
  setLeftSidebarCollapsed,
  setLinksExpanded,
  setLocationsExpanded,
  setMode,
  setPendingLocation,
  setShowLocationDialog,
  setShowSaveDialog,
  showNotification,
}) {
  return (
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${leftSidebarCollapsed ? 'w-16' : 'w-80'} flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          {!leftSidebarCollapsed && (
            <div>
              <h2 className="text-lg font-bold text-gray-800">Creation Mode</h2>
              <p className="text-xs text-gray-600">Build your energy system</p>
            </div>
          )}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
          >
            {leftSidebarCollapsed ? <FiChevronRight size={20} /> : <FiChevronLeft size={20} />}
          </button>
        </div>

        {!leftSidebarCollapsed && (
          <>
            {/* Mode Selection */}
            <div className="p-4 border-b border-gray-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Mode</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  onClick={() => {
                    setMode('single');
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'single'
                      ? 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiMapPin className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Single</div>
                </button>
                <button
                  onClick={() => {
                    setMode('multiple');
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'multiple'
                      ? 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiCpu className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Multiple</div>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setMode('link');
                    locationManager.setLinkStart(null);
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'link'
                      ? 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiLink className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Link</div>
                </button>
                <button
                  onClick={() => {
                    setMode('polyline');
                    polylineMode.resetPolyline();
                  }}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    mode === 'polyline'
                      ? 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiActivity className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Polyline</div>
                </button>
              </div>
            </div>

            {/* Locations List */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Locations Section */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-3">
                  <button
                    onClick={() => setLocationsExpanded(!locationsExpanded)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  >
                    <FiChevronDown 
                      size={16} 
                      className={`transition-transform ${locationsExpanded ? '' : '-rotate-90'}`}
                    />
                    Locations ({locationManager.tempLocations.length})
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={clearAll}
                      className="p-1.5 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                      title="Clear all"
                    >
                      <FiTrash2 size={14} />
                    </button>
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      className="p-1.5 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                      title="Save model"
                      disabled={locationManager.tempLocations.length === 0}
                    >
                      <FiSave size={14} />
                    </button>
                  </div>
                </div>

                {locationsExpanded && (
                  locationManager.tempLocations.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <FiMapPin className="mx-auto mb-2" size={32} />
                      <p>No locations yet</p>
                      <p className="text-xs mt-1">Select a mode and click the map</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {locationManager.tempLocations.map((loc, index) => (
                        <div
                          key={loc.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            locationManager.selectedLocation?.id === loc.id
                              ? 'border-gray-500 bg-gray-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            locationManager.setSelectedLocation(loc);
                          }}
                          onDoubleClick={() => {
                            setPendingLocation(loc);
                            setShowLocationDialog(true);
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm text-gray-800">{loc.name || `Location ${index + 1}`}</h4>
                              <p className="text-xs text-gray-500">
                                {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                              </p>
                              {loc.techs && Object.keys(loc.techs).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {Object.keys(loc.techs).map(techName => (
                                    <span
                                      key={techName}
                                      className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded"
                                    >
                                      {formatTechName(techName)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingLocation(loc);
                                  setShowLocationDialog(true);
                                }}
                                className="p-1 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                                title="Edit location"
                              >
                                <FiEdit2 size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  locationManager.removeLocation(loc.id);
                                }}
                                className="p-1 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                                title="Delete location"
                              >
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Links Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <button
                    onClick={() => setLinksExpanded(!linksExpanded)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  >
                    <FiChevronDown 
                      size={16} 
                      className={`transition-transform ${linksExpanded ? '' : '-rotate-90'}`}
                    />
                    Links ({locationManager.tempLinks.length})
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        locationManager.setTempLinks([]);
                        showNotification('All links cleared', 'success');
                      }}
                      className="p-1.5 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                      title="Clear all links"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Link type selector — applies to new links drawn on the map */}
                <div className="px-3 pb-2">
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">New link type</label>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getLinkTypeColor(currentLinkType) }}
                    />
                    <select
                      value={currentLinkType}
                      onChange={e => setCurrentLinkType(e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    >
                      {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                        <optgroup key={group} label={group}>
                          {types.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {linksExpanded && (
                  locationManager.tempLinks.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <FiLink className="mx-auto mb-2" size={32} />
                      <p>No links yet</p>
                      <p className="text-xs mt-1">Create links between locations</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {locationManager.tempLinks.map((link, index) => (
                        <div
                          key={link.id}
                          className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-gray-800 flex items-center gap-1">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: link.linkType ? getLinkTypeColor(link.linkType) : (link.carrier ? getCarrierColor(link.carrier) : '#6366f1') }}
                                />
                                <span className="truncate">{link.fromName}</span>
                                <FiArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                                <span className="truncate">{link.toName}</span>
                              </h4>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {link.distance != null && !isNaN(parseFloat(link.distance)) ? `${parseFloat(link.distance).toFixed(2)} km` : 'N/A'}
                                {link.linkType && <span className="ml-1 text-gray-400">· {LINK_TYPES[link.linkType]?.label || link.linkType}</span>}
                              </p>
                              {/* Inline link type changer */}
                              <div className="mt-1.5">
                                <select
                                  value={link.linkType || ''}
                                  onChange={e => {
                                    const lt = e.target.value;
                                    locationManager.updateLink(link.id, {
                                      linkType: lt || null,
                                      carrier: lt ? (LINK_TYPES[lt]?.carrier || null) : link.carrier,
                                    });
                                  }}
                                  className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:outline-none"
                                >
                                  <option value="">— no type —</option>
                                  {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                                    <optgroup key={group} label={group}>
                                      {types.map(t => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-1 ml-1 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  locationManager.removeLink(link.id);
                                }}
                                className="p-1 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                                title="Delete link"
                              >
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}
      </div>
  );
}
