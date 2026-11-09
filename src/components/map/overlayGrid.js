// Shared n×n Open-Meteo grid handling for the wind-streamline and sunshine overlays:
// request box, reuse rule and a fetch hook with a request-id guard.
import { useEffect, useRef, useState } from 'react';

export const GRID_N = 16;

// Grid request box: the view padded by 25 % per side, so small pans reuse the grid,
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

export const extent = g => ({ south: g.lats[0], north: g.lats[g.lats.length - 1], west: g.lons[0], east: g.lons[g.lons.length - 1] });

// A grid still serves the view when it covers it and is at most twice the size of the
// request the view would make now (so a grid fetched for `padded(view)` always serves).
export function gridServes(grid, b, date) {
  if (!grid || grid.date !== date) return false;
  const g = extent(grid);
  const want = padded(b);
  const covers = b.south >= g.south && b.north <= g.north && b.west >= g.west && b.east <= g.east;
  return covers && g.north - g.south <= 2 * (want.north - want.south) && g.east - g.west <= 2 * (want.east - want.west);
}

/** `a ∩ b`, or `a` when they do not overlap. */
export function intersect(a, b) {
  const r = { south: Math.max(a.south, b.south), north: Math.min(a.north, b.north), west: Math.max(a.west, b.west), east: Math.min(a.east, b.east) };
  return r.south < r.north && r.west < r.east ? r : a;
}

/**
 * Grid for the (padded) view from `fetcher` (fetchWindGrid / fetchSolarGrid), refetched only
 * when the view outgrows it or the date changes. Nothing is fetched while `on` is false.
 * @returns {{ grid: object|null, loading: boolean, error: string|null }}
 */
export function useOverlayGrid(fetcher, on, bounds, date) {
  const [grid, setGrid] = useState(null);
  const [state, setState] = useState({ loading: false, error: null });
  const alive = useRef(true);
  const req = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!on || !bounds || gridServes(grid, bounds, date)) return undefined;
    const id = ++req.current;
    const t = setTimeout(async () => {
      setState({ loading: true, error: null });
      const res = await fetcher({ ...padded(bounds), date, n: GRID_N });
      if (!alive.current || id !== req.current) return;
      setState({ loading: false, error: res.ok ? null : res.error });
      if (res.ok && res.grid?.lats?.length > 1) setGrid({ ...res.grid, date });
    }, 600);
    return () => clearTimeout(t);
  }, [fetcher, on, bounds, date, grid]);
  return { grid, loading: on && state.loading, error: on ? state.error : null };
}
