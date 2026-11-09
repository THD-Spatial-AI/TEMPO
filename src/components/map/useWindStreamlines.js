// Wind streamlines (S1, S2): Open-Meteo u/v grid → evenly spaced streamlines → TripsLayer
// trips in the overlay store, plus the looping `time` (~30 store updates/s) while visible.
// Nothing is fetched, computed or animated while `on` is false or the document is hidden.
import { useEffect, useMemo, useState } from 'react';
import { fetchWindGrid } from '../../services/renewablesClient';
import { computeStreamlines, toTrips } from '../../services/windStreamlines';
import { extent, intersect, useOverlayGrid } from './overlayGrid';

const FRAME_MS = 33; // ~30 store updates per second
const LOOP_MS = 6000; // one loop period (95th-percentile trip) per 6 s
const r2 = x => Math.round(x * 100) / 100;

/**
 * @param {{ on: boolean, bounds: object|null, date: string, hour: number, hidden: boolean, store: object }} args
 * @returns {{ loading: boolean, error: string|null }}
 */
export default function useWindStreamlines({ on, bounds, date, hour, hidden, store }) {
  const { grid, loading, error } = useOverlayGrid(fetchWindGrid, on && !hidden, bounds, date);
  const [hasLines, setHasLines] = useState(false); // the store holds trips to animate
  if (!on && hasLines) setHasLines(false); // reset while off (state adjusted during render)

  // Streamline box = grid ∩ view, rounded so tiny view jitters do not recompute.
  const cut = on && grid && bounds ? intersect(extent(grid), bounds) : null;
  const boxKey = cut ? [cut.south, cut.north, cut.west, cut.east].map(r2).join(',') : '';
  const box = useMemo(() => {
    if (!boxKey) return null;
    const [south, north, west, east] = boxKey.split(',').map(Number);
    return { south, north, west, east };
  }, [boxKey]);

  // Recompute on (grid, hour, box); a newer run disposes the one in progress. The old
  // lines stay in the store until the new ones are ready.
  useEffect(() => {
    if (!on || !grid || !box || hidden) return undefined;
    let run = null;
    let cancelled = false;
    const t = setTimeout(() => {
      run = computeStreamlines(grid, Math.min(hour, grid.u.length - 1), box);
      run.promise.then((lines) => {
        if (cancelled) return;
        const trips = toTrips(lines);
        store.patch({ trips });
        setHasLines(trips.length > 0);
      });
    }, 150);
    return () => { cancelled = true; clearTimeout(t); run?.dispose(); };
  }, [on, grid, hour, box, hidden, store]);

  useEffect(() => {
    if (!on) store.patch({ trips: null, time: 0 });
  }, [on, store]);

  // Loop `time` over [0, 1) for the TripsLayer; only while there are lines to animate.
  const animate = on && !hidden && hasLines;
  useEffect(() => {
    if (!animate) return undefined;
    let raf = 0;
    let last = -Infinity;
    let t0 = null;
    const step = (t) => {
      if (t0 == null) t0 = t;
      if (t - last >= FRAME_MS) { last = t; store.patch({ time: ((t - t0) / LOOP_MS) % 1 }); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, store]);

  return { loading, error };
}
