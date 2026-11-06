import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting, SETTINGS_EVENT } from '../../services/appSettings';
import { cellScale, staleCells } from '../../services/demandCells';

export function useDemandCellsView(demandCells, locations) {
  const [visible, setVisibleState] = useState(() => getSetting('demandCellsVisible'));
  const [colorBy, setColorByState] = useState(() => getSetting('demandCellsColorBy'));

  useEffect(() => {
    const sync = () => {
      setVisibleState(getSetting('demandCellsVisible'));
      setColorByState(getSetting('demandCellsColorBy'));
    };
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);

  const setVisible = useCallback(v => { setVisibleState(v); setSetting('demandCellsVisible', v); }, []);
  const setColorBy = useCallback(v => { setColorByState(v); setSetting('demandCellsColorBy', v); }, []);

  const stale = useMemo(() => staleCells(demandCells, locations), [demandCells, locations]);
  const drawn = useMemo(
    () => (stale.stale
      ? (demandCells?.features || []).filter(f => stale.liveIds.has(f.properties?.locationId))
      : (demandCells?.features || [])),
    [demandCells, stale],
  );
  const scale = useMemo(() => cellScale(drawn, colorBy), [drawn, colorBy]);

  return { visible, setVisible, colorBy, setColorBy, drawn, scale, stale };
}
