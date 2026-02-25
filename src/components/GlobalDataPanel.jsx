import React, { useState, useEffect } from 'react';
import { FiGlobe, FiMapPin, FiZap, FiLayers, FiSearch, FiFilter, FiDownload, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Papa from 'papaparse';

const GlobalDataPanel = ({ 
  onDataLoaded, 
  onCountrySelect, 
  onAdminSelect, 
  collapsed, 
  onToggleCollapse,
  showOsmLayers,
  onOsmLayersChange,
  infrastructureSizes,
  onInfrastructureSizesChange
}) => {
  const [powerPlants, setPowerPlants] = useState([]);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [filteredPlants, setFilteredPlants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState('all');
  const [minCapacity, setMinCapacity] = useState(0);
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [adminLevel, setAdminLevel] = useState('country'); // country, state, commune
  
  // Fuel type categories
  const fuelTypes = [
    'all',
    'Solar',
    'Wind',
    'Hydro',
    'Nuclear',
    'Gas',
    'Coal',
    'Oil',
    'Biomass',
    'Geothermal',
    'Other'
  ];

  // Load global power plant database
  useEffect(() => {
    loadPowerPlantData();
  }, []);

  const loadPowerPlantData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/data/global_power_plant_database.csv');
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          const plants = results.data.filter(row => row.latitude && row.longitude);
          setPowerPlants(plants);
          
          // Extract unique countries
          const uniqueCountries = [...new Set(plants.map(p => p.country_long))].filter(Boolean).sort();
          setCountries(uniqueCountries);
          
          setLoading(false);
        },
        error: (error) => {
          console.error('Error loading power plant data:', error);
          setLoading(false);
        }
      });
    } catch (error) {
      console.error('Error fetching power plant data:', error);
      setLoading(false);
    }
  };

  // Filter plants when country or filters change
  useEffect(() => {
    if (!selectedCountry) {
      setFilteredPlants([]);
      return;
    }

    let filtered = powerPlants.filter(plant => plant.country_long === selectedCountry);

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(plant =>
        plant.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply fuel type filter
    if (fuelTypeFilter !== 'all') {
      filtered = filtered.filter(plant =>
        plant.primary_fuel?.toLowerCase().includes(fuelTypeFilter.toLowerCase())
      );
    }

    // Apply capacity filter
    if (minCapacity > 0) {
      filtered = filtered.filter(plant =>
        parseFloat(plant.capacity_mw) >= minCapacity
      );
    }

    setFilteredPlants(filtered);
    
    // Notify parent component
    if (onDataLoaded) {
      onDataLoaded(filtered);
    }
  }, [selectedCountry, searchTerm, fuelTypeFilter, minCapacity, powerPlants]);

  const handleCountryChange = (country) => {
    setSelectedCountry(country);
    if (onCountrySelect) {
      onCountrySelect(country);
    }
  };

  const handleAdminLevelChange = (level) => {
    setAdminLevel(level);
    if (onAdminSelect) {
      onAdminSelect(level);
    }
  };

  const loadBoundaryData = async () => {
    setShowBoundaries(!showBoundaries);
    // This will trigger boundary loading in the parent component
    if (onCountrySelect) {
      onCountrySelect(selectedCountry, !showBoundaries);
    }
  };

  const exportFilteredData = () => {
    const csv = Papa.unparse(filteredPlants);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `power_plants_${selectedCountry.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTotalCapacity = () => {
    return filteredPlants.reduce((sum, plant) => sum + (parseFloat(plant.capacity_mw) || 0), 0).toFixed(2);
  };

  const getFuelDistribution = () => {
    const distribution = {};
    filteredPlants.forEach(plant => {
      const fuel = plant.primary_fuel || 'Unknown';
      distribution[fuel] = (distribution[fuel] || 0) + 1;
    });
    // Return all fuel types sorted by count (descending)
    return Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  };

  return (
    <div className={`bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden transition-all duration-300 ${
      collapsed ? 'w-16' : 'w-96'
    }`}>
      {/* Header */}
      <div className="p-2 border-b border-slate-200 flex justify-between items-center">
                {!collapsed && (
                  <div>
                    <label className="block text-lg font-bold text-slate-800">
                    <FiGlobe className="inline mr-1" />
                    Worldwide Energy Data
                    </label>                    
                  </div>
                )}
                <button
                  onClick={onToggleCollapse}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors ml-auto"
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? <FiChevronRight size={20} /> : <FiChevronLeft size={20} />}
                </button>
              </div>

      {!collapsed ? (
        <>
      {/* Country Selection */}
      <div className="p-4 border-b border-slate-200 flex-shrink-0">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          <FiMapPin className="inline mr-1" />
          Select Country
        </label>
        <select
          value={selectedCountry}
          onChange={(e) => handleCountryChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        >
          <option value="">Choose a country...</option>
          {countries.map(country => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>
      </div>

      {selectedCountry && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Administrative Level Selection */}
          <div className="p-4 border-b border-slate-200 flex-shrink-0">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <FiLayers className="inline mr-1" />
              Administrative Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleAdminLevelChange('country')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  adminLevel === 'country'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Country
              </button>
              <button
                onClick={() => handleAdminLevelChange('state')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  adminLevel === 'state'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                State/Region
              </button>
              <button
                onClick={() => handleAdminLevelChange('commune')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  adminLevel === 'commune'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Commune
              </button>
            </div>
            
            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBoundaries}
                  onChange={loadBoundaryData}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Show boundaries on map</span>
              </label>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-slate-200 flex-shrink-0 max-h-64 overflow-y-auto">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <FiFilter className="inline mr-1" />
              Filters
            </label>
            
            {/* Search */}
            <div className="mb-3">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Fuel Type */}
            <div className="mb-3">
              <label className="block text-xs text-slate-600 mb-1">Fuel Type</label>
              <select
                value={fuelTypeFilter}
                onChange={(e) => setFuelTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                {fuelTypes.map(fuel => (
                  <option key={fuel} value={fuel}>{fuel === 'all' ? 'All Types' : fuel}</option>
                ))}
              </select>
            </div>

            {/* Minimum Capacity */}
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                Min Capacity (MW): {minCapacity}
              </label>
              <input
                type="range"
                min="0"
                max="1000"
                step="10"
                value={minCapacity}
                onChange={(e) => setMinCapacity(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Scrollable content area: Statistics and Actions */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Statistics */}
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Statistics</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Total Plants:</span>
                  <span className="text-sm font-bold text-slate-900">{filteredPlants.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-600">Total Capacity:</span>
                  <span className="text-sm font-bold text-slate-900">{getTotalCapacity()} MW</span>
                </div>
                <div className="mt-4">
                  <span className="text-xs text-slate-600 block mb-2 font-semibold">Plants by Technology:</span>
                  {getFuelDistribution().map(([fuel, count]) => (
                    <div key={fuel} className="flex justify-between items-center text-xs mb-1.5 py-1">
                      <span className="text-slate-700">{fuel}</span>
                      <span className="font-medium text-slate-900">{count} plants</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4">
              <button
                onClick={exportFilteredData}
                disabled={filteredPlants.length === 0}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                <FiDownload />
                Export Filtered Data ({filteredPlants.length})
              </button>
            </div>

            {/* Infrastructure Layers Section */}
            <div className="p-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Map Infrastructure</h3>
              
              {/* Layer Toggles */}
              <div className="space-y-2 mb-4">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOsmLayers?.powerLines}
                    onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, powerLines: e.target.checked })}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 font-medium">Power Lines</span>
                </label>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOsmLayers?.substations}
                    onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, substations: e.target.checked })}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 font-medium">Substations</span>
                </label>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOsmLayers?.powerPlants}
                    onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, powerPlants: e.target.checked })}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs text-slate-700 font-medium">Power Plants</span>
                </label>
              </div>

              {/* Size Controls */}
              <div className="space-y-3 mt-4">
                <div>
                  <label className="flex items-center justify-between text-xs text-slate-700 font-medium mb-1.5">
                    <span>Power Plants Size</span>
                    <span className="text-slate-500">{infrastructureSizes?.powerPlants.toFixed(1)}x</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={infrastructureSizes?.powerPlants || 1}
                    onChange={(e) => onInfrastructureSizesChange?.({ ...infrastructureSizes, powerPlants: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div>
                  <label className="flex items-center justify-between text-xs text-slate-700 font-medium mb-1.5">
                    <span>Substations Size</span>
                    <span className="text-slate-500">{infrastructureSizes?.substations.toFixed(1)}x</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={infrastructureSizes?.substations || 1}
                    onChange={(e) => onInfrastructureSizesChange?.({ ...infrastructureSizes, substations: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!selectedCountry && !loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-slate-400">
            <FiGlobe size={48} className="mx-auto mb-4" />
            <p className="text-sm">Select a country to view power plant data</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-sm text-slate-600">Loading power plant database...</p>
          </div>
        </div>
      )}
        </>
      ) : (
        <div className="flex flex-col items-center py-4 gap-4">
          <button
            className="p-2 rounded-lg hover:bg-slate-100"
            title="Global Database"
          >
            <FiGlobe size={20} />
          </button>
          <div className="border-t border-slate-200 w-8 my-2"></div>
          <button
            className="p-2 rounded-lg hover:bg-slate-100"
            title="Search & Filters"
          >
            <FiFilter size={20} />
          </button>
          <button
            onClick={exportFilteredData}
            disabled={filteredPlants.length === 0}
            className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"
            title="Export Data"
          >
            <FiDownload size={20} />
          </button>
          <div className="border-t border-slate-200 w-8 my-2"></div>
          <button
            className="p-2 rounded-lg hover:bg-slate-100"
            title="Power Plants"
          >
            <FiZap size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

export default GlobalDataPanel;
