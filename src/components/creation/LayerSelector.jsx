import React, { useState } from "react";
import { FiLayers } from "react-icons/fi";
import { MAP_STYLE_NAMES } from "../../config/mapStyles";

const LayerSelector = ({ currentLayer, onLayerChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative bg-white rounded-lg shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 hover:bg-gray-50 transition-colors flex items-center gap-2 rounded-lg"
      >
        <FiLayers className="text-lg text-gray-700" />
        <span className="text-sm font-medium text-gray-700">{MAP_STYLE_NAMES[currentLayer]}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[160px] z-[10002]">
          {Object.entries(MAP_STYLE_NAMES).map(([key, name]) => (
            <button
              key={key}
              onClick={() => {
                onLayerChange(key);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors ${
                currentLayer === key ? "bg-gray-100 text-gray-800 font-medium" : "text-gray-700"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LayerSelector;
