import Footer from '../components/Footer'

export default function Impressum() {
  return (
    <div className="bg-surface text-primary">
      <main className="pt-16">

        <section className="px-8 py-24 bg-surface-container-lowest border-b border-outline-variant/20">
          <div className="max-w-4xl mx-auto">
            <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-4">
              Legal
            </p>
            <h1 className="text-[3.5rem] md:text-[4.5rem] font-black tracking-[-0.03em] leading-none mb-6">
              LEGAL NOTICE
            </h1>
            <p className="text-on-surface-variant text-[0.875rem] uppercase tracking-widest font-bold">
              Imprint — TH Deggendorf / THD-Spatial AI
            </p>
          </div>
        </section>

        <section className="px-8 py-24 bg-surface">
          <div className="max-w-4xl mx-auto space-y-16">

            {/* Institution */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Institution
              </p>
              <div className="space-y-3 text-[0.875rem] leading-[1.8] text-on-surface-variant">
                <p className="font-semibold text-on-surface">Technische Hochschule Deggendorf (TH Deggendorf)</p>
                <p>
                  Dieter-Görlitz-Platz 1<br />
                  94469 Deggendorf<br />
                  Germany
                </p>
                <p>
                  Phone: <a href="tel:+4999136150" className="underline hover:text-primary">+49 (0)991 3615-0</a><br />
                  Fax: +49 (0)991 3615-297<br />
                  Email: <a href="mailto:info@th-deg.de" className="underline hover:text-primary">info@th-deg.de</a><br />
                  Web: <a href="https://www.th-deg.de" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">www.th-deg.de</a>
                </p>
              </div>
            </div>

            {/* Legal status */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Legal Status &amp; Representation
              </p>
              <div className="text-[0.875rem] leading-[1.8] text-on-surface-variant space-y-3">
                <p>
                  TH Deggendorf is a state institution and legal personality under public law
                  (Section 4 Para. 1 Line 1 of the Bavarian Higher Education Innovation Act, BayHIG).
                </p>
                <p>
                  Represented by the President: <strong className="text-on-surface">Prof. Waldemar Berg</strong>
                </p>
                <p>
                  Supervisory authority: Bayerisches Staatsministerium für Wissenschaft und Kunst,
                  Salvatorstraße 2, 80333 München, Germany.
                </p>
                <p>
                  VAT identification number (§ 27a UStG): <strong className="text-on-surface">DE 228493551</strong>
                </p>
              </div>
            </div>

            {/* Project contact */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Published By / Project Contact
              </p>
              <div className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                <p>
                  Ricardo Ignacio Miranda · Research Associate<br />
                  BigGeoData &amp; Spatial AI Research Group<br />
                  Faculty of Applied Computer Science<br />
                  TH Deggendorf<br />
                  Email: <a href="mailto:ricardo.miranda@th-deg.de" className="underline hover:text-primary">ricardo.miranda@th-deg.de</a>
                </p>
              </div>
            </div>

            {/* DPO */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Data Protection Officer
              </p>
              <div className="text-[0.875rem] leading-[1.8] text-on-surface-variant">
                <p>
                  Prof. Dr. Sascha Kreiskott<br />
                  Technische Hochschule Deggendorf<br />
                  Dieter-Görlitz-Platz 1, 94469 Deggendorf<br />
                  Email: <a href="mailto:datenschutz@th-deg.de" className="underline hover:text-primary">datenschutz@th-deg.de</a>
                </p>
              </div>
            </div>

            {/* Copyright */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Copyright &amp; Conditions of Use
              </p>
              <div className="text-[0.875rem] leading-[1.8] text-on-surface-variant space-y-3">
                <p>
                  The TEMPO software and this website are published under the{' '}
                  <strong className="text-on-surface">MIT License</strong>.
                  You are free to use, copy, modify, merge, publish, distribute, sublicense,
                  and/or sell copies of the software subject to the conditions of that licence.
                </p>
                <p>
                  Website content (text, graphics, logos) is protected by copyright
                  (§ 5 UrhG) and may not be reproduced without written permission except
                  where the MIT License explicitly permits it.
                </p>
              </div>
            </div>

            {/* Exclusion of liability */}
            <div>
              <p className="font-bold text-[0.6875rem] uppercase tracking-[0.2em] text-outline mb-6">
                Exclusion of Liability
              </p>
              <div className="text-[0.875rem] leading-[1.8] text-on-surface-variant space-y-3">
                <p>
                  Despite careful content control, we assume no liability for the content of
                  external links. The operators of linked pages are solely responsible for
                  their content.
                </p>
                <p>
                  Information on this website is provided for general information purposes only.
                  TH Deggendorf accepts no liability for the accuracy, completeness, or
                  timeliness of the information presented (§ 839 BGB; Art. 34 GG).
                </p>
              </div>
            </div>

          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
