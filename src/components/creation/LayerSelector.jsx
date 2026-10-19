import React, { useEffect, useRef, useState } from "react";
import { FiLayers, FiCheck } from '../ui/icons';
import { MAP_STYLE_NAMES } from "../../config/mapStyles";
import { tr } from '../../i18n';

// Small CSS-only previews so each style is recognisable at a glance.
const STYLE_PREVIEWS = {
  streets:
    "linear-gradient(135deg, transparent 46%, #f8fafc 46%, #f8fafc 54%, transparent 54%), " +
    "linear-gradient(45deg, transparent 62%, #fde68a 62%, #fde68a 68%, transparent 68%), " +
    "radial-gradient(circle at 25% 30%, #bbf7d0 0 22%, transparent 23%), #e7e5e4",
  satellite:
    "radial-gradient(circle at 30% 35%, #4d7c0f 0 25%, transparent 26%), " +
    "radial-gradient(circle at 70% 70%, #78716c 0 22%, transparent 23%), " +
    "linear-gradient(160deg, #365314, #3f3f46)",
  terrain:
    "repeating-radial-gradient(circle at 60% 60%, transparent 0 6px, rgba(120,113,108,.35) 6px 7px), " +
    "linear-gradient(135deg, #d9f99d, #e7e5e4 60%, #d6d3d1)",
  dark:
    "linear-gradient(135deg, transparent 46%, #475569 46%, #475569 52%, transparent 52%), " +
    "radial-gradient(circle at 25% 30%, #1e293b 0 22%, transparent 23%), #0f172a",
};

const LayerSelector = ({ currentLayer, onLayerChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative self-end">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={tr("Map style: {0}", { 0: MAP_STYLE_NAMES[currentLayer] })}
        aria-label={tr("Map style: {0}", { 0: MAP_STYLE_NAMES[currentLayer] })}
        className={`group w-9 h-9 p-[3px] rounded-xl bg-white/90 backdrop-blur-md shadow-lg shadow-slate-900/10 ring-1 transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
          isOpen ? "ring-slate-900/20" : "ring-slate-900/5"
        }`}
      >
        <span
          className="relative w-full h-full rounded-[9px] overflow-hidden flex items-center justify-center"
          style={{ background: STYLE_PREVIEWS[currentLayer] }}
        >
          <span className="absolute inset-0 bg-slate-900/50 transition-colors group-hover:bg-slate-900/60" />
          <FiLayers size={15} strokeWidth={2.25} className="relative text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={tr("Map style")}
          className="absolute top-full right-0 mt-2 w-56 p-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 z-[10002]"
        >
          <div className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <FiLayers size={11} />
            {tr("Map style")}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(MAP_STYLE_NAMES).map(([key, name]) => {
              const active = currentLayer === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onLayerChange(key);
                    setIsOpen(false);
                  }}
                  className={`group p-1.5 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                    active ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`relative block h-14 rounded-lg ring-1 transition-shadow ${
                      active ? "ring-2 ring-slate-800" : "ring-slate-900/10 group-hover:ring-slate-900/20"
                    }`}
                    style={{ background: STYLE_PREVIEWS[key] }}
                  >
                    {active && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black text-white flex items-center justify-center">
                        <FiCheck size={10} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className={`block mt-1 px-0.5 text-xs ${active ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerSelector;
