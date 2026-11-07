// Small map of a tech's profile points for the resource-profile dialogs.
// Optional `pins` ({ name: {lat, lon} }) draw each point's weather site (W6).
import React, { useMemo, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { WebMercatorViewport } from '@deck.gl/core';
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers';
import { Map as MapGL } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLES } from '../../config/mapStyles';
import { canCreateWebGLContext, webglUnavailableMessage } from '../../utils/webglSupport';

// Probing creates a canvas + GL context, so do it once per session.
let webglProbe = null;
const webglAvailable = () => (webglProbe ??= canCreateWebGLContext());

const W = 420;
const H = 200;

function initialView(points) {
  const lons = points.map(p => p.lon);
  const lats = points.map(p => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  // fitBounds cannot fit a zero-size box (one point, or several at the same spot).
  if (x0 === x1 && y0 === y1) return { longitude: x0, latitude: y0, zoom: 7 };
  const vp = new WebMercatorViewport({ width: W, height: H }).fitBounds([[x0, y0], [x1, y1]], { padding: 24 });
  return { longitude: vp.longitude, latitude: vp.latitude, zoom: Math.min(vp.zoom, 9) };
}

const PIN_COLOR = [234, 88, 12];

export default function PointsMap({ points, selected, onSelect, pins }) {
  const [webgl, setWebgl] = useState(webglAvailable);
  // Pinned sites, joined to their location: { name, lat, lon, from: [lon, lat] }.
  const pinned = useMemo(() => points.filter(p => Number.isFinite(pins?.[p.name]?.lat) && Number.isFinite(pins[p.name].lon)).map(p => ({
    name: p.name, lat: pins[p.name].lat, lon: pins[p.name].lon, from: [p.lon, p.lat],
  })), [points, pins]);
  const view = useMemo(() => (points.length ? initialView([...points, ...pinned]) : null), [points, pinned]);
  if (!view) return null;
  if (!webgl) return <p className="text-xs text-slate-500">{webglUnavailableMessage()}</p>;
  const layer = new ScatterplotLayer({
    id: 'profile-points',
    data: points,
    getPosition: p => [p.lon, p.lat],
    getRadius: p => (p.name === selected ? 7 : 5),
    radiusUnits: 'pixels',
    getFillColor: p => (p.name === selected ? [0, 0, 0] : [100, 116, 139]),
    getLineColor: [255, 255, 255],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    onClick: ({ object }) => object && onSelect(object.name),
    updateTriggers: { getRadius: selected, getFillColor: selected },
  });
  const layers = pinned.length ? [
    new LineLayer({
      id: 'profile-pin-lines',
      data: pinned,
      getSourcePosition: p => p.from,
      getTargetPosition: p => [p.lon, p.lat],
      getColor: [100, 116, 139],
      getWidth: 1,
    }),
    layer,
    new ScatterplotLayer({
      id: 'profile-pins',
      data: pinned,
      getPosition: p => [p.lon, p.lat],
      getRadius: p => (p.name === selected ? 6 : 4),
      radiusUnits: 'pixels',
      getFillColor: PIN_COLOR,
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: 1,
      stroked: true,
      pickable: true,
      onClick: ({ object }) => object && onSelect(object.name),
      updateTriggers: { getRadius: selected },
    }),
  ] : [layer];
  return (
    <div className="relative border border-slate-200" style={{ width: '100%', height: H }}>
      <DeckGL
        initialViewState={view}
        controller
        layers={layers}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        onError={() => setWebgl(false)}
      >
        <MapGL mapStyle={MAP_STYLES.grey} />
      </DeckGL>
    </div>
  );
}
