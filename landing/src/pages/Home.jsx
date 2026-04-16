import { HeroSection } from '../components/ui/HeroSection'
import Footer from '../components/Footer'
import logo from '../public/img/Logo_TEMPO.PNG'
import Creation from '../public/img/creation.png'
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

        {/* ── Hero ── */}
        <HeroSection
          className="min-h-[calc(100vh-4rem)]"
          logo={{
            url: logo,
            alt: 'TEMPO logo',
            text: 'TEMPO',
          }}
          slogan="Tool for Energy Model Planning and Optimization"
          title={
            <>
              Bridge GIS and <br />
              <span className="text-primary">Energy Optimization.</span>
            </>
          }
          subtitle="A local-first planning platform powered by Calliope. Design, optimize, and visualize complex regional energy systems through a high-precision no-code interface."
          callToAction={{
            text: 'DOWNLOAD NOW →',
            href: '#download',
          }}
          backgroundImage={Creation}
          contactInfo={{
            website: 'tempo-tool.github.io',
            phone: '+49 991 3615-0',
            address: 'TH Deggendorf, Bavaria',
          }}
        />

        {/* ── The Workflow ── */}
        <section className="py-32 px-8 bg-black text-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-0">
              {workflowSteps.map((item, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center text-center px-8 border-r border-white/10 last:border-0"
                >
                  <div className="w-12 h-12 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                  </div>
                  <h3 className="font-bold uppercase text-[10px] tracking-[0.3em] mb-3">{item.step}</h3>
                  <p className="text-[11px] text-neutral-400 uppercase tracking-widest leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Core Features ── */}
        <section className="py-32 px-8 bg-surface" id="features">
          <div className="max-w-7xl mx-auto">
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

        {/* ── Tech Stack ── */}
        <section className="py-32 px-8 bg-neutral-50 border-y border-neutral-200" id="tech">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <span className="font-bold text-[10px] tracking-[0.4em] uppercase text-neutral-400">
                Internal Foundations
              </span>
              <h2 className="text-3xl font-black mt-4 tracking-tighter uppercase">
                The Modern Energy Stack
              </h2>
            </div>
            <div className="flex flex-wrap justify-center gap-px bg-neutral-200 border border-neutral-200 max-w-4xl mx-auto">
              {techStack.map((s, i) => (
                <div
                  key={i}
                  className="flex-1 min-w-[150px] px-8 py-8 bg-white flex flex-col items-center gap-4 text-center"
                >
                  <span className="font-bold text-[10px] uppercase tracking-widest">{s.label}</span>
                  <span className="text-[12px] text-neutral-500">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-32 px-8 bg-white overflow-hidden relative">
          <div className="absolute inset-0 grid-bg opacity-10"></div>
          <div className="max-w-4xl mx-auto text-center space-y-12 relative z-10">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight">
              Scale your regional energy strategies today.
            </h2>
            <div className="flex flex-col items-center gap-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
                <button className="w-full sm:w-auto bg-black text-white px-12 py-5 font-black uppercase text-[12px] tracking-[0.2em] hover:bg-neutral-800 transition-all">
                  Download v1.0.4
                </button>
                <button className="w-full sm:w-auto border border-black px-12 py-5 font-black uppercase text-[12px] tracking-[0.2em] hover:bg-black hover:text-white transition-all">
                  Read Whitepaper
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                Available for Windows 10/11 and major Linux distributions.
              </p>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
