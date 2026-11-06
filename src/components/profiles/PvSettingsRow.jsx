// Tech-level PV settings of the PV profile dialog (R4): weather year, tracking,
// losses, DC/AC ratio and temperature coefficient. Losses and the temperature
// coefficient are shown in % and stored as fractions.
import React from 'react';
import { NumberField } from './PvPointsTable';

export const LAST_FULL_YEAR = new Date().getFullYear() - 1;
const YEARS = Array.from({ length: LAST_FULL_YEAR - 2000 + 1 }, (_, i) => LAST_FULL_YEAR - i);
const SELECT_CLS = 'border border-slate-300 bg-white px-1.5 py-0.5 text-xs disabled:bg-slate-100 disabled:text-slate-400';
const pct = (x) => Number((x * 100).toFixed(4));

const field = (label, control) => (
  <label className="flex flex-col gap-1 text-[11px] text-slate-500">{label}{control}</label>
);

export default function PvSettingsRow({ settings, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-4">
      {field('Weather year', (
        <select value={settings.weatherYear} disabled={disabled} className={SELECT_CLS}
          onChange={e => onChange({ weatherYear: Number(e.target.value) })}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      ))}
      {field('Tracking', (
        <select value={settings.tracking} disabled={disabled} className={SELECT_CLS}
          onChange={e => onChange({ tracking: e.target.value })}>
          <option value="fixed">Fixed</option>
          <option value="single_axis">Single-axis</option>
        </select>
      ))}
      {field('System losses % (excl. inverter)', (
        <NumberField value={pct(settings.losses)} min={0} max={50} step={0.5} disabled={disabled}
          onChange={v => onChange({ losses: v / 100 })} />
      ))}
      {field('DC/AC ratio', (
        <NumberField value={settings.dcAc} min={0.5} max={2} step={0.05} disabled={disabled}
          onChange={v => onChange({ dcAc: v })} />
      ))}
      {field('Temp. coefficient %/K', (
        <NumberField value={pct(settings.tempCoeff)} min={-1} max={0} step={0.01} disabled={disabled}
          onChange={v => onChange({ tempCoeff: v / 100 })} />
      ))}
    </div>
  );
}
