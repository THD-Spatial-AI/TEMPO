/**
 * Scenario Studio — per-recipe config panels + variant badge (components).
 *
 * Lifted verbatim from the old ScenarioStudio.jsx form shell so the sandbox
 * board's side panel can reuse the exact same configuration UI. Pure metadata
 * and param helpers live in recipeMeta.js (keeps this file component-only).
 */

import React from 'react';
import { FiInfo, FiPlus, FiTrash2, FiDownload } from 'react-icons/fi';
import { TECH_TEMPLATES, templateAddTechOp } from '../../services/scenarioStudio/techTemplates.js';
import { autoDetectTechs, FOSSIL_KEYWORDS, RENEWABLE_KEYWORDS } from '../../services/scenarioStudio/utils.js';
import { importLegacyScenario } from '../../services/scenarioStudio/legacyImport.js';
import SporesConfigPanel from '../run/SporesConfigPanel.jsx';
import { summarizeOps } from './recipeMeta.js';

const COST_PARAM_OPTIONS = [
  { value: 'costs.monetary.energy_cap',  label: 'CAPEX (€/kW)' },
  { value: 'costs.monetary.energy_prod', label: 'OPEX per output (€/MWh)' },
  { value: 'costs.monetary.storage_cap', label: 'Storage CAPEX (€/kWh)' },
  { value: 'constraints.energy_eff',     label: 'Efficiency (fraction)' },
];

// ─── Shared UI helpers ───────────────────────────────────────────────────────

function Label({ children }) {
  return <label className="block text-xs font-medium text-slate-600 mb-1">{children}</label>;
}
function Hint({ children }) {
  return <p className="text-xs text-slate-400 mt-0.5">{children}</p>;
}
function NumInput({ value, onChange, min, max, step = 1, className = 'w-28' }) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`${className} px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400`}
    />
  );
}
function ToggleBtn({ value, options, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map(({ id, label }) => (
        <button key={id} onClick={() => onChange(id)}
          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
            value === id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}>{label}</button>
      ))}
    </div>
  );
}
function SnapshotConfig({ params, setParam }) {
  return (
    <div>
      <Label>Snapshot years</Label>
      <ToggleBtn value={params.snapshotMode}
        options={[{ id: 'range', label: 'Range' }, { id: 'list', label: 'Custom list' }]}
        onChange={v => setParam('snapshotMode', v)} />
      <div className="mt-2">
        {params.snapshotMode === 'range' ? (
          <div className="flex items-end gap-2 flex-wrap">
            {[['From', 'snapshotFrom'], ['To', 'snapshotTo'], ['Step', 'snapshotStep']].map(([lbl, key]) => (
              <div key={key}>
                <span className="text-xs text-slate-500 block mb-0.5">{lbl}</span>
                <input type="number" value={params[key]} min={2000} max={2200} step={1}
                  onChange={e => setParam(key, parseInt(e.target.value) || 2025)}
                  className="w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <input type="text" value={params.snapshotList}
              onChange={e => setParam('snapshotList', e.target.value)}
              placeholder="2025, 2030, 2035, 2040"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
            <Hint>Comma-separated years</Hint>
          </>
        )}
      </div>
    </div>
  );
}
function TechCheckList({ techs, selected, onChange }) {
  if (!techs.length) return <p className="text-xs text-slate-400 italic">No matching technologies found in model.</p>;
  return (
    <div className="space-y-1">
      {techs.map(t => (
        <label key={t} className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={selected.includes(t)}
            onChange={e => onChange(e.target.checked ? [...selected, t] : selected.filter(n => n !== t))}
            className="rounded text-electric-500 focus:ring-electric-400" />
          <span className="text-xs font-mono text-slate-700">{t}</span>
        </label>
      ))}
    </div>
  );
}

// ─── Config panels ────────────────────────────────────────────────────────────

function DemandGrowthConfig({ params, setParam, model }) {
  const demandTechs = (model?.technologies || []).filter(t => t.parent === 'demand');
  return (
    <div className="space-y-5">
      <div className="flex gap-4 flex-wrap">
        <div>
          <Label>Base year</Label>
          <NumInput value={params.baseYear} onChange={v => setParam('baseYear', Math.round(v))} min={2000} max={2100} />
          <Hint>Demand in this year = 1.0 (no scaling)</Hint>
        </div>
        <div>
          <Label>Annual growth rate</Label>
          <div className="flex items-center gap-2">
            <NumInput value={params.ratePerYear} onChange={v => setParam('ratePerYear', v)} min={-20} max={20} step={0.1} />
            <span className="text-xs text-slate-500">% / yr</span>
          </div>
          <Hint>Negative = shrink</Hint>
        </div>
      </div>
      <SnapshotConfig params={params} setParam={setParam} />
      <div>
        <Label>Demand technologies</Label>
        <ToggleBtn value={params.demandTechsMode}
          options={[{ id: 'auto', label: 'Auto-detect' }, { id: 'manual', label: 'Select manually' }]}
          onChange={v => setParam('demandTechsMode', v)} />
        <div className="mt-2">
          {params.demandTechsMode === 'auto'
            ? <p className="text-xs text-slate-500">All techs with <code className="bg-slate-100 px-1 rounded">parent: demand</code> will be scaled.</p>
            : <TechCheckList techs={demandTechs.map(t => t.name)} selected={params.demandTechsManual}
                onChange={v => setParam('demandTechsManual', v)} />
          }
        </div>
      </div>
    </div>
  );
}

function RenewableTransitionConfig({ params, setParam, model }) {
  const techs = model?.technologies || [];
  const fossilTechs  = autoDetectTechs(techs, FOSSIL_KEYWORDS);
  const renewableTechs = autoDetectTechs(techs, RENEWABLE_KEYWORDS);
  return (
    <div className="space-y-5">
      <div className="flex gap-4 flex-wrap">
        <div>
          <Label>Base year</Label>
          <NumInput value={params.baseYear} onChange={v => setParam('baseYear', Math.round(v))} min={2000} max={2100} />
        </div>
        <div>
          <Label>Target year</Label>
          <NumInput value={params.targetYear} onChange={v => setParam('targetYear', Math.round(v))} min={2000} max={2200} />
          <Hint>Year fossil techs are fully phased out</Hint>
        </div>
      </div>
      <SnapshotConfig params={params} setParam={setParam} />
      <div>
        <Label>Fossil technologies to phase out</Label>
        <ToggleBtn value={params.fossilMode}
          options={[{ id: 'auto', label: 'Auto-detect' }, { id: 'manual', label: 'Select manually' }]}
          onChange={v => setParam('fossilMode', v)} />
        <div className="mt-2">
          {params.fossilMode === 'auto'
            ? <p className="text-xs text-slate-500">Techs with names matching: coal, gas, oil, diesel, ccgt, ocgt…</p>
            : <TechCheckList techs={fossilTechs} selected={params.fossilManual} onChange={v => setParam('fossilManual', v)} />
          }
        </div>
      </div>
      <div>
        <Label>Phase-out mode</Label>
        <ToggleBtn value={params.phaseOutMode}
          options={[{ id: 'graduated', label: 'Graduated (linear)' }, { id: 'cliff', label: 'Hard stop at target year' }]}
          onChange={v => setParam('phaseOutMode', v)} />
      </div>
      <div>
        <Label>Renewable capacity scale at target year (optional)</Label>
        <div className="flex items-center gap-2">
          <input type="number" value={params.renewableCapScale} min={1} max={10} step={0.1}
            placeholder="e.g. 2.0"
            onChange={e => setParam('renewableCapScale', e.target.value)}
            className="w-24 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
          <span className="text-xs text-slate-500">× current cap</span>
        </div>
        <Hint>Leave blank to not constrain renewable capacity growth</Hint>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={params.enableRenewableMin}
            onChange={e => setParam('enableRenewableMin', e.target.checked)}
            className="rounded text-electric-500 focus:ring-electric-400" />
          <span className="text-xs font-medium text-slate-700">Add renewable minimum share constraint</span>
        </label>
        {params.enableRenewableMin && (
          <div className="mt-3 pl-4 space-y-3">
            <div>
              <Label>Target share at target year</Label>
              <div className="flex items-center gap-2">
                <NumInput value={params.renewableMinShare} onChange={v => setParam('renewableMinShare', v)} min={0} max={100} step={5} />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </div>
            <div>
              <Label>Renewable technologies for constraint</Label>
              <ToggleBtn value={params.renewableMinMode}
                options={[{ id: 'auto', label: 'Auto-detect' }, { id: 'manual', label: 'Select' }]}
                onChange={v => setParam('renewableMinMode', v)} />
              {params.renewableMinMode === 'manual' && (
                <div className="mt-2">
                  <TechCheckList techs={renewableTechs} selected={params.renewableMinManual}
                    onChange={v => setParam('renewableMinManual', v)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CarbonCapConfig({ params, setParam }) {
  return (
    <div className="space-y-5">
      <div className="flex gap-4 flex-wrap">
        <div>
          <Label>Base year</Label>
          <NumInput value={params.baseYear} onChange={v => setParam('baseYear', Math.round(v))} min={2000} max={2100} />
        </div>
        <div>
          <Label>Target year</Label>
          <NumInput value={params.targetYear} onChange={v => setParam('targetYear', Math.round(v))} min={2000} max={2200} />
        </div>
      </div>
      <div className="flex gap-4 flex-wrap">
        <div>
          <Label>CO₂ cap at base year</Label>
          <div className="flex items-center gap-2">
            <NumInput value={params.startCap} onChange={v => setParam('startCap', v)} min={0} step={1} />
            <span className="text-xs text-slate-500">Mt</span>
          </div>
          <Hint>Current / reference emissions level</Hint>
        </div>
        <div>
          <Label>CO₂ cap at target year</Label>
          <div className="flex items-center gap-2">
            <NumInput value={params.endCap} onChange={v => setParam('endCap', v)} min={0} step={1} />
            <span className="text-xs text-slate-500">Mt (0 = net-zero)</span>
          </div>
        </div>
      </div>
      <SnapshotConfig params={params} setParam={setParam} />
      <div>
        <Label>Interpolation</Label>
        <ToggleBtn value={params.interpolation}
          options={[{ id: 'linear', label: 'Linear' }, { id: 'exponential', label: 'Exponential decay' }]}
          onChange={v => setParam('interpolation', v)} />
        <Hint>Exponential decay = faster reduction early on</Hint>
      </div>
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
        <FiInfo size={13} className="shrink-0 mt-0.5" />
        Requires model technologies to have CO₂ costs defined (<code className="bg-amber-100 px-1 rounded">costs.co2.*</code>).
      </div>
    </div>
  );
}

function CostSensitivityConfig({ params, setParam, model }) {
  const allTechs = (model?.technologies || []).map(t => t.name);
  return (
    <div className="space-y-5">
      <div>
        <Label>Technology</Label>
        <select value={params.techName}
          onChange={e => setParam('techName', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
          <option value="">— select a technology —</option>
          {allTechs.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div>
        <Label>Parameter to sweep</Label>
        <select value={params.paramPath}
          onChange={e => setParam('paramPath', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
          {COST_PARAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
        </select>
      </div>
      <div className="flex gap-4 flex-wrap">
        <div>
          <Label>From value</Label>
          <NumInput value={params.valueFrom} onChange={v => setParam('valueFrom', v)} min={0} step={1} />
        </div>
        <div>
          <Label>To value</Label>
          <NumInput value={params.valueTo} onChange={v => setParam('valueTo', v)} min={0} step={1} />
        </div>
        <div>
          <Label>Steps</Label>
          <NumInput value={params.steps} onChange={v => setParam('steps', Math.round(v))} min={2} max={20} step={1} className="w-20" />
        </div>
      </div>
      <div>
        <Label>Display unit (for labels)</Label>
        <input type="text" value={params.unit}
          onChange={e => setParam('unit', e.target.value)}
          className="w-32 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
      </div>
      <div>
        <Label>Apply to</Label>
        <ToggleBtn value={params.level}
          options={[{ id: 'global', label: 'Global tech only' }, { id: 'both', label: 'Global + all location overrides' }]}
          onChange={v => setParam('level', v)} />
      </div>
    </div>
  );
}

// ─── Custom op editor ─────────────────────────────────────────────────────────

const OP_TYPES = [
  { id: 'setParam',         label: 'Set parameter' },
  { id: 'scaleParam',       label: 'Scale parameter' },
  { id: 'disableTech',      label: 'Disable technology' },
  { id: 'systemConstraint', label: 'System constraint' },
  { id: 'addTech',          label: 'Add technology (H₂/CCS…)' },
  { id: 'scaleLinkCap',     label: 'Scale link capacity' },
  { id: 'setLinkCap',       label: 'Set link capacity' },
];

const SYS_KINDS = ['co2_cap', 'renewable_min', 'reserve_margin'];

function defaultOp(type) {
  if (type === 'setParam')         return { op: 'setParam',         techMatch: '', path: 'constraints.energy_cap_max', value: 0,    level: 'global' };
  if (type === 'scaleParam')       return { op: 'scaleParam',       techMatch: '', path: 'constraints.resource_scale',  factor: 1.0, level: 'global' };
  if (type === 'disableTech')      return { op: 'disableTech',      techMatch: '' };
  if (type === 'systemConstraint') return { op: 'systemConstraint', kind: 'co2_cap', value: 0 };
  if (type === 'addTech') {
    const t = 'electrolyser';
    return { ...templateAddTechOp(t, t, {}), _template: t, _knobs: {} };
  }
  if (type === 'scaleLinkCap')     return { op: 'scaleLinkCap', linkMatch: 'all', factor: 1.5 };
  if (type === 'setLinkCap')       return { op: 'setLinkCap',   linkMatch: 'all', value: 1000 };
  return { op: type };
}

function OpRow({ op, index, onChange, onDelete }) {
  const set = (k, v) => onChange(index, { ...op, [k]: v });
  return (
    <div className="flex flex-col gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
      <div className="flex items-center gap-2">
        <select value={op.op} onChange={e => onChange(index, defaultOp(e.target.value))}
          className="flex-1 px-2 py-1 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-electric-400">
          {OP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <button onClick={() => onDelete(index)} className="p-1 text-red-400 hover:text-red-600 rounded transition-colors">
          <FiTrash2 size={12} />
        </button>
      </div>

      {(op.op === 'setParam' || op.op === 'scaleParam' || op.op === 'disableTech') && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="text-slate-500 block mb-0.5">Tech name</span>
            <input value={op.techMatch} onChange={e => set('techMatch', e.target.value)} placeholder="solar_pv"
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-electric-400" />
          </div>
          {op.op !== 'disableTech' && (
            <div className="flex-1">
              <span className="text-slate-500 block mb-0.5">Param path</span>
              <input value={op.path} onChange={e => set('path', e.target.value)} placeholder="constraints.energy_cap_max"
                className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-electric-400" />
            </div>
          )}
        </div>
      )}

      {op.op === 'setParam' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="text-slate-500 block mb-0.5">Value</span>
            <input type="number" value={op.value} onChange={e => set('value', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-electric-400" />
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Apply to</span>
            <select value={op.level || 'global'} onChange={e => set('level', e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-electric-400">
              <option value="global">Global tech</option>
              <option value="location">Location overrides</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
      )}

      {op.op === 'scaleParam' && (
        <div className="flex gap-2">
          <div className="w-28">
            <span className="text-slate-500 block mb-0.5">Factor</span>
            <input type="number" step="0.01" value={op.factor} onChange={e => set('factor', parseFloat(e.target.value) || 1)}
              className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-electric-400" />
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Apply to</span>
            <select value={op.level || 'global'} onChange={e => set('level', e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-electric-400">
              <option value="global">Global tech</option>
              <option value="location">Location overrides</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
      )}

      {op.op === 'systemConstraint' && (
        <div className="flex gap-2">
          <div>
            <span className="text-slate-500 block mb-0.5">Kind</span>
            <select value={op.kind} onChange={e => set('kind', e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-electric-400">
              {SYS_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <span className="text-slate-500 block mb-0.5">Value</span>
            <input type="number" value={typeof op.value === 'number' ? op.value : 0}
              onChange={e => set('value', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-electric-400" />
          </div>
        </div>
      )}

      {op.op === 'addTech' && (() => {
        const tpl = TECH_TEMPLATES[op._template] || {};
        const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
        const setTemplate = tid => onChange(index, { ...templateAddTechOp(tid, tid, {}), _template: tid, _knobs: {} });
        const setName = name => onChange(index, { ...op, tech: name });
        const setKnob = (path, value) => {
          const knobs = { ...(op._knobs || {}), [path]: value };
          onChange(index, { ...templateAddTechOp(op._template, op.tech, knobs), _template: op._template, _knobs: knobs });
        };
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="text-slate-500 block mb-0.5">Template</span>
                <select value={op._template} onChange={e => setTemplate(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-electric-400">
                  {Object.entries(TECH_TEMPLATES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <span className="text-slate-500 block mb-0.5">Tech name</span>
                <input value={op.tech} onChange={e => setName(e.target.value)}
                  className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-electric-400" />
              </div>
            </div>
            <div className="flex gap-2">
              {(tpl.knobs || []).map(kn => (
                <div key={kn.path} className="flex-1">
                  <span className="text-slate-500 block mb-0.5">{kn.label} ({kn.unit})</span>
                  <input type="number" step="0.01" value={getPath(op.defaults, kn.path) ?? ''}
                    onChange={e => setKnob(kn.path, e.target.value)}
                    className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-electric-400" />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {(op.op === 'scaleLinkCap' || op.op === 'setLinkCap') && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span className="text-slate-500 block mb-0.5">Link type (or “all”)</span>
            <input value={typeof op.linkMatch === 'string' ? op.linkMatch : 'all'}
              onChange={e => set('linkMatch', e.target.value)} placeholder="all"
              className="w-full px-2 py-1 border border-slate-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-electric-400" />
          </div>
          {op.op === 'scaleLinkCap' ? (
            <div className="w-28">
              <span className="text-slate-500 block mb-0.5">Factor</span>
              <input type="number" step="0.1" value={op.factor}
                onChange={e => set('factor', parseFloat(e.target.value) || 1)}
                className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-electric-400" />
            </div>
          ) : (
            <div className="w-28">
              <span className="text-slate-500 block mb-0.5">MW</span>
              <input type="number" value={op.value}
                onChange={e => set('value', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-electric-400" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomConfigPanel({ params, setParam, model }) {
  const modelOverrides = model?.overrides || {};
  const modelScenarios = model?.scenarios || {};
  const scenarioNames = Object.keys(modelScenarios);

  const ops = params.ops || [];
  const setOps = newOps => setParam('ops', newOps);

  const addOp = () => setOps([...ops, defaultOp('setParam')]);
  const deleteOp = (i) => setOps(ops.filter((_, idx) => idx !== i));
  const updateOp = (i, updated) => setOps(ops.map((o, idx) => idx === i ? updated : o));

  const handleImport = () => {
    const scenName = params.selectedScenario;
    if (!scenName || !modelScenarios[scenName]) return;
    const { ops: imported, skippedKeys, missingOverrides } = importLegacyScenario(modelOverrides, modelScenarios[scenName]);
    setOps([...ops, ...imported]);
    if (skippedKeys.length || missingOverrides.length) {
      console.warn('[Scenario Studio] Import skipped:', { skippedKeys, missingOverrides });
    }
  };

  return (
    <div className="space-y-4">
      {/* Variant label */}
      <div>
        <Label>Variant label</Label>
        <input value={params.variantLabel || 'Custom'}
          onChange={e => setParam('variantLabel', e.target.value)}
          className="w-48 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400" />
      </div>

      {/* Legacy import */}
      {scenarioNames.length > 0 && (
        <div>
          <Label>Import from saved scenario</Label>
          <div className="flex gap-2 items-center">
            <select value={params.selectedScenario || ''}
              onChange={e => setParam('selectedScenario', e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
              <option value="">— choose scenario —</option>
              {scenarioNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={handleImport} disabled={!params.selectedScenario}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <FiDownload size={12} /> Import ops
            </button>
          </div>
          <Hint>Appends the scenario's overrides as setParam ops.</Hint>
        </div>
      )}
      {scenarioNames.length === 0 && (
        <p className="text-xs text-slate-400 italic">No saved scenarios found on this model.</p>
      )}

      {/* Op list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Operations ({ops.length})</Label>
          <button onClick={addOp}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-electric-600 hover:bg-electric-50 rounded-lg transition-colors border border-electric-200">
            <FiPlus size={12} /> Add op
          </button>
        </div>
        {ops.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No ops yet. Add one above or import from a saved scenario.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
            {ops.map((op, i) => (
              <OpRow key={i} op={op} index={i} onChange={updateOp} onDelete={deleteOp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SporesRecipeConfig({ params, setParam }) {
  const opts = { slack: params.slack ?? 10, sporesNumber: params.sporesNumber ?? 20 };
  return (
    <SporesConfigPanel
      modelConfig={{ sporesOptions: opts }}
      setModelConfig={updater => {
        const next = updater({ sporesOptions: opts }).sporesOptions;
        setParam('slack', next.slack);
        setParam('sporesNumber', next.sporesNumber);
      }}
    />
  );
}

export function ConfigPanel({ recipeId, params, setParam, model }) {
  if (!model) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 italic">
        <FiInfo size={14} /> Select a model above to configure this recipe.
      </div>
    );
  }
  switch (recipeId) {
    case 'demandGrowth':       return <DemandGrowthConfig params={params} setParam={setParam} model={model} />;
    case 'renewableTransition':return <RenewableTransitionConfig params={params} setParam={setParam} model={model} />;
    case 'carbonCap':          return <CarbonCapConfig params={params} setParam={setParam} />;
    case 'costSensitivity':    return <CostSensitivityConfig params={params} setParam={setParam} model={model} />;
    case 'custom':             return <CustomConfigPanel params={params} setParam={setParam} model={model} />;
    case 'spores':             return <SporesRecipeConfig params={params} setParam={setParam} />;
    default: return <p className="text-sm text-slate-500 italic">Configuration not available.</p>;
  }
}

export function VariantBadge({ variant, recipeId }) {
  let detail = null;
  if (recipeId === 'demandGrowth') {
    const factor = variant.ops[0]?.factor ?? 1;
    const pct = (factor - 1) * 100;
    detail = Math.abs(pct) < 0.01
      ? <span className="text-slate-400">baseline</span>
      : <span className={pct > 0 ? 'text-blue-600' : 'text-red-600'}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</span>;
  } else if (recipeId === 'renewableTransition') {
    const t = variant.t ?? 0;
    detail = t <= 0 ? <span className="text-slate-400">baseline</span>
      : t >= 1 ? <span className="text-orange-600">fossils disabled</span>
      : <span className="text-amber-600">{(t * 100).toFixed(0)}% phase-out</span>;
  } else if (recipeId === 'carbonCap') {
    const cap = variant.capValue;
    detail = cap !== undefined
      ? <span className={cap === 0 ? 'text-green-600 font-semibold' : 'text-slate-600'}>{cap.toFixed(1)} Mt</span>
      : null;
  } else if (recipeId === 'costSensitivity') {
    detail = <span className="text-purple-700 font-mono">{variant.label}</span>;
  } else if (recipeId === 'custom') {
    const summary = summarizeOps(variant.ops);
    detail = summary ? <span className="text-slate-500 truncate max-w-[220px]" title={summary}>{summary}</span> : null;
  } else {
    const summary = summarizeOps(variant.ops);
    if (summary) detail = <span className="text-slate-400 font-mono text-[10px] truncate max-w-[180px]" title={summary}>{summary}</span>;
  }
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs">
      <span className="font-semibold text-slate-700">{variant.label}</span>
      {detail}
    </div>
  );
}
