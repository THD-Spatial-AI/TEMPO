/**
 * Scenario Studio — the model's own scenarios / overrides (imported from Calliope,
 * or carried by a TEMPO-exported engine archive). Edits are saved to the model
 * (DataContext.setModelOverrides), so the Run page and Export see the same values.
 *
 * ModelScenarioList   — side-panel list (nothing selected): Add → card, New override.
 * ModelScenarioConfig — config panel of a Model scenario card: edit the override's
 *                       settings, or a scenario's override list.
 */

import React, { useState } from 'react';
import { FiPlus, FiChevronDown, FiChevronRight, FiTrash2, FiArrowUp, FiArrowDown, FiCopy } from '../ui/icons';
import { expandScenario, flattenOverride, overrideNameError } from '../../services/modelScenarios.js';
import { useData } from '../../context/DataContext';
import SelectField from '../ui/SelectField';
import { OverrideSettings } from './OverrideBuilder.jsx';

const inputCls = 'h-7 w-full rounded-md border border-black/15 bg-white px-2 font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200';
const smallBtn = 'grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30';

const ownOverrides = (model) => Object.keys(model?.overrides || {}).filter(n => !n.startsWith('_studio'));
const scenarioList = (model, name) => {
  const def = model?.scenarios?.[name];
  return Array.isArray(def) ? def.map(String) : String(def || '').split(',').map(s => s.trim()).filter(Boolean);
};

function OverrideRow({ name, override, onChange, model, series, defaultOpen = false, actions = null }) {
  const [open, setOpen] = useState(defaultOpen);
  const n = Object.keys(flattenOverride(override)).length;
  return (
    <div className="rounded-lg border border-black/10 bg-white">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button onClick={() => setOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {open ? <FiChevronDown size={13} /> : <FiChevronRight size={13} />}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800">{name}</span>
          <span className="shrink-0 text-[10px] text-slate-400">{override ? `${n} setting${n === 1 ? '' : 's'}` : 'missing'}</span>
        </button>
        {actions}
      </div>
      {open && override && (
        <div className="border-t border-black/10"><OverrideSettings override={override} onChange={onChange} model={model} series={series} /></div>
      )}
    </div>
  );
}

/** Inline "name + Create" form; `onCreate(name)` runs when the name is valid. */
function NameForm({ model, label, placeholder, onCreate, onCancel }) {
  const [name, setName] = useState('');
  const error = name ? overrideNameError(name, model) : null;
  const submit = () => { if (!overrideNameError(name, model)) onCreate(name.trim()); };
  return (
    <div className="rounded-lg border border-black/15 bg-slate-50 p-2">
      <div className="flex items-center gap-1">
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={placeholder}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} className={inputCls} />
        <button onClick={submit} disabled={!name || !!error}
          className="h-7 shrink-0 rounded-md bg-black px-2 text-[11px] font-medium text-white disabled:opacity-40">{label}</button>
        <button onClick={onCancel} className="h-7 shrink-0 rounded-md px-2 text-[11px] text-slate-500 hover:bg-slate-100">Cancel</button>
      </div>
      {error && <p className="mt-1 text-[10px] text-amber-700">{error}</p>}
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
      <button onClick={() => onAdd(name)} title="Add as a Model scenario card (then edit it)"
        className="flex shrink-0 items-center gap-1 rounded-md border border-black/15 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
        <FiPlus size={11} /> Add
      </button>
    </div>
  );
}

export function ModelScenarioList({ model, onAdd }) {
  const { setModelOverrides } = useData();
  const [creating, setCreating] = useState(false);
  if (!model) return null;
  const scenarios = Object.keys(model.scenarios || {});
  const overrides = model.overrides || {};
  const overrideNames = ownOverrides(model);
  const create = (name) => {
    setModelOverrides(model.id, { overrides: { ...overrides, [name]: {} } });
    setCreating(false);
    onAdd(name);
  };
  return (
    <div className="mt-5 w-full space-y-4 text-left">
      <p className="text-[11px] leading-relaxed text-slate-500">
        The model&apos;s own scenarios and overrides. Add one as a card to edit it, then nest it in a Year or leave it global.
        Edits are saved to the model.
      </p>
      {scenarios.length > 0 && (
        <Section title={`Scenarios (${scenarios.length})`}>
          {scenarios.map(s => <AddRow key={s} name={s} detail={expandScenario(model, s).join(' + ')} onAdd={onAdd} />)}
        </Section>
      )}
      <Section title={`Overrides (${overrideNames.length})`}>
        {overrideNames.map(o => {
          const n = Object.keys(flattenOverride(overrides[o])).length;
          return <AddRow key={o} name={o} detail={`${n} setting${n === 1 ? '' : 's'}`} onAdd={onAdd} />;
        })}
        {creating
          ? <NameForm model={model} label="Create" placeholder="new_override" onCreate={create} onCancel={() => setCreating(false)} />
          : (
            <button onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-black/20 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
              <FiPlus size={11} /> New override
            </button>
          )}
      </Section>
    </div>
  );
}

export function ModelScenarioConfig({ params, setParam, model }) {
  const { setModelOverrides, timeSeries } = useData();
  // The loaded model's series live in context; any other model carries its own.
  const loadedSeries = (timeSeries || []).filter(ts => ts.modelId === model?.id);
  const series = loadedSeries.length ? loadedSeries : (model?.timeSeries || []);
  const [duplicating, setDuplicating] = useState(false);
  const [toAdd, setToAdd] = useState('');
  const scenarios = Object.keys(model?.scenarios || {});
  const overrides = model?.overrides || {};
  const overrideNames = ownOverrides(model);
  const name = params.name || '';
  const isScenario = name in (model?.scenarios || {});
  const isOverride = !isScenario && name in overrides;

  const saveOverride = (ovName, next) => setModelOverrides(model.id, { overrides: { ...overrides, [ovName]: next } });
  const saveScenario = (list) => setModelOverrides(model.id, { scenarios: { ...(model.scenarios || {}), [name]: list } });
  const duplicate = (copy) => {
    if (isScenario) setModelOverrides(model.id, { scenarios: { ...(model.scenarios || {}), [copy]: [...scenarioList(model, name)] } });
    else setModelOverrides(model.id, { overrides: { ...overrides, [copy]: JSON.parse(JSON.stringify(overrides[name] || {})) } });
    setDuplicating(false);
    setParam('name', copy);
  };

  if (!model) return null;
  if (!scenarios.length && !overrideNames.length) {
    return <p className="text-sm italic text-slate-500">This model has no scenarios or overrides yet — create one from the side panel (close this card).</p>;
  }

  const list = isScenario ? scenarioList(model, name) : [];
  const move = (i, d) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; saveScenario(l); };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Scenario or override</label>
        <SelectField value={name} onChange={e => setParam('name', e.target.value)}
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
          Edits are saved to the model (the Run page and Export use them too). Calliope applies it natively,
          after the other cards; PyPSA / OSeMOSYS / AdOpT-NET0 skip settings tagged Calliope.
        </p>
      </div>

      {(isScenario || isOverride) && (
        duplicating
          ? <NameForm model={model} label="Duplicate" placeholder={`${name}_copy`} onCreate={duplicate} onCancel={() => setDuplicating(false)} />
          : (
            <button onClick={() => setDuplicating(true)}
              className="flex items-center gap-1 rounded-md border border-black/15 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
              <FiCopy size={11} /> Duplicate as…
            </button>
          )
      )}

      {isOverride && (
        <Section title="Settings">
          <OverrideRow key={name} name={name} override={overrides[name]} onChange={next => saveOverride(name, next)}
            model={model} series={series} defaultOpen />
        </Section>
      )}

      {isScenario && (
        <Section title={`Applies ${list.length} override${list.length === 1 ? '' : 's'}, in order`}>
          {list.map((ov, i) => (
            <OverrideRow key={`${ov}-${i}`} name={ov} override={overrides[ov]} onChange={next => saveOverride(ov, next)}
              model={model} series={series}
              actions={(
                <>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={smallBtn} title="Apply earlier"><FiArrowUp size={12} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className={smallBtn} title="Apply later"><FiArrowDown size={12} /></button>
                  <button onClick={() => saveScenario(list.filter((_, j) => j !== i))} className={smallBtn} title="Remove from this scenario"><FiTrash2 size={12} /></button>
                </>
              )} />
          ))}
          <div className="flex items-center gap-1">
            <SelectField value={toAdd} onChange={e => setToAdd(e.target.value)}
              className="h-8 flex-1 rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none">
              <option value="">— add an override —</option>
              {overrideNames.filter(o => !list.includes(o)).map(o => <option key={o} value={o}>{o}</option>)}
            </SelectField>
            <button onClick={() => { if (toAdd) { saveScenario([...list, toAdd]); setToAdd(''); } }} disabled={!toAdd}
              className="flex h-8 items-center gap-1 rounded-lg border border-black/15 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              <FiPlus size={11} /> Add
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
