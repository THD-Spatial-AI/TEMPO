// A location's demand tech in plain terms: where the demand comes from, how much it is and
// its shape, with rescale and replace. Used on the Locations page and in the Map View dialog.
import { useMemo, useState } from 'react';
import SelectField from '../ui/SelectField';
import { LuChevronDown, LuChevronRight } from '../ui/icons';
import { DEMAND_CARD_KEYS, demandStats, describeDemand, readDemand, replaceDemand, rescaleTo } from '../../services/locationDemand';

const WEEK = 168;
const fmt = (v, digits = 2) => Number(v).toLocaleString('en-US', { maximumFractionDigits: digits });

function Sparkline({ values }) {
  const week = values.slice(0, WEEK);
  // Min to max, so the daily shape shows even when the base load is large.
  const min = Math.min(...week);
  const range = Math.max(...week) - min || 1;
  const points = week.map((v, i) => `${(i / Math.max(week.length - 1, 1)) * 100},${29 - ((v - min) / range) * 28}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-full" aria-label="Demand over the first week">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

const btn = 'h-7 rounded-md border border-black/15 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:text-slate-400';
const input = 'h-7 w-24 rounded-md border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200';

/**
 * onChange(constraints) receives the tech's new constraints; without it the card is read-only.
 * onOpenTimeSeries, when given, links to the Time Series page to upload a new series.
 */
export default function DemandCard({ locationName, techCfg, techDef, timeSeries, unit = 'MW', onChange, onOpenTimeSeries }) {
  const demand = useMemo(() => readDemand(techCfg, techDef, timeSeries, locationName), [techCfg, techDef, timeSeries, locationName]);
  const stats = useMemo(() => demandStats(demand.kind === 'constant' ? [demand.value] : demand.values, unit), [demand, unit]);
  const { title, detail } = describeDemand(demand);
  const [mode, setMode] = useState(null); // 'rescale' | 'replace' | null
  const [target, setTarget] = useState('');
  const [choice, setChoice] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const constraints = techCfg?.constraints || {};

  // Series columns in the model a demand can point at (resource profiles are capacity factors, not demand).
  const columns = useMemo(() => (timeSeries || [])
    .filter((ts) => ts.source !== 'tech-profile')
    .flatMap((ts) => (ts.dataColumns || []).map((c) => ({ file: ts.fileName || ts.name, column: c }))), [timeSeries]);

  const apply = (next) => {
    onChange(next);
    setMode(null);
  };
  const applyRescale = () => {
    const v = Number(target);
    if (v > 0) apply(rescaleTo(constraints, demand, v));
  };
  const applyReplace = () => {
    if (choice === 'constant') {
      const v = Number(target);
      if (v > 0) apply(replaceDemand(constraints, { constant: v }));
    } else if (choice) {
      const [file, column] = choice.split('\u0000');
      apply(replaceDemand(constraints, { file, column }));
    }
  };

  return (
    <div className="rounded-lg border border-black/15 bg-white p-3">
      <div className="text-xs font-semibold text-slate-900">Electricity demand</div>
      <p className="mt-1 text-xs text-slate-700">{title}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
      {demand.scale !== 1 && <p className="text-xs text-slate-500">Rescaled × {fmt(demand.scale, 4)}</p>}
      {(demand.kind === 'pipeline' || demand.kind === 'file') && !demand.found && (
        <p className="mt-1 text-xs font-medium text-black">The series {demand.file} has no column {demand.column} in this model.</p>
      )}

      {stats && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Per year" value={`${fmt(stats.annualGWh)} GWh`} />
            <Stat label="Average" value={`${fmt(stats.avg)} ${unit}`} />
            <Stat label="Peak" value={`${fmt(stats.peak)} ${unit}`} />
          </div>
          {demand.values?.length > 1 && (
            <div className="mt-2 text-slate-700">
              <Sparkline values={demand.values} />
              <div className="text-[10px] text-slate-400">First week</div>
            </div>
          )}
        </>
      )}

      {onChange && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} disabled={!stats} onClick={() => { setMode(mode === 'rescale' ? null : 'rescale'); setTarget(stats ? stats.avg.toFixed(3) : ''); }}>Rescale…</button>
          <button className={btn} onClick={() => { setMode(mode === 'replace' ? null : 'replace'); setChoice(''); setTarget(''); }}>Replace…</button>
        </div>
      )}

      {mode === 'rescale' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>New average</span>
          <input type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className={input} />
          <span>{unit}</span>
          {Number(target) > 0 && <span className="text-slate-400">= {fmt(Number(target) * 8760 / (unit === 'kW' ? 1e6 : 1e3))} GWh/yr</span>}
          <button className={btn} onClick={applyRescale}>Apply</button>
          {demand.kind !== 'constant' && <span className="w-full text-slate-400">Keeps the shape; other locations sharing this column are not changed.</span>}
        </div>
      )}

      {mode === 'replace' && (
        <div className="mt-2 space-y-2 text-xs text-slate-600">
          <SelectField value={choice} onChange={(e) => setChoice(e.target.value)} className="h-7 w-full rounded-md border border-black/15 bg-white px-2 text-xs">
            <option value="">Choose a source…</option>
            <option value="constant">Constant value</option>
            {columns.length > 0 && (
              <optgroup label="Time series in this model">
                {columns.map(({ file, column }) => <option key={`${file}:${column}`} value={`${file}\u0000${column}`}>{file} · {column}</option>)}
              </optgroup>
            )}
          </SelectField>
          <div className="flex flex-wrap items-center gap-2">
            {choice === 'constant' && (
              <>
                <input type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className={input} />
                <span>{unit}</span>
              </>
            )}
            <button className={btn} disabled={!choice} onClick={applyReplace}>Apply</button>
            {onOpenTimeSeries && (
              <button onClick={onOpenTimeSeries} className="font-semibold text-black hover:underline">Upload a new series in Time Series</button>
            )}
          </div>
        </div>
      )}

      <button onClick={() => setAdvanced(!advanced)} className="mt-3 flex items-center gap-1 text-[11px] text-slate-500 hover:text-black">
        {advanced ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />} Advanced
      </button>
      {advanced && (
        <dl className="mt-1 space-y-0.5 pl-4 font-mono text-[11px] text-slate-600">
          {DEMAND_CARD_KEYS.filter((k) => constraints[k] !== undefined).map((k) => (
            <div key={k} className="flex gap-2"><dt className="text-slate-400">{k}</dt><dd className="break-all">{String(constraints[k])}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}
