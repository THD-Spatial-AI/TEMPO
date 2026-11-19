/**
 * The model's run window: presets, start / end pickers and a duration line.
 * Shared by the Run page and Scenario Studio; both save it to the model
 * (DataContext.setModelTimeWindow), see utils/modelTimeWindow.js.
 */

import React from 'react';
import DatePicker from '../ui/DatePicker';
import { windowDays, fmtDate } from '../../utils/modelTimeWindow';

const TIME_PRESETS = [
  { label: '1 Day',   days: 0 },
  { label: '1 Week',  days: 6 },
  { label: '1 Month', months: 1 },
  { label: '1 Year',  years: 1 },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetEnd(startStr, preset) {
  const s = new Date(startStr + 'T00:00:00');
  if (isNaN(s)) return null;
  const e = new Date(s);
  if (preset.days != null) e.setDate(e.getDate() + preset.days);
  if (preset.months)       e.setMonth(e.getMonth() + preset.months, e.getDate() - 1);
  if (preset.years)        e.setFullYear(e.getFullYear() + preset.years, e.getMonth(), e.getDate() - 1);
  return iso(e);
}

const SOURCE_NOTE = {
  import: 'From the imported model (subset_time).',
  parameters: 'From the subset_time parameters.',
  data: 'Covers all of the model\'s time series.',
  default: 'The model has no dates or time series yet.',
};

/**
 * @param {{ startDate:string, endDate:string, source?:string,
 *           onChange:(w:{startDate:string,endDate:string})=>void }} props
 */
export default function TimeWindowFields({ startDate, endDate, source, onChange }) {
  const days = windowDays(startDate, endDate);
  return (
    <div>
      <div className="mb-4 inline-flex gap-1 rounded-lg bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50">
        {TIME_PRESETS.map(preset => {
          const active = presetEnd(startDate, preset) === endDate;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                // Fall back to today if startDate is invalid so the preset can't produce an Invalid Date.
                const s = isNaN(new Date(startDate + 'T00:00:00')) ? new Date().toISOString().slice(0, 10) : startDate;
                onChange({ startDate: s, endDate: presetEnd(s, preset) });
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                active ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">Start date</label>
          <DatePicker
            value={startDate}
            onChange={v => {
              if (!endDate || v <= endDate) { onChange({ startDate: v, endDate }); return; }
              // Moving the start past the end keeps the window length.
              const end = new Date(v + 'T00:00:00');
              end.setDate(end.getDate() + Math.max(0, days - 1));
              onChange({ startDate: v, endDate: iso(end) });
            }}
            rangeStart={startDate}
            rangeEnd={endDate}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">End date</label>
          <DatePicker
            value={endDate}
            min={startDate}
            onChange={v => onChange({ startDate, endDate: v })}
            rangeStart={startDate}
            rangeEnd={endDate}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <span><span className="font-semibold text-slate-800">{days} days</span> · ≈ {Math.ceil(days / 7)} weeks · ≈ {Math.ceil(days / 30)} months</span>
        <span>{fmtDate(startDate)} → {fmtDate(endDate)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Saved with the model and used by every run, the Scenario Studio and exports.
        {source && source !== 'saved' && SOURCE_NOTE[source] ? ` ${SOURCE_NOTE[source]}` : ''}
      </p>
    </div>
  );
}
