import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiDownload, FiMapPin, FiLink, FiZap, FiDatabase, FiPlay, FiEdit, FiUpload, FiFileText, FiCheckCircle, FiArrowRight, FiLayers, FiGlobe, FiTerminal, FiEye, FiServer, FiSliders, FiPackage, FiBarChart2, FiSearch, FiTrash2, FiInfo, FiCopy, FiCheck, FiBookOpen, FiChevronLeft, FiChevronRight, FiX, FiMaximize2, FiCpu, FiHome, FiMap, FiGrid, FiActivity, FiSettings, FiPieChart } from './ui/icons';
import tempoLogo from '../assets/Logo_TEMPO.PNG';
import { ENTITY_TYPES } from '../config/domainModel';
import { generateCSVDownload, generateJSONDownload } from '../config/dataTemplates';
import { ModelStructureTutorial } from './ModelStructureTutorial';


const PageHeader = ({ title, children }) => (
  <header className="mb-2">
    <h2 className="text-3xl font-black tracking-tighter text-black">{title}</h2>
    {children && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-500">{children}</p>}
  </header>
);

const SectionTitle = ({ title, children }) => (
  <div className="mb-5">
    <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
    {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
  </div>
);

// Timeline step — the connector line hides on the last step of a list.
const Step = ({ n, title, children }) => (
  <div className="group/step relative flex gap-4 pb-8 last:pb-0">
    <div className="flex flex-col items-center">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black text-sm font-semibold text-white  ring-4 ring-white">
        {n}
      </div>
      <div className="mt-2 w-px flex-1 bg-gradient-to-b from-slate-300 to-slate-200 group-last/step:hidden" />
    </div>
    <div className="min-w-0 flex-1 pt-1">
      <h4 className="mb-2 text-[15px] font-semibold text-slate-900">{title}</h4>
      {children}
    </div>
  </div>
);

const Tip = ({ children }) => (
  <div className="mt-3 flex gap-3 rounded-xl border border-black/15 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">
    <FiInfo className="mt-0.5 shrink-0 text-slate-500" size={16} />
    <div><span className="font-semibold text-slate-900">Tip — </span>{children}</div>
  </div>
);

const CodeBlock = ({ children, label = 'csv' }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(String(children)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-black ">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-300">{children}</pre>
    </div>
  );
};

// Screenshot in a browser-style frame; click to view full size.
const Screenshot = ({ src, alt, caption }) => {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <figure className="group my-4 overflow-hidden rounded-2xl border border-black/15 bg-white shadow-lg shadow-slate-900/5">
        <div className="flex items-center gap-1.5 border-b border-black/15 bg-slate-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 truncate text-[11px] text-slate-400">{alt}</span>
        </div>
        <button onClick={() => setZoomed(true)} className="relative block w-full cursor-zoom-in" aria-label={`Enlarge: ${alt}`}>
          <img src={src} alt={alt} className="w-full object-cover" />
          <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            <FiMaximize2 size={12} /> Enlarge
          </span>
        </button>
        {caption && (
          <figcaption className="border-t border-black/15 bg-slate-50/70 px-4 py-2.5 text-xs leading-relaxed text-slate-500">
            {caption}
          </figcaption>
        )}
      </figure>
      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-[10000] flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-8 backdrop-blur-sm"
          >
            <motion.img
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              src={src}
              alt={alt}
              className="max-h-full max-w-full rounded-xl shadow-2xl"
            />
            <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
              <FiX size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const Tutorial = () => {
  const [activeTab, setActiveTab] = useState('start');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [expandedCSV, setExpandedCSV] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

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
          <div className="space-y-14">
            {/* Hero */}
            <section className="relative overflow-hidden rounded-3xl border border-black/15 bg-white p-8  md:p-10">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px', maskImage: 'linear-gradient(to left, black, transparent 70%)' }}
              />
              <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-black/15 bg-white ">
                      <img src={tempoLogo} alt="" className="h-8 w-8 object-contain" style={{ mixBlendMode: 'multiply' }} />
                    </div>
                    <span className="rounded-full border border-black/15 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">Getting started guide</span>
                  </div>
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">Welcome to TEMPO</h1>
                  <p className="mt-3 max-w-xl text-lg text-slate-500">Tool for Energy Model Planning and Optimization — build, run and compare energy system models on a map.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {[
                      { icon: FiCpu, label: 'Multi-engine' },
                      { icon: FiEye, label: 'Visual interface' },
                      { icon: FiGlobe, label: 'Real GIS data' },
                      { icon: FiLayers, label: 'Multi-format' },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="inline-flex items-center gap-1.5 border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ">
                        <Icon size={13} className="text-slate-500" /> {label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      onClick={() => { setActiveTab('methods'); setSelectedMethod('manual'); }}
                      className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white  transition-colors hover:bg-black/80"
                    >
                      Build your first model <FiArrowRight size={15} />
                    </button>
                    <button
                      onClick={() => setActiveTab('templates')}
                      className="inline-flex items-center gap-2 rounded-xl border border-black/15 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700  transition-colors hover:bg-slate-50"
                    >
                      <FiDownload size={15} /> Browse templates
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
                  {[
                    ['5', 'optimisation engines'],
                    ['60+', 'technology templates'],
                    ['4', 'export frameworks'],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-black/15 bg-white/90 px-5 py-4  backdrop-blur lg:w-56">
                      <div className="text-2xl font-black tracking-tighter text-black">{value}</div>
                      <div className="text-xs text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Interface tour */}
            <section>
              <SectionTitle title="The interface at a glance">A real 12-node model of Germany, as it appears on the Dashboard.</SectionTitle>
              <Screenshot
                src="./img/Dashboard.png"
                alt="TEMPO Model Dashboard"
                caption="Model Dashboard — a real model for Germany with 12 locations, 12 links, 6 generation technologies, 36.5 GW capacity, 20.9 M€ CAPEX."
              />
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { icon: FiMapPin, label: 'Locations', desc: '12 nodes — cities, substations, plants' },
                  { icon: FiLink, label: 'Links', desc: '12 transmission lines between nodes' },
                  { icon: FiZap, label: 'Gen Technologies', desc: '6 supply types (solar, wind, gas…)' },
                  { icon: FiActivity, label: 'Max Capacity', desc: '36.5 GW total across all locations' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex gap-3 rounded-xl border border-black/15 bg-white p-3.5 ">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{label}</div>
                      <div className="text-xs leading-snug text-slate-500">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 4-step stepper */}
            <section>
              <SectionTitle title="Build your first model in 4 steps">From an empty map to a model that's ready to optimise.</SectionTitle>
              <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="pointer-events-none absolute left-8 right-8 top-[34px] hidden h-px bg-slate-200 xl:block" />
                {[
                  { n: 1, icon: FiGlobe, title: 'Select a region', desc: 'Open Creation. In the right sidebar choose a continent → country → region. The map zooms to your area and loads real power infrastructure.', path: ['Right sidebar', 'Select region'] },
                  { n: 2, icon: FiMapPin, title: 'Place locations', desc: 'Click "Add Location" in the left panel, then click the map to drop nodes — city demand centers, substations, power plants.', path: ['Add Location', 'Click map'] },
                  { n: 3, icon: FiZap, title: 'Assign technologies', desc: 'Click a location marker to open the configuration dialog. Pick from 60+ templates: Solar PV, Wind, Gas CCGT, Battery Storage, Demand…', path: ['Click marker', 'Configure'] },
                  { n: 4, icon: FiLink, title: 'Connect the network', desc: 'Switch mode to "Link", then click two locations to create a transmission line. Set voltage (kV) and capacity (MW) in the dialog.', path: ['Left panel', 'Link mode'] },
                ].map(({ n, icon: Icon, title, desc, path }) => (
                  <div key={n} className="relative flex flex-col rounded-2xl border border-black/15 bg-white p-5  transition-all hover:-translate-y-0.5 hover:">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-black text-sm font-semibold text-white ring-4 ring-white">{n}</div>
                      <Icon className="text-slate-400" size={18} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">{desc}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-1 text-[11px] font-medium text-slate-600">
                      {path.map((part, i) => (
                        <React.Fragment key={part}>
                          {i > 0 && <FiChevronRight size={11} className="text-slate-400" />}
                          <span className="rounded-md bg-slate-100 px-2 py-1">{part}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Navigation map */}
            <section>
              <SectionTitle title="Where to find everything">Every page in the left sidebar, grouped by what you'll use it for.</SectionTitle>
              <div className="grid gap-4 lg:grid-cols-3">
                {[
                  { group: 'Build', items: [
                    { icon: FiHome, label: 'Dashboard', desc: 'Model KPIs, location map, capacity overview and cost summary' },
                    { icon: FiEdit, label: 'Creation', desc: 'Visual map editor — place locations, draw links, load OSM infrastructure layers' },
                    { icon: FiCpu, label: 'Tech Database', desc: 'Browse the technology catalog and its parameters' },
                  ]},
                  { group: 'Structure', items: [
                    { icon: FiGrid, label: 'Models', desc: 'Import, search and filter models. Multi-select for bulk delete or JSON export.' },
                    { icon: FiMap, label: 'Map View', desc: 'Interactive map of active model locations and transmission links' },
                    { icon: FiMapPin, label: 'Locations', desc: 'Table view of all nodes with coordinates and assigned technologies' },
                    { icon: FiActivity, label: 'Links', desc: 'Transmission line table — from/to, capacity, voltage, type' },
                    { icon: FiBarChart2, label: 'TimeSeries', desc: 'Upload and manage CSV demand & resource capacity-factor profiles' },
                    { icon: FiLayers, label: 'Scenarios', desc: 'Named parameter overrides and scenario combinations for sensitivity runs' },
                  ]},
                  { group: 'Run & analyse', items: [
                    { icon: FiDownload, label: 'Export', desc: 'Download the active model as Calliope 0.6/0.7, PyPSA, OSeMOSYS, or AdOpT-NET0 archive' },
                    { icon: FiPlay, label: 'Run', desc: 'Launch optimisation. Search, filter and bulk-manage completed runs by name or status.' },
                    { icon: FiPieChart, label: 'Results', desc: 'Dispatch, costs, capacity maps, shadow prices — plus Model Advisor for LLM-powered insights' },
                    { icon: FiSettings, label: 'Settings', desc: 'Engine install panels, Model Advisor API key, backend connection, solver paths' },
                  ]},
                ].map(({ group, items }) => (
                  <div key={group} className="rounded-2xl border border-black/15 bg-white p-2 ">
                    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
                    {items.map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-slate-50">
                        <Icon className="mt-0.5 shrink-0 text-slate-500" size={16} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{label}</div>
                          <div className="text-xs leading-snug text-slate-500">{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            {/* Model & run management */}
            <section>
              <SectionTitle title="Managing models & runs" />
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { icon: FiSearch, title: 'Models', where: 'Structure → Models', points: [
                    [FiCheckCircle, 'Search models by name; filter by engine type (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0)'],
                    [FiCheckCircle, 'Tick the "Select all" checkbox or pick individual models'],
                    [FiTrash2, 'Bulk delete or export selected models as JSON backup files'],
                  ]},
                  { icon: FiBarChart2, title: 'Completed runs', where: 'Run tab', points: [
                    [FiCheckCircle, 'Search runs by model name; filter by status (Done / Failed)'],
                    [FiCheckCircle, 'Tick the "Select all" checkbox or pick individual runs'],
                    [FiTrash2, 'Bulk download as JSON or bulk delete selected runs'],
                  ]},
                ].map(({ icon: Icon, title, where, points }) => (
                  <div key={title} className="rounded-2xl border border-black/15 bg-white p-5 ">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={16} /></div>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                        <div className="text-xs text-slate-400">{where}</div>
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {points.map(([PointIcon, text]) => (
                        <li key={text} className="flex gap-2.5"><PointIcon size={14} className="mt-0.5 shrink-0 text-slate-400" /><span>{text}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Choose a path */}
            <section>
              <SectionTitle title="Choose your path">Three ways to get a model into TEMPO.</SectionTitle>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  { icon: FiEdit, title: 'Manual creation', desc: 'Click-and-build on the map. Great for learning and small models.', cta: 'Step-by-step guide', go: () => { setActiveTab('methods'); setSelectedMethod('manual'); } },
                  { icon: FiPackage, title: 'Import a model', desc: 'YAML archive, CSV wizard, or framework archive — TEMPO auto-detects the format.', cta: 'Import guide', go: () => { setActiveTab('methods'); setSelectedMethod('import'); } },
                  { icon: FiFileText, title: 'Download templates', desc: 'CSV/JSON starter files with real example data — ready to populate and import.', cta: 'Browse templates', go: () => setActiveTab('templates') },
                ].map(({ icon: Icon, title, desc, cta, go }) => (
                  <button
                    key={title}
                    onClick={go}
                    className="group flex flex-col rounded-2xl border border-black/15 bg-white p-5 text-left  transition-all hover:-translate-y-0.5 hover:border-black/15 hover:"
                  >
                    <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-black text-white"><Icon size={17} /></div>
                    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">{desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      {cta}
                      <FiArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        );

      case 'methods':
        return (
          <div className="space-y-8">
            <PageHeader title="Step-by-Step: Building a Model">This example models a simplified Bavarian energy system.</PageHeader>

            {/* Method Selector */}
            <div className="flex justify-center">
              <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setSelectedMethod('manual')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                  selectedMethod === 'manual' || (!selectedMethod && 'manual' === 'manual') ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FiEdit size={16} /> Manual Creation
              </button>
              <button
                onClick={() => setSelectedMethod('import')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                  selectedMethod === 'import' || (!selectedMethod && 'import' === 'manual') ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FiPackage size={16} /> YAML / Archive Import
              </button>
              <button
                onClick={() => setSelectedMethod('bulk')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                  selectedMethod === 'bulk' || (!selectedMethod && 'bulk' === 'manual') ? 'bg-white text-slate-900 ' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FiUpload size={16} /> CSV Wizard
              </button>
              </div>
            </div>

            {/* Manual Creation Steps */}
            {(selectedMethod === 'manual' || !selectedMethod) && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 ">
                <div className="mb-6 pb-4 border-b border-black/10">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Manual Creation — Germany Example</h3>
                  <p className="text-sm text-slate-500">12 locations · 12 links · solar + wind + gas + nuclear + hydro + coal + biomass + battery + demand system</p>
                </div>

                <div>
                  <Step n={1} title="Open Creation Mode & Pick a Region">
                    <p className="text-slate-600 text-sm">Click <strong>Creation</strong> in the left sidebar. The map appears with an empty canvas.</p>
                    <Screenshot src="./img/Model.png" alt="Creation mode with region selector" caption="Creation Mode — left panel shows mode selector; right sidebar shows the Region Selection stepper (Continent → Country → Region → Subregion) and Infrastructure Layers toggles." />
                  </Step>

                  <Step n={2} title="Add Locations — 4 Nodes">
                    <p className="text-slate-600 text-sm mb-2">
                      In the left panel, click <strong>Add Location</strong>. Then click four spots on the map — each click drops another node:
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-black/15">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500">
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">Name</th>
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">Approx. coords</th>
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">Role</th>
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
                            <tr key={n} className="hover:bg-slate-50 last:[&>td]:border-0">
                              <td className="border-b border-black/10 px-3 py-1.5 text-slate-800 font-semibold">{n}</td>
                              <td className="border-b border-black/10 px-3 py-1.5 text-slate-500">{c}</td>
                              <td className="border-b border-black/10 px-3 py-1.5 text-slate-600">{r}</td>
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
                    <Tip>Each technology has a <strong>Common parameters</strong> panel — engine-neutral values (capacity, efficiency, lifetime, CAPEX…) defined once and translated automatically to whichever engine you run (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0). Expand <strong>Engine-specific parameters</strong> only when you need a raw field unique to one framework.</Tip>
                  </Step>

                  <Step n={4} title="Connect with Transmission Links">
                    <p className="text-slate-600 text-sm mb-2">Switch to <strong>Link</strong> mode in the top-left panel. Click a source location, then a destination:</p>
                    <div className="overflow-x-auto rounded-xl border border-black/15">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500">
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">From</th>
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">To</th>
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">Type</th>
                            <th className="border-b border-black/15 px-3 py-2 text-left font-semibold">Capacity</th>
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
                            <tr key={f+t} className="hover:bg-slate-50 last:[&>td]:border-0">
                              <td className="border-b border-black/10 px-3 py-1.5 text-slate-700">{f}</td>
                              <td className="border-b border-black/10 px-3 py-1.5 text-slate-700">{t}</td>
                              <td className="border-b border-black/10 px-3 py-1.5 text-slate-600">{ty}</td>
                              <td className="border-b border-black/10 px-3 py-1.5 font-semibold text-slate-800">{c}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Step>

                  <Step n={5} title="Save & Validate">
                    <p className="text-slate-600 text-sm">TEMPO saves automatically. Switch to <strong>Dashboard</strong> to see the system KPIs update in real time — locations count, link count, installed capacity, and estimated CAPEX.</p>
                    <div className="bg-gray-50 border border-black/15 rounded-lg p-3 mt-3 text-sm text-gray-800">
                      <FiCheckCircle className="inline mr-2" />
                      <strong>Model ready to run</strong> — head to <strong>Run</strong> in the sidebar, configure the time horizon and solver, and start the optimisation.
                    </div>
                  </Step>
                </div>
              </div>
            )}

            {/* YAML / Archive Import */}
            {(selectedMethod === 'import' || !selectedMethod) && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 ">
                <div className="mb-6 pb-4 border-b border-black/10">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Import a Model — Three Paths</h3>
                  <p className="text-sm text-slate-500">Go to <strong className="text-slate-700">Structure → Models</strong> and click <strong className="text-slate-700">Import Calliope Model</strong> (or drag a ZIP onto the archive target)</p>
                </div>

                <div>
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

                <div className="border border-black/15 rounded-lg p-4 mt-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Supported engines</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {[
                      ['Calliope 0.6.8', 'Multi-carrier LP (HiGHS)'],
                      ['Calliope 0.7', 'Dev-series 0.7 (CBC)'],
                      ['PyPSA', 'Power flow + capacity (HiGHS)'],
                      ['OSeMOSYS', 'Long-run planning (GLPK)'],
                      ['AdOpT-NET0', 'Net-zero pathway (LP)'],
                    ].map(([name, desc]) => (
                      <div key={name} className="bg-slate-50 border border-black/15 rounded-lg p-2">
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
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 ">
                <div className="mb-6 pb-4 border-b border-black/10">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">CSV Wizard Workflow</h3>
                  <p className="text-sm text-slate-500">Import a 12-node German grid from CSV in under 2 minutes</p>
                </div>

                <div>
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

                <div className="border border-black/15 rounded-lg p-4 mt-5">
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
            <PageHeader title="GIS Data & OSM Infrastructure">TEMPO can overlay real power infrastructure from OpenStreetMap — power lines, substations, and plants — to help you ground your model in physical reality.</PageHeader>

            {/* Infrastructure screenshot */}
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-3">What the Infrastructure Overlay Looks Like</h3>
              <Screenshot src="./img/GISdata.png" alt="OSM infrastructure layers — Bavaria" caption="Bavaria with OSM power infrastructure loaded: red/orange/yellow lines = 220 kV / 110–220 kV / 20–110 kV transmission lines; coloured squares = power plants (solar=orange, coal=grey, gas=navy, nuclear=pink, hydro=blue, biomass=green)." />
            </div>

            {/* Right sidebar walk-through */}
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-4">The OSM Infrastructure Panel (Right Sidebar)</h3>
              <div className="flex gap-6 items-start">
                <img className="h-[700px] w-auto flex-shrink-0 rounded-xl border border-black/15  object-contain" src="./img/OSMsidebar.png" alt="Creation mode right sidebar" />
                <img className="h-[350px] w-auto flex-shrink-0 rounded-xl border border-black/15  object-contain" src="./img/Meshgenerator.png" alt="Creation mode right sidebar" />
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
                    <div key={title} className="flex gap-4 bg-white border border-black/15 rounded-xl p-4">
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
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-4">How to Download a New Region (in-app)</h3>
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 ">


                <Step n={1} title='Open Creation → expand "Download GIS Data"'>
                  <p className="text-slate-600 text-sm">In the right sidebar, scroll down past the SELECT REGION stepper. Click the <strong>"Download GIS Data"</strong> header to expand the collapsible panel.</p>
                </Step>

                <Step n={2} title="Pick Continent → Country → Region (optional)">
                  <p className="text-slate-600 text-sm mb-2">Example — download all of Spain's Asturias region:</p>
                  <div className="flex gap-2 flex-wrap">
                    {['Europe', 'Spain', 'Asturias (optional)'].map((s, i) => (
                      <div key={s} className="flex items-center gap-1">
                        {i > 0 && <FiArrowRight size={12} className="text-slate-400" />}
                        <span className="bg-slate-200 text-slate-700 px-3 py-1 text-xs font-medium">{s}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-slate-500 text-xs mt-2">Leave Region blank to download the entire country. Country-only downloads are larger (may take 5–15 min).</p>
                </Step>

                <Step n={3} title='Click "Download & Import"'>
                  <p className="text-slate-600 text-sm">A black log terminal appears below the button. You will see live output like:</p>
                  <div className="bg-black text-slate-300 rounded-lg p-3 text-xs font-mono mt-2 space-y-0.5">
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
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-3">From Real Infrastructure to Model Nodes</h3>
              <p className="text-slate-600 text-sm mb-4">Use the Power Mesh Generator to automatically extract a network topology from OSM data.</p>
              <div className="flex flex-col md:flex-row gap-3 items-start">
                {[
                  { step: '1', title: 'Load a region', body: 'Select region → infrastructure renders.' },
                  { step: '2', title: 'Enable Power Lines layer', body: 'Toggle on in Infrastructure Layers.' },
                  { step: '3', title: 'Generate Mesh', body: 'Click "Generate Mesh Network" — nodes appear at intersections.' },
                  { step: '4', title: 'Import as model', body: 'Click "Import as Locations & Links" → model is populated.' },
                ].map(({ step, title, body }) => (
                  <div key={step} className="flex-1 bg-white border border-black/15 rounded-xl p-4 text-center">
                    <div className="w-8 h-8 bg-black text-white rounded-lg text-sm font-bold flex items-center justify-center mx-auto mb-2">{step}</div>
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
            <PageHeader title="Download Templates">CSV/JSON files with real example data — ready to populate and import.</PageHeader>

            {/* Template cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Locations */}
              <div className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all">
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
                <button onClick={() => generateCSVDownload('LOCATIONS')} className="mt-3 w-full border border-black/15 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download locations_template.csv
                </button>
              </div>

              {/* Transmission */}
              <div className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all">
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
                <button onClick={() => generateCSVDownload('TRANSMISSION_LINES')} className="mt-3 w-full border border-black/15 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download transmission_lines_template.csv
                </button>
              </div>

              {/* Tech Params */}
              <div className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all">
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
                <button onClick={() => generateCSVDownload('TECHNOLOGY_PARAMETERS')} className="mt-3 w-full border border-black/15 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download technology_parameters_template.csv
                </button>
              </div>

              {/* Costs */}
              <div className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all">
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
                <button onClick={() => generateCSVDownload('COST_PARAMETERS')} className="mt-3 w-full border border-black/15 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download cost_parameters_template.csv
                </button>
              </div>

              {/* Demand time series */}
              <div className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all">
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
                <button onClick={() => generateCSVDownload('TIMESERIES_DEMAND')} className="mt-3 w-full border border-black/15 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download demand_timeseries_template.csv
                </button>
              </div>

              {/* Solar CF */}
              <div className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all">
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
                <button onClick={() => generateCSVDownload('TIMESERIES_SOLAR')} className="mt-3 w-full border border-black/15 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5">
                  <FiDownload size={12} /> Download solar_timeseries_template.csv
                </button>
              </div>
            </div>

            {/* JSON */}
            <div className="bg-white border border-black/15 rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FiFileText size={13} className="text-slate-500" />
                    <h3 className="font-semibold text-slate-800 text-sm">Complete JSON Template</h3>
                  </div>
                  <p className="text-slate-400 text-xs">Full model structure — locations, links, technologies, costs, time series — in a single file.</p>
                </div>
                <button onClick={generateJSONDownload} className="border border-black/15 text-slate-700 px-4 py-2 rounded-lg text-xs font-medium hover:bg-slate-50 transition flex items-center gap-1.5">
                  <FiDownload size={12} /> Download model_template.json
                </button>
              </div>
            </div>

            {/* Column reference */}
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-4">Column Reference</h3>
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
                  <div key={file} className="bg-white border border-black/15 rounded-xl p-4">
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
            <PageHeader title="Entity Types">Different location types for your model</PageHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Object.values(ENTITY_TYPES).map((entity) => (
                <div
                  key={entity.id}
                  className="bg-white border border-black/15 rounded-2xl p-5  hover:border-black/15 hover: transition-all"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg leading-none" aria-hidden="true">{entity.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800 text-sm mb-0.5">{entity.name}</h3>
                      <p className="text-slate-500 text-xs">{entity.description}</p>
                    </div>
                  </div>

                  {entity.allowedTechTypes && entity.allowedTechTypes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-black/15">
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

                  <div className="mt-4 pt-4 border-t border-black/15">
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

  const tabIndex = tabs.findIndex((t) => t.id === activeTab);
  const prevTab = tabs[tabIndex - 1];
  const nextTab = tabs[tabIndex + 1];

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      <div className="z-20 border-b border-black/15 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-8 py-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-black text-white"><FiBookOpen size={15} /></div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Learn TEMPO</div>
              <div className="text-[11px] text-slate-400">Section {tabIndex + 1} of {tabs.length}</div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" aria-label="Tutorial sections">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="tutorial-tab"
                      className="absolute inset-0 rounded-lg bg-white "
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <tab.icon size={15} className="relative" />
                  <span className="relative">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>

          <div className="mt-14 grid gap-3 border-t border-black/15 pt-6 sm:grid-cols-2">
            {prevTab ? (
              <button
                onClick={() => setActiveTab(prevTab.id)}
                className="group flex items-center gap-3 rounded-2xl border border-black/15 bg-white p-4 text-left  transition-all hover:border-black/15 hover:"
              >
                <FiChevronLeft className="text-slate-400 transition-transform group-hover:-translate-x-0.5" />
                <div>
                  <div className="text-[11px] text-slate-400">Previous</div>
                  <div className="text-sm font-semibold text-slate-900">{prevTab.label}</div>
                </div>
              </button>
            ) : <div />}
            {nextTab && (
              <button
                onClick={() => setActiveTab(nextTab.id)}
                className="group flex items-center justify-end gap-3 rounded-2xl border border-black/15 bg-white p-4 text-right  transition-all hover:border-black/15 hover: sm:col-start-2"
              >
                <div>
                  <div className="text-[11px] text-slate-400">Next</div>
                  <div className="text-sm font-semibold text-slate-900">{nextTab.label}</div>
                </div>
                <FiChevronRight className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
