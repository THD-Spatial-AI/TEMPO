// Points table of the wind profile dialog: per-point weather site (W6), the
// calculated (or stored) mean CF and hub-height speed, and a status per point.
import React from 'react';
import { NumberField } from './PvPointsTable';

/**
 * rows: [{ name, siteLat, siteLon, pinned, status: 'current'|'stored'|null, stats: {meanCf, meanSpeedHub}|null }]
 */
export default function WindPointsTable({ rows, selected, onSelect, onSite, onReset, disabled }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-[11px] text-slate-500 border-b border-slate-200">
          <th className="py-1 pr-2 font-medium">Point</th>
          <th className="py-1 pr-2 font-medium">Site lat</th>
          <th className="py-1 pr-2 font-medium">Site lon</th>
          <th className="py-1 pr-2 font-medium" aria-label="Reset site" />
          <th className="py-1 pr-2 font-medium text-right">Mean CF</th>
          <th className="py-1 pr-2 font-medium text-right">m/s</th>
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
            <td className="py-1 pr-2 truncate max-w-[90px]" title={r.name}>{r.name}</td>
            <td className="py-1 pr-2">
              <NumberField value={r.siteLat} min={-90} max={90} step={0.01} disabled={disabled} className="w-16" label={`Site latitude of ${r.name}`}
                onChange={v => onSite(r.name, { lat: v })} />
            </td>
            <td className="py-1 pr-2">
              <NumberField value={r.siteLon} min={-180} max={180} step={0.01} disabled={disabled} className="w-16" label={`Site longitude of ${r.name}`}
                onChange={v => onSite(r.name, { lon: v })} />
            </td>
            <td className="py-1 pr-2">
              {r.pinned && (
                <button type="button" disabled={disabled} title="Use the location's coordinates"
                  onClick={e => { e.stopPropagation(); onReset(r.name); }}
                  className="text-[11px] underline text-slate-600 hover:text-black disabled:text-slate-300 disabled:no-underline">
                  reset
                </button>
              )}
            </td>
            <td className="py-1 pr-2 text-right tabular-nums">{r.stats?.meanCf != null ? r.stats.meanCf.toFixed(3) : '—'}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{r.stats?.meanSpeedHub != null ? r.stats.meanSpeedHub.toFixed(1) : '—'}</td>
            <td className={`py-1 ${r.status === 'current' ? 'text-emerald-700' : 'text-slate-500'}`}>{r.status || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
