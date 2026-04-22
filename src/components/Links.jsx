import React, { useState, useMemo } from "react";
import { FiEdit2, FiTrash2, FiCheck, FiX, FiPlus, FiSearch, FiLink } from "react-icons/fi";
import { useData } from "../context/DataContext";
import SaveBar from './ui/SaveBar';
import { LINK_TYPES, LINK_TYPES_BY_GROUP, getLinkTypeColor } from "../config/linkTypes";
import { CARRIERS, getCarrierColor, getCarrierLabel } from "../config/carriers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive carrier from a link object */
function resolveLinkCarrier(link) {
  if (link.carrier) return link.carrier;
  if (link.linkType && LINK_TYPES[link.linkType]) return LINK_TYPES[link.linkType].carrier;
  return 'electricity';
}

/** Colored carrier badge */
function CarrierBadge({ carrierId }) {
  const color   = getCarrierColor(carrierId);
  const label   = getCarrierLabel(carrierId);
  const carrier = CARRIERS[carrierId];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color }}
    >
      <span className="text-xs">{carrier?.icon ?? '•'}</span>
      {label}
    </span>
  );
}

/** Grouped link-type <select> */
function LinkTypeSelect({ value, onChange, className = '' }) {
  return (
    <select value={value} onChange={onChange} className={className}>
      <option value="">— Select link type —</option>
      {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
        <optgroup key={group} label={group}>
          {types.map(lt => (
            <option key={lt.id} value={lt.id}>
              {lt.icon}  {lt.label}  ({getCarrierLabel(lt.carrier)})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const Links = () => {
  const { links, setLinks, locations, getCurrentModel } = useData();
  const currentModel = getCurrentModel();

  const [editingIndex, setEditingIndex] = useState(null);
  const [editData, setEditData]         = useState({});
  const [isAdding, setIsAdding]         = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterCarrier, setFilterCarrier] = useState('all');

  const emptyLink = { from: '', to: '', linkType: 'hvac_overhead', carrier: 'electricity', capacity: '', distance: '' };
  const [newLink, setNewLink] = useState(emptyLink);

  // When user picks a link type, auto-fill carrier
  const handleNewLinkTypeChange = (e) => {
    const lt = LINK_TYPES[e.target.value];
    setNewLink(prev => ({ ...prev, linkType: e.target.value, carrier: lt?.carrier ?? prev.carrier }));
  };
  const handleEditLinkTypeChange = (e) => {
    const lt = LINK_TYPES[e.target.value];
    setEditData(prev => ({ ...prev, linkType: e.target.value, carrier: lt?.carrier ?? prev.carrier }));
  };

  // Haversine distance
  const calculateDistance = (fromLoc, toLoc) => {
    if (!fromLoc?.latitude || !fromLoc?.longitude || !toLoc?.latitude || !toLoc?.longitude) return null;
    const R = 6371;
    const dLat = (toLoc.latitude  - fromLoc.latitude)  * Math.PI / 180;
    const dLon = (toLoc.longitude - fromLoc.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(fromLoc.latitude * Math.PI / 180) * Math.cos(toLoc.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
  };

  // Filtering
  const filteredLinks = useMemo(() => {
    return links.filter(link => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        link.from?.toLowerCase().includes(q) ||
        link.to?.toLowerCase().includes(q) ||
        (link.linkType && LINK_TYPES[link.linkType]?.label.toLowerCase().includes(q));
      const carrier = resolveLinkCarrier(link);
      const matchCarrier = filterCarrier === 'all' || carrier === filterCarrier;
      return matchSearch && matchCarrier;
    });
  }, [links, searchQuery, filterCarrier]);

  const presentCarriers = useMemo(() => {
    return Array.from(new Set(links.map(l => resolveLinkCarrier(l))));
  }, [links]);

  // CRUD
  const startEdit  = (i) => { setEditingIndex(i); setEditData({ ...links[i] }); };
  const cancelEdit = ()  => { setEditingIndex(null); setEditData({}); };

  const saveEdit = () => {
    const fromLoc  = locations.find(l => l.name === editData.from);
    const toLoc    = locations.find(l => l.name === editData.to);
    let   distance = editData.distance ? parseFloat(editData.distance) : undefined;
    if (!distance && fromLoc && toLoc) distance = calculateDistance(fromLoc, toLoc);
    const updated = [...links];
    updated[editingIndex] = {
      from:     editData.from,
      to:       editData.to,
      linkType: editData.linkType || 'hvac_overhead',
      carrier:  editData.carrier  || resolveLinkCarrier(editData),
      capacity: editData.capacity ? parseFloat(editData.capacity) : editData.capacity,
      distance,
    };
    setLinks(updated);
    setEditingIndex(null);
    setEditData({});
  };

  const deleteLink = (index) => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      setLinks(links.filter((_, i) => i !== index));
    }
  };

  const addLink = () => {
    if (!newLink.from || !newLink.to) return;
    const fromLoc  = locations.find(l => l.name === newLink.from);
    const toLoc    = locations.find(l => l.name === newLink.to);
    let   distance = newLink.distance ? parseFloat(newLink.distance) : undefined;
    if (!distance && fromLoc && toLoc) distance = calculateDistance(fromLoc, toLoc);
    setLinks([...links, {
      from:     newLink.from,
      to:       newLink.to,
      linkType: newLink.linkType || 'hvac_overhead',
      carrier:  newLink.carrier  || resolveLinkCarrier(newLink),
      capacity: newLink.capacity ? parseFloat(newLink.capacity) : undefined,
      distance,
    }]);
    setNewLink(emptyLink);
    setIsAdding(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      <SaveBar label="Links" />
      <div className="flex-1 p-8 overflow-y-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Links</h1>
        <p className="text-slate-600">
          Manage connections between locations. Each link carries an energy carrier
          (electricity, heat, hydrogen, gas, CO₂ …).
        </p>
        {currentModel && <p className="text-sm text-gray-600 mt-1">Model: {currentModel.name}</p>}
      </div>

      {/* Carrier filter pills */}
      {presentCarriers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wide mr-1">Filter:</span>
          {['all', ...presentCarriers].map(c => {
            const active = filterCarrier === c;
            const color  = c === 'all' ? '#64748b' : getCarrierColor(c);
            return (
              <button key={c} onClick={() => setFilterCarrier(c)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                style={{ backgroundColor: active ? `${color}22` : 'white', borderColor: active ? color : '#e2e8f0', color: active ? color : '#64748b' }}
              >
                {c === 'all' ? `All (${links.length})` : (
                  <span className="flex items-center gap-1">
                    {CARRIERS[c]?.icon ?? '•'} {getCarrierLabel(c)}
                    <span className="opacity-60">({links.filter(l => resolveLinkCarrier(l) === c).length})</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-800">
            Link List ({filteredLinks.length}{filteredLinks.length !== links.length ? ` of ${links.length}` : ''})
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Search by location or type…" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm w-72" />
            </div>
            <button onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm flex items-center gap-2">
              <FiPlus /> Add Link
            </button>
          </div>
        </div>

        {links.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-64 flex flex-col items-center justify-center bg-slate-50 gap-2">
            <FiLink size={32} className="text-slate-300" />
            <p className="text-slate-500">No links configured yet. Click "Add Link" to create one.</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-40 flex items-center justify-center bg-slate-50">
            <p className="text-slate-500">No links match your filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Carrier / Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Capacity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Distance (km)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredLinks.map((link) => {
                  const index   = links.indexOf(link);
                  const carrier = resolveLinkCarrier(link);
                  const lt      = LINK_TYPES[link.linkType];
                  return (
                    <tr key={index} className="hover:bg-slate-50">
                      {editingIndex === index ? (
                        <>
                          <td className="px-4 py-3" style={{ minWidth: 200 }}>
                            <div className="space-y-1.5">
                              <LinkTypeSelect value={editData.linkType ?? ''} onChange={handleEditLinkTypeChange}
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none" />
                              <select value={editData.carrier ?? carrier} onChange={e => setEditData({ ...editData, carrier: e.target.value })}
                                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none">
                                {Object.values(CARRIERS).map(c => (
                                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select value={editData.from} onChange={e => setEditData({ ...editData, from: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-sm w-full">
                              <option value="">Select…</option>
                              {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select value={editData.to} onChange={e => setEditData({ ...editData, to: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-sm w-full">
                              <option value="">Select…</option>
                              {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" value={editData.capacity ?? ''}
                              onChange={e => setEditData({ ...editData, capacity: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-sm w-24" placeholder="kW" />
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" value={editData.distance ?? ''}
                              onChange={e => setEditData({ ...editData, distance: e.target.value })}
                              className="px-2 py-1 border border-slate-300 rounded text-sm w-24" placeholder="km" />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex gap-2">
                              <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-800"><FiCheck size={18}/></button>
                              <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-700"><FiX size={18}/></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <CarrierBadge carrierId={carrier} />
                              {lt && <span className="text-xs text-slate-400 truncate max-w-[180px]" title={lt.label}>{lt.icon} {lt.label}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{link.from}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{link.to}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{link.capacity ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{link.distance ?? '—'}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex gap-2">
                              <button onClick={() => startEdit(index)} className="text-gray-600 hover:text-gray-800"><FiEdit2 size={16}/></button>
                              <button onClick={() => deleteLink(index)} className="text-gray-600 hover:text-gray-800"><FiTrash2 size={16}/></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Link Modal ────────────────────────────────────────────────────── */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 bg-slate-800 text-white rounded-t-xl flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2"><FiLink size={16}/> Add New Link</h3>
              <button onClick={() => { setIsAdding(false); setNewLink(emptyLink); }} className="p-1 hover:bg-white/20 rounded"><FiX size={18}/></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Link Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Link / Infrastructure Type
                  <span className="ml-1 text-xs font-normal text-slate-400">(determines carrier &amp; default costs)</span>
                </label>
                <LinkTypeSelect value={newLink.linkType} onChange={handleNewLinkTypeChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm" />
                {newLink.linkType && LINK_TYPES[newLink.linkType] && (
                  <p className="mt-1 text-xs text-slate-400 italic">{LINK_TYPES[newLink.linkType].description}</p>
                )}
              </div>

              {/* Carrier override */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Carrier
                  <span className="ml-1 text-xs font-normal text-slate-400">(auto-set from type; override if needed)</span>
                </label>
                <div className="flex items-center gap-2">
                  <select value={newLink.carrier} onChange={e => setNewLink({ ...newLink, carrier: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm">
                    {Object.values(CARRIERS).map(c => (
                      <option key={c.id} value={c.id}>{c.icon}  {c.label}</option>
                    ))}
                  </select>
                  {newLink.carrier && (
                    <span className="w-6 h-6 rounded-full flex-shrink-0 border-2 border-white shadow"
                      style={{ backgroundColor: getCarrierColor(newLink.carrier) }} />
                  )}
                </div>
              </div>

              {/* From / To */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">From</label>
                  <select value={newLink.from} onChange={e => setNewLink({ ...newLink, from: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm">
                    <option value="">Select…</option>
                    {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">To</label>
                  <select value={newLink.to} onChange={e => setNewLink({ ...newLink, to: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm">
                    <option value="">Select…</option>
                    {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Capacity / Distance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Capacity (kW)</label>
                  <input type="number" value={newLink.capacity} onChange={e => setNewLink({ ...newLink, capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none text-sm" placeholder="optional" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Distance (km)</label>
                  <input type="number" value={newLink.distance} onChange={e => setNewLink({ ...newLink, distance: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none text-sm" placeholder="Auto-calc." />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => { setIsAdding(false); setNewLink(emptyLink); }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
              <button onClick={addLink} disabled={!newLink.from || !newLink.to || !newLink.linkType}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm disabled:bg-slate-300 disabled:cursor-not-allowed">
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default Links;
