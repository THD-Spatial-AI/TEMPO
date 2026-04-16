import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

const MKDOCS = 'http://localhost:8000'
const GITHUB = 'https://github.com/TH-Deggendorf/TEMPO'

const sections = [
  {
    icon: 'rocket_launch',
    category: 'Getting Started',
    title: 'Installation & Setup',
    desc: 'Step-by-step guide for setting up TEMPO on Windows and Linux, including Docker containers, Go backend, and Python environment.',
    links: [
      { label: 'Installation Guide', href: `${MKDOCS}/getting-started/installation/` },
      { label: 'Quick Start', href: `${MKDOCS}/getting-started/quick-start/` },
      { label: 'Configuration', href: `${MKDOCS}/getting-started/configuration/` },
    ],
  },
  {
    icon: 'map',
    category: 'Map Interface',
    title: 'GIS & Map Layers',
    desc: 'Documentation for the MapLibre GL / Deck.gl map, OSM power infrastructure layers, and GeoServer integration.',
    links: [
      { label: 'Map Interface', href: `${MKDOCS}/map/map-interface/` },
      { label: 'OSM Layers', href: `${MKDOCS}/map/osm-layers/` },
      { label: 'GeoServer Setup', href: `${MKDOCS}/map/geoserver/` },
    ],
  },
  {
    icon: 'account_tree',
    category: 'OSM Processing',
    title: 'Data Pipelines',
    desc: 'Python scripts to download Geofabrik PBF extracts, process power infrastructure, and load regional data into PostGIS.',
    links: [
      { label: 'OSM Processing Overview', href: `${MKDOCS}/osm-processing/` },
    ],
  },
  {
    icon: 'terminal',
    category: 'Reference',
    title: 'API Reference',
    to: '/docs/api',
    desc: 'REST API endpoints exposed by the Go backend on port 8082, and the FastAPI Calliope service on port 5000.',
    links: [
      { label: 'Go Backend API', href: `${MKDOCS}/reference/` },
      { label: 'Calliope Service API', to: '/docs/api' },
    ],
  },
  {
    icon: 'construction',
    category: 'Development',
    title: 'Building & Contributing',
    desc: 'Architecture overview, project structure, build commands, and guidelines for contributing to TEMPO.',
    links: [
      { label: 'Project Structure', href: `${MKDOCS}/development/project-structure/` },
      { label: 'Building', href: `${MKDOCS}/development/building/` },
      { label: 'Dev Setup', href: `${MKDOCS}/development/setup/` },
    ],
  },
  {
    icon: 'book',
    category: 'User Guide',
    title: 'User Guide',
    desc: 'End-to-end walkthroughs for creating models, running optimizations, and interpreting results.',
    links: [
      { label: 'Full User Guide', href: `${MKDOCS}/user-guide/` },
    ],
  },
]

export default function Docs() {
  return (
    <div className="bg-surface text-primary">
      <main className="pt-16">

        {/* Header */}
        <section className="px-8 py-24 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="max-w-7xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Documentation
            </p>
            <h1 className="text-[3.5rem] md:text-[4.5rem] font-black tracking-[-0.03em] leading-none mb-6">
              DOCS & REFERENCE
            </h1>
            <p className="text-on-surface-variant text-[1rem] max-w-2xl leading-relaxed">
              Full documentation is served via MkDocs. Start the local docs server with{' '}
              <code className="font-mono bg-black text-[#E2E2E2] px-2 py-0.5 text-[0.8125rem]">
                npm run docs
              </code>{' '}
              or browse the sections below.
            </p>
          </div>
        </section>

        {/* Quick links bar */}
        <section className="px-8 py-8 bg-black">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-6">
            <span className="font-bold text-[0.6875rem] uppercase tracking-widest text-white/40">
              Quick Links
            </span>
            <a
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[0.6875rem] uppercase tracking-widest text-white hover:text-[#C6C6C6] border-b border-white/40 pb-0.5 transition-colors"
            >
              GitHub ↗
            </a>
            <a
              href={`${GITHUB}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[0.6875rem] uppercase tracking-widest text-white hover:text-[#C6C6C6] border-b border-white/40 pb-0.5 transition-colors"
            >
              Releases ↗
            </a>
            <a
              href={`${GITHUB}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[0.6875rem] uppercase tracking-widest text-white hover:text-[#C6C6C6] border-b border-white/40 pb-0.5 transition-colors"
            >
              Issues ↗
            </a>
            <Link
              to="/code-of-conduct"
              className="font-bold text-[0.6875rem] uppercase tracking-widest text-white hover:text-[#C6C6C6] border-b border-white/40 pb-0.5 transition-colors"
            >
              Code of Conduct
            </Link>
          </div>
        </section>

        {/* Doc sections grid */}
        <section className="px-8 py-24 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200">
              {sections.map((s, i) => (
                <div key={i} className="bg-white p-10 flex flex-col gap-6 hover:bg-neutral-50 transition-colors">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="material-symbols-outlined text-xl">{s.icon}</span>
                      <span className="font-bold text-[0.6875rem] uppercase tracking-widest text-outline">
                        {s.category}
                      </span>
                    </div>
                    <h3 className="font-black text-[1.125rem] uppercase tracking-tight mb-3">
                      {s.title}
                    </h3>
                    <p className="text-[0.8125rem] text-neutral-500 leading-relaxed">{s.desc}</p>
                  </div>
                  <div className="flex flex-col gap-2 mt-auto">
                    {s.links.map((link) =>
                      link.to ? (
                        <Link
                          key={link.label}
                          to={link.to}
                          className="font-bold text-[0.6875rem] uppercase tracking-widest text-black border-b border-black/20 pb-1 hover:border-black transition-all self-start"
                        >
                          {link.label} →
                        </Link>
                      ) : (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[0.6875rem] uppercase tracking-widest text-black border-b border-black/20 pb-1 hover:border-black transition-all self-start"
                        >
                          {link.label} ↗
                        </a>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MkDocs launch CTA */}
        <section className="px-8 py-24 bg-surface-container-lowest border-t border-outline-variant/20">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-2">
                Local Docs Server
              </p>
              <h3 className="font-black text-2xl uppercase tracking-tight">
                Run the full documentation site locally
              </h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="bg-black text-[#E2E2E2] px-8 py-4 font-mono text-[0.75rem] tracking-widest">
                npm run docs
              </div>
              <a
                href={MKDOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-black px-8 py-4 font-bold uppercase text-[0.6875rem] tracking-widest hover:bg-black hover:text-white transition-colors"
              >
                Open Docs ↗
              </a>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
