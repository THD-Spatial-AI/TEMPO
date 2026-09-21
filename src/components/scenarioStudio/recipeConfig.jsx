/**
 * Scenario Studio — config panels for the side panel (year-swimlane builder).
 *
 * Recipe config panels + custom-op editor are lifted verbatim from the dev
 * ScenarioStudio.jsx form shell. New small per-card configs (Demand / Constraint
 * / Technology) drive the atomic card categories from scenario.js. `CardConfig`
 * routes a selected card to the right panel.
 */

import React from 'react';
import { FiInfo, FiPlus, FiTrash2, FiDownload } from 'react-icons/fi';
import ReactECharts from 'echarts-for-react';
import { autoDetectTechs, FOSSIL_KEYWORDS, RENEWABLE_KEYWORDS } from '../../services/scenarioStudio/utils.js';
import { importLegacyScenario } from '../../services/scenarioStudio/legacyImport.js';
import { summarizeOps, extractDemandSeries } from '../../services/scenarioStudio/recipeParams.js';

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
    <div className="flex gap-1 flex-wrap">
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

// ─── Recipe config panels (verbatim from dev form shell) ────────────────────────

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

// ─── Custom op editor (verbatim from dev form shell) ────────────────────────────

const OP_TYPES = [
  { id: 'setParam',         label: 'Set parameter' },
  { id: 'scaleParam',       label: 'Scale parameter' },
  { id: 'disableTech',      label: 'Disable technology' },
  { id: 'systemConstraint', label: 'System constraint' },
];

const SYS_KINDS = ['co2_cap', 'renewable_min', 'reserve_margin'];

function defaultOp(type) {
  if (type === 'setParam')         return { op: 'setParam',         techMatch: '', path: 'constraints.energy_cap_max', value: 0,    level: 'global' };
  if (type === 'scaleParam')       return { op: 'scaleParam',       techMatch: '', path: 'constraints.resource_scale',  factor: 1.0, level: 'global' };
  if (type === 'disableTech')      return { op: 'disableTech',      techMatch: '' };
  if (type === 'systemConstraint') return { op: 'systemConstraint', kind: 'co2_cap', value: 0 };
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

// ─── Atomic card configs (new) ──────────────────────────────────────────────────

function DemandCardConfig({ params, setParam, model, timeSeries }) {
  const scale = Number(params.scale ?? 1);
  const series = extractDemandSeries(model, timeSeries);

  // Downsample to ~300 points for a light preview.
  const preview = React.useMemo(() => {
    if (!series) return null;
    const step = Math.max(1, Math.floor(series.values.length / 300));
    const pts = [];
    for (let i = 0; i < series.values.length; i += step) pts.push(series.values[i] * scale);
    return pts;
  }, [series, scale]);

  return (
    <div className="space-y-4">
      <div>
        <Label>Demand scale for this cell</Label>
        <div className="flex items-center gap-2">
          <input type="range" min={0.2} max={3} step={0.01} value={scale}
            onChange={e => setParam('scale', parseFloat(e.target.value))}
            className="flex-1 accent-electric-600" />
          <NumInput value={scale} onChange={v => setParam('scale', v)} min={0.2} max={5} step={0.01} className="w-20" />
          <span className="text-xs text-slate-500">×</span>
        </div>
        <Hint>Scales the demand profile ({params.scale === 1 ? 'baseline' : `${((scale - 1) * 100).toFixed(0)}%`}). Drag-to-reshape the hourly profile is coming later.</Hint>
      </div>
      {preview ? (
        <div>
          <Label>Demand preview — {series.name}</Label>
          <ReactECharts
            style={{ height: 160 }}
            option={{
              animation: false,
              grid: { top: 10, bottom: 24, left: 44, right: 10 },
              xAxis: { type: 'category', show: false, data: preview.map((_, i) => i) },
              yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
              tooltip: { trigger: 'axis' },
              series: [{
                type: 'line', data: preview, smooth: true, symbol: 'none',
                lineStyle: { color: '#3b82f6', width: 1.5 }, areaStyle: { color: 'rgba(59,130,246,0.08)' },
              }],
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">No demand time series found for this model.</p>
      )}
    </div>
  );
}

function ConstraintCardConfig({ params, setParam }) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Constraint</Label>
        <select value={params.kind} onChange={e => setParam('kind', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
          {SYS_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <Label>Value</Label>
        <NumInput value={params.value} onChange={v => setParam('value', v)} step={1} />
        <Hint>{params.kind === 'co2_cap' ? 'CO₂ cap (0 = net-zero)' : params.kind === 'renewable_min' ? 'Minimum renewable share (fraction 0–1)' : 'Reserve margin'}</Hint>
      </div>
      {params.kind === 'co2_cap' && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
          <FiInfo size={13} className="shrink-0 mt-0.5" />
          Requires technologies to have CO₂ costs (<code className="bg-amber-100 px-1 rounded">costs.co2.*</code>).
        </div>
      )}
    </div>
  );
}

function TechCardConfig({ params, setParam, model }) {
  const allTechs = (model?.technologies || []).map(t => t.name);
  return (
    <div className="space-y-4">
      <div>
        <Label>Action</Label>
        <ToggleBtn value={params.mode}
          options={[{ id: 'disable', label: 'Disable' }, { id: 'set', label: 'Set param' }, { id: 'scale', label: 'Scale param' }]}
          onChange={v => setParam('mode', v)} />
      </div>
      <div>
        <Label>Technology</Label>
        <select value={params.techMatch} onChange={e => setParam('techMatch', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
          <option value="">— select a technology —</option>
          {allTechs.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {params.mode !== 'disable' && (
        <>
          <div>
            <Label>Param path</Label>
            <input value={params.path} onChange={e => setParam('path', e.target.value)} placeholder="constraints.energy_cap_max"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-electric-400" />
          </div>
          <div className="flex gap-3 items-end">
            <div>
              <Label>{params.mode === 'scale' ? 'Factor' : 'Value'}</Label>
              {params.mode === 'scale'
                ? <NumInput value={params.factor} onChange={v => setParam('factor', v)} step={0.01} className="w-24" />
                : <NumInput value={params.value} onChange={v => setParam('value', v)} step={1} className="w-24" />}
            </div>
            <div>
              <Label>Apply to</Label>
              <ToggleBtn value={params.level}
                options={[{ id: 'global', label: 'Global' }, { id: 'both', label: 'Both' }]}
                onChange={v => setParam('level', v)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LocationCardConfig({ params, setParam, model }) {
  const locations = (model?.locations || []).map(l => l.name || l.id).filter(Boolean);
  const allTechs = (model?.technologies || []).map(t => t.name);
  return (
    <div className="space-y-4">
      <div>
        <Label>Location (from model)</Label>
        <select value={params.location} onChange={e => setParam('location', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
          <option value="">— select a location —</option>
          {locations.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {locations.length === 0 && <Hint>This model has no locations defined.</Hint>}
      </div>
      <div>
        <Label>Action</Label>
        <ToggleBtn value={params.mode}
          options={[{ id: 'disable', label: 'Disable here' }, { id: 'set', label: 'Set param' }, { id: 'scale', label: 'Scale param' }]}
          onChange={v => setParam('mode', v)} />
      </div>
      <div>
        <Label>Technology (from model)</Label>
        <select value={params.techMatch} onChange={e => setParam('techMatch', e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
          <option value="">— select a technology —</option>
          {allTechs.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {params.mode !== 'disable' && (
        <>
          <div>
            <Label>Param path</Label>
            <input value={params.path} onChange={e => setParam('path', e.target.value)} placeholder="constraints.energy_cap_max"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-electric-400" />
          </div>
          <div>
            <Label>{params.mode === 'scale' ? 'Factor' : 'Value'}</Label>
            {params.mode === 'scale'
              ? <NumInput value={params.factor} onChange={v => setParam('factor', v)} step={0.01} className="w-24" />
              : <NumInput value={params.value} onChange={v => setParam('value', v)} step={1} className="w-24" />}
          </div>
        </>
      )}
      <div className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
        Applies only within this location (location-level override; only affects a tech that already
        exists at that location).
      </div>
    </div>
  );
}

// ─── Card config router ─────────────────────────────────────────────────────────

const RECIPE_PANEL = {
  demandGrowth: DemandGrowthConfig,
  renewableTransition: RenewableTransitionConfig,
  carbonCap: CarbonCapConfig,
  costSensitivity: CostSensitivityConfig,
};

export function CardConfig({ category, params, setParam, model, timeSeries }) {
  if (!model) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 italic">
        <FiInfo size={14} /> Select a model to configure this card.
      </div>
    );
  }
  if (category === 'demand')     return <DemandCardConfig params={params} setParam={setParam} model={model} timeSeries={timeSeries} />;
  if (category === 'constraint') return <ConstraintCardConfig params={params} setParam={setParam} />;
  if (category === 'tech')       return <TechCardConfig params={params} setParam={setParam} model={model} />;
  if (category === 'location')   return <LocationCardConfig params={params} setParam={setParam} model={model} />;
  if (category === 'custom')     return <CustomConfigPanel params={params} setParam={setParam} model={model} />;
  if (category?.startsWith('recipe:')) {
    const Panel = RECIPE_PANEL[category.slice(7)];
    return Panel ? <Panel params={params} setParam={setParam} model={model} /> : null;
  }
  return <p className="text-sm text-slate-500 italic">No configuration for this card.</p>;
}

// ─── Variant badge (for the side panel variant list) ────────────────────────────

export function VariantBadge({ variant }) {
  const summary = summarizeOps(variant.ops);
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs">
      <span className="font-semibold text-slate-700">{variant.label}</span>
      {summary
        ? <span className="text-slate-500 truncate max-w-[200px]" title={summary}>{summary}</span>
        : <span className="text-slate-400">baseline</span>}
    </div>
  );
}
