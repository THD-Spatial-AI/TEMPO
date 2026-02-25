import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Navigation, 
  Layers,
  Minus,
  Move,
  Scissors,
  Trash2,
  MousePointer,
  Eye,
  EyeOff
} from 'lucide-react';

const MapToolbar = ({ 
  viewport,
  onViewportChange,
  pointSizes,
  onPointSizesChange,
  lineSizes,
  onLineSizesChange,
  visibleLayers,
  onVisibleLayersChange,
  onFitBounds,
  onResetView,
  rightSidebarCollapsed = false,
  locations = [],
  onLocationSelect
}) => {
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Close menus on Escape key
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowLayerMenu(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Close menus when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (showLayerMenu) {
        const toolbar = document.querySelector('.map-toolbar-container');
        if (toolbar && !toolbar.contains(e.target)) {
          setShowLayerMenu(false);
        }
      }
    };
    if (showLayerMenu) {
      setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showLayerMenu]);

  const filteredLocations = locations.filter(loc =>
    loc.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleZoomIn = () => {
    onViewportChange({
      ...viewport,
      zoom: Math.min(viewport.zoom + 1, 20)
    });
  };

  const handleZoomOut = () => {
    onViewportChange({
      ...viewport,
      zoom: Math.max(viewport.zoom - 1, 0)
    });
  };

  const layers = [
    { id: 'locations', label: 'Locations', category: 'model' },
    { id: 'links', label: 'Links', category: 'model' },
    { id: 'powerLines', label: 'Power Lines', category: 'osm' },
    { id: 'powerPlants', label: 'Power Plants', category: 'osm' },
    { id: 'substations', label: 'Substations', category: 'osm' }
  ];

  return (
    <div className="absolute top-0 left-20 right-0 z-10 pointer-events-none">
      <div className="flex justify-center pt-4" style={{ marginLeft: '256px', marginRight: rightSidebarCollapsed ? '64px' : '384px' }}>
        <div className="map-toolbar-container bg-white rounded-lg shadow-lg border border-slate-200 pointer-events-auto">
          <div className="flex items-center divide-x divide-slate-200">
            
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 px-3 py-2">
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-slate-100 rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-5 h-5 text-slate-700" />
              </button>
              <span className="text-sm font-medium text-slate-600 min-w-[3rem] text-center">
                {viewport?.zoom?.toFixed(1) || '10.0'}x
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-slate-100 rounded transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-5 h-5 text-slate-700" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative px-3 py-2">
              <div className="flex items-center gap-2 bg-slate-50 rounded px-3 py-1.5 min-w-[200px]">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search locations..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(e.target.value.length > 0);
                  }}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  className="bg-transparent outline-none text-sm w-full text-slate-700 placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchResults(false);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              
              {showSearchResults && filteredLocations.length > 0 && (
                <div className="absolute top-full mt-2 left-3 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto z-50 min-w-[250px]">
                  {filteredLocations.map((location) => (
                    <button
                      key={location.id}
                      onClick={() => {
                        onLocationSelect?.(location);
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                    >
                      <div className="font-medium text-sm text-slate-800">{location.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {Object.keys(location.techs || {}).length} technologies
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View Controls */}
            <div className="flex items-center gap-1 px-3 py-2">
              <button
                onClick={onFitBounds}
                className="p-2 hover:bg-slate-100 rounded transition-colors"
                title="Fit to Bounds"
              >
                <Maximize2 className="w-5 h-5 text-slate-700" />
              </button>
              <button
                onClick={onResetView}
                className="p-2 hover:bg-slate-100 rounded transition-colors"
                title="My Location"
              >
                <Navigation className="w-5 h-5 text-slate-700" />
              </button>
            </div>

            {/* Layer Visibility */}
            <div className="relative px-3 py-2">
              <button
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                className="p-2 hover:bg-slate-100 rounded transition-colors"
                title="Layer Visibility"
              >
                <Layers className="w-5 h-5 text-slate-700" />
              </button>
              
              {showLayerMenu && (
                <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-slate-200 w-56 py-2">
                  <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase">Model Layers</div>
                  {layers.filter(l => l.category === 'model').map(layer => (
                    <label key={layer.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleLayers?.[layer.id] !== false}
                        onChange={(e) => onVisibleLayersChange?.({ ...visibleLayers, [layer.id]: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span className="text-sm text-slate-700">{layer.label}</span>
                    </label>
                  ))}
                  
                  <div className="border-t border-slate-200 my-1"></div>
                  <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase">OSM Layers</div>
                  {layers.filter(l => l.category === 'osm').map(layer => (
                    <label key={layer.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleLayers?.[layer.id] !== false}
                        onChange={(e) => onVisibleLayersChange?.({ ...visibleLayers, [layer.id]: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span className="text-sm text-slate-700">{layer.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default MapToolbar;
