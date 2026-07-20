// Confirmation dialog shown after a location marker is dragged to a new position.
// Extracted verbatim from MapDeckGL.jsx; the parent still gates rendering on
// `showDragConfirmDialog && pendingDragChange`.
import { FiArrowRight, FiX, FiCheck } from 'react-icons/fi';

export default function DragConfirmDialog({
  locations,
  pendingDragChange,
  setShowDragConfirmDialog,
  setPendingDragChange,
  setLocations,
  showNotification,
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-4 rounded-t-xl">
          <h3 className="text-lg font-bold">Confirm Location Change</h3>
        </div>

        <div className="p-6">
          <p className="text-slate-700 mb-4">
            Do you want to move <span className="font-semibold">{locations[pendingDragChange.locationIndex]?.name}</span> to the new position?
          </p>

          <div className="bg-slate-50 p-4 rounded-lg space-y-2 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Original Position:</span>
              <span className="font-mono text-slate-800">
                {pendingDragChange.originalLocation.latitude.toFixed(4)}, {pendingDragChange.originalLocation.longitude.toFixed(4)}
              </span>
            </div>
            <div className="flex items-center justify-center text-slate-400">
              <FiArrowRight size={16} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">New Position:</span>
              <span className="font-mono text-gray-600 font-semibold">
                {pendingDragChange.newLatitude.toFixed(4)}, {pendingDragChange.newLongitude.toFixed(4)}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                // Cancel - revert to original position
                setShowDragConfirmDialog(false);
                setPendingDragChange(null);
                showNotification('Location change cancelled', 'info');
              }}
              className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <FiX size={18} />
              Cancel
            </button>
            <button
              onClick={() => {
                // Accept - apply the change
                const updatedLocations = [...locations];
                updatedLocations[pendingDragChange.locationIndex] = {
                  ...updatedLocations[pendingDragChange.locationIndex],
                  latitude: pendingDragChange.newLatitude,
                  longitude: pendingDragChange.newLongitude
                };
                setLocations(updatedLocations);
                showNotification(
                  `Location repositioned to ${pendingDragChange.newLatitude.toFixed(4)}, ${pendingDragChange.newLongitude.toFixed(4)}`,
                  'success'
                );
                setShowDragConfirmDialog(false);
                setPendingDragChange(null);
              }}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-900 hover:to-gray-900 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <FiCheck size={18} />
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
