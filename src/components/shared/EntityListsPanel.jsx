// Shared Locations + Links list sections for the left sidebar, used by BOTH the
// Creation view and the Map View so they look and feel identical. Presentational
// only — all data and handlers are passed as props. The optional `onSave` and
// `setCurrentLinkType` props enable the Creation-only extras (Save button, new-
// link-type picker); when omitted, the panel renders the same lists without them.
import { FiActivity, FiArrowRight, FiChevronDown, FiEdit2, FiLink, FiMapPin, FiSave, FiTrash2 } from 'react-icons/fi';
import { LINK_TYPES, LINK_TYPES_BY_GROUP, getLinkTypeColor } from '../../config/linkTypes';
import { getCarrierColor } from '../../config/carriers';
import { formatTechName } from '../../utils/nameUtils';

export default function EntityListsPanel({
  locations = [],
  links = [],
  selectedLocationId = null,
  onSelectLocation,
  onEditLocation,
  onDeleteLocation,
  onClearLocations,
  onClearLinks,
  onUpdateLink,
  onDeleteLink,
  locationsExpanded,
  setLocationsExpanded,
  linksExpanded,
  setLinksExpanded,
  onSave,                 // Creation-only: shows the Save button
  currentLinkType,        // Creation-only: new-link-type picker (with setter below)
  setCurrentLinkType,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Locations Section */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={() => setLocationsExpanded(!locationsExpanded)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
          >
            <FiChevronDown size={16} className={`transition-transform ${locationsExpanded ? '' : '-rotate-90'}`} />
            Locations ({locations.length})
          </button>
          <div className="flex gap-2">
            {onClearLocations && (
              <button
                onClick={onClearLocations}
                className="p-1.5 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                title="Clear all"
              >
                <FiTrash2 size={14} />
              </button>
            )}
            {onSave && (
              <button
                onClick={onSave}
                className="p-1.5 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                title="Save model"
                disabled={locations.length === 0}
              >
                <FiSave size={14} />
              </button>
            )}
          </div>
        </div>

        {locationsExpanded && (
          locations.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <FiMapPin className="mx-auto mb-2" size={32} />
              <p>No locations yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map((loc, index) => (
                <div
                  key={loc.id ?? index}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedLocationId != null && selectedLocationId === loc.id
                      ? 'border-gray-500 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => onSelectLocation?.(loc, index)}
                  onDoubleClick={() => onEditLocation?.(loc, index)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-800">{loc.name || `Location ${index + 1}`}</h4>
                      <p className="text-xs text-gray-500">
                        {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}
                      </p>
                      {loc.techs && Object.keys(loc.techs).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.keys(loc.techs).map(techName => (
                            <span key={techName} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                              {formatTechName(techName)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {onEditLocation && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditLocation(loc, index); }}
                          className="p-1 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                          title="Edit location"
                        >
                          <FiEdit2 size={14} />
                        </button>
                      )}
                      {onDeleteLocation && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteLocation(loc, index); }}
                          className="p-1 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                          title="Delete location"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      )}
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
            <FiChevronDown size={16} className={`transition-transform ${linksExpanded ? '' : '-rotate-90'}`} />
            Links ({links.length})
          </button>
          <div className="flex gap-2">
            {onClearLinks && (
              <button
                onClick={onClearLinks}
                className="p-1.5 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                title="Clear all links"
              >
                <FiTrash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Link type selector — Creation-only (applies to new links drawn on the map) */}
        {setCurrentLinkType && (
          <div className="px-3 pb-2">
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">New link type</label>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getLinkTypeColor(currentLinkType) }} />
              <select
                value={currentLinkType}
                onChange={e => setCurrentLinkType(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                  <optgroup key={group} label={group}>
                    {types.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        )}

        {linksExpanded && (
          links.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <FiLink className="mx-auto mb-2" size={32} />
              <p>No links yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link, linkIndex) => (
                <div key={link.id ?? linkIndex} className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm text-gray-800 flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: link.linkType ? getLinkTypeColor(link.linkType) : (link.carrier ? getCarrierColor(link.carrier) : '#6366f1') }}
                        />
                        <span className="truncate">{link.fromName || link.from}</span>
                        <FiArrowRight size={12} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{link.toName || link.to}</span>
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {link.distance != null && !isNaN(parseFloat(link.distance)) ? `${parseFloat(link.distance).toFixed(2)} km` : 'N/A'}
                        {link.linkType && <span className="ml-1 text-gray-400">· {LINK_TYPES[link.linkType]?.label || link.linkType}</span>}
                      </p>
                      {onUpdateLink && (
                        <div className="mt-1.5">
                          <select
                            value={link.linkType || ''}
                            onChange={e => {
                              const lt = e.target.value;
                              onUpdateLink(link, {
                                linkType: lt || null,
                                carrier: lt ? (LINK_TYPES[lt]?.carrier || null) : link.carrier,
                              }, linkIndex);
                            }}
                            className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 focus:outline-none"
                          >
                            <option value="">— no type —</option>
                            {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                              <optgroup key={group} label={group}>
                                {types.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 ml-1 flex-shrink-0">
                      {onDeleteLink && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteLink(link, linkIndex); }}
                          className="p-1 hover:bg-gray-100 text-gray-600 rounded transition-colors"
                          title="Delete link"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
