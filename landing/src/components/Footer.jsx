import { Link } from 'react-router-dom'
import logo from '../public/img/Logo_TEMPO.PNG'
import logoTHD from '../public/img/THD.svg'

const GITHUB = 'https://github.com/THD-Spatial-AI/TEMPO'
const GITHUB_RELEASES = 'https://github.com/TH-Deggendorf/TEMPO/releases'

const sections = [
  {
    label: 'Project',
    links: [
      { label: 'GitHub', href: GITHUB, external: true },
      { label: 'Releases', href: GITHUB_RELEASES, external: true },
    ],
  },
  {
    label: 'Resources',
    links: [
      { label: 'Docs', to: '/docs' },
      { label: 'API Ref', to: '/docs/api' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'License', to: '/license' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Code of Conduct', to: '/code-of-conduct' },
    ],
  },
]

export default function Footer({ dark = false }) {
  const bg = dark ? 'bg-black text-[#E2E2E2]' : 'bg-white border-t border-neutral-100 text-primary'
  const brand = dark ? 'text-white' : 'text-black'
  const sub = dark ? 'text-[#C6C6C6]' : 'text-neutral-400'
  const heading = dark ? 'text-white' : 'text-black'
  const linkClass = dark
    ? 'text-[#C6C6C6] hover:text-white'
    : 'text-neutral-400 hover:text-black'

  return (
    <footer className={`w-full py-16 px-8 ${bg}`}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
        {/* Brand */}
        <div className="flex flex-col gap-4 max-w-xs">
          <Link to="/" aria-label="TEMPO Home">
            <img
              src={logo}
              alt="TEMPO logo"
              className={`h-10 w-auto object-contain ${dark ? 'logo-on-dark' : 'logo-on-light'}`}
            />
          </Link>
          <p className={`text-[11px] font-medium tracking-wide uppercase leading-relaxed ${sub}`}>
            Academic energy planning software developed by TH Deggendorf.
            Open source under the MIT License.
          </p>
        </div>

        {/* THD institution block */}
        <div className="flex flex-col gap-4 max-w-xs">
          <div className="relative flex-shrink-0" style={{ width: '10rem', height: '2rem' }}>
            <img
              src={logoTHD}
              alt="Technische Hochschule Deggendorf"
              className={`absolute left-0 w-auto object-contain ${dark ? 'brightness-0 invert' : ''}`}
              style={{ height: '10rem', top: '50%', transform: 'translateY(-50%)' }}
            />
          </div>
          <p className={`text-[11px] font-medium tracking-wide uppercase leading-relaxed ${sub}`}>
            Technische Hochschule Deggendorf
          </p>
          <p className={`text-[11px] leading-relaxed ${sub}`}>
            University of Applied Sciences — Deggendorf, Bavaria.<br />
            BigGeoData & Spatial AI Research Group.
          </p>
          <a
            href="https://www.th-deg.de"
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[10px] font-bold uppercase tracking-widest transition-all ${linkClass}`}
          >
            www.th-deg.de →
          </a>
        </div>

        {/* Nav columns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-16 gap-y-4">
          {sections.map((section) => (
            <div key={section.label} className="flex flex-col gap-3">
              <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${heading}`}>
                {section.label}
              </span>
              {section.links.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-[11px] uppercase tracking-wide transition-all ${linkClass}`}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    to={link.to}
                    className={`text-[11px] uppercase tracking-wide transition-all ${linkClass}`}
                  >
                    {link.label}
                  </Link>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={`max-w-7xl mx-auto mt-12 pt-8 border-t ${dark ? 'border-white/10' : 'border-neutral-100'} flex flex-col sm:flex-row justify-between items-center gap-4`}>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${sub}`}>
          © 2026 Technische Hochschule Deggendorf — BigGeoData &amp; Spatial AI Research Group. All Rights Reserved.
        </span>
        <div className="flex flex-wrap gap-4 items-center">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${sub}`}>
            MIT License
          </span>
          <span className={`text-[10px] ${sub}`}>
            Map data ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${linkClass}`}
            >
              OpenStreetMap contributors
            </a>
            {' '}— ODbL
          </span>
        </div>
      </div>
    </footer>
  )
}
