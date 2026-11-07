// Compact controls for the resource overlays (useResourceOverlays): atlas layer,
// country, download, wind flow + date/hour, legend and attribution (V7).
import React, { useId } from 'react';
import { ATTRIBUTION, OVERLAY_LAYERS } from '../profiles/overlayLegend';

const MB = b => (b / 1_048_576).toFixed(0);
const INPUT = 'text-xs border border-slate-300 bg-white px-1 py-0.5';

export default function OverlayControls({
  layer, setLayer, country, setCountry, countries, activeCountry,
  atlas, download, onDownload,
  flow, setFlow, hour, setHour, date, setDate, dateMax, flowLoading, errors, note,
  className = '',
}) {
  const listId = useId();
  const info = OVERLAY_LAYERS[layer];
  const sources = [info?.source, flow ? 'flow' : null].filter(Boolean);
  return (
    <div className={`bg-white border border-slate-200 p-2 space-y-1.5 text-xs text-slate-700 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={layer} onChange={e => setLayer(e.target.value)} className={INPUT} aria-label="Overlay layer">
          <option value="none">No overlay</option>
          {Object.entries(OVERLAY_LAYERS).map(([id, l]) => <option key={id} value={id}>{l.label}</option>)}
        </select>
        {layer !== 'none' && (
          <>
            <input
              list={listId}
              value={country}
              onChange={e => setCountry(e.target.value)}
              placeholder="Country"
              aria-label="Atlas country"
              className={`${INPUT} w-32`}
            />
            <datalist id={listId}>
              {countries.map(c => <option key={c} value={c} />)}
            </datalist>
          </>
        )}
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={flow} onChange={e => setFlow(e.target.checked)} className="accent-black" />
          Wind flow
        </label>
      </div>

      {layer !== 'none' && country && !activeCountry && countries.length > 0 && (
        <p className="text-[11px] text-slate-500">Pick a country from the list.</p>
      )}
      {atlas === 'checking' && <p className="text-[11px] text-slate-500">Checking the atlas…</p>}
      {(atlas === 'missing' || download) && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={!!download}
            className="px-2 py-1 text-xs font-medium bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {download ? 'Downloading…' : `Download ${info?.label || 'atlas'} for ${activeCountry}`}
          </button>
          {download && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              {download.total > 0 ? `${MB(download.done)} / ${MB(download.total)} MB` : `${MB(download.done)} MB`}
            </span>
          )}
        </div>
      )}

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

      {info && atlas === 'ready' && !note && (
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
