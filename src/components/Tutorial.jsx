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
  FiLayers,
  FiGlobe,
  FiTerminal,
  FiEye,
  FiServer,
  FiSliders,
  FiPackage,
  FiBarChart2,
  FiSearch,
  FiTrash2,
} from 'react-icons/fi';
import { ENTITY_TYPES } from '../config/domainModel';
import { generateCSVDownload, generateJSONDownload } from '../config/dataTemplates';
import { ModelStructureTutorial } from './ModelStructureTutorial';


// Screenshot caption component with a number badge
const Step = ({ n, title, children }) => (
  <div className="bg-white rounded-xl p-5 border border-slate-200">
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 bg-slate-800 text-white rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">
        {n}
      </div>
      <div className="flex-1">
        <h4 className="text-base font-bold text-slate-800 mb-2">{title}</h4>
        {children}
      </div>
    </div>
  </div>
);

// Inline tip box
const Tip = ({ children }) => (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 mt-3">
    <span className="font-semibold">Tip: </span>{children}
  </div>
);

// Inline code / CSV preview
const CodeBlock = ({ children }) => (
  <pre className="bg-slate-900 text-slate-300 rounded-lg p-4 text-xs overflow-x-auto mt-3 font-mono leading-relaxed">
    {children}
  </pre>
);

// Screenshot with caption
const Screenshot = ({ src, alt, caption }) => (
  <figure className="my-4 rounded-xl overflow-hidden border border-slate-200 shadow-md">
    <img src={src} alt={alt} className="w-full object-cover" />
    {caption && (
      <figcaption className="bg-slate-50 px-4 py-2 text-xs text-slate-500 border-t border-slate-200">
        {caption}
      </figcaption>
    )}
  </figure>
);

const Tutorial = () => {
  const [activeTab, setActiveTab] = useState('start');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [expandedCSV, setExpandedCSV] = useState(null);

  const tabs = [
    { id: 'start', label: 'Get Started', icon: FiPlay },
    { id: 'methods', label: 'How to Build', icon: FiEdit },
    { id: 'gis', label: 'GIS Data', icon: FiGlobe },
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
            <div className="text-center pb-4 pt-2">
              <h1 className="text-4xl font-bold text-slate-900 mb-3">Welcome to TEMPO</h1>
              <p className="text-xl text-slate-600 mb-4">Tool for Energy Model Planning and Optimization</p>
              <div className="flex items-center justify-center gap-4 text-sm font-medium text-slate-500 flex-wrap">
                {['Multi-engine', 'Visual Interface', 'Real GIS Data', 'Multi-format'].map(l => (
                  <div key={l} className="flex items-center gap-1.5">
                    <FiCheckCircle className="text-gray-500" />
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dashboard screenshot with callouts */}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-4">The Interface at a Glance</h2>
              <Screenshot
                src="./img/Dashboard.png"
                alt="TEMPO Model Dashboard"
                caption="Model Dashboard — a real model for Germany with 12 locations, 12 links, 6 generation technologies, 36.5 GW capacity, 20.9 M€ CAPEX."
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { label: 'Locations', desc: '12 nodes — cities, substations, plants' },
                  { label: 'Links', desc: '12 transmission lines between nodes' },
                  { label: 'Gen Technologies', desc: '6 supply types (solar, wind, gas…)' },
                  { label: 'Max Capacity', desc: '36.5 GW total across all locations' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="font-bold text-slate-800 text-sm mb-1">{kpi.label}</div>
                    <div className="text-xs text-slate-500">{kpi.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Express 4-step tour */}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Build Your First Model in 4 Steps</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  {
                    n: 1, icon: FiGlobe, title: 'Select a Region',
                    desc: 'Open Creation. In the right sidebar choose a continent → country → region. The map zooms to your area and loads real power infrastructure.',
                    badge: 'Right sidebar → SELECT REGION'
                  },
                  {
                    n: 2, icon: FiMapPin, title: 'Place Locations',
                    desc: 'Choose "Single" or "Multiple" mode in the left panel, then click the map to add nodes — city demand centers, substations, power plants.',
                    badge: 'Left panel → Mode → click map'
                  },
                  {
                    n: 3, icon: FiZap, title: 'Assign Technologies',
                    desc: 'Click a location marker to open the configuration dialog. Pick from 60+ technology templates: Solar PV, Wind, Gas CCGT, Battery Storage, Demand…',
                    badge: 'Click marker → "Configure Location"'
                  },
                  {
                    n: 4, icon: FiLink, title: 'Connect the Network',
                    desc: 'Switch mode to "Link", then click two locations to create a transmission line. Set voltage (kV) and capacity (MW) in the dialog.',
                    badge: 'Left panel → Link mode'
                  },
                ].map(({ n, icon: Icon, title, desc, badge }) => (
                  <div key={n} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 bg-slate-800 text-white rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">{n}</div>
                      <Icon className="text-slate-500" size={20} />
                      <h3 className="font-bold text-slate-800">{title}</h3>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed mb-3">{desc}</p>
                    <div className="bg-slate-100 text-slate-600 rounded-lg px-3 py-1.5 text-xs font-mono">{badge}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Left sidebar navigation guide */}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Where to Find Everything</h2>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {[
                  { label: 'Dashboard',                      desc: 'Model KPIs, location map, capacity overview and cost summary',                                        group: null },
                  { label: 'Creation',                       desc: 'Visual map editor — place locations, draw links, load OSM infrastructure layers',                      group: null },
                  { label: 'Structure → Models',             desc: 'Import, search and filter models. Multi-select for bulk delete or JSON export.',                       group: 'Structure' },
                  { label: 'Structure → Map View',           desc: 'Interactive map of active model locations and transmission links',                                     group: 'Structure' },
                  { label: 'Structure → Locations',          desc: 'Table view of all nodes with coordinates and assigned technologies',                                   group: 'Structure' },
                  { label: 'Structure → Links',              desc: 'Transmission line table — from/to, capacity, voltage, type',                                           group: 'Structure' },
                  { label: 'Structure → TimeSeries',         desc: 'Upload and manage CSV demand & resource capacity-factor profiles',                                     group: 'Structure' },
                  { label: 'Structure → Overrides / Scenarios', desc: 'Define named parameter overrides and scenario combinations for sensitivity runs',                   group: 'Structure' },
                  { label: 'Export',                         desc: 'Download the active model as Calliope 0.6/0.7, PyPSA, OSeMOSYS, or AdOpT-NET0 archive',              group: null },
                  { label: 'Run',                            desc: 'Launch optimisation. Search, filter and bulk-manage completed runs by name or status.',                group: null },
                  { label: 'Results',                        desc: 'Dispatch, costs, capacity maps, shadow prices — plus AI Analysis tab for LLM-powered insights',       group: null },
                  { label: 'Settings',                       desc: 'Engine install panels, AI assistant API key, backend connection, solver paths',                        group: null },
                ].map((item, i, arr) => {
                  const isStructureFirst = item.group === 'Structure' && (!arr[i - 1] || arr[i - 1].group !== 'Structure');
                  return (
                    <div
                      key={item.label}
                      className={`flex items-baseline gap-0 border-b border-slate-100 last:border-0 ${
                        item.group === 'Structure' ? 'bg-slate-50' : 'bg-white'
                      } ${isStructureFirst ? 'mt-0' : ''}`}
                    >
                      {item.group === 'Structure' && (
                        <div className="w-1 self-stretch bg-slate-300 flex-shrink-0" />
                      )}
                      <div className="flex items-baseline gap-4 px-5 py-3 flex-1 min-w-0">
                        <span className="font-mono text-xs font-semibold text-slate-800 whitespace-nowrap flex-shrink-0 w-52">{item.label}</span>
                        <span className="text-xs text-slate-500 leading-snug">{item.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Model & run management features */}
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Managing Models &amp; Runs</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FiSearch size={18} className="text-slate-500" />
                    <h3 className="font-bold text-slate-800">Models (Structure → Models)</h3>
                  </div>
                  <ul className="text-sm text-slate-600 space-y-1.5">
                    <li className="flex gap-2"><FiCheckCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" /><span>Search models by name; filter by engine type (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0)</span></li>
                    <li className="flex gap-2"><FiCheckCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" /><span>Tick the "Select all" checkbox or pick individual models</span></li>
                    <li className="flex gap-2"><FiTrash2 size={14} className="text-gray-500 mt-0.5 flex-shrink-0" /><span>Bulk delete or export selected models as JSON backup files</span></li>
                  </ul>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FiBarChart2 size={18} className="text-slate-500" />
                    <h3 className="font-bold text-slate-800">Completed Runs (Run tab)</h3>
                  </div>
                  <ul className="text-sm text-slate-600 space-y-1.5">
                    <li className="flex gap-2"><FiCheckCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" /><span>Search runs by model name; filter by status (Done / Failed)</span></li>
                    <li className="flex gap-2"><FiCheckCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" /><span>Tick the "Select all" checkbox or pick individual runs</span></li>
                    <li className="flex gap-2"><FiTrash2 size={14} className="text-gray-500 mt-0.5 flex-shrink-0" /><span>Bulk download as JSON or bulk delete selected runs</span></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* three method cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer" onClick={() => { setActiveTab('methods'); setSelectedMethod('manual'); }}>
                <h3 className="font-bold text-slate-800 mb-1">Manual Creation</h3>
                <p className="text-slate-500 text-sm mb-3">Click-and-build on the map. Great for learning and small models.</p>
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                  <span>Step-by-step guide</span><FiArrowRight size={12} />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer" onClick={() => { setActiveTab('methods'); setSelectedMethod('import'); }}>
                <h3 className="font-bold text-slate-800 mb-1">Import a Model</h3>
                <p className="text-slate-500 text-sm mb-3">YAML archive, CSV wizard, or framework archive — TEMPO auto-detects the format.</p>
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                  <span>Import guide</span><FiArrowRight size={12} />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors cursor-pointer" onClick={() => setActiveTab('templates')}>
                <h3 className="font-bold text-slate-800 mb-1">Download Templates</h3>
                <p className="text-slate-500 text-sm mb-3">CSV/JSON starter files with real example data — ready to populate and import.</p>
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                  <span>Browse templates</span><FiArrowRight size={12} />
                </div>
              </div>
            </div>
          </div>
        );

      case 'methods':
        return (
          <div className="space-y-8">
            <div className="text-center pb-2">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Step-by-Step: Building a Model</h2>
              <p className="text-slate-600">This example models a simplified Bavarian energy system.</p>
            </div>

            {/* Method Selector */}
            <div className="flex justify-center gap-3 flex-wrap">
              <button
                onClick={() => setSelectedMethod('manual')}
                className={`px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                  selectedMethod === 'manual' ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FiEdit size={18} /> Manual Creation
              </button>
              <button
                onClick={() => setSelectedMethod('import')}
                className={`px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                  selectedMethod === 'import' ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FiPackage size={18} /> YAML / Archive Import
              </button>
              <button
                onClick={() => setSelectedMethod('bulk')}
                className={`px-5 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                  selectedMethod === 'bulk' ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FiUpload size={18} /> CSV Wizard
              </button>
            </div>

            {/* Manual Creation Steps */}
            {(selectedMethod === 'manual' || !selectedMethod) && (
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Manual Creation — Germany Example</h3>
                  <p className="text-sm text-slate-500">12 locations · 12 links · solar + wind + gas + nuclear + hydro + coal + biomass + battery + demand system</p>
                </div>

                <div className="space-y-5">
                  <Step n={1} title="Open Creation Mode & Pick a Region">
                    <p className="text-slate-600 text-sm">Click <strong>Creation</strong> in the left sidebar. The map appears with an empty canvas.</p>
                    <Screenshot src="./img/Model.png" alt="Creation mode with region selector" caption="Creation Mode — left panel shows mode selector; right sidebar shows the Region Selection stepper (Continent → Country → Region → Subregion) and Infrastructure Layers toggles." />
                  </Step>

                  <Step n={2} title="Add Locations — 4 Nodes">
                    <p className="text-slate-600 text-sm mb-2">
                      In the left panel, select <strong>Multiple</strong> mode. Click four spots on the map:
                    </p>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Name</th>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Approx. coords</th>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Role</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {[
                            ['Berlin', '52.5200, 13.4050', 'Solar, Wind, Battery, Gas'],
                            ['Munich', '48.1351, 11.5820', 'Solar, Wind, Battery, Gas'],
                            ['Hamburg', '53.5511, 9.9937', 'Solar, Wind, Battery, Gas'],
                            ['Frankfurt', '50.1109, 8.6821', 'Solar, Battery, Gas'],
                            ['Cologne', '50.9375, 6.9603', 'Solar, Wind, Gas'],
                            ['Stuttgart', '48.7758, 9.1829', 'Solar, Battery, Biomass'],
                            ['Dresden', '51.0504, 13.7373', 'Solar, Wind, Coal'],
                            ['Hannover', '52.3759, 9.7320', 'Solar, Wind, Gas'],
                            ['Leipzig', '51.3397, 12.3731', 'Solar, Wind, Battery'],
                            ['Nuremberg', '49.4521, 11.0767', 'Solar, Biomass, Gas'],
                            ['Node_North', '53.0000, 10.0000', 'Transmission'],
                            ['Node_South', '49.0000, 11.5000', 'Transmission'],
                          ].map(([n, c, r]) => (
                            <tr key={n} className="hover:bg-slate-50">
                              <td className="border border-slate-200 px-3 py-1.5 text-slate-800 font-semibold">{n}</td>
                              <td className="border border-slate-200 px-3 py-1.5 text-slate-500">{c}</td>
                              <td className="border border-slate-200 px-3 py-1.5 text-slate-600">{r}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Step>

                  <Step n={3} title="Configure Each Location — Add Technologies">
                    <p className="text-slate-600 text-sm mb-2">
                      Click a location marker to open <strong>Configure Location</strong>. The dialog shows category-grouped technology templates. Example for <code className="bg-slate-100 px-1 rounded">Solar_Augsburg</code>:
                    </p>
                    <Screenshot src="./img/New.png" alt="Configure Multiple Location dialog" caption="Configure Location dialog — technology browser shows 'VARIABLE RENEWABLES (11)' grouped with 20 Solar PV variants, each showing efficiency (η), lifetime, and CAPEX." />
                    <p className="text-slate-600 text-sm mt-3 mb-2">Select <strong>Solar PV Utility — 100 MW Single-Axis Tracking (Current, 2024)</strong> and click <strong>+ Add</strong>. Key specs shown inline:</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[['η 22%', 'Panel efficiency'], ['30 yr', 'Economic lifetime'], ['CAPEX 1050', '€/kW installed']].map(([v, l]) => (
                        <div key={v} className="bg-slate-100 rounded-lg p-2 text-center">
                          <div className="font-bold text-slate-800">{v}</div>
                          <div className="text-slate-500">{l}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-500 text-xs mt-3">Repeat for each location. Assign <strong>power_demand</strong> to Munich_Demand, <strong>Wind Onshore</strong> to Wind_Frankfurt, and <strong>Gas CCGT</strong> to Dresden as a backup plant.</p>
                  </Step>

                  <Step n={4} title="Connect with Transmission Links">
                    <p className="text-slate-600 text-sm mb-2">Switch to <strong>Link</strong> mode in the top-left panel. Click a source location, then a destination:</p>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="border border-slate-200 px-3 py-2 text-left">From</th>
                            <th className="border border-slate-200 px-3 py-2 text-left">To</th>
                            <th className="border border-slate-200 px-3 py-2 text-left">Type</th>
                            <th className="border border-slate-200 px-3 py-2 text-left">Capacity</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {[
                            ['Berlin', 'Leipzig', 'AC Transmission', '149 MW'],
                            ['Berlin', 'Dresden', 'AC Transmission', '165 MW'],
                            ['Berlin', 'Hannover', 'AC Transmission', '250 MW'],
                            ['Berlin', 'Node_North', 'AC Transmission', '280 MW'],
                            ['Munich', 'Stuttgart', 'AC Transmission', '190 MW'],
                            ['Munich', 'Nuremberg', 'AC Transmission', '150 MW'],
                            ['Munich', 'Node_South', 'AC Transmission', '120 MW'],
                            ['Hamburg', 'Hannover', 'AC Transmission', '132 MW'],
                            ['Hamburg', 'Node_North', 'AC Transmission', '150 MW'],
                            ['Frankfurt', 'Cologne', 'AC Transmission', '152 MW'],
                            ['Frankfurt', 'Stuttgart', 'AC Transmission', '152 MW'],
                            ['Node_North', 'Node_South', 'HVDC Transmission', '450 MW'],
                          ].map(([f, t, ty, c]) => (
                            <tr key={f+t} className="hover:bg-slate-50">
                              <td className="border border-slate-200 px-3 py-1.5 text-slate-700">{f}</td>
                              <td className="border border-slate-200 px-3 py-1.5 text-slate-700">{t}</td>
                              <td className="border border-slate-200 px-3 py-1.5 text-slate-600">{ty}</td>
                              <td className="border border-slate-200 px-3 py-1.5 font-semibold text-slate-800">{c}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Step>

                  <Step n={5} title="Save & Validate">
                    <p className="text-slate-600 text-sm">TEMPO saves automatically. Switch to <strong>Dashboard</strong> to see the system KPIs update in real time — locations count, link count, installed capacity, and estimated CAPEX.</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3 text-sm text-gray-800">
                      <FiCheckCircle className="inline mr-2" />
                      <strong>Model ready to run</strong> — head to <strong>Run</strong> in the sidebar, configure the time horizon and solver, and start the optimisation.
                    </div>
                  </Step>
                </div>
              </div>
            )}

            {/* YAML / Archive Import */}
            {(selectedMethod === 'import' || !selectedMethod) && (
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Import a Model — Three Paths</h3>
                  <p className="text-sm text-slate-500">Go to <strong className="text-slate-700">Structure → Models</strong> and click <strong className="text-slate-700">Import Calliope Model</strong> (or drag a ZIP onto the archive target)</p>
                </div>

                <div className="space-y-5">
                  <Step n={1} title="YAML Archive (Calliope 0.6.8 or 0.7)">
                    <p className="text-slate-600 text-sm mb-2">
                      Click <strong>YAML Archive</strong> in the import chooser. Drop a Calliope <code className="bg-slate-100 px-1 rounded">.zip</code> bundle — the file must contain a <code className="bg-slate-100 px-1 rounded">model.yaml</code> (or similar entry point) and any referenced CSV time-series files.
                    </p>
                    <p className="text-slate-600 text-sm">TEMPO auto-detects the Calliope version (0.6 vs 0.7), applies the parameter mapping, and opens the <strong>YAML Importer</strong> dialog where you can review locations, technologies and time-series before confirming.</p>
                    <Tip>If the archive has multiple models (e.g. a parent <code>model.yaml</code> importing regional sub-models), TEMPO lists all detected roots so you can choose which one to load.</Tip>
                  </Step>

                  <Step n={2} title="CSV Wizard (Locations + Links CSVs)">
                    <p className="text-slate-600 text-sm mb-2">
                      Click <strong>CSV Wizard</strong>. Upload your locations CSV (required) and optionally links, demand timeseries, technologies, and scenarios files — the wizard steps you through each one in order and validates each before moving on.
                    </p>
                    <p className="text-slate-500 text-xs">See the <strong>Templates</strong> tab for downloadable CSV examples with the exact column format expected.</p>
                  </Step>

                  <Step n={3} title="Framework Archive — auto-detect (PyPSA / OSeMOSYS / AdOpT-NET0)">
                    <p className="text-slate-600 text-sm mb-2">
                      Click <strong>Framework Archive (auto-detect)</strong> and drop a <code className="bg-slate-100 px-1 rounded">.zip</code>. TEMPO inspects the file listing and routes it to the correct engine's Python service (PyPSA, OSeMOSYS, or AdOpT-NET0) to translate it into the internal TEMPO format.
                    </p>
                    <div className="bg-slate-100 rounded-lg p-3 mt-2 text-xs text-slate-700">
                      <p className="font-semibold mb-1">Requirements:</p>
                      <ul className="space-y-0.5">
                        <li>• The matching engine venv must be installed (Settings → Engine panels)</li>
                        <li>• PyPSA: netCDF or CSV network folder · OSeMOSYS: otoole-compatible CSV set · AdOpT-NET0: case-directory ZIP</li>
                        <li>• A translation report is shown after import listing any unrecognised parameters</li>
                      </ul>
                    </div>
                  </Step>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 mt-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Supported engines</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {[
                      ['Calliope 0.6.8', 'Multi-carrier LP (HiGHS)'],
                      ['Calliope 0.7', 'Dev-series 0.7 (CBC)'],
                      ['PyPSA', 'Power flow + capacity (HiGHS)'],
                      ['OSeMOSYS', 'Long-run planning (GLPK)'],
                      ['AdOpT-NET0', 'Net-zero pathway (LP)'],
                    ].map(([name, desc]) => (
                      <div key={name} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                        <div className="font-semibold text-slate-800">{name}</div>
                        <div className="text-slate-500">{desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CSV Wizard Steps */}
            {(selectedMethod === 'bulk' || !selectedMethod) && (
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="mb-6 pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">CSV Wizard Workflow</h3>
                  <p className="text-sm text-slate-500">Import a 12-node German grid from CSV in under 2 minutes</p>
                </div>

                <div className="space-y-5">
                  <Step n={1} title="Download the Locations Template">
                    <p className="text-slate-600 text-sm mb-3">Go to the <strong>Templates</strong> tab and download <code className="bg-slate-100 px-1 rounded">locations_template.csv</code>. Open it in Excel or Google Sheets.</p>
                    <p className="text-slate-600 text-sm mb-2">The template already contains a Berlin example. Replace it with your own rows:</p>
                    <CodeBlock>{`name,latitude,longitude,techs,energy_cap_max,demand_types,resource_files
Berlin,52.52,13.405,"solar_pv,wind_onshore,battery_storage,gas_ccgt",4000,power_demand,german_demand_2024
Munich,48.1351,11.582,"solar_pv,wind_onshore,gas_ccgt,battery_storage",3000,power_demand,german_demand_2024
Hamburg,53.5511,9.9937,"wind_offshore,solar_pv,battery_storage,gas_ccgt",3500,power_demand,german_demand_2024
Frankfurt,50.1109,8.6821,"solar_pv,gas_ccgt,battery_storage",2500,power_demand,german_demand_2024
Cologne,50.9375,6.9603,"solar_pv,wind_onshore,gas_ccgt",2200,power_demand,german_demand_2024
Stuttgart,48.7758,9.1829,"solar_pv,biomass,battery_storage",2000,power_demand,german_demand_2024
Dresden,51.0504,13.7373,"solar_pv,wind_onshore,coal",1800,power_demand,german_demand_2024
Hannover,52.3759,9.732,"wind_onshore,solar_pv,gas_ccgt",1700,power_demand,german_demand_2024
Leipzig,51.3397,12.3731,"solar_pv,wind_onshore,battery_storage",1500,power_demand,german_demand_2024
Nuremberg,49.4521,11.0767,"solar_pv,biomass,gas_ccgt",1800,power_demand,german_demand_2024
Node_North,53.0,10.0,ac_transmission,8000,,
Node_South,49.0,11.5,ac_transmission,7000,,`}</CodeBlock>
                    <Tip>Keep the header row exactly as-is. Only <code>name</code>, <code>type</code>, <code>latitude</code>, <code>longitude</code> are required — all other columns are optional.</Tip>
                  </Step>

                  <Step n={2} title="Fill the Transmission Template">
                    <p className="text-slate-600 text-sm mb-2">Download <code className="bg-slate-100 px-1 rounded">transmission_lines_template.csv</code>. Reference the <strong>exact same names</strong> from your locations file:</p>
                    <CodeBlock>{`from,to,distance_km,capacity_MW,voltage_kV,tech
Berlin,Leipzig,149,2000,220,ac_transmission
Berlin,Dresden,165,1800,220,ac_transmission
Berlin,Hannover,250,2200,220,ac_transmission
Berlin,Node_North,280,3000,380,ac_transmission
Munich,Stuttgart,190,2000,220,ac_transmission
Munich,Nuremberg,150,1800,220,ac_transmission
Munich,Node_South,120,2500,380,ac_transmission
Hamburg,Hannover,132,2500,220,ac_transmission
Hamburg,Node_North,150,3000,380,ac_transmission
Frankfurt,Cologne,152,2200,220,ac_transmission
Frankfurt,Stuttgart,152,2000,220,ac_transmission
Node_North,Node_South,450,4000,380,hvdc_transmission`}</CodeBlock>
                  </Step>

                  <Step n={3} title="Upload via Import">
                    <p className="text-slate-600 text-sm">Go to <strong>Structure → Models</strong> and click <strong>Import</strong>. Drag your CSVs into the dropzone — Locations first, then Transmission.</p>
                    <div className="bg-slate-100 rounded-lg p-3 mt-2 text-sm text-slate-700">
                      <p className="font-semibold mb-1">Validation checks run automatically:</p>
                      <ul className="space-y-1 text-xs">
                        <li><FiCheckCircle className="inline text-gray-500 mr-1" />Coordinate range (−90 to 90 lat, −180 to 180 lon)</li>
                        <li><FiCheckCircle className="inline text-gray-500 mr-1" />Link references — every <code>from</code>/<code>to</code> name must exist in Locations</li>
                        <li><FiCheckCircle className="inline text-gray-500 mr-1" />Entity type is one of: substation, renewable_site, power_plant, demand_center, storage_facility, network_node</li>
                      </ul>
                    </div>
                  </Step>

                  <Step n={4} title="Review & Refine on the Map">
                    <p className="text-slate-600 text-sm">After import, open <strong>Map View</strong> to see all nodes placed on the map with connecting lines. Click any node to add technologies or adjust parameters.</p>
                    <Screenshot src="./img/Map_view.png" alt="Imported model on dark map" caption="An imported multi-node German model — Hamburg, Hannover, Berlin, Leipzig, Frankfurt, Stuttgart, Nuremberg, Munich — with transmission links drawn automatically from the CSV." />
                  </Step>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 mt-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">After import you can still…</p>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>· Click any location marker to add or swap technologies</li>
                    <li>· Drag markers to adjust positions</li>
                    <li>· Delete stray links and redraw them in Link mode</li>
                    <li>· Upload time series (demand.csv, solar_cf.csv) in Structure → TimeSeries</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        );

      case 'gis':
        return (
          <div className="space-y-8">
            <div className="text-center pb-2">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">GIS Data & OSM Infrastructure</h2>
              <p className="text-slate-600 max-w-2xl mx-auto">TEMPO can overlay real power infrastructure from OpenStreetMap — power lines, substations, and plants — to help you ground your model in physical reality.</p>
            </div>

            {/* Infrastructure screenshot */}
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">What the Infrastructure Overlay Looks Like</h3>
              <Screenshot src="./img/GISdata.png" alt="OSM infrastructure layers — Bavaria" caption="Bavaria with OSM power infrastructure loaded: red/orange/yellow lines = 220 kV / 110–220 kV / 20–110 kV transmission lines; coloured squares = power plants (solar=orange, coal=grey, gas=navy, nuclear=pink, hydro=blue, biomass=green)." />
            </div>

            {/* Right sidebar walk-through */}
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-4">The OSM Infrastructure Panel (Right Sidebar)</h3>
              <div className="flex gap-6 items-start">
                <img className="h-[700px] w-auto flex-shrink-0 rounded-xl border border-slate-200 shadow-md object-contain" src="./img/OSMsidebar.png" alt="Creation mode right sidebar" />
                <img className="h-[350px] w-auto flex-shrink-0 rounded-xl border border-slate-200 shadow-md object-contain" src="./img/Meshgenerator.png" alt="Creation mode right sidebar" />
                <div className="space-y-4 flex-1">
                  {[
                    {
                      icon: FiGlobe, title: '① SELECT REGION stepper',
                      body: 'Cascade through Continent → Country → Region → Subregion. Each selection zooms the map and loads data for that area. Use "Clear All" to reset.'
                    },
                    {
                      icon: FiDownload, title: '② Download GIS Data (collapsible)',
                      body: 'Expand to download a new country from Geofabrik. Pick Continent + Country + (optional) Region and click "Download & Import". A live log terminal streams pipeline progress.'
                    },
                    {
                      icon: FiSliders, title: '③ Infrastructure Layers',
                      body: 'Toggle Power Lines, Power Plants, Substations, Region Boundaries independently. Expand each row to filter by voltage range (kV) or energy source.'
                    },
                    {
                      icon: FiServer, title: '④ Power Mesh Generator',
                      body: 'Click "Generate Mesh Network" to build a graph of intersections from the visible power line layer. Import the result as model Locations & Links with one click.'
                    },
                  ].map(({ icon: Icon, title, body }) => (
                    <div key={title} className="flex gap-4 bg-white border border-slate-200 rounded-xl p-4">
                      <Icon className="text-slate-500 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <div className="font-semibold text-slate-800 text-sm mb-1">{title}</div>
                        <p className="text-slate-600 text-sm">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Step-by-step: Download a region */}
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-4">How to Download a New Region (in-app)</h3>
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">


                <Step n={1} title='Open Creation → expand "Download GIS Data"'>
                  <p className="text-slate-600 text-sm">In the right sidebar, scroll down past the SELECT REGION stepper. Click the <strong>"Download GIS Data"</strong> header to expand the collapsible panel.</p>
                </Step>

                <Step n={2} title="Pick Continent → Country → Region (optional)">
                  <p className="text-slate-600 text-sm mb-2">Example — download all of Spain's Asturias region:</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Europe', 'Spain', 'Asturias (optional)'].map((s, i) => (
                      <div key={s} className="flex items-center gap-1">
                        {i > 0 && <FiArrowRight size={12} className="text-slate-400" />}
                        <span className="bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-medium">{s}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-slate-500 text-xs mt-2">Leave Region blank to download the entire country. Country-only downloads are larger (may take 5–15 min).</p>
                </Step>

                <Step n={3} title='Click "Download & Import"'>
                  <p className="text-slate-600 text-sm">A black log terminal appears below the button. You will see live output like:</p>
                  <div className="bg-slate-900 text-slate-300 rounded-lg p-3 text-xs font-mono mt-2 space-y-0.5">
                    <div>Python: .venv-calliope/Scripts/python.exe</div>
                    <div>Script: osm_processing/add_region_to_geoserver.py</div>
                    <div>Downloading Spain/Asturias from Geofabrik (212 MB)…</div>
                    <div>Extracting power features with osmium…</div>
                    <div>Uploading to PostGIS (calliope-postgis:5432)…</div>
                    <div>Creating GeoServer layer: spain_asturias_power_lines</div>
                    <div className="text-slate-100 font-semibold">✓ Done. Region ready in SELECT REGION stepper.</div>
                  </div>
                </Step>

                <Step n={4} title="Select the new region in the stepper">
                  <p className="text-slate-600 text-sm">After the log shows "Done", scroll back up to the SELECT REGION stepper. Europe → Spain → Asturias now appears in the dropdowns. Select it — the map pans to Asturias and renders the real power infrastructure.</p>
                </Step>
              </div>
            </div>

            {/* Power Mesh workflow */}
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">From Real Infrastructure to Model Nodes</h3>
              <p className="text-slate-600 text-sm mb-4">Use the Power Mesh Generator to automatically extract a network topology from OSM data.</p>
              <div className="flex flex-col md:flex-row gap-3 items-start">
                {[
                  { step: '1', title: 'Load a region', body: 'Select region → infrastructure renders.' },
                  { step: '2', title: 'Enable Power Lines layer', body: 'Toggle on in Infrastructure Layers.' },
                  { step: '3', title: 'Generate Mesh', body: 'Click "Generate Mesh Network" — nodes appear at intersections.' },
                  { step: '4', title: 'Import as model', body: 'Click "Import as Locations & Links" → model is populated.' },
                ].map(({ step, title, body }) => (
                  <div key={step} className="flex-1 bg-white border border-slate-200 rounded-xl p-4 text-center">
                    <div className="w-8 h-8 bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center justify-center mx-auto mb-2">{step}</div>
                    <div className="font-semibold text-slate-800 text-sm mb-1">{title}</div>
                    <div className="text-slate-500 text-xs">{body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'templates':
        return (
          <div className="space-y-8">
            <div className="text-center pb-2">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">Download Templates</h2>
              <p className="text-slate-600">CSV/JSON files with real example data — ready to populate and import.</p>
            </div>

            {/* Template cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Locations */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FiMapPin size={13} className="text-slate-500" />
                      <h3 className="font-semibold text-slate-800 text-sm">Locations</h3>
                    </div>
                    <p className="text-slate-400 text-xs">Substations, plants, demand sites</p>
                  </div>
                  <button
                    onClick={() => setExpandedCSV(expandedCSV === 'locations' ? null : 'locations')}
                    className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs"
                  >
                    <FiEye size={13} /> preview
                  </button>
                </div>
                {expandedCSV === 'locations' && (
                  <CodeBlock>{`name,type,latitude,longitude,capacity_mw,voltage_level,subtype
Berlin_Main,substation,52.5200,13.4050,,380,
Solar_Farm_1,renewable_site,52.3730,13.0640,100,,solar_pv
Gas_Plant_Berlin,power_plant,52.4500,13.3500,500,,gas
Berlin_City,demand_center,52.5200,13.4050,2000,,mixed
Battery_Storage_1,storage_facility,52.4800,13.3800,50,,battery_li_ion`}</CodeBlock>
                )}
                <button onClick={() => generateCSVDownload('LOCATIONS')} className="mt-3 w-full border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download locations_template.csv
                </button>
              </div>

              {/* Transmission */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FiLink size={13} className="text-slate-500" />
                      <h3 className="font-semibold text-slate-800 text-sm">Transmission Lines</h3>
                    </div>
                    <p className="text-slate-400 text-xs">Power lines & connections between locations</p>
                  </div>
                  <button onClick={() => setExpandedCSV(expandedCSV === 'tx' ? null : 'tx')} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs">
                    <FiEye size={13} /> preview
                  </button>
                </div>
                {expandedCSV === 'tx' && (
                  <CodeBlock>{`from,to,type,capacity_mw,voltage_kv,length_km,efficiency
Berlin_Main,Hamburg_Main,ac_transmission,2000,380,255,0.97
Solar_Farm_1,Berlin_Main,ac_transmission,120,110,35,0.98
Gas_Plant_Berlin,Berlin_Main,ac_transmission,550,220,15,0.99`}</CodeBlock>
                )}
                <button onClick={() => generateCSVDownload('TRANSMISSION_LINES')} className="mt-3 w-full border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download transmission_lines_template.csv
                </button>
              </div>

              {/* Tech Params */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FiZap size={13} className="text-slate-500" />
                      <h3 className="font-semibold text-slate-800 text-sm">Technology Parameters</h3>
                    </div>
                    <p className="text-slate-400 text-xs">Capacity, efficiency, constraint values per location</p>
                  </div>
                  <button onClick={() => setExpandedCSV(expandedCSV === 'tech' ? null : 'tech')} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs">
                    <FiEye size={13} /> preview
                  </button>
                </div>
                {expandedCSV === 'tech' && (
                  <CodeBlock>{`location,technology,constraint_name,constraint_value,unit
Solar_Farm_1,solar_pv_fixed,energy_cap_max,100,MW
Solar_Farm_1,solar_pv_fixed,energy_eff,0.20,
Gas_Plant_Berlin,gas_ccgt,energy_cap_max,500,MW
Gas_Plant_Berlin,gas_ccgt,energy_eff,0.58,
Berlin_City,power_demand,resource,file=berlin_demand.csv,`}</CodeBlock>
                )}
                <button onClick={() => generateCSVDownload('TECHNOLOGY_PARAMETERS')} className="mt-3 w-full border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download technology_parameters_template.csv
                </button>
              </div>

              {/* Costs */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FiDatabase size={13} className="text-slate-500" />
                      <h3 className="font-semibold text-slate-800 text-sm">Cost Parameters</h3>
                    </div>
                    <p className="text-slate-400 text-xs">CAPEX, OPEX, fuel costs per technology</p>
                  </div>
                  <button onClick={() => setExpandedCSV(expandedCSV === 'costs' ? null : 'costs')} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs">
                    <FiEye size={13} /> preview
                  </button>
                </div>
                {expandedCSV === 'costs' && (
                  <CodeBlock>{`location,technology,cost_class,cost_name,value,unit
Solar_Farm_1,solar_pv_fixed,monetary,energy_cap,1050,EUR/kW
Solar_Farm_1,solar_pv_fixed,monetary,om_annual_investment_fraction,0.015,
Gas_Plant_Berlin,gas_ccgt,monetary,energy_cap,750,EUR/kW
Gas_Plant_Berlin,gas_ccgt,monetary,om_var,3.5,EUR/MWh
Gas_Plant_Berlin,gas_ccgt,monetary,fuel_cost,35,EUR/MWh`}</CodeBlock>
                )}
                <button onClick={() => generateCSVDownload('COST_PARAMETERS')} className="mt-3 w-full border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download cost_parameters_template.csv
                </button>
              </div>

              {/* Demand time series */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FiFileText size={13} className="text-slate-500" />
                      <h3 className="font-semibold text-slate-800 text-sm">Demand Time Series</h3>
                    </div>
                    <p className="text-slate-400 text-xs">Hourly consumption profile (8760 rows)</p>
                  </div>
                  <button onClick={() => setExpandedCSV(expandedCSV === 'demand' ? null : 'demand')} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs">
                    <FiEye size={13} /> preview
                  </button>
                </div>
                {expandedCSV === 'demand' && (
                  <CodeBlock>{`timestep,Berlin_City,Munich_Demand,Hamburg_Main
2023-01-01 00:00,5200,-4800,-3100
2023-01-01 01:00,4900,-4600,-2900
2023-01-01 02:00,4700,-4400,-2800
...8760 rows — one per hour of the year`}</CodeBlock>
                )}
                <button onClick={() => generateCSVDownload('TIMESERIES_DEMAND')} className="mt-3 w-full border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download demand_timeseries_template.csv
                </button>
              </div>

              {/* Solar CF */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FiPlay size={13} className="text-slate-500" />
                      <h3 className="font-semibold text-slate-800 text-sm">Solar Capacity Factors</h3>
                    </div>
                    <p className="text-slate-400 text-xs">Hourly PV resource factor (0–1)</p>
                  </div>
                  <button onClick={() => setExpandedCSV(expandedCSV === 'solar' ? null : 'solar')} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-xs">
                    <FiEye size={13} /> preview
                  </button>
                </div>
                {expandedCSV === 'solar' && (
                  <CodeBlock>{`timestep,Solar_Farm_1,Stuttgart_Solar,Solar_Augsburg
2023-01-01 00:00,0.000,0.000,0.000
2023-01-01 06:00,0.031,0.028,0.033
2023-01-01 12:00,0.812,0.798,0.835
2023-06-21 12:00,0.980,0.972,0.991`}</CodeBlock>
                )}
                <button onClick={() => generateCSVDownload('TIMESERIES_SOLAR')} className="mt-3 w-full border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download solar_timeseries_template.csv
                </button>
              </div>
            </div>

            {/* JSON */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FiFileText size={13} className="text-slate-500" />
                    <h3 className="font-semibold text-slate-800 text-sm">Complete JSON Template</h3>
                  </div>
                  <p className="text-slate-400 text-xs">Full model structure — locations, links, technologies, costs, time series — in a single file.</p>
                </div>
                <button onClick={generateJSONDownload} className="border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1.5">
                  <FiDownload size={12} /> Download model_template.json
                </button>
              </div>
            </div>

            {/* Column reference */}
            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-4">Column Reference</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { file: 'locations.csv', cols: [
                    { col: 'name', req: true, desc: 'Unique identifier — no spaces, use underscores' },
                    { col: 'type', req: true, desc: 'substation | renewable_site | power_plant | demand_center | storage_facility | network_node' },
                    { col: 'latitude', req: true, desc: 'Decimal degrees, −90 to 90' },
                    { col: 'longitude', req: true, desc: 'Decimal degrees, −180 to 180' },
                    { col: 'capacity_mw', req: false, desc: 'Installed or max capacity in MW' },
                    { col: 'voltage_level', req: false, desc: 'kV, relevant for substations' },
                  ]},
                  { file: 'transmission.csv', cols: [
                    { col: 'from', req: true, desc: 'Location name (must exist in locations.csv)' },
                    { col: 'to', req: true, desc: 'Location name (must exist in locations.csv)' },
                    { col: 'type', req: true, desc: 'ac_transmission | dc_transmission | gas_pipeline | heat_network' },
                    { col: 'capacity_mw', req: false, desc: 'Max power flow in MW' },
                    { col: 'efficiency', req: false, desc: '0–1 fraction (default 0.97)' },
                    { col: 'voltage_kv', req: false, desc: 'kV — determines rendered line colour' },
                  ]},
                ].map(({ file, cols }) => (
                  <div key={file} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="font-bold text-slate-700 text-sm mb-3 font-mono">{file}</div>
                    <div className="space-y-2">
                      {cols.map(({ col, req, desc }) => (
                        <div key={col} className="flex gap-2 text-xs">
                          <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{col}</code>
                          {req && <span className="text-gray-500 font-bold flex-shrink-0">*</span>}
                          <span className="text-slate-500">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2"><span className="text-gray-500">*</span> Required column</p>
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
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <entity.icon className="text-slate-500" size={16} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800 text-sm mb-0.5">{entity.name}</h3>
                      <p className="text-slate-500 text-xs">{entity.description}</p>
                    </div>
                  </div>

                  {entity.allowedTechTypes && entity.allowedTechTypes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Technologies</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entity.allowedTechTypes.map((tech) => (
                          <span key={tech} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Required fields</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entity.requiredFields.map((field) => (
                        <span
                          key={field}
                          className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono"
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
