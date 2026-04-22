import Footer from '../components/Footer'
import model from '../public/img/Model.png'
import InteractiveQGIS from '../public/img/InteractiveQGIS.png'
import Dashboard from '../public/img/Dashboard.png'
import Results from '../public/img/results.png'
import ScreenTimeseries from '../public/img/timeseries.png' 
import ScreenH2 from '../public/img/h2.png'        
import ScreenCCS from '../public/img/ccs.png'     

export default function Features() {
  const workflowSteps = [
    {
      num: '01',
      title: 'Ingest',
      desc: 'Import OSM data for your region, load CSV timeseries, or drop a full Calliope YAML model (ZIP or folder). TEMPO resolves all imports recursively.',
    },
    {
      num: '02',
      title: 'Architect',
      desc: 'Click the map to place nodes, draw transmission links, and assign technologies from the catalog. Every change live-previews CAPEX and OPEX estimates.',
    },
    {
      num: '03',
      title: 'Parametrize',
      desc: 'Edit timeseries columns directly on the chart, apply named override groups for costs and CO₂ limits, and compose multi-scenario batches.',
    },
    {
      num: '04',
      title: 'Solve',
      desc: 'Execute the Calliope + CBC solver locally or in Docker. Logs stream live via SSE.',
    },
    {
      num: '05',
      title: 'Analyze',
      desc: 'Interactive dispatch charts, capacity breakdowns, carbon intensity timelines, and LCOE tables. Export any chart or the full result set as CSV.',
    },
  ]

  return (
    <div className="text-primary selection:bg-primary selection:text-surface-container-lowest">
      <main className="pt-16">

        {/* ── Hero ── */}
        <section className="px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Core Infrastructure
            </p>
            <h1 className="text-[3.5rem] md:text-[5rem] font-bold tracking-[-0.03em] leading-tight mb-12">
              TECHNICAL<br />CAPABILITIES
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-end">
              <p className="font-medium text-[1.125rem] leading-[1.6] text-on-surface-variant max-w-xl">
                TEMPO is an architectural-grade platform for modeling high-complexity energy systems.
                Built on rigorous mathematical foundations and served through a precision interface.
              </p>
              <div className="flex flex-col border-l border-outline-variant/30 pl-8 space-y-2">
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  v1.0.0 Stable
                </span>
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Architecture: x64 / ARM64
                </span>
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Engine: Calliope 0.6.8 + CBC Solver
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Model Builder: Node Interface ── */}
        <section className="bg-surface-container-lowest py-32 px-8 ghost-border">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16">
            {/* Left: copy */}
            <div className="lg:col-span-4">
              <div className="sticky top-32">
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">
                  account_tree
                </span>
                <h2 className="text-[2.75rem] font-bold tracking-tight leading-none mb-6">
                  MODEL BUILDER
                </h2>
                <p className="text-on-surface-variant mb-8 leading-relaxed">
                  A visual-first GIS interface for defining model topology. Click the map to place
                  location nodes, draw transmission links, and assign technology stacks — each node
                  translates directly to a Calliope <code className="text-xs bg-black/5 px-1">locations.yaml</code> entry.
                </p>
                <ul className="space-y-4">
                  {['Click-to-place node & link authoring', 'Calliope YAML export without data loss', 'Real-time CAPEX / OPEX estimation', 'Template models: Germany, Italy & more'].map(
                    (item) => (
                      <li
                        key={item}
                        className="flex items-center gap-3 text-[0.6875rem] font-bold uppercase tracking-widest"
                      >
                        <span className="material-symbols-outlined text-[1rem]">check_circle</span>
                        {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>

            {/* Right: node UI mockup */}
            <div className="lg:col-span-8">
              <div className="bg-surface ghost-border min-h-[500px] relative overflow-hidden">

                <img
                    className="absolute"
                    alt=""
                    src={model}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive GIS ── */}
        <section className="py-32 px-8 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
              <div>
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">map</span>
                <h2 className="text-[2.75rem] font-bold tracking-tight">INTERACTIVE GIS</h2>
              </div>
              <p className="max-w-md text-on-surface-variant font-medium">
                Download any national or sub-national OpenStreetMap extract via Geofabrik, push it
                into PostGIS, and overlay power lines, substations, and plants directly in the
                map canvas. Generate a mesh network and import it as model locations and links in one click.
              </p>
            </div>

            <div className="h-[600px] w-auto">
                <img
                  className="w-auto h-[600px]"
                  alt=""
                  src={InteractiveQGIS}
                />
            </div>
          </div>
        </section>

        {/* ── Result Analysis ── */}
        <section className="bg-surface-container-lowest py-32 px-8 ghost-border">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            {/* Left: full-width screenshot */}
            <div className="lg:col-span-8">
              <div className="bg-surface ghost-border min-h-[520px] relative overflow-hidden">
                <img
                  className="w-full h-auto"
                  alt="TEMPO model dashboard showing dispatch charts and location map"
                  src={Results}
                />
              </div>
            </div>

            {/* Right: sticky copy */}
            <div className="lg:col-span-4">
              <div className="sticky top-32">
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">
                  data_exploration
                </span>
                <h2 className="text-[2.75rem] font-bold tracking-tight leading-none mb-6">
                  RESULT ANALYSIS
                </h2>
                <p className="text-on-surface-variant mb-8 leading-relaxed">
                  After the solver finishes, TEMPO surfaces every key output — installed capacity,
                  hourly dispatch, carbon intensity, and system-wide LCOE — in a multi-tab dashboard
                  with interactive ECharts visualizations.
                </p>
                <ul className="space-y-4">
                  {['Energy dispatch by technology', 'Installed capacity breakdown', 'Carbon intensity timeline', 'Levelized cost of electricity (LCOE)', 'Filterable by tech group & time window'].map(
                    (item) => (
                      <li
                        key={item}
                        className="flex items-center gap-3 text-[0.6875rem] font-bold uppercase tracking-widest"
                      >
                        <span className="material-symbols-outlined text-[1rem]">check_circle</span>
                        {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Timeseries Editor ── */}
        <section className="py-32 px-8 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
              <div>
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">ssid_chart</span>
                <h2 className="text-[2.75rem] font-bold tracking-tight">TIMESERIES EDITOR</h2>
              </div>
              <p className="max-w-md text-on-surface-variant font-medium">
                Interactive per-column CSV editor. Drag data points on the chart to adjust demand
                curves or resource profiles. Supports line, bar, and scatter views with seasonal,
                monthly, and custom time windows.
              </p>
            </div>
            <div className="h-[600px] w-full bg-surface-container relative overflow-hidden">
              <img
                className="w-full h-full object-cover object-top"
                alt="TEMPO Timeseries Editor"
                src={ScreenTimeseries}
              />
            </div>
          </div>
        </section>

        {/* ── H₂ Simulation ── */}
        <section className="bg-surface-container-lowest py-32 px-8 ghost-border">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            <div className="lg:col-span-4">
              <div className="sticky top-32">
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">
                  local_gas_station
                </span>
                <h2 className="text-[2.75rem] font-bold tracking-tight leading-none mb-6">
                  H₂ PLANT<br />SIMULATION
                </h2>
                <p className="text-on-surface-variant mb-8 leading-relaxed">
                  OpenModelica-based digital twin for hydrogen power plants. Configure
                  electrolyzer stacks, compressor stages, and storage tanks — efficiency
                  and output metrics update in real time.
                </p>
                <ul className="space-y-4">
                  {['PEM & Alkaline electrolyzer models', 'H₂ compressor & storage tank', 'Pressure & temperature control', 'Real-time flow diagram', 'Energy & H₂ output charts'].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-3 text-[0.6875rem] font-bold uppercase tracking-widest">
                        <span className="material-symbols-outlined text-[1rem]">check_circle</span>
                        {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>
            <div className="lg:col-span-8">
              <div className="bg-surface ghost-border relative overflow-hidden">
                <img
                  className="w-full h-auto"
                  alt="TEMPO H₂ plant simulation dashboard"
                  src={ScreenH2}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── CCS Simulation ── */}
        <section className="py-32 px-8 bg-surface">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            <div className="lg:col-span-8">
              <div className="bg-surface ghost-border relative overflow-hidden">
                <img
                  className="w-full h-auto"
                  alt="TEMPO CCS simulation dashboard"
                  src={ScreenCCS}
                />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="sticky top-32">
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">
                  co2
                </span>
                <h2 className="text-[2.75rem] font-bold tracking-tight leading-none mb-6">
                  CCS<br />SIMULATION
                </h2>
                <p className="text-on-surface-variant mb-8 leading-relaxed">
                  Digital twin for carbon capture and storage systems. Model the full capture
                  chain — absorber, stripper, compressor — with configurable CO₂ source
                  characteristics and capture rate targets.
                </p>
                <ul className="space-y-4">
                  {['CO₂ source & absorber column', 'Stripper & solvent regeneration', 'CCS compressor chain', 'Configurable capture rate (%)', 'Energy penalty breakdown'].map(
                    (item) => (
                      <li key={item} className="flex items-center gap-3 text-[0.6875rem] font-bold uppercase tracking-widest">
                        <span className="material-symbols-outlined text-[1rem]">check_circle</span>
                        {item}
                      </li>
                    )
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Complete Feature Set ── */}
        <section className="py-32 px-8 bg-surface-container-lowest">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-[2.75rem] font-bold tracking-tight mb-4 uppercase">
              Complete Feature Set
            </h2>
            <p className="text-on-surface-variant max-w-2xl mb-16">
              Every screen in TEMPO is purpose-built around the energy modelling workflow.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[280px]">

              {/* Multi-Format Export — wide */}
              <div className="md:col-span-8 bg-black p-10 flex flex-col justify-between text-white">
                <span className="material-symbols-outlined text-3xl">output</span>
                <div>
                  <h3 className="text-2xl font-bold uppercase">Multi-Format Export</h3>
                  <p className="text-neutral-300 mt-3 max-w-md">
                    Export the full model as a structured ZIP folder ready to run with Calliope.
                    Planned adapters for PyPSA, OSeMOSYS, and AdoptNET let you run externally
                    with any solver or integration.
                  </p>
                </div>
              </div>

              {/* YAML Model Import — narrow */}
              <div className="md:col-span-4 bg-surface p-10 flex flex-col justify-center items-start">
                <span className="material-symbols-outlined text-4xl mb-4">upload_file</span>
                <h3 className="text-lg font-bold uppercase">YAML Import</h3>
                <p className="text-[0.75rem] mt-2 text-on-surface-variant">
                  Import any Calliope 0.6.x model from a ZIP archive, folder drop, or individual
                  YAML + CSV files with full recursive import resolution.
                </p>
              </div>

              {/* Override & Scenario Engine — wide */}
              <div className="md:col-span-8 bg-surface p-10 flex flex-col justify-between">
                <div>
                  <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Scenarios</span>
                  <h3 className="text-2xl font-bold uppercase mt-2">Override &amp; Scenario Engine</h3>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-6">
                    Parameterize any technology constraint through named override groups. Template
                    library covers cost, capacity, CO₂, and policy scenarios. Compose multi-run
                    batches and stream solver telemetry live.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest border border-black px-3 py-1">Cost Overrides</span>
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest border border-black px-3 py-1">CO₂ Limits</span>
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest border border-black px-3 py-1">Policy Runs</span>
                  </div>
                </div>
              </div>

              {/* Offline-First — narrow */}
              <div className="md:col-span-4 bg-surface p-10 flex flex-col justify-center items-start">
                <span className="material-symbols-outlined text-4xl mb-4">laptop_mac</span>
                <h3 className="text-lg font-bold uppercase">Offline-First Desktop</h3>
                <p className="text-[0.75rem] mt-2 text-on-surface-variant">
                  Runs entirely as an Electron app. No cloud dependency — model, optimize,
                  and analyze without an internet connection.
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* ── Engineering Workflow Deep Dive ── */}
        <section className="py-32 px-8 bg-black text-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
              <div>
                <h2 className="text-[3.5rem] font-bold tracking-tighter leading-none mb-12">
                  THE WORKFLOW
                </h2>
                <div className="space-y-12">
                  {workflowSteps.map((step) => (
                    <div key={step.num} className="flex gap-8 group">
                      <div className="text-[1.5rem] font-black text-outline opacity-30 group-hover:opacity-100 transition-opacity">
                        {step.num}
                      </div>
                      <div>
                        <h4 className="text-xl font-bold uppercase mb-2">{step.title}</h4>
                        <p className="text-on-tertiary text-sm leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Solver visual */}
              <div className="relative bg-white/5 p-12 border border-white/10 aspect-square flex flex-col justify-center items-center">
                <div className="w-full h-full border border-white/20 absolute inset-0 m-12"></div>
                <span
                  className="material-symbols-outlined text-white/20"
                  style={{ fontSize: '8rem' }}
                >
                  settings_input_component
                </span>
                <div className="mt-8 text-center">
                  <div className="text-[0.6875rem] font-bold tracking-[0.3em] uppercase opacity-50 mb-2">
                    Optimization Engine
                  </div>
                  <div className="text-2xl font-bold">CALLIOPE + CBC</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Live Runner & SSE Streaming ── */}
        <section className="py-32 px-8 bg-surface">
          <div className="max-w-7xl mx-auto flex flex-col items-center">
            <span
              className="material-symbols-outlined text-error text-4xl mb-6"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              sensors
            </span>
            <h2 className="text-[2.75rem] font-bold tracking-tight text-center mb-6">
              LIVE RUNNER
            </h2>
            <p className="text-center max-w-2xl text-on-surface-variant mb-16">
              Experience computation as it happens. Our Live Runner utilizes Server-Sent Events (SSE)
              to stream simulation results frame-by-frame to your dashboard.
            </p>

            {/* Terminal mockup */}
            <div className="w-full max-w-5xl bg-black p-4 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-[0.625rem] font-mono text-white/40">
                  calliope_service.py — 0.0.0.0:5000
                </span>
              </div>
              <div className="font-mono text-[0.75rem] text-green-400 p-4 space-y-1">
                <div>[CALLIOPE] <span className="text-white">CBC solver found on PATH ✓</span></div>
                <div>[CALLIOPE] <span className="text-white">Building model 'Imported Calliope Model'</span></div>
                <div>[CALLIOPE] <span className="text-white">Locations: 44 Technologies: 16 Links: 44</span></div>
                <div>[CALLIOPE] [OEO] <span className="text-white">Tech Database API unreachable – running with local technology data.</span></div>
                <div>[CALLIOPE] <span className="text-white">Using subset_time from model metadata: 2015-01-01 → 2015-12-31</span></div>
                <div>[CALLIOPE] <span className="text-white">subset_time: 2015-01-01 → 2015-01-06</span></div>
                <div>[CALLIOPE] [CSV] <span className="text-white">Payload timeSeries entries: 4</span></div>
                <div>[CALLIOPE] <span className="text-white">Written 4 imported CSV file(s) to model_config: export_price.csv, solar_resource.csv, demand_electricity_mean.csv, demand_heat_mean.csv</span></div>
                <div>[CALLIOPE] <span className="text-white">Generated timeseries CSV for 'ground_heat': ground_heat_resource.csv (144 hours, injected into 1 location(s))</span></div>
                <div>[CALLIOPE] <span className="text-white">Wrote techs.yaml</span></div>
                <div>[CALLIOPE] <span className="text-white">Wrote locations.yaml</span></div>
                <div>[CALLIOPE] <span className="text-white">Wrote model.yaml</span></div>

                <div>[CALLIOPE] <span className="text-white">Loading Calliope model …</span></div>
                <div>[CALLIOPE] <span className="text-white">Running optimisation with solver=cbc …</span></div>
                <div>[CALLIOPE] <span className="text-white">Optimisation finished. Extracting results …</span></div>
                <div>[CALLIOPE] <span className="text-white">Extracted transmission flow for 43 pair(s)</span></div>
                <div>[CALLIOPE] <span className="text-white">Objective value: 240068.55598877</span></div>


                <div className="animate-pulse">
                  [CALLIOPE] <span className="text-yellow-400">Loading Calliope model … #1092...</span>                                               
                </div>
                <div className="animate-pulse">
                  [CALLIOPE] <span className="text-yellow-400">Running optimisation with solver=cbc … #1092...</span>
                </div>  
                <div className="animate-pulse">
                  [CALLIOPE] <span className="text-yellow-400">Optimisation finished. Extracting results … #1092...</span>
                </div> 
                <div className="animate-pulse">
                  [CALLIOPE] <span className="text-yellow-400">Extracted transmission flow for 43 pair(s) #1092...</span>
                </div> 
                <div className="animate-pulse">
                  [CALLIOPE] <span className="text-yellow-400">Objective value: 240068.55598877 #1092...</span>
                </div> 
              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer dark />
    </div>
  )
}
