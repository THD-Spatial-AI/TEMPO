import Footer from '../components/Footer'
import model from '../public/img/Model.png'
import InteractiveQGIS from '../public/img/InteractiveQGIS.png'

export default function Features() {
  const workflowSteps = [
    {
      num: '01',
      title: 'Ingestion',
      desc: 'Import time-series data or link to live feeds. TEMPO handles normalization and gap-filling automatically.',
    },
    {
      num: '02',
      title: 'Architect',
      desc: 'Map the physical assets to digital nodes. Define constraints, efficiencies, and operational logic in the Model Builder.',
    },
    {
      num: '03',
      title: 'Simulate',
      desc: 'Run Monte Carlo simulations or deterministic paths. Real-time feedback via SSE streaming ensures instant insight.',
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
                  A visual-first node-based interface that abstracts complex calculus into
                  architectural components. Construct logic flows with zero overhead.
                </p>
                <ul className="space-y-4">
                  {['Logic-Gating Connectors', 'Sub-system Nesting', 'Real-time Error Validation'].map(
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
                Seamless integration with MapLibre GL. Overlay spatial datasets, transmission grids,
                and topography directly into your simulation environment.
              </p>
            </div>

            <div className="h-[600px] w-full bg-surface-container relative">
                <img
                  className="absolute"
                  alt=""
                  src={InteractiveQGIS}
                />

            </div>
          </div>
        </section>

        {/* ── Advanced Components — Bento Grid ── */}
        <section className="py-32 px-8 bg-surface-container-lowest">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-[2.75rem] font-bold tracking-tight mb-16 uppercase">
              Advanced Components
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[300px]">
              {/* Card 1 — PV */}
              <div className="md:col-span-8 bg-surface p-10 flex flex-col justify-between border-b-4 border-black group">
                <div>
                  <span className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">
                    Renewables
                  </span>
                  <h3 className="text-2xl font-bold mt-2">MULTI-ARRAY PHOTOVOLTAICS</h3>
                </div>
                <p className="text-on-surface-variant max-w-md">
                  Precision irradiance modeling with 15-minute resolution and panel-level degradation curves.
                </p>
              </div>

              {/* Card 2 — H2 */}
              <div className="md:col-span-4 bg-black p-10 flex flex-col justify-between text-white">
                <span className="material-symbols-outlined text-3xl">cyclone</span>
                <div>
                  <h3 className="text-xl font-bold uppercase">H2 Electrolysis</h3>
                  <p className="text-[0.75rem] text-on-tertiary mt-2">
                    Dynamic PEM and Alkaline cell stacks.
                  </p>
                </div>
              </div>

              {/* Card 3 — BESS */}
              <div className="md:col-span-4 bg-surface-container p-10 flex flex-col justify-center items-center text-center">
                <span className="material-symbols-outlined text-5xl mb-4">storage</span>
                <h3 className="text-lg font-bold uppercase">BESS Systems</h3>
                <p className="text-[0.75rem] mt-2">
                  LFP and NMC chemistry profiles with thermal management modeling.
                </p>
              </div>

              {/* Card 4 — CCS */}
              <div className="md:col-span-8 bg-surface p-10 relative overflow-hidden">
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <h3 className="text-2xl font-bold uppercase">Carbon Capture (CCS)</h3>
                  <div className="flex gap-4">
                    <button className="border border-black px-4 py-2 text-[0.6875rem] font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors">
                      Documentation
                    </button>
                    <button className="border border-black px-4 py-2 text-[0.6875rem] font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors">
                      Specs
                    </button>
                  </div>
                </div>
                <img
                  className="absolute inset-0 w-full h-full object-cover grayscale opacity-10"
                  alt="Industrial abstract of massive steel pipes and ventilation systems at a carbon capture facility"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBnIJSttYhwUoKfTZCMSM4w_0PDXiCJpaTJYmAs_bOjI1LAbEBqL3SapnE8iy-Hd8zQiJsbgglaMgHZb0LPptDMM8aeWNyGCog1nz7_7AL10KSb_utAs1YGnSYLXb5aCIl2ICHBPlHROrJc3KiHmfGSHOlOcpVze_3q416B2-7Wrb5opUwUNvoEMyZJXgxLwqjNZTtAIRy4Ua1Lwt4At1SGQiYNGbYYk1XB7sfjDc1XLwMfL9SlyBu-YlNdPHrvooT1OB-HJSPo9PE"
                />
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
                <div>[INFO] <span className="text-white">Connecting to simulation stream...</span></div>
                <div>[INFO] <span className="text-white">Handshake successful. Buffer size 4096.</span></div>
                <div>[STREAM] <span className="text-white">Frame 001: Calliope model loaded. 48 timesteps.</span></div>
                <div>[STREAM] <span className="text-white">Frame 002: CBC solver initialized. Objective: minimize cost.</span></div>
                <div>[STREAM] <span className="text-white">Frame 003: Optimization in progress — gap 2.1%</span></div>
                <div className="animate-pulse">
                  [SYSTEM] <span className="text-yellow-400">Processing solution vector batch #1092...</span>
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
