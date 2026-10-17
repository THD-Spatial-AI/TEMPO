// Left sidebar (mode selection + shared Locations/Links lists) for the Creation
// map view. The Locations/Links sections come from the shared EntityListsPanel
// so Creation and the Map View stay identical. State/handlers passed as props.
import { FiActivity, FiLink, FiMapPin } from '../ui/icons';
import { LuPanelLeftClose, LuPanelLeftOpen } from '../ui/icons';
import EntityListsPanel from '../shared/EntityListsPanel';
import ModeGuide from './ModeGuide';

const MODES = [
  { id: 'add', label: 'Location', icon: FiMapPin, hint: 'Click the map to drop a location' },
  { id: 'link', label: 'Link', icon: FiLink, hint: 'Click two locations to connect them' },
  { id: 'polyline', label: 'Polyline', icon: FiActivity, hint: 'Click repeatedly to add auto-linked points' },
];

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
  const selectMode = (id) => {
    if (id === 'add') {
      setMode(mode === 'add' ? null : 'add');
    } else {
      setMode(id);
      if (id === 'link') locationManager.setLinkStart(null);
    }
    polylineMode.resetPolyline();
  };
  const activeMode = MODES.find((m) => m.id === mode);
  const ToggleIcon = leftSidebarCollapsed ? LuPanelLeftOpen : LuPanelLeftClose;

  return (
      <div className={`bg-white border-r border-black/15 transition-[width] duration-300 ease-out ${leftSidebarCollapsed ? 'w-14' : 'w-72'} shrink-0 overflow-hidden`}>
      <div className={`flex h-full flex-col ${leftSidebarCollapsed ? 'w-14' : 'w-72'}`}>
        {/* Header */}
        <div className={`flex items-center border-b border-black/15 ${leftSidebarCollapsed ? 'justify-center py-3' : 'justify-between px-4 py-3'}`}>
          {!leftSidebarCollapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Creation Mode</h2>
              <p className="text-[11px] text-slate-500">Build your energy system</p>
            </div>
          )}
          <button
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title={leftSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            <ToggleIcon size={18} />
          </button>
        </div>

        {leftSidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1 py-3">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => selectMode(id)}
                title={label}
                className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
                  mode === id ? 'bg-black text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" style={{ animation: 'panelContentIn 0.15s ease-out 0.25s both' }}>
            {/* Mode Selection */}
            <div className="px-4 py-3 border-b border-black/15">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" data-tour="creation-modes">
                {MODES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => selectMode(id)}
                    aria-pressed={mode === id}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
                      mode === id ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
                <p className="pt-1 text-[11px] leading-snug text-slate-500">
                  {activeMode ? activeMode.hint : 'Pick a mode to start editing the map'}
                </p>
                <ModeGuide />
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
          </div>
        )}
      </div>
      </div>
  );
}
