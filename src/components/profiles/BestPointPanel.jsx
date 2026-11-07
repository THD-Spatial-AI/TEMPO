// "Suggest best point" for the wind dialog (W7): moves each point's weather site
// to the windiest ERA5 cell within a radius of its location.
import React, { useState } from 'react';

const RADII = [25, 50, 100];

export default function BestPointPanel({ disabled, disabledReason, onSuggest }) {
  const [radius, setRadius] = useState(25);
  return (
    <div className="border border-slate-200 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={radius}
          onChange={e => setRadius(Number(e.target.value))}
          disabled={disabled}
          className="text-xs border border-slate-300 px-1 py-1"
          aria-label="Search radius"
        >
          {RADII.map(r => <option key={r} value={r}>{r} km</option>)}
        </select>
        <button
          type="button"
          onClick={() => onSuggest(radius)}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className="flex-1 px-2 py-1 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Suggest best point
        </button>
      </div>
      {disabled && disabledReason && <p className="text-[11px] text-slate-500">{disabledReason}</p>}
      <p className="text-[11px] text-slate-500">ERA5 is a ~28 km grid: this picks the windiest grid cell, not a micro-site.</p>
      <p className="text-[11px] text-slate-500">First run fetches up to ~60 weather cells per point at 100 km (minutes); later runs use the cache.</p>
    </div>
  );
}
