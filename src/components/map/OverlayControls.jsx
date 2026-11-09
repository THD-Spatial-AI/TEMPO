// Compact controls for the resource overlays (useResourceOverlays): atlas layer
// (countries in view are picked by the service), wind flow + date/hour, legend and attribution (V7).
import React from 'react';
import { ATTRIBUTION, OVERLAY_LAYERS } from '../profiles/overlayLegend';

const INPUT = 'text-xs border border-slate-300 bg-white px-1 py-0.5';

export default function OverlayControls({
  layer, setLayer, atlasLoading, countries, legend,
  flow, setFlow, hour, setHour, date, setDate, dateMax, flowLoading, errors, note,
  className = '',
}) {
  const info = OVERLAY_LAYERS[layer];
  const sources = [info?.source, flow ? 'flow' : null].filter(Boolean);
  return (
    <div className={`bg-white border border-slate-200 p-2 space-y-1.5 text-xs text-slate-700 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={layer} onChange={e => setLayer(e.target.value)} className={INPUT} aria-label="Overlay layer">
          <option value="none">No overlay</option>
          {Object.entries(OVERLAY_LAYERS).map(([id, l]) => <option key={id} value={id}>{l.label}</option>)}
        </select>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={flow} onChange={e => setFlow(e.target.checked)} className="accent-black" />
          Wind flow
        </label>
      </div>

      {atlasLoading && <p className="text-[11px] text-slate-500">Loading {layer === 'wind100' ? 'wind' : 'solar'} atlas…</p>}
      {countries.length > 0 && <p className="text-[11px] text-slate-500">Countries: {countries.join(', ')}</p>}

      {flow && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={date}
            max={dateMax}
            onChange={e => e.target.value && setDate(e.target.value)}
            aria-label="Wind flow date"
            className={INPUT}
          />
          <input
            type="range" min={0} max={23} step={1} value={hour}
            onChange={e => setHour(Number(e.target.value))}
            aria-label="Wind flow hour"
            className="w-24 accent-black"
          />
          <span className="text-[11px] tabular-nums">{String(hour).padStart(2, '0')}:00 UTC</span>
          {flowLoading && <span className="text-[11px] text-slate-500">Loading wind…</span>}
        </div>
      )}

      {info && legend && (
        <div>
          <div className="h-2 border border-slate-200" style={{ background: `linear-gradient(to right, ${info.stops.join(', ')})` }} />
          <div className="flex justify-between text-[10px] text-slate-500 tabular-nums">
            <span>{info.min}</span>
            <span>{info.unit}</span>
            <span>{info.max}</span>
          </div>
        </div>
      )}

      {note && <p className="text-[11px] text-slate-500">{note}</p>}
      {errors.map((e, i) => <p key={i} className="text-[11px] text-amber-700">{e}</p>)}
      {sources.map(s => <p key={s} className="text-[10px] text-slate-400 leading-tight">{ATTRIBUTION[s]}</p>)}
    </div>
  );
}
