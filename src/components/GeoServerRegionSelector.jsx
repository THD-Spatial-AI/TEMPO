/**
 * GeoServerRegionSelector
 *
 * Shows a dynamic, hierarchical list of regions that are ACTUALLY loaded in
 * GeoServer/PostGIS (fetched from GET /api/osm/regions at mount time).
 *
 * Hierarchy: Continent → Country → Region → Sub-region
 * Coordinates for map fly-to are resolved from regions_database.json.
 *
 * Props:
 *   collapsed        {bool}
 *   onToggleCollapse {fn}
 *   showOsmLayers    {object}   layer visibility flags
 *   onOsmLayersChange{fn}
 *   onRegionChange   {fn({ regionPath, bbox, center, zoom })}  called on selection
 *   loading          {bool}     true while parent is loading layer data
 */

import React, { useState } from 'react';
import {
  FiMap, FiChevronDown, FiChevronRight, FiLayers,
  FiCrosshair, FiRefreshCw, FiAlertCircle, FiGlobe,
} from 'react-icons/fi';
import { useLoadedRegions } from '../hooks/useLoadedRegions';

// ── helpers ────────────────────────────────────────────────────────────────────

function parseBboxFloats(b) {
  const p = {
    minLon: parseFloat(b.minLon), minLat: parseFloat(b.minLat),
    maxLon: parseFloat(b.maxLon), maxLat: parseFloat(b.maxLat),
  };
  return Object.values(p).every(v => !isNaN(v)) ? p : null;
}
function isValidBbox(b) {
  return b.minLon < b.maxLon && b.minLat < b.maxLat
      && b.minLon >= -180 && b.maxLon <= 180
      && b.minLat >= -90  && b.maxLat <= 90;
}

// ── sub-components ─────────────────────────────────────────────────────────────

/** A small badge showing the number of sub-items */
function CountBadge({ n }) {
  if (!n) return null;
  return (
    <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-mono">
      {n}
    </span>
  );
}

/** Collapsible tree node used for Continent, Country and Region rows. */
function TreeNode({ label, badge, isSelected, isActive, depth = 0, children, onSelect }) {
  const [open, setOpen] = useState(depth < 1); // continents open by default

  const indent = depth * 12;
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div>
      <div
        style={{ paddingLeft: indent }}
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors
          ${isSelected
            ? 'bg-blue-600 text-white font-medium'
            : isActive
              ? 'bg-blue-50 text-blue-800'
              : 'text-gray-700 hover:bg-gray-50'}`}
        onClick={() => {
          if (hasChildren) setOpen(o => !o);
          if (onSelect) onSelect();
        }}
      >
        {hasChildren ? (
          open
            ? <FiChevronDown size={13} className="flex-shrink-0 opacity-60" />
            : <FiChevronRight size={13} className="flex-shrink-0 opacity-60" />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <span className="flex-1 truncate">{label}</span>
        <CountBadge n={badge} />
      </div>
      {open && hasChildren && <div>{children}</div>}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

const GeoServerRegionSelector = ({
  collapsed,
  onToggleCollapse,
  showOsmLayers,
  onOsmLayersChange,
  onRegionChange,
  onBboxChange,     // kept for backward compat
  viewport,
  loading: parentLoading,
}) => {
  const { tree, paths, loading: regionsLoading, error: regionsError, refresh } = useLoadedRegions();

  const [selectedPath, setSelectedPath] = useState(null);
  const [customBbox, setCustomBbox] = useState({ minLon: '', minLat: '', maxLon: '', maxLat: '' });

  const totalLoaded = paths.length;

  // Called when the user clicks a leaf (country / region / subregion) node
  const handleSelect = (node) => {
    setSelectedPath(node.path);
    const payload = { regionPath: node.path, bbox: node.bbox, center: node.center, zoom: node.zoom };
    if (onRegionChange) onRegionChange(payload);
    if (onBboxChange)   onBboxChange(node.bbox);   // backward compat
  };

  const handleCurrentViewport = () => {
    if (!viewport) return;
    const delta = 180 / Math.pow(2, (viewport.zoom || 8) - 1) * 0.4;
    const bbox = {
      minLon: parseFloat((viewport.longitude - delta).toFixed(4)),
      maxLon: parseFloat((viewport.longitude + delta).toFixed(4)),
      minLat: parseFloat(Math.max(viewport.latitude  - delta * 0.7, -90).toFixed(4)),
      maxLat: parseFloat(Math.min(viewport.latitude  + delta * 0.7,  90).toFixed(4)),
    };
    setSelectedPath(null);
    setCustomBbox({ minLon: bbox.minLon, minLat: bbox.minLat, maxLon: bbox.maxLon, maxLat: bbox.maxLat });
    if (onRegionChange) onRegionChange({ regionPath: null, bbox });
    if (onBboxChange)   onBboxChange(bbox);
  };

  const handleCustomBboxSubmit = () => {
    const bbox = parseBboxFloats(customBbox);
    if (bbox && isValidBbox(bbox)) {
      setSelectedPath(null);
      if (onRegionChange) onRegionChange({ regionPath: null, bbox });
      if (onBboxChange)   onBboxChange(bbox);
    }
  };

  const loading = parentLoading || regionsLoading;

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <FiGlobe className="text-blue-600" size={20} />
          <h3 className="font-semibold text-gray-800">OSM Infrastructure</h3>
          {totalLoaded > 0 && (
            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
              {totalLoaded} region{totalLoaded !== 1 ? 's' : ''} loaded
            </span>
          )}
        </div>
        {collapsed ? <FiChevronRight size={20} /> : <FiChevronDown size={20} />}
      </div>

      {!collapsed && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">

          {/* ── Available Regions Tree ─────────────────────────────────── */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Available in GeoServer
              </span>
              <button
                onClick={refresh}
                disabled={regionsLoading}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Refresh region list"
              >
                <FiRefreshCw size={13} className={regionsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Loading skeleton */}
            {regionsLoading && (
              <div className="space-y-1.5 py-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            )}

            {/* Error state */}
            {!regionsLoading && regionsError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded p-2 text-xs">
                <FiAlertCircle size={14} />
                <span>Cannot reach backend. Is it running on port 8082?</span>
              </div>
            )}

            {/* Empty state */}
            {!regionsLoading && !regionsError && totalLoaded === 0 && (
              <div className="text-center py-4 text-gray-400">
                <FiMap className="mx-auto mb-1" size={20} />
                <p className="text-xs">No regions loaded yet.</p>
                <p className="text-xs mt-1">
                  Run <code className="bg-gray-100 px-1 rounded">add_region_to_geoserver.py</code> to add data.
                </p>
              </div>
            )}

            {/* Dynamic hierarchical tree */}
            {!regionsLoading && totalLoaded > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
                {Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)).map(([contKey, contNode]) => {
                  const countries = Object.entries(contNode.countries).sort(([a], [b]) => a.localeCompare(b));
                  return (
                    <TreeNode
                      key={contKey}
                      label={contNode.label}
                      badge={countries.length}
                      depth={0}
                      isSelected={false}
                    >
                      {countries.map(([ctryKey, ctryNode]) => {
                        const regions = Object.entries(ctryNode.regions || {}).sort(([a], [b]) => a.localeCompare(b));
                        const hasRegions = regions.length > 0;

                        return (
                          <TreeNode
                            key={ctryKey}
                            label={ctryNode.label}
                            badge={hasRegions ? regions.length : undefined}
                            depth={1}
                            isSelected={selectedPath === ctryNode.path}
                            onSelect={!hasRegions ? () => handleSelect(ctryNode) : undefined}
                          >
                            {regions.map(([regKey, regNode]) => {
                              const subs = Object.entries(regNode.subregions || {}).sort(([a], [b]) => a.localeCompare(b));
                              const hasSubs = subs.length > 0;

                              return (
                                <TreeNode
                                  key={regKey}
                                  label={regNode.label}
                                  badge={hasSubs ? subs.length : undefined}
                                  depth={2}
                                  isSelected={selectedPath === regNode.path}
                                  onSelect={!hasSubs ? () => handleSelect(regNode) : undefined}
                                >
                                  {subs.map(([subKey, subNode]) => (
                                    <TreeNode
                                      key={subKey}
                                      label={subNode.label}
                                      depth={3}
                                      isSelected={selectedPath === subNode.path}
                                      onSelect={() => handleSelect(subNode)}
                                    />
                                  ))}
                                </TreeNode>
                              );
                            })}
                          </TreeNode>
                        );
                      })}
                    </TreeNode>
                  );
                })}
              </div>
            )}

            {/* Selected region indicator */}
            {selectedPath && (
              <div className="mt-2 flex items-center justify-between text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                <span className="text-blue-700 font-medium truncate">{selectedPath.replace(/\//g, ' › ')}</span>
                <button
                  className="ml-2 text-blue-400 hover:text-blue-600 flex-shrink-0"
                  onClick={() => {
                    setSelectedPath(null);
                    if (onRegionChange) onRegionChange({ regionPath: null, bbox: null });
                  }}
                  title="Clear selection"
                >✕</button>
              </div>
            )}
          </div>

          {/* ── Viewport / Custom BBox ─────────────────────────────────── */}
          <div className="p-3 space-y-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Load by Area
            </span>

            <button
              onClick={handleCurrentViewport}
              className="w-full px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2 text-sm transition-colors"
              disabled={loading || !viewport}
              title="Load data for the current map view"
            >
              <FiCrosshair size={15} />
              Current Map View
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              {[
                ['minLon', 'Min Lon'], ['maxLon', 'Max Lon'],
                ['minLat', 'Min Lat'], ['maxLat', 'Max Lat'],
              ].map(([field, ph]) => (
                <input
                  key={field}
                  type="number"
                  step="0.001"
                  placeholder={ph}
                  value={customBbox[field]}
                  onChange={e => setCustomBbox(prev => ({ ...prev, [field]: e.target.value }))}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
              ))}
            </div>
            <button
              onClick={handleCustomBboxSubmit}
              className="w-full px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 text-sm transition-colors"
              disabled={loading || !parseBboxFloats(customBbox)}
            >
              Load Custom Bbox
            </button>
          </div>

          {/* ── Layer Toggles ──────────────────────────────────────────── */}
          <div className="p-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <FiLayers className="inline mr-1 mb-0.5" size={11} />
              Visible Layers
            </span>
            <div className="mt-2 space-y-1.5">
              {[
                { key: 'substations', label: 'Substations',  icon: '⚡' },
                { key: 'powerPlants', label: 'Power Plants', icon: '🏭' },
                { key: 'powerLines',  label: 'Power Lines',  icon: '📡' },
                { key: 'communes',    label: 'Communes',     icon: '🏘️' },
                { key: 'districts',   label: 'Districts',    icon: '🗺️' },
              ].map(({ key, label, icon }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOsmLayers?.[key] ?? true}
                    onChange={e => onOsmLayersChange?.({ ...showOsmLayers, [key]: e.target.checked })}
                    className="rounded accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">{icon} {label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Loading / status bar ───────────────────────────────────── */}
          {parentLoading && (
            <div className="px-4 py-2 flex items-center gap-2 text-blue-600 bg-blue-50">
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent flex-shrink-0" />
              <span className="text-xs">Loading layer data…</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default GeoServerRegionSelector;
