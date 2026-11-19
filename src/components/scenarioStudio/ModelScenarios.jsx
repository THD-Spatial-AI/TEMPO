/**
 * Scenario Studio — the model's own scenarios / overrides (imported from Calliope,
 * or carried by a TEMPO-exported engine archive).
 *
 * ModelScenarioList   — side-panel list (nothing selected), with "Add" → Model scenario card.
 * ModelScenarioConfig — config panel of a Model scenario card.
 */

import React, { useState } from 'react';
import { FiPlus, FiChevronDown, FiChevronRight } from '../ui/icons';
import { expandScenario, flattenOverride } from '../../services/modelScenarios.js';
import { isPortableOverrideKey } from '../../services/scenarioResolver.js';
import SelectField from '../ui/SelectField';

const fmt = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

function OverrideKeys({ override }) {
  const entries = Object.entries(flattenOverride(override));
  if (!entries.length) return <p className="px-2 py-1 text-[11px] italic text-slate-400">empty override</p>;
  return (
    <div className="max-h-48 space-y-0.5 overflow-y-auto px-2 py-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
          <span className="min-w-0 flex-1 break-all font-mono text-slate-600">{k} = <span className="text-slate-900">{fmt(v)}</span></span>
          {!isPortableOverrideKey(k) && (
            <span className="shrink-0 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700" title="Applied by Calliope only; skipped on PyPSA / OSeMOSYS / AdOpT-NET0">Calliope</span>
          )}
        </div>
      ))}
    </div>
  );
}

function OverrideRow({ name, override }) {
  const [open, setOpen] = useState(false);
  const n = Object.keys(flattenOverride(override)).length;
  return (
    <div className="rounded-lg border border-black/10 bg-white">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left">
        {open ? <FiChevronDown size={13} /> : <FiChevronRight size={13} />}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800">{name}</span>
        <span className="shrink-0 text-[10px] text-slate-400">{override ? `${n} key${n === 1 ? '' : 's'}` : 'missing'}</span>
      </button>
      {open && override && <div className="border-t border-black/10"><OverrideKeys override={override} /></div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AddRow({ name, detail, onAdd }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-xs text-slate-800">{name}</div>
        <div className="truncate text-[10px] text-slate-500" title={detail}>{detail}</div>
      </div>
      <button onClick={() => onAdd(name)} title="Add as a Model scenario card"
        className="flex shrink-0 items-center gap-1 rounded-md border border-black/15 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
        <FiPlus size={11} /> Add
      </button>
    </div>
  );
}

export function ModelScenarioList({ model, onAdd }) {
  const scenarios = Object.keys(model?.scenarios || {});
  const overrides = model?.overrides || {};
  const overrideNames = Object.keys(overrides).filter(n => !n.startsWith('_studio'));
  if (!scenarios.length && !overrideNames.length) return null;
  return (
    <div className="mt-5 w-full space-y-4 text-left">
      <p className="text-[11px] leading-relaxed text-slate-500">
        Scenarios and overrides that came with this model. Add one as a card, then nest it in a Year or leave it global.
      </p>
      {scenarios.length > 0 && (
        <Section title={`Scenarios (${scenarios.length})`}>
          {scenarios.map(s => <AddRow key={s} name={s} detail={expandScenario(model, s).join(' + ')} onAdd={onAdd} />)}
        </Section>
      )}
      {overrideNames.length > 0 && (
        <Section title={`Overrides (${overrideNames.length})`}>
          {overrideNames.map(o => {
            const n = Object.keys(flattenOverride(overrides[o])).length;
            return <AddRow key={o} name={o} detail={`${n} key${n === 1 ? '' : 's'}`} onAdd={onAdd} />;
          })}
        </Section>
      )}
    </div>
  );
}

export function ModelScenarioConfig({ params, setParam, model }) {
  const scenarios = Object.keys(model?.scenarios || {});
  const overrides = model?.overrides || {};
  const overrideNames = Object.keys(overrides).filter(n => !n.startsWith('_studio'));
  const names = params.name ? expandScenario(model, params.name) : [];

  if (!scenarios.length && !overrideNames.length) {
    return <p className="text-sm italic text-slate-500">This model has no scenarios or overrides.</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Scenario or override</label>
        <SelectField value={params.name || ''} onChange={e => setParam('name', e.target.value)}
          className="w-full rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-electric-400">
          <option value="">— choose —</option>
          {scenarios.length > 0 && (
            <optgroup label="Scenarios">{scenarios.map(n => <option key={`s:${n}`} value={n}>{n}</option>)}</optgroup>
          )}
          {overrideNames.length > 0 && (
            <optgroup label="Overrides">
              {overrideNames.filter(n => !scenarios.includes(n)).map(n => <option key={`o:${n}`} value={n}>{n}</option>)}
            </optgroup>
          )}
        </SelectField>
        <p className="mt-0.5 text-xs text-slate-400">
          Calliope applies it natively, after the other cards. PyPSA / OSeMOSYS / AdOpT-NET0 get the
          technology and location keys; keys tagged Calliope are skipped there.
        </p>
      </div>
      {names.length > 0 && (
        <Section title={`Applies ${names.length} override${names.length === 1 ? '' : 's'}, in order`}>
          {names.map(n => <OverrideRow key={n} name={n} override={overrides[n]} />)}
        </Section>
      )}
    </div>
  );
}
