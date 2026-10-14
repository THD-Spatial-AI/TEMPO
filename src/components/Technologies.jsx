import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LuListFilter } from './ui/icons';
import { FiSearch, FiEdit2, FiX, FiSave, FiTrash2, FiChevronDown, FiChevronRight as FiChevronRightIcon, FiArrowRight, FiHelpCircle, FiCopy, FiZap, FiSun, FiDatabase, FiRefreshCw, FiShare2, FiBarChart2, FiStar, FiPlus, FiCheck, FiExternalLink } from './ui/icons';
import { useData } from '../context/DataContext';
import SaveBar from './ui/SaveBar';
import Select from './ui/Select';
import { TECH_TEMPLATES, PARENT_TYPES, useLiveTechTemplates } from './TechnologiesData';
import { fetchTechFramework, oeoDetailToCalliope } from '../services/techDatabaseApi';
import { CARRIERS, CARRIERS_BY_GROUP, getCarrierColor, getCarrierLabel } from '../config/carriers';
import {
  CONSTRAINT_DEFINITIONS,
  COST_DEFINITIONS,
} from '../utils/constraintDefinitions';
import TechParameterEditor from './creation/TechParameterEditor';

// ── Carrier helpers ──────────────────────────────────────────────────────────
function CarrierPill({ carrierId }) {
  const color = getCarrierColor(carrierId);
  const label = getCarrierLabel(carrierId);
  const icon  = CARRIERS[carrierId]?.icon ?? '•';
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium border"
      style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color }}
    >
      {icon} {label}
    </span>
  );
}

function CarrierSelect({ value, onChange, className = '' }) {
  return (
    <select value={value ?? ''} onChange={onChange} className={className}>
      <option value="">— select —</option>
      {Object.entries(CARRIERS_BY_GROUP).map(([group, carriers]) => (
        <optgroup key={group} label={group}>
          {carriers.map(c => (
            <option key={c.id} value={c.id}>{c.icon}  {c.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function MultiCarrierEditor({ values = [], onChange }) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState('');

  const remove = (id) => onChange(values.filter(v => v !== id));
  const add = () => {
    if (picked && !values.includes(picked)) onChange([...values, picked]);
    setPicked('');
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {values.map(id => (
        <span
          key={id}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border"
          style={{ backgroundColor: `${getCarrierColor(id)}18`, borderColor: `${getCarrierColor(id)}40`, color: getCarrierColor(id) }}
        >
          {CARRIERS[id]?.icon ?? '•'} {getCarrierLabel(id)}
          <button
            type="button"
            onClick={() => remove(id)}
            className="ml-0.5 hover:text-gray-500 text-inherit opacity-60 hover:opacity-100"
          >&times;</button>
        </span>
      ))}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs border border-dashed border-slate-400 text-slate-500 hover:border-gray-500 hover:text-gray-700"
        >
          <FiPlus size={10}/> Add
        </button>
      ) : (
        <span className="flex items-center gap-1">
          <CarrierSelect
            value={picked}
            onChange={e => setPicked(e.target.value)}
            className="text-xs border border-black/15 rounded px-1.5 py-0.5 focus:outline-none"
          />
          <button type="button" onClick={add} disabled={!picked}
            className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-30">✓</button>
          <button type="button" onClick={() => { setAdding(false); setPicked(''); }}
            className="text-xs text-slate-400 hover:text-gray-600">&times;</button>
        </span>
      )}
    </div>
  );
}

// ── Category metadata ────────────────────────────────────────────────────────
const CATEGORY_META = {
  supply_plus:     { color: '#f59e0b', label: 'Variable Renewables',              icon: 'sun'       },
  supply:          { color: '#3b82f6', label: 'Dispatchable Generation',          icon: 'zap'       },
  storage:         { color: '#8b5cf6', label: 'Storage',                          icon: 'database'  },
  conversion_plus: { color: '#10b981', label: 'Conversion & Sector Coupling',     icon: 'refresh'   },
  transmission:    { color: '#64748b', label: 'Transmission (Lines & Pipelines)', icon: 'share'     },
  distribution:    { color: '#0ea5e9', label: 'Distribution',                     icon: 'star'      },
  demand:          { color: '#ef4444', label: 'Demand',                           icon: 'bar-chart' },
};

const CATEGORY_ORDER = ['supply_plus', 'supply', 'storage', 'conversion_plus', 'transmission', 'distribution', 'demand'];

// Quick "type" filters, matched against a technology's key and display name.
const TECH_TYPES = [
  { id: 'solar',      label: 'Solar',      match: /solar|\bpv\b|photovolt|\bcsp\b/ },
  { id: 'wind',       label: 'Wind',       match: /wind/ },
  { id: 'hydro',      label: 'Hydro',      match: /hydro(?!gen)|run.of.river|pumped/ },
  { id: 'geothermal', label: 'Geothermal', match: /geotherm/ },
  { id: 'marine',     label: 'Marine',     match: /marine|tidal|\bwave/ },
  { id: 'gas',        label: 'Gas',        match: /\bgas\b|ccgt|ocgt|methane|natural.gas/ },
  { id: 'coal',       label: 'Coal',       match: /coal|lignite/ },
  { id: 'nuclear',    label: 'Nuclear',    match: /nuclear|\bsmr\b|reactor/ },
  { id: 'biomass',    label: 'Biomass',    match: /bio|waste/ },
  { id: 'battery',    label: 'Battery',    match: /batter|li.?ion|lithium/ },
  { id: 'hydrogen',   label: 'Hydrogen',   match: /hydrogen|\bh2\b|electroly|fuel.cell/ },
  { id: 'heat',       label: 'Heat',       match: /heat|boiler|(?<!geo)thermal/ },
];

const techText = (techName, tech) =>
  `${techName} ${tech.name || ''} ${tech.essentials?.name || ''}`.replace(/_/g, ' ').toLowerCase();

const carrierName = (id) => {
  const label = getCarrierLabel(id);
  return label === id ? formatName(id) : label;
};

const techCarriers = (tech) => {
  const ess = tech.essentials || {};
  return [ess.carrier_in, ess.carrier_out, ess.carrier].flat().filter(Boolean);
};

const customScrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: rgba(100,116,139,0.1); border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
`;

function formatName(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatParamKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function CategoryIcon({ iconKey, size = 14, color }) {
  const icons = { sun: FiSun, zap: FiZap, database: FiDatabase, refresh: FiRefreshCw, share: FiShare2, 'bar-chart': FiBarChart2, star: FiStar };
  const Icon = icons[iconKey] || FiZap;
  return <Icon size={size} style={{ color }} />;
}

// ── Source badge ─────────────────────────────────────────────────────────────
function OpenTechBadge({ isApiLoading, isApiLive, techCount }) {
  if (isApiLoading) {
    return (
      <div className="mx-3 mb-3 p-3 bg-slate-50 border border-black/15 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse flex-shrink-0" />
          <span className="text-xs text-slate-500">Connecting to OpenTech·DB…</span>
        </div>
      </div>
    );
  }

  if (!isApiLive) {
    return (
      <div className="mx-3 mb-3 p-3 bg-slate-50 border border-black/15 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 font-medium">Static fallback</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{techCount} built-in templates</p>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border border-black/15 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-slate-800">OpenTech·DB</span>
        </div>
        <a
          href="https://otdb.th-deg.de/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-slate-900"
          title="Swagger UI"
          onClick={e => e.stopPropagation()}
        >
          <FiExternalLink size={11} />
        </a>
      </div>
      <p className="mt-1 text-[11px] text-slate-500"><span className="font-mono">otdb.th-deg.de</span> · {techCount} loaded</p>
    </div>
  );
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div>
      {[0, 1].map(row => (
        <div key={row} className="mb-8">
          <div className="h-5 w-48 bg-slate-200 rounded animate-pulse mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-black/15 h-32 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tech Card ────────────────────────────────────────────────────────────────
const TechCard = ({ techName, tech, isCustom, onDuplicate, onEdit, onDelete, onOpenDetail }) => {
  const { technologies, addTechToModel, removeTechFromModel, currentModelId } = useData();
  const meta = CATEGORY_META[tech.parent] || { color: '#94a3b8' };
  const inModel = currentModelId && technologies.some(t => t.name === techName);
  const displayName = tech.essentials?.name || formatName(techName);
  const instances = tech.instances || [];

  // Always display first instance as default; user browses the rest in DetailPanel
  const firstInstance = instances[0];
  const constraints = firstInstance
    ? { ...tech.constraints, ...firstInstance.constraints }
    : (tech.constraints || {});
  const monetary = firstInstance
    ? { ...(tech.costs?.monetary || {}), ...(firstInstance.monetary || {}) }
    : (tech.costs?.monetary || {});

  const rawInst = firstInstance?.raw || {};

  const capexVal  = rawInst.capex_per_kw?.value  ?? monetary.energy_cap;
  const capexUnit = rawInst.capex_per_kw?.unit   ?? '$/kW';
  const ltVal     = rawInst.lifetime_years?.value ?? constraints.lifetime;
  const cfRaw     = rawInst.capacity_factor?.value;
  const effVal    = cfRaw != null ? cfRaw : (constraints.energy_eff != null ? constraints.energy_eff : null);
  const effDisplay = effVal != null ? `${(effVal * (effVal <= 1 ? 100 : 1)).toFixed(0)}%` : null;

  const ess = tech.essentials || {};
  const carrierIn  = ess.carrier_in  ? (Array.isArray(ess.carrier_in)  ? ess.carrier_in  : [ess.carrier_in])  : [];
  const carrierOut = ess.carrier_out ? (Array.isArray(ess.carrier_out) ? ess.carrier_out : [ess.carrier_out]) : [];
  const carrier    = ess.carrier ? [ess.carrier] : [];

  const handleDup = (e) => {
    e.stopPropagation();
    const techToUse = firstInstance
      ? {
          ...tech,
          constraints: { ...tech.constraints, ...firstInstance.constraints },
          costs: { monetary: { ...(tech.costs?.monetary || {}), ...(firstInstance.monetary || {}) } },
        }
      : tech;
    onDuplicate(techName, techToUse);
  };

  // Compact number formatter for card stat cells
  const fmtStat = (val) => {
    if (typeof val !== 'number') return String(val);
    if (val >= 10000) return `${(val / 1000).toFixed(0)}k`;
    if (val >= 1000)  return `${(val / 1000).toFixed(1)}k`;
    return Number.isInteger(val) ? String(val) : parseFloat(val.toPrecision(3)).toString();
  };

  // Build stat cells — only non-null values
  const stats = [
    capexVal != null ? { label: 'CAPEX', value: fmtStat(capexVal), unit: capexUnit } : null,
    ltVal    != null ? { label: 'Life',  value: fmtStat(ltVal),    unit: 'yr'      } : null,
    effDisplay       ? { label: 'CF',    value: effDisplay,         unit: null      } : null,
  ].filter(Boolean);

  return (
    <div
      className="group relative flex cursor-pointer flex-col rounded-xl border border-black/15 bg-white  transition-all duration-150 hover:-translate-y-0.5 hover:border-black/15 hover:"
      onClick={() => !isCustom && onOpenDetail && onOpenDetail(tech)}
    >
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ backgroundColor: `${meta.color}18` }}
          >
            <CategoryIcon iconKey={meta.icon} size={14} color={meta.color} />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{displayName}</h4>
            {tech.oeo_class && (
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{tech.oeo_class}</p>
            )}
          </div>
          {instances.length > 1 && (
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600" title={`${instances.length} variants`}>
              {instances.length}
            </span>
          )}
        </div>

        {(carrierIn.length > 0 || carrierOut.length > 0 || carrier.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {carrierIn.map(c  => <CarrierPill key={`in-${c}`}  carrierId={c} />)}
            {carrierOut.map(c => <CarrierPill key={`out-${c}`} carrierId={c} />)}
            {carrier.map(c    => <CarrierPill key={`c-${c}`}   carrierId={c} />)}
          </div>
        )}

        <div className="flex-1" />

        {stats.length > 0 && (
          <div
            className="mt-3 grid divide-x divide-black/15 rounded-lg bg-slate-50 py-1.5"
            style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
          >
            {stats.map(({ label, value, unit }) => (
              <div key={label} className="min-w-0 px-1 text-center">
                <p className="truncate font-mono text-[13px] font-semibold tabular-nums leading-tight text-slate-900">{value}</p>
                <p className="truncate text-[9px] uppercase tracking-wide text-slate-400">
                  {label}{unit ? <span className="normal-case"> {unit}</span> : null}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-0.5 border-t border-black/10 px-2 py-1.5"
        onClick={e => e.stopPropagation()}
      >
        {!isCustom ? (
          <>
            <button
              onClick={handleDup}
              className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Duplicate to My Technologies"
            >
              <FiCopy size={11} /> Duplicate
            </button>
            {currentModelId && tech.uuid && (
              inModel ? (
                <button
                  onClick={() => removeTechFromModel(techName)}
                  className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  title="Remove from active model"
                >
                  <FiCheck size={11} /> In model
                </button>
              ) : (
                <button
                  onClick={() => addTechToModel(oeoDetailToCalliope(tech))}
                  className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  title="Add to active model"
                >
                  <FiPlus size={11} /> Add
                </button>
              )
            )}
            <button
              onClick={() => onOpenDetail && onOpenDetail(tech)}
              className="ml-auto flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              {instances.length > 1 ? `${instances.length} variants` : 'View'}
              <FiChevronRightIcon size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onEdit(techName, tech)}
              className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <FiEdit2 size={11} /> Edit
            </button>
            <button
              onClick={() => onDelete(techName)}
              className="ml-auto flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <FiTrash2 size={11} /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Category section ─────────────────────────────────────────────────────────
const CategorySection = ({ categoryKey, items, isCustomSection = false }) => {
  const meta = CATEGORY_META[categoryKey] || { icon: 'zap', color: '#94a3b8', label: formatName(categoryKey) };
  const label = meta.label;
  if (items.length === 0) return null;

  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: `${meta.color}18` }}
        >
          <CategoryIcon iconKey={meta.icon} size={14} color={meta.color} />
        </span>
        <h3 className="text-base font-semibold text-slate-900">{label}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {items.length}
        </span>
        {isCustomSection && (
          <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            custom
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {items.map(({ techName, tech, isCustom, onDuplicate, onEdit, onDelete, onOpenDetail }) => (
          <TechCard
            key={techName}
            techName={techName}
            tech={tech}
            isCustom={isCustom}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  );
};

// ── Detail panel ─────────────────────────────────────────────────────────────
// ── Constraint / cost formatting helpers ─────────────────────────────────────
const COST_UNITS = {
  energy_cap: '$/kW', storage_cap: '$/kWh', resource_cap: '$/unit',
  resource_area: '$/m²', purchase: '$', energy_cap_per_distance: '$/kW/km',
  purchase_per_distance: '$/km', om_annual: '$/kW/yr',
  om_annual_investment_fraction: 'fraction', om_prod: '$/kWh', om_con: '$/kWh',
  interest_rate: 'fraction', depreciation_rate: 'fraction/yr', export: '$/kWh',
};
const CONSTRAINT_UNITS = {
  energy_eff: '%', resource_eff: '%', parasitic_eff: '%', energy_eff_per_distance: '%/km',
  energy_ramping: '%/hr', storage_loss: '%/hr', charge_rate: 'C-rate',
  storage_initial: '0–1', storage_discharge_depth: '0–1',
  energy_cap_min_use: '0–1', resource_min_use: '0–1',
  lifetime: 'yr', storage_time_max: 'hr',
  energy_cap_max: 'kW', energy_cap_min: 'kW', energy_cap_equals: 'kW',
  storage_cap_max: 'kWh', storage_cap_min: 'kWh', storage_cap_equals: 'kWh',
  energy_cap_per_storage_cap_equals: 'ratio', energy_cap_per_storage_cap_min: 'ratio', energy_cap_per_storage_cap_max: 'ratio',
  resource_area_max: 'm²', resource_area_min: 'm²', resource_area_equals: 'm²',
  resource_area_per_energy_cap: 'm²/kW', energy_cap_per_unit: 'kW/unit',
};
function fmtConstraint(key, value) {
  if (typeof value !== 'number') return String(value);
  const isPct = ['energy_eff','resource_eff','parasitic_eff','energy_eff_per_distance','energy_ramping','storage_loss'].includes(key);
  if (isPct) return `${(value * 100).toFixed(1)}%`;
  if (value > 1000) return value.toLocaleString();
  if (Number.isInteger(value)) return String(value);
  return parseFloat(value.toPrecision(4)).toString();
}
function groupBy(obj, defMap) {
  const groups = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    const group = defMap[key]?.group || 'Other';
    if (!groups[group]) groups[group] = [];
    groups[group].push({ key, value, def: defMap[key] });
  }
  return Object.entries(groups);
}

// ── Framework export sub-components ─────────────────────────────────────────
function FwSectionHeader({ label }) {
  return (
    <div className="border-b border-black/15 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
    </div>
  );
}

function FwParamGroup({ title, children }) {
  return (
    <div className="border-b border-black/10 last:border-0">
      <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div>{children}</div>
    </div>
  );
}

function FwParamRow({ code, value, unit, desc }) {
  return (
    <div
      className="flex items-start gap-3 px-3 py-1.5 transition-colors hover:bg-slate-50"
      title={desc || undefined}
    >
      <code className="w-2/5 shrink-0 truncate pt-px font-mono text-[11px] text-slate-500">{code}</code>
      <div className="min-w-0 flex-1 text-right [overflow-wrap:anywhere]">
        <span className="font-mono text-[12px] font-semibold tabular-nums text-slate-900">{value}</span>
        {unit && <span className="ml-1 text-[10px] text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

function FrameworkDataView({ engine, data }) {
  if (engine === 'calliope') {
    const { essentials = {}, constraints = {}, costs = {} } = data;
    const monetary = costs.monetary || {};
    const hasCosts = Object.keys(monetary).length > 0;
    const hasConstraints = Object.keys(constraints).length > 0;
    return (
      <div className="space-y-3 p-3">
        {Object.keys(essentials).length > 0 && (
          <section className="overflow-hidden rounded-xl border border-black/15 bg-white">
            <FwSectionHeader label="Essentials" />
            {Object.entries(essentials).map(([k, v]) => (
              <FwParamRow key={k} code={k} value={String(v)} />
            ))}
          </section>
        )}
        {hasCosts && (
          <section className="overflow-hidden rounded-xl border border-black/15 bg-white">
            <FwSectionHeader label="Costs" />
            {groupBy(monetary, COST_DEFINITIONS).map(([group, items]) => (
              <FwParamGroup key={group} title={group}>
                {items.map(({ key, value, def }) => (
                  <FwParamRow
                    key={key}
                    code={key}
                    value={typeof value === 'number' ? value.toLocaleString() : String(value)}
                    unit={COST_UNITS[key]}
                    desc={def?.desc}
                  />
                ))}
              </FwParamGroup>
            ))}
          </section>
        )}
        {hasConstraints && (
          <section className="overflow-hidden rounded-xl border border-black/15 bg-white">
            <FwSectionHeader label="Constraints" />
            {groupBy(constraints, CONSTRAINT_DEFINITIONS).map(([group, items]) => (
              <FwParamGroup key={group} title={group}>
                {items.map(({ key, value, def }) => (
                  <FwParamRow
                    key={key}
                    code={key}
                    value={fmtConstraint(key, value)}
                    unit={CONSTRAINT_UNITS[key]}
                    desc={def?.desc}
                  />
                ))}
              </FwParamGroup>
            ))}
          </section>
        )}
        {!hasCosts && !hasConstraints && (
          <p className="text-xs text-slate-400 text-center py-6">No parameters in Calliope export for this instance.</p>
        )}
      </div>
    );
  }

  // Generic renderer — works for PyPSA, OSeMOSYS, AdOpT-NET0
  const units = data._units || {};
  const publicEntries = Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'OpenTechDB');

  return (
    <div className="space-y-3 p-3">
      {publicEntries.map(([section, val]) => {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          const sectionUnits = units[section];
          return (
            <section key={section} className="overflow-hidden rounded-xl border border-black/15 bg-white">
              <FwSectionHeader label={section} />
              {Object.entries(val).filter(([k]) => !k.startsWith('_')).map(([k, v]) => {
                const unit = typeof sectionUnits === 'object' && sectionUnits !== null ? sectionUnits[k] : null;
                const display = Array.isArray(v) ? v.join(', ') : (typeof v === 'number' ? v.toLocaleString() : String(v ?? '—'));
                return <FwParamRow key={k} code={k} value={display} unit={unit} />;
              })}
            </section>
          );
        }
        const unit = typeof units === 'object' && !Array.isArray(units) ? units[section] : null;
        const display = Array.isArray(val) ? val.join(', ') : (typeof val === 'number' ? val.toLocaleString() : String(val ?? '—'));
        return <FwParamRow key={section} code={section} value={display} unit={unit} />;
      })}
    </div>
  );
}

const ENGINES = [
  { id: 'calliope',  label: 'Calliope' },
  { id: 'pypsa',     label: 'PyPSA' },
  { id: 'osemosys',  label: 'OSeMOSYS' },
  { id: 'adoptnet0', label: 'AdOpT-NET0' },
];

function DetailPanel({ tech, onClose, onDuplicate }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paramView, setParamView] = useState('framework');
  const [engine, setEngine] = useState('calliope');
  const [fwResultKey, setFwResultKey] = useState(null);
  const [frameworkData, setFrameworkData] = useState(null);
  const [frameworkError, setFrameworkError] = useState(null);

  // Computed before hooks — safe with optional chaining since tech may be null
  const instances = tech?.instances || [];
  const safeActiveIdx = instances[activeIdx] ? activeIdx : 0;

  // Derive a stable key for the current fetch request
  const fwKey = (tech?.uuid && paramView === 'framework')
    ? `${tech?.uuid}::${engine}::${safeActiveIdx}`
    : null;
  // Loading when there is a pending key that hasn't been resolved yet
  const frameworkLoading = fwKey !== null && fwResultKey !== fwKey;

  useEffect(() => {
    if (!fwKey) return;
    const key = fwKey;
    let cancelled = false;
    fetchTechFramework(tech.uuid, engine, safeActiveIdx)
      .then(data => {
        if (!cancelled) {
          setFrameworkData(data || null);
          setFrameworkError(null);
          setFwResultKey(key);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setFrameworkData(null);
          setFrameworkError(err.message || 'Failed to fetch framework data');
          setFwResultKey(key);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fwKey]);

  if (!tech) return null;

  const meta = CATEGORY_META[tech.parent] || { color: '#94a3b8', label: formatName(tech.parent) };

  const inst = instances[safeActiveIdx];
  const raw = inst?.raw || {};

  // Build parameter rows from raw API ParameterValue objects
  const paramRows = Object.entries(raw)
    .filter(([key]) => key !== 'label')
    .filter(([, val]) => val != null && typeof val === 'object' && 'value' in val)
    .map(([key, val]) => ({
      key,
      label: formatParamKey(key),
      value: val.value,
      unit: val.unit && val.unit !== '—' ? val.unit : null,
      min: val.min,
      max: val.max,
      source: val.source,
      year: val.year,
    }));

  const fallbackRows = paramRows.length === 0
    ? [
        ...Object.entries(inst?.constraints || tech.constraints || {}).map(([k, v]) => ({
          key: k, label: formatParamKey(k), value: v, unit: null, source: null, year: null,
        })),
        ...Object.entries(inst?.monetary || tech.costs?.monetary || {}).map(([k, v]) => ({
          key: k, label: formatParamKey(k), value: v, unit: k === 'interest_rate' ? 'fraction' : '$/kW', source: null, year: null,
        })),
      ]
    : [];

  const rows = paramRows.length > 0 ? paramRows : fallbackRows;

  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      className="absolute top-0 right-0 bottom-0 z-40 flex w-[440px] max-w-full flex-col overflow-hidden border-l border-black/15 bg-white shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-black/15 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${meta.color}18` }}>
          <CategoryIcon iconKey={meta.icon} size={18} color={meta.color} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-slate-900">
            {tech.essentials?.name || formatName(tech.name)}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
            >
              {meta.label}
            </span>
            {tech.oeo_class && (
              <a
                href="https://openenergy-platform.org/ontology/oeo/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-700"
                title="Open Energy Ontology"
              >
                {tech.oeo_class} <FiExternalLink size={10} />
              </a>
            )}
          </div>
          {tech.description && (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-500" title={tech.description}>{tech.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <FiX size={16} />
        </button>
      </div>

      {instances.length > 0 && (
        <div className="shrink-0 border-b border-black/10 px-5 py-3">
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Variant <span className="font-normal text-slate-400">· {instances.length} available</span>
          </label>
          <Select
            value={safeActiveIdx}
            onChange={setActiveIdx}
            options={instances.map((i, idx) => ({
              value: idx,
              label: i.displayLabel || i.label || `Variant ${idx + 1}`,
              description: i.life_cycle_stage || undefined,
            }))}
          />
        </div>
      )}

      <div className="shrink-0 px-5 pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50">
          {[['framework', 'Framework export'], ['source', 'Source data']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setParamView(id)}
              className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                paramView === id ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Parameter views */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">

        {/* ── Framework Export tab ────────────────────────────────────── */}
        {paramView === 'framework' && (
          <div className="flex flex-col">
            {/* Engine selector */}
            <div className="px-5 pb-1 pt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-600">Engine</p>
              <div role="radiogroup" aria-label="Engine" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/80 p-1 ring-1 ring-inset ring-slate-300/50">
                {ENGINES.map(eng => (
                  <button
                    key={eng.id}
                    role="radio"
                    aria-checked={engine === eng.id}
                    onClick={() => setEngine(eng.id)}
                    className={`truncate rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                      engine === eng.id ? 'bg-black text-white ' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                  >
                    {eng.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Framework data */}
            {!tech.uuid ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-slate-400">Framework export not available.</p>
                <p className="text-[10px] text-slate-300 mt-1">Only OpenTech-DB technologies have framework exports.</p>
              </div>
            ) : frameworkLoading ? (
              <div className="px-4 py-8 text-center">
                <div className="w-4 h-4 border-2 border-black/15 border-t-slate-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-[11px] text-slate-400">Loading {engine} parameters…</p>
              </div>
            ) : frameworkError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-red-400 font-medium">Export unavailable</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto">{frameworkError}</p>
              </div>
            ) : frameworkData ? (
              <FrameworkDataView engine={engine} data={frameworkData} />
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-slate-400">No data returned for this instance.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Source Data tab ───────────────────────────────────────────── */}
        {paramView === 'source' && (
          rows.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-black/15">
                  <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 w-2/5">Parameter</th>
                  <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Value</th>
                  <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unit</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(({ key, label, value, unit, min, max, source, year }) => {
                  const pct = min != null && max != null && max !== min
                    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
                    : null;
                  return (
                    <tr key={key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 font-medium text-slate-700 text-[11px]">{label}</td>
                      <td className="px-2 py-2 text-right font-mono text-slate-800">
                        {typeof value === 'number' ? value.toLocaleString() : String(value ?? '—')}
                        {pct !== null && (
                          <div className="mt-1 h-0.5 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-500 text-[11px]">{unit || '—'}</td>
                      <td
                        className="px-3 py-2 text-slate-400 text-[10px] italic leading-tight truncate max-w-[120px]"
                        title={[source, year ? `· ${year}` : ''].filter(Boolean).join(' ') || undefined}
                      >
                        {source || '—'}
                        {year && <span className="not-italic text-slate-300 ml-1">· {year}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-slate-400">No raw API parameter data available.</p>
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-black/15 bg-white px-5 py-3">
        <button
          onClick={() => onDuplicate(tech.name || tech.id, tech)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-black text-sm font-semibold text-white  transition-colors hover:bg-black/80"
        >
          <FiCopy size={14} /> Duplicate to My Technologies
        </button>
        {tech.source_url && (
          <a
            href={tech.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full flex items-center justify-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
          >
            <FiExternalLink size={10} /> Source reference
          </a>
        )}
      </div>
    </motion.aside>
  );
}

function FilterRow({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({ label, count, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 border px-3 py-1 text-xs font-medium transition-all ${
        active ? 'border-slate-900 bg-black text-white ' : 'border-black/15 bg-white text-slate-600 hover:border-black/15 hover:text-slate-900'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      <span className={`tabular-nums ${active ? 'text-white/60' : 'text-slate-400'}`}>{count}</span>
    </button>
  );
}

function FilterTag({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black py-1 pl-2.5 pr-1 text-xs font-medium text-white">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label} filter`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-white/20">
        <FiX size={11} />
      </button>
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function Technologies() {
  const { technologies, setTechnologies, currentModelId } = useData();
  const [searchTerm, setSearchTerm]             = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showOnlyCustom, setShowOnlyCustom]     = useState(false);
  const [showFilters, setShowFilters]           = useState(false);
  const [typeFilters, setTypeFilters]           = useState([]);
  const [carrierFilters, setCarrierFilters]     = useState([]);
  const [editingTech, setEditingTech]           = useState(null);
  const [editForm, setEditForm]                 = useState(null);
  const [detailTech, setDetailTech]             = useState(null);

  const { techTemplates: liveTechTemplates, isLive: isApiLive, isLoading: isApiLoading } = useLiveTechTemplates();


  // All template technologies (live or static fallback)
  const allTechnologies = useMemo(() => {
    const combined = {};
    Object.values(liveTechTemplates).forEach(categoryTechs => {
      if (Array.isArray(categoryTechs)) {
        categoryTechs.forEach(tech => { combined[tech.name] = { ...tech, isTemplate: true }; });
      }
    });
    return combined;
  }, [liveTechTemplates]);

  // Handlers
  const handleDuplicate = (techName, overrideTech) => {
    const tech = overrideTech || allTechnologies[techName];
    if (!tech) return;
    // eslint-disable-next-line react-hooks/purity
    const newName = `${techName}_copy_${Date.now()}`;
    const newTech = JSON.parse(JSON.stringify(tech));
    newTech.name = newName;
    newTech.essentials = { ...(newTech.essentials || {}), name: newName };
    delete newTech.isTemplate;
    delete newTech.instances;
    setTechnologies([...technologies, newTech]);
    setDetailTech(null);
    alert(`Technology "${newName}" added to My Technologies!`);
  };

  const handleEdit = (techName, tech) => {
    setEditingTech(techName);
    setEditForm(JSON.parse(JSON.stringify(tech)));
  };

  const handleSaveEdit = () => {
    if (!editForm || !editingTech) return;
    setTechnologies(technologies.map(t => t.name === editingTech ? editForm : t));
    setEditingTech(null);
    setEditForm(null);
  };

  const handleCancelEdit = () => { setEditingTech(null); setEditForm(null); };

  const handleDeleteTech = () => {
    if (!editingTech) return;
    if (window.confirm(`Are you sure you want to delete "${editingTech}"?`)) {
      setTechnologies(technologies.filter(t => t.name !== editingTech));
      setEditingTech(null);
      setEditForm(null);
    }
  };

  const handleDeleteFromCard = (techName) => {
    if (window.confirm(`Are you sure you want to delete "${techName}"?`)) {
      setTechnologies(technologies.filter(t => t.name !== techName));
    }
  };

  const matchesFilters = (techName, tech) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const haystack = `${techText(techName, tech)} ${tech.description || ''} ${tech.oeo_class || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (typeFilters.length > 0) {
      const text = techText(techName, tech);
      if (!TECH_TYPES.some(t => typeFilters.includes(t.id) && t.match.test(text))) return false;
    }
    if (carrierFilters.length > 0 && !techCarriers(tech).some(c => carrierFilters.includes(carrierName(c)))) return false;
    return true;
  };
  const toggleIn = (setter) => (id) => setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const activeFilterCount = typeFilters.length + carrierFilters.length;
  const clearFilters = () => { setTypeFilters([]); setCarrierFilters([]); setSearchTerm(''); };

  // Determine transmission display category
  const getDisplayCategory = (tech, techName) => {
    if (tech.parent !== 'transmission') return tech.parent;
    const lower = ((techName || '') + ' ' + (tech.name || '')).toLowerCase();
    const linearKw = ['line', 'cable', 'pipeline', 'network', 'overhead', 'subsea', 'underground', 'heating', 'cooling', 'hvac', 'hvdc', 'district'];
    const isLinear = linearKw.some(k => lower.includes(k));
    const hasPerDist = tech.costs?.monetary?.energy_cap_per_distance !== undefined;
    return (isLinear || hasPerDist) ? 'transmission' : 'distribution';
  };

  const groupedTechs = useMemo(() => {
    const grouped = {};
    Object.entries(allTechnologies).forEach(([techName, tech]) => {
      if (showOnlyCustom || !matchesFilters(techName, tech)) return;
      const displayCategory = getDisplayCategory(tech, techName);
      if (selectedCategory !== 'all' && displayCategory !== selectedCategory) return;
      if (!grouped[displayCategory]) grouped[displayCategory] = [];
      grouped[displayCategory].push({
        techName, tech, isCustom: false,
        onDuplicate: handleDuplicate, onEdit: handleEdit,
        onDelete: handleDeleteFromCard, onOpenDetail: setDetailTech,
      });
    });
    return grouped;
  }, [allTechnologies, searchTerm, selectedCategory, showOnlyCustom, typeFilters, carrierFilters]);

  const customTechsByParent = useMemo(() => {
    const grouped = {};
    technologies.forEach(tech => {
      if (!matchesFilters(tech.name, tech)) return;
      const displayCategory = getDisplayCategory(tech, tech.name);
      if (selectedCategory !== 'all' && displayCategory !== selectedCategory) return;
      if (!grouped[displayCategory]) grouped[displayCategory] = [];
      grouped[displayCategory].push({
        techName: tech.name, tech, isCustom: true,
        onDuplicate: handleDuplicate, onEdit: handleEdit,
        onDelete: handleDeleteFromCard, onOpenDetail: null,
      });
    });
    return grouped;
  }, [technologies, searchTerm, selectedCategory, typeFilters, carrierFilters]);

  const totalCustom = technologies.length;

  const templateCountByCategory = useMemo(() => {
    const counts = {};
    Object.entries(allTechnologies).forEach(([techName, tech]) => {
      const cat = getDisplayCategory(tech, techName);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [allTechnologies]);

  const totalTemplates = Object.keys(allTechnologies).length;

  const typeOptions = useMemo(() => TECH_TYPES.map(t => ({
    ...t,
    count: Object.entries(allTechnologies).filter(([n, tech]) => t.match.test(techText(n, tech))).length,
  })).filter(t => t.count > 0), [allTechnologies]);

  const carrierOptions = useMemo(() => {
    const counts = {};
    Object.values(allTechnologies).forEach(tech => {
      new Set(techCarriers(tech).map(carrierName)).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [allTechnologies]);

  const shownCount = Object.values(groupedTechs).reduce((n, items) => n + items.length, 0);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <SaveBar label="Technologies" />
      <div className="flex flex-1 overflow-hidden relative">
        <style>{customScrollbarStyles}</style>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 bg-white border-r border-black/15 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-black/10">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Technology Library</h2>
              {currentModelId && technologies.filter(t => t.uuid).length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-indigo-50 text-indigo-600">
                  {technologies.filter(t => t.uuid).length} in model
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Browse &amp; manage energy technologies</p>
          </div>

          {/* OpenTech-DB badge */}
          <div className="pt-3">
            <OpenTechBadge
              isApiLoading={isApiLoading}
              isApiLive={isApiLive}
              techCount={totalTemplates}
            />
          </div>

          {/* Search */}
          <div className="px-3 pb-3 border-b border-black/10">
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              <input
                type="text"
                placeholder="Search technologies…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-9 w-full rounded-lg border border-black/15 bg-slate-50 pl-8 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-black/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-0.5">
            <button
              onClick={() => { setSelectedCategory('all'); setShowOnlyCustom(false); setDetailTech(null); }}
              className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors ${
                selectedCategory === 'all' && !showOnlyCustom
                  ? 'bg-black text-white '
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="font-medium">All technologies</span>
              <span className={`text-[10px] ${selectedCategory === 'all' && !showOnlyCustom ? 'opacity-60' : 'opacity-50'}`}>
                {totalTemplates}
              </span>
            </button>

            <div className="pt-2.5 pb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">Categories</p>
            </div>

            {CATEGORY_ORDER.map(key => {
              const meta = CATEGORY_META[key];
              if (!meta) return null;
              const count = templateCountByCategory[key] || 0;
              if (count === 0) return null;
              const active = selectedCategory === key && !showOnlyCustom;
              return (
                <button
                  key={key}
                  onClick={() => { setSelectedCategory(key); setShowOnlyCustom(false); setDetailTech(null); }}
                  className={`w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] transition-colors ${
                    active ? 'bg-black text-white ' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: active ? 'rgba(255,255,255,0.15)' : `${meta.color}18` }}>
                    <CategoryIcon iconKey={meta.icon} size={12} color={active ? 'white' : meta.color} />
                  </span>
                  <span className="flex-1 truncate">{meta.label}</span>
                  <span className={`text-[10px] ${active ? 'opacity-60' : 'opacity-50'}`}>{count}</span>
                </button>
              );
            })}

            {totalCustom > 0 && (
              <>
                <div className="pt-2.5 pb-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">My Technologies</p>
                </div>
                <button
                  onClick={() => { setShowOnlyCustom(true); setSelectedCategory('all'); setDetailTech(null); }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    showOnlyCustom ? 'bg-black text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FiStar size={12} style={{ color: showOnlyCustom ? 'white' : '#f59e0b' }} />
                  <span className="flex-1">My Technologies</span>
                  <span className={`text-[10px] ${showOnlyCustom ? 'opacity-60' : 'opacity-50'}`}>{totalCustom}</span>
                </button>
              </>
            )}
          </nav>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar min-w-0">
          {/* API attribution banner */}
          {isApiLive && !isApiLoading && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-xs text-slate-500 ">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span>
                Data sourced from{' '}
                <a
                  href="https://otdb.th-deg.de"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  OpenTech·DB
                </a>
                {' '}· Deggendorf Institute of Technology
                {' '}— {totalTemplates} technologies loaded
              </span>
              <a
                href="https://otdb.th-deg.de/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-slate-400 hover:text-slate-600 flex items-center gap-1 flex-shrink-0"
              >
                <FiExternalLink size={11} /> API Docs
              </a>
            </div>
          )}

          {!isApiLoading && !showOnlyCustom && (
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-slate-500">
                  Showing <span className="font-semibold text-slate-900">{shownCount}</span> of {totalTemplates} technologies
                </p>
                {typeFilters.map(id => (
                  <FilterTag key={id} label={TECH_TYPES.find(t => t.id === id)?.label} onRemove={() => toggleIn(setTypeFilters)(id)} />
                ))}
                {carrierFilters.map(id => (
                  <FilterTag key={id} label={id} onRemove={() => toggleIn(setCarrierFilters)(id)} />
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {(activeFilterCount > 0 || searchTerm) && (
                    <button onClick={clearFilters} className="h-9 rounded-lg px-3 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
                      Clear filters
                    </button>
                  )}
                  <button
                    onClick={() => setShowFilters(v => !v)}
                    aria-expanded={showFilters}
                    className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold  transition-colors ${
                      showFilters || activeFilterCount > 0
                        ? 'border-slate-900 bg-black text-white'
                        : 'border-black/15 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <LuListFilter size={15} />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-bold text-slate-900">{activeFilterCount}</span>
                    )}
                  </button>
                </div>
              </div>

              {showFilters && (
                <div className="mt-3 space-y-4 rounded-2xl border border-black/15 bg-white p-5 ">
                  <FilterRow title="Type">
                    {typeOptions.map(t => (
                      <FilterChip key={t.id} label={t.label} count={t.count} active={typeFilters.includes(t.id)} onClick={() => toggleIn(setTypeFilters)(t.id)} />
                    ))}
                  </FilterRow>
                  <FilterRow title="Carrier">
                    {carrierOptions.map(c => (
                      <FilterChip
                        key={c.name}
                        label={c.name}
                        count={c.count}
                        active={carrierFilters.includes(c.name)}
                        onClick={() => toggleIn(setCarrierFilters)(c.name)}
                      />
                    ))}
                  </FilterRow>
                </div>
              )}
            </div>
          )}

          {isApiLoading && <SkeletonGrid />}

          {/* My Technologies view */}
          {!isApiLoading && showOnlyCustom && (
            totalCustom === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <FiStar size={36} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">No custom technologies yet.</p>
                <p className="text-xs mt-1">Duplicate a template to get started.</p>
              </div>
            ) : (
              <div>
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FiStar size={15} className="text-amber-500" /> My Technologies
                  <span className="text-xs font-normal text-slate-400">({totalCustom})</span>
                </h2>
                {CATEGORY_ORDER.map(key => (
                  <CategorySection key={key} categoryKey={key} items={customTechsByParent[key] || []} isCustomSection />
                ))}
              </div>
            )
          )}

          {/* Template catalogue view */}
          {!isApiLoading && !showOnlyCustom && (
            <div>
              {/* Inline custom techs panel (only in All view) */}
              {totalCustom > 0 && selectedCategory === 'all' && (
                <div className="mb-8 rounded-2xl border border-black/15 bg-slate-100/60 p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FiStar size={14} className="text-amber-500" /> My Technologies
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{totalCustom}</span>
                  </h2>
                  {CATEGORY_ORDER.map(key => (
                    <CategorySection key={key} categoryKey={key} items={customTechsByParent[key] || []} isCustomSection />
                  ))}
                </div>
              )}

              {/* Template sections */}
              {CATEGORY_ORDER.some(k => (groupedTechs[k] || []).length > 0) ? (
                CATEGORY_ORDER.map(key => (
                  <CategorySection key={key} categoryKey={key} items={groupedTechs[key] || []} />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <FiSearch size={28} className="mb-3 opacity-40" />
                  <p className="text-sm font-medium text-slate-600">No technologies match your search or filters.</p>
                  <button onClick={clearFilters} className="mt-3 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Detail panel — floats as overlay so card grid keeps full width ── */}
        <AnimatePresence>
          {detailTech && (
            <motion.div
              key="detail-backdrop"
              className="absolute inset-0 z-30 bg-slate-900/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDetailTech(null)}
            />
          )}
          {detailTech && (
            <DetailPanel
              key={detailTech.uuid || detailTech.name}
              tech={detailTech}
              onClose={() => setDetailTech(null)}
              onDuplicate={handleDuplicate}
            />
          )}
        </AnimatePresence>

        {/* ── Edit modal ───────────────────────────────────────────────────── */}
        {editingTech && editForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 bg-black text-white rounded-t-xl">
                <h2 className="text-sm font-bold">Edit: {editingTech}</h2>
                <button onClick={handleCancelEdit} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                  <FiX size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                {/* Essentials */}
                <section>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Essentials</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(editForm.essentials || {}).map(([key, value]) => {
                      const setEss = (v) => setEditForm({ ...editForm, essentials: { ...editForm.essentials, [key]: v } });
                      if (key === 'carrier') {
                        return (
                          <div key={key} className="col-span-2">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="text-xs font-medium text-slate-600">carrier</label>
                              <span className="text-xs text-slate-400">(single carrier for storage / transmission)</span>
                            </div>
                            <CarrierSelect value={value} onChange={e => setEss(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-black/15 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                          </div>
                        );
                      }
                      if (key === 'carrier_in') {
                        const arr = Array.isArray(value) ? value : (value ? [value] : []);
                        return (
                          <div key={key} className="col-span-2">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="text-xs font-medium text-slate-600">carrier_in</label>
                              <span className="text-xs text-slate-400">(energy consumed — multiple allowed)</span>
                            </div>
                            <MultiCarrierEditor values={arr} onChange={v => setEss(v.length === 1 ? v[0] : v)} />
                          </div>
                        );
                      }
                      if (key === 'carrier_out') {
                        const arr = Array.isArray(value) ? value : (value ? [value] : []);
                        return (
                          <div key={key} className="col-span-2">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="text-xs font-medium text-slate-600">carrier_out</label>
                              <span className="text-xs text-slate-400">(energy produced — multiple allowed)</span>
                            </div>
                            <MultiCarrierEditor values={arr} onChange={v => setEss(v.length === 1 ? v[0] : v)} />
                          </div>
                        );
                      }
                      return (
                        <div key={key}>
                          <label className="block text-xs font-medium text-slate-600 mb-1">{key}</label>
                          {key === 'color' ? (
                            <div className="flex items-center gap-2">
                              <input type="color" value={value} onChange={e => setEss(e.target.value)}
                                className="w-10 h-9 border border-black/15 rounded cursor-pointer" />
                              <input type="text" value={value} onChange={e => setEss(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm border border-black/15 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                            </div>
                          ) : key === 'parent' ? (
                            <input type="text" value={value} disabled
                              className="w-full px-3 py-2 text-sm border border-black/15 rounded-lg bg-slate-100 text-slate-500" />
                          ) : (
                            <input type="text" value={value} onChange={e => setEss(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-black/15 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add missing carrier fields */}
                  {(() => {
                    const ess = editForm.essentials || {};
                    const parent = ess.parent;
                    const missingCarrier    = !('carrier'     in ess) && (parent === 'storage' || parent === 'transmission');
                    const missingCarrierIn  = !('carrier_in'  in ess) && (parent === 'conversion' || parent === 'conversion_plus');
                    const missingCarrierOut = !('carrier_out' in ess) && (parent === 'supply' || parent === 'supply_plus' || parent === 'demand' || parent === 'conversion' || parent === 'conversion_plus');
                    const toAdd = [
                      ...(missingCarrier    ? ['carrier']     : []),
                      ...(missingCarrierIn  ? ['carrier_in']  : []),
                      ...(missingCarrierOut ? ['carrier_out'] : []),
                    ];
                    if (toAdd.length === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-black/10">
                        <p className="text-xs text-slate-400 mb-2">Missing carrier fields for <strong>{parent}</strong>:</p>
                        <div className="flex flex-wrap gap-2">
                          {toAdd.map(field => (
                            <button key={field} type="button"
                              onClick={() => setEditForm({ ...editForm, essentials: { ...editForm.essentials, [field]: field === 'carrier' ? 'electricity' : [] } })}
                              className="px-2.5 py-1 text-xs bg-gray-50 text-gray-600 border border-black/15 hover:bg-gray-100">
                              + {field}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </section>

                {/* Storage Buffer */}
                {(editForm.essentials?.parent === 'supply' || editForm.essentials?.parent === 'supply_plus') && (() => {
                  const hasBuffer = editForm.essentials?.parent === 'supply_plus';
                  const toggleBuffer = () => {
                    if (hasBuffer) {
                      const c = { ...editForm.constraints };
                      ['storage_cap_max','storage_cap_min','storage_cap_equals','storage_loss','storage_initial','charge_rate'].forEach(k => delete c[k]);
                      setEditForm({ ...editForm, essentials: { ...editForm.essentials, parent: 'supply' }, constraints: c });
                    } else {
                      setEditForm({ ...editForm, essentials: { ...editForm.essentials, parent: 'supply_plus' } });
                    }
                  };
                  const setStorageParam = (key, val) =>
                    setEditForm({ ...editForm, constraints: { ...editForm.constraints, [key]: val } });
                  const storageFields = [
                    { key: 'storage_cap_max', label: 'Max storage capacity (kWh)', placeholder: 'e.g. 1000' },
                    { key: 'storage_loss',    label: 'Standing loss (fraction/hr)', placeholder: 'e.g. 0.01' },
                    { key: 'storage_initial', label: 'Initial state of charge (0–1)', placeholder: 'e.g. 0' },
                  ];
                  return (
                    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-amber-800">Storage Buffer</h3>
                          <p className="text-xs text-amber-600 mt-0.5">
                            Adds a co-located buffer store (Calliope <code className="font-mono">supply_plus</code>).
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={toggleBuffer}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${hasBuffer ? 'bg-amber-500' : 'bg-slate-300'}`}
                          aria-pressed={hasBuffer}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${hasBuffer ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      {hasBuffer && (
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          {storageFields.map(({ key, label, placeholder }) => (
                            <div key={key}>
                              <label className="block text-xs font-medium text-amber-700 mb-1">{label}</label>
                              <input
                                type="text"
                                placeholder={placeholder}
                                value={editForm.constraints?.[key] ?? ''}
                                onChange={e => {
                                  const raw = e.target.value;
                                  setStorageParam(key, raw === '' ? '' : (isNaN(raw) ? raw : parseFloat(raw)));
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none font-mono bg-white"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })()}

                {/* Parameters — common (ontology) + engine-specific */}
                <section>
                  <TechParameterEditor
                    parent={editForm.essentials?.parent}
                    techUuid={editForm.uuid}
                    constraints={editForm.constraints || {}}
                    costs={editForm.costs?.monetary || {}}
                    engineParams={editForm.engineParams || {}}
                    onConstraintChange={(k, v) => setEditForm({ ...editForm, constraints: { ...editForm.constraints, [k]: v } })}
                    onConstraintRemove={(k) => { const c = { ...editForm.constraints }; delete c[k]; setEditForm({ ...editForm, constraints: c }); }}
                    onCostChange={(k, v) => setEditForm({ ...editForm, costs: { ...editForm.costs, monetary: { ...(editForm.costs?.monetary || {}), [k]: v } } })}
                    onCostRemove={(k) => { const m = { ...(editForm.costs?.monetary || {}) }; delete m[k]; setEditForm({ ...editForm, costs: { ...editForm.costs, monetary: m } }); }}
                    onEngineParamChange={(engine, k, v) => setEditForm({ ...editForm, engineParams: { ...(editForm.engineParams || {}), [engine]: { ...((editForm.engineParams || {})[engine] || {}), [k]: v } } })}
                    onEngineParamRemove={(engine, k) => {
                      const eng = { ...(editForm.engineParams || {}) };
                      eng[engine] = { ...(eng[engine] || {}) };
                      delete eng[engine][k];
                      if (Object.keys(eng[engine]).length === 0) delete eng[engine];
                      setEditForm({ ...editForm, engineParams: eng });
                    }}
                  />
                </section>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-black/15 bg-slate-50 rounded-b-xl">
                <button
                  onClick={handleDeleteTech}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-black/80 hover:text-white transition-colors"
                >
                  <FiTrash2 size={14} /> Delete
                </button>
                <div className="flex gap-2">
                  <button onClick={handleCancelEdit} className="px-4 py-2 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-black/80 transition-colors">
                    <FiSave size={14} /> Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default Technologies;
