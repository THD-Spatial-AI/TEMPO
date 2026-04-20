import { HeroSection } from '../components/ui/HeroSection'
import { ImageComparison } from '../components/ui/ImageComparison'
import { ShadowOverlay } from '../components/ui/ShadowOverlay'
import Footer from '../components/Footer'
import logo from '../public/img/Logo_TEMPO.PNG'
import Hero from '../public/img/Hero.png'
import BeforeImg from '../public/img/Old.png'
import AfterImg from '../public/img/New.png'
import LogoH2IN from '../public/img/H2IN.jpg'
import LogoREDRES from '../public/img/REDRES.png'
import LogoH2V from '../public/img/H2V.png'
import LogoTHD from '../public/img/THD.svg'

const GITHUB = 'https://github.com/TH-Deggendorf/TEMPO'
const RELEASES = 'https://github.com/TH-Deggendorf/TEMPO/releases'

const DOWNLOADS = [
  {
    label: 'Download for Windows',
    sub: 'v1.0.0 · .exe · 124 MB',
    icon: 'desktop_windows',
    href: `${RELEASES}/latest/download/TEMPO-Setup-1.0.4.exe`,
  },
  {
    label: 'Download for Linux',
    sub: 'v1.0.0 · .AppImage · 118 MB',
    icon: 'terminal',
    href: `${RELEASES}/latest/download/TEMPO-1.0.4.AppImage`,
  },
]

const CONTACTS = [
  { label: 'https://github.com/THD-Spatial-AI/TEMPO', icon: 'github', href: GITHUB, external: true },
  { label: 'tempo@th-deg.de', icon: 'email', href: 'mailto:tempo@th-deg.de' },
  { label: 'www.th-deg.de', icon: 'website', href: 'https://www.th-deg.de', external: true },
  { label: 'Deggendorf, Bavaria', icon: 'address', href: 'https://maps.google.com/?q=TH+Deggendorf', external: true },
]

const CONTRIBUTE_STEPS = [
  {
    num: '01',
    title: 'Fork & Clone',
    desc: 'Fork the repository on GitHub and clone it locally. The monorepo contains the React frontend, Go backend, Python service, and OSM processing scripts.',
    code: 'git clone https://github.com/THD-Spatial-AI/TEMPO.git',
  },
  {
    num: '02',
    title: 'Set Up Your Environment',
    desc: 'Install Node.js >= 16, Go >= 1.21, and Python >= 3.9 with Calliope. Docker Desktop is needed for GeoServer and the Calliope runner service.',
    code: 'npm install  |  go mod download  |  pip install -r python/requirements.txt',
  },
  {
    num: '03',
    title: 'Run Locally',
    desc: 'Start all three services — Vite dev server, Go backend, and optionally the Docker services — then open the app at localhost:5173.',
    code: 'npm run dev  |  cd backend-go && go run .  |  docker compose up',
  },
  {
    num: '04',
    title: 'Open a Pull Request',
    desc: 'Create a feature branch, commit your changes following conventional commits, and open a PR against the main branch. All PRs are reviewed by maintainers.',
    code: 'git checkout -b feat/my-feature  &&  git push origin feat/my-feature',
  },
]

export default function Home() {
  const workflowSteps = [
    { icon: 'database', step: '01. INGESTION', desc: 'Import heterogeneous spatial & temporal data assets.' },
    { icon: 'architecture', step: '02. TOPOLOGY', desc: 'Construct multi-node networks via visual architect.' },
    { icon: 'memory', step: '03. SOLVE', desc: 'Execute linear & mixed-integer optimizations.' },
    { icon: 'analytics', step: '04. ANALYTICS', desc: 'Deconstruct results via interactive GIS dashboards.' },
  ]

  const features = [
    { icon: 'account_tree', title: 'Model Builder', desc: 'Node-based canvas for architecting energy networks with direct translation to Calliope YAML schemas.' },
    { icon: 'map', title: 'GIS Integration', desc: 'Native support for Shapefiles and GeoJSON for geographically anchored infrastructure planning.' },
    { icon: 'library_books', title: 'Tech Catalog', desc: 'Standardized library of renewable and conventional generators, storage systems, and transmission tech.' },
    { icon: 'terminal', title: 'Live Runner', desc: 'Integrated shell for monitoring optimization logs and solver telemetry in real-time.' },
    { icon: 'experiment', title: 'Scenario Lab', desc: 'Automated multi-run simulations to explore model sensitivity across varying climate and cost parameters.' },
    { icon: 'data_exploration', title: 'Result Analysis', desc: 'Aggregated visualization of energy flows, carbon intensity, and system-wide levelized costs.' },
  ]

  const techStack = [
    { label: 'Core Engine', value: 'Calliope 0.6.8' },
    { label: 'Desktop', value: 'Electron / Vite' },
    { label: 'Backend', value: 'Go + FastAPI' },
    { label: 'Frontend', value: 'React 19 / Tailwind' },
    { label: 'Database', value: 'SQLite / PostGIS' },
  ]

  return (
    <div className="bg-surface text-primary selection:bg-primary selection:text-on-primary grid-bg">
      <main className="pt-16">

        {/* Hero */}
        <HeroSection
          className="min-h-[calc(100vh-4rem)]"
          logo={{ url: logo, alt: 'TEMPO logo', text: 'TEMPO' }}
          slogan="Tool for Energy Model Planning and Optimization"
          title={<>Bridge GIS and<br /><span className="text-primary">Energy Optimization.</span></>}
          subtitle="A local-first planning platform powered by Calliope. Design, optimize, and visualize complex regional energy systems through a high-precision no-code interface."
          downloads={DOWNLOADS}
          contacts={CONTACTS}
          institution={{ logo: LogoTHD, name: 'TH Deggendorf', group: 'GeoSpatialAI Research Group' }}
          partners={[
            { logo: LogoH2IN, name: 'H2.in' },
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
                  <p className="text-[11px] text-neutral-400 uppercase tracking-widest leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* From Raw Data to Structured Model */}
        <section className="py-32 px-8 bg-neutral-50 border-y border-neutral-200" id="comparison">
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
                Drag the slider to compare the traditional approach — manually parsing raw OSM infrastructure
                layers — against the structured, actionable energy model produced inside TEMPO.
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
              <div className="px-8 py-5 border-r border-neutral-200 flex items-center gap-4">
                <span className="material-symbols-outlined text-lg text-neutral-400">layers</span>
                <div>
                  <p className="font-black text-[10px] uppercase tracking-widest">Before</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Raw OSM power lines, plants &amp; substations — thousands of features to sift through manually.
                  </p>
                </div>
              </div>
              <div className="px-8 py-5 flex items-center gap-4">
                <span className="material-symbols-outlined text-lg text-black">bolt</span>
                <div>
                  <p className="font-black text-[10px] uppercase tracking-widest">After</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Structured TEMPO model — topology, tech catalog, CAPEX/OPEX estimates, ready to optimize.
                  </p>
                </div>
              </div>
            </div>
          </div>
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
                  TEMPO was created at the <strong className="text-black">Technische Hochschule Deggendorf</strong> (THD)
                  by the <strong className="text-black">Research Group for BigGeoData & Spatial AI</strong> research group. The project bridges
                  geospatial science and energy systems engineering — combining open geographic data from
                  OpenStreetMap with the rigorous optimization framework Calliope to support regional energy transition planning.
                </p>
                <p className="text-[0.9375rem] text-neutral-500 leading-relaxed mb-10">
                  The tool is designed for researchers, students, and practitioners who need to model
                  complex multi-node energy systems at regional or national scale without requiring
                  deep expertise in YAML configuration or command-line workflows.
                </p>
                <div className="border-l-4 border-black pl-8 space-y-3">
                  {[
                    { label: 'Institution', value: 'Technische Hochschule Deggendorf (THD)' },
                    { label: 'Research Group', value: 'Research Group for BigGeoData & Spatial AI' },
                    { label: 'Location', value: 'Deggendorf, Bavaria, Germany' },
                    { label: 'Website', value: 'www.th-deg.de', href: 'https://www.th-deg.de' },
                    { label: 'License', value: 'MIT — Open Source' },
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
                  { icon: 'bolt', label: 'Optimization Engine', value: 'Calliope 0.6.8', sub: 'CBC MILP solver' },
                  { icon: 'map', label: 'GIS Backend', value: 'PostGIS + GeoServer', sub: 'OSM power infrastructure' },
                  { icon: 'desktop_windows', label: 'Platforms', value: 'Windows + Linux', sub: 'Electron desktop app' },
                  { icon: 'code', label: 'Tech Stack', value: 'React + Go + Python', sub: 'Vite + FastAPI + SQLite' },
                  { icon: 'public', label: 'Data Source', value: 'OpenStreetMap', sub: 'Geofabrik regional extracts' },
                  { icon: 'account_balance', label: 'Academic Use', value: 'Free & Open', sub: 'MIT Licensed' },
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
                Built for Real Projects
              </h2>
              <p className="text-lg text-neutral-500 max-w-3xl">
                TEMPO was developed at <strong className="text-black">Technische Hochschule Deggendorf</strong> within the <strong className="text-black">Research Group for BigGeoData & Spatial AI</strong>. It is the modelling backbone for several funded research and industry
                projects focused on regional hydrogen economies and renewable energy planning.
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
                    This is a multidisciplinary research project focused on the multidimensional 
                    and comprehensive study of the green hydrogen value chain, 
                    supporting decision-making regarding the technologies that can be used at 
                    each stage of the value chain, providing public policy recommendations on this topic, 
                    and developing advanced human capital in this field with international support and 
                    collaborative networks in Germany.

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
                    RED-RES-GH2: Reducing the risk generated by
                    extreme droughts in the Chilean power system
                    with optimal shares of variable renewable
                    energy sources including green hydrogen
                    storage
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-auto">
                  {['Renewables', 'Sector Coupling', 'Cross-border', 'Germany', 'Chile'].map(t => (
                    <span key={t} className="border border-neutral-300 text-[10px] font-bold tracking-widest uppercase px-2 py-1">{t}</span>
                  ))}
                </div>
                <a href="https://zaf.th-deg.de/public/project/fact-sheet/363" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity mt-2 inline-block">
                      www.red-res-h2.cl →
                    </a>
              </div>

              {/* H2V+ */}
              <div className="bg-white border border-neutral-200 p-8 flex flex-col gap-5">
                <div className="h-16 flex items-center">
                  <img src={LogoH2V} alt="H2V+ project logo" className="h-14 w-auto object-contain" style={{ mixBlendMode: 'multiply' }} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight uppercase mb-2">H2V+ — Valparaíso</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed">
                    <em>Interactive Green Hydrogen Platform in the Valparaíso Region:</em>  Driving the energy transition,
                    promoting clean energy and sustainable solutions.
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

            {/* Developed by — institution row */}
            <div className="border border-neutral-200 bg-white p-8">
              <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-neutral-400 mb-6">Developed by</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">

                {/* THD */}
                <div className="flex items-start gap-5">
                  <img src={LogoTHD} alt="THD logo" className="h-14 w-auto object-contain shrink-0" />
                  <div>
                    <p className="font-black text-sm tracking-tight">Technische Hochschule Deggendorf</p>
                    <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                      University of Applied Sciences — Deggendorf, Bavaria, Germany.
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
                      Applied research group at THD focusing on spatial data science, GIS-driven energy
                      system modelling, and AI-enhanced land-use analysis.
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
              color="rgba(200, 210, 255, 0.55)"
              animation={{ scale: 40, speed: 20 }}
              noise={{ opacity: 0.3, scale: 1.5 }}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <div className="max-w-7xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
            <div className="mb-20 flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div className="max-w-2xl">
                <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400">
                  System Architecture
                </span>
                <h2 className="text-5xl font-black mt-4 tracking-tighter">Engineered for Precision.</h2>
              </div>
              <p className="text-sm text-neutral-500 max-w-sm">
                TEMPO abstracts the complexity of mathematical modeling into a high-performance desktop environment.
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
              <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400">
                Internal Foundations
              </span>
              <h2 className="text-3xl font-black mt-4 tracking-tighter uppercase">The Modern Energy Stack</h2>
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
                  Powering the Tech Catalog
                </span>
                <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">
                  OpenTech-DB
                </h2>
                <p className="mt-4 text-[0.9375rem] text-neutral-500 max-w-2xl leading-relaxed">
                  An <strong className="text-black">OEO-aligned</strong> open database of 55+ energy technologies
                  with a REST API and framework adapters — the data backbone behind TEMPO's technology catalog.
                  All CAPEX, OPEX, efficiency, and capacity parameters are sourced from here and exported
                  directly to Calliope, PyPSA, and OSeMOSYS models.
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
                  desc: '28 ready-to-use capacity factor and load profiles for DE, FR, UK, ES, IT, NO, DK, AT — solar, wind, hydro, industrial & residential demand (2019 base year).',
                },
                {
                  icon: 'sync_alt',
                  title: 'Framework Adapters',
                  desc: 'One-click export to Calliope YAML techs: blocks, PyPSA component dicts, and OSeMOSYS parameter tables. Drop TEMPO model parameters straight from the API.',
                },
                {
                  icon: 'manage_search',
                  title: 'REST API + Web UI',
                  desc: 'Browse, filter by category, fetch instances, and query CAPEX/OPEX/efficiency by technology ID. Swagger UI at /docs, ReDoc at /redoc, React frontend at :5173.',
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
                  Quick Integration — Calliope export via REST
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
              <strong className="text-black">CC BY 4.0</strong>. Aligned with the{' '}
              <a href="https://openenergy-platform.org/ontology/oeo/" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-black">Open Energy Ontology (OEO)</a>{' '}
              for semantic interoperability across modelling frameworks.
            </p>
          </div>
        </section>

        {/* Simulation Services */}
        <section className="py-32 px-8 bg-white border-y border-neutral-200" id="simulation-services">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400 mb-2 block">
                Physical Process Simulation
              </span>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none mb-6">
                OpenModelica Simulation Services
              </h2>
              <p className="text-lg text-neutral-500 max-w-3xl">
                Physics-based simulation engines for hydrogen production and carbon capture plants —
                backed by <strong className="text-black">OpenModelica</strong> component libraries,
                exposed as Docker-ready REST/WebSocket APIs and integrated directly into the TEMPO frontend.
              </p>
            </div>

            {/* Service cards */}
            <div className="grid md:grid-cols-2 gap-8 mb-16">

              {/* H2 Service */}
              <div className="border border-neutral-200 p-8 flex flex-col gap-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Port 8765</span>
                    <h3 className="text-2xl font-black tracking-tight uppercase">Hydrogen Plant Sim</h3>
                    <p className="text-neutral-500 mt-2 text-sm">
                      End-to-end green hydrogen power plant using PEM, Alkaline, SOEC, and AEM electrolyzer models with
                      multi-stage compression, high-pressure storage tanks, and PEM/SOFC fuel cells.
                    </p>
                  </div>
                </div>

                {/* Modelica components */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Modelica Components</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'Electrolyzer.mo', desc: 'PEM / Alkaline / SOEC / AEM — partial-load efficiency curves' },
                      { name: 'Compressor.mo', desc: 'Multi-stage H₂ compression  350 – 700 bar' },
                      { name: 'Storage.mo', desc: 'Compressed H₂ tank — ideal gas model' },
                      { name: 'FuelCell.mo', desc: 'PEM / SOFC — polarisation curves' },
                      { name: 'CompleteSystem.mo', desc: 'Integrated full-plant system model' },
                    ].map(c => (
                      <div key={c.name} className="bg-neutral-50 border border-neutral-100 p-3">
                        <p className="text-[11px] font-mono font-semibold text-black">{c.name}</p>
                        <p className="text-[10px] text-neutral-500 mt-0.5 leading-snug">{c.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API endpoints */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-2">Key API Endpoints</p>
                  <div className="bg-neutral-950 text-green-400 font-mono text-[11px] p-4 space-y-1">
                    <p><span className="text-neutral-500">GET </span> /api/health</p>
                    <p><span className="text-neutral-500">POST</span> /api/hydrogen/simulate</p>
                    <p><span className="text-neutral-500">GET </span> /api/hydrogen/status/&#123;job_id&#125;</p>
                    <p><span className="text-neutral-500">WS  </span> /api/hydrogen/ws/&#123;job_id&#125;</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  {['OpenModelica', 'FastAPI', 'WebSocket', 'Docker', 'Schema v2.0'].map(t => (
                    <span key={t} className="border border-neutral-300 text-[10px] font-bold tracking-widest uppercase px-2 py-1">{t}</span>
                  ))}
                </div>
              </div>

              {/* CCS Service */}
              <div className="border border-neutral-200 p-8 flex flex-col gap-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Port 8766</span>
                    <h3 className="text-2xl font-black tracking-tight uppercase">CCS Plant Sim</h3>
                    <p className="text-neutral-500 mt-2 text-sm">
                      Complete carbon capture and storage simulation from flue-gas absorption (MEA solvent) through
                      multi-stage CO₂ compression to geological storage monitoring in depleted fields or saline aquifers.
                    </p>
                  </div>
                </div>

                {/* Process stages */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Process Stages</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'CO₂ Source', desc: 'Flue gas from power plants & industrial processes' },
                      { name: 'Absorber', desc: 'Chemical absorption — MEA & other solvents' },
                      { name: 'Stripper', desc: 'Solvent regeneration and CO₂ release' },
                      { name: 'Compressor', desc: 'Multi-stage compression to 100+ bar pipeline pressure' },
                      { name: 'Storage', desc: 'Geological formation monitoring & injection modelling' },
                    ].map(c => (
                      <div key={c.name} className="bg-neutral-50 border border-neutral-100 p-3">
                        <p className="text-[11px] font-semibold text-black">{c.name}</p>
                        <p className="text-[10px] text-neutral-500 mt-0.5 leading-snug">{c.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* API endpoints */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-2">Key API Endpoints</p>
                  <div className="bg-neutral-950 text-green-400 font-mono text-[11px] p-4 space-y-1">
                    <p><span className="text-neutral-500">GET </span> /api/health</p>
                    <p><span className="text-neutral-500">POST</span> /api/ccs/submit</p>
                    <p><span className="text-neutral-500">GET </span> /api/ccs/status/&#123;job_id&#125;</p>
                    <p><span className="text-neutral-500">GET </span> /api/ccs/result/&#123;job_id&#125;</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  {['OpenModelica', 'FastAPI', 'Docker', 'Schema v2.0', 'MEA Absorption'].map(t => (
                    <span key={t} className="border border-neutral-300 text-[10px] font-bold tracking-widest uppercase px-2 py-1">{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Shared architecture callout */}
            <div className="grid md:grid-cols-3 gap-0 border border-neutral-200">
              <div className="p-8 border-b md:border-b-0 md:border-r border-neutral-200">
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Open-Source Engine</p>
                <p className="text-sm text-neutral-600">
                  Both services use <strong className="text-black">OpenModelica</strong> (OSMC Public License) —
                  no MATLAB licence required, fully Docker-friendly with a mock-fallback mode for development.
                </p>
              </div>
              <div className="p-8 border-b md:border-b-0 md:border-r border-neutral-200">
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">Async Job Queue</p>
                <p className="text-sm text-neutral-600">
                  Simulations run as background jobs. The frontend polls status or connects via
                  <strong className="text-black"> WebSocket</strong> for real-time progress updates and live result streaming.
                </p>
              </div>
              <div className="p-8">
                <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-400 mb-3">One-Command Deploy</p>
                <div className="bg-neutral-950 text-green-400 font-mono text-[11px] p-3 space-y-1">
                  <p><span className="text-neutral-500"># H2 simulator</span></p>
                  <p>docker-compose up --build</p>
                  <p className="pt-1"><span className="text-neutral-500"># CCS simulator</span></p>
                  <p>docker-compose up --build</p>
                </div>
              </div>
            </div>
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
                  TEMPO is released under the <strong className="text-white">MIT License</strong> — you are
                  free to use, modify, distribute, and build upon it for any purpose, including commercial
                  applications, as long as the original copyright notice is retained. Contributions from
                  the community are warmly welcomed and reviewed by the THD-Spatial maintenance team.
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
                All contributors are expected to follow the project's{' '}
                <a href="/code-of-conduct" className="text-white underline hover:opacity-80">
                  Code of Conduct
                </a>
                {' '}(Contributor Covenant 3.0). We are committed to maintaining a welcoming and inclusive community.
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
              Scale your regional energy strategies today.
            </h2>
            <div className="flex flex-col items-center gap-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 w-full max-w-xl bg-black p-1">
                <a
                  href={DOWNLOADS[0].href}
                  className="flex-1 flex flex-col items-center justify-center bg-white hover:bg-neutral-50 text-black py-5 px-8 transition-all"
                >
                  <span className="material-symbols-outlined text-2xl mb-1">desktop_windows</span>
                  <span className="font-black uppercase text-[11px] tracking-widest">Windows</span>
                  <span className="text-[9px] text-neutral-500 mt-0.5 uppercase">v1.0.0 .exe</span>
                </a>
                <div className="w-px bg-black/10 hidden sm:block self-stretch"></div>
                <a
                  href={DOWNLOADS[1].href}
                  className="flex-1 flex flex-col items-center justify-center bg-white hover:bg-neutral-50 text-black py-5 px-8 transition-all"
                >
                  <span className="material-symbols-outlined text-2xl mb-1">terminal</span>
                  <span className="font-black uppercase text-[11px] tracking-widest">Linux</span>
                  <span className="text-[9px] text-neutral-500 mt-0.5 uppercase">v1.0.0 .AppImage</span>
                </a>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                Available for Windows 10/11 and major Linux distributions. Free and open source.
              </p>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
