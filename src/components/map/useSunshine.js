// Hourly sunshine (S3, S4): Open-Meteo GHI grid → upsampled glow → BitmapLayer image in the
// overlay store. The frame is redrawn only when the (grid, hour) frame changes; while playing,
// the play clock calls `render(t)` with a fractional hour (~12 fps). No fetch while hidden.
import { useCallback, useEffect, useRef } from 'react';
import { fetchSolarGrid } from '../../services/renewablesClient';
import { sunshinePixels } from '../../services/sunshineRaster';
import { useOverlayGrid } from './overlayGrid';

/**
 * @param {{ on: boolean, bounds: object|null, date: string, hour: number, playing: boolean, hidden: boolean, store: object }} args
 * @returns {{ loading: boolean, error: string|null, render: (t: number) => void }}
 */
export default function useSunshine({ on, bounds, date, hour, playing, hidden, store }) {
  const { grid, loading, error } = useOverlayGrid(fetchSolarGrid, on && !hidden, bounds, date);
  const gridRef = useRef(null); // grid `render` draws from (null while off)
  const frame = useRef(null); // { grid, t } of the frame in the store (grid by identity)

  /** Draw fractional hour `t` of the current grid (no-op without one or for the same frame). */
  const render = useCallback((t) => {
    const g = gridRef.current;
    if (!g) return;
    const tk = t.toFixed(2);
    if (frame.current?.grid === g && frame.current.t === tk) return;
    frame.current = { grid: g, t: tk };
    const { data, width, height } = sunshinePixels(g, t);
    store.patch({
      sun: {
        image: new ImageData(data, width, height),
        bounds: [g.lons[0], g.lats[0], g.lons[g.lons.length - 1], g.lats[g.lats.length - 1]],
      },
    });
  }, [store]);

  // Static frame for the selected hour (the play clock draws while playing).
  useEffect(() => {
    if (!on || !grid?.ghi?.length) {
      gridRef.current = null;
      frame.current = null;
      store.patch({ sun: null });
      return;
    }
    gridRef.current = grid;
    if (!playing) render(hour);
  }, [on, grid, hour, playing, render, store]);

  return { loading, error, render };
}
