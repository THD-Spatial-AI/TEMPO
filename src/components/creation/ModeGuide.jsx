// Info button + floating panel with animated explanations of the drawing modes.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiInfo, FiX } from '../ui/icons';
import ModeShowcase from './ModeShowcase';
import { tr } from '../../i18n';

const PANEL_W = 340;

export default function ModeGuide() {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const open = pos != null;

  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.min(r.right + 16, window.innerWidth - PANEL_W - 16);
    setPos({ left, top: Math.max(16, Math.min(r.top - 40, window.innerHeight - 470)) });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setPos(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={tr("What do these modes do?")}
        data-tour="mode-guide"
        title={tr("What do these modes do?")}
        className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${open ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
      >
        <FiInfo size={15} />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={tr("Drawing modes")}
          className="tempo-tour-card fixed z-[1200] border border-black/15 bg-white shadow-2xl shadow-slate-900/15"
          style={{ left: pos.left, top: pos.top, width: PANEL_W }}
        >
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-2.5">
            <div>
              <div className="text-sm font-semibold text-slate-900">{tr("How a model is drawn")}</div>
              <div className="text-[11px] text-slate-500">{tr("Locations, links and polylines")}</div>
            </div>
            <button onClick={() => setPos(null)} aria-label={tr("Close")} className="grid h-7 w-7 place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <FiX size={15} />
            </button>
          </div>
          <div className="p-4">
            <ModeShowcase />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
