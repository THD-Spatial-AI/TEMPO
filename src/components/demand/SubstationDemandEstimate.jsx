import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FiLoader } from '../ui/icons';
import SelectField from '../ui/SelectField';
import { getDemandServiceURL, ensureDemandData, estimateDemand } from '../../services/demandServiceClient';
import {
  estimatePayload, applyDemandEdits, scaleEditsToTotal, shapeWithFallback,
} from '../../services/substationDemand';

const FAMILY_CODES = {
  classic: ['h0', 'h0_dyn', 'g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'l0', 'l1', 'l2', 'flat'],
  bdew25: ['h25', 'g25', 'l25', 'flat'],
};

// Labels for the calibration rows of /estimate's chain.countries (demand_estimate._calibrate).
const CHAIN_LABELS = {
  rasterAreaTWh: 'Raster, area (TWh)',
  rasterCountryTWh: 'Raster, country (TWh)',
  nationalTWh: 'National (TWh)',
  nationalYear: 'National year',
  factor: 'Calibration ×',
  areaTWh: 'Area, calibrated (TWh)',
};

const INPUT = 'px-1.5 py-0.5 text-[10px] border border-black/15 rounded-lg bg-white focus:ring-2 focus:ring-electric-400';

const fmt = (v, d = 2) => (Number.isFinite(Number(v)) && v !== null && v !== ''
  ? Number(v).toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

// Integer weights summing to 100 (largest remainder); zero weights are dropped.
function normaliseMix(weights) {
  const entries = Object.entries(weights).map(([c, w]) => [c, Math.max(0, Number(w) || 0)]).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!(total > 0)) return null;
  const parts = entries.map(([c, w]) => { const raw = (w / total) * 100; return { c, n: Math.floor(raw), r: raw - Math.floor(raw) }; });
  let left = 100 - parts.reduce((s, p) => s + p.n, 0);
  [...parts].sort((a, b) => b.r - a.r).forEach(p => { if (left > 0) { p.n += 1; left -= 1; } });
  const out = {};
  parts.forEach(p => { if (p.n > 0) out[p.c] = p.n; });
  return out;
}

const mixLabel = mix => Object.entries(mix || {}).sort((a, b) => b[1] - a[1]).map(([c, w]) => `${c} ${fmt(w, 0)}`).join(' · ') || '—';

// Number input that commits on blur / Enter (re-keyed by its value so external changes show).
function CommitNumber({ value, onCommit, className }) {
  const shown = Number.isFinite(value) ? Number(value.toFixed(3)) : '';
  return (
    <input
      key={String(shown)} type="number" min="0" defaultValue={shown} className={className}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onBlur={e => {
        const v = Number(e.target.value);
        if (e.target.value === '' || !Number.isFinite(v) || v < 0) { e.target.value = shown; return; }
        if (v !== shown) onCommit(v);
      }}
    />
  );
}

function MixEditor({ mix, family, onApply, onCancel }) {
  const [draft, setDraft] = useState(() => ({ ...(mix || {}) }));
  const addable = (FAMILY_CODES[family] || []).filter(c => !(c in draft));
  return (
    <div className="space-y-1 py-1">
      {Object.keys(draft).map(c => (
        <div key={c} className="flex items-center gap-1.5">
          <span className="w-12 text-slate-600">{c}</span>
          <input
            type="number" min="0" value={draft[c]} className={`${INPUT} flex-1`}
            onChange={e => setDraft(d => ({ ...d, [c]: e.target.value }))}
          />
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        {addable.length > 0 && (
          <SelectField
            value="" onChange={e => e.target.value && setDraft(d => ({ ...d, [e.target.value]: 0 }))}
            className={`${INPUT} flex-1`}
          >
            <option value="">+ add code</option>
            {addable.map(c => <option key={c} value={c}>{c}</option>)}
          </SelectField>
        )}
        <button
          type="button" onClick={() => { const m = normaliseMix(draft); if (m) onApply(m); }}
          className="px-2 py-0.5 rounded-md bg-electric-600 text-white hover:bg-electric-700"
        >Apply</button>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:underline">Cancel</button>
      </div>
      <p className="text-[9px] text-slate-400">Weights are normalised to 100; a 0 drops the code.</p>
    </div>
  );
}

/**
 * Study Area "Estimate from data" demand: calls the local demand service
 * (/estimate, then /shape for peaks), shows the calculation chain and an editable
 * per-substation table. Controlled: the persistent state
 * {family, landuse, override, est: {result, inputsKey, family, landuse, override}, edits, peakRatio}
 * lives in the parent as `value`; `onChange` receives an updater (prev => next).
 */
export default function SubstationDemandEstimate({ boundary, inputs, country, value, onChange }) {
  const { family, landuse, override, est, edits, peakRatio } = value;
  const [serviceUrl, setServiceUrl] = useState(undefined); // undefined = checking, null = not running
  const [dataReady, setDataReady] = useState(null);       // null = unknown
  const [download, setDownload] = useState({ active: false, pct: null, error: '' });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'gwh', dir: 'desc' });
  const [mixOpen, setMixOpen] = useState(null);

  const setField = (k, v) => onChange(prev => ({ ...prev, [k]: typeof v === 'function' ? v(prev[k]) : v }));
  const setFamily = v => setField('family', v);
  const setLanduse = v => setField('landuse', v);
  const setOverride = v => setField('override', v);
  const setEdits = v => setField('edits', v);

  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  // Service + raster status, once on mount.
  useEffect(() => {
    getDemandServiceURL().then(async url => {
      if (!aliveRef.current) return;
      setServiceUrl(url);
      if (!url) return;
      try {
        const st = await (await fetch(`${url}/data/status`)).json();
        if (aliveRef.current) setDataReady(st?.state === 'ready');
      } catch { /* unknown; /estimate will tell */ }
    });
  }, []);

  const substations = useMemo(() => inputs?.substations || [], [inputs]);
  const inputsKey = JSON.stringify(substations.map(s => s.id));
  const canEstimate = !!serviceUrl && !!boundary?.features?.length && substations.length > 0 && !running;

  // Lifted state is written even if this component unmounted meanwhile (the
  // parent keeps it); only local UI state is guarded by aliveRef.
  const runEstimate = useCallback(async () => {
    if (!serviceUrl || !boundary?.features?.length || !substations.length) return;
    setRunning(true);
    setError('');
    const res = await estimateDemand(estimatePayload({
      boundary, substations, modelYear: inputs?.modelYear, country, family, landuse, overrideGwh: override,
    }));
    if (aliveRef.current) setRunning(false);
    if (!res || res.error) {
      if (!aliveRef.current) return;
      if (res?.error === 'data not ready') setDataReady(false);
      else setError(res?.error || 'Estimate failed');
      return;
    }
    if (aliveRef.current) { setDataReady(true); setMixOpen(null); }
    const nextEst = { result: res, inputsKey: JSON.stringify(substations.map(s => s.id)), family, landuse, override };
    onChange(prev => ({ ...prev, est: nextEst, edits: {}, peakRatio: {} }));
    // Peak MW (best-effort): peak/avg ratio of each seed's shape over the model window.
    const seeds = (res.substations || []).filter(s => s.seed && s.avg_mw > 0 && s.mix);
    if (!seeds.length || !inputs?.startDate || !inputs?.endDate) return;
    try {
      const shaped = await shapeWithFallback({
        substations: seeds.map(s => ({ id: s.id, avg_mw: s.avg_mw, mix: s.mix })),
        start: inputs.startDate, end: inputs.endDate, resolution: '60min',
        country, family, latitude: res.latitude || 0,
      });
      const ratio = {};
      seeds.forEach(s => { const p = shaped?.peak_mw?.[s.id]; if (p > 0) ratio[s.id] = p / s.avg_mw; });
      // Only attach to the estimate it was computed for.
      onChange(prev => (prev.est === nextEst ? { ...prev, peakRatio: ratio } : prev));
    } catch { /* no peaks */ }
  }, [serviceUrl, boundary, substations, inputs, country, family, landuse, override, onChange]);

  const runRef = useRef(runEstimate);
  useEffect(() => { runRef.current = runEstimate; });

  const handleDownload = useCallback(async () => {
    setDownload({ active: true, pct: null, error: '' });
    const r = await ensureDemandData(st => {
      if (aliveRef.current && st?.total > 0) setDownload(d => ({ ...d, pct: Math.round((st.done / st.total) * 100) }));
    });
    if (!aliveRef.current) return;
    if (r.ok) {
      setDownload({ active: false, pct: null, error: '' });
      setDataReady(true);
      runRef.current();
    } else {
      setDownload({ active: false, pct: null, error: r.error || 'Download failed' });
    }
  }, []);

  const result = est?.result || null;
  const rows = useMemo(() => applyDemandEdits(result, edits), [result, edits]);

  const peakOf = useCallback(r => (!r.mixEdited && peakRatio[r.id] ? peakRatio[r.id] * r.avg_mw : null), [peakRatio]);
  const sortedRows = useMemo(() => {
    const val = r => (sort.key === 'name' ? String(r.name || r.id).toLowerCase()
      : sort.key === 'peak' ? (peakOf(r) ?? -1) : r.annual_gwh);
    const out = [...rows].sort((a, b) => { const x = val(a); const y = val(b); return x < y ? -1 : x > y ? 1 : 0; });
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, peakOf]);
  const toggleSort = key => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const arrow = key => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const optionsStale = !!est && (est.family !== family || est.landuse !== landuse || est.override !== override);
  const selectionStale = !!est && est.inputsKey !== inputsKey;
  const currentTotal = rows.reduce((s, r) => s + r.annual_gwh, 0);
  const anyEdits = Object.keys(edits).length > 0;
  const nonSeeds = (result?.substations || []).filter(s => !s.seed).length;
  const chain = result?.chain || {};

  const setGwh = (id, v) => setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), gwh: v } }));
  const setMix = (id, m) => { setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), mix: m } })); setMixOpen(null); };

  return (
    <div className="space-y-1.5 text-[10px]">
      {serviceUrl === null && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-700">
          Demand estimation is not installed or not running. Install &apos;Demand estimation&apos; in Settings → Setup, or use Population split.
        </p>
      )}
      {serviceUrl && dataReady === false && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 space-y-1">
          <button
            type="button" disabled={download.active} onClick={handleDownload}
            className="w-full px-2 py-1 text-[11px] font-medium rounded-md bg-amber-500 text-white disabled:opacity-60 hover:bg-amber-600"
          >
            {download.active
              ? `Downloading…${download.pct != null ? ` ${download.pct}%` : ''}`
              : 'Download consumption data (~110 MB, once)'}
          </button>
          {download.error && <p className="text-amber-700">{download.error}</p>}
        </div>
      )}

      {/* Options */}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-500 mb-0.5">Profile family</span>
          <SelectField
            value={family} onChange={e => setFamily(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-black/15 rounded-lg bg-white focus:ring-2 focus:ring-electric-400"
          >
            <option value="classic">BDEW 1999</option>
            <option value="bdew25">BDEW 2025</option>
          </SelectField>
        </label>
        <label className="block">
          <span className="block text-[10px] font-medium text-slate-500 mb-0.5">Area total (GWh/yr)</span>
          <input
            type="number" min="0" value={override} placeholder="calibrated"
            onChange={e => setOverride(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-black/15 rounded-lg bg-white focus:ring-2 focus:ring-electric-400"
          />
        </label>
      </div>
      <label className="flex items-center gap-1 text-slate-500">
        <input type="checkbox" checked={landuse} onChange={e => setLanduse(e.target.checked)} className="accent-electric-600" />
        Use OSM land use for the sector mix
      </label>

      <button
        type="button" disabled={!canEstimate} onClick={runEstimate}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-lg bg-electric-600 text-white disabled:opacity-50 hover:bg-electric-700"
      >
        {running && <FiLoader size={12} className="animate-spin" />}
        {running ? 'Estimating… (land use can take a minute)' : est ? 'Re-estimate' : 'Estimate'}
      </button>
      {!boundary?.features?.length && serviceUrl && <p className="text-slate-400">Waiting for the study-area boundary…</p>}
      {!substations.length && serviceUrl && <p className="text-slate-400">No substations in the preview.</p>}
      {error && <p className="text-red-600">{error}</p>}
      {optionsStale && <p className="text-amber-600">Options changed — re-estimate.</p>}
      {selectionStale && <p className="text-amber-600">Substation selection changed — re-estimate.</p>}

      {result && (
        <>
          {/* Calculation chain */}
          <dl className="rounded-md border border-black/15 bg-slate-50 px-2 py-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <dt className="text-slate-500">Raster year</dt><dd className="text-right">{chain.rasterYear ?? '—'}</dd>
            {(chain.countries || []).map(c => (
              <React.Fragment key={c.country}>
                <dt className="col-span-2 font-semibold text-slate-600 pt-0.5">{c.country}</dt>
                {Object.entries(c).filter(([k]) => k !== 'country').map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-slate-500 pl-1.5">{CHAIN_LABELS[k] || k}</dt>
                    <dd className="text-right">{k === 'nationalYear' ? (v ?? '—') : fmt(v, 4)}</dd>
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
            <dt className="text-slate-500">Calibrated (GWh)</dt><dd className="text-right">{fmt(chain.calibratedGWh, 2)}</dd>
            {chain.overrideGWh != null && (<><dt className="text-slate-500">Override (GWh)</dt><dd className="text-right">{fmt(chain.overrideGWh, 2)}</dd></>)}
            <dt className="font-semibold text-slate-700 self-center">Total (GWh)</dt>
            <dd className="text-right">
              <CommitNumber
                value={currentTotal} className={`${INPUT} w-20 text-right`}
                onCommit={v => setEdits(prev => scaleEditsToTotal(result, prev, v))}
              />
            </dd>
            <dt className="text-slate-500">Hemisphere</dt>
            <dd className="text-right">{result.southern ? 'South' : 'North'}{result.tropical ? ' · tropical' : ''}</dd>
          </dl>
          {result.tropical && <p className="text-amber-600">Tropical latitude: BDEW seasonality is a weak approximation.</p>}

          {/* Per-substation table */}
          <div className="max-h-64 overflow-auto rounded-md border border-black/15">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-1 py-0.5 text-left cursor-pointer" onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
                  <th className="px-1 py-0.5 text-right cursor-pointer" onClick={() => toggleSort('gwh')}>GWh/yr{arrow('gwh')}</th>
                  <th className="px-1 py-0.5 text-right">avg MW</th>
                  <th className="px-1 py-0.5 text-right cursor-pointer" title="peak over the model period" onClick={() => toggleSort('peak')}>peak MW{arrow('peak')}</th>
                  <th className="px-1 py-0.5 text-left">mix</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-black/5">
                      <td className="px-1 py-0.5 max-w-[80px] truncate" title={r.name || r.id}>
                        {r.edited && <span className="inline-block w-1.5 h-1.5 mr-1 rounded-full bg-electric-500 align-middle" title="Edited" />}
                        {r.name || r.id}
                      </td>
                      <td className="px-1 py-0.5 text-right">
                        <CommitNumber value={r.annual_gwh} className={`${INPUT} w-14 text-right`} onCommit={v => setGwh(r.id, v)} />
                      </td>
                      <td className="px-1 py-0.5 text-right">{fmt(r.avg_mw, 2)}</td>
                      <td className="px-1 py-0.5 text-right">{fmt(peakOf(r), 2)}</td>
                      <td className="px-1 py-0.5 whitespace-nowrap">
                        <button
                          type="button" onClick={() => setMixOpen(o => (o === r.id ? null : r.id))}
                          className="text-electric-700 hover:underline text-left"
                        >{mixLabel(r.mix)}</button>
                      </td>
                    </tr>
                    {mixOpen === r.id && (
                      <tr>
                        <td colSpan={5} className="px-1 bg-slate-50">
                          <MixEditor mix={r.mix} family={est.family} onApply={m => setMix(r.id, m)} onCancel={() => setMixOpen(null)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 text-slate-400">
            <span>{rows.length} with demand · {nonSeeds} substations without demand (transmission/other)</span>
            {anyEdits && <button type="button" onClick={() => setEdits({})} className="text-electric-600 hover:underline flex-shrink-0">Reset edits</button>}
          </div>

          {(result.warnings || []).length > 0 && (
            <ul className="space-y-0.5 text-amber-600">
              {result.warnings.map((w, i) => <li key={i}>{w.code}: {w.message}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
