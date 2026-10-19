// Reusable per-technology parameter editor.
//
// Presents ONE technology's parameters in two tiers:
//   1. Common (ontology) parameters  — the default surface, engine-neutral,
//      sourced from parameterOntology.json. Values are stored in the underlying
//      Calliope constraints/costs (each common param maps to exactly one), so
//      nothing new has to be persisted for common editing.
//   2. Engine-specific parameters    — opt-in, collapsible per engine:
//        • Calliope = the raw Calliope constraint/cost fields not covered by a
//          common param (power-user panel; existing models' extra fields land here).
//        • PyPSA / OSeMOSYS / AdOpT-NET0 = native params stored in `engineParams`,
//          added from a curated catalog or free-form.
//
// The parent owns all state; this component is controlled via callbacks.
import React, { useState } from 'react';
import { FiX, FiChevronDown, FiChevronRight } from '../ui/icons';
import {
  commonParamsForParent,
  COMMON_CALLIOPE_CONSTRAINTS,
  COMMON_CALLIOPE_COSTS,
} from '../../services/parameterOntology';
import { PARENT_CONSTRAINTS, CONSTRAINT_DEFINITIONS, COST_DEFINITIONS } from '../../utils/constraintDefinitions';
import { fetchTechFramework, frameworkParamNames } from '../../services/techDatabaseApi';
import SelectField from '../ui/SelectField';
import { tr } from '../../i18n';

// Raw Calliope cost keys offered in the Calliope power-user panel.
const RAW_COST_KEYS = ['energy_cap', 'storage_cap', 'resource_cap', 'purchase', 'om_annual', 'om_prod', 'om_con'];

// Curated native parameters per non-Calliope engine (add-picker). Free-form add
// covers anything not listed. Wiring these into the runners happens in the
// translator overlay (engineParams) — see python/*_translate.py.
const ENGINE_PARAM_CATALOG = {
  pypsa: {
    p_min_pu: tr("Minimum output, fraction of capacity"),
    p_max_pu: tr("Maximum output, fraction of capacity"),
    committable: tr("Unit commitment on/off (true/false)"),
    ramp_limit_up: tr("Max ramp up per snapshot (fraction)"),
    ramp_limit_down: tr("Max ramp down per snapshot (fraction)"),
    min_up_time: tr("Minimum up time (snapshots)"),
    min_down_time: tr("Minimum down time (snapshots)"),
    start_up_cost: tr("Start-up cost"),
  },
  osemosys: {
    CapacityFactor: tr("Capacity factor (0-1)"),
    AvailabilityFactor: tr("Availability factor (0-1)"),
    CapacityToActivityUnit: tr("Capacity→activity conversion (e.g. 31.536)"),
    ResidualCapacity: tr("Existing capacity (GW)"),
    OperationalLife: tr("Operational life (years)"),
    EmissionActivityRatio: tr("Emission per unit activity"),
    TotalTechnologyAnnualActivityUpperLimit: tr("Annual activity upper limit (PJ)"),
  },
  adoptnet0: {
    size_min: tr("Minimum size"),
    size_max: tr("Maximum size"),
    min_part_load: tr("Minimum part load (0-1)"),
    standby_power: tr("Standby power draw"),
    size_is_int: tr("Integer sizing (true/false)"),
  },
};

const NON_CALLIOPE_ENGINES = [
  { id: 'pypsa', label: tr("PyPSA") },
  { id: 'osemosys', label: tr("OSeMOSYS") },
  { id: 'adoptnet0', label: tr("AdOpT-NET0") },
];

// Numbers persist as numbers; everything else (carriers, 'inf', bools) stays text.
const coerce = (v) => (v === '' || v === null || isNaN(v) ? v : parseFloat(v));

// ---- small inline add-control --------------------------------------------
function AddFromList({ label, options, onAdd }) {
  const [sel, setSel] = useState('');
  if (!options.length) return null;
  return (
    <div className="flex gap-1 mt-1.5">
      <SelectField
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="flex-1 text-xs border border-black/15 rounded px-2 py-0.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key} title={o.desc || ''}>{o.key}</option>
        ))}
      </SelectField>
      <button
        onClick={() => { if (sel) { onAdd(sel); setSel(''); } }}
        disabled={!sel}
        className="uppercase tracking-wide font-bold px-2 py-0.5 text-xs bg-black text-white rounded disabled:bg-gray-300"
      >
        {tr("Add")}
      </button>
    </div>
  );
}

function AddFreeForm({ onAdd }) {
  const [key, setKey] = useState('');
  return (
    <div className="flex gap-1 mt-1.5">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={tr("custom parameter name")}
        className="flex-1 text-xs border border-black/15 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400 font-mono"
      />
      <button
        onClick={() => { const k = key.trim(); if (k) { onAdd(k); setKey(''); } }}
        disabled={!key.trim()}
        className="px-2 py-0.5 text-xs bg-slate-500 text-white rounded disabled:bg-gray-300"
      >
        {tr("+ Custom")}
      </button>
    </div>
  );
}

// key/value row used by the raw + engine panels
function ParamRow({ name, value, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-slate-500 w-40 flex-shrink-0 font-mono">{name}</span>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(coerce(e.target.value))}
        className="flex-1 px-2 py-0.5 text-xs border border-black/15 rounded focus:ring-1 focus:ring-gray-400 font-mono"
      />
      <button onClick={onRemove} className="text-slate-400 hover:text-gray-600">
        <FiX size={12} />
      </button>
    </div>
  );
}

export default function TechParameterEditor({
  parent,
  techUuid,
  constraints = {},
  costs = {},
  engineParams = {},
  onConstraintChange,
  onConstraintRemove,
  onCostChange,
  onCostRemove,
  onEngineParamChange,
  onEngineParamRemove,
}) {
  const [openEngine, setOpenEngine] = useState(null);
  // Engine-native param names fetched live from the OEO /{framework} endpoint,
  // keyed by engine id. Falls back to the static catalog when offline / no uuid.
  const [dbParams, setDbParams] = useState({});

  const loadDbParams = (engineId) => {
    if (!techUuid || dbParams[engineId] !== undefined) return;
    fetchTechFramework(techUuid, engineId)
      .then((resp) => setDbParams((prev) => ({ ...prev, [engineId]: frameworkParamNames(resp) })))
      .catch(() => setDbParams((prev) => ({ ...prev, [engineId]: [] })));
  };

  const commonDefs = commonParamsForParent(parent);
  const commonValue = (def) =>
    def.calliope.kind === 'constraint' ? constraints[def.calliope.name] : costs[def.calliope.name];
  const setCommon = (def, value) =>
    def.calliope.kind === 'constraint'
      ? onConstraintChange(def.calliope.name, value)
      : onCostChange(def.calliope.name, value);
  const clearCommon = (def) =>
    def.calliope.kind === 'constraint'
      ? onConstraintRemove(def.calliope.name)
      : onCostRemove(def.calliope.name);

  // Calliope raw = fields not already surfaced as a common param.
  const rawConstraints = Object.entries(constraints).filter(([k]) => !COMMON_CALLIOPE_CONSTRAINTS.has(k));
  const rawCosts = Object.entries(costs).filter(([k]) => !COMMON_CALLIOPE_COSTS.has(k));
  const rawConstraintOptions = (PARENT_CONSTRAINTS[parent] || [])
    .filter((c) => !COMMON_CALLIOPE_CONSTRAINTS.has(c) && !(c in constraints))
    .map((c) => ({ key: c, desc: CONSTRAINT_DEFINITIONS[c]?.desc }));
  const rawCostOptions = RAW_COST_KEYS
    .filter((c) => !COMMON_CALLIOPE_COSTS.has(c) && !(c in costs))
    .map((c) => ({ key: c, desc: COST_DEFINITIONS[c]?.desc }));

  return (
    <div className="space-y-4">
      {/* ── Common (ontology) parameters ─────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">{tr("Common parameters")}</p>
        <div className="space-y-2">
          {commonDefs.map((def) => {
            const val = commonValue(def);
            const set = val !== undefined && val !== null && val !== '';
            return (
              <div key={def.id} className="flex items-center gap-2">
                <label
                  className="text-[11px] text-slate-600 w-44 flex-shrink-0"
                  title={tr("{0}\n\nCalliope: {1}", { 0: tr(def.description), 1: def.calliope.name })}
                >
                  {tr(def.label)}
                  <span className="text-slate-400"> ({tr(def.unit)})</span>
                </label>
                <input
                  type="text"
                  value={val ?? ''}
                  onChange={(e) => setCommon(def, coerce(e.target.value))}
                  placeholder={tr("not set")}
                  className="flex-1 px-2 py-0.5 text-xs border border-black/15 rounded focus:ring-1 focus:ring-gray-400 font-mono"
                />
                <button
                  onClick={() => clearCommon(def)}
                  disabled={!set}
                  className="text-slate-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-slate-300"
                  title={tr("Clear")}
                >
                  <FiX size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Engine-specific parameters ───────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1">{tr("Engine-specific parameters")}</p>

        {/* Calliope raw power-user panel */}
        <EngineSection
          id="calliope"
          label={tr("Calliope (advanced)")}
          open={openEngine === 'calliope'}
          onToggle={() => setOpenEngine(openEngine === 'calliope' ? null : 'calliope')}
          count={rawConstraints.length + rawCosts.length}
        >
          <p className="text-[11px] font-semibold text-slate-500 mb-1">{tr("Constraints")}</p>
          {rawConstraints.length === 0 && <p className="text-[11px] text-slate-400 italic mb-1">{tr("none")}</p>}
          <div className="space-y-1">
            {rawConstraints.map(([k, v]) => (
              <ParamRow
                key={k}
                name={k}
                value={v}
                onChange={(val) => onConstraintChange(k, val)}
                onRemove={() => onConstraintRemove(k)}
              />
            ))}
          </div>
          <AddFromList label={tr("+ Add constraint…")} options={rawConstraintOptions} onAdd={(k) => onConstraintChange(k, '')} />

          <p className="text-[11px] font-semibold text-slate-500 mt-3 mb-1">{tr("Costs (monetary)")}</p>
          {rawCosts.length === 0 && <p className="text-[11px] text-slate-400 italic mb-1">{tr("none")}</p>}
          <div className="space-y-1">
            {rawCosts.map(([k, v]) => (
              <ParamRow
                key={k}
                name={k}
                value={v}
                onChange={(val) => onCostChange(k, val)}
                onRemove={() => onCostRemove(k)}
              />
            ))}
          </div>
          <AddFromList label={tr("+ Add cost…")} options={rawCostOptions} onAdd={(k) => onCostChange(k, '')} />
        </EngineSection>

        {/* Non-Calliope engines */}
        {NON_CALLIOPE_ENGINES.map(({ id, label }) => {
          const params = engineParams[id] || {};
          const entries = Object.entries(params);
          const catalog = ENGINE_PARAM_CATALOG[id] || {};
          const optionKeys = [...new Set([...Object.keys(catalog), ...(dbParams[id] || [])])];
          const options = optionKeys
            .filter((k) => !(k in params))
            .map((k) => ({ key: k, desc: catalog[k] || tr("from technology database") }));
          return (
            <EngineSection
              key={id}
              id={id}
              label={label}
              open={openEngine === id}
              onToggle={() => {
                const next = openEngine === id ? null : id;
                setOpenEngine(next);
                if (next === id) loadDbParams(id);
              }}
              count={entries.length}
            >
              {entries.length === 0 && (
                <p className="text-[11px] text-slate-400 italic mb-1">
                  {tr("No")} {label}{tr("-specific parameters. These override the values translated from the common parameters when the model is run/exported on")} {label}.
                </p>
              )}
              <div className="space-y-1">
                {entries.map(([k, v]) => (
                  <ParamRow
                    key={k}
                    name={k}
                    value={v}
                    onChange={(val) => onEngineParamChange(id, k, val)}
                    onRemove={() => onEngineParamRemove(id, k)}
                  />
                ))}
              </div>
              <AddFromList label={tr("+ Add {0} parameter…", { 0: label })} options={options} onAdd={(k) => onEngineParamChange(id, k, '')} />
              <AddFreeForm onAdd={(k) => onEngineParamChange(id, k, '')} />
            </EngineSection>
          );
        })}
      </div>
    </div>
  );
}

function EngineSection({ label, open, onToggle, count, children }) {
  return (
    <div className="border border-black/15 rounded-lg overflow-hidden mb-1.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
          {open ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
          {label}
          {count > 0 && <span className="text-slate-400">({count})</span>}
        </span>
      </button>
      {open && <div className="p-3 bg-white">{children}</div>}
    </div>
  );
}
