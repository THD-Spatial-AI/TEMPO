// Geographic bounds of a deck.gl view (for the resource overlays): measures the
// map container with a ResizeObserver and projects the viewState. Latitudes are
// clamped to ±85 and bounds rounded so small jitters keep the same key; a view that
// crosses the antimeridian (or shows the world more than once) gives null bounds.
import { useEffect, useMemo, useState } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r3 = x => Math.round(x * 1000) / 1000;

/**
 * "south,west,north,east" of a view `width`×`height` px, or '' when it cannot be
 * computed or crosses the antimeridian. deck.gl 9's getBounds() is flat:
 * [minLng, minLat, maxLng, maxLat].
 */
export function boundsKey(viewState, width, height) {
  const { longitude, latitude, zoom, pitch = 0, bearing = 0 } = viewState || {};
  if (!(width > 0 && height > 0 && Number.isFinite(longitude) && Number.isFinite(latitude) && Number.isFinite(zoom))) return '';
  try {
    const lon = ((((longitude + 180) % 360) + 360) % 360) - 180;
    const [x0, y0, x1, y1] = new WebMercatorViewport({ width, height, longitude: lon, latitude, zoom, pitch, bearing }).getBounds();
    if (![x0, y0, x1, y1].every(Number.isFinite) || x0 < -180 || x1 > 180) return '';
    return [clamp(y0, -85, 85), x0, clamp(y1, -85, 85), x1].map(r3).join(',');
  } catch {
    return '';
  }
}

/**
 * @returns {{ ref: Function, width: number, bounds: null|{south, west, north, east}, key: string }}
 *   `ref` is a callback ref for the map container; nothing is observed while `enabled` is false.
 */
export default function useViewBounds(viewState, enabled) {
  const [el, setEl] = useState(null);
  const [size, setSize] = useState([0, 0]);
  useEffect(() => {
    if (!enabled || !el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setSize(s => (s[0] === el.clientWidth && s[1] === el.clientHeight ? s : [el.clientWidth, el.clientHeight]));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, enabled]);

  const [w, h] = size;
  const key = enabled ? boundsKey(viewState, w, h) : '';
  const bounds = useMemo(() => {
    if (!key) return null;
    const [south, west, north, east] = key.split(',').map(Number);
    return south < north && west < east ? { south, west, north, east } : null;
  }, [key]);
  return { ref: setEl, width: w, bounds, key: bounds ? key : '' };
}
