import React from "react";
import { FiPlus, FiMinus, FiMaximize } from '../ui/icons';

const ControlButton = ({ onClick, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className="group w-9 h-9 flex items-center justify-center text-slate-600 transition-colors hover:bg-slate-900/5 hover:text-slate-900 active:bg-slate-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
  >
    {children}
  </button>
);

const MapZoomControls = ({ onZoomIn, onZoomOut, onFitBounds }) => {
  return (
    <div className="self-end flex flex-col gap-2">
      {/* Zoom */}
      <div className="flex flex-col overflow-hidden rounded-xl bg-white/90 backdrop-blur-md shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 divide-y divide-black/15/80">
        <ControlButton onClick={onZoomIn} label="Zoom in">
          <FiPlus size={17} strokeWidth={2.25} />
        </ControlButton>
        <ControlButton onClick={onZoomOut} label="Zoom out">
          <FiMinus size={17} strokeWidth={2.25} />
        </ControlButton>
      </div>

      {/* Fit to data */}
      <div className="overflow-hidden rounded-xl bg-white/90 backdrop-blur-md shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
        <ControlButton onClick={onFitBounds} label="Fit all locations">
          <FiMaximize size={15} strokeWidth={2.25} />
        </ControlButton>
      </div>
    </div>
  );
};

export default MapZoomControls;
