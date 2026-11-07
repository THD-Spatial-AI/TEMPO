// Tech-level wind settings (W4/W5): weather year, turbine, hub height and loss.
// Loss is shown in % and stored as a fraction.
import React from 'react';
import { NumberField } from './PvPointsTable';
import { LAST_FULL_YEAR } from './PvSettingsRow';

const YEARS = Array.from({ length: LAST_FULL_YEAR - 2000 + 1 }, (_, i) => LAST_FULL_YEAR - i);
const SELECT_CLS = 'border border-slate-300 bg-white px-1.5 py-0.5 text-xs disabled:bg-slate-100 disabled:text-slate-400';
const pct = (x) => Number((x * 100).toFixed(4));

/** Offline fallback when the service cannot list turbines (W4 presets). */
const GENERIC = [
  { id: 'generic_iec1', label: 'Generic IEC I (high wind)', generic: true },
  { id: 'generic_iec2', label: 'Generic IEC II (medium wind)', generic: true },
  { id: 'generic_iec3', label: 'Generic IEC III (low wind)', generic: true },
  { id: 'generic_offshore', label: 'Generic offshore 15 MW (IEA ref.)', generic: true },
];

const field = (label, control) => (
  <label className="flex flex-col gap-1 text-[11px] text-slate-500">{label}{control}</label>
);

/** `turbines`: list from listTurbines() or null; `turbinesError`: why the list is unavailable. */
export default function WindSettingsRow({ settings, onChange, disabled, turbines, turbinesError }) {
  const list = turbines?.length ? turbines : GENERIC;
  const generic = list.filter(t => t.generic);
  const oedb = list.filter(t => !t.generic);
  // Keep a stored turbine selectable even when the list does not contain it.
  const unknown = list.some(t => t.id === settings.turbine) ? null : settings.turbine;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-4">
        {field('Weather year', (
          <select value={settings.weatherYear} disabled={disabled} className={SELECT_CLS}
            onChange={e => onChange({ weatherYear: Number(e.target.value) })}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        ))}
        {field('Turbine', (
          <select value={settings.turbine} disabled={disabled} className={`${SELECT_CLS} max-w-[240px]`}
            onChange={e => onChange({ turbine: e.target.value })}>
            {unknown && <option value={unknown}>{unknown}</option>}
            <optgroup label="Generic">
              {generic.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </optgroup>
            {oedb.length > 0 && (
              <optgroup label="OEDB library">
                {oedb.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
            )}
          </select>
        ))}
        {field('Hub height m', (
          <NumberField value={settings.hubHeight} min={10} max={250} step={1} disabled={disabled}
            onChange={v => onChange({ hubHeight: v })} />
        ))}
        {field('Loss % (wake + availability)', (
          <NumberField value={pct(settings.loss)} min={0} max={50} step={0.5} disabled={disabled}
            onChange={v => onChange({ loss: v / 100 })} />
        ))}
      </div>
      {turbinesError && (
        <p className="text-[11px] text-slate-500">Generic turbines only: {turbinesError}</p>
      )}
    </div>
  );
}
