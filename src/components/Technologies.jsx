import React, { useState, useMemo, useEffect } from 'react';
import {
  FiSearch, FiEdit2, FiX, FiSave, FiTrash2, FiChevronDown,
  FiChevronRight as FiChevronRightIcon, FiArrowRight, FiHelpCircle, FiCopy, FiZap,
  FiSun, FiDatabase, FiRefreshCw, FiShare2, FiBarChart2, FiStar, FiPlus,
  FiExternalLink,
} from 'react-icons/fi';
import { useData } from '../context/DataContext';
import SaveBar from './ui/SaveBar';
import { TECH_TEMPLATES, PARENT_TYPES, useLiveTechTemplates } from './TechnologiesData';
import { fetchTechFramework } from '../services/techDatabaseApi';
import { CARRIERS, CARRIERS_BY_GROUP, getCarrierColor, getCarrierLabel } from '../config/carriers';
import {
  CONSTRAINT_DEFINITIONS,
  COST_DEFINITIONS,
  PARENT_CONSTRAINTS,
} from '../utils/constraintDefinitions';

// ── Carrier helpers ──────────────────────────────────────────────────────────
function CarrierPill({ carrierId }) {
  const color = getCarrierColor(carrierId);
  const label = getCarrierLabel(carrierId);
  const icon  = CARRIERS[carrierId]?.icon ?? '•';
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
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
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
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
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-dashed border-slate-400 text-slate-500 hover:border-gray-500 hover:text-gray-700"
        >
          <FiPlus size={10}/> Add
        </button>
      ) : (
        <span className="flex items-center gap-1">
          <CarrierSelect
            value={picked}
            onChange={e => setPicked(e.target.value)}
            className="text-xs border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none"
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
      <div className="mx-3 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse flex-shrink-0" />
          <span className="text-xs text-slate-500">Connecting to OpenTech·DB…</span>
        </div>
      </div>
    );
  }

  if (!isApiLive) {
    return (
      <div className="mx-3 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 font-medium">Static fallback</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">{techCount} built-in templates</p>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-800">OpenTech·DB</span>
        </div>
        <a
          href="https://otdb.th-deg.de/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-600 hover:text-emerald-800"
          title="Swagger UI"
          onClick={e => e.stopPropagation()}
        >
          <FiExternalLink size={11} />
        </a>
      </div>
      <p className="text-[11px] font-mono text-emerald-700 mt-1">otdb.th-deg.de</p>
      <p className="text-[11px] text-emerald-600 mt-0.5">{techCount} technologies loaded</p>
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
              <div key={i} className="bg-white rounded-lg border border-slate-200 h-32 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tech Card ────────────────────────────────────────────────────────────────
const TechCard = ({ techName, tech, isCustom, onDuplicate, onEdit, onDelete, onOpenDetail }) => {
  const meta = CATEGORY_META[tech.parent] || { color: '#94a3b8' };
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
      className="rounded-xl ring-1 ring-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 flex flex-col cursor-pointer group relative overflow-hidden"
      style={{ backgroundColor: `${meta.color}08` }}
      onClick={() => !isCustom && onOpenDetail && onOpenDetail(tech)}
    >
      {/* Top color bar */}
      <div className="h-0.5 w-full flex-shrink-0" style={{ backgroundColor: meta.color }} />

      {/* Instance count badge — compact stacked dot indicator */}
      {instances.length > 1 && (
        <span
          className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none tabular-nums"
          style={{ backgroundColor: `${meta.color}25`, color: meta.color }}
        >
          {instances.length}
        </span>
      )}

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col">
        <h4 className="text-[13px] font-semibold text-slate-800 leading-tight group-hover:text-slate-900 pr-10">
          {displayName}
        </h4>
        {tech.oeo_class && (
          <p
            className="text-[9px] font-mono italic mt-0.5 truncate"
            style={{ color: `${meta.color}bb` }}
          >
            {tech.oeo_class}
          </p>
        )}

        {/* Carrier pills */}
        {(carrierIn.length > 0 || carrierOut.length > 0 || carrier.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {carrierIn.map(c  => <CarrierPill key={`in-${c}`}  carrierId={c} />)}
            {carrierOut.map(c => <CarrierPill key={`out-${c}`} carrierId={c} />)}
            {carrier.map(c    => <CarrierPill key={`c-${c}`}   carrierId={c} />)}
          </div>
        )}

        <div className="flex-1" />

        {/* Stat strip */}
        {stats.length > 0 && (
          <div
            className="mt-3 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
          >
            {stats.map(({ label, value, unit }) => (
              <div key={label} className="bg-white/60 rounded-lg p-1.5 text-center min-w-0 overflow-hidden">
                <p className="font-mono font-bold text-[12px] text-slate-800 tabular-nums leading-none truncate">
                  {value}
                </p>
                <p className="text-[8px] text-slate-400 mt-0.5 leading-none truncate">
                  {label}{unit ? <span className="opacity-60"> {unit}</span> : null}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="pt-1 px-3 pb-2 flex items-center gap-2"
        onClick={e => e.stopPropagation()}
      >
        {!isCustom ? (
          <>
            <button
              onClick={handleDup}
              className="flex items-center gap-1 text-[10px] text-slate-400 transition-colors"
              onMouseEnter={e => e.currentTarget.style.color = meta.color}
              onMouseLeave={e => e.currentTarget.style.color = ''}
              title="Duplicate to My Technologies"
            >
              <FiCopy size={10} /> Duplicate
            </button>
            <button
              onClick={() => onOpenDetail && onOpenDetail(tech)}
              className="ml-auto flex items-center gap-0.5 text-[10px] transition-colors"
              style={{ color: instances.length > 1 ? meta.color : '' }}
              onMouseEnter={e => { e.currentTarget.style.color = meta.color; e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.color = instances.length > 1 ? meta.color : ''; e.currentTarget.style.opacity = ''; }}
            >
              {instances.length > 1
                ? <span className="font-semibold">{instances.length} variants</span>
                : <span className="text-slate-300 group-hover:text-slate-500">View</span>
              }
              <FiChevronRightIcon size={10} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onEdit(techName, tech)}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 transition-colors"
            >
              <FiEdit2 size={10} /> Edit
            </button>
            <button
              onClick={() => onDelete(techName)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors ml-auto"
            >
              <FiTrash2 size={10} /> Delete
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
  const label = isCustomSection ? `${meta.label} — Custom` : meta.label;
  if (items.length === 0) return null;

  return (
    <div className="mb-7">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${meta.color}1a` }}
        >
          <CategoryIcon iconKey={meta.icon} size={12} color={meta.color} />
        </span>
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
          style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
        >
          {items.length}
        </span>
        {isCustomSection && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 ml-1">
            custom
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function FwParamGroup({ title, children }) {
  return (
    <div className="mb-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-300 mb-1 px-0.5">{title}</p>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function FwParamRow({ code, value, unit, desc }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 transition-colors"
      title={desc || undefined}
    >
      <code className="text-[11px] font-mono font-semibold text-slate-700 flex-1 min-w-0 truncate">{code}</code>
      <div className="text-right flex-shrink-0">
        <span className="text-[12px] font-mono font-bold text-slate-800 tabular-nums">{value}</span>
        {unit && <span className="text-[9px] text-slate-400 ml-1">{unit}</span>}
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
      <div className="p-2 space-y-3">
        {Object.keys(essentials).length > 0 && (
          <section>
            <FwSectionHeader label="Essentials" />
            {Object.entries(essentials).map(([k, v]) => (
              <FwParamRow key={k} code={k} value={String(v)} />
            ))}
          </section>
        )}
        {hasCosts && (
          <section>
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
          <section>
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
    <div className="p-2 space-y-3">
      {publicEntries.map(([section, val]) => {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          const sectionUnits = units[section];
          return (
            <section key={section}>
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
    <aside className="absolute top-0 right-0 bottom-0 w-96 bg-white border-l border-slate-200 flex flex-col overflow-hidden shadow-2xl z-40">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-start justify-between border-b border-slate-200"
        style={{ borderTopWidth: 3, borderTopColor: meta.color }}
      >
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800 leading-snug">
              {tech.essentials?.name || formatName(tech.name)}
            </h3>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
            >
              {meta.label}
            </span>
          </div>
          {tech.oeo_class && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] font-mono text-slate-400 italic">{tech.oeo_class}</span>
              <a
                href="https://openenergy-platform.org/ontology/oeo/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-600"
                title="Open Energy Ontology"
              >
                <FiExternalLink size={10} />
              </a>
            </div>
          )}
          {tech.description && (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2" title={tech.description}>{tech.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex-shrink-0"
        >
          <FiX size={15} />
        </button>
      </div>

      {/* Instance selector — dropdown */}
      {instances.length > 0 && (
        <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0 flex items-center gap-2">
          <span className="text-[9px] text-slate-400 flex-shrink-0">
            {instances.length} variant{instances.length !== 1 ? 's' : ''}
          </span>
          <select
            value={safeActiveIdx}
            onChange={e => setActiveIdx(Number(e.target.value))}
            className="flex-1 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
          >
            {instances.map((i, idx) => (
              <option key={idx} value={idx}>
                {i.displayLabel || i.label || `Variant ${idx + 1}`}
                {i.life_cycle_stage ? ` — ${i.life_cycle_stage}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tab strip */}
      <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10 flex-shrink-0">
        {[['framework', 'Framework Export'], ['source', 'Source Data']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setParamView(id)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors border-b-2 ${
              paramView === id
                ? 'text-slate-800 border-slate-800'
                : 'text-slate-400 border-transparent hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Parameter views */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── Framework Export tab ────────────────────────────────────── */}
        {paramView === 'framework' && (
          <div className="flex flex-col">
            {/* Engine selector */}
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-slate-100 flex-wrap">
              {ENGINES.map(eng => (
                <button
                  key={eng.id}
                  onClick={() => setEngine(eng.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                    engine === eng.id
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {eng.label}
                </button>
              ))}
            </div>

            {/* Framework data */}
            {!tech.uuid ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-slate-400">Framework export not available.</p>
                <p className="text-[10px] text-slate-300 mt-1">Only OpenTech-DB technologies have framework exports.</p>
              </div>
            ) : frameworkLoading ? (
              <div className="px-4 py-8 text-center">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-2" />
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
                <tr className="bg-slate-50 border-b border-slate-200">
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
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <button
          onClick={() => onDuplicate(tech.name || tech.id, tech)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
        >
          <FiCopy size={12} /> Duplicate to My Technologies
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
    </aside>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function Technologies() {
  const { technologies, setTechnologies } = useData();
  const [searchTerm, setSearchTerm]             = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showOnlyCustom, setShowOnlyCustom]     = useState(false);
  const [editingTech, setEditingTech]           = useState(null);
  const [editForm, setEditForm]                 = useState(null);
  const [detailTech, setDetailTech]             = useState(null);

  const { techTemplates: liveTechTemplates, isLive: isApiLive, isLoading: isApiLoading } = useLiveTechTemplates();

  const [constraintSearch, setConstraintSearch]               = useState({});
  const [costSearch, setCostSearch]                           = useState({});
  const [selectedConstraintGroup, setSelectedConstraintGroup] = useState({});
  const [selectedCostGroup, setSelectedCostGroup]             = useState({});

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

  const addConstraint = (constraintKey, defaultValue = '') => {
    if (!editForm) return;
    setEditForm({ ...editForm, constraints: { ...editForm.constraints, [constraintKey]: defaultValue } });
    setConstraintSearch({});
  };

  const addCost = (costKey, defaultValue = 0) => {
    if (!editForm) return;
    setEditForm({ ...editForm, costs: { ...editForm.costs, monetary: { ...(editForm.costs?.monetary || {}), [costKey]: defaultValue } } });
    setCostSearch({});
  };

  const matchesTerm = (name) => !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());

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
      if (!matchesTerm(techName) || showOnlyCustom) return;
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
  }, [allTechnologies, searchTerm, selectedCategory, showOnlyCustom]);

  const customTechsByParent = useMemo(() => {
    const grouped = {};
    technologies.forEach(tech => {
      if (!matchesTerm(tech.name)) return;
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
  }, [technologies, searchTerm, selectedCategory]);

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

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <SaveBar label="Technologies" />
      <div className="flex flex-1 overflow-hidden relative">
        <style>{customScrollbarStyles}</style>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Technology Library</h2>
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
          <div className="px-3 pb-3 border-b border-slate-100">
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              <input
                type="text"
                placeholder="Search technologies…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-50"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-0.5">
            <button
              onClick={() => { setSelectedCategory('all'); setShowOnlyCustom(false); setDetailTech(null); }}
              className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                selectedCategory === 'all' && !showOnlyCustom
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="font-medium">All Technologies</span>
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
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CategoryIcon iconKey={meta.icon} size={12} color={active ? 'white' : meta.color} />
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
                    showOnlyCustom ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
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
        <main className="flex-1 overflow-y-auto p-5 custom-scrollbar min-w-0">
          {/* API attribution banner */}
          {isApiLive && !isApiLoading && (
            <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-500">
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

          {/* Loading skeleton */}
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
                <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <h2 className="text-xs font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <FiStar size={13} className="text-amber-500" /> My Technologies ({totalCustom})
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
                  <FiSearch size={32} className="mb-3 opacity-30" />
                  <p className="text-sm">No technologies match your search.</p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Detail panel — floats as overlay so card grid keeps full width ── */}
        {detailTech && (
          <>
            <div
              className="absolute inset-0 z-30"
              style={{ background: 'rgba(15,23,42,0.08)' }}
              onClick={() => setDetailTech(null)}
            />
            <DetailPanel
              tech={detailTech}
              onClose={() => setDetailTech(null)}
              onDuplicate={handleDuplicate}
            />
          </>
        )}

        {/* ── Edit modal ───────────────────────────────────────────────────── */}
        {editingTech && editForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800 text-white rounded-t-xl">
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
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none" />
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
                                className="w-10 h-9 border border-slate-300 rounded cursor-pointer" />
                              <input type="text" value={value} onChange={e => setEss(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                            </div>
                          ) : key === 'parent' ? (
                            <input type="text" value={value} disabled
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-500" />
                          ) : (
                            <input type="text" value={value} onChange={e => setEss(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none" />
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
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs text-slate-400 mb-2">Missing carrier fields for <strong>{parent}</strong>:</p>
                        <div className="flex flex-wrap gap-2">
                          {toAdd.map(field => (
                            <button key={field} type="button"
                              onClick={() => setEditForm({ ...editForm, essentials: { ...editForm.essentials, [field]: field === 'carrier' ? 'electricity' : [] } })}
                              className="px-2.5 py-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-full hover:bg-gray-100">
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

                {/* Constraints */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">
                      Constraints ({Object.keys(editForm.constraints || {}).length})
                    </h3>
                    <button
                      onClick={() => setConstraintSearch({ main: 'open' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-700 hover:text-white text-slate-700 rounded-full transition-colors"
                    >
                      <FiArrowRight size={11} /> Add Constraint
                    </button>
                  </div>
                  {editForm.constraints && Object.keys(editForm.constraints).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(editForm.constraints).map(([key, value]) => {
                        const def = CONSTRAINT_DEFINITIONS[key];
                        return (
                          <div key={key} className="flex gap-2 items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-1.5 mb-1">
                                <label className="text-xs font-medium text-slate-700">{key}</label>
                                {def && (
                                  <div className="group relative">
                                    <FiHelpCircle className="text-slate-400 hover:text-slate-600 cursor-help" size={12} />
                                    <div className="absolute left-0 top-5 w-56 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                      <strong>{def.group}:</strong> {def.desc}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <input
                                type="text"
                                value={typeof value === 'object' ? JSON.stringify(value) : value}
                                onChange={e => {
                                  let v = e.target.value;
                                  if (!isNaN(v) && v !== '') v = parseFloat(v);
                                  setEditForm({ ...editForm, constraints: { ...editForm.constraints, [key]: v } });
                                }}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none font-mono"
                              />
                            </div>
                            <button
                              onClick={() => { const c = { ...editForm.constraints }; delete c[key]; setEditForm({ ...editForm, constraints: c }); }}
                              className="mt-5 p-1.5 text-slate-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No constraints defined.</p>
                  )}
                </section>

                {/* Costs */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">
                      Costs ({Object.keys(editForm.costs?.monetary || {}).length})
                    </h3>
                    <button
                      onClick={() => setCostSearch({ main: 'open' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-700 hover:text-white text-slate-700 rounded-full transition-colors"
                    >
                      <FiArrowRight size={11} /> Add Cost
                    </button>
                  </div>
                  {editForm.costs?.monetary && Object.keys(editForm.costs.monetary).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(editForm.costs.monetary).map(([key, value]) => {
                        const def = COST_DEFINITIONS[key];
                        return (
                          <div key={key} className="flex gap-2 items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-1.5 mb-1">
                                <label className="text-xs font-medium text-slate-700">{key}</label>
                                {def && (
                                  <div className="group relative">
                                    <FiHelpCircle className="text-slate-400 hover:text-slate-600 cursor-help" size={12} />
                                    <div className="absolute left-0 top-5 w-56 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                      <strong>{def.group}:</strong> {def.desc}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <input
                                type="number"
                                step="any"
                                value={value}
                                onChange={e => setEditForm({ ...editForm, costs: { ...editForm.costs, monetary: { ...(editForm.costs?.monetary || {}), [key]: parseFloat(e.target.value) || 0 } } })}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:outline-none font-mono"
                              />
                            </div>
                            <button
                              onClick={() => { const m = { ...(editForm.costs?.monetary || {}) }; delete m[key]; setEditForm({ ...editForm, costs: { ...editForm.costs, monetary: m } }); }}
                              className="mt-5 p-1.5 text-slate-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No costs defined.</p>
                  )}
                </section>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
                <button
                  onClick={handleDeleteTech}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <FiTrash2 size={14} /> Delete
                </button>
                <div className="flex gap-2">
                  <button onClick={handleCancelEdit} className="px-4 py-2 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors">
                    <FiSave size={14} /> Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Constraint search modal ───────────────────────────────────────── */}
        {constraintSearch.main === 'open' && editForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setConstraintSearch({})}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 bg-slate-800 text-white rounded-t-xl">
                <h3 className="font-semibold text-sm">
                  Add Constraint — {PARENT_TYPES[editForm.essentials?.parent] || 'Technology'}
                </h3>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-56px)] custom-scrollbar">
                {(() => {
                  const available = (PARENT_CONSTRAINTS[editForm.essentials?.parent] || []).filter(c => !editForm.constraints?.[c]);
                  if (available.length === 0) return <div className="p-8 text-center text-sm text-slate-400">All constraints already added.</div>;
                  const grouped = {};
                  available.forEach(c => { const g = CONSTRAINT_DEFINITIONS[c]?.group || 'Other'; if (!grouped[g]) grouped[g] = []; grouped[g].push(c); });
                  return Object.entries(grouped).map(([group, constraints]) => {
                    const expanded = selectedConstraintGroup[group];
                    return (
                      <div key={group} className="border-b border-slate-100 last:border-0">
                        <button
                          onClick={() => setSelectedConstraintGroup({ ...selectedConstraintGroup, [group]: !expanded })}
                          className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-700"
                        >
                          {group} ({constraints.length})
                          {expanded ? <FiChevronDown size={14} /> : <FiChevronRightIcon size={14} />}
                        </button>
                        {expanded && (
                          <div className="divide-y divide-slate-100">
                            {constraints.map(c => (
                              <button key={c} onClick={() => addConstraint(c, '')} className="w-full text-left px-8 py-3 hover:bg-gray-50 transition-colors">
                                <div className="text-sm font-medium text-slate-800">{c}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{CONSTRAINT_DEFINITIONS[c]?.desc || ''}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── Cost search modal ─────────────────────────────────────────────── */}
        {costSearch.main === 'open' && editForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setCostSearch({})}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 bg-slate-800 text-white rounded-t-xl">
                <h3 className="font-semibold text-sm">Add Cost</h3>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-56px)] custom-scrollbar">
                {(() => {
                  const existing = editForm.costs?.monetary || {};
                  const available = Object.keys(COST_DEFINITIONS).filter(c => !existing[c]);
                  if (available.length === 0) return <div className="p-8 text-center text-sm text-slate-400">All costs already added.</div>;
                  const grouped = {};
                  available.forEach(c => { const g = COST_DEFINITIONS[c]?.group || 'Other'; if (!grouped[g]) grouped[g] = []; grouped[g].push(c); });
                  return Object.entries(grouped).map(([group, costs]) => {
                    const expanded = selectedCostGroup[group];
                    return (
                      <div key={group} className="border-b border-slate-100 last:border-0">
                        <button
                          onClick={() => setSelectedCostGroup({ ...selectedCostGroup, [group]: !expanded })}
                          className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-700"
                        >
                          {group} ({costs.length})
                          {expanded ? <FiChevronDown size={14} /> : <FiChevronRightIcon size={14} />}
                        </button>
                        {expanded && (
                          <div className="divide-y divide-slate-100">
                            {costs.map(c => (
                              <button key={c} onClick={() => addCost(c, 0)} className="w-full text-left px-8 py-3 hover:bg-gray-50 transition-colors">
                                <div className="text-sm font-medium text-slate-800">{c}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{COST_DEFINITIONS[c]?.desc || ''}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Technologies;
