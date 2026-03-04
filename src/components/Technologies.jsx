import React, { useState, useMemo } from 'react';
import { FiSearch, FiEdit2, FiX, FiSave, FiTrash2, FiChevronDown,
         FiChevronRight as FiChevronRightIcon, FiArrowRight, FiHelpCircle, FiCopy, FiZap,
         FiSun, FiDatabase, FiRefreshCw, FiShare2, FiBarChart2, FiStar } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { TECH_TEMPLATES, PARENT_TYPES, useLiveTechTemplates } from './TechnologiesData';

// Constraint definitions
const CONSTRAINT_DEFINITIONS = {
  energy_cap_max:    { group: 'Capacity',   desc: 'Maximum energy capacity (kW). Upper limit on installed capacity.' },
  energy_cap_min:    { group: 'Capacity',   desc: 'Minimum energy capacity (kW). Lower limit on installed capacity.' },
  energy_cap_equals: { group: 'Capacity',   desc: 'Fixed energy capacity (kW). Capacity must equal this value.' },
  storage_cap_max:   { group: 'Capacity',   desc: 'Maximum storage capacity (kWh). Upper limit on energy storage.' },
  storage_cap_min:   { group: 'Capacity',   desc: 'Minimum storage capacity (kWh).' },
  storage_cap_equals:{ group: 'Capacity',   desc: 'Fixed storage capacity (kWh).' },
  energy_eff:        { group: 'Efficiency', desc: 'Energy conversion efficiency (0-1). Ratio of output to input energy.' },
  resource_eff:      { group: 'Efficiency', desc: 'Resource conversion efficiency (0-1). Efficiency of resource usage.' },
  resource:          { group: 'Resource',   desc: 'Resource availability (kWh or file:// path). Energy source input.' },
  resource_min_use:  { group: 'Resource',   desc: 'Minimum resource utilization fraction (0-1).' },
  resource_scale:    { group: 'Resource',   desc: 'Resource scaling factor.' },
  energy_ramping:    { group: 'Operation',  desc: 'Ramping rate limit (fraction/hour). Max change in output per timestep.' },
  charge_rate:       { group: 'Operation',  desc: 'Charge/discharge rate (C-rate). Storage power relative to capacity.' },
  storage_loss:      { group: 'Operation',  desc: 'Storage standing loss (fraction/hour). Energy lost per time period.' },
  lifetime:          { group: 'Operation',  desc: 'Technology lifetime (years). Economic lifespan.' },
};

// Cost definitions
const COST_DEFINITIONS = {
  energy_cap:       { group: 'Investment', desc: 'Capital cost per unit energy capacity ($/kW). One-time installation cost.' },
  storage_cap:      { group: 'Investment', desc: 'Capital cost per unit storage capacity ($/kWh).' },
  purchase:         { group: 'Investment', desc: 'Purchase cost per unit of technology ($).' },
  om_annual:        { group: 'O&M',        desc: 'Annual operations & maintenance cost ($/year). Fixed yearly cost.' },
  om_prod:          { group: 'O&M',        desc: 'Variable O&M cost per unit energy produced ($/kWh).' },
  om_con:           { group: 'O&M',        desc: 'Variable O&M cost per unit energy consumed ($/kWh).' },
  interest_rate:    { group: 'Financial',  desc: 'Interest rate for investment (fraction, e.g., 0.10 = 10%).' },
  depreciation_rate:{ group: 'Financial',  desc: 'Depreciation rate (fraction/year). Asset value reduction rate.' },
};

// Constraints configuration for parent types
const PARENT_CONSTRAINTS = {
  supply:          ['energy_cap_max','energy_cap_min','energy_eff','resource','resource_min_use','energy_ramping','lifetime'],
  supply_plus:     ['energy_cap_max','energy_cap_min','energy_eff','resource','resource_min_use','energy_ramping','lifetime'],
  storage:         ['energy_cap_max','energy_cap_min','storage_cap_max','storage_cap_min','charge_rate','storage_loss','lifetime'],
  conversion:      ['energy_cap_max','energy_cap_min','energy_eff','energy_ramping','lifetime'],
  conversion_plus: ['energy_cap_max','energy_cap_min','energy_eff','energy_ramping','lifetime'],
  transmission:    ['energy_cap_max','energy_cap_min','energy_eff','lifetime'],
  demand:          ['resource'],
};

// Category metadata: icon component, accent color, display label
const CATEGORY_META = {
  supply_plus:     { color: '#f59e0b', label: 'Variable Renewables',            icon: 'sun'       },
  supply:          { color: '#3b82f6', label: 'Dispatchable Generation',        icon: 'zap'       },
  storage:         { color: '#8b5cf6', label: 'Storage',                        icon: 'database'  },
  conversion_plus: { color: '#10b981', label: 'Conversion & Sector Coupling',   icon: 'refresh'   },
  transmission:    { color: '#64748b', label: 'Transmission & Distribution',    icon: 'share'     },
  demand:          { color: '#ef4444', label: 'Demand',                         icon: 'bar-chart' },
};

const CATEGORY_ORDER = ['supply_plus', 'supply', 'storage', 'conversion_plus', 'transmission', 'demand'];

// Custom scrollbar CSS
const customScrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: rgba(100,116,139,0.1); border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
`;

/** Format snake_case id strings to readable Title Case */
function formatName(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Small icon renderer using react-icons/fi based on string key */
function CategoryIcon({ iconKey, size = 14, color }) {
  const icons = { sun: FiSun, zap: FiZap, database: FiDatabase, refresh: FiRefreshCw, share: FiShare2, 'bar-chart': FiBarChart2 };
  const Icon = icons[iconKey] || FiZap;
  return <Icon size={size} style={{ color }} />;
}

// --- Simple Tech Card --------------------------------------------------------
const TechCard = ({ techName, tech, isCustom, onDuplicate, onEdit, onDelete }) => {
  const meta = CATEGORY_META[tech.parent] || { color: '#94a3b8' };
  const displayName = tech.essentials?.name || formatName(techName);
  const instances = tech.instances || [];
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Merge selected instance params over the base tech params
  const currentInstance = instances[selectedIdx];
  const constraints = currentInstance
    ? { ...tech.constraints, ...currentInstance.constraints }
    : (tech.constraints || {});
  const monetary = currentInstance
    ? { ...(tech.costs?.monetary || {}), ...(currentInstance.monetary || {}) }
    : (tech.costs?.monetary || {});

  const efficiency = constraints.energy_eff;
  const lifetime   = constraints.lifetime;
  const capex      = monetary.energy_cap;

  const handleDup = () => {
    const techToUse = currentInstance
      ? {
          ...tech,
          constraints: { ...tech.constraints, ...currentInstance.constraints },
          costs: { monetary: { ...(tech.costs?.monetary || {}), ...(currentInstance.monetary || {}) } },
        }
      : tech;
    onDuplicate(techName, techToUse);
  };

  return (
    <div
      className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col"
      style={{ borderLeftWidth: 4, borderLeftColor: meta.color }}
    >
      <div className="p-4 flex-1">
        <h4 className="text-sm font-semibold text-slate-800 leading-tight">{displayName}</h4>

        {/* Instance / model selector — dropdown shown when API provides instances */}
        {instances.length > 0 && (
          <div className="mt-2.5">
            <label className="block text-xs text-slate-400 mb-1">Model</label>
            <select
              value={selectedIdx}
              onChange={e => setSelectedIdx(Number(e.target.value))}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 truncate"
              style={{ accentColor: meta.color }}
            >
              {instances.map((inst, idx) => (
                <option key={inst.id || idx} value={idx}>
                  {inst.displayLabel || `Variant ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Key stats pills */}
        {(efficiency != null || lifetime != null || capex != null) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {efficiency != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Eff: {efficiency}</span>
            )}
            {lifetime != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{lifetime} yr</span>
            )}
            {capex != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{typeof capex === 'number' ? capex.toLocaleString() : capex} $/kW</span>
            )}
          </div>
        )}
      </div>
      <div className="px-4 pb-3 flex items-center gap-2 border-t border-slate-100 pt-2">
        {!isCustom && (
          <button
            onClick={handleDup}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
            title="Duplicate to My Technologies with selected model params"
          >
            <FiCopy size={11} /> Duplicate
          </button>
        )}
        {isCustom && (
          <>
            <button
              onClick={() => onEdit(techName, tech)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
            >
              <FiEdit2 size={11} /> Edit
            </button>
            <button
              onClick={() => onDelete(techName)}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors ml-auto"
            >
              <FiTrash2 size={11} /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// --- Category Section --------------------------------------------------------
const CategorySection = ({ categoryKey, items, isCustomSection = false }) => {
  const meta = CATEGORY_META[categoryKey] || { icon: 'zap', color: '#94a3b8', label: formatName(categoryKey) };
  const label = isCustomSection ? `${meta.label} (My Technologies)` : meta.label;
  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${meta.color}1a` }}
        >
          <CategoryIcon iconKey={meta.icon} size={14} color={meta.color} />
        </span>
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
        <span className="text-xs text-slate-400">({items.length})</span>
        {isCustomSection && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">custom</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.map(({ techName, tech, isCustom, onDuplicate, onEdit, onDelete }) => (
          <TechCard
            key={techName}
            techName={techName}
            tech={tech}
            isCustom={isCustom}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
};

// --- Main Component ----------------------------------------------------------
function Technologies() {
  const { technologies, setTechnologies } = useData();
  const [searchTerm, setSearchTerm]               = useState('');
  const [selectedCategory, setSelectedCategory]   = useState('all');
  const [showOnlyCustom, setShowOnlyCustom]        = useState(false);
  const [editingTech, setEditingTech]              = useState(null);
  const [editForm, setEditForm]                    = useState(null);

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
  }, [technologies, liveTechTemplates]);

  // Handlers
  const handleDuplicate = (techName, overrideTech) => {
    const tech = overrideTech || allTechnologies[techName];
    if (!tech) return;
    const newName = `${techName}_copy_${Date.now()}`;
    const newTech = JSON.parse(JSON.stringify(tech));
    newTech.name = newName;
    newTech.essentials.name = newName;
    delete newTech.isTemplate;
    delete newTech.instances; // don't carry API instances into the custom copy
    setTechnologies([...technologies, newTech]);
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

  // Filtering helpers
  const matchesTerm     = (name) => !searchTerm || name.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesCategory = (parent) => selectedCategory === 'all' || parent === selectedCategory;

  const groupedTechs = useMemo(() => {
    const grouped = {};
    Object.entries(allTechnologies).forEach(([techName, tech]) => {
      if (!matchesTerm(techName) || !matchesCategory(tech.parent) || showOnlyCustom) return;
      const p = tech.parent;
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push({ techName, tech, isCustom: false, onDuplicate: handleDuplicate, onEdit: handleEdit, onDelete: handleDeleteFromCard });
    });
    return grouped;
  }, [allTechnologies, searchTerm, selectedCategory, showOnlyCustom]);

  const customTechsByParent = useMemo(() => {
    const grouped = {};
    technologies.forEach(tech => {
      if (!matchesTerm(tech.name)) return;
      const parent = tech.parent || tech.essentials?.parent || 'supply';
      if (!matchesCategory(parent)) return;
      if (!grouped[parent]) grouped[parent] = [];
      grouped[parent].push({ techName: tech.name, tech, isCustom: true, onDuplicate: handleDuplicate, onEdit: handleEdit, onDelete: handleDeleteFromCard });
    });
    return grouped;
  }, [technologies, searchTerm, selectedCategory]);

  const totalCustom = technologies.length;

  const templateCountByCategory = useMemo(() => {
    const counts = {};
    Object.values(allTechnologies).forEach(t => { counts[t.parent] = (counts[t.parent] || 0) + 1; });
    return counts;
  }, [allTechnologies]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <style>{customScrollbarStyles}</style>

      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Technology Library</h2>
          <div className="mt-2">
            {isApiLoading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" /> Checking
              </span>
            ) : isApiLive ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live OEO data
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 px-2 py-0.5 bg-amber-50 rounded-full border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Static data
              </span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-3 border-b border-slate-100">
          <div className="relative">
            <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-0.5">
          <button
            onClick={() => { setSelectedCategory('all'); setShowOnlyCustom(false); }}
            className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedCategory === 'all' && !showOnlyCustom ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="font-medium">All Templates</span>
            <span className="text-xs opacity-60">{Object.keys(allTechnologies).length}</span>
          </button>

          <div className="pt-3 pb-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 mb-1">Categories</p>
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
                onClick={() => { setSelectedCategory(key); setShowOnlyCustom(false); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CategoryIcon iconKey={meta.icon} size={13} color={active ? 'white' : meta.color} />
                <span className="flex-1 truncate text-xs">{meta.label}</span>
                <span className="text-xs opacity-50">{count}</span>
              </button>
            );
          })}

          {totalCustom > 0 && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 mb-1">My Technologies</p>
              </div>
              <button
                onClick={() => { setShowOnlyCustom(true); setSelectedCategory('all'); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  showOnlyCustom ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FiStar size={13} style={{ color: showOnlyCustom ? 'white' : '#f59e0b' }} />
                <span className="flex-1 text-xs">My Technologies</span>
                <span className="text-xs opacity-50">{totalCustom}</span>
              </button>
            </>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {showOnlyCustom ? (
          totalCustom === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <FiStar size={40} className="mb-3 opacity-30" />
              <p className="text-base font-medium">No custom technologies yet.</p>
              <p className="text-sm mt-1">Duplicate a template to get started.</p>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
                <FiStar size={16} className="text-amber-500" /> My Technologies
              </h2>
              {CATEGORY_ORDER.map(key => (
                <CategorySection key={key} categoryKey={key} items={customTechsByParent[key] || []} isCustomSection />
              ))}
            </div>
          )
        ) : (
          <div>
            {/* Inline custom techs panel (only in All view) */}
            {totalCustom > 0 && selectedCategory === 'all' && (
              <div className="mb-8 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <h2 className="text-sm font-semibold text-amber-800 mb-4 flex items-center gap-2">
                  <FiStar size={14} /> My Technologies ({totalCustom})
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
                <FiSearch size={36} className="mb-3 opacity-30" />
                <p className="text-sm">No technologies match your search.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingTech && editForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800 text-white rounded-t-xl">
              <h2 className="text-base font-bold">Edit: {editingTech}</h2>
              <button onClick={handleCancelEdit} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                <FiX size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
              {/* Essentials */}
              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3"> Essentials</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(editForm.essentials || {}).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{key}</label>
                      {key === 'color' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={value}
                            onChange={e => setEditForm({ ...editForm, essentials: { ...editForm.essentials, [key]: e.target.value } })}
                            className="w-10 h-9 border border-slate-300 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={value}
                            onChange={e => setEditForm({ ...editForm, essentials: { ...editForm.essentials, [key]: e.target.value } })}
                            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                          />
                        </div>
                      ) : key === 'parent' ? (
                        <input type="text" value={value} disabled className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-500" />
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={e => setEditForm({ ...editForm, essentials: { ...editForm.essentials, [key]: e.target.value } })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Constraints */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700"> Constraints ({Object.keys(editForm.constraints || {}).length})</h3>
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
                              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none font-mono"
                            />
                          </div>
                          <button
                            onClick={() => { const c = { ...editForm.constraints }; delete c[key]; setEditForm({ ...editForm, constraints: c }); }}
                            className="mt-5 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
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
                  <h3 className="text-sm font-semibold text-slate-700"> Costs ({Object.keys(editForm.costs?.monetary || {}).length})</h3>
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
                              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none font-mono"
                            />
                          </div>
                          <button
                            onClick={() => { const m = { ...(editForm.costs?.monetary || {}) }; delete m[key]; setEditForm({ ...editForm, costs: { ...editForm.costs, monetary: m } }); }}
                            className="mt-5 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
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
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors"
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

      {/* Constraint Search Modal */}
      {constraintSearch.main === 'open' && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setConstraintSearch({})}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 bg-slate-800 text-white rounded-t-xl">
              <h3 className="font-semibold text-sm">Add Constraint  {PARENT_TYPES[editForm.essentials?.parent] || 'Technology'}</h3>
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
                            <button key={c} onClick={() => addConstraint(c, '')} className="w-full text-left px-8 py-3 hover:bg-blue-50 transition-colors">
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

      {/* Cost Search Modal */}
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
                            <button key={c} onClick={() => addCost(c, 0)} className="w-full text-left px-8 py-3 hover:bg-blue-50 transition-colors">
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
  );
}

export default Technologies;