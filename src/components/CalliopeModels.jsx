import React, { useState, useEffect } from "react";
import { FiFolder, FiFile, FiDownload, FiTrash2, FiEdit2, FiX, FiSave, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { useData } from "../context/DataContext";

const CalliopeModels = () => {
  const [exportedModels, setExportedModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({});
  const { getCurrentModel } = useData();

  useEffect(() => {
    // Load exported models from localStorage
    const saved = localStorage.getItem("calliope_exported_models");
    if (saved) {
      setExportedModels(JSON.parse(saved));
    }
  }, []);

  const saveModels = (models) => {
    localStorage.setItem("calliope_exported_models", JSON.stringify(models));
    setExportedModels(models);
  };

  const handleExportComplete = (modelData) => {
    const newModel = {
      id: Date.now(),
      name: modelData.name,
      timestamp: new Date().toISOString(),
      files: modelData.files,
    };
    
    const updated = [...exportedModels, newModel];
    saveModels(updated);
  };

  const handleDeleteModel = (modelId) => {
    if (confirm("Are you sure you want to delete this exported model?")) {
      const updated = exportedModels.filter(m => m.id !== modelId);
      saveModels(updated);
      if (selectedModel?.id === modelId) {
        setSelectedModel(null);
        setSelectedFile(null);
      }
    }
  };

  const handleFileClick = (file) => {
    setSelectedFile(file);
    setFileContent(file.content);
    setIsEditing(false);
  };

  const handleSaveFile = () => {
    if (selectedModel && selectedFile) {
      const updated = exportedModels.map(model => {
        if (model.id === selectedModel.id) {
          return {
            ...model,
            files: model.files.map(f =>
              f.path === selectedFile.path ? { ...f, content: fileContent } : f
            ),
          };
        }
        return model;
      });
      saveModels(updated);
      setIsEditing(false);
      alert("File saved successfully!");
    }
  };

  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const renderFileTree = (files, basePath = "") => {
    const structure = {};
    
    files.forEach(file => {
      const parts = file.path.split("/");
      let current = structure;
      
      parts.forEach((part, idx) => {
        if (!current[part]) {
          current[part] = idx === parts.length - 1 ? file : {};
        }
        current = current[part];
      });
    });

    const renderNode = (node, name, path) => {
      const fullPath = path ? `${path}/${name}` : name;
      
      if (node.content !== undefined) {
        // It's a file
        return (
          <div
            key={fullPath}
            onClick={() => handleFileClick(node)}
            className={`flex items-center gap-2 py-2 px-4 cursor-pointer hover:bg-gray-100 ${
              selectedFile?.path === node.path ? "bg-gray-200" : ""
            }`}
          >
            <FiFile className="text-slate-500" />
            <span className="text-sm text-slate-700">{name}</span>
          </div>
        );
      } else {
        // It's a folder
        const isExpanded = expandedFolders[fullPath];
        return (
          <div key={fullPath}>
            <div
              onClick={() => toggleFolder(fullPath)}
              className="flex items-center gap-2 py-2 px-4 cursor-pointer hover:bg-slate-100"
            >
              {isExpanded ? (
                <FiChevronDown className="text-slate-500" />
              ) : (
                <FiChevronRight className="text-slate-500" />
              )}
              <FiFolder className="text-gray-500" />
              <span className="text-sm font-medium text-slate-700">{name}</span>
            </div>
            {isExpanded && (
              <div className="ml-4">
                {Object.keys(node).map(key => renderNode(node[key], key, fullPath))}
              </div>
            )}
          </div>
        );
      }
    };

    return (
      <div>
        {Object.keys(structure).map(key => renderNode(structure[key], key, basePath))}
      </div>
    );
  };

  const getFileLanguage = (filename) => {
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return 'yaml';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.csv')) return 'csv';
    if (filename.endsWith('.md')) return 'markdown';
    return 'text';
  };

  return (
    <div className="flex-1 p-8 bg-gray-100 overflow-hidden">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">
              Calliope Models
            </h1>
            <p className="text-slate-600">
              Manage and edit your exported Calliope model files
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-200px)]">
        {/* Models List */}
        <div className="col-span-3 bg-white rounded-lg shadow-lg overflow-auto">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">Exported Models</h2>
            <p className="text-xs text-slate-500 mt-1">{exportedModels.length} models</p>
          </div>
          
          <div className="divide-y divide-slate-100">
            {exportedModels.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No exported models yet. Export a model to get started.
              </div>
            ) : (
              exportedModels.map(model => (
                <div
                  key={model.id}
                  onClick={() => setSelectedModel(model)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                    selectedModel?.id === model.id ? "bg-gray-200 border-l-4 border-gray-900" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FiFolder className="text-gray-500" />
                        <h3 className="font-semibold text-slate-800 text-sm">
                          {model.name}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(model.timestamp).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {model.files.length} files
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteModel(model.id);
                      }}
                      className="text-gray-700 hover:text-gray-900 p-1"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* File Tree */}
        <div className="col-span-3 bg-white rounded-lg shadow-lg overflow-auto">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-800">File Structure</h2>
            {selectedModel && (
              <p className="text-xs text-slate-500 mt-1">{selectedModel.name}</p>
            )}
          </div>
          
          {selectedModel ? (
            <div className="py-2">
              {renderFileTree(selectedModel.files)}
            </div>
          ) : (
            <div className="p-4 text-center text-slate-500 text-sm">
              Select a model to view its files
            </div>
          )}
        </div>

        {/* File Editor */}
        <div className="col-span-6 bg-white rounded-lg shadow-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">
                {selectedFile ? selectedFile.path : "File Editor"}
              </h2>
              {selectedFile && (
                <p className="text-xs text-slate-500 mt-1">
                  {getFileLanguage(selectedFile.path)}
                </p>
              )}
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveFile}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm"
                    >
                      <FiSave />
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setFileContent(selectedFile.content);
                      }}
                      className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors text-sm"
                    >
                      <FiX />
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm"
                  >
                    <FiEdit2 />
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-auto">
            {selectedFile ? (
              isEditing ? (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-full p-4 font-mono text-sm text-slate-700 focus:outline-none resize-none"
                  spellCheck={false}
                />
              ) : (
                <pre className="p-4 text-sm text-slate-700 overflow-auto h-full">
                  <code>{fileContent}</code>
                </pre>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <FiFile size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Select a file to view or edit</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalliopeModels;
