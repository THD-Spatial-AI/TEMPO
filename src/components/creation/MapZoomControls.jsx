import React from "react";
import { FiMaximize2, FiMinimize2, FiMapPin } from "react-icons/fi";

const MapZoomControls = ({ onZoomIn, onZoomOut, onFitBounds }) => {
  return (
    <div className="bg-white rounded-lg shadow-lg flex gap-1 p-1">
      <button
        onClick={onZoomIn}
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Zoom In"
      >
        <FiMaximize2 className="text-gray-700" size={18} />
      </button>
      <button
        onClick={onZoomOut}
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Zoom Out"
      >
        <FiMinimize2 className="text-gray-700" size={18} />
      </button>
      <button
        onClick={onFitBounds}
        className="p-2 hover:bg-gray-100 rounded transition-colors"
        title="Fit All Locations"
      >
        <FiMapPin className="text-gray-700" size={18} />
      </button>
    </div>
  );
};

export default MapZoomControls;
