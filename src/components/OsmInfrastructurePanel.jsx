import React, { useState, useEffect } from 'react';
import { FiMap, FiChevronDown, FiChevronRight, FiLayers, FiX, FiMapPin, FiGlobe } from 'react-icons/fi';
import RegionSelectionStepper from './RegionSelectionStepper';
import { api } from '../services/api';
import { useData } from '../context/DataContext';

const OsmInfrastructurePanel = ({ 
  collapsed, 
  onToggleCollapse,
  showOsmLayers,
  onOsmLayersChange,
  infrastructureSizes,
  onInfrastructureSizesChange,
  onRegionSelect,
  powerLineFilters,
  onPowerLineFiltersChange,
  powerPlantFilters,
  onPowerPlantFiltersChange,
  substationFilters,
  onSubstationFiltersChange
}) => {
  const {
    selectedContinent, setSelectedContinent,
    selectedCountry, setSelectedCountry,
    selectedRegion, setSelectedRegion,
    selectedSubregion, setSelectedSubregion,
    selectedCommune, setSelectedCommune,
  } = useData();
  
  const [regionsDatabase, setRegionsDatabase] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Expanded state for each layer's filters
  const [expandedFilters, setExpandedFilters] = useState({
    powerLines: false,
    powerPlants: false,
    substations: false
  });
  
  // Available options for each level (derived from regionsDatabase)
  const [availableContinents, setAvailableContinents] = useState([]);
  const [availableCountries, setAvailableCountries] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [availableSubregions, setAvailableSubregions] = useState([]);
  const [availableCommunes, setAvailableCommunes] = useState([]);

  // Load regions database from backend (dynamically loads from GeoServer)
  useEffect(() => {
    loadRegionsDatabase();
  }, []);

  // Re-hydrate cascading dropdowns when database loads and context already has selections
  useEffect(() => {
    if (!regionsDatabase) return;

    if (selectedContinent && regionsDatabase.continents[selectedContinent]) {
      const countries = Object.keys(regionsDatabase.continents[selectedContinent].countries).sort();
      setAvailableCountries(countries);

      if (selectedCountry && regionsDatabase.continents[selectedContinent].countries[selectedCountry]) {
        const countryData = regionsDatabase.continents[selectedContinent].countries[selectedCountry];
        setAvailableRegions(Object.keys(countryData.regions || {}).sort());

        if (selectedRegion && countryData.regions && countryData.regions[selectedRegion]) {
          const regionData = countryData.regions[selectedRegion];
          setAvailableSubregions(Object.keys(regionData.subregions || {}).sort());
        }
      }
    }
  }, [regionsDatabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRegionsDatabase = async () => {
    setLoading(true);
    try {
      // Fetch loaded regions from backend/GeoServer
      const response = await api.getLoadedRegions();
      const regionPaths = response.regions || [];
      
      console.log('Loaded region paths from GeoServer:', regionPaths);
      
      // Build hierarchical structure from region paths
      // Example paths: "Europe/Germany/Bayern/Niederbayern"
      const hierarchy = {};
      
      regionPaths.forEach(path => {
        const parts = path.split('/');
        if (parts.length <2) return; // Skip invalid paths
        
        const [continent, country, region, subregion] = parts;
        
        // Initialize continent
        if (!hierarchy[continent]) {
          hierarchy[continent] = { countries: {} };
        }
        
        // Initialize country
        if (!hierarchy[continent].countries[country]) {
          hierarchy[continent].countries[country] = { regions: {} };
        }
        
        // Initialize region if we have one
        if (region) {
          if (!hierarchy[continent].countries[country].regions[region]) {
            hierarchy[continent].countries[country].regions[region] = { subregions: {} };
          }
          
          // Add subregion if we have one
          if (subregion) {
            hierarchy[continent].countries[country].regions[region].subregions[subregion] = true;
          }
        }
      });
      
      const data = { continents: hierarchy };
      setRegionsDatabase(data);
      
      // Set available continents
      setAvailableContinents(Object.keys(data.continents).sort());
      
      console.log('Built region hierarchy:', data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading regions database:', error);
      setLoading(false);
    }
  };

  // Handle continent selection
  const handleContinentSelect = (continent) => {
    setSelectedContinent(continent);
    setSelectedCountry(null);
    setSelectedRegion(null);
    setSelectedSubregion(null);
    setSelectedCommune(null);
    
    if (regionsDatabase && continent) {
      const countries = Object.keys(regionsDatabase.continents[continent].countries).sort();
      setAvailableCountries(countries);
      setAvailableRegions([]);
      setAvailableSubregions([]);
      setAvailableCommunes([]);
      
      // Zoom to continent
      if (onRegionSelect) {
        // Define continent center coordinates
        const continentCenters = {
          'Europe': { center: [54.5260, 15.2551], zoom: 4 },
          'Asia': { center: [34.0479, 100.6197], zoom: 3 },
          'Africa': { center: [-8.7832, 34.5085], zoom: 3 },
          'North_America': { center: [54.5260, -105.2551], zoom: 3 },
          'South_America': { center: [-12.523223, -63.196278], zoom: 3 },
          'Oceania': { center: [-22.7359, 140.0188], zoom: 3 }
        };
        const continentInfo = continentCenters[continent] || { center: [0, 0], zoom: 2 };
        onRegionSelect({
          continent: continent,
          country: null,
          region: null,
          subregion: null,
          regionPath: continent,
          center: continentInfo.center,
          zoom: continentInfo.zoom
        });
      }
    } else {
      setAvailableCountries([]);
      setAvailableRegions([]);
      setAvailableSubregions([]);
      setAvailableCommunes([]);
    }
  };

  // Handle country selection
  const handleCountrySelect = (country) => {
    setSelectedCountry(country);
    setSelectedRegion(null);
    setSelectedSubregion(null);
    setSelectedCommune(null);
    
    if (regionsDatabase && selectedContinent && country) {
      const countryData = regionsDatabase.continents[selectedContinent].countries[country];
      const regions = countryData.regions || {};
      setAvailableRegions(Object.keys(regions).sort());
      setAvailableSubregions([]);
      setAvailableCommunes([]);
      
      // Send country selection to load country-level data
      if (onRegionSelect) {
        const regionPath = `${selectedContinent}/${country}`;
        onRegionSelect({
          continent: selectedContinent,
          country: country,
          region: null,
          subregion: null,
          regionPath: regionPath,
          center: null, // Will be auto-calculated from data bounds
          zoom: 6
        });
      }
    } else {
      setAvailableRegions([]);
      setAvailableSubregions([]);
      setAvailableCommunes([]);
    }
  };

  // Handle region selection
  const handleRegionSelect = (region) => {
    setSelectedRegion(region);
    setSelectedSubregion(null);
    setSelectedCommune(null);
    
    if (regionsDatabase && selectedContinent && selectedCountry && region) {
      const regionData = regionsDatabase.continents[selectedContinent]
        .countries[selectedCountry]
        .regions[region];
      const subregions = regionData?.subregions || {};
      setAvailableSubregions(Object.keys(subregions).sort());
      setAvailableCommunes([]);
      
      // Send region-level data to parent
      if (onRegionSelect) {
        const regionPath = `${selectedContinent}/${selectedCountry}/${region}`;
        const regionInfo = {
          continent: selectedContinent,
          country: selectedCountry,
          region: region,
          subregion: null,
          regionPath: regionPath,
          center: null, // Will be auto-calculated from data bounds
          zoom: 7
        };
        onRegionSelect(regionInfo);
      }
    } else {
      setAvailableSubregions([]);
      setAvailableCommunes([]);
    }
  };

  // Handle subregion selection
  const handleSubregionSelect = (subregion) => {
    setSelectedSubregion(subregion);
    setSelectedCommune(null);
    
    if (regionsDatabase && selectedContinent && selectedCountry && selectedRegion && subregion) {
      // Retrieve subregion data (communes not yet used, kept for future use)
      const regionData = regionsDatabase.continents[selectedContinent]
        ?.countries[selectedCountry]
        ?.regions[selectedRegion];
      const communes = regionData?.subregions?.[subregion]?.communes || [];
      setAvailableCommunes(Array.isArray(communes) ? communes.sort() : []);
      
      // Send subregion-level data to parent (will load only this subregion and zoom to it)
      if (onRegionSelect) {
        const regionPath = `${selectedContinent}/${selectedCountry}/${selectedRegion}/${subregion}`;
        const regionInfo = {
          continent: selectedContinent,
          country: selectedCountry,
          region: selectedRegion,
          subregion: subregion,
          regionPath: regionPath,
          center: null, // Will be auto-calculated from data bounds
          zoom: 9
        };
        onRegionSelect(regionInfo);
      }
    } else {
      setAvailableCommunes([]);
    }
  };

  // Handle commune selection
  const handleCommuneSelect = (commune) => {
    setSelectedCommune(commune);
    
    // Future: Load commune-specific data
    console.log('Commune selected:', commune);
  };

  // Handle going back to a previous step (clears all deeper selections)
  const handleGoBackToStep = (stepId) => {
    if (stepId === 1) {
      // Go back to continent: keep continent, clear everything else
      setSelectedCountry(null);
      setSelectedRegion(null);
      setSelectedSubregion(null);
      setSelectedCommune(null);
      setAvailableRegions([]);
      setAvailableSubregions([]);
      setAvailableCommunes([]);
      if (onRegionSelect && selectedContinent) {
        const continentCenters = {
          'Europe': { center: [54.5260, 15.2551], zoom: 4 },
          'Asia': { center: [34.0479, 100.6197], zoom: 3 },
          'Africa': { center: [-8.7832, 34.5085], zoom: 3 },
          'North_America': { center: [54.5260, -105.2551], zoom: 3 },
          'South_America': { center: [-12.523223, -63.196278], zoom: 3 },
          'Oceania': { center: [-22.7359, 140.0188], zoom: 3 }
        };
        const continentInfo = continentCenters[selectedContinent] || { center: [0, 0], zoom: 2 };
        onRegionSelect({ continent: selectedContinent, country: null, region: null, subregion: null, regionPath: selectedContinent, center: continentInfo.center, zoom: continentInfo.zoom });
      }
    } else if (stepId === 2) {
      // Go back to country: keep continent + country, clear region/subregion
      setSelectedRegion(null);
      setSelectedSubregion(null);
      setSelectedCommune(null);
      setAvailableSubregions([]);
      setAvailableCommunes([]);
      if (onRegionSelect && selectedContinent && selectedCountry) {
        onRegionSelect({ continent: selectedContinent, country: selectedCountry, region: null, subregion: null, regionPath: `${selectedContinent}/${selectedCountry}`, center: null, zoom: 6 });
      }
    } else if (stepId === 3) {
      // Go back to region: keep continent + country + region, clear subregion
      setSelectedSubregion(null);
      setSelectedCommune(null);
      setAvailableCommunes([]);
      if (onRegionSelect && selectedContinent && selectedCountry && selectedRegion) {
        onRegionSelect({ continent: selectedContinent, country: selectedCountry, region: selectedRegion, subregion: null, regionPath: `${selectedContinent}/${selectedCountry}/${selectedRegion}`, center: null, zoom: 7 });
      }
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedContinent(null);
    setSelectedCountry(null);
    setSelectedRegion(null);
    setSelectedSubregion(null);
    setSelectedCommune(null);
    setAvailableCountries([]);
    setAvailableRegions([]);
    setAvailableSubregions([]);
    setAvailableCommunes([]);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white border-l border-slate-200 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <FiMap className="text-slate-700" size={20} />
            <h2 className="text-sm font-semibold text-slate-800">OSM Infrastructure</h2>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <FiChevronRight size={18} /> : <FiChevronRight size={18} className="rotate-180" />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          {/* Step-by-Step Region Selection */}
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Select Region
              </h3>
              {selectedContinent && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                >
                  Clear All
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
                <p className="text-xs text-slate-500 mt-2">Loading regions...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stepper Component with integrated dropdowns */}
                <RegionSelectionStepper
                  currentStep={
                    !selectedContinent ? 1 : 
                    !selectedCountry ? 2 : 
                    !selectedRegion ? 3 : 4
                  }
                  selectedContinent={selectedContinent}
                  selectedCountry={selectedCountry}
                  selectedRegion={selectedRegion}
                  selectedSubregion={selectedSubregion}
                  availableContinents={availableContinents}
                  availableCountries={availableCountries}
                  availableRegions={availableRegions}
                  availableSubregions={availableSubregions}
                  onContinentSelect={handleContinentSelect}
                  onCountrySelect={handleCountrySelect}
                  onRegionSelect={handleRegionSelect}
                  onSubregionSelect={handleSubregionSelect}
                  onGoBackToStep={handleGoBackToStep}
                />

                {/* Commune (if available) - Keep this separate as it's optional */}
                {selectedSubregion && availableCommunes.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      <FiMapPin className="inline mr-1" size={12} />
                      Commune (Optional)
                    </label>
                    <select
                      value={selectedCommune || ''}
                      onChange={(e) => handleCommuneSelect(e.target.value || null)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white"
                    >
                      <option value="">Select a commune...</option>
                      {availableCommunes.map(commune => (
                        <option key={commune} value={commune}>{commune}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            
            {/* Selection Summary */}
            {selectedSubregion && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs font-semibold text-blue-900 mb-1">Selected:</div>
                <div className="text-xs text-blue-700 space-y-1">
                  <div>🌍 {selectedContinent}</div>
                  <div>🏴 {selectedCountry}</div>
                  <div>📍 {selectedRegion}</div>
                  <div>🗺️ {selectedSubregion}</div>
                  {selectedCommune && <div>🏘️ {selectedCommune}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Infrastructure Layers with Integrated Filters */}
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              Infrastructure Layers
            </h3>
            <div className="space-y-4">
              {/* Power Lines */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={showOsmLayers?.powerLines}
                      onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, powerLines: e.target.checked })}
                      className="w-4 h-4 rounded text-gray-600 focus:ring-2 focus:ring-gray-500"
                    />
                    <span className="ml-2 text-sm text-slate-700 font-medium">Power Lines</span>
                  </label>
                  {showOsmLayers?.powerLines && (
                    <button
                      onClick={() => setExpandedFilters({ ...expandedFilters, powerLines: !expandedFilters.powerLines })}
                      className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                    >
                      {expandedFilters.powerLines ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                    </button>
                  )}
                </div>
                {showOsmLayers?.powerLines && expandedFilters.powerLines && (
                  <div className="ml-6 mt-3">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Voltage Range (kV)</label>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>Min: {powerLineFilters?.minVoltage || 0} kV</span>
                        <span>Max: {powerLineFilters?.maxVoltage || 1000} kV</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1000"
                        step="10"
                        value={powerLineFilters?.minVoltage || 0}
                        onChange={(e) => onPowerLineFiltersChange?.({ ...powerLineFilters, minVoltage: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                      />
                      <input
                        type="range"
                        min="0"
                        max="1000"
                        step="10"
                        value={powerLineFilters?.maxVoltage || 1000}
                        onChange={(e) => onPowerLineFiltersChange?.({ ...powerLineFilters, maxVoltage: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                    />
                  </div>
                </div>
              )}
            </div>              {/* Power Plants */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={showOsmLayers?.powerPlants}
                      onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, powerPlants: e.target.checked })}
                      className="w-4 h-4 rounded text-gray-600 focus:ring-2 focus:ring-gray-500"
                    />
                    <span className="ml-2 text-sm text-slate-700 font-medium">Power Plants</span>
                  </label>
                  {showOsmLayers?.powerPlants && (
                    <button
                      onClick={() => setExpandedFilters({ ...expandedFilters, powerPlants: !expandedFilters.powerPlants })}
                      className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                    >
                      {expandedFilters.powerPlants ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                    </button>
                  )}
                </div>
                {showOsmLayers?.powerPlants && expandedFilters.powerPlants && (
                  <div className="ml-6 mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Energy Source</label>
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md p-2">
                        <div className="grid grid-cols-2 gap-2">
                          {['solar', 'wind', 'hydro', 'nuclear', 'gas', 'coal', 'biomass', 'geothermal', 'oil', 'other'].map(source => (
                            <label key={source} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                              <input
                                type="checkbox"
                                checked={powerPlantFilters?.selectedSources?.includes(source) || false}
                                onChange={(e) => {
                                  const newSources = e.target.checked
                                    ? [...(powerPlantFilters?.selectedSources || []), source]
                                    : (powerPlantFilters?.selectedSources || []).filter(s => s !== source);
                                  onPowerPlantFiltersChange?.({ ...powerPlantFilters, selectedSources: newSources });
                                }}
                                className="w-4 h-4 rounded text-gray-600 focus:ring-2 focus:ring-gray-500"
                              />
                              <span className="text-xs text-slate-700 capitalize">{source}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Min Capacity (MW)</label>
                      <input
                        type="number"
                        value={powerPlantFilters?.minCapacity || ''}
                        onChange={(e) => onPowerPlantFiltersChange?.({ ...powerPlantFilters, minCapacity: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Substations */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={showOsmLayers?.substations}
                      onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, substations: e.target.checked })}
                      className="w-4 h-4 rounded text-gray-600 focus:ring-2 focus:ring-gray-500"
                    />
                    <span className="ml-2 text-sm text-slate-700 font-medium">Substations</span>
                  </label>
                  {showOsmLayers?.substations && (
                    <button
                      onClick={() => setExpandedFilters({ ...expandedFilters, substations: !expandedFilters.substations })}
                      className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                    >
                      {expandedFilters.substations ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                    </button>
                  )}
                </div>
                {showOsmLayers?.substations && expandedFilters.substations && (
                  <div className="ml-6 mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Substation Type</label>
                      <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-md p-2">
                        {['transmission', 'distribution', 'converter', 'traction', 'other'].map(type => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                            <input
                              type="checkbox"
                              checked={substationFilters?.selectedTypes?.includes(type) || false}
                              onChange={(e) => {
                                const newTypes = e.target.checked
                                  ? [...(substationFilters?.selectedTypes || []), type]
                                  : (substationFilters?.selectedTypes || []).filter(t => t !== type);
                                onSubstationFiltersChange?.({ ...substationFilters, selectedTypes: newTypes });
                              }}
                              className="w-4 h-4 rounded text-gray-600 focus:ring-2 focus:ring-gray-500"
                            />
                            <span className="text-xs text-slate-700 capitalize">{type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Voltage Range (kV)</label>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>Min: {substationFilters?.minVoltage || 0} kV</span>
                          <span>Max: {substationFilters?.maxVoltage || 1000} kV</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1000"
                          step="10"
                          value={substationFilters?.minVoltage || 0}
                          onChange={(e) => onSubstationFiltersChange?.({ ...substationFilters, minVoltage: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        />
                        <input
                          type="range"
                          min="0"
                          max="1000"
                          step="10"
                          value={substationFilters?.maxVoltage || 1000}
                          onChange={(e) => onSubstationFiltersChange?.({ ...substationFilters, maxVoltage: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Region Boundaries */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={showOsmLayers?.boundaries !== false}
                      onChange={(e) => onOsmLayersChange?.({ ...showOsmLayers, boundaries: e.target.checked })}
                      className="w-4 h-4 rounded text-gray-600 focus:ring-2 focus:ring-gray-500"
                    />
                    <span className="ml-2 text-sm text-slate-700 font-medium">Region Boundaries</span>
                  </label>
                </div>
                {showOsmLayers?.boundaries !== false && (
                  <p className="ml-6 mt-2 text-xs text-slate-500">Show selected region & subregion shapes on map</p>
                )}
              </div>

              {/* Mesh Generation Section */}
              <div className="border-t border-slate-200 pt-4 mt-4">
                <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="text-sm font-bold text-gray-900">Power Mesh Generator</h3>
                  </div>
                  <p className="text-xs text-gray-700 mb-3">
                    Generate and manage network mesh from power lines
                  </p>
                  
                  {/* Generate Button */}
                  <button
                    onClick={() => {
                      if (window.generateMeshFromLines) {
                        window.generateMeshFromLines();
                      }
                    }}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium flex items-center justify-center gap-2 mb-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate Mesh Network
                  </button>

                  {/* Mesh Statistics - Only show if mesh exists */}
                  {window.generatedMeshExists && window.meshStatistics && (
                    <div className="space-y-3 pt-3 border-t border-gray-300">
                      {/* Statistics Display */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="text-xs font-semibold text-gray-800 mb-2">Mesh Statistics</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] text-gray-600 uppercase tracking-wide">Nodes</div>
                            <div className="text-lg font-bold text-slate-700">{window.meshStatistics.nodeCount}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-600 uppercase tracking-wide">Edges</div>
                            <div className="text-lg font-bold text-slate-700">{window.meshStatistics.edgeCount}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-600 uppercase tracking-wide">Avg Connectivity</div>
                            <div className="text-lg font-bold text-slate-700">{window.meshStatistics.avgConnectivity}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-600 uppercase tracking-wide">Isolated</div>
                            <div className="text-lg font-bold text-slate-700">{window.meshStatistics.isolatedNodes}</div>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2">
                        {/* Import as Locations */}
                        <button
                          onClick={() => {
                            if (window.importMeshAsLocations) {
                              window.importMeshAsLocations();
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors text-xs font-medium flex items-center justify-center gap-2"
                        >
                          <FiMapPin size={14} />
                          Import as Locations & Links
                        </button>

                        {/* Export Mesh */}
                        <button
                          onClick={() => {
                            if (window.exportMesh) {
                              window.exportMesh();
                            }
                          }}
                          className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium flex items-center justify-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Export Mesh JSON
                        </button>

                        {/* Toggle Visibility */}
                        <button
                          onClick={() => {
                            if (window.toggleMeshVisibility) {
                              window.toggleMeshVisibility();
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors text-xs font-medium flex items-center justify-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Toggle Mesh Visibility
                        </button>

                        {/* Clear Mesh */}
                        <button
                          onClick={() => {
                            if (window.clearMesh) {
                              window.clearMesh();
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-400 text-white rounded-lg hover:bg-slate-500 transition-colors text-xs font-medium flex items-center justify-center gap-2"
                        >
                          <FiX size={14} />
                          Clear Mesh
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="flex flex-col items-center py-4 gap-4">
          <button
            className="p-2 rounded-lg hover:bg-slate-100"
            title="OSM Infrastructure"
          >
            <FiMap size={20} />
          </button>
          <div className="border-t border-slate-200 w-8 my-2"></div>
          <button
            className="p-2 rounded-lg hover:bg-slate-100"
            title="Layers"
          >
            <FiLayers size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

export default OsmInfrastructurePanel;
