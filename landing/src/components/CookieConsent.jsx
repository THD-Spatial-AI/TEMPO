import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'tempo_cookie_consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) setVisible(true)
  }, [])

  const accept = (level) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, date: new Date().toISOString() }))
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie and data usage notice"
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-neutral-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
    >
      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Main row */}
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
          {/* Icon + copy */}
          <div className="flex gap-4 flex-1">
            <span className="material-symbols-outlined text-[1.5rem] text-primary flex-shrink-0 mt-0.5">
              cookie
            </span>
            <div className="flex-1">
              <p className="text-[0.8125rem] font-bold uppercase tracking-widest mb-1">
                Cookies &amp; External Requests
              </p>
              <p className="text-[0.8125rem] text-neutral-500 leading-relaxed">
                TEMPO is a <strong>local-first desktop application</strong> — no analytics or tracking
                cookies are used. This page makes limited external requests to render the map and
                fetch open geographic data.{' '}
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="underline text-black font-medium focus:outline-none"
                >
                  {showDetails ? 'Hide details' : 'See details'}
                </button>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 flex-shrink-0 items-center">
            <button
              onClick={() => accept('essential')}
              className="px-5 py-2.5 text-[0.6875rem] font-bold uppercase tracking-widest border border-neutral-300 text-neutral-600 hover:border-black hover:text-black transition-all"
            >
              Essential only
            </button>
            <button
              onClick={() => accept('all')}
              className="px-5 py-2.5 text-[0.6875rem] font-bold uppercase tracking-widest bg-black text-white hover:bg-neutral-800 transition-all"
            >
              Accept all
            </button>
            <Link
              to="/privacy"
              className="text-[0.6875rem] font-bold uppercase tracking-widest text-neutral-400 hover:text-black underline transition-all"
            >
              Privacy Notice
            </Link>
          </div>
        </div>

        {/* Expandable detail panel */}
        {showDetails && (
          <div className="mt-6 pt-6 border-t border-neutral-100 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Essential */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[1rem]">lock</span>
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest">
                  Essential — always active
                </p>
              </div>
              <ul className="space-y-1.5">
                {[
                  'localStorage: remembers this consent choice',
                  'sessionStorage: in-app navigation state (HashRouter)',
                ].map((item) => (
                  <li key={item} className="text-[0.75rem] text-neutral-500 flex gap-2 items-start">
                    <span className="material-symbols-outlined text-[0.875rem] mt-0.5 flex-shrink-0">
                      chevron_right
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* OpenStreetMap */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[1rem]">map</span>
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest">
                  OpenStreetMap services
                </p>
              </div>
              <p className="text-[0.75rem] text-neutral-500 mb-2 leading-relaxed">
                Map tiles and geographic data are fetched from OSM servers when the interactive
                map is used. Requests include a standard HTTP User-Agent; no personal data is
                transmitted.
              </p>
              <ul className="space-y-1.5">
                {[
                  'MapLibre GL — OSM tile servers for background map',
                  'Overpass API — power infrastructure (fallback)',
                  'Nominatim — place/region geocoding',
                  'Geofabrik — PBF extract downloads (optional)',
                ].map((item) => (
                  <li key={item} className="text-[0.75rem] text-neutral-500 flex gap-2 items-start">
                    <span className="material-symbols-outlined text-[0.875rem] mt-0.5 flex-shrink-0">
                      chevron_right
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-[0.6875rem] text-neutral-400 mt-3 leading-relaxed">
                Map data ©{' '}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-black"
                >
                  OpenStreetMap contributors
                </a>{' '}
                — ODbL.{' '}
                <a
                  href="https://operations.osmfoundation.org/policies/nominatim/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-black"
                >
                  Nominatim usage policy
                </a>
                .
              </p>
            </div>

            {/* What we do NOT use */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[1rem]">block</span>
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest">
                  Not used
                </p>
              </div>
              <ul className="space-y-1.5">
                {[
                  'Analytics or usage tracking',
                  'Advertising networks',
                  'Third-party social SDKs',
                  'Session recording or heatmaps',
                  'Cross-site tracking cookies',
                ].map((item) => (
                  <li key={item} className="text-[0.75rem] text-neutral-500 flex gap-2 items-start">
                    <span className="material-symbols-outlined text-[0.875rem] mt-0.5 flex-shrink-0">
                      block
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
