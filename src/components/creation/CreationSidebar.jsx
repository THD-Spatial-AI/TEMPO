// Left sidebar (mode selection + shared Locations/Links lists) for the Creation
// map view. The Locations/Links sections come from the shared EntityListsPanel
// so Creation and the Map View stay identical. State/handlers passed as props.
import { FiActivity, FiChevronLeft, FiChevronRight, FiLink, FiMapPin } from 'react-icons/fi';
import EntityListsPanel from '../shared/EntityListsPanel';

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
              <div className="mb-2">
                <button
                  onClick={() => {
                    setMode(mode === 'add' ? null : 'add');
                    polylineMode.resetPolyline();
                  }}
                  className={`w-full p-3 rounded-lg border-2 transition-all ${
                    mode === 'add'
                      ? 'border-gray-500 bg-gray-50 text-gray-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <FiMapPin className="mx-auto mb-1" size={20} />
                  <div className="text-xs font-medium">Add Location</div>
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

            {/* Shared Locations + Links lists */}
            <EntityListsPanel
              locations={locationManager.tempLocations}
              links={locationManager.tempLinks}
              selectedLocationId={locationManager.selectedLocation?.id ?? null}
              onSelectLocation={(loc) => locationManager.setSelectedLocation(loc)}
              onEditLocation={(loc) => { setPendingLocation(loc); setShowLocationDialog(true); }}
              onDeleteLocation={(loc) => locationManager.removeLocation(loc.id)}
              onClearLocations={clearAll}
              onClearLinks={() => { locationManager.setTempLinks([]); showNotification('All links cleared', 'success'); }}
              onUpdateLink={(link, patch) => locationManager.updateLink(link.id, patch)}
              onDeleteLink={(link) => locationManager.removeLink(link.id)}
              locationsExpanded={locationsExpanded}
              setLocationsExpanded={setLocationsExpanded}
              linksExpanded={linksExpanded}
              setLinksExpanded={setLinksExpanded}
              onSave={() => setShowSaveDialog(true)}
              currentLinkType={currentLinkType}
              setCurrentLinkType={setCurrentLinkType}
              showNotification={showNotification}
            />
          </>
        )}
      </div>
  );
}
