import React, { useState } from 'react';
import Papa from 'papaparse';
import { FiUpload, FiX, FiFile, FiCheck, FiDownload } from 'react-icons/fi';
import { useData } from '../context/DataContext';
import { fetchTemplate } from '../utils/templateFetch';

const CSVUploader = () => {
  const { createModel } = useData();
  const [uploadedFiles, setUploadedFiles] = useState({
    locations: null,
    links: null,
    parameters: null,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const downloadTemplate = async (type) => {
    const filename = `${type}_template.csv`;
    const response = await fetchTemplate(filename);
    if (!response.ok) { alert(`Template file not found: ${filename}`); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadExampleData = async () => {
    setLoading(true);
    try {
      const locationsResponse = await fetchTemplate('locations_template.csv');
      const linksResponse = await fetchTemplate('links_template.csv');
      const parametersResponse = await fetchTemplate('parameters_template.csv');

      const locationsText = await locationsResponse.text();
      const linksText = await linksResponse.text();
      const parametersText = await parametersResponse.text();

      const locationsData = Papa.parse(locationsText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
      const linksData = Papa.parse(linksText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
      const parametersData = Papa.parse(parametersText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;

      createModel('Example German Energy System', locationsData, linksData, parametersData);
      setIsOpen(false);
    } catch (error) {
      console.error('Error loading example data:', error);
      alert('Error loading example data.');
    } finally {
      setLoading(false);
    }
  };

  const parseCSV = (file) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    });
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadedFiles((prev) => ({ ...prev, [type]: file }));
  };

  const processData = async () => {
    setLoading(true);
    try {
      let locationsData = [];
      let linksData = [];
      let parametersData = [];

      if (uploadedFiles.locations) {
        locationsData = await parseCSV(uploadedFiles.locations);
      }

      if (uploadedFiles.links) {
        linksData = await parseCSV(uploadedFiles.links);
      }

      if (uploadedFiles.parameters) {
        parametersData = await parseCSV(uploadedFiles.parameters);
      }

      const modelName = prompt('Enter a name for this model:', 'New Calliope Model');
      if (modelName) {
        createModel(modelName, locationsData, linksData, parametersData);
      }
      setIsOpen(false);
      setUploadedFiles({ locations: null, links: null, parameters: null });
    } catch (error) {
      console.error('Error processing CSV files:', error);
      alert('Error processing files. Please check the CSV format.');
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (type) => {
    setUploadedFiles((prev) => ({ ...prev, [type]: null }));
  };

  const FileUploadField = ({ type, label, file }) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-700">
          {label}
        </label>
        <button
          onClick={() => downloadTemplate(type)}
          className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
        >
          <FiDownload size={14} />
          Download Template
        </button>
      </div>
      {!file ? (
        <label className="flex items-center justify-center w-full h-24 px-4 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <div className="text-center">
            <FiUpload className="mx-auto text-2xl text-slate-400 mb-1" />
            <span className="text-sm text-slate-500">Click to upload CSV</span>
          </div>
          <input
            type="file"
            className="hidden"
            accept=".csv"
            onChange={(e) => handleFileUpload(e, type)}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2">
            <FiCheck className="text-gray-600" />
            <FiFile className="text-gray-600" />
            <span className="text-sm text-gray-800 font-medium">{file.name}</span>
          </div>
          <button
            onClick={() => removeFile(type)}
            className="text-gray-600 hover:text-gray-800"
          >
            <FiX />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm"
      >
        Load Model
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800">
                  Upload Calliope Model Data
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <FiX size={24} />
                </button>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                Upload CSV files containing your Calliope model data or load example data
              </p>
              <button
                onClick={loadExampleData}
                disabled={loading}
                className="mt-3 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm disabled:bg-slate-300"
              >
                {loading ? 'Loading...' : 'Load Example Data'}
              </button>
            </div>

            <div className="p-6">
              <FileUploadField
                type="locations"
                label="Locations CSV (Required)"
                file={uploadedFiles.locations}
              />
              <FileUploadField
                type="links"
                label="Links CSV (Optional)"
                file={uploadedFiles.links}
              />
              <FileUploadField
                type="parameters"
                label="Parameters CSV (Optional)"
                file={uploadedFiles.parameters}
              />

              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Expected CSV Format:
                </h3>
                <ul className="text-xs text-gray-800 space-y-1">
                  <li>• <strong>Locations:</strong> name, latitude, longitude, type</li>
                  <li>• <strong>Links:</strong> from, to, capacity, distance</li>
                  <li>• <strong>Parameters:</strong> name, value, unit</li>
                </ul>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={processData}
                disabled={!uploadedFiles.locations || loading}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Load Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CSVUploader;
