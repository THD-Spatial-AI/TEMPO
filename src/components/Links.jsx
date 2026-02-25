import React, { useState } from "react";
import { FiEdit2, FiTrash2, FiCheck, FiX, FiPlus, FiSearch } from "react-icons/fi";
import { useData } from "../context/DataContext";

const Links = () => {
  const { links, setLinks, locations, getCurrentModel } = useData();
  const currentModel = getCurrentModel();
  const [editingIndex, setEditingIndex] = useState(null);
  const [editData, setEditData] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newLink, setNewLink] = useState({
    from: '',
    to: '',
    capacity: '',
    distance: ''
  });

  // Calculate distance between two coordinates using Haversine formula (in km)
  const calculateDistance = (fromLoc, toLoc) => {
    if (!fromLoc || !toLoc || !fromLoc.latitude || !fromLoc.longitude || !toLoc.latitude || !toLoc.longitude) {
      return null;
    }
    
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (toLoc.latitude - fromLoc.latitude) * Math.PI / 180;
    const dLon = (toLoc.longitude - fromLoc.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(fromLoc.latitude * Math.PI / 180) * Math.cos(toLoc.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  };

  // Filter links based on search query
  const filteredLinks = links.filter(link => {
    const searchLower = searchQuery.toLowerCase();
    return (
      link.from?.toLowerCase().includes(searchLower) ||
      link.to?.toLowerCase().includes(searchLower)
    );
  });

  const startEdit = (index) => {
    setEditingIndex(index);
    setEditData({ ...links[index] });
  };

  const saveEdit = () => {
    const updatedLinks = [...links];
    
    const fromLoc = locations.find(loc => loc.name === editData.from);
    const toLoc = locations.find(loc => loc.name === editData.to);
    
    let distance = editData.distance ? parseFloat(editData.distance) : undefined;
    
    // Calculate distance if not provided
    if (!distance && fromLoc && toLoc) {
      distance = calculateDistance(fromLoc, toLoc);
    }
    
    updatedLinks[editingIndex] = {
      from: editData.from,
      to: editData.to,
      capacity: editData.capacity ? parseFloat(editData.capacity) : editData.capacity,
      distance: distance
    };
    setLinks(updatedLinks);
    setEditingIndex(null);
    setEditData({});
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditData({});
  };

  const deleteLink = (index) => {
    if (window.confirm('Are you sure you want to delete this link?')) {
      const updatedLinks = links.filter((_, i) => i !== index);
      setLinks(updatedLinks);
    }
  };

  const addLink = () => {
    if (newLink.from && newLink.to) {
      const fromLoc = locations.find(loc => loc.name === newLink.from);
      const toLoc = locations.find(loc => loc.name === newLink.to);
      
      let distance = newLink.distance ? parseFloat(newLink.distance) : undefined;
      
      // Calculate distance if not provided
      if (!distance && fromLoc && toLoc) {
        distance = calculateDistance(fromLoc, toLoc);
      }
      
      setLinks([...links, {
        from: newLink.from,
        to: newLink.to,
        capacity: newLink.capacity ? parseFloat(newLink.capacity) : undefined,
        distance: distance
      }]);
      setNewLink({ from: '', to: '', capacity: '', distance: '' });
      setIsAdding(false);
    }
  };

  return (
    <div className="flex-1 p-8 bg-gray-50">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Links</h1>
        <p className="text-slate-600">Manage connections between locations</p>
        {currentModel && (
          <p className="text-sm text-gray-600 mt-1">Model: {currentModel.name}</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-800">
            Link List ({links.length})
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search links..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm w-64"
              />
            </div>
            <button
              onClick={() => setIsAdding(true)}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm flex items-center gap-2"
            >
              <FiPlus /> Add Link
            </button>
          </div>
        </div>

        {links.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-96 flex items-center justify-center bg-slate-50">
            <p className="text-slate-500">No links configured yet. Load a model to get started.</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="border-2 border-dashed border-slate-300 rounded-lg h-96 flex items-center justify-center bg-slate-50">
            <p className="text-slate-500">No links match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    From
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Capacity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Distance (km)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredLinks.map((link) => {
                  const index = links.indexOf(link);
                  return (
                  <tr key={index} className="hover:bg-slate-50">
                    {editingIndex === index ? (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={editData.from}
                            onChange={(e) => setEditData({ ...editData, from: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-sm w-full"
                          >
                            <option value="">Select location</option>
                            {locations.map((loc, i) => (
                              <option key={i} value={loc.name}>{loc.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={editData.to}
                            onChange={(e) => setEditData({ ...editData, to: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-sm w-full"
                          >
                            <option value="">Select location</option>
                            {locations.map((loc, i) => (
                              <option key={i} value={loc.name}>{loc.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            value={editData.capacity}
                            onChange={(e) => setEditData({ ...editData, capacity: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-sm w-full"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="number"
                            value={editData.distance}
                            onChange={(e) => setEditData({ ...editData, distance: e.target.value })}
                            className="px-2 py-1 border border-slate-300 rounded text-sm w-full"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="text-gray-600 hover:text-gray-800">
                              <FiCheck size={18} />
                            </button>
                            <button onClick={cancelEdit} className="text-gray-600 hover:text-gray-800">
                              <FiX size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {link.from}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {link.to}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {link.capacity || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {link.distance || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(index)}
                              className="text-gray-600 hover:text-gray-800"
                            >
                              <FiEdit2 size={16} />
                            </button>
                            <button
                              onClick={() => deleteLink(index)}
                              className="text-gray-600 hover:text-gray-800"
                            >
                              <FiTrash2 size={16} />
                            </button>
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

      {/* Add Link Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-800">Add New Link</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Location</label>
                <select
                  value={newLink.from}
                  onChange={(e) => setNewLink({ ...newLink, from: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="">Select location</option>
                  {locations.map((loc, i) => (
                    <option key={i} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To Location</label>
                <select
                  value={newLink.to}
                  onChange={(e) => setNewLink({ ...newLink, to: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="">Select location</option>
                  {locations.map((loc, i) => (
                    <option key={i} value={loc.name}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Capacity (optional)</label>
                <input
                  type="number"
                  value={newLink.capacity}
                  onChange={(e) => setNewLink({ ...newLink, capacity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="e.g., 500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Distance (km, optional)</label>
                <input
                  type="number"
                  value={newLink.distance}
                  onChange={(e) => setNewLink({ ...newLink, distance: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  placeholder="Auto-calculated if left empty"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewLink({ from: '', to: '', capacity: '', distance: '' });
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addLink}
                disabled={!newLink.from || !newLink.to}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Links;
