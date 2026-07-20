// Dialog for choosing the map marker icon of a location. Extracted verbatim
// from MapDeckGL.jsx; the parent still gates on `showIconSelector &&
// selectedLocationForIcon`. Icon presets come from utils/mapVisuals.
import { ICON_TYPES, getDefaultIconType } from '../../utils/mapVisuals';

export default function IconSelectorDialog({
  selectedLocationForIcon,
  locations,
  setLocations,
  setShowIconSelector,
  setSelectedLocationForIcon,
  showNotification,
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10002]">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-4 rounded-t-xl">
          <h3 className="text-lg font-bold">Select Icon</h3>
          <p className="text-sm text-gray-100 mt-1">{selectedLocationForIcon.name}</p>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Choose an icon to represent this location on the map:
          </p>

          <div className="grid grid-cols-3 gap-3">
            {Object.entries(ICON_TYPES).map(([key, iconInfo]) => {
              const currentIconType = selectedLocationForIcon.iconType || getDefaultIconType(selectedLocationForIcon);
              const isSelected = currentIconType === key;

              return (
                <button
                  key={key}
                  onClick={() => {
                    const locationIndex = locations.findIndex(
                      loc => loc.name === selectedLocationForIcon.name
                    );
                    if (locationIndex !== -1) {
                      const updatedLocations = [...locations];
                      updatedLocations[locationIndex] = {
                        ...updatedLocations[locationIndex],
                        iconType: key
                      };
                      setLocations(updatedLocations);
                      showNotification(`Icon changed to ${iconInfo.label}`, 'success');
                      setShowIconSelector(false);
                      setSelectedLocationForIcon(null);
                    }
                  }}
                  className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-gray-500 bg-gray-50'
                      : 'border-slate-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center mb-2">
                    <svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d={iconInfo.path} fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="text-xs text-center text-slate-700 font-medium">
                    {iconInfo.label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => {
                const locationIndex = locations.findIndex(
                  loc => loc.name === selectedLocationForIcon.name
                );
                if (locationIndex !== -1) {
                  const updatedLocations = [...locations];
                  // Remove custom icon to use default
                  delete updatedLocations[locationIndex].iconType;
                  setLocations(updatedLocations);
                  showNotification('Icon reset to default', 'info');
                  setShowIconSelector(false);
                  setSelectedLocationForIcon(null);
                }
              }}
              className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Reset to Default
            </button>
            <button
              onClick={() => {
                setShowIconSelector(false);
                setSelectedLocationForIcon(null);
              }}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-900 hover:to-gray-900 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
