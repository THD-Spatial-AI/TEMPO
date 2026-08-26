import React, { useState, useMemo } from 'react';
import { FiSearch, FiX, FiPlus, FiCheck, FiTrash2 } from 'react-icons/fi';
import { useData } from '../../context/DataContext';
import { oeoDetailToCalliope } from '../../services/techDatabaseApi';

const PARENT_META = {
  supply_plus:     { color: '#f59e0b', label: 'Variable Renewables'     },
  supply:          { color: '#3b82f6', label: 'Dispatchable'            },
  storage:         { color: '#8b5cf6', label: 'Storage'                 },
  conversion_plus: { color: '#10b981', label: 'Conversion'              },
  transmission:    { color: '#64748b', label: 'Transmission'            },
  demand:          { color: '#ef4444', label: 'Demand'                  },
};

const PARENT_ORDER = ['supply_plus', 'supply', 'storage', 'conversion_plus', 'transmission', 'demand'];

function formatName(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function ParentBadge({ parent }) {
  const meta = PARENT_META[parent] || { color: '#94a3b8', label: formatName(parent) };
  return (
    <span
      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `${meta.color}18`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

export default function TechLibraryPanel({ onClose, liveTechTemplates, isApiLive }) {
  const { technologies, addTechToModel, removeTechFromModel } = useData();
  const [search, setSearch] = useState('');

  // Only OEO techs have a uuid — filter out static TECH_TEMPLATES entries
  const catalogFlat = useMemo(() => {
    const list = [];
    if (!liveTechTemplates) return list;
    Object.values(liveTechTemplates).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(t => { if (t.uuid) list.push(t); });
    });
    return list;
  }, [liveTechTemplates]);

  // Only show OEO-sourced techs in the model library section
  const oeoInModel = useMemo(() => technologies.filter(t => t.uuid), [technologies]);

  const inModelNames = useMemo(
    () => new Set(oeoInModel.map(t => t.name)),
    [oeoInModel]
  );

  // Search results — client-side filter of OEO catalog
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalogFlat
      .filter(t => {
        const name = (t.essentials?.name || t.name || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
      .slice(0, 30);
  }, [search, catalogFlat]);

  // Current model library grouped by parent type (OEO only)
  const libraryByParent = useMemo(() => {
    const groups = {};
    oeoInModel.forEach(t => {
      const p = t.parent || 'other';
      if (!groups[p]) groups[p] = [];
      groups[p].push(t);
    });
    return groups;
  }, [oeoInModel]);

  const libraryParents = PARENT_ORDER.filter(p => libraryByParent[p])
    .concat(Object.keys(libraryByParent).filter(p => !PARENT_ORDER.includes(p)));

  const handleAdd = (tech) => {
    const converted = tech.uuid ? oeoDetailToCalliope(tech) : tech;
    addTechToModel(converted);
  };

  return (
    <div className="absolute top-4 left-4 z-40 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 8rem)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
        <span className="text-[11px] font-bold text-slate-700 flex-1 tracking-wide uppercase">Tech Library</span>
        {oeoInModel.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
            {oeoInModel.length} in model
          </span>
        )}
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <FiX size={13} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2.5 py-2 border-b border-slate-100 flex-shrink-0">
        <div className="relative">
          <FiSearch size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search catalog to add…"
            className="w-full pl-7 pr-2.5 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 placeholder:text-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <FiX size={10} />
            </button>
          )}
        </div>
      </div>

      {/* API offline notice */}
      {!isApiLive && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-start gap-2 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1" />
          <p className="text-[10px] text-amber-700 leading-snug">
            OpenTech·DB offline — catalog unavailable. Technologies already in the model are still shown.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {/* Search results */}
        {search.trim() ? (
          <div className="p-2">
            {searchResults.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">No matches for "{search}"</p>
            ) : (
              <>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-px">
                  {searchResults.map(tech => {
                    const techName = tech.name || tech.essentials?.name || '';
                    const alreadyIn = inModelNames.has(techName);
                    return (
                      <div
                        key={techName}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-700 truncate leading-none">
                            {tech.essentials?.name || formatName(techName)}
                          </p>
                          <div className="mt-0.5">
                            <ParentBadge parent={tech.parent} />
                          </div>
                        </div>
                        {alreadyIn ? (
                          <button
                            onClick={() => removeTechFromModel(techName)}
                            className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 hover:text-red-500 transition-colors"
                            title="Remove from model"
                          >
                            <FiCheck size={11} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAdd(tech)}
                            className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Add to model"
                          >
                            <FiPlus size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Model library */
          <div className="p-2">
            {oeoInModel.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[11px] text-slate-400">No OpenTech·DB technologies in this model yet.</p>
                <p className="text-[10px] text-slate-300 mt-1">Search the catalog above or use the Technologies view.</p>
              </div>
            ) : (
              libraryParents.map(parent => {
                const group = libraryByParent[parent] || [];
                const meta = PARENT_META[parent] || { color: '#94a3b8', label: formatName(parent) };
                return (
                  <div key={parent} className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <div className="flex-1 h-px" style={{ background: `${meta.color}30` }} />
                    </div>
                    <div className="space-y-px">
                      {group.map(tech => {
                        const techName = tech.name || tech.essentials?.name || '';
                        const displayName = tech.essentials?.name || formatName(techName);
                        return (
                          <div
                            key={techName}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: meta.color }}
                            />
                            <span className="text-[11px] font-medium text-slate-700 flex-1 truncate leading-none">
                              {displayName}
                            </span>
                            <button
                              onClick={() => removeTechFromModel(techName)}
                              className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-slate-300 hover:text-red-500 transition-all"
                              title="Remove from model"
                            >
                              <FiTrash2 size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
