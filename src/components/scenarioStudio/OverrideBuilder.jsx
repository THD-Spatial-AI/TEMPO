/**
 * Guided editor for one override's settings (Scenario Studio → Model scenario card).
 *
 * OverrideSettings — settings grouped by target (tech, tech at a location, location, link,
 * time window, …), each with an editor that fits the parameter (number + unit, on/off, calendar,
 * time-series file + column, list), the model's own value, and checks; plus "Add change":
 * What → Which → Parameter → Value. Meaning and checks live in services/overrideSchema.js.
 */

import React, { useState } from 'react';
import { FiPlus, FiTrash2, FiAlertTriangle } from '../ui/icons';
import SelectField from '../ui/SelectField';
import DatePicker from '../ui/DatePicker';
import {
  flattenOverride, setOverrideKey, removeOverrideKey, parseOverrideValue, formatOverrideValue,
} from '../../services/modelScenarios.js';
import {
  RESOLUTIONS, settingKey, paramKind, enumOptions, unitLabel, paramLabel, paramDescription,
  paramsForTarget, modelValue, groupSettings, checkSetting, techsAtLocation, modelLinks,
} from '../../services/overrideSchema.js';
import { modelTimeWindow } from '../../utils/modelTimeWindow.js';
import { modelPowerUnit } from '../../utils/modelUnits.js';

const inputCls = 'h-7 w-full rounded-md border border-black/15 bg-white px-2 font-mono text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200';
const selectCls = 'h-7 w-full rounded-md border border-black/15 bg-white px-2 text-[11px] focus:outline-none';
const RESOLUTION_KEYS = ['model.time.function_options.resolution', 'model.time.function'];

const showValue = (v, unit) => {
  if (v === undefined) return '—';
  if (Array.isArray(v) && v.length === 2) return `${String(v[0]).slice(0, 10)} → ${String(v[1]).slice(0, 10)}`;
  return `${formatOverrideValue(v)}${unit && typeof v === 'number' ? ` ${unit}` : ''}`;
};

/** Text input that commits on Enter / blur (numbers, 'inf', text). */
function TextValue({ value, onCommit, unit, placeholder }) {
  const [text, setText] = useState(value === undefined ? '' : formatOverrideValue(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setText(value === undefined ? '' : formatOverrideValue(value)); }
  const commit = () => { if (text !== (value === undefined ? '' : formatOverrideValue(value))) onCommit(parseOverrideValue(text)); };
  return (
    <div className="flex items-center gap-1">
      <input value={text} placeholder={placeholder} onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }} className={inputCls} />
      {unit && <span className="shrink-0 text-[10px] text-slate-500">{unit}</span>}
    </div>
  );
}

function Toggle({ value, onCommit }) {
  const on = value !== false;
  return (
    <button type="button" onClick={() => onCommit(!on)} aria-pressed={on}
      className={`h-7 rounded-md px-3 text-[11px] font-semibold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
      {on ? 'On' : 'Off'}
    </button>
  );
}

/** A number, or file=<series>[:<column>] picked from the model's time series. */
function ResourceValue({ value, onCommit, unit, series }) {
  const isFile = typeof value === 'string' && value.startsWith('file=');
  const [file, column = ''] = isFile ? value.slice(5).split(':') : ['', ''];
  const files = series.map(s => s.fileName || s.name).filter(Boolean);
  const cols = (series.find(s => (s.fileName || s.name) === file)?.dataColumns) || [];
  const setFile = (f, c) => onCommit(`file=${f}${c ? `:${c}` : ''}`);
  return (
    <div className="space-y-1">
      <div className="inline-flex gap-0.5 rounded-md bg-slate-100 p-0.5">
        {[['number', 'Number'], ['file', 'Time series']].map(([id, label]) => (
          <button key={id} type="button"
            onClick={() => (id === 'file' ? (!isFile && files[0] && setFile(files[0])) : (isFile && onCommit(0)))}
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${(id === 'file') === isFile ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>
      {isFile ? (
        <div className="grid grid-cols-2 gap-1">
          <SelectField value={file} onChange={e => setFile(e.target.value, '')} className={selectCls}>
            {!files.includes(file) && <option value={file}>{file} (not in model)</option>}
            {files.map(f => <option key={f} value={f}>{f}</option>)}
          </SelectField>
          <SelectField value={column} onChange={e => setFile(file, e.target.value)} className={selectCls}>
            <option value="">column = location</option>
            {column && !cols.includes(column) && <option value={column}>{column} (not in file)</option>}
            {cols.map(c => <option key={c} value={c}>{c}</option>)}
          </SelectField>
        </div>
      ) : <TextValue value={value} onCommit={onCommit} unit={unit} />}
    </div>
  );
}

/** The editor that fits a parameter kind. */
export function SettingValueEditor({ kind, param, section, value, onCommit, unit, series }) {
  if (kind === 'bool') return <Toggle value={value} onCommit={onCommit} />;
  if (kind === 'enum') {
    const opts = enumOptions(param, section);
    return (
      <SelectField value={value ?? ''} onChange={e => onCommit(e.target.value)} className={selectCls}>
        {value != null && !opts.includes(value) && <option value={value}>{String(value)}</option>}
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </SelectField>
    );
  }
  if (kind === 'resolution') {
    return (
      <SelectField value={value ?? ''} onChange={e => onCommit(e.target.value)} className={selectCls}>
        {value && !RESOLUTIONS.includes(value) && <option value={value}>{value}</option>}
        {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
      </SelectField>
    );
  }
  if (kind === 'dateRange') {
    const [s = '', e = ''] = Array.isArray(value) ? value.map(v => String(v).slice(0, 10)) : [];
    return (
      <div className="grid grid-cols-2 gap-1">
        <DatePicker value={s} onChange={v => onCommit([v, e && e >= v ? e : v])} rangeStart={s} rangeEnd={e} />
        <DatePicker value={e} min={s} onChange={v => onCommit([s || v, v])} rangeStart={s} rangeEnd={e} />
      </div>
    );
  }
  if (kind === 'resource') return <ResourceValue value={value} onCommit={onCommit} unit={unit} series={series} />;
  return <TextValue value={value} onCommit={onCommit} unit={unit} placeholder={kind === 'any' ? 'value' : 'number or inf'} />;
}

function Warnings({ items }) {
  if (!items.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {items.map(w => (
        <p key={w.code} className="flex items-start gap-1 text-[10px] leading-snug text-amber-700">
          <FiAlertTriangle size={10} className="mt-0.5 shrink-0" /> {w.message}
        </p>
      ))}
    </div>
  );
}

// ── Add change ────────────────────────────────────────────────────────────────

const WHAT = [
  ['tech', 'Technology'], ['locTech', 'Tech at location'], ['loc', 'Location'], ['link', 'Link'],
  ['time', 'Time window'], ['resolution', 'Resolution'], ['run', 'Run settings'], ['advanced', 'Advanced'],
];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function defaultValue(model, target, p) {
  const base = modelValue(model, target, p.section, p.param, p.costClass);
  if (base !== undefined) return base;
  if (p.kind === 'bool') return p.section === 'exists' ? false : true;
  if (p.kind === 'resolution') return '3H';
  if (p.kind === 'dateRange') { const w = modelTimeWindow(model); return [w.startDate, w.endDate]; }
  if (p.kind === 'enum') return enumOptions(p.param, p.section)[0];
  return undefined;
}

function AddChange({ model, override, series, unit, onAdd }) {
  const [what, setWhat] = useState('tech');
  const [tech, setTech] = useState('');
  const [loc, setLoc] = useState('');
  const [link, setLink] = useState('');
  const [paramId, setParamId] = useState('');
  const [value, setValue] = useState(undefined);
  const [rawKey, setRawKey] = useState('');

  const techs = model?.technologies || [];
  const locations = (model?.locations || []).map(l => l.name);
  const links = modelLinks(model);
  const atLoc = loc ? techsAtLocation(model, loc) : [];
  const linkObj = links.find(l => l.key === link);

  const target = (() => {
    switch (what) {
      case 'tech': return tech ? { type: 'tech', tech } : null;
      case 'locTech': return loc && tech ? { type: 'locTech', loc, tech } : null;
      case 'loc': return loc ? { type: 'loc', loc } : null;
      case 'link': return linkObj ? { type: 'link', link: linkObj.key, ...(linkObj.tech ? { tech: linkObj.tech } : {}) } : null;
      case 'time': return { type: 'time' };
      case 'resolution': return { type: 'resolution' };
      case 'run': return { type: 'run' };
      default: return null;
    }
  })();

  const params = target ? paramsForTarget(target, model) : [];
  const idOf = (p) => `${p.section}:${p.costClass || ''}:${p.param}`;
  const selected = params.length === 1 ? params[0] : params.find(p => idOf(p) === paramId);

  const reset = (next) => { setParamId(''); setValue(undefined); return next; };
  const pickParam = (id) => {
    setParamId(id);
    const p = params.find(x => idOf(x) === id);
    setValue(p ? defaultValue(model, target, p) : undefined);
  };
  // Single-parameter targets (time window, resolution, location on/off) start with a value.
  const effectiveValue = value === undefined && selected && params.length === 1 ? defaultValue(model, target, selected) : value;

  const key = what === 'advanced' ? rawKey.trim() : (target && selected ? settingKey({ target, ...selected }) : '');
  const flat = flattenOverride(override);
  const warnings = key && effectiveValue !== undefined ? checkSetting(model, key, effectiveValue, flat, series) : [];
  const exists = key && key in flat;
  const keyError = what === 'advanced' && rawKey && !/^[^\s.]+(\.[^\s.]+)+$/.test(rawKey.trim())
    ? 'Use a dotted path, e.g. techs.ccgt.constraints.energy_cap_max' : null;
  const canAdd = key && effectiveValue !== undefined && effectiveValue !== '' && !keyError;

  const add = () => {
    if (!canAdd) return;
    onAdd(key, effectiveValue);
    setValue(undefined); setParamId(''); setRawKey('');
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-black/20 bg-slate-50/60 p-2">
      <p className="text-[11px] font-semibold text-slate-700">Add a change</p>
      <div className="flex flex-wrap gap-1">
        {WHAT.map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setWhat(id); reset(); }}
            className={`rounded-md px-2 py-1 text-[10px] font-medium ${what === id ? 'bg-black text-white' : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {(what === 'locTech' || what === 'loc') && (
        <Field label="Location">
          <SelectField value={loc} onChange={e => { setLoc(e.target.value); setTech(''); reset(); }} className={selectCls}>
            <option value="">— choose a location —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </SelectField>
        </Field>
      )}
      {(what === 'tech' || (what === 'locTech' && loc)) && (
        <Field label="Technology">
          <SelectField value={tech} onChange={e => { setTech(e.target.value); reset(); }} className={selectCls}>
            <option value="">— choose a technology —</option>
            {(what === 'locTech' ? techs.filter(t => atLoc.includes(t.name)) : techs).map(t => (
              <option key={t.name} value={t.name}>{t.name} ({t.parent || t.essentials?.parent || '?'})</option>
            ))}
          </SelectField>
          {what === 'locTech' && atLoc.length === 0 && <p className="mt-0.5 text-[10px] text-slate-400">No technologies are placed at {loc}.</p>}
        </Field>
      )}
      {what === 'link' && (
        <Field label="Link">
          <SelectField value={link} onChange={e => { setLink(e.target.value); reset(); }} className={selectCls}>
            <option value="">— choose a link —</option>
            {links.map(l => <option key={`${l.key}:${l.tech}`} value={l.key}>{l.from} ↔ {l.to}{l.tech ? ` · ${l.tech}` : ''}</option>)}
          </SelectField>
        </Field>
      )}

      {what === 'advanced' ? (
        <>
          <Field label="Setting (dotted path)">
            <input value={rawKey} onChange={e => setRawKey(e.target.value)} placeholder="group_constraints.my_group.cost_max.co2" className={inputCls} />
          </Field>
          {keyError && <p className="text-[10px] text-amber-700">{keyError}</p>}
          <Field label="Value"><TextValue value={value} onCommit={setValue} placeholder="number, text, true/false, [list]" /></Field>
        </>
      ) : target && (
        <>
          {params.length > 1 && (
            <Field label="Parameter">
              <SelectField value={paramId} onChange={e => pickParam(e.target.value)} className={selectCls}>
                <option value="">— choose a parameter —</option>
                {[['exists', 'On / off'], ['constraints', 'Constraints'], ['costs', 'Costs (monetary)'], ['run', 'Run']].map(([sec, label]) => {
                  const opts = params.filter(p => p.section === sec);
                  return opts.length ? (
                    <optgroup key={sec} label={label}>
                      {opts.map(p => <option key={idOf(p)} value={idOf(p)}>{p.label}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </SelectField>
            </Field>
          )}
          {selected && (
            <>
              {selected.description && <p className="text-[10px] leading-snug text-slate-500">{selected.description}</p>}
              <Field label={`Value${modelValue(model, target, selected.section, selected.param, selected.costClass) !== undefined
                ? ` · model: ${showValue(modelValue(model, target, selected.section, selected.param, selected.costClass), unitLabel(selected.kind, unit))}` : ''}`}>
                <SettingValueEditor kind={selected.kind} param={selected.param} section={selected.section}
                  value={effectiveValue} onCommit={setValue} unit={unitLabel(selected.kind, unit)} series={series} />
              </Field>
            </>
          )}
        </>
      )}

      <Warnings items={warnings} />
      <button type="button" onClick={add} disabled={!canAdd}
        className="flex h-7 items-center gap-1 rounded-md bg-black px-3 text-[11px] font-medium text-white disabled:opacity-40">
        <FiPlus size={11} /> {exists ? 'Replace setting' : 'Add setting'}
      </button>
    </div>
  );
}

// ── Settings list ─────────────────────────────────────────────────────────────

/** Every setting of one override, grouped and editable, plus "Add a change". */
export function OverrideSettings({ override, onChange, model, series }) {
  const unit = modelPowerUnit(model);
  const flat = flattenOverride(override);
  const groups = groupSettings(flat, model);

  const set = (key, value) => {
    let next = setOverrideKey(override, key, value);
    if (key === RESOLUTION_KEYS[0]) next = setOverrideKey(next, RESOLUTION_KEYS[1], 'resample');
    onChange(next);
  };
  const remove = (key) => {
    let next = removeOverrideKey(override, key);
    if (key === RESOLUTION_KEYS[0] && flat[RESOLUTION_KEYS[1]] === 'resample') next = removeOverrideKey(next, RESOLUTION_KEYS[1]);
    onChange(next);
  };

  return (
    <div className="space-y-3 px-2 py-2">
      {groups.length === 0 && <p className="text-[11px] italic text-slate-400">No settings yet — add a change below.</p>}
      {groups.map(g => (
        <div key={g.title} className="rounded-md border border-black/10 bg-white">
          <p className="border-b border-black/5 px-2 py-1 text-[11px] font-semibold text-slate-700">{g.title}</p>
          <div className="space-y-2 p-2">
            {g.entries.map(e => {
              const kind = paramKind(e.param, e.section);
              const base = modelValue(model, e.target, e.section, e.param, e.costClass);
              const unitText = unitLabel(kind, unit);
              return (
                <div key={e.key}>
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-800" title={`${e.key}\n${paramDescription(e.param, e.section)}`}>
                      {e.section === 'advanced' ? e.key : paramLabel(e.param, e.section)}
                      {e.section === 'costs' && e.costClass !== 'monetary' ? ` (${e.costClass})` : ''}
                    </span>
                    {base !== undefined && kind !== 'dateRange' && (
                      <span className="shrink-0 text-[10px] text-slate-400">model: {showValue(base, unitText)}</span>
                    )}
                    <button onClick={() => remove(e.key)} title="Remove this setting"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-0.5">
                    <SettingValueEditor kind={kind} param={e.param} section={e.section} value={e.value}
                      onCommit={v => set(e.key, v)} unit={unitText} series={series} />
                  </div>
                  <Warnings items={checkSetting(model, e.key, e.value, flat, series)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <AddChange model={model} override={override} series={series} unit={unit} onAdd={set} />
    </div>
  );
}
