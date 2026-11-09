// Resource map overlays (Inc 5): an atlas raster (Global Solar / Wind Atlas, read
// remotely by the renewables service for the countries in the current view) and animated wind-flow
// particles from an Open-Meteo u/v grid. State is per map instance (V9); nothing
// is fetched or animated while `enabled` is false or the overlays are off.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { BitmapLayer, PathLayer } from '@deck.gl/layers';
import { fetchAtlasView, fetchWindGrid } from '../../services/renewablesClient';
import { createParticles, stepParticles } from '../../services/windParticles';
import useViewBounds from './useViewBounds';

const PARTICLES = 1500;
const GRID_N = 16;
const FRAME_MS = 33; // ~30 store updates (DeckGL re-renders) per second while the flow animates
const NONE = [];

export const isoDaysAgo = d => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

const LAYERS = ['none', 'pvout', 'wind100'];

/** Initial `{ layer, flow }`: the stored choice under `storageKey` (if any and valid), else `defaults`, else off. */
export function readPrefs(storageKey, defaults) {
  const d = { layer: LAYERS.includes(defaults?.layer) ? defaults.layer : 'none', flow: !!defaults?.flow };
  if (!storageKey) return d;
  try {
    const p = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return { layer: LAYERS.includes(p?.layer) ? p.layer : d.layer, flow: typeof p?.flow === 'boolean' ? p.flow : d.flow };
  } catch {
    return d;
  }
}
function savePrefs(storageKey, prefs) {
  try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* per-viewer convenience only */ }
}

// Wind-grid request box: the view padded by 25 % per side, so small pans reuse the grid,
// and snapped outward to 0.25° so the service cache hits (each fetch costs ~n² API calls).
const down = x => Math.floor(x * 4) / 4;
const up = x => Math.ceil(x * 4) / 4;
export function padded({ south, west, north, east }) {
  const dy = (north - south) / 4;
  const dx = (east - west) / 4;
  return {
    south: Math.max(-85, down(south - dy)), north: Math.min(85, up(north + dy)),
    west: Math.max(-180, down(west - dx)), east: Math.min(180, up(east + dx)),
  };
}

const extent = g => ({ south: g.lats[0], north: g.lats[g.lats.length - 1], west: g.lons[0], east: g.lons[g.lons.length - 1] });

// A grid still serves the view when it covers it and is at most twice the size of the
// request the view would make now (so a grid fetched for `padded(view)` always serves).
export function gridServes(grid, b, date) {
  if (!grid || grid.date !== date) return false;
  const g = extent(grid);
  const want = padded(b);
  const covers = b.south >= g.south && b.north <= g.north && b.west >= g.west && b.east <= g.east;
  return covers && g.north - g.south <= 2 * (want.north - want.south) && g.east - g.west <= 2 * (want.east - want.west);
}

function intersect(a, b) {
  const r = { south: Math.max(a.south, b.south), north: Math.min(a.north, b.north), west: Math.max(a.west, b.west), east: Math.min(a.east, b.east) };
  return r.south < r.north && r.west < r.east ? r : a;
}

// Particle trails outside React state: the animation writes here and only <WithFlow>
// (wrapped around the DeckGL element) subscribes, so the host map does not re-render.
function createStore() {
  let value = null;
  const subs = new Set();
  return {
    get: () => value,
    set: (v) => { if (v !== value) { value = v; subs.forEach(f => f()); } },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}

const flowLayer = trails => new PathLayer({
  id: 'overlay-flow',
  data: trails,
  getPath: p => p.trail,
  getColor: [255, 255, 255, 180],
  widthMinPixels: 1,
  updateTriggers: { getPath: trails },
});

/** Render prop: `children(layers)` with the flow layer between `under` and `rest`, re-rendered per frame. */
export function WithFlow({ store, under, rest, children }) {
  const trails = useSyncExternalStore(store.subscribe, store.get);
  return children(trails ? [...under, flowLayer(trails), ...rest] : [...under, ...rest]);
}

/**
 * @param {{ viewState: {longitude, latitude, zoom}, enabled: boolean, defaults?: {layer?, flow?}, storageKey?: string }} args
 *   `defaults` sets the initial layer / flow; with `storageKey` the last choice is kept in localStorage.
 * @returns {{ ref: Function, layers: object[], flowStore: object, active: boolean, controlsProps: object }}
 *   `ref` goes on the map container (measured for the view bounds); `layers` = [atlas] (or none);
 *   the flow layer comes from `<WithFlow store={flowStore} …>` around the DeckGL element.
 */
export default function useResourceOverlays({ viewState, enabled, defaults, storageKey }) {
  const view = useViewBounds(viewState, enabled);
  const { bounds, width } = view;
  const zoom = viewState?.zoom ?? 6;
  const [initial] = useState(() => readPrefs(storageKey, defaults));
  const [layer, setLayer] = useState(initial.layer); // none | pvout | wind100
  const [flow, setFlow] = useState(initial.flow);
  const [hour, setHour] = useState(12);
  const [date, setDate] = useState(() => isoDaysAgo(7));
  const [image, setImage] = useState(null); // { key, layer, url, bounds, countries } or { key, layer, note | error }
  const [loadingKey, setLoadingKey] = useState(''); // view key of the atlas request in flight
  const [grid, setGrid] = useState(null);
  const [flowState, setFlowState] = useState({ loading: false, error: null });
  const [flowStore] = useState(createStore);
  const [hidden, setHidden] = useState(false);
  const alive = useRef(true);
  const imageReq = useRef(0);
  const flowReq = useRef(0);
  const urlRef = useRef(null); // object URL currently in `image`
  const particles = useRef(null); // { grid, list }
  const live = useRef({ hour, zoom, bounds });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);
  useEffect(() => { live.current = { hour, zoom, bounds }; }, [hour, zoom, bounds]);
  useEffect(() => { if (storageKey) savePrefs(storageKey, { layer, flow }); }, [storageKey, layer, flow]);

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

  // Wind grid for the (padded) view, refetched only when the view outgrows it.
  useEffect(() => {
    if (!enabled || !flow || !bounds || gridServes(grid, bounds, date)) return undefined;
    const id = ++flowReq.current;
    const t = setTimeout(async () => {
      setFlowState({ loading: true, error: null });
      const res = await fetchWindGrid({ ...padded(bounds), date, n: GRID_N });
      if (!alive.current || id !== flowReq.current) return;
      setFlowState({ loading: false, error: res.ok ? null : res.error });
      if (res.ok && res.grid?.lats?.length > 1) setGrid({ ...res.grid, date });
    }, 600);
    return () => clearTimeout(t);
  }, [enabled, flow, bounds, date, grid]);

  useEffect(() => {
    if (!enabled || !flow) return undefined;
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [enabled, flow]);

  // Particle animation: steps every frame (speed independent of the refresh rate),
  // publishes the trails to `flowStore` ~30×/s.
  useEffect(() => {
    if (!enabled || !flow) flowStore.set(null);
    if (!enabled || !flow || !grid || hidden) return undefined;
    const g = extent(grid);
    if (particles.current?.grid !== grid) {
      particles.current = { grid, list: createParticles(PARTICLES, live.current.bounds ? intersect(g, live.current.bounds) : g) };
    }
    let raf = 0;
    let last = 0; // last publish
    let prev = null; // previous frame timestamp
    const step = (t) => {
      const dt = prev == null ? 16.7 : Math.min(50, t - prev);
      prev = t;
      const { hour: h, zoom: z, bounds: b } = live.current;
      const p = particles.current;
      p.list = stepParticles(p.list, grid, Math.min(h, grid.u.length - 1), b ? intersect(g, b) : g, 0.004 * 2 ** (6 - z) * (dt / 16.7));
      if (t - last >= FRAME_MS) { last = t; flowStore.set(p.list); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [enabled, flow, grid, hidden, flowStore]);

  const shownImage = atlasLayer && image?.layer === atlasLayer ? image : null;
  const atlasLoading = !!viewKey && loadingKey === viewKey && image?.key !== viewKey;
  // The PNG is equirectangular (EPSG:4326): interpolate it in lng/lat, not Web Mercator.
  const layers = useMemo(() => (enabled && shownImage?.url ? [new BitmapLayer({
    id: 'overlay-atlas', image: shownImage.url, bounds: shownImage.bounds, opacity: 0.7,
    _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
  })] : NONE), [enabled, shownImage]);

  const errors = [shownImage?.error, flow ? flowState.error : null].filter(Boolean);

  return {
    ref: view.ref,
    layers,
    flowStore,
    active: enabled && (layer !== 'none' || flow),
    controlsProps: {
      layer, setLayer, atlasLoading, countries: shownImage?.countries || NONE, legend: !!shownImage?.url,
      flow, setFlow, hour, setHour, date, setDate, dateMax: isoDaysAgo(6),
      flowLoading: flow && flowState.loading, errors, note: shownImage?.note || null,
    },
  };
}
