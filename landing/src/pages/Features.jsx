import Footer from '../components/Footer'
import model from '../public/img/Model.png'
import InteractiveQGIS from '../public/img/InteractiveQGIS.png'
import Results from '../public/img/Results.png'
import ScreenTimeseries from '../public/img/timeseries.png'

export default function Features() {
  const workflowSteps = [
    {
      num: '01',
      title: 'Ingest',
      desc: 'Search for a region by name and pull its grid from OpenStreetMap, load timeseries from CSV, or open an existing Calliope, PyPSA or OSeMOSYS model.',
    },
    {
      num: '02',
      title: 'Architect',
      desc: 'Click the map to place nodes, draw transmission links and assign technologies from the catalog. CAPEX and OPEX estimates update as you go.',
    },
    {
      num: '03',
      title: 'Parametrize',
      desc: 'Edit timeseries on the chart, give each substation a demand profile, and lay out scenarios year by year in Scenario Studio.',
    },
    {
      num: '04',
      title: 'Solve',
      desc: 'Run on Calliope 0.6.8 or 0.7, PyPSA, OSeMOSYS or AdOpT-NET0 on your machine, or send the job to a MEME server. Choose Plan, Operate or SPORES mode and watch the log while it runs.',
    },
    {
      num: '05',
      title: 'Analyze',
      desc: 'Dispatch charts, capacity maps with transmission lines, costs, shadow prices and SPORES alternatives. Compare runs side by side, export the figures, or ask Model Advisor what changed.',
    },
  ]

  return (
    <div className="text-primary selection:bg-primary selection:text-surface-container-lowest">
      <main className="pt-16">

        {/* Hero */}
        <section className="px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Features
            </p>
            <h1 className="text-[3.5rem] md:text-[5rem] font-bold tracking-[-0.03em] leading-tight mb-12">
              WHAT TEMPO<br />DOES
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-end">
              <p className="font-medium text-[1.125rem] leading-[1.6] text-on-surface-variant max-w-xl">
                TEMPO is a desktop app for building and solving energy system models. You do the
                modelling on a map and in forms; TEMPO writes the input files, runs the engine and
                reads the results back.
              </p>
              <div className="flex flex-col border-l border-outline-variant/30 pl-8 space-y-2">
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  v3.0.0 Stable
                </span>
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Architecture: x64 / ARM64
                </span>
                <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                  Engines: Calliope 0.6.8 / 0.7 · PyPSA · OSeMOSYS · AdOpT-NET0 · MEME (remote)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* What's New in v3 */}
        <section className="py-32 px-8 bg-black text-white">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
              <div>
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.3em] text-white/40 mb-4 block">
                  Release 3.0.0
                </span>
                <h2 className="text-[2.75rem] md:text-[3.5rem] font-bold tracking-tighter leading-none">
                  WHAT&rsquo;S NEW IN V3
                </h2>
              </div>
              <p className="max-w-md text-white/60 font-medium">
                Version 3 adds the work that comes after the first model: setting up policy
                scenarios year by year, comparing many runs, and getting maps, charts and data
                out for a report.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: 'science',
                  tag: 'Scenario Design',
                  title: 'Scenario Studio',
                  desc: 'Lay out a scenario by year on a board. Cards change demand, add CO₂ caps or renewable targets, switch technologies off, swap weather years, or add sensitivity cases and SPORES. Templates cover demand growth, carbon caps and renewable transitions. Every year runs as one batch, on any engine.',
                },
                {
                  icon: 'tune',
                  tag: 'Parameters',
                  title: 'Engine-neutral technology parameters',
                  desc: 'Enter capacity, efficiency, lifetime and CAPEX once and TEMPO translates them for each engine. The same parameter list drives the editor and the PyPSA, OSeMOSYS and AdOpT-NET0 translators. Engine-specific fields are there if you want them.',
                },
                {
                  icon: 'grid_view',
                  tag: 'Comparison',
                  title: 'Comparing many runs',
                  desc: 'Compare any runs as KPI tables, side-by-side maps, parallel coordinates or a scatter plot. A Scenario Studio batch across several models also gets a model-by-variant matrix, shaded by the KPI you pick.',
                },
                {
                  icon: 'map',
                  tag: 'Export',
                  title: 'Publication-ready map & chart export',
                  desc: 'Preview and export SVG maps of nodes and transmission, capacity, generation and technology mix, and demand choropleths. Charts and the data behind them download as CSV or JSON.',
                },
                {
                  icon: 'travel_explore',
                  tag: 'Study Area',
                  title: 'Study area from a place name',
                  desc: 'Type a city, province or country. TEMPO finds the boundary, pulls substations and lines from OpenStreetMap and builds a zonal model. Regional demand is spread over the substations, each with an hourly load shape.',
                },
                {
                  icon: 'chat',
                  tag: 'AI',
                  title: 'Model Advisor',
                  desc: 'The Model Advisor tab writes a plain-language report on a finished run and answers follow-up questions. Use your own Anthropic, Gemini, OpenAI or Groq key, or a local Ollama model. Nothing is sent until you configure it.',
                },
              ].map((item) => (
                <div key={item.title} className="bg-white/5 border border-white/10 p-10 flex flex-col justify-between min-h-[260px]">
                  <div className="flex items-center justify-between">
                    <span className="material-symbols-outlined text-3xl">{item.icon}</span>
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-white/40">{item.tag}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold uppercase mt-8 mb-3">{item.title}</h3>
                    <p className="text-white/60 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Model Builder: Node Interface */}
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
                  You build the model topology on a map. Click to place location nodes, draw
                  transmission links and assign technologies. Each node becomes a Calliope <code className="text-xs bg-black/5 px-1">locations.yaml</code> entry.
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

        {/* Interactive GIS */}
        <section className="py-32 px-8 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
              <div>
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">map</span>
                <h2 className="text-[2.75rem] font-bold tracking-tight">INTERACTIVE GIS</h2>
              </div>
              <p className="max-w-md text-on-surface-variant font-medium">
                Search for a place by name and TEMPO fetches its power lines, substations and
                plants from OpenStreetMap, filtered by voltage if you like. For larger areas you can
                load a Geofabrik extract into PostGIS instead. Either way, the network becomes model
                locations and links in one step.
              </p>
            </div>

            <div className="h-[600px] w-auto">
                <img
                  className="w-auto h-[600px]"
                  alt=""
                  src={InteractiveQGIS}
                />
            </div>
            <p className="mt-4 text-[0.6875rem] text-outline">
              Map data ©{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                OpenStreetMap contributors
              </a>
              , available under the{' '}
              <a
                href="https://opendatacommons.org/licenses/odbl/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Open Database Licence (ODbL)
              </a>
              . Geocoding via{' '}
              <a
                href="https://nominatim.openstreetmap.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Nominatim
              </a>
              {' '}under the{' '}
              <a
                href="https://operations.osmfoundation.org/policies/nominatim/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Nominatim Usage Policy
              </a>
              .
            </p>
          </div>
        </section>

        {/* Result Analysis */}
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
                  When the solver finishes, the results open in a dashboard with one tab per topic:
                  installed capacity, hourly dispatch, costs, transmission flows, shadow prices and
                  LCOE. All five engines fill the same tabs.
                </p>
                <ul className="space-y-4">
                  {['Energy dispatch by technology', 'Installed capacity breakdown', 'Carbon intensity timeline', 'Levelized cost of electricity (LCOE)', 'Filterable by tech group & time window', 'SPORES alternative plans grid', 'Multi-scenario comparison dashboard', 'Transmission links on the results map', 'Shadow prices', 'AI-written run report'].map(
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

        {/* Timeseries Editor */}
        <section className="py-32 px-8 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
              <div>
                <span className="material-symbols-outlined text-primary text-4xl mb-6 block">ssid_chart</span>
                <h2 className="text-[2.75rem] font-bold tracking-tight">TIMESERIES EDITOR</h2>
              </div>
              <p className="max-w-md text-on-surface-variant font-medium">
                Edit CSV timeseries one column at a time. Drag points on the chart to reshape a demand
                curve or resource profile, and switch between line, bar and scatter views by season,
                month or a window you pick.
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

        {/* Complete Feature Set */}
        <section className="py-32 px-8 bg-surface-container-lowest">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-[2.75rem] font-bold tracking-tight mb-4 uppercase">
              Complete Feature Set
            </h2>
            <p className="text-on-surface-variant max-w-2xl mb-16">
              The rest of what TEMPO can do, in one place.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[280px]">

              {/* Multi-Format Export — wide */}
              <div className="md:col-span-8 bg-black p-10 flex flex-col justify-between text-white">
                <span className="material-symbols-outlined text-3xl">output</span>
                <div>
                  <h3 className="text-2xl font-bold uppercase">Multi-Framework Export</h3>
                  <p className="text-neutral-300 mt-3 max-w-md">
                    Export a model as a Calliope ZIP archive or in the input format of PyPSA,
                    OSeMOSYS or AdOpT-NET0, so you can keep working on it outside TEMPO.
                  </p>
                </div>
              </div>

              {/* YAML Model Import — narrow */}
              <div className="md:col-span-4 bg-surface p-10 flex flex-col justify-center items-start">
                <span className="material-symbols-outlined text-4xl mb-4">upload_file</span>
                <h3 className="text-lg font-bold uppercase">Model Import</h3>
                <p className="text-[0.75rem] mt-2 text-on-surface-variant">
                  Open Calliope 0.6 or 0.7 YAML, PyPSA netCDF or CSV, or an OSeMOSYS otoole
                  dataset. TEMPO detects the format from the files in the archive.
                </p>
              </div>

              {/* SPORES — wide */}
              <div className="md:col-span-8 bg-surface p-10 flex flex-col justify-between">
                <div>
                  <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Near-optimal Diversity</span>
                  <h3 className="text-2xl font-bold uppercase mt-2">SPORES Mode</h3>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-6">
                    Ask for N near-optimal alternatives that stay within a cost margin you set
                    but differ as much as possible in where things get built. A single optimum
                    hides these options; SPORES lists them.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest border border-black px-3 py-1">Cost Slack %</span>
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest border border-black px-3 py-1">N Alternatives</span>
                    <span className="text-[0.6875rem] font-bold uppercase tracking-widest border border-black px-3 py-1">0.6.8 local · 0.7 via MEME</span>
                  </div>
                </div>
              </div>

              {/* Scenario Comparison — narrow */}
              <div className="md:col-span-4 bg-surface p-10 flex flex-col justify-center items-start">
                <span className="material-symbols-outlined text-4xl mb-4">compare</span>
                <h3 className="text-lg font-bold uppercase">Scenario Comparison</h3>
                <p className="text-[0.75rem] mt-2 text-on-surface-variant">
                  Pick any finished runs and compare their KPIs, capacity mixes and dispatch
                  profiles side by side.
                </p>
              </div>

              {/* Override & Scenario Engine — wide */}
              <div className="md:col-span-8 bg-surface p-10 flex flex-col justify-between">
                <div>
                  <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Scenarios</span>
                  <h3 className="text-2xl font-bold uppercase mt-2">Overrides &amp; Scenario Studio</h3>
                </div>
                <div>
                  <p className="text-on-surface-variant mb-6">
                    Group changes to any technology constraint under a name and switch them on per
                    run. For whole studies, Scenario Studio builds the changes from cards laid out
                    by year and runs every variant as one batch.
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
                <h3 className="text-lg font-bold uppercase">Local First</h3>
                <p className="text-[0.75rem] mt-2 text-on-surface-variant">
                  Models live in a local database and solve on your machine. You only need a
                  connection for map data, AI analysis and remote runs.
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* Engineering Workflow Deep Dive */}
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
                  <div className="text-2xl font-bold">5 ENGINES + MEME</div>
                  <div className="text-xs text-white/40 mt-1 font-medium tracking-widest uppercase">Calliope 0.6.8 · 0.7 · PyPSA · OSeMOSYS · AdOpT-NET0</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Runner & SSE Streaming */}
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
              The solver log streams into the app while the model runs, so you can see whether it
              is still building, solving or has stopped on an error. Remote MEME runs show the same
              log, refreshed every couple of seconds.
            </p>

            {/* Terminal mockup */}
            <div className="w-full max-w-5xl bg-black p-4 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-[0.625rem] font-mono text-white/40">
                  calliope_service.py · 0.0.0.0:5000 · 0.7 engine · 0.0.0.0:5002
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
