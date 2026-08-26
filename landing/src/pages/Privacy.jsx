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
              Effective: August 2026 — TH Deggendorf / THD-Spatial AI
            </p>
          </div>
        </section>

        <section className="px-8 py-24 bg-surface">
          <div className="max-w-4xl mx-auto space-y-16">

            {/* Intro */}
            <div className="bg-black text-[#E2E2E2] p-12">
              <p className="font-bold text-[0.6875rem] uppercase tracking-widest mb-4 text-[#C6C6C6]">
                About This Notice
              </p>
              <p className="text-[1rem] leading-[1.8]">
                This privacy notice covers the <strong>TEMPO website at tempo.th-deg.de</strong> —
                a static landing page for the TEMPO open-source software. The TEMPO desktop
                application itself is local-first and collects no personal data; see the
                "Desktop Application" section below for details.
              </p>
            </div>

            {/* Controller */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Controller &amp; Contact
              </p>
              <div className="space-y-3">
                {[
                  {
                    label: 'Deggendorf Institute of Technology (DIT / TH Deggendorf)',
                    lines: ['Dieter-Görlitz-Platz 1', '94469 Deggendorf, Germany'],
                  },
                  {
                    label: 'Appointed Data Protection Officer',
                    lines: ['Prof. Dr. Sascha Kreiskott', 'datenschutz@th-deg.de'],
                  },
                  {
                    label: 'Project Contact',
                    lines: [
                      'Ricardo Ignacio Miranda · Research Associate',
                      'BigGeoData & Spatial AI, Faculty of Applied Computer Science',
                      'ricardo.miranda@th-deg.de',
                    ],
                  },
                ].map(({ label, lines }) => (
                  <div
                    key={label}
                    className="bg-surface-container-lowest border border-outline-variant/20 p-5"
                  >
                    <p className="font-semibold text-on-surface text-[0.875rem] mb-1">{label}</p>
                    {lines.map((l) => (
                      <p key={l} className="text-[0.875rem] text-on-surface-variant leading-[1.7]">{l}</p>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant mt-4">
                All data transfers are encrypted using SSL/TLS. JavaScript is required for
                this website to function.
              </p>
            </div>

            {/* Server logs */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Server Access Logs
              </p>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant mb-4">
                When you access tempo.th-deg.de, the web server (Caddy) running on TH
                Deggendorf infrastructure records the following data in access logs:
              </p>
              <ul className="space-y-2 mb-4">
                {[
                  'Date and time of the request',
                  'URL of the requested page or asset',
                  'HTTP status code and data volume transferred',
                  'Web browser type and operating system (User-Agent)',
                  'Complete IP address of the requesting computer',
                  'Referrer URL (page from which you navigated here)',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-[1rem] mt-0.5 flex-shrink-0">
                      chevron_right
                    </span>
                    <span className="text-[0.875rem] leading-[1.7] text-on-surface-variant">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                Log data is retained for a maximum of <strong>7 days</strong> and then
                automatically deleted. No log data is shared with third parties. All servers
                are located within the Federal Republic of Germany.
              </p>
              <div className="bg-surface-container-lowest border-l-4 border-black p-6 mt-4">
                <p className="text-[0.8125rem] leading-relaxed text-on-surface-variant">
                  <strong>Legal basis:</strong> Art. 6(1)(e) GDPR — processing is necessary
                  for the performance of a public task and for network security in accordance
                  with Art. 6(1) BayDSG; § 13(7) TMG; Art. 11(1) BayEGovG.
                </p>
              </div>
            </div>

            {/* Local storage */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Browser Storage
              </p>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant mb-4">
                This website uses browser <strong>localStorage</strong> for consent management
                only. No cookies are set. No storage is used for analytics or tracking.
              </p>
              <div className="bg-surface-container-lowest border border-outline-variant/20 p-5">
                <p className="font-semibold text-on-surface text-[0.875rem] mb-1">
                  tempo_cookie_consent
                </p>
                <p className="text-[0.875rem] text-on-surface-variant leading-[1.7]">
                  Storage period: Until manually cleared (max. 365 days)
                </p>
                <p className="text-[0.875rem] text-on-surface-variant leading-[1.7]">
                  Purpose: Records your consent choice so the notice is not shown on
                  every visit. Stores only the consent level ("essential" or "all") and
                  the date of consent. Never transmitted to any server.
                </p>
              </div>
            </div>

            {/* Third-party services */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Third-Party Services — Website
              </p>

              <div className="space-y-6">
                <div>
                  <p className="font-semibold text-on-surface text-[0.875rem] mb-2">
                    Google LLC — Google Fonts CDN
                  </p>
                  <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                    This website loads the Inter typeface and Material Symbols icon font via
                    Google's Content Delivery Network (fonts.googleapis.com,
                    fonts.gstatic.com). Your IP address, browser type, and time of request
                    may be transmitted to Google LLC (USA). The transfer is covered by the
                    EU–US Data Privacy Framework (adequacy decision of 10 July 2023).
                  </p>
                  <p className="text-[0.8125rem] text-on-surface-variant mt-2">
                    See:{' '}
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary"
                    >
                      Google Privacy Policy
                    </a>
                    .{' '}
                    Legal basis: Art. 6(1)(a) GDPR — your consent via the cookie banner.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-on-surface text-[0.875rem] mb-2">
                    GitHub Inc. — External Links
                  </p>
                  <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                    This page contains links to GitHub (github.com) for source code and
                    releases. These are standard hyperlinks; no data is transmitted to
                    GitHub until you click them. When you follow a link, GitHub's own
                    privacy policy applies.
                  </p>
                </div>
              </div>
            </div>

            {/* Desktop app note */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Desktop Application (TEMPO Software)
              </p>
              <div className="bg-black text-[#E2E2E2] p-8">
                <p className="text-[0.875rem] leading-[1.8]">
                  The TEMPO desktop application is <strong>local-first and offline-capable</strong>.
                  It does not collect, transmit, or store personal data on external servers.
                  All model data, configurations, and results remain on your machine or your
                  institution's infrastructure. Network requests made by the application
                  (OpenStreetMap tiles, Nominatim geocoding, Overpass API, Geofabrik
                  downloads) are optional, user-triggered, and documented in the in-app
                  privacy notice accessible via the Help menu.
                </p>
              </div>
            </div>

            {/* Legal basis summary */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Purposes and Legal Basis (Art. 6 GDPR)
              </p>
              <div className="text-[0.875rem] leading-[1.8] text-on-surface-variant space-y-3">
                <p>
                  We provide information about TEMPO research activities in accordance with
                  Article 2, paragraph 6 BayHSchG, and Article 4, paragraph 1,
                  sentences 1 and 2 BayEGovG.
                </p>
                <p>
                  Server access logs are processed to maintain our web service and ensure
                  network security under Art. 6(1)(e) GDPR; Art. 6(1) BayDSG; § 13(7) TMG.
                </p>
                <p>
                  Loading Google Fonts is activated only upon your freely given consent
                  (Art. 6(1)(a) GDPR) via the notice banner. You may choose "Essential only"
                  to prevent this request. Selecting "Essential only" does not affect website
                  functionality; a system font will be used as fallback.
                </p>
              </div>
            </div>

            {/* Rights */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Your Rights Under GDPR
              </p>
              <ul className="space-y-3 mb-4">
                {[
                  'Right to obtain information about data stored about you (Art. 15 GDPR)',
                  'Right to rectification of inaccurate personal data (Art. 16 GDPR)',
                  'Right to erasure or restriction of processing (Art. 17, 18 GDPR)',
                  'Right to object to processing (Art. 21 GDPR)',
                  'Right to data portability where applicable (Art. 20 GDPR)',
                  'Right to withdraw consent at any time without affecting prior processing (Art. 7(3) GDPR)',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-[1rem] mt-0.5 flex-shrink-0">
                      chevron_right
                    </span>
                    <span className="text-[0.875rem] leading-[1.7] text-on-surface-variant">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                Contact the Data Protection Officer at{' '}
                <a href="mailto:datenschutz@th-deg.de" className="underline hover:text-primary">
                  datenschutz@th-deg.de
                </a>{' '}
                for any data protection queries. You also have the right to lodge a complaint
                with the Bavarian State Data Protection Officer (BayLDA), Promenade 18,
                91522 Ansbach.
              </p>
            </div>

          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
