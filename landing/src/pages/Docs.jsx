import { Link } from 'react-router-dom'
import Footer from '../components/Footer'

const MKDOCS = 'https://thd-spatial-ai.github.io/TEMPO'
const GITHUB = 'https://github.com/THD-Spatial-AI/TEMPO'

const sections = [
  {
    icon: 'rocket_launch',
    category: 'Getting Started',
    title: 'Installation & Setup',
    desc: 'Install TEMPO on Windows or Linux, set up the engines, and build and run a first model.',
    links: [
      { label: 'Installation Guide', href: `${MKDOCS}/getting-started/installation/` },
      { label: 'Quick Start', href: `${MKDOCS}/getting-started/quick-start/` },
      { label: 'Configuration', href: `${MKDOCS}/getting-started/configuration/` },
    ],
  },
  {
    icon: 'book',
    category: 'User Guide',
    title: 'Building a Model',
    desc: 'Create a model step by step: add locations, connect them with links, assign technologies and load time series.',
    links: [
      { label: 'Creating a Model', href: `${MKDOCS}/user-guide/creating-a-model/` },
      { label: 'Locations', href: `${MKDOCS}/user-guide/locations/` },
      { label: 'Links', href: `${MKDOCS}/user-guide/links/` },
      { label: 'Technologies', href: `${MKDOCS}/user-guide/technologies/` },
      { label: 'Time Series', href: `${MKDOCS}/user-guide/time-series/` },
    ],
  },
  {
    icon: 'play_circle',
    category: 'User Guide',
    title: 'Running & Results',
    desc: 'Set up scenarios, run the optimization, read the results, and move models in and out of TEMPO.',
    links: [
      { label: 'Parameters & Scenarios', href: `${MKDOCS}/user-guide/parameters-scenarios/` },
      { label: 'Running Optimization', href: `${MKDOCS}/user-guide/running-optimization/` },
      { label: 'Results', href: `${MKDOCS}/user-guide/results/` },
      { label: 'Import & Export', href: `${MKDOCS}/user-guide/import-export/` },
    ],
  },
  {
    icon: 'map',
    category: 'Map Interface',
    title: 'GIS & Map Layers',
    desc: 'The map, the OSM Infrastructure panel in the right sidebar (region selection, layer filters, mesh generator) and the optional GeoServer setup.',
    links: [
      { label: 'Map Interface', href: `${MKDOCS}/map/map-interface/` },
      { label: 'OSM Layers', href: `${MKDOCS}/map/osm-layers/` },
      { label: 'GeoServer Setup', href: `${MKDOCS}/map/geoserver/` },
    ],
  },
  {
    icon: 'download',
    category: 'GIS Data',
    title: 'Download & Import Map Data',
    desc: 'Download OSM power infrastructure for a country or region from inside the app. Pick the region in the Creation map sidebar, click Download & Import, and follow the progress in the log.',
    links: [
      { label: 'Downloading GIS Data', href: `${MKDOCS}/osm-processing/downloading-data/` },
      { label: 'OSM Layers', href: `${MKDOCS}/map/osm-layers/` },
    ],
  },
  {
    icon: 'account_tree',
    category: 'OSM Processing',
    title: 'Data Pipelines',
    desc: 'The Python scripts behind the download: Geofabrik PBF download, osmium extraction, PostGIS import and GeoServer publishing. You can also run them from the command line for batch jobs.',
    links: [
      { label: 'OSM Processing Overview', href: `${MKDOCS}/osm-processing/overview/` },
      { label: 'Extracting Data', href: `${MKDOCS}/osm-processing/extracting-data/` },
    ],
  },
  {
    icon: 'terminal',
    category: 'Reference',
    title: 'API Reference',
    to: '/docs/api',
    desc: 'HTTP endpoints of the Go backend and the five engine services the desktop app runs locally.',
    links: [
      { label: 'Endpoint Overview', to: '/docs/api' },
      { label: 'Go Backend API', href: `${MKDOCS}/reference/api-endpoints/` },
    ],
  },
  {
    icon: 'library_books',
    category: 'Reference',
    title: 'Technologies & Code',
    desc: 'The built-in technology templates and their parameters, and a map of the codebase.',
    links: [
      { label: 'Technology Templates', href: `${MKDOCS}/reference/technology-templates/` },
      { label: 'Codebase Reference', href: `${MKDOCS}/reference/codebase-reference/` },
    ],
  },
  {
    icon: 'construction',
    category: 'Development',
    title: 'Building & Contributing',
    desc: 'How the project is laid out, how to set up a development environment, and how to build the installers.',
    links: [
      { label: 'Project Structure', href: `${MKDOCS}/development/project-structure/` },
      { label: 'Dev Setup', href: `${MKDOCS}/development/setup/` },
      { label: 'Building', href: `${MKDOCS}/development/building/` },
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
              The full documentation is on{' '}
              <a href={MKDOCS} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70">
                thd-spatial-ai.github.io/TEMPO
              </a>
              . The cards below go straight to the pages people open most.
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
                Offline Copy
              </p>
              <h3 className="font-black text-2xl uppercase tracking-tight">
                Read the docs online, or run them locally
              </h3>
              <p className="text-[0.8125rem] text-neutral-500 mt-2">
                From the repository root, after pip install -r docs/requirements.txt.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="bg-black text-[#E2E2E2] px-8 py-4 font-mono text-[0.75rem] tracking-widest">
                mkdocs serve
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
