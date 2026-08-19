import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FiTrendingUp, FiSun, FiCloud, FiDollarSign,
  FiPlay, FiStopCircle, FiAlertCircle,
  FiChevronDown, FiInfo, FiZap, FiClock,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { checkCalliopeService, runCalliopeModel } from '../services/calliopeClient';
import { applyOps } from '../services/scenarioStudio/transform.js';
import { expandRecipe } from '../services/scenarioStudio/recipes/index.js';
import { autoDetectTechs, FOSSIL_KEYWORDS, RENEWABLE_KEYWORDS, buildCalliope06GroupConstraintsOverride } from '../services/scenarioStudio/utils.js';
import BatchComparison from './results/BatchComparison.jsx';

// ─── Recipe catalogue (UI metadata) ─────────────────────────────────────────

const RECIPE_CARDS = [
  {
    id: 'demandGrowth',
    label: 'Demand growth pathway',
    description: 'Grow electricity demand year by year at a defined rate. Each year is an independent solve.',
    Icon: FiTrendingUp,
    color: 'from-blue-500 to-blue-600',
  },
  {
    id: 'renewableTransition',
    label: 'Renewable transition',
    description: 'Phase out fossil techs across yearly snapshots toward a renewable-dominated grid.',
    Icon: FiSun,
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'carbonCap',
    label: 'Carbon cap / net-zero',
    description: 'Tighten a CO₂ cap from a starting level toward net-zero across yearly snapshots.',
    Icon: FiCloud,
    color: 'from-green-500 to-emerald-600',
  },
  {
    id: 'costSensitivity',
    label: 'Cost sensitivity sweep',
    description: 'Sweep a key cost parameter to see how the optimal energy mix shifts with prices.',
    Icon: FiDollarSign,
    color: 'from-purple-500 to-violet-600',
  },
];

// ─── Default params per recipe ────────────────────────────────────────────────

const DEFAULT_PARAMS = {
  demandGrowth: {
    baseYear: 2025,
    ratePerYear: 1.5,
    snapshotMode: 'range',
    snapshotFrom: 2025, snapshotTo: 2040, snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    demandTechsMode: 'auto',
    demandTechsManual: [],
  },
  renewableTransition: {
    baseYear: 2025,
    targetYear: 2040,
    snapshotMode: 'range',
    snapshotFrom: 2025, snapshotTo: 2040, snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    fossilMode: 'auto',
    fossilManual: [],
    phaseOutMode: 'graduated',
    renewableCapScale: '',
    enableRenewableMin: false,
    renewableMinShare: 80,
    renewableMinMode: 'auto',
    renewableMinManual: [],
  },
  carbonCap: {
    baseYear: 2025,
    targetYear: 2040,
    startCap: 100,
    endCap: 0,
    snapshotMode: 'range',
    snapshotFrom: 2025, snapshotTo: 2040, snapshotStep: 5,
    snapshotList: '2025, 2030, 2035, 2040',
    interpolation: 'linear',
  },
  costSensitivity: {
    techName: '',
    paramPath: 'costs.monetary.energy_cap',
    valueFrom: 800,
    valueTo: 300,
    steps: 5,
    unit: '€/kW',
    level: 'global',
  },
};

const COST_PARAM_OPTIONS = [
  { value: 'costs.monetary.energy_cap',  label: 'CAPEX (€/kW)' },
  { value: 'costs.monetary.energy_prod', label: 'OPEX per output (€/MWh)' },
  { value: 'costs.monetary.storage_cap', label: 'Storage CAPEX (€/kWh)' },
  { value: 'constraints.energy_eff',     label: 'Efficiency (fraction)' },
];

// ─── Build recipe params from UI state ───────────────────────────────────────

function buildRecipeParams(recipeId, ui, model) {
  const techs = model?.technologies || [];

  const resolveSnapshotYears = () =>
    ui.snapshotMode === 'list'
      ? ui.snapshotList.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : { from: ui.snapshotFrom, to: ui.snapshotTo, step: ui.snapshotStep };

  if (recipeId === 'demandGrowth') {
    return {
      baseYear: ui.baseYear,
      ratePerYear: parseFloat(ui.ratePerYear) / 100,
      snapshotYears: resolveSnapshotYears(),
      demandTechs: ui.demandTechsMode === 'auto'
        ? { parentIs: 'demand' }
        : ui.demandTechsManual,
    };
  }

  if (recipeId === 'renewableTransition') {
    return {
      baseYear: ui.baseYear,
      targetYear: ui.targetYear,
      snapshotYears: resolveSnapshotYears(),
      fossilTechs: ui.fossilMode === 'auto'
        ? { nameContains: FOSSIL_KEYWORDS }
        : ui.fossilManual,
      phaseOutMode: ui.phaseOutMode,
      renewableCapScale: ui.renewableCapScale !== '' ? parseFloat(ui.renewableCapScale) : null,
      renewableMinShare: ui.enableRenewableMin ? ui.renewableMinShare / 100 : null,
      renewableTechs: ui.renewableMinMode === 'auto'
        ? autoDetectTechs(techs, RENEWABLE_KEYWORDS)
        : ui.renewableMinManual,
    };
  }

  if (recipeId === 'carbonCap') {
    return {
      baseYear: ui.baseYear,
      targetYear: ui.targetYear,
      snapshotYears: resolveSnapshotYears(),
      startCap: parseFloat(ui.startCap),
      endCap: parseFloat(ui.endCap),
      interpolation: ui.interpolation,
    };
  }

  if (recipeId === 'costSensitivity') {
    return {
      techMatch: ui.techName || 'solar_pv',
      paramPath: ui.paramPath,
      valueFrom: parseFloat(ui.valueFrom),
      valueTo: parseFloat(ui.valueTo),
      steps: parseInt(ui.steps, 10),
      unit: ui.unit,
      level: ui.level,
    };
  }
  return {};
}

// ─── Preview: affected demand techs for demandGrowth ────────────────────────

function resolveDemandTechNames(model, params) {
  if (!model || !params) return [];
  const { demandTechs } = params;
  if (Array.isArray(demandTechs)) return demandTechs;
  if (typeof demandTechs === 'string') return [demandTechs];
  const parent = demandTechs?.parentIs ?? 'demand';
  return (model.technologies || []).filter(t => t.parent === parent).map(t => t.name);
}

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

// ─── Config panel router ──────────────────────────────────────────────────────

function ConfigPanel({ recipeId, params, setParam, model }) {
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
    default: return <p className="text-sm text-slate-500 italic">Configuration not available.</p>;
  }
}

// ─── Recipe card ─────────────────────────────────────────────────────────────

function RecipeCard({ card, selected, onSelect }) {
  const { id, label, description, Icon, color } = card;
  const isSelected = selected === id;
  return (
    <button onClick={() => onSelect(id)}
      className={`relative flex flex-col gap-2 p-4 rounded-xl border text-left transition-all ${
        isSelected
          ? 'border-electric-500 bg-electric-50 shadow-md ring-1 ring-electric-400'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}>
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-800 leading-tight">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5 leading-snug">{description}</div>
      </div>
      {isSelected && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-electric-500" />}
    </button>
  );
}

// ─── Running job row ─────────────────────────────────────────────────────────

function JobRow({ job, onStop }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-electric-500 animate-pulse shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate">{job.displayName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setExpanded(e => !e)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <FiChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => onStop(job.id)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <FiStopCircle size={12} /> Stop
          </button>
        </div>
      </div>
      {expanded && job.logs.length > 0 && (
        <div className="mt-2 bg-slate-900 rounded-lg p-2 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-0.5">
          {job.logs.slice(-20).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Preview label helpers ────────────────────────────────────────────────────

function VariantBadge({ variant, recipeId }) {
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
  }
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs">
      <span className="font-semibold text-slate-700">{variant.label}</span>
      {detail}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ScenarioStudio() {
  const { models, getCurrentModel, showNotification, addCompletedJob, completedJobs, timeSeries, technologies } = useData();

  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState('demandGrowth');
  const [params, setParams] = useState(DEFAULT_PARAMS['demandGrowth']);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [runningJobs, setRunningJobs] = useState([]);
  const cancelFnsRef = useRef({});
  const completedIdsRef = useRef(new Set());

  useEffect(() => {
    const cur = getCurrentModel();
    if (cur) setSelectedModel(cur);
  }, [getCurrentModel]);

  useEffect(() => {
    checkCalliopeService().then(up => setServiceStatus(up)).catch(() => setServiceStatus(false));
  }, []);

  const setParam = (key, value) => setParams(p => ({ ...p, [key]: value }));

  const handleSelectRecipe = (id) => {
    setSelectedRecipe(id);
    setParams(DEFAULT_PARAMS[id] || {});
  };

  // ── Derive variants ───────────────────────────────────────────────────────

  const model = selectedModel;
  const recipeParams = useMemo(
    () => model ? buildRecipeParams(selectedRecipe, params, model) : null,
    [selectedRecipe, params, model]
  );
  const variants = useMemo(() => {
    if (!model || !recipeParams) return [];
    try { return expandRecipe(model, selectedRecipe, recipeParams); } catch { return []; }
  }, [model, selectedRecipe, recipeParams]);

  const affectedTechs = useMemo(
    () => recipeParams ? resolveDemandTechNames(model, recipeParams) : [],
    [model, recipeParams]
  );

  // ── Job completion ────────────────────────────────────────────────────────

  const _handleDone = (jobId, batchId, variantLabel, result) => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    setRunningJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job) {
        const ms = Date.now() - new Date(job.startTime).getTime();
        const duration = ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`;
        setTimeout(() => {
          addCompletedJob({
            id: jobId, modelName: job.displayName, framework: 'calliope', solver: 'highs', mode: 'plan',
            status: result?.success === false ? 'failed' : 'completed',
            completedAt: new Date().toISOString(), duration,
            objective: result?.objective || null,
            terminationCondition: result?.termination_condition || 'optimal',
            result: result || {}, logs: job.logs, batchId, variantLabel,
          });
          showNotification(
            result?.success === false ? `Run failed: ${result.error}` : `Completed: ${job.displayName} (${duration})`,
            result?.success === false ? 'error' : 'success'
          );
        }, 0);
      }
      return prev.filter(j => j.id !== jobId);
    });
    delete cancelFnsRef.current[jobId];
  };

  const _handleError = (jobId, batchId, variantLabel, error) => {
    if (completedIdsRef.current.has(jobId)) return;
    completedIdsRef.current.add(jobId);
    setRunningJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job) {
        setTimeout(() => {
          addCompletedJob({
            id: jobId, modelName: job.displayName, framework: 'calliope', solver: 'highs', mode: 'plan',
            status: 'failed', completedAt: new Date().toISOString(), duration: 'N/A',
            objective: null, terminationCondition: 'error',
            result: { success: false, error }, logs: [...job.logs, `[ERROR] ${error}`],
            batchId, variantLabel,
          });
          showNotification(`Run failed: ${error}`, 'error');
        }, 0);
      }
      return prev.filter(j => j.id !== jobId);
    });
    delete cancelFnsRef.current[jobId];
  };

  // ── Dispatch batch ────────────────────────────────────────────────────────

  const handleRun = async () => {
    if (!model) { showNotification('Select a model first.', 'error'); return; }
    if (variants.length === 0) { showNotification('No variants to run — check configuration.', 'error'); return; }
    if (serviceStatus === false) { showNotification('Calliope service is offline. Start it from Settings → Calliope Engine.', 'error'); return; }
    if (serviceStatus === null) {
      const up = await checkCalliopeService();
      setServiceStatus(up);
      if (!up) { showNotification('Cannot reach Calliope service.', 'error'); return; }
    }

    const batchId = `batch_${Date.now()}`;
    const isCurrentModel = model.id === getCurrentModel()?.id;
    const techsForRun = isCurrentModel && technologies?.length ? technologies : (model.technologies || technologies || []);
    const tsForRun = (timeSeries || []).filter(ts => ts.modelId === model.id);

    showNotification(`Starting ${variants.length} scenario run${variants.length > 1 ? 's' : ''}…`, 'info');

    for (const variant of variants) {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const displayName = `${model.name} — ${variant.label}`;

      const baseModelData = {
        ...model, solver: 'highs', modelConfig: model.modelConfig || {},
        technologies: techsForRun, timeSeries: tsForRun,
      };
      const concreteModel = applyOps(baseModelData, variant.ops);

      // Convert system constraints to native Calliope override if needed
      const gc = concreteModel.modelConfig?.groupConstraints;
      const nativeGC = gc ? buildCalliope06GroupConstraintsOverride(gc) : null;
      if (nativeGC) {
        concreteModel.overrides = { ...(concreteModel.overrides || {}), _studio_sys: { group_constraints: nativeGC } };
        concreteModel.override = '_studio_sys';
      }

      setRunningJobs(prev => [...prev, {
        id: jobId, displayName, startTime: new Date().toISOString(),
        logs: [`[TEMPO] Scenario Studio — ${displayName}`],
      }]);

      try {
        const { cancel } = await runCalliopeModel({
          modelData: concreteModel,
          onLog: line => setRunningJobs(prev => prev.map(j => j.id === jobId ? { ...j, logs: [...j.logs, line] } : j)),
          onStats: () => {},
          onDone: result => _handleDone(jobId, batchId, variant.label, result),
          onError: error => _handleError(jobId, batchId, variant.label, error),
        });
        cancelFnsRef.current[jobId] = cancel;
      } catch (err) {
        setRunningJobs(prev => prev.filter(j => j.id !== jobId));
        showNotification(`Failed to start "${displayName}": ${err.message}`, 'error');
      }
    }
  };

  const handleStop = (jobId) => {
    cancelFnsRef.current[jobId]?.();
    delete cancelFnsRef.current[jobId];
    setRunningJobs(prev => prev.filter(j => j.id !== jobId));
    showNotification('Run stopped.', 'info');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const recipeName = RECIPE_CARDS.find(r => r.id === selectedRecipe)?.label ?? '';

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-electric-600 to-electric-700 bg-clip-text text-transparent">
            Scenario Studio
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Design and run policy scenarios without manual configuration
          </p>
        </div>

        {/* Model selector */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 flex-wrap shadow-sm">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FiZap size={15} className="text-electric-500 shrink-0" />
            <span className="text-sm font-medium text-slate-600 shrink-0">Model</span>
            <select value={selectedModel?.id || ''}
              onChange={e => setSelectedModel(models.find(m => m.id === e.target.value) || null)}
              className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-400 bg-white">
              <option value="">— select a model —</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            serviceStatus === true  ? 'bg-green-50 border-green-200 text-green-700' :
            serviceStatus === false ? 'bg-red-50 border-red-200 text-red-600' :
            'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              serviceStatus === true ? 'bg-green-500' :
              serviceStatus === false ? 'bg-red-500' : 'bg-slate-400 animate-pulse'
            }`} />
            Calliope {serviceStatus === true ? 'ready' : serviceStatus === false ? 'offline' : 'checking…'}
          </div>
        </div>

        {/* Recipe gallery */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">1 — Choose a recipe</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RECIPE_CARDS.map(card => (
              <RecipeCard key={card.id} card={card} selected={selectedRecipe} onSelect={handleSelectRecipe} />
            ))}
          </div>
        </div>

        {/* Config + Preview */}
        {selectedRecipe && (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">

            {/* Config */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">2 — Configure: {recipeName}</h2>
              <ConfigPanel recipeId={selectedRecipe} params={params} setParam={setParam} model={model} />
            </div>

            {/* Preview + Run */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-slate-700">3 — Preview &amp; Run</h2>

              {variants.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Configure the recipe to see a preview.</p>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-slate-500 mb-2">
                      <span className="font-semibold text-slate-700">{variants.length} run{variants.length > 1 ? 's' : ''}</span> will be created:
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {variants.map(v => <VariantBadge key={v.label} variant={v} recipeId={selectedRecipe} />)}
                    </div>
                  </div>

                  {selectedRecipe === 'demandGrowth' && affectedTechs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Technologies scaled:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {affectedTechs.map(name => (
                          <span key={name} className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">{name}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {affectedTechs.length === 0 && selectedRecipe === 'demandGrowth' && (
                    <div className="text-xs text-amber-600 flex items-center gap-1">
                      <FiAlertCircle size={11} /> No demand techs found in model
                    </div>
                  )}

                  <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                    Each run is a full independent Calliope 0.6.8 solve with parameters pre-applied.
                    Results appear in the Results tab grouped by batch.
                  </div>

                  <button onClick={handleRun}
                    disabled={!model || runningJobs.length > 0 || serviceStatus === false}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                      !model || serviceStatus === false
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : runningJobs.length > 0
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-electric-600 to-electric-700 text-white hover:shadow-md hover:scale-[1.01] active:scale-100'
                    }`}>
                    <FiPlay size={15} />
                    Run {variants.length} scenario{variants.length > 1 ? 's' : ''}
                  </button>

                  {runningJobs.length > 0 && (
                    <p className="text-xs text-slate-400 text-center">
                      <FiClock size={11} className="inline mr-1" />
                      {runningJobs.length} run{runningJobs.length > 1 ? 's' : ''} in progress…
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Active jobs */}
        {runningJobs.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Active runs</h2>
            <div className="space-y-2">
              {runningJobs.map(j => <JobRow key={j.id} job={j} onStop={handleStop} />)}
            </div>
          </div>
        )}

        {/* Batch comparison */}
        <BatchComparison completedJobs={completedJobs} />
      </div>
    </div>
  );
}
