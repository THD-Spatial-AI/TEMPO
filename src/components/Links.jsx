import React, { useState, useMemo } from "react";
import { LuPencil, LuTrash2, LuCheck, LuX, LuPlus, LuSearch, LuLink, LuArrowRight, LuRuler, LuZap } from './ui/icons';
import { useData } from "../context/DataContext";
import SaveBar from './ui/SaveBar';
import { KpiCard } from './dashboard/DashboardWidgets';
import SortHeader from './ui/SortHeader';
import { nextSort, compareValues } from '../utils/sorting';
import { LINK_TYPES, LINK_TYPES_BY_GROUP, getLinkTypeColor } from "../config/linkTypes";
import { CARRIERS, getCarrierColor, getCarrierLabel } from "../config/carriers";
import { confirmAction } from './ui/confirm';
import SelectField from './ui/SelectField';

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
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border"
      style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, color }}
    >
      <span className="text-xs">{carrier?.icon ?? '•'}</span>
      {label}
    </span>
  );
}

/** Grouped link-type <SelectField> */
function LinkTypeSelect({ value, onChange, className = '' }) {
  return (
    <SelectField value={value} onChange={onChange} className={className}>
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
    </SelectField>
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

  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const onSort = (key) => setSort(prev => nextSort(prev, key));
  const sortedLinks = useMemo(() => {
    if (!sort.key) return filteredLinks;
    const value = (l) => sort.key === 'carrier' ? resolveLinkCarrier(l) : l[sort.key];
    const sorted = [...filteredLinks].sort((a, b) => compareValues(value(a), value(b)));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [filteredLinks, sort]);

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

  const deleteLink = async (index) => {
    if (await confirmAction({ title: 'Delete this link?', message: 'The connection and its transmission settings will be removed.', details: `${links[index]?.from} → ${links[index]?.to}` })) {
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

  const totalDistance = links.reduce((sum, l) => sum + (parseFloat(l.distance) || 0), 0);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      <SaveBar label="Links" />
      <div className="flex-1 overflow-y-auto">
      <div className="w-full px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-black">Links</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-slate-500">
            Manage connections between locations. Each link carries an energy carrier
            (electricity, heat, hydrogen, gas, CO₂ …).
          </p>
        </div>
        {currentModel && (
          <span className="inline-flex items-center gap-2 border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {currentModel.name}
          </span>
        )}
      </div>

      {links.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
          <KpiCard icon={LuLink} label="Links" value={links.length} sub="connections" />
          <KpiCard icon={LuRuler} label="Total length" value={totalDistance.toLocaleString(undefined, { maximumFractionDigits: 0 })} sub="km" />
          <KpiCard icon={LuZap} label="Carriers" value={presentCarriers.length} sub="energy carriers" />
        </div>
      )}

      <div className="rounded-2xl border border-black/15 bg-white ">
        {/* Toolbar */}
        <div className="border-b border-black/10 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              All links
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {filteredLinks.length}{filteredLinks.length !== links.length ? ` of ${links.length}` : ''}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input type="text" placeholder="Search by location or type" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-10 w-72 rounded-lg border border-black/15 bg-slate-50 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-black/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
              </div>
              <button onClick={() => setIsAdding(true)}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-black px-4 text-sm font-semibold text-white  transition-colors hover:bg-black/80">
                <LuPlus size={16} /> Add link
              </button>
            </div>
          </div>

          {presentCarriers.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {['all', ...presentCarriers].map(c => {
                const active = filterCarrier === c;
                const color  = c === 'all' ? '#0f172a' : getCarrierColor(c);
                const count  = c === 'all' ? links.length : links.filter(l => resolveLinkCarrier(l) === c).length;
                return (
                  <button key={c} onClick={() => setFilterCarrier(c)}
                    className={`flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-all ${active ? '' : 'hover:border-black/15'}`}
                    style={{ backgroundColor: active ? `${color}14` : 'white', borderColor: active ? `${color}66` : '#e2e8f0', color: active ? color : '#64748b' }}
                  >
                    {c === 'all' ? 'All' : (<><span>{CARRIERS[c]?.icon ?? '•'}</span>{getCarrierLabel(c)}</>)}
                    <span className="tabular-nums opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {links.length === 0 ? (
          <div className="m-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-black/15 px-6 py-20 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
              <LuLink size={20} />
            </div>
            <p className="text-sm font-semibold text-slate-800">No links yet</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Connect two locations with a transmission line, pipeline or other carrier.</p>
            <button onClick={() => setIsAdding(true)}
              className="mt-5 flex h-10 items-center gap-1.5 rounded-lg bg-black px-4 text-sm font-semibold text-white  transition-colors hover:bg-black/80">
              <LuPlus size={16} /> Add link
            </button>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="m-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-black/15 px-6 py-16 text-center">
            <LuSearch size={20} className="mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">No matches</p>
            <p className="mt-1 text-sm text-slate-500">No links match your search or filter.</p>
          </div>
        ) : (
          <div className="m-3 overflow-hidden rounded-xl border border-black/15">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                <tr className="border-b border-black/15 text-left">
                  <th className="px-5 py-2.5"><SortHeader label="Route" sortKey="from" sort={sort} onSort={onSort} /></th>
                  <th className="px-5 py-2.5"><SortHeader label="Carrier / Type" sortKey="carrier" sort={sort} onSort={onSort} /></th>
                  <th className="px-5 py-2.5 text-right"><SortHeader label="Capacity" sortKey="capacity" sort={sort} onSort={onSort} align="right" /></th>
                  <th className="px-5 py-2.5 text-right"><SortHeader label="Distance" sortKey="distance" sort={sort} onSort={onSort} align="right" /></th>
                  <th className="w-24 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {sortedLinks.map((link) => {
                  const index   = links.indexOf(link);
                  const carrier = resolveLinkCarrier(link);
                  const lt      = LINK_TYPES[link.linkType];
                  return (
                    <tr key={index} className={`group transition-colors ${editingIndex === index ? 'bg-slate-50' : 'hover:bg-slate-50/70'}`}>
                      {editingIndex === index ? (
                        <>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <SelectField value={editData.from} onChange={e => setEditData({ ...editData, from: e.target.value })}
                                className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200">
                                <option value="">From…</option>
                                {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                              </SelectField>
                              <LuArrowRight size={14} className="shrink-0 text-slate-400" />
                              <SelectField value={editData.to} onChange={e => setEditData({ ...editData, to: e.target.value })}
                                className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200">
                                <option value="">To…</option>
                                {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                              </SelectField>
                            </div>
                          </td>
                          <td className="px-5 py-3" style={{ minWidth: 220 }}>
                            <div className="space-y-1.5">
                              <LinkTypeSelect value={editData.linkType ?? ''} onChange={handleEditLinkTypeChange}
                                className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200" />
                              <SelectField value={editData.carrier ?? carrier} onChange={e => setEditData({ ...editData, carrier: e.target.value })}
                                className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200">
                                {Object.values(CARRIERS).map(c => (
                                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                                ))}
                              </SelectField>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <input type="number" value={editData.capacity ?? ''}
                              onChange={e => setEditData({ ...editData, capacity: e.target.value })}
                              className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200 ml-auto w-24 text-right font-mono" placeholder="kW" />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <input type="number" value={editData.distance ?? ''}
                              onChange={e => setEditData({ ...editData, distance: e.target.value })}
                              className="h-8 w-full rounded-lg border border-black/15 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200 ml-auto w-24 text-right font-mono" placeholder="km" />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              <button onClick={saveEdit} title="Save" className="grid h-7 w-7 place-items-center rounded-md bg-black text-white hover:bg-black/80"><LuCheck size={14}/></button>
                              <button onClick={cancelEdit} title="Cancel" className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-200/70"><LuX size={14}/></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: link.linkType ? getLinkTypeColor(link.linkType) : getCarrierColor(carrier) }} />
                              <span className="truncate">{link.from}</span>
                              <LuArrowRight size={13} className="shrink-0 text-slate-400" />
                              <span className="truncate">{link.to}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <CarrierBadge carrierId={carrier} />
                              {lt && <span className="max-w-[200px] truncate text-xs text-slate-500" title={lt.label}>{lt.label}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-slate-600">{link.capacity ?? '—'}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-slate-600">{link.distance != null ? `${link.distance} km` : '—'}</td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                              <button onClick={() => startEdit(index)} title="Edit link"
                                className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-900"><LuPencil size={14}/></button>
                              <button onClick={() => deleteLink(index)} title="Delete link"
                                className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"><LuTrash2 size={14}/></button>
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
          <div className="border-t border-black/10 bg-slate-50/60 px-5 py-2 text-xs text-slate-500">
            Showing {sortedLinks.length} of {links.length} links
          </div>
          </div>
        )}
      </div>
      </div>

      {/* ── Add Link Modal ────────────────────────────────────────────────────── */}
      {isAdding && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
            <div className="flex items-start justify-between border-b border-black/10 px-6 py-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Add link</h3>
                <p className="mt-0.5 text-xs text-slate-500">Connect two locations in the active model.</p>
              </div>
              <button onClick={() => { setIsAdding(false); setNewLink(emptyLink); }} aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LuX size={16}/></button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">From</label>
                  <SelectField value={newLink.from} onChange={e => setNewLink({ ...newLink, from: e.target.value })} className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200">
                    <option value="">Select…</option>
                    {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                  </SelectField>
                </div>
                <LuArrowRight size={16} className="mb-3 text-slate-400" />
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">To</label>
                  <SelectField value={newLink.to} onChange={e => setNewLink({ ...newLink, to: e.target.value })} className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200">
                    <option value="">Select…</option>
                    {locations.map((loc, i) => <option key={i} value={loc.name}>{loc.name}</option>)}
                  </SelectField>
                </div>
              </div>

              {/* Link Type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Link type <span className="font-normal text-slate-400">· sets carrier &amp; default costs</span>
                </label>
                <LinkTypeSelect value={newLink.linkType} onChange={handleNewLinkTypeChange} className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200" />
                {newLink.linkType && LINK_TYPES[newLink.linkType] && (
                  <p className="mt-1.5 text-xs text-slate-500">{LINK_TYPES[newLink.linkType].description}</p>
                )}
              </div>

              {/* Carrier override */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Carrier <span className="font-normal text-slate-400">· auto-set from type, override if needed</span>
                </label>
                <div className="flex items-center gap-2">
                  <SelectField value={newLink.carrier} onChange={e => setNewLink({ ...newLink, carrier: e.target.value })} className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200">
                    {Object.values(CARRIERS).map(c => (
                      <option key={c.id} value={c.id}>{c.icon}  {c.label}</option>
                    ))}
                  </SelectField>
                  {newLink.carrier && (
                    <span className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white shadow"
                      style={{ backgroundColor: getCarrierColor(newLink.carrier) }} />
                  )}
                </div>
              </div>

              {/* Capacity / Distance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Capacity (kW)</label>
                  <input type="number" value={newLink.capacity} onChange={e => setNewLink({ ...newLink, capacity: e.target.value })}
                    className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono" placeholder="optional" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Distance (km)</label>
                  <input type="number" value={newLink.distance} onChange={e => setNewLink({ ...newLink, distance: e.target.value })}
                    className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-black/15 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono" placeholder="auto" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-black/10 bg-slate-50/60 px-6 py-4">
              <button onClick={() => { setIsAdding(false); setNewLink(emptyLink); }}
                className="h-9 rounded-lg border border-black/15 bg-white px-4 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50">Cancel</button>
              <button onClick={addLink} disabled={!newLink.from || !newLink.to || !newLink.linkType}
                className="h-9 rounded-lg bg-black px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-slate-300">
                Add link
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
