import React, { useState } from 'react';
import { FiFolder, FiTrash2, FiEdit2, FiCheck, FiX, FiPlus } from 'react-icons/fi';
import { useData } from '../context/DataContext';

const ModelSelector = () => {
  const { models, currentModelId, loadModel, deleteModel, renameModel } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const currentModel = models.find((m) => m.id === currentModelId);

  const handleRename = (modelId) => {
    if (editName.trim()) {
      renameModel(modelId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleDelete = (modelId, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this model?')) {
      deleteModel(modelId);
    }
  };

  const startEdit = (model, e) => {
    e.stopPropagation();
    setEditingId(model.id);
    setEditName(model.name);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors text-sm"
      >
        <FiFolder />
        <span className="font-medium">
          {currentModel ? currentModel.name : 'Select Model'}
        </span>
        <span className="text-slate-400">
          {models.length > 0 && `(${models.length})`}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[999]"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-slate-200 min-w-[300px] max-h-[400px] overflow-y-auto z-[1000]">
            <div className="p-2">
              {models.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  No models yet. Upload data to create a model.
                </div>
              ) : (
                models.map((model) => (
                  <div
                    key={model.id}
                    className={`p-3 rounded-md cursor-pointer transition-colors ${
                      currentModelId === model.id
                        ? 'bg-gray-50 border border-gray-200'
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      loadModel(model.id);
                      setIsOpen(false);
                    }}
                  >
                    {editingId === model.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
                          autoFocus
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleRename(model.id);
                          }}
                        />
                        <button
                          onClick={() => handleRename(model.id)}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <FiCheck size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                          }}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          <FiX size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-slate-800 text-sm">
                            {model.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {model.locations.length} locations, {model.links.length} links
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            Updated: {new Date(model.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => startEdit(model, e)}
                            className="p-1 text-slate-600 hover:text-gray-600 transition-colors"
                          >
                            <FiEdit2 size={14} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(model.id, e)}
                            className="p-1 text-slate-600 hover:text-gray-600 transition-colors"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ModelSelector;
