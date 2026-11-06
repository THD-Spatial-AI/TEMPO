// Bulk "optimise tilt & azimuth" for the PV dialog (D6): maximise plane-of-array
// energy per point over a period; summer / winter follow each point's hemisphere.
import React, { useState } from 'react';

const PERIODS = [['year', 'Whole year'], ['summer', 'Summer'], ['winter', 'Winter'], ['custom', 'Custom months']];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default function OptimisePanel({ disabled, disabledReason, onOptimise }) {
  const [period, setPeriod] = useState('year');
  const [months, setMonths] = useState([]);
  const toggle = (m) => setMonths(ms => (ms.includes(m) ? ms.filter(x => x !== m) : [...ms, m].sort((a, b) => a - b)));
  const ready = !disabled && (period !== 'custom' || months.length > 0);
  return (
    <div className="border border-slate-200 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          disabled={disabled}
          className="text-xs border border-slate-300 px-1 py-1"
          aria-label="Optimisation period"
        >
          {PERIODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => onOptimise(period, period === 'custom' ? months : [])}
          disabled={!ready}
          title={disabled ? disabledReason : undefined}
          className="flex-1 px-2 py-1 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Optimise tilt &amp; azimuth
        </button>
      </div>
      {period === 'custom' && (
        <div className="flex gap-0.5">
          {MONTHS.map((l, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i + 1)}
              disabled={disabled}
              aria-pressed={months.includes(i + 1)}
              title={new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
              className={`w-6 py-0.5 text-[11px] border disabled:opacity-50 disabled:cursor-not-allowed ${months.includes(i + 1) ? 'bg-black text-white border-black' : 'bg-white text-slate-700 border-slate-300'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {disabled && disabledReason && <p className="text-[11px] text-slate-500">{disabledReason}</p>}
      {!disabled && period === 'custom' && months.length === 0 && (
        <p className="text-[11px] text-slate-500">Pick at least one month</p>
      )}
      {(period === 'summer' || period === 'winter') && (
        <p className="text-[11px] text-slate-500">Summer and winter follow each point&apos;s hemisphere.</p>
      )}
    </div>
  );
}
