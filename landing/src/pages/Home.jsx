import { HeroSection } from '../components/ui/HeroSection'
import { ImageComparison } from '../components/ui/ImageComparison'
import { ShadowOverlay } from '../components/ui/ShadowOverlay'
import { DottedSurface } from '../components/ui/DottedSurface'
import Footer from '../components/Footer'
import logo from '../public/img/Logo_TEMPO.PNG'
import Hero from '../public/img/Hero.png'
import BeforeImg from '../public/img/Old.png'
import AfterImg from '../public/img/New.png'
import LogoH2IN from '../public/img/H2IN.jpg'
import LogoREDRES from '../public/img/REDRES.png'
import LogoH2V from '../public/img/H2V.png'
import LogoTHD from '../public/img/THD.svg'

const GITHUB = 'https://github.com/THD-Spatial-AI/TEMPO'
const RELEASES = 'https://github.com/THD-Spatial-AI/TEMPO/releases'

const DOWNLOADS = [
  {
    label: 'Download for Windows',
    sub: 'v3.0.0 · .exe · 221 MB',
    icon: 'desktop_windows',
    href: `${RELEASES}/download/v3.0.0/TEMPO.Setup.3.0.0.exe`,
  },
  {
    label: 'Download for Linux',
    sub: 'v3.0.0 · .AppImage · 253 MB',
    icon: 'terminal',
    href: `${RELEASES}/download/v3.0.0/TEMPO-3.0.0.AppImage`,
  },
]

const CONTACTS = [
  { label: 'https://github.com/THD-Spatial-AI/TEMPO', icon: 'github', href: GITHUB, external: true },
  { label: 'ricardo.miranda-castillo@th-deg.de', icon: 'email', href: 'mailto:ricardo.miranda-castillo@th-deg.de' },
  { label: 'www.th-deg.de', icon: 'website', href: 'https://www.th-deg.de', external: true },
  { label: 'Deggendorf, Bavaria', icon: 'address', href: 'https://maps.google.com/?q=TH+Deggendorf', external: true },
]

const CONTRIBUTE_STEPS = [
  {
    num: '01',
    title: 'Fork & Clone',
    desc: 'Fork the repository on GitHub and clone it. Everything lives in one repo: the React frontend, the Go backend, the Python engine services and the OSM processing scripts.',
    code: 'git clone https://github.com/THD-Spatial-AI/TEMPO.git',
  },
  {
    num: '02',
    title: 'Install',
    desc: 'You need Node.js 16+, Go 1.21+ and Python 3.9 to 3.11 (Calliope 0.6.8 does not run on 3.12). make install fetches the npm packages, builds the Go binary and creates every Python environment.',
    code: 'make install',
  },
  {
    num: '03',
    title: 'Run Locally',
    desc: 'make dev starts the Vite dev server and the Go backend on localhost:5173. Use npm run dev:electron when you want the full desktop app with the engines attached.',
    code: 'make dev  |  npm run dev:electron',
  },
  {
    num: '04',
    title: 'Open a Pull Request',
    desc: 'Work on a feature branch, use conventional commit messages, and open a PR against main. A maintainer will review it.',
    code: 'git checkout -b feat/my-feature  &&  git push origin feat/my-feature',
  },
]

export default function Home() {
  const workflowSteps = [
    { icon: 'database', step: '01. Bring data in', desc: 'Search a region by name and pull its grid from OpenStreetMap, or open an existing Calliope, PyPSA or OSeMOSYS model.' },
    { icon: 'architecture', step: '02. Build', desc: 'Place nodes and links on the map, then give each node technologies from the catalog.' },
    { icon: 'memory', step: '03. Solve', desc: 'Run it on your own machine with one of five engines, or send it to a remote server.' },
    { icon: 'analytics', step: '04. Read results', desc: 'Maps, dispatch, costs and flows for every run, and an optional written summary.' },
  ]

  const whatsNew = [
    {
      icon: 'science',
      title: 'Scenario Studio',
      desc: 'Lay out a scenario year by year on a board, with cards for demand, CO₂ caps, technology changes, sensitivity cases and SPORES. Start from a template (demand growth, carbon cap, renewable transition) or a blank timeline, and run every year as one batch.',
    },
    {
      icon: 'schema',
      title: 'Five engines, one results view',
      desc: 'Calliope 0.6.8, Calliope 0.7, PyPSA, OSeMOSYS and AdOpT-NET0, each in its own Python environment. They all hand back results in the same shape, so you read a PyPSA run the same way you read a Calliope one.',
    },
    {
      icon: 'tune',
      title: 'Enter parameters once',
      desc: 'Capacity, efficiency, lifetime and CAPEX are entered once and translated for each engine. Engine-specific fields are still there when you need them.',
    },
    {
      icon: 'travel_explore',
      title: 'Study area from a place name',
      desc: 'Type a city, province or country. TEMPO finds its boundary, pulls substations and power lines from OpenStreetMap and turns them into a zonal model you can edit.',
    },
    {
      icon: 'electric_meter',
      title: 'Demand for every substation',
      desc: 'Spread a regional demand figure across substations, evenly or weighted by voltage, and give each one an hourly load shape. Install demandlib and you also get the BDEW standard load profiles.',
    },
    {
      icon: 'chat',
      title: 'Ask questions about a run',
      desc: 'The Model Advisor tab writes a report on a finished run and answers follow-up questions. You bring your own key (Anthropic, Gemini, OpenAI, Groq) or point it at a local Ollama model.',
    },
    {
      icon: 'cloud_upload',
      title: 'Remote runs',
      desc: 'When a model is too big for your laptop, send a PyPSA, Calliope 0.7 or AdOpT-NET0 run to a MEME server. The results come back in the same format as a local run.',
    },
    {
      icon: 'difference',
      title: 'SPORES',
      desc: 'Ask for a set of near-optimal alternatives inside a cost margin you set, and see how differently the same system could be built. Local on Calliope 0.6.8, remote on 0.7.',
    },
    {
      icon: 'swap_horiz',
      title: 'Open models from other tools',
      desc: 'Drop in a Calliope 0.6 or 0.7 YAML model, a PyPSA netCDF or CSV folder, or an OSeMOSYS otoole dataset. TEMPO reads the archive and works out which one it is.',
    },
    {
      icon: 'map',
      title: 'Figures for your paper',
      desc: 'Export node and transmission maps, capacity and generation maps and demand choropleths as SVG, with the data behind them as CSV or JSON.',
    },
    {
      icon: 'grid_view',
      title: 'Compare many runs',
      desc: 'Put runs side by side as KPI tables, maps, parallel coordinates or a scatter plot. A batch across several models gets a matrix shaded by the KPI you pick.',
    },
    {
      icon: 'laptop_mac',
      title: 'Your models stay on your machine',
      desc: 'TEMPO is a desktop app with a local database. No account, no upload. Model Advisor and remote runs are the only features that send data out, and both are off until you set them up.',
    },
  ]

  const features = [
    { icon: 'account_tree', title: 'Map-based builder', desc: 'Click to place locations, draw links between them and attach technologies. The model is written out as Calliope YAML with nothing lost on the way.' },
    { icon: 'library_books', title: 'Technology catalog', desc: 'Generation, storage, conversion and transmission technologies with costs and efficiencies from OpenTech-DB, aligned with the Open Energy Ontology.' },
    { icon: 'ssid_chart', title: 'Timeseries editor', desc: 'Edit demand and resource profiles column by column. Drag points on the chart, or zoom to a season, a month or a custom window.' },
    { icon: 'layers', title: 'Overrides', desc: 'Group changes to costs, capacities or CO₂ limits under a name and switch them on per run.' },
    { icon: 'data_exploration', title: 'Results dashboard', desc: 'Capacities, hourly dispatch, costs by technology and location, transmission flows, shadow prices and LCOE, each on its own tab.' },
    { icon: 'sensors', title: 'Live solver log', desc: 'Watch the solver log while the model runs, so you know whether it is building, solving or stuck.' },
  ]

  const techStack = [
    { label: 'Engines', value: 'Calliope 0.6.8 / 0.7 · PyPSA · OSeMOSYS · AdOpT-NET0' },
    { label: 'Solvers', value: 'HiGHS · CBC · GLPK' },
    { label: 'Desktop', value: 'Electron / Vite' },
    { label: 'Backend', value: 'Go + FastAPI' },
    { label: 'Frontend', value: 'React 19 / MapLibre' },
    { label: 'Storage', value: 'SQLite / PostGIS' },
  ]

  return (
    <div className="bg-surface text-primary selection:bg-primary selection:text-on-primary grid-bg">
      <main className="pt-16">

        {/* Hero */}
        <HeroSection
          className="min-h-[calc(100vh-4rem)]"
          logo={{ url: logo, alt: 'TEMPO logo', text: 'TEMPO' }}
          slogan="Tool for Energy Model Planning and Optimization"
          title={<>Energy system models,<br /><span className="text-primary"> built on a map.</span></>}
          subtitle="Draw your region, pick the technologies and run it on Calliope, PyPSA, OSeMOSYS or AdOpT-NET0. No hand-written YAML."
          downloads={DOWNLOADS}
          contacts={CONTACTS}
          institution={{ logo: LogoTHD, name: 'TH Deggendorf', group: 'BigGeoData & Spatial AI Research Group' }}
          partners={[
            { logo: LogoH2IN, name: 'H2.in', href: 'https://h2in.cl/' },
            { logo: LogoREDRES, name: 'RED-RES-H2' },
            { logo: LogoH2V, name: 'H2V+' },

          ]}
          backgroundImage={Hero}
        />

        {/* The Workflow */}
        <section className="py-32 px-8 bg-black text-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-0">
              {workflowSteps.map((item, i) => (
                <div key={i} className="flex flex-col items-center text-center px-8 border-r border-white/10 last:border-0">
                  <div className="w-12 h-12 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                  </div>
                  <h3 className="font-bold uppercase text-[10px] tracking-[0.3em] mb-3">{item.step}</h3>
                  <p className="text-[13px] text-neutral-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What's New */}
        <section className="py-24 px-8 bg-neutral-50 border-y border-neutral-200" id="changelog">
          <div className="max-w-7xl mx-auto">
            <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div>
                <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400 mb-2 block">
                  TEMPO 3
                </span>
                <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">
                  What's New
                </h2>
              </div>
              <p className="text-sm text-neutral-500 max-w-md">
                Version 3 is mostly about what happens after the first model works: running
                many scenarios, comparing them, and getting figures out for a report.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200">
              {whatsNew.map((item) => (
                <div key={item.title} className="bg-white p-8 flex flex-col gap-4">
                  <span className="material-symbols-outlined text-xl text-black">{item.icon}</span>
                  <div>
                    <h4 className="font-black text-[0.875rem] uppercase tracking-tight mb-2">{item.title}</h4>
                    <p className="text-[13px] text-neutral-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* From Raw Data to Structured Model */}
        <section className="border-y border-neutral-200 bg-white" id="comparison">
        <DottedSurface dotColor={0x000000} style={{ width: '100%' }}>
          <div className="py-32 px-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div>
                <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400">
                  Before vs After
                </span>
                <h2 className="text-4xl font-black mt-4 tracking-tighter uppercase leading-none">
                  From Raw Data<br />to Optimized Model.
                </h2>
              </div>
              <p className="text-sm text-neutral-500 max-w-sm">
                Drag the slider. On the left, raw OpenStreetMap power infrastructure as you would
                download it. On the right, the same region as a TEMPO model ready to solve.
              </p>
            </div>

            <ImageComparison
              beforeImage={BeforeImg}
              afterImage={AfterImg}
              altBefore="Raw OSM Infrastructure"
              altAfter="TEMPO Model Dashboard"
            />

            {/* Caption row */}
            <div className="mt-0 grid grid-cols-2 border-l border-r border-b border-neutral-200">
              <div className="px-8 py-5 border-r border-neutral-200 flex items-center gap-4 bg-white">
                <span className="material-symbols-outlined text-lg text-neutral-400">layers</span>
                <div>
                  <p className="font-black text-[10px] uppercase tracking-widest">Before</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Thousands of OSM power lines, plants and substations, plus cost and constraint
                    data kept somewhere else, all to be sorted by hand.
                  </p>
                </div>
              </div>
              <div className="px-8 py-5 flex items-center gap-4 bg-white">
                <span className="material-symbols-outlined text-lg text-black">bolt</span>
                <div>
                  <p className="font-black text-[10px] uppercase tracking-widest">After</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    A TEMPO model with its topology, technologies and CAPEX/OPEX estimates in
                    one place, ready to run.
                  </p>
                </div>
              </div>
            </div>
          </div>
          </div>
        </DottedSurface>
        </section>

        {/* About the Project */}
        <section className="py-32 px-8" id="about">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
              <div>
                <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400">
                  About the Project
                </span>
                <h2 className="text-4xl font-black mt-4 mb-8 tracking-tighter uppercase leading-none">
                  Developed at TH Deggendorf
                </h2>
                <p className="text-[0.9375rem] text-neutral-500 leading-relaxed mb-6">
                  TEMPO is built by the <strong className="text-black">Research Group for BigGeoData & Spatial AI</strong> at
                  the <strong className="text-black">Technische Hochschule Deggendorf</strong> (THD). The aim is to get a
                  region from raw map data to a model you can solve, without the manual cleanup and
                  configuration work in between. TEMPO joins open geographic data from OpenStreetMap
                  with established open-source modelling frameworks:{' '}
                  <a href="https://callio.pe" target="_blank" rel="noopener noreferrer"><strong className="text-black">Calliope</strong></a>,{' '}
                  <a href="https://pypsa.org" target="_blank" rel="noopener noreferrer"><strong className="text-black">PyPSA</strong></a>,{' '}
                  <a href="https://osemosys.org" target="_blank" rel="noopener noreferrer"><strong className="text-black">OSeMOSYS</strong></a> and{' '}
                  <a href="https://github.com/UU-ER/AdOpT-NET0" target="_blank" rel="noopener noreferrer"><strong className="text-black">AdOpT-NET0</strong></a>.
                </p>
                <p className="text-[0.9375rem] text-neutral-500 leading-relaxed mb-10">
                  It is meant for researchers, students and practitioners who model regional or national
                  systems with many nodes and would rather not spend their time on YAML files and
                  command-line setup.
                </p>
                <div className="border-l-4 border-black pl-8 space-y-3">
                  {[
                    { label: 'Institution', value: 'Technische Hochschule Deggendorf (THD)' },
                    { label: 'Research Group', value: 'Research Group for BigGeoData & Spatial AI' },
                    { label: 'Location', value: 'Deggendorf, Bavaria, Germany' },
                    { label: 'Website', value: 'www.th-deg.de', href: 'https://www.th-deg.de' },
                    { label: 'License', value: 'MIT, open source' },
                    { label: 'First Release', value: '2026' },
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                      <span className="font-bold text-[10px] uppercase tracking-widest text-neutral-400 min-w-[110px] flex-shrink-0">
                        {row.label}
                      </span>
                      {row.href ? (
                        <a href={row.href} target="_blank" rel="noopener noreferrer"
                          className="text-[0.8125rem] text-black underline hover:opacity-70">
                          {row.value}
                        </a>
                      ) : (
                        <span className="text-[0.8125rem] text-black">{row.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-neutral-200 border border-neutral-200 self-start">
                {[
                  { icon: 'bolt', label: 'Engines', value: '5 local + remote', sub: 'HiGHS, CBC and GLPK solvers' },
                  { icon: 'map', label: 'Map data', value: 'OpenStreetMap', sub: 'PostGIS + GeoServer optional' },
                  { icon: 'desktop_windows', label: 'Platforms', value: 'Windows + Linux', sub: 'Electron desktop app' },
                  { icon: 'code', label: 'Tech Stack', value: 'React + Go + Python', sub: 'Vite + FastAPI + SQLite' },
                  { icon: 'public', label: 'Coverage', value: 'Worldwide', sub: 'Any region OSM has mapped' },
                  { icon: 'account_balance', label: 'Cost', value: 'Free', sub: 'MIT licence' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white p-8">
                    <span className="material-symbols-outlined text-xl mb-4 block text-black">{stat.icon}</span>
                    <p className="font-bold text-[10px] uppercase tracking-widest text-neutral-400 mb-1">{stat.label}</p>
                    <p className="font-black text-[0.9375rem] uppercase tracking-tight">{stat.value}</p>
                    <p className="text-[11px] text-neutral-400 mt-1">{stat.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Projects & Partners */}
        <section className="py-24 px-8 bg-neutral-50 border-y border-neutral-200" id="projects">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400 mb-2 block">
                Research &amp; Industry Projects
              </span>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none mb-4">
                Where TEMPO Is Used
              </h2>
              <p className="text-lg text-neutral-500 max-w-3xl">
                These funded projects use TEMPO for their energy models. Most of them deal with
                green hydrogen and renewable planning in Chile.
              </p>
            </div>

            {/* Project cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">

              {/* H2.in */}
              <div className="bg-white border border-neutral-200 p-8 flex flex-col gap-5">
                <div className="h-16 flex items-center">
                  <img src={LogoH2IN} alt="H2.in project logo" className="h-12 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight uppercase mb-2">H2 In</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    A multidisciplinary research project on the green hydrogen value chain. It looks at
                    which technologies fit each stage of the chain, makes public policy recommendations
                    and trains researchers in the field, working with partners in Germany.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-auto">
                  {['Hydrogen', 'Chile', 'Infrastructure'].map(t => (
                    <span key={t} className="border border-neutral-300 text-[10px] font-bold tracking-widest uppercase px-2 py-1">{t}</span>
                  ))}
                </div>
                <a href="https://h2in.cl/" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity mt-2 inline-block">
                      www.h2in.cl →
                    </a>
              </div>

              {/* RED-RES-H2 */}
              <div className="bg-white border border-neutral-200 p-8 flex flex-col gap-5">
                <div className="h-16 flex items-center">
                  <img src={LogoREDRES} alt="RED-RES-H2 project logo" className="h-14 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight uppercase mb-2">RED-RES-H2</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    Reducing the risk that extreme droughts pose to the Chilean power system, using
                    optimal shares of variable renewables together with green hydrogen storage.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-auto">
                  {['Renewables', 'Sector Coupling', 'Cross-border', 'Germany', 'Chile'].map(t => (
                    <span key={t} className="border border-neutral-300 text-[10px] font-bold tracking-widest uppercase px-2 py-1">{t}</span>
                  ))}
                </div>
                <a href="https://zaf.th-deg.de/public/project/fact-sheet/363" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity mt-2 inline-block">
                      Project fact sheet →
                    </a>
              </div>

              {/* H2V+ */}
              <div className="bg-white border border-neutral-200 p-8 flex flex-col gap-5">
                <div className="h-16 flex items-center">
                  <img src={LogoH2V} alt="H2V+ project logo" className="h-14 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight uppercase mb-2">H2V+ Valparaíso</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    An interactive green hydrogen platform for the Valparaíso Region, supporting the
                    region's move to clean energy.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-auto">
                  {['Chile', 'Green H₂', 'Solar'].map(t => (
                    <span key={t} className="border border-neutral-300 text-[10px] font-bold tracking-widest uppercase px-2 py-1">{t}</span>
                  ))}
                </div>
                <a href="https://hidrogenoverdevalpo.cl/" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity mt-2 inline-block">
                      www.hidrogenoverdevalpo.cl →
                    </a>
              </div>
            </div>

            {/* Developed by: institution row */}
            <div className="border border-neutral-200 bg-white p-8">
              <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-neutral-400 mb-6">Developed by</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">

                {/* THD */}
                <div className="flex items-start gap-5">
                  <img src={LogoTHD} alt="THD logo" className="h-14 w-auto object-contain shrink-0" />
                  <div>
                    <p className="font-black text-sm tracking-tight">Technische Hochschule Deggendorf</p>
                    <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                      University of Applied Sciences in Deggendorf, Bavaria, Germany.
                      Faculty of Applied Computer Science and Applied Natural Sciences.
                    </p>
                    <a href="https://www.th-deg.de" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity mt-2 inline-block">
                      www.th-deg.de →
                    </a>
                  </div>
                </div>

                {/* GeoSpatialAI */}
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 border border-neutral-200 flex items-center justify-center bg-neutral-50 shrink-0">
                    <span className="text-[10px] font-black tracking-tighter text-neutral-700 text-center leading-tight">GEO<br/>SPATIAL<br/>AI</span>
                  </div>
                  <div>
                    <p className="font-black text-sm tracking-tight">Research Group for BigGeoData & Spatial AI of the THD</p>
                    <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                      Applied research group at THD working on spatial data science, GIS-based energy
                      system modelling and land-use analysis with AI.
                    </p>
                    <a href="https://github.com/THD-Spatial-AI" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity mt-2 inline-block">
                      GitHub →
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* Core Features */}
        <section className="py-32 px-8 overflow-hidden" id="features" style={{ position: 'relative' }}>
          {/* Animated shadow background */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <ShadowOverlay
              color="rgba(0, 0, 0, 0.85)"
              animation={{ scale: 100, speed: 90 }}
              noise={{ opacity: 1, scale: 1.2 }}
              sizing="fill"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <div className="max-w-7xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
            <div className="mb-20 flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div className="max-w-2xl">
                <span className="font-black text-[10px] tracking-[0.4em] uppercase text-black">
                  The Basics
                </span>
                <h2 className="text-5xl font-black mt-4 tracking-tighter text-black">The parts you use every day.</h2>
              </div>
              <p className="text-sm text-black max-w-sm">
                Everything in TEMPO 3 sits on top of these. They are where most of the
                modelling time goes.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200">
              {features.map((f, i) => (
                <div key={i} className="p-12 bg-white hover:bg-neutral-50 transition-colors">
                  <span className="material-symbols-outlined text-2xl mb-8 text-black block">{f.icon}</span>
                  <h4 className="text-sm font-bold mb-4 uppercase tracking-widest">{f.title}</h4>
                  <p className="text-[13px] text-neutral-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="py-32 px-8 bg-neutral-50 border-y border-neutral-200" id="tech">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <span className="font-black text-[10px] tracking-[0.4em] uppercase text-neutral-400">
                Under the Hood
              </span>
              <h2 className="text-3xl font-black mt-4 tracking-tighter uppercase">What It's Built On</h2>
            </div>
            <div className="flex flex-wrap justify-center gap-px bg-neutral-200 border border-neutral-200 max-w-4xl mx-auto">
              {techStack.map((s, i) => (
                <div key={i} className="flex-1 min-w-[150px] px-8 py-8 bg-white flex flex-col items-center gap-4 text-center">
                  <span className="font-bold text-[10px] uppercase tracking-widest">{s.label}</span>
                  <span className="text-[12px] text-neutral-500">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* OpenTech-DB */}
        <section className="py-32 px-8 bg-surface border-y border-neutral-200" id="opentech-db">
          <div className="max-w-7xl mx-auto">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
              <div>
                <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400 mb-2 block">
                  Where the Technology Data Comes From
                </span>
                <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">
                  OpenTech-DB
                </h2>
                <p className="mt-4 text-[0.9375rem] text-neutral-500 max-w-2xl leading-relaxed">
                  The CAPEX, OPEX, efficiency and capacity values in TEMPO's catalog come from
                  OpenTech-DB, our open database of energy technologies. It follows the{' '}
                  <strong className="text-black">Open Energy Ontology</strong>, has a REST API, and can hand its
                  data straight to Calliope, PyPSA and AdOpT-NET0 models. Other projects use it too.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 flex-shrink-0">
                <a
                  href="https://mygit.th-deg.de/thd-spatial-ai/opentech-db"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-black text-white px-6 py-3 font-black uppercase text-[11px] tracking-widest hover:bg-neutral-800 transition-all"
                >
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  View Repository
                </a>
                <a
                  href="https://mygit.th-deg.de/thd-spatial-ai/opentech-db/-/blob/main/docs/api-reference.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-black text-black px-6 py-3 font-black uppercase text-[11px] tracking-widest hover:bg-black hover:text-white transition-all"
                >
                  <span className="material-symbols-outlined text-base">api</span>
                  API Reference
                </a>
              </div>
            </div>

            {/* 4 tech category cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200 mb-px">
              {[
                {
                  icon: 'bolt',
                  category: 'Generation',
                  count: '19 technologies',
                  examples: 'Solar PV · Onshore Wind · Offshore Wind · CCGT · Nuclear · CSP · Hydro · Biomass · SMR',
                },
                {
                  icon: 'battery_charging_full',
                  category: 'Storage',
                  count: '12 technologies',
                  examples: 'Li-ion BESS · Redox Flow · Pumped Hydro · CAES · LAES · H₂ Tanks · Thermal Storage',
                },
                {
                  icon: 'conversion_path',
                  category: 'Conversion',
                  count: '15 technologies',
                  examples: 'Electrolyzers (AWE/PEM/SOEC) · Heat Pumps · CHP · DAC · Methanation · Fischer-Tropsch',
                },
                {
                  icon: 'cable',
                  category: 'Transmission',
                  count: '9 technologies',
                  examples: 'HVAC/HVDC Lines · Cables · Transformers · Gas/H₂/CO₂ Pipelines · District Heating',
                },
              ].map((cat) => (
                <div key={cat.category} className="bg-white p-10">
                  <span className="material-symbols-outlined text-2xl mb-6 block text-black">{cat.icon}</span>
                  <p className="font-black text-[0.9375rem] uppercase tracking-tight mb-1">{cat.category}</p>
                  <p className="font-bold text-[10px] uppercase tracking-widest text-neutral-400 mb-4">{cat.count}</p>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">{cat.examples}</p>
                </div>
              ))}
            </div>

            {/* Capabilities row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 mb-16">
              {[
                {
                  icon: 'schedule',
                  title: 'Time-Series Profiles',
                  desc: '28 capacity factor and load profiles for DE, FR, UK, ES, IT, NO, DK and AT: solar, wind, hydro, and industrial and residential demand, with 2019 as the base year.',
                },
                {
                  icon: 'sync_alt',
                  title: 'Framework Adapters',
                  desc: 'Get technologies as a Calliope techs: block, as PyPSA component dicts or as OSeMOSYS parameter tables, straight from the API.',
                },
                {
                  icon: 'manage_search',
                  title: 'REST API + Web UI',
                  desc: 'Browse by category, fetch instances and look up CAPEX, OPEX or efficiency by technology ID. Swagger UI at /docs, ReDoc at /redoc, React frontend at :5173.',
                },
              ].map((cap) => (
                <div key={cap.title} className="bg-white p-10">
                  <span className="material-symbols-outlined text-xl mb-5 block text-black">{cap.icon}</span>
                  <h4 className="font-black text-[0.8125rem] uppercase tracking-widest mb-3">{cap.title}</h4>
                  <p className="text-[12px] text-neutral-500 leading-relaxed">{cap.desc}</p>
                </div>
              ))}
            </div>

            {/* Code snippet */}
            <div className="border border-neutral-200">
              <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-200 bg-neutral-50">
                <span className="font-bold text-[10px] uppercase tracking-widest text-neutral-400">
                  Example: Calliope export over REST
                </span>
                <span className="font-bold text-[10px] uppercase tracking-widest text-neutral-400">curl</span>
              </div>
              <pre className="px-6 py-6 text-[0.75rem] leading-relaxed overflow-x-auto bg-white text-black font-mono">
{`BASE="http://localhost:8000/api/v1"

# Export all generation technologies as a Calliope techs: block
curl "$BASE/technologies/calliope?category=generation"

# Get onshore wind with all instances (CAPEX, OPEX, capacity, efficiency)
curl "$BASE/technologies/onshore_wind/instances"

# PyPSA-ready dict for CCGT, 7 % discount rate
curl "$BASE/adapt/pypsa/ccgt?instance_index=0&discount_rate=0.07"`}
              </pre>
            </div>

            {/* Bottom note */}
            <p className="mt-8 text-[11px] text-neutral-400 leading-relaxed">
              Data and documentation are released under{' '}
              <strong className="text-black">CC BY 4.0</strong>. Terms follow the{' '}
              <a href="https://openenergy-platform.org/ontology/oeo/" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-black">Open Energy Ontology (OEO)</a>{' '}
              so the same technology means the same thing in every framework.
            </p>
          </div>
        </section>

        {/* Open Source / Contribute */}
        <section className="py-32 px-8 bg-black text-white" id="contribute">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
              <div>
                <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-white/40 mb-2 block">
                  Free &amp; Open Source
                </span>
                <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">
                  Contribute to TEMPO
                </h2>
              </div>
              <div className="flex flex-wrap gap-4">
                <a href={GITHUB} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-white text-black px-6 py-3 font-black uppercase text-[11px] tracking-widest hover:bg-neutral-200 transition-all">
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  View on GitHub
                </a>
                <a href={`${GITHUB}/issues`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-white/30 text-white px-6 py-3 font-black uppercase text-[11px] tracking-widest hover:bg-white/10 transition-all">
                  <span className="material-symbols-outlined text-base">bug_report</span>
                  Report an Issue
                </a>
                <a href={`${GITHUB}/discussions`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-white/30 text-white px-6 py-3 font-black uppercase text-[11px] tracking-widest hover:bg-white/10 transition-all">
                  <span className="material-symbols-outlined text-base">forum</span>
                  Discussions
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 border border-white/10 mb-16">
              <div className="lg:col-span-2 p-10 border-b lg:border-b-0 lg:border-r border-white/10">
                <p className="text-[0.9375rem] text-white/70 leading-relaxed">
                  TEMPO is released under the <strong className="text-white">MIT License</strong>. You can use,
                  change and redistribute it for any purpose, commercial work included, as long as you keep
                  the copyright notice. Pull requests, bug reports and ideas are all welcome, and the
                  THD-Spatial team reviews every one.
                </p>
              </div>
              <div className="p-10 flex flex-col justify-center items-center text-center gap-4">
                <div className="border-2 border-white px-6 py-3 font-black text-xl uppercase tracking-widest">
                  MIT LICENSE
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                  Copyright 2026 THD-Spatial
                </p>
              </div>
            </div>

            <div className="border border-white/10">
              {CONTRIBUTE_STEPS.map((step) => (
                <div key={step.num} className="flex flex-col sm:flex-row border-b border-white/10 last:border-0">
                  <div className="sm:w-24 flex-shrink-0 p-6 sm:p-10 flex sm:items-start">
                    <span className="text-[2rem] font-black text-white/15 leading-none">{step.num}</span>
                  </div>
                  <div className="flex-1 p-6 sm:p-10 sm:pl-0 border-l border-white/10">
                    <h4 className="font-black text-[0.9375rem] uppercase tracking-wider mb-3">{step.title}</h4>
                    <p className="text-[0.8125rem] text-white/60 leading-relaxed mb-4">{step.desc}</p>
                    <code className="block bg-white/5 border border-white/10 px-4 py-3 font-mono text-[0.75rem] text-green-400 break-all">
                      {step.code}
                    </code>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-10 border-t border-white/10">
              <p className="text-[0.8125rem] text-white/50 max-w-xl">
                Contributors follow the project's{' '}
                <a href="/code-of-conduct" className="text-white underline hover:opacity-80">
                  Code of Conduct
                </a>
                {' '}(Contributor Covenant 3.0).
              </p>
              <a
                href={`${GITHUB}/blob/main/CONTRIBUTING.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap border border-white/30 px-6 py-3 font-black uppercase text-[11px] tracking-widest text-white hover:bg-white/10 transition-all"
              >
                CONTRIBUTING.md
              </a>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-32 px-8 bg-white overflow-hidden relative">
          <div className="absolute inset-0 grid-bg opacity-10"></div>
          <div className="max-w-4xl mx-auto text-center space-y-12 relative z-10">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight">
              Try it on your own region.
            </h2>
            <div className="flex flex-col items-center gap-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 w-full max-w-xl bg-black p-1">
                <a
                  href={DOWNLOADS[0].href}
                  className="flex-1 flex flex-col items-center justify-center bg-white hover:bg-neutral-50 text-black py-5 px-8 transition-all"
                >
                  <span className="material-symbols-outlined text-2xl mb-1">desktop_windows</span>
                  <span className="font-black uppercase text-[11px] tracking-widest">Windows</span>
                  <span className="text-[9px] text-neutral-500 mt-0.5 uppercase">v3.0.0 .exe</span>
                </a>
                <div className="w-px bg-black/10 hidden sm:block self-stretch"></div>
                <a
                  href={DOWNLOADS[1].href}
                  className="flex-1 flex flex-col items-center justify-center bg-white hover:bg-neutral-50 text-black py-5 px-8 transition-all"
                >
                  <span className="material-symbols-outlined text-2xl mb-1">terminal</span>
                  <span className="font-black uppercase text-[11px] tracking-widest">Linux</span>
                  <span className="text-[9px] text-neutral-500 mt-0.5 uppercase">v3.0.0 .AppImage</span>
                </a>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                Windows 10/11 and most Linux distributions. Free and open source. On first launch,
                the setup screen installs the Python engines for you.
              </p>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
