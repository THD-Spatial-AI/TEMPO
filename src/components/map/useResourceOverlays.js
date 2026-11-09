// Resource map overlays (Inc 5): an atlas raster (Global Solar / Wind Atlas, read
// remotely by the renewables service for the countries in the current view), animated wind
// streamlines (useWindStreamlines) and an hourly sunshine glow (useSunshine), with a shared
// date / hour and a play button that sweeps the day. State is per map instance (V9); nothing
// is fetched or animated while `enabled` is false, the overlays are off or the page is hidden.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { BitmapLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { fetchAtlasView } from '../../services/renewablesClient';
import { TRAIL } from '../../services/windStreamlines';
import useViewBounds from './useViewBounds';
import useWindStreamlines from './useWindStreamlines';
import useSunshine from './useSunshine';

export { padded, gridServes } from './overlayGrid';

const HOUR_MS = 600; // play: one hour per 600 ms
const PLAY_FRAME_MS = 83; // play: ~12 sunshine frames per second
const NONE = [];

export const isoDaysAgo = d => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

const LAYERS = ['none', 'pvout', 'wind100'];
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/**
 * Initial `{ layer, streamlines, sun }`: the stored choice under `storageKey` (if any and valid),
 * else `defaults`, else off. The old `flow` key (wind particles) maps to `streamlines`.
 */
export function readPrefs(storageKey, defaults) {
  const d = {
    layer: LAYERS.includes(defaults?.layer) ? defaults.layer : 'none',
    streamlines: !!(defaults?.streamlines ?? defaults?.flow),
    sun: !!defaults?.sun,
  };
  if (!storageKey) return d;
  try {
    const p = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return {
      layer: LAYERS.includes(p?.layer) ? p.layer : d.layer,
      streamlines: bool(p?.streamlines, bool(p?.flow, d.streamlines)),
      sun: bool(p?.sun, d.sun),
    };
  } catch {
    return d;
  }
}
function savePrefs(storageKey, prefs) {
  try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* per-viewer convenience only */ }
}

// Animated overlay state outside React state: the animations patch `{ trips, time, sun }` here
// and only <WithFlow> (wrapped around the DeckGL element) subscribes, so the host map does not
// re-render per frame.
const EMPTY = { trips: null, time: 0, sun: null };
function createStore() {
  let value = EMPTY;
  const subs = new Set();
  return {
    get: () => value,
    patch: (p) => {
      if (Object.keys(p).every(k => p[k] === value[k])) return;
      value = { ...value, ...p };
      subs.forEach(f => f());
    },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}

const sunLayer = sun => new BitmapLayer({
  id: 'overlay-sunshine', image: sun.image, bounds: sun.bounds,
  _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
});

const streamLayer = (trips, time) => new TripsLayer({
  id: 'overlay-streamlines',
  data: trips,
  getPath: d => d.path,
  getTimestamps: d => d.timestamps,
  getColor: d => d.color,
  currentTime: time,
  trailLength: TRAIL,
  fadeTrail: true,
  widthMinPixels: 1.5,
  capRounded: true,
});

/** Render prop: `children(layers)` with sunshine + streamlines between `under` and `rest`, re-rendered per frame. */
export function WithFlow({ store, under, rest, children }) {
  const { trips, time, sun } = useSyncExternalStore(store.subscribe, store.get);
  const mid = [];
  if (sun) mid.push(sunLayer(sun));
  if (trips?.length) mid.push(streamLayer(trips, time));
  return children(mid.length ? [...under, ...mid, ...rest] : [...under, ...rest]);
}

/**
 * @param {{ viewState: {longitude, latitude, zoom}, enabled: boolean, defaults?: {layer?, streamlines?, sun?}, storageKey?: string }} args
 *   `defaults` sets the initial overlays; with `storageKey` the last choice is kept in localStorage.
 * @returns {{ ref: Function, layers: object[], flowStore: object, active: boolean, controlsProps: object }}
 *   `ref` goes on the map container (measured for the view bounds); `layers` = [atlas] (or none);
 *   sunshine and streamlines come from `<WithFlow store={flowStore} …>` around the DeckGL element.
 */
export default function useResourceOverlays({ viewState, enabled, defaults, storageKey }) {
  const view = useViewBounds(viewState, enabled);
  const { bounds, width } = view;
  const [initial] = useState(() => readPrefs(storageKey, defaults));
  const [layer, setLayer] = useState(initial.layer); // none | pvout | wind100
  const [streamlines, setStreamlines] = useState(initial.streamlines);
  const [sun, setSun] = useState(initial.sun);
  const [hour, setHour] = useState(12);
  const [date, setDate] = useState(() => isoDaysAgo(7));
  const [playing, setPlaying] = useState(false);
  const [image, setImage] = useState(null); // { key, layer, url, bounds, countries } or { key, layer, note | error }
  const [loadingKey, setLoadingKey] = useState(''); // view key of the atlas request in flight
  const [flowStore] = useState(createStore);
  const [hidden, setHidden] = useState(false);
  const alive = useRef(true);
  const imageReq = useRef(0);
  const urlRef = useRef(null); // object URL currently in `image`
  const hourRef = useRef(hour);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);
  useEffect(() => { hourRef.current = hour; }, [hour]);
  useEffect(() => { if (storageKey) savePrefs(storageKey, { layer, streamlines, sun }); }, [storageKey, layer, streamlines, sun]);

  const animated = enabled && (streamlines || sun);
  if (!animated && playing) setPlaying(false); // no auto-resume when an overlay comes back on
  useEffect(() => {
    if (!animated) return undefined;
    const sync = () => {
      setHidden(document.hidden);
      if (document.hidden) setPlaying(false);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [animated]);
  const isPlaying = playing && animated && !hidden;

  const wind = useWindStreamlines({ on: enabled && streamlines, bounds, date, hour, hidden, store: flowStore });
  const sunshine = useSunshine({ on: enabled && sun, bounds, date, hour, playing: isPlaying, hidden, store: flowStore });
  const renderSun = sunshine.render;

  // Play: the hour advances every HOUR_MS (looping 0→23 UTC); sunshine frames in between
  // are interpolated at ~12 fps. Stops on unmount, when hidden or when the overlays go off.
  useEffect(() => {
    if (!isPlaying) return undefined;
    const t0 = performance.now();
    const h0 = hourRef.current;
    let last = h0;
    const id = setInterval(() => {
      const t = (h0 + (performance.now() - t0) / HOUR_MS) % 24;
      renderSun(t);
      const h = Math.floor(t);
      if (h !== last) { last = h; setHour(h); }
    }, PLAY_FRAME_MS);
    return () => clearInterval(id);
  }, [isPlaying, renderSun]);

  const atlasLayer = enabled && layer !== 'none' ? layer : '';
  const px = Math.min(1024, Math.round(width));
  const viewKey = atlasLayer && bounds && px > 0 ? `${atlasLayer}|${view.key}|${px}` : '';
  const replaceImage = useCallback((next) => {
    if (urlRef.current && urlRef.current !== next?.url) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url || null;
    setImage(next);
  }, []);

  // Viewport-sized atlas PNG for the countries in view, debounced while the view moves.
  useEffect(() => {
    if (!viewKey) return undefined;
    const id = ++imageReq.current;
    const t = setTimeout(async () => {
      setLoadingKey(viewKey);
      const res = await fetchAtlasView({ layer: atlasLayer, ...bounds, width: px });
      if (!alive.current || id !== imageReq.current) {
        if (res.url) URL.revokeObjectURL(res.url);
        return;
      }
      const base = { key: viewKey, layer: atlasLayer, url: null };
      if (res.empty) replaceImage({ ...base, note: `No ${atlasLayer === 'wind100' ? 'wind' : 'solar'} atlas data in this area.` });
      else if (res.ok) replaceImage({ ...base, url: res.url, bounds: res.bounds, countries: res.countries });
      else replaceImage({ ...base, error: res.error });
    }, 400);
    return () => clearTimeout(t);
  }, [viewKey, atlasLayer, bounds, px, replaceImage]);

  const shownImage = atlasLayer && image?.layer === atlasLayer ? image : null;
  const atlasLoading = !!viewKey && loadingKey === viewKey && image?.key !== viewKey;
  const sunOn = enabled && sun;
  // The PNG is equirectangular (EPSG:4326): interpolate it in lng/lat, not Web Mercator.
  // Under the sunshine glow it is dimmed to 0.5 (S6).
  const layers = useMemo(() => (enabled && shownImage?.url ? [new BitmapLayer({
    id: 'overlay-atlas', image: shownImage.url, bounds: shownImage.bounds, opacity: sunOn ? 0.5 : 0.7,
    _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
  })] : NONE), [enabled, shownImage, sunOn]);

  const errors = [shownImage?.error, wind.error, sunshine.error].filter(Boolean);
  const pickHour = useCallback((h) => { setPlaying(false); setHour(h); }, []);

  return {
    ref: view.ref,
    layers,
    flowStore,
    active: enabled && (layer !== 'none' || streamlines || sun),
    controlsProps: {
      layer, setLayer, atlasLoading, countries: shownImage?.countries || NONE, legend: !!shownImage?.url,
      streamlines, setStreamlines, sun, setSun, hour, setHour: pickHour, date, setDate, dateMax: isoDaysAgo(6),
      playing: isPlaying, setPlaying,
      windLoading: wind.loading, sunLoading: sunshine.loading, errors, note: shownImage?.note || null,
    },
  };
}
