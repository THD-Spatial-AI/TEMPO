// Points table of the PV profile dialog: per-point tilt / azimuth and the
// calculated (or stored) yield, with a status per point.
import React, { useState } from 'react';

const INPUT_CLS = 'border border-slate-300 bg-white px-1.5 py-0.5 text-xs disabled:bg-slate-100 disabled:text-slate-400';

/** Number input that keeps the typed text and commits a clamped value on blur / Enter. */
export function NumberField({ value, min, max, step = 1, disabled, onChange, className = 'w-20', label }) {
  const [text, setText] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    // Keep the typed text ("1.", "0.50") when it already means the new value.
    if (Number(text) !== value || text.trim() === '') setText(String(value));
  }
  const commit = () => {
    const n = Number(text);
    const v = text.trim() === '' || !Number.isFinite(n) ? value : Math.min(max, Math.max(min, n));
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <input
      type="number" min={min} max={max} step={step} value={text} disabled={disabled} aria-label={label}
      onChange={e => {
        const t = e.target.value;
        setText(t);
        const n = Number(t);
        // In-range values apply as typed; out-of-range ones are clamped on blur / Enter.
        if (t.trim() !== '' && Number.isFinite(n) && n >= min && n <= max && n !== value) onChange(n);
      }}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }}
      onClick={e => e.stopPropagation()}
      className={`${INPUT_CLS} ${className}`}
    />
  );
}

/**
 * rows: [{ name, tilt, azimuth, status: 'current'|'stored'|null, stats: {meanCf, annualKwhPerKwp}|null }]
 */
export default function PvPointsTable({ rows, selected, onSelect, onOrient, orientDisabled }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-[11px] text-slate-500 border-b border-slate-200">
          <th className="py-1 pr-2 font-medium">Point</th>
          <th className="py-1 pr-2 font-medium">Tilt °</th>
          <th className="py-1 pr-2 font-medium">Azimuth °</th>
          <th className="py-1 pr-2 font-medium text-right">kWh/kWp</th>
          <th className="py-1 pr-2 font-medium text-right">Mean CF</th>
          <th className="py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr
            key={r.name}
            onClick={() => onSelect(r.name)}
            className={`border-b border-slate-100 cursor-pointer ${r.name === selected ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <td className="py-1 pr-2 truncate max-w-[110px]" title={r.name}>{r.name}</td>
            <td className="py-1 pr-2">
              <NumberField value={r.tilt} min={0} max={90} disabled={orientDisabled} className="w-12" label={`Tilt of ${r.name}`}
                onChange={v => onOrient(r.name, { tilt: v })} />
            </td>
            <td className="py-1 pr-2">
              <NumberField value={r.azimuth} min={0} max={359} disabled={orientDisabled} className="w-14" label={`Azimuth of ${r.name}`}
                onChange={v => onOrient(r.name, { azimuth: v })} />
            </td>
            <td className="py-1 pr-2 text-right tabular-nums">{r.stats?.annualKwhPerKwp != null ? Math.round(r.stats.annualKwhPerKwp) : '—'}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{r.stats?.meanCf != null ? r.stats.meanCf.toFixed(3) : '—'}</td>
            <td className={`py-1 ${r.status === 'current' ? 'text-emerald-700' : 'text-slate-500'}`}>{r.status || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
