import React, { useState } from "react";
import { FiSearch, FiX, FiMapPin } from "react-icons/fi";

const SearchBar = ({ locations, onLocationSelect }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredLocations = locations.filter(loc =>
    loc.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (location) => {
    onLocationSelect(location);
    setSearchQuery("");
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="bg-white rounded-lg shadow-lg flex items-center px-3 py-2">
        <FiSearch className="text-gray-400 mr-2" />
        <input
          type="text"
          placeholder="Search locations..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(e.target.value.length > 0);
          }}
          onFocus={() => setIsOpen(searchQuery.length > 0)}
          className="outline-none text-sm w-64 text-gray-700 placeholder-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setIsOpen(false);
            }}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <FiX size={16} />
          </button>
        )}
      </div>

      {isOpen && filteredLocations.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto z-[10002]">
          {filteredLocations.map((location, index) => {
            const techCount = location.techs ? Object.keys(location.techs).length : 0;
            return (
              <button
                key={location.id || index}
                onClick={() => handleSelect(location)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FiMapPin className="text-gray-600" size={16} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{location.name || `Location ${index + 1}`}</p>
                      <p className="text-xs text-gray-500">
                        {location.latitude?.toFixed(4)}, {location.longitude?.toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    {techCount} tech{techCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
