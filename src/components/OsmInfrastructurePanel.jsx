import React, { useState, useEffect } from 'react';
import { FiMap, FiChevronRight, FiLayers, FiMapPin } from 'react-icons/fi';
import RegionSelectionStepper from './RegionSelectionStepper';
import ZonalStudyAreaPanel from './ZonalStudyAreaPanel';
import { api } from '../services/api';
import { useData } from '../context/DataContext';

// The legacy Geofabrik cascade selector is disabled — the live Study Area
// search replaced it. Kept behind this flag for now; safe to delete the block.
const SHOW_LEGACY_REGION_SELECTOR = false;

const OsmInfrastructurePanel = ({
  collapsed,
  onToggleCollapse,
  onRegionSelect,
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

  // Available options for each level (derived from regionsDatabase)
  const [availableContinents, setAvailableContinents] = useState([]);
  const [availableCountries, setAvailableCountries] = useState([]);
  const [availableRegions, setAvailableRegions] = useState([]);
  const [availableSubregions, setAvailableSubregions] = useState([]);
  const [availableCommunes, setAvailableCommunes] = useState([]);

  // Load regions database from backend (dynamically loads from GeoServer)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
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
          {/* Primary flow: boundary-driven zonal Study Area */}
          <ZonalStudyAreaPanel
            onRegionSelect={onRegionSelect}
            substationFilters={substationFilters}
            onSubstationFiltersChange={onSubstationFiltersChange}
            powerPlantFilters={powerPlantFilters}
            onPowerPlantFiltersChange={onPowerPlantFiltersChange}
          />

          {/* Legacy Geofabrik region selector — disabled (see SHOW_LEGACY_REGION_SELECTOR). */}
          {SHOW_LEGACY_REGION_SELECTOR && (
          <div className="p-4">
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
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs font-semibold text-gray-900 mb-1">Selected:</div>
                <div className="text-xs text-gray-700 space-y-1">
                  <div>🌍 {selectedContinent}</div>
                  <div>🏴 {selectedCountry}</div>
                  <div>📍 {selectedRegion}</div>
                  <div>🗺️ {selectedSubregion}</div>
                  {selectedCommune && <div>🏘️ {selectedCommune}</div>}
                </div>
              </div>
            )}
          </div>
          )}

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
