import React from 'react';
import { DEMAND_RAMP } from '../../services/demandCells';

const GRADIENT = `linear-gradient(to right, ${DEMAND_RAMP.map(c => `rgb(${c.join(',')})`).join(', ')})`;

export default function DemandCellsLegend({ colorBy, onColorByChange, scale, stale, onRemove, hasDrawn = true }) {
  const unit = colorBy === 'total' ? 'GWh/yr' : 'GWh/km²';
  const label = String(Number(Number(scale).toPrecision(3)));
  const btn = (key, text) => (
    <button
      type="button"
      onClick={() => onColorByChange(key)}
      className={`px-2 py-0.5 text-[10px] transition-colors ${
        colorBy === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
      }`}
    >
      {text}
    </button>
  );
  return (
    <div className="w-52 p-2.5 rounded-xl bg-white/90 backdrop-blur-md shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Demand cells</span>
        {hasDrawn && (
          <span className="inline-flex ring-1 ring-slate-900/10 rounded overflow-hidden">
            {btn('density', 'Density')}
            {btn('total', 'Total')}
          </span>
        )}
      </div>
      {hasDrawn && (
        <>
          <div className="h-2 rounded-sm" style={{ background: GRADIENT }} />
          <div className="flex justify-between mt-1 text-[10px] text-slate-500">
            <span>0</span>
            <span>≥ {label} {unit}</span>
          </div>
        </>
      )}
      {stale?.stale && (
        <div title={stale.missing.join(', ')} className="mt-2 p-2 bg-amber-50 ring-1 ring-amber-200 text-[11px] text-amber-800">
          Demand cells are out of date: {stale.missing.length} substation(s) were removed or lost their demand.
          <button
            type="button"
            onClick={onRemove}
            className="block mt-1.5 px-2 py-0.5 text-[10px] font-semibold bg-amber-600 text-white hover:bg-amber-700"
          >
            Remove cells
          </button>
        </div>
      )}
    </div>
  );
}
