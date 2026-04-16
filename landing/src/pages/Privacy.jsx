import Footer from '../components/Footer'

export default function Privacy() {
  return (
    <div className="bg-surface text-primary">
      <main className="pt-16">

        {/* Header */}
        <section className="px-8 py-24 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="max-w-4xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Legal
            </p>
            <h1 className="text-[3.5rem] md:text-[4.5rem] font-black tracking-[-0.03em] leading-none mb-6">
              PRIVACY NOTICE
            </h1>
            <p className="text-on-surface-variant text-[0.875rem] uppercase tracking-widest font-bold">
              Effective: April 2026 — TH Deggendorf / THD-Spatial
            </p>
          </div>
        </section>

        <section className="px-8 py-24 bg-surface">
          <div className="max-w-4xl mx-auto space-y-16">

            {/* Key principle */}
            <div className="bg-black text-[#E2E2E2] p-12">
              <p className="font-bold text-[0.6875rem] uppercase tracking-widest mb-4 text-[#C6C6C6]">
                Core Principle
              </p>
              <p className="text-[1rem] leading-[1.8]">
                TEMPO is a <strong>local-first, offline-capable desktop application</strong>.
                It does not collect, transmit, or store personal data on external servers.
                All model data, configurations, and optimization results remain on your
                machine or your institution's infrastructure.
              </p>
            </div>

            {/* Data handling sections */}
            {[
              {
                title: 'Data We Do Not Collect',
                items: [
                  'Personal identifiers (name, email, IP address)',
                  'Usage telemetry or analytics',
                  'Model data or optimization results',
                  'Geospatial data you import or create',
                  'Crash reports or diagnostic data sent to external servers',
                ],
                note: null,
              },
              {
                title: 'Local Data Storage',
                items: [
                  'All model data is stored in a local SQLite database (calliope.db) on your machine.',
                  'Application settings are stored in local configuration files.',
                  'Exported YAML, ZIP, and CSV files are written to locations you specify.',
                  'No data is synchronized to cloud services.',
                ],
                note: null,
              },
              {
                title: 'Third-Party Network Requests',
                items: [
                  'OSM / Overpass API — used as a fallback for power infrastructure data when GeoServer is not configured. No personal data is included in these requests.',
                  'OpenStreetMap tile servers (MapLibre GL) — map tiles are fetched for display. Standard HTTP requests; no user data is attached.',
                  'Geofabrik (optional) — OSM processing scripts may download PBF extracts. These are public, unauthenticated downloads.',
                ],
                note: 'All network access is optional and documented. You can run TEMPO fully offline with pre-loaded GeoServer data.',
              },
              {
                title: 'Docker Containers',
                items: [
                  'The GeoServer and PostGIS containers run entirely on your local machine or private infrastructure.',
                  'No container images phone home after initial pull from Docker Hub.',
                  'Container data volumes are stored locally and never replicated externally.',
                ],
                note: null,
              },
              {
                title: 'Open Source',
                items: [
                  'TEMPO is fully open source under the MIT License.',
                  'All data handling logic is auditable in the source code on GitHub.',
                  'No obfuscated telemetry or proprietary SDKs are embedded.',
                ],
                note: null,
              },
            ].map((section) => (
              <div key={section.title}>
                <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                  {section.title}
                </p>
                <ul className="space-y-3 mb-4">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <span className="material-symbols-outlined text-[1rem] mt-0.5 flex-shrink-0">
                        chevron_right
                      </span>
                      <span className="text-[0.875rem] leading-[1.7] text-on-surface-variant">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
                {section.note && (
                  <div className="bg-surface-container-lowest border-l-4 border-black p-6 mt-4">
                    <p className="text-[0.8125rem] leading-relaxed text-on-surface-variant">
                      {section.note}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Contact */}
            <div className="pt-8 border-t border-outline-variant/20">
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
                Contact
              </p>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                For questions about this notice or data handling, open an issue on{' '}
                <a
                  href="https://github.com/TH-Deggendorf/TEMPO/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  GitHub
                </a>
                {' '}or contact the project maintainers at TH Deggendorf.
              </p>
            </div>

          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
