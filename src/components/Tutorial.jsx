import React, { useState } from 'react';
import { 
  FiDownload, 
  FiMapPin,
  FiLink,
  FiZap,
  FiDatabase,
  FiPlay,
  FiEdit,
  FiUpload,
  FiFileText,
  FiCheckCircle,
  FiArrowRight,
  FiLayers
} from 'react-icons/fi';
import { ENTITY_TYPES } from '../config/domainModel';
import { generateCSVDownload, generateJSONDownload } from '../config/dataTemplates';
import { ModelStructureTutorial } from './ModelStructureTutorial';

const Tutorial = () => {
  const [activeTab, setActiveTab] = useState('start');
  const [selectedMethod, setSelectedMethod] = useState(null);

  const tabs = [
    { id: 'start', label: 'Get Started', icon: FiPlay },
    { id: 'methods', label: 'How to Build', icon: FiEdit },
    { id: 'structure', label: 'Model Structure', icon: FiLayers },
    { id: 'templates', label: 'Templates', icon: FiDownload },
    { id: 'entities', label: 'Types', icon: FiMapPin }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'structure':
        return <ModelStructureTutorial />;
      
      case 'start':
        return (
          <div className="space-y-10">
            {/* Hero */}
            <div className="text-center pb-8 pt-4">
              <h1 className="text-5xl font-bold text-slate-900 mb-4">
                Welcome to Calliope Visualizer
              </h1>
              <p className="text-2xl text-slate-600 mb-6">Build energy system models your way</p>
              <div className="flex items-center justify-center gap-3 text-sm font-medium text-slate-500">
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="text-gray-500" />
                  <span>No Coding</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="text-gray-500" />
                  <span>Visual Interface</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="text-gray-500" />
                  <span>Flexible Workflow</span>
                </div>
              </div>
            </div>

            {/* Two Main Methods */}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Choose Your Method</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Manual Creation */}
                <div className="group bg-gradient-to-br from-gray-50 to-gray-100 border-3 border-gray-300 rounded-3xl p-8 hover:shadow-2xl transition-all cursor-pointer hover:scale-105">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-16 h-16 bg-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
                      <FiEdit className="text-white text-3xl" />
                    </div>
                    <div className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-bold">
                      INTERACTIVE
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-3">Manual Creation</h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">
                    Build your model step-by-step using our visual interface. Perfect for learning and small projects.
                  </p>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Click and configure locations on map</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Draw transmission lines visually</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Add technologies with guided forms</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">See changes in real-time</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('methods')}
                    className="w-full bg-gray-700 text-white px-6 py-4 rounded-xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    Learn How <FiArrowRight />
                  </button>
                </div>

                {/* Bulk Import */}
                <div className="group bg-gray-100 border-3 border-gray-300 rounded-3xl p-8 hover:shadow-2xl transition-all cursor-pointer hover:scale-105">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-16 h-16 bg-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
                      <FiUpload className="text-white text-3xl" />
                    </div>
                    <div className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-bold">
                      FAST & SCALABLE
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-3">Bulk Import</h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">
                    Upload CSV/JSON files with your data. Ideal for large systems and existing datasets.
                  </p>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Import hundreds of locations at once</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Use spreadsheet tools you know</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Automatic validation and error checking</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <FiCheckCircle className="text-gray-600 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">Templates with examples included</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('templates')}
                    className="w-full bg-gray-700 text-white px-6 py-4 rounded-xl font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    Get Templates <FiArrowRight />
                  </button>
                </div>
              </div>

              {/* Best of Both Worlds */}
              <div className="bg-gray-700 text-white rounded-2xl p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <FiZap className="text-2xl" />
                  <h3 className="text-xl font-bold">Pro Tip</h3>
                </div>
                <p className="text-gray-50 text-lg">
                  You can combine both methods! Import bulk data, then refine it manually in the visual editor.
                </p>
              </div>
            </div>

            {/* Core Components */}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">Core Components</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-gray-400 transition-all hover:shadow-lg">
                  <FiMapPin className="text-gray-600 text-4xl mb-3" />
                  <h3 className="font-bold text-slate-800 text-lg mb-2">Locations</h3>
                  <p className="text-slate-600 text-sm">Energy sites</p>
                </div>

                <div className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-gray-400 transition-all hover:shadow-lg">
                  <FiLink className="text-gray-600 text-4xl mb-3" />
                  <h3 className="font-bold text-slate-800 text-lg mb-2">Transmission</h3>
                  <p className="text-slate-600 text-sm">Connections</p>
                </div>

                <div className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-gray-400 transition-all hover:shadow-lg">
                  <FiZap className="text-gray-600 text-4xl mb-3" />
                  <h3 className="font-bold text-slate-800 text-lg mb-2">Technologies</h3>
                  <p className="text-slate-600 text-sm">Solar, wind, etc.</p>
                </div>

                <div className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-gray-400 transition-all hover:shadow-lg">
                  <FiDatabase className="text-gray-600 text-4xl mb-3" />
                  <h3 className="font-bold text-slate-800 text-lg mb-2">Time Series</h3>
                  <p className="text-slate-600 text-sm">Data profiles</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'methods':
        return (
          <div className="space-y-8">
            <div className="text-center pb-6">
              <h2 className="text-4xl font-bold text-slate-800 mb-3">Building Methods Explained</h2>
              <p className="text-lg text-slate-600">Detailed workflows for both approaches</p>
            </div>

            {/* Method Selector */}
            <div className="flex justify-center gap-4 mb-8">
              <button
                onClick={() => setSelectedMethod('manual')}
                className={`px-8 py-4 rounded-xl font-bold transition-all flex items-center gap-3 ${
                  selectedMethod === 'manual'
                    ? 'bg-gray-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FiEdit size={24} />
                <span>Manual Creation</span>
              </button>
              <button
                onClick={() => setSelectedMethod('bulk')}
                className={`px-8 py-4 rounded-xl font-bold transition-all flex items-center gap-3 ${
                  selectedMethod === 'bulk'
                    ? 'bg-gray-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FiUpload size={24} />
                <span>Bulk Import</span>
              </button>
            </div>

            {/* Manual Creation Steps */}
            {(selectedMethod === 'manual' || !selectedMethod) && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl p-8 border-2 border-gray-200">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-gray-600 rounded-2xl flex items-center justify-center">
                    <FiEdit className="text-white text-3xl" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-slate-800">Manual Creation Workflow</h3>
                    <p className="text-slate-600">Step-by-step visual building</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Step 1 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        1
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Go to Creation Section</h4>
                        <p className="text-slate-600 mb-3">Click "Creation" in the sidebar to open the visual map editor.</p>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-slate-700 border border-gray-200">
                          💡 <span className="font-semibold">Tip:</span> The map shows your geographical area where you'll place components.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        2
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Add Locations</h4>
                        <p className="text-slate-600 mb-3">Click on the map to place locations (power plants, substations, demand centers).</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Drag & Drop</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Click to Place</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Edit Properties</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        3
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Add Technologies</h4>
                        <p className="text-slate-600 mb-3">Click on a location to add technologies like solar, wind, batteries, or demand.</p>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-slate-700 border border-gray-200">
                          💡 <span className="font-semibold">Tip:</span> Each location type supports specific technologies (check the Types tab).
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        4
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Connect with Transmission</h4>
                        <p className="text-slate-600 mb-3">Draw lines between locations to create power transmission connections.</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">AC Lines</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">DC Lines</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Pipelines</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        5
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Configure Parameters</h4>
                        <p className="text-slate-600 mb-3">Set capacities, costs, efficiencies, and constraints for each component.</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 6 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md border-2 border-gray-300">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-500 text-white rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        ✓
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Save Your Model</h4>
                        <p className="text-slate-600">Your model is automatically saved and ready to run or export!</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk Import Steps */}
            {(selectedMethod === 'bulk' || !selectedMethod) && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl p-8 border-2 border-gray-200 mt-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-gray-600 rounded-2xl flex items-center justify-center">
                    <FiUpload className="text-white text-3xl" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-slate-800">Bulk Import Workflow</h3>
                    <p className="text-slate-600">Fast data-driven approach</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Step 1 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        1
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Download Templates</h4>
                        <p className="text-slate-600 mb-3">Get CSV templates with examples and structure definitions.</p>
                        <button
                          onClick={() => setActiveTab('templates')}
                          className="bg-gray-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-gray-700 transition-colors flex items-center gap-2"
                        >
                          <FiDownload /> Go to Templates
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        2
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Fill Your Data</h4>
                        <p className="text-slate-600 mb-3">Open templates in Excel/Sheets and populate with your system data.</p>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-slate-700 border border-gray-200">
                          💡 <span className="font-semibold">Tip:</span> Keep the header row unchanged and follow the example format exactly.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        3
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Upload Files</h4>
                        <p className="text-slate-600 mb-3">Use the bulk import feature to upload your CSV files.</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Locations.csv</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Transmission.csv</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Tech_Params.csv</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Costs.csv</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        4
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Validation & Preview</h4>
                        <p className="text-slate-600 mb-3">System checks your data and shows any errors or warnings.</p>
                        <div className="bg-gray-50 rounded-lg p-3 text-sm text-slate-700 border border-gray-200">
                          ✓ Automatic coordinate validation<br/>
                          ✓ Technology compatibility checks<br/>
                          ✓ Reference validation (links between files)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="bg-white rounded-2xl p-6 shadow-md border-2 border-gray-300">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gray-500 text-white rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
                        ✓
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-slate-800 mb-2">Create Model</h4>
                        <p className="text-slate-600">Click "Create Model" to generate your complete energy system!</p>
                      </div>
                    </div>
                  </div>

                  {/* After Import */}
                  <div className="bg-gray-700 text-white rounded-xl p-6">
                    <h4 className="text-xl font-bold mb-2">What happens next?</h4>
                    <p className="text-gray-100 mb-3">
                      Your imported model appears in the visual editor where you can:
                    </p>
                    <ul className="space-y-2 text-gray-50">
                      <li>• View all locations on the map</li>
                      <li>• Edit properties and parameters</li>
                      <li>• Add or remove components</li>
                      <li>• Run optimizations and analyze results</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'templates':
        return (
          <div className="space-y-6">
            <div className="text-center pb-4">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Download Templates</h2>
              <p className="text-lg text-slate-600">CSV files with examples included</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Locations */}
              <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 hover:shadow-lg transition-all hover:scale-105">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <FiMapPin className="text-gray-600 text-2xl" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">Locations</h3>
                <p className="text-slate-600 mb-5 text-sm">
                  Plants, substations, demand sites
                </p>
                <button
                  onClick={() => generateCSVDownload('LOCATIONS')}
                  className="w-full bg-gray-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiDownload /> Download
                </button>
              </div>

              {/* Transmission */}
              <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 hover:shadow-lg transition-all hover:scale-105">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <FiLink className="text-gray-600 text-2xl" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">Transmission</h3>
                <p className="text-slate-600 mb-5 text-sm">
                  Power lines & connections
                </p>
                <button
                  onClick={() => generateCSVDownload('TRANSMISSION_LINES')}
                  className="w-full bg-gray-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiDownload /> Download
                </button>
              </div>

              {/* Technologies */}
              <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 hover:shadow-lg transition-all hover:scale-105">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <FiZap className="text-gray-600 text-2xl" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">Tech Params</h3>
                <p className="text-slate-600 mb-5 text-sm">
                  Capacity & efficiency data
                </p>
                <button
                  onClick={() => generateCSVDownload('TECHNOLOGY_PARAMETERS')}
                  className="w-full bg-gray-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiDownload /> Download
                </button>
              </div>

              {/* Costs */}
              <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 hover:shadow-lg transition-all hover:scale-105">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <FiDatabase className="text-gray-600 text-2xl" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">Costs</h3>
                <p className="text-slate-600 mb-5 text-sm">
                  Investment & operation costs
                </p>
                <button
                  onClick={() => generateCSVDownload('COST_PARAMETERS')}
                  className="w-full bg-gray-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiDownload /> Download
                </button>
              </div>

              {/* Demand Time Series */}
              <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 hover:shadow-lg transition-all hover:scale-105">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <FiDatabase className="text-gray-600 text-2xl" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">Demand</h3>
                <p className="text-slate-600 mb-5 text-sm">
                  Hourly consumption profiles
                </p>
                <button
                  onClick={() => generateCSVDownload('TIMESERIES_DEMAND')}
                  className="w-full bg-gray-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiDownload /> Download
                </button>
              </div>

              {/* Solar Time Series */}
              <div className="bg-white border-2 border-gray-300 rounded-2xl p-6 hover:shadow-lg transition-all hover:scale-105">
                <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                  <FiDatabase className="text-gray-600 text-2xl" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-2">Solar</h3>
                <p className="text-slate-600 mb-5 text-sm">
                  PV capacity factors
                </p>
                <button
                  onClick={() => generateCSVDownload('TIMESERIES_SOLAR')}
                  className="w-full bg-gray-600 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FiDownload /> Download
                </button>
              </div>
            </div>

            {/* JSON Template */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-2xl mb-2">Complete JSON Template</h3>
                  <p className="text-gray-100">Full model structure ready to use</p>
                </div>
                <button
                  onClick={generateJSONDownload}
                  className="bg-white text-gray-600 px-8 py-4 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center gap-2 text-lg"
                >
                  <FiDownload /> Download
                </button>
              </div>
            </div>
          </div>
        );

      case 'entities':
        return (
          <div className="space-y-6">
            <div className="text-center pb-4">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Entity Types</h2>
              <p className="text-lg text-slate-600">Different location types for your model</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Object.values(ENTITY_TYPES).map((entity) => (
                <div
                  key={entity.id}
                  className="bg-white border-2 rounded-2xl p-6 hover:shadow-lg transition-all"
                  style={{ borderColor: entity.color }}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${entity.color}20` }}
                    >
                      <entity.icon style={{ color: entity.color }} size={28} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800 text-xl mb-1">{entity.name}</h3>
                      <p className="text-slate-600 text-sm">{entity.description}</p>
                    </div>
                  </div>

                  {entity.allowedTechTypes && entity.allowedTechTypes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 mb-2">TECHNOLOGIES:</p>
                      <div className="flex flex-wrap gap-2">
                        {entity.allowedTechTypes.map((tech) => (
                          <span
                            key={tech}
                            className="px-3 py-1 rounded-lg text-xs font-medium"
                            style={{
                              backgroundColor: `${entity.color}15`,
                              color: entity.color
                            }}
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 mb-2">REQUIRED FIELDS:</p>
                    <div className="flex flex-wrap gap-2">
                      {entity.requiredFields.map((field) => (
                        <span
                          key={field}
                          className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-gray-600 text-gray-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
